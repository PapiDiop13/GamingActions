/**
 * migrate_to_mux.js — Migration Cloudinary → Mux (v2, avec retry)
 * Idempotent : skip les vidéos déjà migrées, relançable.
 * Usage: node migrate_to_mux.js [--dry-run] [--limit=50]
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const MUX_TOKEN_ID     = "de3558c1-e46f-4cc7-81da-5683fecf09cf";
const MUX_TOKEN_SECRET = "oDSQSeS/iShNpWXskkSdx7pMokiJFB2I0r/+ImtwY015DVqbs5Jo/r+UFX8zpWdgsgKDXxljjuZ";

const DRY_RUN  = process.argv.includes('--dry-run');
const LIMIT    = (() => { const a = process.argv.find(a => a.startsWith('--limit=')); return a ? parseInt(a.split('=')[1]) : Infinity; })();
const MUX_AUTH = Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString('base64');
const PAUSE_MS = 2000;   // 2s entre chaque vidéo
const MAX_RETRY = 3;     // 3 tentatives par vidéo
const RETRY_DELAY = 5000; // 5s entre les retries

admin.initializeApp({ credential: admin.credential.cert(require('./service-account.json')) });
const db = admin.firestore();
const log = fs.createWriteStream(path.join(__dirname, 'migration_log.txt'), { flags: 'a' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function createMuxUpload() {
  const res = await fetch('https://api.mux.com/video/v1/uploads', {
    method: 'POST',
    headers: { Authorization: `Basic ${MUX_AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cors_origin: '*',
      new_asset_settings: { playback_policy: ['public'], mp4_support: 'capped-1080p' },
      timeout: 3600,
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`Mux create upload: ${JSON.stringify(d)}`);
  return { uploadUrl: d.data.url, uploadId: d.data.id };
}

async function uploadToMux(uploadUrl, videoBuffer) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': videoBuffer.length },
    body: videoBuffer,
  });
  if (!res.ok) throw new Error(`Mux PUT failed: ${res.status} ${res.statusText}`);
}

async function waitForAsset(uploadId, maxMs = 300000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(5000);
    const uRes = await fetch(`https://api.mux.com/video/v1/uploads/${uploadId}`, {
      headers: { Authorization: `Basic ${MUX_AUTH}` },
    });
    const uData = await uRes.json();
    const assetId = uData.data?.asset_id;
    if (!assetId) continue;

    const aRes = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      headers: { Authorization: `Basic ${MUX_AUTH}` },
    });
    const aData = await aRes.json();
    const asset = aData.data;
    if (asset?.status === 'ready') {
      return { assetId: asset.id, playbackId: asset.playback_ids?.[0]?.id, duration: asset.duration };
    }
    if (asset?.status === 'errored') {
      throw new Error(`Mux asset errored: ${JSON.stringify(asset.errors)}`);
    }
  }
  throw new Error(`Timeout waiting for Mux asset (uploadId: ${uploadId})`);
}

async function downloadFromCloudinary(videoUrl) {
  // Retire q_auto pour télécharger l'original
  const cleanUrl = videoUrl
    .replace('/upload/q_auto,f_auto/', '/upload/')
    .replace('/upload/q_auto/', '/upload/')
    .replace('/upload/f_auto/', '/upload/');

  const res = await fetch(cleanUrl, {
    headers: { 'User-Agent': 'GamingActions-Migration/1.0' },
    timeout: 120000, // 2 min timeout
  });
  if (!res.ok) throw new Error(`Cloudinary download failed: ${res.status} ${res.statusText} — ${cleanUrl}`);
  const buffer = await res.buffer();
  if (!buffer || buffer.length < 1000) throw new Error(`Downloaded file too small (${buffer.length} bytes) — probably not a video`);
  return buffer;
}

async function migrateOne(doc) {
  const v = doc.data();
  const { uploadUrl, uploadId } = await createMuxUpload();
  const buffer = await downloadFromCloudinary(v.videoUrl);
  await uploadToMux(uploadUrl, buffer);
  process.stdout.write('⏳ ');
  const { assetId, playbackId, duration } = await waitForAsset(uploadId);
  await doc.ref.update({
    muxUploadId: uploadId, muxAssetId: assetId, muxPlaybackId: playbackId,
    muxStatus: 'ready', duration: Math.round(duration || 0),
    thumbnail: `https://image.mux.com/${playbackId}/thumbnail.jpg?time=3&width=400&height=225&fit_mode=crop`,
    videoUrl: `https://stream.mux.com/${playbackId}.m3u8`,
  });
  return playbackId;
}

async function main() {
  console.log(`\n🚀 Migration Cloudinary → Mux ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);

  const snap = await db.collection('videos').get();
  const toMigrate = snap.docs
    .filter(d => !d.data().muxPlaybackId && d.data().videoUrl?.includes('cloudinary'))
    .slice(0, LIMIT);

  const already = snap.docs.filter(d => d.data().muxPlaybackId).length;
  console.log(`📹 ${snap.size} total · ${toMigrate.length} à migrer · ${already} déjà faites\n`);

  if (DRY_RUN) {
    toMigrate.slice(0, 5).forEach((d, i) =>
      console.log(`  ${i+1}. ${d.id} — ${d.data().title?.slice(0,40)} — ${d.data().videoUrl?.slice(0,60)}`));
    console.log(`\n✅ Dry run OK. Lance sans --dry-run pour migrer.`);
    process.exit(0);
  }

  let ok = 0, fail = 0;

  for (let i = 0; i < toMigrate.length; i++) {
    const doc = toMigrate[i];
    const v   = doc.data();
    process.stdout.write(`[${i+1}/${toMigrate.length}] ${(v.title || doc.id).slice(0,30).padEnd(32)} `);

    let lastErr = '';
    let migrated = false;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        const playbackId = await migrateOne(doc);
        console.log(`✅ ${playbackId}`);
        log.write(`OK|${doc.id}|${playbackId}\n`);
        ok++;
        migrated = true;
        break;
      } catch (e) {
        lastErr = e.message || String(e);
        if (attempt < MAX_RETRY) {
          process.stdout.write(`⚠️  retry ${attempt}/${MAX_RETRY}... `);
          await sleep(RETRY_DELAY * attempt);
        }
      }
    }

    if (!migrated) {
      console.log(`❌ ${lastErr.slice(0, 80)}`);
      log.write(`FAIL|${doc.id}|${lastErr}\n`);
      fail++;
    }

    await sleep(PAUSE_MS);
  }

  log.end();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ ${ok} migrées · ❌ ${fail} échecs`);
  if (fail > 0) console.log(`↩️  Relance pour réessayer les ${fail} échecs (idempotent).`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

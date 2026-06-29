#!/usr/bin/env node
/**
 * cleanDatabase.js — Gaming Actions DB maintenance script
 *
 * What it does:
 *  1. Migrates avatar_frame:* entries from ownedCosmetics → ownedFrames
 *  2. Deduplicates all owned arrays (ownedFrames, ownedVideoFrames, ownedCommentFrames, ownedCosmetics)
 *  3. Marks stale pending cosmetic_purchases (>24h) as "abandoned"
 *
 * Usage:
 *   node scripts/cleanDatabase.js
 *   node scripts/cleanDatabase.js --dry-run   (preview changes without writing)
 */

const admin = require('firebase-admin');
const path = require('path');

const SERVICE_ACCOUNT_PATH = '/Users/papaassanediop/Documents/Mes Projets/keys/service-account.json';
const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
});
const db = admin.firestore();

async function main() {
  console.log(`\n=== Gaming Actions DB Cleanup ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  let usersFixed = 0;
  let usersScanned = 0;
  let totalFramesMoved = 0;
  let purchasesAbandoned = 0;

  // ── Step 1 & 2: Migrate avatar_frame:* + deduplicate owned arrays ──────────
  console.log('Step 1/2: Scanning users for cosmetic migrations and duplicates...');
  const usersSnap = await db.collection('users').get();
  usersScanned = usersSnap.size;

  for (const uDoc of usersSnap.docs) {
    const data = uDoc.data();
    const ownedCosmetics   = data.ownedCosmetics   || [];
    const ownedFrames      = data.ownedFrames       || [];
    const ownedVideoFrames = data.ownedVideoFrames  || [];
    const ownedCommentFrames = data.ownedCommentFrames || [];

    // Find avatar_frame:* entries in ownedCosmetics
    const frameEntries    = ownedCosmetics.filter(c => c.startsWith('avatar_frame:'));
    const frameIds        = frameEntries.map(c => c.replace('avatar_frame:', ''));
    const remainingCosmetics = ownedCosmetics.filter(c => !c.startsWith('avatar_frame:'));

    const newOwnedFrames        = [...new Set([...ownedFrames, ...frameIds])];
    const newOwnedCosmetics     = [...new Set(remainingCosmetics)];
    const newOwnedVideoFrames   = [...new Set(ownedVideoFrames)];
    const newOwnedCommentFrames = [...new Set(ownedCommentFrames)];

    const cosmeticsChanged     = newOwnedCosmetics.length     !== ownedCosmetics.length;
    const framesChanged        = newOwnedFrames.length        !== ownedFrames.length;
    const videoFramesChanged   = newOwnedVideoFrames.length   !== ownedVideoFrames.length;
    const commentFramesChanged = newOwnedCommentFrames.length !== ownedCommentFrames.length;
    const changed = cosmeticsChanged || framesChanged || videoFramesChanged || commentFramesChanged;

    if (changed) {
      const username = data.username || uDoc.id;
      const changes = [];
      if (frameIds.length > 0) changes.push(`moved ${frameIds.length} avatar_frame(s) → ownedFrames: [${frameIds.join(', ')}]`);
      if (cosmeticsChanged && !frameIds.length) changes.push(`deduped ownedCosmetics: ${ownedCosmetics.length} → ${newOwnedCosmetics.length}`);
      if (framesChanged && !frameIds.length) changes.push(`deduped ownedFrames: ${ownedFrames.length} → ${newOwnedFrames.length}`);
      if (videoFramesChanged) changes.push(`deduped ownedVideoFrames: ${ownedVideoFrames.length} → ${newOwnedVideoFrames.length}`);
      if (commentFramesChanged) changes.push(`deduped ownedCommentFrames: ${ownedCommentFrames.length} → ${newOwnedCommentFrames.length}`);

      console.log(`  [USER] ${username}: ${changes.join(' | ')}`);
      totalFramesMoved += frameIds.length;
      usersFixed++;

      if (!DRY_RUN) {
        await uDoc.ref.update({
          ownedCosmetics:     newOwnedCosmetics,
          ownedFrames:        newOwnedFrames,
          ownedVideoFrames:   newOwnedVideoFrames,
          ownedCommentFrames: newOwnedCommentFrames,
          updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  console.log(`  Done. ${usersFixed} / ${usersScanned} users updated. ${totalFramesMoved} frames migrated.\n`);

  // ── Step 3: Mark stale pending cosmetic_purchases as abandoned ────────────
  console.log('Step 3: Scanning stale cosmetic_purchases (>24h pending)...');
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stalePurchasesSnap = await db.collection('cosmetic_purchases')
    .where('status', '==', 'pending')
    .where('createdAt', '<=', oneDayAgo)
    .get();

  if (stalePurchasesSnap.empty) {
    console.log('  No stale purchases found.\n');
  } else {
    const batch = db.batch();
    for (const doc of stalePurchasesSnap.docs) {
      const p = doc.data();
      console.log(`  [PURCHASE] ${doc.id} — uid=${p.uid} itemId=${p.itemId} sessionId=${p.sessionId} → abandoned`);
      purchasesAbandoned++;
      if (!DRY_RUN) {
        batch.update(doc.ref, {
          status: 'abandoned',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    if (!DRY_RUN) await batch.commit();
    console.log(`  Done. ${purchasesAbandoned} purchases marked as abandoned.\n`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('=== Summary ===');
  console.log(`  Users scanned:           ${usersScanned}`);
  console.log(`  Users fixed:             ${usersFixed}`);
  console.log(`  avatar_frame entries moved: ${totalFramesMoved}`);
  console.log(`  Stale purchases abandoned: ${purchasesAbandoned}`);
  if (DRY_RUN) console.log('\n  ** DRY RUN — no changes written to Firestore **');
  console.log('Done.\n');

  process.exit(0);
}

main().catch(err => {
  console.error('cleanDatabase error:', err);
  process.exit(1);
});

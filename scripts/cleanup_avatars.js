/**
 * cleanup_avatars.js — Nettoie les avatars cassés et migre les valides
 *
 * 1. Upload le logo GA comme avatar par défaut sur Firebase Storage
 * 2. Migre les 2 avatars doeqzltv0 vers Firebase Storage
 * 3. Remplace les 152 avatars galaxious-tech cassés par le logo par défaut
 * 4. Met le logo par défaut pour les users sans avatar
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({ credential: admin.credential.cert(require('./service-account.json')) });
const db      = admin.firestore();
const bucket  = admin.storage().bucket('gamingactions-app.firebasestorage.app');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function uploadDefaultLogo() {
  // Upload le logo GA comme avatar par défaut
  const logoPath = path.join(__dirname, '..', 'assets', 'icon.png');
  if (!fs.existsSync(logoPath)) {
    console.log('❌ assets/icon.png not found');
    process.exit(1);
  }
  const file = bucket.file('defaults/avatar_default.png');
  
  // Check if already uploaded
  const [exists] = await file.exists();
  if (exists) {
    await file.makePublic();
    console.log('✅ Default logo already uploaded');
    return `https://storage.googleapis.com/gamingactions-app.firebasestorage.app/defaults/avatar_default.png`;
  }

  await file.save(fs.readFileSync(logoPath), {
    metadata: { contentType: 'image/png' },
    resumable: false,
  });
  await file.makePublic();
  console.log('✅ Default logo uploaded to Firebase Storage');
  return `https://storage.googleapis.com/gamingactions-app.firebasestorage.app/defaults/avatar_default.png`;
}

async function uploadToFirebase(imageUrl, destPath) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Fetch ${res.status}`);
  const buffer = await res.buffer();
  const file = bucket.file(destPath);
  await file.save(buffer, { metadata: { contentType: 'image/jpeg' }, resumable: false });
  await file.makePublic();
  return `https://storage.googleapis.com/gamingactions-app.firebasestorage.app/${destPath}`;
}

async function main() {
  console.log(`\n🧹 Nettoyage avatars ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}\n`);

  // 1. Upload default logo
  const defaultUrl = await uploadDefaultLogo();
  console.log(`📌 Avatar par défaut: ${defaultUrl}\n`);

  // 2. Process all users
  const snap = await db.collection('users').get();
  let migrated = 0, cleaned = 0, defaulted = 0, skipped = 0, failed = 0;

  for (let i = 0; i < snap.docs.length; i++) {
    const userDoc = snap.docs[i];
    const v = userDoc.data();
    const avatar = v.avatar || '';
    const banner = v.banner || '';
    const username = (v.username || userDoc.id).slice(0, 20).padEnd(22);
    const updates = {};

    // Case A: Avatar on doeqzltv0 (new Cloudinary) → migrate to Firebase Storage
    if (avatar.includes('doeqzltv0')) {
      if (!DRY_RUN) {
        try {
          const newUrl = await uploadToFirebase(avatar, `avatars/${userDoc.id}_migrated.jpg`);
          updates.avatar = newUrl;
          migrated++;
          process.stdout.write(`[${i+1}/${snap.size}] ${username} 👤 migrated\n`);
        } catch (e) {
          updates.avatar = defaultUrl;
          failed++;
          process.stdout.write(`[${i+1}/${snap.size}] ${username} ❌ migrate fail → default\n`);
        }
      } else {
        migrated++;
      }
    }
    // Case B: Avatar on galaxious-tech (broken) → replace with default
    else if (avatar.includes('galaxious-tech')) {
      updates.avatar = defaultUrl;
      cleaned++;
      if (!DRY_RUN) process.stdout.write(`[${i+1}/${snap.size}] ${username} 🔄 broken → default\n`);
    }
    // Case C: No avatar → set default
    else if (avatar === '') {
      updates.avatar = defaultUrl;
      defaulted++;
    }
    // Case D: Already on Firebase Storage or other valid URL → skip
    else {
      skipped++;
    }

    // Same for banner (only clean broken ones, don't set default banners)
    if (banner.includes('galaxious-tech')) {
      updates.banner = '';  // Just clear broken banners
    }
    if (banner.includes('doeqzltv0')) {
      if (!DRY_RUN) {
        try {
          const newUrl = await uploadToFirebase(banner, `banners/${userDoc.id}_migrated.jpg`);
          updates.banner = newUrl;
        } catch (e) {
          updates.banner = '';
        }
      }
    }

    // Apply updates
    if (Object.keys(updates).length > 0 && !DRY_RUN) {
      await userDoc.ref.update(updates);

      // Also update avatar on all their videos
      if (updates.avatar) {
        const vidsSnap = await db.collection('videos').where('userId', '==', userDoc.id).get();
        for (const vDoc of vidsSnap.docs) {
          await vDoc.ref.update({ avatar: updates.avatar });
        }
      }
    }

    // Throttle a bit
    if (i % 50 === 0 && i > 0) await sleep(500);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ Migrated (doeqzltv0 → Firebase): ${migrated}`);
  console.log(`🔄 Cleaned (galaxious-tech → default): ${cleaned}`);
  console.log(`📌 Defaulted (no avatar → default): ${defaulted}`);
  console.log(`⏭  Skipped (already OK): ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\nAvatar par défaut: ${defaultUrl}`);
  if (DRY_RUN) console.log('\n👆 Dry run — relance sans --dry-run pour appliquer.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

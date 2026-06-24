/**
 * migrate_images_to_firebase.js
 * Migre les avatars + banners existants de Cloudinary vers Firebase Storage.
 *
 * SETUP :
 * - service-account.json doit être dans ce dossier
 * - npm install (déjà fait)
 *
 * Usage :
 *   node migrate_images_to_firebase.js --dry-run   ← simulation
 *   node migrate_images_to_firebase.js             ← migration réelle
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const path  = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({ credential: admin.credential.cert(require('./service-account.json')) });
const db      = admin.firestore();
const storage = admin.storage().bucket('gamingactions-app.firebasestorage.app');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function isCloudinaryUrl(url) {
  return url && typeof url === 'string' && url.includes('cloudinary.com');
}

async function uploadToFirebase(imageUrl, destPath) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${imageUrl.slice(0, 80)}`);
  const buffer = await res.buffer();
  const file = storage.file(destPath);
  await file.save(buffer, { metadata: { contentType: 'image/jpeg' }, resumable: false });
  await file.makePublic();
  return `https://storage.googleapis.com/gamingactions-app.firebasestorage.app/${destPath}`;
}

async function main() {
  console.log(`\n🖼  Migration images Cloudinary → Firebase Storage ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);

  const usersSnap = await db.collection('users').get();
  const toMigrate = usersSnap.docs.filter(d => {
    const v = d.data();
    return isCloudinaryUrl(v.avatar) || isCloudinaryUrl(v.banner);
  });

  console.log(`👥 ${usersSnap.size} users · ${toMigrate.length} avec images Cloudinary\n`);

  if (DRY_RUN) {
    toMigrate.slice(0, 5).forEach((d, i) => {
      const v = d.data();
      console.log(`  ${i+1}. ${v.username} — avatar:${!!v.avatar} banner:${!!v.banner}`);
    });
    console.log(`\n✅ Dry run OK. Lance sans --dry-run pour migrer.`);
    return;
  }

  let ok = 0, fail = 0;

  for (let i = 0; i < toMigrate.length; i++) {
    const userDoc = toMigrate[i];
    const v = userDoc.data();
    process.stdout.write(`[${i+1}/${toMigrate.length}] ${(v.username || userDoc.id).slice(0,20).padEnd(22)} `);

    const updates = {};
    let errMsg = '';

    try {
      // Migrer avatar
      if (isCloudinaryUrl(v.avatar)) {
        const newUrl = await uploadToFirebase(v.avatar, `avatars/${userDoc.id}_${Date.now()}.jpg`);
        updates.avatar = newUrl;
        process.stdout.write('👤 ');
      }

      // Migrer banner
      if (isCloudinaryUrl(v.banner)) {
        const newUrl = await uploadToFirebase(v.banner, `banners/${userDoc.id}_${Date.now()}.jpg`);
        updates.banner = newUrl;
        process.stdout.write('🖼 ');
      }

      if (Object.keys(updates).length > 0) {
        // Mettre à jour le profil user
        await userDoc.ref.update(updates);

        // Mettre à jour l'avatar sur toutes les vidéos du user (si avatar changé)
        if (updates.avatar) {
          const vidsSnap = await db.collection('videos').where('userId', '==', userDoc.id).get();
          for (const vDoc of vidsSnap.docs) {
            await vDoc.ref.update({ avatar: updates.avatar });
          }
        }
        ok++;
        console.log(`✅`);
      } else {
        console.log(`⏭ déjà migré`);
      }
    } catch (e) {
      errMsg = e.message?.slice(0, 80);
      fail++;
      console.log(`❌ ${errMsg}`);
    }

    await sleep(300);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ ${ok} migrés · ❌ ${fail} échecs`);
  if (fail > 0) console.log('↩️  Relance pour réessayer les échecs.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

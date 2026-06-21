/**
 * patch_random_order.js — One-shot script to assign randomOrder to all videos that don't have it.
 *
 * Targets: migrated videos from the old FlutterFlow database that were imported
 * without a randomOrder field. Without this field, Firestore excludes them from
 * the feed query (orderBy('randomOrder') skips docs where the field doesn't exist).
 *
 * Usage:
 *   node patch_random_order.js
 *
 * Requirements:
 *   - Firebase Admin SDK: npm install firebase-admin
 *   - Service account key at ./google-services-key.json
 *
 * Run once, then delete this file.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./google-services-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'gamingactions-app',
});

const db = admin.firestore();

async function patchRandomOrder() {
  console.log('🔍 Fetching all videos...');
  const snap = await db.collection('videos').get();

  const missing = snap.docs.filter(d => d.data().randomOrder === undefined);
  console.log(`📊 Total videos: ${snap.size}`);
  console.log(`⚠️  Missing randomOrder: ${missing.length}`);

  if (missing.length === 0) {
    console.log('✅ All videos already have randomOrder — nothing to do.');
    process.exit(0);
  }

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let count = 0;
  let batches = 0;

  for (const doc of missing) {
    const newOrder = Date.now() + Math.floor(Math.random() * 100000);
    batch.update(doc.ref, { randomOrder: newOrder });
    count++;

    if (count % BATCH_SIZE === 0) {
      await batch.commit();
      batches++;
      console.log(`  ✓ Batch ${batches} committed (${count} videos patched so far)`);
      batch = db.batch();
    }
  }

  if (count % BATCH_SIZE !== 0) {
    await batch.commit();
    batches++;
  }

  console.log(`\n✅ Done — ${count} videos patched in ${batches} batch(es).`);
  console.log('   The feed will now include all previously-missing videos.');
  console.log('   You can delete this script.');
  process.exit(0);
}

patchRandomOrder().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});

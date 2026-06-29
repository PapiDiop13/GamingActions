/**
 * fix_leader.js — Corrects isCurrentLeader in Firestore
 *
 * 1. Removes isCurrentLeader from ALL users
 * 2. Finds the real #1 (most GG, excluding gameconic/creator)
 * 3. Sets isCurrentLeader: true on them
 *
 * Run: node scripts/fix_leader.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const EXCLUDED_ACCOUNT_TYPES = ['creator', 'gameconic'];

async function fixLeader() {
  console.log('🔄 Step 1: Removing isCurrentLeader from ALL users...');

  // Remove from anyone who has it
  const flaggedSnap = await db.collection('users')
    .where('isCurrentLeader', '==', true)
    .get();

  const batch1 = db.batch();
  flaggedSnap.docs.forEach(d => {
    console.log(`  ❌ Removing leader from: ${d.data().username} (${d.id})`);
    batch1.update(d.ref, { isCurrentLeader: false });
  });
  if (!flaggedSnap.empty) await batch1.commit();
  console.log(`  Cleared ${flaggedSnap.size} user(s)`);

  console.log('\n🔄 Step 2: Finding real #1 (by GG count, excluding creator/gameconic)...');

  // Aggregate GG by userId from videos
  const videosSnap = await db.collection('videos').get();
  const userGGs = {};
  videosSnap.docs.forEach(d => {
    const v = d.data();
    if (!v.userId || !v.ggCount) return;
    userGGs[v.userId] = (userGGs[v.userId] || 0) + v.ggCount;
  });

  // Sort descending
  const sorted = Object.entries(userGGs)
    .map(([uid, ggCount]) => ({ uid, ggCount }))
    .sort((a, b) => b.ggCount - a.ggCount);

  // Find #1 excluding gameconic/creator
  let trueLeader = null;
  for (const entry of sorted) {
    const userSnap = await db.collection('users').doc(entry.uid).get();
    if (!userSnap.exists) continue;
    const accountType = userSnap.data().accountType;
    if (!EXCLUDED_ACCOUNT_TYPES.includes(accountType)) {
      trueLeader = { uid: entry.uid, ...userSnap.data(), ggCount: entry.ggCount };
      break;
    } else {
      console.log(`  ⏭️  Skipping ${userSnap.data().username} (${accountType})`);
    }
  }

  if (!trueLeader) {
    console.log('⚠️  No eligible leader found.');
    process.exit(0);
  }

  console.log(`\n👑 True leader: ${trueLeader.username} (${trueLeader.uid}) — ${trueLeader.ggCount} GG`);

  await db.collection('users').doc(trueLeader.uid).update({ isCurrentLeader: true });
  console.log(`✅ isCurrentLeader: true set on ${trueLeader.username}`);

  process.exit(0);
}

fixLeader().catch(e => { console.error(e); process.exit(1); });

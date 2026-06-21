/**
 * Gaming Actions — Script d'injection/suppression de données mock
 * 
 * Injection:  node inject_mock_data.js
 * Suppression: node inject_mock_data.js --delete
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, addDoc, getDocs, query, where, deleteDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyDHYlFVDkF85KknGDiqatsCSOzW2bkMyDU",
  authDomain: "gamingactions-app.firebaseapp.com",
  projectId: "gamingactions-app",
  storageBucket: "gamingactions-app.firebasestorage.app",
  messagingSenderId: "878199468974",
  appId: "1:878199468974:web:ba90762a320f3e2eda0e3f",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ── Connexion admin (toi) pour avoir les permissions ──────────────────────────
// Remplace par ton email/password Gaming Actions
const ADMIN_EMAIL = 'pdiop08@outlook.fr';
const ADMIN_PASSWORD = 'password';

// ── Mock users ────────────────────────────────────────────────────────────────
const MOCK_USERS = [
  { email: 'nightmare.mock@gamingactions.com', password: 'MockPass123!', username: 'THE_NIGHTMARE', game: 'Valorant', country: 'France', countryFlag: '🇫🇷', bio: 'Clutch or kick. Always clutch. 🎯', plan: 'legendary', accountType: 'creator', equippedFrame: 'goat_red', ownedFrames: ['none','goat_red','gold_elite'], ownedVideoFrames: ['none','vf_fire'], gaPoints: 18400, streakPoints: 12000, streakLevel: 'goat', ggReceived: 967, followers: 8200, following: 124, isChampion: false, isCurrentLeader: false, fanbaseSubscribers: 312, clips: 89 },
  { email: 'xknight.mock@gamingactions.com', password: 'MockPass123!', username: 'XKNIGHT99', game: 'Call of Duty', country: 'USA', countryFlag: '🇺🇸', bio: '360 no-scope merchant. 🎮', plan: 'free', accountType: 'user', equippedFrame: 'neon_blue', ownedFrames: ['none','neon_blue'], ownedVideoFrames: ['none'], gaPoints: 9200, streakPoints: 7800, streakLevel: 'gold', ggReceived: 854, followers: 5100, following: 89, isChampion: false, isCurrentLeader: false, clips: 67 },
  { email: 'gglegend.mock@gamingactions.com', password: 'MockPass123!', username: 'GG_LEGEND', game: 'Fortnite', country: 'UK', countryFlag: '🇬🇧', bio: 'Build battle king. Tips every day 💡', plan: 'free', accountType: 'creator', equippedFrame: 'purple_haze', ownedFrames: ['none','purple_haze'], ownedVideoFrames: ['none','vf_matrix'], gaPoints: 7600, streakPoints: 5200, streakLevel: 'gold', ggReceived: 712, followers: 4300, following: 203, isChampion: false, isCurrentLeader: false, fanbaseSubscribers: 156, clips: 112 },
  { email: 'frostbyte.mock@gamingactions.com', password: 'MockPass123!', username: 'FROSTBYTE_X', game: 'Apex Legends', country: 'Canada', countryFlag: '🇨🇦', bio: 'Last man standing, always. 🏆', plan: 'free', accountType: 'user', equippedFrame: 'neon_blue', ownedFrames: ['none','neon_blue'], ownedVideoFrames: ['none'], gaPoints: 5800, streakPoints: 3400, streakLevel: 'silver', ggReceived: 689, followers: 3200, following: 67, isChampion: false, isCurrentLeader: false, clips: 45 },
  { email: 'sniper.mock@gamingactions.com', password: 'MockPass123!', username: 'SNIPER_ELITE', game: 'Warzone', country: 'Germany', countryFlag: '🇩🇪', bio: 'Long range eliminations only. 🔭', plan: 'free', accountType: 'user', equippedFrame: 'gold_elite', ownedFrames: ['none','gold_elite'], ownedVideoFrames: ['none'], gaPoints: 6200, streakPoints: 4100, streakLevel: 'gold', ggReceived: 623, followers: 2900, following: 45, isChampion: false, isCurrentLeader: false, clips: 38 },
  { email: 'viper.mock@gamingactions.com', password: 'MockPass123!', username: 'VIPER_GG', game: 'CS2', country: 'Brazil', countryFlag: '🇧🇷', bio: 'GG ez no re 💪', plan: 'free', accountType: 'user', equippedFrame: 'emerald', ownedFrames: ['none','emerald'], ownedVideoFrames: ['none'], gaPoints: 4200, streakPoints: 2800, streakLevel: 'silver', ggReceived: 587, followers: 2100, following: 112, isChampion: false, isCurrentLeader: false, clips: 29 },
  { email: 'kaizer.mock@gamingactions.com', password: 'MockPass123!', username: 'KAIZER_OP', game: 'League of Legends', country: 'Korea', countryFlag: '🇰🇷', bio: 'Diamond ADC. Coming for the crown 👑', plan: 'free', accountType: 'user', equippedFrame: 'none', ownedFrames: ['none'], ownedVideoFrames: ['none'], gaPoints: 3100, streakPoints: 1900, streakLevel: 'bronze', ggReceived: 541, followers: 1800, following: 78, isChampion: false, isCurrentLeader: false, clips: 22 },
  { email: 'blaze.mock@gamingactions.com', password: 'MockPass123!', username: 'BLAZE_KING', game: 'Rocket League', country: 'Spain', countryFlag: '🇪🇸', bio: 'Aerial goals only 🚀', plan: 'free', accountType: 'user', equippedFrame: 'none', ownedFrames: ['none'], ownedVideoFrames: ['none'], gaPoints: 2400, streakPoints: 1200, streakLevel: 'bronze', ggReceived: 498, followers: 1500, following: 56, isChampion: false, isCurrentLeader: false, clips: 18 },
  { email: 'nova.mock@gamingactions.com', password: 'MockPass123!', username: 'NOVA_STRIKE', game: 'Overwatch 2', country: 'Japan', countryFlag: '🇯🇵', bio: 'Support main. Keeping the team alive 🛡️', plan: 'free', accountType: 'user', equippedFrame: 'none', ownedFrames: ['none'], ownedVideoFrames: ['none'], gaPoints: 1800, streakPoints: 800, streakLevel: 'bronze', ggReceived: 456, followers: 1200, following: 34, isChampion: false, isCurrentLeader: false, clips: 14 },
];

const THUMBNAILS = [
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400',
  'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=400',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400',
  'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=400',
  'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=400',
];

function getMockVideos(userId, username) {
  const now = Date.now();
  const clips = [
    { caption: 'Insane clutch 1v5 😱🔥', game: 'Valorant', genre: 'FPS', console: 'PC', ggCount: 612, viewCount: 12400, commentsCount: 88 },
    { caption: 'ACE round on Ascent 🎯', game: 'Valorant', genre: 'FPS', console: 'PC', ggCount: 534, viewCount: 9800, commentsCount: 67 },
    { caption: 'Build battle masterclass 🛠️', game: 'Fortnite', genre: 'Battle Royale', console: 'PS5', ggCount: 421, viewCount: 7600, commentsCount: 54 },
  ];
  return clips.map((clip, i) => ({
    userId, username, avatar: '',
    ...clip,
    contentType: 'clip', videoFrame: 'none', isLegendaryFrame: false, isFanbaseExclusive: false,
    videoUrl: 'https://res.cloudinary.com/doeqzltv0/video/upload/v1/mock_placeholder.mp4',
    thumbnail: THUMBNAILS[i % THUMBNAILS.length],
    publicId: `mock_${userId}_${i}`,
    duration: 15 + (i * 7),
    createdAt: Timestamp.fromMillis(now - (i * 3600000) - (Math.random() * 86400000)),
    isMockData: true,
  }));
}

async function deleteMockData() {
  console.log('\n🔐 Connexion admin...');
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('✅ Connecté\n');
  console.log('🗑️  Suppression des données mock...\n');

  const usersSnap = await getDocs(query(collection(db, 'users'), where('isMockData', '==', true)));
  for (const d of usersSnap.docs) {
    await deleteDoc(d.ref);
    console.log(`  ✓ User supprimé: ${d.data().username}`);
  }

  const videosSnap = await getDocs(query(collection(db, 'videos'), where('isMockData', '==', true)));
  for (const d of videosSnap.docs) await deleteDoc(d.ref);
  console.log(`  ✓ ${videosSnap.size} vidéos supprimées`);

  const uSnap = await getDocs(query(collection(db, 'username'), where('isMockData', '==', true)));
  for (const d of uSnap.docs) await deleteDoc(d.ref);
  console.log(`  ✓ ${uSnap.size} usernames supprimés`);

  console.log('\n✅ Suppression terminée !');
  console.log('ℹ️  Supprime les comptes Auth manuellement dans Firebase Console → Authentication si nécessaire.\n');
  process.exit(0);
}

async function injectMockData() {
  console.log('\n🚀 Gaming Actions — Injection de données mock\n');

  for (const mockUser of MOCK_USERS) {
    process.stdout.write(`  → ${mockUser.username}... `);
    try {
      let uid;
      try {
        const cred = await createUserWithEmailAndPassword(auth, mockUser.email, mockUser.password);
        uid = cred.user.uid;
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
          const cred2 = await signInWithEmailAndPassword(auth, mockUser.email, mockUser.password);
          uid = cred2.user.uid;
          process.stdout.write('(existant) ');
        } else throw e;
      }

      const { email, password, ...profile } = mockUser;
      await setDoc(doc(db, 'users', uid), { ...profile, uid, email, avatar: '', banner: '', acceptedGuidelines: true, emailVerified: true, createdAt: serverTimestamp(), isMockData: true });
      await setDoc(doc(db, 'username', mockUser.username.toLowerCase()), { uid, username: mockUser.username, isMockData: true });

      const videos = getMockVideos(uid, mockUser.username);
      for (const video of videos) await addDoc(collection(db, 'videos'), video);

      console.log(`✅ (${videos.length} clips)`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
  }

  console.log(`\n✅ Injection terminée !`);
  console.log('📱 Lance ton app — le feed et les rankings seront remplis.\n');
  console.log('🗑️  Pour supprimer après tes captures :');
  console.log('   node inject_mock_data.js --delete\n');
  process.exit(0);
}

const isDelete = process.argv.includes('--delete');
if (isDelete) {
  deleteMockData().catch(console.error);
} else {
  injectMockData().catch(console.error);
}
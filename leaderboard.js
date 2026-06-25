import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDHYlFVDkF85KknGDiqatsCSOzW2bkMyDU",
  authDomain: "gamingactions-app.firebaseapp.com",
  projectId: "gamingactions-app",
  storageBucket: "gamingactions-app.firebasestorage.app",
  messagingSenderId: "878199468974",
  appId: "1:878199468974:web:ba90762a320f3e2eda0e3f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DEFAULT_AVATAR = 'https://storage.googleapis.com/gamingactions-app.firebasestorage.app/defaults/avatar_default.png';

function rankClass(i) {
  if (i === 0) return 'gold';
  if (i === 1) return 'silver';
  if (i === 2) return 'bronze';
  return '';
}

function rankEmoji(i) {
  if (i === 0) return '👑';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return String(i + 1);
}

function playerItem(d, i) {
  const u = d.data();
  const avatar = u.avatar || DEFAULT_AVATAR;
  const name = u.username || 'Unknown';
  const gg = u.ggReceived || 0;
  const crown = i === 0 ? ' 👑' : '';
  const li = document.createElement('li');
  li.className = 'lb-item';
  li.innerHTML =
    '<span class="lb-rank ' + rankClass(i) + '">' + rankEmoji(i) + '</span>' +
    '<img class="lb-avatar" src="' + avatar + '" loading="lazy" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
    '<div class="lb-info">' +
      '<div class="lb-name">' + name + crown + '</div>' +
      '<div class="lb-meta">Rank #' + (i + 1) + '</div>' +
    '</div>' +
    '<div class="lb-gg">' + gg + ' GG</div>';
  return li;
}

function clipItem(d, i) {
  const v = d.data();
  const thumb = v.thumbnail || v.thumbnailUrl || DEFAULT_AVATAR;
  const title = v.title || v.caption || 'Untitled';
  const username = v.username || 'Unknown';
  const gg = v.ggCount || 0;
  const game = v.game ? ' · ' + v.game : '';
  const li = document.createElement('li');
  li.className = 'lb-item';
  li.innerHTML =
    '<span class="lb-rank ' + rankClass(i) + '">' + rankEmoji(i) + '</span>' +
    '<img class="lb-avatar" src="' + thumb + '" loading="lazy" style="border-radius:8px" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
    '<div class="lb-info">' +
      '<div class="lb-name">' + title + '</div>' +
      '<div class="lb-meta">' + username + game + '</div>' +
    '</div>' +
    '<div class="lb-gg">' + gg + ' GG</div>';
  return li;
}

// Top Players
const playersQ = query(collection(db, 'users'), orderBy('ggReceived', 'desc'), limit(10));
onSnapshot(playersQ, function(snap) {
  const el = document.getElementById('lb-players');
  if (!el) return;
  el.innerHTML = '';
  if (snap.empty) {
    el.innerHTML = '<li class="lb-loading">No players yet</li>';
    return;
  }
  snap.docs.forEach(function(d, i) { el.appendChild(playerItem(d, i)); });
}, function(err) {
  console.error('Players error:', err);
  const el = document.getElementById('lb-players');
  if (el) el.innerHTML = '<li class="lb-loading">Error loading</li>';
});

// Top Clips
const clipsQ = query(collection(db, 'videos'), orderBy('ggCount', 'desc'), limit(10));
onSnapshot(clipsQ, function(snap) {
  const el = document.getElementById('lb-clips');
  if (!el) return;
  el.innerHTML = '';
  if (snap.empty) {
    el.innerHTML = '<li class="lb-loading">No clips yet</li>';
    return;
  }
  snap.docs.forEach(function(d, i) { el.appendChild(clipItem(d, i)); });
}, function(err) {
  console.error('Clips error:', err);
  const el = document.getElementById('lb-clips');
  if (el) el.innerHTML = '<li class="lb-loading">Error loading</li>';
});

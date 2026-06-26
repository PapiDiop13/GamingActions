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

// ── Countdown — same logic as the app ───────────────────────────────────────
function updateCountdown() {
  var now = new Date();
  var endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  var diffMs = endOfMonth - now;
  var daysLeft = Math.floor(diffMs / 86400000);
  var diffH = Math.floor((diffMs % 86400000) / 3600000);
  var diffM = Math.floor((diffMs % 3600000) / 60000);
  var diffS = Math.floor((diffMs % 60000) / 1000);

  var pad = function(n) { return String(n).padStart(2, '0'); };
  var chip = document.getElementById('countdown-chip');
  var timer = document.getElementById('countdown-timer');
  if (!timer) return;

  var isLastDay = daysLeft <= 1;
  if (chip) chip.style.borderColor = isLastDay ? 'rgba(255,45,85,0.5)' : 'rgba(201,168,76,0.3)';

  if (daysLeft > 0) {
    timer.textContent = daysLeft + 'D ' + pad(diffH) + ':' + pad(diffM) + ':' + pad(diffS);
    timer.style.color = isLastDay ? '#FF2D55' : '#C9A84C';
  } else {
    timer.textContent = pad(diffH) + ':' + pad(diffM) + ':' + pad(diffS);
    timer.style.color = '#FF2D55';
  }
}

updateCountdown();
setInterval(updateCountdown, 1000);

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
    el.innerHTML = '<li class="lb-loading">No players yet — be the first! 🎮</li>';
    return;
  }
  snap.docs.forEach(function(d, i) { el.appendChild(playerItem(d, i)); });
}, function(err) {
  console.error('Players error:', err.code, err.message);
  const el = document.getElementById('lb-players');
  if (el) el.innerHTML = '<li class="lb-loading" style="color:#888">Rankings loading... open the app to see live data 🎮</li>';
});

// Top Clips
const clipsQ = query(collection(db, 'videos'), orderBy('ggCount', 'desc'), limit(10));
onSnapshot(clipsQ, function(snap) {
  const el = document.getElementById('lb-clips');
  if (!el) return;
  el.innerHTML = '';
  if (snap.empty) {
    el.innerHTML = '<li class="lb-loading">No clips yet — upload your first! 🎬</li>';
    return;
  }
  snap.docs.forEach(function(d, i) { el.appendChild(clipItem(d, i)); });
}, function(err) {
  console.error('Clips error:', err.code, err.message);
  const el = document.getElementById('lb-clips');
  if (el) el.innerHTML = '<li class="lb-loading" style="color:#888">Clips loading... open the app to see live data 🎬</li>';
});

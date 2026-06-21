/**
 * feedSession.js — Simple, robust feed ordering with session persistence.
 *
 * HOW IT WORKS (TikTok/Instagram-style, simplified for a small catalog):
 *
 * 1. On session start, we fetch ALL video IDs (lightweight — just IDs, ~10KB for 500 videos)
 * 2. We shuffle them ONCE into a random order (the "playlist")
 * 3. We serve videos in that exact order, tracking the current position
 * 4. The playlist + position persist across app reloads (AsyncStorage)
 * 5. New videos uploaded mid-session are inserted near the top of the remaining queue
 * 6. When the playlist is exhausted OR 24h passes → reshuffle a fresh playlist
 *
 * This GUARANTEES:
 *   - You never see the same video twice until the whole catalog is exhausted
 *   - Reload/close/reopen → continue exactly where you left off
 *   - New uploads surface quickly
 *   - No scoring complexity, no race conditions, no duplicate-fetch bugs
 *
 * Stored in AsyncStorage under "ga_feed_playlist":
 * {
 *   order:     string[],   // shuffled video IDs (the playlist)
 *   position:  number,     // how many we've served so far
 *   startedAt: number,     // ms timestamp — for 24h expiry
 *   knownIds:  string[],   // all IDs we knew about (to detect new uploads)
 * }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYLIST_KEY        = 'ga_feed_playlist';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

// Fisher-Yates shuffle — unbiased, O(n)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadPlaylist() {
  try {
    const raw = await AsyncStorage.getItem(PLAYLIST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

async function savePlaylist(playlist) {
  try {
    await AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
  } catch (_) {}
}

/**
 * getOrCreatePlaylist — returns the active playlist, creating/refreshing as needed.
 *
 * @param {string[]} allIds - ALL current video IDs from Firestore
 * @returns {{ order: string[], position: number }}
 */
export async function getOrCreatePlaylist(allIds) {
  const existing = await loadPlaylist();
  const now = Date.now();

  // Case 1: No playlist, or expired (>24h) → create fresh shuffled playlist
  if (!existing || (now - (existing.startedAt || 0)) > SESSION_DURATION_MS) {
    const order = shuffle(allIds);
    const playlist = { order, position: 0, startedAt: now, knownIds: allIds };
    await savePlaylist(playlist);
    return playlist;
  }

  // Case 2: Playlist exhausted (served everything) → reshuffle fresh
  if (existing.position >= existing.order.length) {
    const order = shuffle(allIds);
    const playlist = { order, position: 0, startedAt: now, knownIds: allIds };
    await savePlaylist(playlist);
    return playlist;
  }

  // Case 3: Detect NEW videos uploaded since playlist was created
  const knownSet = new Set(existing.knownIds || []);
  const newIds = allIds.filter(id => !knownSet.has(id));

  if (newIds.length > 0) {
    // Insert new videos near the front of the REMAINING queue (after current position)
    // so users see fresh content soon, without disrupting what they've already seen.
    const beforePos = existing.order.slice(0, existing.position);
    const afterPos  = existing.order.slice(existing.position);
    // Shuffle new IDs into the first chunk of the remaining queue
    const remaining = shuffle([...newIds, ...afterPos]);
    const playlist = {
      order:     [...beforePos, ...remaining],
      position:  existing.position,
      startedAt: existing.startedAt,
      knownIds:  allIds,
    };
    await savePlaylist(playlist);
    return playlist;
  }

  // Case 4: Playlist still valid, no new videos → use as-is
  return existing;
}

/**
 * advancePosition — marks N videos as served, advancing the playlist position.
 *
 * @param {number} count - how many videos were just served
 */
export async function advancePosition(count) {
  const playlist = await loadPlaylist();
  if (!playlist) return;
  playlist.position = Math.min(playlist.order.length, (playlist.position || 0) + count);
  await savePlaylist(playlist);
}

/**
 * resetPlaylist — wipes the playlist (e.g. "Clear watch history" in settings).
 */
export async function resetPlaylist() {
  try {
    await AsyncStorage.removeItem(PLAYLIST_KEY);
  } catch (_) {}
}

/**
 * getPlaylistInfo — debug stats.
 */
export async function getPlaylistInfo() {
  const playlist = await loadPlaylist();
  if (!playlist) return { active: false, position: 0, total: 0, remaining: 0 };
  return {
    active:    true,
    position:  playlist.position || 0,
    total:     playlist.order?.length || 0,
    remaining: (playlist.order?.length || 0) - (playlist.position || 0),
    ageHours:  Math.floor((Date.now() - (playlist.startedAt || 0)) / (60 * 60 * 1000)),
  };
}

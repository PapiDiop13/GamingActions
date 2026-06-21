/**
 * feedSession.js — Persistent feed session management
 *
 * Tracks which video IDs the user has already seen this session so
 * fetchVideos never shows the same clip twice until the session resets.
 *
 * Session lifecycle:
 *   - Created on first video fetch of a new session
 *   - Persists across app closes (AsyncStorage)
 *   - Expires after SESSION_DURATION_MS (24h) → full reset
 *   - Also resets if ALL available videos have been seen (pool exhausted)
 *
 * Structure stored in AsyncStorage under "ga_feed_session":
 * {
 *   seenIds:   string[],   // video IDs seen this session
 *   startedAt: number,     // ms timestamp when session began
 * }
 *
 * New videos (posted after session start) are ALWAYS included regardless
 * of seenIds — they're fetched separately in a "fresh batch" at the top
 * of every fetch call.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY          = 'ga_feed_session';
const SESSION_DURATION_MS  = 24 * 60 * 60 * 1000; // 24 hours

// ─── Load session from storage ───────────────────────────────────────────────
async function loadSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ─── Save session to storage ──────────────────────────────────────────────────
async function saveSession(session) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (_) {}
}

/**
 * getSessionSeenIds — returns the Set of video IDs seen this session.
 * Automatically resets if the session has expired (> 24h old).
 *
 * @returns {Set<string>} seen video IDs for the current session
 */
export async function getSessionSeenIds() {
  const session = await loadSession();
  if (!session) return new Set();

  const age = Date.now() - (session.startedAt || 0);
  if (age > SESSION_DURATION_MS) {
    // Session expired — wipe it and start fresh
    await AsyncStorage.removeItem(SESSION_KEY);
    return new Set();
  }

  return new Set(session.seenIds || []);
}

/**
 * markVideosSeen — adds video IDs to the current session's seen list.
 * Creates a new session if none exists.
 * Called after each successful fetch batch.
 *
 * @param {string[]} videoIds - IDs of videos just shown to the user
 */
export async function markVideosSeen(videoIds) {
  if (!videoIds || videoIds.length === 0) return;

  const session = await loadSession();
  const now = Date.now();

  // Check if existing session is still valid
  if (session) {
    const age = now - (session.startedAt || 0);
    if (age > SESSION_DURATION_MS) {
      // Expired — start fresh with just this batch
      await saveSession({ seenIds: videoIds, startedAt: now });
      return;
    }
    // Still valid — merge new IDs (deduplicated via Set → Array)
    const merged = [...new Set([...(session.seenIds || []), ...videoIds])];
    await saveSession({ seenIds: merged, startedAt: session.startedAt });
  } else {
    // No session — create one
    await saveSession({ seenIds: videoIds, startedAt: now });
  }
}

/**
 * resetSession — clears the session immediately.
 * Called from Settings "Clear watch history" or when pool is exhausted.
 */
export async function resetSession() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (_) {}
}

/**
 * getSessionInfo — returns human-readable session stats for debugging.
 */
export async function getSessionInfo() {
  const session = await loadSession();
  if (!session) return { active: false, seenCount: 0, ageHours: 0, startedAt: null };
  const ageMs = Date.now() - (session.startedAt || 0);
  return {
    active:     ageMs <= SESSION_DURATION_MS,
    seenCount:  (session.seenIds || []).length,
    ageHours:   Math.floor(ageMs / (60 * 60 * 1000)),
    expiresIn:  Math.max(0, Math.floor((SESSION_DURATION_MS - ageMs) / (60 * 60 * 1000))),
    startedAt:  session.startedAt || null,
  };
}

/**
 * getSessionStartedAt — returns the session start timestamp (ms).
 * Used by fetchVideos to query for videos posted since session start.
 * Returns null if no active session exists.
 */
export async function getSessionStartedAt() {
  const session = await loadSession();
  if (!session) return null;
  const age = Date.now() - (session.startedAt || 0);
  if (age > SESSION_DURATION_MS) return null; // expired
  return session.startedAt || null;
}

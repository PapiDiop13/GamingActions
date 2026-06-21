/**
 * feedAlgo.js — Lightweight recommendation algorithm for Gaming Actions feed
 *
 * Philosophy: "TikTok-light" — no ML, no server-side scoring, no extra Firestore reads.
 * Everything runs locally on-device using AsyncStorage as a lightweight preference store.
 *
 * ── 80/20 Rule ────────────────────────────────────────────────────────────────
 * The feed is NOT purely algorithmic. For every 10 clips shown:
 *   → 8 clips are scored by user preferences (genre > game > GG quality > recency)
 *   → 2 clips are "wild cards" picked randomly from different genres
 * This prevents the tunnel effect (only seeing FIFA forever) and keeps discovery alive.
 *
 * ── Scoring model ─────────────────────────────────────────────────────────────
 *   score = genre_score × 3      (strongest signal — genre taste is stable)
 *         + game_score  × 2      (specific game preference)
 *         + gg_boost    × 1      (log-scaled quality signal)
 *         + recency     × 0.5    (slight freshness bias for last 7 days)
 *         + noise       ± 0.15   (small randomization — same prefs ≠ identical order)
 *
 * ── View tracking ─────────────────────────────────────────────────────────────
 * A clip counts as "viewed" only after 5 continuous seconds of watch time.
 * Scrolling past in 1-2 seconds = ignored (avoids polluting the preference model).
 * Timer lives in VideoPlayerScreen and calls recordView() on confirmation.
 *
 * ── Storage ───────────────────────────────────────────────────────────────────
 * AsyncStorage key: "ga_feed_prefs"
 * Structure: {
 *   genres: { [genreId]: viewCount },   // e.g. { sport: 10, fps: 3 }
 *   games:  { [gameName]: viewCount },  // e.g. { 'FIFA 24': 8, 'GTA V': 3 }
 * }
 *
 * ── Local vs Cloud ────────────────────────────────────────────────────────────
 * Local (current):  instant, free, per-device, no Firestore cost
 * Cloud (future):   cross-device sync, enables real ML, costs Firestore reads × DAU
 * → Local is the right call until 50k+ active users. Migration path: write prefs to
 *   Firestore /userPrefs/{uid} in recordView(), read on auth init.
 *
 * ── How to test ───────────────────────────────────────────────────────────────
 * 1. Watch 5-6 FIFA clips for 5+ seconds each on Account A
 * 2. Close and reopen the app
 * 3. Feed should show more Sport/FIFA clips near the top
 * 4. 2 out of 10 slots should still show random genres
 * 5. On Account B (no history) → purely random order
 * 6. Use clearPrefs() from Settings to reset and test cold start
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY       = 'ga_feed_prefs';
const WILDCARD_RATIO  = 0.2;  // 20% of feed = wild cards (2 in 10)
const MIN_VIEWS_TO_SCORE = 2; // Need at least 2 views before algo kicks in

// ─── Empty preference model ───────────────────────────────────────────────────
const emptyPrefs = () => ({ genres: {}, games: {} });

/**
 * loadPrefs — reads the user's viewing preference model from AsyncStorage.
 * Returns empty model on first launch or parse error (cold start).
 */
export async function loadPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return emptyPrefs();
    return JSON.parse(raw);
  } catch (_) {
    return emptyPrefs();
  }
}

/**
 * recordView — updates the preference model after a confirmed 5-second watch.
 * Weights: genre gets +1, game gets +1.
 * No cap — the model naturally self-corrects as more genres are watched over time.
 *
 * @param {object} video - video object from Firestore { genre, game }
 */
export async function recordView(video) {
  if (!video) return;
  try {
    const prefs = await loadPrefs();
    if (video.genre) {
      prefs.genres[video.genre] = (prefs.genres[video.genre] || 0) + 1;
    }
    if (video.game) {
      prefs.games[video.game] = (prefs.games[video.game] || 0) + 1;
    }
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

/**
 * scoreVideo — computes a recommendation score for a single video.
 *
 * Weight rationale (after tuning):
 *   genre  × 3   : strongest signal — stable taste indicator
 *   game   × 2   : specific game preference
 *   ggBoost× 0.3 : quality signal but CAPPED — prevents viral clips from always
 *                  dominating. A clip with 1000 GGs scores +2.07, not +6.9.
 *                  This gives small creators a real chance.
 *   recency× 1.5 : new clips (< 7 days) get a meaningful boost — encourages
 *                  fresh content and new creators even with 0 GGs.
 *
 * Example with this model:
 *   FIFA clip (user watches FIFA) with 0 GG:  3.0 + 0 + 0 + 0    = 3.0
 *   COD clip (user doesn't watch COD) viral:  0   + 0 + 2.07 + 0 = 2.07
 *   → FIFA wins even with zero GGs ✅
 *
 *   New FIFA clip posted today (0 GG):         3.0 + 0 + 0 + 1.5  = 4.5
 *   → New creators surface above old viral content ✅
 *
 * @param {object} video    - Firestore video document
 * @param {object} prefs    - preference model { genres, games }
 * @param {number} maxGenre - max genre view count (for normalization)
 * @param {number} maxGame  - max game view count (for normalization)
 * @returns {number} score (higher = show earlier)
 */
export function scoreVideo(video, prefs, maxGenre = 1, maxGame = 1) {
  const genreCounts = prefs.genres || {};
  const gameCounts  = prefs.games  || {};

  // Normalized preference match [0, 1]
  const genreScore = video.genre ? ((genreCounts[video.genre] || 0) / maxGenre) : 0;
  const gameScore  = video.game  ? ((gameCounts[video.game]   || 0) / maxGame)  : 0;

  // Log-scale GG × 0.3 — quality signal but capped so virals don't dominate
  const ggBoost = Math.log(1 + (video.ggCount || 0)) * 0.3;

  // Tiered recency boost — prioritizes fresh content strongly:
  //   < 24h  → +3.0 (appears before older content even with fewer GGs)
  //   1-7d   → +1.5 (still surfaced regularly)
  //   > 7d   → +0   (relies on genre/game match and GG quality)
  // This ensures: open app 1h later → different fresh clips at the top
  const videoAgeMs = video.createdAt?.toDate
    ? Date.now() - video.createdAt.toDate().getTime()
    : Infinity;
  const ONE_DAY  = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * ONE_DAY;
  const recencyBoost = videoAgeMs <= ONE_DAY    ? 3.0
                     : videoAgeMs <= SEVEN_DAYS ? 1.5
                     : 0;

  return (genreScore * 3) + (gameScore * 2) + (ggBoost) + (recencyBoost);
}

/**
 * sortFeedByPrefs — re-ranks videos using the 80/20 rule.
 *
 * Algorithm:
 *  1. Check if user has enough history (>= MIN_VIEWS_TO_SCORE views)
 *     → If not: return videos in original random order (cold start)
 *  2. Score all videos
 *  3. Take top 80% as "personalized" slots
 *  4. Fill remaining 20% with wild cards — clips from genres the user
 *     hasn't seen much, picked randomly from the lower-scored pool
 *  5. Shuffle wild cards into positions spread through the feed (not all at end)
 *
 * @param {Array}  videos - video objects from Firestore
 * @param {object} prefs  - preference model from loadPrefs()
 * @returns {Array} re-ranked video array
 */
export function sortFeedByPrefs(videos, prefs) {
  if (!videos || videos.length === 0) return videos;

  const genreCounts = prefs.genres || {};
  const gameCounts  = prefs.games  || {};

  // Total confirmed views (5-second watches)
  const totalViews = Object.values(genreCounts).reduce((s, n) => s + n, 0);

  // ── Cold start (< 5 views): pure shuffle, no scoring ───────────────────────
  // Without history, scoring would just sort by ggCount (popularity) which
  // makes the same top clips always appear first. Pure shuffle gives every
  // clip — including small creators — a fair chance.
  if (totalViews < MIN_VIEWS_TO_SCORE) {
    const shuffled = [...videos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // ── With history: score + 80/20 split ───────────────────────────────────────
  const maxGenre = Math.max(1, ...Object.values(genreCounts));
  const maxGame  = Math.max(1, ...Object.values(gameCounts));

  // Score all videos + small noise (±0.15) so same prefs ≠ identical order
  const scored = videos.map(v => ({
    video: v,
    score: scoreVideo(v, prefs, maxGenre, maxGame) + (Math.random() * 0.3 - 0.15),
  }));

  scored.sort((a, b) => b.score - a.score);

  // 80% personalized, 20% wild cards
  const totalSlots    = scored.length;
  const wildcardCount = Math.max(1, Math.round(totalSlots * WILDCARD_RATIO));
  const personalCount = totalSlots - wildcardCount;

  const personalVideos = scored.slice(0, personalCount).map(s => s.video);
  const wildcardPool   = scored.slice(personalCount);

  // ── Wild card selection: bias toward low-view clips ─────────────────────────
  // Priority order for wild cards:
  //   1. Different genre from top 5 shown + low views (< 50) → max discovery
  //   2. Different genre, any view count → genre diversity
  //   3. Same genre, low views → give small creators a chance
  //   4. Anything else → fallback
  const topGenres = new Set(personalVideos.slice(0, 5).map(v => v.genre).filter(Boolean));

  const tier1 = wildcardPool.filter(s => !topGenres.has(s.video.genre) && (s.video.viewCount || 0) < 50);
  const tier2 = wildcardPool.filter(s => !topGenres.has(s.video.genre) && (s.video.viewCount || 0) >= 50);
  const tier3 = wildcardPool.filter(s => topGenres.has(s.video.genre)  && (s.video.viewCount || 0) < 50);
  const tier4 = wildcardPool.filter(s => topGenres.has(s.video.genre)  && (s.video.viewCount || 0) >= 50);

  const pickedWildcards = [
    ...tier1.sort(() => Math.random() - 0.5),
    ...tier2.sort(() => Math.random() - 0.5),
    ...tier3.sort(() => Math.random() - 0.5),
    ...tier4.sort(() => Math.random() - 0.5),
  ].slice(0, wildcardCount).map(s => s.video);

  // Interleave wild cards evenly through the feed (not all at the end)
  const result = [...personalVideos];
  const step = Math.floor(personalCount / (wildcardCount + 1));
  pickedWildcards.forEach((wc, i) => {
    const insertAt = Math.min(step * (i + 1) + i, result.length);
    result.splice(insertAt, 0, wc);
  });

  return result;
}

/**
 * clearPrefs — resets the preference model entirely.
 * Called from SettingsScreen "Clear watch history" button.
 * Useful for testing cold start or when a user wants a fresh feed.
 */
export async function clearPrefs() {
  try {
    await AsyncStorage.removeItem(PREFS_KEY);
  } catch (_) {}
}

/**
 * getPrefsDebug — returns readable preference stats for debugging.
 * Call this from __DEV__ mode or an admin screen to verify tracking works.
 */
export async function getPrefsDebug() {
  const prefs = await loadPrefs();
  const totalViews = Object.values(prefs.genres || {}).reduce((s, n) => s + n, 0);
  return {
    totalViews,
    topGenres: Object.entries(prefs.genres || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 5),
    topGames: Object.entries(prefs.games || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

/**
 * points.js — GA Points economy for Gaming Actions
 *
 * Three distinct point buckets per user:
 *  - gaPoints      : spendable balance (shop, frame purchases). Can decrease.
 *  - streakPoints  : cumulative level tracker (NOOB → GOAT). Never decreases.
 *  - ggReceived    : display counter on profile (total GGs received lifetime).
 *
 * Anti-cheat design: every credit has a matching debit (e.g. follow gives +1 pt,
 * unfollow removes it). Points are updated inside a Firestore transaction to
 * prevent race conditions between concurrent writes.
 *
 * Streak levels and their daily login bonuses:
 *  NOOB   (0 pts)    → +1 pt/day
 *  BRONZE (500 pts)  → +3 pts/day
 *  SILVER (2000 pts) → +5 pts/day
 *  GOLD   (5000 pts) → +10 pts/day
 *  GOAT   (15000 pts)→ +15 pts/day
 */

import { doc, runTransaction, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logError, LOG_CONTEXT } from './errorLogger';

// ─── Streak level thresholds (mirrors RankingsScreen.js STREAK_LEVELS) ────────
export const STREAK_LEVELS = [
  { id: 'noob',   minPoints: 0,     dailyBonus: 1  },
  { id: 'bronze', minPoints: 500,   dailyBonus: 3  },
  { id: 'silver', minPoints: 2000,  dailyBonus: 5  },
  { id: 'gold',   minPoints: 5000,  dailyBonus: 10 },
  { id: 'goat',   minPoints: 15000, dailyBonus: 15 },
];

/**
 * calcStreakLevel — returns the current streak level id for a given point total.
 * Iterates all levels and returns the highest threshold the user has crossed.
 */
export function calcStreakLevel(points) {
  let level = 'noob';
  for (const l of STREAK_LEVELS) {
    if (points >= l.minPoints) level = l.id;
  }
  return level;
}

/**
 * getDailyBonus — returns the daily login bonus for a given streak level id.
 * Defaults to 1 if the level is unknown.
 */
export function getDailyBonus(streakLevel) {
  const level = STREAK_LEVELS.find(l => l.id === streakLevel);
  return level?.dailyBonus || 1;
}

/**
 * awardPoints — core transaction that credits or debits a user's points.
 *
 * Uses runTransaction to guarantee atomic read-modify-write:
 * prevents double-spending or double-crediting if the user has multiple
 * concurrent sessions (e.g. phone + tablet).
 *
 * After the transaction, writes a record to `points_history` for audit trails
 * (visible in the user's PointsHistoryScreen and admin panel).
 *
 * @param {string} userId   - Firestore user document ID (same as Firebase Auth uid)
 * @param {number} deltaPts - Points to add (positive) or remove (negative)
 * @param {number} deltaGG  - Change to ggReceived counter (±1 or 0)
 * @param {string} reason   - Human-readable label stored in points_history
 * @param {object} extra    - Optional extra fields merged into the history record
 */
export async function awardPoints(userId, deltaPts, deltaGG = 0, reason = '', extra = {}) {
  if (!userId || deltaPts === 0) return;

  const userRef = doc(db, 'users', userId);
  try {
    let newGaPoints = 0;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return; // User document missing — skip silently

      const data = snap.data();

      // gaPoints can never go below 0 (no negative balance in the shop)
      newGaPoints                = Math.max(0, (data.gaPoints     || 0) + deltaPts);
      const newGgReceived         = Math.max(0, (data.ggReceived   || 0) + deltaGG);

      const updateFields = {
        gaPoints:   newGaPoints,
        ggReceived: newGgReceived,
      };

      // streakPoints only ever increase (level-up is permanent)
      if (deltaPts > 0) {
        const newStreakPoints = (data.streakPoints || 0) + deltaPts;
        updateFields.streakPoints = newStreakPoints;
        // Recalculate streak level only when earning points
        updateFields.streakLevel = calcStreakLevel(newStreakPoints);
      }

      tx.update(userRef, updateFields);
    });

    // Write audit record (outside the transaction — not critical if it fails)
    if (reason) {
      await addDoc(collection(db, 'points_history'), {
        userId,
        delta:     deltaPts,
        reason,
        total:     newGaPoints,
        createdAt: serverTimestamp(),
        ...extra,
      });
    }
  } catch (e) {
    // ⚠️ Points award failed — user loses points without warning.
    // Log this as it signals a Firestore permission or connectivity issue.
    await logError(LOG_CONTEXT.POINTS_FAIL, e, userId);
  }
}

// ─── Point values for each user action ───────────────────────────────────────
// Kept in one place so balance adjustments only require changing this object.
export const POINTS = {
  POST_CLIP:    25,  // Reward for contributing content to the platform
  RECEIVE_GG:    2,  // Small reward per GG vote received
  NEW_FOLLOWER:  1,  // Reduced from 5 → 1 to reduce farming incentive
  DELETE_CLIP:  -25, // Debit mirrors POST_CLIP exactly (anti-cheat symmetry)
  DAILY_LOGIN:  null, // Dynamic — use getDailyBonus(streakLevel) instead
};

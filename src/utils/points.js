/**
 * GA Points — économie centralisée Gaming Actions
 *
 * gaPoints     = solde dépensable (boutique, frames...)
 * streakPoints = cumul pour niveau NOOB→GOAT (ne baisse jamais)
 * ggReceived   = compteur d'affichage profil
 *
 * Chaque crédit a son débit miroir (anti-triche MVP).
 */

import { doc, runTransaction, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export const STREAK_LEVELS = [
  { id: 'noob',   minPoints: 0,     dailyBonus: 1  },
  { id: 'bronze', minPoints: 500,   dailyBonus: 3  },
  { id: 'silver', minPoints: 2000,  dailyBonus: 5  },
  { id: 'gold',   minPoints: 5000,  dailyBonus: 10 },
  { id: 'goat',   minPoints: 15000, dailyBonus: 15 },
];

export function calcStreakLevel(points) {
  let level = 'noob';
  for (const l of STREAK_LEVELS) {
    if (points >= l.minPoints) level = l.id;
  }
  return level;
}

export function getDailyBonus(streakLevel) {
  const level = STREAK_LEVELS.find(l => l.id === streakLevel);
  return level?.dailyBonus || 1;
}

/**
 * Applique des points + enregistre dans l'historique.
 * @param {string} userId
 * @param {number} deltaPts   - positif = crédit, négatif = débit
 * @param {number} deltaGG    - variation ggReceived (±1 ou 0)
 * @param {string} reason     - label affiché dans l'historique
 */
export async function awardPoints(userId, deltaPts, deltaGG = 0, reason = '', extra = {}) {
  if (!userId || deltaPts === 0) return;
  const userRef = doc(db, 'users', userId);
  try {
    let newGaPoints = 0;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return;
      const data = snap.data();

      newGaPoints               = Math.max(0, (data.gaPoints     || 0) + deltaPts);
      const newStreakPoints      = Math.max(0, (data.streakPoints || 0) + deltaPts);
      const newGgReceived        = Math.max(0, (data.ggReceived   || 0) + deltaGG);
      const newStreakLevel        = calcStreakLevel(newStreakPoints);

      tx.update(userRef, {
        gaPoints:    newGaPoints,
        streakPoints: newStreakPoints,
        ggReceived:  newGgReceived,
        streakLevel: newStreakLevel,
      });
    });

    // Enregistrement dans l'historique
    if (reason) {
      await addDoc(collection(db, 'points_history'), {
        userId,
        delta: deltaPts,
        reason,
        total: newGaPoints,
        createdAt: serverTimestamp(),
        ...extra,
      });
    }
  } catch(e){}
}

export const POINTS = {
  POST_CLIP:    50,
  RECEIVE_GG:   2,
  NEW_FOLLOWER: 1,   // réduit de 5 à 1
  DELETE_CLIP: -50,
  DAILY_LOGIN:  null, // calculé dynamiquement via getDailyBonus(streakLevel)
};

/**
 * registerPush.js — Expo Push Notification setup + daily login bonus
 *
 * Why Expo Push Service instead of Firebase Cloud Messaging directly?
 * → The APNs key (DRT4F65TCZ) was incompatible with Firebase Admin FCM.
 *   Expo Push Service acts as a relay: it handles APNs (iOS) and FCM (Android)
 *   from a single token format (ExponentPushToken[...]), simplifying backend code.
 *
 * Token storage: saved as `fcmToken` on the user's Firestore document.
 * Cloud Functions read this field to send targeted push notifications.
 *
 * Daily bonus logic (updateLastSeen):
 *   Called on every app open. If the user hasn't logged in today (different calendar day),
 *   awards a streak-level-dependent bonus and resets the lastSeen timestamp.
 */

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { awardPoints, getDailyBonus } from './points';
import { logEvent, logError, LOG_CONTEXT } from './errorLogger';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,   // SDK ≤52 (legacy)
    shouldShowBanner: true,   // SDK 53+ — bannière au premier plan
    shouldShowList:   true,   // SDK 53+ — centre de notifications
    shouldPlaySound:  true,
    shouldSetBadge:   false,  // Badge géré manuellement via setBadgeCountAsync
  }),
});

/**
 * registerPushToken — requests notification permissions and saves the Expo push token.
 *
 * Flow:
 *  1. Check existing permission status
 *  2. Request if not already granted
 *  3. Get ExponentPushToken from Expo's servers (requires projectId)
 *  4. Save token to Firestore → Cloud Functions will use it to send notifications
 *  5. On Android, create a notification channel with GA branding
 *
 * @param {string} userId - Firebase Auth uid
 */
export async function registerPushToken(userId) {
  if (!userId) return;

  // Efface le badge de l'icône à chaque ouverture (sinon il reste bloqué)
  try { await Notifications.setBadgeCountAsync(0); } catch (e) {}

  // Push tokens require a physical device — simulators have no APNs/FCM support.
  // ⚠️ En SDK 54, Constants.isDevice peut être `undefined` : on ne skip QUE si
  // c'est explicitement `false` (simulateur), sinon on tente l'enregistrement
  // (sinon aucun nouveau device n'enregistrerait son token → push cassé).
  if (Constants.isDevice === false) {
    console.log('[Push] Skipping push token registration on simulator');
    return;
  }

  try {
    // Check current permission status before requesting
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    // User denied notifications — do not log as error, this is a user choice
    if (finalStatus !== 'granted') return;

    // Expo EAS project ID links this token to our specific app build
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '3c5066a4-e461-4e70-b99f-19476e0b45af',
    });
    const token = tokenData.data;
    if (!token) return;

    // Persist token to Firestore — Cloud Functions read `fcmToken` to send pushes
    await updateDoc(doc(db, 'users', userId), {
      fcmToken: token,
      lastSeen: serverTimestamp(),
    });

    // Android notification channel — required for Android 8+ (API 26+)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('gaming_actions', {
        name:             'Gaming Actions',
        importance:       Notifications.AndroidImportance.DEFAULT,
        sound:            'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor:       '#C9A84C', // GA gold accent
      });
    }

    await logEvent(LOG_CONTEXT.PUSH_REGISTER, { token: token.slice(0, 20) + '...' }, userId);
    return token;

  } catch (e) {
    // ⚠️ Push registration failed — user will not receive any notifications.
    // Common causes: simulator (no APNs), network issue, Expo project ID mismatch.
    await logError(LOG_CONTEXT.PUSH_FAIL, e, userId);
  }
}

/**
 * updateLastSeen — updates the user's lastSeen timestamp and awards the daily login bonus.
 *
 * Called once per app open from the main navigator or auth store init.
 * "New day" is determined by calendar date, not 24-hour window
 * (e.g. logging in at 11:58 PM and again at 12:02 AM both count).
 *
 * Daily bonus amounts scale with streak level:
 *  NOOB=1, BRONZE=3, SILVER=5, GOLD=10, GOAT=15
 *
 * @param {string} userId - Firebase Auth uid
 */
export async function updateLastSeen(userId) {
  if (!userId) return;

  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const now  = new Date();

    // Convert Firestore Timestamp to JS Date for comparison
    const lastSeen = data.lastSeen?.toDate ? data.lastSeen.toDate() : null;

    // Compare calendar dates, not UTC timestamps — matches user's local timezone intuition
    const isNewDay = !lastSeen || (
      now.getFullYear() !== lastSeen.getFullYear() ||
      now.getMonth()    !== lastSeen.getMonth()    ||
      now.getDate()     !== lastSeen.getDate()
    );

    // Always update lastSeen (used for "active X days ago" display)
    await updateDoc(userRef, { lastSeen: serverTimestamp() });

    if (isNewDay) {
      const bonus = getDailyBonus(data.streakLevel || 'noob');
      await awardPoints(
        userId,
        bonus,
        0,
        `Daily login bonus (${(data.streakLevel || 'noob').toUpperCase()})`
      );
      await logEvent(LOG_CONTEXT.DAILY_BONUS, { bonus, level: data.streakLevel }, userId);
    }

  } catch (e) {
    // ⚠️ Daily bonus missed — user loses their streak reward silently.
    await logError(LOG_CONTEXT.DAILY_BONUS_FAIL, e, userId);
  }
}

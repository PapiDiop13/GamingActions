/**
 * errorLogger.js — Centralized logging & error tracking for Gaming Actions
 *
 * Architecture:
 *  - appLogs       (Firestore): all user events (uploads, votes, logins, etc.)
 *  - errorLogs     (Firestore): all caught exceptions with context + userId
 *  - errorCounters (Firestore): aggregated error count per context (for dashboards & alerts)
 *
 * Why Firestore instead of a 3rd-party service?
 *  → No extra dependency, data stays in our Firebase project,
 *    admin dashboard reads the same collections directly.
 *
 * Usage:
 *   import { logEvent, logError, LOG_CONTEXT } from '../utils/errorLogger';
 *   await logEvent(LOG_CONTEXT.UPLOAD_SUCCESS, { game }, user.uid);
 *   await logError(LOG_CONTEXT.UPLOAD_FAIL, error, user.uid);
 */

import {
  collection, addDoc, serverTimestamp,
  query, where, orderBy, getDocs, limit,
  doc, setDoc, increment, getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Human-readable Firebase Auth error messages ─────────────────────────────
export function friendlyError(e) {
  const code = e?.code || '';
  const msg  = e?.message || '';
  if (code === 'auth/email-already-in-use'   || msg.includes('email-already-in-use'))   return 'This email is already registered. Try signing in instead.';
  if (code === 'auth/invalid-email'           || msg.includes('invalid-email'))           return 'Please enter a valid email address.';
  if (code === 'auth/weak-password'           || msg.includes('weak-password'))           return 'Password must be at least 6 characters.';
  if (code === 'auth/wrong-password'          || msg.includes('wrong-password'))          return 'Incorrect password. Please try again.';
  if (code === 'auth/user-not-found'          || msg.includes('user-not-found'))          return 'No account found with this email.';
  if (code === 'auth/too-many-requests'       || msg.includes('too-many-requests'))       return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'auth/network-request-failed'  || msg.includes('network'))                 return 'Connection error. Check your internet and try again.';
  if (code === 'auth/user-disabled')                                                       return 'This account has been disabled. Contact support.';
  if (code === 'auth/requires-recent-login')                                               return 'Please sign out and sign in again to complete this action.';
  if (msg.includes('storage') || msg.includes('upload'))                                  return 'Upload failed. Please try again.';
  if (msg.includes('firestore') || msg.includes('permission'))                             return 'Something went wrong. Please try again.';
  return 'Something went wrong. Please try again.';
}

/**
 * LOG_CONTEXT — canonical string identifiers for every loggable event.
 * Used as keys in errorLogs, appLogs, and errorCounters collections.
 * Format: "category/action" for easy filtering in the admin dashboard.
 */
export const LOG_CONTEXT = {
  // Authentication
  SIGNUP:           'auth/signup',
  SIGNUP_GOOGLE:    'auth/signup_google',
  SIGNUP_APPLE:     'auth/signup_apple',
  LOGIN:            'auth/login',
  LOGIN_GOOGLE:     'auth/login_google',
  LOGIN_APPLE:      'auth/login_apple',
  FORGOT_PASSWORD:  'auth/forgot_password',
  SIGNOUT:          'auth/signout',
  PROFILE_SAVE:     'auth/profile_save',

  // Video upload flow
  UPLOAD_START:     'upload/start',
  UPLOAD_SUCCESS:   'upload/success',
  UPLOAD_FAIL:      'upload/fail',       // ⚠️ alert threshold: 3 fails → red flag in admin
  UPLOAD_LIMIT:     'upload/limit_reached',
  VIDEO_DELETE:     'upload/video_delete',
  VIDEO_EDIT:       'upload/video_edit',

  // GG voting system
  GG_VOTE:          'vote/gg',
  GG_VOTE_FAIL:     'vote/gg_fail',

  // Social — follow system
  FOLLOW:           'social/follow',
  FOLLOW_FAIL:      'social/follow_fail',

  // Feed
  FEED_LOAD:        'feed/load',
  FEED_LOAD_FAIL:   'feed/load_fail',
  FEED_VIEW:        'feed/view_clip',

  // Comments
  COMMENT_SEND:     'comment/send',
  COMMENT_FAIL:     'comment/fail',

  // Profile
  PROFILE_UPDATE:   'profile/update',
  PROFILE_FAIL:     'profile/fail',
  AVATAR_UPLOAD:    'profile/avatar_upload',
  AVATAR_FAIL:      'profile/avatar_fail',

  // GA Points economy
  POINTS_AWARD:     'points/award',
  POINTS_FAIL:      'points/fail',       // ⚠️ critical — user loses points without warning

  // Shop / Frame purchases
  SHOP_PURCHASE:    'shop/purchase',
  SHOP_FAIL:        'shop/fail',

  // Fanbase subscriptions
  FANBASE_JOIN:     'fanbase/join',
  FANBASE_CANCEL:   'fanbase/cancel',
  FANBASE_FAIL:     'fanbase/fail',

  // Rankings
  RANKINGS_LOAD:    'rankings/load',
  RANKINGS_FAIL:    'rankings/fail',

  // Notifications
  NOTIF_LOAD:       'notif/load',
  NOTIF_FAIL:       'notif/fail',
  PUSH_REGISTER:    'system/push_register',
  PUSH_FAIL:        'system/push_fail',  // ⚠️ user won't receive notifications

  // Daily login bonus
  DAILY_BONUS:      'system/daily_bonus',
  DAILY_BONUS_FAIL: 'system/daily_bonus_fail',

  // Deep links
  DEEP_LINK:        'system/deeplink',
  DEEP_LINK_FAIL:   'system/deeplink_fail',

  // Tips / GameTips
  TIP_LOAD:         'tips/load',
  TIP_FAIL:         'tips/fail',
  TIP_THANKS:       'tips/thanks',
  TIP_THANKS_FAIL:  'tips/thanks_fail',
};

/**
 * logEvent — records a successful user action in `appLogs` collection.
 * Used for analytics: upload counts, vote counts, daily active users, etc.
 *
 * @param {string} context  - LOG_CONTEXT constant
 * @param {object} data     - any extra metadata (game, contentType, etc.)
 * @param {string} userId   - Firebase Auth uid (nullable for anonymous events)
 */
export async function logEvent(context, data = {}, userId = null) {
  try {
    await addDoc(collection(db, 'appLogs'), {
      context,
      userId:    userId || null,
      data,
      level:     'info',
      createdAt: serverTimestamp(),
    });
  } catch (_) {
    // Silently swallow — logging must never crash the app
  }
}

/**
 * logError — records a caught exception in `errorLogs` + increments aggregated counter.
 *
 * Two writes per error:
 *  1. Detailed log in `errorLogs` (full message, code, userId, timestamp)
 *  2. Counter in `errorCounters` (used by admin dashboard for top-errors ranking)
 *
 * @param {string} context  - LOG_CONTEXT constant identifying where the error occurred
 * @param {Error}  e        - the caught exception
 * @param {string} userId   - Firebase Auth uid of the affected user (nullable)
 */
export async function logError(context, e, userId = null) {
  try {
    // 1. Full error detail for debugging
    await addDoc(collection(db, 'errorLogs'), {
      context,
      code:      e?.code    || null,
      message:   e?.message || String(e),
      userId:    userId     || null,
      level:     'error',
      createdAt: serverTimestamp(),
    });

    // 2. Aggregated counter — key = context with "/" replaced by "_"
    //    (Firestore doc IDs cannot contain "/")
    const counterRef = doc(db, 'errorCounters', context.replace(/\//g, '_'));
    const snap = await getDoc(counterRef);
    if (snap.exists()) {
      await setDoc(counterRef, {
        context,
        count:    increment(1),
        lastSeen: serverTimestamp(),
      }, { merge: true });
    } else {
      // First occurrence — record firstSeen for trend analysis
      await setDoc(counterRef, {
        context,
        count:      1,
        firstSeen:  serverTimestamp(),
        lastSeen:   serverTimestamp(),
      });
    }
  } catch (_) {
    // Silently swallow — logging must never trigger an infinite error loop
  }
}

/**
 * fetchPeriodStats — aggregates key metrics for a given time window.
 * Called by the admin panel Overview tab with Today/Week/Month/Total filters.
 *
 * @param {string} period - 'today' | 'week' | 'month' | 'total'
 * @returns {object|null} stats object or null on error
 */
export async function fetchPeriodStats(period = 'today') {
  const now = new Date();
  let from;
  switch (period) {
    case 'today': from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case 'week':  from = new Date(now - 7  * 24 * 60 * 60 * 1000); break;
    case 'month': from = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
    default:      from = null; // total = no date filter
  }

  try {
    const baseQ = (col) => from
      ? query(collection(db, col), where('createdAt', '>=', from), orderBy('createdAt', 'desc'))
      : query(collection(db, col), orderBy('createdAt', 'desc'));

    const [usersSnap, videosSnap, ggsSnap, errorsSnap, logsSnap] = await Promise.all([
      getDocs(baseQ('users')),
      getDocs(baseQ('videos')),
      getDocs(baseQ('ggs')),
      getDocs(query(collection(db, 'errorLogs'),
        ...(from ? [where('createdAt', '>=', from)] : []),
        orderBy('createdAt', 'desc'), limit(200))),
      getDocs(query(collection(db, 'appLogs'),
        ...(from ? [where('createdAt', '>=', from)] : []),
        orderBy('createdAt', 'desc'), limit(200))),
    ]);

    // Count upload success/fail from respective collections
    const uploadSuccess = logsSnap.docs.filter(d => d.data().context === LOG_CONTEXT.UPLOAD_SUCCESS).length;
    const uploadFail    = errorsSnap.docs.filter(d => d.data().context === LOG_CONTEXT.UPLOAD_FAIL).length;

    return {
      users: usersSnap.size,
      videos: videosSnap.size,
      ggs: ggsSnap.size,
      uploadSuccess,
      uploadFail,
      errors: errorsSnap.size,
      events: logsSnap.size,
    };
  } catch (e) {
    return null;
  }
}

/**
 * fetchTopErrors — returns errors sorted by occurrence count (most frequent first).
 * Powers the "Top Errors" section in both the mobile admin panel and the web dashboard.
 */
export async function fetchTopErrors(limitN = 10) {
  try {
    const snap = await getDocs(collection(db, 'errorCounters'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, limitN);
  } catch (_) {
    return [];
  }
}

/**
 * fetchRecentErrors — returns the N most recent error entries (for detailed log view).
 */
export async function fetchRecentErrors(limitN = 50) {
  try {
    const snap = await getDocs(
      query(collection(db, 'errorLogs'), orderBy('createdAt', 'desc'), limit(limitN))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) {
    return [];
  }
}

/**
 * checkAlertThreshold — returns true if a specific error context has fired
 * >= thresholdCount times within the last `withinHours` hours.
 *
 * Used to trigger upload alerts in the admin Overview:
 *   if (await checkAlertThreshold('upload/fail', 3, 1)) → show red warning
 */
export async function checkAlertThreshold(context, thresholdCount = 3, withinHours = 1) {
  try {
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    const snap = await getDocs(
      query(
        collection(db, 'errorLogs'),
        where('context', '==', context),
        where('createdAt', '>=', since),
        orderBy('createdAt', 'desc'),
        limit(thresholdCount + 1)
      )
    );
    return snap.size >= thresholdCount;
  } catch (_) {
    return false;
  }
}

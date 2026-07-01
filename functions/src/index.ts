import * as admin from "firebase-admin";
import {
  onDocumentWritten,
  onDocumentDeleted,
  onDocumentCreated,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import { logger } from "firebase-functions/v2";
import { Expo } from "expo-server-sdk";
import type FfmpegStatic from 'fluent-ffmpeg';
import * as os from 'os';
import * as fs from 'fs';
import * as pathLib from 'path';

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

// Utilisateurs EXCLUS du classement / champion / leader : créateurs + comptes
// officiels (gameconic). Les admins et les Board RESTENT dans le classement.
function rankExcluded(data: any): boolean {
  return !!data && ["creator", "gameconic"].includes(data.accountType);
}

// FFmpeg is loaded lazily inside generateBrandedVideo to avoid crashing
// Firebase's local module analysis on macOS (no darwin-arm64 binary in the package).
// At Cloud Functions runtime (Linux x64), require() will resolve correctly.

// ─── Seuils de niveau (identiques à points.js côté client) ───────────────────
const STREAK_LEVELS = [
  { id: "noob",   minPoints: 0 },
  { id: "bronze", minPoints: 500 },
  { id: "silver", minPoints: 2000 },
  { id: "gold",   minPoints: 5000 },
  { id: "goat",   minPoints: 15000 },
];

function calcStreakLevel(points: number): string {
  let level = "noob";
  for (const l of STREAK_LEVELS) {
    if (points >= l.minPoints) level = l.id;
  }
  return level;
}

// Récompense en points pour un GG reçu (doit correspondre à POINTS.RECEIVE_GG
// côté client dans src/utils/points.js — gardé synchrone manuellement).
const RECEIVE_GG_POINTS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER 1 — onGGWritten
// Se déclenche à chaque GG ajouté ou retiré.
// Recompte les GG réels de la vidéo → met à jour ggCount + ggReceived du créateur.
// ─────────────────────────────────────────────────────────────────────────────
export const onGGWritten = onDocumentWritten(
  "ggs/{ggId}",
  async (event) => {
    try {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    // Détermine la vidéo concernée
    const videoId: string | undefined = after?.videoId ?? before?.videoId;
    if (!videoId) return;

    const videoRef = db.collection("videos").doc(videoId);
    const videoSnap = await videoRef.get();
    if (!videoSnap.exists) return;

    const videoData = videoSnap.data()!;
    const creatorId: string = videoData.userId;

    // Recompte les GG réels pour cette vidéo
    const ggsSnap = await db.collection("ggs")
      .where("videoId", "==", videoId)
      .get();
    const realGGCount = ggsSnap.size;

    // AJOUT / RETRAIT de GG (before absent+after présent → ajout ; l'inverse → retrait)
    const isAdd    = !before && !!after;
    const isRemove = !!before && !after;
    const monthDelta = isAdd ? 1 : (isRemove ? -1 : 0);
    const ptsDelta = isAdd ? RECEIVE_GG_POINTS : (isRemove ? -RECEIVE_GG_POINTS : 0);

    // Compteur MENSUEL de la vidéo (remis à 0 le 1er du mois par assignMonthlyChampion).
    // Delta-based : +1 par GG reçu ce mois, -1 par retrait, plancher 0.
    const newVideoGgMonth = Math.max(0, (videoData.ggMonth || 0) + monthDelta);

    // Met à jour la vidéo : total all-time (ggCount) + total du mois (ggMonth)
    await videoRef.update({ ggCount: realGGCount, ggMonth: newVideoGgMonth });

    // Recompte les totaux du créateur : all-time (ggReceived) + mensuel (ggMonth)
    const creatorVideosSnap = await db.collection("videos")
      .where("userId", "==", creatorId)
      .get();
    let totalGGReceived = 0;
    let totalGGMonth = 0;
    for (const vDoc of creatorVideosSnap.docs) {
      const vData = vDoc.data();
      if (vDoc.id === videoId) {
        totalGGReceived += realGGCount;
        totalGGMonth    += newVideoGgMonth;
      } else {
        totalGGReceived += vData.ggCount || 0;
        totalGGMonth    += vData.ggMonth || 0;
      }
    }

    // Met à jour le profil du créateur dans UNE transaction atomique.
    // C'est la SOURCE UNIQUE de vérité : ggReceived, gaPoints, streakPoints,
    // streakLevel sont tous recalculés ici. Le client ne fait QUE de
    // l'optimistic UI local (aucune écriture concurrente sur ce doc → plus de
    // failed-precondition).
    const creatorRef = db.collection("users").doc(creatorId);
    let creatorData: Record<string, any> | null = null;

    await db.runTransaction(async (tx) => {
      const creatorSnap = await tx.get(creatorRef);
      if (!creatorSnap.exists) return;
      creatorData = creatorSnap.data()!;

      // gaPoints (solde dépensable) : jamais sous 0
      const newGaPoints     = Math.max(0, (creatorData.gaPoints     || 0) + ptsDelta);
      // streakPoints (niveau cumulatif) : jamais sous 0
      const newStreakPoints = Math.max(0, (creatorData.streakPoints || 0) + ptsDelta);

      tx.update(creatorRef, {
        ggReceived:   totalGGReceived,
        ggMonth:      totalGGMonth,
        gaPoints:     newGaPoints,
        streakPoints: newStreakPoints,
        streakLevel:  calcStreakLevel(newStreakPoints),
      });
    });

    // Trace dans points_history (audit trail visible dans PointsHistoryScreen)
    if (ptsDelta !== 0) {
      await db.collection("points_history").add({
        userId:    creatorId,
        delta:     ptsDelta,
        reason:    isAdd ? "Received a GG" : "GG removed",
        videoId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Notifications UNIQUEMENT sur ajout de GG (pas sur retrait), et jamais à soi-même
    if (isAdd && after && creatorId !== after.userId && creatorData) {
      const senderSnap = await db.collection("users").doc(after.userId).get();
      const senderName = senderSnap.exists ? (senderSnap.data()!.username || "Someone") : "Someone";

      // 1. Notif in-app Firestore (source unique — plus de création côté client)
      await db.collection("notifications").add({
        userId:       creatorId,
        type:         "gg",
        fromUserId:   after.userId,
        fromUsername: senderName,
        text:         "gave you a GG on your clip ⭐",
        videoId,
        read:         false,
        createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Push notification
      const creatorDataTyped = creatorData as Record<string, any>;
      if (creatorDataTyped.fcmToken) {
        await sendPushNotif(
          creatorDataTyped.fcmToken,
          "⭐ GG received!",
          `${senderName} gave you a GG on your clip!`,
          { screen: "Feed", videoId }
        );
      }
    }

    logger.info(`onGGWritten: vidéo ${videoId} → ggCount=${realGGCount}, créateur ${creatorId} → ggReceived=${totalGGReceived}, ptsDelta=${ptsDelta}`);
    } catch (e) { logger.error('trigger error', e); return null; }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER 2 — onFollowWritten
// Se déclenche à chaque follow/unfollow.
// Recompte les vrais followers/following → corrige les deux users.
// ─────────────────────────────────────────────────────────────────────────────
export const onFollowWritten = onDocumentWritten(
  "follows/{followId}",
  async (event) => {
    try {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    const followerId: string | undefined  = after?.followerId  ?? before?.followerId;
    const followingId: string | undefined = after?.followingId ?? before?.followingId;
    if (!followerId || !followingId) return;

    // Recompte les vrais followers de la cible
    const followersSnap = await db.collection("follows")
      .where("followingId", "==", followingId)
      .get();
    const realFollowers = followersSnap.size;

    // Recompte les vrais following du follower
    const followingSnap = await db.collection("follows")
      .where("followerId", "==", followerId)
      .get();
    const realFollowing = followingSnap.size;

    // Corrige les deux profils
    await db.collection("users").doc(followingId).update({ followers: realFollowers });
    await db.collection("users").doc(followerId).update({ following: realFollowing });

    // Push notification au user suivi (seulement sur follow, pas unfollow)
    if (after) {
      try {
        const [targetSnap, senderSnap] = await Promise.all([
          db.collection("users").doc(followingId).get(),
          db.collection("users").doc(followerId).get(),
        ]);
        const targetToken = targetSnap.data()?.fcmToken;
        const senderName = senderSnap.data()?.username || "Someone";
        if (targetToken && followerId !== followingId) {
          await sendPushNotif(
            targetToken,
            "👥 New follower!",
            `${senderName} started following you!`,
            { screen: "UserProfile", userId: followerId }
          );
        }
      } catch (e) { logger.warn("follow push failed:", e); }
    }

    logger.info(`onFollowWritten: ${followerId} following=${realFollowing} | ${followingId} followers=${realFollowers}`);
    } catch (e) { logger.error('trigger error', e); return null; }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER 3 — onVideoDeleted
// Se déclenche quand une vidéo est supprimée.
// Nettoie les GGs orphelins + recalcule ggReceived du créateur.
// ─────────────────────────────────────────────────────────────────────────────
export const onVideoDeleted = onDocumentDeleted(
  "videos/{videoId}",
  async (event) => {
    try {
    const videoId = event.params.videoId;
    const videoData = event.data?.data();
    if (!videoData) return;

    const creatorId: string = videoData.userId;
    const deletedGGCount: number = videoData.ggCount || 0;

    // 1. Batch : supprime GGs orphelins + notifications + comments liés à la vidéo
    const [ggsSnap, notifsSnap, commentsSnap] = await Promise.all([
      db.collection("ggs").where("videoId", "==", videoId).get(),
      db.collection("notifications").where("videoId", "==", videoId).get(),
      db.collection("comments").where("videoId", "==", videoId).get(),
    ]);

    const batch = db.batch();
    ggsSnap.docs.forEach((d) => batch.delete(d.ref));
    notifsSnap.docs.forEach((d) => batch.delete(d.ref));
    commentsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    // 2. Recompte ggReceived du créateur depuis ses vidéos restantes
    const creatorVideosSnap = await db.collection("videos")
      .where("userId", "==", creatorId)
      .get();
    let totalGGReceived = 0;
    let totalGGMonth = 0;
    creatorVideosSnap.docs.forEach((d) => {
      totalGGReceived += d.data().ggCount || 0;
      totalGGMonth    += d.data().ggMonth || 0;
    });

    // 3. Transaction atomique sur le profil créateur :
    //    - videoCount -1
    //    - ggReceived recalculé
    //    - gaPoints/streakPoints : retire les GG points + le clip bonus (POST_CLIP)
    //    - streakLevel recalculé
    const POST_CLIP_POINTS = 25; // Doit correspondre à POINTS.POST_CLIP côté client
    const creatorRef = db.collection("users").doc(creatorId);
    let finalGaPoints = 0;
    await db.runTransaction(async (tx) => {
      const creatorSnap = await tx.get(creatorRef);
      if (!creatorSnap.exists) return;
      const d = creatorSnap.data()!;

      const ggPointsToRemove  = deletedGGCount * RECEIVE_GG_POINTS;
      const totalPointsToRemove = ggPointsToRemove + POST_CLIP_POINTS;
      const newGaPoints     = Math.max(0, (d.gaPoints     || 0) - totalPointsToRemove);
      const newStreakPoints = Math.max(0, (d.streakPoints || 0) - totalPointsToRemove);
      const newVideoCount   = Math.max(0, (d.videoCount   || 0) - 1);
      finalGaPoints = newGaPoints;

      tx.update(creatorRef, {
        videoCount:   newVideoCount,
        ggReceived:   totalGGReceived,
        ggMonth:      totalGGMonth,
        gaPoints:     newGaPoints,
        streakPoints: newStreakPoints,
        streakLevel:  calcStreakLevel(newStreakPoints),
      });
    });

    // 4. points_history — trace audit (hors transaction, non bloquant)
    const ggPointsToRemove = deletedGGCount * RECEIVE_GG_POINTS;
    const totalPointsToRemove = ggPointsToRemove + POST_CLIP_POINTS;
    if (totalPointsToRemove > 0) {
      await db.collection("points_history").add({
        userId:    creatorId,
        delta:     -totalPointsToRemove,
        reason:    `Clip deleted (-${POST_CLIP_POINTS} clip bonus, -${ggPointsToRemove} GG pts)`,
        total:     finalGaPoints,
        videoId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    logger.info(
      `onVideoDeleted: vidéo ${videoId} — ${ggsSnap.size} GGs nettoyés, ` +
      `créateur ${creatorId} ggReceived=${totalGGReceived}, ` +
      `-${totalPointsToRemove} pts (clip + GGs)`
    );
    } catch (e) { logger.error('trigger error', e); return null; }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER 4 — onCommentCreated
// Push notification au créateur de la vidéo quand quelqu'un commente.
// Push également à l'auteur du commentaire parent sur une réponse.
// ─────────────────────────────────────────────────────────────────────────────
export const onCommentCreated = onDocumentWritten(
  "comments/{commentId}",
  async (event) => {
    const after  = event.data?.after?.data();
    const before = event.data?.before?.data();
    // Only on creation (not edit/delete)
    if (!after || before) return;

    const { videoId, userId: commenterId, username: commenterName, parentId, text } = after;
    if (!videoId || !commenterId) return;

    const preview = (text || "").slice(0, 40);

    try {
      // 1. Notify video owner
      const videoSnap = await db.collection("videos").doc(videoId).get();
      if (videoSnap.exists) {
        const videoOwnerId = videoSnap.data()!.userId;
        if (videoOwnerId && videoOwnerId !== commenterId) {
          const ownerSnap = await db.collection("users").doc(videoOwnerId).get();
          const ownerToken = ownerSnap.data()?.fcmToken;
          if (ownerToken) {
            await sendPushNotif(
              ownerToken,
              `💬 ${commenterName || "Someone"} commented`,
              preview || "on your clip",
              { screen: "Feed", videoId }
            );
          }
        }
      }

      // 2. Notify parent comment author on reply
      if (parentId) {
        const parentSnap = await db.collection("comments").doc(parentId).get();
        if (parentSnap.exists) {
          const parentAuthorId = parentSnap.data()!.userId;
          if (parentAuthorId && parentAuthorId !== commenterId) {
            const parentAuthorSnap = await db.collection("users").doc(parentAuthorId).get();
            const parentToken = parentAuthorSnap.data()?.fcmToken;
            if (parentToken) {
              await sendPushNotif(
                parentToken,
                `↩️ ${commenterName || "Someone"} replied`,
                preview || "to your comment",
                { screen: "Feed", videoId }
              );
            }
          }
        }
      }
    } catch (e) { logger.warn("onCommentCreated push failed:", e); }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED 1 — reconcileGGCounts (toutes les 6h)
// Vérifie que le ggCount de chaque vidéo correspond au nombre réel de docs GG.
// Corrige les écarts silencieusement.
// ─────────────────────────────────────────────────────────────────────────────
export const reconcileGGCounts = onSchedule(
  { schedule: "every 6 hours", region: "us-central1" },
  async () => {
    logger.info("reconcileGGCounts: démarrage...");
    let corrected = 0;

    const videosSnap = await db.collection("videos").get();

    for (const vDoc of videosSnap.docs) {
      const vData = vDoc.data();
      const storedCount: number = vData.ggCount || 0;

      // Recompte les GGs réels
      const realSnap = await db.collection("ggs")
        .where("videoId", "==", vDoc.id)
        .get();
      const realCount = realSnap.size;

      if (realCount !== storedCount) {
        await vDoc.ref.update({ ggCount: realCount });
        corrected++;
        logger.warn(`reconcileGGCounts: vidéo ${vDoc.id} — stocké=${storedCount} réel=${realCount} → corrigé`);
      }
    }

    logger.info(`reconcileGGCounts: terminé — ${corrected} vidéo(s) corrigée(s) sur ${videosSnap.size}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED 2 — reconcileUserStats (1x/jour à 3h du matin UTC)
// Vérifie et corrige pour chaque user :
//   - ggReceived (somme réelle des ggCount de ses vidéos)
//   - followers (count réel des docs follows)
//   - streakLevel (recalculé depuis streakPoints)
//   - gaPoints et streakPoints (jamais négatifs)
// ─────────────────────────────────────────────────────────────────────────────
export const reconcileUserStats = onSchedule(
  { schedule: "0 3 * * *", region: "us-central1" },
  async () => {
    logger.info("reconcileUserStats: démarrage...");
    let corrected = 0;

    const usersSnap = await db.collection("users").get();

    for (const uDoc of usersSnap.docs) {
      const uData = uDoc.data();
      const updates: Record<string, unknown> = {};

      // 1. ggReceived réel
      const videosSnap = await db.collection("videos")
        .where("userId", "==", uDoc.id)
        .get();
      const realGGReceived = videosSnap.docs.reduce(
        (sum, d) => sum + (d.data().ggCount || 0), 0
      );
      if (realGGReceived !== (uData.ggReceived || 0)) {
        updates.ggReceived = realGGReceived;
      }

      // 1b. videoCount réel (utilisé par Gift Cards)
      const realVideoCount = videosSnap.size;
      if (realVideoCount !== (uData.videoCount || 0)) {
        updates.videoCount = realVideoCount;
      }

      // 1c. fanbaseSubscribers réels (utilisé par EarningsScreen)
      const fanbaseSnap = await db.collection("fanbase_subscriptions")
        .where("creatorId", "==", uDoc.id)
        .get();
      const realFanbaseSubscribers = fanbaseSnap.size;
      if (realFanbaseSubscribers !== (uData.fanbaseSubscribers || 0)) {
        updates.fanbaseSubscribers = realFanbaseSubscribers;
        // Sync aussi creator_earnings.subscriberCount
        const earningsRef = db.collection("creator_earnings").doc(uDoc.id);
        const earningsSnap = await earningsRef.get();
        if (earningsSnap.exists) {
          if ((earningsSnap.data()!.subscriberCount || 0) !== realFanbaseSubscribers) {
            await earningsRef.update({ subscriberCount: realFanbaseSubscribers });
          }
        } else if (realFanbaseSubscribers > 0) {
          await earningsRef.set({
            subscriberCount: realFanbaseSubscribers,
            totalEarned: 0, totalPaid: 0, balance: 0, pendingWithdrawal: 0,
          });
        }
      }

      // 2. followers réels
      const followersSnap = await db.collection("follows")
        .where("followingId", "==", uDoc.id)
        .get();
      const realFollowers = followersSnap.size;
      if (realFollowers !== (uData.followers || 0)) {
        updates.followers = realFollowers;
      }

      // 3. following réels
      const followingSnap = await db.collection("follows")
        .where("followerId", "==", uDoc.id)
        .get();
      const realFollowing = followingSnap.size;
      if (realFollowing !== (uData.following || 0)) {
        updates.following = realFollowing;
      }

      // 4. gaPoints et streakPoints jamais négatifs
      if ((uData.gaPoints || 0) < 0) updates.gaPoints = 0;
      if ((uData.streakPoints || 0) < 0) updates.streakPoints = 0;

      // 5. streakLevel recalculé
      const streakPts = (updates.streakPoints as number | undefined) ?? (uData.streakPoints || 0);
      const correctLevel = calcStreakLevel(streakPts as number);
      if (correctLevel !== uData.streakLevel) {
        updates.streakLevel = correctLevel;
      }

      if (Object.keys(updates).length > 0) {
        await uDoc.ref.update(updates);
        corrected++;
        logger.info(`reconcileUserStats: user ${uDoc.id} (${uData.username}) — corrections: ${JSON.stringify(updates)}`);
      }
    }

    logger.info(`reconcileUserStats: terminé — ${corrected} user(s) corrigé(s) sur ${usersSnap.size}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED 3 — cleanOrphanData (1x/semaine, dimanche 4h UTC)
// Supprime les docs orphelins qui pointent vers des entités supprimées :
//   - GGs dont la vidéo n'existe plus
//   - Notifications dont la vidéo référencée n'existe plus
//   - fanbase_subscriptions dont le créateur n'existe plus
// ─────────────────────────────────────────────────────────────────────────────
export const cleanOrphanData = onSchedule(
  { schedule: "0 4 * * 0", region: "us-central1" },
  async () => {
    logger.info("cleanOrphanData: démarrage...");
    let cleaned = 0;

    // 1. GGs orphelins
    const ggsSnap = await db.collection("ggs").get();
    const batch1 = db.batch();
    for (const ggDoc of ggsSnap.docs) {
      const videoId: string = ggDoc.data().videoId;
      if (!videoId) { batch1.delete(ggDoc.ref); cleaned++; continue; }
      const vSnap = await db.collection("videos").doc(videoId).get();
      if (!vSnap.exists) { batch1.delete(ggDoc.ref); cleaned++; }
    }
    await batch1.commit();

    // 2. Notifications orphelines (liées à une vidéo supprimée)
    const notifsSnap = await db.collection("notifications")
      .where("videoId", "!=", "")
      .get();
    const batch2 = db.batch();
    for (const nDoc of notifsSnap.docs) {
      const videoId: string | undefined = nDoc.data().videoId;
      if (!videoId) continue;
      const vSnap = await db.collection("videos").doc(videoId).get();
      if (!vSnap.exists) { batch2.delete(nDoc.ref); cleaned++; }
    }
    await batch2.commit();

    // 3. fanbase_subscriptions orphelines (créateur supprimé)
    const subsSnap = await db.collection("fanbase_subscriptions").get();
    const batch3 = db.batch();
    for (const sDoc of subsSnap.docs) {
      const creatorId: string | undefined = sDoc.data().creatorId;
      if (!creatorId) { batch3.delete(sDoc.ref); cleaned++; continue; }
      const uSnap = await db.collection("users").doc(creatorId).get();
      if (!uSnap.exists) { batch3.delete(sDoc.ref); cleaned++; }
    }
    await batch3.commit();

    logger.info(`cleanOrphanData: terminé — ${cleaned} doc(s) orphelin(s) supprimé(s)`);
  }
);
// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS DE RE-ENGAGEMENT — Gaming Actions
//
// Push via Expo Push Service (expo-server-sdk).
// Le champ users/{uid}.fcmToken contient un ExponentPushToken (mis à jour client).
//
// Règles anti-spam :
//   - Max 1 notif de re-engagement par utilisateur par type par semaine
//   - Stocké dans notifThrottle/{userId}_{type} avec timestamp
// ─────────────────────────────────────────────────────────────────────────────

async function sendPushNotif(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  if (!token || !Expo.isExpoPushToken(token)) {
    logger.warn("sendPushNotif: token invalide ou absent");
    return false;
  }
  try {
    const tickets = await expo.sendPushNotificationsAsync([
      {
        to: token,
        sound: "default",
        title,
        body,
        data: data || {},
        channelId: "gaming_actions",
        priority: "high",
      },
    ]);
    const ticket = tickets[0];
    if (ticket.status === "error") {
      logger.warn(`sendPushNotif error: ${ticket.message}`);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn(`sendPushNotif failed: ${e}`);
    return false;
  }
}

// Envoie une push + notif in-app à TOUS les admins (achats, abonnements…).
async function notifyAdmins(title: string, body: string, data?: Record<string, string>): Promise<void> {
  try {
    const adminsSnap = await db.collection("users").where("isAdmin", "==", true).get();
    for (const d of adminsSnap.docs) {
      const token = d.data()?.fcmToken;
      if (token) await sendPushNotif(token, title, body, data || {});
      await db.collection("notifications").add({
        userId: d.id,
        type: "admin_sale",
        text: `${title} — ${body}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (e) { logger.warn("notifyAdmins failed: " + e); }
}

// ── Notifs ADMIN en temps réel sur achats / abonnements ──────────────────────
export const onShopPurchaseAdmin = onDocumentCreated("shop_purchases/{id}", async (event) => {
  const x = event.data?.data(); if (!x || x.isTest) return;
  const amt = Number(x.amount || 0).toFixed(2);
  await notifyAdmins("💰 New purchase", `${x.itemName || x.category || "Item"} — CA$${amt}`, { screen: "Admin" });
});

export const onSupportPurchaseAdmin = onDocumentCreated("support_purchases/{id}", async (event) => {
  const x = event.data?.data(); if (!x) return;
  const amt = Number(x.amount || 0).toFixed(2);
  await notifyAdmins("💛 New support", `Someone supported the app — CA$${amt}`, { screen: "Admin" });
});

export const onSubscriptionAdmin = onDocumentCreated("subscriptions/{uid}", async (event) => {
  const x = event.data?.data(); if (!x || x.isTest) return;
  await notifyAdmins("👑 New Legendary subscriber", `${x.productId || "legendary"} · ${x.platform || ""}`, { screen: "Admin" });
});

export const onFanbaseSubAdmin = onDocumentCreated("fanbase_subscriptions/{id}", async (event) => {
  const x = event.data?.data(); if (!x || x.isTest) return;
  await notifyAdmins("🔓 New Fanbase subscriber", `Creator: ${x.creatorId || ""}`, { screen: "Admin" });
});

// Vérifie si une notif de ce type a déjà été envoyée à cet user cette semaine
async function isThrottled(userId: string, type: string): Promise<boolean> {
  const key = `${userId}_${type}`;
  const snap = await db.collection("notifThrottle").doc(key).get();
  if (!snap.exists) return false;
  const sentAt = snap.data()?.sentAt?.toMillis?.() || 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - sentAt < weekMs;
}

async function setThrottle(userId: string, type: string): Promise<void> {
  const key = `${userId}_${type}`;
  await db.collection("notifThrottle").doc(key).set({
    userId, type, sentAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Retourne un tableau shufflé (tirage aléatoire parmi une liste)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 1 — Inactifs depuis 3+ jours (lundi et jeudi à 18h UTC)
// Cible : gamers qui ne se sont pas connectés depuis ≥ 3 jours
// Limite : 50 users aléatoires par run (évite le flood)
// ─────────────────────────────────────────────────────────────────────────────
export const notifInactiveUsers = onSchedule(
  { schedule: "0 18 * * 1,4", region: "us-central1", timeZone: "America/Toronto", timeoutSeconds: 300 },
  async () => {
    logger.info("notifInactiveUsers: start");
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    // Note: avoid multi-field inequality (lastSeen + fcmToken) — filter token in loop
    const usersSnap = await db.collection("users")
      .where("lastSeen", "<=", threeDaysAgo)
      .limit(200)
      .get();

    const messages = [
      { t: "🎮 Miss you!", b: "Your feed is full of fresh clips. Come see what's new!" },
      { t: "🔥 The community is live!", b: "New clips, new GGs — you're missing the action." },
      { t: "⭐ Your ranking awaits", b: "Check the leaderboard and see where you stand this month." },
      { t: "👾 Ready to rize?", b: "Log in, watch some clips, and earn GA Points. Let's go!" },
      { t: "🏆 Weekend warriors are uploading!", b: "Don't let them outrun you on the rankings." },
    ];

    const candidates = shuffle(usersSnap.docs).slice(0, 50);
    let sent = 0;
    for (const uDoc of candidates) {
      const u = uDoc.data();
      if (!u.fcmToken) continue;
      if (await isThrottled(uDoc.id, "inactive")) continue;
      const msg = messages[Math.floor(Math.random() * messages.length)];
      const ok = await sendPushNotif(u.fcmToken, msg.t, msg.b, { screen: "Feed" });
      if (ok) { await setThrottle(uDoc.id, "inactive"); sent++; }
    }
    logger.info(`notifInactiveUsers: sent ${sent}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 2 — Pas d'upload cette semaine (mercredi à 19h UTC)
// Cible : users avec au moins 1 clip déjà publié, mais aucun cette semaine
// ─────────────────────────────────────────────────────────────────────────────
export const notifUploadNudge = onSchedule(
  { schedule: "0 19 * * 3,5", region: "us-central1", timeZone: "America/Toronto", timeoutSeconds: 300 }, // mercredi + vendredi
  async () => {
    logger.info("notifUploadNudge: start");
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Users qui ont au moins 1 clip (on filtre ensuite côté code)
    const usersSnap = await db.collection("users")
      .where("fcmToken", "!=", "")
      .limit(300)
      .get();

    const messages = [
      { t: "🎯 Upload this week!", b: "Post a clip, earn 50 GA Points, and climb the rankings." },
      { t: "📹 Ready to Rize?", b: "Your fans are waiting for your next clip. Don't keep them waiting!" },
      { t: "⬆️ Boost your score!", b: "Each clip earns you 50 pts. One upload = one step higher." },
      { t: "🎮 Gaming Actions misses you!", b: "Drop a clip this week and see the GGs roll in." },
    ];

    const candidates = shuffle(usersSnap.docs).slice(0, 200);
    let sent = 0;
    for (const uDoc of candidates) {
      const u = uDoc.data();
      if (await isThrottled(uDoc.id, "upload_nudge")) continue;
      // Vérifie qu'il a au moins 1 clip total mais aucun cette semaine
      const totalSnap = await db.collection("videos").where("userId", "==", uDoc.id).limit(1).get();
      if (totalSnap.empty) continue;
      const recentSnap = await db.collection("videos")
        .where("userId", "==", uDoc.id)
        .where("createdAt", ">", weekAgo)
        .limit(1)
        .get();
      if (!recentSnap.empty) continue; // a déjà uploadé cette semaine
      const msg = messages[Math.floor(Math.random() * messages.length)];
      const ok = await sendPushNotif(u.fcmToken, msg.t, msg.b, { screen: "Upload" });
      if (ok) { await setThrottle(uDoc.id, "upload_nudge"); sent++; }
    }
    logger.info(`notifUploadNudge: sent ${sent}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 3 — Rankings chauffe (vendredi à 20h UTC)
// Cible : users dans le top 20 du ranking mensuel
// Message personnalisé : "Tu es à X pts de dépasser {username}"
// ─────────────────────────────────────────────────────────────────────────────
export const notifRankingHeat = onSchedule(
  { schedule: "0 20 * * 5", region: "us-central1", timeZone: "America/Toronto", timeoutSeconds: 300 },
  async () => {
    logger.info("notifRankingHeat: start");

    // Récupère le top 25 par ggMonth (GG du mois en cours)
    const usersSnap = await db.collection("users")
      .orderBy("ggMonth", "desc")
      .limit(25)
      .get();

    const ranked = usersSnap.docs.map((d, i) => {
      const data = d.data() as Record<string, any>;
      return {
        id: d.id,
        rank: i + 1,
        fcmToken: (data.fcmToken || '') as string,
        ggReceived: (data.ggMonth || 0) as number,
        username: (data.username || '') as string,
      };
    });

    let sent = 0;
    for (let i = 1; i < ranked.length; i++) {
      const user = ranked[i];
      const above = ranked[i - 1];
      if (!user.fcmToken) continue;
      if (await isThrottled(user.id, "ranking_heat")) continue;

      const gap = (above.ggReceived || 0) - (user.ggReceived || 0);
      const title = "🏆 Rankings are heating up!";
      const body = gap <= 5
        ? `You're tied with ${above.username}! Post a clip to take #${above.rank}! 🔥`
        : `Only ${gap} GGs separate you from ${above.username} (#${above.rank}). Upload now!`;

      const ok = await sendPushNotif(user.fcmToken, title, body, { screen: "Rankings" });
      if (ok) { await setThrottle(user.id, "ranking_heat"); sent++; }
    }
    logger.info(`notifRankingHeat: sent ${sent}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 4 — Weekend push (samedi à 14h UTC)
// Cible : tous les users actifs (lastSeen < 7 jours), message motivant aléatoire
// Groupe aléatoire de 30% des users (pas tout le monde, évite le spam)
// ─────────────────────────────────────────────────────────────────────────────
export const notifWeekend = onSchedule(
  { schedule: "0 14 * * 6", region: "us-central1", timeZone: "America/Toronto", timeoutSeconds: 300 },
  async () => {
    logger.info("notifWeekend: start");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Note: avoid multi-field inequality (lastSeen + fcmToken) — filter token in loop
    const usersSnap = await db.collection("users")
      .where("lastSeen", ">=", sevenDaysAgo)
      .limit(500)
      .get();

    const messages = [
      { t: "🎮 Weekend gaming time!", b: "Share your best clips and earn GGs from the community." },
      { t: "🏆 Rankings reset in days!", b: "This weekend is your chance to climb before the month ends." },
      { t: "🔥 The feed is lit!", b: "Fresh clips are dropping. Come GG the best ones and earn points!" },
      { t: "⭐ Earn GA Points this weekend!", b: "Post clips, get GGs, follow your favorites — every action counts." },
      { t: "👾 Rize to the GG!", b: "The top 10 gets rewards. Your weekend starts now. 🎯" },
      { t: "🎯 New clips are waiting!", b: "Your following just uploaded. Come watch and show some love." },
    ];

    // Tirage aléatoire de 30% des actifs
    const sample = shuffle(usersSnap.docs).slice(0, Math.ceil(usersSnap.size * 0.3));
    let sent = 0;
    for (const uDoc of sample) {
      const u = uDoc.data();
      if (!u.fcmToken) continue;
      if (await isThrottled(uDoc.id, "weekend")) continue;
      const msg = messages[Math.floor(Math.random() * messages.length)];
      const ok = await sendPushNotif(u.fcmToken, msg.t, msg.b, { screen: "Feed" });
      if (ok) { await setThrottle(uDoc.id, "weekend"); sent++; }
    }
    logger.info(`notifWeekend: sent ${sent}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CHAMPION DU MOIS — Attribution automatique au 1er du mois à 0h01 UTC
//
// Logique :
//   1. Trouve le user avec le plus de ggReceived
//   2. Retire isChampion + ownedFrames champion à l'ancien champion
//   3. Attribue isChampion=true + championMonth + frame champion au nouveau
//   4. Met isCurrentLeader=false sur tout le monde (reset mensuel)
//   5. Envoie une notif au nouveau champion
//
// Champs Firestore utilisés :
//   users.isChampion       : bool — gagnant du mois précédent
//   users.isCurrentLeader  : bool — 1er du mois en cours (mis à jour chaque heure)
//   users.championMonth    : "YYYY-MM" — mois gagné
//   users.ownedFrames      : string[] — frames avatar possédées
//   users.ownedVideoFrames : string[] — frames vidéo possédées
// ─────────────────────────────────────────────────────────────────────────────
export const assignMonthlyChampion = onSchedule(
  { schedule: "1 0 1 * *", region: "us-central1", timeZone: "America/Toronto", timeoutSeconds: 120 },
  async () => {
    logger.info("assignMonthlyChampion: start");

    // 1. Trouve le 1er ÉLIGIBLE par ggMonth (GG DU MOIS, hors creator/gameconic, avec ≥1 GG)
    const topSnap = await db.collection("users")
      .orderBy("ggMonth", "desc")
      .limit(30)
      .get();
    if (topSnap.empty) {
      logger.warn("assignMonthlyChampion: no users found");
      return;
    }
    // Top 3 éligibles du mois → Wall of Legends
    const eligibleTop = topSnap.docs
      .filter((d) => !rankExcluded(d.data()) && (d.data().ggMonth || 0) > 0);
    const newChampDoc = eligibleTop[0];
    if (!newChampDoc) {
      logger.warn("assignMonthlyChampion: no eligible champion");
      return;
    }
    const newChampData = newChampDoc.data();
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

    // 2. Retire le titre à l'ancien champion (s'il y en a un différent)
    const oldChampSnap = await db.collection("users")
      .where("isChampion", "==", true)
      .get();
    const batch = db.batch();
    for (const oldDoc of oldChampSnap.docs) {
      if (oldDoc.id === newChampDoc.id) continue; // même personne → on garde
      const oldData = oldDoc.data();
      // Retire les frames champion
      const cleanFrames = (oldData.ownedFrames || []).filter((f: string) => f !== "champion");
      const cleanVideoFrames = (oldData.ownedVideoFrames || []).filter((f: string) => f !== "vf_champion");
      batch.update(oldDoc.ref, {
        isChampion: false,
        ownedFrames: cleanFrames,
        ownedVideoFrames: cleanVideoFrames,
        // Retire la frame équipée si c'était champion
        ...(oldData.equippedFrame === "champion" ? { equippedFrame: "none" } : {}),
      });
    }

    // 3. Attribue le titre au nouveau champion
    const newOwnedFrames = [...new Set([...(newChampData.ownedFrames || []), "champion"])];
    const newOwnedVideoFrames = [...new Set([...(newChampData.ownedVideoFrames || []), "vf_champion"])];
    batch.update(newChampDoc.ref, {
      isChampion: true,
      isCurrentLeader: true,
      championMonth: monthKey,
      ownedFrames: newOwnedFrames,
      ownedVideoFrames: newOwnedVideoFrames,
      // Auto-équipe la frame champion sur son avatar
      equippedFrame: "champion",
    });

    // 4. Reset isCurrentLeader sur tous les autres
    const allUsersSnap = await db.collection("users").where("isCurrentLeader", "==", true).get();
    for (const u of allUsersSnap.docs) {
      if (u.id !== newChampDoc.id) batch.update(u.ref, { isCurrentLeader: false });
    }

    await batch.commit();

    // 5. Bonus champion : +500 GA Points ET +500 Streak points (monte le niveau)
    const champCurrentPoints  = newChampData.gaPoints || 0;
    const champStreakPoints   = (newChampData.streakPoints || 0) + 500;
    await newChampDoc.ref.update({
      gaPoints:     champCurrentPoints + 500,
      streakPoints: champStreakPoints,
      streakLevel:  calcStreakLevel(champStreakPoints),
    });
    await db.collection("points_history").add({
      userId: newChampDoc.id, delta: 500, reason: `🏆 Champion bonus (${monthKey})`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 6. Notif de félicitations au champion (in-app + push)
    await admin.firestore().collection("notifications").add({
      userId: newChampDoc.id,
      type: "system",
      fromUserId: "SYSTEM",
      fromUsername: "Gaming Actions",
      text: `🏆 Congratulations ${newChampData.username}! You are the Champion of ${monthKey}! Your exclusive Champion frame is now active 👑⚡ — and you earned 500 bonus GA Points!`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (newChampData.fcmToken) {
      await sendPushNotif(
        newChampData.fcmToken,
        "👑 You are the Champion!",
        `You won the GG Rankings for ${monthKey}! +500 GA Points awarded. Your exclusive Champion frame is now active. ⚡`,
        { screen: "Rankings" }
      );
    }

    // 7. Notif communauté — tout le monde sait qui est le champion
    const allUsersForNotif = await db.collection("users")
      .where("fcmToken", "!=", "")
      .limit(500)
      .get();

    const communityBatch = db.batch();
    const champUsername = newChampData.username || "A player";
    for (const uDoc of allUsersForNotif.docs) {
      if (uDoc.id === newChampDoc.id) continue; // le champion a déjà sa notif perso
      communityBatch.create(db.collection("notifications").doc(), {
        userId: uDoc.id,
        type: "system",
        fromUserId: "SYSTEM",
        fromUsername: "Gaming Actions",
        text: `👑 ${champUsername} is the Champion of ${monthKey}! Can you take the crown next month? 🔥`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await communityBatch.commit();

    // Push communauté (max 100 pour ne pas saturer)
    const pushTargets = allUsersForNotif.docs
      .filter(u => u.id !== newChampDoc.id && u.data().fcmToken)
      .slice(0, 100);

    await Promise.all(pushTargets.map(u =>
      sendPushNotif(
        u.data().fcmToken,
        "👑 New Champion!",
        `${champUsername} won the GG Rankings for ${monthKey}! Can you take the crown? 🔥`,
        { screen: "Rankings" }
      ).catch(() => {})
    ));

    // ── 8. WALL OF LEGENDS — enregistre le podium du mois écoulé ───────────────
    // Top 3 global (déjà trié par ggMonth desc, hors exclus)
    const podium = eligibleTop.slice(0, 3).map((d, i) => {
      const u = d.data();
      return {
        rank: i + 1,
        uid: d.id,
        username: u.username || "Player",
        avatar: u.avatar || "",
        ggMonth: u.ggMonth || 0,
        plan: u.plan || "free",
        streakLevel: u.streakLevel || 0,
        accountType: u.accountType || "gamer",
      };
    });

    // Gagnant par genre (agrège les vidéos du mois par genre → meilleur joueur)
    const genreWinners: Record<string, any> = {};
    try {
      const vidSnap = await db.collection("videos")
        .orderBy("ggMonth", "desc")
        .limit(500)
        .get();
      const perGenre: Record<string, Record<string, { username: string; avatar: string; gg: number }>> = {};
      for (const vDoc of vidSnap.docs) {
        const v = vDoc.data();
        const g = v.genre;
        const uid = v.userId;
        const gg = v.ggMonth || 0;
        if (!g || !uid || gg <= 0 || v.banned || v.restricted) continue;
        perGenre[g] = perGenre[g] || {};
        if (!perGenre[g][uid]) perGenre[g][uid] = { username: v.username || "Player", avatar: v.avatar || "", gg: 0 };
        perGenre[g][uid].gg += gg;
      }
      for (const g of Object.keys(perGenre)) {
        const top = Object.entries(perGenre[g]).sort((a, b) => b[1].gg - a[1].gg)[0];
        if (top) genreWinners[g] = { uid: top[0], username: top[1].username, avatar: top[1].avatar, ggMonth: top[1].gg };
      }
    } catch (e) { logger.warn("wall genre aggregation failed", e as any); }

    await db.collection("hall_of_fame").doc(monthKey).set({
      month: monthKey,
      champion: podium[0] || null,
      podium,
      genres: genreWinners,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`assignMonthlyChampion: Wall of Legends saved for ${monthKey}`);

    // ── 9. RESET MENSUEL — remet ggMonth=0 partout SANS toucher aux GG (ggCount/ggReceived) ──
    const commitInChunks = async (
      snap: FirebaseFirestore.QuerySnapshot,
      field: string,
    ) => {
      let b = db.batch();
      let n = 0;
      for (const d of snap.docs) {
        if ((d.data()[field] || 0) === 0) continue;
        b.update(d.ref, { [field]: 0 });
        n++;
        if (n % 400 === 0) { await b.commit(); b = db.batch(); }
      }
      if (n % 400 !== 0) await b.commit();
      return n;
    };
    try {
      const usersToReset = await db.collection("users").where("ggMonth", ">", 0).get();
      const rU = await commitInChunks(usersToReset, "ggMonth");
      const vidsToReset = await db.collection("videos").where("ggMonth", ">", 0).get();
      const rV = await commitInChunks(vidsToReset, "ggMonth");
      logger.info(`assignMonthlyChampion: monthly reset done — ${rU} users, ${rV} videos → ggMonth=0`);
    } catch (e) { logger.error("monthly ggMonth reset failed", e as any); }

    logger.info(`assignMonthlyChampion: ${champUsername} is Champion of ${monthKey} — community notified`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE LEADER — Toutes les heures (met à jour isCurrentLeader)
// Trouve le 1er du ranking en cours et met isCurrentLeader=true
// ─────────────────────────────────────────────────────────────────────────────
export const updateCurrentLeader = onSchedule(
  { schedule: "*/15 * * * *", region: "us-central1", timeoutSeconds: 60 },
  async () => {
    // ⚠️ MÊMES exclusions que l'écran Rankings (sinon flip-flop du leader).
    // Les comptes creator/gameconic ne peuvent PAS être leader du classement.

    // On prend le top 20 par ggMonth (GG DU MOIS) car le #1 global peut être un compte exclu.
    const topSnap = await db.collection("users")
      .orderBy("ggMonth", "desc")
      .limit(20)
      .get();
    if (topSnap.empty) return;

    // Premier user ÉLIGIBLE (hors creator/gameconic) avec au moins 1 GG ce mois.
    const leaderDoc = topSnap.docs.find((d) => {
      const x = d.data();
      return !rankExcluded(x) && (x.ggMonth || 0) > 0;
    });

    const batch = db.batch();
    // Retire le badge à tous ceux qui l'ont mais ne sont pas le vrai leader éligible.
    const flaggedSnap = await db.collection("users").where("isCurrentLeader", "==", true).get();
    for (const d of flaggedSnap.docs) {
      if (!leaderDoc || d.id !== leaderDoc.id) batch.update(d.ref, { isCurrentLeader: false });
    }
    // Attribue au vrai leader s'il ne l'a pas déjà.
    if (leaderDoc && !flaggedSnap.docs.some((d) => d.id === leaderDoc.id)) {
      batch.update(leaderDoc.ref, { isCurrentLeader: true });
    }
    await batch.commit();

    // Synchronise system/leaderStatus (lu par l'app) pour éviter tout conflit d'écriture.
    if (leaderDoc) {
      await db.collection("system").doc("leaderStatus").set(
        { currentLeaderId: leaderDoc.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    logger.info(`updateCurrentLeader: leader = ${leaderDoc?.data().username || "aucun"}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED — decayStreakPoints (daily at 4h UTC)
//
// Pénalité d'inactivité sur les streak points :
//   - Jours 1-3 sans connexion : grâce (aucune perte)
//   - Jour 4+ : -500 pts/jour
//
// Un GOAT (15,000 pts) inactif 30 jours → NOOB.
// Force les gamers à rester actifs pour garder leur statut.
// ─────────────────────────────────────────────────────────────────────────────
export const decayStreakPoints = onSchedule(
  { schedule: "0 4 * * *", region: "us-central1", timeZone: "America/Toronto", timeoutSeconds: 120 },
  async () => {
    logger.info("decayStreakPoints: start");

    const now = new Date();
    // Grâce de 3 jours : on ne touche que les users dont lastSeen > 3 jours
    const graceCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const usersSnap = await db.collection("users")
      .where("lastSeen", "<", graceCutoff)
      .get();

    if (usersSnap.empty) {
      logger.info("decayStreakPoints: no inactive users found");
      return;
    }

    const DECAY_PER_DAY = 500;
    const batch = db.batch();
    let count = 0;

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const streakPts = data.streakPoints || 0;

      // Déjà à 0 → rien à faire
      if (streakPts <= 0) continue;

      // Calcule le nombre de jours d'absence au-delà de la grâce
      const lastSeen = data.lastSeen?.toDate ? data.lastSeen.toDate() : new Date(data.lastSeen);
      const daysSinceLogin = Math.floor((now.getTime() - lastSeen.getTime()) / (24 * 60 * 60 * 1000));
      const penaltyDays = Math.max(0, daysSinceLogin - 3);

      if (penaltyDays <= 0) continue;

      // On applique la pénalité d'un seul jour (la fonction tourne tous les jours)
      const newStreakPts = Math.max(0, streakPts - DECAY_PER_DAY);
      const newLevel = calcStreakLevel(newStreakPts);

      batch.update(userDoc.ref, {
        streakPoints: newStreakPts,
        streakLevel: newLevel,
      });
      count++;
    }

    if (count > 0) {
      await batch.commit();
    }
    logger.info(`decayStreakPoints: ${count} users penalized (-${DECAY_PER_DAY} pts each)`);
  }
);
/**
 * reshuffleFeedOrder — reassigns randomOrder to all videos every 6 hours.
 *
 * Why: randomOrder is set once at upload time. Without reshuffling, all users
 * always see videos in the same fixed sequence — not a real shuffle.
 * This function assigns a fresh random value to every video 4× per day,
 * so each user's feed feels genuinely different on every app open.
 *
 * Batch writes: Firestore batch limit = 500 ops. We process in chunks of 400
 * to stay safely under the limit and avoid partial failures.
 *
 * Performance: ~550 videos = 2 batches = fast (~200ms total write time).
 * At 10k+ videos, consider limiting to videos posted in the last 90 days.
 */
// SCHEDULED — dailyLeaderBonus (daily at 1h UTC)
// Awards GA Points to the current leader every day to reward holding the crown.
// Small but consistent — motivates players to maintain their lead all month.
export const dailyLeaderBonus = onSchedule(
  {
    schedule: "every day 01:00",
    timeZone: "America/Toronto",
    memory: "256MiB",
  },
  async () => {
    const DAILY_LEADER_POINTS = 10; // 10 pts/day = ~310 pts/month for champion
    logger.info("dailyLeaderBonus: start");
    try {
      // Find current leader
      const leaderSnap = await db
        .collection("users")
        .where("isCurrentLeader", "==", true)
        .limit(1)
        .get();

      if (leaderSnap.empty) {
        logger.info("dailyLeaderBonus: no current leader found");
        return;
      }

      const leaderDoc = leaderSnap.docs[0];
      const leader = leaderDoc.data();

      // Don't give bonus to excluded account types
        if (rankExcluded(leader)) {
        logger.info(`dailyLeaderBonus: ${leader.username} is ${leader.accountType} — skipped`);
        return;
      }

      // Award points
      await leaderDoc.ref.update({
        gaPoints: admin.firestore.FieldValue.increment(DAILY_LEADER_POINTS),
      });

      // Add to points history
      await db.collection("points_history").add({
        userId: leaderDoc.id,
        type: "leader_bonus",
        delta: DAILY_LEADER_POINTS,
        reason: "👑 Daily Crown Bonus — keep holding the top!",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Send notification
      await db.collection("notifications").add({
        userId: leaderDoc.id,
        type: "leader_bonus",
        fromUserId: "SYSTEM",
        fromUsername: "Gaming Actions",
        text: `👑 +${DAILY_LEADER_POINTS} GA Points — Crown Bonus! You're still #1. Keep dominating!`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`dailyLeaderBonus: ${leader.username} received ${DAILY_LEADER_POINTS} pts`);
    } catch (e) {
      logger.error("dailyLeaderBonus error:", e);
    }
  }
);

// SCHEDULED — checkExpiredSubscriptions (daily at 2h UTC)
// Detects Legendary subscriptions that have expired and downgrades users to free.
// This handles cases where RevenueCat webhook fails or is delayed.
export const checkExpiredSubscriptions = onSchedule(
  { schedule: "every day 02:00", timeZone: "America/Toronto", memory: "256MiB" },
  async () => {
    logger.info("checkExpiredSubscriptions: start");
    try {
      const now = admin.firestore.Timestamp.now();
      // Find active subscriptions whose period has ended
      const expiredSnap = await db.collection("subscriptions")
        .where("status", "==", "active")
        .where("currentPeriodEnd", "<=", now)
        .where("isTest", "==", false)
        .get();

      if (expiredSnap.empty) {
        logger.info("checkExpiredSubscriptions: none expired");
        return;
      }

      logger.info(`checkExpiredSubscriptions: ${expiredSnap.size} expired`);
      const batch = db.batch();

      for (const subDoc of expiredSnap.docs) {
        const sub = subDoc.data();
        // Mark subscription as expired
        batch.update(subDoc.ref, { status: "expired", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        // Downgrade user to free
        batch.update(db.collection("users").doc(sub.userId), { plan: "free" });
        // Notify user
        await db.collection("notifications").add({
          userId: sub.userId,
          type: "system",
          fromUserId: "SYSTEM",
          fromUsername: "Gaming Actions",
          text: "Your Legendary subscription has expired. Renew to keep your benefits! Some exclusive frames may be locked.",
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      logger.info(`checkExpiredSubscriptions: ${expiredSnap.size} users downgraded`);
    } catch (e) {
      logger.error("checkExpiredSubscriptions error:", e);
    }
  }
);

// SCHEDULED — notifLegendaryExpiringSoon (daily at 10h UTC)
// Sends push + in-app notification to Legendary users whose subscription expires in ≤ 3 days.
export const notifLegendaryExpiringSoon = onSchedule(
  { schedule: "every day 10:00", timeZone: "America/Toronto", memory: "256MiB" },
  async () => {
    logger.info("notifLegendaryExpiringSoon: start");
    try {
      const now = admin.firestore.Timestamp.now();
      const in3Days = admin.firestore.Timestamp.fromMillis(now.toMillis() + 3 * 24 * 60 * 60 * 1000);

      // Subscriptions still active but ending within the next 3 days
      const soonSnap = await db.collection("subscriptions")
        .where("status", "==", "active")
        .where("currentPeriodEnd", ">", now)
        .where("currentPeriodEnd", "<=", in3Days)
        .where("isTest", "==", false)
        .get();

      if (soonSnap.empty) {
        logger.info("notifLegendaryExpiringSoon: none expiring soon");
        return;
      }

      logger.info(`notifLegendaryExpiringSoon: ${soonSnap.size} expiring soon`);
      let sent = 0;

      for (const subDoc of soonSnap.docs) {
        const sub = subDoc.data();
        if (!sub.userId) continue;
        if (await isThrottled(sub.userId, "leg_expiring_soon")) continue;

        const userSnap = await db.collection("users").doc(sub.userId).get();
        if (!userSnap.exists) continue;
        const u = userSnap.data() as Record<string, any>;

        const endTs = sub.currentPeriodEnd as admin.firestore.Timestamp;
        const diffMs = endTs.toMillis() - now.toMillis();
        const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

        const messages = [
          { t: "⚠️ Legendary expiring soon!", b: `Your Legendary subscription expires in ${diffDays} day${diffDays > 1 ? 's' : ''}. Renew to keep your exclusive perks!` },
          { t: "👑 Your Legendary is ending soon", b: `Only ${diffDays} day${diffDays > 1 ? 's' : ''} left on your Legendary plan. Your frames and perks will be locked.` },
          { t: "🔥 Renew your Legendary!", b: `${diffDays} day${diffDays > 1 ? 's' : ''} left — renew now so you don't lose anything!` },
        ];
        const msg = messages[Math.floor(Math.random() * messages.length)];

        // Push notification
        if (u.fcmToken) {
          const ok = await sendPushNotif(u.fcmToken, msg.t, msg.b, { screen: "Settings" });
          if (ok) sent++;
        }

        // In-app notification
        await db.collection("notifications").add({
          userId: sub.userId,
          type: "system",
          fromUserId: "SYSTEM",
          fromUsername: "Gaming Actions",
          text: `${msg.t} — ${msg.b}`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await setThrottle(sub.userId, "leg_expiring_soon");
      }

      logger.info(`notifLegendaryExpiringSoon: ${sent} push sent`);
    } catch (e) {
      logger.error("notifLegendaryExpiringSoon error:", e);
    }
  }
);

export const reshuffleFeedOrder = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "America/Toronto",
    memory: "256MiB",
  },
  async () => {
    logger.info("reshuffleFeedOrder: start");

    const snap = await db.collection("videos")
      .where("contentType", "==", "clip")
      .get();

    if (snap.empty) {
      logger.info("reshuffleFeedOrder: no videos found");
      return;
    }

    const BATCH_SIZE = 400; // Stay under Firestore's 500-op batch limit
    let batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const videoDoc of snap.docs) {
      // timestamp-seeded unique value — same formula as UploadScreen.js
      // Using Date.now() as base prevents collisions between concurrent writes
      const newOrder = Date.now() + Math.floor(Math.random() * 100000);
      batch.update(videoDoc.ref, { randomOrder: newOrder });
      count++;

      if (count % BATCH_SIZE === 0) {
        await batch.commit();
        batchCount++;
        batch = db.batch(); // Start fresh batch
      }
    }

    // Commit any remaining writes
    if (count % BATCH_SIZE !== 0) {
      await batch.commit();
      batchCount++;
    }

    logger.info(`reshuffleFeedOrder: ${count} videos reshuffled in ${batchCount} batch(es)`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP — adminCleanup
// Réconciliation MANUELLE à la demande : recompte tous les ggCount des vidéos,
// les ggReceived des users, les commentsCount, et met à jour le leader.
// Appel : https://us-central1-gamingactions-app.cloudfunctions.net/adminCleanup?key=SECRET
// ─────────────────────────────────────────────────────────────────────────────
export const adminCleanup = onRequest(
  { region: "us-central1", timeoutSeconds: 540 },
  async (req, res) => {
    // Protection simple par clé (change SECRET pour ta propre valeur)
    const SECRET = process.env.ADMIN_SECRET ?? "ga_cleanup_2026";
    if (req.query.key !== SECRET) {
      res.status(403).send("Forbidden");
      return;
    }

    let ggFixed = 0, commentsFixed = 0, ggReceivedFixed = 0;

    // 1. Recompte ggCount + commentsCount de chaque vidéo
    const videosSnap = await db.collection("videos").get();
    const creatorTotals: Record<string, number> = {};

    for (const vDoc of videosSnap.docs) {
      const vData = vDoc.data();
      const updates: Record<string, number> = {};

      // GG réels
      const ggSnap = await db.collection("ggs").where("videoId", "==", vDoc.id).get();
      const realGG = ggSnap.size;
      if (realGG !== (vData.ggCount || 0)) {
        updates.ggCount = realGG;
        ggFixed++;
      }

      // Commentaires réels — synchronise les DEUX champs (commentsCount + commentCount)
      // car l'UI lit commentCount (sans s) alors que la reco écrivait commentsCount (avec s).
      const cSnap = await db.collection("comments").where("videoId", "==", vDoc.id).get();
      const realComments = cSnap.size;
      if (realComments !== (vData.commentsCount || 0) || realComments !== (vData.commentCount || 0)) {
        updates.commentsCount = realComments;
        updates.commentCount  = realComments;
        commentsFixed++;
      }

      if (Object.keys(updates).length > 0) {
        await vDoc.ref.update(updates);
      }

      // Cumul ggReceived par créateur
      if (vData.userId) {
        creatorTotals[vData.userId] = (creatorTotals[vData.userId] || 0) + realGG;
      }
    }

    // 2. Recompte ggReceived de chaque user
    const usersSnap = await db.collection("users").get();
    for (const uDoc of usersSnap.docs) {
      const realReceived = creatorTotals[uDoc.id] || 0;
      if (realReceived !== (uDoc.data().ggReceived || 0)) {
        await uDoc.ref.update({ ggReceived: realReceived });
        ggReceivedFixed++;
      }
    }

    // 3. Met à jour le leader (le 1er ÉLIGIBLE, hors creator/gameconic/admin)
    const topSnap = await db.collection("users").orderBy("ggMonth", "desc").limit(30).get();
    let leaderName = "none";
    const leaderDoc = topSnap.docs.find((d) => !rankExcluded(d.data()) && (d.data().ggMonth || 0) > 0);
    {
      const leaderId = leaderDoc?.id || null;
      const batch = db.batch();
      const oldLeaders = await db.collection("users").where("isCurrentLeader", "==", true).get();
      for (const d of oldLeaders.docs) {
        if (d.id !== leaderId) batch.update(d.ref, { isCurrentLeader: false });
      }
      if (leaderDoc) {
        batch.update(leaderDoc.ref, { isCurrentLeader: true });
        leaderName = leaderDoc.data().username || leaderId;
      }
      await batch.commit();
    }

    const result = {
      ok: true,
      ggCountFixed: ggFixed,
      commentsCountFixed: commentsFixed,
      ggReceivedFixed,
      newLeader: leaderName,
    };
    logger.info("adminCleanup done", result);
    res.status(200).json(result);
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// DATA MANAGEMENT — export/import jeux, genres et vidéos pour révision manuelle
// ═════════════════════════════════════════════════════════════════════════════
const CLEANUP_KEY = process.env.ADMIN_SECRET ?? "ga_cleanup_2026";

// Échappe une valeur pour CSV (guillemets, virgules, retours ligne)
function csvCell(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── EXPORT 1 : jeux + genres uniques utilisés dans les vidéos ─────────────────
// CSV: game, genre_actuel, nb_videos, genre_corrige (vide à remplir), nouveau_nom (vide)
export const exportGamesGenres = onRequest(
  { region: "us-central1", timeoutSeconds: 300 },
  async (req, res) => {
    if (req.query.key !== CLEANUP_KEY) { res.status(403).send("Forbidden"); return; }

    const videosSnap = await db.collection("videos").get();
    // Compte par (game|genre)
    const combos: Record<string, { game: string; genre: string; count: number }> = {};
    videosSnap.docs.forEach((d) => {
      const v = d.data();
      const game = v.game || "(vide)";
      const genre = v.genre || "(vide)";
      const key = `${game}|||${genre}`;
      if (!combos[key]) combos[key] = { game, genre, count: 0 };
      combos[key].count++;
    });

    const rows = Object.values(combos).sort((a, b) => b.count - a.count);
    let csv = "game,genre_actuel,nb_videos,genre_corrige,nouveau_nom_jeu\n";
    for (const r of rows) {
      csv += [csvCell(r.game), csvCell(r.genre), r.count, "", ""].join(",") + "\n";
    }

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="games_genres.csv"');
    res.status(200).send(csv);
  }
);

// ── EXPORT 2 : toutes les vidéos avec colonnes éditables ──────────────────────
// CSV: id, title, game, genre, console, contentType, username, ggCount,
//      commentsCount, createdAt, delete(vide), game_corrige(vide), genre_corrige(vide)
export const exportVideos = onRequest(
  { region: "us-central1", timeoutSeconds: 300 },
  async (req, res) => {
    if (req.query.key !== CLEANUP_KEY) { res.status(403).send("Forbidden"); return; }

    const videosSnap = await db.collection("videos").orderBy("createdAt", "desc").get();
    let csv = "id,title,game,genre,console,contentType,username,ggCount,commentsCount,createdAt,videoUrl,delete,game_corrige,genre_corrige\n";
    videosSnap.docs.forEach((d) => {
      const v = d.data();
      const created = v.createdAt?.toDate ? v.createdAt.toDate().toISOString() : "";
      csv += [
        csvCell(d.id),
        csvCell(v.title),
        csvCell(v.game),
        csvCell(v.genre),
        csvCell(v.console),
        csvCell(v.contentType),
        csvCell(v.username),
        v.ggCount || 0,
        v.commentsCount || 0,
        csvCell(created),
        csvCell(v.videoUrl),
        "",  // delete
        "",  // game_corrige
        "",  // genre_corrige
      ].join(",") + "\n";
    });

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="videos.csv"');
    res.status(200).send(csv);
  }
);

// ── IMPORT : applique les corrections depuis le CSV vidéos révisé ─────────────
// Reçoit le CSV en POST body (text/plain). Pour chaque ligne :
//   - si delete = "1"/"x"/"yes" → supprime la vidéo (+ ses ggs et comments)
//   - si game_corrige non vide → met à jour game
//   - si genre_corrige non vide → met à jour genre
// Réponse JSON avec le résumé.
export const importVideoUpdates = onRequest(
  { region: "us-central1", timeoutSeconds: 540 },
  async (req, res) => {
    if (req.query.key !== CLEANUP_KEY) { res.status(403).send("Forbidden"); return; }
    if (req.method !== "POST") { res.status(405).send("Use POST with CSV body"); return; }

    const csv = typeof req.body === "string" ? req.body : (req.rawBody?.toString("utf-8") || "");
    if (!csv) { res.status(400).json({ error: "Empty CSV body" }); return; }

    // Parse CSV simple (gère les guillemets)
    const parseLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else {
          if (c === '"') inQ = true;
          else if (c === ",") { out.push(cur); cur = ""; }
          else cur += c;
        }
      }
      out.push(cur);
      return out;
    };

    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) { res.status(400).json({ error: "No data rows" }); return; }

    const header = parseLine(lines[0]).map((h) => h.trim());
    const idx = (name: string) => header.indexOf(name);
    const iId = idx("id");
    const iDelete = idx("delete");
    const iGameCor = idx("game_corrige");
    const iGenreCor = idx("genre_corrige");

    if (iId === -1) { res.status(400).json({ error: "Missing 'id' column" }); return; }

    let deleted = 0, gameUpdated = 0, genreUpdated = 0, errors = 0;
    const DELETE_VALS = new Set(["1", "x", "X", "yes", "oui", "true", "delete"]);

    for (let i = 1; i < lines.length; i++) {
      try {
        const cells = parseLine(lines[i]);
        const id = (cells[iId] || "").trim();
        if (!id) continue;

        const delVal = iDelete >= 0 ? (cells[iDelete] || "").trim() : "";
        if (DELETE_VALS.has(delVal)) {
          // Supprime la vidéo + ses ggs + ses commentaires
          const ggSnap = await db.collection("ggs").where("videoId", "==", id).get();
          const cSnap = await db.collection("comments").where("videoId", "==", id).get();
          const batch = db.batch();
          ggSnap.docs.forEach((d) => batch.delete(d.ref));
          cSnap.docs.forEach((d) => batch.delete(d.ref));
          batch.delete(db.collection("videos").doc(id));
          await batch.commit();
          deleted++;
          continue; // pas besoin de mettre à jour une vidéo supprimée
        }

        const updates: Record<string, string> = {};
        if (iGameCor >= 0) {
          const g = (cells[iGameCor] || "").trim();
          if (g) { updates.game = g; gameUpdated++; }
        }
        if (iGenreCor >= 0) {
          const gn = (cells[iGenreCor] || "").trim();
          if (gn) { updates.genre = gn; genreUpdated++; }
        }
        if (Object.keys(updates).length > 0) {
          await db.collection("videos").doc(id).update(updates);
        }
      } catch (e) {
        errors++;
        logger.warn(`importVideoUpdates: erreur ligne ${i}`, e);
      }
    }

    const result = { ok: true, deleted, gameUpdated, genreUpdated, errors, totalRows: lines.length - 1 };
    logger.info("importVideoUpdates done", result);
    res.status(200).json(result);
  }
);

// ── EXPORT 3 : détecte les doublons potentiels pour aider la révision ─────────
// Groupe les vidéos par (videoUrl) ou (publicId) ou (title+userId) identiques.
// CSV: groupe, id, title, username, game, ggCount, createdAt, suggestion_delete
export const exportDuplicates = onRequest(
  { region: "us-central1", timeoutSeconds: 300 },
  async (req, res) => {
    if (req.query.key !== CLEANUP_KEY) { res.status(403).send("Forbidden"); return; }

    const videosSnap = await db.collection("videos").get();
    const all = videosSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // Groupe par publicId (même fichier Cloudinary = vrai doublon)
    const byKey: Record<string, any[]> = {};
    all.forEach((v) => {
      // Clé de doublon : publicId si présent, sinon videoUrl, sinon title+userId
      const key = v.publicId || v.videoUrl || `${v.title}__${v.userId}`;
      if (!key) return;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(v);
    });

    let csv = "groupe,id,title,username,game,genre,ggCount,createdAt,suggestion_delete\n";
    let groupNum = 0;
    for (const key of Object.keys(byKey)) {
      const group = byKey[key];
      if (group.length < 2) continue; // pas un doublon
      groupNum++;
      // Garde celui avec le + de GG, suggère delete pour les autres
      group.sort((a, b) => (b.ggCount || 0) - (a.ggCount || 0));
      group.forEach((v, i) => {
        const created = v.createdAt?.toDate ? v.createdAt.toDate().toISOString() : "";
        const suggestion = i === 0 ? "" : "1"; // garde le 1er (+ de GG), supprime le reste
        csv += [
          groupNum, csvCell(v.id), csvCell(v.title), csvCell(v.username),
          csvCell(v.game), csvCell(v.genre), v.ggCount || 0, csvCell(created), suggestion,
        ].join(",") + "\n";
      });
    }

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="duplicates.csv"');
    res.status(200).send(csv);
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// MUX VIDEO INTEGRATION
// Les clés Mux ne sont jamais dans l'app mobile — elles vivent ici, côté serveur.
// L'app appelle uploadMuxGetUrl pour obtenir une URL d'upload temporaire (1h),
// puis uploade directement depuis l'app vers Mux. Ensuite elle appelle
// muxWebhook quand Mux a fini le transcodage pour mettre à jour Firestore.
// ═════════════════════════════════════════════════════════════════════════════

const MUX_TOKEN_ID     = process.env.MUX_TOKEN_ID!;
const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET!;
const MUX_BASE_URL     = "https://api.mux.com";
const muxAuth          = Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString("base64");

// ── 1. L'app appelle cette fonction pour obtenir une URL d'upload Mux ─────
// Retourne { uploadUrl, uploadId } → l'app uploade la vidéo directement vers uploadUrl
// puis sauvegarde uploadId dans Firestore pour tracker le statut.
export const muxGetUploadUrl = onRequest(
  { region: "us-central1", timeoutSeconds: 30, cors: true },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("POST only"); return; }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    } catch {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    try {
      // Crée un Direct Upload Mux (valide 1 heure)
      const response = await fetch(`${MUX_BASE_URL}/video/v1/uploads`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${muxAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cors_origin: "*",
          new_asset_settings: {
            playback_policy: ["public"],
            // Génère automatiquement : HLS adaptatif, plusieurs qualités, thumbnail
            mp4_support: "capped-1080p", // Permet aussi un download MP4 si besoin
          },
          timeout: 3600, // URL valide 1 heure
        }),
      });

      const data: any = await response.json();
      if (!response.ok) {
        logger.error("muxGetUploadUrl error:", data);
        res.status(500).json({ error: data.error?.message || "Mux error" });
        return;
      }

      res.status(200).json({
        uploadUrl: data.data.url,
        uploadId:  data.data.id,
      });
    } catch (e: any) {
      logger.error("muxGetUploadUrl exception:", e);
      res.status(500).json({ error: e.message });
    }
  }
);

// ── 2. Webhook Mux → notifié quand la vidéo est prête ────────────────────
// Mux appelle cette URL quand le transcodage est terminé.
// Configure dans dashboard.mux.com → Settings → Webhooks
// URL : https://us-central1-gamingactions-app.cloudfunctions.net/muxWebhook
export const muxWebhook = onRequest(
  { region: "us-central1", timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("POST only"); return; }

    const event = req.body;
    const type   = event?.type;
    const data   = event?.data;

    // On s'intéresse aux événements asset.ready (transcodage terminé)
    if (type !== "video.asset.ready") {
      res.status(200).send("ignored");
      return;
    }

    const assetId    = data?.id;
    const uploadId   = data?.upload_id;
    const playbackId = data?.playback_ids?.[0]?.id;
    const duration   = data?.duration;

    if (!uploadId || !playbackId) {
      res.status(200).send("missing data");
      return;
    }

    try {
      // Trouve le document vidéo Firestore par muxUploadId
      const videoSnap = await db.collection("videos")
        .where("muxUploadId", "==", uploadId)
        .limit(1)
        .get();

      if (videoSnap.empty) {
        logger.warn(`muxWebhook: no video found for uploadId ${uploadId}`);
        res.status(200).send("not found");
        return;
      }

      const videoRef  = videoSnap.docs[0].ref;
      const videoData = videoSnap.docs[0].data();

      // Respecte le choix de l'utilisateur :
      //  1) cover custom uploadée (thumbnail non-Mux) → on n'y touche pas
      //  2) frame choisie (thumbnailTime) → thumbnail Mux à ce temps
      //  3) sinon → thumbnail Mux par défaut à 3 s
      const hasCustomCover = typeof videoData.thumbnail === "string"
        && videoData.thumbnail.length > 0
        && !videoData.thumbnail.includes("image.mux.com");
      const t = typeof videoData.thumbnailTime === "number" ? videoData.thumbnailTime : 3;

      const update: Record<string, any> = {
        muxAssetId:    assetId,
        muxPlaybackId: playbackId,
        duration:      Math.round(duration || 0),
        muxStatus:     "ready",
        videoUrl:      `https://stream.mux.com/${playbackId}.m3u8`, // HLS adaptatif
      };
      if (!hasCustomCover) {
        update.thumbnail = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${t}&width=400&height=225&fit_mode=crop`;
      }
      await videoRef.update(update);

      logger.info(`muxWebhook: video ${videoSnap.docs[0].id} ready — playbackId ${playbackId}`);
      res.status(200).send("ok");
    } catch (e: any) {
      logger.error("muxWebhook error:", e);
      res.status(500).send("error");
    }
  }
);

// ── 3. Migration : uploade les vidéos Cloudinary existantes vers Mux ─────
// Lance une fois pour migrer les 521 vidéos existantes.
// Fonctionnement : lit toutes les vidéos Cloudinary dans Firestore,
// pour chacune : télécharge depuis Cloudinary → uploade vers Mux → met à jour Firestore.
// Sécurisé par clé. Peut être relancé (skip les vidéos déjà migrées).
export const migrateCloudinaryToMux = onRequest(
  { region: "us-central1", timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    if (req.query.key !== (process.env.ADMIN_SECRET ?? "ga_cleanup_2026")) { res.status(403).send("Forbidden"); return; }

    // dry_run=true pour simuler sans modifier Firestore
    const dryRun = req.query.dry_run === "true";

    const videosSnap = await db.collection("videos").get();
    let migrated = 0, skipped = 0, failed = 0;
    const failures: string[] = [];

    for (const vDoc of videosSnap.docs) {
      const v = vDoc.data();

      // Skip si déjà migré vers Mux
      if (v.muxPlaybackId) { skipped++; continue; }
      // Skip si pas d'URL Cloudinary
      if (!v.videoUrl || !v.videoUrl.includes("cloudinary")) { skipped++; continue; }

      try {
        if (dryRun) { migrated++; continue; }

        // Étape 1 : créer un Direct Upload Mux
        const uploadResp = await fetch(`${MUX_BASE_URL}/video/v1/uploads`, {
          method: "POST",
          headers: { "Authorization": `Basic ${muxAuth}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            cors_origin: "*",
            new_asset_settings: {
              playback_policy: ["public"],
              mp4_support: "capped-1080p",
            },
          }),
        });
        const uploadData: any = await uploadResp.json();
        if (!uploadResp.ok) throw new Error(uploadData.error?.message || "Mux upload create failed");

        const muxUploadUrl = uploadData.data.url;
        const muxUploadId  = uploadData.data.id;

        // Étape 2 : télécharger la vidéo depuis Cloudinary
        // On reconstruit l'URL originale sans q_auto pour éviter une transformation
        const cleanUrl = v.videoUrl.replace("/upload/q_auto/", "/upload/");
        const videoResp = await fetch(cleanUrl);
        if (!videoResp.ok) throw new Error(`Cloudinary fetch failed: ${videoResp.status}`);
        const videoBuffer = Buffer.from(await videoResp.arrayBuffer());

        // Étape 3 : pusher la vidéo vers Mux
        const muxPutResp = await fetch(muxUploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: videoBuffer,
        });
        if (!muxPutResp.ok) throw new Error(`Mux PUT failed: ${muxPutResp.status}`);

        // Étape 4 : marquer le document Firestore (muxPlaybackId sera rempli par le webhook)
        await vDoc.ref.update({
          muxUploadId,
          muxStatus: "processing",
        });

        migrated++;
        logger.info(`migrateCloudinaryToMux: ${vDoc.id} → upload ${muxUploadId}`);

        // Pause de 200ms pour ne pas saturer l'API Mux
        await new Promise((r) => setTimeout(r, 200));
      } catch (e: any) {
        failed++;
        failures.push(`${vDoc.id}: ${e.message}`);
        logger.error(`migrateCloudinaryToMux: ${vDoc.id} failed`, e.message);
      }
    }

    res.status(200).json({
      ok: true, dryRun, migrated, skipped, failed,
      total: videosSnap.size, failures: failures.slice(0, 10),
      note: dryRun
        ? "Dry run — aucune modification. Relance sans dry_run=true pour migrer."
        : "Migration lancée. Le webhook Mux remplira muxPlaybackId pour chaque vidéo transcodée (quelques minutes par vidéo).",
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 5 — Ton rang dans le classement (lundi et jeudi à 17h UTC)
// Cible : tous les users avec un token, message personnalisé avec leur rang
// ─────────────────────────────────────────────────────────────────────────────
export const notifYourRank = onSchedule(
  { schedule: "0 17 * * 1,4", region: "us-central1", timeZone: "America/Toronto", timeoutSeconds: 300 },
  async () => {
    logger.info("notifYourRank: start");

    // Récupère tous les users triés par ggMonth
    const usersSnap = await db.collection("users")
      .orderBy("ggMonth", "desc")
      .limit(500)
      .get();

    const ranked = usersSnap.docs
      .filter((d) => !rankExcluded(d.data()))
      .map((d, i) => ({
        id: d.id,
        rank: i + 1,
        ...(d.data() as Record<string, any>),
      })) as Array<{ id: string; rank: number; fcmToken: string; ggMonth: number; username: string; [key: string]: any }>;

    let sent = 0;
    for (let i = 0; i < ranked.length; i++) {
      const user = ranked[i];
      if (!user.fcmToken) continue;
      if (await isThrottled(user.id, "your_rank")) continue;

      const rank = user.rank;
      const gg   = user.ggMonth || 0;
      let title = "🏆 Your ranking";
      let body  = "";

      if (rank === 1) {
        const r1msgs = [
          `👑 You're #1 with ${gg} GGs! Defend your throne this week!`,
          `🔥 Still #1! ${gg} GGs and counting — nobody can touch you yet!`,
          `⚡ Leader status confirmed! ${gg} GGs. Stay sharp, challengers are coming!`,
        ];
        body = r1msgs[Math.floor(Math.random() * r1msgs.length)];
      } else {
        const above = ranked[i - 1];
        const gap   = (above.ggMonth || 0) - gg;
        if (gap <= 3) {
          const closemsgs = [
            `🔥 You're #${rank} — only ${gap} GG${gap > 1 ? "s" : ""} from #${rank - 1}! Push now!`,
            `⚡ SO CLOSE! ${gap} GG${gap > 1 ? "s" : ""} and you pass ${above.username}!`,
            `💥 Almost there! ${gap} GG${gap > 1 ? "s" : ""} to grab #${rank - 1}!`,
          ];
          body = closemsgs[Math.floor(Math.random() * closemsgs.length)];
        } else {
          const farmsgs = [
            `📊 You're #${rank} with ${gg} GGs. Keep posting to climb higher!`,
            `🎮 Rank #${rank} — drop more clips and earn those GGs!`,
            `🏆 #${rank} this week. ${gg} GGs in the bag — more to come!`,
          ];
          body = farmsgs[Math.floor(Math.random() * farmsgs.length)];
        }
      }

      const ok = await sendPushNotif(user.fcmToken, title, body, { screen: "Rankings" });
      if (ok) { await setThrottle(user.id, "your_rank"); sent++; }
    }
    logger.info(`notifYourRank: sent ${sent}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER — onVideoCreated
// Push aux followers quand un user qu'ils suivent uploade un nouveau clip
// ─────────────────────────────────────────────────────────────────────────────
export const onVideoCreated = onDocumentWritten(
  "videos/{videoId}",
  async (event) => {
    const after  = event.data?.after?.data();
    const before = event.data?.before?.data();
    // Seulement sur création (pas update)
    if (!after || before) return;

    const creatorId = after.userId;
    const title     = after.title || "New clip";
    if (!creatorId) return;

    try {
      // Récupère le nom du créateur
      const creatorSnap = await db.collection("users").doc(creatorId).get();
      const creatorName = creatorSnap.data()?.username || "Someone";

      // Récupère tous les followers du créateur
      const followersSnap = await db.collection("follows")
        .where("followingId", "==", creatorId)
        .get();

      let sent = 0;
      for (const followDoc of followersSnap.docs) {
        const followerId = followDoc.data().followerId;
        if (!followerId || followerId === creatorId) continue;

        const followerSnap = await db.collection("users").doc(followerId).get();
        const token = followerSnap.data()?.fcmToken;
        if (!token) continue;
        if (await isThrottled(followerId, `new_clip_${creatorId}`)) continue;

        const ok = await sendPushNotif(
          token,
          `🎮 ${creatorName} just posted!`,
          `"${title}" — Come watch and give a GG!`,
          { screen: "Feed", videoId: event.params.videoId }
        );
        if (ok) {
          await setThrottle(followerId, `new_clip_${creatorId}`);
          sent++;
        }
      }
      logger.info(`onVideoCreated: ${creatorName} → ${sent} followers notified`);
    } catch (e) { logger.warn("onVideoCreated push failed:", e); }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER — onMentionCreated (mention dans un commentaire)
// Push à la personne mentionnée via @username
// ─────────────────────────────────────────────────────────────────────────────
export const onMentionNotif = onDocumentWritten(
  "notifications/{notifId}",
  async (event) => {
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    if (!after || before) return; // création seulement
    // Types gérés : mention, comment_like, system
    if (!["mention", "comment_like"].includes(after.type)) return;

    const { userId, fromUsername, text, videoId, type } = after;
    if (!userId) return;

    try {
      const userSnap = await db.collection("users").doc(userId).get();
      const token = userSnap.data()?.fcmToken;
      if (!token) return;

      let title = "";
      let body  = text || "";

      if (type === "mention") {
        title = `👋 ${fromUsername || "Someone"} mentioned you`;
      } else if (type === "comment_like") {
        title = `❤️ ${fromUsername || "Someone"} liked your comment`;
        body  = text || "Check it out!";
      }

      if (title) {
        await sendPushNotif(token, title, body, { screen: "Feed", videoId });
      }
    } catch (e) { logger.warn("onMentionNotif push failed:", e); }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP — broadcastPush
// Envoie un push à TOUS les users avec un fcmToken.
// Appelé depuis l'app admin après avoir créé les notifs Firestore.
// POST body: { title: string, body: string, screen?: string }
// Protégé par la même clé que adminCleanup.
// ─────────────────────────────────────────────────────────────────────────────
export const broadcastPush = onRequest(
  { region: "us-central1", timeoutSeconds: 300, cors: true },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
    // Auth : soit clé admin (?key=), soit token Firebase d'un utilisateur isAdmin
    const keyOk = req.query.key === (process.env.ADMIN_SECRET ?? "ga_cleanup_2026");
    if (!keyOk) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
      try {
        const decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
        const uDoc = await db.collection("users").doc(decoded.uid).get();
        if (!uDoc.exists || uDoc.data()?.isAdmin !== true) { res.status(403).json({ error: "Not admin" }); return; }
      } catch { res.status(401).json({ error: "Invalid token" }); return; }
    }

    const { title, body, screen } = req.body || {};
    if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }

    const usersSnap = await db.collection("users")
      .where("fcmToken", "!=", "")
      .get();

    let sent = 0, failed = 0;
    // Send in batches of 100 (Expo Push limit)
    const docs = usersSnap.docs;
    for (let i = 0; i < docs.length; i += 100) {
      const batch = docs.slice(i, i + 100);
      await Promise.all(batch.map(async (d) => {
        const token = d.data().fcmToken;
        if (!token) return;
        const ok = await sendPushNotif(token, title, body, { screen: screen || "Feed" });
        if (ok) sent++; else failed++;
      }));
    }

    logger.info(`broadcastPush: sent=${sent} failed=${failed} title="${title}"`);
    res.status(200).json({ ok: true, sent, failed, total: docs.length });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST — envoie immédiatement une notif de classement à un user donné.
// Sert à valider toute la chaîne (token + push + calcul de rang) sans attendre
// les crons ni le throttle. Protégé par ADMIN_SECRET.
//   GET/POST  ?key=ga_cleanup_2026&uid=<UID>
// ─────────────────────────────────────────────────────────────────────────────
export const testMyRankNotif = onRequest(
  { region: "us-central1", timeoutSeconds: 60, cors: true },
  async (req, res) => {
    if ((req.query.key as string) !== (process.env.ADMIN_SECRET ?? "ga_cleanup_2026")) {
      res.status(403).send("Forbidden"); return;
    }
    const uid = (req.query.uid as string) || (req.body && req.body.uid);
    if (!uid) { res.status(400).json({ error: "uid required" }); return; }

    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) { res.status(404).json({ error: "user not found" }); return; }
    const u = userSnap.data() as Record<string, any>;
    const token = u.fcmToken;
    const excluded = rankExcluded(u);

    // Calcule le rang parmi les comptes NON exclus
    const topSnap = await db.collection("users").orderBy("ggMonth", "desc").limit(200).get();
    let rank = 0, pos = 0;
    for (const d of topSnap.docs) {
      if (rankExcluded(d.data())) continue;
      pos++;
      if (d.id === uid) { rank = pos; break; }
    }

    // Envoi direct + lecture du REÇU (le ticket "ok" ne garantit PAS la livraison)
    let ticketStatus = "no_token", ticketId = "", ticketError = "";
    let receiptStatus = "", receiptError = "", receiptDetails = "";
    if (token && Expo.isExpoPushToken(token)) {
      try {
        const tickets = await expo.sendPushNotificationsAsync([{
          to: token, sound: "default", title: "🏆 Test ranking notification",
          body: rank ? `You're currently #${rank} with ${u.ggMonth || 0} GGs!` : "Test push from Gaming Actions.",
          data: { screen: "Rankings" }, priority: "high", channelId: "gaming_actions",
        }]);
        const t = tickets[0] as any;
        ticketStatus = t.status;
        if (t.status === "ok") { ticketId = t.id; }
        else { ticketError = t.message || JSON.stringify(t.details || {}); }
      } catch (e: any) { ticketStatus = "exception"; ticketError = String(e?.message || e); }

      // Lecture du reçu (donne la vraie erreur APNs : DeviceNotRegistered, etc.)
      if (ticketId) {
        await new Promise(r => setTimeout(r, 4000));
        try {
          const receipts = await expo.getPushNotificationReceiptsAsync([ticketId]) as any;
          const rec = receipts[ticketId];
          if (rec) {
            receiptStatus = rec.status;
            if (rec.status === "error") {
              receiptError = rec.message || "";
              receiptDetails = JSON.stringify(rec.details || {});
            }
          } else { receiptStatus = "not_ready"; }
        } catch (e: any) { receiptStatus = "exception"; receiptError = String(e?.message || e); }
      }
    } else if (token) {
      ticketStatus = "invalid_token_format";
    }

    let diagnostic: string;
    if (!token) diagnostic = "Aucun fcmToken → impossible de recevoir un push. Rouvre l'app sur appareil physique + accepte les notifs.";
    else if (ticketStatus !== "ok") diagnostic = `Expo a rejeté l'envoi (ticket=${ticketStatus}): ${ticketError}`;
    else if (receiptStatus === "error") {
      if (receiptError.includes("DeviceNotRegistered")) diagnostic = "Token périmé/désinscrit → rouvre l'app pour en régénérer un.";
      else if (receiptDetails.includes("MismatchSenderId") || receiptError.toLowerCase().includes("credential") || receiptError.toLowerCase().includes("apns")) diagnostic = "Problème de credentials push (APNs iOS / FCM). À corriger côté EAS/Expo — voir receiptDetails.";
      else diagnostic = `Apple/Google a rejeté la livraison: ${receiptError} ${receiptDetails}`;
    }
    else if (receiptStatus === "ok") diagnostic = "Livraison confirmée par Expo+Apple. Si tu ne vois rien : notifs désactivées pour l'app dans Réglages iOS, ou app au premier plan.";
    else diagnostic = `Ticket OK mais reçu pas encore prêt (${receiptStatus}). Relance dans 10 s.`;

    res.status(200).json({
      uid,
      hasToken: !!token,
      tokenPreview: token ? String(token).slice(0, 24) + "…" : null,
      isAdmin: !!u.isAdmin,
      accountType: u.accountType || "(none)",
      excludedFromRanking: excluded,
      rank: rank || null,
      ggMonth: u.ggMonth || 0,
      ticketStatus, ticketError: ticketError || null,
      receiptStatus: receiptStatus || null, receiptError: receiptError || null, receiptDetails: receiptDetails || null,
      diagnostic,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FIX COUNTS — recompte gg + commentaires de toutes les vidéos et corrige les
// DEUX champs (commentCount + commentsCount). À la demande, protégé par clé.
//   GET  ?key=ga_cleanup_2026
// ─────────────────────────────────────────────────────────────────────────────
export const fixCounts = onRequest(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    if ((req.query.key as string) !== (process.env.ADMIN_SECRET ?? "ga_cleanup_2026")) {
      res.status(403).send("Forbidden"); return;
    }
    const videosSnap = await db.collection("videos").get();
    let ggFixed = 0, commentsFixed = 0, scanned = 0;
    for (const vDoc of videosSnap.docs) {
      const vData = vDoc.data(); scanned++;
      const updates: Record<string, number> = {};
      const ggSnap = await db.collection("ggs").where("videoId", "==", vDoc.id).get();
      const realGG = ggSnap.size;
      if (realGG !== (vData.ggCount || 0)) { updates.ggCount = realGG; ggFixed++; }
      const cSnap = await db.collection("comments").where("videoId", "==", vDoc.id).get();
      const realC = cSnap.size;
      if (realC !== (vData.commentsCount || 0) || realC !== (vData.commentCount || 0)) {
        updates.commentsCount = realC; updates.commentCount = realC; commentsFixed++;
      }
      if (Object.keys(updates).length > 0) await vDoc.ref.update(updates);
    }
    logger.info(`fixCounts: scanned=${scanned} ggFixed=${ggFixed} commentsFixed=${commentsFixed}`);
    res.status(200).json({ scanned, ggFixed, commentsFixed });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION MENSUELLE — à lancer UNE fois au démarrage du système mensuel.
// Tous les GG existants = JUIN. On CLÔTURE juin proprement puis on ouvre juillet :
//   1. Date tous les GG existants comme JUIN 2026 (backfill createdAt manquant)
//   2. Reconstruit le classement de JUIN depuis les totaux all-time (ggReceived/ggCount)
//   3. Grave le WALL de juin (hall_of_fame/2026-06) : champion + top 3 + gagnants par genre
//   4. Couronne le champion de juin (frame champion, badge, +500 GA, +500 Streak)
//   5. Remet ggMonth=0 partout (juillet démarre à zéro) + efface le faux #1
//   GET  ?key=ga_cleanup_2026
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// FIX JUNE CHAMPION — retire N GG à un user (proprement) puis re-couronne juin
// SANS toucher au mois en cours. Défaut : retire 2 GG à AM_YO_NIGHTMARE.
//   GET  ?key=ga_cleanup_2026[&uid=...&count=2]
// ─────────────────────────────────────────────────────────────────────────────
export const fixJuneChampion = onRequest(
  { region: "us-central1", timeoutSeconds: 300, memory: "512MiB" },
  async (req, res) => {
    if ((req.query.key as string) !== (process.env.ADMIN_SECRET ?? "ga_cleanup_2026")) {
      res.status(403).send("Forbidden"); return;
    }
    const MONTH_KEY = "2026-06";
    const uid = (req.query.uid as string) || "UWMiwXnrIES0Uj1KJxCynYwmkI12";
    const count = parseInt((req.query.count as string) || "2", 10);

    // 1. Supprime `count` GG reçus par ce user (sur ses vidéos)
    const myVids = await db.collection("videos").where("userId", "==", uid).get();
    let removed = 0;
    for (const vDoc of myVids.docs) {
      if (removed >= count) break;
      const ggSnap = await db.collection("ggs").where("videoId", "==", vDoc.id).limit(count - removed).get();
      for (const g of ggSnap.docs) {
        if (removed >= count) break;
        await g.ref.delete();
        removed++;
      }
    }

    // 2. Recompte proprement ses vidéos (ggCount) + son total (ggReceived)
    let totalRec = 0;
    const rb = db.batch();
    for (const vDoc of myVids.docs) {
      const ggc = (await db.collection("ggs").where("videoId", "==", vDoc.id).get()).size;
      if ((vDoc.data().ggCount || 0) !== ggc) rb.update(vDoc.ref, { ggCount: ggc });
      totalRec += ggc;
    }
    await rb.commit();
    await db.collection("users").doc(uid).update({ ggReceived: totalRec });

    // 3. Recalcule le podium de juin depuis ggReceived (données de juin, à jour)
    const topSnap = await db.collection("users").orderBy("ggReceived", "desc").limit(30).get();
    const eligibleTop = topSnap.docs.filter((d) => !rankExcluded(d.data()) && (d.data().ggReceived || 0) > 0);
    const podium = eligibleTop.slice(0, 3).map((d, i) => {
      const u = d.data();
      return {
        rank: i + 1, uid: d.id, username: u.username || "Player", avatar: u.avatar || "",
        ggMonth: u.ggReceived || 0, plan: u.plan || "free", streakLevel: u.streakLevel || 0,
        accountType: u.accountType || "gamer",
      };
    });

    // 4. Réécrit champion/podium du Wall de juin (garde les genres existants)
    const existing = (await db.collection("hall_of_fame").doc(MONTH_KEY).get()).data() || {};
    await db.collection("hall_of_fame").doc(MONTH_KEY).set({
      ...existing, month: MONTH_KEY, champion: podium[0] || null, podium,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 5. Bascule la couronne : retire "champion" aux autres, donne au vrai #1 de juin
    let championName = "none";
    if (eligibleTop[0]) {
      const champDoc = eligibleTop[0];
      const champData = champDoc.data();
      championName = champData.username || "Player";
      const oldChampSnap = await db.collection("users").where("isChampion", "==", true).get();
      const cb = db.batch();
      for (const oldDoc of oldChampSnap.docs) {
        if (oldDoc.id === champDoc.id) continue;
        const od = oldDoc.data();
        cb.update(oldDoc.ref, {
          isChampion: false,
          ownedFrames: (od.ownedFrames || []).filter((f: string) => f !== "champion"),
          ownedVideoFrames: (od.ownedVideoFrames || []).filter((f: string) => f !== "vf_champion"),
          ...(od.equippedFrame === "champion" ? { equippedFrame: "none" } : {}),
        });
      }
      await cb.commit();
      await champDoc.ref.update({
        isChampion: true, championMonth: MONTH_KEY,
        ownedFrames: [...new Set([...(champData.ownedFrames || []), "champion"])],
        ownedVideoFrames: [...new Set([...(champData.ownedVideoFrames || []), "vf_champion"])],
        equippedFrame: "champion",
      });
    }

    logger.info(`fixJuneChampion: removed=${removed} uid=${uid} newGGReceived=${totalRec} champion=${championName}`);
    res.status(200).json({ removed, uid, newGGReceived: totalRec, champion: championName, podium });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// (migration mensuelle initiale)
// ─────────────────────────────────────────────────────────────────────────────
export const migrateGGMonthly = onRequest(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    if ((req.query.key as string) !== (process.env.ADMIN_SECRET ?? "ga_cleanup_2026")) {
      res.status(403).send("Forbidden"); return;
    }
    const MONTH_KEY = "2026-06";
    const juneDate = admin.firestore.Timestamp.fromDate(new Date("2026-06-15T12:00:00-04:00"));
    const flush = async (docs: FirebaseFirestore.QueryDocumentSnapshot[], fn: (b: FirebaseFirestore.WriteBatch, d: FirebaseFirestore.QueryDocumentSnapshot) => boolean) => {
      let b = db.batch(); let n = 0; let total = 0;
      for (const d of docs) {
        if (!fn(b, d)) continue;
        n++; total++;
        if (n >= 400) { await b.commit(); b = db.batch(); n = 0; }
      }
      if (n > 0) await b.commit();
      return total;
    };

    // 1. GG → createdAt juin si manquant
    const ggsSnap = await db.collection("ggs").get();
    const ggDated = await flush(ggsSnap.docs, (b, d) => {
      if (d.data().createdAt) return false;
      b.update(d.ref, { createdAt: juneDate }); return true;
    });

    // 2+3. WALL DE JUIN — top 3 global (par ggReceived all-time = données de juin)
    const topSnap = await db.collection("users").orderBy("ggReceived", "desc").limit(30).get();
    const eligibleTop = topSnap.docs.filter((d) => !rankExcluded(d.data()) && (d.data().ggReceived || 0) > 0);
    const podium = eligibleTop.slice(0, 3).map((d, i) => {
      const u = d.data();
      return {
        rank: i + 1, uid: d.id, username: u.username || "Player", avatar: u.avatar || "",
        ggMonth: u.ggReceived || 0, plan: u.plan || "free", streakLevel: u.streakLevel || 0,
        accountType: u.accountType || "gamer",
      };
    });
    // Gagnants par genre (agrège videos.ggCount all-time par genre)
    const genreWinners: Record<string, any> = {};
    const vidsSnap = await db.collection("videos").get();
    const perGenre: Record<string, Record<string, { username: string; avatar: string; gg: number }>> = {};
    for (const vDoc of vidsSnap.docs) {
      const v = vDoc.data();
      const g = v.genre; const uid = v.userId; const gg = v.ggCount || 0;
      if (!g || !uid || gg <= 0 || v.banned || v.restricted) continue;
      perGenre[g] = perGenre[g] || {};
      if (!perGenre[g][uid]) perGenre[g][uid] = { username: v.username || "Player", avatar: v.avatar || "", gg: 0 };
      perGenre[g][uid].gg += gg;
    }
    for (const g of Object.keys(perGenre)) {
      const top = Object.entries(perGenre[g]).sort((a, b) => b[1].gg - a[1].gg)[0];
      if (top) genreWinners[g] = { uid: top[0], username: top[1].username, avatar: top[1].avatar, ggMonth: top[1].gg };
    }
    await db.collection("hall_of_fame").doc(MONTH_KEY).set({
      month: MONTH_KEY,
      champion: podium[0] || null,
      podium,
      genres: genreWinners,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 4. Couronne le champion de juin
    let championName = "none";
    if (eligibleTop[0]) {
      const champRef = eligibleTop[0].ref;
      const champData = eligibleTop[0].data();
      championName = champData.username || "Player";
      // retire la frame champion aux anciens champions différents
      const oldChampSnap = await db.collection("users").where("isChampion", "==", true).get();
      const cb = db.batch();
      for (const oldDoc of oldChampSnap.docs) {
        if (oldDoc.id === champRef.id) continue;
        const od = oldDoc.data();
        cb.update(oldDoc.ref, {
          isChampion: false,
          ownedFrames: (od.ownedFrames || []).filter((f: string) => f !== "champion"),
          ownedVideoFrames: (od.ownedVideoFrames || []).filter((f: string) => f !== "vf_champion"),
          ...(od.equippedFrame === "champion" ? { equippedFrame: "none" } : {}),
        });
      }
      await cb.commit();
      const champStreakPoints = (champData.streakPoints || 0) + 500;
      await champRef.update({
        isChampion: true,
        championMonth: MONTH_KEY,
        ownedFrames: [...new Set([...(champData.ownedFrames || []), "champion"])],
        ownedVideoFrames: [...new Set([...(champData.ownedVideoFrames || []), "vf_champion"])],
        equippedFrame: "champion",
        gaPoints: (champData.gaPoints || 0) + 500,
        streakPoints: champStreakPoints,
        streakLevel: calcStreakLevel(champStreakPoints),
      });
      await db.collection("notifications").add({
        userId: champRef.id, type: "system", fromUserId: "SYSTEM", fromUsername: "Gaming Actions",
        text: `🏆 Congratulations ${championName}! You are the Champion of June ${MONTH_KEY}! 👑⚡ +500 GA Points!`,
        read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 5. RESET JUILLET — ggMonth=0 partout + efface le faux #1
    const usersSnap = await db.collection("users").get();
    const usersReset = await flush(usersSnap.docs, (b, d) => {
      const u = d.data();
      const patch: Record<string, any> = {};
      if ((u.ggMonth || 0) !== 0 || u.ggMonth === undefined) patch.ggMonth = 0;
      if (u.isCurrentLeader) patch.isCurrentLeader = false;
      if (Object.keys(patch).length === 0) return false;
      b.update(d.ref, patch); return true;
    });
    const vidsReset = await flush(vidsSnap.docs, (b, d) => {
      if (d.data().ggMonth === 0) return false;
      b.update(d.ref, { ggMonth: 0 }); return true;
    });
    await db.collection("system").doc("leaderStatus").set(
      { currentLeaderId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true },
    );

    logger.info(`migrateGGMonthly: ggDated=${ggDated} champion=${championName} podium=${podium.length} genres=${Object.keys(genreWinners).length} usersReset=${usersReset} vidsReset=${vidsReset}`);
    res.status(200).json({ ggDated, champion: championName, podium, genres: genreWinners, usersReset, vidsReset });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUPE — envoie la notif de classement personnalisée à TOUS les users
// (pour tester avec plusieurs testeurs en même temps). Ignore le throttle.
//   GET  ?key=ga_cleanup_2026
// ─────────────────────────────────────────────────────────────────────────────
export const triggerRankNotifAll = onRequest(
  { region: "us-central1", timeoutSeconds: 300, cors: true },
  async (req, res) => {
    if ((req.query.key as string) !== (process.env.ADMIN_SECRET ?? "ga_cleanup_2026")) {
      res.status(403).send("Forbidden"); return;
    }
    const snap = await db.collection("users").orderBy("ggMonth", "desc").limit(500).get();
    const ranked: Array<{ id: string; rank: number; fcmToken: string; gg: number }> = [];
    let pos = 0;
    for (const d of snap.docs) {
      const data = d.data() as any;
      if (rankExcluded(data)) continue;
      pos++;
      ranked.push({ id: d.id, rank: pos, fcmToken: data.fcmToken || "", gg: data.ggMonth || 0 });
    }
    let sent = 0, noToken = 0, failed = 0;
    for (const u of ranked) {
      if (!u.fcmToken) { noToken++; continue; }
      const ok = await sendPushNotif(
        u.fcmToken,
        "🏆 Your ranking",
        u.rank === 1 ? `👑 You're #1 with ${u.gg} GGs! Defend your throne!` : `You're #${u.rank} with ${u.gg} GGs. Keep climbing! 🔥`,
        { screen: "Rankings" }
      );
      if (ok) sent++; else failed++;
    }
    logger.info(`triggerRankNotifAll: sent=${sent} noToken=${noToken} failed=${failed}`);
    res.status(200).json({ totalRanked: ranked.length, sent, noToken, failed });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// RANKING CHANGE NOTIFICATIONS — Toutes les 15 minutes
//
// Détecte les mouvements dans le top 10 et envoie des notifs personnalisées :
//   - Entrée dans le top 10 → notif immédiate
//   - Montée de rang → "Tu passes de #X à #Y !"
//   - Descente de rang → "Quelqu'un te rattrape!"
//   - Chute hors top 10 → "Tu es sorti du top 10 !"
//   - Rang 11-20 proches du top 10 → push quotidien de motivation
//
// Derniers 3 jours du mois :
//   - Notif countdown quotidienne avec classement en temps réel au top 20
//
// Dernières 3 heures du mois :
//   - Notif urgente toutes les 15 min au top 15 avec position + écart
//
// État stocké dans system/rankingState (top10 précédent)
// Throttle court : 30-120 min selon le type (évite le flood sur positions stables)
// ─────────────────────────────────────────────────────────────────────────────

const RANKING_EXCLUDED = ["creator", "gameconic"];

// Composants date/heure ACTUELS en heure du Canada (America/Toronto — gère l'heure d'été).
function torontoParts() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
  const hour = +p.hour === 24 ? 0 : +p.hour;
  return { year: +p.year, month: +p.month, day: +p.day, hour, minute: +p.minute };
}
// Minutes restantes avant la fin du mois, en heure du Canada.
function minutesLeftInMonthTZ(): number {
  const { year, month, day, hour, minute } = torontoParts();
  const lastDay = new Date(year, month, 0).getDate(); // mois 1-12 → dernier jour du mois courant
  return ((lastDay - day) * 24 * 60) + ((24 * 60) - (hour * 60 + minute));
}
/** true si on est dans les N derniers jours du mois (heure Canada) */
function isLastNDaysOfMonth(n: number): boolean {
  const { year, month, day } = torontoParts();
  const lastDay = new Date(year, month, 0).getDate();
  return day >= lastDay - n + 1;
}
/** true si on est dans les N dernières heures du mois (heure Canada) */
function isLastNHoursOfMonth(n: number): boolean {
  return minutesLeftInMonthTZ() <= n * 60;
}

/** Throttle court (minutes) — indépendant du throttle hebdo */
async function isThrottledMin(userId: string, type: string, minutes: number): Promise<boolean> {
  const key = `${userId}_${type}`;
  const snap = await db.collection("notifThrottle").doc(key).get();
  if (!snap.exists) return false;
  const sentAt = snap.data()?.sentAt?.toMillis?.() || 0;
  return Date.now() - sentAt < minutes * 60 * 1000;
}

export const notifRankingChanges = onSchedule(
  { schedule: "*/15 * * * *", region: "us-central1", timeoutSeconds: 300, memory: "256MiB" },
  async () => {
    const isLastDays  = isLastNDaysOfMonth(3);
    const isLastHours = isLastNHoursOfMonth(3);

    // ── Charge le top 50 et filtre les comptes exclus ──────────────────────
    const topSnap = await db.collection("users")
      .orderBy("ggMonth", "desc")
      .limit(60)
      .get();

    type RankedUser = {
      id: string; rank: number; ggMonth: number;
      username: string; fcmToken: string; accountType: string;
    };
    const ranked: RankedUser[] = [];
    let rankPos = 1;
    for (const d of topSnap.docs) {
      const data = d.data() as Record<string, any>;
      if (rankExcluded(data)) continue;
      ranked.push({
        id: d.id, rank: rankPos++,
        ggMonth: data.ggMonth || 0,
        username: data.username || "",
        fcmToken: data.fcmToken || "",
        accountType: data.accountType || "",
      });
      if (ranked.length >= 25) break;
    }

    const currentTop10 = ranked.slice(0, 10);

    // ── État précédent ─────────────────────────────────────────────────────
    const stateRef = db.collection("system").doc("rankingState");
    const stateSnap = await stateRef.get();
    const prevTop10: Array<{ id: string; rank: number; ggMonth: number }> =
      stateSnap.exists ? (stateSnap.data()?.top10 || []) : [];

    // ── Détection des changements : utilisateurs DANS le top 10 ─────────────
    for (const user of currentTop10) {
      if (!user.fcmToken) continue;
      const prev = prevTop10.find(p => p.id === user.id);

      if (!prev) {
        // Nouvelle entrée dans le top 10
        if (await isThrottledMin(user.id, "rank_enter10", 60)) continue;
        const above = ranked[user.rank - 2];
        const gapAbove = above ? above.ggMonth - user.ggMonth : 0;
        await sendPushNotif(
          user.fcmToken,
          "🔥 You entered the Top 10!",
          `You're #${user.rank}!${gapAbove > 0 ? ` ${gapAbove} GGs from #${user.rank - 1}.` : ""} Keep climbing! 🎯`,
          { screen: "Rankings" }
        );
        await setThrottle(user.id, "rank_enter10");

      } else if (prev.rank > user.rank) {
        // Montée de rang
        if (await isThrottledMin(user.id, "rank_up", 30)) continue;
        const title = user.rank === 1
          ? "🔥 You're #1 LEADER!"
          : `⬆️ You climbed to #${user.rank}!`;
        const body = user.rank === 1
          ? "You just took the crown! Your leader frame is active 👑⚡"
          : `Up from #${prev.rank} to #${user.rank}! ${user.rank <= 3 ? "You're on the podium! 🏅" : "Keep pushing!"}`;
        await sendPushNotif(user.fcmToken, title, body, { screen: "Rankings" });
        await setThrottle(user.id, "rank_up");

      } else if (prev.rank < user.rank) {
        // Descente de rang
        if (await isThrottledMin(user.id, "rank_down", 45)) continue;
        const below = ranked[user.rank]; // juste en dessous
        const gapBelow = below ? user.ggMonth - below.ggMonth : 0;
        await sendPushNotif(
          user.fcmToken,
          `⚠️ You dropped to #${user.rank}`,
          `${gapBelow <= 3 ? `Only ${gapBelow} GG${gapBelow !== 1 ? "s" : ""} keeping you here! ` : ""}Post a clip to hold your spot! 🎯`,
          { screen: "Rankings" }
        );
        await setThrottle(user.id, "rank_down");
      }
    }

    // ── Utilisateurs qui SORTENT du top 10 ──────────────────────────────────
    for (const prev of prevTop10) {
      if (currentTop10.find(u => u.id === prev.id)) continue;
      const userSnap = await db.collection("users").doc(prev.id).get();
      if (!userSnap.exists) continue;
      const token = userSnap.data()?.fcmToken;
      if (!token) continue;
      if (await isThrottledMin(prev.id, "rank_out10", 120)) continue;
      await sendPushNotif(
        token,
        "😤 You fell out of the Top 10!",
        "Someone just passed you. Post a clip NOW to get back in! 🎯",
        { screen: "Rankings" }
      );
      await setThrottle(prev.id, "rank_out10");
    }

    // ── Rangs 11-20 proches du top 10 : push de motivation (≤20h) ───────────
    const near = ranked.slice(10, 20);
    for (const user of near) {
      if (!user.fcmToken) continue;
      if (await isThrottledMin(user.id, "near_top10", 60 * 20)) continue;
      const top10Last = currentTop10[currentTop10.length - 1];
      const gap = top10Last ? top10Last.ggMonth - user.ggMonth : 0;
      if (gap > 30) continue; // trop loin, pas de notif
      await sendPushNotif(
        user.fcmToken,
        `🎯 Top 10 is within reach! (#${user.rank})`,
        `Only ${gap} GG${gap !== 1 ? "s" : ""} from the Top 10! One clip can change everything. 🔥`,
        { screen: "Rankings" }
      );
      await setThrottle(user.id, "near_top10");
    }

    // ── 3 derniers jours du mois : countdown quotidien pour le top 20 ────────
    if (isLastDays && !isLastHours) {
      const daysLeft = Math.ceil(minutesLeftInMonthTZ() / (24 * 60));

      for (const user of ranked.slice(0, 20)) {
        if (!user.fcmToken) continue;
        if (await isThrottledMin(user.id, "endmonth_day", 60 * 22)) continue; // 1 fois/jour

        const above = ranked[user.rank - 2];
        const below = ranked[user.rank];
        const gapAbove = above ? above.ggMonth - user.ggMonth : 0;
        const gapBelow = below ? user.ggMonth - below.ggMonth : 0;

        let extra = "";
        if (user.rank === 1) extra = " Hold your crown! 👑";
        else if (gapAbove <= 8) extra = ` Only ${gapAbove} GGs from #${user.rank - 1}! 🔥`;
        else if (gapBelow <= 3) extra = ` #${user.rank + 1} is only ${gapBelow} GGs behind!`;

        await sendPushNotif(
          user.fcmToken,
          `⏳ ${daysLeft} day${daysLeft > 1 ? "s" : ""} left — You're #${user.rank}`,
          `${user.ggMonth} GGs this month.${extra} Rankings close ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}!`,
          { screen: "Rankings" }
        );
        await setThrottle(user.id, "endmonth_day");
      }
    }

    // ── 3 dernières heures : urgence toutes les 15 min pour le top 15 ────────
    if (isLastHours) {
      const minLeft = Math.max(1, minutesLeftInMonthTZ());
      const hLeft = Math.floor(minLeft / 60);
      const mLeft = minLeft % 60;
      const timeStr = hLeft > 0 ? `${hLeft}h${mLeft > 0 ? ` ${mLeft}m` : ""}` : `${minLeft}m`;

      for (const user of ranked.slice(0, 15)) {
        if (!user.fcmToken) continue;
        if (await isThrottledMin(user.id, "endmonth_hour", 14)) continue; // toutes les 14 min max

        const above = ranked[user.rank - 2];
        const gapAbove = above ? above.ggMonth - user.ggMonth : 0;

        let title = `🚨 ${timeStr} LEFT THIS MONTH!`;
        let body: string;
        if (user.rank === 1) {
          body = `You're the LEADER with ${user.ggMonth} GGs! Last push to defend the crown! 👑`;
        } else if (gapAbove <= 5) {
          body = `#${user.rank} — only ${gapAbove} GG${gapAbove !== 1 ? "s" : ""} from #${user.rank - 1}! GO NOW!`;
        } else {
          body = `You're #${user.rank} — ${timeStr} to climb. Post your last clip! 🎯`;
        }

        await sendPushNotif(user.fcmToken, title, body, { screen: "Rankings" });
        await setThrottle(user.id, "endmonth_hour");
      }
    }

    // ── Sauvegarde du nouvel état ─────────────────────────────────────────────
    await stateRef.set({
      top10: currentTop10.map(u => ({ id: u.id, rank: u.rank, ggMonth: u.ggMonth })),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info(
      `notifRankingChanges: top10 updated | lastDays=${isLastDays} | lastHours=${isLastHours}`
    );
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE WEBHOOK — Gestion des abonnements Legendary via le site web
// ─────────────────────────────────────────────────────────────────────────────
import Stripe from "stripe";

const STRIPE_PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY || "price_1Tmex2097oI4jieSjbbA3ds3";
const STRIPE_PRICE_ID_YEARLY  = process.env.STRIPE_PRICE_ID_YEARLY  || "price_1TmfVo097oI4jieSliHF5NNi";


// Webhook Stripe — reçoit les événements de paiement
export const stripeWebhook = onRequest(
  { cors: true, region: "us-central1" },
  async (req, res) => {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const sig = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      // Vérifie la signature du webhook
      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      if (STRIPE_WEBHOOK_SECRET) {
        event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
      } else {
        res.status(500).send('Webhook secret not configured');
        return;
      }
    } catch (err: any) {
      logger.error("Stripe webhook signature error:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    logger.info("Stripe event received:", event.type);

    try {
      switch (event.type) {

        // ── Abonnement créé ou activé ──────────────────────────────────────
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;
          const status = sub.status; // 'active' | 'past_due' | 'canceled' etc.
          const currentPeriodEnd = (sub as any).current_period_end;
          const priceId = sub.items.data[0]?.price?.id;

          if (priceId !== STRIPE_PRICE_ID_MONTHLY && priceId !== STRIPE_PRICE_ID_YEARLY) break;

          // Trouve le user par stripeCustomerId
          const userSnap = await db.collection("users")
            .where("stripeCustomerId", "==", customerId)
            .limit(1).get();

          if (userSnap.empty) {
            logger.warn("No user found for stripeCustomerId:", customerId);
            break;
          }

          const uid = userSnap.docs[0].id;
          const isActive = status === "active" || status === "trialing";

          await db.collection("users").doc(uid).update({
            plan: isActive ? "legendary" : "free",
            stripeSubscriptionId: sub.id,
            stripeCustomerId: customerId,
            stripeStatus: status,
            subscriptionSource: "stripe_web",
            subscriptionExpiresAt: currentPeriodEnd
              ? admin.firestore.Timestamp.fromMillis(currentPeriodEnd * 1000)
              : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          logger.info(`User ${uid} plan updated to ${isActive ? "legendary" : "free"} (${status})`);
          break;
        }

        // ── Achat cosmétique one-time ──────────────────────────────────────
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const itemId = session.metadata?.itemId;
          const firebaseUid = session.metadata?.firebaseUid;

          // ── Support the App (don one-time, paliers ou montant libre) ──────
          if (session.metadata?.type === "support" && firebaseUid) {
            const amount = (session.amount_total || 0) / 100;
            await db.collection("support_purchases").add({
              userId: firebaseUid,
              amount,
              netAmount: +(amount * 0.971 - 0.30).toFixed(2), // ~ après frais Stripe
              currency: (session.currency || "cad").toUpperCase(),
              source: "stripe_web",
              sessionId: session.id,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            logger.info(`Support ${amount} ${session.currency} from ${firebaseUid}`);
            break;
          }

          // ── Fanbase subscription activated (creator subscription) ──────────
          if (session.metadata?.type === "fanbase" && firebaseUid && session.metadata?.creatorId) {
            const creatorId = session.metadata.creatorId;
            const subId = `${firebaseUid}_${creatorId}`;
            const subRef = db.collection("fanbase_subscriptions").doc(subId);
            const existed = (await subRef.get()).exists;
            await subRef.set({
              subscriberId: firebaseUid,
              creatorId,
              status: "active",
              source: "stripe_web",
              stripeSubscriptionId: session.subscription || null,
              isTest: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            if (!existed) {
              await db.collection("users").doc(creatorId)
                .update({ fanbaseSubscribers: admin.firestore.FieldValue.increment(1) })
                .catch(() => {});
              const earnRef = db.collection("creator_earnings").doc(creatorId);
              const earnSnap = await earnRef.get();
              if (earnSnap.exists) await earnRef.update({ subscriberCount: admin.firestore.FieldValue.increment(1) });
              else await earnRef.set({ subscriberCount: 1, totalEarned: 0, totalPaid: 0, balance: 0, pendingWithdrawal: 0 });
            }
            // NOTE: le crédit des gains par renouvellement se fait dans invoice.payment_succeeded (à compléter).
            logger.info(`Fanbase sub active: ${firebaseUid} -> ${creatorId}`);
            break;
          }

          // Only process cosmetic purchases (not subscriptions)
          if (!itemId || !firebaseUid || session.mode === "subscription") break;

          // Unlock cosmetic for the user — save to the right field based on itemType
          const itemType = session.metadata?.itemType || "cosmetic";
          const fieldMap: Record<string, string> = {
            avatar_frame:   "ownedFrames",
            video_frame:    "ownedVideoFrames",
            comment_frame:  "ownedCommentFrames",
            cosmetic:       "ownedCosmetics",
            theme:          "ownedCosmetics",
          };
          const field = fieldMap[itemType] || "ownedCosmetics";

          const userRef = db.collection("users").doc(firebaseUid);
          const userSnap = await userRef.get();
          if (!userSnap.exists) break;
          const owned: string[] = userSnap.data()?.[field] || [];
          if (!owned.includes(itemId)) {
            await userRef.update({
              [field]: [...owned, itemId],
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // Mark cosmetic_purchase as fulfilled
          const purchaseSnap = await db.collection("cosmetic_purchases")
            .where("sessionId", "==", session.id).limit(1).get();
          if (!purchaseSnap.empty) {
            await purchaseSnap.docs[0].ref.update({ status: "fulfilled" });
          }

          logger.info(`Cosmetic ${itemId} unlocked for user ${firebaseUid}`);
          break;
        }

        // ── Abonnement annulé ──────────────────────────────────────────────
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;

          // Fanbase annulée → désactive l'abo fanbase, NE touche PAS au plan Legendary.
          if (sub.metadata?.type === "fanbase" && sub.metadata?.firebaseUid && sub.metadata?.creatorId) {
            const subId = `${sub.metadata.firebaseUid}_${sub.metadata.creatorId}`;
            await db.collection("fanbase_subscriptions").doc(subId).delete().catch(() => {});
            await db.collection("users").doc(sub.metadata.creatorId)
              .update({ fanbaseSubscribers: admin.firestore.FieldValue.increment(-1) })
              .catch(() => {});
            logger.info(`Fanbase sub canceled: ${sub.metadata.firebaseUid} -> ${sub.metadata.creatorId}`);
            break;
          }

          const userSnap = await db.collection("users")
            .where("stripeCustomerId", "==", customerId)
            .limit(1).get();

          if (userSnap.empty) break;

          const uid = userSnap.docs[0].id;
          await db.collection("users").doc(uid).update({
            plan: "free",
            stripeStatus: "canceled",
            stripeSubscriptionId: null,
            subscriptionExpiresAt: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          logger.info(`User ${uid} subscription canceled → plan: free`);
          break;
        }

        // ── Paiement réussi ────────────────────────────────────────────────
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;
          const subId = (invoice as any).subscription as string;
          if (!subId) break;

          const sub = await stripe.subscriptions.retrieve(subId);

          // ── Renouvellement Fanbase → crédite les gains du créateur (modèle Twitch) ──
          // Se déclenche à CHAQUE cycle (1er paiement inclus). checkout.session.completed
          // ne crédite PAS les gains → aucun double comptage.
          if (sub.metadata?.type === "fanbase" && sub.metadata?.creatorId) {
            const creatorId = sub.metadata.creatorId;
            const gross = (invoice.amount_paid || 0) / 100;          // CA$3.99
            const creatorAmount = +(gross * 0.70).toFixed(2);         // 70% part créateur
            const earnRef = db.collection("creator_earnings").doc(creatorId);
            await db.runTransaction(async (tx) => {
              const snap = await tx.get(earnRef);
              if (snap.exists) {
                tx.update(earnRef, {
                  totalEarned: admin.firestore.FieldValue.increment(creatorAmount),
                  balance: admin.firestore.FieldValue.increment(creatorAmount),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              } else {
                tx.set(earnRef, {
                  subscriberCount: 0, totalEarned: creatorAmount, totalPaid: 0,
                  balance: creatorAmount, pendingWithdrawal: 0,
                });
              }
            });
            await db.collection("fanbase_payments").add({
              creatorId,
              subscriberId: sub.metadata.firebaseUid || null,
              gross,
              creatorAmount,
              invoiceId: invoice.id,
              source: "stripe_web",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            logger.info(`Fanbase renewal: +${creatorAmount} CAD to ${creatorId}`);
            break;
          }

          const priceId = sub.items.data[0]?.price?.id;
          if (priceId !== STRIPE_PRICE_ID_MONTHLY && priceId !== STRIPE_PRICE_ID_YEARLY) break;

          const userSnap = await db.collection("users")
            .where("stripeCustomerId", "==", customerId)
            .limit(1).get();
          if (userSnap.empty) break;

          const uid = userSnap.docs[0].id;
          const currentPeriodEnd = (sub as any).current_period_end;
          await db.collection("users").doc(uid).update({
            plan: "legendary",
            stripeStatus: "active",
            subscriptionExpiresAt: admin.firestore.Timestamp.fromMillis(currentPeriodEnd * 1000),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          logger.info(`Payment succeeded for user ${uid} — Legendary renewed`);
          break;
        }

        // ── Paiement échoué ────────────────────────────────────────────────
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          const userSnap = await db.collection("users")
            .where("stripeCustomerId", "==", customerId)
            .limit(1).get();
          if (userSnap.empty) break;

          const uid = userSnap.docs[0].id;
          await db.collection("users").doc(uid).update({
            stripeStatus: "past_due",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.warn(`Payment failed for user ${uid}`);
          break;
        }
      }
    } catch (err: any) {
      logger.error("Stripe webhook processing error:", err);
      res.status(500).json({ error: err.message });
      return;
    }

    res.status(200).json({ received: true });
  }
);

// Crée une Stripe Checkout Session — appelée depuis le site web
export const createCheckoutSession = onRequest(
  { cors: true, region: "us-central1" },
  async (req, res) => {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) { res.status(500).json({ error: "Stripe key not configured" }); return; }
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { uid, email, successUrl, cancelUrl, plan } = req.body;
    if (!uid || !email) { res.status(400).json({ error: "uid and email required" }); return; }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      if (decoded.uid !== uid) { res.status(403).json({ error: 'Forbidden' }); return; }
    } catch { res.status(401).json({ error: 'Invalid token' }); return; }

    try {
      // Cherche ou crée le customer Stripe
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() || {};

      let customerId = userData.stripeCustomerId;
      // Verify the customer exists in the current Stripe mode (test vs live)
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
        } catch (e: any) {
          // Customer doesn't exist in this mode (e.g. live ID used with test key)
          customerId = null;
        }
      }
      if (!customerId) {
        const customer = await stripe.customers.create({
          email,
          metadata: { firebaseUid: uid },
        });
        customerId = customer.id;
        await userRef.update({ stripeCustomerId: customerId });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: plan === "yearly" ? STRIPE_PRICE_ID_YEARLY : STRIPE_PRICE_ID_MONTHLY, quantity: 1 }],
        mode: "subscription",
        success_url: successUrl || "https://gamingactions.app/legendary?success=true",
        cancel_url: cancelUrl || "https://gamingactions.app/legendary?canceled=true",
        metadata: { firebaseUid: uid },
        subscription_data: {
          metadata: { firebaseUid: uid },
        },
      });

      res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (err: any) {
      logger.error("createCheckoutSession error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Crée une Checkout Session "Support the App" — paiement unique (palier OU montant libre)
export const createSupportCheckout = onRequest(
  { cors: true, region: "us-central1" },
  async (req, res) => {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) { res.status(500).json({ error: "Stripe key not configured" }); return; }
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { uid, email, amount, successUrl, cancelUrl } = req.body;
    if (!uid || !email) { res.status(400).json({ error: "uid and email required" }); return; }

    // Montant en CAD : borné pour éviter les abus (1$ → 999$)
    const cad = Math.round(Number(amount) * 100);
    if (!cad || cad < 100 || cad > 99900) { res.status(400).json({ error: "Invalid amount" }); return; }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
      if (decoded.uid !== uid) { res.status(403).json({ error: "Forbidden" }); return; }
    } catch { res.status(401).json({ error: "Invalid token" }); return; }

    try {
      const userRef = db.collection("users").doc(uid);
      let customerId = (await userRef.get()).data()?.stripeCustomerId;
      if (customerId) {
        try { await stripe.customers.retrieve(customerId); } catch { customerId = null; }
      }
      if (!customerId) {
        const customer = await stripe.customers.create({ email, metadata: { firebaseUid: uid } });
        customerId = customer.id;
        await userRef.update({ stripeCustomerId: customerId });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: cad,
            product_data: { name: "Support Gaming Actions 💛" },
          },
        }],
        success_url: successUrl || "https://gamingactions.app/support?success=true",
        cancel_url: cancelUrl || "https://gamingactions.app/support?canceled=true",
        metadata: { firebaseUid: uid, type: "support" },
      });

      res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (err: any) {
      logger.error("createSupportCheckout error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Crée un Stripe Customer Portal — pour gérer/annuler l'abonnement depuis le web
export const createPortalSession = onRequest(
  { cors: true, region: "us-central1" },
  async (req, res) => {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { uid, returnUrl } = req.body;
    if (!uid) { res.status(400).json({ error: "uid required" }); return; }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      if (decoded.uid !== uid) { res.status(403).json({ error: 'Forbidden' }); return; }
    } catch { res.status(401).json({ error: 'Invalid token' }); return; }

    try {
      const userDoc = await db.collection("users").doc(uid).get();
      let customerId = userDoc.data()?.stripeCustomerId;
      if (!customerId) { res.status(404).json({ error: "No Stripe customer found" }); return; }
      // Verify customer exists in current Stripe mode
      try { await stripe.customers.retrieve(customerId); } catch { res.status(404).json({ error: "No active Stripe customer in current mode" }); return; }

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || "https://gamingactions.app/legendary",
      });

      res.status(200).json({ url: session.url });
    } catch (err: any) {
      logger.error("createPortalSession error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Checkout — Achat one-time d'un cosmétique en dollars (site web)
// POST body: { uid, email, itemId, itemName, amountCents, successUrl, cancelUrl }
// ─────────────────────────────────────────────────────────────────────────────
export const createCosmeticCheckoutSession = onRequest(
  { cors: true, region: "us-central1" },
  async (req, res) => {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) { res.status(500).json({ error: "Stripe key not configured" }); return; }
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { uid, email, itemId, itemType, itemName, amountCents, successUrl, cancelUrl } = req.body;
    if (!uid || !email || !itemId || !amountCents) {
      res.status(400).json({ error: "uid, email, itemId, amountCents required" });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      if (decoded.uid !== uid) { res.status(403).json({ error: 'Forbidden' }); return; }
    } catch { res.status(401).json({ error: 'Invalid token' }); return; }

    try {
      // Cherche ou crée le customer Stripe
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() || {};

      let customerId = userData.stripeCustomerId;
      // Verify customer exists in current Stripe mode (test vs live)
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
        } catch (e: any) {
          customerId = null;
        }
      }
      if (!customerId) {
        const customer = await stripe.customers.create({ email, metadata: { firebaseUid: uid } });
        customerId = customer.id;
        await userRef.update({ stripeCustomerId: customerId });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "cad",
            product_data: { name: itemName || itemId, description: `Cosmétique Gaming Actions — ${itemId}` },
            unit_amount: Math.round(amountCents),
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: successUrl || `https://gamingactions.app/shop?purchased=${itemId}`,
        cancel_url:  cancelUrl  || "https://gamingactions.app/shop",
        metadata: { firebaseUid: uid, itemId, itemType: itemType || "cosmetic" },
      });

      // Pré-enregistre la commande en attente
      await db.collection("cosmetic_purchases").add({
        uid, itemId, amountCents,
        sessionId: session.id,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (err: any) {
      logger.error("createCosmeticCheckoutSession error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Checkout — Fanbase subscription CA$3.99/month (site web)
// POST body: { uid, email, creatorId, creatorUsername, successUrl, cancelUrl }
// ─────────────────────────────────────────────────────────────────────────────
export const createFanbaseCheckoutSession = onRequest(
  { cors: true, region: "us-central1" },
  async (req, res) => {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) { res.status(500).json({ error: "Stripe key not configured" }); return; }
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { uid, email, creatorId, creatorUsername, successUrl, cancelUrl } = req.body;
    if (!uid || !email || !creatorId) {
      res.status(400).json({ error: "uid, email, and creatorId are required" });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      if (decoded.uid !== uid) { res.status(403).json({ error: 'Forbidden' }); return; }
    } catch { res.status(401).json({ error: 'Invalid token' }); return; }

    try {
      // Cherche ou crée le customer Stripe
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() || {};

      let customerId = userData.stripeCustomerId;
      // Verify customer exists in current Stripe mode (test vs live)
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
        } catch (e: any) {
          customerId = null;
        }
      }
      if (!customerId) {
        const customer = await stripe.customers.create({ email, metadata: { firebaseUid: uid } });
        customerId = customer.id;
        await userRef.update({ stripeCustomerId: customerId });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "cad",
            product_data: {
              name: `${creatorUsername || creatorId} — Fanbase`,
              description: `Monthly access to ${creatorUsername || creatorId}'s exclusive Fanbase on Gaming Actions`,
            },
            unit_amount: 399, // CA$3.99
            recurring: { interval: "month" },
          },
          quantity: 1,
        }],
        mode: "subscription",
        success_url: successUrl || `https://gamingactions.app/fanbase/${creatorId}?success=true`,
        cancel_url:  cancelUrl  || `https://gamingactions.app/fanbase/${creatorId}`,
        metadata: { firebaseUid: uid, creatorId, type: "fanbase" },
        subscription_data: {
          metadata: { firebaseUid: uid, creatorId, type: "fanbase" },
        },
      });

      res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (err: any) {
      logger.error("createFanbaseCheckoutSession error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED — cleanupOrphanCosmetics (daily at 5h UTC)
// 1. Migrates avatar_frame:* entries from ownedCosmetics → ownedFrames
// 2. Deduplicates all owned arrays
// 3. Marks stale cosmetic_purchases (>24h pending) as "abandoned"
// ─────────────────────────────────────────────────────────────────────────────
export const cleanupOrphanCosmetics = onSchedule(
  { schedule: "0 5 * * *", region: "us-central1", timeZone: "America/Toronto", timeoutSeconds: 300, memory: "256MiB" },
  async () => {
    logger.info("cleanupOrphanCosmetics: start");
    let usersFixed = 0;
    let purchasesAbandoned = 0;

    // 1. Migrate avatar_frame:* from ownedCosmetics to ownedFrames + deduplicate arrays
    const usersSnap = await db.collection("users").get();
    for (const uDoc of usersSnap.docs) {
      const data = uDoc.data();
      const ownedCosmetics: string[] = data.ownedCosmetics || [];
      const ownedFrames: string[] = data.ownedFrames || [];
      const ownedVideoFrames: string[] = data.ownedVideoFrames || [];
      const ownedCommentFrames: string[] = data.ownedCommentFrames || [];

      // Find avatar_frame:* entries in ownedCosmetics
      const frameEntries = ownedCosmetics.filter((c: string) => c.startsWith("avatar_frame:"));
      const frameIds = frameEntries.map((c: string) => c.replace("avatar_frame:", ""));
      const remainingCosmetics = ownedCosmetics.filter((c: string) => !c.startsWith("avatar_frame:"));

      const newOwnedFrames = [...new Set([...ownedFrames, ...frameIds])];
      const newOwnedCosmetics = [...new Set(remainingCosmetics)];
      const newOwnedVideoFrames = [...new Set(ownedVideoFrames)];
      const newOwnedCommentFrames = [...new Set(ownedCommentFrames)];

      const changed =
        newOwnedCosmetics.length !== ownedCosmetics.length ||
        newOwnedFrames.length !== ownedFrames.length ||
        newOwnedVideoFrames.length !== ownedVideoFrames.length ||
        newOwnedCommentFrames.length !== ownedCommentFrames.length;

      if (changed) {
        await uDoc.ref.update({
          ownedCosmetics: newOwnedCosmetics,
          ownedFrames: newOwnedFrames,
          ownedVideoFrames: newOwnedVideoFrames,
          ownedCommentFrames: newOwnedCommentFrames,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        usersFixed++;
        logger.info(`cleanupOrphanCosmetics: user ${uDoc.id} fixed — moved ${frameIds.length} frames`);
      }
    }

    // 2. Mark stale pending cosmetic_purchases (>24h) as abandoned
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stalePurchasesSnap = await db.collection("cosmetic_purchases")
      .where("status", "==", "pending")
      .where("createdAt", "<=", oneDayAgo)
      .get();

    const batch = db.batch();
    for (const doc of stalePurchasesSnap.docs) {
      batch.update(doc.ref, { status: "abandoned", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      purchasesAbandoned++;
    }
    if (purchasesAbandoned > 0) await batch.commit();

    logger.info(`cleanupOrphanCosmetics: done — ${usersFixed} users fixed, ${purchasesAbandoned} purchases abandoned`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// generateBrandedVideo — Retourne l'URL de téléchargement Mux directe
// NOTE: FFmpeg processing (intro/outro/watermark) à implémenter via Cloudinary
// ou Cloud Run dédié (Gen 2 gVisor bloque FFmpeg, Gen 1 CLI bug v15.22.1)
// ─────────────────────────────────────────────────────────────────────────────
export const generateBrandedVideo = onCall(
  { timeoutSeconds: 60, region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');

    const { videoId } = request.data as { videoId: string };
    if (!videoId) throw new HttpsError('invalid-argument', 'videoId required');

    // Get video info from Firestore
    const videoDoc = await db.collection('videos').doc(videoId).get();
    if (!videoDoc.exists) throw new HttpsError('not-found', 'Video not found');
    const video = videoDoc.data()!;
    const playbackId: string = video.playbackId || video.muxPlaybackId;
    const username: string = video.username || 'GamingActions';
    if (!playbackId) throw new HttpsError('failed-precondition', 'No playback ID');

    // Return the Mux direct download URL (1080p rendition)
    // Full branding (intro/outro/watermark) will be added via Cloudinary integration
    const url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`;
    logger.info('[GBV] returning Mux direct URL', { videoId, playbackId });
    return { url, username };
  }
);

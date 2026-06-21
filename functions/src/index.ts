import * as admin from "firebase-admin";
import {
  onDocumentWritten,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { Expo } from "expo-server-sdk";

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

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

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER 1 — onGGWritten
// Se déclenche à chaque GG ajouté ou retiré.
// Recompte les GG réels de la vidéo → met à jour ggCount + ggReceived du créateur.
// ─────────────────────────────────────────────────────────────────────────────
export const onGGWritten = onDocumentWritten(
  "ggs/{ggId}",
  async (event) => {
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

    // Met à jour la vidéo
    await videoRef.update({ ggCount: realGGCount });

    // Recompte le total ggReceived du créateur (somme sur toutes ses vidéos)
    const creatorVideosSnap = await db.collection("videos")
      .where("userId", "==", creatorId)
      .get();
    let totalGGReceived = 0;
    for (const vDoc of creatorVideosSnap.docs) {
      const vData = vDoc.data();
      // La vidéo qu'on vient de corriger → utilise la valeur recomptée
      totalGGReceived += vDoc.id === videoId ? realGGCount : (vData.ggCount || 0);
    }

    // Met à jour le profil du créateur
    const creatorRef = db.collection("users").doc(creatorId);
    const creatorSnap = await creatorRef.get();
    if (creatorSnap.exists) {
      const creatorData = creatorSnap.data()!;
      const streakPts = creatorData.streakPoints || 0;
      await creatorRef.update({
        ggReceived: totalGGReceived,
        streakLevel: calcStreakLevel(streakPts),
      });

      // Push notification au créateur quand il reçoit un GG
      if (after && creatorData.fcmToken && creatorId !== after.userId) {
        // Récupère le nom de l'envoyeur
        const senderSnap = await db.collection("users").doc(after.userId).get();
        const senderName = senderSnap.exists ? (senderSnap.data()!.username || 'Someone') : 'Someone';
        await sendPushNotif(
          creatorData.fcmToken,
          '⭐ GG received!',
          `${senderName} gave you a GG on your clip!`,
          { screen: 'Feed', videoId }
        );
      }
    }

    logger.info(`onGGWritten: vidéo ${videoId} → ggCount=${realGGCount}, créateur ${creatorId} → ggReceived=${totalGGReceived}`);
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

    logger.info(`onFollowWritten: ${followerId} following=${realFollowing} | ${followingId} followers=${realFollowers}`);
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
    const videoId = event.params.videoId;
    const videoData = event.data?.data();
    if (!videoData) return;

    const creatorId: string = videoData.userId;

    // Supprime tous les GGs de cette vidéo (batch)
    const ggsSnap = await db.collection("ggs")
      .where("videoId", "==", videoId)
      .get();

    const batch = db.batch();
    ggsSnap.docs.forEach((d) => batch.delete(d.ref));

    // Supprime aussi les notifications liées à cette vidéo
    const notifsSnap = await db.collection("notifications")
      .where("videoId", "==", videoId)
      .get();
    notifsSnap.docs.forEach((d) => batch.delete(d.ref));

    // Supprime les comments
    const commentsSnap = await db.collection("comments")
      .where("videoId", "==", videoId)
      .get();
    commentsSnap.docs.forEach((d) => batch.delete(d.ref));

    await batch.commit();

    // Recalcule ggReceived du créateur après nettoyage
    const creatorVideosSnap = await db.collection("videos")
      .where("userId", "==", creatorId)
      .get();
    let totalGGReceived = 0;
    creatorVideosSnap.docs.forEach((d) => {
      totalGGReceived += d.data().ggCount || 0;
    });

    const creatorRef = db.collection("users").doc(creatorId);
    const creatorSnap = await creatorRef.get();
    if (creatorSnap.exists) {
      const streakPts = creatorSnap.data()!.streakPoints || 0;
      await creatorRef.update({
        ggReceived: totalGGReceived,
        streakLevel: calcStreakLevel(streakPts),
      });
    }

    logger.info(`onVideoDeleted: vidéo ${videoId} — ${ggsSnap.size} GGs nettoyés, créateur ${creatorId} ggReceived=${totalGGReceived}`);
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
        badge: 1,
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
  { schedule: "0 18 * * 1,4", region: "us-central1", timeoutSeconds: 300 },
  async () => {
    logger.info("notifInactiveUsers: start");
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const usersSnap = await db.collection("users")
      .where("lastSeen", "<=", threeDaysAgo)
      .where("fcmToken", "!=", "")
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
  { schedule: "0 19 * * 3", region: "us-central1", timeoutSeconds: 300 },
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
  { schedule: "0 20 * * 5", region: "us-central1", timeoutSeconds: 300 },
  async () => {
    logger.info("notifRankingHeat: start");

    // Récupère le top 25 par ggReceived du mois en cours
    const usersSnap = await db.collection("users")
      .orderBy("ggReceived", "desc")
      .limit(25)
      .get();

    const ranked = usersSnap.docs.map((d, i) => {
      const data = d.data() as Record<string, any>;
      return {
        id: d.id,
        rank: i + 1,
        fcmToken: (data.fcmToken || '') as string,
        ggReceived: (data.ggReceived || 0) as number,
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
  { schedule: "0 14 * * 6", region: "us-central1", timeoutSeconds: 300 },
  async () => {
    logger.info("notifWeekend: start");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const usersSnap = await db.collection("users")
      .where("lastSeen", ">=", sevenDaysAgo)
      .where("fcmToken", "!=", "")
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
  { schedule: "1 0 1 * *", region: "us-central1", timeoutSeconds: 120 },
  async () => {
    logger.info("assignMonthlyChampion: start");

    // 1. Trouve le top 1 par ggReceived
    const topSnap = await db.collection("users")
      .orderBy("ggReceived", "desc")
      .limit(1)
      .get();
    if (topSnap.empty) {
      logger.warn("assignMonthlyChampion: no users found");
      return;
    }
    const newChampDoc = topSnap.docs[0];
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

    // 5. Bonus 500 GA Points au champion
    const champCurrentPoints = newChampData.gaPoints || 0;
    await newChampDoc.ref.update({ gaPoints: champCurrentPoints + 500 });

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
        text: `👑 ${champUsername} is the Champion of ${monthKey}! Can you dethrone them next month? 🔥`,
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
        `${champUsername} won the GG Rankings for ${monthKey}! Can you dethrone them? 🔥`,
        { screen: "Rankings" }
      ).catch(() => {})
    ));

    logger.info(`assignMonthlyChampion: ${champUsername} is Champion of ${monthKey} — community notified`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE LEADER — Toutes les heures (met à jour isCurrentLeader)
// Trouve le 1er du ranking en cours et met isCurrentLeader=true
// ─────────────────────────────────────────────────────────────────────────────
export const updateCurrentLeader = onSchedule(
  { schedule: "0 * * * *", region: "us-central1", timeoutSeconds: 60 },
  async () => {
    const topSnap = await db.collection("users")
      .orderBy("ggReceived", "desc")
      .limit(1)
      .get();
    if (topSnap.empty) return;

    const leaderId = topSnap.docs[0].id;
    const batch = db.batch();

    // Retire le badge à l'ancien leader
    const oldLeaderSnap = await db.collection("users").where("isCurrentLeader", "==", true).get();
    for (const d of oldLeaderSnap.docs) {
      if (d.id !== leaderId) batch.update(d.ref, { isCurrentLeader: false });
    }
    // Attribue au nouveau
    batch.update(topSnap.docs[0].ref, { isCurrentLeader: true });
    await batch.commit();
    logger.info(`updateCurrentLeader: leader is ${topSnap.docs[0].data().username}`);
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
  { schedule: "0 4 * * *", region: "us-central1", timeoutSeconds: 120 },
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

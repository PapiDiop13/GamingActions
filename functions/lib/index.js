"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPortalSession = exports.createCheckoutSession = exports.stripeWebhook = exports.broadcastPush = exports.onMentionNotif = exports.onVideoCreated = exports.notifYourRank = exports.migrateCloudinaryToMux = exports.muxWebhook = exports.muxGetUploadUrl = exports.exportDuplicates = exports.importVideoUpdates = exports.exportVideos = exports.exportGamesGenres = exports.adminCleanup = exports.reshuffleFeedOrder = exports.checkExpiredSubscriptions = exports.dailyLeaderBonus = exports.decayStreakPoints = exports.updateCurrentLeader = exports.assignMonthlyChampion = exports.notifWeekend = exports.notifRankingHeat = exports.notifUploadNudge = exports.notifInactiveUsers = exports.cleanOrphanData = exports.reconcileUserStats = exports.reconcileGGCounts = exports.onCommentCreated = exports.onVideoDeleted = exports.onFollowWritten = exports.onGGWritten = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const expo_server_sdk_1 = require("expo-server-sdk");
admin.initializeApp();
const db = admin.firestore();
const expo = new expo_server_sdk_1.Expo();
// ─── Seuils de niveau (identiques à points.js côté client) ───────────────────
const STREAK_LEVELS = [
    { id: "noob", minPoints: 0 },
    { id: "bronze", minPoints: 500 },
    { id: "silver", minPoints: 2000 },
    { id: "gold", minPoints: 5000 },
    { id: "goat", minPoints: 15000 },
];
function calcStreakLevel(points) {
    let level = "noob";
    for (const l of STREAK_LEVELS) {
        if (points >= l.minPoints)
            level = l.id;
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
exports.onGGWritten = (0, firestore_1.onDocumentWritten)("ggs/{ggId}", async (event) => {
    var _a, _b, _c, _d, _e;
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
    // Détermine la vidéo concernée
    const videoId = (_e = after === null || after === void 0 ? void 0 : after.videoId) !== null && _e !== void 0 ? _e : before === null || before === void 0 ? void 0 : before.videoId;
    if (!videoId)
        return;
    const videoRef = db.collection("videos").doc(videoId);
    const videoSnap = await videoRef.get();
    if (!videoSnap.exists)
        return;
    const videoData = videoSnap.data();
    const creatorId = videoData.userId;
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
    // Détermine si c'est un AJOUT ou un RETRAIT de GG (pour créditer/débiter les points)
    // before absent + after présent  → GG ajouté  (+points)
    // before présent + after absent  → GG retiré  (-points)
    const isAdd = !before && !!after;
    const isRemove = !!before && !after;
    const ptsDelta = isAdd ? RECEIVE_GG_POINTS : (isRemove ? -RECEIVE_GG_POINTS : 0);
    // Met à jour le profil du créateur dans UNE transaction atomique.
    // C'est la SOURCE UNIQUE de vérité : ggReceived, gaPoints, streakPoints,
    // streakLevel sont tous recalculés ici. Le client ne fait QUE de
    // l'optimistic UI local (aucune écriture concurrente sur ce doc → plus de
    // failed-precondition).
    const creatorRef = db.collection("users").doc(creatorId);
    let creatorData = null;
    await db.runTransaction(async (tx) => {
        const creatorSnap = await tx.get(creatorRef);
        if (!creatorSnap.exists)
            return;
        creatorData = creatorSnap.data();
        // gaPoints (solde dépensable) : jamais sous 0
        const newGaPoints = Math.max(0, (creatorData.gaPoints || 0) + ptsDelta);
        // streakPoints (niveau cumulatif) : jamais sous 0
        const newStreakPoints = Math.max(0, (creatorData.streakPoints || 0) + ptsDelta);
        tx.update(creatorRef, {
            ggReceived: totalGGReceived,
            gaPoints: newGaPoints,
            streakPoints: newStreakPoints,
            streakLevel: calcStreakLevel(newStreakPoints),
        });
    });
    // Trace dans points_history (audit trail visible dans PointsHistoryScreen)
    if (ptsDelta !== 0) {
        await db.collection("points_history").add({
            userId: creatorId,
            delta: ptsDelta,
            reason: isAdd ? "Received a GG" : "GG removed",
            videoId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    // Notifications UNIQUEMENT sur ajout de GG (pas sur retrait), et jamais à soi-même
    if (isAdd && after && creatorId !== after.userId && creatorData) {
        const senderSnap = await db.collection("users").doc(after.userId).get();
        const senderName = senderSnap.exists ? (senderSnap.data().username || "Someone") : "Someone";
        // 1. Notif in-app Firestore (source unique — plus de création côté client)
        await db.collection("notifications").add({
            userId: creatorId,
            type: "gg",
            fromUserId: after.userId,
            fromUsername: senderName,
            text: "gave you a GG on your clip ⭐",
            videoId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 2. Push notification
        const creatorDataTyped = creatorData;
        if (creatorDataTyped.fcmToken) {
            await sendPushNotif(creatorDataTyped.fcmToken, "⭐ GG received!", `${senderName} gave you a GG on your clip!`, { screen: "Feed", videoId });
        }
    }
    v2_1.logger.info(`onGGWritten: vidéo ${videoId} → ggCount=${realGGCount}, créateur ${creatorId} → ggReceived=${totalGGReceived}, ptsDelta=${ptsDelta}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER 2 — onFollowWritten
// Se déclenche à chaque follow/unfollow.
// Recompte les vrais followers/following → corrige les deux users.
// ─────────────────────────────────────────────────────────────────────────────
exports.onFollowWritten = (0, firestore_1.onDocumentWritten)("follows/{followId}", async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
    const followerId = (_e = after === null || after === void 0 ? void 0 : after.followerId) !== null && _e !== void 0 ? _e : before === null || before === void 0 ? void 0 : before.followerId;
    const followingId = (_f = after === null || after === void 0 ? void 0 : after.followingId) !== null && _f !== void 0 ? _f : before === null || before === void 0 ? void 0 : before.followingId;
    if (!followerId || !followingId)
        return;
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
            const targetToken = (_g = targetSnap.data()) === null || _g === void 0 ? void 0 : _g.fcmToken;
            const senderName = ((_h = senderSnap.data()) === null || _h === void 0 ? void 0 : _h.username) || "Someone";
            if (targetToken && followerId !== followingId) {
                await sendPushNotif(targetToken, "👥 New follower!", `${senderName} started following you!`, { screen: "UserProfile", userId: followerId });
            }
        }
        catch (e) {
            v2_1.logger.warn("follow push failed:", e);
        }
    }
    v2_1.logger.info(`onFollowWritten: ${followerId} following=${realFollowing} | ${followingId} followers=${realFollowers}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER 3 — onVideoDeleted
// Se déclenche quand une vidéo est supprimée.
// Nettoie les GGs orphelins + recalcule ggReceived du créateur.
// ─────────────────────────────────────────────────────────────────────────────
exports.onVideoDeleted = (0, firestore_1.onDocumentDeleted)("videos/{videoId}", async (event) => {
    var _a;
    const videoId = event.params.videoId;
    const videoData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!videoData)
        return;
    const creatorId = videoData.userId;
    const deletedGGCount = videoData.ggCount || 0;
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
    creatorVideosSnap.docs.forEach((d) => {
        totalGGReceived += d.data().ggCount || 0;
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
        if (!creatorSnap.exists)
            return;
        const d = creatorSnap.data();
        const ggPointsToRemove = deletedGGCount * RECEIVE_GG_POINTS;
        const totalPointsToRemove = ggPointsToRemove + POST_CLIP_POINTS;
        const newGaPoints = Math.max(0, (d.gaPoints || 0) - totalPointsToRemove);
        const newStreakPoints = Math.max(0, (d.streakPoints || 0) - totalPointsToRemove);
        const newVideoCount = Math.max(0, (d.videoCount || 0) - 1);
        finalGaPoints = newGaPoints;
        tx.update(creatorRef, {
            videoCount: newVideoCount,
            ggReceived: totalGGReceived,
            gaPoints: newGaPoints,
            streakPoints: newStreakPoints,
            streakLevel: calcStreakLevel(newStreakPoints),
        });
    });
    // 4. points_history — trace audit (hors transaction, non bloquant)
    const ggPointsToRemove = deletedGGCount * RECEIVE_GG_POINTS;
    const totalPointsToRemove = ggPointsToRemove + POST_CLIP_POINTS;
    if (totalPointsToRemove > 0) {
        await db.collection("points_history").add({
            userId: creatorId,
            delta: -totalPointsToRemove,
            reason: `Clip deleted (-${POST_CLIP_POINTS} clip bonus, -${ggPointsToRemove} GG pts)`,
            total: finalGaPoints,
            videoId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    v2_1.logger.info(`onVideoDeleted: vidéo ${videoId} — ${ggsSnap.size} GGs nettoyés, ` +
        `créateur ${creatorId} ggReceived=${totalGGReceived}, ` +
        `-${totalPointsToRemove} pts (clip + GGs)`);
});
// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER 4 — onCommentCreated
// Push notification au créateur de la vidéo quand quelqu'un commente.
// Push également à l'auteur du commentaire parent sur une réponse.
// ─────────────────────────────────────────────────────────────────────────────
exports.onCommentCreated = (0, firestore_1.onDocumentWritten)("comments/{commentId}", async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const after = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after) === null || _b === void 0 ? void 0 : _b.data();
    const before = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.before) === null || _d === void 0 ? void 0 : _d.data();
    // Only on creation (not edit/delete)
    if (!after || before)
        return;
    const { videoId, userId: commenterId, username: commenterName, parentId, text } = after;
    if (!videoId || !commenterId)
        return;
    const preview = (text || "").slice(0, 40);
    try {
        // 1. Notify video owner
        const videoSnap = await db.collection("videos").doc(videoId).get();
        if (videoSnap.exists) {
            const videoOwnerId = videoSnap.data().userId;
            if (videoOwnerId && videoOwnerId !== commenterId) {
                const ownerSnap = await db.collection("users").doc(videoOwnerId).get();
                const ownerToken = (_e = ownerSnap.data()) === null || _e === void 0 ? void 0 : _e.fcmToken;
                if (ownerToken) {
                    await sendPushNotif(ownerToken, `💬 ${commenterName || "Someone"} commented`, preview || "on your clip", { screen: "Feed", videoId });
                }
            }
        }
        // 2. Notify parent comment author on reply
        if (parentId) {
            const parentSnap = await db.collection("comments").doc(parentId).get();
            if (parentSnap.exists) {
                const parentAuthorId = parentSnap.data().userId;
                if (parentAuthorId && parentAuthorId !== commenterId) {
                    const parentAuthorSnap = await db.collection("users").doc(parentAuthorId).get();
                    const parentToken = (_f = parentAuthorSnap.data()) === null || _f === void 0 ? void 0 : _f.fcmToken;
                    if (parentToken) {
                        await sendPushNotif(parentToken, `↩️ ${commenterName || "Someone"} replied`, preview || "to your comment", { screen: "Feed", videoId });
                    }
                }
            }
        }
    }
    catch (e) {
        v2_1.logger.warn("onCommentCreated push failed:", e);
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED 1 — reconcileGGCounts (toutes les 6h)
// Vérifie que le ggCount de chaque vidéo correspond au nombre réel de docs GG.
// Corrige les écarts silencieusement.
// ─────────────────────────────────────────────────────────────────────────────
exports.reconcileGGCounts = (0, scheduler_1.onSchedule)({ schedule: "every 6 hours", region: "us-central1" }, async () => {
    v2_1.logger.info("reconcileGGCounts: démarrage...");
    let corrected = 0;
    const videosSnap = await db.collection("videos").get();
    for (const vDoc of videosSnap.docs) {
        const vData = vDoc.data();
        const storedCount = vData.ggCount || 0;
        // Recompte les GGs réels
        const realSnap = await db.collection("ggs")
            .where("videoId", "==", vDoc.id)
            .get();
        const realCount = realSnap.size;
        if (realCount !== storedCount) {
            await vDoc.ref.update({ ggCount: realCount });
            corrected++;
            v2_1.logger.warn(`reconcileGGCounts: vidéo ${vDoc.id} — stocké=${storedCount} réel=${realCount} → corrigé`);
        }
    }
    v2_1.logger.info(`reconcileGGCounts: terminé — ${corrected} vidéo(s) corrigée(s) sur ${videosSnap.size}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED 2 — reconcileUserStats (1x/jour à 3h du matin UTC)
// Vérifie et corrige pour chaque user :
//   - ggReceived (somme réelle des ggCount de ses vidéos)
//   - followers (count réel des docs follows)
//   - streakLevel (recalculé depuis streakPoints)
//   - gaPoints et streakPoints (jamais négatifs)
// ─────────────────────────────────────────────────────────────────────────────
exports.reconcileUserStats = (0, scheduler_1.onSchedule)({ schedule: "0 3 * * *", region: "us-central1" }, async () => {
    var _a;
    v2_1.logger.info("reconcileUserStats: démarrage...");
    let corrected = 0;
    const usersSnap = await db.collection("users").get();
    for (const uDoc of usersSnap.docs) {
        const uData = uDoc.data();
        const updates = {};
        // 1. ggReceived réel
        const videosSnap = await db.collection("videos")
            .where("userId", "==", uDoc.id)
            .get();
        const realGGReceived = videosSnap.docs.reduce((sum, d) => sum + (d.data().ggCount || 0), 0);
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
                if ((earningsSnap.data().subscriberCount || 0) !== realFanbaseSubscribers) {
                    await earningsRef.update({ subscriberCount: realFanbaseSubscribers });
                }
            }
            else if (realFanbaseSubscribers > 0) {
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
        if ((uData.gaPoints || 0) < 0)
            updates.gaPoints = 0;
        if ((uData.streakPoints || 0) < 0)
            updates.streakPoints = 0;
        // 5. streakLevel recalculé
        const streakPts = (_a = updates.streakPoints) !== null && _a !== void 0 ? _a : (uData.streakPoints || 0);
        const correctLevel = calcStreakLevel(streakPts);
        if (correctLevel !== uData.streakLevel) {
            updates.streakLevel = correctLevel;
        }
        if (Object.keys(updates).length > 0) {
            await uDoc.ref.update(updates);
            corrected++;
            v2_1.logger.info(`reconcileUserStats: user ${uDoc.id} (${uData.username}) — corrections: ${JSON.stringify(updates)}`);
        }
    }
    v2_1.logger.info(`reconcileUserStats: terminé — ${corrected} user(s) corrigé(s) sur ${usersSnap.size}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED 3 — cleanOrphanData (1x/semaine, dimanche 4h UTC)
// Supprime les docs orphelins qui pointent vers des entités supprimées :
//   - GGs dont la vidéo n'existe plus
//   - Notifications dont la vidéo référencée n'existe plus
//   - fanbase_subscriptions dont le créateur n'existe plus
// ─────────────────────────────────────────────────────────────────────────────
exports.cleanOrphanData = (0, scheduler_1.onSchedule)({ schedule: "0 4 * * 0", region: "us-central1" }, async () => {
    v2_1.logger.info("cleanOrphanData: démarrage...");
    let cleaned = 0;
    // 1. GGs orphelins
    const ggsSnap = await db.collection("ggs").get();
    const batch1 = db.batch();
    for (const ggDoc of ggsSnap.docs) {
        const videoId = ggDoc.data().videoId;
        if (!videoId) {
            batch1.delete(ggDoc.ref);
            cleaned++;
            continue;
        }
        const vSnap = await db.collection("videos").doc(videoId).get();
        if (!vSnap.exists) {
            batch1.delete(ggDoc.ref);
            cleaned++;
        }
    }
    await batch1.commit();
    // 2. Notifications orphelines (liées à une vidéo supprimée)
    const notifsSnap = await db.collection("notifications")
        .where("videoId", "!=", "")
        .get();
    const batch2 = db.batch();
    for (const nDoc of notifsSnap.docs) {
        const videoId = nDoc.data().videoId;
        if (!videoId)
            continue;
        const vSnap = await db.collection("videos").doc(videoId).get();
        if (!vSnap.exists) {
            batch2.delete(nDoc.ref);
            cleaned++;
        }
    }
    await batch2.commit();
    // 3. fanbase_subscriptions orphelines (créateur supprimé)
    const subsSnap = await db.collection("fanbase_subscriptions").get();
    const batch3 = db.batch();
    for (const sDoc of subsSnap.docs) {
        const creatorId = sDoc.data().creatorId;
        if (!creatorId) {
            batch3.delete(sDoc.ref);
            cleaned++;
            continue;
        }
        const uSnap = await db.collection("users").doc(creatorId).get();
        if (!uSnap.exists) {
            batch3.delete(sDoc.ref);
            cleaned++;
        }
    }
    await batch3.commit();
    v2_1.logger.info(`cleanOrphanData: terminé — ${cleaned} doc(s) orphelin(s) supprimé(s)`);
});
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
async function sendPushNotif(token, title, body, data) {
    if (!token || !expo_server_sdk_1.Expo.isExpoPushToken(token)) {
        v2_1.logger.warn("sendPushNotif: token invalide ou absent");
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
            v2_1.logger.warn(`sendPushNotif error: ${ticket.message}`);
            return false;
        }
        return true;
    }
    catch (e) {
        v2_1.logger.warn(`sendPushNotif failed: ${e}`);
        return false;
    }
}
// Vérifie si une notif de ce type a déjà été envoyée à cet user cette semaine
async function isThrottled(userId, type) {
    var _a, _b, _c;
    const key = `${userId}_${type}`;
    const snap = await db.collection("notifThrottle").doc(key).get();
    if (!snap.exists)
        return false;
    const sentAt = ((_c = (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.sentAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) || 0;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - sentAt < weekMs;
}
async function setThrottle(userId, type) {
    const key = `${userId}_${type}`;
    await db.collection("notifThrottle").doc(key).set({
        userId, type, sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
// Retourne un tableau shufflé (tirage aléatoire parmi une liste)
function shuffle(arr) {
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
exports.notifInactiveUsers = (0, scheduler_1.onSchedule)({ schedule: "0 18 * * 1,4", region: "us-central1", timeoutSeconds: 300 }, async () => {
    v2_1.logger.info("notifInactiveUsers: start");
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
        if (await isThrottled(uDoc.id, "inactive"))
            continue;
        const msg = messages[Math.floor(Math.random() * messages.length)];
        const ok = await sendPushNotif(u.fcmToken, msg.t, msg.b, { screen: "Feed" });
        if (ok) {
            await setThrottle(uDoc.id, "inactive");
            sent++;
        }
    }
    v2_1.logger.info(`notifInactiveUsers: sent ${sent}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 2 — Pas d'upload cette semaine (mercredi à 19h UTC)
// Cible : users avec au moins 1 clip déjà publié, mais aucun cette semaine
// ─────────────────────────────────────────────────────────────────────────────
exports.notifUploadNudge = (0, scheduler_1.onSchedule)({ schedule: "0 19 * * 3,5", region: "us-central1", timeoutSeconds: 300 }, // mercredi + vendredi
async () => {
    v2_1.logger.info("notifUploadNudge: start");
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
        if (await isThrottled(uDoc.id, "upload_nudge"))
            continue;
        // Vérifie qu'il a au moins 1 clip total mais aucun cette semaine
        const totalSnap = await db.collection("videos").where("userId", "==", uDoc.id).limit(1).get();
        if (totalSnap.empty)
            continue;
        const recentSnap = await db.collection("videos")
            .where("userId", "==", uDoc.id)
            .where("createdAt", ">", weekAgo)
            .limit(1)
            .get();
        if (!recentSnap.empty)
            continue; // a déjà uploadé cette semaine
        const msg = messages[Math.floor(Math.random() * messages.length)];
        const ok = await sendPushNotif(u.fcmToken, msg.t, msg.b, { screen: "Upload" });
        if (ok) {
            await setThrottle(uDoc.id, "upload_nudge");
            sent++;
        }
    }
    v2_1.logger.info(`notifUploadNudge: sent ${sent}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 3 — Rankings chauffe (vendredi à 20h UTC)
// Cible : users dans le top 20 du ranking mensuel
// Message personnalisé : "Tu es à X pts de dépasser {username}"
// ─────────────────────────────────────────────────────────────────────────────
exports.notifRankingHeat = (0, scheduler_1.onSchedule)({ schedule: "0 20 * * 5", region: "us-central1", timeoutSeconds: 300 }, async () => {
    v2_1.logger.info("notifRankingHeat: start");
    // Récupère le top 25 par ggReceived du mois en cours
    const usersSnap = await db.collection("users")
        .orderBy("ggReceived", "desc")
        .limit(25)
        .get();
    const ranked = usersSnap.docs.map((d, i) => {
        const data = d.data();
        return {
            id: d.id,
            rank: i + 1,
            fcmToken: (data.fcmToken || ''),
            ggReceived: (data.ggReceived || 0),
            username: (data.username || ''),
        };
    });
    let sent = 0;
    for (let i = 1; i < ranked.length; i++) {
        const user = ranked[i];
        const above = ranked[i - 1];
        if (!user.fcmToken)
            continue;
        if (await isThrottled(user.id, "ranking_heat"))
            continue;
        const gap = (above.ggReceived || 0) - (user.ggReceived || 0);
        const title = "🏆 Rankings are heating up!";
        const body = gap <= 5
            ? `You're tied with ${above.username}! Post a clip to take #${above.rank}! 🔥`
            : `Only ${gap} GGs separate you from ${above.username} (#${above.rank}). Upload now!`;
        const ok = await sendPushNotif(user.fcmToken, title, body, { screen: "Rankings" });
        if (ok) {
            await setThrottle(user.id, "ranking_heat");
            sent++;
        }
    }
    v2_1.logger.info(`notifRankingHeat: sent ${sent}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 4 — Weekend push (samedi à 14h UTC)
// Cible : tous les users actifs (lastSeen < 7 jours), message motivant aléatoire
// Groupe aléatoire de 30% des users (pas tout le monde, évite le spam)
// ─────────────────────────────────────────────────────────────────────────────
exports.notifWeekend = (0, scheduler_1.onSchedule)({ schedule: "0 14 * * 6", region: "us-central1", timeoutSeconds: 300 }, async () => {
    v2_1.logger.info("notifWeekend: start");
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
        if (await isThrottled(uDoc.id, "weekend"))
            continue;
        const msg = messages[Math.floor(Math.random() * messages.length)];
        const ok = await sendPushNotif(u.fcmToken, msg.t, msg.b, { screen: "Feed" });
        if (ok) {
            await setThrottle(uDoc.id, "weekend");
            sent++;
        }
    }
    v2_1.logger.info(`notifWeekend: sent ${sent}`);
});
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
exports.assignMonthlyChampion = (0, scheduler_1.onSchedule)({ schedule: "1 0 1 * *", region: "us-central1", timeoutSeconds: 120 }, async () => {
    v2_1.logger.info("assignMonthlyChampion: start");
    // 1. Trouve le top 1 par ggReceived
    const topSnap = await db.collection("users")
        .orderBy("ggReceived", "desc")
        .limit(1)
        .get();
    if (topSnap.empty) {
        v2_1.logger.warn("assignMonthlyChampion: no users found");
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
        if (oldDoc.id === newChampDoc.id)
            continue; // même personne → on garde
        const oldData = oldDoc.data();
        // Retire les frames champion
        const cleanFrames = (oldData.ownedFrames || []).filter((f) => f !== "champion");
        const cleanVideoFrames = (oldData.ownedVideoFrames || []).filter((f) => f !== "vf_champion");
        batch.update(oldDoc.ref, Object.assign({ isChampion: false, ownedFrames: cleanFrames, ownedVideoFrames: cleanVideoFrames }, (oldData.equippedFrame === "champion" ? { equippedFrame: "none" } : {})));
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
        if (u.id !== newChampDoc.id)
            batch.update(u.ref, { isCurrentLeader: false });
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
        await sendPushNotif(newChampData.fcmToken, "👑 You are the Champion!", `You won the GG Rankings for ${monthKey}! +500 GA Points awarded. Your exclusive Champion frame is now active. ⚡`, { screen: "Rankings" });
    }
    // 7. Notif communauté — tout le monde sait qui est le champion
    const allUsersForNotif = await db.collection("users")
        .where("fcmToken", "!=", "")
        .limit(500)
        .get();
    const communityBatch = db.batch();
    const champUsername = newChampData.username || "A player";
    for (const uDoc of allUsersForNotif.docs) {
        if (uDoc.id === newChampDoc.id)
            continue; // le champion a déjà sa notif perso
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
    await Promise.all(pushTargets.map(u => sendPushNotif(u.data().fcmToken, "👑 New Champion!", `${champUsername} won the GG Rankings for ${monthKey}! Can you dethrone them? 🔥`, { screen: "Rankings" }).catch(() => { })));
    v2_1.logger.info(`assignMonthlyChampion: ${champUsername} is Champion of ${monthKey} — community notified`);
});
// ─────────────────────────────────────────────────────────────────────────────
// UPDATE LEADER — Toutes les heures (met à jour isCurrentLeader)
// Trouve le 1er du ranking en cours et met isCurrentLeader=true
// ─────────────────────────────────────────────────────────────────────────────
exports.updateCurrentLeader = (0, scheduler_1.onSchedule)({ schedule: "*/15 * * * *", region: "us-central1", timeoutSeconds: 60 }, async () => {
    const topSnap = await db.collection("users")
        .orderBy("ggReceived", "desc")
        .limit(1)
        .get();
    if (topSnap.empty)
        return;
    const leaderId = topSnap.docs[0].id;
    const leaderGG = topSnap.docs[0].data().ggReceived || 0;
    const batch = db.batch();
    // Retire le badge à tous les anciens leaders qui ne sont plus #1
    const oldLeaderSnap = await db.collection("users").where("isCurrentLeader", "==", true).get();
    for (const d of oldLeaderSnap.docs) {
        if (d.id !== leaderId)
            batch.update(d.ref, { isCurrentLeader: false });
    }
    // Attribue au nouveau (seulement s'il a au moins 1 GG)
    if (leaderGG > 0) {
        batch.update(topSnap.docs[0].ref, { isCurrentLeader: true });
    }
    await batch.commit();
    v2_1.logger.info(`updateCurrentLeader: leader is ${topSnap.docs[0].data().username} (${leaderGG} GG)`);
});
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
exports.decayStreakPoints = (0, scheduler_1.onSchedule)({ schedule: "0 4 * * *", region: "us-central1", timeoutSeconds: 120 }, async () => {
    var _a;
    v2_1.logger.info("decayStreakPoints: start");
    const now = new Date();
    // Grâce de 3 jours : on ne touche que les users dont lastSeen > 3 jours
    const graceCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const usersSnap = await db.collection("users")
        .where("lastSeen", "<", graceCutoff)
        .get();
    if (usersSnap.empty) {
        v2_1.logger.info("decayStreakPoints: no inactive users found");
        return;
    }
    const DECAY_PER_DAY = 500;
    const batch = db.batch();
    let count = 0;
    for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        const streakPts = data.streakPoints || 0;
        // Déjà à 0 → rien à faire
        if (streakPts <= 0)
            continue;
        // Calcule le nombre de jours d'absence au-delà de la grâce
        const lastSeen = ((_a = data.lastSeen) === null || _a === void 0 ? void 0 : _a.toDate) ? data.lastSeen.toDate() : new Date(data.lastSeen);
        const daysSinceLogin = Math.floor((now.getTime() - lastSeen.getTime()) / (24 * 60 * 60 * 1000));
        const penaltyDays = Math.max(0, daysSinceLogin - 3);
        if (penaltyDays <= 0)
            continue;
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
    v2_1.logger.info(`decayStreakPoints: ${count} users penalized (-${DECAY_PER_DAY} pts each)`);
});
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
exports.dailyLeaderBonus = (0, scheduler_1.onSchedule)({
    schedule: "every day 01:00",
    timeZone: "America/Toronto",
    memory: "256MiB",
}, async () => {
    const DAILY_LEADER_POINTS = 10; // 10 pts/day = ~310 pts/month for champion
    v2_1.logger.info("dailyLeaderBonus: start");
    try {
        // Find current leader
        const leaderSnap = await db
            .collection("users")
            .where("isCurrentLeader", "==", true)
            .limit(1)
            .get();
        if (leaderSnap.empty) {
            v2_1.logger.info("dailyLeaderBonus: no current leader found");
            return;
        }
        const leaderDoc = leaderSnap.docs[0];
        const leader = leaderDoc.data();
        // Don't give bonus to excluded account types
        const EXCLUDED = ["creator", "gameconic"];
        if (EXCLUDED.includes(leader.accountType)) {
            v2_1.logger.info(`dailyLeaderBonus: ${leader.username} is ${leader.accountType} — skipped`);
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
        v2_1.logger.info(`dailyLeaderBonus: ${leader.username} received ${DAILY_LEADER_POINTS} pts`);
    }
    catch (e) {
        v2_1.logger.error("dailyLeaderBonus error:", e);
    }
});
// SCHEDULED — checkExpiredSubscriptions (daily at 2h UTC)
// Detects Legendary subscriptions that have expired and downgrades users to free.
// This handles cases where RevenueCat webhook fails or is delayed.
exports.checkExpiredSubscriptions = (0, scheduler_1.onSchedule)({ schedule: "every day 02:00", timeZone: "America/Toronto", memory: "256MiB" }, async () => {
    v2_1.logger.info("checkExpiredSubscriptions: start");
    try {
        const now = admin.firestore.Timestamp.now();
        // Find active subscriptions whose period has ended
        const expiredSnap = await db.collection("subscriptions")
            .where("status", "==", "active")
            .where("currentPeriodEnd", "<=", now)
            .where("isTest", "==", false)
            .get();
        if (expiredSnap.empty) {
            v2_1.logger.info("checkExpiredSubscriptions: none expired");
            return;
        }
        v2_1.logger.info(`checkExpiredSubscriptions: ${expiredSnap.size} expired`);
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
        v2_1.logger.info(`checkExpiredSubscriptions: ${expiredSnap.size} users downgraded`);
    }
    catch (e) {
        v2_1.logger.error("checkExpiredSubscriptions error:", e);
    }
});
exports.reshuffleFeedOrder = (0, scheduler_1.onSchedule)({
    schedule: "every 6 hours",
    timeZone: "America/Toronto",
    memory: "256MiB",
}, async () => {
    v2_1.logger.info("reshuffleFeedOrder: start");
    const snap = await db.collection("videos")
        .where("contentType", "==", "clip")
        .get();
    if (snap.empty) {
        v2_1.logger.info("reshuffleFeedOrder: no videos found");
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
    v2_1.logger.info(`reshuffleFeedOrder: ${count} videos reshuffled in ${batchCount} batch(es)`);
});
// ─────────────────────────────────────────────────────────────────────────────
// HTTP — adminCleanup
// Réconciliation MANUELLE à la demande : recompte tous les ggCount des vidéos,
// les ggReceived des users, les commentsCount, et met à jour le leader.
// Appel : https://us-central1-gamingactions-app.cloudfunctions.net/adminCleanup?key=SECRET
// ─────────────────────────────────────────────────────────────────────────────
exports.adminCleanup = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 540 }, async (req, res) => {
    // Protection simple par clé (change SECRET pour ta propre valeur)
    const SECRET = "ga_cleanup_2026";
    if (req.query.key !== SECRET) {
        res.status(403).send("Forbidden");
        return;
    }
    let ggFixed = 0, commentsFixed = 0, ggReceivedFixed = 0;
    // 1. Recompte ggCount + commentsCount de chaque vidéo
    const videosSnap = await db.collection("videos").get();
    const creatorTotals = {};
    for (const vDoc of videosSnap.docs) {
        const vData = vDoc.data();
        const updates = {};
        // GG réels
        const ggSnap = await db.collection("ggs").where("videoId", "==", vDoc.id).get();
        const realGG = ggSnap.size;
        if (realGG !== (vData.ggCount || 0)) {
            updates.ggCount = realGG;
            ggFixed++;
        }
        // Commentaires réels
        const cSnap = await db.collection("comments").where("videoId", "==", vDoc.id).get();
        const realComments = cSnap.size;
        if (realComments !== (vData.commentsCount || 0)) {
            updates.commentsCount = realComments;
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
    // 3. Met à jour le leader (le vrai #1)
    const topSnap = await db.collection("users").orderBy("ggReceived", "desc").limit(1).get();
    let leaderName = "none";
    if (!topSnap.empty) {
        const leaderId = topSnap.docs[0].id;
        const leaderGG = topSnap.docs[0].data().ggReceived || 0;
        const batch = db.batch();
        const oldLeaders = await db.collection("users").where("isCurrentLeader", "==", true).get();
        for (const d of oldLeaders.docs) {
            if (d.id !== leaderId)
                batch.update(d.ref, { isCurrentLeader: false });
        }
        if (leaderGG > 0) {
            batch.update(topSnap.docs[0].ref, { isCurrentLeader: true });
            leaderName = topSnap.docs[0].data().username || leaderId;
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
    v2_1.logger.info("adminCleanup done", result);
    res.status(200).json(result);
});
// ═════════════════════════════════════════════════════════════════════════════
// DATA MANAGEMENT — export/import jeux, genres et vidéos pour révision manuelle
// ═════════════════════════════════════════════════════════════════════════════
const CLEANUP_KEY = "ga_cleanup_2026";
// Échappe une valeur pour CSV (guillemets, virgules, retours ligne)
function csvCell(val) {
    if (val === null || val === undefined)
        return "";
    const s = String(val);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}
// ── EXPORT 1 : jeux + genres uniques utilisés dans les vidéos ─────────────────
// CSV: game, genre_actuel, nb_videos, genre_corrige (vide à remplir), nouveau_nom (vide)
exports.exportGamesGenres = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 300 }, async (req, res) => {
    if (req.query.key !== CLEANUP_KEY) {
        res.status(403).send("Forbidden");
        return;
    }
    const videosSnap = await db.collection("videos").get();
    // Compte par (game|genre)
    const combos = {};
    videosSnap.docs.forEach((d) => {
        const v = d.data();
        const game = v.game || "(vide)";
        const genre = v.genre || "(vide)";
        const key = `${game}|||${genre}`;
        if (!combos[key])
            combos[key] = { game, genre, count: 0 };
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
});
// ── EXPORT 2 : toutes les vidéos avec colonnes éditables ──────────────────────
// CSV: id, title, game, genre, console, contentType, username, ggCount,
//      commentsCount, createdAt, delete(vide), game_corrige(vide), genre_corrige(vide)
exports.exportVideos = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 300 }, async (req, res) => {
    if (req.query.key !== CLEANUP_KEY) {
        res.status(403).send("Forbidden");
        return;
    }
    const videosSnap = await db.collection("videos").orderBy("createdAt", "desc").get();
    let csv = "id,title,game,genre,console,contentType,username,ggCount,commentsCount,createdAt,videoUrl,delete,game_corrige,genre_corrige\n";
    videosSnap.docs.forEach((d) => {
        var _a;
        const v = d.data();
        const created = ((_a = v.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) ? v.createdAt.toDate().toISOString() : "";
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
            "", // delete
            "", // game_corrige
            "", // genre_corrige
        ].join(",") + "\n";
    });
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="videos.csv"');
    res.status(200).send(csv);
});
// ── IMPORT : applique les corrections depuis le CSV vidéos révisé ─────────────
// Reçoit le CSV en POST body (text/plain). Pour chaque ligne :
//   - si delete = "1"/"x"/"yes" → supprime la vidéo (+ ses ggs et comments)
//   - si game_corrige non vide → met à jour game
//   - si genre_corrige non vide → met à jour genre
// Réponse JSON avec le résumé.
exports.importVideoUpdates = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 540 }, async (req, res) => {
    var _a;
    if (req.query.key !== CLEANUP_KEY) {
        res.status(403).send("Forbidden");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Use POST with CSV body");
        return;
    }
    const csv = typeof req.body === "string" ? req.body : (((_a = req.rawBody) === null || _a === void 0 ? void 0 : _a.toString("utf-8")) || "");
    if (!csv) {
        res.status(400).json({ error: "Empty CSV body" });
        return;
    }
    // Parse CSV simple (gère les guillemets)
    const parseLine = (line) => {
        const out = [];
        let cur = "", inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (inQ) {
                if (c === '"' && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                }
                else if (c === '"')
                    inQ = false;
                else
                    cur += c;
            }
            else {
                if (c === '"')
                    inQ = true;
                else if (c === ",") {
                    out.push(cur);
                    cur = "";
                }
                else
                    cur += c;
            }
        }
        out.push(cur);
        return out;
    };
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
        res.status(400).json({ error: "No data rows" });
        return;
    }
    const header = parseLine(lines[0]).map((h) => h.trim());
    const idx = (name) => header.indexOf(name);
    const iId = idx("id");
    const iDelete = idx("delete");
    const iGameCor = idx("game_corrige");
    const iGenreCor = idx("genre_corrige");
    if (iId === -1) {
        res.status(400).json({ error: "Missing 'id' column" });
        return;
    }
    let deleted = 0, gameUpdated = 0, genreUpdated = 0, errors = 0;
    const DELETE_VALS = new Set(["1", "x", "X", "yes", "oui", "true", "delete"]);
    for (let i = 1; i < lines.length; i++) {
        try {
            const cells = parseLine(lines[i]);
            const id = (cells[iId] || "").trim();
            if (!id)
                continue;
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
            const updates = {};
            if (iGameCor >= 0) {
                const g = (cells[iGameCor] || "").trim();
                if (g) {
                    updates.game = g;
                    gameUpdated++;
                }
            }
            if (iGenreCor >= 0) {
                const gn = (cells[iGenreCor] || "").trim();
                if (gn) {
                    updates.genre = gn;
                    genreUpdated++;
                }
            }
            if (Object.keys(updates).length > 0) {
                await db.collection("videos").doc(id).update(updates);
            }
        }
        catch (e) {
            errors++;
            v2_1.logger.warn(`importVideoUpdates: erreur ligne ${i}`, e);
        }
    }
    const result = { ok: true, deleted, gameUpdated, genreUpdated, errors, totalRows: lines.length - 1 };
    v2_1.logger.info("importVideoUpdates done", result);
    res.status(200).json(result);
});
// ── EXPORT 3 : détecte les doublons potentiels pour aider la révision ─────────
// Groupe les vidéos par (videoUrl) ou (publicId) ou (title+userId) identiques.
// CSV: groupe, id, title, username, game, ggCount, createdAt, suggestion_delete
exports.exportDuplicates = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 300 }, async (req, res) => {
    if (req.query.key !== CLEANUP_KEY) {
        res.status(403).send("Forbidden");
        return;
    }
    const videosSnap = await db.collection("videos").get();
    const all = videosSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    // Groupe par publicId (même fichier Cloudinary = vrai doublon)
    const byKey = {};
    all.forEach((v) => {
        // Clé de doublon : publicId si présent, sinon videoUrl, sinon title+userId
        const key = v.publicId || v.videoUrl || `${v.title}__${v.userId}`;
        if (!key)
            return;
        if (!byKey[key])
            byKey[key] = [];
        byKey[key].push(v);
    });
    let csv = "groupe,id,title,username,game,genre,ggCount,createdAt,suggestion_delete\n";
    let groupNum = 0;
    for (const key of Object.keys(byKey)) {
        const group = byKey[key];
        if (group.length < 2)
            continue; // pas un doublon
        groupNum++;
        // Garde celui avec le + de GG, suggère delete pour les autres
        group.sort((a, b) => (b.ggCount || 0) - (a.ggCount || 0));
        group.forEach((v, i) => {
            var _a;
            const created = ((_a = v.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) ? v.createdAt.toDate().toISOString() : "";
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
});
// ═════════════════════════════════════════════════════════════════════════════
// MUX VIDEO INTEGRATION
// Les clés Mux ne sont jamais dans l'app mobile — elles vivent ici, côté serveur.
// L'app appelle uploadMuxGetUrl pour obtenir une URL d'upload temporaire (1h),
// puis uploade directement depuis l'app vers Mux. Ensuite elle appelle
// muxWebhook quand Mux a fini le transcodage pour mettre à jour Firestore.
// ═════════════════════════════════════════════════════════════════════════════
const MUX_TOKEN_ID = "de3558c1-e46f-4cc7-81da-5683fecf09cf"; // ← colle ici
const MUX_TOKEN_SECRET = "oDSQSeS/iShNpWXskkSdx7pMokiJFB2I0r/+ImtwY015DVqbs5Jo/r+UFX8zpWdgsgKDXxljjuZ"; // ← colle ici
const MUX_BASE_URL = "https://api.mux.com";
const muxAuth = Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString("base64");
// ── 1. L'app appelle cette fonction pour obtenir une URL d'upload Mux ─────
// Retourne { uploadUrl, uploadId } → l'app uploade la vidéo directement vers uploadUrl
// puis sauvegarde uploadId dans Firestore pour tracker le statut.
exports.muxGetUploadUrl = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 30, cors: true }, async (req, res) => {
    var _a;
    if (req.method !== "POST") {
        res.status(405).send("POST only");
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
        const data = await response.json();
        if (!response.ok) {
            v2_1.logger.error("muxGetUploadUrl error:", data);
            res.status(500).json({ error: ((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || "Mux error" });
            return;
        }
        res.status(200).json({
            uploadUrl: data.data.url,
            uploadId: data.data.id,
        });
    }
    catch (e) {
        v2_1.logger.error("muxGetUploadUrl exception:", e);
        res.status(500).json({ error: e.message });
    }
});
// ── 2. Webhook Mux → notifié quand la vidéo est prête ────────────────────
// Mux appelle cette URL quand le transcodage est terminé.
// Configure dans dashboard.mux.com → Settings → Webhooks
// URL : https://us-central1-gamingactions-app.cloudfunctions.net/muxWebhook
exports.muxWebhook = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 60 }, async (req, res) => {
    var _a, _b;
    if (req.method !== "POST") {
        res.status(405).send("POST only");
        return;
    }
    const event = req.body;
    const type = event === null || event === void 0 ? void 0 : event.type;
    const data = event === null || event === void 0 ? void 0 : event.data;
    // On s'intéresse aux événements asset.ready (transcodage terminé)
    if (type !== "video.asset.ready") {
        res.status(200).send("ignored");
        return;
    }
    const assetId = data === null || data === void 0 ? void 0 : data.id;
    const uploadId = data === null || data === void 0 ? void 0 : data.upload_id;
    const playbackId = (_b = (_a = data === null || data === void 0 ? void 0 : data.playback_ids) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id;
    const duration = data === null || data === void 0 ? void 0 : data.duration;
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
            v2_1.logger.warn(`muxWebhook: no video found for uploadId ${uploadId}`);
            res.status(200).send("not found");
            return;
        }
        const videoRef = videoSnap.docs[0].ref;
        await videoRef.update({
            muxAssetId: assetId,
            muxPlaybackId: playbackId,
            duration: Math.round(duration || 0),
            muxStatus: "ready",
            // thumbnail générée automatiquement par Mux — pas de quota de transformation
            thumbnail: `https://image.mux.com/${playbackId}/thumbnail.jpg?time=3&width=400&height=225&fit_mode=crop`,
            videoUrl: `https://stream.mux.com/${playbackId}.m3u8`, // HLS adaptatif
        });
        v2_1.logger.info(`muxWebhook: video ${videoSnap.docs[0].id} ready — playbackId ${playbackId}`);
        res.status(200).send("ok");
    }
    catch (e) {
        v2_1.logger.error("muxWebhook error:", e);
        res.status(500).send("error");
    }
});
// ── 3. Migration : uploade les vidéos Cloudinary existantes vers Mux ─────
// Lance une fois pour migrer les 521 vidéos existantes.
// Fonctionnement : lit toutes les vidéos Cloudinary dans Firestore,
// pour chacune : télécharge depuis Cloudinary → uploade vers Mux → met à jour Firestore.
// Sécurisé par clé. Peut être relancé (skip les vidéos déjà migrées).
exports.migrateCloudinaryToMux = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 540, memory: "1GiB" }, async (req, res) => {
    var _a;
    if (req.query.key !== "ga_cleanup_2026") {
        res.status(403).send("Forbidden");
        return;
    }
    // dry_run=true pour simuler sans modifier Firestore
    const dryRun = req.query.dry_run === "true";
    const videosSnap = await db.collection("videos").get();
    let migrated = 0, skipped = 0, failed = 0;
    const failures = [];
    for (const vDoc of videosSnap.docs) {
        const v = vDoc.data();
        // Skip si déjà migré vers Mux
        if (v.muxPlaybackId) {
            skipped++;
            continue;
        }
        // Skip si pas d'URL Cloudinary
        if (!v.videoUrl || !v.videoUrl.includes("cloudinary")) {
            skipped++;
            continue;
        }
        try {
            if (dryRun) {
                migrated++;
                continue;
            }
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
            const uploadData = await uploadResp.json();
            if (!uploadResp.ok)
                throw new Error(((_a = uploadData.error) === null || _a === void 0 ? void 0 : _a.message) || "Mux upload create failed");
            const muxUploadUrl = uploadData.data.url;
            const muxUploadId = uploadData.data.id;
            // Étape 2 : télécharger la vidéo depuis Cloudinary
            // On reconstruit l'URL originale sans q_auto pour éviter une transformation
            const cleanUrl = v.videoUrl.replace("/upload/q_auto/", "/upload/");
            const videoResp = await fetch(cleanUrl);
            if (!videoResp.ok)
                throw new Error(`Cloudinary fetch failed: ${videoResp.status}`);
            const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
            // Étape 3 : pusher la vidéo vers Mux
            const muxPutResp = await fetch(muxUploadUrl, {
                method: "PUT",
                headers: { "Content-Type": "video/mp4" },
                body: videoBuffer,
            });
            if (!muxPutResp.ok)
                throw new Error(`Mux PUT failed: ${muxPutResp.status}`);
            // Étape 4 : marquer le document Firestore (muxPlaybackId sera rempli par le webhook)
            await vDoc.ref.update({
                muxUploadId,
                muxStatus: "processing",
            });
            migrated++;
            v2_1.logger.info(`migrateCloudinaryToMux: ${vDoc.id} → upload ${muxUploadId}`);
            // Pause de 200ms pour ne pas saturer l'API Mux
            await new Promise((r) => setTimeout(r, 200));
        }
        catch (e) {
            failed++;
            failures.push(`${vDoc.id}: ${e.message}`);
            v2_1.logger.error(`migrateCloudinaryToMux: ${vDoc.id} failed`, e.message);
        }
    }
    res.status(200).json({
        ok: true, dryRun, migrated, skipped, failed,
        total: videosSnap.size, failures: failures.slice(0, 10),
        note: dryRun
            ? "Dry run — aucune modification. Relance sans dry_run=true pour migrer."
            : "Migration lancée. Le webhook Mux remplira muxPlaybackId pour chaque vidéo transcodée (quelques minutes par vidéo).",
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// NOTIF 5 — Ton rang dans le classement (lundi et jeudi à 17h UTC)
// Cible : tous les users avec un token, message personnalisé avec leur rang
// ─────────────────────────────────────────────────────────────────────────────
exports.notifYourRank = (0, scheduler_1.onSchedule)({ schedule: "0 17 * * 1,4", region: "us-central1", timeoutSeconds: 300 }, async () => {
    v2_1.logger.info("notifYourRank: start");
    // Récupère tous les users triés par ggReceived
    const usersSnap = await db.collection("users")
        .orderBy("ggReceived", "desc")
        .where("fcmToken", "!=", "")
        .limit(500)
        .get();
    const ranked = usersSnap.docs.map((d, i) => (Object.assign({ id: d.id, rank: i + 1 }, d.data())));
    let sent = 0;
    for (let i = 0; i < ranked.length; i++) {
        const user = ranked[i];
        if (!user.fcmToken)
            continue;
        if (await isThrottled(user.id, "your_rank"))
            continue;
        const rank = user.rank;
        const gg = user.ggReceived || 0;
        let title = "🏆 Your ranking";
        let body = "";
        if (rank === 1) {
            const r1msgs = [
                `👑 You're #1 with ${gg} GGs! Defend your throne this week!`,
                `🔥 Still #1! ${gg} GGs and counting — nobody can touch you yet!`,
                `⚡ Leader status confirmed! ${gg} GGs. Stay sharp, challengers are coming!`,
            ];
            body = r1msgs[Math.floor(Math.random() * r1msgs.length)];
        }
        else {
            const above = ranked[i - 1];
            const gap = (above.ggReceived || 0) - gg;
            if (gap <= 3) {
                const closemsgs = [
                    `🔥 You're #${rank} — only ${gap} GG${gap > 1 ? "s" : ""} from #${rank - 1}! Push now!`,
                    `⚡ SO CLOSE! ${gap} GG${gap > 1 ? "s" : ""} and you pass ${above.username}!`,
                    `💥 Almost there! ${gap} GG${gap > 1 ? "s" : ""} to grab #${rank - 1}!`,
                ];
                body = closemsgs[Math.floor(Math.random() * closemsgs.length)];
            }
            else {
                const farmsgs = [
                    `📊 You're #${rank} with ${gg} GGs. Keep posting to climb higher!`,
                    `🎮 Rank #${rank} — drop more clips and earn those GGs!`,
                    `🏆 #${rank} this week. ${gg} GGs in the bag — more to come!`,
                ];
                body = farmsgs[Math.floor(Math.random() * farmsgs.length)];
            }
        }
        const ok = await sendPushNotif(user.fcmToken, title, body, { screen: "Rankings" });
        if (ok) {
            await setThrottle(user.id, "your_rank");
            sent++;
        }
    }
    v2_1.logger.info(`notifYourRank: sent ${sent}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER — onVideoCreated
// Push aux followers quand un user qu'ils suivent uploade un nouveau clip
// ─────────────────────────────────────────────────────────────────────────────
exports.onVideoCreated = (0, firestore_1.onDocumentWritten)("videos/{videoId}", async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const after = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after) === null || _b === void 0 ? void 0 : _b.data();
    const before = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.before) === null || _d === void 0 ? void 0 : _d.data();
    // Seulement sur création (pas update)
    if (!after || before)
        return;
    const creatorId = after.userId;
    const title = after.title || "New clip";
    if (!creatorId)
        return;
    try {
        // Récupère le nom du créateur
        const creatorSnap = await db.collection("users").doc(creatorId).get();
        const creatorName = ((_e = creatorSnap.data()) === null || _e === void 0 ? void 0 : _e.username) || "Someone";
        // Récupère tous les followers du créateur
        const followersSnap = await db.collection("follows")
            .where("followingId", "==", creatorId)
            .get();
        let sent = 0;
        for (const followDoc of followersSnap.docs) {
            const followerId = followDoc.data().followerId;
            if (!followerId || followerId === creatorId)
                continue;
            const followerSnap = await db.collection("users").doc(followerId).get();
            const token = (_f = followerSnap.data()) === null || _f === void 0 ? void 0 : _f.fcmToken;
            if (!token)
                continue;
            if (await isThrottled(followerId, `new_clip_${creatorId}`))
                continue;
            const ok = await sendPushNotif(token, `🎮 ${creatorName} just posted!`, `"${title}" — Come watch and give a GG!`, { screen: "Feed", videoId: event.params.videoId });
            if (ok) {
                await setThrottle(followerId, `new_clip_${creatorId}`);
                sent++;
            }
        }
        v2_1.logger.info(`onVideoCreated: ${creatorName} → ${sent} followers notified`);
    }
    catch (e) {
        v2_1.logger.warn("onVideoCreated push failed:", e);
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER — onMentionCreated (mention dans un commentaire)
// Push à la personne mentionnée via @username
// ─────────────────────────────────────────────────────────────────────────────
exports.onMentionNotif = (0, firestore_1.onDocumentWritten)("notifications/{notifId}", async (event) => {
    var _a, _b, _c, _d, _e;
    const after = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after) === null || _b === void 0 ? void 0 : _b.data();
    const before = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.before) === null || _d === void 0 ? void 0 : _d.data();
    if (!after || before)
        return; // création seulement
    // Types gérés : mention, comment_like, system
    if (!["mention", "comment_like"].includes(after.type))
        return;
    const { userId, fromUsername, text, videoId, type } = after;
    if (!userId)
        return;
    try {
        const userSnap = await db.collection("users").doc(userId).get();
        const token = (_e = userSnap.data()) === null || _e === void 0 ? void 0 : _e.fcmToken;
        if (!token)
            return;
        let title = "";
        let body = text || "";
        if (type === "mention") {
            title = `👋 ${fromUsername || "Someone"} mentioned you`;
        }
        else if (type === "comment_like") {
            title = `❤️ ${fromUsername || "Someone"} liked your comment`;
            body = text || "Check it out!";
        }
        if (title) {
            await sendPushNotif(token, title, body, { screen: "Feed", videoId });
        }
    }
    catch (e) {
        v2_1.logger.warn("onMentionNotif push failed:", e);
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// HTTP — broadcastPush
// Envoie un push à TOUS les users avec un fcmToken.
// Appelé depuis l'app admin après avoir créé les notifs Firestore.
// POST body: { title: string, body: string, screen?: string }
// Protégé par la même clé que adminCleanup.
// ─────────────────────────────────────────────────────────────────────────────
exports.broadcastPush = (0, https_1.onRequest)({ region: "us-central1", timeoutSeconds: 300, cors: true }, async (req, res) => {
    if (req.query.key !== "ga_cleanup_2026") {
        res.status(403).send("Forbidden");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("POST only");
        return;
    }
    const { title, body, screen } = req.body || {};
    if (!title || !body) {
        res.status(400).json({ error: "title and body required" });
        return;
    }
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
            if (!token)
                return;
            const ok = await sendPushNotif(token, title, body, { screen: screen || "Feed" });
            if (ok)
                sent++;
            else
                failed++;
        }));
    }
    v2_1.logger.info(`broadcastPush: sent=${sent} failed=${failed} title="${title}"`);
    res.status(200).json({ ok: true, sent, failed, total: docs.length });
});
// ─────────────────────────────────────────────────────────────────────────────
// STRIPE WEBHOOK — Gestion des abonnements Legendary via le site web
// ─────────────────────────────────────────────────────────────────────────────
const stripe_1 = __importDefault(require("stripe"));
const STRIPE_PRICE_ID_MONTHLY = "price_1Tmex2097oI4jieSjbbA3ds3";
const STRIPE_PRICE_ID_YEARLY = "price_1TmfVo097oI4jieSliHF5NNi";
// Webhook Stripe — reçoit les événements de paiement
exports.stripeWebhook = (0, https_1.onRequest)({ cors: true, region: "us-central1" }, async (req, res) => {
    var _a, _b, _c, _d;
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = new stripe_1.default(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        // Vérifie la signature du webhook
        const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
        if (STRIPE_WEBHOOK_SECRET) {
            event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
        }
        else {
            event = req.body;
        }
    }
    catch (err) {
        v2_1.logger.error("Stripe webhook signature error:", err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    v2_1.logger.info("Stripe event received:", event.type);
    try {
        switch (event.type) {
            // ── Abonnement créé ou activé ──────────────────────────────────────
            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const sub = event.data.object;
                const customerId = sub.customer;
                const status = sub.status; // 'active' | 'past_due' | 'canceled' etc.
                const currentPeriodEnd = sub.current_period_end;
                const priceId = (_b = (_a = sub.items.data[0]) === null || _a === void 0 ? void 0 : _a.price) === null || _b === void 0 ? void 0 : _b.id;
                if (priceId !== STRIPE_PRICE_ID_MONTHLY && priceId !== STRIPE_PRICE_ID_YEARLY)
                    break;
                // Trouve le user par stripeCustomerId
                const userSnap = await db.collection("users")
                    .where("stripeCustomerId", "==", customerId)
                    .limit(1).get();
                if (userSnap.empty) {
                    v2_1.logger.warn("No user found for stripeCustomerId:", customerId);
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
                v2_1.logger.info(`User ${uid} plan updated to ${isActive ? "legendary" : "free"} (${status})`);
                break;
            }
            // ── Abonnement annulé ──────────────────────────────────────────────
            case "customer.subscription.deleted": {
                const sub = event.data.object;
                const customerId = sub.customer;
                const userSnap = await db.collection("users")
                    .where("stripeCustomerId", "==", customerId)
                    .limit(1).get();
                if (userSnap.empty)
                    break;
                const uid = userSnap.docs[0].id;
                await db.collection("users").doc(uid).update({
                    plan: "free",
                    stripeStatus: "canceled",
                    stripeSubscriptionId: null,
                    subscriptionExpiresAt: null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                v2_1.logger.info(`User ${uid} subscription canceled → plan: free`);
                break;
            }
            // ── Paiement réussi ────────────────────────────────────────────────
            case "invoice.payment_succeeded": {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                const subId = invoice.subscription;
                if (!subId)
                    break;
                const sub = await stripe.subscriptions.retrieve(subId);
                const priceId = (_d = (_c = sub.items.data[0]) === null || _c === void 0 ? void 0 : _c.price) === null || _d === void 0 ? void 0 : _d.id;
                if (priceId !== STRIPE_PRICE_ID_MONTHLY && priceId !== STRIPE_PRICE_ID_YEARLY)
                    break;
                const userSnap = await db.collection("users")
                    .where("stripeCustomerId", "==", customerId)
                    .limit(1).get();
                if (userSnap.empty)
                    break;
                const uid = userSnap.docs[0].id;
                const currentPeriodEnd = sub.current_period_end;
                await db.collection("users").doc(uid).update({
                    plan: "legendary",
                    stripeStatus: "active",
                    subscriptionExpiresAt: admin.firestore.Timestamp.fromMillis(currentPeriodEnd * 1000),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                v2_1.logger.info(`Payment succeeded for user ${uid} — Legendary renewed`);
                break;
            }
            // ── Paiement échoué ────────────────────────────────────────────────
            case "invoice.payment_failed": {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                const userSnap = await db.collection("users")
                    .where("stripeCustomerId", "==", customerId)
                    .limit(1).get();
                if (userSnap.empty)
                    break;
                const uid = userSnap.docs[0].id;
                await db.collection("users").doc(uid).update({
                    stripeStatus: "past_due",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                v2_1.logger.warn(`Payment failed for user ${uid}`);
                break;
            }
        }
    }
    catch (err) {
        v2_1.logger.error("Stripe webhook processing error:", err);
        res.status(500).json({ error: err.message });
        return;
    }
    res.status(200).json({ received: true });
});
// Crée une Stripe Checkout Session — appelée depuis le site web
exports.createCheckoutSession = (0, https_1.onRequest)({ cors: true, region: "us-central1" }, async (req, res) => {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
        res.status(500).json({ error: "Stripe key not configured" });
        return;
    }
    const stripe = new stripe_1.default(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const { uid, email, successUrl, cancelUrl, plan } = req.body;
    if (!uid || !email) {
        res.status(400).json({ error: "uid and email required" });
        return;
    }
    try {
        // Cherche ou crée le customer Stripe
        const userRef = db.collection("users").doc(uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data() || {};
        let customerId = userData.stripeCustomerId;
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
    }
    catch (err) {
        v2_1.logger.error("createCheckoutSession error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Crée un Stripe Customer Portal — pour gérer/annuler l'abonnement depuis le web
exports.createPortalSession = (0, https_1.onRequest)({ cors: true, region: "us-central1" }, async (req, res) => {
    var _a;
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const stripe = new stripe_1.default(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const { uid, returnUrl } = req.body;
    if (!uid) {
        res.status(400).json({ error: "uid required" });
        return;
    }
    try {
        const userDoc = await db.collection("users").doc(uid).get();
        const customerId = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeCustomerId;
        if (!customerId) {
            res.status(404).json({ error: "No Stripe customer found" });
            return;
        }
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl || "https://gamingactions.app/legendary",
        });
        res.status(200).json({ url: session.url });
    }
    catch (err) {
        v2_1.logger.error("createPortalSession error:", err);
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=index.js.map
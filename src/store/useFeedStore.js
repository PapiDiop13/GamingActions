import { create } from 'zustand';
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, addDoc, serverTimestamp,
  getDocs, where, setDoc, deleteDoc, getDoc,
  increment, limit, startAfter,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { awardPoints, POINTS } from '../utils/points';
import { findBannedWords, censorText, logModeration } from '../utils/moderation';

// Dédoublonnage des vues sur la session courante : une vue par vidéo / lancement d'app.
// (évite de compter +1 à chaque fois qu'on repasse sur le même clip dans le feed)
const viewedThisSession = new Set();

const useFeedStore = create((set, get) => ({
  videos: [],
  comments: [],
  userProfiles: {},
  _profileFetchedAt: {},
  activeTab: 'forYou',
  filterConsole: null,
  filterGenre: null,
  filterGame: null,
  isLoading: false,
  lastDoc: null,
  hasMore: true,
  unsubscribe: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setFilter: (console_, genre, game) => set({ filterConsole: console_, filterGenre: genre, filterGame: game || null }),

  fetchUserProfiles: async (userIds) => {
    const { userProfiles, _profileFetchedAt } = get();
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return;
    const now = Date.now();
    const TTL = 60 * 1000; // 60s : profils "quasi-live" sans requêtes redondantes au scroll
    const fetchedAt = _profileFetchedAt || {};
    // Ne refetch que les profils absents ou expirés (> 60s)
    const toFetch = unique.filter(uid => !userProfiles[uid] || (now - (fetchedAt[uid] || 0)) > TTL);
    if (toFetch.length === 0) return;
    const profiles = { ...userProfiles };
    const stamps = { ...fetchedAt };
    await Promise.all(toFetch.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) { profiles[uid] = snap.data(); stamps[uid] = now; }
      } catch (e) {}
    }));
    set({ userProfiles: profiles, _profileFetchedAt: stamps });
  },

  fetchVideos: async (currentUserId, loadMore = false) => {
    const { isLoading, lastDoc, videos: existingVideos } = get();
    if (isLoading) return;
    if (loadMore && !get().hasMore) return;

    set({ isLoading: true });

    const { activeTab } = get();
    const PAGE_SIZE = activeTab === 'following' ? 50 : 6;

    try {
      let q;
      if (loadMore && lastDoc) {
        q = query(
          collection(db, 'videos'),
          where('contentType', '==', 'clip'),
          orderBy('randomOrder'),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      } else {
        q = query(
          collection(db, 'videos'),
          where('contentType', '==', 'clip'),
          orderBy('randomOrder'),
          limit(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        set({ isLoading: false, hasMore: false });
        return;
      }

      const newLastDoc = snapshot.docs[snapshot.docs.length - 1];

      const existingGGs = {};
      const existingCounts = {};
      const existingComments = {};
      const existingViews = {};
      existingVideos.forEach(v => {
        existingGGs[v.id] = v.hasGG;
        existingCounts[v.id] = v.ggCount;
        existingComments[v.id] = v.commentCount;
        existingViews[v.id] = v.viewCount;
      });

      const newVideos = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        hasGG: existingGGs[d.id] || false,
        ggCount: existingCounts[d.id] !== undefined ? existingCounts[d.id] : (d.data().ggCount || 0),
        isFollowing: false,
        commentCount: existingComments[d.id] !== undefined ? existingComments[d.id] : (d.data().commentsCount || 0),
        viewCount: existingViews[d.id] !== undefined ? existingViews[d.id] : (d.data().viewCount || 0),
        thumbnailUrl: d.data().thumbnail || null,
      }));

      if (!loadMore && currentUserId) {
        try {
          // Requête ciblée : seulement les GG sur les vidéos de cette page (max 6),
          // au lieu de charger TOUS les GG de l'utilisateur (coûteux à l'échelle).
          const pageVideoIds = newVideos.map(v => v.id).slice(0, 10);
          if (pageVideoIds.length > 0) {
            const ggSnap = await getDocs(
              query(collection(db, 'ggs'), where('userId', '==', currentUserId), where('videoId', 'in', pageVideoIds))
            );
            const ggVideoIds = new Set(ggSnap.docs.map(d => d.data().videoId));
            newVideos.forEach(v => { v.hasGG = ggVideoIds.has(v.id); });
          }
        } catch (e) {}

        try {
          const followSnap = await getDocs(
            query(collection(db, 'follows'), where('followerId', '==', currentUserId))
          );
          const followingIds = new Set(followSnap.docs.map(d => d.data().followingId));
          newVideos.forEach(v => { v.isFollowing = followingIds.has(v.userId); });
        } catch (e) {}
      }

      // Pour les pages suivantes (loadMore) : check GG ciblé sur la nouvelle page
      if (loadMore && currentUserId) {
        try {
          const pageVideoIds = newVideos.map(v => v.id).slice(0, 10);
          if (pageVideoIds.length > 0) {
            const ggSnap = await getDocs(
              query(collection(db, 'ggs'), where('userId', '==', currentUserId), where('videoId', 'in', pageVideoIds))
            );
            const ggVideoIds = new Set(ggSnap.docs.map(d => d.data().videoId));
            newVideos.forEach(v => { v.hasGG = ggVideoIds.has(v.id); });
          }
        } catch (e) {}
      }

      const allVideos = loadMore ? [...existingVideos, ...newVideos] : newVideos;

      set({
        videos: allVideos,
        isLoading: false,
        lastDoc: newLastDoc,
        hasMore: snapshot.docs.length === PAGE_SIZE,
      });

      const userIds = newVideos.map(v => v.userId).filter(Boolean);
      get().fetchUserProfiles(userIds);

      if (!loadMore) {
        setTimeout(() => get().fetchVideos(currentUserId, true), 800);
      }

    } catch (e) {
      console.log('fetchVideos error:', e.message);
      set({ isLoading: false });
    }
  },

  getEnrichedVideos: () => {
    const { videos, userProfiles } = get();
    return videos.map(v => ({
      ...v,
      plan: userProfiles[v.userId]?.plan || v.plan || 'free',
      accountType: userProfiles[v.userId]?.accountType || v.accountType || 'gamer',
      avatar: userProfiles[v.userId]?.avatar || v.avatar || '',
      username: userProfiles[v.userId]?.username || v.username || 'PLAYER',
      equippedFrame: userProfiles[v.userId]?.equippedFrame || v.equippedFrame || 'none',
      isChampion: userProfiles[v.userId]?.isChampion || false,
      isCurrentLeader: userProfiles[v.userId]?.isCurrentLeader || false,
      streakLevel: userProfiles[v.userId]?.streakLevel || v.streakLevel || 'noob',
      hideStreakLevel: userProfiles[v.userId]?.hideStreakLevel || false,
    }));
  },

  cleanup: () => {
    const { unsubscribe } = get();
    if (unsubscribe) unsubscribe();
  },

  // ─── VUES ────────────────────────────────────────────────
  // Incrémente le compteur de vues d'une vidéo, une seule fois par session.
  // Ne compte pas la vue de l'auteur sur son propre clip.
  incrementView: async (videoId, currentUserId) => {
    if (!videoId) return;
    if (viewedThisSession.has(videoId)) return;
    viewedThisSession.add(videoId);

    const { videos } = get();
    const video = videos.find(v => v.id === videoId);
    if (video && currentUserId && video.userId === currentUserId) return; // pas d'auto-vue

    // Optimiste : maj locale immédiate
    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === videoId ? { ...v, viewCount: (v.viewCount || 0) + 1 } : v
      ),
    }));

    try {
      await updateDoc(doc(db, 'videos', videoId), { viewCount: increment(1) });
    } catch (e) {
      // rollback discret si l'update échoue
      viewedThisSession.delete(videoId);
      set((state) => ({
        videos: state.videos.map((v) =>
          v.id === videoId ? { ...v, viewCount: Math.max(0, (v.viewCount || 1) - 1) } : v
        ),
      }));
    }
  },

  toggleGG: async (videoId, userId) => {
    if (!userId) return;
    const { videos } = get();
    const video = videos.find(v => v.id === videoId);
    if (!video) return;
    if (video.userId === userId) return;

    const ggId = `${userId}_${videoId}`;
    const ggRef = doc(db, 'ggs', ggId);
    const newHasGG = !video.hasGG;
    const newCount = newHasGG
      ? (video.ggCount || 0) + 1
      : Math.max(0, (video.ggCount || 0) - 1);

    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === videoId ? { ...v, hasGG: newHasGG, ggCount: newCount } : v
      ),
    }));

    try {
      if (newHasGG) {
        await setDoc(ggRef, { userId, videoId, createdAt: serverTimestamp() });
        await updateDoc(doc(db, 'videos', videoId), { ggCount: newCount });
        await awardPoints(video.userId, POINTS.RECEIVE_GG, 1, 'Received a GG');
        await addDoc(collection(db, 'notifications'), {
          userId: video.userId,
          type: 'gg',
          fromUserId: userId,
          fromUsername: get().userProfiles[userId]?.username || 'Someone',
          text: 'gave you a GG on your clip ⭐',
          videoId,
          read: false,
          createdAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(ggRef);
        await updateDoc(doc(db, 'videos', videoId), { ggCount: newCount });
        await awardPoints(video.userId, -POINTS.RECEIVE_GG, -1, 'GG removed');
      }
    } catch (e) {
      console.log('toggleGG error:', e.message);
      set((state) => ({
        videos: state.videos.map((v) =>
          v.id === videoId ? { ...v, hasGG: !newHasGG, ggCount: video.ggCount } : v
        ),
      }));
    }
  },

  toggleFollow: (userId) => set((state) => ({
    videos: state.videos.map((v) =>
      v.userId === userId ? { ...v, isFollowing: !v.isFollowing } : v
    ),
  })),

  addComment: async (videoId, text, userProfile) => {
    if (!text?.trim() || !userProfile?.uid) return;
    // Modération : détecte les mots interdits, censure et log les récidivistes
    const banned = findBannedWords(text);
    const cleanText = banned.length > 0 ? censorText(text.trim()) : text.trim();
    if (banned.length > 0) {
      logModeration(userProfile.uid, userProfile.username, text.trim(), banned);
    }
    try {
      await addDoc(collection(db, 'comments'), {
        videoId,
        userId: userProfile.uid,
        username: userProfile.username,
        avatar: userProfile.avatar || '',
        accountType: userProfile.accountType || 'gamer',
        plan: userProfile.plan || 'free',
        equippedFrame: userProfile.equippedFrame || 'none',
        equippedCommentFrame: userProfile.equippedCommentFrame || 'none',
        isChampion: userProfile.isChampion || false,
        isCurrentLeader: userProfile.isCurrentLeader || false,
        text: cleanText,
        likes: 0,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'videos', videoId), {
        commentsCount: increment(1),
      });
      set((state) => ({
        videos: state.videos.map((v) =>
          v.id === videoId ? { ...v, commentCount: (v.commentCount || 0) + 1 } : v
        ),
      }));
      const targetVideo = get().videos.find(v => v.id === videoId);
      if (targetVideo && targetVideo.userId !== userProfile.uid) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: targetVideo.userId,
            type: 'comment',
            fromUserId: userProfile.uid,
            fromUsername: userProfile.username,
            text: `commented: "${text.trim().slice(0, 50)}"`,
            videoId,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (e) {}
      }
      // Si c'est une réponse (@username), notifie la personne mentionnée
      const mentionMatch = text.trim().match(/^@(\w+)/);
      if (mentionMatch) {
        const mentionedName = mentionMatch[1];
        try {
          const userSnap = await getDocs(
            query(collection(db, 'users'), where('username', '==', mentionedName))
          );
          if (!userSnap.empty) {
            const mentionedId = userSnap.docs[0].id;
            if (mentionedId !== userProfile.uid) {
              await addDoc(collection(db, 'notifications'), {
                userId: mentionedId,
                type: 'comment_reply',
                fromUserId: userProfile.uid,
                fromUsername: userProfile.username,
                text: 'replied to your comment 💬',
                videoId,
                read: false,
                createdAt: serverTimestamp(),
              });
            }
          }
        } catch (e) {}
      }
    } catch(e){}
  },

  fetchComments: (videoId) => {
    const q = query(
      collection(db, 'comments'),
      where('videoId', '==', videoId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const comments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      set({ comments });
    });
    return unsub;
  },

  getVideoComments: (videoId) => get().comments.filter((c) => c.videoId === videoId),

  // Compteur de commentaires réactif (lit le store, pas la copie figée de la carte)
  getCommentCount: (videoId) => {
    const v = get().videos.find(x => x.id === videoId);
    return v?.commentCount || 0;
  },

  getFilteredVideos: () => {
    const { filterConsole, filterGenre, filterGame, activeTab } = get();
    let filtered = get().getEnrichedVideos();
    filtered = filtered.filter((v) => !v.restricted);
    if (activeTab === 'following') filtered = filtered.filter((v) => v.isFollowing);
    if (filterConsole) filtered = filtered.filter((v) =>
      v.console?.toLowerCase() === filterConsole.toLowerCase()
    );
    if (filterGenre) filtered = filtered.filter((v) => v.genre === filterGenre);
    if (filterGame) filtered = filtered.filter((v) => v.game === filterGame);
    return filtered;
  },
}));

export default useFeedStore;

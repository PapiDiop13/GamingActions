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
import { logEvent, logError, LOG_CONTEXT } from '../utils/errorLogger';
import { loadPrefs, sortFeedByPrefs, recordView } from '../utils/feedAlgo';
import { getOrCreatePlaylist, advancePosition, resetPlaylist, getPlaylistInfo } from '../utils/feedSession';

// Dédoublonnage des vues sur la session courante : une vue par vidéo / lancement d'app.
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
  // ── Feed cycling state ──────────────────────────────────────────────────────
  // shownVideoIds tracks every clip already inserted into the feed this session,
  // so loadMore never shows a duplicate. When Firestore runs out of new clips,
  // the feed "recycles" from the start with a fresh shuffle (TikTok-style infinite feed).
  feedCycleCount: 0,
  _isPrefetching: false,
  _playlist: null,       // cached shuffled playlist for fast loadMore
  _docCache: null,       // in-memory cache of all video docs (instant page serving)
  _followingCache: null, // cached set of following IDs

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

  // ════════════════════════════════════════════════════════════════════════════
  // SIMPLE & ROBUST FEED (TikTok/Instagram-style for a small catalog)
  //
  // Strategy: build a shuffled playlist of ALL video IDs once per session,
  // serve them in order, track position. Never shows a duplicate until the
  // whole catalog is seen. Persists across reloads. New uploads surface fast.
  //
  // PAGE_SIZE clips are loaded at a time from the playlist's current position.
  // ════════════════════════════════════════════════════════════════════════════
  fetchVideos: async (currentUserId, loadMore = false) => {
    const { isLoading, videos: existingVideos } = get();
    if (isLoading) return;
    set({ isLoading: true });

    const PAGE_SIZE = 12; // clips served per fetch

    try {
      // ── Step 1: Get or build the in-memory doc cache + playlist ──────────────
      // KEY OPTIMIZATION: we fetch ALL video docs ONCE at session start and keep
      // them in memory (_docCache). Every subsequent page is served instantly
      // from this cache — ZERO additional Firestore queries while scrolling.
      // For ~500 clips this is one upfront query (~1-2s), then buttery-smooth scroll.
      let playlist  = get()._playlist;
      let docCache  = get()._docCache;

      if (!loadMore || !playlist || !docCache) {
        const allDocsSnap = await getDocs(query(collection(db, 'videos')));
        const NON_CLIP_TYPES = ['flashtuto', 'flashinfo', 'gameindev'];

        // Build a map of id → full video data (cached for instant page serving)
        docCache = {};
        const allClipIds = [];
        allDocsSnap.docs.forEach(d => {
          const data = d.data();
          if (NON_CLIP_TYPES.includes(data.contentType)) return;
          allClipIds.push(d.id);
          docCache[d.id] = data;
        });

        if (allClipIds.length === 0) {
          set({ isLoading: false, hasMore: false });
          return;
        }

        playlist = await getOrCreatePlaylist(allClipIds);
        set({ _playlist: playlist, _docCache: docCache });
      }

      // ── Step 2: Take next page of IDs from the playlist ──────────────────────
      const startPos = playlist.position;
      const nextIds  = playlist.order.slice(startPos, startPos + PAGE_SIZE);

      if (nextIds.length === 0) {
        set({ isLoading: false, hasMore: true });
        return;
      }

      // ── Step 3: Build video objects DIRECTLY from cache (no Firestore call) ───
      const existingState = {};
      existingVideos.forEach(v => { existingState[v.id] = v; });

      let newVideos = nextIds
        .map(id => ({ id, data: docCache[id] }))
        .filter(x => x.data) // skip any id missing from cache
        .map(({ id, data }) => {
          const prev = existingState[id] || {};
          return {
            id,
            ...data,
            hasGG:        prev.hasGG || false,
            ggCount:      prev.ggCount !== undefined ? prev.ggCount : (data.ggCount || 0),
            isFollowing:  false,
            commentCount: prev.commentCount !== undefined ? prev.commentCount : (data.commentsCount || 0),
            viewCount:    prev.viewCount !== undefined ? prev.viewCount : (data.viewCount || 0),
            thumbnailUrl: data.thumbnail || null,
          };
        });

      // ── Step 4: Enrich with GG + follow status (only on first load) ──────────
      // We batch this so it doesn't block rendering. GG/follow for the first
      // page matters most; later pages inherit follow state from the cache.
      if (currentUserId && newVideos.length > 0) {
        try {
          const pageIds = newVideos.map(v => v.id).slice(0, 10);
          const ggSnap = await getDocs(
            query(collection(db, 'ggs'), where('userId', '==', currentUserId), where('videoId', 'in', pageIds))
          );
          const ggIds = new Set(ggSnap.docs.map(d => d.data().videoId));
          newVideos.forEach(v => { v.hasGG = ggIds.has(v.id); });
        } catch (e) {}

        // Follow status: fetch once, cache the set in store for reuse
        try {
          let followingIds = get()._followingCache;
          if (!followingIds) {
            const followSnap = await getDocs(
              query(collection(db, 'follows'), where('followerId', '==', currentUserId))
            );
            followingIds = new Set(followSnap.docs.map(d => d.data().followingId));
            set({ _followingCache: followingIds });
          }
          newVideos.forEach(v => { v.isFollowing = followingIds.has(v.userId); });
        } catch (e) {}
      }

      // ── Step 5: Advance position + commit ────────────────────────────────────
      await advancePosition(nextIds.length);
      const updatedPlaylist = { ...playlist, position: startPos + nextIds.length };
      const allVideos = loadMore ? [...existingVideos, ...newVideos] : newVideos;

      set({
        videos: allVideos,
        isLoading: false,
        _playlist: updatedPlaylist,
        hasMore: (startPos + PAGE_SIZE) < playlist.order.length,
      });

      get().fetchUserProfiles(newVideos.map(v => v.userId).filter(Boolean));

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
    const isOwnVideo = video && currentUserId && video.userId === currentUserId;
    // Count the view for everyone (including own videos for accurate analytics).
    // GA Points for receiving views are NOT awarded on own videos (see awardPoints call below).

    // Optimiste : maj locale immédiate
    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === videoId ? { ...v, viewCount: (v.viewCount || 0) + 1 } : v
      ),
    }));

    try {
      await updateDoc(doc(db, 'videos', videoId), { viewCount: increment(1) });
      // Don't award points for own-video views (anti-gaming)
      // if (!isOwnVideo) { await awardPoints(...) } — reserved for future monetization
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
        await logEvent(LOG_CONTEXT.GG_VOTE, { videoId, targetUserId: video.userId }, userId);
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
      await logError(LOG_CONTEXT.GG_VOTE_FAIL, e, userId);
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

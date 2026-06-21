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
import { getSessionSeenIds, markVideosSeen, resetSession, getSessionStartedAt } from '../utils/feedSession';

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
  // ── Feed cycling state ──────────────────────────────────────────────────────
  // shownVideoIds tracks every clip already inserted into the feed this session,
  // so loadMore never shows a duplicate. When Firestore runs out of new clips,
  // the feed "recycles" from the start with a fresh shuffle (TikTok-style infinite feed).
  feedCycleCount: 0,
  _isPrefetching: false,

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

    // Guard: prevent overlapping fetches (avoids double-loading on fast scroll)
    if (isLoading) return;

    set({ isLoading: true });

    const { activeTab } = get();
    const PAGE_SIZE = 50; // 50 metadata docs ≈ 150KB — lightweight

    // ── Session dedup ────────────────────────────────────────────────────────
    // Merge in-memory shown IDs (this render) with persisted session IDs (across app opens).
    // This ensures: close app → reopen → never see same clip twice until 24h reset.
    const sessionSeenIds = await getSessionSeenIds();
    const inMemoryIds    = new Set(existingVideos.map(v => v.id));
    const shownIds       = new Set([...sessionSeenIds, ...inMemoryIds]);

    try {
      // ── Fresh batch: videos posted SINCE this session started ──────────────
      // Query clips posted after session start — so a video posted 2 minutes ago
      // appears in the very next batch, not after a 24h window.
      // Fallback: if no session yet, use "last hour" so first-time users still
      // see the most recent content at the top.
      let freshVideos = [];
      if (activeTab !== 'following') {
        try {
          const sessionStart = await getSessionStartedAt();
          const sinceDate = new Date(sessionStart || Date.now() - 60 * 60 * 1000);

          const freshSnap = await getDocs(query(
            collection(db, 'videos'),
            
            where('createdAt', '>=', sinceDate),
            orderBy('createdAt', 'desc'),
            limit(10)
          ));
          // Only include clips not yet seen this session
          freshVideos = freshSnap.docs
            .filter(d => !shownIds.has(d.id))
            .slice(0, 5)
            .map(d => ({ id: d.id, ...d.data(), hasGG: false, isFollowing: false,
              thumbnailUrl: d.data().thumbnail || null }));
        } catch (_) {} // Non-blocking — fresh batch fails silently
      }

      // ── Determine query: paginate forward, or recycle from start ─────────────
      let q;
      const reachedEnd = loadMore && !get().hasMore;

      if (reachedEnd) {
        // Infinite feed: we've exhausted Firestore — restart from the beginning.
        // The randomOrder field gives a different-feeling sequence each pass,
        // and dedup below removes any clips already shown this session.
        q = query(
          collection(db, 'videos'),
          
          orderBy('randomOrder'),
          limit(PAGE_SIZE)
        );
      } else if (loadMore && lastDoc) {
        q = query(
          collection(db, 'videos'),
          
          orderBy('randomOrder'),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      } else {
        q = query(
          collection(db, 'videos'),
          
          orderBy('randomOrder'),
          limit(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        // No clips at all in this query window
        set({ isLoading: false, hasMore: false });
        return;
      }

      const newLastDoc = snapshot.docs[snapshot.docs.length - 1];

      // Preserve live GG/count/comment/view state for clips already in the store
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

      // Map docs → video objects.
      // Exclude: already seen this session + non-clip content types (tips, flashtuto etc.)
      // Migrated videos may have no contentType — we include those (treat as clips).
      const NON_CLIP_TYPES = ['flashtuto', 'flashinfo', 'gameindev'];
      let newVideos = snapshot.docs
        .filter(d => !shownIds.has(d.id))
        .filter(d => !NON_CLIP_TYPES.includes(d.data().contentType))
        .map((d) => ({
          id: d.id,
          ...d.data(),
          hasGG: existingGGs[d.id] || false,
          ggCount: existingCounts[d.id] !== undefined ? existingCounts[d.id] : (d.data().ggCount || 0),
          isFollowing: false,
          commentCount: existingComments[d.id] !== undefined ? existingComments[d.id] : (d.data().commentsCount || 0),
          viewCount: existingViews[d.id] !== undefined ? existingViews[d.id] : (d.data().viewCount || 0),
          thumbnailUrl: d.data().thumbnail || null,
        }));

      // Guard: if ALL 50 docs were filtered out by shownIds (shouldn't happen normally
      // but can occur on Expo reload with a small video pool), reset the session
      // and retry without the dedup filter so the feed never shows empty.
      if (newVideos.length === 0 && shownIds.size > 0 && !reachedEnd) {
        await resetSession();
        set({ isLoading: false });
        get().fetchVideos(currentUserId, false);
        return;
      }

      // If recycling produced only duplicates (user has seen everything this session),
      // reset the session dedup so the feed loops fresh instead of dead-ending.
      // Cap at 3 cycles to avoid truly endless scrolling with a tiny video pool.
      if (reachedEnd && newVideos.length === 0) {
        if (get().feedCycleCount < 3) {
          // Clear session view-dedup and re-show the page (clips reappear, reshuffled feel)
          const recycled = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            hasGG: existingGGs[d.id] || false,
            ggCount: existingCounts[d.id] !== undefined ? existingCounts[d.id] : (d.data().ggCount || 0),
            isFollowing: false,
            commentCount: existingComments[d.id] !== undefined ? existingComments[d.id] : (d.data().commentsCount || 0),
            viewCount: existingViews[d.id] !== undefined ? existingViews[d.id] : (d.data().viewCount || 0),
            thumbnailUrl: d.data().thumbnail || null,
          }));
          const prefs2 = await loadPrefs();
          const ranked2 = sortFeedByPrefs(recycled, prefs2);
          set({
            videos: [...existingVideos, ...ranked2],
            isLoading: false,
            lastDoc: newLastDoc,
            hasMore: true,
            feedCycleCount: get().feedCycleCount + 1,
          });
          return;
        }
        // After 3 cycles, the pool is fully exhausted for this session.
        // Reset the session so the user starts fresh on next app open.
        await resetSession();
        set({ isLoading: false, hasMore: false });
        return;
      }

      // ── Enrich first page (or recycled page) with GG + follow status ─────────
      const isFirstLoad = !loadMore || reachedEnd;

      if (isFirstLoad && currentUserId) {
        // Targeted GG query — only for clips on this page (max 10 for the "in" operator)
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

        // Load follow relationships once (small set, single query)
        try {
          const followSnap = await getDocs(
            query(collection(db, 'follows'), where('followerId', '==', currentUserId))
          );
          const followingIds = new Set(followSnap.docs.map(d => d.data().followingId));
          newVideos.forEach(v => { v.isFollowing = followingIds.has(v.userId); });
        } catch (e) {}
      }

      // ── loadMore GG check (subsequent pages) ─────────────────────────────────
      if (loadMore && !reachedEnd && currentUserId) {
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

      // ── Step 1: Local shuffle ────────────────────────────────────────────────
      // Firestore orders by randomOrder (a static field) — all users would see
      // the same sequence every session. We shuffle locally first so each
      // session + each user gets a genuinely different order.
      // Fisher-Yates: O(n), statistically unbiased.
      const shuffledNew = [...newVideos];
      for (let i = shuffledNew.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledNew[i], shuffledNew[j]] = [shuffledNew[j], shuffledNew[i]];
      }

      // ── Step 2: Recommendation algorithm on shuffled batch ───────────────────
      // CRITICAL: only score the NEW batch, never re-sort existing videos.
      // Re-sorting the whole feed mid-scroll would make the current clip jump,
      // breaking the viewing experience. New clips are shuffled then scored then appended.
      const prefs = await loadPrefs();
      const rankedNew = sortFeedByPrefs(shuffledNew, prefs);

      // ── Prepend fresh videos (last 24h, not yet seen) ─────────────────────
      // Fresh clips go BEFORE the ranked batch so new content always appears
      // at the top of the next batch, even mid-session.
      const freshNotInRanked = freshVideos.filter(f => !rankedNew.find(r => r.id === f.id));
      const batchWithFresh = [...freshNotInRanked, ...rankedNew];

      const allVideos = (loadMore && !reachedEnd)
        ? [...existingVideos, ...batchWithFresh]
        : (reachedEnd ? [...existingVideos, ...batchWithFresh] : batchWithFresh);

      // ── Persist seen IDs to session (survives app close) ─────────────────
      // We mark all IDs in this batch as seen so the next session open
      // (within 24h) continues from where the user left off.
      await markVideosSeen(batchWithFresh.map(v => v.id));

      set({
        videos: allVideos,
        isLoading: false,
        lastDoc: newLastDoc,
        // hasMore stays true after a recycle so the feed keeps cycling.
        // It only goes false when a full page returns zero new (deduped) clips.
        hasMore: reachedEnd ? true : (snapshot.docs.length === PAGE_SIZE),
        feedCycleCount: reachedEnd ? get().feedCycleCount + 1 : get().feedCycleCount,
      });

      // Fetch profiles for the new authors
      const userIds = rankedNew.map(v => v.userId).filter(Boolean);
      get().fetchUserProfiles(userIds);

      // ── Pre-fetch next page in background ────────────────────────────────────
      // On initial load, silently warm the next page so the user never waits.
      // Guarded by _isPrefetching to prevent stacking multiple prefetches.
      if (!loadMore && !get()._isPrefetching) {
        set({ _isPrefetching: true });
        setTimeout(async () => {
          await get().fetchVideos(currentUserId, true);
          set({ _isPrefetching: false });
        }, 800);
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

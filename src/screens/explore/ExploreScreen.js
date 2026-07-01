/**
 * ExploreScreen — Genre-first TikTok-style discovery
 *
 * Algorithm:
 *  • On mount: pick a starting genre weighted by user's GG history
 *    (60% prefer genres they've interacted with, 40% pure discovery)
 *  • Each app open = fresh genre pick (no persistence across sessions)
 *  • When user GGs a video → update genreStats[genre]++ on their user doc
 *    (feeds the weight algo on next open)
 *
 * Layout:
 *  • Genre strip (horizontal ScrollView) at top
 *  • Full-screen vertical FlatList (pagingEnabled) of videos for current genre
 *  • Bottom overlay: username, game, GG button, tap to open full player
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TouchableWithoutFeedback,
  Dimensions, Image, ScrollView, ActivityIndicator, Animated, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  collection, query, where, limit,
  getDocs, doc, updateDoc, increment,
} from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { GENRES } from '../../constants/data';
import useAuthStore from '../../store/useAuthStore';
import { db } from '../../config/firebase';
import { getVideoUrl, getThumbnailUrl } from '../../config/mux';
import FramedAvatar from '../../components/FramedAvatar';

const { width: SW, height: SH } = Dimensions.get('window');

// Genre display config (emoji + label)
const GENRE_META = {
  fps:          { emoji: '🎯', label: 'FPS' },
  sports:       { emoji: '⚽', label: 'Sports' },
  battle_royale:{ emoji: '🏆', label: 'Battle Royale' },
  action:       { emoji: '💥', label: 'Action' },
  adventure:    { emoji: '🗺️', label: 'Adventure' },
  rpg:          { emoji: '⚔️', label: 'RPG' },
  moba:         { emoji: '🧙', label: 'MOBA' },
  racing:       { emoji: '🏎️', label: 'Racing' },
  fighting:     { emoji: '🥊', label: 'Fighting' },
  strategy:     { emoji: '🧠', label: 'Strategy' },
  simulation:   { emoji: '🏗️', label: 'Simulation' },
  other:        { emoji: '🕹️', label: 'Other' },
};

// ─── Genre weighting algorithm ────────────────────────────────────────────────
function pickStartGenre(genreStats) {
  const ids = GENRES.map(g => g.id);
  // 40% pure random discovery
  if (!genreStats || Object.keys(genreStats).length === 0 || Math.random() < 0.4) {
    return ids[Math.floor(Math.random() * ids.length)];
  }
  // 60% weighted towards user's GG history
  const weights = ids.map(id => (genreStats[id] || 0) + 1); // +1 floor
  const total = weights.reduce((a, b) => a + b, 0);
  let rnd = Math.random() * total;
  for (let i = 0; i < ids.length; i++) {
    rnd -= weights[i];
    if (rnd <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}

// ─── Single video item ────────────────────────────────────────────────────────
function VideoCard({ video, isActive, navigation, onGG, genreId, cardHeight }) {
  const [ggd, setGgd] = useState(false);
  const ggAnim = useRef(new Animated.Value(0)).current;
  const thumb  = video.thumbnail || video.thumbnailUrl || null;
  const videoUrl = getVideoUrl(video); // getVideoUrl attend l'OBJET vidéo (muxPlaybackId/videoUrl)

  // Player — only created when active
  const player = useVideoPlayer(isActive && videoUrl ? videoUrl : null, p => {
    if (p) { p.loop = true; p.muted = false; }
  });

  useEffect(() => {
    if (!player) return;
    if (isActive) { try { player.play(); } catch {} }
    else          { try { player.pause(); } catch {} }
  }, [isActive, player]);

  const handleGG = async () => {
    if (ggd) return;
    setGgd(true);
    // Bounce animation
    ggAnim.setValue(0);
    Animated.sequence([
      Animated.spring(ggAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 18 }),
      Animated.timing(ggAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }),
    ]).start();
    onGG(video, genreId);
  };

  const ggScale = ggAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });

  return (
    <TouchableWithoutFeedback onPress={() => navigation.navigate('VideoPlayer', { video })}>
      <View style={[card.container, cardHeight && { height: cardHeight }]}>
        {/* Video or thumbnail */}
        {isActive && player ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        ) : (
          thumb
            ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a0a16' }]} />
        )}

        {/* Dark gradient at bottom */}
        <View style={card.gradient} />

        {/* Play indicator when not active */}
        {!isActive && (
          <View style={card.playBtn} pointerEvents="none">
            <Ionicons name="play" size={36} color="rgba(255,255,255,0.75)" />
          </View>
        )}

        {/* Right action bar */}
        <View style={card.sideBar}>
          {/* Avatar */}
          <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: video.userId })} activeOpacity={0.85}>
            <FramedAvatar user={video} size={42} />
          </TouchableOpacity>

          {/* GG button */}
          <TouchableOpacity onPress={handleGG} style={card.actionBtn} activeOpacity={0.7}>
            <Animated.Text style={[card.actionIcon, { transform: [{ scale: ggScale }] }, ggd && { opacity: 0.5 }]}>⭐</Animated.Text>
            <Text style={[card.actionCount, ggd && { color: COLORS.gold }]}>
              {(video.ggCount || 0) + (ggd ? 1 : 0) >= 1000
                ? `${((video.ggCount || 0) + (ggd ? 1 : 0)) / 1000}K`
                : (video.ggCount || 0) + (ggd ? 1 : 0)}
            </Text>
          </TouchableOpacity>

          {/* Comment button */}
          <TouchableOpacity onPress={() => navigation.navigate('VideoPlayer', { video })} style={card.actionBtn} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={26} color={COLORS.white} />
            <Text style={card.actionCount}>{video.commentCount || 0}</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom info */}
        <View style={card.info} pointerEvents="box-none">
          <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: video.userId })} activeOpacity={0.85}>
            <Text style={card.username}>@{video.username}</Text>
          </TouchableOpacity>
          {video.game ? <Text style={card.game}>🎮 {video.game}</Text> : null}
          {video.caption ? <Text style={card.caption} numberOfLines={2}>{video.caption}</Text> : null}
          <Text style={card.tapHint}>Tap to open · Swipe for more</Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const card = StyleSheet.create({
  container: { width: SW, height: SH, backgroundColor: '#050510' },
  gradient:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', backgroundColor: 'transparent',
    // Gradient via multiple transparent layers
  },
  playBtn:   { position: 'absolute', top: '50%', left: '50%', marginTop: -24, marginLeft: -24 },
  sideBar:   { position: 'absolute', right: 12, bottom: 120, alignItems: 'center', gap: 20 },
  actionBtn: { alignItems: 'center', gap: 3 },
  actionIcon:{ fontSize: 28 },
  actionCount:{ fontSize: 11, color: COLORS.white, fontWeight: '700' },
  info:      { position: 'absolute', bottom: 24, left: 14, right: 80 },
  username:  { fontSize: 14, fontWeight: '900', color: COLORS.white, marginBottom: 3, textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  game:      { fontSize: 12, color: COLORS.gold, fontWeight: '700', marginBottom: 4 },
  caption:   { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17, marginBottom: 6 },
  tapHint:   { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
});

// ─── Main ExploreScreen ───────────────────────────────────────────────────────
export default function ExploreScreen({ navigation, embedded = false }) {
  const insets = useSafeAreaInsets();
  const { userProfile, user } = useAuthStore();

  // Pick starting genre ONCE per mount (= once per app session)
  const [activeGenre, setActiveGenre] = useState(() =>
    pickStartGenre(userProfile?.genreStats)
  );
  const [videos, setVideos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  // When embedded inside FeedScreen, measure available height for pagingEnabled
  const [cardHeight, setCardHeight] = useState(SH);
  const flatRef = useRef(null);
  const genreScrollRef = useRef(null);
  const isFocused = useRef(true);

  // ── Load videos for a genre ────────────────────────────────────────────────
  const loadGenre = useCallback(async (genreId) => {
    setLoading(true);
    setVideos([]);
    setActiveIdx(0);
    try {
      // Attempt 1: filter by genre (no orderBy to avoid composite index)
      const snap = await getDocs(
        query(collection(db, 'videos'), where('genre', '==', genreId), limit(50))
      );
      let vids = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(v => !v.banned && !v.restricted && v.playbackId)
        .sort((a, b) => (b.ggCount || 0) - (a.ggCount || 0));

      // Fallback: si le genre n'a pas de vidéos (champ genre absent/vide en DB),
      // on charge les vidéos récentes toutes catégories confondues
      if (vids.length === 0) {
        const fallback = await getDocs(
          query(collection(db, 'videos'), limit(50))
        );
        vids = fallback.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(v => !v.banned && !v.restricted && v.playbackId)
          .sort((a, b) => (b.ggCount || 0) - (a.ggCount || 0));
      }

      setVideos(vids);
    } catch (e) {
      console.log('Explore load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGenre(activeGenre); }, [activeGenre]);

  // Pause all videos when screen loses focus
  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    return () => { isFocused.current = false; };
  }, []));

  // ── Genre change ───────────────────────────────────────────────────────────
  const handleGenreChange = (genreId) => {
    if (genreId === activeGenre) return;
    setActiveGenre(genreId);
  };

  // ── GG handler ────────────────────────────────────────────────────────────
  const handleGG = useCallback(async (video, genreId) => {
    if (!user?.uid) return;
    try {
      // Increment GG on video
      await updateDoc(doc(db, 'videos', video.id), {
        ggCount: increment(1),
      });
      // Update author's ggReceived
      if (video.userId) {
        await updateDoc(doc(db, 'users', video.userId), {
          ggReceived: increment(1),
        });
      }
      // Update user's genre stats for the weighting algo
      await updateDoc(doc(db, 'users', user.uid), {
        [`genreStats.${genreId}`]: increment(1),
      });
    } catch (e) {
      console.log('Explore GG error:', e.message);
    }
  }, [user?.uid]);

  // ── Viewability tracking ───────────────────────────────────────────────────
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setActiveIdx(viewableItems[0].index ?? 0);
    }
  }, []);

  // ── Genre emoji/label strip ────────────────────────────────────────────────
  const genreMeta = GENRE_META[activeGenre] || { emoji: '🎮', label: activeGenre };

  const videoFeed = loading ? (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.gold} />
      <Text style={s.loadingText}>Loading {genreMeta.emoji} {genreMeta.label}...</Text>
    </View>
  ) : videos.length === 0 ? (
    <View style={s.center}>
      <Text style={{ fontSize: 48 }}>{genreMeta.emoji}</Text>
      <Text style={s.emptyTitle}>No {genreMeta.label} clips yet</Text>
      <Text style={s.emptySub}>Try another genre or be the first to post!</Text>
    </View>
  ) : (
    <FlatList
      ref={flatRef}
      data={videos}
      keyExtractor={v => v.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      snapToAlignment="start"
      decelerationRate="fast"
      removeClippedSubviews
      windowSize={3}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      getItemLayout={(_, idx) => ({ length: cardHeight, offset: cardHeight * idx, index: idx })}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig.current}
      renderItem={({ item, index }) => (
        <VideoCard
          key={item.id}
          video={item}
          isActive={isFocused.current && index === activeIdx}
          navigation={navigation}
          onGG={handleGG}
          genreId={activeGenre}
          cardHeight={cardHeight}
        />
      )}
      ListFooterComponent={
        <View style={[s.center, { height: cardHeight }]}>
          <Text style={{ fontSize: 36 }}>{genreMeta.emoji}</Text>
          <Text style={s.endText}>You've seen all {genreMeta.label} clips</Text>
          <TouchableOpacity onPress={() => {
            flatRef.current?.scrollToOffset({ offset: 0, animated: true });
            setActiveIdx(0);
          }} style={s.replayBtn}>
            <Ionicons name="refresh" size={16} color={COLORS.gold} />
            <Text style={s.replayBtnText}>Watch again</Text>
          </TouchableOpacity>
        </View>
      }
    />
  );

  return (
    <View style={s.container}>
      {!embedded && <StatusBar style="light" />}

      {/* ── Genre tab strip ──────────────────────────────────────────── */}
      <View style={embedded ? s.genreBarEmbedded : [s.genreBar, { paddingTop: insets.top + 6 }]}>
        <ScrollView
          ref={genreScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.genreTabs}
          keyboardShouldPersistTaps="handled"
        >
          {GENRES.map(g => {
            const meta = GENRE_META[g.id] || { emoji: '🕹️', label: g.label };
            const isActive = g.id === activeGenre;
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => handleGenreChange(g.id)}
                style={[s.genreTab, isActive && s.genreTabActive]}
                activeOpacity={0.75}
              >
                <Text style={[s.genreTabText, isActive && s.genreTabTextActive]}>
                  {meta.emoji} {meta.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Video Feed ───────────────────────────────────────────────── */}
      {embedded ? (
        <View
          style={{ flex: 1 }}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && h !== cardHeight) setCardHeight(h);
          }}
        >
          {videoFeed}
        </View>
      ) : videoFeed}
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#050510' },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  // Standalone (full-screen) mode — genre bar overlays at top
  genreBar:   { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  // Embedded (inside FeedScreen tab) mode — genre bar in normal flow
  genreBarEmbedded: { backgroundColor: 'rgba(5,5,16,0.97)', borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' },
  genreTabs:  { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  genreTab:   { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  genreTabActive: { backgroundColor: 'rgba(201,168,76,0.22)', borderColor: COLORS.gold },
  genreTabText:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  genreTabTextActive: { color: COLORS.gold, fontWeight: '800' },
  loadingText:{ fontSize: 13, color: COLORS.gray, marginTop: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: COLORS.gray, textAlign: 'center' },
  uploadBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.gold, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  uploadBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  endText:    { fontSize: 14, color: COLORS.gray, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  replayBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.gold },
  replayBtnText: { fontSize: 13, color: COLORS.gold, fontWeight: '700' },
});

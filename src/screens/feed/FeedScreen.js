import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, ScrollView, TextInput, Alert,
  Platform, Animated, Easing, Modal, Image,
  TouchableWithoutFeedback, KeyboardAvoidingView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { COLORS } from '../../constants/colors';
import { PROFILE_BADGES } from '../../constants/cosmetics';
import useFeedStore from '../../store/useFeedStore';
import useAuthStore from '../../store/useAuthStore';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { globalNavigate } from '../../utils/navigationRef';
import { recordView } from '../../utils/feedAlgo';
import { CONSOLES, GENRES } from '../../constants/data';
import { GAMES } from '../../constants/games';
import useUserStore from '../../store/useUserStore';
import useGuestGuard from '../../hooks/useGuestGuard';
import { collection, query, where, orderBy, onSnapshot, getDoc, getDocs, doc, updateDoc, deleteDoc, increment, arrayUnion, arrayRemove, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getVideoUrl, getThumbnailUrl } from '../../config/mux';
import ConsoleIcon from '../../components/ConsoleIcon';
import { ringColorForUser, glowColorForUser, getFrameById, getVideoFrameById, commentFrameStyle } from '../../constants/frames';
import { ElectricBorder, LeaderElectricBorder, ChampionBadge, LeaderBadge } from '../../components/ElectricEffect';
import FramedAvatar from '../../components/FramedAvatar';
import CommentsSheet, { CommentBubble } from '../../components/CommentsSheet';


const { width: SW, height: SH } = Dimensions.get('window');

// Streak levels for header display
const SL_LABELS = {
  goat:      'G.O.A.T',
  legendary: 'LEGENDARY',
  elite:     'ELITE',
  diamond:   'DIAMOND',
  platinum:  'PLATINUM',
  gold:      'GOLD',
  silver:    'SILVER',
  bronze:    'BRONZE',
  noob:      'NOOB',
};
const SL_COLORS = {
  goat:      '#FF2D55',
  legendary: '#C9A84C',
  elite:     '#BF5AF2',
  diamond:   '#00D4FF',
  platinum:  '#A0E8FF',
  gold:      '#FFD700',
  silver:    '#C0C0C0',
  bronze:    '#CD7F32',
  noob:      '#555555',
};

// ── Animated glow/shimmer border for animated video frames ─────────────────────
function VideoGlowFrame({ color, width, isShimmer }) {
  const pulse = React.useRef(new Animated.Value(0.4)).current;
  const sweep = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.0, duration: 750, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.4, duration: 750, useNativeDriver: true }),
    ]));
    pulseLoop.start();
    let sweepLoop;
    if (isShimmer) {
      sweepLoop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.linear }));
      sweepLoop.start();
    }
    return () => { pulseLoop.stop(); sweepLoop?.stop(); };
  }, [color, isShimmer]);
  const tx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-90, (width || 400) + 90] });
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: color, opacity: pulse, shadowColor: color, shadowOpacity: 1, shadowRadius: 14 }} />
      <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: color, opacity: pulse, shadowColor: color, shadowOpacity: 1, shadowRadius: 14 }} />
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, backgroundColor: color, opacity: pulse, shadowColor: color, shadowOpacity: 1, shadowRadius: 14 }} />
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 3, backgroundColor: color, opacity: pulse, shadowColor: color, shadowOpacity: 1, shadowRadius: 14 }} />
      {isShimmer && (
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 90, backgroundColor: color, opacity: 0.13, transform: [{ translateX: tx }, { skewX: '-12deg' }] }} />
      )}
    </View>
  );
}

// Tab bar height (matches MainNavigator CustomTabBar)
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;
const HEADER_H = Platform.OS === 'ios' ? 110 : 90;
// CRITICAL: subtract tab bar height so the feed card never goes under the navbar.
// iOS Pro Max (932px): 932 - 110 - 80 = 742px card
// iPhone Pro (852px):  852 - 110 - 80 = 662px card
// iPhone SE (667px):   667 - 110 - 80 = 477px card
const CARD_HEIGHT = SH - HEADER_H - TAB_BAR_HEIGHT;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function timeAgo(date) {
  if (!date) return '';
  const d = date?.toDate ? date.toDate() : new Date(date);
  const diff = Math.floor((new Date() - d) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function GGButton({ hasGG, count, onPress, onShowList, disabled = false }) {
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, speed: 40, bounciness: 18 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <View style={ggS.wrapper}>
      <TouchableOpacity onPress={disabled ? null : handlePress} activeOpacity={disabled ? 1 : 0.85} style={[ggS.btnWrap, disabled && { opacity: 0.4 }]}>
        <Animated.View style={[ggS.glowBurst, { opacity: glowOpacity }]} />
        <Animated.View style={[ggS.btn, { transform: [{ scale }] }, hasGG ? ggS.btnFilled : ggS.btnOutline]}>
          <Text style={[ggS.text, { color: hasGG ? COLORS.black : COLORS.gold }]}>GG</Text>
        </Animated.View>
      </TouchableOpacity>
      <TouchableOpacity onPress={count > 0 ? onShowList : null} activeOpacity={count > 0 ? 0.6 : 1}>
        <Text style={[ggS.count, { color: hasGG ? COLORS.gold : COLORS.gray }]}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count}{count > 0 ? ' ▾' : ''}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const ggS = StyleSheet.create({
  wrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  btnWrap: { alignItems: 'center', justifyContent: 'center' },
  glowBurst: { position: 'absolute', width: 80, height: 36, borderRadius: 18, backgroundColor: COLORS.gold },
  btn: { width: 68, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.gold },
  btnFilled: { backgroundColor: COLORS.gold, borderWidth: 1.5, borderColor: '#E8C96B' },
  text: { fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  count: { fontSize: 11, fontWeight: '700', marginTop: 4 },
});

// Modal listant les utilisateurs ayant donné un GG à une vidéo
function GGListModal({ visible, onClose, videoId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !videoId) return;
    setLoading(true);
    (async () => {
      try {
        const ggSnap = await getDocs(query(collection(db, 'ggs'), where('videoId', '==', videoId)));
        const userIds = ggSnap.docs.map(d => d.data().userId).filter(Boolean);
        const profiles = await Promise.all(userIds.slice(0, 100).map(async (uid) => {
          try {
            const s = await getDoc(doc(db, 'users', uid));
            return s.exists() ? { uid, ...s.data() } : null;
          } catch (e) { return null; }
        }));
        setUsers(profiles.filter(Boolean));
      } catch (e) {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, videoId]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      </TouchableWithoutFeedback>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.dark, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SH * 0.6, paddingBottom: Platform.OS === 'ios' ? 30 : 10 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.gray2, alignSelf: 'center', marginTop: 10, marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gold }}>⭐ {users.length} GG{users.length > 1 ? 's' : ''}</Text>
        </View>
        {loading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: 30 }} />
        ) : (
          <ScrollView style={{ paddingHorizontal: 16 }} contentContainerStyle={{ paddingVertical: 10 }}>
            {users.length === 0 ? (
              <Text style={{ color: COLORS.gray, textAlign: 'center', marginTop: 20 }}>No GGs yet.</Text>
            ) : users.map((u) => (
              <View key={u.uid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                <View style={u?.equippedCardBorder ? {
                  borderWidth: 1.5, borderRadius: 22,
                  borderColor: (() => {
                    const CB = { cb_gold:'#C9A84C', cb_silver:'#C0C0C0', cb_blue_neon:'#00D4FF',
                      cb_red_neon:'#FF2D55', cb_purple_neon:'#BF5AF2', cb_green_neon:'#39FF14',
                      cb_galaxy_border:'#7C4DFF', cb_fire_border:'#FF3D00',
                      cb_lightning_border:'#FFD700', cb_holo_border:'#FF0080' };
                    return CB[u.equippedCardBorder] || '#C9A84C';
                  })(),
                  shadowColor: (() => {
                    const CB = { cb_blue_neon:'#00D4FF', cb_red_neon:'#FF2D55',
                      cb_purple_neon:'#BF5AF2', cb_green_neon:'#39FF14', cb_galaxy_border:'#7C4DFF',
                      cb_fire_border:'#FF3D00', cb_lightning_border:'#FFD700', cb_holo_border:'#FF0080' };
                    return CB[u.equippedCardBorder] || 'transparent';
                  })(),
                  shadowOpacity: 0.7, shadowRadius: 4, shadowOffset: { width:0, height:0 },
                } : null}>
                  <FramedAvatar user={u} size={36} />
                </View>
                <Text style={{ fontSize: 14, color: COLORS.white, fontWeight: '600', marginLeft: 12 }}>{u.username || 'Player'}</Text>
                {u.plan === 'legendary' && <View style={[cardS.legBadge, { marginLeft: 6 }]}><Text style={cardS.legBadgeText}>LEG</Text></View>}
                {u.accountType === 'gameconic' && <View style={[cardS.legBadge, { marginLeft: 6, backgroundColor: COLORS.red }]}><Text style={cardS.legBadgeText}>ICON</Text></View>}
                {u.accountType === 'creator' && <View style={[cardS.legBadge, { marginLeft: 6, backgroundColor: COLORS.blue }]}><Text style={[cardS.legBadgeText, { color: COLORS.dark }]}>CR</Text></View>}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}



function FilterModal({ visible, onClose, onApply }) {
  const [selConsole, setSelConsole] = useState(null);
  const [selGenre, setSelGenre] = useState(null);
  const [selGame, setSelGame] = useState(null);
  const [gameSearch, setGameSearch] = useState('');

  const filteredGames = gameSearch.length > 0
    ? GAMES.filter(g => g.name.toLowerCase().includes(gameSearch.toLowerCase())).slice(0, 30)
    : GAMES.slice(0, 30);

  const handleClear = () => {
    setSelConsole(null);
    setSelGenre(null);
    setSelGame(null);
    setGameSearch('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={fS.overlay}>
          <TouchableWithoutFeedback>
            <View style={fS.sheet}>
              <Text style={fS.title}>Filter Feed</Text>

              {/* CONSOLE */}
              <Text style={fS.sectionLabel}>CONSOLE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {[{ id: null, label: 'All', icon: '🎮' }, ...CONSOLES].map((c) => (
                  <TouchableOpacity
                    key={String(c.id)}
                    onPress={() => setSelConsole(c.id)}
                    style={[fS.chip, selConsole === c.id && fS.chipActive]}
                  >
                    <ConsoleIcon id={c.id} size={14} style={{ marginRight: 4 }} />
                    <Text style={[fS.chipText, selConsole === c.id && fS.chipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* GENRE */}
              <Text style={fS.sectionLabel}>GENRE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {[{ id: null, label: 'All' }, ...GENRES].map((g) => (
                  <TouchableOpacity
                    key={String(g.id)}
                    onPress={() => { setSelGenre(g.id); setSelGame(null); }}
                    style={[fS.chip, selGenre === g.id && fS.chipActive]}
                  >
                    <Text style={[fS.chipText, selGenre === g.id && fS.chipTextActive]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* GAME */}
              <Text style={fS.sectionLabel}>SPECIFIC GAME</Text>
              <View style={fS.ddSearch}>
                <Ionicons name="search-outline" size={14} color={COLORS.gray} />
                <TextInput
                  value={gameSearch}
                  onChangeText={setGameSearch}
                  placeholder="Search a game..."
                  placeholderTextColor={COLORS.gray}
                  style={{ flex: 1, color: COLORS.white, fontSize: 13, marginLeft: 8, paddingVertical: 6 }}
                />
                {gameSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setGameSearch('')}>
                    <Ionicons name="close-circle" size={14} color={COLORS.gray} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => setSelGame(null)}
                  style={[fS.chip, selGame === null && fS.chipActive]}
                >
                  <Text style={[fS.chipText, selGame === null && fS.chipTextActive]}>All</Text>
                </TouchableOpacity>
                {filteredGames.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setSelGame(g.name)}
                    style={[fS.chip, selGame === g.name && fS.chipActive]}
                  >
                    <Text style={[fS.chipText, selGame === g.name && fS.chipTextActive]}>{g.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={fS.btnRow}>
                <TouchableOpacity onPress={handleClear} style={fS.clearBtn}>
                  <Text style={fS.clearText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onApply(selConsole, selGenre, selGame)} style={fS.applyBtn}>
                  <Text style={fS.applyText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const fS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-start' },
  sheet: { backgroundColor: '#141420', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, padding: 20, paddingBottom: 30, paddingTop: 60, maxHeight: SH * 0.85 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.gray2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.white, marginBottom: 16 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '600', letterSpacing: 1, marginBottom: 8 },
  ddSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 10, borderWidth: 0.5, borderColor: COLORS.gray3 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8 },
  chipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  chipEmoji: { fontSize: 12, marginRight: 4 },
  chipText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  chipTextActive: { color: COLORS.gold, fontWeight: '700' },
  btnRow: { flexDirection: 'row' },
  clearBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, alignItems: 'center', marginRight: 8 },
  clearText: { fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  applyBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.gold, alignItems: 'center' },
  applyText: { fontSize: 13, color: COLORS.black, fontWeight: '800' },
});


function PreviewComments({ videoId, isActive, onOpenSheet }) {
  const { getVideoComments, fetchComments } = useFeedStore();
  const comments = getVideoComments(videoId);
  const [loadingPreview, setLoadingPreview] = useState(true);

  useEffect(() => {
    if (isActive && videoId) {
      setLoadingPreview(true);
      const unsub = fetchComments(videoId);
      // Mark loaded after a short delay — fetchComments is a listener, not a promise
      const t = setTimeout(() => setLoadingPreview(false), 800);
      return () => { unsub && unsub(); clearTimeout(t); };
    }
  }, [isActive, videoId]);

  // Show top 2 top-level comments in preview (replies shown as count only)
  const topLevel = comments.filter(c => !c.parentId && !c.deleted);
  const replyMap = {};
  comments.filter(c => c.parentId).forEach(r => {
    if (!replyMap[r.parentId]) replyMap[r.parentId] = [];
    replyMap[r.parentId].push(r);
  });

  // Show spinner while loading
  if (loadingPreview && comments.length === 0) {
    return <ActivityIndicator color={COLORS.gold} size="small" style={{ marginTop: 8, alignSelf: 'flex-start' }} />;
  }

  if (topLevel.length === 0) {
    return (
      <TouchableOpacity onPress={onOpenSheet} style={{ paddingVertical: 4 }}>
        <Text style={{ fontSize: 11, color: COLORS.gray }}>No comments yet. Be the first 👇</Text>
      </TouchableOpacity>
    );
  }

  // Sort by likes (most liked first), take top 2 for the preview.
  const preview = [...topLevel]
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 2);

  return (
    <View>
      <Text style={{ fontSize: 10, color: COLORS.gray2, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>
        Most liked
      </Text>
      {preview.map((c) => {
        const replyCount = (replyMap[c.id] || []).length;
        return (
          <View key={c.id}>
            <CommentBubble
              comment={c}
              onReply={() => onOpenSheet()}
              compact
            />
            {replyCount > 0 && (
              <TouchableOpacity onPress={onOpenSheet} style={{ paddingLeft: 36, marginTop: -4, marginBottom: 6 }}>
                <Text style={{ fontSize: 10, color: COLORS.blue, fontWeight: '700' }}>
                  ↳ {replyCount} repl{replyCount > 1 ? 'ies' : 'y'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Animated Username for Feed ──────────────────────────────────────────────
const UE_MAP_FEED = {
  ue_gold:           { color: '#C9A84C', glow: false, anim: false },
  ue_blue_glow:      { color: '#00D4FF', glow: true,  anim: false },
  ue_purple_glow:    { color: '#BF5AF2', glow: true,  anim: false },
  ue_red_glow:       { color: '#FF2D55', glow: true,  anim: false },
  ue_green_glow:     { color: '#39FF14', glow: true,  anim: false },
  ue_gold_glow:      { color: '#FFD700', glow: true,  anim: false },
  ue_shadow:         { color: '#BC13FE', glow: true,  anim: false },
  ue_fire_text:      { color: '#FF3D00', glow: false, anim: true  },
  ue_lightning_text: { color: '#FFD700', glow: false, anim: true  },
  ue_ice_text:       { color: '#A0E8FF', glow: true,  anim: true  },
  ue_toxic_anim:     { color: '#39FF14', glow: true,  anim: true  },
  ue_chrome:         { color: '#C0C0C0', glow: false, anim: true  },
  ue_glitch:         { color: '#FF0080', glow: false, anim: true  },
  ue_mirror:         { color: '#C0C0C0', glow: false, anim: true  },
  ue_aurora_text:    { color: '#00FF88', glow: true,  anim: true  },
  ue_galaxy_text:    { color: '#7C4DFF', glow: false, anim: true  },
  ue_prism:          { color: '#FF0080', glow: true,  anim: true  },
  ue_stardust:       { color: '#FFD700', glow: true,  anim: true  },
  // Shimmer/reflet effects
  ue_sakura_text:    { color: '#FF69B4', glow: true,  anim: true,  shimmer: true },
  ue_holo_text:      { color: '#FF0080', glow: true,  anim: true,  shimmer: true },
  ue_fire_reflet:    { color: '#FF4500', glow: true,  anim: true,  shimmer: true },
  ue_void_reflet:    { color: '#BC13FE', glow: true,  anim: true,  shimmer: true },
  ue_gold_reflet:    { color: '#FFD700', glow: true,  anim: true,  shimmer: true },
  ue_ice_reflet:     { color: '#A0E8FF', glow: true,  anim: true,  shimmer: true },
  ue_toxic_reflet:   { color: '#39FF14', glow: true,  anim: true,  shimmer: true },
  ue_rose_reflet:    { color: '#FF69B4', glow: false, anim: true,  shimmer: true },
  ue_cosmic_reflet:  { color: '#E040FB', glow: true,  anim: true,  shimmer: true },
  ue_lightning_reflet: { color: '#FFD700', glow: true, anim: true, shimmer: true },
};

// Max username width: leaves room for badges + follow button
const USERNAME_MAX_W = SW < 375 ? SW * 0.38 : SW * 0.42;
const USERNAME_FS = SW < 375 ? 11 : 13;

function FeedAnimatedUsername({ username, ueId, baseStyle }) {
  const ue      = ueId ? UE_MAP_FEED[ueId] : null;
  const color   = ue?.color   || '#FFFFFF';
  const glow    = ue?.glow    || false;
  const isAnim  = ue?.anim    || false;
  const isShimmer = ue?.shimmer || false;

  const pulse = React.useRef(new Animated.Value(1)).current;
  const sweep = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    pulse.stopAnimation(); sweep.stopAnimation();
    if (!isAnim) { pulse.setValue(1); return; }
    const pa = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.6, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1.0, duration: 650, useNativeDriver: true }),
    ]));
    pa.start();
    let sweepLoop;
    if (isShimmer) {
      sweepLoop = Animated.loop(
        Animated.timing(sweep, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.linear })
      );
      sweepLoop.start();
    }
    return () => { pa.stop(); sweepLoop?.stop(); };
  }, [isAnim, isShimmer, ueId]);

  const sweepTx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-50, USERNAME_MAX_W + 50] });
  const nameStyle = [baseStyle, { maxWidth: USERNAME_MAX_W, fontSize: USERNAME_FS }];

  if (isShimmer) {
    // Shimmer: colored glow text + a bright white arc sweeping across
    return (
      <View style={{ maxWidth: USERNAME_MAX_W, overflow: 'hidden' }}>
        <Animated.Text numberOfLines={1} ellipsizeMode="tail" style={[...nameStyle, {
          color, opacity: pulse,
          textShadowColor: color, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 },
        }]}>{username}</Animated.Text>
        <Animated.View style={{
          position: 'absolute', top: 0, bottom: 0, width: 30,
          backgroundColor: color,
          opacity: 0.5,
          transform: [{ translateX: sweepTx }, { skewX: '-10deg' }],
        }} pointerEvents="none" />
      </View>
    );
  }
  if (isAnim) {
    return (
      <Animated.Text numberOfLines={1} ellipsizeMode="tail" style={[...nameStyle, {
        color, opacity: pulse,
        textShadowColor: color, textShadowRadius: 9, textShadowOffset: { width: 0, height: 0 },
      }]}>{username}</Animated.Text>
    );
  }
  return (
    <Text numberOfLines={1} ellipsizeMode="tail" style={[...nameStyle, {
      color,
      textShadowColor: glow ? color : 'transparent',
      textShadowRadius: glow ? 6 : 0,
    }]}>{username}</Text>
  );
}

function VideoCardInner({ item, onNavigateProfile, navigation, userProfile, userProfiles = {}, isActive, shouldLoad = true }) {
  const { toggleGG, incrementView } = useFeedStore();
  const { user } = useAuthStore();
  // Merge live profile data (isCurrentLeader, isChampion, cosmetics) for this video's creator
  const creatorProfile = item.userId === user?.uid ? userProfile : (userProfiles[item.userId] || {});
  const enrichedItem = { ...item, ...creatorProfile };
  const { toggleFollow, isFollowing } = useUserStore();
  const guestGuard = useGuestGuard(navigation);
  const [showComments, setShowComments] = useState(false);
  const [showGGList, setShowGGList] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);
  // Cleanup tap timer on unmount to prevent setState on unmounted component
  useEffect(() => () => { if (tapTimerRef.current) clearTimeout(tapTimerRef.current); }, []);
  const isLegendary = enrichedItem.plan === 'legendary';
  const isAdminInFeed = !!userProfile?.isAdmin;

  const handleAdminAction = async () => {
    const opts = [];
    if (!item.restricted) {
      opts.push({ text: '🚫 Hide (monitoring)', onPress: () => promptAdminAction('hide') });
      opts.push({ text: '⛔ Ban (content removed)', onPress: () => promptAdminAction('ban') });
    } else {
      opts.push({ text: '✅ Unhide', onPress: () => promptAdminAction('unhide') });
    }
    opts.push({ text: '🗑️ Delete permanently', onPress: () => promptAdminAction('delete'), style: 'destructive' });
    opts.push({ text: 'View in Admin', onPress: () => navigation.navigate('Admin', { openVideo: item }) });
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('🛡️ Admin Actions', `Video by ${item.username}`, opts);
  };

  const promptAdminAction = (action) => {
    if (action === 'delete') {
      Alert.alert('🗑️ Delete Video', `Permanently delete this video by ${item.username}?\n\nThis cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'videos', item.id));
            await addDoc(collection(db, 'notifications'), {
              userId: item.userId, type: 'system', fromUserId: 'SYSTEM', fromUsername: 'Gaming Actions',
              text: 'Your video was permanently removed by the moderation team.',
              read: false, createdAt: serverTimestamp(),
            });
            Alert.alert('🗑️ Deleted');
          } catch(e) { Alert.alert('Error', e.message); }
        }},
      ]);
      return;
    }
    const reasons = action === 'hide'
      ? ['Suspicious content', 'Under review', 'Copyright issue', 'Spam', 'Other']
      : ['Pornographic content', 'Graphic violence', 'Hate speech', 'Harassment', 'Illegal content', 'Other'];
    Alert.alert(
      action === 'hide' ? '🚫 Hide Video' : action === 'ban' ? '⛔ Ban Video' : '✅ Unhide Video',
      action === 'unhide' ? 'Restore this video?' : 'Select reason:',
      action === 'unhide'
        ? [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Unhide', onPress: async () => {
              try {
                await updateDoc(doc(db, 'videos', item.id), { restricted: false, banned: false });
                Alert.alert('✅ Video restored');
              } catch(e) { Alert.alert('Error', e.message); }
            }},
          ]
        : [
            ...reasons.map(r => ({ text: r, onPress: () => applyAdminAction(action, r) })),
            { text: 'Cancel', style: 'cancel' },
          ]
    );
  };

  const applyAdminAction = async (action, reason) => {
    try {
      if (action === 'hide') {
        await updateDoc(doc(db, 'videos', item.id), {
          restricted: true, restrictedAt: serverTimestamp(),
          restrictedReason: reason, restrictedBy: 'admin',
        });
        Alert.alert('🚫 Video hidden', `Reason: ${reason}`);
      } else if (action === 'ban') {
        await updateDoc(doc(db, 'videos', item.id), {
          restricted: true, banned: true,
          restrictedAt: serverTimestamp(), restrictedReason: reason, restrictedBy: 'admin',
        });
        // Strike au user
        const userRef = doc(db, 'users', item.userId);
        await updateDoc(userRef, { strikes: increment(1) });
        // Notif in-app au user
        await addDoc(collection(db, 'notifications'), {
          userId: item.userId, type: 'system', fromUserId: 'SYSTEM',
          fromUsername: 'Gaming Actions',
          text: `⛔ Your video "${item.title || 'Untitled'}" was removed for violating our Community Guidelines: ${reason}. Strike added to your account.`,
          read: false, createdAt: serverTimestamp(),
        });
        Alert.alert('⛔ Video banned', `Strike issued to ${item.username}`);
      }
    } catch(e) { Alert.alert('Error', e.message); }
  };
const isOwnVideo = item.userId === user?.uid;
  // Fetch creator profile eagerly if missing (ensures badges/frames show on first render)
  const { fetchUserProfiles } = useFeedStore();
  useEffect(() => {
    if (item.userId && !userProfiles[item.userId] && item.userId !== user?.uid) {
      fetchUserProfiles([item.userId]);
    }
  }, [item.userId]);

  // Frame vidéo : chaque vidéo conserve la frame choisie à l'upload.
  const videoFrameId = item.videoFrame || 'none';
  const videoFrame = getVideoFrameById(videoFrameId);
  const isChampionFrame = videoFrameId === 'vf_champion' || (enrichedItem.isChampion && enrichedItem.isLegendaryFrame);
  // Leader auto-gets blue electric border if they're #1 and NOT the champion
  const isLeaderFrame = enrichedItem.isCurrentLeader && !enrichedItem.isChampion;
  const hasVideoFrame = (videoFrame && videoFrame.id !== 'none') || enrichedItem.isLegendaryFrame || isChampionFrame || isLeaderFrame;
  const videoFrameColor = isChampionFrame ? '#C9A84C' : isLeaderFrame ? '#00D4FF' : (videoFrame && videoFrame.id !== 'none') ? videoFrame.color : '#C9A84C';
  // Compteur de commentaires LIVE — compte les vrais commentaires dans Firestore
  // (corrige le bug "0 comments" dû à l'incohérence commentCount/commentsCount).
  // On ne s'abonne que pour le clip actif/proche pour limiter les lectures.
  const [liveCommentCount, setLiveCommentCount] = useState(item.commentCount ?? item.commentsCount ?? 0);
  useEffect(() => {
    if (!item?.id || !shouldLoad) return;
    const unsub = onSnapshot(
      query(collection(db, 'comments'), where('videoId', '==', item.id)),
      (snap) => setLiveCommentCount(snap.size),
      () => {}
    );
    return () => unsub();
  }, [item?.id, shouldLoad]);
  const liveViewCount = useFeedStore(s => s.videos.find(v => v.id === item.id)?.viewCount ?? item.viewCount ?? 0);

  // Player expo-video (en boucle ; lecture pilotée par isActive/isPaused plus bas)
  // shouldLoad gates the source — far-off clips get null (thumbnail only) to save memory.
  const player = useVideoPlayer(
    (shouldLoad && item.videoUrl) ? getVideoUrl(item) : null,
    (p) => {
      p.loop = true;
      p.muted = false;
    }
  );

  // firstFrame = true dès que le premier frame est rendu → cache l'overlay ET l'icône native
  const [firstFrame, setFirstFrame] = useState(false);
  const videoLoading = !firstFrame;

  useFocusEffect(
    useCallback(() => {
      setIsPaused(false);
      return () => setIsPaused(true);
    }, [])
  );

  const VIDEO_H = Math.floor(SW / (16 / 9));
  const META_H = 72;
  const CREATOR_H = 52;
  const ACTIONS_H = 54;
  const PREVIEW_H = CARD_HEIGHT - VIDEO_H - META_H - CREATOR_H - ACTIONS_H;

  // Joue le clip actif, met en pause les autres (ou si l'utilisateur a tapé pause)
  useEffect(() => {
    const shouldPlay = isActive && !isPaused;
    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch (e) {}
  }, [isActive, isPaused, player]);

  // ── 5-second view tracking ──────────────────────────────────────────────────
  // A clip counts as "viewed" only after 5 continuous seconds active in the feed.
  // This both increments the Firestore viewCount (deduped per session) AND feeds
  // the recommendation algorithm (recordView updates genre/game preferences).
  // Fast scrolling past a clip in <5s does NOT count — keeps the algo accurate.
  const viewTimerRef = useRef(null);
  useEffect(() => {
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);

    if (isActive && item?.id) {
      viewTimerRef.current = setTimeout(async () => {
        incrementView(item.id, user?.uid);   // Firestore viewCount (session-deduped)
        await recordView(item);                // Local algo preference update
      }, 5000);
    }

    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    };
  }, [isActive, item?.id]);

  // Synchronise le mute
  useEffect(() => {
    try { player.muted = isMuted; } catch (e) {}
  }, [isMuted]);

  return (
    <View style={{ width: SW, height: CARD_HEIGHT, backgroundColor: COLORS.black }}>

      {/* CREATOR — en haut de la vidéo */}
      <View style={{ height: CREATOR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}>
        <FramedAvatar user={enrichedItem} size={32} onPress={onNavigateProfile} />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <FeedAnimatedUsername
              username={enrichedItem.username || item.username}
              ueId={enrichedItem.equippedUsernameEffect || item.equippedUsernameEffect}
              baseStyle={cardS.creatorName}
            />
            {isLegendary && <View style={cardS.legBadge}><Text style={cardS.legBadgeText}>LEG</Text></View>}
            {item.accountType === 'gameconic' && <View style={[cardS.legBadge, { backgroundColor: COLORS.red }]}><Text style={cardS.legBadgeText}>ICON</Text></View>}
            {item.accountType === 'creator' && <View style={[cardS.legBadge, { backgroundColor: COLORS.blue }]}><Text style={[cardS.legBadgeText, { color: COLORS.dark }]}>CR</Text></View>}
            {(() => { const excl = ['creator','gameconic']; if (enrichedItem.isChampion && !excl.includes(enrichedItem.accountType)) return <ChampionBadge small />; if (enrichedItem.isCurrentLeader && !excl.includes(enrichedItem.accountType)) return <LeaderBadge small />; return null; })()}
          </View>
          {/* Profile badge cosmétique */}
          {(() => {
            const badgeId = item.equippedProfileBadge;
            if (!badgeId || badgeId === 'badge_none') return null;
            const BADGE_DATA = {
              badge_goat:     { emoji: '🐐', name: 'The GOAT',      color: '#FFD700' },
              badge_champion_t: { emoji: '👑', name: 'Champion',    color: '#FFD700' },
              badge_elite:    { emoji: '💎', name: 'Elite',         color: '#00D4FF' },
              badge_vip:      { emoji: '👑', name: 'VIP',           color: '#C9A84C' },
              badge_clutch:   { emoji: '⚡', name: 'Clutch Player', color: '#FFD700' },
              badge_legend:   { emoji: '🔥', name: 'Living Legend', color: '#FF3D00' },
              badge_apex:     { emoji: '🦅', name: 'Apex Predator', color: '#FF3D00' },
              badge_immortal: { emoji: '⚔️', name: 'Immortal',     color: '#FFD700' },
              badge_godmode:  { emoji: '🌟', name: 'GOD MODE',      color: '#FFD700' },
              badge_phantom:  { emoji: '👻', name: 'Phantom',       color: '#7C4DFF' },
              badge_sniper:   { emoji: '🎯', name: 'Sniper',        color: '#00D4FF' },
              badge_tryhard:  { emoji: '💪', name: 'Tryhard',       color: '#FF6D00' },
              badge_fragger:  { emoji: '💥', name: 'Top Fragger',   color: '#FF2D55' },
              badge_strat:    { emoji: '🧠', name: 'Strategist',    color: '#BF5AF2' },
              badge_rookie:   { emoji: '🎮', name: 'Rookie',        color: '#C0C0C0' },
              badge_og:       { emoji: '🏅', name: 'OG Player',     color: '#C9A84C' },
              badge_nochill:  { emoji: '🥶', name: 'No Chill',      color: '#00E5FF' },
              badge_verified: { emoji: '✅', name: 'Verified',      color: '#00C853' },
            };
            const bd = BADGE_DATA[badgeId];
            if (!bd) return null;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bd.color + '18', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9 }}>{bd.emoji} </Text>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: bd.color }}>{bd.name}</Text>
                </View>
              </View>
            );
          })()}
          {(() => {
            const sl = item.streakLevel;
            if (!sl || sl === 'noob') return null;
            if (item.hideStreakLevel) return null;
            const c = SL_COLORS[sl] || '#555555';
            const lbl = SL_LABELS[sl] || sl.toUpperCase();
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <View style={{ backgroundColor: c, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: '#1A1A2E', letterSpacing: 0.5 }}>{lbl}</Text>
                </View>
              </View>
            );
          })()}
        </View>
        {item.userId !== user?.uid && (
          <TouchableOpacity
            onPress={() => guestGuard(() => toggleFollow(user?.uid, item.userId, userProfile?.username))}
            style={[cardS.followBtn, isFollowing(item.userId) && { borderColor: COLORS.gray3 }]}
          >
            <Text style={[cardS.followBtnText, isFollowing(item.userId) && { color: COLORS.gray }]}>
              {isFollowing(item.userId) ? 'Following' : '+ Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* VIDEO — outer wrapper allows animated glow to escape overflow:hidden */}
      <View style={{ height: VIDEO_H, width: '100%' }}>
      <View style={[
        { ...StyleSheet.absoluteFillObject, backgroundColor: '#060610', overflow: 'hidden' },
        hasVideoFrame && !videoFrame?.animated && !isChampionFrame && !isLeaderFrame && { borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderColor: videoFrameColor },
      ]}>
        {item.videoUrl ? (
          <>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
              onFirstFrameRender={() => setFirstFrame(true)}
            />
            {videoLoading && (
              <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#060610' }}>
                {(item.thumbnail || item.thumbnailUrl) ? (
                  // Sharp thumbnail (no blur) — looks like the video is already there.
                  // The transition to video is seamless when the first frame renders.
                  <Image source={{ uri: item.thumbnail || item.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
                {/* Spinner only shows when this clip is the active one being watched */}
                {isActive && <ActivityIndicator size="large" color={COLORS.gold} />}
              </View>
            )}
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="game-controller" size={60} color={COLORS.gold} style={{ opacity: 0.1 }} />
          </View>
        )}

        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => {
          const now = Date.now();
          if (now - lastTapRef.current < 320) {
            // double tap — annule le timer de pause
            if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
            lastTapRef.current = 0;
            // double tap GG si pas sa propre vidéo
            if (item.userId !== user?.uid) {
              guestGuard(() => toggleGG(item.id, user?.uid, item));
            }
          } else {
            lastTapRef.current = now;
            tapTimerRef.current = setTimeout(() => {
              tapTimerRef.current = null;
              setIsPaused(p => !p);
            }, 320);
          }
        }}>
          {(!isActive || isPaused) && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play" size={28} color={COLORS.white} />
              </View>
            </View>
          )}
        </TouchableOpacity>

        <View style={{ position: 'absolute', bottom: 8, right: 8, flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => setIsMuted(m => !m)} style={cardS.controlBtn}>
            <Ionicons name={isMuted ? 'volume-mute' : 'volume-medium'} size={14} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('VideoPlayer', { video: item })} style={[cardS.controlBtn, { marginLeft: 6 }]}>
            <Ionicons name="expand" size={14} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Static corner pieces for non-animated frames */}
        {hasVideoFrame && !isChampionFrame && !isLeaderFrame && !videoFrame?.animated && (
          <>
            <View style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderTopWidth: 2, borderLeftWidth: 2, borderColor: videoFrameColor }} />
            <View style={{ position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderTopWidth: 2, borderRightWidth: 2, borderColor: videoFrameColor }} />
            <View style={{ position: 'absolute', bottom: 6, left: 6, width: 14, height: 14, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: videoFrameColor }} />
            <View style={{ position: 'absolute', bottom: 6, right: 6, width: 14, height: 14, borderBottomWidth: 2, borderRightWidth: 2, borderColor: videoFrameColor }} />
          </>
        )}
        {isChampionFrame && <ElectricBorder width={SW} height={VIDEO_H} radius={0} />}
        {isLeaderFrame && <LeaderElectricBorder width={SW} height={VIDEO_H} radius={0} />}
      </View>
      {/* Animated glow frame — OUTSIDE overflow:hidden so shadows render correctly */}
      {hasVideoFrame && !isChampionFrame && !isLeaderFrame && videoFrame?.animated && (
        <VideoGlowFrame color={videoFrameColor} width={SW} isShimmer={!!videoFrame?.shimmer} />
      )}
      </View>{/* end outer video wrapper */}

      {/* META */}
      <View style={{ height: META_H, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="game-controller-outline" size={11} color={COLORS.gold} />
          <Text style={cardS.gameText} numberOfLines={1}> {item.game} · {item.console} · {item.genre?.toUpperCase()}</Text>
          <Text style={cardS.dot}> · </Text>
          <Text style={cardS.dateText}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text style={cardS.videoTitle} numberOfLines={1}>{item.title || item.caption || 'Untitled'}</Text>
        {(item.caption || item.title) && (
          <Text style={cardS.videoDesc} numberOfLines={2}>{item.title ? item.caption : "Share your best clips and get GG'd 🎯"}</Text>
        )}
      </View>

      {/* ACTIONS */}
      <View style={{ height: ACTIONS_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}>
        <GGButton
          hasGG={item.hasGG}
          count={item.ggCount || 0}
          onPress={() => guestGuard(() => toggleGG(item.id, user?.uid, item))}
          onShowList={() => setShowGGList(true)}
          disabled={item.userId === user?.uid}
        />
        {!isOwnVideo && (
          <TouchableOpacity onPress={() => navigation.navigate('Report', { target: item, targetType: 'video' })} style={cardS.actionItem}>
            <Ionicons name="flag-outline" size={18} color={COLORS.gray} />
          </TouchableOpacity>
        )}
        {isAdminInFeed && (
          <TouchableOpacity onPress={handleAdminAction} style={cardS.actionItem}>
            <Ionicons name="shield" size={18} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>

      {/* COMMENTS PREVIEW — gros bouton Comments en haut, 2 most-liked en dessous */}
      <View style={{ height: PREVIEW_H, backgroundColor: COLORS.dark, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 }}>
        {/* Gros bouton Comments — ouvre l'overlay, bien visible et touchable */}
        <TouchableOpacity
          onPress={() => guestGuard(() => setShowComments(true))}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.gold} />
            <Text style={{ fontSize: 14, color: COLORS.white, fontWeight: '800', marginLeft: 8 }}>{liveCommentCount} Comments</Text>
            <Text style={{ fontSize: 11, color: COLORS.gray2, marginLeft: 10 }}>⭐ {item.ggCount >= 1000 ? `${(item.ggCount / 1000).toFixed(1)}K` : item.ggCount || 0}</Text>
            <Ionicons name="eye-outline" size={12} color={COLORS.gray2} style={{ marginLeft: 8 }} />
            <Text style={{ fontSize: 11, color: COLORS.gray2, marginLeft: 3 }}>{liveViewCount >= 1000 ? `${(liveViewCount / 1000).toFixed(1)}K` : liveViewCount}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, color: COLORS.black, fontWeight: '800' }}>Open</Text>
            <Ionicons name="chevron-up" size={13} color={COLORS.black} style={{ marginLeft: 3 }} />
          </View>
        </TouchableOpacity>
        {/* 2 most-liked comments — tap opens overlay */}
        <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 8 }}>
          <PreviewComments videoId={item.id} isActive={isActive} onOpenSheet={() => guestGuard(() => setShowComments(true))} />
        </View>
      </View>

      <CommentsSheet visible={showComments} video={item} onClose={() => setShowComments(false)} userProfile={userProfile} />
      <GGListModal visible={showGGList} videoId={item.id} onClose={() => setShowGGList(false)} />
    </View>
  );
}

// Memoize VideoCard — only re-render when its own active/load state or item changes.
// Without this, changing activeIndex re-renders EVERY card in the feed (laggy scroll).
const VideoCard = React.memo(VideoCardInner, (prev, next) => {
  const uid = prev.item.userId;
  const prevCreator = prev.userProfiles?.[uid] || {};
  const nextCreator = next.userProfiles?.[uid] || {};
  return prev.item.id === next.item.id
    && prev.isActive === next.isActive
    && prev.shouldLoad === next.shouldLoad
    && prev.item.ggCount === next.item.ggCount
    && prev.item.hasGG === next.item.hasGG
    && prev.item.commentCount === next.item.commentCount
    && prev.item.viewCount === next.item.viewCount
    && prev.userProfile?.uid === next.userProfile?.uid
    && prevCreator.isCurrentLeader === nextCreator.isCurrentLeader
    && prevCreator.isChampion === nextCreator.isChampion
    && prevCreator.avatar === nextCreator.avatar
    // Fallback: also check item-level fields in case userProfiles ref didn't change
    && prev.item.isCurrentLeader === next.item.isCurrentLeader
    && prev.item.isChampion === next.item.isChampion;
});

const cardS = StyleSheet.create({
  controlBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  gameText: { fontSize: 11, color: COLORS.gold, fontWeight: '600', flex: 1 },
  dot: { fontSize: 11, color: COLORS.gray2 },
  dateText: { fontSize: 10, color: COLORS.gray2 },
  videoTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  videoDesc: { fontSize: 11, color: COLORS.gray, lineHeight: 15 },
  creatorName: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  legBadge: { backgroundColor: COLORS.gold, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginLeft: 5 },
  legBadgeText: { fontSize: 7, fontWeight: '900', color: COLORS.black },
  followBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.gold },
  followBtnText: { fontSize: 11, color: COLORS.gold, fontWeight: '700' },
  actionItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export const uploadStore = { isUploading: false, progress: 0, listeners: [] };
export const setUploadState = (state) => {
  Object.assign(uploadStore, state);
  uploadStore.listeners.forEach(l => l(uploadStore));
};

function UploadIndicator() {
  // Initialise depuis uploadStore — au cas où setUploadState a été appelé avant le montage
  const [state, setState] = useState({ isUploading: uploadStore.isUploading, progress: uploadStore.progress });
  useEffect(() => {
    // Synchronise l'état au montage (peut avoir changé entre useState et useEffect)
    setState({ isUploading: uploadStore.isUploading, progress: uploadStore.progress });
    uploadStore.listeners.push(setState);
    return () => { uploadStore.listeners = uploadStore.listeners.filter(l => l !== setState); };
  }, []);
  if (!state.isUploading) return null;
  return (
    <View style={{
      position: 'absolute', top: Platform.OS === 'ios' ? 54 : 30, left: 16,
      backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
      flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gold, zIndex: 999,
    }}>
      <ActivityIndicator size="small" color={COLORS.gold} />
      <Text style={{ color: COLORS.gold, fontSize: 11, fontWeight: '700', marginLeft: 6 }}>
        Uploading... {state.progress > 0 ? `${state.progress}%` : ''}
      </Text>
    </View>
  );
}

export default function FeedScreen({ navigation }) {
  const { user, userProfile, isGuest } = useAuthStore();
  const guestGuard = useGuestGuard(navigation);
  const { fetchFollowing } = useUserStore();
  const { getFilteredVideos, activeTab, setActiveTab, setFilter, fetchVideos, fetchFollowingVideos, fetchFilteredVideos, fetchUserProfiles, cleanup, videos, userProfiles, isLoading, filterConsole, filterGenre, filterGame } = useFeedStore();  const [displayVideos, setDisplayVideos] = useState([]);
  const [filterModal, setFilterModal] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Force playlist refresh — picks up newly uploaded videos and re-checks position
    useFeedStore.setState({ lastDoc: null, hasMore: true, _playlist: null, _docCache: null, _followingCache: null });
    await fetchVideos(user?.uid, false);
    setRefreshing(false);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const count = snap.size;
      setUnreadCount(count);
      // Sync app icon badge to real unread count
      Notifications.setBadgeCountAsync(count).catch(() => {});
    });
    return () => unsub();
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      // On every focus: fetch fresh videos.
      // fetchVideos reads sessionSeenIds from AsyncStorage internally,
      // so even after Expo reload, the session IDs exclude already-seen clips.
      fetchVideos(user?.uid, false);
      if (user?.uid) fetchFollowing(user.uid);
      // Re-fetch creator profiles on focus so badges/cosmetics are up-to-date
      const uids = [...new Set(useFeedStore.getState().videos.map(v => v.userId).filter(Boolean))];
      if (uids.length > 0) fetchUserProfiles(uids);
      return () => { setActiveIndex(-1); };
    }, [user?.uid])
  );

  useEffect(() => {
    // cleanup only — fetchVideos is handled by useFocusEffect to avoid duplicate calls
    return () => cleanup();
  }, [user?.uid]);

  useEffect(() => {
    const filtered = getFilteredVideos();
    // Eagerly fetch creator profiles so isCurrentLeader/isChampion/cosmetics are available
    const uids = [...new Set(filtered.map(v => v.userId).filter(Boolean))];
    if (uids.length > 0) fetchUserProfiles(uids);
    if (displayVideos.length === 0) {
      setDisplayVideos(activeTab === 'following' ? filtered : shuffle(filtered));
    } else if (filtered.length > displayVideos.length) {
      setDisplayVideos(prev => {
        const existingIds = new Set(prev.map(v => v.id));
        const newOnes = filtered.filter(v => !existingIds.has(v.id));
        return [...prev.map(v => {
          const updated = filtered.find(f => f.id === v.id);
          if (!updated) return v;
          return {
            ...updated,
            hasGG: updated.hasGG !== undefined ? updated.hasGG : v.hasGG,
            ggCount: updated.ggCount !== undefined ? updated.ggCount : v.ggCount,
          };
        }), ...newOnes];
      });
    } else {
      setDisplayVideos(prev => prev.map(v => {
        const updated = filtered.find(f => f.id === v.id);
        if (!updated) return v;
        return {
          ...updated,
          hasGG: updated.hasGG !== undefined ? updated.hasGG : v.hasGG,
          ggCount: updated.ggCount !== undefined ? updated.ggCount : v.ggCount,
        };
      }));
    }
  }, [videos, userProfiles, activeTab]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const currentIndex = viewableItems[0].index;
      setActiveIndex(currentIndex);
      const { hasMore, isLoading } = useFeedStore.getState();
      // With the in-memory doc cache, loadMore is near-instant (no Firestore wait),
      // so triggering 3 clips early keeps the feed seamless without over-fetching.
      if (currentIndex >= displayVideos.length - 3 && hasMore && !isLoading) {
        fetchVideos(user?.uid, true);
      }
    }
  }, [displayVideos.length, user?.uid]);

  const viewabilityConfig = { itemVisiblePercentThreshold: 80 };

  const renderItem = useCallback(({ item, index }) => (
    <VideoCard
      item={item}
      navigation={navigation}
      userProfile={userProfile}
      userProfiles={userProfiles}
      isActive={index === activeIndex}
      // Preload window: current clip + next 2 (forward) + previous 1 (back).
      // Forward bias because users scroll down — the next clips are ready instantly.
      // Keeping previous 1 means scrolling back up is also instant.
      // This is the TikTok pattern: aggressive forward preload for seamless feel.
      shouldLoad={index >= activeIndex - 1 && index <= activeIndex + 2}
      onNavigateProfile={() => navigation.navigate('UserProfile', { userId: item.userId })}
    />
  ), [userProfile, userProfiles, activeIndex]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <UploadIndicator />

      {(() => {
        const streakLevel = userProfile?.streakLevel || 'noob';
        const streakLabel = SL_LABELS[streakLevel] || 'NOOB';
        const streakColor = SL_COLORS[streakLevel] || SL_COLORS.noob;
        const isLeg  = userProfile?.plan === 'legendary';
        const isIcon = userProfile?.accountType === 'gameconic';
        const isCr   = userProfile?.accountType === 'creator';
        const excl   = ['creator', 'gameconic'];
        const showChampion = !!userProfile?.isChampion && !excl.includes(userProfile?.accountType);
        const showLeader   = !!userProfile?.isCurrentLeader && !excl.includes(userProfile?.accountType);
        const equippedBadge = userProfile?.equippedBadge
          ? PROFILE_BADGES.find(b => b.id === userProfile.equippedBadge && b.emoji)
          : null;
        return (
          <View style={styles.header}>
            {/* LEFT — Avatar + Username + badges row */}
            <TouchableOpacity
              style={styles.headerLeft}
              activeOpacity={0.75}
              onPress={() => { if (!user?.uid) return; navigation.navigate('UserProfile', { userId: user?.uid }); }}
            >
              <FramedAvatar user={userProfile} size={36} />
              <View style={{ marginLeft: 8, flex: 1 }}>
                {/* Username with UE effect */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <FeedAnimatedUsername
                    username={userProfile?.username || 'Player'}
                    ueId={userProfile?.equippedUsernameEffect}
                    baseStyle={styles.headerUsername}
                  />
                  {isLeg  && <View style={styles.hBadge}><Text style={styles.hBadgeTxt}>LEG</Text></View>}
                  {isIcon && <View style={[styles.hBadge, { backgroundColor: COLORS.red }]}><Text style={styles.hBadgeTxt}>ICON</Text></View>}
                  {isCr   && <View style={[styles.hBadge, { backgroundColor: COLORS.blue }]}><Text style={[styles.hBadgeTxt, { color: COLORS.black }]}>CR</Text></View>}
                  {showChampion && <ChampionBadge small />}
                  {showLeader   && <LeaderBadge small />}
                </View>
                {/* Title badge + streak level pill */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  {equippedBadge && (
                    <Text style={styles.headerBadge} numberOfLines={1}>
                      {equippedBadge.emoji} {equippedBadge.name}
                    </Text>
                  )}
                  <View style={{ backgroundColor: streakColor, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 }}>
                    <Text style={{ fontSize: 8, fontWeight: '900', color: '#1A1A2E', letterSpacing: 0.5 }}>{streakLabel}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* RIGHT — Search + Filter + Notifications */}
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={() => navigation.navigate('Search')} style={styles.headerBtn}>
                <Ionicons name="search-outline" size={22} color={COLORS.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFilterModal(true)} style={styles.headerBtn}>
                <Ionicons name="options-outline" size={22}
                  color={filterConsole || filterGenre || filterGame ? COLORS.gold : COLORS.white} />
                {(filterConsole || filterGenre || filterGame) && (
                  <View style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gold }} />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => guestGuard(() => navigation.navigate('Notifications'))} style={styles.headerBtn}>
                <View>
                  <Ionicons name="notifications-outline" size={22} color={COLORS.white} />
                  {!isGuest && unreadCount > 0 && (
                    <View style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.black }}>
                      <Text style={{ color: COLORS.white, fontSize: 9, fontWeight: '900' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      <View style={styles.tabs}>
  {['For You', 'Following'].map((tab, i) => {
    const key = i === 0 ? 'forYou' : 'following';
    return (
      <TouchableOpacity
        key={tab}
        onPress={() => {
          if (activeTab === key) return;
          setActiveTab(key);
          setDisplayVideos([]);
          useFeedStore.setState({
            videos: [],
            hasMore: true,
            _playlist: null,
            _docCache: null,
            _followingCache: null,
          });
          if (key === 'following') {
            fetchFollowingVideos(user?.uid);
          } else {
            fetchVideos(user?.uid, false);
          }
        }}
        style={styles.tabItem}
      >
        <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{tab}</Text>
        {activeTab === key && <View style={styles.tabIndicator} />}
      </TouchableOpacity>
    );
  })}
</View>

      {/* QUICK FILTER BAR — filtre rapide par genre, en haut du feed */}
      <View style={styles.quickFilterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickFilterRow}>
          {[{ id: null, label: 'All' }, ...GENRES].map((g) => {
            const active = (filterGenre || null) === g.id;
            return (
              <TouchableOpacity
                key={String(g.id)}
                onPress={() => {
                  const newGenre = g.id;
                  setFilter(filterConsole, newGenre, filterGame);
                  setDisplayVideos([]);
                  useFeedStore.setState({ videos: [], hasMore: true, _playlist: null, _docCache: null });
                  if (filterConsole || newGenre || filterGame) {
                    fetchFilteredVideos(user?.uid);
                  } else {
                    fetchVideos(user?.uid, false);
                  }
                }}
                style={[styles.quickChip, active && styles.quickChipActive]}
              >
                <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
          {(filterConsole || filterGame) && (
            <TouchableOpacity
              onPress={() => {
                setFilter(null, filterGenre, null);
                setDisplayVideos([]);
                useFeedStore.setState({ videos: [], hasMore: true, _playlist: null, _docCache: null });
                if (filterGenre) {
                  fetchFilteredVideos(user?.uid);
                } else {
                  fetchVideos(user?.uid, false);
                }
              }}
              style={[styles.quickChip, styles.quickChipClear]}
            >
              <Ionicons name="close" size={12} color={COLORS.gold} />
              <Text style={[styles.quickChipText, { color: COLORS.gold }]}> {filterGame || filterConsole?.toUpperCase()}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
      {isLoading && displayVideos.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={{ color: COLORS.gray, fontSize: 13, marginTop: 12, fontWeight: '600' }}>Loading clips... 🎮</Text>
        </View>
      ) : (
        <FlatList
          data={displayVideos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={CARD_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={2}
          windowSize={3}
          initialNumToRender={2}
          updateCellsBatchingPeriod={50}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: CARD_HEIGHT, offset: CARD_HEIGHT * index, index })}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.gold}
              progressBackgroundColor={COLORS.dark}
            />
          }
          ListFooterComponent={
            isLoading && displayVideos.length > 0 ? (
              <View style={{ height: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.black }}>
                <ActivityIndicator size="small" color={COLORS.gold} />
                <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 6, fontWeight: '600' }}>Loading more clips... 🎮</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: CARD_HEIGHT }}>
              <Ionicons name={activeTab === 'following' ? 'people-outline' : 'game-controller-outline'} size={60} color={COLORS.gray2} />
              {activeTab === 'following' ? (
                <>
                  <Text style={{ color: COLORS.gray, fontSize: 16, fontWeight: '700', marginTop: 16 }}>No clips from people you follow</Text>
                  <Text style={{ color: COLORS.gray2, fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>Follow creators in the feed to see their clips here 🎮</Text>
                </>
              ) : (
                <>
                  <Text style={{ color: COLORS.gray, fontSize: 16, fontWeight: '700', marginTop: 16 }}>No clips yet</Text>
                  <Text style={{ color: COLORS.gray2, fontSize: 13, marginTop: 8 }}>Be the first to upload! 🎮</Text>
                </>
              )}
            </View>
          }
        />
      )}

      <FilterModal
        visible={filterModal}
        onClose={() => setFilterModal(false)}
        onApply={(console_, genre, game) => {
          setFilter(console_, genre, game);
          setDisplayVideos([]);
          useFeedStore.setState({ videos: [], hasMore: true, _playlist: null, _docCache: null });
          if (console_ || genre || game) {
            fetchFilteredVideos(user?.uid);
          } else {
            fetchVideos(user?.uid, false);
          }
          setFilterModal(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 50 : 28, paddingBottom: 8, backgroundColor: COLORS.black, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerUsername: { fontSize: 14, fontWeight: '700', color: COLORS.white, letterSpacing: 0.3 },
  headerBadge: { fontSize: 10, fontWeight: '600', color: COLORS.gold, opacity: 0.85 },
  headerStreak: { fontSize: 9, fontWeight: '800', color: COLORS.gray, letterSpacing: 0.8, textTransform: 'uppercase' },
  hBadge: { backgroundColor: COLORS.gold, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3, marginLeft: 5 },
  hBadgeTxt: { fontSize: 8, fontWeight: '900', color: COLORS.black },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { marginLeft: 14 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 9, backgroundColor: COLORS.black, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  tabItem: { alignItems: 'center', marginRight: 24 },
  tabText: { fontSize: 13, color: COLORS.gray, fontWeight: '500' },
  tabTextActive: { color: COLORS.white, fontWeight: '800' },
  tabIndicator: { height: 2, width: '100%', backgroundColor: COLORS.gold, borderRadius: 1, marginTop: 3 },
  quickFilterWrap: { backgroundColor: COLORS.black, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  quickFilterRow: { paddingHorizontal: 14, paddingVertical: 8 },
  quickChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, height: 30 },
  quickChipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  quickChipClear: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.08)' },
  quickChipText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  quickChipTextActive: { color: COLORS.gold, fontWeight: '700' },
});
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Platform, Image, Animated, Dimensions, ActivityIndicator,
  LayoutAnimation, UIManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, limit, getDocs, getDoc, doc, updateDoc, onSnapshot, where } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../../components/FramedAvatar';
import { ChampionBadge, LeaderBadge } from '../../components/ElectricEffect';

const { width: SW } = Dimensions.get('window');

// UIDs exemptés de l'exclusion — peuvent rester dans le classement même si creator/gameconic
// Pour retirer quelqu'un, supprimer son UID de cette liste (pas besoin de maj app)
const RANKING_EXEMPT_UIDS = [
  // Ton UID — à retirer quand tu voudras t'exclure
  // Trouve ton UID dans Firebase Console → Authentication → ton compte
];

// AccountTypes exclus du classement (trop influents)
const EXCLUDED_ACCOUNT_TYPES = ['creator', 'gameconic'];

// Enable LayoutAnimation on Android (iOS has it by default)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TIERS = {
  noob: { label: 'NOOB', color: '#555566' },
  bronze: { label: 'BRONZE', color: COLORS.bronze },
  silver: { label: 'SILVER', color: COLORS.silver },
  gold: { label: 'GOLD', color: COLORS.gold },
  goat: { label: 'GOAT', color: COLORS.red },
};
const getTier = (u) => TIERS[u?.streakLevel] || TIERS.noob;

// Mêmes seuils que le profil — la barre reflète la progression de Streak Level
const STREAK_LEVELS = [
  { id: 'noob', minPoints: 0 },
  { id: 'bronze', minPoints: 500 },
  { id: 'silver', minPoints: 2000 },
  { id: 'gold', minPoints: 5000 },
  { id: 'goat', minPoints: 15000 },
];
const streakPct = (u) => {
  const pts = u?.streakPoints || 0;
  const lvl = u?.streakLevel || 'noob';
  const idx = Math.max(0, STREAK_LEVELS.findIndex(l => l.id === lvl));
  const cur = STREAK_LEVELS[idx];
  const next = STREAK_LEVELS[idx + 1];
  const seg = next ? Math.min(Math.max((pts - cur.minPoints) / (next.minPoints - cur.minPoints), 0), 1) : 1;
  return ((idx + seg) / (STREAK_LEVELS.length - 1)) * 100;
};
const fmtGG = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n || 0}`);
const thumbOf = (v) => v?.thumbnail || v?.thumbnailUrl || null;

/* ---------------------------------------------------------------- Avatar */

function TierBadge({ user }) {
  const tier = getTier(user);
  return (
    <View style={[s.tierBadge, { borderColor: tier.color + '70', backgroundColor: tier.color + '18' }]}>
      <Text style={[s.tierBadgeText, { color: tier.color }]}>{tier.label}</Text>
    </View>
  );
}

/* --------------------------------------------------------- Genre Leaderboard */
// In-memory cache for genre leaderboards — avoids re-fetching on tab switch
const GENRE_CACHE = {};
const GENRE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function GenreLeaderboard({ genreId, navigation }) {
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Check cache first
      const cached = GENRE_CACHE[genreId];
      if (cached && Date.now() - cached.ts < GENRE_CACHE_TTL) {
        if (!cancelled) { setUsers(cached.data); setLoading(false); }
        return;
      }
      try {
        // Get videos of this genre, aggregate by user
        const snap = await getDocs(
          query(collection(db, 'videos'),
            where('genre', '==', genreId),
            limit(200))
        );
        const userGGs = {};
        snap.docs.forEach(d => {
          const v = d.data();
          if (!v.userId || !(v.ggCount > 0)) return;
          if (!userGGs[v.userId]) userGGs[v.userId] = { uid: v.userId, username: v.username, avatar: v.avatar || '', ggCount: 0 };
          userGGs[v.userId].ggCount += v.ggCount || 0;
        });
        const top3 = Object.values(userGGs)
          .sort((a, b) => b.ggCount - a.ggCount)
          .slice(0, 3)
          .map((u, i) => ({ ...u, rank: i + 1 }));
        // Store in cache
        GENRE_CACHE[genreId] = { data: top3, ts: Date.now() };
        if (!cancelled) { setUsers(top3); setLoading(false); }
      } catch { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [genreId]);

  if (loading) return <ActivityIndicator color={COLORS.gold} style={{ padding: 20 }} />;
  if (users.length === 0) return (
    <View style={{ padding: 16, alignItems: 'center' }}>
      <Text style={{ color: COLORS.gray, fontSize: 12 }}>No clips in this genre yet — be the first! 🎮</Text>
    </View>
  );

  const medals = ['🥇', '🥈', '🥉'];
  const colors = [COLORS.gold, COLORS.silver, COLORS.bronze];

  return (
    <View>
      {users.map((u, i) => (
        <TouchableOpacity key={u.uid} onPress={() => navigation.navigate('UserProfile', { userId: u.uid })}
          style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: i < users.length-1 ? 0.5 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
          <Text style={{ fontSize: 18, width: 32, textAlign: 'center' }}>{medals[i]}</Text>
          <Avatar user={u} size={34} />
          <Text style={{ flex: 1, color: COLORS.white, fontSize: 13, fontWeight: '700', marginLeft: 10 }} numberOfLines={1}>{u.username}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="star" size={11} color={colors[i]} />
              <Text style={{ color: colors[i], fontSize: 12, fontWeight: '900' }}>{fmtGG(u.ggCount)}</Text>
            </View>
            <Text style={{ color: COLORS.gray, fontSize: 9 }}>{[50,25,10][i]} pts/month</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------- Hero Podium */
function HeroPodium({ data, navigation }) {
  const top3 = data.slice(0, 3);
  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  const glow = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  // Pop animation when the #1 spot changes hands
  const firstPop = useRef(new Animated.Value(1)).current;
  const prevFirstRef = useRef(first?.uid);

  useEffect(() => {
    if (first?.uid && prevFirstRef.current && prevFirstRef.current !== first.uid) {
      // New leader — celebratory pop
      firstPop.setValue(0.6);
      Animated.spring(firstPop, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 14 }).start();
    }
    prevFirstRef.current = first?.uid;
  }, [first?.uid]);

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1600, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1600, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1400, useNativeDriver: true }),
    ])).start();
  }, []);

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.2] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.55] });
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  const Spot = ({ user, place }) => {
    if (!user) return <View style={{ flex: 1 }} />;
    const isFirst = place === 1;
    const tier = getTier(user);
    const accent = isFirst ? COLORS.gold : place === 2 ? COLORS.silver : COLORS.bronze;
    const pedH = isFirst ? 92 : place === 2 ? 66 : 52;
    const avSize = isFirst ? 66 : 50;
    return (
      <TouchableOpacity style={pod.spot} activeOpacity={0.85} onPress={() => navigation.navigate('UserProfile', { userId: user.uid })}>
        {/* Crown / medal */}
        {isFirst ? (
          <Animated.Text style={[pod.crown, { transform: [{ translateY: bobY }] }]}>👑</Animated.Text>
        ) : (
          <Text style={pod.medal}>{place === 2 ? '🥈' : '🥉'}</Text>
        )}

        {/* Avatar with animated glow for #1 */}
        <Animated.View style={{ alignItems: 'center', justifyContent: 'center', transform: isFirst ? [{ scale: firstPop }] : [] }}>
          {isFirst && (
            <Animated.View style={[pod.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
          )}
          <Avatar user={user} size={avSize} glow={!isFirst} />
        </Animated.View>

        <Text style={[pod.name, isFirst && { color: COLORS.gold, fontSize: 14 }]} numberOfLines={1}>{user.username}</Text>
        <View style={[pod.ggChip, { borderColor: accent + '60', backgroundColor: accent + '14' }]}>
          <Ionicons name="star" size={9} color={accent} />
          <Text style={[pod.ggChipText, { color: accent }]}> {fmtGG(user.ggCount)} GG</Text>
        </View>

        {/* Pedestal */}
        <View style={[pod.pedestal, { height: pedH, borderColor: accent, backgroundColor: isFirst ? 'rgba(201,168,76,0.14)' : COLORS.card }]}>
          <View style={[pod.pedestalTop, { backgroundColor: accent + '55' }]} />
          <Text style={[pod.pedestalNum, { color: accent, fontSize: isFirst ? 30 : 22 }]}>{place}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={pod.container}>
      <Spot user={second} place={2} />
      <Spot user={first} place={1} />
      <Spot user={third} place={3} />
    </View>
  );
}

const pod = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 8, paddingTop: 20, paddingBottom: 12, backgroundColor: 'rgba(201,168,76,0.03)', marginHorizontal: 0, borderBottomWidth: 0.5, borderBottomColor: 'rgba(201,168,76,0.15)' },
  spot: { flex: 1, alignItems: 'center' },
  crown: { fontSize: 30, marginBottom: 4 },
  medal: { fontSize: 22, marginBottom: 6 },
  glow: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.gold },
  name: { fontSize: 12, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginTop: 7, maxWidth: '95%', letterSpacing: 0.3 },
  ggChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginTop: 6, marginBottom: 10 },
  ggChipText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  pedestal: { width: '85%', borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pedestalTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 5 },
  pedestalNum: { fontWeight: '900' },
});

/* -------------------------------------------------------- Your Rank Card */
function YourRankCard({ myRank, userProfile, topUsers }) {
  if (!myRank) {
    return (
      <View style={s.youCard}>
        <Avatar user={userProfile} size={40} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.youTitle}>have classified yet</Text>
          <Text style={s.youSub}>Post clips and get GG-ed to get into the rankings 🎮</Text>
        </View>
      </View>
    );
  }

  const isChamp = myRank.rank === 1;
  const above = topUsers.find((u) => u.rank === myRank.rank - 1);
  const gap = above ? Math.max(above.ggCount - myRank.ggCount, 0) : null;

  return (
    <View style={[s.youCard, isChamp && { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.10)' }]}>
      <View style={s.youRankBox}>
        <Text style={s.youRankHash}>#</Text>
        <Text style={s.youRankNum}>{myRank.rank}</Text>
      </View>
      <Avatar user={userProfile} size={42} glow />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={s.youName}>YOU · {userProfile?.username}</Text>
        </View>
        {isChamp ? (
          <Text style={[s.youSub, { color: COLORS.gold }]}>👑 You're dominating the season. Keep the crown!</Text>
        ) : gap !== null ? (
          <Text style={s.youSub}>
            <Text style={{ color: COLORS.green, fontWeight: '800' }}>▲ {fmtGG(gap)} GG</Text> to pass #{myRank.rank - 1}
          </Text>
        ) : (
          <Text style={s.youSub}>Keep climbing🔥</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.youGG}>{fmtGG(myRank.ggCount)}</Text>
        <Text style={s.youGGLabel}>GG</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ Player Row */
function PlayerRow({ user, maxGG, navigation }) {
  const tier = getTier(user);
  const pct = Math.max(streakPct(user), 2);

  // Animate when this player's rank changes (live leaderboard movement).
  const prevRankRef = useRef(user.rank);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (prevRankRef.current !== user.rank) {
      const movedUp = user.rank < prevRankRef.current;
      prevRankRef.current = user.rank;
      // Slide in from the direction they moved + a gold glow pulse
      slideAnim.setValue(movedUp ? -20 : 20);
      glowAnim.setValue(1);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 8 }),
        Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]).start();
    }
  }, [user.rank]);

  const glowBg = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(201,168,76,0)', 'rgba(201,168,76,0.18)'],
  });

  return (
    // Deux Animated.View imbriquées — obligatoire car on ne peut pas mélanger
    // useNativeDriver: true (transform/slide) et false (backgroundColor/glow)
    // sur le même nœud natif.
    <Animated.View style={{ backgroundColor: glowBg, borderRadius: 12 }}>
    <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
    <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: user.uid })} style={s.pRow} activeOpacity={0.85}>
      <Text style={[s.pRank, { color: tier.color }]}>{user.rank}</Text>
      <Avatar user={user} size={38} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
          <Text style={s.pName} numberOfLines={1}>{user.username}</Text>
          <TierBadge user={user} />
          {user.plan === 'legendary' && <View style={s.legBadge}><Text style={s.legBadgeText}>LEG</Text></View>}
          {user.isChampion ? <ChampionBadge small /> : user.isCurrentLeader ? <LeaderBadge small /> : null}
        </View>
        <View style={s.powerTrack}>
          <View style={[s.powerFill, { width: `${pct}%`, backgroundColor: tier.color }]} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
        <Text style={s.pGG}>{fmtGG(user.ggCount)}</Text>
        <Text style={s.pGGLabel}>GG</Text>
      </View>
    </TouchableOpacity>
    </Animated.View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------- Video Row */
function VideoRow({ v, rank, highlight, navigation }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const thumb = thumbOf(v);
  return (
    <TouchableOpacity onPress={() => navigation.navigate('VideoPlayer', { video: v })} style={[s.vRow, highlight && { backgroundColor: 'rgba(201,168,76,0.05)' }]} activeOpacity={0.85}>
      {medal ? <Text style={s.vMedal}>{medal}</Text> : <Text style={s.vRank}>#{rank}</Text>}
      <View style={[s.vThumb, rank === 1 && { borderWidth: 1.5, borderColor: COLORS.gold }]}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%', borderRadius: 9 }} resizeMode="cover" />
        ) : (
          <Ionicons name="play-circle" size={24} color={rank === 1 ? COLORS.gold : COLORS.gray} />
        )}
        <View style={s.vPlayDot}><Ionicons name="play" size={9} color={COLORS.white} /></View>
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={[s.vName, rank === 1 && { color: COLORS.gold }]} numberOfLines={1}>{v.username}</Text>
        <Text style={s.vCaption} numberOfLines={1}>{v.caption}</Text>
        <Text style={s.vGame} numberOfLines={1}>🎮 {v.game}</Text>
      </View>
      <View style={[s.vGGChip, rank === 1 && { backgroundColor: COLORS.gold }]}>
        <Ionicons name="star" size={10} color={rank === 1 ? COLORS.black : COLORS.gold} />
        <Text style={[s.vGGText, rank === 1 && { color: COLORS.black }]}> {fmtGG(v.ggCount)}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------ Main screen */
export default function RankingsScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [activeTab, setActiveTab] = useState('topgg');
  const [now2, setNow2] = useState(new Date());
  const [topUsers, setTopUsers] = useState([]);
  const [topVideos, setTopVideos] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [videosOfDay, setVideosOfDay] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastLeaderRef = useRef(null); // tracks last synced leader to avoid redundant writes

  useEffect(() => {
    const timer = setInterval(() => setNow2(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Leaderboard listener ──────────────────────────────────────────────────
  // Top GG tab: always real-time — seeing someone overtake you live creates
  // urgency to post and reclaim your rank. That's the whole point.
  // Limited to top 500 by ggCount to avoid reading all videos.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'videos'), orderBy('ggCount', 'desc'), limit(500)),
      (snap) => {
        const allVideos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processRankings(allVideos);
      },
      (err) => { console.log('rankings listener error:', err.message); setLoading(false); }
    );
    return () => unsub();
  }, [user?.uid]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Listener auto-updates; this just gives visual feedback
    setTimeout(() => setRefreshing(false), 600);
  };

  // processRankings — builds the leaderboard from an array of all video docs.
  // Called by the real-time listener whenever GG counts change.
  const processRankings = async (allVideos) => {
    try {
      // Top vidéos par ggCount
      const topVids = [...allVideos]
        .sort((a, b) => (b.ggCount || 0) - (a.ggCount || 0))
        .map((v, i) => ({ rank: i + 1, ...v }));
      setTopVideos(topVids.filter(v => (v.ggCount || 0) > 0).slice(0, 5));

      // Agrège les GG par joueur depuis TOUTES les vidéos
      const userGGs = {};
      allVideos.forEach((v) => {
        if (!v.userId || !(v.ggCount > 0)) return;
        if (!userGGs[v.userId]) {
          userGGs[v.userId] = { uid: v.userId, username: v.username, avatar: v.avatar || '', plan: v.plan || 'free', streakLevel: v.streakLevel, ggCount: 0 };
        }
        userGGs[v.userId].ggCount += v.ggCount || 0;
      });

      const usersList = Object.values(userGGs)
        .sort((a, b) => b.ggCount - a.ggCount)
        .slice(0, 20)
        .map((u, i) => ({ ...u, rank: i + 1 }));

      // Enrichit avec les vrais profils (avatar, plan, tier)
      const enrichedUsers = await Promise.all(
        usersList.map(async (u) => {
          try {
            const snap = await getDoc(doc(db, 'users', u.uid));
            if (snap.exists()) {
              const p = snap.data();
              return { ...u, avatar: p.avatar || '', plan: p.plan || u.plan, username: p.username || u.username, streakLevel: p.streakLevel || u.streakLevel, accountType: p.accountType || 'gamer', isChampion: p.isChampion || false, equippedFrame: p.equippedFrame || 'none' };
            }
          } catch (e) {}
          return u;
        })
      );
      // Animate position changes — items smoothly slide to their new rank
      // when GG counts change the order (live leaderboard effect).
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        LayoutAnimation.configureNext(LayoutAnimation.create(
          400, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity
        ));
      }
      // Exclure creators/gameconic du classement (sauf UIDs exemptés)
      const filteredUsers = enrichedUsers.filter(u =>
        RANKING_EXEMPT_UIDS.includes(u.uid) ||
        !EXCLUDED_ACCOUNT_TYPES.includes(u.accountType)
      ).slice(0, 10).map((u, i) => ({ ...u, rank: i + 1 }));

      setTopUsers(filteredUsers);

      // Remove isCurrentLeader badge from excluded users
      const excludedWithLeader = enrichedUsers.filter(u =>
        u.isCurrentLeader &&
        EXCLUDED_ACCOUNT_TYPES.includes(u.accountType) &&
        !RANKING_EXEMPT_UIDS.includes(u.uid)
      );
      for (const u of excludedWithLeader) {
        try { await updateDoc(doc(db, 'users', u.uid), { isCurrentLeader: false }); } catch {}
      }

      // Mon rang
      if (user?.uid) {
        const sorted = Object.values(userGGs).sort((a, b) => b.ggCount - a.ggCount);
        const myEntry = sorted.find((u) => u.uid === user.uid);
        if (myEntry) {
          const myPos = sorted.findIndex((u) => u.uid === user.uid) + 1;
          setMyRank({ rank: myPos, ggCount: myEntry.ggCount });
        }

        // ── Real-time leader sync ────────────────────────────────────────────
        // The true #1 (most GG) should be the ONLY one with isCurrentLeader.
        // Guarded by a ref so we only write when the leader actually changes,
        // not on every snapshot (avoids unnecessary Firestore writes).
        // Only consider non-excluded users for leader badge
        const rankedSorted = sorted.filter(u =>
          RANKING_EXEMPT_UIDS.includes(u.uid) ||
          !EXCLUDED_ACCOUNT_TYPES.includes(u.accountType)
        );
        const trueLeaderId = rankedSorted[0]?.uid;
        const trueLeaderGG = rankedSorted[0]?.ggCount || 0;
        if (trueLeaderId && trueLeaderGG > 0 && lastLeaderRef.current !== trueLeaderId) {
          lastLeaderRef.current = trueLeaderId;
          try {
            // Find ALL users currently flagged as leader
            const flaggedSnap = await getDocs(
              query(collection(db, 'users'), where('isCurrentLeader', '==', true))
            );
            // Remove the badge from anyone who is NOT the true #1
            for (const d of flaggedSnap.docs) {
              if (d.id !== trueLeaderId) {
                await updateDoc(doc(db, 'users', d.id), { isCurrentLeader: false });
              }
            }
            // Make sure the true leader HAS the badge
            const leaderHasBadge = flaggedSnap.docs.some(d => d.id === trueLeaderId);
            if (!leaderHasBadge) {
              await updateDoc(doc(db, 'users', trueLeaderId), { isCurrentLeader: true });
            }
          } catch (e) {}
        }
      }

      // Vidéos du jour (24h)
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const todayVideos = allVideos.filter((v) => {
        const created = v.createdAt?.toDate ? v.createdAt.toDate() : new Date(v.createdAt);
        return created > dayAgo;
      });
      setVideosOfDay(todayVideos.slice(0, 5).map((v, i) => ({ ...v, rank: i + 1 })));
    } catch(e){}
    setLoading(false);
  };

  const endOfMonth = new Date(now2.getFullYear(), now2.getMonth() + 1, 0, 23, 59, 59);
  const daysLeft = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate() - now2.getDate();
  const diffMs = endOfMonth - now2;
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor((diffMs % 3600000) / 60000);
  const diffS = Math.floor((diffMs % 60000) / 1000);
  const isLastDay = daysLeft <= 1;
  const maxGG = topUsers[0]?.ggCount || 1;

  const TABS = [
    { id: 'topgg',    label: 'Top GG',    icon: 'star' },
    { id: 'topvideo', label: 'Top Video', icon: 'videocam' },
    { id: 'bygenre',  label: 'By Genre',  icon: 'grid' },
    { id: 'videoday', label: 'Of the Day',icon: 'sunny' },
    { id: 'history',  label: 'History',   icon: 'time' },
  ];

  const GENRE_LIST = [
    { id: 'fps',          label: 'FPS 🎯',              reward: 50 },
    { id: 'sports',       label: 'Sports ⚽',           reward: 50 },
    { id: 'battle_royale',label: 'Battle Royale 🏆',    reward: 50 },
    { id: 'action',       label: 'Action / Adventure 💥',reward: 50 },
    { id: 'rpg',          label: 'RPG ⚔️',              reward: 50 },
    { id: 'fighting',     label: 'Fighting 🥊',         reward: 50 },
    { id: 'moba',         label: 'MOBA / Strategy 🧙',  reward: 50 },
    { id: 'racing',       label: 'Racing 🏎️',           reward: 50 },
    { id: 'horror',       label: 'Horror 👻',           reward: 50 },
    { id: 'simulation',   label: 'Simulation 🏗️',       reward: 50 },
    { id: 'other',        label: 'Other 🕹️',            reward: 50 },
  ];

  const MOCK_HISTORY = []; // Coming soon — will be populated by Cloud Functions

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {/* Starfield background */}
      <View style={s.starfield} pointerEvents="none">
        {Array.from({length: 20}).map((_, i) => (
          <View key={i} style={[s.star, {
            top: `${5 + (i * 37) % 80}%`,
            left: `${(i * 53) % 95}%`,
            opacity: 0.15 + (i % 4) * 0.1,
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 3 : 2,
          }]} />
        ))}
      </View>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>🏆 RANKINGS</Text>
          <Text style={s.headerSub}>{now2.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Countdown')} style={[s.timerChip, isLastDay && { borderColor: COLORS.red, backgroundColor: COLORS.redDim }]} activeOpacity={0.85}>
          <Ionicons name={isLastDay ? 'flash' : 'time-outline'} size={13} color={isLastDay ? COLORS.red : COLORS.gold} />
          {isLastDay ? (
            <Text style={[s.timerText, { color: COLORS.red }]}> {String(diffH).padStart(2, '0')}:{String(diffM).padStart(2, '0')}:{String(diffS).padStart(2, '0')}</Text>
          ) : (
            <Text style={s.timerText}> {daysLeft}D before reset ›</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)} style={[s.tab, activeTab === t.id && s.tabActive]}>
            <Ionicons name={t.icon} size={13} color={activeTab === t.id ? COLORS.black : COLORS.gray} />
            <Text style={[s.tabText, activeTab === t.id && s.tabTextActive]}> {t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}>
        {/* ───────────── TOP GG ───────────── */}
        {activeTab === 'topgg' && (
          <>
            {topUsers.length === 0 ? (
              loading
                ? <ActivityIndicator color={COLORS.gold} size="large" style={{ marginTop: 60 }} />
                : <Text style={s.empty}>No rankings yet — post clips and get GG-ed!🎮</Text>
            ) : (
              <>
                {/* Bandeau enjeu */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 8, gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF3B30' }} />
                  <Text style={{ fontSize: 11, color: COLORS.gray, fontWeight: '600' }}>LIVE — updates in real time</Text>
                </View>
                <View style={s.prizeBanner}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Ionicons name="trophy" size={16} color={COLORS.gold} />
                    <Text style={[s.prizeText, { color: COLORS.gold, fontWeight: '900', fontSize: 13, marginLeft: 6 }]}>Monthly Rewards</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { rank: '#1', reward: '👑 Champion frame + 500 pts + shoutout', color: COLORS.gold },
                      { rank: '#2', reward: '🥈 Silver Elite + 300 pts', color: COLORS.silver },
                      { rank: '#3', reward: '🥉 Bronze Elite + 200 pts', color: COLORS.bronze },
                      { rank: 'Top 9',  reward: '⭐ 100 GA Points bonus', color: COLORS.gray },
                    ].map((r, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: r.color, fontSize: 11, fontWeight: '800' }}>{r.rank}</Text>
                        <Text style={{ color: COLORS.gray, fontSize: 10 }}>{r.reward}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <HeroPodium data={topUsers} navigation={navigation} />

                {/* Hide rank card if user is excluded from rankings */}
                {!EXCLUDED_ACCOUNT_TYPES.includes(userProfile?.accountType) && (
                  <YourRankCard myRank={myRank} userProfile={userProfile} topUsers={topUsers} />
                )}

                {topUsers.length > 3 && (
                  <View style={s.challengersHeader}>
                    <View style={s.challengersDivider} />
                    <Text style={s.listLabel}>⚡ CHALLENGERS</Text>
                    <View style={s.challengersDivider} />
                  </View>
                )}
                {topUsers.slice(3).map((u) => (
                  <PlayerRow key={u.uid} user={u} maxGG={maxGG} navigation={navigation} />
                ))}
              </>
            )}
          </>
        )}

        {/* ───────────── TOP VIDEO ───────────── */}
        {activeTab === 'topvideo' && (
          <>
            <Text style={s.sectionNote}>🏆 Top 5 most GG-ed clips of all time · Updates every 5 min</Text>
            {topVideos.length === 0 ? (
              <Text style={s.empty}>No video yet🎮</Text>
            ) : (
              topVideos.map((v) => <VideoRow key={v.id} v={v} rank={v.rank} highlight={v.rank === 1} navigation={navigation} />)
            )}
          </>
        )}

        {/* ───────────── BY GENRE ───────────── */}
        {activeTab === 'bygenre' && (
          <View style={{ paddingBottom: 20 }}>
            <View style={{ marginHorizontal: 14, marginBottom: 12, padding: 14, backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' }}>
              <Text style={{ color: COLORS.gold, fontSize: 13, fontWeight: '800', marginBottom: 4 }}>🏅 Genre Rankings</Text>
              <Text style={{ color: COLORS.gray, fontSize: 11, lineHeight: 17 }}>
                {'Top 3 players per genre receive GA Points at end of month. Every genre gives smaller creators a chance to shine!'}
              </Text>
            </View>
            {GENRE_LIST.map(genre => {
              // Get top 3 for this genre from topUsers (approximate — uses all videos)
              const genreUsers = Object.values(
                topUsers.reduce((acc, u) => {
                  // We don't have per-genre breakdown in topUsers — show general top with genre label
                  return acc;
                }, {})
              );
              // Get videos for this genre
              return (
                <View key={genre.id} style={{ marginHorizontal: 14, marginBottom: 16, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '800' }}>{genre.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                      <Ionicons name="star" size={10} color={COLORS.gold} />
                      <Text style={{ color: COLORS.gold, fontSize: 10, fontWeight: '800' }}>#1: 50pts · #2: 25pts · #3: 10pts</Text>
                    </View>
                  </View>
                  <GenreLeaderboard genreId={genre.id} navigation={navigation} />
                </View>
              );
            })}
          </View>
        )}

        {/* ───────────── VIDEO OF DAY ───────────── */}
        {activeTab === 'videoday' && (
          <>
            <Text style={s.sectionNote}>
              {videosOfDay.length > 0 ? '🌟 Clip of the Day — best of the last 24h · Updates every 5 min' : '🌟 Clip of the Day'}
            </Text>
            {videosOfDay.length === 0 ? (
              <Text style={s.empty}>No clips uploaded today yet — be the first! 🎮</Text>
            ) : (
              videosOfDay.map((v) => <VideoRow key={v.id} v={v} rank={v.rank} highlight={v.rank === 1} navigation={navigation} />)
            )}
          </>
        )}

        {/* ───────────── HISTORY ───────────── */}
        {activeTab === 'history' && (
          <>
            <Text style={s.sectionNote}>📅 The Hall of Champions</Text>
            <Text style={s.empty}>Monthly champions archive coming soon. Rankings reset at end of each month.</Text>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  starfield: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(201,168,76,0.2)' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white, letterSpacing: 2 },
  headerSub: { fontSize: 11, color: COLORS.gray, marginTop: 2, letterSpacing: 0.5 },
  timerChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)' },
  timerText: { fontSize: 13, fontWeight: '900', color: COLORS.gold, letterSpacing: 1 },

  tabsRow: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginRight: 8, height: 36 },
  tabActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  tabText: { fontSize: 11, color: COLORS.gray, fontWeight: '700' },
  tabTextActive: { color: COLORS.black, fontWeight: '900' },

  empty: { color: COLORS.gray, textAlign: 'center', marginTop: 60, paddingHorizontal: 40, lineHeight: 22, fontSize: 14 },
  sectionNote: { fontSize: 12, color: COLORS.gray, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6, letterSpacing: 0.3 },

  prizeBanner: { marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(201,168,76,0.06)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  prizeText: { fontSize: 11.5, color: COLORS.gray, lineHeight: 17 },

  /* Your rank */
  youCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 14, marginBottom: 8, padding: 14, borderRadius: 18, backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.4)' },
  youRankBox: { flexDirection: 'row', alignItems: 'baseline', marginRight: 12 },
  youRankHash: { fontSize: 14, fontWeight: '900', color: COLORS.gold },
  youRankNum: { fontSize: 30, fontWeight: '900', color: COLORS.gold },
  youTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  youName: { fontSize: 13, fontWeight: '900', color: COLORS.gold, letterSpacing: 0.5 },
  youSub: { fontSize: 12, color: COLORS.gray, marginTop: 4, lineHeight: 17 },
  youGG: { fontSize: 22, fontWeight: '900', color: COLORS.white },
  youGGLabel: { fontSize: 9, fontWeight: '800', color: COLORS.gold, letterSpacing: 1.5 },

  challengersHeader: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 16, marginBottom: 6, gap: 10 },
  challengersDivider: { flex: 1, height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)' },
  listLabel: { fontSize: 10, fontWeight: '900', color: COLORS.gray, letterSpacing: 3 },

  /* Player row */
  pRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.05)' },
  pRank: { fontSize: 16, fontWeight: '900', width: 32, textAlign: 'center', marginRight: 10 },
  pName: { fontSize: 14, color: COLORS.white, fontWeight: '700', maxWidth: 130 },
  powerTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginRight: 8 },
  powerFill: { height: '100%', borderRadius: 2 },
  pGG: { fontSize: 16, fontWeight: '900', color: COLORS.gold },
  pGGLabel: { fontSize: 8, fontWeight: '800', color: COLORS.gray, letterSpacing: 1.5 },

  tierBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, marginLeft: 6 },
  tierBadgeText: { fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5 },
  legBadge: { backgroundColor: COLORS.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, marginLeft: 5 },
  legBadgeText: { fontSize: 7.5, fontWeight: '900', color: COLORS.black },

  /* Video row */
  vRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  vMedal: { fontSize: 22, width: 30, textAlign: 'center' },
  vRank: { fontSize: 14, fontWeight: '900', color: COLORS.gray, width: 30, textAlign: 'center' },
  vThumb: { width: 64, height: 42, borderRadius: 9, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginLeft: 6, position: 'relative', overflow: 'hidden' },
  vPlayDot: { position: 'absolute', bottom: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  vName: { fontSize: 13.5, color: COLORS.white, fontWeight: '700' },
  vCaption: { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  vGame: { fontSize: 10, color: COLORS.gray2, marginTop: 2 },
  vGGChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.goldDim, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, marginLeft: 8 },
  vGGText: { fontSize: 12, fontWeight: '900', color: COLORS.gold },

  /* History */
  histCard: { marginHorizontal: 14, marginBottom: 12, padding: 14, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.goldBorder },
  histHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  histMonth: { fontSize: 14, fontWeight: '900', color: COLORS.white },
  champBadge: { backgroundColor: COLORS.goldDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 0.5, borderColor: COLORS.goldBorder },
  champBadgeText: { fontSize: 8.5, fontWeight: '900', color: COLORS.gold },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  histMedal: { fontSize: 16, marginRight: 10 },
  histName: { flex: 1, fontSize: 13, color: COLORS.white, fontWeight: '700' },
});
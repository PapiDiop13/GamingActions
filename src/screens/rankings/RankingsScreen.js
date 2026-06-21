import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Platform, Image, Animated, Dimensions, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../../components/FramedAvatar';
import { ChampionBadge, LeaderBadge } from '../../components/ElectricEffect';

const { width: SW } = Dimensions.get('window');

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

/* ----------------------------------------------------------- Hero Podium */
function HeroPodium({ data, navigation }) {
  const top3 = data.slice(0, 3);
  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  const glow = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

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
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          {isFirst && (
            <Animated.View style={[pod.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
          )}
          <Avatar user={user} size={avSize} glow={!isFirst} />
        </View>

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
  container: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 12, paddingTop: 18, paddingBottom: 8 },
  spot: { flex: 1, alignItems: 'center' },
  crown: { fontSize: 26, marginBottom: 2 },
  medal: { fontSize: 20, marginBottom: 4 },
  glow: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.gold },
  name: { fontSize: 11, fontWeight: '800', color: COLORS.white, textAlign: 'center', marginTop: 6, maxWidth: '94%' },
  ggChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 0.5, marginTop: 5, marginBottom: 8 },
  ggChipText: { fontSize: 10, fontWeight: '800' },
  pedestal: { width: '82%', borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pedestalTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
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
  return (
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

  useEffect(() => {
    const timer = setInterval(() => setNow2(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { fetchRankings(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRankings();
    setRefreshing(false);
  };

  const fetchRankings = async () => {
    try {
      // Top vidéos — charger les 50 meilleures pour avoir assez de diversité
      const videosSnap = await getDocs(
        query(collection(db, 'videos'), orderBy('ggCount', 'desc'), limit(50))
      );
      const videos = videosSnap.docs.map((d, i) => ({ rank: i + 1, id: d.id, ...d.data() }));
      // Top 5 vidéos avec au moins 1 GG
      setTopVideos(videos.filter(v => (v.ggCount || 0) > 0).slice(0, 5));

      // Agrège les GG par joueur depuis toutes les vidéos chargées
      const userGGs = {};
      videos.forEach((v) => {
        if (!v.userId || !(v.ggCount > 0)) return;
        if (!userGGs[v.userId]) {
          userGGs[v.userId] = { uid: v.userId, username: v.username, avatar: v.avatar || '', plan: v.plan || 'free', streakLevel: v.streakLevel, ggCount: 0 };
        }
        userGGs[v.userId].ggCount += v.ggCount || 0;
      });

      const usersList = Object.values(userGGs)
        .sort((a, b) => b.ggCount - a.ggCount)
        .slice(0, 10)
        .map((u, i) => ({ ...u, rank: i + 1 }));

      // Enrichit avec les vrais profils (avatar, plan, tier)
      const enrichedUsers = await Promise.all(
        usersList.map(async (u) => {
          try {
            const { getDoc, doc } = await import('firebase/firestore');
            const snap = await getDoc(doc(db, 'users', u.uid));
            if (snap.exists()) {
              const p = snap.data();
              return { ...u, avatar: p.avatar || '', plan: p.plan || u.plan, username: p.username || u.username, streakLevel: p.streakLevel || u.streakLevel };
            }
          } catch (e) {}
          return u;
        })
      );
      setTopUsers(enrichedUsers);

      // Mon rang
      if (user?.uid) {
        const sorted = Object.values(userGGs).sort((a, b) => b.ggCount - a.ggCount);
        const myEntry = sorted.find((u) => u.uid === user.uid);
        if (myEntry) {
          const myPos = sorted.findIndex((u) => u.uid === user.uid) + 1;
          setMyRank({ rank: myPos, ggCount: myEntry.ggCount });
        }
      }

      // Vidéos du jour (24h)
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const todayVideos = videos.filter((v) => {
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
    { id: 'topgg', label: 'Top GG', icon: 'star' },
    { id: 'topvideo', label: 'Top Video', icon: 'videocam' },
    { id: 'videoday', label: 'Du jour', icon: 'sunny' },
    { id: 'history', label: 'History', icon: 'time' },
  ];

  const MOCK_HISTORY = []; // Coming soon — will be populated by Cloud Functions

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>RANKINGS</Text>
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
                <View style={s.prizeBanner}>
                  <Ionicons name="trophy" size={14} color={COLORS.gold} />
                  <Text style={s.prizeText}>  Reach <Text style={{ color: COLORS.gold, fontWeight: '800' }}>Top 3</Text> and wins the Champion of the Month crown</Text>
                </View>

                <HeroPodium data={topUsers} navigation={navigation} />

                <YourRankCard myRank={myRank} userProfile={userProfile} topUsers={topUsers} />

                {topUsers.length > 3 && <Text style={s.listLabel}>CHALLENGERS</Text>}
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
            <Text style={s.sectionNote}>🏆 The most GG-ed videos of the month</Text>
            {topVideos.length === 0 ? (
              <Text style={s.empty}>No video yet🎮</Text>
            ) : (
              topVideos.map((v) => <VideoRow key={v.id} v={v} rank={v.rank} highlight={v.rank === 1} navigation={navigation} />)
            )}
          </>
        )}

        {/* ───────────── VIDEO OF DAY ───────────── */}
        {activeTab === 'videoday' && (
          <>
            <Text style={s.sectionNote}>🌟 The best music videos of the last 24 hours</Text>
            {videosOfDay.length === 0 ? (
              <Text style={s.empty}>No clips in the last 24 hours🎮</Text>
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
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: COLORS.white, letterSpacing: 1 },
  headerSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  timerChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.goldBorder },
  timerText: { fontSize: 12, fontWeight: '800', color: COLORS.gold },

  tabsRow: { paddingHorizontal: 14, paddingBottom: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, height: 34 },
  tabActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  tabText: { fontSize: 11, color: COLORS.gray, fontWeight: '700' },
  tabTextActive: { color: COLORS.black, fontWeight: '900' },

  empty: { color: COLORS.gray, textAlign: 'center', marginTop: 50, paddingHorizontal: 40, lineHeight: 20 },
  sectionNote: { fontSize: 12, color: COLORS.gray, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 },

  prizeBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.goldGlow, borderWidth: 0.5, borderColor: COLORS.goldBorder },
  prizeText: { fontSize: 11.5, color: COLORS.gray, flex: 1, lineHeight: 16 },

  /* Your rank */
  youCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 14, marginBottom: 6, padding: 12, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.goldBorder },
  youRankBox: { flexDirection: 'row', alignItems: 'baseline', marginRight: 10 },
  youRankHash: { fontSize: 12, fontWeight: '900', color: COLORS.gold },
  youRankNum: { fontSize: 26, fontWeight: '900', color: COLORS.gold },
  youTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  youName: { fontSize: 13, fontWeight: '900', color: COLORS.gold, letterSpacing: 0.3 },
  youSub: { fontSize: 11.5, color: COLORS.gray, marginTop: 3, lineHeight: 16 },
  youGG: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  youGGLabel: { fontSize: 9, fontWeight: '800', color: COLORS.gold, letterSpacing: 1, marginTop: -2 },

  listLabel: { fontSize: 10, fontWeight: '900', color: COLORS.gray, letterSpacing: 2, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 },

  /* Player row */
  pRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  pRank: { fontSize: 15, fontWeight: '900', width: 28, textAlign: 'center', marginRight: 8 },
  pName: { fontSize: 13.5, color: COLORS.white, fontWeight: '700', maxWidth: 130 },
  powerTrack: { height: 5, borderRadius: 3, backgroundColor: COLORS.gray3, overflow: 'hidden', marginRight: 8 },
  powerFill: { height: '100%', borderRadius: 3 },
  pGG: { fontSize: 15, fontWeight: '900', color: COLORS.gold },
  pGGLabel: { fontSize: 8, fontWeight: '800', color: COLORS.gray, letterSpacing: 1 },

  tierBadge: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, borderWidth: 0.5, marginLeft: 6 },
  tierBadgeText: { fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5 },
  legBadge: { backgroundColor: COLORS.gold, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4, marginLeft: 5 },
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
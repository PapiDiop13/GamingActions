import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Platform, Image, Animated, Dimensions, ActivityIndicator,
  LayoutAnimation, UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, limit, getDocs, getDoc, doc, updateDoc, setDoc, onSnapshot, where, serverTimestamp } from 'firebase/firestore';
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

// Exclu du classement : creator/gameconic uniquement (admins et Board restent).
const isRankExcluded = (u) => EXCLUDED_ACCOUNT_TYPES.includes(u?.accountType);

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

/* ------------------------------------------------------------ Trend Icon */
function TrendIcon({ trend }) {
  if (trend === 'up')   return <Ionicons name="trending-up"   size={13} color="#34C759" />;
  if (trend === 'down') return <Ionicons name="trending-down" size={13} color="#FF3B30" />;
  return <Ionicons name="remove" size={13} color={COLORS.gray2} />;
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
          if (!v.userId || !(v.ggMonth > 0)) return;
          if (v.banned || v.restricted) return;
          if (!userGGs[v.userId]) userGGs[v.userId] = { uid: v.userId, username: v.username, avatar: v.avatar || '', ggCount: 0 };
          userGGs[v.userId].ggCount += v.ggMonth || 0;
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

  const glow  = useRef(new Animated.Value(0)).current;
  const glow2 = useRef(new Animated.Value(0)).current;
  const bob   = useRef(new Animated.Value(0)).current;
  const ring  = useRef(new Animated.Value(0)).current;
  const firstPop = useRef(new Animated.Value(1)).current;
  const prevFirstRef = useRef(first?.uid);
  const loopRefs = useRef([]);

  useEffect(() => {
    if (first?.uid && prevFirstRef.current && prevFirstRef.current !== first.uid) {
      firstPop.setValue(0.6);
      Animated.spring(firstPop, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 14 }).start();
    }
    prevFirstRef.current = first?.uid;
  }, [first?.uid]);

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(glow,  { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(glow,  { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(glow2, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(glow2, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(bob,   { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(bob,   { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(ring,  { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(ring,  { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])),
    ];
    loops.forEach(l => l.start());
    loopRefs.current = loops;
    return () => loopRefs.current.forEach(l => l.stop());
  }, []);

  const glowScale   = glow.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.25] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.50] });
  const glow2Scale  = glow2.interpolate({ inputRange: [0, 1], outputRange: [1.1, 1.6] });
  const glow2Op     = glow2.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.22] });
  const ringScale   = ring.interpolate({ inputRange: [0, 1], outputRange: [0.90, 1.45] });
  const ringOp      = ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.0] });
  const bobY        = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -9] });

  const Spot = ({ user, place }) => {
    if (!user) return <View style={{ flex: 1 }} />;
    const isFirst  = place === 1;
    const isSecond = place === 2;
    const accent = isFirst ? COLORS.gold : isSecond ? COLORS.silver : COLORS.bronze;
    const pedH   = isFirst ? 110 : isSecond ? 78 : 62;
    const avSize = isFirst ? 80 : isSecond ? 62 : 52;
    return (
      <TouchableOpacity style={pod.spot} activeOpacity={0.85} onPress={() => navigation.navigate('UserProfile', { userId: user.uid })}>
        {/* Crown / medal */}
        {isFirst ? (
          <Animated.Text style={[pod.crown, { transform: [{ translateY: bobY }] }]}>👑</Animated.Text>
        ) : (
          <Text style={[pod.medal, isSecond && { fontSize: 26 }]}>{isSecond ? '🥈' : '🥉'}</Text>
        )}

        {/* Avatar with animated layers for #1 */}
        <Animated.View style={{ alignItems: 'center', justifyContent: 'center', transform: isFirst ? [{ scale: firstPop }] : [] }}>
          {isFirst && (
            <>
              {/* Outer pulsing halo */}
              <Animated.View style={[pod.glowOuter, { opacity: glow2Op, transform: [{ scale: glow2Scale }] }]} />
              {/* Electric ring */}
              <Animated.View style={[pod.ringBorder, { opacity: ringOp, transform: [{ scale: ringScale }] }]} />
              {/* Inner soft glow */}
              <Animated.View style={[pod.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
            </>
          )}
          <Avatar user={user} size={avSize} glow={isSecond || (!isFirst)} />
        </Animated.View>

        <Text style={[pod.name, isFirst && { color: COLORS.gold, fontSize: 14.5, letterSpacing: 0.5 }]} numberOfLines={1}>{user.username}</Text>
        <TierBadge user={user} />
        <View style={[pod.ggChip, { borderColor: accent + '70', backgroundColor: accent + '18' }]}>
          <Ionicons name="star" size={10} color={accent} />
          <Text style={[pod.ggChipText, { color: accent, fontSize: isFirst ? 13 : 11 }]}> {fmtGG(user.ggCount)} GG</Text>
        </View>

        {/* Pedestal */}
        <View style={[pod.pedestal, { height: pedH, borderColor: accent, backgroundColor: isFirst ? 'rgba(201,168,76,0.16)' : COLORS.card }]}>
          <View style={[pod.pedestalTop, { backgroundColor: accent + '70' }]} />
          <Text style={[pod.pedestalNum, { color: accent, fontSize: isFirst ? 36 : isSecond ? 26 : 20 }]}>{place}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={pod.container}>
      <Spot user={second} place={2} />
      <Spot user={first}  place={1} />
      <Spot user={third}  place={3} />
    </View>
  );
}

const pod = StyleSheet.create({
  container:    { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 6, paddingTop: 24, paddingBottom: 16, backgroundColor: 'rgba(201,168,76,0.04)', borderBottomWidth: 0.5, borderBottomColor: 'rgba(201,168,76,0.18)' },
  spot:         { flex: 1, alignItems: 'center' },
  crown:        { fontSize: 36, marginBottom: 2 },
  medal:        { fontSize: 24, marginBottom: 4 },
  glow:         { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: COLORS.gold },
  glowOuter:    { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: COLORS.gold },
  ringBorder:   { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2.5, borderColor: COLORS.gold },
  name:         { fontSize: 12, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginTop: 7, maxWidth: '95%', letterSpacing: 0.3 },
  ggChip:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginTop: 6, marginBottom: 10 },
  ggChipText:   { fontWeight: '900', letterSpacing: 0.3 },
  pedestal:     { width: '85%', borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pedestalTop:  { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
  pedestalNum:  { fontWeight: '900' },
});

/* -------------------------------------------------------- Your Rank Card */
function YourRankCard({ myRank, userProfile, topUsers }) {
  if (!myRank) {
    return (
      <View style={s.youCard}>
        <Avatar user={userProfile} size={40} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.youTitle}>You're not ranked yet</Text>
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

  const prevRankRef = useRef(user.rank);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const [rankDir, setRankDir] = useState(null);

  useEffect(() => {
    if (prevRankRef.current !== user.rank) {
      const movedUp = user.rank < prevRankRef.current;
      prevRankRef.current = user.rank;
      setRankDir(movedUp ? 'up' : 'down');
      slideAnim.setValue(movedUp ? -20 : 20);
      glowAnim.setValue(1);
      arrowAnim.setValue(1);
      const anim = Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 8 }),
        Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 5000, delay: 1200, useNativeDriver: true }),
      ]);
      anim.start(() => setRankDir(null));
      return () => anim.stop();
    }
  }, [user.rank]);

  const glowBg = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(201,168,76,0)', 'rgba(201,168,76,0.18)'],
  });

  return (
    <Animated.View style={{ backgroundColor: glowBg, borderRadius: 12 }}>
    <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
    <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: user.uid })} style={s.pRow} activeOpacity={0.85}>
      <Text style={[s.pRank, { color: tier.color, width: 32, textAlign: 'center' }]}>{user.rank}</Text>
      <Avatar user={user} size={38} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
          <Text style={s.pName} numberOfLines={1}>{user.username}</Text>
          <TierBadge user={user} />
          {user.plan === 'legendary' && <View style={s.legBadge}><Text style={s.legBadgeText}>LEG</Text></View>}
          {user.isChampion ? <ChampionBadge small /> : user.isCurrentLeader ? <LeaderBadge small /> : null}
        </View>
        {/* Rank change indicator above streak bar */}
        {rankDir && (
          <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3, opacity: arrowAnim }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: rankDir === 'up' ? '#34C759' : '#FF3B30' }}>
              {rankDir === 'up' ? '▲' : '▼'}
            </Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: rankDir === 'up' ? '#34C759' : '#FF3B30' }}>
              {rankDir === 'up' ? 'Rank up' : 'Rank down'}
            </Text>
          </Animated.View>
        )}
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

/* ------------------------------------------------------------ Elite Row (4-10) */
function EliteRow({ user, maxGG, navigation }) {
  const tier = getTier(user);
  const pct = Math.max(streakPct(user), 2);
  const prevRankRef = useRef(user.rank);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const [rankDir, setRankDir] = useState(null); // 'up' | 'down' | null

  useEffect(() => {
    if (prevRankRef.current !== user.rank) {
      const movedUp = user.rank < prevRankRef.current;
      prevRankRef.current = user.rank;
      setRankDir(movedUp ? 'up' : 'down');
      slideAnim.setValue(movedUp ? -16 : 16);
      glowAnim.setValue(1);
      arrowAnim.setValue(1);
      const anim = Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 8 }),
        Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 5000, delay: 1200, useNativeDriver: true }),
      ]);
      anim.start(() => setRankDir(null));
      return () => anim.stop();
    }
  }, [user.rank]);

  const glowBg = glowAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(201,168,76,0)', 'rgba(201,168,76,0.12)'] });

  return (
    <Animated.View style={{ backgroundColor: glowBg, borderRadius: 14, marginHorizontal: 10, marginVertical: 3 }}>
    <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
    <TouchableOpacity
      onPress={() => navigation.navigate('UserProfile', { userId: user.uid })}
      style={er.row}
      activeOpacity={0.85}
    >
      {/* Rank badge */}
      <View style={{ alignItems: 'center', marginRight: 10 }}>
        <View style={er.rankBadge}>
          <Text style={er.rankHash}>#</Text>
          <Text style={er.rankNum}>{user.rank}</Text>
        </View>
      </View>

      <Avatar user={user} size={44} glow />

      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <Text style={er.name} numberOfLines={1}>{user.username}</Text>
          <TierBadge user={user} />
          {user.plan === 'legendary' && <View style={s.legBadge}><Text style={s.legBadgeText}>LEG</Text></View>}
          {user.isChampion ? <ChampionBadge small /> : user.isCurrentLeader ? <LeaderBadge small /> : null}
        </View>
        {/* Rank change indicator — shown above streak bar, fades after 5s */}
        {rankDir && (
          <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3, opacity: arrowAnim }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: rankDir === 'up' ? '#34C759' : '#FF3B30' }}>
              {rankDir === 'up' ? '▲' : '▼'}
            </Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: rankDir === 'up' ? '#34C759' : '#FF3B30' }}>
              {rankDir === 'up' ? 'Rank up' : 'Rank down'}
            </Text>
          </Animated.View>
        )}
        <View style={s.powerTrack}>
          <View style={[s.powerFill, { width: `${pct}%`, backgroundColor: tier.color }]} />
        </View>
      </View>

      <View style={{ alignItems: 'center', marginLeft: 8, gap: 4 }}>
        <TrendIcon trend={user.trend} />
        <View style={er.ggBox}>
          <Text style={er.ggCount}>{fmtGG(user.ggCount)}</Text>
          <Text style={er.ggLabel}>GG ⭐</Text>
        </View>
      </View>
    </TouchableOpacity>
    </Animated.View>
    </Animated.View>
  );
}

const er = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.18)' },
  rankBadge: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rankHash:  { fontSize: 8, color: COLORS.gold, fontWeight: '900', marginBottom: -2 },
  rankNum:   { fontSize: 18, color: COLORS.gold, fontWeight: '900', lineHeight: 20 },
  name:      { fontSize: 13, fontWeight: '900', color: COLORS.white, letterSpacing: 0.2, flexShrink: 1 },
  ggBox:     { alignItems: 'flex-end', marginLeft: 10 },
  ggCount:   { fontSize: 16, fontWeight: '900', color: COLORS.gold, letterSpacing: 0.3 },
  ggLabel:   { fontSize: 9, color: COLORS.gray, fontWeight: '700', marginTop: 1 },
});

/* ------------------------------------------------------------ Gold Tier Row (11-50) */
function GoldTierRow({ user, navigation }) {
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('UserProfile', { userId: user.uid })}
      style={gtr.row}
      activeOpacity={0.85}
    >
      <View style={gtr.leftAccent} />
      <Text style={gtr.rank}>{user.rank}</Text>
      <Avatar user={user} size={32} />
      <Text style={gtr.name} numberOfLines={1}>{user.username}</Text>
      <TrendIcon trend={user.trend} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Ionicons name="star" size={10} color={COLORS.gold} />
        <Text style={gtr.gg}>{fmtGG(user.ggCount)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const gtr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 10 },
  leftAccent:{ width: 3, height: 28, borderRadius: 2, backgroundColor: COLORS.gold, marginRight: 2 },
  rank:      { fontSize: 13, fontWeight: '900', color: COLORS.gold, width: 28, textAlign: 'center' },
  name:      { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.white, letterSpacing: 0.1 },
  gg:        { fontSize: 12, fontWeight: '900', color: COLORS.gold },
});

/* ------------------------------------------------------------ Silver Tier Row (51-100) */
function SilverTierRow({ user, navigation }) {
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('UserProfile', { userId: user.uid })}
      style={str.row}
      activeOpacity={0.85}
    >
      <View style={str.leftAccent} />
      <Text style={str.rank}>{user.rank}</Text>
      <Avatar user={user} size={28} />
      <Text style={str.name} numberOfLines={1}>{user.username}</Text>
      <TrendIcon trend={user.trend} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Ionicons name="star" size={9} color={COLORS.silver} />
        <Text style={str.gg}>{fmtGG(user.ggCount)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const str = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.04)', gap: 10 },
  leftAccent:{ width: 2.5, height: 24, borderRadius: 2, backgroundColor: COLORS.silver, marginRight: 2 },
  rank:      { fontSize: 12, fontWeight: '800', color: COLORS.silver, width: 28, textAlign: 'center' },
  name:      { flex: 1, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.1 },
  gg:        { fontSize: 11, fontWeight: '800', color: COLORS.silver },
});

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
  const [wall, setWall] = useState([]); // Wall of Legends — champions mensuels (hall_of_fame)

  // Charge le Wall of Legends une fois
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'hall_of_fame'), orderBy('month', 'desc'), limit(12))
        );
        setWall(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {}
    })();
  }, []);

  // Profile cache — avoid N getDoc calls on every GG event. TTL: 90 seconds.
  const profileCache = React.useRef({}); // { uid: { data, fetchedAt } }

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
      async (snap) => {
        try {
          const allVideos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          await processRankings(allVideos);
        } catch (e) {
          setLoading(false); // ensure spinner clears on error
        }
      },
      (err) => { if (__DEV__) { console.log('rankings listener error:', err.message); } setLoading(false); }
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
      // Top vidéos par ggMonth (GG DU MOIS — classement mensuel)
      const topVids = [...allVideos]
        .sort((a, b) => (b.ggMonth || 0) - (a.ggMonth || 0))
        .map((v, i) => ({ rank: i + 1, ...v, ggCount: v.ggMonth || 0 }));
      setTopVideos(topVids.filter(v => (v.ggMonth || 0) > 0).slice(0, 5));

      // Agrège les GG DU MOIS par joueur depuis TOUTES les vidéos (hors bannis/restricted)
      const userGGs = {};
      allVideos.forEach((v) => {
        if (!v.userId || !(v.ggMonth > 0)) return;
        if (v.banned || v.restricted) return;
        if (!userGGs[v.userId]) {
          userGGs[v.userId] = { uid: v.userId, username: v.username, avatar: v.avatar || '', plan: v.plan || 'free', streakLevel: v.streakLevel, ggCount: 0 };
        }
        userGGs[v.userId].ggCount += v.ggMonth || 0;
      });

      // Sort ALL users before slicing so myRank can be found regardless of position
      const allUsersSorted = Object.values(userGGs)
        .sort((a, b) => b.ggCount - a.ggCount)
        .map((u, i) => ({ ...u, rank: i + 1 }));

      // Find current user in full sorted list BEFORE slicing to top 20
      const myRankEntry = allUsersSorted.find(u => u.uid === user?.uid);
      const myRankIndex = myRankEntry ? allUsersSorted.indexOf(myRankEntry) : -1;

      // Only enrich top 20 with fresh profile data (avatarFrame, badges, etc.)
      // Ranks 21-100 use data embedded in video docs — fast, no extra reads.
      const usersToEnrich = allUsersSorted.slice(0, 20);
      const usersRaw21to100 = allUsersSorted.slice(20, 100);

      // Enrichit avec les vrais profils — TTL cache: only re-fetch after 90s
      const CACHE_TTL_MS = 90_000;
      const now = Date.now();
      const toFetch = usersToEnrich.filter(u => {
        const cached = profileCache.current[u.uid];
        return !cached || (now - cached.fetchedAt) > CACHE_TTL_MS;
      });
      if (toFetch.length > 0) {
        await Promise.all(toFetch.map(async (u) => {
          try {
            const snap = await getDoc(doc(db, 'users', u.uid));
            if (snap.exists()) profileCache.current[u.uid] = { data: snap.data(), fetchedAt: Date.now() };
          } catch (e) {}
        }));
      }
      const enrichedTop20 = usersToEnrich.map((u) => {
        const cached = profileCache.current[u.uid];
        if (!cached) return u;
        const p = cached.data;
        return { ...u, avatar: p.avatar || '', plan: p.plan || u.plan, username: p.username || u.username, streakLevel: p.streakLevel || u.streakLevel, accountType: p.accountType || 'gamer', isChampion: p.isChampion || false, isCurrentLeader: p.isCurrentLeader || false, equippedFrame: p.equippedFrame || 'none' };
      });
      // Merge: enriched top 20 + raw 21-100 (video doc data is good enough for compact rows)
      const enrichedUsers = [...enrichedTop20, ...usersRaw21to100];
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
        !isRankExcluded(u)
      ).slice(0, 100).map((u, i) => ({ ...u, rank: i + 1 }));

      // Trend icons — compare avec le snapshot sauvegardé (session précédente)
      let prevRanks = {};
      try {
        const stored = await AsyncStorage.getItem('@ga_rank_snapshot');
        if (stored) prevRanks = JSON.parse(stored);
      } catch {}
      const usersWithTrend = filteredUsers.map((u, i) => {
        const prev = prevRanks[u.uid];
        let trend = 'stable';
        if (prev !== undefined && prev !== u.rank) {
          trend = u.rank < prev ? 'up' : 'down';
        }
        // Garantie visuelle : le #1 est toujours marqué leader même si Firestore est en retard
        const isLeaderGuarantee = i === 0 ? { isCurrentLeader: true } : {};
        return { ...u, ...isLeaderGuarantee, trend };
      });
      // Persiste le snapshot actuel pour la prochaine session
      try {
        const snap = {};
        filteredUsers.forEach(u => { snap[u.uid] = u.rank; });
        await AsyncStorage.setItem('@ga_rank_snapshot', JSON.stringify(snap));
      } catch {}

      setTopUsers(usersWithTrend);

      // Remove isCurrentLeader badge from excluded users
      const excludedWithLeader = enrichedUsers.filter(u =>
        u.isCurrentLeader &&
        isRankExcluded(u) &&
        !RANKING_EXEMPT_UIDS.includes(u.uid)
      );
      for (const u of excludedWithLeader) {
        try { await updateDoc(doc(db, 'users', u.uid), { isCurrentLeader: false }); } catch {}
      }

      // Mon rang — calculé sur les utilisateurs filtrés (hors créateurs/gameconic)
      if (user?.uid) {
        // Skip rank computation entirely for excluded account types
        // Use userProfile.accountType (from auth store) — more reliable than video doc data
        const isExcluded = isRankExcluded(userProfile)
          && !RANKING_EXEMPT_UIDS.includes(user.uid);

        if (!isExcluded && myRankEntry) {
          const allUsersFiltered = allUsersSorted
            .filter(u => RANKING_EXEMPT_UIDS.includes(u.uid) || !isRankExcluded(u))
            .sort((a, b) => b.ggCount - a.ggCount);
          const myPos = allUsersFiltered.findIndex(u => u.uid === user.uid) + 1;
          if (myPos > 0) {
            setMyRank({ rank: myPos, ggCount: myRankEntry.ggCount });
            // Persist rank on user doc so the profile can display it
            try { await updateDoc(doc(db, 'users', user.uid), { monthlyRank: myPos }); } catch {}
          }
        }

        // ── Real-time leader sync ────────────────────────────────────────────
        // The true #1 (most GG) should be the ONLY one with isCurrentLeader.
        // Uses enrichedUsers (has accountType) — raw userGGs doesn't have accountType.
        // Guard: only the gameconic admin account writes (avoids multi-client write storms).
        // Firestore-backed debounce: reads system/leaderStatus before writing so writes
        // are skipped if the correct leader is already recorded — survives app restarts.
        const rankedSorted = enrichedUsers
          .filter(u => RANKING_EXEMPT_UIDS.includes(u.uid) || !isRankExcluded(u))
          .sort((a, b) => b.ggCount - a.ggCount);
        const trueLeaderId = rankedSorted[0]?.uid;
        const trueLeaderGG = rankedSorted[0]?.ggCount || 0;
        // Tout utilisateur connecté peut déclencher la mise à jour — le debounce Firestore
        // (system/leaderStatus) empêche les écritures inutiles si le leader n'a pas changé.
        if (trueLeaderId && trueLeaderGG > 0) {
          try {
            // Firestore-backed check: only proceed if the stored leader differs
            const statusRef = doc(db, 'system', 'leaderStatus');
            const statusSnap = await getDoc(statusRef);
            const currentLeaderId = statusSnap.data()?.currentLeaderId;
            if (currentLeaderId !== trueLeaderId) {
              // Find ALL users currently flagged as leader
              const flaggedSnap = await getDocs(
                query(collection(db, 'users'), where('isCurrentLeader', '==', true))
              );
              // Remove isCurrentLeader from anyone who is NOT the true #1
              for (const d of flaggedSnap.docs) {
                if (d.id !== trueLeaderId) {
                  await updateDoc(doc(db, 'users', d.id), { isCurrentLeader: false });
                }
              }
              // Give the true leader the badge
              const leaderHasBadge = flaggedSnap.docs.some(d => d.id === trueLeaderId);
              if (!leaderHasBadge) {
                await updateDoc(doc(db, 'users', trueLeaderId), { isCurrentLeader: true });
              }
              // Persist the new leader so subsequent snapshots skip these writes
              await setDoc(statusRef, { currentLeaderId: trueLeaderId, updatedAt: serverTimestamp() }, { merge: true });
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
    { id: 'history',  label: 'Legends',   icon: 'trophy' },
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

                {/* Your rank — hidden for excluded account types (creator, gameconic) */}
                {!isRankExcluded(userProfile) && (
                  <YourRankCard myRank={myRank} userProfile={userProfile} topUsers={topUsers} />
                )}

                {/* ── Ranks 4-10: Elite cards ── */}
                {topUsers.length > 3 && (
                  <>
                    <View style={s.challengersHeader}>
                      <View style={s.challengersDivider} />
                      <Text style={s.listLabel}>⚡ CHALLENGERS</Text>
                      <View style={s.challengersDivider} />
                    </View>
                    {topUsers.slice(3, 10).map((u) => (
                      <EliteRow key={u.uid} user={u} maxGG={maxGG} navigation={navigation} />
                    ))}
                  </>
                )}

                {/* ── Ranks 11-50: Gold tier ── */}
                {topUsers.length > 10 && (
                  <>
                    <View style={[s.challengersHeader, { marginTop: 14 }]}>
                      <View style={[s.challengersDivider, { backgroundColor: COLORS.gold + '40' }]} />
                      <Text style={[s.listLabel, { color: COLORS.gold }]}>🥇 GOLD TIER · TOP 50</Text>
                      <View style={[s.challengersDivider, { backgroundColor: COLORS.gold + '40' }]} />
                    </View>
                    <View style={{ marginHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(201,168,76,0.05)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)', overflow: 'hidden', marginBottom: 6 }}>
                      {topUsers.slice(10, 50).map((u) => (
                        <GoldTierRow key={u.uid} user={u} navigation={navigation} />
                      ))}
                    </View>
                  </>
                )}

                {/* ── Ranks 51-100: Silver tier ── */}
                {topUsers.length > 50 && (
                  <>
                    <View style={[s.challengersHeader, { marginTop: 10 }]}>
                      <View style={[s.challengersDivider, { backgroundColor: COLORS.silver + '40' }]} />
                      <Text style={[s.listLabel, { color: COLORS.silver }]}>🥈 SILVER TIER · TOP 100</Text>
                      <View style={[s.challengersDivider, { backgroundColor: COLORS.silver + '40' }]} />
                    </View>
                    <View style={{ marginHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(160,170,190,0.04)', borderWidth: 1, borderColor: 'rgba(192,192,210,0.12)', overflow: 'hidden', marginBottom: 6 }}>
                      {topUsers.slice(50, 100).map((u) => (
                        <SilverTierRow key={u.uid} user={u} navigation={navigation} />
                      ))}
                    </View>
                  </>
                )}

                {topUsers.length >= 100 && (
                  <Text style={{ textAlign: 'center', color: COLORS.gray, fontSize: 10, marginVertical: 14, letterSpacing: 1 }}>— TOP 100 —</Text>
                )}
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
            <Text style={s.sectionNote}>🏛️ Wall of Legends — monthly champions & top 3</Text>
            {wall.length === 0 ? (
              <Text style={s.empty}>No legends yet. The first champions will be crowned at the end of this month! 👑 Rankings reset monthly.</Text>
            ) : wall.map((w) => (
              <View key={w.id} style={{ marginHorizontal: 14, marginBottom: 14, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)', overflow: 'hidden' }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(201,168,76,0.1)' }}>
                  <Text style={{ color: COLORS.gold, fontWeight: '900', fontSize: 13, letterSpacing: 1 }}>{w.month}</Text>
                </View>
                {(w.podium || []).map((p) => (
                  <View key={p.uid} style={s.pRow}>
                    <Text style={[s.pRank, { color: p.rank === 1 ? COLORS.gold : COLORS.white }]}>{p.rank === 1 ? '👑' : `#${p.rank}`}</Text>
                    <Text style={s.pName} numberOfLines={1}>{p.username}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={s.pGG}>{fmtGG(p.ggMonth || 0)}</Text>
                    <Text style={s.pGGLabel}> GG</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
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
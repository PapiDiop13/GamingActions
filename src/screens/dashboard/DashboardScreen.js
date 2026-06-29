import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Image, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

const GREEN = '#00C853';
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n || 0}`);

function StatCard({ icon, color, label, value, sub }) {
  return (
    <View style={[scS.card, { borderColor: color + '30' }]}>
      <View style={[scS.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={scS.value}>{value}</Text>
      <Text style={scS.label}>{label}</Text>
      {sub ? <Text style={[scS.sub, { color }]}>{sub}</Text> : null}
    </View>
  );
}

const scS = StyleSheet.create({
  card: { width: '47%', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 0.5 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  value: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginBottom: 2 },
  label: { fontSize: 10, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 0.5 },
  sub: { fontSize: 11, fontWeight: '700', marginTop: 4 },
});

const STREAK_LABELS = { noob: 'NOOB', bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD', goat: 'GOAT 🐐' };

export default function DashboardScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [topClips, setTopClips] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    loadData();
  }, [user?.uid]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const loadData = async () => {
    try {
      // Top clips (les vidéos de l'utilisateur triées par GG)
      const vSnap = await getDocs(
        query(
          collection(db, 'videos'),
          where('userId', '==', user.uid),
          orderBy('ggCount', 'desc'),
          limit(5)
        )
      );
      setTopClips(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // Activité récente (notifications reçues)
      const nSnap = await getDocs(
        query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(8)
        )
      );
      setActivity(nSnap.docs.map((d) => {
        const data = d.data();
        const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
        const diffH = Math.floor((Date.now() - created) / 3600000);
        const timeAgo = diffH < 1 ? 'Just now' : diffH < 24 ? `${diffH}h ago` : `${Math.floor(diffH / 24)}d ago`;
        return { id: d.id, ...data, timeAgo };
      }));
    } catch(e){} finally {
      setLoading(false);
    }
  };

  const u = userProfile || {};
  const streakLabel = STREAK_LABELS[u.streakLevel] || 'NOOB';

  const NOTIF_ICONS = {
    gg:     { icon: 'star', color: COLORS.gold },
    follow: { icon: 'person-add', color: COLORS.blue },
    comment:{ icon: 'chatbubble', color: '#7C4DFF' },
    thanks: { icon: 'thumbs-up', color: GREEN },
    fanbase:{ icon: 'lock-open', color: GREEN },
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <TouchableOpacity onPress={() => Alert.alert('🚀 Bientôt disponible', 'Le retrait sera activé prochainement.')} style={styles.withdrawBtn}>
          <Text style={styles.withdrawBtnText}>Withdraw</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Streak level banner */}
          <View style={styles.streakBanner}>
            <Ionicons name="flash" size={16} color={COLORS.gold} />
            <Text style={styles.streakText}>
              Niveau <Text style={{ color: COLORS.gold, fontWeight: '800' }}>{streakLabel}</Text>
              {'  ·  '}{fmtK(u.streakPoints || 0)} streak pts
            </Text>
          </View>

          {/* Stats grid — données réelles */}
          <View style={styles.statsGrid}>
            <StatCard
              icon="star"
              color={COLORS.gold}
              label="GG Received"
              value={fmtK(u.ggReceived || 0)}
            />
            <StatCard
              icon="people"
              color="#7C4DFF"
              label="Followers"
              value={fmtK(u.followers || 0)}
            />
            <StatCard
              icon="diamond"
              color={COLORS.blue}
              label="GA Points"
              value={(u.gaPoints || 0).toLocaleString()}
            />
            <StatCard
              icon="videocam"
              color={COLORS.gold}
              label="Clips"
              value={topClips.length > 0 ? `${topClips.length}+` : '0'}
            />
            <StatCard
              icon="lock-open"
              color={GREEN}
              label="Fanbase Fans"
              value={u.fanbaseSubscribers || 0}
            />
            <StatCard
              icon="person"
              color={COLORS.gray}
              label="Following"
              value={u.following || 0}
            />
          </View>

          {/* Revenue card */}
          <View style={styles.revenueCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="cash-outline" size={18} color={COLORS.gold} />
              <Text style={styles.revenueTitle}> Revenue & Withdrawals</Text>
            </View>
            <Text style={styles.revenueValue}>$0.00</Text>
            <Text style={styles.revenueNote}>Revenue features will be activated soon. Your Fanbase earnings will appear here.</Text>
            <TouchableOpacity onPress={() => Alert.alert('🚀 Bientôt disponible', 'Le retrait sera activé prochainement.')} style={styles.revenueBtn}>
              <Text style={styles.revenueBtnText}>Bientôt disponible 🚀</Text>
            </TouchableOpacity>
          </View>

          {/* Top clips — vrais clips triés par GG */}
          <Text style={styles.sectionLabel}>TOP CLIPS</Text>
          {topClips.length === 0 ? (
            <Text style={styles.emptyText}>No clips have been released yet.</Text>
          ) : (
            topClips.map((clip, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              return (
                <TouchableOpacity
                  key={clip.id}
                  style={[styles.clipRow, i === 0 && { backgroundColor: 'rgba(201,168,76,0.05)' }]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('VideoPlayer', { video: clip })}
                >
                  {medal ? (
                    <Text style={styles.clipMedal}>{medal}</Text>
                  ) : (
                    <Text style={styles.clipRank}>#{i + 1}</Text>
                  )}
                  <View style={styles.clipThumb}>
                    {clip.thumbnail || clip.thumbnailUrl ? (
                      <Image
                        source={{ uri: clip.thumbnail || clip.thumbnailUrl }}
                        style={{ width: '100%', height: '100%', borderRadius: 8 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="play-circle" size={20} color={COLORS.gold} />
                    )}
                  </View>
                  <View style={styles.clipInfo}>
                    <Text style={[styles.clipTitle, i === 0 && { color: COLORS.gold }]} numberOfLines={1}>{clip.caption}</Text>
                    <Text style={styles.clipMeta}>🎮 {clip.game} · {clip.contentType || 'clip'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.clipGG}>⭐ {fmtK(clip.ggCount || 0)}</Text>
                    <Text style={styles.clipViews}>{clip.commentsCount || 0} comments</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {/* Activity — vraies notifications */}
          <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
          {activity.length === 0 ? (
            <Text style={styles.emptyText}>No recent activity</Text>
          ) : (
            activity.map((a) => {
              const meta = NOTIF_ICONS[a.type] || { icon: 'notifications', color: COLORS.gray };
              return (
                <View key={a.id} style={styles.activityRow}>
                  <View style={[styles.activityIcon, { backgroundColor: meta.color + '18' }]}>
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.activityText} numberOfLines={2}>
                      <Text style={{ fontWeight: '700', color: COLORS.white }}>{a.fromUsername || 'Someone'}</Text>
                      {' '}{a.text || 'interacted with you'}
                    </Text>
                    <Text style={styles.activityTime}>{a.timeAgo}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  withdrawBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.gold },
  withdrawBtnText: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },
  streakBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 12, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.goldGlow, borderWidth: 0.5, borderColor: COLORS.goldBorder },
  streakText: { fontSize: 12, color: COLORS.gray, marginLeft: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, justifyContent: 'space-between', marginTop: 8 },
  revenueCard: { marginHorizontal: 14, marginBottom: 20, backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: COLORS.gold + '30' },
  revenueTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  revenueValue: { fontSize: 32, fontWeight: '900', color: COLORS.gold, marginBottom: 8 },
  revenueNote: { fontSize: 12, color: COLORS.gray, lineHeight: 17, marginBottom: 12 },
  revenueBtn: { paddingVertical: 10, borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.gold, alignItems: 'center' },
  revenueBtnText: { fontSize: 13, color: COLORS.gold, fontWeight: '700' },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10 },
  emptyText: { color: COLORS.gray, fontSize: 13, paddingHorizontal: 14, paddingBottom: 10 },
  clipRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  clipMedal: { fontSize: 20, width: 30, textAlign: 'center' },
  clipRank: { fontSize: 14, fontWeight: '900', color: COLORS.gray, width: 30, textAlign: 'center' },
  clipThumb: { width: 56, height: 36, borderRadius: 8, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden' },
  clipInfo: { flex: 1 },
  clipTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  clipMeta: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
  clipGG: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },
  clipViews: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  activityIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityText: { fontSize: 13, color: COLORS.gray, lineHeight: 17 },
  activityTime: { fontSize: 10, color: COLORS.gray2, marginTop: 2 },
});
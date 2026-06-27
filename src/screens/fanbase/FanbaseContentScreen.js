import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Image, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import useFanbaseStore from '../../store/useFanbaseStore';
import FramedAvatar from '../../components/FramedAvatar';

const GREEN = '#00C853';
const GREEN_DIM = 'rgba(0,200,83,0.10)';
const GREEN_BORDER = 'rgba(0,200,83,0.30)';
const BG = '#060f06';
const CARD_BG = '#0a1a0a';

const TYPE_FILTERS = [
  { id: 'all', label: 'All', color: GREEN },
  { id: 'flashtuto', label: 'Tutos', color: COLORS.blue },
  { id: 'flashinfo', label: 'Infos', color: COLORS.red },
  { id: 'gameindev', label: 'Dev', color: '#7C4DFF' },
];

const TYPE_META = {
  flashtuto: { color: COLORS.blue, label: 'TUTO', icon: 'bulb-outline' },
  flashinfo: { color: COLORS.red, label: 'INFO', icon: 'newspaper-outline' },
  gameindev: { color: '#7C4DFF', label: 'DEV', icon: 'code-slash-outline' },
};

function fmtDur(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function VideoRow({ video, onPress }) {
  const meta = TYPE_META[video.contentType] || TYPE_META.flashtuto;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={vr.row}>
      <View style={vr.thumb}>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={{ width: '100%', height: '100%', borderRadius: 10 }} resizeMode="cover" />
        ) : (
          <Ionicons name={meta.icon} size={22} color={meta.color} style={{ opacity: 0.5 }} />
        )}
        <View style={[vr.typeBadge, { backgroundColor: meta.color }]}>
          <Text style={vr.typeBadgeText}>{meta.label}</Text>
        </View>
        <View style={vr.dur}><Text style={vr.durText}>{fmtDur(video.duration)}</Text></View>
        <View style={vr.lock}><Ionicons name="lock-open" size={10} color={GREEN} /></View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={vr.title} numberOfLines={2}>{video.caption}</Text>
        <Text style={vr.game} numberOfLines={1}>🎮 {video.game}</Text>
        <View style={vr.stats}>
          <Text style={vr.stat}>{video.viewsCount || 0} views</Text>
          <Text style={vr.statDot}> · </Text>
          <Ionicons name="thumbs-up-outline" size={11} color="#7C4DFF" />
          <Text style={[vr.stat, { color: '#7C4DFF' }]}> {video.thanksCount || 0} Thanks</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const vr = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: GREEN_BORDER, backgroundColor: 'rgba(0,200,83,0.03)' },
  thumb: { width: 110, height: 74, borderRadius: 10, backgroundColor: CARD_BG, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', borderWidth: 1, borderColor: GREEN_BORDER, marginRight: 12 },
  typeBadge: { position: 'absolute', top: 5, left: 5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 7, fontWeight: '900', color: COLORS.black },
  dur: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  durText: { fontSize: 9, color: COLORS.white, fontWeight: '700' },
  lock: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,200,83,0.15)', padding: 3, borderRadius: 4 },
  title: { fontSize: 13, fontWeight: '700', color: COLORS.white, lineHeight: 17, marginBottom: 3 },
  game: { fontSize: 11, color: COLORS.gray, marginBottom: 6 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { fontSize: 10, color: COLORS.gray },
  statDot: { fontSize: 10, color: COLORS.gray2 },
});

export default function FanbaseContentScreen({ navigation, route }) {
  const creator = route?.params?.creator || {};
  const creatorId = creator?.uid || creator?.id;

  const { user } = useAuthStore();
  const { isSubscribedTo, checkIsSubscribed, cancelFanbase } = useFanbaseStore();

  const isOwn = !!creatorId && user?.uid === creatorId;
  const [checking, setChecking] = useState(!isOwn);
  const [videos, setVideos] = useState([]);
  const [loadingVids, setLoadingVids] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const subscribed = isSubscribedTo(creatorId);
  const canSee = isOwn || subscribed;

  // Vérifie l'abonnement réel
  useEffect(() => {
    if (!user?.uid || !creatorId || isOwn) { setChecking(false); return; }
    checkIsSubscribed(user.uid, creatorId).finally(() => setChecking(false));
  }, [user?.uid, creatorId]);

  // Charge les vraies vidéos exclusives du créateur (index userId + createdAt déjà créé)
  useEffect(() => {
    if (!creatorId) { setLoadingVids(false); return; }
    const q = query(
      collection(db, 'videos'),
      where('userId', '==', creatorId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setVideos(all.filter(v => v.isFanbaseExclusive));   // exclusifs uniquement
      setLoadingVids(false);
    }, (e) => { console.log('fanbase videos error:', e.message); setLoadingVids(false); });
    return () => unsub();
  }, [creatorId]);

  const filtered = typeFilter === 'all' ? videos : videos.filter(v => v.contentType === typeFilter);

  const BADGE = {
    gameconic: { bg: COLORS.red, text: COLORS.white, label: 'GAMECONIC' },
    creator: { bg: COLORS.blue, text: COLORS.dark, label: 'CREATOR' },
  };
  const badge = BADGE[creator.accountType] || BADGE.creator;

  const handleCancel = () => {
    Alert.alert(
      `Cancel ${creator.username}'s Fanbase?`,
      `You'll lose access to exclusive content immediately.`,
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Cancel sub', style: 'destructive',
          onPress: async () => {
            const ok = await cancelFanbase(user.uid, creatorId);
            if (ok) {
              // On sort COMPLÈTEMENT vers la racine (feed GameTips) au lieu de revenir
              // en arrière — sinon on retombe sur la vidéo exclusive qu'on regardait.
              navigation.popToTop();
            } else {
              Alert.alert('Error', 'Could not complete. Please try again later.');
            }
          },
        },
      ]
    );
  };

  const openVideo = (video) => navigation.navigate('TipDetail', { tip: video });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>🔒 {creator.username || 'Fanbase'}</Text>
          <View style={[{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }, { backgroundColor: badge.bg }]}>
            <Text style={[{ fontSize: 8, fontWeight: '900' }, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
        {canSee && (
          <TouchableOpacity onPress={() => navigation.navigate('FanBox', { creatorId, creatorName: creator.username })}>
            <Ionicons name="chatbubbles-outline" size={22} color={GREEN} />
          </TouchableOpacity>
        )}
      </View>

      {/* Creator card */}
      <View style={styles.creatorCard}>
        <FramedAvatar user={creator} size={40} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.creatorName}>{creator.username}</Text>
          <Text style={styles.creatorSub}>{(creator.followers || 0).toLocaleString()} followers · {creator.fanbaseSubscribers || 0} fans</Text>
        </View>
        {isOwn ? (
          <View style={styles.subscribedBadge}>
            <Ionicons name="star" size={14} color={GREEN} />
            <Text style={styles.subscribedText}> Your Fanbase</Text>
          </View>
        ) : subscribed ? (
          <View style={styles.subscribedBadge}>
            <Ionicons name="checkmark-circle" size={14} color={GREEN} />
            <Text style={styles.subscribedText}> Subscribed</Text>
          </View>
        ) : null}
      </View>

      {/* ── Vérification en cours ── */}
      {checking ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : !canSee ? (
        /* ── Pas abonné : écran verrouillé ── */
        <View style={styles.lockedWrap}>
          <View style={styles.lockedIcon}>
            <Ionicons name="lock-closed" size={44} color={GREEN} />
          </View>
          <Text style={styles.lockedTitle}>Exclusive fan content</Text>
          <Text style={styles.lockedDesc}>
            Join {creator.username} 's Fanbase to unlock exclusive clips and tips.
          </Text>
          <TouchableOpacity onPress={() => navigation.replace('Fanbase', { creator })} style={styles.joinBtn}>
            <Ionicons name="lock-open-outline" size={18} color={COLORS.black} />
            <Text style={styles.joinBtnText}>Join Fanbase</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ── Subscribed (ou créateur) : contenu réel ── */
        <View style={{ flex: 1 }}>
          {/* Filtres type */}
          <View style={styles.filterBar}>
            {TYPE_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.id}
                onPress={() => setTypeFilter(f.id)}
                style={[styles.typePill, typeFilter === f.id && { backgroundColor: f.color + '20', borderColor: f.color }]}
              >
                <Text style={[styles.typePillText, typeFilter === f.id && { color: f.color, fontWeight: '700' }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadingVids ? (
            <View style={styles.centered}><ActivityIndicator size="large" color={GREEN} /></View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
              {filtered.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="videocam-off-outline" size={40} color={COLORS.gray2} />
                  <Text style={styles.emptyText}>
                    {isOwn ? "You haven't posted any exclusive content yet" : 'No exclusive content yet'}
                  </Text>
                  {isOwn && (
                    <TouchableOpacity onPress={() => navigation.navigate('FanbaseManage')} style={styles.manageBtn}>
                      <Text style={styles.manageBtnText}>Manage my Fanbase</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                filtered.map((v) => <VideoRow key={v.id} video={v} onPress={() => openVideo(v)} />)
              )}

              {/* FanBox */}
              <TouchableOpacity onPress={() => navigation.navigate('FanBox', { creatorId, creatorName: creator.username })} style={styles.fanboxBtn}>
                <Ionicons name="chatbubbles-outline" size={18} color={COLORS.black} />
                <Text style={styles.fanboxBtnText}>Ouvrir le FanBox</Text>
              </TouchableOpacity>

              {/* Cancel (seulement si abonné, pas le créateur) */}
              {subscribed && !isOwn && (
                <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.red} />
                  <Text style={styles.cancelText}>Cancel my subscription</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: GREEN_BORDER, backgroundColor: BG },
  headerTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  creatorCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: GREEN_BORDER, backgroundColor: BG },
  creatorAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: GREEN_DIM, borderWidth: 2, borderColor: GREEN, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  creatorInitials: { fontSize: 14, fontWeight: '800', color: GREEN },
  creatorName: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  creatorSub: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  subscribedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: GREEN_DIM, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 0.5, borderColor: GREEN },
  subscribedText: { fontSize: 11, color: GREEN, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  lockedIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: GREEN_DIM, alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderWidth: 1, borderColor: GREEN_BORDER },
  lockedTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 10 },
  lockedDesc: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  joinBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: GREEN, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  joinBtnText: { fontSize: 16, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  typePill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: GREEN_DIM, borderWidth: 0.5, borderColor: GREEN_BORDER, marginRight: 8 },
  typePillText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 50 },
  emptyText: { fontSize: 14, color: COLORS.gray, marginTop: 12, textAlign: 'center', paddingHorizontal: 30 },
  manageBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 0.5, borderColor: GREEN },
  manageBtnText: { fontSize: 13, color: GREEN, fontWeight: '700' },
  fanboxBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: GREEN, marginHorizontal: 14, marginTop: 18, borderRadius: 14, paddingVertical: 14 },
  fanboxBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 12 },
  cancelText: { fontSize: 13, color: COLORS.red, fontWeight: '600', marginLeft: 6 },
});
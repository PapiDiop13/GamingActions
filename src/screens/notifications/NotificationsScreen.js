import React, { useState, useEffect, useRef } from 'react';
import { View, RefreshControl, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, Platform, Image, ActivityIndicator, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, writeBatch, getDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

const NOTIF_CONFIG = {
  gg:                  { icon: 'star',               color: COLORS.gold,   label: '⭐ GG' },
  follow:              { icon: 'person-add',          color: COLORS.blue,   label: 'Followers' },
  comment:             { icon: 'chatbubble',           color: COLORS.blue,   label: 'Comments' },
  comment_like:        { icon: 'heart',               color: COLORS.red,    label: 'Likes' },
  comment_reply:       { icon: 'chatbubble-ellipses', color: COLORS.blue,   label: 'Replies' },
  reply:               { icon: 'chatbubble-ellipses', color: COLORS.blue,   label: 'Replies' },
  mention:             { icon: 'at',                  color: '#7C4DFF',     label: 'Mentions' },
  fanbase:             { icon: 'lock-open',            color: '#00C853',     label: '🔒 Fanbase' },
  fanbase_join:        { icon: 'lock-open',            color: '#00C853',     label: '🔒 Fanbase' },
  thanks:              { icon: 'thumbs-up',            color: COLORS.gold,   label: '👍 Thanks' },
  ranking:             { icon: 'trophy',               color: COLORS.gold,   label: 'Rankings' },
  announcement:        { icon: 'megaphone',            color: '#FF6B00',     label: '📣 News' },
  system:              { icon: 'game-controller',      color: COLORS.gray,   label: 'System' },
  leader_bonus:        { icon: 'crown',                color: COLORS.gold,   label: '👑 Crown Bonus' },
  withdrawal_paid:     { icon: 'cash',                 color: '#00C853',     label: '💸 Withdrawal' },
  withdrawal_rejected: { icon: 'close-circle',         color: COLORS.red,    label: 'Withdrawal' },
  giftcard_sent:       { icon: 'gift',                 color: '#00C853',     label: '🎁 Gift Card' },
  giftcard_rejected:   { icon: 'close-circle',         color: COLORS.red,    label: 'Gift Card' },
  champion:            { icon: 'trophy',               color: COLORS.gold,   label: '👑 Champion' },
  strike:              { icon: 'warning',              color: COLORS.red,    label: '⚠️ Strike' },
};

export default function NotificationsScreen({ navigation }) {
  const { user } = useAuthStore();
  const [notifs, setNotifs] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const profileCache = {};
    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Récupère le profil actuel de tous les expéditeurs (nom + avatar à jour)
      const senderIds = [...new Set(
        list.filter(n => n.fromUserId && n.fromUserId !== 'SYSTEM').map(n => n.fromUserId)
      )];
      await Promise.all(senderIds.map(async (uid) => {
        if (profileCache[uid] !== undefined) return;
        try {
          const s = await getDoc(doc(db, 'users', uid));
          if (s.exists()) {
            const d = s.data();
            profileCache[uid] = { avatar: d.avatar || '', username: d.username || '' };
          } else {
            profileCache[uid] = { avatar: '', username: '' };
          }
        } catch (e) { profileCache[uid] = { avatar: '', username: '' }; }
      }));
      if (!mountedRef.current) return;
      // Injecte le profil actuel (avatar + username à jour)
      const enriched = list.map(n => {
        if (!n.fromUserId || n.fromUserId === 'SYSTEM') return n;
        const p = profileCache[n.fromUserId] || {};
        return {
          ...n,
          fromAvatar: p.avatar || n.fromAvatar || '',
          fromUsername: p.username || n.fromUsername || '',
        };
      });
      setNotifs(enriched);
      setLoading(false);
      // Clear app icon badge when notifications are viewed
      const unread = enriched.filter(n => !n.read).length;
      Notifications.setBadgeCountAsync(unread).catch(() => {});
    }, (error) => {
      if (__DEV__) { console.log('Notif error:', error); }
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'gg', label: '⭐ GG' },
    { id: 'follow', label: 'Followers' },
    { id: 'comment', label: 'Comments' },
    { id: 'fanbase', label: '🔒 Fanbase' },
    { id: 'system', label: 'System' },
  ];

  const filtered = activeFilter === 'all' ? notifs : notifs.filter(n => n.type === activeFilter);
  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = async () => {
    const unread = notifs.filter(n => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
      await batch.commit();
      Notifications.setBadgeCountAsync(0).catch(() => {});
    } catch (e) {
      // silent fail — notifications will re-render correctly on next snapshot
    }
  };

  const markRead = async (notifId) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch (e) {
      // silent fail — the UI will correct itself on the next snapshot
    }
  };

  const timeAgo = (timestamp) => {
    if (!timestamp) return '';
    const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Math.floor((new Date() - d) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const renderItem = ({ item }) => {
    const config = NOTIF_CONFIG[item.type] || NOTIF_CONFIG.system;
    const isSystem = item.type === 'system' || item.fromUserId === 'SYSTEM' || !item.fromUserId;
    return (
      <TouchableOpacity
        style={[styles.notifRow, !item.read && styles.notifRowUnread]}
        onPress={async () => {
            markRead(item.id);
            const videoTypes = ['gg', 'comment', 'comment_like', 'comment_reply', 'reply', 'mention', 'thanks'];
            if (videoTypes.includes(item.type) && item.videoId) {
              try {
                const videoSnap = await getDoc(doc(db, 'videos', item.videoId));
                if (videoSnap.exists()) {
                  navigation.navigate('VideoPlayer', { video: { id: videoSnap.id, ...videoSnap.data() } });
                } else {
                  Alert.alert('Video unavailable', 'This video may have been removed.');
                }
              } catch (e) {
                Alert.alert('Video unavailable', 'This video may have been removed.');
              }
            } else if ((item.type === 'follow' || item.type === 'fanbase_join' || item.type === 'fanbase') && item.fromUserId) {
              navigation.navigate('UserProfile', { userId: item.fromUserId });
            } else if (item.type === 'ranking' || item.type === 'champion' || item.type === 'leader_bonus') {
              navigation.navigate('Rankings');
            }
          }}
        activeOpacity={0.85}
      >
        {isSystem ? (
          // Notif système → logo Gaming Actions
          <View style={[styles.iconWrap, { backgroundColor: COLORS.gold + '18', overflow: 'hidden' }]}>
            <Image source={require('../../../assets/logo.png')} style={{ width: 44, height: 44 }} resizeMode="cover" />
          </View>
        ) : item.fromAvatar ? (
          // Notif d'un user avec avatar
          <Image source={{ uri: item.fromAvatar }} style={styles.iconWrap} resizeMode="cover" />
        ) : (
          // Fallback : initiales de l'utilisateur dans un cercle (comme un avatar)
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(201,168,76,0.18)', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: COLORS.gold, fontWeight: '800', fontSize: 16 }}>
              {(item.fromUsername || 'GA').slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.notifBody}>
          <Text style={styles.notifText}>
            <Text style={[styles.notifUsername, { color: config.color }]}>{item.fromUsername || 'Gaming Actions'}</Text>
            {' '}{item.text}
          </Text>
          <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        {/* Badge type en mini-icône */}
        <View style={[styles.typeBadge, { backgroundColor: config.color + '18' }]}>
          <Ionicons name={config.icon} size={12} color={config.color} />
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && <Text style={styles.headerSub}>{unreadCount} unread</Text>}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 52 }}>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
    {FILTERS.map(f => (
      <TouchableOpacity
        key={f.id}
        onPress={() => setActiveFilter(f.id)}
        style={[styles.filterChip, activeFilter === f.id && styles.filterChipActive]}
      >
        <Text style={[styles.filterText, activeFilter === f.id && styles.filterTextActive]}>{f.label}</Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
</View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={48} color={COLORS.gray2} />
          <Text style={styles.emptyText}>No notifications yet 🔔</Text>
        </View>
      ) : (
        <FlatList
  data={filtered}
  keyExtractor={item => item.id}
  renderItem={renderItem}
  showsVerticalScrollIndicator={false}
  style={{ flex: 1 }}
  contentContainerStyle={{ paddingBottom: 100 }}
  removeClippedSubviews={true}
  initialNumToRender={10}
  maxToRenderPerBatch={10}
  windowSize={10}
/>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  headerSub: { fontSize: 11, color: COLORS.gold, marginTop: 1 },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  markAllText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  filtersRow: { paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8 },
  filterChipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  filterText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  filterTextActive: { color: COLORS.gold, fontWeight: '700' },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  notifRowUnread: { backgroundColor: 'rgba(201,168,76,0.04)' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  notifBody: { flex: 1 },
  notifText: { fontSize: 13, color: COLORS.white, lineHeight: 18 },
  notifUsername: { fontWeight: '700' },
  notifTime: { fontSize: 10, color: COLORS.gray, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gold, marginTop: 6 },
  typeBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 8, alignSelf: 'center' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: COLORS.gray, marginTop: 12 },
});
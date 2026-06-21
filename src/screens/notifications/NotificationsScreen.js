import React, { useState, useEffect } from 'react';
import { View, RefreshControl, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, Platform, Image, ActivityIndicator } from 'react-native';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, writeBatch, getDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

const NOTIF_CONFIG = {
  gg:      { icon: 'star',            color: COLORS.gold,  label: '⭐ GG' },
  follow:  { icon: 'person-add',      color: COLORS.blue,  label: 'Followers' },
  comment: { icon: 'chatbubble',      color: COLORS.blue,  label: 'Comments' },
  fanbase: { icon: 'lock-open',       color: '#00C853',    label: '🔒 Fanbase' },
  ranking: { icon: 'trophy',          color: COLORS.gold,  label: 'Rankings' },
  system:  { icon: 'game-controller', color: COLORS.gray,  label: 'System' },
};

export default function NotificationsScreen({ navigation }) {
  const { user } = useAuthStore();
  const [notifs, setNotifs] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    const avatarCache = {};
    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Récupère les avatars des expéditeurs (utilisateurs) qui n'en ont pas déjà
      const senderIds = [...new Set(
        list.filter(n => n.fromUserId && n.fromUserId !== 'SYSTEM' && !n.fromAvatar).map(n => n.fromUserId)
      )];
      await Promise.all(senderIds.map(async (uid) => {
        if (avatarCache[uid] !== undefined) return;
        try {
          const s = await getDoc(doc(db, 'users', uid));
          avatarCache[uid] = s.exists() ? (s.data().avatar || '') : '';
        } catch (e) { avatarCache[uid] = ''; }
      }));
      // Injecte l'avatar trouvé
      const enriched = list.map(n => ({
        ...n,
        fromAvatar: n.fromAvatar || (n.fromUserId ? avatarCache[n.fromUserId] : '') || '',
      }));
      setNotifs(enriched);
      setLoading(false);
    }, (error) => {
      console.log('Notif error:', error);
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
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
    await batch.commit();
  };

  const markRead = async (notifId) => {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
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
            if ((item.type === 'gg' || item.type === 'comment' || item.type === 'comment_like' || item.type === 'comment_reply') && item.videoId) {
              try {
                const videoSnap = await getDoc(doc(db, 'videos', item.videoId));
                if (videoSnap.exists()) {
                  navigation.navigate('VideoPlayer', { video: { id: videoSnap.id, ...videoSnap.data() } });
                }
              } catch (e) {}
            } else if (item.type === 'follow' && item.fromUserId) {
              navigation.navigate('UserProfile', { userId: item.fromUserId });
            }
          }}
        activeOpacity={0.85}
      >
        {isSystem ? (
          // Notif système → logo Gaming Actions
          <View style={[styles.iconWrap, { backgroundColor: COLORS.gold + '18', overflow: 'hidden' }]}>
            <Image source={{ uri: 'https://res.cloudinary.com/doeqzltv0/image/upload/v1781665036/high-level-description-a-minimal-esports_suTAzMGBVkuiFDGhTaiWqg_FbErQD1GTfqf2I9I1w4rWQ_x5hlui.jpg' }} style={{ width: 44, height: 44 }} resizeMode="cover" />
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
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, Image, ActivityIndicator, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import useUserStore from '../../store/useUserStore';
import Avatar from '../../components/FramedAvatar';

const BADGE_COLORS = {
  gameconic: { bg: COLORS.red, label: 'ICON' },
  creator: { bg: COLORS.blue, label: 'CR' },
  gamer: { bg: COLORS.gray2, label: 'GA' },
};


export default function FollowersScreen({ navigation, route }) {
  const { user: authUser, userProfile } = useAuthStore();
  const { toggleFollow, isFollowing, checkIsFollowing } = useUserStore();
  const targetUserId = route?.params?.userId || authUser?.uid;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchFollowers();
  }, [targetUserId]);

  const fetchFollowers = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'follows'), where('followingId', '==', targetUserId))
      );
      const followerIds = snap.docs.map(d => d.data().followerId);
      const profiles = await Promise.all(
        followerIds.map(async (uid) => {
          const userSnap = await getDoc(doc(db, 'users', uid));
          if (userSnap.exists()) return { uid, ...userSnap.data() };
          return null;
        })
      );
      const filtered = profiles.filter(Boolean);
      setUsers(filtered);
      filtered.forEach(u => checkIsFollowing(authUser?.uid, u.uid));
    } catch(e){} finally {
      setLoading(false);
    }
  };

  const filteredUsers = search.length === 0
    ? users
    : users.filter(u =>
        u.username?.toLowerCase().includes(search.toLowerCase()) ||
        u.mainGame?.toLowerCase().includes(search.toLowerCase())
      );

  const renderItem = ({ item }) => {
    const badge = BADGE_COLORS[item.accountType] || BADGE_COLORS.gamer;
    const following = isFollowing(item.uid);
    const isMe = item.uid === authUser?.uid;
    return (
      <View style={styles.row}>
        <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: item.uid })}>
          <Avatar user={item} size={44} />
        </TouchableOpacity>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.username}>{item.username}</Text>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={styles.badgeText}>{badge.label}</Text>
            </View>
            {item.plan === 'legendary' && (
              <View style={[styles.badge, { backgroundColor: COLORS.gold, marginLeft: 4 }]}>
                <Text style={[styles.badgeText, { color: COLORS.black }]}>LEG</Text>
              </View>
            )}
          </View>
          <Text style={styles.handle}>🎮 {item.mainGame || 'Gaming'}</Text>
        </View>
        {!isMe && (
          <TouchableOpacity
            onPress={() => toggleFollow(authUser?.uid, item.uid, userProfile?.username)}
            style={[styles.followBtn, following && styles.followingBtn]}
          >
            <Text style={[styles.followBtnText, following && { color: COLORS.gray }]}>
              {following ? 'Following' : 'Follow Back'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Followers · {users.length}</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={COLORS.gray} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search..."
          placeholderTextColor={COLORS.gray}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={COLORS.gray} />
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: 40 }} />
      ) : filteredUsers.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={COLORS.gray2} />
          <Text style={styles.emptyText}>{search.length > 0 ? 'No results' : 'No followers yet 👥'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginVertical: 10, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.white, paddingVertical: 10, marginLeft: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  info: { flex: 1, marginLeft: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  username: { fontSize: 14, fontWeight: '700', color: COLORS.white, marginRight: 6 },
  handle: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  badgeText: { fontSize: 8, fontWeight: '900', color: COLORS.white },
  followBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.gold },
  followingBtn: { borderColor: COLORS.gray3 },
  followBtnText: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: COLORS.gray, marginTop: 12 },
});
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Platform, Alert, Image, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, getDoc, doc, deleteDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

const BADGE = {
  gameconic: { bg: COLORS.red, label: 'ICON' },
  creator: { bg: COLORS.blue, label: 'CR' },
  gamer: { bg: COLORS.gray2, label: 'GA' },
};

function Avatar({ user, size = 42 }) {
  const ringColor = user?.plan === 'legendary' ? COLORS.gold : COLORS.gray3;
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, borderWidth: 1.5, borderColor: ringColor, opacity: 0.6 }} />
      {user?.avatar ? (
        <Image source={{ uri: user.avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: ringColor }}>
          <Text style={{ color: COLORS.gold, fontWeight: '800', fontSize: size * 0.35 }}>
            {(user?.username || 'GA').slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function BellsListScreen({ navigation }) {
  const { user: authUser } = useAuthStore();
  const [bells, setBells] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBells();
  }, []);

  const fetchBells = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'bells'), where('bellerId', '==', authUser.uid))
      );
      const profiles = await Promise.all(
        snap.docs.map(async (d) => {
          const userSnap = await getDoc(doc(db, 'users', d.data().targetUserId));
          if (userSnap.exists()) return { bellDocId: d.id, uid: userSnap.id, ...userSnap.data() };
          return null;
        })
      );
      setBells(profiles.filter(Boolean));
    } catch(e){} finally {
      setLoading(false);
    }
  };

  const removeBell = (bellDocId, uid) => {
    Alert.alert(
      'Remove notification',
      'Stop receiving notifications from this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'bells', bellDocId));
              setBells(prev => prev.filter(u => u.uid !== uid));
            } catch (e) {
              Alert.alert('Error', 'Something went wrong. Please try again.');
            }
          },
        },
      ]
    );
  };

  const filtered = search.length === 0
    ? bells
    : bells.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cloches & Alertes</Text>
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
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={COLORS.gray} />
          </TouchableOpacity>
        )}
      </View>

      {!loading && (
        <Text style={styles.sectionLabel}>
          {bells.length} USER{bells.length !== 1 ? 'S' : ''} WITH BELL ON
        </Text>
      )}

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.uid}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const badge = BADGE[item.accountType] || BADGE.gamer;
            return (
              <View style={styles.row}>
                <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: item.uid })}>
                  <Avatar user={item} size={42} />
                </TouchableOpacity>
                <View style={styles.info}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.username}>{item.username}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={styles.badgeText}>{badge.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.handle}>🎮 {item.mainGame || 'Gaming'}</Text>
                </View>
                <View style={styles.bellActive}>
                  <Ionicons name="notifications" size={16} color={COLORS.gold} />
                </View>
                <TouchableOpacity onPress={() => removeBell(item.bellDocId, item.uid)} style={styles.removeBtn}>
                  <Ionicons name="close" size={16} color={COLORS.gray} />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color={COLORS.gray2} />
              <Text style={styles.emptyText}>
                {search.length > 0 ? `No results for "${search}"` : 'No bells activated yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                Tap the 🔔 on a profile to get notified when they post
              </Text>
            </View>
          )}
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
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  info: { flex: 1, marginLeft: 12 },
  username: { fontSize: 15, fontWeight: '700', color: COLORS.white, marginRight: 6 },
  handle: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  badgeText: { fontSize: 7, fontWeight: '900', color: COLORS.white },
  bellActive: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: COLORS.gold, marginRight: 8 },
  removeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: COLORS.gray3 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyText: { fontSize: 14, color: COLORS.gray, marginTop: 12, textAlign: 'center', fontWeight: '600' },
  emptySubtext: { fontSize: 12, color: COLORS.gray2, marginTop: 8, textAlign: 'center', lineHeight: 17 },
});
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, FlatList, Image, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

export default function BlockedUsersScreen({ navigation }) {
  const { user, userProfile, saveProfile } = useAuthStore();
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    setLoading(true);
    try {
      const blockedIds = userProfile?.blockedUsers || [];
      if (blockedIds.length === 0) { setBlockedUsers([]); setLoading(false); return; }
      const profiles = await Promise.all(
        blockedIds.map(async (uid) => {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) return { uid, ...snap.data() };
          return { uid, username: 'Deleted User', avatar: null };
        })
      );
      setBlockedUsers(profiles);
    } catch (e) { console.log('BlockedUsers load error:', e.message); }
    setLoading(false);
  };

  const handleUnblock = async (uid, username) => {
    Alert.alert(
      `Unblock ${username}?`,
      'They will be able to interact with your content again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: async () => {
          try {
            const newBlocked = (userProfile?.blockedUsers || []).filter(id => id !== uid);
            await saveProfile({ blockedUsers: newBlocked });
            setBlockedUsers(prev => prev.filter(u => u.uid !== uid));
          } catch (e) {
            Alert.alert('Error', 'Could not unblock. Please try again.');
          }
        }},
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={s.row}>
      <View style={s.avatarWrap}>
        {item.avatar
          ? <Image source={{ uri: item.avatar }} style={s.avatar} />
          : <View style={[s.avatar, { backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={20} color={COLORS.gold} />
            </View>
        }
      </View>
      <Text style={s.username} numberOfLines={1}>@{item.username || 'Unknown'}</Text>
      <TouchableOpacity onPress={() => handleUnblock(item.uid, item.username)} style={s.unblockBtn}>
        <Text style={s.unblockText}>Unblock</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Blocked Users</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={s.infoBanner}>
        <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.blue} />
        <Text style={s.infoText}>Blocked users cannot see your profile, clips, or interact with your content. You won't see their content in your feed.</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.gold} />
        </View>
      ) : blockedUsers.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="shield-checkmark-outline" size={50} color={COLORS.gray2} />
          <Text style={s.emptyTitle}>No blocked users</Text>
          <Text style={s.emptyDesc}>Users you block will appear here. Block someone from their profile page.</Text>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={item => item.uid}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', margin: 14, padding: 12, backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.blue + '40', gap: 8 },
  infoText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  username: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.white },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: COLORS.gray3 },
  unblockText: { fontSize: 12, color: COLORS.white, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white, marginTop: 16 },
  emptyDesc: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 19, marginTop: 8 },
});

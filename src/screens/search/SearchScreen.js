import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  TouchableOpacity, Platform, Image, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, getDocs, limit, where } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import Avatar from '../../components/FramedAvatar';

const BADGE_COLORS = {
  gameconic: { bg: COLORS.red, label: 'ICON' },
  creator: { bg: COLORS.blue, label: 'CR' },
  developer: { bg: '#7C4DFF', label: 'DEV' },
  gamer: { bg: COLORS.gray2, label: 'GA' },
};


export default function SearchScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchTimeout = React.useRef(null);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchQuery.trim()) { setResults([]); return; }

    setLoading(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const q = searchQuery.toLowerCase().trim();
        const snap = await getDocs(query(
          collection(db, 'users'),
          where('usernameLower', '>=', q),
          where('usernameLower', '<=', q + '\uf8ff'),
          limit(30)
        ));
        const matched = snap.docs
          .map(d => ({ id: d.id, uid: d.data().uid || d.id, ...d.data() }))
          .filter(u => u.username)
          .sort((a, b) => (a.usernameLower || '').localeCompare(b.usernameLower || ''));
        setResults(matched);
      } catch(e){
        setResults([]);
        console.warn('Search error:', e?.message);
      }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [searchQuery]);

  const filtered = results;

  const renderUser = ({ item }) => {
    const badge = BADGE_COLORS[item.accountType] || BADGE_COLORS.gamer;
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('UserProfile', { userId: item.uid || item.id })}
        style={styles.row}
        activeOpacity={0.8}
      >
        <Avatar user={item} size={44} />
        <View style={styles.info}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.username}>{item.username}</Text>
            {item.plan === 'legendary' && (
              <View style={[styles.badge, { backgroundColor: COLORS.gold, marginLeft: 5 }]}>
                <Text style={[styles.badgeText, { color: COLORS.black }]}>LEG</Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: badge.bg, marginLeft: 4 }]}>
              <Text style={styles.badgeText}>{badge.label}</Text>
            </View>
          </View>
          <Text style={styles.meta}>🎮 {item.mainGame || 'Gaming'} · {(item.followers || 0).toLocaleString()} followers</Text>
          {item.bio ? <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
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
        <Text style={styles.headerTitle}>Search Gamers</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.gray} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Username or game..."
            placeholderTextColor={COLORS.gray}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={styles.resultsLabel}>
        {!searchQuery.trim() ? 'Search for a gamer...' : loading ? 'Searching...' : `${filtered.length} RESULT${filtered.length !== 1 ? 'S' : ''}`}
      </Text>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uid || item.id}
          renderItem={renderUser}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color={COLORS.gray2} />
              {searchQuery.trim().length > 0 ? (
                <Text style={styles.emptyText}>No gamers found for "{searchQuery}"</Text>
              ) : (
                <Text style={styles.emptyText}>Search for gamers by username</Text>
              )}
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
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.white },
  resultsLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  info: { flex: 1, marginLeft: 12 },
  username: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  meta: { fontSize: 11, color: COLORS.gold, marginTop: 2 },
  bio: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  badgeText: { fontSize: 7, fontWeight: '900', color: COLORS.white },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: COLORS.gray, marginTop: 12, textAlign: 'center', paddingHorizontal: 30 },
});
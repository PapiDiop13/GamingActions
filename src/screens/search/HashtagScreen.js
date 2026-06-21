/**
 * HashtagScreen.js — Browse all clips tagged with a specific hashtag
 *
 * Navigated to by tapping a #hashtag in comment text or video captions.
 * Queries Firestore for videos where the `hashtags` array contains the tag.
 *
 * Requires a Firestore index:
 *   Collection: videos | Field: hashtags (array-contains) + createdAt (desc)
 *   Create at: Firebase Console → Firestore → Indexes → Add Index
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Image, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';

export default function HashtagScreen({ navigation, route }) {
  const tag = (route?.params?.tag || '').toLowerCase().replace(/^#/, '');

  const [videos, setVideos]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tag) { setLoading(false); return; }
    loadHashtag();
  }, [tag]);

  const loadHashtag = async () => {
    setLoading(true);
    try {
      // array-contains query — Firestore supports this without composite index
      // if ordering by createdAt requires an index, add it in Firebase Console
      const snap = await getDocs(
        query(
          collection(db, 'videos'),
          where('hashtags', 'array-contains', tag),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
      );
      setVideos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      await logError(LOG_CONTEXT.FEED_LOAD_FAIL, e);
    }
    setLoading(false);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('VideoPlayer', { video: item })}
      activeOpacity={0.85}
    >
      {item.thumbnail
        ? <Image source={{ uri: item.thumbnail }} style={styles.thumb} resizeMode="cover" />
        : <View style={[styles.thumb, styles.thumbEmpty]} />
      }
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title || item.caption || 'Clip'}</Text>
        <Text style={styles.cardMeta}>{item.username} · {item.game}</Text>
        <View style={styles.cardStats}>
          <Ionicons name="star" size={11} color={COLORS.gold} />
          <Text style={styles.statText}>{item.ggCount || 0} GG</Text>
          <Text style={[styles.statText, { marginLeft: 8 }]}>👁 {item.viewCount || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>#{tag}</Text>
        {!loading && (
          <Text style={styles.headerCount}>{videos.length} clips</Text>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Ionicons name="search-outline" size={48} color={COLORS.gray3} />
              <Text style={{ color: COLORS.gray, marginTop: 12, fontSize: 14 }}>
                No clips found for #{tag}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 30,
    paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.gold, flex: 1 },
  headerCount: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },

  card: {
    flexDirection: 'row', backgroundColor: COLORS.card,
    borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    borderWidth: 0.5, borderColor: COLORS.gray3,
  },
  thumb: { width: 80, height: 80 },
  thumbEmpty: { backgroundColor: COLORS.gray3 },

  cardInfo: { flex: 1, padding: 10, justifyContent: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '800', color: COLORS.white, marginBottom: 3 },
  cardMeta:  { fontSize: 11, color: COLORS.gray, marginBottom: 6 },
  cardStats: { flexDirection: 'row', alignItems: 'center' },
  statText:  { fontSize: 11, color: COLORS.gray, marginLeft: 3, fontWeight: '600' },
});

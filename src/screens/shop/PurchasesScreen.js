import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import {
  getFrameById, getVideoFrameById, getCommentFrameById,
} from '../../constants/frames';

function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-CA') + '  ' + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

// Détecte le type d'achat depuis la raison enregistrée
function parsePurchase(item) {
  const r = item.reason || '';
  if (r.includes('Frame purchased') || r.includes('frame') || r.includes('Frame')) {
    // Essaie d'extraire l'id de frame depuis la raison
    const avatarFrame = getFrameById(item.frameId);
    const videoFrame  = getVideoFrameById(item.frameId);
    const commentFrame = getCommentFrameById(item.frameId);
    const frame = avatarFrame || videoFrame || commentFrame;
    return {
      type: 'frame',
      label: frame?.name || r,
      icon: 'scan-outline',
      color: COLORS.gold,
      frameId: item.frameId || null,
      frameType: avatarFrame ? 'avatar' : videoFrame ? 'video' : 'comment',
    };
  }
  return {
    type: 'other',
    label: r || 'Purchase',
    icon: 'bag-outline',
    color: COLORS.blue,
  };
}

export default function PurchasesScreen({ navigation }) {
  const { user, userProfile, saveProfile } = useAuthStore();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'frames' | 'other'

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      // Requête simple (juste userId) + filtre delta<0 côté client → pas d'index composite requis
      const snap = await getDocs(
        query(
          collection(db, 'points_history'),
          where('userId', '==', user.uid)
        )
      );
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const spent = all.filter(i => (i.delta || 0) < 0);
      // Tri par date décroissante côté client
      spent.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
      setPurchases(spent);
    } catch (e) {
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const handleEquip = async (item) => {
    const p = parsePurchase(item);
    if (p.type !== 'frame' || !p.frameId) {
      Alert.alert('Info', 'This item cannot be equipped.');
      return;
    }
    try {
      if (p.frameType === 'avatar') {
        await saveProfile({ equippedFrame: p.frameId });
        Alert.alert('✅ Equipped!', `"${p.label}" is now your avatar frame.`);
      } else if (p.frameType === 'video') {
        await saveProfile({ equippedVideoFrame: p.frameId });
        Alert.alert('✅ Equipped!', `"${p.label}" is now your video frame.`);
      } else if (p.frameType === 'comment') {
        await saveProfile({ equippedCommentFrame: p.frameId });
        Alert.alert('✅ Equipped!', `"${p.label}" is now your comment frame.`);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not equip. Please try again.');
    }
  };

  const filtered = filter === 'all' ? purchases
    : filter === 'frames' ? purchases.filter(i => parsePurchase(i).type === 'frame')
    : purchases.filter(i => parsePurchase(i).type !== 'frame');

  const renderItem = ({ item }) => {
    const p = parsePurchase(item);
    const spent = Math.abs(item.delta || 0);
    const isEquipped =
      (p.frameType === 'avatar'  && userProfile?.equippedFrame === p.frameId) ||
      (p.frameType === 'video'   && userProfile?.equippedVideoFrame === p.frameId) ||
      (p.frameType === 'comment' && userProfile?.equippedCommentFrame === p.frameId);

    return (
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: p.color + '20' }]}>
          <Ionicons name={p.icon} size={18} color={p.color} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.label}>{p.label}</Text>
          <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
          {item.total !== undefined && (
            <Text style={styles.balance}>Balance after: {item.total.toLocaleString()} pts</Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.spent}>−{spent} pts</Text>
          {p.type === 'frame' && p.frameId && (
            <TouchableOpacity
              onPress={() => handleEquip(item)}
              style={[styles.equipBtn, isEquipped && styles.equipBtnActive]}
            >
              <Text style={[styles.equipBtnText, isEquipped && { color: COLORS.black }]}>
                {isEquipped ? '✓ Equipped' : 'Equip'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const FILTERS = [
    { id: 'all',    label: 'All' },
    { id: 'frames', label: 'Frames' },
    { id: 'other',  label: 'Other' },
  ];

  const totalSpent = purchases.reduce((s, i) => s + Math.abs(i.delta || 0), 0);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Purchases</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Résumé */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryVal}>{purchases.length}</Text>
          <Text style={styles.summaryLabel}>Total purchases</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryVal, { color: COLORS.red }]}>−{totalSpent.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>GA Points spent</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryVal, { color: COLORS.gold }]}>{(userProfile?.gaPoints || 0).toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Current balance</Text>
        </View>
      </View>

      {/* Filtres */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[styles.filterBtn, filter === f.id && styles.filterBtnActive]}
          >
            <Text style={[styles.filterBtnText, filter === f.id && styles.filterBtnTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.gold} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Ionicons name="bag-outline" size={48} color={COLORS.gray3} />
              <Text style={{ color: COLORS.gray, marginTop: 12, fontSize: 14 }}>
                No purchases yet.{'\n'}Head to the Shop to get started! 🛍️
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30,
    paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 14, gap: 8 },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12,
    alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3,
  },
  summaryVal: { fontSize: 18, fontWeight: '900', color: COLORS.white },
  summaryLabel: { fontSize: 10, color: COLORS.gray, marginTop: 3, textAlign: 'center' },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 10, gap: 8,
  },
  filterBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5,
    borderColor: COLORS.gray3, alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  filterBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.gray },
  filterBtnTextActive: { color: COLORS.black },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3,
  },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  date: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  balance: { fontSize: 10, color: COLORS.gray2, marginTop: 1 },
  spent: { fontSize: 14, fontWeight: '800', color: COLORS.red, marginBottom: 6 },
  equipBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.gold,
  },
  equipBtnActive: { backgroundColor: COLORS.gold },
  equipBtnText: { fontSize: 11, fontWeight: '800', color: COLORS.gold },
});

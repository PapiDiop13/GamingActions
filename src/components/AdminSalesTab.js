/**
 * AdminSalesTab.js — Liste en temps quasi-réel des achats & abonnés (admin)
 * Infinite scroll + lazy loading (pagination Firestore startAfter).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, limit, startAfter, getDocs, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLORS } from '../constants/colors';

const PAGE = 20;

const SEGMENTS = [
  { key: 'shop',      label: 'Shop 🛒',      coll: 'shop_purchases',      order: 'createdAt' },
  { key: 'support',   label: 'Support 💛',   coll: 'support_purchases',   order: 'createdAt' },
  { key: 'legendary', label: 'Legendary 👑', coll: 'subscriptions',       order: 'startDate' },
  { key: 'fanbase',   label: 'Fanbase 🔓',   coll: 'fanbase_subscriptions', order: 'createdAt' },
  { key: 'payouts',   label: 'Payouts 💸',   coll: 'fanbase_payments',     order: 'createdAt' },
];

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function Row({ seg, item }) {
  if (seg === 'shop') {
    return (
      <View style={s.row}>
        <Ionicons name="pricetag" size={16} color={COLORS.gold} />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{item.itemName || item.itemId || 'Item'}</Text>
          <Text style={s.sub}>{(item.category || '').replace('_', ' ')} · {item.userId?.slice(0, 10)}…</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.amount}>CA${Number(item.amount || 0).toFixed(2)}</Text>
          <Text style={s.date}>{fmtDate(item.createdAt)}</Text>
        </View>
      </View>
    );
  }
  if (seg === 'support') {
    return (
      <View style={s.row}>
        <Ionicons name="heart" size={16} color="#FF2D55" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Support</Text>
          <Text style={s.sub}>{item.userId?.slice(0, 10)}… · {item.source || ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.amount, { color: '#FF2D55' }]}>CA${Number(item.amount || 0).toFixed(2)}</Text>
          <Text style={s.date}>{fmtDate(item.createdAt)}</Text>
        </View>
      </View>
    );
  }
  if (seg === 'legendary') {
    return (
      <View style={s.row}>
        <Ionicons name="star" size={16} color={COLORS.gold} />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{item.userId?.slice(0, 12)}…</Text>
          <Text style={s.sub}>{item.productId || 'legendary'} · {item.platform || ''} {item.isTest ? '· TEST' : ''}</Text>
        </View>
        <Text style={s.date}>{fmtDate(item.startDate || item.createdAt)}</Text>
      </View>
    );
  }
  if (seg === 'payouts') {
    return (
      <View style={s.row}>
        <Ionicons name="cash-outline" size={16} color="#00C853" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>→ creator {item.creatorId?.slice(0, 12)}…</Text>
          <Text style={s.sub}>from {item.subscriberId?.slice(0, 10)}… · gross CA${Number(item.gross || 0).toFixed(2)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.amount, { color: '#00C853' }]}>+CA${Number(item.creatorAmount || 0).toFixed(2)}</Text>
          <Text style={s.date}>{fmtDate(item.createdAt)}</Text>
        </View>
      </View>
    );
  }
  // fanbase
  return (
    <View style={s.row}>
      <Ionicons name="lock-open" size={16} color="#7C4DFF" />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{item.subscriberId?.slice(0, 12)}…</Text>
        <Text style={s.sub}>→ creator {item.creatorId?.slice(0, 10)}… {item.isTest ? '· TEST' : ''}</Text>
      </View>
      <Text style={s.date}>{fmtDate(item.createdAt)}</Text>
    </View>
  );
}

export default function AdminSalesTab() {
  const [seg, setSeg] = useState('shop');
  const [items, setItems] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cfg = SEGMENTS.find(x => x.key === seg);

  const load = useCallback(async (reset = false) => {
    if (loading) return;
    if (!reset && !hasMore) return;
    setLoading(true);
    try {
      let q = query(collection(db, cfg.coll), orderBy(cfg.order, 'desc'), limit(PAGE));
      if (!reset && lastDoc) q = query(collection(db, cfg.coll), orderBy(cfg.order, 'desc'), startAfter(lastDoc), limit(PAGE));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(reset ? docs : [...items, ...docs]);
      setLastDoc(snap.docs[snap.docs.length - 1] || (reset ? null : lastDoc));
      setHasMore(snap.docs.length === PAGE);
    } catch (e) { /* index/permission */ }
    setLoading(false);
    setRefreshing(false);
  }, [cfg, lastDoc, items, hasMore, loading]);

  // Reset + first load on segment change
  useEffect(() => {
    setItems([]); setLastDoc(null); setHasMore(true);
    // load first page after state reset
    const t = setTimeout(() => load(true), 0);
    return () => clearTimeout(t);
  }, [seg]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.segBar}>
        {SEGMENTS.map(x => (
          <TouchableOpacity key={x.key} onPress={() => setSeg(x.key)} style={[s.seg, seg === x.key && s.segActive]}>
            <Text style={[s.segText, seg === x.key && { color: COLORS.gold }]}>{x.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <Row seg={seg} item={item} />}
        onEndReached={() => load(false)}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setLastDoc(null); setHasMore(true); load(true); }} tintColor={COLORS.gold} />}
        ListEmptyComponent={!loading ? <Text style={s.empty}>No data yet.</Text> : null}
        ListFooterComponent={loading ? <ActivityIndicator color={COLORS.gold} style={{ marginVertical: 16 }} /> : null}
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  segBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, flexWrap: 'wrap' },
  seg: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 0.5, borderColor: COLORS.gray3, backgroundColor: COLORS.card },
  segActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.1)' },
  segText: { fontSize: 12, fontWeight: '700', color: COLORS.gray },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  title: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  sub: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '900', color: COLORS.gold },
  date: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
  empty: { color: COLORS.gray, textAlign: 'center', marginTop: 40 },
});

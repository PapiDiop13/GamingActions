// src/screens/profile/PointsHistoryScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

const ICON_MAP = {
  'Posted a clip':     { icon: 'cloud-upload-outline', color: COLORS.green },
  'Received a GG':     { icon: 'star-outline',         color: COLORS.gold },
  'GG removed':        { icon: 'star-outline',         color: COLORS.gray },
  'New follower':      { icon: 'person-add-outline',   color: COLORS.blue },
  'Daily login bonus': { icon: 'calendar-outline',     color: COLORS.purple },
  'Frame purchased':   { icon: 'scan-outline',         color: COLORS.gold },
  'Clip deleted':      { icon: 'trash-outline',        color: COLORS.red },
};

const DEFAULT_ICON = { icon: 'flash-outline', color: COLORS.gray };

function getIcon(reason = '') {
  for (const key of Object.keys(ICON_MAP)) {
    if (reason.includes(key)) {
      return ICON_MAP[key];
    }
  }
  return DEFAULT_ICON;
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-CA') + ' ' + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

export default function PointsHistoryScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    getDocs(
      query(
        collection(db, 'points_history'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(100)
      )
    ).then(snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.uid]);

  const renderItem = ({ item }) => {
    const { icon, color } = getIcon(item.reason);
    const isPositive = item.delta > 0;
    return (
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.reason}>{item.reason || 'Points update'}</Text>
          <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.delta, { color: isPositive ? COLORS.green : COLORS.red }]}>
            {isPositive ? '+' : ''}{item.delta} pts
          </Text>
          {item.total !== undefined && (
            <Text style={styles.total}>= {item.total.toLocaleString()} pts</Text>
          )}
        </View>
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
        <Text style={styles.headerTitle}>Points History</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Balance actuelle */}
      <View style={styles.balanceCard}>
        <Ionicons name="star" size={20} color={COLORS.gold} />
        <Text style={styles.balanceLabel}> Current balance</Text>
        <Text style={styles.balanceAmount}>{(userProfile?.gaPoints || 0).toLocaleString()} pts</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.gold} />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={{ color: COLORS.gray, textAlign: 'center', marginTop: 40 }}>
              No points history yet.{'\n'}Start posting clips to earn points! 🎮
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  balanceCard: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  balanceLabel: { flex: 1, fontSize: 14, color: COLORS.gray, marginLeft: 4 },
  balanceAmount: { fontSize: 20, fontWeight: '900', color: COLORS.gold },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  reason: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  date: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  delta: { fontSize: 15, fontWeight: '800' },
  total: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
});

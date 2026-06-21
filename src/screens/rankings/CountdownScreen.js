import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

function CountdownBlock({ value, label, color }) {
  return (
    <View style={styles.block}>
      <View style={[styles.blockInner, { borderColor: color + '60' }]}>
        <Text style={[styles.blockNum, { color }]}>{String(value).padStart(2, '0')}</Text>
      </View>
      <Text style={styles.blockLabel}>{label}</Text>
    </View>
  );
}

export default function CountdownScreen({ navigation }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const diffMs = Math.max(endOfMonth - now, 0);
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  const isLastDay = days === 0;

  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Monthly Reset</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.content}>
        {/* Month */}
        <Text style={styles.monthLabel}>{monthName}</Text>
        <Text style={styles.monthSub}>Rankings reset at end of month</Text>

        {/* Countdown */}
        <View style={styles.countdown}>
          {isLastDay ? (
            <>
              <CountdownBlock value={hours} label="HOURS" color={COLORS.red} />
              <Text style={styles.colon}>:</Text>
              <CountdownBlock value={minutes} label="MIN" color={COLORS.red} />
              <Text style={styles.colon}>:</Text>
              <CountdownBlock value={seconds} label="SEC" color={COLORS.red} />
            </>
          ) : (
            <>
              <CountdownBlock value={days} label="DAYS" color={COLORS.gold} />
              <Text style={styles.colon}>:</Text>
              <CountdownBlock value={hours} label="HOURS" color={COLORS.gold} />
              <Text style={styles.colon}>:</Text>
              <CountdownBlock value={minutes} label="MIN" color={COLORS.gold} />
              <Text style={styles.colon}>:</Text>
              <CountdownBlock value={seconds} label="SEC" color={COLORS.gold} />
            </>
          )}
        </View>

        {isLastDay && (
          <View style={styles.lastDayBadge}>
            <Ionicons name="flash" size={14} color={COLORS.black} />
            <Text style={styles.lastDayText}>LAST DAY — Rankings close tonight!</Text>
          </View>
        )}

        {/* Info cards */}
        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <Ionicons name="trophy-outline" size={22} color={COLORS.gold} />
            <Text style={styles.infoCardTitle}>Top 10 Win Rewards</Text>
            <Text style={styles.infoCardDesc}>Top players earn GA Points, badges and featured placement</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="refresh-outline" size={22} color={COLORS.blue} />
            <Text style={styles.infoCardTitle}>Rankings Reset</Text>
            <Text style={styles.infoCardDesc}>All GG counts reset to 0 on the 1st of each month</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="star-outline" size={22} color={COLORS.gold} />
            <Text style={styles.infoCardTitle}>Champion Badge</Text>
            <Text style={styles.infoCardDesc}>The #1 player becomes Monthly Champion and gets a crown</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.viewRankingsBtn}>
          <Ionicons name="trophy" size={16} color={COLORS.black} />
          <Text style={styles.viewRankingsBtnText}>View Current Rankings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  monthLabel: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  monthSub: { fontSize: 12, color: COLORS.gray, marginBottom: 36 },
  countdown: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  colon: { fontSize: 28, fontWeight: '900', color: COLORS.gray2, marginHorizontal: 4, marginBottom: 20 },
  block: { alignItems: 'center', marginHorizontal: 4 },
  blockInner: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, minWidth: 64, alignItems: 'center', borderWidth: 1 },
  blockNum: { fontSize: 34, fontWeight: '900', letterSpacing: 2 },
  blockLabel: { fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 1, marginTop: 6, textTransform: 'uppercase' },
  lastDayBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
  lastDayText: { fontSize: 11, color: COLORS.black, fontWeight: '800', marginLeft: 5 },
  infoCards: { width: '100%', marginTop: 20, marginBottom: 24 },
  infoCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white, marginLeft: 12, flex: 1 },
  infoCardDesc: { fontSize: 11, color: COLORS.gray, marginLeft: 12, flex: 2 },
  viewRankingsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gold, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  viewRankingsBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.black, marginLeft: 8 },
});
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';

const STRIKE_HISTORY = [
  { id: 's1', reason: 'Inappropriate content', date: '2025-06-01', status: 'active', expiry: '2025-07-01' },
];

const STRIKE_RULES = [
  { strikes: 1, consequence: 'Warning + content removed', icon: 'warning-outline', color: COLORS.gold },
  { strikes: 2, consequence: '7-day posting restriction', icon: 'time-outline', color: '#FF9500' },
  { strikes: 3, consequence: '30-day suspension', icon: 'ban-outline', color: COLORS.red },
  { strikes: 4, consequence: 'Permanent ban', icon: 'skull-outline', color: '#8B0000' },
];

export default function StrikesScreen({ navigation }) {
  const { user } = useAuthStore();
  const strikeCount = user?.strikes || STRIKE_HISTORY.filter(s => s.status === 'active').length;
  const maxStrikes = 4;

  const getStrikeColor = (count) => {
    if (count === 0) return COLORS.green;
    if (count === 1) return COLORS.gold;
    if (count === 2) return '#FF9500';
    return COLORS.red;
  };

  const strikeColor = getStrikeColor(strikeCount);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Strikes</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Strike meter */}
        <View style={[styles.meterCard, { borderColor: strikeColor + '50' }]}>
          <Text style={styles.meterTitle}>Current Strikes</Text>
          <View style={styles.strikeCircles}>
            {[...Array(maxStrikes)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.strikeCircle,
                  i < strikeCount && { backgroundColor: strikeColor, borderColor: strikeColor },
                ]}
              >
                {i < strikeCount && <Ionicons name="close" size={14} color={COLORS.white} />}
              </View>
            ))}
          </View>
          <Text style={[styles.meterCount, { color: strikeColor }]}>{strikeCount} / {maxStrikes} strikes</Text>
          {strikeCount === 0 ? (
            <Text style={styles.meterStatus}>✅ Your account is in good standing</Text>
          ) : (
            <Text style={styles.meterStatus}>⚠️ {maxStrikes - strikeCount} more strike{maxStrikes - strikeCount > 1 ? 's' : ''} until permanent ban</Text>
          )}
        </View>

        {/* Strike system */}
        <Text style={styles.sectionLabel}>STRIKE SYSTEM</Text>
        <View style={styles.rulesCard}>
          {STRIKE_RULES.map((rule, i) => (
            <View key={i} style={[styles.ruleRow, i < STRIKE_RULES.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
              <View style={[styles.ruleIcon, { backgroundColor: rule.color + '18' }]}>
                <Ionicons name={rule.icon} size={18} color={rule.color} />
              </View>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleStrikes}>{rule.strikes} Strike{rule.strikes > 1 ? 's' : ''}</Text>
                <Text style={styles.ruleConsequence}>{rule.consequence}</Text>
              </View>
              {strikeCount >= rule.strikes && (
                <View style={[styles.ruleActive, { backgroundColor: rule.color + '18', borderColor: rule.color }]}>
                  <Text style={[styles.ruleActiveText, { color: rule.color }]}>REACHED</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Strike history */}
        <Text style={styles.sectionLabel}>YOUR STRIKE HISTORY</Text>
        {STRIKE_HISTORY.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={48} color={COLORS.green} />
            <Text style={styles.emptyText}>No strikes on your account</Text>
          </View>
        ) : STRIKE_HISTORY.map((s) => (
          <View key={s.id} style={styles.strikeRow}>
            <View style={styles.strikeIconWrap}>
              <Ionicons name="warning" size={18} color={COLORS.gold} />
            </View>
            <View style={styles.strikeInfo}>
              <Text style={styles.strikeReason}>{s.reason}</Text>
              <Text style={styles.strikeDate}>Issued: {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              {s.expiry && <Text style={styles.strikeExpiry}>Expires: {new Date(s.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            </View>
            <View style={[styles.strikeBadge, { backgroundColor: s.status === 'active' ? COLORS.red + '18' : COLORS.gray3 }]}>
              <Text style={[styles.strikeBadgeText, { color: s.status === 'active' ? COLORS.red : COLORS.gray }]}>
                {s.status === 'active' ? 'ACTIVE' : 'EXPIRED'}
              </Text>
            </View>
          </View>
        ))}

        {/* Appeal */}
        <View style={styles.appealCard}>
          <Ionicons name="chatbubble-outline" size={20} color={COLORS.blue} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.appealTitle}>Dispute a Strike</Text>
            <Text style={styles.appealDesc}>If you believe a strike was issued in error, contact our moderation team.</Text>
          </View>
          <TouchableOpacity style={styles.appealBtn}>
            <Text style={styles.appealBtnText}>Contact</Text>
          </TouchableOpacity>
        </View>

        {/* Rules */}
        <View style={styles.communityCard}>
          <Text style={styles.communityTitle}>Community Guidelines</Text>
          <Text style={styles.communityText}>Strikes are issued for violations including: inappropriate content, harassment, spam, fake gameplay, and IP violations. Strikes expire after 90 days unless they result in suspension.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  meterCard: { margin: 14, padding: 20, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 0.5, alignItems: 'center' },
  meterTitle: { fontSize: 12, color: COLORS.gray, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  strikeCircles: { flexDirection: 'row', marginBottom: 12 },
  strikeCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: COLORS.gray3, marginHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  meterCount: { fontSize: 22, fontWeight: '900', marginBottom: 6 },
  meterStatus: { fontSize: 13, color: COLORS.gray, textAlign: 'center' },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10 },
  rulesCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  ruleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  ruleInfo: { flex: 1 },
  ruleStrikes: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  ruleConsequence: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  ruleActive: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 0.5 },
  ruleActiveText: { fontSize: 9, fontWeight: '800' },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: COLORS.gray, marginTop: 12 },
  strikeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  strikeIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.gold + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  strikeInfo: { flex: 1 },
  strikeReason: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  strikeDate: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  strikeExpiry: { fontSize: 11, color: COLORS.gold, marginTop: 1 },
  strikeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  strikeBadgeText: { fontSize: 9, fontWeight: '800' },
  appealCard: { flexDirection: 'row', alignItems: 'center', margin: 14, padding: 14, backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.blue + '40' },
  appealTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  appealDesc: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  appealBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: COLORS.blue, borderRadius: 14 },
  appealBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.dark },
  communityCard: { margin: 14, padding: 14, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  communityTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white, marginBottom: 8 },
  communityText: { fontSize: 12, color: COLORS.gray, lineHeight: 18 },
});
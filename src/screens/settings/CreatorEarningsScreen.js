import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';

// Taux de conversion Thanks → cash (exemple ; à ajuster selon ton business)
const THANKS_VALUE_USD = 0.05; // 1 Thanks = 0.05 $ pour le créateur
const THANKS_COST_POINTS = 5;   // coûte 5 GA Points à l'envoyeur

export default function CreatorEarningsScreen({ navigation }) {
  const { userProfile } = useAuthStore();
  const thanksReceived = userProfile?.thanksReceived || 0;
  const estimatedUSD = (thanksReceived * THANKS_VALUE_USD).toFixed(2);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Earnings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Hero earnings */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Your estimated earnings</Text>
          <Text style={styles.heroAmount}>${estimatedUSD}</Text>
          <View style={styles.heroSub}>
            <Ionicons name="heart" size={14} color={'#7C4DFF'} />
            <Text style={styles.heroSubText}> {thanksReceived.toLocaleString()} Thanks received</Text>
          </View>
        </View>

        {/* Comment ça marche */}
        <Text style={styles.sectionLabel}>HOW YOU EARN MONEY</Text>
        <View style={styles.card}>
          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.stepTitle}>Create great content</Text>
              <Text style={styles.stepDesc}>Post tips, tutorials and gaming clips your fans love.</Text>
            </View>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.stepTitle}>Fans send you Thanks 💜</Text>
              <Text style={styles.stepDesc}>Each Thanks costs your fans {THANKS_COST_POINTS} GA Points and supports you directly.</Text>
            </View>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.stepTitle}>Fans subscribe to your Fanbase 🔒</Text>
              <Text style={styles.stepDesc}>Earn a recurring monthly revenue share from every fan subscribed to your exclusive content.</Text>
            </View>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>4</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.stepTitle}>Thanks & subs become real money</Text>
              <Text style={styles.stepDesc}>Each Thanks is worth ${THANKS_VALUE_USD.toFixed(2)}, plus your share of Fanbase subscriptions.</Text>
            </View>
          </View>
          <View style={[styles.stepRow, { borderBottomWidth: 0 }]}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>5</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.stepTitle}>Withdraw your earnings</Text>
              <Text style={styles.stepDesc}>Once you reach the payout threshold, cash out to your account.</Text>
            </View>
          </View>
        </View>

        {/* Sources de revenus */}
        <Text style={styles.sectionLabel}>YOUR REVENUE SOURCES</Text>
        <View style={styles.compareRow}>
          <View style={[styles.compareCard, { borderColor: '#7C4DFF60' }]}>
            <Ionicons name="heart" size={24} color={'#7C4DFF'} />
            <Text style={styles.compareTitle}>Thanks</Text>
            <Text style={styles.compareDesc}>One-time tips from fans on your clips and tips.</Text>
            <View style={[styles.compareTag, { backgroundColor: COLORS.green }]}>
              <Text style={[styles.compareTagText, { color: COLORS.black }]}>Real money</Text>
            </View>
          </View>
          <View style={[styles.compareCard, { borderColor: '#00C85360' }]}>
            <Ionicons name="lock-open" size={24} color={'#00C853'} />
            <Text style={styles.compareTitle}>Fanbase Subs</Text>
            <Text style={styles.compareDesc}>Recurring monthly income from your subscribers.</Text>
            <View style={[styles.compareTag, { backgroundColor: COLORS.green }]}>
              <Text style={[styles.compareTagText, { color: COLORS.black }]}>Real money</Text>
            </View>
          </View>
        </View>

        {/* GA Points clarification */}
        <Text style={styles.sectionLabel}>ABOUT GA POINTS</Text>
        <View style={styles.noteCard}>
          <Ionicons name="star" size={18} color={COLORS.gold} />
          <Text style={styles.noteText}>
            GA Points are earned from clips, GGs and followers, and used in the Shop for frames & cosmetics. They are NOT convertible to cash — only Thanks and Fanbase subscriptions generate real earnings.
          </Text>
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.blue} />
          <Text style={styles.noteText}>
            As a Creator, you cannot send Thanks yourself — this keeps the rewards economy fair and prevents abuse.
          </Text>
        </View>

        <View style={{ marginHorizontal: 16, marginBottom: 4, backgroundColor: 'rgba(201,168,76,0.12)', borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gold + '50', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18 }}>🚀</Text>
          <Text style={{ color: COLORS.gold, fontSize: 13, fontWeight: '700', flex: 1 }}>Earnings and withdrawals can't be managed here.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  hero: { alignItems: 'center', padding: 28, backgroundColor: '#0d0820' },
  heroLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 6 },
  heroAmount: { fontSize: 44, fontWeight: '900', color: COLORS.green },
  heroSub: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  heroSubText: { fontSize: 13, color: COLORS.gray },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 22, paddingBottom: 10 },
  card: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, padding: 8, borderWidth: 0.5, borderColor: COLORS.gray3 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '900', color: COLORS.black },
  stepTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  stepDesc: { fontSize: 12, color: COLORS.gray, marginTop: 3, lineHeight: 17 },
  compareRow: { flexDirection: 'row', marginHorizontal: 14, gap: 10 },
  compareCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: 'center' },
  compareTitle: { fontSize: 15, fontWeight: '800', color: COLORS.white, marginTop: 8 },
  compareDesc: { fontSize: 11, color: COLORS.gray, textAlign: 'center', marginTop: 6, lineHeight: 16, minHeight: 64 },
  compareTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  compareTagText: { fontSize: 10, fontWeight: '800', color: COLORS.white },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 14, marginTop: 16, backgroundColor: COLORS.blue + '12', borderRadius: 12, padding: 14 },
  noteText: { flex: 1, fontSize: 12, color: COLORS.gray, marginLeft: 10, lineHeight: 17 },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginTop: 24, backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 16 },
  withdrawBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
});

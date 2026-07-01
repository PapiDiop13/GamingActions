/**
 * EarningsScreen.js — Écran des gains pour les créateurs
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, TextInput, Modal, TouchableWithoutFeedback,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  doc, getDoc, collection, query, where, orderBy,
  getDocs, addDoc, serverTimestamp, updateDoc, runTransaction,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';

const MIN_WITHDRAWAL = 25;
const STORE_FEE = 0.30;
const CREATOR_SHARE = 0.70;
const FANBASE_PRICE = 3.99;

function StatCard({ label, value, color = COLORS.white, icon }) {
  return (
    <View style={st.statCard}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[st.statValue, { color }]}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

function WithdrawModal({ visible, onClose, balance, onSubmit }) {
  const [method, setMethod] = useState('paypal');
  const [info, setInfo] = useState('');
  const [amount, setAmount] = useState(String(Math.floor(balance)));

  const submit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt < MIN_WITHDRAWAL) { Alert.alert('Minimum', `Minimum withdrawal is CA$${MIN_WITHDRAWAL}`); return; }
    if (amt > balance) { Alert.alert('Insufficient balance', `Your balance is CA$${balance.toFixed(2)}`); return; }
    if (!info.trim()) { Alert.alert('Missing', `Please enter your ${method === 'paypal' ? 'PayPal email' : 'Interac email or phone'}`); return; }
    onSubmit({ amount: amt, method, paymentInfo: info.trim() });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={st.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={st.modalCard}>
              <Text style={st.modalTitle}>Request Withdrawal</Text>
              <Text style={st.modalSub}>Available: CA${balance.toFixed(2)} · Min: CA${MIN_WITHDRAWAL}</Text>

              <Text style={st.inputLabel}>AMOUNT (CAD)</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={st.input} placeholderTextColor={COLORS.gray} />

              <Text style={st.inputLabel}>PAYMENT METHOD</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {['paypal', 'interac'].map(m => (
                  <TouchableOpacity key={m} onPress={() => setMethod(m)} style={[st.methodBtn, method === m && st.methodBtnActive]}>
                    <Text style={[st.methodBtnText, method === m && { color: COLORS.gold }]}>{m === 'paypal' ? 'PayPal' : 'Interac'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.inputLabel}>{method === 'paypal' ? 'PAYPAL EMAIL' : 'INTERAC EMAIL OR PHONE'}</Text>
              <TextInput value={info} onChangeText={setInfo} placeholder={method === 'paypal' ? 'your@paypal.com' : 'email or +1 xxx xxx xxxx'} placeholderTextColor={COLORS.gray} style={st.input} autoCapitalize="none" />

              <View style={st.modalNote}>
                <Ionicons name="information-circle-outline" size={14} color={COLORS.blue} />
                <Text style={st.modalNoteText}>Withdrawals processed manually within 5–7 business days.</Text>
              </View>

              <TouchableOpacity onPress={() => { onClose(); Alert.alert('🚀 Bientôt disponible', 'Le retrait sera activé très prochainement.'); }} style={st.submitBtn}>
                <Text style={st.submitBtnText}>Bientôt disponible 🚀</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: COLORS.gray, fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default function EarningsScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [earnings, setEarnings] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const isCreator = ['creator', 'gameconic'].includes(userProfile?.accountType);

  useEffect(() => { if (user?.uid) loadData(); }, [user?.uid]);

  const loadData = async () => {
    setLoading(true);
    try {
      const eSnap = await getDoc(doc(db, 'creator_earnings', user.uid));
      setEarnings(eSnap.exists() ? eSnap.data() : { totalEarned: 0, totalPaid: 0, balance: 0, subscriberCount: 0 });
      const wSnap = await getDocs(query(collection(db, 'withdrawal_requests'), where('creatorId', '==', user.uid), orderBy('requestedAt', 'desc')));
      setWithdrawals(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.log('Earnings load:', e.message); }
    setLoading(false);
  };

  const handleWithdraw = async ({ amount, method, paymentInfo }) => {
    try {
      const earningsRef = doc(db, 'creator_earnings', user.uid);
      const withdrawalRef = doc(collection(db, 'withdrawal_requests'));
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(earningsRef);
        const currentBalance = snap.data()?.balance ?? 0;
        if (currentBalance < amount) throw new Error('insufficient_balance');
        const currentPending = snap.data()?.pendingWithdrawal ?? 0;
        transaction.update(earningsRef, {
          balance: currentBalance - amount,
          pendingWithdrawal: currentPending + amount,
        });
        transaction.set(withdrawalRef, {
          creatorId: user.uid, creatorUsername: userProfile?.username || '',
          amount, method, paymentInfo, status: 'pending',
          requestedAt: serverTimestamp(), processedAt: null, note: '',
        });
      });
      setShowModal(false);
      Alert.alert('✅ Request sent!', "Your withdrawal request has been submitted. You'll receive payment within 5–7 business days and we'll notify you when it's sent.");
      loadData();
    } catch (e) {
      if (e.message === 'insufficient_balance') Alert.alert('Insufficient balance', 'Your current balance is too low for this withdrawal.');
      else Alert.alert('Error', 'Failed to submit. Please try again.');
    }
  };

  const balance = earnings?.balance || 0;
  const totalEarned = earnings?.totalEarned || 0;
  const totalPaid = earnings?.totalPaid || 0;
  const subscribers = earnings?.subscriberCount || 0;
  const monthlyRevenue = subscribers * FANBASE_PRICE * CREATOR_SHARE;

  const statusColor = (s) => s === 'paid' ? COLORS.green : s === 'rejected' ? COLORS.red : COLORS.gold;
  const statusLabel = (s) => s === 'paid' ? '✅ Paid' : s === 'rejected' ? '❌ Rejected' : '🟡 Pending';

  return (
    <View style={st.container}>
      <StatusBar style="light" />
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>My Earnings</Text>
        <TouchableOpacity onPress={loadData}><Ionicons name="refresh-outline" size={20} color={COLORS.gray} /></TouchableOpacity>
      </View>

      {!isCreator ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Ionicons name="lock-closed-outline" size={48} color={COLORS.gray} />
          <Text style={{ color: COLORS.gray, fontSize: 15, textAlign: 'center', marginTop: 14 }}>Earnings are available for approved creators only.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Coming Soon Banner */}
          <View style={{ margin: 14, backgroundColor: 'rgba(201,168,76,0.12)', borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gold + '50', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 20 }}>🚀</Text>
            <Text style={{ color: COLORS.gold, fontSize: 13, fontWeight: '700', flex: 1 }}>Le retrait des gains sera disponible très prochainement. Tes gains sont enregistrés !</Text>
          </View>

          {/* Balance */}
          <View style={st.balanceCard}>
            <Text style={st.balanceLabel}>Available Balance</Text>
            <Text style={st.balanceValue}>CA${balance.toFixed(2)}</Text>
            {earnings?.pendingWithdrawal > 0 && <Text style={{ color: COLORS.gold, fontSize: 12, marginTop: 4 }}>CA${earnings.pendingWithdrawal.toFixed(2)} pending</Text>}
            <View style={st.infoNote}>
              <Ionicons name="information-circle-outline" size={15} color={COLORS.gray} />
              <Text style={st.infoNoteText}>Earnings and withdrawals can't be managed here.</Text>
            </View>
          </View>

          {/* Stats */}
          <Text style={st.sectionLabel}>OVERVIEW</Text>
          <View style={st.statsRow}>
            <StatCard icon="people-outline"           label="Subscribers"   value={subscribers}                    color={COLORS.blue} />
            <StatCard icon="cash-outline"             label="Total Earned"  value={`CA$${totalEarned.toFixed(2)}`} color={COLORS.green} />
            <StatCard icon="checkmark-circle-outline" label="Total Paid"    value={`CA$${totalPaid.toFixed(2)}`}   color={COLORS.gold} />
          </View>

          {/* Revenue breakdown */}
          <Text style={st.sectionLabel}>REVENUE BREAKDOWN</Text>
          <View style={st.infoCard}>
            {[
              { label: 'Fanbase price',              value: `CA$${FANBASE_PRICE}/month/subscriber` },
              { label: 'Store fee (Apple/Google)',    value: `30% = CA$${(FANBASE_PRICE * STORE_FEE).toFixed(2)}` },
              { label: 'Your share (70%)',            value: `CA$${(FANBASE_PRICE * CREATOR_SHARE).toFixed(2)}/subscriber/month` },
              { label: 'Estimated monthly revenue',  value: `CA$${monthlyRevenue.toFixed(2)} (${subscribers} subs)` },
            ].map((row, i, arr) => (
              <View key={i} style={[st.infoRow, i < arr.length-1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
                <Text style={st.infoLabel}>{row.label}</Text>
                <Text style={st.infoValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Terms */}
          <Text style={st.sectionLabel}>CONDITIONS & RULES</Text>
          <View style={st.condCard}>
            <Text style={st.condTitle}>📋 Creator Program Terms</Text>
            {[
              'You receive 70% of each fanbase subscription after store fees.',
              'Withdrawals are processed manually within 5–7 business days.',
              'Minimum withdrawal: CA$25 via PayPal or Interac e-Transfer.',
              'Fanbase content must respect Gaming Actions community guidelines.',
              'Subscriber counts updated in real-time.',
              'Gaming Actions may suspend earnings for policy violations.',
              '⚠️ Any manipulation of subscriber counts or earnings will result in permanent ban and potential legal action.',
            ].map((c, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Text style={{ color: COLORS.gold, marginRight: 8, fontSize: 12 }}>•</Text>
                <Text style={st.condText}>{c}</Text>
              </View>
            ))}
          </View>

          {/* Withdrawal history */}
          <Text style={st.sectionLabel}>WITHDRAWAL HISTORY</Text>
          {withdrawals.length === 0 ? (
            <View style={st.emptyCard}><Text style={{ color: COLORS.gray, fontSize: 13 }}>No withdrawals yet.</Text></View>
          ) : (
            <View style={st.infoCard}>
              {withdrawals.map((w, i) => (
                <View key={w.id} style={[st.withdrawRow, i < withdrawals.length-1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '700' }}>CA${w.amount?.toFixed(2)}</Text>
                    <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 2 }}>{w.method?.toUpperCase()} · {w.paymentInfo}</Text>
                    {w.requestedAt?.toDate && <Text style={{ color: COLORS.gray, fontSize: 10, marginTop: 2 }}>{w.requestedAt.toDate().toLocaleDateString()}</Text>}
                    {w.note ? <Text style={{ color: COLORS.gray, fontSize: 11, fontStyle: 'italic', marginTop: 3 }}>{w.note}</Text> : null}
                  </View>
                  <Text style={[st.withdrawStatus, { color: statusColor(w.status) }]}>{statusLabel(w.status)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <WithdrawModal visible={showModal} onClose={() => setShowModal(false)} balance={balance} onSubmit={handleWithdraw} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  balanceCard: { margin: 14, backgroundColor: COLORS.card, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  balanceLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '600', letterSpacing: 0.5 },
  balanceValue: { fontSize: 40, fontWeight: '900', color: COLORS.gold, marginVertical: 6 },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 14, gap: 8 },
  withdrawBtnText: { fontSize: 14, fontWeight: '900', color: COLORS.black },
  minNote: { fontSize: 11, color: COLORS.gray, marginTop: 8, textAlign: 'center' },
  infoNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(150,150,170,0.10)' },
  infoNoteText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 16 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  statsRow: { flexDirection: 'row', marginHorizontal: 14, gap: 10 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3 },
  statValue: { fontSize: 16, fontWeight: '900', marginTop: 6 },
  statLabel: { fontSize: 10, color: COLORS.gray, marginTop: 3, textAlign: 'center' },
  infoCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 13, flexWrap: 'wrap', gap: 4 },
  infoLabel: { fontSize: 12, color: COLORS.gray, flex: 1 },
  infoValue: { fontSize: 12, color: COLORS.white, fontWeight: '600', textAlign: 'right' },
  condCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: COLORS.gray3 },
  condTitle: { fontSize: 13, fontWeight: '800', color: COLORS.white, marginBottom: 12 },
  condText: { fontSize: 11, color: COLORS.gray, lineHeight: 16, flex: 1 },
  emptyCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3 },
  withdrawRow: { flexDirection: 'row', alignItems: 'center', padding: 13 },
  withdrawStatus: { fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  modalSub: { fontSize: 12, color: COLORS.gray, marginBottom: 20 },
  inputLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  input: { backgroundColor: COLORS.dark, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 16 },
  methodBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.gray3, alignItems: 'center', backgroundColor: COLORS.dark },
  methodBtnActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.08)' },
  methodBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.gray },
  modalNote: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: 10, padding: 11, marginBottom: 16, gap: 8 },
  modalNoteText: { fontSize: 11, color: COLORS.gray, flex: 1, lineHeight: 16 },
  submitBtn: { backgroundColor: COLORS.gold, borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  submitBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black },
});

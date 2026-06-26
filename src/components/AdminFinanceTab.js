/**
 * AdminFinanceTab.js — Section Finance dans l'admin
 *
 * Affiche :
 * - Revenus totaux (Legendary + Fanbase) avec filtres date
 * - Ma part vs part créateurs
 * - Net après frais Apple/Google (30%)
 * - Liste scrollable des abonnements actifs
 * - Gestion withdrawals (approve/pay/reject)
 * - Gestion gift card requests
 * - Statistiques détaillées
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, Modal, TouchableWithoutFeedback, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, getDocs,
  doc, updateDoc, serverTimestamp, limit, getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLORS } from '../constants/colors';

const STORE_FEE    = 0.30;
const CREATOR_SHARE = 0.70;
const LEGENDARY_PRICE_CAD = 3.99;
const FANBASE_PRICE_CAD   = 4.99;

const PERIODS = [
  { id: 'today',   label: 'Today' },
  { id: 'week',    label: 'Week' },
  { id: 'month',   label: 'Month' },
  { id: 'year',    label: 'Year' },
  { id: 'all',     label: 'All time' },
];

function getDateFilter(period) {
  const now = new Date();
  if (period === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d; }
  if (period === 'week')  { const d = new Date(now); d.setDate(d.getDate()-7); return d; }
  if (period === 'month') { const d = new Date(now); d.setMonth(d.getMonth()-1); return d; }
  if (period === 'year')  { const d = new Date(now); d.setFullYear(d.getFullYear()-1); return d; }
  return null;
}

function StatBox({ label, value, sub, color = COLORS.white, icon }) {
  return (
    <View style={af.statBox}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[af.statValue, { color }]}>{value}</Text>
      <Text style={af.statLabel}>{label}</Text>
      {sub ? <Text style={af.statSub}>{sub}</Text> : null}
    </View>
  );
}

function WithdrawItem({ item, onAction }) {
  const statusColor = item.status === 'paid' ? COLORS.green : item.status === 'rejected' ? COLORS.red : COLORS.gold;
  return (
    <View style={af.withdrawItem}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '700' }}>
          {item.creatorUsername} — CA${item.amount?.toFixed(2)}
        </Text>
        <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 2 }}>
          {item.method?.toUpperCase()} → {item.paymentInfo}
        </Text>
        {item.requestedAt?.toDate && (
          <Text style={{ color: COLORS.gray, fontSize: 10, marginTop: 2 }}>
            {item.requestedAt.toDate().toLocaleDateString()}
          </Text>
        )}
        {item.note ? <Text style={{ color: COLORS.gold, fontSize: 11, marginTop: 3 }}>{item.note}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>
          {item.status === 'paid' ? '✅ Paid' : item.status === 'rejected' ? '❌ Rejected' : '🟡 Pending'}
        </Text>
        {item.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity onPress={() => onAction(item, 'paid')} style={[af.actionBtn, { borderColor: COLORS.green }]}>
              <Text style={{ color: COLORS.green, fontSize: 10, fontWeight: '800' }}>PAY</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onAction(item, 'rejected')} style={[af.actionBtn, { borderColor: COLORS.red }]}>
              <Text style={{ color: COLORS.red, fontSize: 10, fontWeight: '800' }}>REJECT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function GiftCardItem({ item, onAction }) {
  const statusColor = item.status === 'sent' ? COLORS.green : item.status === 'rejected' ? COLORS.red : COLORS.gold;
  return (
    <View style={af.withdrawItem}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '700' }}>
          {item.username} — CA${item.amount} {item.platform?.toUpperCase()}
        </Text>
        <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 2 }}>Email: {item.email}</Text>
        <Text style={{ color: COLORS.gray, fontSize: 11 }}>{item.pointsCost?.toLocaleString()} pts déduites</Text>
        {item.requestedAt?.toDate && (
          <Text style={{ color: COLORS.gray, fontSize: 10, marginTop: 2 }}>{item.requestedAt.toDate().toLocaleDateString()}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>
          {item.status === 'sent' ? '✅ Sent' : item.status === 'rejected' ? '❌ Rejected' : '🟡 Pending'}
        </Text>
        {item.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity onPress={() => onAction(item, 'sent')} style={[af.actionBtn, { borderColor: COLORS.green }]}>
              <Text style={{ color: COLORS.green, fontSize: 10, fontWeight: '800' }}>SENT</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onAction(item, 'rejected')} style={[af.actionBtn, { borderColor: COLORS.red }]}>
              <Text style={{ color: COLORS.red, fontSize: 10, fontWeight: '800' }}>REJECT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

export default function AdminFinanceTab() {
  const [period, setPeriod]           = useState('month');
  const [subscriptions, setSubs]      = useState([]);
  const [fanbaseSubs, setFanbaseSubs] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [giftCards, setGiftCards]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [section, setSection]         = useState('overview'); // overview | withdrawals | giftcards | subs

  useEffect(() => { loadAll(); }, [period]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const dateFilter = getDateFilter(period);

      // Legendary subscriptions
      const subsSnap = await getDocs(query(collection(db, 'subscriptions'), where('status', '==', 'active')));
      setSubs(subsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Fanbase subscriptions
      const fbSnap = await getDocs(query(collection(db, 'fanbase_subscriptions'), where('status', '==', 'active')));
      setFanbaseSubs(fbSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Withdrawals
      const wSnap = await getDocs(query(collection(db, 'withdrawal_requests'), orderBy('requestedAt', 'desc'), limit(100)));
      setWithdrawals(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Gift card requests
      const gcSnap = await getDocs(query(collection(db, 'gift_card_requests'), orderBy('requestedAt', 'desc'), limit(100)));
      setGiftCards(gcSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.log('Finance load:', e.message); }
    setLoading(false);
  };

  const handleWithdrawal = (item, action) => {
    Alert.alert(
      action === 'paid' ? 'Mark as Paid?' : 'Reject?',
      action === 'paid'
        ? `Confirm CA$${item.amount?.toFixed(2)} sent to ${item.paymentInfo} via ${item.method?.toUpperCase()}?`
        : 'Reject this withdrawal request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'paid' ? 'Confirm Paid ✅' : 'Reject ❌',
          style: action === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'withdrawal_requests', item.id), {
                status: action, processedAt: serverTimestamp(),
                note: action === 'paid' ? `Paid via ${item.method?.toUpperCase()} on ${new Date().toLocaleDateString()}` : 'Rejected by admin',
              });
              if (action === 'paid') {
                // Update creator earnings
                await updateDoc(doc(db, 'creator_earnings', item.creatorId), {
                  totalPaid: ((await getDoc(doc(db, 'creator_earnings', item.creatorId))).data()?.totalPaid || 0) + item.amount,
                  pendingWithdrawal: Math.max(0, ((await getDoc(doc(db, 'creator_earnings', item.creatorId))).data()?.pendingWithdrawal || 0) - item.amount),
                });
              } else {
                // Refund balance if rejected
                const eDoc = await getDoc(doc(db, 'creator_earnings', item.creatorId));
                await updateDoc(doc(db, 'creator_earnings', item.creatorId), {
                  balance: (eDoc.data()?.balance || 0) + item.amount,
                  pendingWithdrawal: Math.max(0, (eDoc.data()?.pendingWithdrawal || 0) - item.amount),
                });
              }
              // Notify creator
              const { addDoc, collection: col } = require('firebase/firestore');
              await addDoc(col(db, 'notifications'), {
                userId: item.creatorId,
                type: action === 'paid' ? 'withdrawal_paid' : 'withdrawal_rejected',
                text: action === 'paid'
                  ? `Your withdrawal of CA$${item.amount?.toFixed(2)} has been sent to ${item.paymentInfo} 💰`
                  : `Your withdrawal request of CA$${item.amount?.toFixed(2)} was rejected. Contact support for details.`,
                read: false,
                createdAt: serverTimestamp(),
              });
              loadAll();
              Alert.alert('✅ Done', action === 'paid' ? 'Marked as paid and creator notified.' : 'Rejected and balance refunded.');
            } catch (e) { Alert.alert('Error', e.message); }
          },
        },
      ]
    );
  };

  const handleGiftCard = (item, action) => {
    Alert.alert(
      action === 'sent' ? 'Mark as Sent?' : 'Reject?',
      action === 'sent'
        ? `Confirm CA$${item.amount} ${item.platform?.toUpperCase()} code sent to ${item.email}?`
        : `Reject and refund ${item.pointsCost?.toLocaleString()} pts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'sent' ? 'Confirm Sent ✅' : 'Reject & Refund ❌',
          style: action === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'gift_card_requests', item.id), {
                status: action, processedAt: serverTimestamp(),
                adminNote: action === 'sent' ? `Sent on ${new Date().toLocaleDateString()}` : 'Rejected by admin — points refunded',
              });
              if (action === 'rejected') {
                // Refund GA Points
                const uDoc = await getDoc(doc(db, 'users', item.userId));
                await updateDoc(doc(db, 'users', item.userId), {
                  gaPoints: (uDoc.data()?.gaPoints || 0) + item.pointsCost,
                });
              }
              // Notify user
              const { addDoc, collection: col } = require('firebase/firestore');
              await addDoc(col(db, 'notifications'), {
                userId: item.userId,
                type: action === 'sent' ? 'giftcard_sent' : 'giftcard_rejected',
                text: action === 'sent'
                  ? `Your CA$${item.amount} ${item.platform?.toUpperCase()} gift card code has been sent to ${item.email} 🎁`
                  : `Your gift card request was rejected. Your ${item.pointsCost?.toLocaleString()} GA Points have been refunded.`,
                read: false,
                createdAt: serverTimestamp(),
              });
              loadAll();
              Alert.alert('✅ Done');
            } catch (e) { Alert.alert('Error', e.message); }
          },
        },
      ]
    );
  };

  // ── Revenue calculations ──────────────────────────────────────────────────
  const legCount      = subscriptions.filter(s => !s.isTest).length;
  const fbCount       = fanbaseSubs.filter(s => !s.isTest).length;
  const legGrossCAD   = legCount * LEGENDARY_PRICE_CAD;
  const fbGrossCAD    = fbCount * FANBASE_PRICE_CAD;
  const totalGross    = legGrossCAD + fbGrossCAD;
  const totalNet      = totalGross * (1 - STORE_FEE);
  const creatorsPay   = fbGrossCAD * (1 - STORE_FEE) * CREATOR_SHARE;
  const myShare       = totalNet - creatorsPay;

  const pendingW      = withdrawals.filter(w => w.status === 'pending').length;
  const pendingGC     = giftCards.filter(g => g.status === 'pending').length;

  const SECTIONS = [
    { id: 'overview',    label: 'Overview',    icon: 'bar-chart-outline' },
    { id: 'withdrawals', label: `Withdrawals ${pendingW > 0 ? `(${pendingW})` : ''}`, icon: 'cash-outline' },
    { id: 'giftcards',   label: `Gift Cards ${pendingGC > 0 ? `(${pendingGC})` : ''}`, icon: 'gift-outline' },
    { id: 'subs',        label: 'Subscribers', icon: 'people-outline' },
  ];

  return (
    <View style={{ flex: 1 }}>

      {/* Period filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={af.periodBar} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}>
        {PERIODS.map(p => (
          <TouchableOpacity key={p.id} onPress={() => setPeriod(p.id)} style={[af.periodBtn, period === p.id && af.periodBtnActive]}>
            <Text style={[af.periodBtnText, period === p.id && { color: COLORS.gold }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Section tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 8, alignItems: 'center' }}>
        {SECTIONS.map(s => (
          <TouchableOpacity key={s.id} onPress={() => setSection(s.id)} style={[af.sectionBtn, section === s.id && af.sectionBtnActive]}>
            <Ionicons name={s.icon} size={12} color={section === s.id ? COLORS.gold : COLORS.gray} />
            <Text style={[af.sectionBtnText, section === s.id && { color: COLORS.gold }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── OVERVIEW ── */}
      {section === 'overview' && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>

          <Text style={af.subTitle}>💰 Revenue Summary ({PERIODS.find(p=>p.id===period)?.label})</Text>

          <View style={af.statsGrid}>
            <StatBox icon="star-outline"     label="Legendary subs"    value={legCount}           color={COLORS.gold}   />
            <StatBox icon="people-outline"   label="Fanbase subs"      value={fbCount}            color={COLORS.purple} />
            <StatBox icon="cash-outline"     label="Gross revenue"     value={`CA$${totalGross.toFixed(2)}`}   color={COLORS.white}  />
            <StatBox icon="remove-circle-outline" label="Store fees (30%)" value={`-CA$${(totalGross*STORE_FEE).toFixed(2)}`} color={COLORS.red} />
            <StatBox icon="checkmark-circle-outline" label="Net revenue" value={`CA$${totalNet.toFixed(2)}`}    color={COLORS.green}  />
            <StatBox icon="person-outline"   label="My share"          value={`CA$${myShare.toFixed(2)}`}      color={COLORS.gold}   />
            <StatBox icon="wallet-outline"   label="Creators share"    value={`CA$${creatorsPay.toFixed(2)}`}  color={COLORS.blue}   />
          </View>

          <View style={af.breakdownCard}>
            <Text style={af.breakdownTitle}>Breakdown</Text>
            {[
              { label: 'Legendary subscriptions',   value: `${legCount} × CA$${LEGENDARY_PRICE_CAD} = CA$${legGrossCAD.toFixed(2)}` },
              { label: 'Fanbase subscriptions',      value: `${fbCount} × CA$${FANBASE_PRICE_CAD} = CA$${fbGrossCAD.toFixed(2)}` },
              { label: 'Store fees (Apple/Google)',  value: `-CA$${(totalGross * STORE_FEE).toFixed(2)} (30%)` },
              { label: 'Net after fees',             value: `CA$${totalNet.toFixed(2)}` },
              { label: 'Creators (70% of fanbase net)', value: `-CA$${creatorsPay.toFixed(2)}` },
              { label: '✅ MY NET SHARE',            value: `CA$${myShare.toFixed(2)}` },
            ].map((row, i, arr) => (
              <View key={i} style={[af.breakdownRow, i < arr.length-1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
                <Text style={af.breakdownLabel}>{row.label}</Text>
                <Text style={[af.breakdownValue, row.label.includes('MY NET') && { color: COLORS.gold, fontWeight: '900' }]}>{row.value}</Text>
              </View>
            ))}
          </View>

          <View style={af.alertsRow}>
            {pendingW > 0 && (
              <TouchableOpacity onPress={() => setSection('withdrawals')} style={af.alertChip}>
                <Ionicons name="cash-outline" size={14} color={COLORS.gold} />
                <Text style={af.alertChipText}>{pendingW} pending withdrawal{pendingW > 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            )}
            {pendingGC > 0 && (
              <TouchableOpacity onPress={() => setSection('giftcards')} style={af.alertChip}>
                <Ionicons name="gift-outline" size={14} color={COLORS.blue} />
                <Text style={[af.alertChipText, { color: COLORS.blue }]}>{pendingGC} gift card request{pendingGC > 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── WITHDRAWALS ── */}
      {section === 'withdrawals' && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
          <Text style={af.subTitle}>💸 Withdrawal Requests</Text>
          {['pending', 'paid', 'rejected'].map(status => {
            const items = withdrawals.filter(w => w.status === status);
            if (items.length === 0) return null;
            return (
              <View key={status}>
                <Text style={af.statusHeader}>
                  {status === 'pending' ? '🟡 Pending' : status === 'paid' ? '✅ Paid' : '❌ Rejected'} ({items.length})
                </Text>
                <View style={af.listCard}>
                  {items.map((item, i) => (
                    <View key={item.id}>
                      <WithdrawItem item={item} onAction={handleWithdrawal} />
                      {i < items.length-1 && <View style={{ height: 0.5, backgroundColor: COLORS.gray3 }} />}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
          {withdrawals.length === 0 && <Text style={{ color: COLORS.gray, textAlign: 'center', marginTop: 30 }}>No withdrawal requests yet.</Text>}
        </ScrollView>
      )}

      {/* ── GIFT CARDS ── */}
      {section === 'giftcards' && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
          <Text style={af.subTitle}>🎁 Gift Card Requests</Text>
          {['pending', 'sent', 'rejected'].map(status => {
            const items = giftCards.filter(g => g.status === status);
            if (items.length === 0) return null;
            return (
              <View key={status}>
                <Text style={af.statusHeader}>
                  {status === 'pending' ? '🟡 Pending' : status === 'sent' ? '✅ Sent' : '❌ Rejected'} ({items.length})
                </Text>
                <View style={af.listCard}>
                  {items.map((item, i) => (
                    <View key={item.id}>
                      <GiftCardItem item={item} onAction={handleGiftCard} />
                      {i < items.length-1 && <View style={{ height: 0.5, backgroundColor: COLORS.gray3 }} />}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
          {giftCards.length === 0 && <Text style={{ color: COLORS.gray, textAlign: 'center', marginTop: 30 }}>No gift card requests yet.</Text>}
        </ScrollView>
      )}

      {/* ── SUBSCRIBERS LIST ── */}
      {section === 'subs' && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
          <Text style={af.subTitle}>⭐ Legendary Subscribers ({legCount})</Text>
          <View style={af.listCard}>
            {subscriptions.filter(s => !s.isTest).map((s, i, arr) => (
              <View key={s.id} style={[af.subRow, i < arr.length-1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '700' }}>{s.userId?.slice(0,12)}...</Text>
                  <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 2 }}>{s.productId} · {s.platform}</Text>
                  {s.currentPeriodEnd?.toDate && (
                    <Text style={{ color: COLORS.gray, fontSize: 10, marginTop: 2 }}>Renews: {s.currentPeriodEnd.toDate().toLocaleDateString()}</Text>
                  )}
                </View>
                <Text style={{ color: COLORS.gold, fontSize: 12, fontWeight: '700' }}>CA${LEGENDARY_PRICE_CAD}</Text>
              </View>
            ))}
            {legCount === 0 && <Text style={{ color: COLORS.gray, padding: 20, textAlign: 'center' }}>No active subscribers yet.</Text>}
          </View>

          <Text style={af.subTitle}>💜 Fanbase Subscribers ({fbCount})</Text>
          <View style={af.listCard}>
            {fanbaseSubs.filter(s => !s.isTest).map((s, i, arr) => (
              <View key={s.id} style={[af.subRow, i < arr.length-1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '700' }}>{s.subscriberId?.slice(0,12)}...</Text>
                  <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 2 }}>→ {s.creatorUsername}</Text>
                  {s.currentPeriodEnd?.toDate && (
                    <Text style={{ color: COLORS.gray, fontSize: 10, marginTop: 2 }}>Renews: {s.currentPeriodEnd.toDate().toLocaleDateString()}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: COLORS.purple, fontSize: 12, fontWeight: '700' }}>CA${FANBASE_PRICE_CAD}</Text>
                  <Text style={{ color: COLORS.gray, fontSize: 10 }}>Creator: CA${(FANBASE_PRICE_CAD*(1-STORE_FEE)*CREATOR_SHARE).toFixed(2)}</Text>
                </View>
              </View>
            ))}
            {fbCount === 0 && <Text style={{ color: COLORS.gray, padding: 20, textAlign: 'center' }}>No fanbase subscribers yet.</Text>}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const af = StyleSheet.create({
  periodBar: { maxHeight: 50, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.gray3, backgroundColor: COLORS.card },
  periodBtnActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.1)' },
  periodBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.gray },
  sectionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 0.5, borderColor: COLORS.gray3, backgroundColor: COLORS.card, gap: 4 },
  sectionBtnActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.08)' },
  sectionBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.gray },
  subTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white, marginBottom: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: { width: '30%', backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3, minWidth: 90 },
  statValue: { fontSize: 14, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  statLabel: { fontSize: 9, color: COLORS.gray, marginTop: 3, textAlign: 'center' },
  statSub: { fontSize: 9, color: COLORS.gray, textAlign: 'center' },
  breakdownCard: { backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  breakdownTitle: { fontSize: 12, fontWeight: '800', color: COLORS.gold, padding: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 11, flexWrap: 'wrap', gap: 4 },
  breakdownLabel: { fontSize: 11, color: COLORS.gray, flex: 1 },
  breakdownValue: { fontSize: 11, color: COLORS.white, fontWeight: '600', textAlign: 'right' },
  alertsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  alertChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: COLORS.gold + '60', gap: 6 },
  alertChipText: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },
  statusHeader: { fontSize: 12, fontWeight: '800', color: COLORS.gray, marginBottom: 6, marginTop: 8 },
  listCard: { backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  withdrawItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 13, gap: 10 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  subRow: { flexDirection: 'row', alignItems: 'center', padding: 13 },
});

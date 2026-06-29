/**
 * GiftCardsScreen.js — Échange de GA Points contre cartes PSN/Xbox/Steam
 *
 * Firestore schema:
 *   gift_card_requests/{docId} {
 *     userId, username, email,
 *     platform: 'psn'|'xbox'|'steam',
 *     amount: 10|25|50|100,
 *     pointsCost, gaPointsBefore, gaPointsAfter,
 *     status: 'pending'|'sent'|'rejected',
 *     requestedAt, processedAt,
 *     codeEmail: string (email pour recevoir le code),
 *     note: string (admin note),
 *     adminNote: string
 *   }
 *
 * Conditions par carte:
 *   $10 → 10,000 pts + 30 clips min + 150 GG reçus min
 *   $25 → 22,000 pts + 75 clips min + 400 GG reçus min
 *   $50 → 40,000 pts + 150 clips min + 800 GG reçus min + top 100
 *   $100 → 75,000 pts + 250 clips min + 1,500 GG reçus min + top 50
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, TextInput, Modal, TouchableWithoutFeedback, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  doc, getDoc, collection, query, where, orderBy,
  getDocs, updateDoc, serverTimestamp, increment, writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';

const CARDS = [
  {
    id: 'card_10',
    amount: 10,
    pointsCost: 10000,
    conditions: { clips: 30, ggReceived: 150, ranking: null },
    platforms: ['psn', 'xbox', 'steam'],
    label: 'CA$10',
    color: '#00439C',
  },
  {
    id: 'card_25',
    amount: 25,
    pointsCost: 22000,
    conditions: { clips: 75, ggReceived: 400, ranking: null },
    platforms: ['psn', 'xbox', 'steam'],
    label: 'CA$25',
    color: '#107C10',
  },
  {
    id: 'card_50',
    amount: 50,
    pointsCost: 40000,
    conditions: { clips: 150, ggReceived: 800, ranking: 100 },
    platforms: ['psn', 'xbox', 'steam'],
    label: 'CA$50',
    color: '#1A9FFF',
  },
  {
    id: 'card_100',
    amount: 100,
    pointsCost: 75000,
    conditions: { clips: 250, ggReceived: 1500, ranking: 50 },
    platforms: ['psn', 'xbox', 'steam'],
    label: 'CA$100',
    color: '#C9A84C',
  },
];

const PLATFORM_LABELS = { psn: 'PlayStation', xbox: 'Xbox', steam: 'Steam' };
const PLATFORM_ICONS = { psn: 'game-controller-outline', xbox: 'game-controller-outline', steam: 'game-controller-outline' };
const PLATFORM_COLORS = { psn: '#00439C', xbox: '#107C10', steam: '#1B2838' };

function CardItem({ card, userStats, gaPoints, onRedeem }) {
  const { clips, ggReceived, ranking } = card.conditions;
  const userClips = userStats?.videoCount || 0;
  const userGG = userStats?.ggReceived || 0;
  const userRank = userStats?.rank || 999;

  const meetsClips = userClips >= clips;
  const meetsGG = userGG >= ggReceived;
  const meetsRanking = !ranking || userRank <= ranking;
  const meetsPoints = gaPoints >= card.pointsCost;
  const eligible = meetsClips && meetsGG && meetsRanking && meetsPoints;

  return (
    <View style={gc.cardItem}>
      <View style={[gc.cardHeader, { backgroundColor: card.color + '20', borderColor: card.color + '60' }]}>
        <Text style={[gc.cardAmount, { color: card.color }]}>{card.label}</Text>
        <Text style={gc.cardPoints}>{card.pointsCost.toLocaleString()} GA Points</Text>
      </View>

      <View style={gc.conditionsWrap}>
        <Text style={gc.condTitle}>Requirements:</Text>
        <CondRow label={`${clips} clips uploaded`}    met={meetsClips}   current={userClips} />
        <CondRow label={`${ggReceived} GGs received`} met={meetsGG}      current={userGG} />
        <CondRow label={`${card.pointsCost.toLocaleString()} GA Points`} met={meetsPoints} current={gaPoints} />
        {ranking && <CondRow label={`Top ${ranking} ranking`} met={meetsRanking} current={`Rank #${userRank}`} />}
      </View>

      {eligible ? (
        <TouchableOpacity onPress={() => onRedeem(card)} style={[gc.redeemBtn, { backgroundColor: card.color }]}>
          <Ionicons name="gift-outline" size={15} color="white" />
          <Text style={gc.redeemBtnText}>Redeem {card.label}</Text>
        </TouchableOpacity>
      ) : (
        <View style={gc.redeemBtnDisabled}>
          <Ionicons name="lock-closed-outline" size={14} color={COLORS.gray} />
          <Text style={gc.redeemBtnDisabledText}>Requirements not met</Text>
        </View>
      )}
    </View>
  );
}

function CondRow({ label, met, current }) {
  return (
    <View style={gc.condRow}>
      <Ionicons name={met ? 'checkmark-circle' : 'close-circle'} size={14} color={met ? COLORS.green : COLORS.red} />
      <Text style={[gc.condLabel, !met && { color: COLORS.gray }]}>{label}</Text>
      {!met && <Text style={gc.condCurrent}>(you: {typeof current === 'number' ? current.toLocaleString() : current})</Text>}
    </View>
  );
}

function RedeemModal({ visible, card, onClose, onConfirm }) {
  const [platform, setPlatform] = useState('psn');
  const [email, setEmail] = useState('');

  if (!card) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={gc.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={gc.modalCard}>
              <Text style={gc.modalTitle}>Redeem {card.label} Gift Card</Text>
              <Text style={gc.modalSub}>Cost: {card.pointsCost.toLocaleString()} GA Points</Text>

              <Text style={gc.inputLabel}>PLATFORM</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {card.platforms.map(p => (
                  <TouchableOpacity key={p} onPress={() => setPlatform(p)} style={[gc.platformBtn, platform === p && { borderColor: PLATFORM_COLORS[p], backgroundColor: PLATFORM_COLORS[p] + '20' }]}>
                    <Text style={[gc.platformBtnText, platform === p && { color: PLATFORM_COLORS[p] }]}>{PLATFORM_LABELS[p]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={gc.inputLabel}>EMAIL TO RECEIVE THE CODE</Text>
              <TextInput value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={COLORS.gray} style={gc.input} autoCapitalize="none" keyboardType="email-address" />

              <View style={gc.modalNote}>
                <Ionicons name="information-circle-outline" size={14} color={COLORS.blue} />
                <Text style={gc.modalNoteText}>
                  Your GA Points will be deducted immediately. The gift card code will be sent to your email within 24–48 hours by the Gaming Actions team.
                </Text>
              </View>

              <View style={gc.antiCheatNote}>
                <Ionicons name="warning-outline" size={14} color={COLORS.red} />
                <Text style={gc.antiCheatText}>
                  ⚠️ Any attempt to cheat, manipulate GG counts, or abuse the system will result in permanent account ban and forfeiture of all points.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (!email.trim() || !email.includes('@')) { Alert.alert('Invalid email', 'Please enter a valid email address.'); return; }
                  onConfirm({ platform, email: email.trim() });
                }}
                style={[gc.confirmBtn, { backgroundColor: card.color }]}
              >
                <Text style={gc.confirmBtnText}>Confirm — {card.pointsCost.toLocaleString()} pts</Text>
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

export default function GiftCardsScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [userStats, setUserStats] = useState(null);
  const [requests, setRequests] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const gaPoints = typeof userProfile?.gaPoints === 'number' ? userProfile.gaPoints : 0;

  useEffect(() => {
    if (user?.uid) loadData();
  }, [user?.uid]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get user stats + real video count in parallel
      const [uSnap, videosSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDocs(query(collection(db, 'videos'), where('userId', '==', user.uid))),
      ]);
      if (uSnap.exists()) {
        const d = uSnap.data();
        const realVideoCount = videosSnap.size;
        setUserStats({
          videoCount: realVideoCount,
          ggReceived: d.ggReceived || 0,
          rank: d.rank || 999,
        });
        // Sync videoCount back to Firestore if it differs (fix silencieux)
        if ((d.videoCount || 0) !== realVideoCount) {
          updateDoc(doc(db, 'users', user.uid), { videoCount: realVideoCount }).catch(() => {});
        }
      }
      // Get previous requests
      const rSnap = await getDocs(query(collection(db, 'gift_card_requests'), where('userId', '==', user.uid), orderBy('requestedAt', 'desc')));
      setRequests(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.log('GiftCards load:', e.message); }
    setLoading(false);
  };

  const handleRedeem = (card) => {
    setSelectedCard(card);
    setShowModal(true);
  };

  const handleConfirm = async ({ platform, email }) => {
    if (!selectedCard || !user?.uid) return;
    try {
      // Check points one more time before committing
      const uSnap = await getDoc(doc(db, 'users', user.uid));
      const currentPoints = uSnap.data()?.gaPoints || 0;
      if (currentPoints < selectedCard.pointsCost) {
        Alert.alert('Insufficient GA Points', `You need ${selectedCard.pointsCost.toLocaleString()} pts. You have ${currentPoints.toLocaleString()} pts.`);
        return;
      }

      // Atomic batch: deduct points + create request in a single commit
      const newPoints = currentPoints - selectedCard.pointsCost;
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', user.uid);
      batch.update(userRef, { gaPoints: increment(-selectedCard.pointsCost) });
      const reqRef = doc(collection(db, 'gift_card_requests'));
      batch.set(reqRef, {
        userId: user.uid,
        username: userProfile?.username || '',
        email,
        platform,
        amount: selectedCard.amount,
        pointsCost: selectedCard.pointsCost,
        gaPointsBefore: currentPoints,
        gaPointsAfter: newPoints,
        status: 'pending',
        requestedAt: serverTimestamp(),
        processedAt: null,
        note: '',
        adminNote: '',
      });
      await batch.commit();

      setShowModal(false);
      setSelectedCard(null);
      Alert.alert('🎁 Request submitted!', `Your ${selectedCard.label} ${PLATFORM_LABELS[platform]} gift card request has been submitted.\n\nThe code will be sent to ${email} within 24–48 hours.\n\nYour new balance: ${newPoints.toLocaleString()} GA Points`);
      loadData();
    } catch (e) {
      Alert.alert('Error', 'Failed to submit request. Please try again.');
    }
  };

  const statusColor = (s) => s === 'sent' ? COLORS.green : s === 'rejected' ? COLORS.red : COLORS.gold;
  const statusLabel = (s) => s === 'sent' ? '✅ Sent' : s === 'rejected' ? '❌ Rejected' : '🟡 Pending';

  return (
    <View style={gc.container}>
      <StatusBar style="light" />
      <View style={gc.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={gc.headerTitle}>Gift Cards</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Points balance */}
        <View style={gc.balanceBar}>
          <Ionicons name="diamond-outline" size={16} color={COLORS.gold} />
          <Text style={gc.balanceText}>Your GA Points: <Text style={{ color: COLORS.gold, fontWeight: '900' }}>{gaPoints.toLocaleString()}</Text></Text>
        </View>

        {/* How it works */}
        <View style={gc.infoCard}>
          <Text style={gc.infoTitle}>🎮 Exchange GA Points for Gift Cards</Text>
          <Text style={gc.infoDesc}>
            Earn GA Points by posting clips, receiving GGs, and climbing the rankings. Exchange them for PSN, Xbox, or Steam gift cards.{'\n\n'}
            {'⚡'} You must meet ALL requirements to redeem a card.{'\n'}
            {'⏱'} Codes are sent via email within 24–48 hours.{'\n'}
            {'⚠️'} Any cheating or manipulation will result in permanent ban.
          </Text>
        </View>

        {/* Your stats */}
        <Text style={gc.sectionLabel}>YOUR STATS</Text>
        <View style={gc.statsRow}>
          <View style={gc.statBox}>
            <Text style={gc.statValue}>{userStats?.videoCount || 0}</Text>
            <Text style={gc.statLabel}>Clips</Text>
          </View>
          <View style={gc.statBox}>
            <Text style={gc.statValue}>{(userStats?.ggReceived || 0).toLocaleString()}</Text>
            <Text style={gc.statLabel}>GGs received</Text>
          </View>
          <View style={gc.statBox}>
            <Text style={gc.statValue}>#{userStats?.rank || '—'}</Text>
            <Text style={gc.statLabel}>Ranking</Text>
          </View>
        </View>

        {/* Cards */}
        <Text style={gc.sectionLabel}>AVAILABLE CARDS</Text>
        {CARDS.map(card => (
          <CardItem key={card.id} card={card} userStats={userStats} gaPoints={gaPoints} onRedeem={handleRedeem} />
        ))}

        {/* Anti-cheat warning */}
        <View style={gc.warningCard}>
          <Ionicons name="warning-outline" size={20} color={COLORS.red} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={gc.warningTitle}>Zero Tolerance Policy</Text>
            <Text style={gc.warningText}>Any attempt to cheat, use bots, manipulate GG counts, create fake accounts, or abuse the points system will result in:{'\n'}• Permanent account ban{'\n'}• Forfeiture of all GA Points and requests{'\n'}• Potential legal action for fraud</Text>
          </View>
        </View>

        {/* Request history */}
        {requests.length > 0 && (
          <>
            <Text style={gc.sectionLabel}>YOUR REQUESTS</Text>
            <View style={gc.historyCard}>
              {requests.map((r, i) => (
                <View key={r.id} style={[gc.historyRow, i < requests.length-1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '700' }}>
                      CA${r.amount} {PLATFORM_LABELS[r.platform]}
                    </Text>
                    <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 2 }}>
                      {r.pointsCost?.toLocaleString()} pts · {r.email}
                    </Text>
                    {r.requestedAt?.toDate && (
                      <Text style={{ color: COLORS.gray, fontSize: 10, marginTop: 2 }}>
                        {r.requestedAt.toDate().toLocaleDateString()}
                      </Text>
                    )}
                    {r.adminNote ? <Text style={{ color: COLORS.gray, fontSize: 11, fontStyle: 'italic', marginTop: 3 }}>{r.adminNote}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor(r.status) }}>{statusLabel(r.status)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <RedeemModal
        visible={showModal}
        card={selectedCard}
        onClose={() => { setShowModal(false); setSelectedCard(null); }}
        onConfirm={handleConfirm}
      />
    </View>
  );
}

const gc = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  balanceBar: { flexDirection: 'row', alignItems: 'center', margin: 14, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, gap: 8, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  balanceText: { fontSize: 14, color: COLORS.white, fontWeight: '600' },
  infoCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 4 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white, marginBottom: 8 },
  infoDesc: { fontSize: 12, color: COLORS.gray, lineHeight: 18 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  statsRow: { flexDirection: 'row', marginHorizontal: 14, gap: 10, marginBottom: 4 },
  statBox: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3 },
  statValue: { fontSize: 20, fontWeight: '900', color: COLORS.gold },
  statLabel: { fontSize: 10, color: COLORS.gray, marginTop: 4 },
  cardItem: { marginHorizontal: 14, marginBottom: 12, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  cardHeader: { padding: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, borderWidth: 0 },
  cardAmount: { fontSize: 24, fontWeight: '900' },
  cardPoints: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  conditionsWrap: { padding: 14 },
  condTitle: { fontSize: 11, color: COLORS.gray, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 },
  condRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  condLabel: { fontSize: 12, color: COLORS.white, flex: 1 },
  condCurrent: { fontSize: 11, color: COLORS.gray },
  redeemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 14, marginTop: 0, borderRadius: 11, paddingVertical: 13, gap: 8 },
  redeemBtnText: { fontSize: 14, fontWeight: '900', color: COLORS.white },
  redeemBtnDisabled: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 14, marginTop: 0, borderRadius: 11, paddingVertical: 13, gap: 8, backgroundColor: COLORS.gray3 },
  redeemBtnDisabledText: { fontSize: 13, fontWeight: '700', color: COLORS.gray },
  warningCard: { flexDirection: 'row', marginHorizontal: 14, marginTop: 4, padding: 14, backgroundColor: 'rgba(255,45,85,0.06)', borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.red + '40' },
  warningTitle: { fontSize: 13, fontWeight: '800', color: COLORS.red, marginBottom: 6 },
  warningText: { fontSize: 11, color: COLORS.gray, lineHeight: 17 },
  historyCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  modalSub: { fontSize: 12, color: COLORS.gray, marginBottom: 20 },
  inputLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  input: { backgroundColor: COLORS.dark, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 16 },
  platformBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: COLORS.gray3, alignItems: 'center', backgroundColor: COLORS.dark },
  platformBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.gray },
  modalNote: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: 10, padding: 11, marginBottom: 12, gap: 8 },
  modalNoteText: { fontSize: 11, color: COLORS.gray, flex: 1, lineHeight: 16 },
  antiCheatNote: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(255,45,85,0.08)', borderRadius: 10, padding: 11, marginBottom: 16, gap: 8 },
  antiCheatText: { fontSize: 11, color: COLORS.gray, flex: 1, lineHeight: 16 },
  confirmBtn: { borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.white },
});

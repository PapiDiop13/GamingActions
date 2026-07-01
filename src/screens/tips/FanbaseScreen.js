import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import useFanbaseStore from '../../store/useFanbaseStore';
import Avatar from '../../components/FramedAvatar';

const GREEN = '#00C853';

const MOCK_CREATORS = [
  { id: 'sub1', username: 'FLAME', accountType: 'gameconic', plan: 'legendary', followers: 1240, tips: 12, subscribers: 89 },
];

const EXCLUSIVE_CONTENT = [
  { id: 'e1', icon: 'videocam-outline', label: 'Exclusive Clips', desc: 'Private gameplay only for fans', color: COLORS.gold },
  { id: 'e2', icon: 'bulb-outline', label: 'Private Tips', desc: 'Advanced tutorials not on the feed', color: COLORS.blue },
  { id: 'e3', icon: 'film-outline', label: 'Behind the Scenes', desc: 'Setup tours, bloopers, raw gameplay', color: '#7C4DFF' },
  { id: 'e4', icon: 'chatbubbles-outline', label: 'FanBox Access', desc: 'Direct group chat with the creator', color: GREEN },
];


export default function FanbaseScreen({ navigation, route }) {
  const creator = route?.params?.creator || MOCK_CREATORS[0];
  const creatorId = creator?.uid || creator?.id;

  const { user } = useAuthStore();
  const { isSubscribedTo, checkIsSubscribed } = useFanbaseStore();

  const [checking, setChecking] = useState(true);
  const [subSince, setSubSince] = useState(null);
  const subscribed = isSubscribedTo(creatorId);

  // Vérifie l'abonnement réel au montage + récupère la date d'adhésion
  useEffect(() => {
    if (!user?.uid || !creatorId) { setChecking(false); return; }
    (async () => {
      await checkIsSubscribed(user.uid, creatorId);
      try {
        const snap = await getDoc(doc(db, 'fanbase_subscriptions', `${user.uid}_${creatorId}`));
        const ts = snap.exists() ? snap.data()?.createdAt : null;
        if (ts?.toDate) setSubSince(ts.toDate());
      } catch (e) {}
      setChecking(false);
    })();
  }, [user?.uid, creatorId]);

  const BADGE = {
    gameconic: { bg: COLORS.red, text: COLORS.white, label: 'GAMECONIC' },
    creator: { bg: COLORS.blue, text: COLORS.dark, label: 'CREATOR' },
  };
  const badge = BADGE[creator.accountType] || BADGE.creator;

  const sinceLabel = subSince
    ? subSince.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fanbase</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Avatar user={creator} size={72} />
          <Text style={styles.creatorName}>{creator.username}</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
          <View style={styles.creatorStats}>
            <View style={styles.creatorStat}>
              <Text style={styles.creatorStatNum}>{(creator.followers || 0).toLocaleString()}</Text>
              <Text style={styles.creatorStatLabel}>Followers</Text>
            </View>
            <View style={styles.creatorStat}>
              <Text style={styles.creatorStatNum}>{creator.tips || 0}</Text>
              <Text style={styles.creatorStatLabel}>Tips</Text>
            </View>
            <View style={styles.creatorStat}>
              <Text style={[styles.creatorStatNum, { color: '#7C4DFF' }]}>{creator.fanbaseSubscribers ?? creator.subscribers ?? 0}</Text>
              <Text style={styles.creatorStatLabel}>Fans</Text>
            </View>
          </View>
        </View>

        <View style={styles.priceSection}>
          <Text style={styles.price}>$3.99</Text>
          <Text style={styles.pricePer}>/month</Text>
        </View>

        <Text style={styles.sectionTitle}>WHAT YOU GET</Text>
        {EXCLUSIVE_CONTENT.map((item) => (
          <View key={item.id} style={styles.benefitRow}>
            <View style={[styles.benefitIcon, { backgroundColor: item.color + '18' }]}>
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>
            <View style={styles.benefitInfo}>
              <Text style={styles.benefitLabel}>{item.label}</Text>
              <Text style={styles.benefitDesc}>{item.desc}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={18} color={item.color} />
          </View>
        ))}

        <View style={styles.ctaSection}>
          {checking ? (
            <View style={[styles.statusCard, { alignItems: 'center' }]}>
              <ActivityIndicator color={COLORS.gold} />
            </View>
          ) : subscribed ? (
            <>
              <View style={[styles.statusCard, { borderColor: GREEN + '55', backgroundColor: 'rgba(0,200,83,0.06)' }]}>
                <Ionicons name="checkmark-circle" size={22} color={GREEN} />
                <Text style={styles.statusTitle}>You're a Fanbase member</Text>
                {sinceLabel && <Text style={styles.statusSub}>Member since {sinceLabel}</Text>}
              </View>
              <TouchableOpacity
                onPress={() => navigation.replace('FanbaseContent', { creator })}
                style={[styles.subscribeBtn, { backgroundColor: GREEN }]}
              >
                <Ionicons name="lock-open" size={18} color={COLORS.black} />
                <Text style={[styles.subscribeBtnText, { color: COLORS.black }]}>View exclusive content</Text>
              </TouchableOpacity>
              <Text style={styles.subscribeNote}>Your subscription can't be managed here.</Text>
            </>
          ) : (
            <>
              <View style={styles.statusCard}>
                <Ionicons name="lock-closed" size={22} color="#7C4DFF" />
                <Text style={styles.statusTitle}>Members-only content</Text>
                <Text style={styles.statusSub}>
                  You're not a member of {creator.username}'s Fanbase yet.
                </Text>
              </View>
              <Text style={styles.subscribeNote}>Fanbase subscriptions can't be managed here.</Text>
            </>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  banner: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, backgroundColor: '#0d0820', borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  creatorName: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginTop: 10, marginBottom: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, marginBottom: 16 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  creatorStats: { flexDirection: 'row' },
  creatorStat: { alignItems: 'center', paddingHorizontal: 20 },
  creatorStatNum: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  creatorStatLabel: { fontSize: 10, color: COLORS.gray, textTransform: 'uppercase', marginTop: 2 },
  priceSection: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingVertical: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  price: { fontSize: 42, fontWeight: '900', color: '#7C4DFF' },
  pricePer: { fontSize: 16, color: COLORS.gray, marginLeft: 4 },
  sectionTitle: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  benefitIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  benefitInfo: { flex: 1 },
  benefitLabel: { fontSize: 14, fontWeight: '700', color: COLORS.white, marginBottom: 2 },
  benefitDesc: { fontSize: 11, color: COLORS.gray },
  ctaSection: { padding: 14, paddingTop: 20 },
  statusCard: { borderWidth: 1, borderColor: 'rgba(124,77,255,0.4)', backgroundColor: 'rgba(124,77,255,0.06)', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12 },
  statusTitle: { fontSize: 15, fontWeight: '800', color: COLORS.white, marginTop: 8, textAlign: 'center' },
  statusSub: { fontSize: 12, color: COLORS.gray, marginTop: 4, textAlign: 'center' },
  subscribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C4DFF', borderRadius: 14, paddingVertical: 16, marginBottom: 10, minHeight: 54 },
  subscribeBtnText: { fontSize: 16, fontWeight: '900', color: COLORS.white, marginLeft: 8 },
  subscribeNote: { fontSize: 11, color: COLORS.gray, textAlign: 'center' },
});
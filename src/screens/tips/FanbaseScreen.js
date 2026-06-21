import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
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
  const { isSubscribedTo, checkIsSubscribed, joinFanbase } = useFanbaseStore();

  const [checking, setChecking] = useState(true);
  const [joining, setJoining] = useState(false);
  const subscribed = isSubscribedTo(creatorId);

  // Vérifie l'abonnement réel au montage
  useEffect(() => {
    if (!user?.uid || !creatorId) { setChecking(false); return; }
    checkIsSubscribed(user.uid, creatorId).finally(() => setChecking(false));
  }, [user?.uid, creatorId]);

  const BADGE = {
    gameconic: { bg: COLORS.red, text: COLORS.white, label: 'GAMECONIC' },
    creator: { bg: COLORS.blue, text: COLORS.dark, label: 'CREATOR' },
  };
  const badge = BADGE[creator.accountType] || BADGE.creator;

  const handleJoin = async () => {
    if (!user?.uid) { Alert.alert('Login Required', 'Please sign in to join a fanbase.'); return; }
    if (user.uid === creatorId) { Alert.alert('Not possible', 'You cannot join your own fanbase.'); return; }

    setJoining(true);
    const ok = await joinFanbase(user.uid, creator);
    setJoining(false);

    if (ok) {
      Alert.alert(
        '🔓 Fanbase rejointe !',
        `Tu as maintenant accès au contenu exclusif de ${creator.username}.`,
        [{ text: 'Voir le contenu', onPress: () => navigation.replace('FanbaseContent', { creator }) }]
      );
    } else {
      Alert.alert('Error', 'Could not join right now. Please try again later.');
    }
  };

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
          <Text style={styles.price}>$4.99</Text>
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
            <View style={[styles.subscribeBtn, { backgroundColor: COLORS.card }]}>
              <ActivityIndicator color={COLORS.gold} />
            </View>
          ) : subscribed ? (
            <>
              <TouchableOpacity
                onPress={() => navigation.replace('FanbaseContent', { creator })}
                style={[styles.subscribeBtn, { backgroundColor: GREEN }]}
              >
                <Ionicons name="lock-open" size={18} color={COLORS.black} />
                <Text style={[styles.subscribeBtnText, { color: COLORS.black }]}>Voir le contenu exclusif</Text>
              </TouchableOpacity>
              <Text style={styles.subscribeNote}>✓ Tu es déjà abonné · annule depuis My Fanbase</Text>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={handleJoin}
                disabled={joining}
                style={[styles.subscribeBtn, joining && { opacity: 0.6 }]}
              >
                {joining ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="lock-open-outline" size={18} color={COLORS.white} />
                    <Text style={styles.subscribeBtnText}>Join (mode test · gratuit)</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.subscribeNote}>Paiement bientôt · Coming soon</Text>
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
  subscribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C4DFF', borderRadius: 14, paddingVertical: 16, marginBottom: 10, minHeight: 54 },
  subscribeBtnText: { fontSize: 16, fontWeight: '900', color: COLORS.white, marginLeft: 8 },
  subscribeNote: { fontSize: 11, color: COLORS.gray, textAlign: 'center' },
});
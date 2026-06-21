import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import useFanbaseStore from '../../store/useFanbaseStore';
import Avatar from '../../components/FramedAvatar';

const PRICE = 4.99;

const BADGE_COLORS = {
  gameconic: { bg: COLORS.red, text: COLORS.white, label: 'GAMECONIC' },
  creator: { bg: COLORS.blue, text: COLORS.dark, label: 'CREATOR' },
};


export default function MyFanbaseScreen({ navigation }) {
  const { user } = useAuthStore();
  const { cancelFanbase } = useFanbaseStore();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Charge les abonnements réels depuis Firestore + le profil de chaque créateur
  const loadSubs = useCallback(async () => {
    if (!user?.uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'fanbase_subscriptions'), where('subscriberId', '==', user.uid))
      );
      const rows = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        let creator = { username: data.creatorUsername || 'Creator' };
        try {
          const cSnap = await getDoc(doc(db, 'users', data.creatorId));
          if (cSnap.exists()) creator = { ...creator, ...cSnap.data() };
        } catch (e) {}
        return {
          subId: d.id,
          creatorId: data.creatorId,
          createdAt: data.createdAt,
          username: creator.username,
          accountType: creator.accountType || 'creator',
          plan: creator.plan,
          streakLevel: creator.streakLevel,
          followers: creator.followers || 0,
          fanbaseSubscribers: creator.fanbaseSubscribers || 0,
          avatar: creator.avatar,
        };
      }));
      setSubs(rows);
    } catch(e){} finally {
      setLoading(false);
    }
  }, [user?.uid]);

  // Recharge à chaque fois qu'on revient sur l'écran (ex: après un Cancel ailleurs)
  useFocusEffect(useCallback(() => { loadSubs(); }, [loadSubs]));

  const handleCancel = (sub) => {
    Alert.alert(
      `Cancel ${sub.username}'s Fanbase?`,
      `You'll lose access to exclusive content immediately.`,
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Cancel sub', style: 'destructive',
          onPress: async () => {
            // Retrait optimiste de la liste
            setSubs(prev => prev.filter(s => s.creatorId !== sub.creatorId));
            const ok = await cancelFanbase(user.uid, sub.creatorId);
            if (!ok) {
              Alert.alert('Error', 'Could not complete. Please try again later.');
              loadSubs(); // on recharge pour resync
            }
          },
        },
      ]
    );
  };

  const totalMonthly = subs.length * PRICE;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Fanbase</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNum}>{subs.length}</Text>
              <Text style={styles.summaryLabel}>Active</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNum, { color: COLORS.gold }]}>${totalMonthly.toFixed(2)}</Text>
              <Text style={styles.summaryLabel}>Per month</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNum, { color: '#7C4DFF' }]}>{subs.length}</Text>
              <Text style={styles.summaryLabel}>Total joined</Text>
            </View>
          </View>

          {subs.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>ACTIVE FANBASE ({subs.length})</Text>
              {subs.map((sub) => {
                const badge = BADGE_COLORS[sub.accountType] || BADGE_COLORS.creator;
                return (
                  <View key={sub.subId} style={styles.subCard}>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('UserProfile', { userId: sub.creatorId })}
                      style={styles.subTop}
                      activeOpacity={0.85}
                    >
                      <Avatar user={sub} size={48} />
                      <View style={styles.subInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.subName}>{sub.username}</Text>
                          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                          </View>
                        </View>
                        <Text style={styles.subMeta}>{(sub.followers || 0).toLocaleString()} followers · {sub.fanbaseSubscribers || 0} fans</Text>
                        <Text style={styles.subBilling}>Mode test · pas de facturation</Text>
                      </View>
                      <Text style={styles.subPrice}>${PRICE}/mo</Text>
                    </TouchableOpacity>
                    <View style={styles.subActions}>
                      <TouchableOpacity
                        onPress={() => navigation.navigate('FanbaseContent', { creator: { ...sub, uid: sub.creatorId, id: sub.creatorId } })}
                        style={styles.subActionBtn}
                      >
                        <Ionicons name="lock-open-outline" size={14} color={COLORS.blue} />
                        <Text style={[styles.subActionText, { color: COLORS.blue }]}>View Content</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleCancel(sub)}
                        style={[styles.subActionBtn, { borderColor: COLORS.red + '40' }]}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={COLORS.red} />
                        <Text style={[styles.subActionText, { color: COLORS.red }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="lock-closed-outline" size={48} color={COLORS.gray2} />
              <Text style={styles.emptyTitle}>No Fanbase yet</Text>
              <Text style={styles.emptyDesc}>Subscribe to your favorite creators to access exclusive content</Text>
              <TouchableOpacity onPress={() => navigation.navigate('TipsMain')} style={styles.exploreBtn}>
                <Text style={styles.exploreBtnText}>Explore Creators</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  summaryCard: { flexDirection: 'row', margin: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  summaryNum: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  summaryLabel: { fontSize: 10, color: COLORS.gray, marginTop: 3, textTransform: 'uppercase' },
  summaryDivider: { width: 0.5, backgroundColor: COLORS.gray3, marginVertical: 10 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10 },
  subCard: { marginHorizontal: 14, marginBottom: 12, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  subTop: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  subInfo: { flex: 1, marginLeft: 12 },
  subName: { fontSize: 15, fontWeight: '700', color: COLORS.white, marginRight: 6 },
  subMeta: { fontSize: 11, color: COLORS.gray, marginTop: 3 },
  subBilling: { fontSize: 11, color: COLORS.gold, marginTop: 2 },
  subPrice: { fontSize: 14, color: COLORS.green, fontWeight: '700' },
  subActions: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  subActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderWidth: 0.5, borderColor: COLORS.blue + '30', margin: 8, borderRadius: 8 },
  subActionText: { fontSize: 12, fontWeight: '600', marginLeft: 5 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, marginLeft: 6 },
  badgeText: { fontSize: 8, fontWeight: '900' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.white, marginTop: 16 },
  emptyDesc: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 19, marginTop: 8, marginBottom: 20 },
  exploreBtn: { backgroundColor: COLORS.blue, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  exploreBtnText: { fontSize: 14, color: COLORS.dark, fontWeight: '800' },
});
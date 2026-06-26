/**
 * SubscriptionScreen.js — Legendary subscription (redesigned)
 * RevenueCat prêt — seules les clés manquent.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, Animated, Easing, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { db } from '../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { activateTestLegendary, cancelTestLegendary, purchaseLegendary, restorePurchases } from '../../hooks/useRevenueCat';

const ADMINS = ['admin@gamingactions.com', 'pdiop08@outlook.fr', 'free08man@gmail.com'];

const PLANS = [
  {
    id: 'legendary_monthly',
    label: 'Monthly',
    price: '$2.99',
    priceCAD: 'CA$3.99',
    period: '/month',
    desc: 'Billed monthly · Cancel anytime',
    badge: null,
  },
  {
    id: 'legendary_yearly',
    label: 'Yearly',
    price: '$24.99',
    priceCAD: 'CA$33.99',
    period: '/year',
    desc: 'Only CA$2.83/month · Best deal',
    badge: 'SAVE 30%',
  },
];

const BENEFITS = [
  { icon: 'infinite-outline',         label: 'Unlimited uploads',            sub: 'Free: 20 clips/week' },
  { icon: 'videocam-outline',         label: '1080p / 4K quality',           sub: 'Max resolution for all clips' },
  { icon: 'color-palette-outline',    label: '15+ exclusive frames free',     sub: 'Legendary frames unlocked' },
  { icon: 'star-outline',             label: 'LEGENDARY gold badge',          sub: 'Stands out everywhere' },
  { icon: 'trending-up-outline',      label: 'Priority feed placement',       sub: 'Your clips seen first' },
  { icon: 'analytics-outline',        label: 'Advanced analytics',            sub: 'Views, reach, GG rate' },
  { icon: 'diamond-outline',          label: '+500 GA Points/month',          sub: 'Credited every billing date' },
  { icon: 'shield-checkmark-outline', label: 'Early access to new features',  sub: 'Test before everyone' },
];

function BenefitRow({ b, i }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 350, delay: i * 50, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[s.benefitRow, {
      opacity: anim,
      transform: [{ translateX: anim.interpolate({ inputRange: [0,1], outputRange: [-16,0] }) }],
    }]}>
      <View style={s.benefitIcon}>
        <Ionicons name={b.icon} size={17} color={COLORS.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.benefitLabel}>{b.label}</Text>
        <Text style={s.benefitSub}>{b.sub}</Text>
      </View>
      <Ionicons name="checkmark-circle" size={16} color={COLORS.green} />
    </Animated.View>
  );
}

function PlanCard({ plan, selected, onSelect }) {
  return (
    <TouchableOpacity onPress={() => onSelect(plan.id)} style={[s.planCard, selected && s.planCardActive]}>
      {plan.badge && <View style={s.planBadge}><Text style={s.planBadgeText}>{plan.badge}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={s.planLabel}>{plan.label}</Text>
        <Text style={s.planDesc}>{plan.desc}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
        <Text style={[s.planPrice, selected && { color: COLORS.gold }]}>{plan.priceCAD}</Text>
        <Text style={s.planPeriod}>{plan.period}</Text>
      </View>
      <View style={[s.radio, selected && s.radioActive]}>
        {selected && <View style={s.radioDot} />}
      </View>
    </TouchableOpacity>
  );
}

export default function SubscriptionScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [selectedPlan, setSelectedPlan] = useState('legendary_yearly');
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  const isLegendary = userProfile?.plan === 'legendary';
  const isAdmin = ADMINS.includes(user?.email);
  const gaPoints = typeof userProfile?.gaPoints === 'number' ? userProfile.gaPoints : 0;

  useEffect(() => {
    if (user?.uid) {
      getDoc(doc(db, 'subscriptions', user.uid)).then(snap => {
        if (snap.exists()) setSubscription(snap.data());
      });
    }
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
    ])).start();
  }, [user?.uid]);

  const handleSubscribe = async () => {
    // RevenueCat not yet configured — show coming soon
    Alert.alert(
      '🚀 Coming Soon',
      'Legendary subscriptions will be available very soon!\n\nThanks for your patience! 🏆',
      [{ text: 'Got it 👌' }]
    );
    // TODO: uncomment when react-native-purchases is installed + keys configured:
    // setLoading(true);
    // const result = await purchaseLegendary(user?.uid, selectedPlan);
    // setLoading(false);
    // if (result.success) Alert.alert('🏆 Welcome to Legendary!', 'Active!');
    // else if (!result.cancelled) Alert.alert('Error', result.error || 'Something went wrong');
  };

  const handleRestore = async () => {
    setLoading(true);
    const result = await restorePurchases(user?.uid);
    setLoading(false);
    Alert.alert(result.isLegendary ? '✅ Restored!' : 'Nothing to restore', result.isLegendary ? 'Your Legendary subscription has been restored.' : 'No previous purchases found.');
  };

  const handleTestActivate = () => {
    Alert.alert('🧪 Test Mode', `Activate ${selectedPlan}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Activate', onPress: async () => {
        setLoading(true);
        try {
          await activateTestLegendary(user?.uid, selectedPlan);
          const snap = await getDoc(doc(db, 'subscriptions', user.uid));
          if (snap.exists()) setSubscription(snap.data());
          Alert.alert('✅ Activated!', 'Legendary active in test mode.');
        } catch (e) {
          Alert.alert('Error', e.message);
        } finally {
          setLoading(false);
        }
      }},
    ]);
  };

  const handleTestCancel = () => {
    Alert.alert('Cancel test?', '', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
        await cancelTestLegendary(user?.uid);
        setSubscription(null);
        Alert.alert('Cancelled');
      }},
    ]);
  };

  const periodEnd = subscription?.currentPeriodEnd?.toDate?.();

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Legendary</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Hero */}
        <View style={s.hero}>
          <Animated.View style={[s.heroGlow, { opacity: glowAnim.interpolate({ inputRange:[0,1], outputRange:[0.1,0.35] }) }]} />
          <View style={s.heroIcon}>
            <Ionicons name="star" size={44} color={COLORS.gold} />
          </View>
          <Text style={s.heroTitle}>LEGENDARY</Text>
          <Text style={s.heroSub}>The ultimate Gaming Actions experience</Text>
          {isLegendary && (
            <View style={s.activeBadge}>
              <Ionicons name="checkmark-circle" size={13} color={COLORS.green} />
              <Text style={s.activeBadgeText}> ACTIVE {subscription?.isTest ? '(TEST)' : ''}</Text>
            </View>
          )}
        </View>

        {/* Benefits */}
        <Text style={s.sectionLabel}>WHAT YOU GET</Text>
        <View style={s.card}>
          {BENEFITS.map((b, i) => <BenefitRow key={i} b={b} i={i} />)}
        </View>

        {/* Comparison */}
        <Text style={s.sectionLabel}>LEGENDARY VS FREE</Text>
        <View style={s.card}>
          {[
            { label: 'Uploads/week',    free: '20',          leg: 'Unlimited' },
            { label: 'Video quality',   free: '720p',        leg: '1080p / 4K' },
            { label: 'Frames',          free: '7 basic',     leg: '15+ premium free' },
            { label: 'Feed placement',  free: 'Standard',    leg: 'Priority' },
            { label: 'GA Points/month', free: '—',           leg: '+500 bonus' },
            { label: 'Analytics',       free: 'Basic',       leg: 'Advanced' },
          ].map((row, i, arr) => (
            <View key={i} style={[s.compRow, i < arr.length-1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
              <Text style={s.compLabel}>{row.label}</Text>
              <Text style={s.compFree}>{row.free}</Text>
              <Text style={s.compLeg}>{row.leg}</Text>
            </View>
          ))}
          <View style={[s.compRow, { backgroundColor: COLORS.gray3 + '20' }]}>
            <Text style={{ flex:1 }} />
            <Text style={[s.compFree, { fontSize: 9, color: COLORS.gray }]}>FREE</Text>
            <Text style={[s.compLeg, { fontSize: 9 }]}>LEGENDARY ⭐</Text>
          </View>
        </View>

        {/* Plans */}
        {!isLegendary && (
          <>
            <Text style={s.sectionLabel}>CHOOSE YOUR PLAN</Text>
            {PLANS.map(p => <PlanCard key={p.id} plan={p} selected={selectedPlan === p.id} onSelect={setSelectedPlan} />)}

            <View style={s.paymentInfo}>
              <Ionicons name={Platform.OS === 'ios' ? 'logo-apple' : 'logo-google-playstore'} size={14} color={COLORS.gray} />
              <Text style={s.paymentInfoText}>
                {Platform.OS === 'ios' ? 'Managed by App Store · Cancel anytime in Settings' : 'Managed by Google Play · Cancel anytime'}
              </Text>
            </View>

            <TouchableOpacity onPress={handleSubscribe} style={s.subscribeBtn} disabled={loading}>
              <Ionicons name="star" size={17} color={COLORS.black} />
              <Text style={s.subscribeBtnText}>
                {loading ? 'Processing...' : `Subscribe — ${PLANS.find(p => p.id === selectedPlan)?.priceCAD}${PLANS.find(p => p.id === selectedPlan)?.period}`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleRestore} style={s.restoreBtn}>
              <Text style={s.restoreBtnText}>Restore purchases</Text>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity onPress={handleTestActivate} style={s.testBtn}>
                <Ionicons name="flask-outline" size={14} color={COLORS.purple} />
                <Text style={s.testBtnText}>[ADMIN] Activate Test Subscription</Text>
              </TouchableOpacity>
            )}

            {/* GA Points alternative */}
            <View style={s.altCard}>
              <Ionicons name="diamond-outline" size={17} color={COLORS.blue} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.altTitle}>Earn Legendary with GA Points</Text>
                <Text style={s.altDesc}>Reach 15,000 GA Points to unlock Legendary for free. You have {gaPoints.toLocaleString()} pts.</Text>
                <View style={s.pointsBar}>
                  <View style={[s.pointsFill, { width: `${Math.min(gaPoints / 150, 100)}%` }]} />
                </View>
              </View>
            </View>
          </>
        )}

        {/* Active sub info */}
        {isLegendary && (
          <>
            <Text style={s.sectionLabel}>YOUR SUBSCRIPTION</Text>
            <View style={s.card}>
              {[
                { label: 'Plan',     value: subscription?.productId === 'legendary_yearly' ? 'Legendary Yearly' : 'Legendary Monthly' },
                { label: 'Status',   value: subscription?.isTest ? '🧪 Test Mode' : '✅ Active' },
                { label: 'Platform', value: subscription?.platform === 'ios' ? '🍎 App Store' : subscription?.platform === 'test' ? '🧪 Test' : '🤖 Google Play' },
                { label: 'Renews',   value: periodEnd ? periodEnd.toLocaleDateString() : '—' },
              ].map((row, i, arr) => (
                <View key={i} style={[s.subRow, i < arr.length-1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
                  <Text style={s.subLabel}>{row.label}</Text>
                  <Text style={s.subValue}>{row.value}</Text>
                </View>
              ))}
            </View>

            {subscription?.isTest && isAdmin && (
              <TouchableOpacity onPress={handleTestCancel} style={s.cancelBtn}>
                <Ionicons name="close-circle-outline" size={15} color={COLORS.red} />
                <Text style={s.cancelBtnText}>Cancel Test Subscription</Text>
              </TouchableOpacity>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.white, letterSpacing: 1 },
  hero: { alignItems: 'center', paddingVertical: 36, backgroundColor: '#0D0A1A', borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: COLORS.gold, top: -20 },
  heroIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 2, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 32, fontWeight: '900', color: COLORS.gold, letterSpacing: 5 },
  heroSub: { fontSize: 13, color: COLORS.gray, marginTop: 5, textAlign: 'center', paddingHorizontal: 20 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: 'rgba(0,200,83,0.12)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.green },
  activeBadgeText: { fontSize: 11, color: COLORS.green, fontWeight: '800' },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10 },
  card: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  benefitRow: { flexDirection: 'row', alignItems: 'center', padding: 13, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  benefitIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  benefitLabel: { fontSize: 13, color: COLORS.white, fontWeight: '600' },
  benefitSub: { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  compRow: { flexDirection: 'row', alignItems: 'center', padding: 11 },
  compLabel: { flex: 1, fontSize: 12, color: COLORS.white },
  compFree: { width: 68, fontSize: 11, color: COLORS.gray, textAlign: 'center' },
  compLeg: { width: 90, fontSize: 11, color: COLORS.gold, fontWeight: '700', textAlign: 'center' },
  planCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 10, padding: 15, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.gray3, position: 'relative' },
  planCardActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.06)' },
  planBadge: { position: 'absolute', top: -8, right: 14, backgroundColor: COLORS.gold, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  planBadgeText: { fontSize: 9, fontWeight: '900', color: COLORS.black },
  planLabel: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  planDesc: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  planPrice: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  planPeriod: { fontSize: 10, color: COLORS.gray },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: COLORS.gray3, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: COLORS.gold },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.gold },
  paymentInfo: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginVertical: 10, padding: 11, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.gray3 },
  paymentInfoText: { fontSize: 11, color: COLORS.gray, marginLeft: 8, flex: 1 },
  subscribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 17, gap: 8 },
  subscribeBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black },
  restoreBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 8 },
  restoreBtnText: { fontSize: 12, color: COLORS.gray },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginTop: 10, paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: COLORS.purple + '60', gap: 6 },
  testBtnText: { fontSize: 12, color: COLORS.purple, fontWeight: '700' },
  altCard: { flexDirection: 'row', margin: 14, padding: 13, backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 13, borderWidth: 0.5, borderColor: COLORS.blue + '40', alignItems: 'flex-start' },
  altTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white, marginBottom: 3 },
  altDesc: { fontSize: 11, color: COLORS.gray, lineHeight: 15, marginBottom: 7 },
  pointsBar: { height: 4, backgroundColor: COLORS.gray3, borderRadius: 2, overflow: 'hidden' },
  pointsFill: { height: '100%', backgroundColor: COLORS.blue, borderRadius: 2 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 13 },
  subLabel: { fontSize: 13, color: COLORS.gray },
  subValue: { fontSize: 13, color: COLORS.white, fontWeight: '600' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginTop: 12, paddingVertical: 13, borderRadius: 11, borderWidth: 0.5, borderColor: COLORS.red, gap: 6 },
  cancelBtnText: { fontSize: 13, color: COLORS.red, fontWeight: '700' },
});

import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Platform, Alert, Modal, TouchableWithoutFeedback, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { TooltipOverlay, useTooltip } from '../../components/TooltipOverlay';

const LEGENDARY_BENEFITS = [
  { icon: 'star-outline', label: 'Gold frame on all your videos', color: COLORS.gold },
  { icon: 'trending-up-outline', label: 'Priority placement in the feed', color: COLORS.gold },
  { icon: 'ribbon-outline', label: 'Exclusive Legendary badge', color: COLORS.gold },
  { icon: 'gift-outline', label: '500 GA Points bonus per month', color: COLORS.gold },
  { icon: 'shield-checkmark-outline', label: 'Access to exclusive shop items', color: COLORS.gold },
];

const PLANS = [
  {
    id: 'monthly',
    label: 'Monthly',
    price: '$2.99',
    period: '/month',
    desc: 'Billed monthly. Cancel anytime.',
    badge: null,
  },
  {
    id: 'yearly',
    label: 'Yearly',
    price: '$24.99',
    period: '/year',
    desc: 'Save 30% vs monthly.',
    badge: 'BEST VALUE',
  },
];


function PaymentPopup({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: '#141420', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', borderWidth: 0.5, borderColor: '#2A2A3A' }}>
              <Text style={{ fontSize: 40 }}>⏳</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFFFFF', marginTop: 14, marginBottom: 10 }}>Coming soon</Text>
              <Text style={{ fontSize: 14, color: '#888899', textAlign: 'center', lineHeight: 21, marginBottom: 20 }}>
                Legendary subscriptions will be available soon.{'\n\n'}🚀 Thanks for your patience!
              </Text>
              <TouchableOpacity onPress={onClose} style={{ backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 30 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0A0A0F' }}>Got it 👌</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default function SubscriptionScreen({ navigation }) {
  const [showPayment, setShowPayment] = useState(false);
  const { user } = useAuthStore();
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const { tooltip, show, hide } = useTooltip();
  const isLegendary = user?.plan === 'legendary';

  const handleSubscribe = () => {
    setShowPayment(true);
  };

  const handleCancel = () => {
    setShowPayment(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <PaymentPopup visible={showPayment} onClose={() => setShowPayment(false)} />
      <TooltipOverlay type={tooltip.type} visible={tooltip.visible} onClose={hide} onCTA={hide} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Hero */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => show('legendary')}>
            <Image
              source={{ uri: 'https://res.cloudinary.com/doeqzltv0/image/upload/v1781659688/ChatGPT_Image_27_avr._2025_23_37_14_aouscr.png' }}
              style={{ width: 160, height: 160, borderRadius: 24, marginBottom: 14, borderWidth: 2, borderColor: COLORS.gold }}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>LEGENDARY</Text>
          <Text style={styles.heroSub}>The ultimate Gaming Actions experience</Text>
          {isLegendary && (
            <View style={styles.activeBadge}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.green} />
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          )}
        </View>

        {/* Benefits */}
        <Text style={styles.sectionLabel}>WHAT YOU GET</Text>
        <View style={styles.benefitsCard}>
          {LEGENDARY_BENEFITS.map((b, i) => (
            <View key={i} style={[styles.benefitRow, i < LEGENDARY_BENEFITS.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
              <View style={[styles.benefitIcon, { backgroundColor: b.color + '18' }]}>
                <Ionicons name={b.icon} size={18} color={b.color} />
              </View>
              <Text style={styles.benefitLabel}>{b.label}</Text>
              <Ionicons name="checkmark" size={16} color={COLORS.green} />
            </View>
          ))}
        </View>

        {/* Plans */}
        {!isLegendary && (
          <>
            <Text style={styles.sectionLabel}>CHOOSE YOUR PLAN</Text>
            {PLANS.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                onPress={() => setSelectedPlan(plan.id)}
                style={[styles.planCard, selectedPlan === plan.id && styles.planCardActive]}
              >
                {plan.badge && (
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{plan.badge}</Text>
                  </View>
                )}
                <View style={styles.planLeft}>
                  <Text style={styles.planLabel}>{plan.label}</Text>
                  <Text style={styles.planDesc}>{plan.desc}</Text>
                </View>
                <View style={styles.planRight}>
                  <Text style={[styles.planPrice, selectedPlan === plan.id && { color: COLORS.gold }]}>{plan.price}</Text>
                  <Text style={styles.planPeriod}>{plan.period}</Text>
                </View>
                <View style={[styles.radio, selectedPlan === plan.id && styles.radioActive]}>
                  {selectedPlan === plan.id && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}

            {/* Payment info */}
            <View style={styles.paymentInfo}>
              <Ionicons name={Platform.OS === 'ios' ? 'logo-apple' : 'card-outline'} size={16} color={COLORS.gray} />
              <Text style={styles.paymentInfoText}>
                {Platform.OS === 'ios' ? 'Payments managed securely by the App Store' : 'Secure payments coming soon'}
              </Text>
            </View>

            <TouchableOpacity onPress={handleSubscribe} style={styles.subscribeBtn}>
              <Ionicons name="star" size={18} color={COLORS.black} />
              <Text style={styles.subscribeBtnText}>Subscribe to Legendary</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Already subscribed */}
        {isLegendary && (
          <>
            <Text style={styles.sectionLabel}>YOUR SUBSCRIPTION</Text>
            <View style={styles.subscriptionCard}>
              <View style={styles.subRow}>
                <Text style={styles.subLabel}>Plan</Text>
                <Text style={styles.subValue}>Legendary Monthly</Text>
              </View>
              <View style={styles.subRow}>
                <Text style={styles.subLabel}>Price</Text>
                <Text style={styles.subValue}>$2.99/month</Text>
              </View>
              <View style={styles.subRow}>
                <Text style={styles.subLabel}>Next billing</Text>
                <Text style={styles.subValue}>July 14, 2026</Text>
              </View>
              <View style={styles.subRow}>
                <Text style={styles.subLabel}>Payment</Text>
                <Text style={styles.subValue}>{Platform.OS === 'ios' ? 'App Store' : 'secure payment'}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel Subscription</Text>
            </TouchableOpacity>
          </>
        )}

        {/* GA Points alternative */}
        <View style={styles.altCard}>
          <TouchableOpacity onPress={() => show('gapoints')} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Ionicons name="diamond-outline" size={20} color={COLORS.blue} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.altTitle}>Earn Legendary with GA Points</Text>
              <Text style={styles.altDesc}>Reach 15,000 GA Points to unlock Legendary for free. You have {user?.gaPoints?.toLocaleString() || 0} pts.</Text>
            </View>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.gray} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  hero: { alignItems: 'center', paddingVertical: 30, backgroundColor: '#0d0a1a', borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(201,168,76,0.15)', borderWidth: 2, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: COLORS.gold, letterSpacing: 3 },
  heroSub: { fontSize: 13, color: COLORS.gray, marginTop: 6 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: 'rgba(0,200,83,0.12)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.green },
  activeBadgeText: { fontSize: 11, color: COLORS.green, fontWeight: '800', marginLeft: 5 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 10 },
  benefitsCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  benefitRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  benefitIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  benefitLabel: { flex: 1, fontSize: 13, color: COLORS.white, fontWeight: '500' },
  planCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 10, padding: 16, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.gray3, position: 'relative' },
  planCardActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.06)' },
  planBadge: { position: 'absolute', top: -8, right: 16, backgroundColor: COLORS.gold, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  planBadgeText: { fontSize: 9, fontWeight: '900', color: COLORS.black },
  planLeft: { flex: 1 },
  planLabel: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  planDesc: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  planRight: { alignItems: 'flex-end', marginRight: 12 },
  planPrice: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  planPeriod: { fontSize: 10, color: COLORS.gray },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: COLORS.gray3, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: COLORS.gold },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.gold },
  paymentInfo: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 14, padding: 12, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.gray3 },
  paymentInfoText: { fontSize: 11, color: COLORS.gray, marginLeft: 8, flex: 1 },
  subscribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 16 },
  subscribeBtnText: { fontSize: 16, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
  subscriptionCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  subLabel: { fontSize: 13, color: COLORS.gray },
  subValue: { fontSize: 13, color: COLORS.white, fontWeight: '600' },
  cancelBtn: { marginHorizontal: 14, marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.red, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: COLORS.red, fontWeight: '700' },
  altCard: { margin: 14, padding: 14, backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.blue + '40', flexDirection: 'row', alignItems: 'center' },
  altTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white, marginBottom: 3 },
  altDesc: { fontSize: 11, color: COLORS.gray, lineHeight: 15 },
});
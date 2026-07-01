import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { showAlert } from '../../store/useAlertStore';
import { purchaseSupport } from '../../hooks/useRevenueCat';
import PurchaseSuccessOverlay from '../../components/PurchaseSuccessOverlay';

const IOS = Platform.OS === 'ios';
const pid = (slug) => (IOS ? `com.gamingactions.app.${slug}` : slug);

// Paliers — doivent matcher iap_setup/catalog_extra.json
const TIERS = [
  { id: 'support_299',  amount: 2.99,  emoji: '☕', label: 'A coffee',        desc: 'A little boost' },
  { id: 'support_499',  amount: 4.99,  emoji: '🍕', label: 'A pizza',         desc: 'You feed the team!' },
  { id: 'support_999',  amount: 9.99,  emoji: '🔥', label: 'Super supporter', desc: 'You really move GA forward' },
  { id: 'support_1999', amount: 19.99, emoji: '🚀', label: 'Boost',           desc: 'You power the project' },
  { id: 'support_4999', amount: 49.99, emoji: '👑', label: 'Legend',          desc: 'Our hero 💛' },
];

export default function SupportScreen({ navigation }) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(null); // id du palier en cours
  const [showThanks, setShowThanks] = useState(false);

  const handleSupport = async (tier) => {
    if (Platform.OS !== 'ios') { showAlert({ title: 'Coming soon', message: 'Support is not available on Android yet. Stay tuned!', type: 'info' }); return; }
    if (!user?.uid) { showAlert({ title: 'Sign in required', message: 'Sign in to support Gaming Actions.', type: 'warning' }); return; }
    setLoading(tier.id);
    const res = await purchaseSupport(user.uid, pid(tier.id), tier.amount);
    setLoading(null);
    if (res.success) {
      setShowThanks(true);
    } else if (!res.cancelled) {
      showAlert({ title: 'Oops', message: res.error || 'Payment failed. Please try again.', type: 'danger' });
    }
  };

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <PurchaseSuccessOverlay visible={showThanks} kind="support" onClose={() => setShowThanks(false)} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Support the App</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <Text style={s.heroEmoji}>💛</Text>
          <Text style={s.heroTitle}>Support Gaming Actions</Text>
          <Text style={s.heroDesc}>
            We build Gaming Actions with passion. If you enjoy the app, you can help us
            keep going — every bit of support means the world.
          </Text>
        </View>

        {TIERS.map((t) => (
          <TouchableOpacity
            key={t.id}
            disabled={!!loading}
            onPress={() => handleSupport(t)}
            style={[s.tier, loading === t.id && { opacity: 0.6 }]}
          >
            <Text style={s.tierEmoji}>{t.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.tierLabel}>{t.label}</Text>
              <Text style={s.tierDesc}>{t.desc}</Text>
            </View>
            {loading === t.id
              ? <ActivityIndicator color={COLORS.gold} />
              : <Text style={s.tierPrice}>CA${t.amount.toFixed(2)}</Text>}
          </TouchableOpacity>
        ))}

        <Text style={s.footnote}>Secure payment via the App Store. Thank you for your support 🙏</Text>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  hero: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 10, marginBottom: 16 },
  heroEmoji: { fontSize: 44, marginBottom: 8 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 8, textAlign: 'center' },
  heroDesc: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 19 },
  tier: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  tierEmoji: { fontSize: 28 },
  tierLabel: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  tierDesc: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  tierPrice: { fontSize: 16, fontWeight: '900', color: COLORS.gold },
  footote: { fontSize: 11, color: COLORS.gray, textAlign: 'center', marginTop: 14 },
  footnote: { fontSize: 11, color: COLORS.gray, textAlign: 'center', marginTop: 14 },
});

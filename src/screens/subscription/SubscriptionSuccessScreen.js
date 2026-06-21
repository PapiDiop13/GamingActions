import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

const BENEFITS = [
  { icon: 'star-outline', color: COLORS.gold, title: 'Legendary Frame', desc: 'Gold border on all your clips in the feed' },
  { icon: 'trending-up-outline', color: COLORS.gold, title: 'Priority in Feed', desc: 'Your clips get more visibility' },
  { icon: 'bag-outline', color: COLORS.blue, title: 'Shop Access', desc: 'Unlock exclusive frames and badges' },
  { icon: 'trophy-outline', color: COLORS.gold, title: 'Rankings Boost', desc: 'Legendary badge on your ranking profile' },
  { icon: 'diamond-outline', color: COLORS.blue, title: 'GA Points Bonus', desc: '+50% GA Points on all actions' },
];

const FANBASE_BENEFITS = [
  { icon: 'videocam-outline', color: '#00C853', title: 'Exclusive Clips', desc: 'Access all private content from this creator' },
  { icon: 'bulb-outline', color: COLORS.blue, title: 'Private FlashTutos', desc: 'Advanced tutorials for subscribers only' },
  { icon: 'chatbubbles-outline', color: '#00C853', title: 'FanBox Access', desc: 'Direct group chat with the creator' },
  { icon: 'megaphone-outline', color: COLORS.gold, title: 'First to Know', desc: 'Exclusive announcements before the public' },
];

export default function SubscriptionSuccessScreen({ navigation, route }) {
  const type = route?.params?.type || 'legendary'; // 'legendary' or 'fanbase'
  const creator = route?.params?.creator;
  const isLegendary = type === 'legendary';
  const benefits = isLegendary ? BENEFITS : FANBASE_BENEFITS;
  const color = isLegendary ? COLORS.gold : '#00C853';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Header */}
        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: color + '18', borderColor: color + '40' }]}>
            <Ionicons name={isLegendary ? 'star' : 'lock-open'} size={48} color={color} />
          </View>
          <Text style={styles.heroTitle}>
            {isLegendary ? '⭐ You are now Legendary!' : `🔒 Welcome to ${creator?.username || 'the'} Fanbase!`}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isLegendary
              ? 'Your account has been upgraded. Enjoy all Legendary perks!'
              : `You now have full access to exclusive content from ${creator?.username || 'this creator'}.`}
          </Text>
          <View style={[styles.heroBadge, { backgroundColor: color + '18', borderColor: color }]}>
            <Text style={[styles.heroBadgeText, { color }]}>
              {isLegendary ? '$2.99/month · Cancel anytime' : '$4.99/month · Cancel anytime'}
            </Text>
          </View>
        </View>

        {/* Benefits */}
        <Text style={styles.sectionLabel}>YOUR BENEFITS</Text>
        {benefits.map((b, i) => (
          <View key={i} style={styles.benefitRow}>
            <View style={[styles.benefitIcon, { backgroundColor: b.color + '18' }]}>
              <Ionicons name={b.icon} size={22} color={b.color} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.benefitTitle}>{b.title}</Text>
              <Text style={styles.benefitDesc}>{b.desc}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={b.color} />
          </View>
        ))}

        {/* CTA buttons */}
        <View style={styles.ctaSection}>
          {!isLegendary && creator && (
            <TouchableOpacity
              onPress={() => navigation.replace('FanbaseContent', { creator })}
              style={[styles.primaryBtn, { backgroundColor: '#00C853' }]}
            >
              <Ionicons name="enter-outline" size={18} color={COLORS.black} />
              <Text style={[styles.primaryBtnText, { color: COLORS.black }]}>Enter Fanbase</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => navigation.navigate('UserProfile', { userId: 'me' })}
            style={[styles.primaryBtn, { backgroundColor: isLegendary ? COLORS.gold : COLORS.card, marginTop: 10 }]}
          >
            <Ionicons name="person-outline" size={18} color={isLegendary ? COLORS.black : COLORS.white} />
            <Text style={[styles.primaryBtnText, { color: isLegendary ? COLORS.black : COLORS.white }]}>View My Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('FeedMain')}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>Back to Feed</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  heroSection: { alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 80 : 60, paddingBottom: 30, paddingHorizontal: 24 },
  heroIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 10 },
  heroSubtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  heroBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5 },
  heroBadgeText: { fontSize: 12, fontWeight: '700' },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  benefitIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  benefitTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white, marginBottom: 2 },
  benefitDesc: { fontSize: 12, color: COLORS.gray },
  ctaSection: { padding: 16, paddingTop: 24 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 15 },
  primaryBtnText: { fontSize: 16, fontWeight: '900', marginLeft: 8 },
  secondaryBtn: { paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  secondaryBtnText: { fontSize: 14, color: COLORS.gray, fontWeight: '600' },
});
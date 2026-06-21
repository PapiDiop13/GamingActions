// src/components/TooltipOverlay.js
import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

const TOOLTIP_DATA = {
  legendary: {
    icon: 'star',
    color: COLORS.gold,
    title: 'Legendary Plan',
    desc: 'Legendary members get a gold frame on their videos, priority in the feed, and exclusive badge. Costs $2.99/month or earn it with 15,000+ GA Points.',
    cta: 'Upgrade to Legendary',
  },
  gg: {
    icon: 'thumbs-up',
    color: COLORS.gold,
    title: 'GG Points',
    desc: 'GG points are earned when other gamers click GG on your clips. The more GGs you get, the higher your ranking. Top 10 earn monthly rewards.',
    cta: 'See Rankings',
  },
  gapoints: {
    icon: 'diamond',
    color: COLORS.blue,
    title: 'GA Points',
    desc: 'GA Points are the currency of Gaming Actions. Earn them by posting clips, receiving GG, daily login, and community activity. Use them in the Shop.',
    cta: 'Go to Shop',
  },
  streak: {
    icon: 'flame',
    color: COLORS.red,
    title: 'Streak Level',
    desc: 'Your streak level goes from NOOB → BRONZE → SILVER → GOLD → GOAT. Level up by earning GA Points. Higher levels unlock exclusive frames and badges.',
    cta: 'View Rankings',
  },
  creator: {
    icon: 'videocam',
    color: COLORS.blue,
    title: 'Creator Status',
    desc: 'Creators can publish tips, tutos, and build a fanbase. Apply in Settings. Requirements: 50+ followers, 10+ clips, good community standing.',
    cta: 'Request Creator',
  },
  gameconic: {
    icon: 'trophy',
    color: COLORS.red,
    title: 'Gameconic',
    desc: 'Gameconic is the highest status. Reserved for top influencers and community pillars. By invitation only from the Gaming Actions team.',
    cta: null,
  },
  fanbase: {
    icon: 'lock-closed',
    color: '#7C4DFF',
    title: 'Fanbase',
    desc: 'Fanbase gives you access to exclusive clips, private tips, behind the scenes content and direct chat with your favorite creator. $4.99/month.',
    cta: 'Subscribe',
  },
  champion: {
    icon: 'crown',
    color: COLORS.gold,
    title: 'Monthly Champion',
    desc: 'The gamer with the most GG at the end of the month becomes Champion. They get a crown, special badge and featured placement in the feed.',
    cta: 'View Rankings',
  },
};

export function TooltipOverlay({ type, visible, onClose, onCTA }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const data = TOOLTIP_DATA[type];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, speed: 20, bounciness: 8, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!data) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.bubble, { transform: [{ translateY: slideAnim }] }]}>
              <View style={[styles.iconCircle, { backgroundColor: data.color + '20' }]}>
                <Ionicons name={data.icon} size={28} color={data.color} />
              </View>
              <Text style={styles.title}>{data.title}</Text>
              <Text style={styles.desc}>{data.desc}</Text>
              {data.cta && (
                <TouchableOpacity onPress={onCTA} style={[styles.ctaBtn, { backgroundColor: data.color }]}>
                  <Text style={[styles.ctaBtnText, { color: data.color === COLORS.gold ? COLORS.black : COLORS.white }]}>
                    {data.cta}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Got it</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// Hook for easy use
export function useTooltip() {
  const [tooltip, setTooltip] = React.useState({ visible: false, type: null });
  const show = (type) => setTooltip({ visible: true, type });
  const hide = () => setTooltip({ visible: false, type: null });
  return { tooltip, show, hide };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  bubble: { backgroundColor: '#141420', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 10, textAlign: 'center' },
  desc: { fontSize: 14, color: COLORS.gray, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  ctaBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  ctaBtnText: { fontSize: 15, fontWeight: '800' },
  closeBtn: { paddingVertical: 10 },
  closeBtnText: { fontSize: 14, color: COLORS.gray, fontWeight: '600' },
});
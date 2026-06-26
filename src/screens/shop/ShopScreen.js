import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Alert, ActivityIndicator, Animated, Easing, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, runTransaction, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { FRAMES, VIDEO_FRAMES, COMMENT_FRAMES } from '../../constants/frames';
import {
  PROFILE_BACKGROUNDS, PROFILE_BANNERS, USERNAME_EFFECTS,
  PROFILE_BADGES, CARD_BORDERS, PROFILE_THEMES,
  RARITY_CONFIG, canAccessCosmetic, getCosmeticPrice,
} from '../../constants/cosmetics';
import { ElectricRing, ElectricBorder, RotatingElectricRing } from '../../components/ElectricEffect';
import useAuthStore from '../../store/useAuthStore';
import { showAlert } from '../../store/useAlertStore';
import { db } from '../../config/firebase';

const { width: SW } = Dimensions.get('window');
const ITEM_W = (SW - 14 * 2 - 12) / 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function logPurchase(userId, item, itemType, balanceAfter) {
  if (!userId) return;
  try {
    await addDoc(collection(db, 'points_history'), {
      userId, delta: -(item.pointsPrice || 0),
      reason: `${itemType} purchased: ${item.name}`,
      total: balanceAfter, itemId: item.id, itemType,
      createdAt: serverTimestamp(),
    });
  } catch (e) {}
}

async function purchaseWithPoints(userId, cost, onSuccess, bypass = false) {
  if (bypass) {
    // Admin/Gameconic bypass — achat gratuit pour tester
    try { await onSuccess(); return { ok: true }; } catch (e) { return { ok: false, reason: e.message }; }
  }
  const userRef = doc(db, 'users', userId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error('User not found');
      const current = snap.data().gaPoints || 0;
      if (current < cost) throw new Error('NOT_ENOUGH_POINTS');
      tx.update(userRef, { gaPoints: current - cost });
    });
    await onSuccess();
    return { ok: true };
  } catch (e) {
    await logError(LOG_CONTEXT.SHOP_FAIL, e, userId);
    return { ok: false, reason: e.message };
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'avatar_frames',  label: 'Avatar',      icon: 'person-circle-outline' },
  { id: 'profile_bg',     label: 'Background',  icon: 'color-palette-outline' },
  { id: 'banners',        label: 'Banner',      icon: 'image-outline' },
  { id: 'badges',         label: 'Title',       icon: 'ribbon-outline' },
  { id: 'username_fx',    label: 'Username',    icon: 'text-outline' },
  { id: 'card_borders',   label: 'Card',        icon: 'card-outline' },
  { id: 'themes', label: 'Themes 🔥', icon: 'sparkles-outline' },
  { id: 'video_frames',   label: 'Video',       icon: 'videocam-outline' },
  { id: 'comment_frames', label: 'Comment',     icon: 'chatbubble-outline' },
  { id: 'gift_cards',     label: 'Gift Cards',  icon: 'gift-outline' },
];

// ─── Price filter options ──────────────────────────────────────────────────────
const PRICE_FILTERS = [
  { id: 'all',       label: 'All',        icon: 'grid-outline' },
  { id: 'free',      label: 'Free',       icon: 'gift-outline' },
  { id: 'points',    label: '⭐ Points',   icon: 'star-outline' },
  { id: 'legendary', label: '👑 Leg.',    icon: 'shield-outline' },
  { id: 'dollars',   label: '💳 Pay',     icon: 'card-outline' },
  { id: 'owned',     label: '✓ Owned',    icon: 'checkmark-circle-outline' },
];

// ─── Rarity badge ─────────────────────────────────────────────────────────────
function RarityBadge({ rarity }) {
  const cfg = RARITY_CONFIG[rarity] || RARITY_CONFIG.common;
  return (
    <View style={{ backgroundColor: cfg.color + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginBottom: 3 }}>
      <Text style={{ fontSize: 8, fontWeight: '900', color: cfg.color, letterSpacing: 0.5 }}>{cfg.label.toUpperCase()}</Text>
    </View>
  );
}

// ─── Price tag ────────────────────────────────────────────────────────────────
function PriceTag({ cosmetic, userPlan, owned, equipped = false }) {
  if (owned && equipped) return (
    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.2)', borderColor: COLORS.gold, borderWidth: 1.5 }]}>
      <Ionicons name="checkmark-circle" size={11} color={COLORS.gold} />
      <Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>✓ EQUIPPED</Text>
    </View>
  );
  if (owned) return (
    <View style={[s.actionBtn, { backgroundColor: 'rgba(0,212,255,0.1)', borderColor: COLORS.blue }]}>
      <Text style={[s.actionBtnText, { color: COLORS.blue }]}>TAP TO EQUIP</Text>
    </View>
  );
  if (cosmetic.free) return (
    <View style={s.actionBtn}><Text style={s.actionBtnText}>FREE</Text></View>
  );
  if (cosmetic.exclusive) return (
    <Text style={s.exclusiveLabel}>🔒 EARNED</Text>
  );
  if (cosmetic.legendaryFree && userPlan === 'legendary') return (
    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold }]}>
      <Ionicons name="shield" size={10} color={COLORS.gold} />
      <Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>Legendary ✓</Text>
    </View>
  );
  if (cosmetic.dollarsPrice) return (
    <View style={[s.actionBtn, { backgroundColor: 'rgba(255,45,85,0.1)', borderColor: '#FF2D55' }]}>
      <Ionicons name="flash" size={10} color="#FF2D55" />
      <Text style={[s.actionBtnText, { color: '#FF2D55', marginLeft: 3 }]}>CA${cosmetic.dollarsPrice.toFixed(2)}</Text>
    </View>
  );
  if (cosmetic.legendaryFree) return (
    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold + '80' }]}>
      <Text style={[s.actionBtnText, { color: COLORS.gray }]}>👑 {cosmetic.pointsPrice} pts</Text>
    </View>
  );
  return (
    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}>
      <Ionicons name="star" size={10} color={COLORS.gold} />
      <Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>{cosmetic.pointsPrice} pts</Text>
    </View>
  );
}

// ─── Background Preview ───────────────────────────────────────────────────────
function BgPreview({ cosmetic }) {
  const colors = cosmetic.colors || ['#0A0A0F'];
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!cosmetic.animated) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: false }),
    ]));
    a.start();
    return () => a.stop();
  }, [cosmetic.id]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const mainColor = colors[0];
  const accentColor = colors[colors.length - 1];
  return (
    <View style={{ width: '100%', height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: mainColor }}>
      {cosmetic.animated ? (
        <Animated.View style={{ flex: 1, opacity }}>
          <View style={{ position: 'absolute', bottom: -10, right: -10, width: 70, height: 70, borderRadius: 35, backgroundColor: accentColor, opacity: 0.5 }} />
          <View style={{ position: 'absolute', top: -15, left: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: accentColor, opacity: 0.3 }} />
        </Animated.View>
      ) : (
        <>
          <View style={{ position: 'absolute', bottom: -10, right: -10, width: 70, height: 70, borderRadius: 35, backgroundColor: accentColor, opacity: 0.4 }} />
          <View style={{ position: 'absolute', top: -15, left: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: accentColor, opacity: 0.2 }} />
        </>
      )}
      {cosmetic.animated && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#FF2D55', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>ANIMATED</Text>
        </View>
      )}
      <View style={{ position: 'absolute', bottom: 6, left: 8 }}>
        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>PROFILE BG</Text>
      </View>
    </View>
  );
}

// ─── Banner Preview ───────────────────────────────────────────────────────────
function BannerPreview({ cosmetic }) {
  const colors = cosmetic.colors || ['#0D0820'];
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!cosmetic.animated) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: false }),
    ]));
    a.start();
    return () => a.stop();
  }, [cosmetic.id]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const accentColor = colors[colors.length - 1];
  return (
    <View style={{ width: '100%', height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: colors[0] }}>
      {cosmetic.animated ? (
        <Animated.View style={{ flex: 1, opacity }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: accentColor }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: accentColor, opacity: 0.4 }} />
          <View style={{ position: 'absolute', right: -20, top: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: accentColor, opacity: 0.2 }} />
        </Animated.View>
      ) : (
        <>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: accentColor, opacity: 0.8 }} />
          <View style={{ position: 'absolute', right: -20, top: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: accentColor, opacity: 0.15 }} />
        </>
      )}
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: 2 }}>BANNER PREVIEW</Text>
      </View>
      {cosmetic.animated && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#FF2D55', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>ANIMATED</Text>
        </View>
      )}
    </View>
  );
}

// ─── Username Effect Preview ──────────────────────────────────────────────────
function UsernamePreview({ cosmetic }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!cosmetic.animated) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: false }),
    ]));
    a.start();
    return () => a.stop();
  }, [cosmetic.id]);
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  // Support color (simple) et colors[] (gradient animé — on prend la 1ère couleur pour la preview)
  const mainColor = cosmetic.color || (Array.isArray(cosmetic.colors) && cosmetic.colors[0]) || COLORS.white;
  return (
    <View style={{ width: '100%', height: 80, borderRadius: 10, backgroundColor: '#0A0A1A', alignItems: 'center', justifyContent: 'center' }}>
      {cosmetic.animated ? (
        <Animated.Text style={{ fontSize: 18, fontWeight: '900', color: mainColor, opacity: glowOpacity,
          textShadowColor: mainColor, textShadowRadius: 8 }}>
          PLAYER
        </Animated.Text>
      ) : (
        <Text style={{ fontSize: 18, fontWeight: '900', color: mainColor,
          textShadowColor: cosmetic.glow ? mainColor : 'transparent',
          textShadowRadius: cosmetic.glow ? 6 : 0 }}>
          PLAYER
        </Text>
      )}
      {cosmetic.animated && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#FF2D55', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>ANIMATED</Text>
        </View>
      )}
    </View>
  );
}

// ─── Badge Preview ────────────────────────────────────────────────────────────
function BadgePreview({ cosmetic }) {
  return (
    <View style={{ width: '100%', height: 80, borderRadius: 10, backgroundColor: '#0A0A1A', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Text style={{ fontSize: 28 }}>{cosmetic.emoji || '🏅'}</Text>
      <View style={{ backgroundColor: (cosmetic.color || COLORS.gold) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text style={{ fontSize: 9, fontWeight: '900', color: cosmetic.color || COLORS.gold }}>{cosmetic.name}</Text>
      </View>
    </View>
  );
}

// ─── Card Border Preview ──────────────────────────────────────────────────────
function CardBorderPreview({ cosmetic }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!cosmetic.animated) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: false }),
    ]));
    a.start();
    return () => a.stop();
  }, [cosmetic.id]);
  const borderW = pulse.interpolate({ inputRange: [0, 1], outputRange: [1.5, 3] });
  const shadowO = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const mainColor = cosmetic.color || (cosmetic.colors && cosmetic.colors[0]) || COLORS.gray3;
  return (
    <View style={{ width: '100%', height: 80, borderRadius: 10, backgroundColor: '#0A0A1A', alignItems: 'center', justifyContent: 'center' }}>
      {cosmetic.animated ? (
        <Animated.View style={{ width: 60, height: 60, borderRadius: 10, backgroundColor: '#111120',
          borderWidth: borderW, borderColor: mainColor,
          shadowColor: mainColor, shadowOpacity: shadowO, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
          alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={22} color={mainColor} style={{ opacity: 0.6 }} />
        </Animated.View>
      ) : (
        <View style={{ width: 60, height: 60, borderRadius: 10, backgroundColor: '#111120',
          borderWidth: cosmetic.glow ? 2 : 1.5, borderColor: mainColor,
          shadowColor: cosmetic.glow ? mainColor : 'transparent',
          shadowOpacity: cosmetic.glow ? 0.8 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
          alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={22} color={mainColor} style={{ opacity: 0.6 }} />
        </View>
      )}
      {cosmetic.animated && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#FF2D55', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>ANIMATED</Text>
        </View>
      )}
    </View>
  );
}

// ─── Theme Preview ────────────────────────────────────────────────────────────
// Theme color palettes — chaque theme a sa propre identité visuelle
const THEME_PALETTES = {
  theme_champion:  { bg: '#1A1200', banner: '#C9A84C', accent: '#FFD700', avatar: '#C9A84C' },
  theme_phantom:   { bg: '#080010', banner: '#2A0040', accent: '#BF5AF2', avatar: '#7C4DFF' },
  theme_inferno:   { bg: '#1A0500', banner: '#FF3D00', accent: '#FFD700', avatar: '#FF6D00' },
  theme_storm:     { bg: '#050510', banner: '#001030', accent: '#FFD700', avatar: '#00D4FF' },
  theme_cosmic:    { bg: '#02000A', banner: '#0A0030', accent: '#E040FB', avatar: '#7C4DFF' },
  theme_matrix:    { bg: '#001A05', banner: '#003010', accent: '#00FF41', avatar: '#00C853' },
};

function ThemePreview({ cosmetic }) {
  const pal = THEME_PALETTES[cosmetic.id] || { bg: '#0A0A0F', banner: '#1A1A1A', accent: '#C9A84C', avatar: '#888' };
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!cosmetic.animated) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: false }),
    ]));
    a.start();
    return () => a.stop();
  }, [cosmetic.id]);
  const glowO = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] });
  return (
    <View style={{ width: '100%', height: 100, borderRadius: 10, overflow: 'hidden', backgroundColor: pal.bg }}>
      {/* Bannière top */}
      <View style={{ height: 42, backgroundColor: pal.banner }}>
        {cosmetic.animated && (
          <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: pal.accent, opacity: glowO }} />
        )}
        {/* Lignes déco */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: pal.accent, opacity: 0.8 }} />
      </View>
      {/* Avatar row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginTop: -14 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: pal.avatar, borderWidth: 2.5, borderColor: pal.bg, alignItems: 'center', justifyContent: 'center',
          shadowColor: pal.accent, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }}>
          <Text style={{ fontSize: 12 }}>🎮</Text>
        </View>
        <View style={{ marginLeft: 8 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', color: pal.accent }}>PLAYER</Text>
          <View style={{ backgroundColor: pal.accent + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2 }}>
            <Text style={{ fontSize: 7, color: pal.accent, fontWeight: '800' }}>{cosmetic.name.split(' ')[0].toUpperCase()}</Text>
          </View>
        </View>
      </View>
      {/* Accent glow bottom */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, backgroundColor: pal.accent, opacity: 0.5 }} />
      {cosmetic.animated && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#FF2D55', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>ANIMATED</Text>
        </View>
      )}
    </View>
  );
}

// ─── Avatar Frame Preview (inchangé) ─────────────────────────────────────────
function AnimatedRingPreview({ frame, size }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  const spin  = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: false }),
    ])).start();
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2500, useNativeDriver: true, easing: Easing.linear })).start();
    return () => { pulse.stopAnimation(); spin.stopAnimation(); };
  }, []);
  const opacity = pulse.interpolate({ inputRange: [0,1], outputRange: [0.35, 0.95] });
  const rotate  = spin.interpolate({ inputRange: [0,1], outputRange: ['0deg','360deg'] });
  const spinIds = ['neon_pulse_blue','neon_pulse_pink','galaxy_animated','rainbow_animated','lightning_animated','void_animated','nebula_animated','neon_city_animated','cosmic_animated','blizzard_animated'];
  const ringSize = size + 10;
  if (spinIds.includes(frame.id)) {
    return (
      <>
        <Animated.View style={{ position: 'absolute', width: ringSize, height: ringSize, borderRadius: ringSize/2, borderWidth: 3,
          borderColor: frame.color, borderTopColor: 'transparent', borderRightColor: 'transparent',
          transform: [{ rotate }], shadowColor: frame.color, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width:0, height:0 } }} />
        <Animated.View style={{ position: 'absolute', width: ringSize, height: ringSize, borderRadius: ringSize/2, borderWidth: 1.5, borderColor: frame.color, opacity }} />
      </>
    );
  }
  return (
    <Animated.View style={{ position: 'absolute', width: ringSize, height: ringSize, borderRadius: ringSize/2, borderWidth: 3,
      borderColor: frame.color, opacity, shadowColor: frame.color, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width:0, height:0 } }} />
  );
}

function AvatarFramePreview({ frame, avatar, username, size = 54 }) {
  const initials = (username || 'GA').slice(0, 2).toUpperCase();
  const showRing = frame.id !== 'none';
  return (
    <View style={{ width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center' }}>
      {showRing && frame.glow && (
        <View style={{ position: 'absolute', width: size + 20, height: size + 20, borderRadius: (size+20)/2, backgroundColor: frame.color, opacity: 0.18 }} />
      )}
      {showRing && frame.animated ? <AnimatedRingPreview frame={frame} size={size} />
        : showRing ? <View style={{ position: 'absolute', width: size+10, height: size+10, borderRadius: (size+10)/2, borderWidth: 2.5, borderColor: frame.color }} />
        : null}
      {avatar
        ? <Image source={{ uri: avatar }} style={{ width: size, height: size, borderRadius: size/2 }} resizeMode="cover" />
        : <View style={{ width: size, height: size, borderRadius: size/2, backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: showRing ? frame.color : COLORS.gray3 }}>
            <Text style={{ color: COLORS.gold, fontWeight: '800', fontSize: size * 0.34 }}>{initials}</Text>
          </View>
      }
    </View>
  );
}

function VideoFramePreview({ frame, size = 70 }) {
  const hasFrame = frame.id !== 'none';
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!frame.animated) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [frame.id]);
  const animOpacity = pulse.interpolate({ inputRange: [0,1], outputRange: [0.5, 1] });
  const animBorder  = pulse.interpolate({ inputRange: [0,1], outputRange: [2, 4] });
  return (
    <View style={{ width: size, height: size * 0.6, position: 'relative', borderRadius: 8, overflow: 'hidden', backgroundColor: '#0a0a1a' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="game-controller" size={22} color={hasFrame ? frame.color : COLORS.gray3} style={{ opacity: 0.4 }} />
      </View>
      {hasFrame && (
        <>
          {frame.animated
            ? <Animated.View style={{ position: 'absolute', inset: 0, borderWidth: animBorder, borderColor: frame.color, borderRadius: 8, opacity: animOpacity,
                shadowColor: frame.color, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width:0, height:0 } }} />
            : <View style={{ position: 'absolute', inset: 0, borderWidth: 2.5, borderColor: frame.color, borderRadius: 8, opacity: frame.glow ? 0.9 : 0.7 }} />
          }
          <View style={{ position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderTopWidth: 2, borderLeftWidth: 2, borderColor: frame.color }} />
          <View style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: frame.color }} />
          <View style={{ position: 'absolute', bottom: 3, left: 3, width: 8, height: 8, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: frame.color }} />
          <View style={{ position: 'absolute', bottom: 3, right: 3, width: 8, height: 8, borderBottomWidth: 2, borderRightWidth: 2, borderColor: frame.color }} />
        </>
      )}
    </View>
  );
}

function CommentBubblePreview({ frame }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!frame.animated) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: false }),
    ]));
    a.start();
    return () => a.stop();
  }, [frame.id]);
  const borderWidth = pulse.interpolate({ inputRange: [0,1], outputRange: [2, 3.5] });
  const shadowOpacity = pulse.interpolate({ inputRange: [0,1], outputRange: [0.4, 1] });
  const baseStyle = { width: '100%', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: COLORS.black };
  if (frame.animated) {
    return (
      <Animated.View style={[baseStyle, { borderWidth, borderColor: frame.color, shadowColor: frame.color, shadowOffset: { width:0, height:0 }, shadowOpacity, shadowRadius: 8 }]}>
        <Text style={{ fontSize: 10, color: COLORS.gold, fontWeight: '800' }}>YOU ⚡</Text>
        <Text style={{ fontSize: 11, color: COLORS.white, marginTop: 2 }}>Sample comment 🔥</Text>
      </Animated.View>
    );
  }
  return (
    <View style={[baseStyle, { borderWidth: frame.id === 'none' ? 1 : 2, borderColor: frame.id === 'none' ? COLORS.gray3 : frame.color,
      shadowColor: frame.glow ? frame.color : 'transparent', shadowOffset: { width:0, height:0 }, shadowOpacity: frame.glow ? 0.7 : 0, shadowRadius: 6 }]}>
      <Text style={{ fontSize: 10, color: COLORS.gold, fontWeight: '800' }}>YOU</Text>
      <Text style={{ fontSize: 11, color: COLORS.white, marginTop: 2 }}>Sample comment 🔥</Text>
    </View>
  );
}

// ─── Champion Banner ──────────────────────────────────────────────────────────
function ChampionBanner({ type }) {
  const LABELS = { avatar: 'Avatar Frame', video: 'Video Frame', comment: 'Comment Frame' };
  return (
    <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 6, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#15130a', borderWidth: 0.5, borderColor: '#E8C96B55', flexDirection: 'row', alignItems: 'center' }}>
      {/* Preview électrique miniature */}
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        {type === 'avatar' && (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={14} color={COLORS.gold} />
            <RotatingElectricRing size={32} />
          </View>
        )}
        {type === 'video' && (
          <View style={{ width: 44, height: 30, borderRadius: 6, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Ionicons name="play" size={12} color={COLORS.gold} />
            <ElectricBorder width={44} height={30} radius={6} />
          </View>
        )}
        {type === 'comment' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, borderColor: '#E8C96B', backgroundColor: '#1A1A2E', shadowColor: '#E8C96B', shadowOpacity: 0.7, shadowRadius: 4, shadowOffset: { width:0, height:0 } }}>
            <Text style={{ fontSize: 8, color: COLORS.gold, fontWeight: '800' }}>GG ⚡</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 7, fontWeight: '900', color: '#FFD700', letterSpacing: 1, marginBottom: 2 }}>EXCLUSIVE · MONTHLY REWARD</Text>
        <Text style={{ fontSize: 12, fontWeight: '900', color: COLORS.white }}>CHAMPION {LABELS[type]}</Text>
        <Text style={{ fontSize: 9, color: COLORS.gray }}>🔒 Cannot be bought — earned by becoming Champion</Text>
      </View>
    </View>
  );
}

// ─── Generic Cosmetic Grid ────────────────────────────────────────────────────
function CosmeticGrid({ items, priceFilter, userPlan, ownedCosmetics, equippedId, onPress, renderPreview, infoText, isAdmin = false }) {
  const allOwned = isAdmin ? items.map(i => i.id) : ownedCosmetics;
  const filtered = items.filter(item => {
    if (priceFilter === 'owned') return canAccessCosmetic(item, userPlan, allOwned) && !item.exclusive;
    if (priceFilter === 'free') return item.free;
    if (priceFilter === 'points') return item.pointsPrice > 0 && !item.dollarsPrice;
    if (priceFilter === 'legendary') return item.legendaryFree;
    if (priceFilter === 'dollars') return !!item.dollarsPrice;
    return true;
  });

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      {infoText && (
        <View style={s.infoBanner}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.gold} />
          <Text style={s.infoText}>{infoText}</Text>
        </View>
      )}
      <View style={s.grid}>
        {filtered.length === 0 && (
          <View style={{ width: '100%', paddingVertical: 40, alignItems: 'center' }}>
            <Text style={{ color: COLORS.gray, fontSize: 13 }}>No items in this filter</Text>
          </View>
        )}
        {filtered.map(item => {
          const owned = isAdmin || canAccessCosmetic(item, userPlan, allOwned);
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.85}
              style={[s.frameCard, owned && { borderColor: (item.color || COLORS.gold) + '80', borderWidth: 1.5 }]}
              onPress={() => onPress(item, owned)}
            >
              <View style={s.framePreviewWrap}>
                {renderPreview(item)}
              </View>
              <RarityBadge rarity={item.rarity || 'common'} />
              <Text style={s.frameName} numberOfLines={1}>{item.name}</Text>
              <Text style={s.frameDesc} numberOfLines={2}>{item.desc || item.preview || ''}</Text>
              <PriceTag cosmetic={item} userPlan={userPlan} owned={owned} equipped={equippedId === item.id} />
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Gift Cards section ───────────────────────────────────────────────────────
const GIFT_CARD_EARN = [
  { icon: 'cloud-upload-outline', color: COLORS.green, action: 'Post a clip', pts: '+25 pts' },
  { icon: 'star-outline', color: COLORS.gold, action: 'Receive a GG', pts: '+2 pts' },
  { icon: 'person-add-outline', color: COLORS.blue, action: 'Get a follower', pts: '+1 pt' },
  { icon: '📅', action: 'Daily login bonus', pts: '+1 to +15 pts' },
  { icon: '👑', action: 'Monthly Champion', pts: '+500 pts' },
];

// ─── Main ShopScreen ──────────────────────────────────────────────────────────
export default function ShopScreen() {
  const navigation = useNavigation();
  const { user, userProfile, saveProfile } = useAuthStore();
  const [category, setCategory] = useState('avatar_frames');
  const [loading, setLoading] = useState(false);
  const [priceFilter, setPriceFilter] = useState('all');

  const ADMIN_EMAILS = ['admin@gamingactions.com', 'pdiop08@outlook.fr', 'free08man@gmail.com'];
  const isAdmin = userProfile?.accountType === 'gameconic' || userProfile?.accountType === 'admin'
    || userProfile?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase());
  const gaPoints         = userProfile?.gaPoints || 0;
  const userPlan         = userProfile?.plan || 'free';
  const equippedFrame    = userProfile?.equippedFrame || 'none';
  const ownedFrames      = userProfile?.ownedFrames || ['none'];
  const ownedVideoFrames = userProfile?.ownedVideoFrames || ['none'];
  const ownedCosmetics   = userProfile?.ownedCosmetics || [];

  // Reset price filter when changing category
  const handleCategoryChange = (id) => { setCategory(id); /* Keep priceFilter — user set it intentionally */ };

  // ─── Avatar frame handlers ─────────────────────────────────────────────────
  const handleAvatarFrame = async (frame) => {
    if (frame.exclusive) return Alert.alert('Exclusive 🔒', 'Awarded automatically.');
    if (frame.free || frame.id === 'none') { await _equipAvatarFrame(frame.id); return; }
    const owned = ownedFrames.includes(frame.id);
    if (owned) { await _equipAvatarFrame(equippedFrame === frame.id ? 'none' : frame.id); return; }
    if (frame.animated && !isAdmin) { Alert.alert('🔜 Coming Soon', `This premium item (CA$${frame.dollarsPrice?.toFixed(2)}) will be available for purchase very soon!\n\nStay tuned! 🎮`, [{ text: 'Got it 👌' }]); return; }
    if (!isAdmin && gaPoints < frame.pointsPrice) return showAlert({ title: 'Not enough GA Points', message: `You need ${frame.pointsPrice} pts. You have ${gaPoints} pts.`, type: 'warning' });
    if (isAdmin) { await _buyAvatarFrame(frame); return; }
    showAlert({ title: `Buy "${frame.name}"?`, message: `Cost: ${frame.pointsPrice} GA Points\nYou have: ${gaPoints} pts`, type: 'info',
      buttons: [{ text: 'Cancel', style: 'cancel' }, { text: `Buy — ${frame.pointsPrice} pts`, onPress: () => _buyAvatarFrame(frame) }] });
  };
  const _buyAvatarFrame = async (frame) => {
    setLoading(true);
    const result = await purchaseWithPoints(user.uid, frame.pointsPrice, async () => {
      const newOwned = [...new Set([...ownedFrames, frame.id])];
      await saveProfile({ ownedFrames: newOwned, equippedFrame: frame.id });
    }, isAdmin);
    setLoading(false);
    if (result.ok) { if (!isAdmin) await logPurchase(user.uid, frame, 'avatar', gaPoints - frame.pointsPrice); showAlert({ title: isAdmin ? '🧪 Test: Equipped!' : '✅ Purchased!', message: `"${frame.name}" equipped!${isAdmin ? ' (admin bypass)' : ' −' + frame.pointsPrice + ' pts'}`, type: 'success' }); }
    else if (result.reason === 'NOT_ENOUGH_POINTS') showAlert({ title: 'Not enough GA Points', message: `You need ${frame.pointsPrice} pts.`, type: 'warning' });
    else showAlert({ title: 'Error', message: 'Purchase failed. Please try again.', type: 'danger' });
  };
  const _equipAvatarFrame = async (frameId) => { setLoading(true); try { await saveProfile({ equippedFrame: frameId }); } catch {} setLoading(false); };

  // ─── Video frame handlers ──────────────────────────────────────────────────
  const handleVideoFrame = async (frame) => {
    if (frame.exclusive) return Alert.alert('Exclusive 🔒', 'Awarded automatically.');
    if (frame.free || frame.id === 'none') { Alert.alert('Free frame', 'Available for free when uploading!'); return; }
    const owned = ownedVideoFrames.includes(frame.id);
    if (owned) { showAlert({ title: 'Already owned ✓', message: `"${frame.name}" is available when uploading.`, type: 'info' }); return; }
    if (frame.animated && !isAdmin) { Alert.alert('🔜 Coming Soon', `This premium item (CA$${frame.dollarsPrice?.toFixed(2)}) will be available for purchase very soon!\n\nStay tuned! 🎮`, [{ text: 'Got it 👌' }]); return; }
    if (!isAdmin && gaPoints < frame.pointsPrice) return showAlert({ title: 'Not enough GA Points', message: `You need ${frame.pointsPrice} pts.`, type: 'warning' });
    showAlert({ title: `Buy "${frame.name}"?`, message: `Cost: ${frame.pointsPrice} pts\nAvailable when uploading.`, type: 'info',
      buttons: [{ text: 'Cancel', style: 'cancel' }, { text: `Buy — ${frame.pointsPrice} pts`, onPress: async () => {
        setLoading(true);
        const result = await purchaseWithPoints(user.uid, frame.pointsPrice, async () => {
          await saveProfile({ ownedVideoFrames: [...new Set([...ownedVideoFrames, frame.id])] });
        });
        setLoading(false);
        if (result.ok) { await logPurchase(user.uid, frame, 'video', gaPoints - frame.pointsPrice); showAlert({ title: '✅ Purchased!', message: `"${frame.name}" unlocked for uploads!`, type: 'success' }); }
        else showAlert({ title: 'Error', message: 'Purchase failed.', type: 'danger' });
      }}] });
  };

  // ─── Comment frame handlers ────────────────────────────────────────────────
  const handleCommentFrame = async (frame, owned) => {
    if (frame.exclusive) { showAlert({ title: 'Exclusive 🔒', message: 'Awarded to Monthly Champion.', type: 'info' }); return; }
    if (owned) { await saveProfile({ equippedCommentFrame: frame.id }); showAlert({ title: '✅ Equipped!', message: `"${frame.name}" is now your comment frame.`, type: 'success' }); return; }
    if (frame.animated && !isAdmin) { Alert.alert('🔜 Coming Soon', `This premium item (CA$${frame.dollarsPrice?.toFixed(2)}) will be available for purchase very soon!\n\nStay tuned! 🎮`, [{ text: 'Got it 👌' }]); return; }
    if (!isAdmin && gaPoints < frame.pointsPrice) return showAlert({ title: 'Not enough GA Points', message: `You need ${frame.pointsPrice} pts.`, type: 'warning' });
    showAlert({ title: `Buy "${frame.name}"?`, message: `Cost: ${frame.pointsPrice} pts`, type: 'info',
      buttons: [{ text: 'Cancel', style: 'cancel' }, { text: `Buy — ${frame.pointsPrice} pts`, onPress: async () => {
        const newOwned = [...new Set([...(userProfile?.ownedCommentFrames || []), frame.id])];
        await saveProfile({ ownedCommentFrames: newOwned, equippedCommentFrame: frame.id, gaPoints: gaPoints - frame.pointsPrice });
        await logPurchase(user.uid, frame, 'comment', gaPoints - frame.pointsPrice);
        showAlert({ title: '✅ Purchased!', message: `"${frame.name}" equipped on your comments!`, type: 'success' });
      }}] });
  };

  // ─── Cosmetic handler (profile bg, banner, badge, username, card border) ───
  const handleCosmetic = async (item, owned) => {
    if (item.exclusive) { showAlert({ title: 'Exclusive 🔒', message: item.desc, type: 'info' }); return; }

    // Admin bypass — tous les items accessibles gratuitement
    if (isAdmin) {
      const equip = {};
      if (item.category === 'background') equip.equippedProfileBg = item.id;
      if (item.category === 'banner') equip.equippedProfileBanner = item.id;
      if (item.category === 'badge') equip.equippedProfileBadge = item.id;
      if (item.category === 'username') equip.equippedUsernameEffect = item.id;
      if (item.category === 'card') equip.equippedCardBorder = item.id;
      const newOwned = [...new Set([...ownedCosmetics, item.id])];
      equip.ownedCosmetics = newOwned;
      await saveProfile(equip);
      showAlert({ title: '🧪 Equipped! (admin)', message: `"${item.name}" is now active.`, type: 'success' });
      return;
    }

    if (item.dollarsPrice) { Alert.alert('🔜 Coming Soon', `This premium item will be available for purchase very soon!\n\nStay tuned! 🎮`, [{ text: 'Got it 👌' }]); return; }
    if (owned) {
      // Equip
      const equip = {};
      if (item.category === 'background') equip.equippedProfileBg = item.id;
      if (item.category === 'banner') equip.equippedProfileBanner = item.id;
      if (item.category === 'badge') equip.equippedProfileBadge = item.id;
      if (item.category === 'username') equip.equippedUsernameEffect = item.id;
      if (item.category === 'card') equip.equippedCardBorder = item.id;
      await saveProfile(equip);
      showAlert({ title: '✅ Equipped!', message: `"${item.name}" is now active on your profile.`, type: 'success' });
      return;
    }
    if (item.free || (item.legendaryFree && userPlan === 'legendary')) {
      const equip = {};
      if (item.category === 'background') equip.equippedProfileBg = item.id;
      if (item.category === 'banner') equip.equippedProfileBanner = item.id;
      if (item.category === 'badge') equip.equippedProfileBadge = item.id;
      if (item.category === 'username') equip.equippedUsernameEffect = item.id;
      if (item.category === 'card') equip.equippedCardBorder = item.id;
      await saveProfile(equip);
      showAlert({ title: '✅ Equipped!', message: `"${item.name}" is now active!`, type: 'success' });
      return;
    }
    if (item.legendaryFree && userPlan !== 'legendary') {
      showAlert({ title: '👑 Legendary Required', message: `This item is free for Legendary subscribers.\n\nUpgrade for CA$1.99/month to unlock it!`, type: 'info',
        buttons: [{ text: 'Maybe later', style: 'cancel' }, { text: 'Go Legendary 👑', onPress: () => navigation.navigate('Subscription') }] });
      return;
    }
    if (!item.pointsPrice || item.pointsPrice === 0) { showAlert({ title: item.name, message: item.desc, type: 'info' }); return; }
    if (!isAdmin && gaPoints < item.pointsPrice) {
      showAlert({ title: 'Not enough GA Points', message: `You need ${item.pointsPrice} pts. You have ${gaPoints} pts.`, type: 'warning' });
      return;
    }
    showAlert({
      title: `Buy "${item.name}"?`,
      message: `Cost: ${item.pointsPrice} pts\n${item.desc}`,
      type: 'info',
      buttons: [{ text: 'Cancel', style: 'cancel' }, { text: `Buy — ${item.pointsPrice} pts`, onPress: async () => {
        setLoading(true);
        const result = await purchaseWithPoints(user.uid, item.pointsPrice, async () => {
          const newOwned = [...new Set([...ownedCosmetics, item.id])];
          const equip = { ownedCosmetics: newOwned };
          if (item.category === 'background') equip.equippedProfileBg = item.id;
          if (item.category === 'banner') equip.equippedProfileBanner = item.id;
          if (item.category === 'badge') equip.equippedProfileBadge = item.id;
          if (item.category === 'username') equip.equippedUsernameEffect = item.id;
          if (item.category === 'card') equip.equippedCardBorder = item.id;
          await saveProfile(equip);
        }, isAdmin);
        setLoading(false);
        if (result.ok) { if (!isAdmin) await logPurchase(user.uid, item, item.category, gaPoints - item.pointsPrice); showAlert({ title: '✅ Purchased!', message: `"${item.name}" equipped on your profile!`, type: 'success' }); }
        else if (result.reason === 'NOT_ENOUGH_POINTS') showAlert({ title: 'Not enough GA Points', message: `You need ${item.pointsPrice} pts.`, type: 'warning' });
        else showAlert({ title: 'Error', message: 'Purchase failed. Try again.', type: 'danger' });
      }}],
    });
  };

  // ─── Theme handler ─────────────────────────────────────────────────────────
  const handleTheme = async (theme, owned) => {
    if (theme.dollarsPrice && !owned && !isAdmin) {
      Alert.alert('🔜 Coming Soon', `This premium theme pack will be available for purchase very soon!\n\nStay tuned! 🎮`, [{ text: 'Got it 👌' }]);
      return;
    }
    if (owned || isAdmin) {
      showAlert({ title: `Apply "${theme.name}"?`, message: `This will activate all ${(theme.includes || []).length} items of this theme on your profile.`, type: 'info',
        buttons: [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply Theme 🎨', onPress: async () => {
          await saveProfile({
            equippedProfileBg: theme.includes?.[0],
            equippedProfileBanner: theme.includes?.[1],
            equippedProfileBadge: theme.includes?.[2],
            equippedCardBorder: theme.includes?.[3],
            equippedUsernameEffect: theme.includes?.[4],
          });
          showAlert({ title: '✅ Theme Applied!', message: `"${theme.name}" is live on your profile!`, type: 'success' });
        }}] });
    }
  };

  // ─── Comment frame owned check ─────────────────────────────────────────────
  const commentFrameOwned = (frame) => frame.free || frame.pointsPrice === 0 || (userProfile?.ownedCommentFrames || []).includes(frame.id) || (frame.legendaryFree && userPlan === 'legendary');

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      {loading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      )}

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Shop 🛍️</Text>
          <Text style={s.headerSub}>Customize your profile</Text>
          {isAdmin && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, backgroundColor: 'rgba(255,45,85,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Ionicons name="shield-checkmark" size={10} color="#FF2D55" />
              <Text style={{ fontSize: 9, color: '#FF2D55', fontWeight: '900', marginLeft: 4 }}>ADMIN — All items free</Text>
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={s.pointsBadge}>
            <Ionicons name="star" size={14} color={COLORS.gold} />
            <Text style={s.pointsText}>{gaPoints.toLocaleString()}</Text>
            <Text style={s.pointsLabel}> pts</Text>
          </View>
          {userPlan === 'legendary' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Ionicons name="shield" size={11} color={COLORS.gold} />
              <Text style={{ fontSize: 10, color: COLORS.gold, fontWeight: '800', marginLeft: 3 }}>Legendary</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('Purchases')} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Ionicons name="bag-outline" size={13} color={COLORS.gold} />
            <Text style={{ fontSize: 10, color: COLORS.gold, fontWeight: '700', marginLeft: 3 }}>My Purchases</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Earn banner */}
      <View style={s.earnBanner}>
        <Ionicons name="information-circle-outline" size={14} color={COLORS.blue} />
        <Text style={s.earnText}>
          Earn points: +25 per clip · +2 per GG · +1 per follower · daily login bonus
        </Text>
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => handleCategoryChange(c.id)} style={[s.catChip, category === c.id && s.catChipActive]}>
            <Ionicons name={c.icon} size={12} color={category === c.id ? COLORS.black : COLORS.gray} />
            <Text style={[s.catChipText, category === c.id && s.catChipTextActive]}> {c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Price filter — sauf gift_cards */}
      {category !== 'gift_cards' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 10, paddingTop: 4, gap: 8 }}>
          {PRICE_FILTERS.map(f => (
            <TouchableOpacity key={f.id} onPress={() => setPriceFilter(f.id)}
              style={[s.priceChip, priceFilter === f.id && s.priceChipActive]}>
              <Text style={[s.priceChipText, priceFilter === f.id && s.priceChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ─── AVATAR FRAMES ─── */}
      {category === 'avatar_frames' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <ChampionBanner type="avatar" />
          <View style={s.grid}>
            {[...FRAMES].filter(f => !f.exclusive).filter(frame => {
              const owned = frame.free || ownedFrames.includes(frame.id);
              if (priceFilter === 'owned') return owned;
              if (priceFilter === 'free') return frame.free;
              if (priceFilter === 'points') return frame.pointsPrice > 0 && !frame.dollarsPrice;
              if (priceFilter === 'dollars') return !!frame.dollarsPrice;
              if (priceFilter === 'legendary') return false;
              return true;
            }).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)).map((frame) => {
              const isEquipped = equippedFrame === frame.id;
              const isOwned = frame.free || ownedFrames.includes(frame.id);
              return (
                <TouchableOpacity key={frame.id} onPress={() => handleAvatarFrame(frame)} activeOpacity={0.85}
                  style={[s.frameCard, isEquipped && { borderColor: frame.color === COLORS.gray3 ? COLORS.gold : frame.color, borderWidth: 1.5 }]}>
                  <View style={s.framePreviewWrap}>
                    <AvatarFramePreview frame={frame} avatar={userProfile?.avatar} username={userProfile?.username} size={54} />
                    {isEquipped && <View style={[s.statusDot, { backgroundColor: COLORS.green }]}><Ionicons name="checkmark" size={9} color={COLORS.black} /></View>}
                    {isOwned && !isEquipped && !frame.free && <View style={[s.statusDot, { backgroundColor: COLORS.blue }]}><Ionicons name="bag-check" size={9} color={COLORS.white} /></View>}
                  </View>
                  <Text style={s.frameName} numberOfLines={1}>{frame.name}</Text>
                  {isEquipped ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(0,200,83,0.15)', borderColor: COLORS.green }]}><Text style={[s.actionBtnText, { color: COLORS.green }]}>✓ EQUIPPED</Text></View>
                  ) : isOwned ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(0,212,255,0.1)', borderColor: COLORS.blue }]}><Text style={[s.actionBtnText, { color: COLORS.blue }]}>TAP TO EQUIP</Text></View>
                  ) : frame.animated ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(255,45,85,0.1)', borderColor: '#FF2D55' }]}><Ionicons name="flash" size={10} color="#FF2D55" /><Text style={[s.actionBtnText, { color: '#FF2D55', marginLeft: 3 }]}>CA${frame.dollarsPrice?.toFixed(2)}</Text></View>
                  ) : (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}><Ionicons name="star" size={10} color={COLORS.gold} /><Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>{frame.pointsPrice} pts</Text></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ─── PROFILE BACKGROUNDS ─── */}
      {category === 'profile_bg' && (
        <CosmeticGrid items={PROFILE_BACKGROUNDS} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(PROFILE_BACKGROUNDS.filter(b => b.free).map(b => b.id))]}
          equippedId={userProfile?.equippedProfileBg}
          onPress={handleCosmetic}
          renderPreview={(item) => <BgPreview cosmetic={item} />}
          isAdmin={isAdmin}
          infoText="🎨 Profile backgrounds replace the dark black on your profile page — the area behind all your clips and info. Visible to everyone who visits your profile." />
      )}

      {/* ─── BANNERS ─── */}
      {category === 'banners' && (
        <CosmeticGrid items={PROFILE_BANNERS} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(PROFILE_BANNERS.filter(b => b.free).map(b => b.id))]}
          equippedId={userProfile?.equippedProfileBanner}
          onPress={handleCosmetic}
          renderPreview={(item) => <BannerPreview cosmetic={item} />}
          isAdmin={isAdmin}
          infoText="🖼️ Banners are the large image zone at the very top of your profile (above your avatar). The biggest visual on your page — first thing anyone sees." />
      )}

      {/* ─── PROFILE BADGES / TITLES ─── */}
      {category === 'badges' && (
        <CosmeticGrid items={PROFILE_BADGES} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(PROFILE_BADGES.filter(b => b.free).map(b => b.id))]}
          equippedId={userProfile?.equippedProfileBadge}
          onPress={handleCosmetic}
          renderPreview={(item) => <BadgePreview cosmetic={item} />}
          isAdmin={isAdmin}
          infoText="🏅 Titles/Badges appear as a small colored tag under your username on your profile AND in comments. Show the community your identity." />
      )}

      {/* ─── USERNAME EFFECTS ─── */}
      {category === 'username_fx' && (
        <CosmeticGrid items={USERNAME_EFFECTS} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(USERNAME_EFFECTS.filter(u => u.free).map(u => u.id))]}
          equippedId={userProfile?.equippedUsernameEffect}
          onPress={handleCosmetic}
          renderPreview={(item) => <UsernamePreview cosmetic={item} />}
          infoText="✨ Username effects change the color and glow of your name on your profile page. Animated versions pulse with light. Visible on your profile header." />
      )}

      {/* ─── CARD BORDERS ─── */}
      {category === 'card_borders' && (
        <CosmeticGrid items={CARD_BORDERS} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(CARD_BORDERS.filter(c => c.free).map(c => c.id))]}
          equippedId={userProfile?.equippedCardBorder}
          onPress={handleCosmetic}
          renderPreview={(item) => <CardBorderPreview cosmetic={item} />}
          isAdmin={isAdmin}
          infoText="🃏 Card borders appear on the mini-card when people tap your username in comments or see your profile chip in the feed — the small square frame around your avatar." />
      )}

      {/* ─── THEMES ─── */}
      {category === 'themes' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={s.infoBanner}>
            <Ionicons name="sparkles-outline" size={14} color={COLORS.gold} />
            <Text style={s.infoText}>🔥 Themes are complete profile packs — background, banner, title, card border and username effect all at once. Best value.</Text>
          </View>
          <View style={s.grid}>
            {PROFILE_THEMES.filter(theme => {
              if (priceFilter === 'dollars') return !!theme.dollarsPrice;
              if (priceFilter === 'owned') return ownedCosmetics.includes(theme.id);
              return true;
            }).map(theme => {
              const owned = ownedCosmetics.includes(theme.id);
              return (
                <TouchableOpacity key={theme.id} onPress={() => handleTheme(theme, owned)} activeOpacity={0.85}
                  style={[s.frameCard, { width: '100%' }, owned && { borderColor: COLORS.gold + '60', borderWidth: 1 }]}>
                  <View style={[s.framePreviewWrap, { height: 100 }]}>
                    <ThemePreview cosmetic={theme} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                    <Text style={[s.frameName, { textAlign: 'left' }]}>{theme.name}</Text>
                    <RarityBadge rarity={theme.rarity || 'legendary'} />
                  </View>
                  <Text style={[s.frameDesc, { textAlign: 'left' }]}>{theme.desc}</Text>
                  <Text style={{ fontSize: 10, color: COLORS.gray2, marginBottom: 6 }}>Includes {(theme.includes || []).length} items</Text>
                  {owned ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold }]}><Text style={[s.actionBtnText, { color: COLORS.gold }]}>🎨 APPLY THEME</Text></View>
                  ) : (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(255,45,85,0.1)', borderColor: '#FF2D55' }]}><Ionicons name="flash" size={10} color="#FF2D55" /><Text style={[s.actionBtnText, { color: '#FF2D55', marginLeft: 3 }]}>CA${theme.dollarsPrice?.toFixed(2)}</Text></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ─── VIDEO FRAMES ─── */}
      {category === 'video_frames' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={s.infoBanner}>
            <Ionicons name="videocam-outline" size={14} color={COLORS.gold} />
            <Text style={s.infoText}>Video frames appear as a border around your clips in the feed.</Text>
          </View>
          <ChampionBanner type="video" />
          <View style={s.grid}>
            {[...VIDEO_FRAMES].filter(f => !f.exclusive).filter(frame => {
              const owned = frame.free || ownedVideoFrames.includes(frame.id);
              if (priceFilter === 'owned') return owned;
              if (priceFilter === 'free') return frame.free;
              if (priceFilter === 'points') return frame.pointsPrice > 0 && !frame.dollarsPrice;
              if (priceFilter === 'dollars') return !!frame.dollarsPrice;
              return true;
            }).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)).map((frame) => {
              const isOwned = frame.free || ownedVideoFrames.includes(frame.id);
              return (
                <TouchableOpacity key={frame.id} onPress={() => handleVideoFrame(frame)} activeOpacity={0.85}
                  style={[s.frameCard, isOwned && { borderColor: frame.color + '60', borderWidth: 1 }]}>
                  <View style={s.framePreviewWrap}><VideoFramePreview frame={frame} /></View>
                  <Text style={s.frameName} numberOfLines={1}>{frame.name}</Text>
                  {isOwned ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(0,212,255,0.1)', borderColor: COLORS.blue }]}><Text style={[s.actionBtnText, { color: COLORS.blue }]}>✓ OWNED</Text></View>
                  ) : frame.animated ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(255,45,85,0.1)', borderColor: '#FF2D55' }]}><Ionicons name="flash" size={10} color="#FF2D55" /><Text style={[s.actionBtnText, { color: '#FF2D55', marginLeft: 3 }]}>CA${frame.dollarsPrice?.toFixed(2)}</Text></View>
                  ) : (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}><Ionicons name="star" size={10} color={COLORS.gold} /><Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>{frame.pointsPrice} pts</Text></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ─── COMMENT FRAMES ─── */}
      {category === 'comment_frames' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={[s.infoBanner, { marginBottom: 12 }]}>
            <Text style={s.infoText}>💬 Comment Frames add a glowing border around your comments — visible to everyone!</Text>
          </View>
          <ChampionBanner type="comment" />
          <View style={s.grid}>
            {[...COMMENT_FRAMES].filter(f => !f.exclusive).filter(frame => {
              const owned = commentFrameOwned(frame);
              if (priceFilter === 'owned') return owned;
              if (priceFilter === 'free') return frame.free || frame.pointsPrice === 0;
              if (priceFilter === 'points') return frame.pointsPrice > 0 && !frame.dollarsPrice;
              if (priceFilter === 'dollars') return !!frame.dollarsPrice;
              if (priceFilter === 'legendary') return frame.legendaryFree;
              return true;
            }).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)).map((frame) => {
              const owned = commentFrameOwned(frame);
              const equipped = userProfile?.equippedCommentFrame === frame.id;
              return (
                <TouchableOpacity key={frame.id} activeOpacity={0.85}
                  style={[s.frameCard, equipped && { borderColor: frame.color || COLORS.gold, borderWidth: 1.5 }]}
                  onPress={() => handleCommentFrame(frame, owned)}>
                  <View style={s.framePreviewWrap}><CommentBubblePreview frame={frame} /></View>
                  <Text style={s.frameName}>{frame.name}</Text>
                  {frame.exclusive ? <Text style={s.exclusiveLabel}>🏆 Champion only</Text>
                    : owned ? <View style={[s.actionBtn, { backgroundColor: equipped ? 'rgba(201,168,76,0.15)' : 'rgba(0,212,255,0.1)', borderColor: equipped ? COLORS.gold : COLORS.blue }]}><Text style={[s.actionBtnText, { color: equipped ? COLORS.gold : COLORS.blue }]}>{equipped ? '✓ EQUIPPED' : 'TAP TO EQUIP'}</Text></View>
                    : frame.animated ? <View style={[s.actionBtn, { backgroundColor: 'rgba(255,45,85,0.1)', borderColor: '#FF2D55' }]}><Text style={[s.actionBtnText, { color: '#FF2D55' }]}>CA${frame.dollarsPrice?.toFixed(2)}</Text></View>
                    : <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}><Ionicons name="star" size={10} color={COLORS.gold} /><Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>{frame.pointsPrice} pts</Text></View>
                  }
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ─── GIFT CARDS ─── */}
      {category === 'gift_cards' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={s.infoBanner}>
            <Ionicons name="gift-outline" size={14} color={COLORS.gold} />
            <Text style={s.infoText}>Redeem your GA Points for real gift cards! Earn by playing and engaging with the community.</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('GiftCards')} style={{ marginHorizontal: 14, marginTop: 8, padding: 18, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.gold + '40', flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="gift" size={32} color={COLORS.gold} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.white }}>Gift Cards 🎁</Text>
              <Text style={{ fontSize: 12, color: COLORS.gray, marginTop: 3 }}>PSN, Xbox, Steam — CA$10 to CA$100</Text>
              <Text style={{ fontSize: 11, color: COLORS.gold, marginTop: 4, fontWeight: '700' }}>Your balance: {gaPoints.toLocaleString()} pts →</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.gold} />
          </TouchableOpacity>
          <View style={{ marginHorizontal: 14, marginTop: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.white, marginBottom: 12 }}>How to earn GA Points</Text>
            {GIFT_CARD_EARN.map((c, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  {typeof c.icon === 'string' && c.icon.startsWith('cloud') || c.icon === 'star-outline' || c.icon === 'person-add-outline'
                    ? <Ionicons name={c.icon} size={16} color={c.color || COLORS.gold} />
                    : <Text style={{ fontSize: 16 }}>{c.icon}</Text>}
                  <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '700', marginLeft: 10 }}>{c.action}</Text>
                </View>
                <Text style={{ color: COLORS.gold, fontSize: 11, fontWeight: '800' }}>{c.pts}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white },
  headerSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  pointsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.gold },
  pointsText: { fontSize: 15, color: COLORS.gold, fontWeight: '800', marginLeft: 5 },
  pointsLabel: { fontSize: 11, color: COLORS.gray },
  earnBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 8, padding: 10, backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.blue + '40' },
  earnText: { flex: 1, fontSize: 10, color: COLORS.gray, marginLeft: 7, lineHeight: 14 },
  catRow: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, height: 34 },
  catChipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  catChipText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  catChipTextActive: { color: COLORS.black, fontWeight: '800' },
  priceChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: COLORS.gray3, backgroundColor: COLORS.card, height: 38, justifyContent: 'center' },
  priceChipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  priceChipText: { fontSize: 12, color: COLORS.gray, fontWeight: '700' },
  priceChipTextActive: { color: COLORS.gold, fontWeight: '900' },
  infoBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 12, padding: 11, backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  infoText: { flex: 1, fontSize: 11, color: COLORS.gray, marginLeft: 8, lineHeight: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, justifyContent: 'space-between' },
  frameCard: { width: ITEM_W, backgroundColor: COLORS.card, borderRadius: 14, padding: 10, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 12, alignItems: 'center' },
  framePreviewWrap: { height: 90, width: '100%', alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative' },
  statusDot: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.card },
  frameName: { fontSize: 12, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginBottom: 3 },
  frameDesc: { fontSize: 10, color: COLORS.gray, marginBottom: 6, textAlign: 'center', lineHeight: 13 },
  framePrice: { fontSize: 11, color: COLORS.gray, textAlign: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingVertical: 6, borderWidth: 0.5, borderColor: COLORS.gray3 },
  actionBtnText: { fontSize: 10, color: COLORS.white, fontWeight: '700' },
  exclusiveLabel: { fontSize: 10, color: COLORS.gray2, fontWeight: '700', textAlign: 'center', paddingVertical: 6 },
});

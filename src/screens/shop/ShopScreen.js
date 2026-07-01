import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  Dimensions, Alert, ActivityIndicator, Animated, Easing, Image,
  Platform, InteractionManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, runTransaction, addDoc, collection, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { FRAMES, VIDEO_FRAMES, COMMENT_FRAMES } from '../../constants/frames';
import { isFreebieCosmetic } from '../../constants/cosmeticAccess';
import {
  PROFILE_BACKGROUNDS, PROFILE_BANNERS, USERNAME_EFFECTS,
  PROFILE_BADGES, PROFILE_THEMES,
  RARITY_CONFIG, canAccessCosmetic, getCosmeticPrice,
} from '../../constants/cosmetics';
import { ElectricRing, ElectricBorder, RotatingElectricRing } from '../../components/ElectricEffect';
import useAuthStore from '../../store/useAuthStore';
import { showAlert } from '../../store/useAlertStore';
import { db } from '../../config/firebase';
import { PRODUCT_IDS, cosmeticProductId, purchaseNonConsumable } from '../../hooks/useRevenueCat';
import PurchaseSuccessOverlay from '../../components/PurchaseSuccessOverlay';

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

// ─── Streak level helpers ─────────────────────────────────────────────────────
const STREAK_ORDER = ['noob', 'bronze', 'silver', 'gold', 'goat'];
const STREAK_LABEL = { noob: 'Noob', bronze: '🥉 Bronze', silver: '🥈 Silver', gold: '🥇 Gold', goat: '🐐 GOAT' };
const STREAK_LABEL_SHORT = { noob: 'Noob', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', goat: 'GOAT' };
const STREAK_COLOR = { noob: '#888899', bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', goat: '#FF2D55' };
const STREAK_PTS   = { noob: 0, bronze: 500, silver: 2000, gold: 5000, goat: 15000 };
function streakLocked(item, userStreakLevel) {
  if (!item.streakRequired) return false;
  const req = STREAK_ORDER.indexOf(item.streakRequired);
  const cur = STREAK_ORDER.indexOf(userStreakLevel || 'noob');
  return cur < req;
}

// ─── Price tag ────────────────────────────────────────────────────────────────
function PriceTag({ cosmetic, userPlan, owned, equipped = false, userStreakLevel }) {
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
  // Streak lock — show required level + pts threshold
  if (cosmetic.streakRequired && streakLocked(cosmetic, userStreakLevel)) {
    const req = cosmetic.streakRequired;
    const rc = STREAK_COLOR[req] || '#FF9500';
    return (
      <View style={{ gap: 3, width: '100%' }}>
        <View style={[s.actionBtn, { backgroundColor: rc + '18', borderColor: rc, justifyContent: 'center' }]}>
          <Ionicons name="lock-closed" size={10} color={rc} />
          <Text style={[s.actionBtnText, { color: rc, marginLeft: 3 }]}>
            {STREAK_LABEL_SHORT[req]} requis
          </Text>
        </View>
        <Text style={{ fontSize: 8, color: COLORS.gray2, textAlign: 'center', width: '100%' }}>
          {STREAK_PTS[req].toLocaleString()} streak pts · {cosmetic.pointsPrice} pts
        </Text>
      </View>
    );
  }
  if (cosmetic.exclusive) return (
    <Text style={s.exclusiveLabel}>🔒 EARNED</Text>
  );
  if (cosmetic.legendaryFree && userPlan === 'legendary') return (
    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold }]}>
      <Ionicons name="shield" size={10} color={COLORS.gold} />
      <Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>Legendary ✓</Text>
    </View>
  );
  if (cosmetic.dollarsPrice && isFreebieCosmetic(cosmetic) && userPlan !== 'legendary') return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}>
        <Ionicons name="card" size={10} color="#30D158" />
        <Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(cosmetic.dollarsPrice).toFixed(2)}</Text>
      </View>
      <Text numberOfLines={1} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 7.5, color: COLORS.gold, fontWeight: '800', textAlign: 'center' }}>👑 FREE WITH LEGENDARY</Text>
    </View>
  );
  if (cosmetic.dollarsPrice) return (
    <View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}>
      <Ionicons name="card" size={10} color="#30D158" />
      <Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(cosmetic.dollarsPrice).toFixed(2)}</Text>
    </View>
  );
  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}>
        <Ionicons name="star" size={10} color={COLORS.gold} />
        <Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>{cosmetic.pointsPrice} pts</Text>
      </View>
      {isFreebieCosmetic(cosmetic) && userPlan !== 'legendary' && (
        <Text numberOfLines={1} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 7.5, color: COLORS.gold, fontWeight: '800', textAlign: 'center' }}>👑 FREE WITH LEGENDARY</Text>
      )}
    </View>
  );
}

// ─── Background Preview ───────────────────────────────────────────────────────
function BgPreview({ cosmetic }) {
  const colors = cosmetic.colors || ['#0A0A0F'];
  const pulse = React.useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    if (!cosmetic.animated) return;
    let task;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1,   duration: 1200, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
    ]));
    task = InteractionManager.runAfterInteractions(() => a.start());
    return () => { a.stop(); task?.cancel?.(); };
  }, [cosmetic.id]);
  const mainColor = colors[0];
  const accentColor = colors[colors.length - 1];
  return (
    <View style={{ width: '100%', height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: mainColor }}>
      {cosmetic.animated ? (
        <Animated.View style={{ flex: 1, opacity: pulse }}>
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
  const pulse = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    if (!cosmetic.animated) return;
    let task;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1,   duration: 1000, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
    ]));
    task = InteractionManager.runAfterInteractions(() => a.start());
    return () => { a.stop(); task?.cancel?.(); };
  }, [cosmetic.id]);
  const accentColor = colors[colors.length - 1];
  return (
    <View style={{ width: '100%', height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: colors[0] }}>
      {cosmetic.animated ? (
        <Animated.View style={{ flex: 1, opacity: pulse }}>
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
  const pulse = React.useRef(new Animated.Value(0.35)).current;
  const sweep = React.useRef(new Animated.Value(0)).current;
  const isShimmer = !!cosmetic.shimmer;
  const PREVIEW_W = 140; // approximate card content width

  React.useEffect(() => {
    if (!cosmetic.animated) return;
    let task;
    const pa = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1,    duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.35, duration: 600, useNativeDriver: true }),
    ]));
    let sa;
    if (isShimmer) {
      sa = Animated.loop(
        Animated.timing(sweep, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.linear })
      );
    }
    task = InteractionManager.runAfterInteractions(() => { pa.start(); sa?.start(); });
    return () => { pa.stop(); sa?.stop(); task?.cancel?.(); };
  }, [cosmetic.id, isShimmer]);

  const sweepTx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-40, PREVIEW_W + 40] });
  const mainColor = cosmetic.color || (Array.isArray(cosmetic.colors) && cosmetic.colors[0]) || COLORS.white;

  return (
    <View style={{ width: '100%', height: 80, borderRadius: 10, backgroundColor: '#0A0A1A', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {cosmetic.animated ? (
        <>
          <Animated.Text style={{ fontSize: 18, fontWeight: '900', color: mainColor, opacity: pulse,
            textShadowColor: mainColor, textShadowRadius: 9, textShadowOffset: { width:0, height:0 } }}>
            PLAYER
          </Animated.Text>
          {isShimmer && (
            <Animated.View style={{
              position: 'absolute', top: 0, bottom: 0, width: 28,
              backgroundColor: mainColor,
              opacity: 0.55,
              transform: [{ translateX: sweepTx }, { skewX: '-10deg' }],
            }} pointerEvents="none" />
          )}
        </>
      ) : (
        <Text style={{ fontSize: 18, fontWeight: '900', color: mainColor,
          textShadowColor: cosmetic.glow ? mainColor : 'transparent',
          textShadowRadius: cosmetic.glow ? 6 : 0 }}>
          PLAYER
        </Text>
      )}
      {cosmetic.animated && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: isShimmer ? '#C9A84C' : '#FF2D55', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 7, color: '#fff', fontWeight: '900' }}>{isShimmer ? 'SHIMMER' : 'ANIMATED'}</Text>
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


// ─── Theme Preview ────────────────────────────────────────────────────────────
// Theme color palettes — chaque theme a sa propre identité visuelle
// Palette par thème — règle : banner LUMINEUX, accent (contour) = même famille que le banner,
// bg = version DOUCE/foncée de la même couleur (jamais du noir). Cohérence totale par thème.
const THEME_PALETTES = {
  theme_champion:     { bg: '#2E2100', banner: '#FFD24A', accent: '#FFC21A', avatar: '#C9A84C', accent2: '#FF8C00' },
  theme_phantom:      { bg: '#1C0A30', banner: '#B15AFF', accent: '#A020F0', avatar: '#7C4DFF', accent2: '#E040FB' },
  theme_inferno:      { bg: '#2E0A00', banner: '#FF6A00', accent: '#FF3D00', avatar: '#FF6D00', accent2: '#FFB000' },
  theme_storm:        { bg: '#06202E', banner: '#22D0FF', accent: '#00B4E5', avatar: '#00D4FF', accent2: '#7C4DFF' },
  theme_cosmic:       { bg: '#120A2E', banner: '#9D5CFF', accent: '#7C4DFF', avatar: '#7C4DFF', accent2: '#E040FB' },
  theme_matrix:       { bg: '#032610', banner: '#00E63A', accent: '#00C030', avatar: '#00C853', accent2: '#39FF88' },
  // Nouveaux thèmes (2025)
  theme_sakura:       { bg: '#3D0F28', banner: '#FF7EC0', accent: '#FF4FA3', avatar: '#FF69B4', accent2: '#FF2D9D' },
  theme_cyber:        { bg: '#2A0A22', banner: '#FF2D9D', accent: '#FF0080', avatar: '#FF0080', accent2: '#00E5FF' },
  theme_arctic:       { bg: '#14203D', banner: '#9CB4FF', accent: '#6E88E0', avatar: '#A0C8E8', accent2: '#E0E8FF' },
  theme_void_walker:  { bg: '#16002E', banner: '#9D3BFF', accent: '#7C1FD0', avatar: '#7C4DFF', accent2: '#E040FB' },
  theme_neon_city:    { bg: '#06302B', banner: '#1FE0C8', accent: '#00C2A8', avatar: '#1FE0C8', accent2: '#FF6AD5' },
  // Thèmes 2026
  theme_white:        { bg: '#ECECF2', banner: '#FFFFFF', accent: '#B8B8C0', avatar: '#FFFFFF', accent2: '#888899' },
  theme_glacier:      { bg: '#0F3A55', banner: '#9AD8EA', accent: '#5BAEC8', avatar: '#A8DCEA', accent2: '#C8EEF8' },
  theme_konoha:       { bg: '#14260F', banner: '#4E8A34', accent: '#B89A2E', avatar: '#B89A2E', accent2: '#6EB84A' },
  theme_sunset_ember: { bg: '#2E1200', banner: '#FF8C42', accent: '#FF6A00', avatar: '#D45500', accent2: '#FFB000' },
};

function ThemePreview({ cosmetic }) {
  const pal = THEME_PALETTES[cosmetic.id] || { bg: '#0A0A0F', banner: '#1A1A1A', accent: '#C9A84C', avatar: '#888', accent2: '#C9A84C' };
  const pulse = React.useRef(new Animated.Value(0)).current;
  const shimmer = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    let task;
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.2, duration: 900, useNativeDriver: true }),
    ]));
    const s = cosmetic.animated
      ? Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 2000, useNativeDriver: true }))
      : null;
    task = InteractionManager.runAfterInteractions(() => { p.start(); s?.start(); });
    return () => { p.stop(); s?.stop(); task?.cancel?.(); };
  }, [cosmetic.id]);
  const glowO = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.7] });
  const shimX  = shimmer.interpolate({ inputRange: [0, 1], outputRange: ['-100%', '100%'] });
  return (
    <View style={{ width: '100%', height: 110, borderRadius: 12, overflow: 'hidden', backgroundColor: pal.bg,
      shadowColor: pal.accent, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width:0, height:0 } }}>
      {/* Bannière top avec dégradé simulé */}
      <View style={{ height: 50, backgroundColor: pal.banner }}>
        {/* Overlay accent animé */}
        {cosmetic.animated && (
          <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: pal.accent, opacity: glowO }} />
        )}
        {/* Shimmer band */}
        {cosmetic.animated && (
          <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 60,
            backgroundColor: pal.accent2, opacity: 0.35, transform: [{ translateX: shimX }] }} />
        )}
        {/* Stripe déco */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, backgroundColor: pal.accent }} />
        <View style={{ position: 'absolute', bottom: 2.5, left: 0, right: 0, height: 1, backgroundColor: pal.accent2, opacity: 0.5 }} />
        {/* Tag theme */}
        {cosmetic.isNew && (
          <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#FF2D55', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
            <Text style={{ fontSize: 6, color: '#fff', fontWeight: '900', letterSpacing: 0.5 }}>NEW</Text>
          </View>
        )}
      </View>
      {/* Avatar + info row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginTop: -16 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: pal.bg, borderWidth: 3, borderColor: pal.accent,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: pal.accent, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }}>
          <Text style={{ fontSize: 14 }}>🎮</Text>
        </View>
        <View style={{ marginLeft: 8, flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', color: pal.accent }}>{cosmetic.name.split(' ')[0].toUpperCase()}</Text>
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 3 }}>
            <View style={{ backgroundColor: pal.accent + '30', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: pal.accent + '60' }}>
              <Text style={{ fontSize: 7, color: pal.accent, fontWeight: '800' }}>PACK</Text>
            </View>
            {cosmetic.animated && (
              <Animated.View style={{ backgroundColor: pal.accent2 + '30', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
                borderWidth: 1, borderColor: pal.accent2, opacity: pulse.interpolate({ inputRange:[0,1], outputRange:[0.6,1] }) }}>
                <Text style={{ fontSize: 7, color: pal.accent2, fontWeight: '900' }}>✨ LIVE</Text>
              </Animated.View>
            )}
          </View>
        </View>
      </View>
      {/* Bottom glow line */}
      <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        backgroundColor: pal.accent, opacity: pulse.interpolate({ inputRange:[0,1], outputRange:[0.4,1] }) }} />
    </View>
  );
}

// ─── Avatar Frame Preview ────────────────────────────────────────────────────
function AnimatedRingPreview({ frame, size }) {
  const pulse  = React.useRef(new Animated.Value(0)).current;
  const spin   = React.useRef(new Animated.Value(0)).current;
  const spin2  = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    let task;
    const pulseAnim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    const spinAnim  = Animated.loop(Animated.timing(spin,  { toValue: 1, duration: 1800, useNativeDriver: true, easing: Easing.linear }));
    const spin2Anim = Animated.loop(Animated.timing(spin2, { toValue: 1, duration: 2600, useNativeDriver: true, easing: Easing.linear }));
    task = InteractionManager.runAfterInteractions(() => {
      pulseAnim.start(); spinAnim.start(); spin2Anim.start();
    });
    return () => { pulseAnim.stop(); spinAnim.stop(); spin2Anim.stop(); task?.cancel?.(); };
  }, []);
  // pulse goes 0.4→1, use directly as opacity
  const rotate    = spin.interpolate({ inputRange: [0,1], outputRange: ['0deg','360deg'] });
  const rotateRev = spin2.interpolate({ inputRange: [0,1], outputRange: ['0deg','-360deg'] });
  const outerSize = size + 14;
  const innerSize = size + 6;
  // Frames "glint" (sweep) = NON rotatif → juste halo + anneau pulsé (le reflet est ajouté à part).
  // Frames "shimmer"/"spinGlint" = anneau rotatif.
  const spinning = !frame.sweep;
  if (frame.animated) {
    return (
      <>
        {/* Outer glow halo */}
        <Animated.View style={{ position: 'absolute', width: outerSize + 6, height: outerSize + 6,
          borderRadius: (outerSize+6)/2, backgroundColor: frame.color, opacity: pulse.interpolate({ inputRange:[0.4,1], outputRange:[0.08, 0.22] }) }} />
        {spinning && (
          <>
            {/* Outer spinning arc */}
            <Animated.View style={{ position: 'absolute', width: outerSize, height: outerSize,
              borderRadius: outerSize/2, borderWidth: 3,
              borderColor: frame.color, borderTopColor: 'transparent', borderLeftColor: 'transparent',
              transform: [{ rotate }],
              shadowColor: frame.color, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width:0, height:0 } }} />
            {/* Inner counter-spinning arc */}
            <Animated.View style={{ position: 'absolute', width: innerSize, height: innerSize,
              borderRadius: innerSize/2, borderWidth: 2,
              borderColor: frame.color, borderBottomColor: 'transparent', borderRightColor: 'transparent',
              opacity: 0.7, transform: [{ rotate: rotateRev }] }} />
          </>
        )}
        {/* Solid ring (pulsing glow) — pour glint c'est l'anneau principal */}
        <Animated.View style={{ position: 'absolute', width: spinning ? innerSize : outerSize, height: spinning ? innerSize : outerSize,
          borderRadius: (spinning ? innerSize : outerSize)/2, borderWidth: spinning ? 1.5 : 2.5, borderColor: frame.color, opacity: pulse,
          shadowColor: frame.color, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width:0, height:0 } }} />
      </>
    );
  }
  return (
    <Animated.View style={{ position: 'absolute', width: outerSize, height: outerSize,
      borderRadius: outerSize/2, borderWidth: 3,
      borderColor: frame.color, opacity: pulse,
      shadowColor: frame.color, shadowOpacity: frame.glow ? 0.9 : 0.4, shadowRadius: frame.glow ? 8 : 4, shadowOffset: { width:0, height:0 } }} />
  );
}

// Reflet glint qui traverse l'avatar (frames sweep + spinGlint)
function GlintPreviewOverlay({ size, color }) {
  const sweep = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const a = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    const task = InteractionManager.runAfterInteractions(() => a.start());
    return () => { a.stop(); task?.cancel?.(); };
  }, []);
  const tx   = sweep.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.6, size * 1.1] });
  const opac = sweep.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 0.8, 0.3, 0] });
  return (
    <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }} pointerEvents="none">
      <Animated.View style={{
        position: 'absolute', top: -size * 0.3, bottom: -size * 0.3, width: Math.max(8, size * 0.28),
        backgroundColor: color, opacity: opac,
        transform: [{ translateX: tx }, { skewX: '-18deg' }],
      }} />
    </View>
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
      {(frame.sweep || frame.spinGlint) && <GlintPreviewOverlay size={size} color={frame.color} />}
    </View>
  );
}

function VideoFramePreview({ frame, size = 70 }) {
  const hasFrame = frame.id !== 'none';
  // All useNativeDriver: true — opacity, scale, translateY only
  const pulse  = React.useRef(new Animated.Value(0.6)).current;
  const scan   = React.useRef(new Animated.Value(0)).current;
  const flare  = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!frame.animated) return;
    let task;
    const pulseAnim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.6, duration: 800, useNativeDriver: true }),
    ]));
    const scanAnim = Animated.loop(Animated.sequence([
      Animated.timing(scan, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(scan, { toValue: 0, duration: 0,    useNativeDriver: true }),
      Animated.delay(500),
    ]));
    const flareAnim = Animated.loop(Animated.sequence([
      Animated.timing(flare, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(flare, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    task = InteractionManager.runAfterInteractions(() =>
      Animated.parallel([pulseAnim, scanAnim, flareAnim]).start()
    );
    return () => { pulseAnim.stop(); scanAnim.stop(); flareAnim.stop(); task?.cancel?.(); };
  }, [frame.id]);

  const h = size * 0.6;
  // Only opacity/transform — native driver compatible
  const animOpacity = pulse;   // border + fill pulse (opacity)
  const fillOpacity = pulse.interpolate({ inputRange: [0.6, 1], outputRange: [0.04, 0.12] });
  const scanTransY  = scan.interpolate({ inputRange: [0, 1], outputRange: [0, h] });
  const scanOpacity = scan.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 0.9, 0.4, 0] });
  const dotScale    = flare.interpolate({ inputRange: [0,1], outputRange: [1, 1.9] });
  const dotOpacity  = flare.interpolate({ inputRange: [0,1], outputRange: [0.5, 1] });

  return (
    <View style={{ width: size, height: h, borderRadius: 8, overflow: 'hidden', backgroundColor: '#07071a' }}>
      {/* Content */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="game-controller" size={22} color={hasFrame ? frame.color : COLORS.gray3} style={{ opacity: 0.35 }} />
      </View>

      {hasFrame && (
        frame.animated ? (
          <>
            {/* Static border + glow, opacity pulsing — shadow scales with opacity */}
            <Animated.View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 8, borderWidth: 3, borderColor: frame.color,
              opacity: animOpacity,
              shadowColor: frame.color, shadowOpacity: 1,
              shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
            }} />

            {/* Inner color fill pulse */}
            <Animated.View style={{
              position: 'absolute', top: 4, left: 4, right: 4, bottom: 4,
              borderRadius: 5, backgroundColor: frame.color, opacity: fillOpacity,
            }} />

            {/* Scan line — translateY (native) instead of top */}
            <Animated.View style={{
              position: 'absolute', left: 4, right: 4,
              top: 0, height: 2,
              backgroundColor: frame.color, opacity: scanOpacity,
              shadowColor: frame.color, shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
              transform: [{ translateY: scanTransY }],
            }} />

            {/* Corner brackets — static */}
            <View style={{ position: 'absolute', top: 3, left: 3, width: 12, height: 12, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderColor: frame.color }} />
            <View style={{ position: 'absolute', top: 3, right: 3, width: 12, height: 12, borderTopWidth: 2.5, borderRightWidth: 2.5, borderColor: frame.color }} />
            <View style={{ position: 'absolute', bottom: 3, left: 3, width: 12, height: 12, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderColor: frame.color }} />
            <View style={{ position: 'absolute', bottom: 3, right: 3, width: 12, height: 12, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderColor: frame.color }} />

            {/* Pulsing dot at each corner — scale + opacity (native) */}
            <Animated.View style={{ position: 'absolute', top: 1, left: 1, width: 5, height: 5, borderRadius: 2.5, backgroundColor: frame.color, opacity: dotOpacity, transform: [{ scale: dotScale }] }} />
            <Animated.View style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5, borderRadius: 2.5, backgroundColor: frame.color, opacity: dotOpacity, transform: [{ scale: dotScale }] }} />
            <Animated.View style={{ position: 'absolute', bottom: 1, left: 1, width: 5, height: 5, borderRadius: 2.5, backgroundColor: frame.color, opacity: dotOpacity, transform: [{ scale: dotScale }] }} />
            <Animated.View style={{ position: 'absolute', bottom: 1, right: 1, width: 5, height: 5, borderRadius: 2.5, backgroundColor: frame.color, opacity: dotOpacity, transform: [{ scale: dotScale }] }} />
          </>
        ) : (
          <>
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderWidth: 2.5, borderColor: frame.color, borderRadius: 8,
              opacity: frame.glow ? 0.9 : 0.7,
              shadowColor: frame.glow ? frame.color : 'transparent',
              shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
            }} />
            <View style={{ position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderTopWidth: 2, borderLeftWidth: 2, borderColor: frame.color }} />
            <View style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: frame.color }} />
            <View style={{ position: 'absolute', bottom: 3, left: 3, width: 8, height: 8, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: frame.color }} />
            <View style={{ position: 'absolute', bottom: 3, right: 3, width: 8, height: 8, borderBottomWidth: 2, borderRightWidth: 2, borderColor: frame.color }} />
          </>
        )
      )}
    </View>
  );
}

function CommentBubblePreview({ frame }) {
  // All useNativeDriver: true — opacity, scale, translateX only
  const pulse   = React.useRef(new Animated.Value(0.5)).current;
  const shimmer = React.useRef(new Animated.Value(0)).current;
  const spark   = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!frame.animated) return;
    let task;
    const pulseAnim = Animated.loop(Animated.sequence([
      Animated.timing(pulse,   { toValue: 1,   duration: 700, useNativeDriver: true }),
      Animated.timing(pulse,   { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    const shimmerAnim = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 0,    useNativeDriver: true }),
      Animated.delay(350),
    ]));
    const sparkAnim = Animated.loop(Animated.sequence([
      Animated.timing(spark,   { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(spark,   { toValue: 0, duration: 480, useNativeDriver: true }),
    ]));
    task = InteractionManager.runAfterInteractions(() =>
      Animated.parallel([pulseAnim, shimmerAnim, sparkAnim]).start()
    );
    return () => { pulseAnim.stop(); shimmerAnim.stop(); sparkAnim.stop(); task?.cancel?.(); };
  }, [frame.id]);

  // translateX instead of left — native driver compatible
  const shimmerTransX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-50, 270] });
  const shimmerOpac   = shimmer.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 0.7, 0.25, 0] });
  const dotScale      = spark.interpolate({ inputRange: [0,1], outputRange: [0.7, 1.6] });
  const dotOpacity    = spark.interpolate({ inputRange: [0,1], outputRange: [0.3, 1  ] });
  const dotScale2     = spark.interpolate({ inputRange: [0,1], outputRange: [1.5, 0.7] });

  const baseStyle = { width: '100%', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: COLORS.black };

  if (frame.animated) {
    return (
      // Static border + shadow — opacity of the glow overlay pulses instead
      <View style={[baseStyle, {
        borderWidth: 2.5, borderColor: frame.color,
        shadowColor: frame.color, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85, shadowRadius: 16,
        overflow: 'hidden',
      }]}>
        {/* Pulsing glow overlay (opacity only — native) */}
        <Animated.View style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
          borderRadius: 10, borderWidth: 2, borderColor: frame.color,
          opacity: pulse,
        }} pointerEvents="none" />

        {/* Shimmer sweep — translateX (native) instead of left */}
        <Animated.View style={{
          position: 'absolute', top: 0, bottom: 0,
          left: -50, width: 38,
          backgroundColor: frame.color, opacity: shimmerOpac,
          transform: [{ translateX: shimmerTransX }, { skewX: '-18deg' }],
        }} />

        {/* Content row 1 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 10, color: COLORS.gold, fontWeight: '800' }}>YOU ⚡</Text>
          <Animated.View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: frame.color, opacity: dotOpacity, transform: [{ scale: dotScale }] }} />
        </View>
        {/* Content row 2 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
          <Text style={{ fontSize: 11, color: COLORS.white }}>Sample comment 🔥</Text>
          <Animated.View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: frame.color, opacity: dotOpacity, transform: [{ scale: dotScale2 }] }} />
        </View>
      </View>
    );
  }

  return (
    <View style={[baseStyle, {
      borderWidth: frame.id === 'none' ? 1 : 2,
      borderColor: frame.id === 'none' ? COLORS.gray3 : frame.color,
      shadowColor: frame.glow ? frame.color : 'transparent',
      shadowOffset: { width: 0, height: 0 }, shadowOpacity: frame.glow ? 0.7 : 0, shadowRadius: 6,
    }]}>
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
function CosmeticGrid({ items, priceFilter, userPlan, ownedCosmetics, equippedId, onPress, renderPreview, infoText, isAdmin = false, userStreakLevel }) {
  const allOwned = isAdmin ? items.map(i => i.id) : ownedCosmetics;
  const tier = (item) => item.animated ? 2 : item.glow && item.dollarsPrice ? 1 : item.glow ? 0.5 : 0;
  const filtered = items.filter(item => {
    if (priceFilter === 'owned') return canAccessCosmetic(item, userPlan, allOwned) && !item.exclusive;
    if (priceFilter === 'free') return item.free;
    if (priceFilter === 'points') return item.pointsPrice > 0 && !item.dollarsPrice;
    if (priceFilter === 'legendary') return item.legendaryFree;
    if (priceFilter === 'dollars') return !!item.dollarsPrice;
    return true;
  }).sort((a, b) => {
    // Tri par prix croissant : gratuits → points (croissant) → argent (croissant)
    const key = (x) => x.free ? 0 : (x.dollarsPrice ? 100000 + Number(x.dollarsPrice) * 100 : Number(x.pointsPrice || 0));
    const kd = key(a) - key(b);
    return kd !== 0 ? kd : tier(a) - tier(b);
  });

  return (
    <FlatList
      data={filtered}
      numColumns={2}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 120 }}
      columnWrapperStyle={{ paddingHorizontal: 14, justifyContent: 'space-between' }}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={true}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      windowSize={5}
      ListHeaderComponent={infoText ? (
        <View style={s.infoBanner}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.gold} />
          <Text style={s.infoText}>{infoText}</Text>
        </View>
      ) : null}
      ListEmptyComponent={(
        <View style={{ width: '100%', paddingVertical: 40, alignItems: 'center' }}>
          <Text style={{ color: COLORS.gray, fontSize: 13 }}>No items in this filter</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const owned = isAdmin || canAccessCosmetic(item, userPlan, allOwned);
        const comingSoon = Platform.OS !== 'ios' && !!item.dollarsPrice; // Android: achats $ pas encore dispo
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[s.frameCard, owned && !comingSoon && { borderColor: (item.color || COLORS.gold) + '80', borderWidth: 1.5 }]}
            onPress={() => onPress(item, owned)}
          >
            <View style={s.framePreviewWrap}>
              {renderPreview(item)}
              {comingSoon && (
                <View style={s.comingSoonOverlay}>
                  <Text style={s.comingSoonIcon}>🔜</Text>
                  <Text style={s.comingSoonText}>Soon</Text>
                </View>
              )}
            </View>
            <RarityBadge rarity={item.rarity || 'common'} />
            <Text style={s.frameName} numberOfLines={1}>{item.name}</Text>
            <Text style={s.frameDesc} numberOfLines={2}>{item.desc || item.preview || ''}</Text>
            {comingSoon ? (
              <View style={[s.actionBtn, { backgroundColor: 'rgba(120,120,140,0.15)', borderColor: 'rgba(120,120,140,0.4)' }]}>
                <Ionicons name="time-outline" size={10} color={COLORS.gray} />
                <Text style={[s.actionBtnText, { color: COLORS.gray, marginLeft: 3 }]}>Coming soon</Text>
              </View>
            ) : (
              <PriceTag cosmetic={item} userPlan={userPlan} owned={owned} equipped={equippedId === item.id} userStreakLevel={userStreakLevel} />
            )}
          </TouchableOpacity>
        );
      }}
    />
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
// ─── Guest Wall ───────────────────────────────────────────────────────────────
function GuestShopWall() {
  const navigation = useNavigation();
  const exitGuest = useAuthStore((s) => s.exitGuestMode);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background || '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <StatusBar style="light" />
      <Text style={{ fontSize: 52, marginBottom: 16 }}>🛒</Text>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 }}>
        Boutique Gaming Actions
      </Text>
      <Text style={{ color: '#aaa', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 36 }}>
        Crée un compte gratuit pour accéder aux cadres, cosmétiques, abonnements et bien plus.
      </Text>
      <TouchableOpacity
        onPress={() => exitGuest()}
        style={{ backgroundColor: '#7B2FFF', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginBottom: 14, width: '100%', alignItems: 'center' }}
        activeOpacity={0.85}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Créer un compte gratuit 🎮</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Text style={{ color: '#666', fontSize: 14, marginTop: 4 }}>Retour</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ShopScreen() {
  const navigation = useNavigation();
  const { user, userProfile, saveProfile, isGuest } = useAuthStore();
  const [category, setCategory] = useState('avatar_frames');
  const [loading, setLoading] = useState(false);
  const [priceFilter, setPriceFilter] = useState('all');
  const [successItem, setSuccessItem] = useState(null); // overlay "achat réussi"
  // Lazy render — content mounts only after InteractionManager settles on each tab switch
  const [renderReady, setRenderReady] = React.useState(false);
  React.useEffect(() => {
    setRenderReady(false);
    const task = InteractionManager.runAfterInteractions(() => setRenderReady(true));
    return () => task.cancel();
  }, [category]);

  // Full guest wall — no shop access whatsoever (hooks all declared above)
  if (isGuest) return <GuestShopWall />;

  const isAdmin = userProfile?.accountType === 'gameconic' || userProfile?.accountType === 'admin'
    || userProfile?.accountType === 'board' || !!userProfile?.isAdmin;
  const gaPoints         = userProfile?.gaPoints || 0;
  const userPlan         = userProfile?.plan || 'free';
  const equippedFrame    = userProfile?.equippedFrame || 'none';
  const ownedFrames      = userProfile?.ownedFrames || ['none'];
  const ownedVideoFrames = userProfile?.ownedVideoFrames || ['none'];
  const ownedCosmetics   = userProfile?.ownedCosmetics || [];

  // Reset price filter when changing category
  const handleCategoryChange = (id) => { setCategory(id); /* Keep priceFilter — user set it intentionally */ };

  // ─── Achat en argent réel (RevenueCat / App Store) ─────────────────────────
  // Affiche une confirmation, lance l'achat IAP, et exécute onOwned() au succès.
  // onOwned doit écrire la possession + l'équipement (comme le chemin points).
  const buyWithMoney = async (item, productId, category, onOwned) => {
    // Android: achats en argent réel pas encore disponibles (Google Play Billing à venir).
    if (Platform.OS !== 'ios') {
      showAlert({ title: 'Coming soon', message: 'Paid items aren\'t available on Android yet. Stay tuned!', type: 'info' });
      return;
    }
    const price = Number(item.dollarsPrice || 0).toFixed(2);
    showAlert({
      title: `Buy "${item.name}"?`,
      message: `Price: CA$${price}\nSecure payment via the App Store.`,
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: `Buy — CA$${price}`, onPress: async () => {
          setLoading(true);
          const res = await purchaseNonConsumable(user.uid, productId, {
            itemId: item.id, category, amountCAD: item.dollarsPrice, name: item.name,
          });
          setLoading(false);
          if (res.success) {
            try { await onOwned(); } catch (e) {}
            setSuccessItem(item.name);
          } else if (res.cancelled) {
            /* purchase cancelled by user — silent */
          } else {
            showAlert({ title: 'Purchase failed', message: res.error || 'Please try again in a moment.', type: 'danger' });
          }
        }},
      ],
    });
  };

  // ─── Avatar frame handlers ─────────────────────────────────────────────────
  const handleAvatarFrame = async (frame) => {
    if (frame.exclusive) return Alert.alert('Exclusive 🔒', 'Awarded automatically.');
    if (frame.free || frame.id === 'none') { await _equipAvatarFrame(frame.id); return; }
    const owned = ownedFrames.includes(frame.id) || (userPlan === 'legendary' && isFreebieCosmetic(frame));
    if (owned) { await _equipAvatarFrame(equippedFrame === frame.id ? 'none' : frame.id); return; }
    if (frame.dollarsPrice && !isAdmin) {
      await buyWithMoney(frame, PRODUCT_IDS.frame(frame.id), 'avatar_frame', async () => {
        const newOwned = [...new Set([...ownedFrames, frame.id])];
        await saveProfile({ ownedFrames: newOwned, equippedFrame: frame.id });
      });
      return;
    }
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
    const legendaryFreebie = userPlan === 'legendary' && isFreebieCosmetic(frame);
    const owned = ownedVideoFrames.includes(frame.id) || legendaryFreebie;
    if (owned) { showAlert({ title: legendaryFreebie && !ownedVideoFrames.includes(frame.id) ? 'Included with Legendary ⭐' : 'Already owned ✓', message: `"${frame.name}" is available when uploading.`, type: 'info' }); return; }
    if (frame.dollarsPrice && !isAdmin) {
      await buyWithMoney(frame, PRODUCT_IDS.videoFrame(frame.id), 'video_frame', async () => {
        await saveProfile({ ownedVideoFrames: [...new Set([...ownedVideoFrames, frame.id])] });
      });
      return;
    }
    // Admin bypass — unlock for free
    if (isAdmin) {
      setLoading(true);
      await saveProfile({ ownedVideoFrames: [...new Set([...ownedVideoFrames, frame.id])] });
      setLoading(false);
      showAlert({ title: '🧪 Unlocked! (admin)', message: `"${frame.name}" is now available when uploading.`, type: 'success' });
      return;
    }
    if (gaPoints < frame.pointsPrice) return showAlert({ title: 'Not enough GA Points', message: `You need ${frame.pointsPrice} pts.`, type: 'warning' });
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
    if (frame.dollarsPrice && !isAdmin) {
      await buyWithMoney(frame, PRODUCT_IDS.commentFrame(frame.id), 'comment_frame', async () => {
        await saveProfile({ equippedCommentFrame: frame.id, ownedCommentFrames: [...new Set([...(userProfile?.ownedCommentFrames || []), frame.id])] });
      });
      return;
    }
    // Admin bypass — unlock and equip for free
    if (isAdmin) {
      setLoading(true);
      await saveProfile({ equippedCommentFrame: frame.id, ownedCommentFrames: [...new Set([...(userProfile?.ownedCommentFrames || []), frame.id])] });
      setLoading(false);
      showAlert({ title: '🧪 Equipped! (admin)', message: `"${frame.name}" is now your comment frame.`, type: 'success' });
      return;
    }
    if (gaPoints < frame.pointsPrice) return showAlert({ title: 'Not enough GA Points', message: `You need ${frame.pointsPrice} pts.`, type: 'warning' });
    showAlert({ title: `Buy "${frame.name}"?`, message: `Cost: ${frame.pointsPrice} pts`, type: 'info',
      buttons: [{ text: 'Cancel', style: 'cancel' }, { text: `Buy — ${frame.pointsPrice} pts`, onPress: async () => {
        setLoading(true);
        try {
          const userRef = doc(db, 'users', user.uid);
          let balanceAfter;
          await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(userRef);
            const current = snap.data()?.gaPoints ?? 0;
            if (current < frame.pointsPrice) throw new Error('NOT_ENOUGH_POINTS');
            balanceAfter = current - frame.pointsPrice;
            transaction.update(userRef, {
              gaPoints: balanceAfter,
              equippedCommentFrame: frame.id,
              ownedCommentFrames: arrayUnion(frame.id),
            });
          });
          await saveProfile({ equippedCommentFrame: frame.id, ownedCommentFrames: [...new Set([...(userProfile?.ownedCommentFrames || []), frame.id])] });
          await logPurchase(user.uid, frame, 'comment', balanceAfter);
          showAlert({ title: '✅ Purchased!', message: `"${frame.name}" equipped on your comments!`, type: 'success' });
        } catch (e) {
          if (e.message === 'NOT_ENOUGH_POINTS') showAlert({ title: 'Not enough GA Points', message: `You need ${frame.pointsPrice} pts.`, type: 'warning' });
          else showAlert({ title: 'Error', message: 'Purchase failed. Please try again.', type: 'danger' });
        } finally {
          setLoading(false);
        }
      }}] });
  };

  // ─── Cosmetic handler (profile bg, banner, badge, username, card border) ───
  const handleCosmetic = async (item, owned) => {
    if (item.exclusive) { showAlert({ title: 'Exclusive 🔒', message: item.desc, type: 'info' }); return; }

    // Streak level check — bloquer si niveau insuffisant (sauf admin)
    if (!isAdmin && item.streakRequired && streakLocked(item, userProfile?.streakLevel)) {
      const req = item.streakRequired;
      showAlert({
        title: `🔒 Niveau ${STREAK_LABEL[req]} requis`,
        message: `Ce titre est réservé aux joueurs niveau ${STREAK_LABEL[req]} (${STREAK_PTS[req].toLocaleString()} streak pts).\n\nTon niveau actuel : ${STREAK_LABEL[userProfile?.streakLevel || 'noob']} (${(userProfile?.streakPoints || 0).toLocaleString()} pts)\n\nGagne des streak points en te connectant chaque jour et en recevant des GGs !`,
        type: 'warning',
      });
      return;
    }

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

    if (item.dollarsPrice && !owned) {
      const CAT_NORM = { background: 'background', banner: 'banner', badge: 'badge', username: 'username_effect', card: 'card_border' };
      await buyWithMoney(item, cosmeticProductId(item.category, item.id), CAT_NORM[item.category] || item.category, async () => {
        const newOwned = [...new Set([...ownedCosmetics, item.id])];
        const equip = { ownedCosmetics: newOwned };
        if (item.category === 'background') equip.equippedProfileBg = item.id;
        if (item.category === 'banner') equip.equippedProfileBanner = item.id;
        if (item.category === 'badge') equip.equippedProfileBadge = item.id;
        if (item.category === 'username') equip.equippedUsernameEffect = item.id;
        if (item.category === 'card') equip.equippedCardBorder = item.id;
        await saveProfile(equip);
      });
      return;
    }
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
      showAlert({ title: '👑 Legendary Required', message: `Cet item est offert gratuitement aux abonnés Legendary.\n\nDécouvre les avantages Legendary dans la boutique.`, type: 'info',
        buttons: [{ text: 'Plus tard', style: 'cancel' }, { text: 'Voir Legendary 👑', onPress: () => navigation.navigate('Subscription') }] });
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
      await buyWithMoney(theme, cosmeticProductId('theme', theme.id), 'theme', async () => {
        const newOwned = [...new Set([...ownedCosmetics, theme.id, ...(theme.includes || [])])];
        await saveProfile({
          ownedCosmetics: newOwned,
          equippedTheme:         theme.id,
          equippedProfileBg:     theme.includes?.[0],
          equippedProfileBanner: theme.includes?.[1],
          equippedProfileBadge:  theme.includes?.[2],
          equippedCardBorder:    theme.includes?.[3],
          equippedUsernameEffect:theme.includes?.[4],
        });
      });
      return;
    }
    showAlert({ title: `Apply "${theme.name}"?`, message: `This will activate all ${(theme.includes || []).length} items of this theme on your profile.${isAdmin && !owned ? '\n\n[Admin bypass — unlocking]' : ''}`, type: 'info',
      buttons: [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply Theme 🎨', onPress: async () => {
        // Admin: also add theme + all includes to owned arrays so they render correctly
        if (isAdmin && !owned) {
          const newOwned = [...new Set([...ownedCosmetics, theme.id, ...(theme.includes || [])])];
          await saveProfile({
            ownedCosmetics: newOwned,
            equippedTheme:         theme.id,
            equippedProfileBg:     theme.includes?.[0],
            equippedProfileBanner: theme.includes?.[1],
            equippedProfileBadge:  theme.includes?.[2],
            equippedCardBorder:    theme.includes?.[3],
            equippedUsernameEffect:theme.includes?.[4],
          });
        } else {
          await saveProfile({
            equippedTheme:         theme.id,
            equippedProfileBg:     theme.includes?.[0],
            equippedProfileBanner: theme.includes?.[1],
            equippedProfileBadge:  theme.includes?.[2],
            equippedCardBorder:    theme.includes?.[3],
            equippedUsernameEffect:theme.includes?.[4],
          });
        }
        showAlert({ title: '✅ Theme Applied!', message: `"${theme.name}" is live on your profile!`, type: 'success' });
      }}] });
  };

  // ─── Comment frame owned check ─────────────────────────────────────────────
  const commentFrameOwned = (frame) => frame.free || frame.pointsPrice === 0 || (userProfile?.ownedCommentFrames || []).includes(frame.id) || (frame.legendaryFree && userPlan === 'legendary') || (userPlan === 'legendary' && isFreebieCosmetic(frame));

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <PurchaseSuccessOverlay visible={!!successItem} itemName={successItem} onClose={() => setSuccessItem(null)} />
      {loading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      )}

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Shop 🛒</Text>
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

      {/* Gift Cards — raccourci visible à côté des points (échange points → cartes cadeaux) */}
      <TouchableOpacity onPress={() => handleCategoryChange('gift_cards')} activeOpacity={0.85} style={s.giftBanner}>
        <View style={s.giftIconWrap}>
          <Ionicons name="gift" size={18} color="#FF2D55" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.giftTitle}>Turn your points into Gift Cards 🎁</Text>
          <Text style={s.giftSub}>Amazon, PlayStation, Xbox, Steam… with your GA Points</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.gray} />
      </TouchableOpacity>

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
          {PRICE_FILTERS.filter(f => isAdmin || f.id !== 'dollars').map(f => (
            <TouchableOpacity key={f.id} onPress={() => setPriceFilter(f.id)}
              style={[s.priceChip, priceFilter === f.id && s.priceChipActive]}>
              <Text style={[s.priceChipText, priceFilter === f.id && s.priceChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ─── Lazy content placeholder while InteractionManager settles ─── */}
      {!renderReady && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={COLORS.gold} />
        </View>
      )}

      {/* ─── AVATAR FRAMES ─── */}
      {renderReady && category === 'avatar_frames' && (() => {
        const avatarData = [...FRAMES].filter(f => !f.exclusive).filter(frame => {
          const owned = frame.free || ownedFrames.includes(frame.id);
          if (priceFilter === 'owned') return owned;
          if (priceFilter === 'free') return frame.free;
          if (priceFilter === 'points') return frame.pointsPrice > 0 && !frame.dollarsPrice;
          if (priceFilter === 'dollars') return !!frame.dollarsPrice;
          if (priceFilter === 'legendary') return false;
          return true;
        }).sort((a, b) => {
          const frameTier = f => f.animated ? 2 : f.glow ? 1 : 0;
          const td = frameTier(a) - frameTier(b);
          return td !== 0 ? td : (a.pointsPrice || a.dollarsPrice || 0) - (b.pointsPrice || b.dollarsPrice || 0);
        });
        return (
          <FlatList
            data={avatarData}
            numColumns={2}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            columnWrapperStyle={{ paddingHorizontal: 14, justifyContent: 'space-between' }}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            initialNumToRender={6}
            maxToRenderPerBatch={4}
            windowSize={5}
            ListHeaderComponent={<ChampionBanner type="avatar" />}
            renderItem={({ item: frame }) => {
              const isEquipped = equippedFrame === frame.id;
              const legendaryFreebie = userPlan === 'legendary' && !ownedFrames.includes(frame.id) && isFreebieCosmetic(frame);
              const isOwned = frame.free || ownedFrames.includes(frame.id) || legendaryFreebie;
              const comingSoon = Platform.OS !== 'ios' && !!frame.dollarsPrice; // Android: achats $ pas encore dispo
              return (
                <TouchableOpacity onPress={() => handleAvatarFrame(frame)} activeOpacity={0.85}
                  style={[s.frameCard, isEquipped && !comingSoon && { borderColor: frame.color === COLORS.gray3 ? COLORS.gold : frame.color, borderWidth: 1.5 }]}>
                  <View style={s.framePreviewWrap}>
                    <AvatarFramePreview frame={frame} avatar={userProfile?.avatar} username={userProfile?.username} size={54} />
                    {comingSoon && (
                      <View style={s.comingSoonOverlay}>
                        <Text style={s.comingSoonIcon}>🔜</Text>
                        <Text style={s.comingSoonText}>Soon</Text>
                      </View>
                    )}
                    {!comingSoon && isEquipped && <View style={[s.statusDot, { backgroundColor: COLORS.green }]}><Ionicons name="checkmark" size={9} color={COLORS.black} /></View>}
                    {!comingSoon && isOwned && !isEquipped && !frame.free && <View style={[s.statusDot, { backgroundColor: COLORS.blue }]}><Ionicons name="bag-check" size={9} color={COLORS.white} /></View>}
                  </View>
                  <Text style={s.frameName} numberOfLines={1}>{frame.name}</Text>
                  {comingSoon ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(120,120,140,0.15)', borderColor: 'rgba(120,120,140,0.4)' }]}>
                      <Ionicons name="time-outline" size={10} color={COLORS.gray} />
                      <Text style={[s.actionBtnText, { color: COLORS.gray, marginLeft: 3 }]}>Coming soon</Text>
                    </View>
                  ) : isEquipped ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(0,200,83,0.15)', borderColor: COLORS.green }]}><Text style={[s.actionBtnText, { color: COLORS.green }]}>✓ EQUIPPED</Text></View>
                  ) : isOwned ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(0,212,255,0.1)', borderColor: COLORS.blue }]}><Text style={[s.actionBtnText, { color: COLORS.blue }]}>TAP TO EQUIP</Text></View>
                  ) : frame.dollarsPrice && isFreebieCosmetic(frame) ? (
                    <View style={{ alignItems: 'center', width: '100%' }}>
                      <View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}><Ionicons name="card" size={10} color="#30D158" /><Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(frame.dollarsPrice).toFixed(2)}</Text></View>
                      <Text numberOfLines={1} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 7.5, color: COLORS.gold, fontWeight: '800', textAlign: 'center' }}>👑 FREE WITH LEGENDARY</Text>
                    </View>
                  ) : frame.dollarsPrice ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}><Ionicons name="card" size={10} color="#30D158" /><Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(frame.dollarsPrice).toFixed(2)}</Text></View>
                  ) : (
                    <View style={{ alignItems: 'center', width: '100%' }}><View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}><Ionicons name="star" size={10} color={COLORS.gold} /><Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>{frame.pointsPrice} pts</Text></View>{isFreebieCosmetic(frame) && userPlan !== 'legendary' && <Text numberOfLines={1} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 7.5, color: COLORS.gold, fontWeight: '800', textAlign: 'center' }}>👑 FREE WITH LEGENDARY</Text>}</View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        );
      })()}

      {/* ─── PROFILE BACKGROUNDS ─── */}
      {renderReady && category === 'profile_bg' && (
        <CosmeticGrid items={PROFILE_BACKGROUNDS} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(PROFILE_BACKGROUNDS.filter(b => b.free).map(b => b.id))]}
          equippedId={userProfile?.equippedProfileBg}
          onPress={handleCosmetic}
          renderPreview={(item) => <BgPreview cosmetic={item} />}
          isAdmin={isAdmin}
          infoText="🎨 Profile backgrounds replace the dark black on your profile page — the area behind all your clips and info. Visible to everyone who visits your profile." />
      )}

      {/* ─── BANNERS ─── */}
      {renderReady && category === 'banners' && (
        <CosmeticGrid items={PROFILE_BANNERS} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(PROFILE_BANNERS.filter(b => b.free).map(b => b.id))]}
          equippedId={userProfile?.equippedProfileBanner}
          onPress={handleCosmetic}
          renderPreview={(item) => <BannerPreview cosmetic={item} />}
          isAdmin={isAdmin}
          infoText="🖼️ Banners are the large image zone at the very top of your profile (above your avatar). The biggest visual on your page — first thing anyone sees." />
      )}

      {/* ─── PROFILE BADGES / TITLES ─── */}
      {renderReady && category === 'badges' && (
        <CosmeticGrid items={PROFILE_BADGES} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(PROFILE_BADGES.filter(b => b.free).map(b => b.id))]}
          equippedId={userProfile?.equippedProfileBadge}
          onPress={handleCosmetic}
          renderPreview={(item) => <BadgePreview cosmetic={item} />}
          isAdmin={isAdmin}
          userStreakLevel={userProfile?.streakLevel}
          infoText="🏅 Titles/Badges appear as a small colored tag under your username on your profile AND in comments. Show the community your identity." />
      )}

      {/* ─── USERNAME EFFECTS ─── */}
      {renderReady && category === 'username_fx' && (
        <CosmeticGrid items={USERNAME_EFFECTS} priceFilter={priceFilter} userPlan={userPlan}
          ownedCosmetics={[...ownedCosmetics, ...(USERNAME_EFFECTS.filter(u => u.free).map(u => u.id))]}
          equippedId={userProfile?.equippedUsernameEffect}
          onPress={handleCosmetic}
          isAdmin={isAdmin}
          renderPreview={(item) => <UsernamePreview cosmetic={item} />}
          infoText="✨ Username effects change the color and glow of your name on your profile page. Animated versions pulse with light. Visible on your profile header." />
      )}

      {/* ─── THEMES ─── */}
      {renderReady && category === 'themes' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={s.infoBanner}>
            <Ionicons name="sparkles-outline" size={14} color={COLORS.gold} />
            <Text style={s.infoText}>🔥 Themes are complete profile packs — background, banner, title, card border and username effect all at once. Best value.</Text>
          </View>
          <View style={s.grid}>
            {PROFILE_THEMES.filter(theme => {
              if (priceFilter === 'dollars') return !!theme.dollarsPrice;
              if (priceFilter === 'owned') return isAdmin || ownedCosmetics.includes(theme.id);
              return true;
            }).sort((a, b) => (a.dollarsPrice || 0) - (b.dollarsPrice || 0)).map(theme => {
              const owned = isAdmin || ownedCosmetics.includes(theme.id);
              const comingSoon = Platform.OS !== 'ios' && !!theme.dollarsPrice; // Android: achats $ pas encore dispo
              const pal = THEME_PALETTES[theme.id] || { accent: COLORS.gold };
              return (
                <TouchableOpacity key={theme.id} onPress={() => handleTheme(theme, owned)} activeOpacity={0.85}
                  style={[s.frameCard, { width: '100%' }, owned && !comingSoon && { borderColor: pal.accent + '80', borderWidth: 1.5 }]}>
                  <View style={[s.framePreviewWrap, { height: 110 }]}>
                    <ThemePreview cosmetic={theme} />
                    {comingSoon && (
                      <View style={s.comingSoonOverlay}>
                        <Text style={s.comingSoonIcon}>🔜</Text>
                        <Text style={s.comingSoonText}>Soon</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                    <Text style={[s.frameName, { textAlign: 'left' }]}>{theme.name}</Text>
                    <RarityBadge rarity={theme.rarity || 'legendary'} />
                  </View>
                  <Text style={[s.frameDesc, { textAlign: 'left' }]}>{theme.desc}</Text>
                  <Text style={{ fontSize: 10, color: COLORS.gray2, marginBottom: 6 }}>Includes {(theme.includes || []).length} items</Text>
                  {comingSoon ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(120,120,140,0.15)', borderColor: 'rgba(120,120,140,0.4)' }]}>
                      <Ionicons name="time-outline" size={10} color={COLORS.gray} />
                      <Text style={[s.actionBtnText, { color: COLORS.gray, marginLeft: 3 }]}>Coming soon</Text>
                    </View>
                  ) : owned ? (
                    <View style={[s.actionBtn, { backgroundColor: pal.accent + '22', borderColor: pal.accent }]}><Text style={[s.actionBtnText, { color: pal.accent }]}>🎨 APPLY THEME</Text></View>
                  ) : theme.dollarsPrice ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}><Ionicons name="card" size={10} color="#30D158" /><Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(theme.dollarsPrice).toFixed(2)}</Text></View>
                  ) : (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}><Text style={[s.actionBtnText, { color: COLORS.gold }]}>{theme.pointsPrice} pts</Text></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ─── VIDEO FRAMES ─── */}
      {renderReady && category === 'video_frames' && (() => {
        const videoData = [...VIDEO_FRAMES].filter(f => !f.exclusive).filter(frame => {
          const owned = frame.free || ownedVideoFrames.includes(frame.id);
          if (priceFilter === 'owned') return owned;
          if (priceFilter === 'free') return frame.free;
          if (priceFilter === 'points') return frame.pointsPrice > 0 && !frame.dollarsPrice;
          if (priceFilter === 'dollars') return !!frame.dollarsPrice;
          return true;
        }).sort((a, b) => {
          const t = f => f.animated ? 2 : f.glow ? 1 : 0;
          return t(a) !== t(b) ? t(a) - t(b) : (a.pointsPrice || a.dollarsPrice || 0) - (b.pointsPrice || b.dollarsPrice || 0);
        });
        return (
          <FlatList
            data={videoData}
            numColumns={2}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            columnWrapperStyle={{ paddingHorizontal: 14, justifyContent: 'space-between' }}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            initialNumToRender={6}
            maxToRenderPerBatch={4}
            windowSize={5}
            ListHeaderComponent={(
              <>
                <View style={s.infoBanner}>
                  <Ionicons name="videocam-outline" size={14} color={COLORS.gold} />
                  <Text style={s.infoText}>Video frames appear as a border around your clips in the feed.</Text>
                </View>
                <ChampionBanner type="video" />
              </>
            )}
            renderItem={({ item: frame }) => {
              const isOwned = frame.free || ownedVideoFrames.includes(frame.id);
              const comingSoon = Platform.OS !== 'ios' && !!frame.dollarsPrice; // Android: achats $ pas encore dispo
              return (
                <TouchableOpacity onPress={() => handleVideoFrame(frame)} activeOpacity={0.85}
                  style={[s.frameCard, isOwned && !comingSoon && { borderColor: frame.color + '60', borderWidth: 1 }]}>
                  <View style={s.framePreviewWrap}>
                    <VideoFramePreview frame={frame} />
                    {comingSoon && (
                      <View style={s.comingSoonOverlay}>
                        <Text style={s.comingSoonIcon}>🔜</Text>
                        <Text style={s.comingSoonText}>Soon</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.frameName} numberOfLines={1}>{frame.name}</Text>
                  {comingSoon ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(120,120,140,0.15)', borderColor: 'rgba(120,120,140,0.4)' }]}>
                      <Ionicons name="time-outline" size={10} color={COLORS.gray} />
                      <Text style={[s.actionBtnText, { color: COLORS.gray, marginLeft: 3 }]}>Coming soon</Text>
                    </View>
                  ) : isOwned ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(0,212,255,0.1)', borderColor: COLORS.blue }]}><Text style={[s.actionBtnText, { color: COLORS.blue }]}>✓ OWNED</Text></View>
                  ) : frame.dollarsPrice && isFreebieCosmetic(frame) ? (
                    <View style={{ alignItems: 'center', width: '100%' }}>
                      <View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}><Ionicons name="card" size={10} color="#30D158" /><Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(frame.dollarsPrice).toFixed(2)}</Text></View>
                      <Text numberOfLines={1} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 7.5, color: COLORS.gold, fontWeight: '800', textAlign: 'center' }}>👑 FREE WITH LEGENDARY</Text>
                    </View>
                  ) : frame.dollarsPrice ? (
                    <View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}><Ionicons name="card" size={10} color="#30D158" /><Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(frame.dollarsPrice).toFixed(2)}</Text></View>
                  ) : (
                    <View style={{ alignItems: 'center', width: '100%' }}><View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}><Ionicons name="star" size={10} color={COLORS.gold} /><Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>{frame.pointsPrice} pts</Text></View>{isFreebieCosmetic(frame) && userPlan !== 'legendary' && <Text numberOfLines={1} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 7.5, color: COLORS.gold, fontWeight: '800', textAlign: 'center' }}>👑 FREE WITH LEGENDARY</Text>}</View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        );
      })()}

      {/* ─── COMMENT FRAMES ─── */}
      {renderReady && category === 'comment_frames' && (() => {
        const commentData = [...COMMENT_FRAMES].filter(f => !f.exclusive).filter(frame => {
          const owned = commentFrameOwned(frame);
          if (priceFilter === 'owned') return owned;
          if (priceFilter === 'free') return frame.free || frame.pointsPrice === 0;
          if (priceFilter === 'points') return frame.pointsPrice > 0 && !frame.dollarsPrice;
          if (priceFilter === 'dollars') return !!frame.dollarsPrice;
          if (priceFilter === 'legendary') return frame.legendaryFree;
          return true;
        }).sort((a, b) => {
          const t = f => f.animated ? 2 : f.glow ? 1 : 0;
          return t(a) !== t(b) ? t(a) - t(b) : (a.pointsPrice || a.dollarsPrice || 0) - (b.pointsPrice || b.dollarsPrice || 0);
        });
        return (
          <FlatList
            data={commentData}
            numColumns={2}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            columnWrapperStyle={{ paddingHorizontal: 14, justifyContent: 'space-between' }}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            initialNumToRender={6}
            maxToRenderPerBatch={4}
            windowSize={5}
            ListHeaderComponent={(
              <>
                <View style={[s.infoBanner, { marginBottom: 12 }]}>
                  <Text style={s.infoText}>💬 Comment Frames add a glowing border around your comments — visible to everyone!</Text>
                </View>
                <ChampionBanner type="comment" />
              </>
            )}
            renderItem={({ item: frame }) => {
              const owned = commentFrameOwned(frame);
              const equipped = userProfile?.equippedCommentFrame === frame.id;
              const comingSoon = Platform.OS !== 'ios' && !!frame.dollarsPrice; // Android: achats $ pas encore dispo
              return (
                <TouchableOpacity activeOpacity={0.85}
                  style={[s.frameCard, equipped && !comingSoon && { borderColor: frame.color || COLORS.gold, borderWidth: 1.5 }]}
                  onPress={() => handleCommentFrame(frame, owned)}>
                  <View style={s.framePreviewWrap}>
                    <CommentBubblePreview frame={frame} />
                    {comingSoon && (
                      <View style={s.comingSoonOverlay}>
                        <Text style={s.comingSoonIcon}>🔜</Text>
                        <Text style={s.comingSoonText}>Soon</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.frameName}>{frame.name}</Text>
                  {frame.exclusive ? <Text style={s.exclusiveLabel}>🏆 Champion only</Text>
                    : comingSoon ? <View style={[s.actionBtn, { backgroundColor: 'rgba(120,120,140,0.15)', borderColor: 'rgba(120,120,140,0.4)' }]}><Ionicons name="time-outline" size={10} color={COLORS.gray} /><Text style={[s.actionBtnText, { color: COLORS.gray, marginLeft: 3 }]}>Coming soon</Text></View>
                    : owned ? <View style={[s.actionBtn, { backgroundColor: equipped ? 'rgba(201,168,76,0.15)' : 'rgba(0,212,255,0.1)', borderColor: equipped ? COLORS.gold : COLORS.blue }]}><Text style={[s.actionBtnText, { color: equipped ? COLORS.gold : COLORS.blue }]}>{equipped ? '✓ EQUIPPED' : 'TAP TO EQUIP'}</Text></View>
                    : frame.dollarsPrice && isFreebieCosmetic(frame) ? <View style={{ alignItems: 'center', width: '100%' }}><View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}><Ionicons name="card" size={10} color="#30D158" /><Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(frame.dollarsPrice).toFixed(2)}</Text></View><Text numberOfLines={1} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 7.5, color: COLORS.gold, fontWeight: '800', textAlign: 'center' }}>👑 FREE WITH LEGENDARY</Text></View>
                    : frame.dollarsPrice ? <View style={[s.actionBtn, { backgroundColor: 'rgba(48,209,88,0.12)', borderColor: '#30D158' }]}><Ionicons name="card" size={10} color="#30D158" /><Text style={[s.actionBtnText, { color: '#30D158', marginLeft: 3 }]}>CA${Number(frame.dollarsPrice).toFixed(2)}</Text></View>
                    : <View style={{ alignItems: 'center', width: '100%' }}><View style={[s.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}><Ionicons name="star" size={10} color={COLORS.gold} /><Text style={[s.actionBtnText, { color: COLORS.gold, marginLeft: 3 }]}>{frame.pointsPrice} pts</Text></View>{isFreebieCosmetic(frame) && userPlan !== 'legendary' && <Text numberOfLines={1} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 7.5, color: COLORS.gold, fontWeight: '800', textAlign: 'center' }}>👑 FREE WITH LEGENDARY</Text>}</View>
                  }
                </TouchableOpacity>
              );
            }}
          />
        );
      })()}

      {/* ─── GIFT CARDS ─── */}
      {renderReady && category === 'gift_cards' && (
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 10 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white },
  headerSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  pointsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.gold },
  pointsText: { fontSize: 15, color: COLORS.gold, fontWeight: '800', marginLeft: 5 },
  pointsLabel: { fontSize: 11, color: COLORS.gray },
  earnBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 8, padding: 10, backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.blue + '40' },
  earnText: { flex: 1, fontSize: 10, color: COLORS.gray, marginLeft: 7, lineHeight: 14 },
  giftBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 4, marginBottom: 8, padding: 12, backgroundColor: 'rgba(255,45,85,0.08)', borderRadius: 12, borderWidth: 0.5, borderColor: '#FF2D5550', gap: 10 },
  giftIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,45,85,0.14)' },
  giftTitle: { fontSize: 13, fontWeight: '800', color: COLORS.white },
  giftSub: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
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
  comingSoonOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, backgroundColor: 'rgba(8,8,16,0.72)', alignItems: 'center', justifyContent: 'center' },
  comingSoonIcon: { fontSize: 22, marginBottom: 2 },
  comingSoonText: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
  frameName: { fontSize: 12, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginBottom: 3 },
  frameDesc: { fontSize: 10, color: COLORS.gray, marginBottom: 6, textAlign: 'center', lineHeight: 13 },
  framePrice: { fontSize: 11, color: COLORS.gray, textAlign: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingVertical: 6, borderWidth: 0.5, borderColor: COLORS.gray3 },
  actionBtnText: { fontSize: 10, color: COLORS.white, fontWeight: '700' },
  exclusiveLabel: { fontSize: 10, color: COLORS.gray2, fontWeight: '700', textAlign: 'center', paddingVertical: 6 },
});

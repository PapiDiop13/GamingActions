// src/components/UserBadges.js
// Source unique des badges utilisateur — identique au Feed.
// Importer ici plutôt que de dupliquer dans chaque écran.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';

// ─── Profile badge cosmétique (GOD MODE, G.O.A.T, etc.) ─────────────────────
export const PROFILE_BADGE_DATA = {
  badge_goat:       { emoji: '🐐', name: 'The GOAT',       color: '#FFD700' },
  badge_champion_t: { emoji: '👑', name: 'Champion',        color: '#FFD700' },
  badge_elite:      { emoji: '💎', name: 'Elite',           color: '#00D4FF' },
  badge_vip:        { emoji: '👑', name: 'VIP',             color: '#C9A84C' },
  badge_clutch:     { emoji: '⚡', name: 'Clutch Player',   color: '#FFD700' },
  badge_legend:     { emoji: '🔥', name: 'Living Legend',   color: '#FF3D00' },
  badge_apex:       { emoji: '🦅', name: 'Apex Predator',   color: '#FF3D00' },
  badge_immortal:   { emoji: '⚔️', name: 'Immortal',       color: '#FFD700' },
  badge_godmode:    { emoji: '🌟', name: 'GOD MODE',        color: '#FFD700' },
  badge_phantom:    { emoji: '👻', name: 'Phantom',         color: '#7C4DFF' },
  badge_sniper:     { emoji: '🎯', name: 'Sniper',          color: '#00D4FF' },
  badge_tryhard:    { emoji: '💪', name: 'Tryhard',         color: '#FF6D00' },
  badge_fragger:    { emoji: '💥', name: 'Top Fragger',     color: '#FF2D55' },
  badge_strat:      { emoji: '🧠', name: 'Strategist',      color: '#BF5AF2' },
  badge_rookie:     { emoji: '🎮', name: 'Rookie',          color: '#C0C0C0' },
  badge_og:         { emoji: '🏅', name: 'OG Player',       color: '#C9A84C' },
  badge_nochill:    { emoji: '🥶', name: 'No Chill',        color: '#00E5FF' },
  badge_verified:   { emoji: '✅', name: 'Verified',        color: '#00C853' },
};

// ─── Plan + type badges (LEG / ICON / CR / DEV / GA) — copie exacte du Feed ─
// Props: accountType, plan, size ('sm' | 'md'), style
export function UserPlanBadges({ accountType, plan, size = 'sm', style }) {
  const s = size === 'md' ? bS.badgeMd : bS.badgeSm;
  const t = size === 'md' ? bS.textMd : bS.textSm;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4 }, style]}>
      {/* 1) Type de compte */}
      {accountType === 'gameconic' && (
        <View style={[s, { backgroundColor: COLORS.red }]}>
          <Text style={[t, { color: COLORS.white }]}>ICON</Text>
        </View>
      )}
      {accountType === 'board' && (
        <View style={[s, { backgroundColor: '#00E676', shadowColor: '#00E676', shadowOpacity: 0.95, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } }]}>
          <Text style={[t, { color: COLORS.black }]}>BOARD</Text>
        </View>
      )}
      {accountType === 'creator' && (
        <View style={[s, { backgroundColor: COLORS.blue }]}>
          <Text style={[t, { color: COLORS.black }]}>CR</Text>
        </View>
      )}
      {accountType === 'developer' && (
        <View style={[s, { backgroundColor: '#7C4DFF' }]}>
          <Text style={[t, { color: COLORS.white }]}>DEV</Text>
        </View>
      )}
      {/* 2) Abonnement */}
      {plan === 'legendary' && (
        <View style={[s, { backgroundColor: COLORS.gold }]}>
          <Text style={[t, { color: COLORS.black }]}>LEG</Text>
        </View>
      )}
      {(!accountType || accountType === 'gamer') && plan !== 'legendary' && (
        <View style={[s, { backgroundColor: COLORS.gray2 }]}>
          <Text style={[t, { color: COLORS.white }]}>GA</Text>
        </View>
      )}
    </View>
  );
}

// ─── Profile badge cosmétique pill (🌟 GOD MODE) ────────────────────────────
export function ProfileBadgePill({ equippedProfileBadge, style }) {
  if (!equippedProfileBadge || equippedProfileBadge === 'badge_none') return null;
  const bd = PROFILE_BADGE_DATA[equippedProfileBadge];
  if (!bd) return null;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bd.color + '18', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
        <Text style={{ fontSize: 9 }}>{bd.emoji} </Text>
        <Text style={{ fontSize: 9, fontWeight: '800', color: bd.color }}>{bd.name}</Text>
      </View>
    </View>
  );
}

const bS = StyleSheet.create({
  badgeSm: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  textSm:  { fontSize: 7, fontWeight: '900' },
  badgeMd: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3 },
  textMd:  { fontSize: 8, fontWeight: '900' },
});

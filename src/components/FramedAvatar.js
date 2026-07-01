// src/components/FramedAvatar.js
import React from 'react';
import { View, Text, Image, TouchableOpacity, Animated, Easing } from 'react-native';
import { COLORS } from '../constants/colors';
import { ringColorForUser, glowColorForUser, getFrameById } from '../constants/frames';
import { ElectricRing, RotatingElectricRing, PulsingLeaderRing } from './ElectricEffect';

// ── Animated ring for animated frames ─────────────────────────────────────────
function PulsingRing({ size, color }) {
  const anim  = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(anim,  { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.06, duration: 850, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(anim,  { toValue: 0, duration: 850, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 850, useNativeDriver: true }),
      ]),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity  = anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.0] });
  const ringSize = size + 10;
  return (
    <Animated.View style={{
      position: 'absolute',
      width: ringSize, height: ringSize,
      borderRadius: ringSize / 2,
      borderWidth: 3, borderColor: color,
      opacity,
      transform: [{ scale }],
      shadowColor: color, shadowOpacity: 1, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
    }} />
  );
}

// Rotating shimmer arc — bright arc sweeping around the ring (reflet effect)
function ShimmerRing({ size, color }) {
  const spin  = React.useRef(new Animated.Value(0)).current;
  const pulse = React.useRef(new Animated.Value(0.45)).current;
  React.useEffect(() => {
    const spinLoop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.linear }));
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.9, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
    ]));
    spinLoop.start(); pulseLoop.start();
    return () => { spinLoop.stop(); pulseLoop.stop(); };
  }, []);
  const rotate   = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringSize = size + 10;
  return (
    <>
      {/* Base ring — always visible, pulsing opacity */}
      <Animated.View style={{
        position: 'absolute',
        width: ringSize, height: ringSize,
        borderRadius: ringSize / 2,
        borderWidth: 1.5, borderColor: color,
        opacity: pulse,
      }} />
      {/* Bright arc — rotates = shimmer/reflet effect */}
      <Animated.View style={{
        position: 'absolute',
        width: ringSize, height: ringSize,
        borderRadius: ringSize / 2,
        borderWidth: 3,
        borderColor: color,
        borderTopColor: 'transparent',
        borderLeftColor: 'transparent',
        transform: [{ rotate }],
        shadowColor: color, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
      }} />
    </>
  );
}

// Diagonal glint sweep over the avatar (same reflet as the comment frames)
function GlintOverlay({ size, color }) {
  const sweep = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const a = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
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

// Pulsing colored ring (used by the "sweep" frames — circle + glint)
function GlintRing({ size, color }) {
  const pulse = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 800, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, []);
  const ringSize = size + 10;
  return (
    <Animated.View style={{
      position: 'absolute', width: ringSize, height: ringSize, borderRadius: ringSize / 2,
      borderWidth: 2.5, borderColor: color, opacity: pulse,
      shadowColor: color, shadowOpacity: 1, shadowRadius: 9, shadowOffset: { width: 0, height: 0 },
    }} />
  );
}

function SpinningRing({ size, color }) {
  // Two separate Animated.Values — one for native (rotate), one for JS (border)
  const spin = React.useRef(new Animated.Value(0)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const spinLoop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3000, useNativeDriver: true, easing: Easing.linear }));
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: false }),
    ]));
    spinLoop.start(); pulseLoop.start();
    return () => { spinLoop.stop(); pulseLoop.stop(); };
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });
  const ringSize = size + 10;
  return (
    <>
      {/* Rotating arc — useNativeDriver: true */}
      <Animated.View style={{
        position: 'absolute',
        width: ringSize, height: ringSize,
        borderRadius: ringSize / 2,
        borderWidth: 3,
        borderColor: color,
        borderTopColor: 'transparent',
        borderRightColor: 'transparent',
        transform: [{ rotate }],
        shadowColor: color, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
      }} />
      {/* Pulsing full ring — useNativeDriver: false */}
      <Animated.View style={{
        position: 'absolute',
        width: ringSize, height: ringSize,
        borderRadius: ringSize / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity,
      }} />
    </>
  );
}

const CROWN_MIN_SIZE = 28;

const RANKING_EXCLUDED = ['creator', 'gameconic'];

export default function FramedAvatar({ user, size = 36, onPress, showGlow = true, glow = false }) {
  const initials   = (user?.username || 'GA').slice(0, 2).toUpperCase();
  const isExcluded = RANKING_EXCLUDED.includes(user?.accountType);
  const isChampion = !!user?.isChampion && !isExcluded;
  const isLeader   = !!user?.isCurrentLeader && !isExcluded;

  const ringColor = isChampion ? COLORS.gold : ringColorForUser(user, COLORS.gray3);
  const glowColor = isChampion
    ? COLORS.gold
    : (glow || showGlow) ? glowColorForUser(user) || (glow ? ringColor : null) : null;

  const showCrown = (isChampion || isLeader) && size >= CROWN_MIN_SIZE;
  const crownSize = Math.max(Math.round(size * 0.40), 11);

  // Taille du composant = taille de l'image uniquement.
  // Le ring et le glow sont en overflow (position absolute, dépassent légèrement).
  const avatar = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>

      {/* Couronne — sort AU-DESSUS en overflow, ne pousse rien */}
      {showCrown && (
        <Text style={{
          position: 'absolute',
          top: -(crownSize * 0.55),
          width: size,
          textAlign: 'center',
          fontSize: crownSize,
          lineHeight: crownSize,
          zIndex: 20,
          textShadowColor: isChampion ? '#E8C96B' : 'transparent',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: isChampion ? 5 : 0,
        }}>{ isChampion ? '👑' : '⚡' }</Text>
      )}

      {/* Effet électrique champion — anneau doré rotatif */}
      {isChampion && <RotatingElectricRing size={size} />}

      {/* Animated frames — shimmer, spin, or pulse based on frame properties */}
      {!isChampion && (() => {
        const frame = getFrameById(user?.equippedFrame);
        if (!frame?.animated) return null;
        if (frame.spinGlint) return <ShimmerRing size={size} color={frame.color} />;
        if (frame.sweep)     return <GlintRing size={size} color={frame.color} />;
        if (frame.shimmer) return <ShimmerRing size={size} color={frame.color} />;
        const spinIds = ['neon_pulse_blue','neon_pulse_pink','galaxy_animated','rainbow_animated','lightning_animated','void_animated','nebula_animated','neon_city_animated','cosmic_animated','blizzard_animated'];
        if (spinIds.includes(frame.id)) return <SpinningRing size={size} color={frame.color} />;
        return <PulsingRing size={size} color={frame.color} />;
      })()}
      {/* Anneau bleu pulsé pour le leader actuel (si pas champion) */}
      {!isChampion && isLeader && <PulsingLeaderRing size={size} />}

      {/* Glow halo — colle au ring, pas d'espace noir */}
      {!isChampion && glowColor && (
        <View style={{
          position: 'absolute',
          width: size + 6, height: size + 6,
          borderRadius: (size + 6) / 2,
          backgroundColor: glowColor, opacity: 0.25,
        }} />
      )}

      {/* Ring */}
      {!isChampion && (
        <View style={{
          position: 'absolute',
          width: size + 4, height: size + 4,
          borderRadius: (size + 4) / 2,
          borderWidth: 2, borderColor: ringColor,
          opacity: glowColor ? 0.9 : 0.45,
        }} />
      )}

      {/* Image — remplit exactement le composant, aucun offset */}
      {user?.avatar ? (
        <Image
          source={{ uri: user.avatar }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: isChampion ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.12)',
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1.5, borderColor: ringColor,
        }}>
          <Text style={{ color: COLORS.gold, fontWeight: '800', fontSize: size * 0.35 }}>{initials}</Text>
        </View>
      )}

      {/* Glint/reflet sweep par-dessus l'avatar (frames sweep + spinGlint) */}
      {!isChampion && (() => {
        const f = getFrameById(user?.equippedFrame);
        if (f?.sweep || f?.spinGlint) return <GlintOverlay size={size} color={f.color} />;
        return null;
      })()}
    </View>
  );

  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{avatar}</TouchableOpacity>;
  return avatar;
}

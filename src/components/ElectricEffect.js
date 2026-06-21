// src/components/ElectricEffect.js
// Effet éclair / électrique animé pour la frame Champion.
// Deux usages :
//   <ElectricRing size={N} />         → anneau électrique autour d'un avatar
//   <ElectricBorder w={W} h={H} />    → bordure électrique autour d'une vidéo
//   <ElectricBanner w={W} h={H} />    → effet éclair traversant une bannière profil

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';

const GOLD    = '#C9A84C';
const GOLD2   = '#FFE066';
const WHITE   = 'rgba(255,255,255,0.9)';

// ─── Utilitaires ─────────────────────────────────────────────────────────────

// Retourne un nombre pseudo-aléatoire stable (évite les re-renders)
function seeded(seed, min, max) {
  const x = Math.sin(seed + 1) * 10000;
  const r = x - Math.floor(x);
  return min + r * (max - min);
}

// ─── Segment d'éclair ────────────────────────────────────────────────────────
// Un trait SVG-like dessiné avec des View absolues.
// On simule un arc en cassant la ligne en 3 segments avec un offset central.
function LightningArc({ x1, y1, x2, y2, seed, color = GOLD2, opacity = 1, thin = false }) {
  // Point intermédiaire décalé perpendiculairement
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = seeded(seed, -len * 0.25, len * 0.25);
  // Perpendiculaire normalisée
  const px = -dy / len;
  const py =  dx / len;
  const mx2 = mx + px * offset;
  const my2 = my + py * offset;

  const w = thin ? 1 : 1.5;

  const segments = [
    { x1, y1, x2: mx2, y2: my2 },
    { x1: mx2, y1: my2, x2, y2 },
  ];

  return (
    <>
      {segments.map((seg, i) => {
        const sdx = seg.x2 - seg.x1;
        const sdy = seg.y2 - seg.y1;
        const sLen = Math.sqrt(sdx * sdx + sdy * sdy);
        const angle = Math.atan2(sdy, sdx) * (180 / Math.PI);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: seg.x1,
              top: seg.y1,
              width: sLen,
              height: w,
              backgroundColor: color,
              opacity,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: '0 50%',
              borderRadius: 1,
            }}
          />
        );
      })}
    </>
  );
}

// ─── ElectricRing — anneau autour d'un avatar ─────────────────────────────────
export function ElectricRing({ size = 64 }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse du ring
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
    // Spark flash
    Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(spark, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(spark, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(spark, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(spark, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.delay(1200),
      ])
    ).start();
  }, []);

  const R = size / 2 + 6; // rayon du ring
  const cx = R + 4;
  const cy = R + 4;
  const totalSize = (R + 4) * 2;

  // 4 arcs d'éclair autour du ring (positions sur le cercle)
  const arcs = [
    { a1: -30, a2: 30,   seed: 1 },
    { a1: 60,  a2: 120,  seed: 5 },
    { a1: 150, a2: 210,  seed: 9 },
    { a1: 240, a2: 300,  seed: 13 },
  ];

  function polarToXY(angleDeg, radius) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  return (
    <View style={{ position: 'absolute', width: totalSize, height: totalSize, top: -(R + 4 - size / 2), left: -(R + 4 - size / 2) }} pointerEvents="none">
      {/* Glow ring */}
      <Animated.View style={{
        position: 'absolute', width: totalSize, height: totalSize,
        borderRadius: totalSize / 2,
        borderWidth: 2, borderColor: GOLD,
        opacity: pulse,
        shadowColor: GOLD2, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8,
      }} />
      {/* Inner ring */}
      <Animated.View style={{
        position: 'absolute', width: R * 2 + 2, height: R * 2 + 2,
        top: 3, left: 3,
        borderRadius: R + 1,
        borderWidth: 1, borderColor: GOLD2,
        opacity: pulse,
      }} />
      {/* Lightning arcs */}
      {arcs.map((arc, i) => {
        const p1 = polarToXY(arc.a1, R);
        const p2 = polarToXY(arc.a2, R);
        return (
          <Animated.View key={i} style={{ opacity: spark }}>
            <LightningArc x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} seed={arc.seed} color={GOLD2} />
          </Animated.View>
        );
      })}
      {/* Corner sparks on flash */}
      {[0, 90, 180, 270].map((angle, i) => {
        const p = polarToXY(angle, R + 2);
        return (
          <Animated.View key={`dot-${i}`} style={{
            position: 'absolute', left: p.x - 2, top: p.y - 2,
            width: 4, height: 4, borderRadius: 2,
            backgroundColor: WHITE,
            opacity: spark,
          }} />
        );
      })}
    </View>
  );
}

// ─── RotatingElectricRing — anneau doré qui tourne comme une roue ─────────────
// Combinaison : rotation continue + segments lumineux façon roue électrique.
// Se centre automatiquement sur son parent (doit être dans un conteneur centré).
export function RotatingElectricRing({ size = 64, thickness = 3 }) {
  const spin = useRef(new Animated.Value(0)).current;
  const spinReverse = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2500, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(spinReverse, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateRev = spinReverse.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const ring = size + 8;      // anneau extérieur
  const inner = size + 2;     // anneau intérieur
  const halo = size + 16;     // halo

  const segments = Array.from({ length: 8 });

  // Conteneur centré absolu qui couvre exactement le parent (l'avatar)
  return (
    <View style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
    }} pointerEvents="none">
      {/* Glow halo pulsé */}
      <Animated.View style={{
        position: 'absolute', width: halo, height: halo, borderRadius: halo / 2,
        backgroundColor: GOLD, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.35] }),
      }} />
      {/* Anneau principal qui tourne */}
      <Animated.View style={{
        position: 'absolute', width: ring, height: ring, borderRadius: ring / 2,
        borderWidth: thickness, borderColor: GOLD2, borderStyle: 'dashed',
        transform: [{ rotate }],
        shadowColor: GOLD2, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6,
      }} />
      {/* Anneau intérieur qui tourne dans l'autre sens */}
      <Animated.View style={{
        position: 'absolute', width: inner, height: inner, borderRadius: inner / 2,
        borderWidth: 1.5, borderColor: GOLD, borderStyle: 'dotted',
        transform: [{ rotate: rotateRev }],
      }} />
      {/* Points lumineux sur le pourtour (roue) */}
      <Animated.View style={{ position: 'absolute', width: ring, height: ring, transform: [{ rotate }] }}>
        {segments.map((_, i) => {
          const angle = (i / segments.length) * 2 * Math.PI;
          const r = ring / 2;
          const x = r + r * Math.cos(angle) - 2;
          const y = r + r * Math.sin(angle) - 2;
          return (
            <View key={i} style={{
              position: 'absolute', left: x, top: y, width: 4, height: 4, borderRadius: 2,
              backgroundColor: i % 2 === 0 ? WHITE : GOLD2,
            }} />
          );
        })}
      </Animated.View>
    </View>
  );
}


export function ElectricBorder({ width: W, height: H, radius = 8 }) {
  const pulse = useRef(new Animated.Value(0.6)).current;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.delay(300),
        Animated.timing(flash, { toValue: 1, duration: 50, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.delay(1500),
      ])
    ).start();
  }, []);

  if (!W || !H) return null;

  // Arcs sur les 4 coins
  const cornerArcs = [
    { x1: 0,   y1: H * 0.15, x2: W * 0.15, y2: 0,   seed: 3  }, // top-left
    { x1: W * 0.85, y1: 0,   x2: W,   y2: H * 0.15, seed: 7  }, // top-right
    { x1: 0,   y1: H * 0.85, x2: W * 0.15, y2: H,   seed: 11 }, // bottom-left
    { x1: W * 0.85, y1: H,   x2: W,   y2: H * 0.85, seed: 17 }, // bottom-right
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius }]} pointerEvents="none">
      {/* Main border pulse */}
      <Animated.View style={{
        position: 'absolute', inset: 0, borderRadius: radius,
        borderWidth: 2.5, borderColor: GOLD,
        opacity: pulse,
      }} />
      {/* Inner bright border on flash */}
      <Animated.View style={{
        position: 'absolute', inset: 0, borderRadius: radius,
        borderWidth: 1, borderColor: GOLD2,
        opacity: flash,
      }} />
      {/* Corner lightning arcs */}
      {cornerArcs.map((arc, i) => (
        <Animated.View key={i} style={{ opacity: flash }}>
          <LightningArc x1={arc.x1} y1={arc.y1} x2={arc.x2} y2={arc.y2} seed={arc.seed} color={GOLD2} thin />
        </Animated.View>
      ))}
      {/* Corner dots on flash */}
      {[[0,0],[W,0],[0,H],[W,H]].map(([x,y], i) => (
        <Animated.View key={`cd-${i}`} style={{
          position: 'absolute', left: x - 2, top: y - 2,
          width: 4, height: 4, borderRadius: 2,
          backgroundColor: WHITE, opacity: flash,
        }} />
      ))}
    </View>
  );
}

// ─── ElectricBanner — bannière de profil ─────────────────────────────────────
// Overlay sur la bannière : éclairs qui traversent horizontalement.
export function ElectricBanner({ width: W, height: H }) {
  const bolt1 = useRef(new Animated.Value(0)).current;
  const bolt2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animBolt = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 80,  useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.delay(2500),
          Animated.timing(anim, { toValue: 1, duration: 60,  useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.delay(3000),
        ])
      ).start();
    animBolt(bolt1, 0);
    animBolt(bolt2, 1400);
  }, []);

  if (!W || !H) return null;

  // 2 éclairs horizontaux à des hauteurs différentes
  const y1 = H * 0.35;
  const y2 = H * 0.65;

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {/* Glow overlay */}
      <Animated.View style={{
        position: 'absolute', inset: 0,
        backgroundColor: GOLD,
        opacity: bolt1.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
      }} />

      {/* Bolt 1 — traverse de gauche à droite */}
      <Animated.View style={{ opacity: bolt1 }}>
        <LightningArc x1={0} y1={y1} x2={W * 0.45} y2={y1 + seeded(1, -8, 8)} seed={2} color={GOLD2} />
        <LightningArc x1={W * 0.45} y1={y1} x2={W * 0.75} y2={y1 + seeded(2, -10, 10)} seed={6} color={WHITE} thin />
        <LightningArc x1={W * 0.75} y1={y1} x2={W} y2={y1 + seeded(3, -6, 6)} seed={10} color={GOLD2} />
      </Animated.View>

      {/* Bolt 2 — traverse de droite à gauche à mi-hauteur différente */}
      <Animated.View style={{ opacity: bolt2 }}>
        <LightningArc x1={W} y1={y2} x2={W * 0.55} y2={y2 + seeded(4, -8, 8)} seed={3} color={GOLD2} />
        <LightningArc x1={W * 0.55} y1={y2} x2={W * 0.25} y2={y2 + seeded(5, -10, 10)} seed={8} color={WHITE} thin />
        <LightningArc x1={W * 0.25} y1={y2} x2={0} y2={y2 + seeded(6, -6, 6)} seed={12} color={GOLD2} />
      </Animated.View>

      {/* Gold border pulse */}
      <Animated.View style={{
        position: 'absolute', inset: 0,
        borderWidth: 2, borderColor: GOLD,
        opacity: bolt1.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.9] }),
      }} />
    </View>
  );
}

// ─── PulsingLeaderRing — anneau bleu électrique pulsé pour le Leader actuel ──
export function PulsingLeaderRing({ size = 64, thickness = 3 }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const BLUE   = '#00D4FF';
  const BLUE2  = '#0099CC';
  const ring   = size + 8;
  const inner  = size + 2;
  const halo   = size + 18;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      {/* Halo bleu pulsé */}
      <Animated.View style={{
        position: 'absolute', width: halo, height: halo, borderRadius: halo / 2,
        backgroundColor: BLUE, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.28] }),
      }} />
      {/* Anneau extérieur rotatif bleu */}
      <Animated.View style={{
        position: 'absolute', width: ring, height: ring, borderRadius: ring / 2,
        borderWidth: thickness, borderColor: BLUE, borderStyle: 'dashed',
        transform: [{ rotate }],
        shadowColor: BLUE, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8,
      }} />
      {/* Anneau intérieur pulsé */}
      <Animated.View style={{
        position: 'absolute', width: inner, height: inner, borderRadius: inner / 2,
        borderWidth: 1.5, borderColor: BLUE2,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
      }} />
    </View>
  );
}

// ─── ChampionBadge — badge doré "CHAMPION" ───────────────────────────────────
export function ChampionBadge({ small = false }) {
  const GOLD_D = '#E8C96B';
  const fs = small ? 7 : 8.5;
  const px = small ? 5 : 7;
  const py = small ? 1 : 2;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: px, paddingVertical: py,
      borderRadius: 5, marginLeft: 5,
      backgroundColor: 'rgba(232,201,107,0.18)',
      borderWidth: 1, borderColor: GOLD_D,
      shadowColor: GOLD_D, shadowOffset: { width: 0, height: 0 },
      shadowRadius: 6, shadowOpacity: 0.8,
    }}>
      <Text style={{ fontSize: fs, fontWeight: '900', color: GOLD_D, letterSpacing: 0.5 }}>👑 CHAMPION</Text>
    </View>
  );
}

// ─── LeaderBadge — badge rouge enflammé "LEADER" ─────────────────────────────
export function LeaderBadge({ small = false }) {
  const RED = '#FF3B30';
  const fs = small ? 7 : 8.5;
  const px = small ? 5 : 7;
  const py = small ? 1 : 2;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: px, paddingVertical: py,
      borderRadius: 5, marginLeft: 5,
      backgroundColor: 'rgba(255,59,48,0.18)',
      borderWidth: 1, borderColor: RED,
      shadowColor: RED, shadowOffset: { width: 0, height: 0 },
      shadowRadius: 6, shadowOpacity: 0.8,
    }}>
      <Text style={{ fontSize: fs + 2, marginRight: 2 }}>🔥</Text>
      <Text style={{ fontSize: fs, fontWeight: '900', color: RED, letterSpacing: 0.5 }}>LEADER</Text>
    </View>
  );
}

// src/components/FramedAvatar.js
import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { COLORS } from '../constants/colors';
import { ringColorForUser, glowColorForUser } from '../constants/frames';
import { ElectricRing, RotatingElectricRing, PulsingLeaderRing } from './ElectricEffect';

const CROWN_MIN_SIZE = 28;

export default function FramedAvatar({ user, size = 36, onPress, showGlow = true, glow = false }) {
  const initials   = (user?.username || 'GA').slice(0, 2).toUpperCase();
  const isChampion = !!user?.isChampion;
  const isLeader   = !!user?.isCurrentLeader;

  const ringColor = isChampion ? COLORS.gold : ringColorForUser(user, COLORS.gray3);
  const glowColor = isChampion
    ? COLORS.gold
    : (glow || showGlow) ? glowColorForUser(user) || (glow ? ringColor : null) : null;

  const showCrown = (isChampion || isLeader) && size >= CROWN_MIN_SIZE;
  const crownSize = Math.max(Math.round(size * 0.40), 11);

  // Taille du composant = taille de l'image uniquement.
  // Le ring et le glow sont en overflow (position absolute, dépassent légèrement).
  const avatar = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>

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
    </View>
  );

  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{avatar}</TouchableOpacity>;
  return avatar;
}

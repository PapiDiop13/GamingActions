/**
 * PurchaseSuccessOverlay.js — Pop-up de succès + remerciement après un achat.
 * Utilisé par le Shop (cosmétiques) et l'écran Support.
 */
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

export default function PurchaseSuccessOverlay({ visible, itemName, kind = 'item', onClose }) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.7); opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const title = kind === 'support' ? 'Thank you! 💛' : 'Purchase Successful! 🎉';
  const message = kind === 'support'
    ? 'Your support truly helps Gaming Actions grow. We appreciate you so much! 🙏'
    : `"${itemName}" is now yours. Thank you for supporting Gaming Actions! 💛`;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { transform: [{ scale }], opacity }]}>
          <View style={s.iconWrap}>
            <Ionicons name="checkmark-circle" size={64} color={COLORS.green} />
          </View>
          <Text style={s.title}>{title}</Text>
          <Text style={s.message}>{message}</Text>
          <TouchableOpacity onPress={onClose} style={s.btn} activeOpacity={0.85}>
            <Text style={s.btnText}>Awesome 👌</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, backgroundColor: COLORS.card, borderRadius: 22, padding: 26, alignItems: 'center', borderWidth: 1, borderColor: COLORS.gold + '40' },
  iconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(0,200,83,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 21, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 10 },
  message: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  btn: { backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '900', color: COLORS.black },
});

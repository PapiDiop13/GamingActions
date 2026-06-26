/**
 * GAAlert.js — Custom branded alert overlay for Gaming Actions
 *
 * Mounted once inside AppOverlays. Driven by useAlertStore.
 * Replaces Alert.alert() for the most important user-facing alerts.
 */

import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Animated,
  StyleSheet, Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import useAlertStore from '../store/useAlertStore';

const { width: SW } = Dimensions.get('window');

// Icon + accent color per alert type
const TYPE_CONFIG = {
  info:    { icon: 'information-circle', color: COLORS.gold },
  success: { icon: 'checkmark-circle',   color: '#00C853' },
  danger:  { icon: 'warning',            color: '#FF3B30' },
  warning: { icon: 'alert-circle',       color: '#FF9500' },
};

export default function GAAlert() {
  const { visible, title, message, type, buttons, hide } = useAlertStore();
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 20,
          bounciness: 6,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const { icon, color } = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  // Ne pas monter le Modal quand invisible — un Modal visible={false} peut
  // interférer avec Alert.alert natif sur iOS.
  if (!visible) return null;

  const handlePress = (btn) => {
    hide();
    // Small delay so dismiss animation feels natural before callback
    if (btn.onPress) setTimeout(btn.onPress, 50);
  };

  const buttonColor = (style) => {
    if (style === 'destructive') return '#FF3B30';
    if (style === 'cancel') return COLORS.gray;
    return COLORS.gold;
  };

  return (
    <Modal
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        const cancelBtn = buttons.find(b => b.style === 'cancel');
        if (cancelBtn) handlePress(cancelBtn);
      }}
    >
      <Animated.View style={[s.backdrop, { opacity: opacityAnim }]}>
        <Animated.View style={[s.card, { transform: [{ scale: scaleAnim }] }]}>

          {/* Icon */}
          <View style={[s.iconWrap, { backgroundColor: color + '18' }]}>
            <Ionicons name={icon} size={28} color={color} />
          </View>

          {/* Title */}
          {!!title && <Text style={s.title}>{title}</Text>}

          {/* Message */}
          {!!message && <Text style={s.message}>{message}</Text>}

          {/* Divider */}
          <View style={s.divider} />

          {/* Buttons */}
          <View style={[s.buttonsRow, buttons.length > 2 && { flexDirection: 'column' }]}>
            {buttons.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.btn,
                  buttons.length === 1 && { flex: 1 },
                  buttons.length === 2 && { flex: 1 },
                  buttons.length > 2 && { width: '100%' },
                  i > 0 && buttons.length <= 2 && s.btnBorderLeft,
                  i > 0 && buttons.length > 2 && s.btnBorderTop,
                ]}
                onPress={() => handlePress(btn)}
                activeOpacity={0.7}
              >
                <Text style={[s.btnText, { color: buttonColor(btn.style) }]}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: SW - 48,
    backgroundColor: '#13131F',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(201,168,76,0.2)',
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 24,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  message: {
    fontSize: 13,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  divider: {
    width: '100%',
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  buttonsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  btn: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBorderLeft: {
    borderLeftWidth: 0.5,
    borderLeftColor: 'rgba(255,255,255,0.08)',
  },
  btnBorderTop: {
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

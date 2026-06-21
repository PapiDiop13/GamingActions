// src/components/PaymentComingSoon.js
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableWithoutFeedback, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

export function PaymentComingSoon({ visible, onClose, title = 'Payment', message }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Ionicons name="time-outline" size={52} color={COLORS.gold} />
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                {message || 'Payments are not available yet. We are finalizing integration with Apple Pay and Stripe.\n\nThis will be available at launch. Stay tuned! 🚀'}
              </Text>
              <View style={styles.infoRow}>
                <Ionicons name="logo-apple" size={14} color={COLORS.gray} />
                <Text style={styles.infoText}> Apple Pay · </Text>
                <Ionicons name="card-outline" size={14} color={COLORS.gray} />
                <Text style={styles.infoText}> Stripe · RevenueCat</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>OK, noted 👌</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginTop: 14, marginBottom: 10 },
  subtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 21, marginBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  infoText: { fontSize: 12, color: COLORS.gray },
  closeBtn: { backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 30, alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.black },
});
// src/components/GAPointsPopup.js
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableWithoutFeedback, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

const EARN_METHODS = [
  { icon: 'cloud-upload-outline', color: COLORS.gold, action: 'Post a clip', points: '+50 pts' },
  { icon: 'star-outline', color: COLORS.gold, action: 'Receive a GG', points: '+2 pts' },
  { icon: 'person-add-outline', color: COLORS.blue, action: 'Get a new follower', points: '+5 pts' },
  { icon: 'calendar-outline', color: COLORS.green, action: 'Daily login', points: '+10 pts' },
  { icon: 'thumbs-up-outline', color: '#7C4DFF', action: 'Receive Thanks on a tip', points: '+5 pts' },
  { icon: 'people-outline', color: COLORS.blue, action: 'New fanbase subscriber', points: '+20 pts' },
  { icon: 'trophy-outline', color: COLORS.gold, action: 'Monthly Top 10 ranking', points: '+200 pts' },
  { icon: 'medal-outline', color: COLORS.gold, action: 'Become Monthly Champion', points: '+500 pts' },
];

const USE_METHODS = [
  { icon: 'bag-outline', color: COLORS.blue, action: 'Buy frames & badges in Shop', points: 'From 250 pts' },
  { icon: 'star-outline', color: COLORS.gold, action: 'Unlock Legendary plan', points: '15,000 pts' },
];

export function GAPointsPopup({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <Ionicons name="diamond" size={28} color={COLORS.blue} />
                </View>
                <Text style={styles.title}>GA Points</Text>
                <Text style={styles.subtitle}>Earn points through activity. Use them in the Shop or unlock Legendary.</Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                <Text style={styles.sectionLabel}>HOW TO EARN</Text>
                {EARN_METHODS.map((m, i) => (
                  <View key={i} style={styles.row}>
                    <View style={[styles.rowIcon, { backgroundColor: m.color + '18' }]}>
                      <Ionicons name={m.icon} size={16} color={m.color} />
                    </View>
                    <Text style={styles.rowAction}>{m.action}</Text>
                    <Text style={[styles.rowPoints, { color: m.color }]}>{m.points}</Text>
                  </View>
                ))}

                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>HOW TO USE</Text>
                {USE_METHODS.map((m, i) => (
                  <View key={i} style={styles.row}>
                    <View style={[styles.rowIcon, { backgroundColor: m.color + '18' }]}>
                      <Ionicons name={m.icon} size={16} color={m.color} />
                    </View>
                    <Text style={styles.rowAction}>{m.action}</Text>
                    <Text style={[styles.rowPoints, { color: m.color }]}>{m.points}</Text>
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Got it 👍</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: 20, width: '100%', borderWidth: 0.5, borderColor: COLORS.gray3 },
  header: { alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,212,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginBottom: 6 },
  subtitle: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 18 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rowAction: { flex: 1, fontSize: 13, color: COLORS.white },
  rowPoints: { fontSize: 12, fontWeight: '700' },
  closeBtn: { backgroundColor: COLORS.blue, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  closeBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.dark },
});
// src/components/GuidelinesOverlay.js
// S'affiche à chaque connexion tant que l'utilisateur n'a pas accepté.
// "Je refuse" → déconnexion immédiate.
// "J'accepte" → met à jour acceptedGuidelines: true dans Firestore.

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions, Alert } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../config/firebase';
import { COLORS } from '../constants/colors';
import useAuthStore from '../store/useAuthStore';

const { height: SH } = Dimensions.get('window');

const RULES = [
  { emoji: '🎮', title: 'The Spirit', body: 'Gaming Actions is built on respect, competition, and authentic gameplay. Every gamer deserves a fair and positive space.' },
  { emoji: '✅', title: "What's Welcome", items: ['Your best gaming clips and highlights', 'Constructive tips, tutorials and GameTips', 'Fair GG votes for clips you genuinely liked', 'Respectful comments and community feedback'] },
  { emoji: '🚫', title: "What's Forbidden", danger: true, items: ['Harassment, hate speech, or discrimination', 'Fake GG farming — bots, vote exchanges', 'Spam uploads — low-effort clips for points', 'Impersonation of other gamers', 'Cheating or hacked gameplay', 'Sexual, violent, or disturbing content', 'Sharing personal info without consent', 'Any content targeting minors'] },
  { emoji: '⚠️', title: 'Consequences', items: ['Warning → Strike → Permanent ban', 'Fraudulent points are removed', 'Champion titles obtained by fraud are revoked'] },
];

export default function GuidelinesOverlay() {
  const { user, userProfile } = useAuthStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (user && userProfile) {
      setVisible(true);
    }
  }, [user?.uid]);

  const handleAccept = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), { acceptedGuidelines: true });
      setVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Could not save. Please try again later.');
    }
  };

  const handleRefuse = () => {
    Alert.alert(
      'Are you sure?',
      'You must accept the Community Guidelines to use Gaming Actions. Refusing will sign you out.',
      [
        { text: 'Go back', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setVisible(false);
            try { await signOut(auth); } catch (e) {}
          },
        },
      ]
    );
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.card}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
            <Text style={s.title}>Community Guidelines</Text>
            <Text style={s.subtitle}>Please read and accept before continuing</Text>

            {RULES.map((section, i) => (
              <View key={i} style={s.section}>
                <Text style={s.sectionTitle}>{section.emoji} {section.title}</Text>
                {section.body && <Text style={s.body}>{section.body}</Text>}
                {section.items && section.items.map((item, j) => (
                  <View key={j} style={s.itemRow}>
                    <Text style={[s.bullet, section.danger && { color: COLORS.red }]}>
                      {section.danger ? '✗' : '›'}
                    </Text>
                    <Text style={s.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}

            <Text style={s.footer}>
              By tapping "I Accept" you agree to follow these guidelines. Violations may result in account suspension or permanent ban.
            </Text>
          </ScrollView>

          <View style={s.btnRow}>
            <TouchableOpacity onPress={handleRefuse} style={s.refuseBtn}>
              <Text style={s.refuseBtnText}>I Refuse</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAccept} style={s.acceptBtn}>
              <Text style={s.acceptBtnText}>I Accept ✅</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: 20, width: '100%', maxHeight: SH * 0.85, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 12, color: COLORS.gray, textAlign: 'center', marginBottom: 16 },
  section: { backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white, marginBottom: 6 },
  body: { fontSize: 12, color: COLORS.gray, lineHeight: 18 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  bullet: { fontSize: 13, color: COLORS.gold, fontWeight: '900', marginRight: 8, marginTop: 1 },
  itemText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 18 },
  footer: { fontSize: 10, color: COLORS.gray2, textAlign: 'center', marginTop: 10, lineHeight: 16, fontStyle: 'italic' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  refuseBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.red, alignItems: 'center' },
  refuseBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.red },
  acceptBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.gold, alignItems: 'center' },
  acceptBtnText: { fontSize: 14, fontWeight: '900', color: COLORS.black },
});

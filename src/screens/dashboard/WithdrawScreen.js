import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export default function WithdrawScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Retrait des gains</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.icon}>🚀</Text>
        <Text style={styles.title}>Bientôt disponible</Text>
        <Text style={styles.subtitle}>
          Le retrait des gains sera activé très prochainement.{'\n\n'}
          Tes gains sont enregistrés et seront disponibles dès l'activation du système de paiement.
        </Text>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
          <Text style={styles.noteText}>PayPal · Interac · min CA$25 · délai 5–7 jours ouvrables</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30,
    paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.white },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  icon: { fontSize: 56, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '900', color: COLORS.white, marginBottom: 14, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  note: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(201,168,76,0.10)', borderRadius: 12, padding: 14, gap: 10, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  noteText: { fontSize: 12, color: COLORS.gold, flex: 1, lineHeight: 18, fontWeight: '600' },
});

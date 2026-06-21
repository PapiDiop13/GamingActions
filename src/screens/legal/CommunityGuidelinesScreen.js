import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

const SECTIONS = [
  {
    emoji: '🎮',
    title: 'The Spirit',
    body: 'Gaming Actions is built on respect, competition, and authentic gameplay. Every gamer deserves a fair and positive space to share their best moments.',
  },
  {
    emoji: '✅',
    title: 'What\'s Welcome',
    items: [
      'Your best gaming clips and highlights',
      'Constructive tips, tutorials and GameTips',
      'Fair GG votes for clips you genuinely liked',
      'Respectful comments and community feedback',
      'Healthy competition and good sportsmanship',
    ],
  },
  {
    emoji: '🚫',
    title: 'What\'s Forbidden',
    items: [
      'Harassment, hate speech, or discrimination of any kind',
      'Fake GG farming — bots, vote exchanges, coordinated inflation',
      'Spam uploads — low-effort clips posted only to earn points',
      'Impersonation of other gamers or creators',
      'Cheating, hacks, or exploits presented as legitimate gameplay',
      'Sexual, violent, or disturbing content',
      'Sharing personal information of others without consent',
      'Any content targeting or exploiting minors',
    ],
    danger: true,
  },
  {
    emoji: '⚠️',
    title: 'Consequences',
    items: [
      'First offense: Warning + strike on your account',
      'Repeated offenses: Temporary suspension',
      'Severe or repeated violations: Permanent ban',
      'Points earned through fraud are permanently removed',
      'Champion titles obtained through fraud are revoked and reassigned to the legitimate winner',
    ],
  },
  {
    emoji: '📩',
    title: 'Report a Violation',
    body: 'Use the flag 🚩 button on any clip or profile to report violations. Our moderation team reviews all reports. False reporting may result in action against your account.',
  },
];

export default function CommunityGuidelinesScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Community Guidelines</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.version}>Gaming Actions · Last updated June 2026</Text>

        {SECTIONS.map((section, i) => (
          <View key={i} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.emoji}>{section.emoji}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            {section.body && (
              <Text style={styles.body}>{section.body}</Text>
            )}
            {section.items && section.items.map((item, j) => (
              <View key={j} style={styles.itemRow}>
                <Text style={[styles.bullet, section.danger && { color: COLORS.red }]}>
                  {section.danger ? '✗' : '›'}
                </Text>
                <Text style={styles.itemText}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By using Gaming Actions you agree to these guidelines. Violations may result in content removal, account suspension, or permanent ban.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.white },
  scroll: { padding: 16, paddingBottom: 60 },
  version: { fontSize: 11, color: COLORS.gray2, marginBottom: 20, textAlign: 'center' },
  section: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  emoji: { fontSize: 20, marginRight: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  body: { fontSize: 13, color: COLORS.gray, lineHeight: 20 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  bullet: { fontSize: 14, color: COLORS.gold, fontWeight: '900', marginRight: 8, marginTop: 1 },
  itemText: { flex: 1, fontSize: 13, color: COLORS.gray, lineHeight: 20 },
  footer: { marginTop: 8, padding: 14, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  footerText: { fontSize: 11, color: COLORS.gray2, textAlign: 'center', lineHeight: 18 },
});
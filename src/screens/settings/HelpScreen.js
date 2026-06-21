import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Linking, TextInput, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

const FAQ = [
  { q: 'How do GA Points work?', a: 'You earn GA Points through activity: posting clips (+50), receiving GGs (+2), gaining followers (+5), daily login (+10), and more. Use them in the Shop or to unlock Legendary.' },
  { q: 'What is Legendary plan?', a: 'Legendary gives you a gold frame on your clips, priority in the feed, access to exclusive badges, and more visibility. It\'s $2.99/month or 15,000 GA Points.' },
  { q: 'What is a Fanbase?', a: 'Fanbase is an exclusive subscription for $4.99/month per creator. As a subscriber you get access to exclusive clips, private tips, FanBox group chat, and more.' },
  { q: 'What is a GAMECONIC?', a: 'GAMECONICs are elite creators invited by Gaming Actions. They have a red badge and special privileges in the app. You cannot apply — they are selected by the team.' },
  { q: 'How does the GG button work?', a: 'Tap GG on any clip to support the creator. GGs are tracked and used in the monthly rankings. Top 10 gamers with the most GGs win rewards at end of month.' },
  { q: 'How are rankings calculated?', a: 'Rankings track GG received on your clips each month. They reset on the 1st of every month. The Top 10 earn GA Points rewards. #1 becomes Monthly Champion.' },
  { q: 'How do I become a Creator?', a: 'Go to Settings → Request Creator Status. The team reviews your profile and activity. Creators can post tips, flashtutos, and open a Fanbase.' },
  { q: 'How do I report someone?', a: 'Tap the flag icon on any clip or visit a profile and tap the flag in the top right. Our team reviews all reports within 48 hours.' },
];

const GUIDELINES = [
  { icon: 'checkmark-circle-outline', color: COLORS.green, text: 'Post original gaming clips only — your own gameplay.' },
  { icon: 'checkmark-circle-outline', color: COLORS.green, text: 'Be respectful in comments and FanBox. No harassment.' },
  { icon: 'checkmark-circle-outline', color: COLORS.green, text: 'GG honestly — only GG clips you genuinely enjoyed.' },
  { icon: 'close-circle-outline', color: COLORS.red, text: 'No fake accounts, spam, or coordinated GG manipulation.' },
  { icon: 'close-circle-outline', color: COLORS.red, text: 'No hate speech, discrimination, or bullying of any kind.' },
  { icon: 'close-circle-outline', color: COLORS.red, text: 'No cheating clips, exploits, or toxic gameplay content.' },
  { icon: 'close-circle-outline', color: COLORS.red, text: 'No copyright-infringing music or content in clips.' },
];

const STRIKES_INFO = [
  { num: '1', label: 'Warning', desc: 'First violation — warning message sent to your account.', color: COLORS.gold },
  { num: '2', label: '7-day restriction', desc: 'Cannot post clips or comment for 7 days.', color: '#FF9500' },
  { num: '3', label: '30-day suspension', desc: 'Account suspended for 30 days. All content hidden.', color: COLORS.red },
  { num: '4', label: 'Permanent ban', desc: 'Account permanently removed. No appeal possible.', color: '#8B0000' },
];

export default function HelpScreen({ navigation }) {
  const [activeSection, setActiveSection] = useState('faq');
  const [bugTitle, setBugTitle] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [expandedFaq, setExpandedFaq] = useState(null);

  const SECTIONS = [
    { id: 'faq', label: 'FAQ', icon: 'help-circle-outline' },
    { id: 'guidelines', label: 'Guidelines', icon: 'shield-outline' },
    { id: 'strikes', label: 'Strikes', icon: 'warning-outline' },
    { id: 'bug', label: 'Bug Report', icon: 'bug-outline' },
    { id: 'legal', label: 'Legal', icon: 'document-text-outline' },
  ];

  const handleBugSubmit = () => {
    if (!bugTitle.trim() || !bugDesc.trim()) {
      Alert.alert('Missing', 'Please fill in both fields.');
      return;
    }
    Alert.alert('✅ Report Sent', 'Thank you! Our team will review your report within 48 hours.', [
      { text: 'OK', onPress: () => { setBugTitle(''); setBugDesc(''); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Learn</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Section tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionsRow}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => setActiveSection(s.id)}
            style={[styles.sectionTab, activeSection === s.id && styles.sectionTabActive]}
          >
            <Ionicons name={s.icon} size={13} color={activeSection === s.id ? COLORS.black : COLORS.gray} />
            <Text style={[styles.sectionTabText, activeSection === s.id && styles.sectionTabTextActive]}> {s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* FAQ */}
        {activeSection === 'faq' && (
          <View style={{ padding: 14 }}>
            <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
            {FAQ.map((item, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setExpandedFaq(expandedFaq === i ? null : i)}
                style={styles.faqCard}
                activeOpacity={0.85}
              >
                <View style={styles.faqHeader}>
                  <Text style={styles.faqQ}>{item.q}</Text>
                  <Ionicons name={expandedFaq === i ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gray} />
                </View>
                {expandedFaq === i && (
                  <Text style={styles.faqA}>{item.a}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Guidelines */}
        {activeSection === 'guidelines' && (
          <View style={{ padding: 14 }}>
            <Text style={styles.sectionTitle}>Community Guidelines</Text>
            <Text style={styles.sectionSubtitle}>Gaming Actions is built for real gamers. Keep it clean, fair, and fun for everyone.</Text>
            {GUIDELINES.map((g, i) => (
              <View key={i} style={styles.guidelineRow}>
                <Ionicons name={g.icon} size={20} color={g.color} />
                <Text style={styles.guidelineText}>{g.text}</Text>
              </View>
            ))}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              <Text style={styles.infoText}>Violations result in strikes. 4 strikes = permanent ban. All decisions are final for strike 4.</Text>
            </View>
          </View>
        )}

        {/* Strikes */}
        {activeSection === 'strikes' && (
          <View style={{ padding: 14 }}>
            <Text style={styles.sectionTitle}>Strike System</Text>
            <Text style={styles.sectionSubtitle}>We use a progressive strike system to keep the community safe.</Text>
            {STRIKES_INFO.map((s, i) => (
              <View key={i} style={[styles.strikeCard, { borderLeftColor: s.color }]}>
                <View style={[styles.strikeNum, { backgroundColor: s.color }]}>
                  <Text style={styles.strikeNumText}>{s.num}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.strikeLabel, { color: s.color }]}>{s.label}</Text>
                  <Text style={styles.strikeDesc}>{s.desc}</Text>
                </View>
              </View>
            ))}
            <View style={styles.infoBox}>
              <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.blue} />
              <Text style={styles.infoText}>You can appeal strikes 1-3 within 7 days via the Report system. Strike 4 is not appealable.</Text>
            </View>
          </View>
        )}

        {/* Bug Report */}
        {activeSection === 'bug' && (
          <View style={{ padding: 14 }}>
            <Text style={styles.sectionTitle}>Report a Bug</Text>
            <Text style={styles.sectionSubtitle}>Found a problem? Let us know and we'll fix it ASAP.</Text>

            <Text style={styles.inputLabel}>BUG TITLE</Text>
            <TextInput
              value={bugTitle}
              onChangeText={setBugTitle}
              placeholder="Short description of the issue..."
              placeholderTextColor={COLORS.gray}
              style={styles.input}
              maxLength={80}
            />

            <Text style={styles.inputLabel}>DETAILS</Text>
            <TextInput
              value={bugDesc}
              onChangeText={setBugDesc}
              placeholder="What happened? What did you expect? Steps to reproduce..."
              placeholderTextColor={COLORS.gray}
              style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
              multiline
              maxLength={500}
            />
            <Text style={styles.charCount}>{bugDesc.length}/500</Text>

            <TouchableOpacity onPress={handleBugSubmit} style={styles.submitBtn}>
              <Ionicons name="send-outline" size={16} color={COLORS.black} />
              <Text style={styles.submitBtnText}>Submit Report</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emailRow}
              onPress={() => Linking.openURL('mailto:support@gamingactions.gg')}
            >
              <Ionicons name="mail-outline" size={16} color={COLORS.blue} />
              <Text style={styles.emailText}> Or email us: support@gamingactions.gg</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Legal */}
        {activeSection === 'legal' && (
          <View style={{ padding: 14 }}>
            <Text style={styles.sectionTitle}>Legal</Text>

            {[
              { title: 'Terms of Service', icon: 'document-text-outline', desc: 'Rules governing your use of Gaming Actions.', color: COLORS.blue },
              { title: 'Privacy Policy', icon: 'lock-closed-outline', desc: 'How we collect, use, and protect your data.', color: COLORS.green },
              { title: 'Content Policy', icon: 'shield-outline', desc: 'What content is allowed and prohibited on the platform.', color: COLORS.gold },
              { title: 'Cookie Policy', icon: 'information-circle-outline', desc: 'How we use cookies and similar technologies.', color: '#7C4DFF' },
            ].map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.legalCard}
                onPress={() => Alert.alert(item.title, `${item.title} will be available at launch. Full legal documents are being finalized.`)}
                activeOpacity={0.85}
              >
                <View style={[styles.legalIcon, { backgroundColor: item.color + '18' }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.legalTitle}>{item.title}</Text>
                  <Text style={styles.legalDesc}>{item.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
              </TouchableOpacity>
            ))}

            <View style={styles.versionBox}>
              <Text style={styles.versionText}>Gaming Actions v1.0.0 Beta</Text>
              <Text style={styles.versionSubText}>© 2026 Gaming Actions Inc. All rights reserved.</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  sectionsRow: { paddingHorizontal: 14, paddingVertical: 10 },
  sectionTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, height: 34 },
  sectionTabActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  sectionTabText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  sectionTabTextActive: { color: COLORS.black, fontWeight: '800' },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 6 },
  sectionSubtitle: { fontSize: 13, color: COLORS.gray, lineHeight: 19, marginBottom: 20 },
  faqCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.gray3 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.white, marginRight: 10 },
  faqA: { fontSize: 13, color: COLORS.gray, lineHeight: 19, marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  guidelineRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  guidelineText: { flex: 1, fontSize: 14, color: COLORS.white, lineHeight: 20, marginLeft: 12 },
  strikeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderWidth: 0.5, borderColor: COLORS.gray3 },
  strikeNum: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  strikeNumText: { fontSize: 16, fontWeight: '900', color: COLORS.white },
  strikeLabel: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  strikeDesc: { fontSize: 12, color: COLORS.gray, lineHeight: 17 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.2)', marginTop: 10 },
  infoText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17, marginLeft: 8 },
  inputLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3 },
  charCount: { fontSize: 10, color: COLORS.gray, textAlign: 'right', marginTop: 4, marginBottom: 16 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 14, marginBottom: 14 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.black, marginLeft: 8 },
  emailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  emailText: { fontSize: 13, color: COLORS.blue, fontWeight: '600' },
  legalCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.gray3 },
  legalIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  legalTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  legalDesc: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  versionBox: { alignItems: 'center', marginTop: 30, paddingTop: 20, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  versionText: { fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  versionSubText: { fontSize: 11, color: COLORS.gray2, marginTop: 4 },
});
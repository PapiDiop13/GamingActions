import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

const Section = ({ title, children }) => (
  <View style={s.section}>
    <Text style={s.sectionTitle}>{title}</Text>
    <Text style={s.sectionBody}>{children}</Text>
  </View>
);

export default function TermsScreen({ navigation }) {
  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Terms of Use</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.updated}>Last updated: June 2026</Text>

        <Section title="1. Acceptance of Terms">
          By creating an account or using Gaming Actions, you agree to these Terms of Use. If you do not agree, do not use the app.
        </Section>

        <Section title="2. Account Responsibility">
          You are responsible for maintaining the confidentiality of your account credentials. You must be at least 13 years old to create an account. You are responsible for all activity that occurs under your account.
        </Section>

        <Section title="3. Content Guidelines">
          You agree not to upload content that:{'\n\n'}
          - Contains explicit, sexual, or pornographic material{'\n'}
          - Promotes violence, hate speech, or harassment{'\n'}
          - Infringes on copyright or intellectual property{'\n'}
          - Contains spam, misleading information, or scams{'\n'}
          - Features fake gameplay or manipulated content{'\n'}
          - Violates any applicable law or regulation{'\n\n'}
          We reserve the right to remove any content that violates these guidelines and to suspend or terminate accounts of repeat offenders.
        </Section>

        <Section title="4. GG System and GA Points">
          GG reactions and GA Points are virtual items with no monetary value. They cannot be exchanged for real currency. GA Points may be used within the app for features and virtual goods. We reserve the right to modify the points system at any time.
        </Section>

        <Section title="5. Fanbase Subscriptions">
          Fanbase subscriptions, when available, will be processed through the App Store payment system. Subscription terms and pricing will be clearly displayed before purchase. Refunds are handled according to Apple's refund policy.
        </Section>

        <Section title="6. Intellectual Property">
          You retain ownership of content you upload. By uploading content, you grant Gaming Actions a non-exclusive, worldwide license to display, distribute, and promote your content within the app. You can delete your content at any time.
        </Section>

        <Section title="7. Account Suspension">
          We may suspend or terminate your account if you:{'\n\n'}
          - Violate these Terms of Use{'\n'}
          - Upload prohibited content{'\n'}
          - Engage in fraudulent activity (fake GGs, bot accounts){'\n'}
          - Harass or threaten other users{'\n\n'}
          Suspended users may appeal by contacting support@gamingactions.com.
        </Section>

        <Section title="8. Limitation of Liability">
          Gaming Actions is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the app.
        </Section>

        <Section title="9. Changes to Terms">
          We may update these Terms at any time. Continued use of the app after changes constitutes acceptance.
        </Section>

        <Section title="10. Contact">
          Questions about these Terms? Contact us at support@gamingactions.com.
        </Section>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  content: { padding: 16 },
  updated: { fontSize: 11, color: COLORS.gray, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.white, marginBottom: 8 },
  sectionBody: { fontSize: 13, color: COLORS.gray, lineHeight: 20 },
});
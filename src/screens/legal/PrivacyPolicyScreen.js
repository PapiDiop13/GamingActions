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

export default function PrivacyPolicyScreen({ navigation }) {
  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.updated}>Last updated: June 2026</Text>

        <Section title="1. Introduction">
          Gaming Actions ("we", "us", "our") operates the Gaming Actions mobile application. This Privacy Policy explains how we collect, use, and protect your personal information when you use our app.
        </Section>

        <Section title="2. Information We Collect">
          We collect the following information when you create an account and use the app:{'\n\n'}
          - Account information: email address, username, password (encrypted), profile picture{'\n'}
          - Content you create: video clips, comments, game tips{'\n'}
          - Usage data: interactions (GG reactions, follows, comments), app activity{'\n'}
          - Device information: device type, operating system, for app functionality
        </Section>

        <Section title="3. How We Use Your Information">
          We use your information to:{'\n\n'}
          - Provide and maintain the Gaming Actions service{'\n'}
          - Display your profile and content to other users{'\n'}
          - Operate features like rankings, GA Points, and Fanbase{'\n'}
          - Send notifications about relevant activity{'\n'}
          - Improve and optimize the app experience{'\n'}
          - Enforce our Terms of Use and community guidelines
        </Section>

        <Section title="4. Data Storage and Security">
          Your data is stored securely using Google Firebase infrastructure. Video content is hosted on Cloudinary. We use industry-standard encryption and security measures to protect your personal information. We do not sell your personal data to third parties.
        </Section>

        <Section title="5. Third-Party Services">
          We use the following third-party services:{'\n\n'}
          - Firebase (Google): Authentication, database, cloud functions{'\n'}
          - Cloudinary: Video and image hosting{'\n'}
          - Apple (App Store): App distribution and in-app purchases{'\n\n'}
          Each service has its own privacy policy governing their use of your data.
        </Section>

        <Section title="6. Your Rights">
          You have the right to:{'\n\n'}
          - Access your personal data through your profile{'\n'}
          - Update or correct your information at any time{'\n'}
          - Delete your account and associated data{'\n'}
          - Request a copy of your data{'\n\n'}
          To exercise these rights, contact us at support@gamingactions.com.
        </Section>

        <Section title="7. Children's Privacy">
          Gaming Actions is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we discover that a child under 13 has provided us with personal information, we will delete it immediately.
        </Section>

        <Section title="8. Changes to This Policy">
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy within the app. Your continued use of the app after changes constitutes acceptance of the updated policy.
        </Section>

        <Section title="9. Contact Us">
          If you have any questions about this Privacy Policy, contact us at:{'\n\n'}
          Email: support@gamingactions.com{'\n'}
          Gaming Actions Inc.
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
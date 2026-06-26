import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export default function ContestRulesScreen({ navigation }) {
  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Championship Contest Rules</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.noSponsors}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
          <Text style={s.noSponsorsText}>
            Apple Inc. is NOT a sponsor of, or involved in any way with, this contest or sweepstakes.
          </Text>
        </View>

        <Text style={s.title}>Monthly GG Championship — Official Rules</Text>
        <Text style={s.lastUpdated}>Last updated: June 2026</Text>

        <Section title="1. Sponsor">
          <Text style={s.body}>
            The Gaming Actions Monthly Championship (the "Contest") is sponsored exclusively by Gaming Actions Inc. ("Sponsor"), operated through the Gaming Actions mobile application. This Contest is not sponsored, endorsed, or administered by Apple Inc.
          </Text>
        </Section>

        <Section title="2. Eligibility">
          <Text style={s.body}>
            The Contest is open to all registered Gaming Actions users who are 13 years of age or older. Users must have an active account in good standing (not suspended or banned) to be eligible.
          </Text>
        </Section>

        <Section title="3. Contest Period">
          <Text style={s.body}>
            The Contest runs on a monthly basis. Each contest period begins on the 1st day of the month at 12:00 AM UTC and ends on the last day of the month at 11:59 PM UTC. A new contest begins automatically the following month.
          </Text>
        </Section>

        <Section title="4. How to Enter">
          <Text style={s.body}>
            No purchase is necessary to enter or win. Participants accumulate GG Points (⭐) during the contest period by:{'\\n'}
            • Posting gameplay clips (+25 pts per clip){'\\n'}
            • Receiving GG votes from other users (+2 pts per GG){'\\n'}
            • Gaining followers (+1 pt per follower){'\\n'}
            • Daily login bonuses (variable based on streak level){'\\n\\n'}
            The user with the highest GG Point total at the end of the contest period wins the Championship.
          </Text>
        </Section>

        <Section title="5. Winner Determination">
          <Text style={s.body}>
            The winner is determined automatically by the Gaming Actions platform based on the highest cumulative GG Points at contest end. In the event of a tie, the user who reached the tied score first (by timestamp) wins. The Sponsor's determination is final and binding.
          </Text>
        </Section>

        <Section title="6. Prizes">
          <Text style={s.body}>
            The monthly Champion receives:{'\\n'}
            • Exclusive "Champion" avatar frame (animated gold electric ring) for 30 days{'\\n'}
            • Exclusive "Champion" video frame for all clips posted during the month{'\\n'}
            • Exclusive "Champion" comment frame{'\\n'}
            • 500 bonus GA Points{'\\n'}
            • Featured shoutout on the Gaming Actions platform{'\\n\\n'}
            Prizes have no cash value. Prizes are non-transferable and cannot be substituted. All prizes are digital and delivered within the Gaming Actions app.
          </Text>
        </Section>

        <Section title="7. Anti-Fraud & Fair Play">
          <Text style={s.body}>
            Any attempt to manipulate, hack, or artificially inflate GG Points (including fake accounts, automated voting, or any other fraudulent means) will result in immediate disqualification and account termination. The Sponsor reserves the right to disqualify any participant at its sole discretion for violation of these rules or the Gaming Actions Community Guidelines.
          </Text>
        </Section>

        <Section title="8. Limitations of Liability">
          <Text style={s.body}>
            The Sponsor is not responsible for technical failures, network outages, or any circumstances beyond its reasonable control that may affect the Contest. The Sponsor reserves the right to cancel, modify, or suspend the Contest at any time.
          </Text>
        </Section>

        <Section title="9. Privacy">
          <Text style={s.body}>
            By participating, users agree to the Gaming Actions Privacy Policy and Terms of Use, available in the app. User data is collected and used in accordance with applicable privacy laws.
          </Text>
        </Section>

        <Section title="10. Governing Law">
          <Text style={s.body}>
            This Contest is governed by the laws of Quebec, Canada. Any disputes shall be resolved in the courts of Quebec, Canada.
          </Text>
        </Section>

        <Section title="11. Contact">
          <Text style={s.body}>
            Questions about the Contest may be directed to: support@gamingactions.com
          </Text>
        </Section>

        <View style={s.footer}>
          <Text style={s.footerText}>
            ⚠️ NO PURCHASE NECESSARY. A PURCHASE DOES NOT IMPROVE YOUR CHANCES OF WINNING. APPLE INC. IS NOT A SPONSOR OF THIS CONTEST.
          </Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  noSponsors: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(201,168,76,0.1)', borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 0.5, borderColor: COLORS.gold + '40', gap: 8 },
  noSponsorsText: { flex: 1, fontSize: 12, color: COLORS.gold, fontWeight: '700', lineHeight: 17 },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  lastUpdated: { fontSize: 11, color: COLORS.gray, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.gold, marginBottom: 8 },
  body: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },
  footer: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 14, marginTop: 10 },
  footerText: { fontSize: 11, color: COLORS.gray, textAlign: 'center', lineHeight: 17, fontWeight: '700' },
});

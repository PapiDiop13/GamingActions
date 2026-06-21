import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import ConsoleIcon from '../../components/ConsoleIcon';

const CONSOLE_GUIDES = [
  {
    id: 'ps5',
    label: 'PlayStation 5',
    icon: '🎮',
    color: '#003791',
    steps: [
      { icon: 'game-controller-outline', text: 'While playing, press the SHARE button (top right of touchpad)' },
      { icon: 'videocam-outline', text: 'Select "Save Video Clip" or "Save Recent Gameplay"' },
      { icon: 'phone-portrait-outline', text: 'Download the PlayStation App on your phone' },
      { icon: 'download-outline', text: 'In the PS App: Game Library → [Your Game] → Captures' },
      { icon: 'share-social-outline', text: 'Download the clip to your phone camera roll' },
      { icon: 'cloud-upload-outline', text: 'Open Gaming Actions → tap + → select your clip' },
    ],
    tip: 'PS5 saves up to 60 minutes of gameplay. For the best clips, use "Save Recent Gameplay" right after a great moment.',
  },
  {
    id: 'ps4',
    label: 'PlayStation 4',
    icon: '🎮',
    color: '#003791',
    steps: [
      { icon: 'game-controller-outline', text: 'Press SHARE button on your controller' },
      { icon: 'videocam-outline', text: 'Choose "Save Video Clip"' },
      { icon: 'phone-portrait-outline', text: 'Open PlayStation App on your phone' },
      { icon: 'download-outline', text: 'Go to your Capture Gallery' },
      { icon: 'share-social-outline', text: 'Download clip to your phone' },
      { icon: 'cloud-upload-outline', text: 'Upload to Gaming Actions' },
    ],
    tip: 'PS4 clips are limited to 15 minutes. Trim your clip before uploading for best results.',
  },
  {
    id: 'xbox',
    label: 'Xbox Series X/S',
    icon: '🟢',
    color: '#107C10',
    steps: [
      { icon: 'game-controller-outline', text: 'Press Xbox button to open the guide' },
      { icon: 'videocam-outline', text: 'Select "Capture" → "Record what happened" or "Start recording"' },
      { icon: 'phone-portrait-outline', text: 'Download Xbox app on your phone' },
      { icon: 'download-outline', text: 'In the Xbox App: Captures → select your clip' },
      { icon: 'share-social-outline', text: 'Share or download to your phone' },
      { icon: 'cloud-upload-outline', text: 'Open Gaming Actions → tap + → upload' },
    ],
    tip: 'Xbox lets you record up to 10 minutes by default. You can change the duration in Settings → Preferences → Broadcast & capture.',
  },
  {
    id: 'switch',
    label: 'Nintendo Switch',
    icon: '🕹️',
    color: '#E4000F',
    steps: [
      { icon: 'game-controller-outline', text: 'Press the Capture button (left Joy-Con or Pro Controller)' },
      { icon: 'videocam-outline', text: 'Hold it for a video (up to 30 seconds)' },
      { icon: 'phone-portrait-outline', text: 'Go to Album from the Home Screen' },
      { icon: 'share-social-outline', text: 'Select your clip → Send to Smartphone' },
      { icon: 'qr-code-outline', text: 'Scan the QR code with your phone to download' },
      { icon: 'cloud-upload-outline', text: 'Upload to Gaming Actions from your camera roll' },
    ],
    tip: 'Switch only records 30-second clips natively. For longer gameplay, consider a capture card.',
  },
  {
    id: 'pc',
    label: 'PC / Steam',
    icon: '🖥️',
    color: '#00D4FF',
    steps: [
      { icon: 'desktop-outline', text: 'Use NVIDIA ShadowPlay (GeForce) or AMD ReLive to record' },
      { icon: 'videocam-outline', text: 'Or use the Xbox Game Bar: Win + G → Record (Win + Alt + R)' },
      { icon: 'folder-outline', text: 'Find your clip in Videos → Captures folder' },
      { icon: 'share-social-outline', text: 'Transfer to your phone via USB, Google Drive, AirDrop, etc.' },
      { icon: 'cloud-upload-outline', text: 'Upload to Gaming Actions' },
    ],
    tip: 'OBS Studio is the best free option for PC recording. Set it to record in 1080p 60fps for best quality.',
  },
  {
    id: 'mobile',
    label: 'Mobile Games',
    icon: '📱',
    color: COLORS.gold,
    steps: [
      { icon: 'phone-portrait-outline', text: 'On iPhone: Control Center → Screen Record (long press for mic)' },
      { icon: 'logo-android', text: 'On Android: Quick Settings → Screen Recorder' },
      { icon: 'videocam-outline', text: 'Start recording before your game moment' },
      { icon: 'cut-outline', text: 'Trim the clip in your camera app' },
      { icon: 'cloud-upload-outline', text: 'Upload directly to Gaming Actions' },
    ],
    tip: 'Mobile recordings save directly to your camera roll. Enable microphone if you want to capture your reactions!',
  },
];

export default function HowToUploadScreen({ navigation }) {
  const [selectedConsole, setSelectedConsole] = useState('ps5');
  const guide = CONSOLE_GUIDES.find(g => g.id === selectedConsole);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>How to Upload</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.hero}>
          <Ionicons name="cloud-upload-outline" size={40} color={COLORS.gold} />
          <Text style={styles.heroTitle}>Get Your Clips Into Gaming Actions</Text>
          <Text style={styles.heroSub}>Step-by-step guide for every platform</Text>
        </View>

        {/* Console selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.consoleRow}>
          {CONSOLE_GUIDES.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setSelectedConsole(c.id)}
              style={[styles.consoleChip, selectedConsole === c.id && { backgroundColor: c.color + '20', borderColor: c.color }]}
            >
              <ConsoleIcon id={c.id} size={18} style={{ marginBottom: 4 }} />
              <Text style={[styles.consoleLabel, selectedConsole === c.id && { color: COLORS.white }]}>{c.label.split(' ')[0]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Guide */}
        {guide && (
          <View style={styles.guideCard}>
            <View style={[styles.guideHeader, { borderLeftColor: guide.color }]}>
              <Text style={styles.guideEmoji}>{guide.icon}</Text>
              <Text style={styles.guideTitle}>{guide.label}</Text>
            </View>

            {guide.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={[styles.stepNum, { backgroundColor: guide.color + '20' }]}>
                  <Text style={[styles.stepNumText, { color: guide.color }]}>{i + 1}</Text>
                </View>
                <View style={[styles.stepIcon, { backgroundColor: COLORS.card }]}>
                  <Ionicons name={step.icon} size={16} color={guide.color} />
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}

            <View style={styles.tipBox}>
              <Ionicons name="bulb-outline" size={16} color={COLORS.gold} />
              <Text style={styles.tipText}>{guide.tip}</Text>
            </View>
          </View>
        )}

        {/* General tips */}
        <Text style={styles.sectionLabel}>TIPS FOR GREAT CLIPS</Text>
        <View style={styles.tipsCard}>
          {[
            { icon: 'resize-outline', color: COLORS.blue, text: 'Recommended: 1080p or 720p, max 500MB, under 5 minutes' },
            { icon: 'cut-outline', color: COLORS.gold, text: 'Trim to the highlight moment — 30 to 90 seconds gets the most GG' },
            { icon: 'musical-notes-outline', color: '#7C4DFF', text: 'Avoid copyrighted music to prevent your clip from being muted' },
            { icon: 'star-outline', color: COLORS.gold, text: 'Add a Legendary frame to stand out in the feed' },
            { icon: 'time-outline', color: COLORS.green, text: 'Post within 24 hours of your gameplay for maximum reach' },
          ].map((tip, i) => (
            <View key={i} style={[styles.generalTip, i < 4 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }]}>
              <View style={[styles.tipIconWrap, { backgroundColor: tip.color + '18' }]}>
                <Ionicons name={tip.icon} size={16} color={tip.color} />
              </View>
              <Text style={styles.generalTipText}>{tip.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity onPress={() => navigation.navigate('ContentType')} style={styles.uploadBtn}>
          <Ionicons name="cloud-upload-outline" size={18} color={COLORS.black} />
          <Text style={styles.uploadBtnText}>Upload a Clip Now</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  hero: { alignItems: 'center', padding: 24, backgroundColor: '#0d0a1a', borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  heroTitle: { fontSize: 18, fontWeight: '900', color: COLORS.white, marginTop: 12, textAlign: 'center' },
  heroSub: { fontSize: 12, color: COLORS.gray, marginTop: 6 },
  consoleRow: { paddingHorizontal: 14, paddingVertical: 12 },
  consoleChip: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 10 },
  consoleEmoji: { fontSize: 18, marginBottom: 4 },
  consoleLabel: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  guideCard: { margin: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  guideHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, borderLeftWidth: 3 },
  guideEmoji: { fontSize: 24, marginRight: 10 },
  guideTitle: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  stepNumText: { fontSize: 11, fontWeight: '800' },
  stepIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  stepText: { flex: 1, fontSize: 13, color: COLORS.white, lineHeight: 18, paddingTop: 5 },
  tipBox: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, backgroundColor: 'rgba(201,168,76,0.06)' },
  tipText: { flex: 1, fontSize: 12, color: COLORS.gold, lineHeight: 17, marginLeft: 8 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 10 },
  tipsCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  generalTip: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  tipIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  generalTipText: { flex: 1, fontSize: 13, color: COLORS.white, lineHeight: 17 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginTop: 20, backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 16 },
  uploadBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
});
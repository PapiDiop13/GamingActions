import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp, getDocs, query, where, updateDoc, doc, increment } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

const REPORT_REASONS = {
  video: [
    { id: 'inappropriate', label: 'Inappropriate or explicit content', icon: 'eye-off-outline' },
    { id: 'harassment', label: 'Harassment or hate speech', icon: 'alert-circle-outline' },
    { id: 'spam', label: 'Spam or misleading content', icon: 'ban-outline' },
    { id: 'violence', label: 'Violence or dangerous content', icon: 'warning-outline' },
    { id: 'ip', label: 'Copyright or IP violation', icon: 'shield-outline' },
    { id: 'fake', label: 'Fake gameplay or edited to cheat', icon: 'game-controller-outline' },
    { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
  ],
  profile: [
    { id: 'fake', label: 'Fake account or impersonation', icon: 'person-remove-outline' },
    { id: 'harassment', label: 'Harassment or threatening behavior', icon: 'alert-circle-outline' },
    { id: 'spam', label: 'Spam account', icon: 'ban-outline' },
    { id: 'underage', label: 'Underage user', icon: 'warning-outline' },
    { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
  ],
  comment: [
    { id: 'harassment', label: 'Harassment or hate speech', icon: 'alert-circle-outline' },
    { id: 'inappropriate', label: 'Inappropriate or explicit', icon: 'eye-off-outline' },
    { id: 'spam', label: 'Spam or scam', icon: 'ban-outline' },
    { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
  ],
};

export default function ReportScreen({ navigation, route }) {
    const { user, userProfile } = useAuthStore();
    const { target, targetType = 'video' } = route?.params || {};
    const [selectedReason, setSelectedReason] = useState(null);
    const [details, setDetails] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

  // Can't report your own content
  const isOwnContent = (targetType === 'video' && target?.userId === user?.uid) || (targetType === 'profile' && (target?.uid || target?.id) === user?.uid);
  if (isOwnContent) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0F', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <Ionicons name="information-circle" size={50} color="#888899" />
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 16 }}>Can't Report</Text>
        <Text style={{ color: '#888899', fontSize: 14, textAlign: 'center', marginTop: 8 }}>You cannot report your own content.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 24, backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 30 }}>
          <Text style={{ fontSize: 15, fontWeight: '900', color: '#0A0A0F' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const reasons = REPORT_REASONS[targetType] || REPORT_REASONS.video;

  const handleSubmit = async () => {
    if (!selectedReason) return Alert.alert('Select a reason', 'Please select a reason for reporting.');
    setLoading(true);
    try {
      const videoId = target?.id || target?.uid || null;
      await addDoc(collection(db, 'reports'), {
        reportedBy: user?.uid,
        reporterUsername: userProfile?.username || 'Unknown',
        targetId: videoId,
        targetType,
        targetUsername: target?.username || null,
        reason: selectedReason,
        details: details.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Incrémenter le compteur de reports sur la vidéo
      if (targetType === 'video' && videoId) {
        await updateDoc(doc(db, 'videos', videoId), { reportCount: increment(1) });
        // Auto-hide si 10+ reports
        const reportsSnap = await getDocs(
          query(collection(db, 'reports'), where('targetId', '==', videoId), where('targetType', '==', 'video'))
        );
        if (reportsSnap.size >= 10) {
          await updateDoc(doc(db, 'videos', videoId), {
            restricted: true,
            restrictedAt: serverTimestamp(),
            restrictedReason: 'Auto-flagged: 10+ community reports',
            autoFlagged: true,
          });
        }
      }

      setSubmitted(true);
    } catch (e) {
      Alert.alert('Error', 'Could not submit report. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  if (submitted) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.successContainer}>
          <Ionicons name="shield-checkmark" size={72} color={COLORS.green} />
          <Text style={styles.successTitle}>Report Submitted</Text>
          <Text style={styles.successDesc}>Thank you for helping keep Gaming Actions safe. Our team will review this report within 24 hours.</Text>
          <View style={styles.successInfo}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.blue} />
            <Text style={styles.successInfoText}>You will be notified of the outcome. Repeated false reports may result in restrictions on your account.</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report {targetType === 'profile' ? 'Profile' : targetType === 'comment' ? 'Comment' : 'Video'}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.banner}>
          <Ionicons name="flag-outline" size={28} color={COLORS.red} />
          <Text style={styles.bannerText}>Reports are anonymous. Our moderation team reviews all reports within 24 hours.</Text>
        </View>

        <Text style={styles.sectionLabel}>REASON FOR REPORTING</Text>
        {reasons.map((r) => (
          <TouchableOpacity
            key={r.id}
            onPress={() => setSelectedReason(r.id)}
            style={[styles.reasonCard, selectedReason === r.id && styles.reasonCardActive]}
          >
            <View style={[styles.reasonIcon, selectedReason === r.id && { backgroundColor: COLORS.red + '18' }]}>
              <Ionicons name={r.icon} size={18} color={selectedReason === r.id ? COLORS.red : COLORS.gray} />
            </View>
            <Text style={[styles.reasonLabel, selectedReason === r.id && { color: COLORS.white }]}>{r.label}</Text>
            {selectedReason === r.id && <Ionicons name="checkmark-circle" size={20} color={COLORS.red} />}
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionLabel}>ADDITIONAL DETAILS (optional)</Text>
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="Add any additional context that might help our team..."
          placeholderTextColor={COLORS.gray}
          style={styles.textarea}
          multiline
          maxLength={300}
        />
        <Text style={styles.charCount}>{details.length}/300</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          style={[styles.submitBtn, !selectedReason && { opacity: 0.5 }]}
          disabled={!selectedReason || loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <Ionicons name="flag" size={16} color={COLORS.white} />
              <Text style={styles.submitBtnText}>Submit Report</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  banner: { flexDirection: 'row', alignItems: 'flex-start', margin: 14, padding: 14, backgroundColor: 'rgba(255,45,85,0.08)', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.red + '40' },
  bannerText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17, marginLeft: 10 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10 },
  reasonCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  reasonCardActive: { backgroundColor: 'rgba(255,45,85,0.05)' },
  reasonIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  reasonLabel: { flex: 1, fontSize: 14, color: COLORS.gray },
  textarea: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, fontSize: 13, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, minHeight: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 10, color: COLORS.gray, textAlign: 'right', paddingRight: 14, marginTop: 4 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginTop: 20, backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: 15 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.white, marginLeft: 8 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  successTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white, marginTop: 20, marginBottom: 12 },
  successDesc: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  successInfo: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 0.5, borderColor: COLORS.blue + '40' },
  successInfoText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17, marginLeft: 8 },
  backBtn: { backgroundColor: COLORS.card, paddingHorizontal: 30, paddingVertical: 14, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.gray3 },
  backBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
});
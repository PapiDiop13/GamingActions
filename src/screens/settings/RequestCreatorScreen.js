import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

const MIN_FOLLOWERS = 100;

const CREATOR_TYPES = [
  { id: 'creator', label: 'Creator', desc: 'You create tips, tutos and gaming content regularly', icon: 'videocam-outline', color: COLORS.blue },
  { id: 'developer', label: 'Game Developer', desc: 'You develop games and want to share dev diaries', icon: 'code-slash-outline', color: '#7C4DFF' },
];

// Termes et conditions que le créateur doit accepter
const TERMS = [
  { icon: 'videocam-outline', text: 'I will only post my own original content — no copyrighted videos, music, or footage I do not own.' },
  { icon: 'shield-checkmark-outline', text: 'I will keep my content clean: no sexual, violent, hateful, or otherwise inappropriate material.' },
  { icon: 'people-outline', text: 'I will respect the community and follow the Gaming Actions Community Guidelines at all times.' },
  { icon: 'cash-outline', text: 'I understand that GA Points cannot be converted to real money. Only Thanks generate real earnings.' },
  { icon: 'gift-outline', text: 'I understand that as a Creator/Gameconic, I cannot send Thanks to others (to keep the economy fair).' },
  { icon: 'alert-circle-outline', text: 'I understand that violating these terms can result in losing my Creator status, strikes, or a ban.' },
];

export default function RequestCreatorScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [selectedType, setSelectedType] = useState(null);
  const [motivation, setMotivation] = useState('');
  const [links, setLinks] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingReq, setExistingReq] = useState(null);
  const [checking, setChecking] = useState(true);

  const followers = userProfile?.followers || 0;
  const meetsFollowers = followers >= MIN_FOLLOWERS;
  const remaining = Math.max(0, MIN_FOLLOWERS - followers);

  // Vérifie si une demande existe déjà
  React.useEffect(() => {
    if (!user?.uid) { setChecking(false); return; }
    getDocs(query(collection(db, 'creator_requests'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')))
      .then(snap => {
        if (!snap.empty) {
          const latest = snap.docs[0].data();
          // Si la dernière demande est en attente ou approuvée, on bloque une nouvelle
          if (latest.status === 'pending' || latest.status === 'approved') {
            setExistingReq({ id: snap.docs[0].id, ...latest });
          }
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [user?.uid]);

  const handleSubmit = async () => {
    if (!selectedType) return Alert.alert('Missing', 'Please select a creator type.');
    if (motivation.length < 50) return Alert.alert('Missing', 'Please write at least 50 characters of motivation.');
    if (!acceptedTerms) return Alert.alert('Terms required', 'You must accept the Creator Terms & Conditions before submitting.');

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'creator_requests'), {
        userId: user?.uid,
        username: userProfile?.username || 'Player',
        avatar: userProfile?.avatar || '',
        email: userProfile?.email || user?.email || '',
        followers,
        clips: userProfile?.clipsCount || 0,
        creatorType: selectedType,
        motivation: motivation.trim(),
        links: links.trim(),
        acceptedTerms: true,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setSubmitting(false);
      setSubmitted(true);
    } catch (e) {
      setSubmitting(false);
      Alert.alert('Error', 'Could not submit your request. Please try again later.');
    }
  };

  // ─── Écran : demande déjà existante (pending/approved) ───
  if (checking) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Creator Request</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.gold} />
        </View>
      </View>
    );
  }

  if (existingReq && !submitted) {
    const isPending = existingReq.status === 'pending';
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Creator Request</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.successContainer}>
          <Ionicons
            name={isPending ? 'hourglass-outline' : 'checkmark-circle'}
            size={72}
            color={isPending ? COLORS.gold : COLORS.green}
          />
          <Text style={styles.successTitle}>{isPending ? 'Request Under Review' : 'You are a Creator! 🎉'}</Text>
          <Text style={styles.successDesc}>
            {isPending
              ? 'Your creator request has been submitted and is currently being reviewed. We will notify you within 3-5 business days.'
              : 'Your creator request was approved. Welcome aboard!'}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: isPending ? COLORS.gold + '20' : COLORS.green + '20' }]}>
            <Text style={[styles.statusPillText, { color: isPending ? COLORS.gold : COLORS.green }]}>
              {isPending ? '⏳ PENDING' : '✓ APPROVED'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Écran : pas assez de followers ───
  if (!meetsFollowers) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Become a Creator</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.lockedContainer}>
          <View style={styles.lockCircle}>
            <Ionicons name="lock-closed" size={48} color={COLORS.gold} />
          </View>
          <Text style={styles.lockedTitle}>Almost there!</Text>
          <Text style={styles.lockedDesc}>
            You need at least {MIN_FOLLOWERS} followers to apply for Creator status.
          </Text>
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, (followers / MIN_FOLLOWERS) * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>{followers} / {MIN_FOLLOWERS} followers</Text>
          </View>
          <View style={styles.remainingCard}>
            <Ionicons name="people-outline" size={20} color={COLORS.gold} />
            <Text style={styles.remainingText}>
              <Text style={{ fontWeight: '900', color: COLORS.gold }}>{remaining} more followers</Text> to unlock your Creator application.
            </Text>
          </View>
          <Text style={styles.tipText}>💡 Keep posting great clips and engaging with the community to grow your audience!</Text>
        </View>
      </View>
    );
  }

  // ─── Écran : confirmation ───
  if (submitted) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Creator Request</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={72} color={COLORS.green} />
          <Text style={styles.successTitle}>Request Submitted!</Text>
          <Text style={styles.successDesc}>We will review your profile and get back to you within 3-5 business days via notifications.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Écran principal ───
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Request</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.banner}>
          <Ionicons name="rocket-outline" size={32} color={COLORS.gold} />
          <Text style={styles.bannerTitle}>Become a Creator</Text>
          <Text style={styles.bannerDesc}>Unlock tips, fanbase, and creator tools</Text>
          <View style={styles.eligibleBadge}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.green} />
            <Text style={styles.eligibleText}> {followers} followers — you're eligible!</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>CREATOR TYPE</Text>
        {CREATOR_TYPES.map((t) => (
          <TouchableOpacity key={t.id} onPress={() => setSelectedType(t.id)} style={[styles.typeCard, selectedType === t.id && { borderColor: t.color, backgroundColor: t.color + '10' }]}>
            <View style={[styles.typeIcon, { backgroundColor: t.color + '18' }]}>
              <Ionicons name={t.icon} size={22} color={t.color} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.typeTitle}>{t.label}</Text>
              <Text style={styles.typeDesc}>{t.desc}</Text>
            </View>
            {selectedType === t.id && <Ionicons name="checkmark-circle" size={20} color={t.color} />}
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionLabel}>MOTIVATION</Text>
        <TextInput
          value={motivation}
          onChangeText={setMotivation}
          placeholder="Why do you want to become a creator? What content will you share? (min 50 chars)"
          placeholderTextColor={COLORS.gray}
          style={styles.textarea}
          multiline
          maxLength={500}
        />
        <Text style={styles.charCount}>{motivation.length}/500</Text>

        <Text style={styles.sectionLabel}>YOUR MAIN LINK (optional)</Text>
        <TextInput
          value={links}
          onChangeText={setLinks}
          placeholder="YouTube / Twitch / Kick / TikTok / Facebook..."
          placeholderTextColor={COLORS.gray}
          style={styles.input}
          autoCapitalize="none"
        />

        {/* Termes et conditions */}
        <Text style={styles.sectionLabel}>CREATOR TERMS & CONDITIONS</Text>
        <View style={styles.termsCard}>
          {TERMS.map((t, i) => (
            <View key={i} style={styles.termRow}>
              <Ionicons name={t.icon} size={16} color={COLORS.gold} style={{ marginTop: 1 }} />
              <Text style={styles.termText}>{t.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={() => setAcceptedTerms(!acceptedTerms)} style={styles.acceptRow} activeOpacity={0.8}>
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
            {acceptedTerms && <Ionicons name="checkmark" size={16} color={COLORS.black} />}
          </View>
          <Text style={styles.acceptText}>I have read and accept the Creator Terms & Conditions above.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSubmit}
          style={[styles.submitBtn, (!acceptedTerms || submitting) && { opacity: 0.5 }]}
          disabled={!acceptedTerms || submitting}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <>
              <Ionicons name="rocket-outline" size={18} color={COLORS.black} />
              <Text style={styles.submitBtnText}>Submit Request</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  banner: { alignItems: 'center', padding: 24, backgroundColor: '#0d0820', borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  bannerTitle: { fontSize: 22, fontWeight: '900', color: COLORS.gold, marginTop: 10 },
  bannerDesc: { fontSize: 13, color: COLORS.gray, marginTop: 4 },
  eligibleBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: COLORS.green + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  eligibleText: { fontSize: 12, color: COLORS.green, fontWeight: '700' },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 10 },
  typeCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 10, padding: 14, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  typeIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  typeDesc: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  textarea: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, fontSize: 13, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, minHeight: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 10, color: COLORS.gray, textAlign: 'right', paddingRight: 14, marginTop: 4 },
  input: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 13, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3 },
  termsCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  termRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 },
  termText: { flex: 1, fontSize: 12, color: COLORS.gray, marginLeft: 10, lineHeight: 17 },
  acceptRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 14 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: COLORS.gold },
  acceptText: { flex: 1, fontSize: 12, color: COLORS.white, marginLeft: 10, lineHeight: 17 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginTop: 20, backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 16 },
  submitBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  successTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white, marginTop: 20, marginBottom: 12 },
  successDesc: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20 },
  backBtn: { marginTop: 30, backgroundColor: COLORS.gold, paddingHorizontal: 30, paddingVertical: 14, borderRadius: 14 },
  backBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.black },
  statusPill: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  statusPillText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  lockedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  lockCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.gold + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  lockedTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white, marginBottom: 10 },
  lockedDesc: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  progressWrap: { width: '100%', marginBottom: 20 },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: COLORS.card, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: COLORS.gold },
  progressText: { fontSize: 12, color: COLORS.gray, textAlign: 'center', marginTop: 8, fontWeight: '600' },
  remainingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  remainingText: { flex: 1, fontSize: 13, color: COLORS.white, marginLeft: 10, lineHeight: 18 },
  tipText: { fontSize: 12, color: COLORS.gray, textAlign: 'center', marginTop: 24, lineHeight: 18 },
});

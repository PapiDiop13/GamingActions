import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  Image, Dimensions, Alert, Animated,
} from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../config/firebase';
import { COLORS } from '../constants/colors';
import useAuthStore from '../store/useAuthStore';
import GAAlert from './GAAlert';

const { width: SW, height: SH } = Dimensions.get('window');

const RULES = [
  { emoji: '🎮', title: 'The Spirit', body: 'Gaming Actions is built on respect, competition, and authentic gameplay.' },
  { emoji: '✅', title: "What's Welcome", items: ['Your best gaming clips', 'Fair GG votes', 'Respectful comments', 'Constructive tips'] },
  { emoji: '🚫', title: "What's Forbidden", danger: true, items: ['Harassment or hate speech', 'Fake GG farming', 'Spam uploads', 'Cheating or hacked gameplay', 'Sexual or violent content', 'Content targeting minors'] },
  { emoji: '⚠️', title: 'Consequences', items: ['Warning → Strike → Permanent ban', 'Fraudulent points removed', 'Champion titles revoked'] },
];

// Mémoire locale — reset à chaque sign out/sign in
const seenAnnouncementIds = new Set();

export default function AppOverlays() {
  const { user, userProfile } = useAuthStore();
  const [slides, setSlides] = useState([]); // [{type:'guidelines'} | {type:'announcement', data:{}}]
  const [currentSlide, setCurrentSlide] = useState(0);
  const [visible, setVisible] = useState(false);
  const [imgSize, setImgSize] = useState({ width: SW - 48, height: 180 });
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user?.uid || !userProfile) return;

    const buildSlides = async () => {
      const s = [];

      // Slide 1 : guidelines si pas encore accepté
      if (!userProfile.acceptedGuidelines) {
        s.push({ type: 'guidelines' });
      }

      // Slide 2 : annonce si active et pas encore vue cette session
      try {
        const snap = await getDoc(doc(db, 'app_config', 'announcement'));
        if (snap.exists() && snap.data().active) {
          const d = snap.data();
          const annId = d.announcementId || d.updatedAt?.seconds?.toString() || 'default';
          if (!seenAnnouncementIds.has(annId)) {
            const ann = { ...d, _id: annId };
            if (d.imageUrl) {
              Image.getSize(d.imageUrl, (w, h) => {
                const ratio = h / w;
                setImgSize({ width: SW - 48, height: Math.min((SW - 48) * ratio, SH * 0.35) });
              }, () => {});
            }
            s.push({ type: 'announcement', data: ann });
          }
        }
      } catch (e) {}

      if (s.length > 0) {
        setSlides(s);
        setCurrentSlide(0);
        setVisible(true);
      }
    };

    buildSlides();
  }, [user?.uid]);

  const animateNext = (cb) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -20, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start(cb);
  };

  const goNext = () => {
    if (currentSlide < slides.length - 1) {
      animateNext(() => setCurrentSlide(i => i + 1));
    } else {
      setVisible(false);
    }
  };

  const handleAcceptGuidelines = async () => {
    try {
      if (user?.uid) await updateDoc(doc(db, 'users', user.uid), { acceptedGuidelines: true });
    } catch (e) {}
    goNext();
  };

  const handleRefuseGuidelines = () => {
    Alert.alert('Are you sure?', 'You must accept the Community Guidelines to use Gaming Actions. Refusing will sign you out.', [
      { text: 'Go back', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        setVisible(false);
        try { await signOut(auth); } catch (e) {}
      }},
    ]);
  };

  const handleDismissAnnouncement = (annId) => {
    if (annId) seenAnnouncementIds.add(annId);
    goNext();
  };

  if (!visible || slides.length === 0) return <GAAlert />;

  const slide = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;
  const showDots = slides.length > 1;

  return (
    <>
      <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { transform: [{ translateX: slideAnim }] }]}>

          {/* Dots de navigation */}
          {showDots && (
            <View style={s.dots}>
              {slides.map((_, i) => (
                <View key={i} style={[s.dot, i === currentSlide && s.dotActive]} />
              ))}
            </View>
          )}

          {slide.type === 'guidelines' && (
            <>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                <Text style={s.title}>Community Guidelines</Text>
                <Text style={s.subtitle}>Please read and accept before continuing</Text>
                {RULES.map((section, i) => (
                  <View key={i} style={s.section}>
                    <Text style={s.sectionTitle}>{section.emoji} {section.title}</Text>
                    {section.body && <Text style={s.body}>{section.body}</Text>}
                    {section.items && section.items.map((item, j) => (
                      <View key={j} style={s.itemRow}>
                        <Text style={[s.bullet, section.danger && { color: COLORS.red }]}>{section.danger ? '✗' : '›'}</Text>
                        <Text style={s.itemText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                <Text style={s.footer}>By tapping "I Accept" you agree to follow these guidelines.</Text>
              </ScrollView>
              <View style={s.btnRow}>
                <TouchableOpacity onPress={handleRefuseGuidelines} style={s.refuseBtn}>
                  <Text style={s.refuseBtnText}>I Refuse</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAcceptGuidelines} style={s.nextBtn}>
                  <Text style={s.nextBtnText}>I Accept ✅{!isLast ? '  →' : ''}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {slide.type === 'announcement' && slide.data && (
            <>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                {slide.data.imageUrl && (
                  <Image
                    source={{ uri: slide.data.imageUrl }}
                    style={[s.annImg, { width: imgSize.width, height: imgSize.height }]}
                    resizeMode="cover"
                  />
                )}
                {slide.data.title && <Text style={s.annTitle}>{slide.data.title}</Text>}
                {slide.data.message && <Text style={s.annMessage}>{slide.data.message}</Text>}
              </ScrollView>
              <TouchableOpacity onPress={() => handleDismissAnnouncement(slide.data._id)} style={s.fullBtn}>
                <Text style={s.fullBtnText}>{slide.data.buttonText || 'Got it 👍'}</Text>
              </TouchableOpacity>
            </>
          )}

        </Animated.View>
      </View>
    </Modal>
    <GAAlert />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: 20, width: '100%', maxHeight: SH * 0.85, borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gray3, marginHorizontal: 3 },
  dotActive: { backgroundColor: COLORS.gold, width: 18 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 12, color: COLORS.gray, textAlign: 'center', marginBottom: 16 },
  section: { backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white, marginBottom: 6 },
  body: { fontSize: 12, color: COLORS.gray, lineHeight: 18 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  bullet: { fontSize: 13, color: COLORS.gold, fontWeight: '900', marginRight: 8, marginTop: 1 },
  itemText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 18 },
  footer: { fontSize: 10, color: COLORS.gray2, textAlign: 'center', marginTop: 10, lineHeight: 16, fontStyle: 'italic' },
  btnRow: { flexDirection: 'row', marginTop: 14 },
  refuseBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.red, alignItems: 'center', marginRight: 10 },
  refuseBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.red },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.gold, alignItems: 'center' },
  nextBtnText: { fontSize: 14, fontWeight: '900', color: COLORS.black },
  fullBtn: { width: '100%', paddingVertical: 16, borderRadius: 12, backgroundColor: COLORS.gold, alignItems: 'center', marginTop: 10 },
  fullBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black },
  annImg: { borderRadius: 12, marginBottom: 16, alignSelf: 'center' },
  annTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 10 },
  annMessage: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 21, marginBottom: 8 },
});

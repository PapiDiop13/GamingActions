import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  Dimensions, Share, Modal, Image, Alert, Linking, RefreshControl,
  TouchableWithoutFeedback, Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import useUserStore from '../../store/useUserStore';
import useFanbaseStore from '../../store/useFanbaseStore';
import { db } from '../../config/firebase';
import { POINTS } from '../../utils/points';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { showAlert } from '../../store/useAlertStore';
import { ringColorForUser, glowColorForUser, getFrameById, getVideoFrameById } from '../../constants/frames';
import { getCosmeticById, PROFILE_BACKGROUNDS, PROFILE_BANNERS, USERNAME_EFFECTS, PROFILE_BADGES, CARD_BORDERS } from '../../constants/cosmetics';
import { ElectricBanner, ChampionBadge, LeaderBadge } from '../../components/ElectricEffect';
import FramedAvatar from '../../components/FramedAvatar';

// ─── Utilitaire de contraste adaptatif ────────────────────────────────────────
const TC_DARK = {
  primary:   '#FFFFFF',
  secondary: '#B0B0CC',
  muted:     'rgba(255,255,255,0.55)',
  statBg:    'rgba(255,255,255,0.06)',
  statBorder:'rgba(255,255,255,0.10)',
  editBtn:   'rgba(255,255,255,0.08)',
  editBorder:'rgba(255,255,255,0.25)',
  tabBorder: 'rgba(255,255,255,0.10)',
  isDark: true,
};
const TC_LIGHT = {
  primary:   '#0A0A0F',
  secondary: '#333344',
  muted:     'rgba(0,0,0,0.55)',
  statBg:    'rgba(0,0,0,0.07)',
  statBorder:'rgba(0,0,0,0.12)',
  editBtn:   'rgba(0,0,0,0.08)',
  editBorder:'rgba(0,0,0,0.25)',
  tabBorder: 'rgba(0,0,0,0.12)',
  isDark: false,
};

// Luminance WCAG d'une couleur hex
function _lum(hex) {
  try {
    if (!hex || hex[0] !== '#') return 0;
    const h = hex.replace('#','');
    const r = parseInt(h.slice(0,2),16)/255;
    const g = parseInt(h.slice(2,4),16)/255;
    const b = parseInt(h.slice(4,6),16)/255;
    const lin = x => x<=0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055,2.4);
    return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  } catch { return 0; }
}

function getBgTextColors(bgId) {
  try {
    if (!bgId || bgId === 'bg_none') return TC_DARK;
    const bg = PROFILE_BACKGROUNDS.find(b => b.id === bgId);
    if (!bg) return TC_DARK;
    const mainColor = (bg.colors && bg.colors[0]) || '#0A0A0F';
    return _lum(mainColor) > 0.35 ? TC_LIGHT : TC_DARK;
  } catch { return TC_DARK; }
}



const { width: SW, height: SH } = Dimensions.get('window');
const THUMB_SIZE = (SW - 4) / 3; // 3 colonnes
const THUMB_H = THUMB_SIZE * 0.80; // plus haut qu'avant (était 0.65)
const BANNER_H = Math.round(SW / 3); // ratio 3:1, cohérent avec le recadrage d'EditProfile
const GREEN = '#00C853';

const STREAK_LEVELS = [
  { id: 'noob', label: 'NOOB', minPoints: 0, color: '#333333', dailyBonus: 1 },
  { id: 'bronze', label: 'BRONZE', minPoints: 500, color: '#CD7F32', dailyBonus: 3 },
  { id: 'silver', label: 'SILVER', minPoints: 2000, color: '#C0C0C0', dailyBonus: 5 },
  { id: 'gold', label: 'GOLD', minPoints: 5000, color: '#C9A84C', dailyBonus: 10 },
  { id: 'goat', label: 'GOAT 🐐', minPoints: 15000, color: '#FF2D55', dailyBonus: 15 },
];


const SOCIAL_ICONS = {
  youtube: { icon: 'logo-youtube', color: '#FF0000' },
  twitch: { icon: 'logo-twitch', color: '#9146FF' },
  twitter: { icon: 'logo-twitter', color: '#1DA1F2' },
  instagram: { icon: 'logo-instagram', color: '#E1306C' },
  tiktok: { icon: 'musical-notes-outline', color: '#01D4FF' },
  discord: { icon: 'chatbubbles-outline', color: '#5865F2' },
};

function Avatar({ user, size = 36 }) {
    const initials = (user?.username || 'GA').slice(0, 2).toUpperCase();
    const ringColor = ringColorForUser(user, COLORS.gold);
    const glowColor = glowColorForUser(user);
    return (
      <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
        {glowColor && (
          <View style={{ position: 'absolute', width: size + 12, height: size + 12, borderRadius: (size + 12) / 2, backgroundColor: glowColor, opacity: 0.22 }} />
        )}
        <View style={[avS.circle, { width: size, height: size, borderRadius: size / 2, borderColor: ringColor }]}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
          ) : (
            <Text style={[avS.text, { fontSize: size * 0.35 }]}>{initials}</Text>
          )}
        </View>
      </View>
    );
  }
const avS = StyleSheet.create({
  circle: { backgroundColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.gold },
  text: { color: COLORS.gold, fontWeight: '800' },
});

function GGInfoPopup({ visible, onClose, navigation }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <TouchableOpacity style={popS.backdrop} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={popS.card} activeOpacity={1}>
          <View style={[popS.iconCircle, { backgroundColor: 'rgba(201,168,76,0.15)' }]}>
            <Text style={{ fontSize: 24 }}>⭐</Text>
          </View>
          <Text style={popS.title}>GG — What is it?</Text>
          <Text style={popS.subtitle}>GG is how you support a clip on Gaming Actions.</Text>
          {[
            { icon: 'hand-left-outline', color: COLORS.gold, text: 'Tap GG on any clip to support the creator' },
            { icon: 'trophy-outline', color: COLORS.gold, text: 'GGs count in monthly rankings — top 10 win rewards' },
            { icon: 'star-outline', color: COLORS.gold, text: 'Receiving GGs earns you +2 GA Points each' },
            { icon: 'refresh-outline', color: COLORS.blue, text: 'Rankings reset every 1st of the month' },
          ].map((item, i) => (
            <View key={i} style={popS.row}>
              <View style={[popS.rowIcon, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon} size={16} color={item.color} />
              </View>
              <Text style={popS.rowText}>{item.text}</Text>
            </View>
          ))}
          <View style={popS.btnRow}>
            <TouchableOpacity onPress={() => { onClose(); navigation.navigate('Rankings'); }} style={popS.secondBtn}>
              <Text style={popS.secondBtnText}>View Rankings</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={popS.mainBtn}>
              <Text style={popS.mainBtnText}>Got it 👍</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function GAPointsPopup({ visible, onClose, navigation }) {
  const EARN = [
    { icon: 'cloud-upload-outline', color: COLORS.gold, action: 'Post a clip', points: '+25 pts' },
    { icon: 'star-outline', color: COLORS.gold, action: 'Receive a GG', points: '+2 pts' },
    { icon: 'person-add-outline', color: COLORS.blue, action: 'Get a new follower', points: '+1 pt' },
    { icon: 'calendar-outline', color: GREEN, action: 'Daily login', points: '+10 pts' },
    { icon: 'people-outline', color: COLORS.blue, action: 'New fanbase subscriber', points: '+20 pts' },
    { icon: 'trophy-outline', color: COLORS.gold, action: 'Monthly Top 10', points: '+200 pts' },
    { icon: 'medal-outline', color: COLORS.gold, action: 'Monthly Champion', points: '+500 pts' },
  ];
  const USE = [
    { icon: 'bag-outline', color: COLORS.blue, action: 'Buy frames & badges in Shop', points: 'From 250 pts' },
    { icon: 'star-outline', color: COLORS.gold, action: 'Unlock Legendary plan', points: '15,000 pts' },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <TouchableOpacity style={popS.backdrop} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={popS.card}>
          <View style={[popS.iconCircle, { backgroundColor: 'rgba(0,212,255,0.12)' }]}>
            <Ionicons name="diamond" size={26} color={COLORS.blue} />
          </View>
          <Text style={popS.title}>GA Points</Text>
          <Text style={popS.subtitle}>Earn through activity. Use in Shop or unlock Legendary.</Text>
          <ScrollView showsVerticalScrollIndicator={true} style={{ flexGrow: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={popS.sectionLabel}>HOW TO EARN</Text>
            {EARN.map((m, i) => (
              <View key={i} style={popS.row}>
                <View style={[popS.rowIcon, { backgroundColor: m.color + '18' }]}>
                  <Ionicons name={m.icon} size={15} color={m.color} />
                </View>
                <Text style={popS.rowText}>{m.action}</Text>
                <Text style={[popS.rowPoints, { color: m.color }]}>{m.points}</Text>
              </View>
            ))}
            <Text style={[popS.sectionLabel, { marginTop: 10 }]}>HOW TO USE</Text>
            {USE.map((m, i) => (
              <View key={i} style={popS.row}>
                <View style={[popS.rowIcon, { backgroundColor: m.color + '18' }]}>
                  <Ionicons name={m.icon} size={15} color={m.color} />
                </View>
                <Text style={popS.rowText}>{m.action}</Text>
                <Text style={[popS.rowPoints, { color: m.color }]}>{m.points}</Text>
              </View>
            ))}
            <View style={popS.btnRow}>
              <TouchableOpacity onPress={() => { onClose(); navigation.navigate('PointsHistory'); }} style={popS.secondBtn}>
                <Text style={popS.secondBtnText}>📋 History</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { onClose(); navigation.navigate('Shop'); }} style={popS.secondBtn}>
                <Text style={popS.secondBtnText}>Shop</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={popS.mainBtn}>
                <Text style={popS.mainBtnText}>Got it 👍</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const popS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: 20, width: '100%', borderWidth: 0.5, borderColor: COLORS.gray3, height: SH * 0.78 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 10, alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rowText: { flex: 1, fontSize: 13, color: COLORS.white },
  rowPoints: { fontSize: 11, fontWeight: '700' },
  btnRow: { flexDirection: 'row', marginTop: 14 },
  secondBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, alignItems: 'center', marginRight: 8 },
  secondBtnText: { fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  mainBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.blue, alignItems: 'center' },
  mainBtnText: { fontSize: 13, color: COLORS.dark, fontWeight: '800' },
});

function StreakInfoPopup({ visible, onClose, level, points }) {
  const current = STREAK_LEVELS.find(l => l.id === level) || STREAK_LEVELS[0];
  const nextIdx = STREAK_LEVELS.findIndex(l => l.id === level) + 1;
  const next = STREAK_LEVELS[nextIdx];
  const ptsToNext = next ? (next.minPoints - points) : 0;

  const HOW_ITEMS = [
    { icon: '📹', action: 'Post a clip', pts: '+25 pts' },
    { icon: '⭐', action: 'Receive a GG', pts: '+2 pts' },
    { icon: '👤', action: 'Get a new follower', pts: '+1 pt' },
    { icon: '📅', action: 'Daily login bonus', pts: '+1 to +15 pts' },
    { icon: '🏆', action: 'Monthly Top 10', pts: '+200 pts' },
    { icon: '👑', action: 'Monthly Champion', pts: '+500 pts' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 }}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={{ backgroundColor: '#141420', borderRadius: 20, padding: 20, borderWidth: 0.5, borderColor: COLORS.gold + '40', maxHeight: SH * 0.85 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 30, textAlign: 'center', marginBottom: 4 }}>⚡</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 4 }}>Streak Level</Text>
            <Text style={{ fontSize: 12, color: COLORS.gray, textAlign: 'center', marginBottom: 16 }}>Level up by being active. Your streak never goes down.</Text>

            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.gray, letterSpacing: 2, marginBottom: 8 }}>HOW IT GROWS</Text>
            {HOW_ITEMS.map((m, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#222233' }}>
                <Text style={{ fontSize: 16, width: 30 }}>{m.icon}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: COLORS.gray }}>{m.action}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: GREEN }}>{m.pts}</Text>
              </View>
            ))}

            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.gray, letterSpacing: 2, marginTop: 16, marginBottom: 8 }}>LEVELS & DAILY BONUS</Text>
            {STREAK_LEVELS.map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#222233' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: l.color, marginRight: 10 }} />
                <Text style={{ flex: 1, fontSize: 13, color: l.id === level ? COLORS.white : COLORS.gray, fontWeight: l.id === level ? '800' : '400' }}>
                  {l.label} {l.id === level ? '← YOU' : ''}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.gray, width: 70 }}>{l.minPoints.toLocaleString()} pts</Text>
                <Text style={{ fontSize: 12, color: COLORS.gold, fontWeight: '700', width: 55, textAlign: 'right' }}>+{l.dailyBonus}/day</Text>
              </View>
            ))}

            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.gray, letterSpacing: 2, marginTop: 16, marginBottom: 8 }}>KEY RULES</Text>
            <Text style={{ fontSize: 12, color: COLORS.gray, lineHeight: 20 }}>
              {'✅ Buying frames only deducts GA Points, NOT Streak.\n✅ Higher level = higher daily login bonus.\n❌ Deleted clips remove points from BOTH balances.\n\n⚠️ INACTIVITY PENALTY:\n• 3 days grace period — no loss.\n• Day 4+ without login: -500 pts/day.\n• A GOAT inactive for 30 days drops to NOOB.\n• Stay active to keep your status!'}
            </Text>

            {next && (
              <View style={{ backgroundColor: '#1A1A2E', borderRadius: 12, padding: 12, marginTop: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: COLORS.gray }}>Next level: <Text style={{ color: next.color, fontWeight: '800' }}>{next.label}</Text></Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.gold, marginTop: 4 }}>{ptsToNext.toLocaleString()} pts to go</Text>
              </View>
            )}

            <TouchableOpacity onPress={onClose} style={{ backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: COLORS.black }}>Got it 👍</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StreakBar({ level, points }) {
  const currentIdx = STREAK_LEVELS.findIndex(l => l.id === level);
  const current = STREAK_LEVELS[currentIdx] || STREAK_LEVELS[0];
  const next = STREAK_LEVELS[currentIdx + 1];
  // Progression relative aux marqueurs (chaque segment = 25% de la barre)
  const segmentProgress = next ? Math.min((points - current.minPoints) / (next.minPoints - current.minPoints), 1) : 1;
  const totalProgress = ((currentIdx + segmentProgress) / (STREAK_LEVELS.length - 1)) * 100;
  return (
    <View style={[sbS.container, { borderColor: current.color + '55' }]}>
      <View style={sbS.row}>
        <Text style={sbS.label}>Streak Level</Text>
        <Text style={[sbS.levelText, { color: current.color }]}>{current.label}</Text>
      </View>
      <View style={sbS.track}>
        <View style={[sbS.fill, { width: `${totalProgress}%`, backgroundColor: current.color }]}>
          {/* Glow effect on fill */}
          <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 20, backgroundColor: current.color, opacity: 0.6, borderRadius: 3 }} />
        </View>
      </View>
      <View style={sbS.markers}>
        {STREAK_LEVELS.map((l) => (
          <Text key={l.id} style={[sbS.marker, { color: l.id === level ? l.color : COLORS.gray2, fontWeight: l.id === level ? '800' : '500' }]}>{l.label.split(' ')[0]}</Text>
        ))}
      </View>
      {next ? (
        <Text style={sbS.note}>{(next.minPoints - points).toLocaleString()} pts to <Text style={{ color: next.color }}>{next.label}</Text></Text>
      ) : (
        <Text style={[sbS.note, { color: current.color }]}>Maximum level reached 🐐</Text>
      )}
    </View>
  );
}
const sbS = StyleSheet.create({
  container: { marginHorizontal: 14, marginBottom: 8, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: COLORS.gray3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  label: { fontSize: 9, color: COLORS.gray, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  levelText: { fontSize: 10, fontWeight: '900' },
  track: { height: 5, borderRadius: 3, backgroundColor: COLORS.gray3, overflow: 'hidden', marginBottom: 0 },
  fill: { height: '100%', borderRadius: 3 },
  markers: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  marker: { fontSize: 7, fontWeight: '600' },
  note: { fontSize: 8, color: COLORS.gray2, marginTop: 3 },
});


// ─── Animated Username Component ─────────────────────────────────────────────
function AnimatedUsername({ username, color, glow, isAnimated, baseStyle }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!isAnimated) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [isAnimated, color]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const shadow = pulse.interpolate({ inputRange: [0, 1], outputRange: [4, 14] });

  if (isAnimated) {
    return (
      <Animated.Text style={[baseStyle, {
        color,
        opacity,
        textShadowColor: color,
        textShadowRadius: shadow,
        textShadowOffset: { width: 0, height: 0 },
      }]}>{username}</Animated.Text>
    );
  }
  return (
    <Text style={[baseStyle, {
      color,
      textShadowColor: glow ? color : 'transparent',
      textShadowRadius: glow ? 8 : 0,
    }]}>{username}</Text>
  );
}

export default function ProfileScreen({ navigation, route }) {
    const { user: authUser, userProfile, saveProfile } = useAuthStore();
    const { toggleFollow, checkIsFollowing, isFollowing, fetchFollowing } = useUserStore();
    const { isSubscribedTo, checkIsSubscribed } = useFanbaseStore();
    const userId = route?.params?.userId;
    const showBack = route?.params?.showBack || false;
  
    const isOwn = !userId || userId === authUser?.uid;  
    const [externalProfile, setExternalProfile] = useState(null);    const [activeTab, setActiveTab] = useState('clips');
    const [bellActive, setBellActive] = useState(false);
    const [showGGPopup, setShowGGPopup] = useState(false);
    const [showPointsPopup, setShowPointsPopup] = useState(false);
    const [userVideos, setUserVideos] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [showStreakInfo, setShowStreakInfo] = useState(false);
  
    // Stable user object — spread userProfile but guard against momentary null
    // (can happen when an overlay opens and triggers a re-render mid-Firestore-update).
    // We keep the last known gaPoints/streakPoints in a ref so they never flash to 0.
    const stablePointsRef = React.useRef({ gaPoints: 0, streakPoints: 0, streakLevel: 'noob', ggReceived: 0 });
    if (userProfile?.gaPoints !== undefined) {
      stablePointsRef.current = {
        gaPoints:     userProfile.gaPoints,
        streakPoints: userProfile.streakPoints ?? 0,
        streakLevel:  userProfile.streakLevel  ?? 'noob',
        ggReceived:   userProfile.ggReceived   ?? 0,
      };
    }

    const user = isOwn
      ? {
          ...userProfile,
          uid:          authUser?.uid,
          email:        authUser?.email,
          // Use stable values — never flash to 0 on re-render
          gaPoints:     userProfile?.gaPoints     ?? stablePointsRef.current.gaPoints,
          streakPoints: userProfile?.streakPoints ?? stablePointsRef.current.streakPoints,
          streakLevel:  userProfile?.streakLevel  ?? stablePointsRef.current.streakLevel,
          ggReceived:   userProfile?.ggReceived   ?? stablePointsRef.current.ggReceived,
        }
      : (externalProfile || null);
  
    // Couleurs de texte adaptées au background cosmétique actif
    const tc = getBgTextColors(user?.equippedProfileBg);

    const onRefresh = async () => {
        setRefreshing(true);
        // Force reload videos
        const targetId = isOwn ? authUser?.uid : userId;
        if (targetId) {
          const { getDocs, collection, query, where, orderBy } = await import('firebase/firestore');
          try {
            const snap = await getDocs(query(collection(db, 'videos'), where('userId', '==', targetId), orderBy('createdAt', 'desc')));
            setUserVideos(snap.docs.map(d => ({ id: d.id, ...d.data(), thumbnailUrl: d.data().thumbnail || d.data().thumbnailUrl || null })));
          } catch (e) {
            await logError(LOG_CONTEXT.PROFILE_FAIL, e, targetId);
          }
        }
        setRefreshing(false);
      };

    const isCreator = user?.accountType === 'creator' || user?.accountType === 'gameconic' || user?.accountType === 'admin';
    const subTargetId = userId || user?.uid;
    const isSubscribed = !isOwn && isSubscribedTo(subTargetId);
  
    useEffect(() => {
        if (isOwn || !userId) return;
        // onSnapshot → profil externe temps réel (followers, GG, frames...)
        const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
          if (snap.exists()) setExternalProfile({ uid: snap.id, ...snap.data() });
        }, (e) => console.log('profile onSnapshot error:', e.message));
        return () => unsub();
      }, [userId, isOwn]);
      
      useEffect(() => {
        if (!isOwn && authUser?.uid) {
          checkIsFollowing(authUser.uid, userId);
        }
      }, [userId, isOwn, authUser?.uid]);

      useEffect(() => {
        if (!isOwn && authUser?.uid && subTargetId) {
          checkIsSubscribed(authUser.uid, subTargetId);
        }
      }, [subTargetId, isOwn, authUser?.uid]);

      useEffect(() => {
        if (isOwn || !authUser?.uid || !userId) return;
        const bellId = `${authUser.uid}_${userId}`;
        getDoc(doc(db, 'bells', bellId)).then(snap => {
          setBellActive(snap.exists());
        });
      }, [userId, isOwn, authUser?.uid]);
      
      useEffect(() => {
        const targetId = isOwn ? authUser?.uid : userId;
        if (!targetId) return;
        const q = query(
          collection(db, 'videos'),
          where('userId', '==', targetId),
          orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
          setUserVideos(snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            thumbnailUrl: d.data().thumbnail || d.data().thumbnailUrl || null,
          })));
        });
        return () => unsub();
      }, [authUser?.uid, userId, isOwn]);

  // Tabs visible depend on account type:
  // - gamer      → Clips, Infos (no Fanbase, no Tips)
  // - creator    → Clips, Tips, Fanbase, Infos
  // - gameconic  → Clips, Tips, Fanbase, Infos
  // When viewing someone else's profile, same rules apply based on THEIR accountType
  const TABS = isCreator
    ? ['Clips', 'Tips', 'Fanbase', 'Infos']
    : ['Clips', 'Infos'];

  const handleDeleteVideo = async (video) => {
    const ggPoints = (video.ggCount || 0) * 2;
    const totalLost = POINTS.POST_CLIP + ggPoints;
    const pointsMsg = ggPoints > 0
      ? `You will lose ${totalLost} GA Points:\n• -${POINTS.POST_CLIP} pts (clip bonus)\n• -${ggPoints} pts (${video.ggCount} GGs received)`
      : `You will lose ${POINTS.POST_CLIP} GA Points (clip bonus).`;

    showAlert({
      title: '🗑️ Delete Clip',
      message: `"${video.title || video.caption || 'Untitled'}" will be permanently deleted.\n\n⚠️ ${pointsMsg}`,
      type: 'danger',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'videos', video.id));
              // Le trigger serveur onVideoDeleted gère :
              // - videoCount -1
              // - gaPoints/streakPoints (clip bonus + GG points)
              // - points_history
              // Le client ne fait rien de plus → plus de conflit de transaction.
              setUserVideos(prev => prev.filter(v => v.id !== video.id));
            } catch (e) {
              await logError(LOG_CONTEXT.VIDEO_DELETE, e, useAuthStore.getState().user?.uid);
              showAlert({ title: 'Error', message: 'Could not delete video. Please try again.', type: 'danger' });
            }
          },
        },
      ],
    });
  };

  const handleShare = async () => {
    await Share.share({ 
      message: `Check out ${user?.username} on Gaming Actions! 🎮\nhttps://gamingactions.app/user/${user?.username}`,
      url: `https://gamingactions.app/user/${user?.username}`,
    });
  };
  // Compute bg color for container
  const _bgId = user?.equippedProfileBg;
  const _bg = _bgId ? PROFILE_BACKGROUNDS.find(b => b.id === _bgId) : null;
  const containerBgColor = (_bg && _bg.id !== 'bg_none' && _bg.colors?.[0]) ? _bg.colors[0] : '#080810';
  const accentBgColor = _bg ? (_bg.colors?.[ _bg.colors.length - 1] || _bg.colors?.[0]) : null;

  return (
    <View style={[styles.container, { backgroundColor: containerBgColor }]}>
      {/* Accent circles — fixed position below banner */}
      {accentBgColor && (
        <View style={{ position: 'absolute', top: BANNER_H + (Platform.OS === 'ios' ? 54 : 30), left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
          <View style={{ position: 'absolute', bottom: 100, right: -40, width: 260, height: 260, borderRadius: 130, backgroundColor: accentBgColor, opacity: 0.08 }} />
          <View style={{ position: 'absolute', top: 40, left: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: accentBgColor, opacity: 0.05 }} />
        </View>
      )}
      <StatusBar style="light" />
      <GGInfoPopup visible={showGGPopup} onClose={() => setShowGGPopup(false)} navigation={navigation} />
      <GAPointsPopup visible={showPointsPopup} onClose={() => setShowPointsPopup(false)} navigation={navigation} />

      {/* Header */}
      <View style={styles.header}>
      {navigation.canGoBack() ? (
  <TouchableOpacity onPress={() => navigation.goBack()}>
    <Ionicons name="arrow-back" size={22} color={COLORS.white} />
  </TouchableOpacity>
) : <View style={{ width: 22 }} />}
        <Text style={styles.headerTitle}>{user?.username || 'Profile'}</Text>
        <View style={styles.headerRight}>
          {/* Bouton Share masqué — sera réactivé avec le deep linking / QR code */}
          {false && (
            <TouchableOpacity onPress={handleShare} style={{ marginRight: 14 }}>
              <Ionicons name="share-outline" size={22} color={COLORS.white} />
            </TouchableOpacity>
          )}
          {isOwn && (
            <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
              <Ionicons name="settings-outline" size={22} color={COLORS.white} />
            </TouchableOpacity>
          )}
          {isOwn && isCreator && (
            <TouchableOpacity onPress={() => navigation.navigate('Earnings')} style={{ marginLeft: 8 }}>
              <Ionicons name="cash-outline" size={22} color={COLORS.gold} />
            </TouchableOpacity>
          )}
          {!isOwn && userId && (
            <TouchableOpacity
              onPress={() => Alert.alert(
                `@${user?.username}`,
                '',
                [
                  { text: 'Report User', onPress: () => navigation.navigate('Report', { target: user, targetType: 'profile' }) },
                  { text: (userProfile?.blockedUsers || []).includes(userId) ? 'Unblock User' : 'Block User', style: 'destructive', onPress: async () => {
                    const isBlocked = (userProfile?.blockedUsers || []).includes(userId);
                    if (isBlocked) {
                      const newBlocked = (userProfile?.blockedUsers || []).filter(id => id !== userId);
                      await saveProfile({ blockedUsers: newBlocked });
                      Alert.alert('✅ Unblocked', `@${user?.username} has been unblocked.`);
                    } else {
                      Alert.alert(
                        `Block @${user?.username}?`,
                        'They won\'t be able to see your profile or interact with your content. Their content will be removed from your feed.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Block', style: 'destructive', onPress: async () => {
                            const newBlocked = [...new Set([...(userProfile?.blockedUsers || []), userId])];
                            await saveProfile({ blockedUsers: newBlocked });
                            Alert.alert('✅ Blocked', `@${user?.username} has been blocked.`);
                            navigation.goBack();
                          }},
                        ]
                      );
                    }
                  }},
                  { text: 'Cancel', style: 'cancel' },
                ]
              )}
              style={{ marginLeft: 8 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── FIXED TOP SECTION ─── bannière + info + streak + tabs */}
      <View style={{ zIndex: 1, overflow: 'visible' }}>

        {/* Banner */}
        <View style={[styles.banner, (() => {
          const bannerId = user?.equippedProfileBanner;
          const banner = bannerId ? PROFILE_BANNERS.find(b => b.id === bannerId) : null;
          if (banner && !user?.banner) return { backgroundColor: banner.colors?.[0] || '#0D0820' };
          return {};
        })()]}>
          {user?.banner ? (
            <Image source={{ uri: user.banner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (() => {
            const bannerId = user?.equippedProfileBanner;
            const banner = bannerId ? PROFILE_BANNERS.find(b => b.id === bannerId) : null;
            if (banner && banner.id !== 'banner_none') {
              const accentColor = banner.colors?.[banner.colors.length - 1] || '#C9A84C';
              return (
                <>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: accentColor, opacity: 0.9 }} />
                  <View style={{ position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: accentColor, opacity: 0.2 }} />
                  <View style={{ position: 'absolute', left: -20, bottom: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: accentColor, opacity: 0.12 }} />
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, backgroundColor: accentColor, opacity: 0.5 }} />
                  <Text style={[styles.bannerBg, { color: accentColor }]}>GA</Text>
                </>
              );
            }
            return <Text style={styles.bannerBg}>GA</Text>;
          })()}
          {user?.isChampion && <ElectricBanner width={SW} height={BANNER_H} />}
          {(user?.isChampion || user?.isCurrentLeader) && (
            <View style={{ position: 'absolute', top: 10, right: 12 }}>
              {user?.isChampion ? <ChampionBadge /> : <LeaderBadge />}
            </View>
          )}
        </View>

        {/* Profile info */}
        <View style={styles.infoSection}>
          {/* Avatar flottant — positionné en absolute au-dessus de la bannière */}
          <View style={{
            position: 'absolute',
            top: -48,
            left: 10,
            zIndex: 20,
            width: 90,
            height: 90,
            overflow: 'visible',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <FramedAvatar user={user} size={64} />
          </View>
          {/* Actions row — aligné à droite, hauteur fixe pour réserver l'espace avatar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
            height: 44, marginBottom: 6 }}>
            {isOwn ? (
              <View style={styles.ownActions}>
                <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} style={[styles.editBtn, { borderColor: tc.editBorder, backgroundColor: tc.editBtn }]}>
                  <Text style={[styles.editBtnText, { color: tc.primary }]}>Edit Profile</Text>
                </TouchableOpacity>
                {isCreator && (
                  <TouchableOpacity onPress={() => navigation.navigate('Dashboard')} style={styles.dashBtn}>
                    <Ionicons name="bar-chart-outline" size={16} color={COLORS.gold} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.ownActions}>
                <TouchableOpacity
  onPress={() => toggleFollow(authUser?.uid, userId || user?.uid, userProfile?.username)}
  style={[styles.followBtn, isFollowing(userId) && { backgroundColor: 'transparent', borderColor: COLORS.gray3 }]}
>
  <Text style={[styles.followBtnText, isFollowing(userId) && { color: COLORS.gray }]}>
    {isFollowing(userId) ? 'Following' : '+ Follow'}
  </Text>
</TouchableOpacity>
<TouchableOpacity
  onPress={async () => {
    const bellId = `${authUser?.uid}_${userId}`;
    const bellRef = doc(db, 'bells', bellId);
    if (bellActive) {
      await deleteDoc(bellRef);
      setBellActive(false);
    } else {
      await setDoc(bellRef, {
        bellerId: authUser?.uid,
        targetUserId: userId,
        createdAt: serverTimestamp(),
      });
      setBellActive(true);
    }
  }}
  style={[styles.bellBtn, bellActive && { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.12)' }]}
>
  <Ionicons name={bellActive ? 'notifications' : 'notifications-outline'} size={16} color={bellActive ? COLORS.gold : COLORS.gray} />
</TouchableOpacity>
                {isCreator && (
                  <TouchableOpacity
                    onPress={() => {
                      if (isSubscribed) {
                        navigation.navigate('FanbaseContent', { creator: user });
                      } else {
                        navigation.navigate('Fanbase', { creator: user });
                      }
                    }}
                    style={[styles.fanbaseBtn, isSubscribed && { borderColor: GREEN, backgroundColor: 'rgba(0,200,83,0.08)' }]}
                  >
                    <Ionicons name={isSubscribed ? 'lock-open' : 'lock-closed'} size={14} color={isSubscribed ? GREEN : COLORS.blue} />
                    <Text style={[styles.fanbaseBtnText, isSubscribed && { color: GREEN }]}>
                      {isSubscribed ? 'Fanbase ✓' : 'Fanbase'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.nameRow}>
            {(() => {
              const ueId = user?.equippedUsernameEffect;
              const ueItem = ueId ? USERNAME_EFFECTS.find(effect => effect.id === ueId) : null;
              const nameColor = ueItem ? (ueItem.color || (ueItem.colors?.[0]) || tc.primary) : tc.primary;
              const hasGlow = ueItem?.glow || false;
              const isAnimated = ueItem?.animated || false;
              return (
                <AnimatedUsername
                  username={user?.username}
                  color={nameColor}
                  glow={hasGlow}
                  isAnimated={isAnimated}
                  baseStyle={styles.name}
                />
              );
            })()}
            {user?.plan === 'legendary' && <View style={styles.legBadge}><Text style={styles.legBadgeText}>LEGENDARY</Text></View>}
            {user?.accountType === 'gameconic' && <View style={[styles.legBadge, { backgroundColor: COLORS.red }]}><Text style={styles.legBadgeText}>GAMECONIC</Text></View>}
            {user?.accountType === 'creator' && <View style={[styles.legBadge, { backgroundColor: COLORS.blue }]}><Text style={[styles.legBadgeText, { color: COLORS.dark }]}>CREATOR</Text></View>}
            {user?.isChampion ? <ChampionBadge /> : user?.isCurrentLeader ? <LeaderBadge /> : null}
          </View>
          {/* Profile Badge / Title cosmétique */}
          {(() => {
            const badgeId = user?.equippedProfileBadge;
            const badge = badgeId ? PROFILE_BADGES.find(b => b.id === badgeId) : null;
            if (!badge || badge.id === 'badge_none') return null;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, marginTop: -2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (badge.color || COLORS.gold) + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 0.5, borderColor: (badge.color || COLORS.gold) + '40' }}>
                  {badge.emoji ? <Text style={{ fontSize: 11, marginRight: 4 }}>{badge.emoji}</Text> : null}
                  <Text style={{ fontSize: 10, fontWeight: '800', color: badge.color || COLORS.gold }}>{badge.name}</Text>
                </View>
              </View>
            );
          })()}
          <View style={styles.metaRow}>
            <Text style={[styles.metaItem, { color: tc.secondary }]}>🎮 {user?.mainGame || 'Gaming'}</Text>
            {user?.country ? <Text style={[styles.metaItem, { color: tc.secondary }]}>🌍 {user.country}</Text> : null}
          </View>
          {user?.bio ? <Text style={[styles.bio, { color: tc.muted }]}>{user.bio}</Text> : null}

          {/* Stats */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Followers', { userId: user?.uid })} style={[styles.stat, { backgroundColor: tc.statBg, borderColor: tc.statBorder }]}>
              <Text style={[styles.statNum, { color: tc.primary }]}>{user?.followers || 0}</Text>
              <Text style={[styles.statLabel, { color: tc.secondary }]}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Following', { userId: user?.uid })} style={[styles.stat, { backgroundColor: tc.statBg, borderColor: tc.statBorder }]}>
              <Text style={[styles.statNum, { color: tc.primary }]}>{user?.following || 0}</Text>
              <Text style={[styles.statLabel, { color: tc.secondary }]}>Following</Text>
            </TouchableOpacity>
            <View style={[styles.stat, { backgroundColor: tc.statBg, borderColor: tc.statBorder }]}>
              <Text style={[styles.statNum, { color: tc.primary }]}>{userVideos.length}</Text>
              <Text style={[styles.statLabel, { color: tc.secondary }]}>Clips</Text>
            </View>
            <TouchableOpacity onPress={() => setShowGGPopup(true)} style={[styles.stat, { borderColor: COLORS.gold + '40' }]}>
              <Text style={[styles.statNum, { color: COLORS.gold }]}>
                {user?.ggReceived >= 1000 ? `${(user.ggReceived / 1000).toFixed(1)}K` : user?.ggReceived || 0}
              </Text>
              <Text style={[styles.statLabel, { color: COLORS.gold }]}>GG ⓘ</Text>
            </TouchableOpacity>
            {isOwn && (
              <TouchableOpacity onPress={() => setShowPointsPopup(true)} style={[styles.stat, { borderColor: COLORS.blue + '40' }]}>
                <Text style={[styles.statNum, { color: COLORS.blue }]}>{(user?.gaPoints || 0).toLocaleString()}</Text>
                <Text style={[styles.statLabel, { color: COLORS.blue }]}>GA Pts ⓘ</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Streak */}
        <TouchableOpacity onPress={() => setShowStreakInfo(true)} activeOpacity={0.8}>
          <StreakBar level={user?.streakLevel || 'noob'} points={user?.streakPoints || 0} />
        </TouchableOpacity>
        <StreakInfoPopup
          visible={showStreakInfo}
          onClose={() => setShowStreakInfo(false)}
          level={user?.streakLevel || 'noob'}
          points={user?.streakPoints || 0}
        />

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { borderBottomColor: tc.tabBorder }]} contentContainerStyle={styles.tabsContent}>
          {TABS.map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab.toLowerCase())} style={styles.tabItem}>
              <Text style={[styles.tabText, { color: tc.secondary }, activeTab === tab.toLowerCase() && styles.tabTextActive]}>{tab}</Text>
              {activeTab === tab.toLowerCase() && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </ScrollView>

      </View>

      {/* ─── SCROLLABLE CONTENT — grille + autres tabs ─── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
      >
        {/* CLIPS */}
        {activeTab === 'clips' && (
          <View style={styles.grid}>
            {userVideos.filter(v => (v.contentType === 'clip' || !v.contentType) && (isOwn || (!v.restricted && !v.banned))).length === 0 ? (
              <View style={styles.emptyTab}>
                <Ionicons name="game-controller-outline" size={40} color={COLORS.gray2} />
                <Text style={styles.emptyTabText}>No clips yet</Text>
              </View>
            ) : userVideos.filter(v => (v.contentType === 'clip' || !v.contentType) && (isOwn || (!v.restricted && !v.banned))).map((v, idx, arr) => (
              <TouchableOpacity
  key={v.id}
  style={[styles.thumb, (v.isLegendaryFrame || v.videoFrame) && { borderWidth: 1, borderColor: (getVideoFrameById(v.videoFrame)?.color || COLORS.gold) }]}
  onPress={() => navigation.navigate('ProfileFeed', {
    videos: arr,
    startIndex: idx,
    username: (isOwn ? userProfile?.username : externalProfile?.username) || '',
  })}
  onLongPress={() => {
    if (isOwn) {
      Alert.alert(
        v.caption || 'Video',
        'What do you want to do?',
        [
          { text: 'Edit', onPress: () => navigation.navigate('EditVideo', { video: v }) },
          { text: 'Delete', style: 'destructive', onPress: () => handleDeleteVideo(v) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  }}

              >
                {v.thumbnailUrl ? (
                  <Image source={{ uri: v.thumbnailUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbBg}>
                    <Ionicons name="game-controller" size={22} color={COLORS.gold} style={{ opacity: 0.25 }} />
                  </View>
                )}
                {/* Overlay hide/ban visible par le propriétaire */}
                {(v.restricted || v.banned) && (
                  <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                    <Text style={{ fontSize: 18 }}>{v.banned ? '⛔' : '🚫'}</Text>
                    <Text style={{ fontSize: 7, color: COLORS.white, fontWeight: '700', textAlign: 'center', marginTop: 2, paddingHorizontal: 4 }}>
                      {v.banned ? 'Removed\ninappropriate content' : 'Under\nreview'}
                    </Text>
                  </View>
                )}
                <View style={styles.thumbGG}>
                  <Text style={styles.thumbGGText}>⭐ {v.ggCount >= 1000 ? `${(v.ggCount / 1000).toFixed(1)}K` : v.ggCount || 0}</Text>
                </View>
                <View style={styles.thumbViews}>
                  <Ionicons name="eye" size={9} color={COLORS.white} />
                  <Text style={styles.thumbViewsText}>{(v.viewCount || 0) >= 1000 ? `${((v.viewCount || 0) / 1000).toFixed(1)}K` : (v.viewCount || 0)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* TIPS */}
        {activeTab === 'tips' && (() => {
          const tips = userVideos.filter(v => v.contentType && v.contentType !== 'clip').filter(v => isOwn || (!v.isFanbaseExclusive && !v.restricted && !v.banned));
          return tips.length === 0 ? (
            <View style={styles.emptyTab}>
              <Ionicons name="bulb-outline" size={40} color={COLORS.gray2} />
              <Text style={styles.emptyTabText}>No tips yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {tips.map((v) => {
                const catColor = v.contentType === 'flashtuto' ? COLORS.blue
                  : v.contentType === 'flashinfo' ? COLORS.red
                  : v.contentType === 'gameindev' ? '#7C4DFF' : COLORS.gray3;
                const catLabel = v.contentType === 'flashtuto' ? 'TUTO'
                  : v.contentType === 'flashinfo' ? 'INFO'
                  : v.contentType === 'gameindev' ? 'DEV' : '';
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.thumb, { borderWidth: 2, borderColor: catColor }]}
                    onPress={() => navigation.navigate('TipDetail', { tip: v })}
                    onLongPress={isOwn ? () => {
                      Alert.alert('Tip options', '', [
                        { text: 'Edit', onPress: () => navigation.navigate('EditVideo', { video: v }) },
                        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteVideo(v) },
                        { text: 'Cancel', style: 'cancel' },
                      ]);
                    } : undefined}
                  >
                    {v.thumbnail || v.thumbnailUrl ? (
                      <Image source={{ uri: v.thumbnail || v.thumbnailUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Ionicons name="bulb" size={24} color={COLORS.gold} style={{ opacity: 0.3 }} />
                    )}
                    {/* Tag catégorie coloré */}
                    {catLabel ? (
                      <View style={{ position: 'absolute', top: 4, left: 4, backgroundColor: catColor, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>
                        <Text style={{ fontSize: 7, fontWeight: '900', color: COLORS.white }}>{catLabel}</Text>
                      </View>
                    ) : null}
                    <View style={{ position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="star" size={10} color={COLORS.gold} />
                      <Text style={{ color: COLORS.white, fontSize: 9, fontWeight: '700', marginLeft: 2 }}>{v.ggCount || 0}</Text>
                    </View>
                    {v.isFanbaseExclusive && (
                      <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,200,83,0.8)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                        <Text style={{ fontSize: 7, fontWeight: '900', color: '#000' }}>EXCL</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })()}

        {/* FANBASE */}
        {activeTab === 'fanbase' && (
          isOwn ? (
            <View style={{ padding: 14 }}>
              {/* Carte Ma Fanbase — créateurs uniquement */}
              {isCreator && (
                <TouchableOpacity onPress={() => navigation.navigate('FanbaseManage')} activeOpacity={0.85} style={hubS.card}>
                  <View style={[hubS.cardIcon, { backgroundColor: 'rgba(0,200,83,0.12)', borderColor: GREEN }]}>
                    <Ionicons name="people" size={24} color={GREEN} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={hubS.cardTitle}>Ma Fanbase</Text>
                    <Text style={hubS.cardDesc}>Gère tes fans, tes vidéos exclusives et ton FanBox</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
                </TouchableOpacity>
              )}

              {/* Carte Mes abonnements — tout le monde */}
              <TouchableOpacity onPress={() => navigation.navigate('MyFanbase')} activeOpacity={0.85} style={hubS.card}>
                <View style={[hubS.cardIcon, { backgroundColor: 'rgba(0,212,255,0.12)', borderColor: COLORS.blue }]}>
                  <Ionicons name="lock-open" size={24} color={COLORS.blue} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={hubS.cardTitle}>Mes abonnements</Text>
                  <Text style={hubS.cardDesc}>Les fanbases d'autres créateurs que tu as rejointes</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
              </TouchableOpacity>

              {!isCreator && (
                <Text style={hubS.hint}>💡 Deviens créateur pour ouvrir ta propre fanbase et monétiser ton contenu.</Text>
              )}
            </View>
          ) : isSubscribed ? (
            <View style={styles.emptyTab}>
              <Ionicons name="lock-open-outline" size={40} color={GREEN} />
              <Text style={styles.emptyTabText}>You're subscribed to {user?.username}'s Fanbase!</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('FanbaseContent', { creator: user })}
                style={[styles.fanbaseJoinBtn, { backgroundColor: GREEN }]}
              >
                <Text style={[styles.fanbaseJoinText, { color: COLORS.black }]}>Enter Fanbase 🔓</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyTab}>
              <Ionicons name="lock-closed-outline" size={40} color={COLORS.blue} />
              <Text style={styles.emptyTabText}>Join {user?.username}'s Fanbase to unlock exclusive content</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Fanbase', { creator: user })}
                style={styles.fanbaseJoinBtn}
              >
                <Text style={styles.fanbaseJoinText}>Join for $4.99/mo</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* INFOS */}
{activeTab === 'infos' && (
  <View style={styles.infosSection}>
    {user?.country ? (
      <View style={styles.infoRow}>
        <Ionicons name="earth-outline" size={16} color={COLORS.gray} />
        <Text style={styles.infoText}>{user.country}</Text>
      </View>
    ) : null}
    <View style={styles.infoRow}>
      <Ionicons name="calendar-outline" size={16} color={COLORS.gray} />
      <Text style={styles.infoText}>
        Joined {user?.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently'}
      </Text>
    </View>
    {user?.mainGame ? (
      <View style={styles.infoRow}>
        <Ionicons name="game-controller-outline" size={16} color={COLORS.gray} />
        <Text style={styles.infoText}>{user.mainGame}</Text>
      </View>
    ) : null}
    {isOwn && (
      <View style={styles.infoRow}>
        <Ionicons name="mail-outline" size={16} color={COLORS.gray} />
        <Text style={styles.infoText}>{user?.email || 'Hidden'}</Text>
      </View>
    )}
    {user?.socialLinks && Object.entries(user.socialLinks).some(([_, v]) => v) && (
      <View style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginTop: 8 }}>SOCIAL LINKS</Text>
        {Object.entries(user.socialLinks).map(([platform, url]) => {
          if (!url) return null;
          const ICONS = {
            youtube: { icon: 'logo-youtube', color: '#FF0000' },
            twitch: { icon: 'logo-twitch', color: '#9146FF' },
            twitter: { icon: 'logo-twitter', color: '#1DA1F2' },
            instagram: { icon: 'logo-instagram', color: '#E1306C' },
            tiktok: { icon: 'musical-notes-outline', color: '#01D4FF' },
            discord: { icon: 'chatbubbles-outline', color: '#5865F2' },
          };
          const config = ICONS[platform];
          if (!config) return null;
          return (
            <TouchableOpacity key={platform} style={styles.infoRow} onPress={() => {
              const URLS = { youtube: 'https://youtube.com/', twitch: 'https://twitch.tv/', twitter: 'https://x.com/', instagram: 'https://instagram.com/', tiktok: 'https://tiktok.com/@', discord: '' };
              const base = URLS[platform] || '';
              const link = url.startsWith('http') ? url : base + url;
              if (link) Linking.openURL(link).catch(() => {});
            }}>
              <Ionicons name={config.icon} size={16} color={config.color} />
              <Text style={[styles.infoText, { color: config.color }]}>{url}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    )}
  </View>
)}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' }, // overridden dynamically
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 10, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.white, letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  banner: { width: '100%', height: BANNER_H + (Platform.OS === 'ios' ? 54 : 30), backgroundColor: '#0d0820', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 2 },
  bannerBg: { fontSize: 80, fontWeight: '900', color: COLORS.gold, opacity: 0.04, letterSpacing: 10 },
  infoSection: { paddingHorizontal: 14, paddingTop: 0, paddingBottom: 8, backgroundColor: 'transparent' },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10, marginTop: -28 },
  ownActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  editBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.06)' },
  editBtnText: { fontSize: 13, color: COLORS.white, fontWeight: '700' },
  dashBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(201,168,76,0.5)', backgroundColor: 'rgba(201,168,76,0.08)', alignItems: 'center', justifyContent: 'center' },
  followBtn: { paddingHorizontal: 22, paddingVertical: 9, backgroundColor: COLORS.gold, borderRadius: 22 },
  followBtnText: { fontSize: 13, fontWeight: '900', color: COLORS.black },
  bellBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  fanbaseBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: 1, borderColor: COLORS.blue, backgroundColor: 'rgba(0,212,255,0.06)', gap: 5 },
  fanbaseBtnText: { fontSize: 12, color: COLORS.blue, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 5, gap: 6 },
  name: { fontSize: 20, fontWeight: '900', color: COLORS.white, letterSpacing: 0.3 },
  legBadge: { backgroundColor: COLORS.gold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  legBadgeText: { fontSize: 9, fontWeight: '900', color: COLORS.black, letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6, gap: 8 },
  metaItem: { fontSize: 12, color: COLORS.gray },
  bio: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 19, marginBottom: 12 },
  stat: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', marginRight: 8, minWidth: 72 },
  statNum: { fontSize: 17, fontWeight: '900', color: COLORS.white },
  statLabel: { fontSize: 9, color: COLORS.gray, textTransform: 'uppercase', marginTop: 2, letterSpacing: 0.5 },
  tabs: { backgroundColor: 'transparent', borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tabsContent: { paddingHorizontal: 14 },
  tabItem: { alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  tabText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  tabTextActive: { color: COLORS.gold, fontWeight: '800' },
  tabIndicator: { height: 2, width: '70%', backgroundColor: COLORS.gold, borderRadius: 1, position: 'absolute', bottom: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: { width: THUMB_SIZE, height: THUMB_H, overflow: 'hidden', borderWidth: 0.5, borderColor: '#080810', position: 'relative', backgroundColor: '#111120' },
  thumbLegendary: { borderWidth: 1, borderColor: COLORS.gold },
  thumbBg: { flex: 1, backgroundColor: '#111120', alignItems: 'center', justifyContent: 'center' },
  thumbGG: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  thumbGGText: { fontSize: 8, color: COLORS.gold, fontWeight: '800' },
  thumbViews: { position: 'absolute', bottom: 4, right: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  thumbViewsText: { fontSize: 8, color: COLORS.white, fontWeight: '700', marginLeft: 2 },
  emptyTab: { alignItems: 'center', paddingTop: 60, paddingBottom: 20, width: '100%' },
  emptyTabText: { fontSize: 14, color: COLORS.gray, marginTop: 12, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  fanbaseJoinBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 13, backgroundColor: COLORS.blue, borderRadius: 22 },
  fanbaseJoinText: { fontSize: 14, color: COLORS.dark, fontWeight: '800' },
  fanbaseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)' },
  fanbaseHeaderTitle: { fontSize: 13, fontWeight: '800', color: COLORS.white },
  manageBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.08)' },
  manageBtnText: { fontSize: 11, color: COLORS.gold, fontWeight: '700' },
  fanboxBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginTop: 16, marginBottom: 8, backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: 13 },
  fanboxBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.white, marginLeft: 8 },
  infosSection: { padding: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)' },
  infoText: { fontSize: 14, color: COLORS.white, marginLeft: 12 },
});
const hubS = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 12 },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.white, marginBottom: 3 },
  cardDesc: { fontSize: 11, color: COLORS.gray, lineHeight: 15 },
  hint: { fontSize: 12, color: COLORS.gray, textAlign: 'center', marginTop: 8, lineHeight: 17, paddingHorizontal: 10 },
});
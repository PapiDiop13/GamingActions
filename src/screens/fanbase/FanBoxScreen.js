/**
 * FanBoxScreen — Group chat gaming style
 * Layout WhatsApp : avatar + nom gauche (autres), avatar droite (soi)
 * Background vert foncé fanbase, bulles gaming
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Platform, KeyboardAvoidingView, Image, Alert, ActivityIndicator,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, doc, serverTimestamp, getDoc,
  updateDoc, where, getDocs, deleteDoc, setDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import { COLORS } from '../../constants/colors';

// ── Couleurs ───────────────────────────────────────────────────────────────────
const BG          = '#071A0E';
const BG_HEADER   = '#0A2212';
const BG_INPUT    = '#0D2618';
const BG_BUBBLE_OWN = '#1A5C32'; // soi = vert gaming fixe
const ACCENT      = '#00C853';
const GOLD        = '#C9A84C';

// Palette : texte du nom + teinte de bulle par participant
const MEMBER_PALETTE = [
  { text: '#FF6B6B', bubble: '#2A0F0F' }, // rouge
  { text: '#FFD93D', bubble: '#2A2200' }, // jaune
  { text: '#6BCB77', bubble: '#0D2A10' }, // vert clair
  { text: '#4D96FF', bubble: '#0A1A2E' }, // bleu
  { text: '#FF6FF2', bubble: '#2A0A28' }, // rose
  { text: '#F77F00', bubble: '#2A1500' }, // orange
  { text: '#00C9A7', bubble: '#002A24' }, // cyan
  { text: '#C77DFF', bubble: '#1A0A2E' }, // violet
  { text: '#48CAE4', bubble: '#0A1E28' }, // bleu ciel
  { text: '#F4A261', bubble: '#2A180A' }, // pêche
];

function memberPalette(uid = '') {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = uid.charCodeAt(i) + ((h << 5) - h);
  return MEMBER_PALETTE[Math.abs(h) % MEMBER_PALETTE.length];
}
// Rétrocompatibilité (utilisé pour l'avatar border)
function memberColor(uid = '') { return memberPalette(uid).text; }

// ── Avatar compact ─────────────────────────────────────────────────────────────
function MiniAvatar({ uri, initials, borderColor, size = 36 }) {
  return (
    <View style={[av.wrap, { width: size, height: size, borderRadius: size / 2, borderColor }]}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        : <Text style={[av.init, { fontSize: size * 0.38, color: borderColor }]}>{initials}</Text>
      }
    </View>
  );
}
const av = StyleSheet.create({
  wrap: { borderWidth: 1.5, backgroundColor: '#0E2A18', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  init: { fontWeight: '900' },
});

// ── Bulle de message ───────────────────────────────────────────────────────────
function MessageBubble({ msg, isOwn, isCreatorMsg, onLongPress }) {
  const color     = isCreatorMsg ? GOLD : memberColor(msg.userId);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const lastTap   = useRef(0);
  const initials  = (msg.username || '?')[0].toUpperCase();

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.08, useNativeDriver: true, speed: 80 }),
        Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 40 }),
      ]).start();
    }
    lastTap.current = now;
  };

  if (msg.deleted) {
    return (
      <View style={[s.row, isOwn && s.rowOwn, { marginBottom: 6 }]}>
        <Text style={s.deletedText}>🗑 Message supprimé</Text>
      </View>
    );
  }

  const avatar = (
    <MiniAvatar
      uri={msg.avatar || null}
      initials={initials}
      borderColor={isOwn ? ACCENT : color}
    />
  );

  return (
    <TouchableOpacity onPress={handleTap} onLongPress={() => onLongPress(msg)} delayLongPress={400} activeOpacity={0.85}>
      {/* ⚠️ Pas de flexDirection:'row-reverse' — on positionne avatar manuellement */}
      <Animated.View style={[s.row, { transform: [{ scale: scaleAnim }], marginBottom: 8 }]}>
        {/* Avatar gauche — uniquement pour les messages des autres */}
        {!isOwn && <View style={s.avatarSlot}>{avatar}</View>}

        <View style={{ flex: 1, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          {/* Nom expéditeur */}
          <Text style={[s.senderName, { color, textAlign: isOwn ? 'right' : 'left' }]}>
            {isCreatorMsg ? '👑 ' : ''}{msg.username || 'Fan'}
          </Text>
          {/* Bulle — couleur unique par participant */}
          <View style={[
            s.bubble,
            isOwn
              ? s.bubbleOwn
              : isCreatorMsg
                ? s.bubbleCreator
                : { backgroundColor: memberPalette(msg.userId).bubble, borderColor: memberPalette(msg.userId).text + '30', borderWidth: 0.5, borderBottomLeftRadius: 4 },
          ]}>
            <Text style={[s.msgText, isOwn && s.msgTextOwn]}>{msg.text}</Text>
            {/* Timestamp */}
            <Text style={[s.timestamp, isOwn && { color: '#A8D8B0' }]}>
              {msg.createdAt?.toDate
                ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''}
            </Text>
          </View>
        </View>

        {/* Avatar droite — uniquement pour nos propres messages */}
        {isOwn && <View style={s.avatarSlot}>{avatar}</View>}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Écran principal ────────────────────────────────────────────────────────────
export default function FanBoxScreen({ navigation, route }) {
  const { creatorId, creatorName } = route?.params || {};
  const { user, userProfile }      = useAuthStore();
  const [messages, setMessages]    = useState([]);
  const [text, setText]            = useState('');
  const [loading, setLoading]      = useState(true);
  const [sending, setSending]      = useState(false);
  const [muted, setMuted]          = useState(false);
  const flatRef  = useRef(null);
  const isCreator = user?.uid === creatorId;

  // Vérif mute
  useEffect(() => {
    if (!user?.uid || !creatorId) return;
    getDoc(doc(db, 'fanbox_mutes', `${creatorId}_${user.uid}`)).then(snap => {
      if (snap.exists()) {
        const until = snap.data()?.until?.toDate?.();
        setMuted(until && until > new Date());
      }
    }).catch(() => {});
  }, [user?.uid, creatorId]);

  // Listener temps réel — 60 derniers messages
  useEffect(() => {
    if (!creatorId) return;
    const q = query(
      collection(db, 'fanbox_messages', creatorId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    }, () => setLoading(false));
    return () => unsub();
  }, [creatorId]);

  useEffect(() => {
    if (!loading) setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 120);
  }, [loading]);

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user?.uid || sending || muted) return;
    setSending(true);
    setText('');
    try {
      await addDoc(collection(db, 'fanbox_messages', creatorId, 'messages'), {
        text:      trimmed,
        userId:    user.uid,
        username:  userProfile?.username || 'Fan',
        avatar:    userProfile?.avatar   || '',
        createdAt: serverTimestamp(),
        deleted:   false,
      });
    } catch (e) { setText(trimmed); }
    setSending(false);
  };

  // ── Modération ───────────────────────────────────────────────────────────────
  const moderateMessage = (msg) => {
    const canDelete = isCreator || msg.userId === user?.uid;
    if (!canDelete) return;
    const opts = [];
    if (canDelete) opts.push({ text: '🗑️ Supprimer', onPress: () =>
      updateDoc(doc(db, 'fanbox_messages', creatorId, 'messages', msg.id), { deleted: true })
    });
    if (isCreator && msg.userId !== user?.uid) {
      opts.push({ text: '🔇 Mute 1h',  onPress: () => muteUser(msg.userId, msg.username, 60) });
      opts.push({ text: '🔇 Mute 24h', onPress: () => muteUser(msg.userId, msg.username, 1440) });
      opts.push({ text: '🚫 Retirer du FanBox', style: 'destructive', onPress: () => banUser(msg.userId, msg.username) });
    }
    opts.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Modération', `@${msg.username}`, opts);
  };

  const muteUser = async (userId, username, minutes) => {
    const until = new Date(Date.now() + minutes * 60000);
    await setDoc(doc(db, 'fanbox_mutes', `${creatorId}_${userId}`), { until, creatorId, userId }).catch(() => {});
    Alert.alert('🔇 Muté', `@${username} est muté ${minutes < 60 ? `${minutes} min` : `${minutes / 60}h`}.`);
  };

  const banUser = (userId, username) => Alert.alert(
    '🚫 Retirer du FanBox',
    `@${username} n'aura plus accès au FanBox.`,
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', style: 'destructive', onPress: async () => {
        const q = query(
          collection(db, 'fanbase_subscriptions'),
          where('subscriberId', '==', userId),
          where('creatorId', '==', creatorId)
        );
        const snap = await getDocs(q);
        snap.forEach(d => deleteDoc(d.ref));
        Alert.alert('✅ Retiré', `@${username} a été retiré du FanBox.`);
      }},
    ]
  );

  // ── Séparateur de date (memoïsé) ─────────────────────────────────────────────
  const flatData = React.useMemo(() => {
    const items = [];
    let lastDate = null;
    messages.forEach((msg, i) => {
      const d = msg.createdAt?.toDate?.();
      const dateStr = d ? d.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' }) : null;
      if (dateStr && dateStr !== lastDate) {
        items.push({ type: 'date', key: `date-${i}`, label: dateStr });
        lastDate = dateStr;
      }
      items.push({ type: 'msg', key: msg.id, msg });
    });
    return items;
  }, [messages]);

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerDot} />
          <View>
            <Text style={s.headerTitle}>FanBox</Text>
            <Text style={s.headerSub}>@{creatorName || 'creator'}</Text>
          </View>
        </View>
        {isCreator && (
          <View style={s.creatorBadge}>
            <Ionicons name="shield-checkmark" size={12} color={GOLD} />
            <Text style={s.creatorBadgeText}> Créateur</Text>
          </View>
        )}
      </View>

      {/* Messages */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={flatData}
          keyExtractor={item => item.key}
          renderItem={({ item }) => {
            if (item.type === 'date') {
              return (
                <View style={s.dateSep}>
                  <View style={s.dateLine} />
                  <Text style={s.dateLabel}>{item.label}</Text>
                  <View style={s.dateLine} />
                </View>
              );
            }
            const msg = item.msg;
            return (
              <MessageBubble
                msg={msg}
                isOwn={msg.userId === user?.uid}
                isCreatorMsg={msg.userId === creatorId}
                onLongPress={moderateMessage}
              />
            );
          }}
          contentContainerStyle={s.list}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🎮</Text>
              <Text style={s.emptyTitle}>FanBox ouvert !</Text>
              <Text style={s.emptyText}>Sois le premier à écrire dans ce groupe exclusif.</Text>
            </View>
          }
        />
      )}

      {/* Mute banner */}
      {muted && (
        <View style={s.muteBanner}>
          <Ionicons name="volume-mute" size={14} color={COLORS.white} />
          <Text style={s.muteText}>  Tu es muté temporairement dans ce FanBox.</Text>
        </View>
      )}

      {/* Input */}
      <View style={s.inputRow}>
        <MiniAvatar
          uri={userProfile?.avatar || null}
          initials={(userProfile?.username || '?')[0].toUpperCase()}
          borderColor={ACCENT}
          size={34}
        />
        <TextInput
          style={[s.input, muted && { opacity: 0.4 }]}
          placeholder={muted ? 'Tu es muté...' : 'Message...'}
          placeholderTextColor='#4A7A5A'
          value={text}
          onChangeText={setText}
          multiline
          maxLength={300}
          editable={!muted}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={sendMessage}
          disabled={!text.trim() || sending || muted}
          style={[s.sendBtn, (!text.trim() || sending || muted) && { opacity: 0.3 }]}
        >
          {sending
            ? <ActivityIndicator size="small" color={COLORS.black} />
            : <Ionicons name="send" size={16} color={COLORS.black} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: BG },

  // Header
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, backgroundColor: BG_HEADER, borderBottomWidth: 0.5, borderBottomColor: '#1A4D2E' },
  backBtn:         { marginRight: 6 },
  headerCenter:    { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 6, gap: 10 },
  headerDot:       { width: 9, height: 9, borderRadius: 5, backgroundColor: ACCENT, shadowColor: ACCENT, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  headerTitle:     { fontSize: 16, fontWeight: '900', color: COLORS.white },
  headerSub:       { fontSize: 11, color: '#5A9E6F', marginTop: 1 },
  creatorBadge:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.12)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 0.5, borderColor: GOLD + '60' },
  creatorBadgeText:{ fontSize: 11, fontWeight: '700', color: GOLD },

  // List
  list:            { paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10 },
  loadingWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Date separator
  dateSep:         { flexDirection: 'row', alignItems: 'center', marginVertical: 14, paddingHorizontal: 4 },
  dateLine:        { flex: 1, height: 0.5, backgroundColor: '#1A4D2E' },
  dateLabel:       { fontSize: 10, color: '#4A7A5A', fontWeight: '700', marginHorizontal: 10, letterSpacing: 0.5 },

  // Rows
  row:             { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 2 },
  avatarSlot:      { width: 38, alignItems: 'center', justifyContent: 'flex-end', marginHorizontal: 4 },

  // Bubbles
  bubble:          { maxWidth: '74%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOther:     { borderBottomLeftRadius: 4 }, // couleur appliquée inline via memberPalette()
  bubbleOwn:       { backgroundColor: BG_BUBBLE_OWN,   borderBottomRightRadius: 4 },
  bubbleCreator:   { backgroundColor: '#1C1200', borderWidth: 0.5, borderColor: GOLD + '50', borderBottomLeftRadius: 4 },

  senderName:      { fontSize: 11, fontWeight: '800', marginBottom: 3, marginHorizontal: 2 },
  msgText:         { fontSize: 14, color: 'rgba(255,255,255,0.92)', lineHeight: 19 },
  msgTextOwn:      { color: '#E8FFE8' },
  timestamp:       { fontSize: 9, color: '#4A7A5A', marginTop: 4, textAlign: 'right' },
  deletedText:     { fontSize: 12, color: '#3A5A42', fontStyle: 'italic', paddingVertical: 4, paddingHorizontal: 8 },

  // Empty
  empty:           { alignItems: 'center', paddingTop: 100, paddingHorizontal: 40 },
  emptyIcon:       { fontSize: 52, marginBottom: 12 },
  emptyTitle:      { fontSize: 18, fontWeight: '900', color: COLORS.white, marginBottom: 8 },
  emptyText:       { fontSize: 13, color: '#4A7A5A', textAlign: 'center', lineHeight: 19 },

  // Mute
  muteBanner:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,59,48,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(255,59,48,0.2)' },
  muteText:        { color: '#FF8080', fontSize: 12 },

  // Input
  inputRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, backgroundColor: BG_INPUT, borderTopWidth: 0.5, borderTopColor: '#1A4D2E' },
  input:           { flex: 1, backgroundColor: '#0E2A18', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: COLORS.white, maxHeight: 100, borderWidth: 0.5, borderColor: '#1E4D2A' },
  sendBtn:         { width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
});

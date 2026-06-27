/**
 * FanBoxScreen — Group chat temps réel entre un créateur et tous ses fans abonnés
 *
 * Collection Firestore : fanbox_messages/{creatorId}/messages/{msgId}
 * Champs : { text, userId, username, avatar, createdAt, deleted }
 *
 * Fonctionnalités :
 *  - Messages en temps réel (onSnapshot), 40 derniers msgs
 *  - Scroll automatique vers le bas à l'ouverture et sur nouveaux messages
 *  - Couleur unique stable par membre (hash userId)
 *  - Modération créateur : supprimer, mute 1h/24h, ban du fanbox
 *  - Long press sur message → menu modération
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// ─── Couleur stable par userId ────────────────────────────────────────────────
const MEMBER_COLORS = [
  '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6FF2',
  '#F77F00', '#00C9A7', '#C77DFF', '#48CAE4', '#F4A261',
];
function memberColor(userId = '') {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}

// ─── Bulle de message ─────────────────────────────────────────────────────────
function MessageBubble({ msg, isOwn, isCreator, creatorId, onLongPress }) {
  const color = memberColor(msg.userId);
  const isCreatorMsg = msg.userId === creatorId;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const lastTap = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.12, useNativeDriver: true, speed: 80 }),
        Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 40 }),
      ]).start();
    }
    lastTap.current = now;
  };

  if (msg.deleted) {
    return (
      <View style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}>
        <Text style={s.deletedText}>Message supprimé</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={handleTap} onLongPress={() => onLongPress(msg)} delayLongPress={400} activeOpacity={0.9}>
      <Animated.View style={[s.bubbleRow, isOwn && s.bubbleRowOwn, { transform: [{ scale: scaleAnim }] }]}>
        {!isOwn && (
          <View style={[s.avatar, { borderColor: isCreatorMsg ? COLORS.gold : color }]}>
            {msg.avatar
              ? <Image source={{ uri: msg.avatar }} style={s.avatarImg} />
              : <Text style={{ fontSize: 13, color: isCreatorMsg ? COLORS.gold : color }}>
                  {(msg.username || '?')[0].toUpperCase()}
                </Text>
            }
          </View>
        )}
        <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther, isCreatorMsg && !isOwn && s.bubbleCreator]}>
          {!isOwn && (
            <Text style={[s.senderName, { color: isCreatorMsg ? COLORS.gold : color }]}>
              {isCreatorMsg ? '👑 ' : ''}{msg.username || 'Fan'}
            </Text>
          )}
          <Text style={[s.msgText, isOwn && s.msgTextOwn]}>{msg.text}</Text>
        </View>
        {isOwn && (
          <View style={[s.avatar, { borderColor: COLORS.gold }]}>
            {msg.avatar
              ? <Image source={{ uri: msg.avatar }} style={s.avatarImg} />
              : <Text style={{ fontSize: 13, color: COLORS.gold }}>
                  {(msg.username || '?')[0].toUpperCase()}
                </Text>
            }
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function FanBoxScreen({ navigation, route }) {
  const { creatorId, creatorName } = route?.params || {};
  const { user, userProfile } = useAuthStore();
  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);
  const [muted, setMuted]       = useState(false);
  const flatRef = useRef(null);
  const isCreator = user?.uid === creatorId;

  // Vérifie si l'user est muté
  useEffect(() => {
    if (!user?.uid || !creatorId) return;
    getDoc(doc(db, 'fanbox_mutes', `${creatorId}_${user.uid}`)).then(snap => {
      if (snap.exists()) {
        const until = snap.data()?.until?.toDate?.();
        setMuted(until && until > new Date());
      }
    }).catch(() => {});
  }, [user?.uid, creatorId]);

  // Listener temps réel — 40 derniers messages
  useEffect(() => {
    if (!creatorId) return;
    const q = query(
      collection(db, 'fanbox_messages', creatorId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(40)
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
    } catch { setText(trimmed); }
    setSending(false);
  };

  // ─── Modération ──────────────────────────────────────────────────────────
  const moderateMessage = (msg) => {
    const canDelete = isCreator || msg.userId === user?.uid;
    if (!canDelete && !isCreator) return;

    const opts = [];
    if (canDelete) opts.push({ text: '🗑️ Supprimer', onPress: () => deleteMsg(msg.id) });
    if (isCreator && msg.userId !== user?.uid) {
      opts.push({ text: '🔇 Mute 1h',  onPress: () => muteUser(msg.userId, msg.username, 60) });
      opts.push({ text: '🔇 Mute 24h', onPress: () => muteUser(msg.userId, msg.username, 1440) });
      opts.push({ text: '🚫 Retirer du FanBox', style: 'destructive', onPress: () => banUser(msg.userId, msg.username) });
    }
    opts.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Modération', `@${msg.username}`, opts);
  };

  const deleteMsg = (msgId) =>
    updateDoc(doc(db, 'fanbox_messages', creatorId, 'messages', msgId), { deleted: true });

  const muteUser = async (userId, username, minutes) => {
    const until = new Date(Date.now() + minutes * 60000);
    await setDoc(doc(db, 'fanbox_mutes', `${creatorId}_${userId}`), { until, creatorId, userId }).catch(() => {});
    Alert.alert('✅ Muté', `@${username} est muté ${minutes < 60 ? `${minutes} min` : `${minutes / 60}h`}.`);
  };

  const banUser = (userId, username) => Alert.alert(
    '🚫 Retirer du FanBox',
    `@${username} n'aura plus accès.`,
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', style: 'destructive', onPress: async () => {
        const q = query(collection(db, 'fanbase_subscriptions'), where('subscriberId', '==', userId), where('creatorId', '==', creatorId));
        const snap = await getDocs(q);
        snap.forEach(d => deleteDoc(d.ref));
      }},
    ]
  );

  const renderItem = useCallback(({ item: msg }) => (
    <MessageBubble
      key={msg.id}
      msg={msg}
      isOwn={msg.userId === user?.uid}
      isCreator={isCreator}
      creatorId={creatorId}
      onLongPress={moderateMessage}
    />
  ), [user?.uid, isCreator, creatorId]);

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>FanBox 🔒</Text>
          {creatorName ? <Text style={s.headerSub}>@{creatorName}</Text> : null}
        </View>
        {isCreator && (
          <View style={s.creatorBadge}>
            <Text style={s.creatorBadgeText}>👑 Creator</Text>
          </View>
        )}
      </View>

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.gold} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={COLORS.gray3} />
              <Text style={s.emptyText}>Sois le premier à écrire ! 🎮</Text>
            </View>
          }
        />
      )}

      {/* Mute banner */}
      {muted && (
        <View style={s.muteBanner}>
          <Ionicons name="volume-mute" size={13} color={COLORS.white} />
          <Text style={s.muteText}>  Tu es muté temporairement dans ce FanBox.</Text>
        </View>
      )}

      {/* Input */}
      <View style={s.inputRow}>
        <View style={[s.avatar, { borderColor: COLORS.gold, marginRight: 8 }]}>
          {userProfile?.avatar
            ? <Image source={{ uri: userProfile.avatar }} style={s.avatarImg} />
            : <Text style={{ fontSize: 13, color: COLORS.gold }}>{(userProfile?.username || '?')[0].toUpperCase()}</Text>
          }
        </View>
        <TextInput
          style={[s.input, muted && { opacity: 0.4 }]}
          placeholder={muted ? 'Tu es muté...' : 'Écris un message...'}
          placeholderTextColor={COLORS.gray}
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
          style={[s.sendBtn, (!text.trim() || sending || muted) && { opacity: 0.35 }]}
        >
          {sending
            ? <ActivityIndicator size="small" color={COLORS.black} />
            : <Ionicons name="send" size={17} color={COLORS.black} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0A0A0F' },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle:      { fontSize: 16, fontWeight: '800', color: COLORS.white },
  headerSub:        { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  creatorBadge:     { backgroundColor: 'rgba(201,168,76,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 0.5, borderColor: COLORS.gold },
  creatorBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.gold },
  list:             { paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 8 },
  bubbleRow:        { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  bubbleRowOwn:     { flexDirection: 'row-reverse' },
  avatar:           { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, backgroundColor: '#141420', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:        { width: 32, height: 32, borderRadius: 16 },
  bubble:           { maxWidth: '72%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 8 },
  bubbleOther:      { backgroundColor: '#1A1A2E', borderBottomLeftRadius: 4 },
  bubbleOwn:        { backgroundColor: '#1E2A3A', borderBottomRightRadius: 4 },
  bubbleCreator:    { backgroundColor: '#1C1500', borderWidth: 0.5, borderColor: COLORS.gold + '40' },
  senderName:       { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  msgText:          { fontSize: 14, color: COLORS.white, lineHeight: 19 },
  msgTextOwn:       { color: '#DCE8FF' },
  deletedText:      { fontSize: 12, color: COLORS.gray, fontStyle: 'italic', paddingHorizontal: 8 },
  inputRow:         { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, borderTopWidth: 0.5, borderTopColor: COLORS.gray3, backgroundColor: '#0E0E1A' },
  input:            { flex: 1, backgroundColor: '#1A1A2E', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: COLORS.white, maxHeight: 100, marginRight: 8 },
  sendBtn:          { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  empty:            { alignItems: 'center', paddingTop: 80 },
  emptyText:        { color: COLORS.gray, fontSize: 14, marginTop: 12 },
  muteBanner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF3B3022', paddingHorizontal: 16, paddingVertical: 8 },
  muteText:         { color: COLORS.white, fontSize: 12, opacity: 0.8 },
});

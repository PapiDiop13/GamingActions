import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TouchableWithoutFeedback, KeyboardAvoidingView,
  TextInput, Platform, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, increment,
  getDocs, limit, startAfter,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import { getVideoUrl } from '../../config/mux';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../../components/FramedAvatar';
import { commentFrameStyle } from '../../constants/frames';
import { USERNAME_EFFECTS } from '../../constants/cosmetics';
import { LeaderBadge, ChampionBadge } from '../../components/ElectricEffect';
import { UserPlanBadges, ProfileBadgePill, PROFILE_BADGE_DATA as BADGE_DATA } from '../../components/UserBadges';
import { findBannedWords, censorText, logModeration } from '../../utils/moderation';

const THANKS_COST = 10;
const THANKS_COLOR = '#7C4DFF';
const GREEN = '#00C853';
const COMMENT_PAGE = 15;
const MAX_COMMENT = 100;

function tipFmtTime(ts) {
  if (!ts) return 'now';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

function fmtDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Account type decorators ─────────────────────────────────────────────────
function AccountBadge({ accountType, plan, size = 11 }) {
  if (accountType === 'gameconic') return <Ionicons name="flash" size={size} color={COLORS.red} style={{ marginLeft: 3 }} />;
  if (accountType === 'creator') return <Ionicons name="videocam" size={size} color={COLORS.blue} style={{ marginLeft: 3 }} />;
  if (accountType === 'developer') return <Ionicons name="code-slash" size={size} color="#7C4DFF" style={{ marginLeft: 3 }} />;
  if (plan === 'legendary') return <Ionicons name="star" size={size} color={COLORS.gold} style={{ marginLeft: 3 }} />;
  return null;
}

function accountNameColor(accountType, plan) {
  if (accountType === 'gameconic') return COLORS.red;
  if (accountType === 'creator') return COLORS.blue;
  if (accountType === 'developer') return '#7C4DFF';
  if (plan === 'legendary') return COLORS.gold;
  return COLORS.white;
}

// ─── Rich text renderer (@ blue, # gold) ────────────────────────────────────
function renderRichText(text, baseStyle) {
  if (!text) return null;
  return (
    <Text style={baseStyle}>
      {text.split(/(@\w+|#\w+)/g).map((part, i) => {
        if (part.startsWith('@')) return <Text key={i} style={{ color: COLORS.blue, fontWeight: '700' }}>{part}</Text>;
        if (part.startsWith('#')) return <Text key={i} style={{ color: COLORS.gold, fontWeight: '700' }}>{part}</Text>;
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

// ─── Comment bubble — identical to feed's SheetCommentItem ───────────────────
function TipCommentBubble({ comment, replies = [], onReply, onDelete, onEdit, currentUser, currentProfile }) {
  const [liveUser, setLiveUser] = useState(comment);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(comment.likes || 0);
  const [showReplies, setShowReplies] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text || '');
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cfPulse = useRef(new Animated.Value(0.5)).current;

  const isMine = comment.userId && currentUser?.uid === comment.userId;

  const handleLongPress = () => {
    if (!isMine) return;
    Alert.alert('Commentaire', 'Que veux-tu faire ?', [
      { text: 'Modifier ✏️', onPress: () => { setEditText(comment.text || ''); setEditing(true); } },
      { text: 'Supprimer 🗑️', style: 'destructive', onPress: () => onDelete?.(comment.id) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditing(false);
    await onEdit?.(comment.id, trimmed);
  };

  // Live user data via onSnapshot (frame/plan updates in real-time)
  useEffect(() => {
    if (!comment.userId) return;
    const unsub = onSnapshot(doc(db, 'users', comment.userId), snap => {
      if (snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
    }, () => {
      getDoc(doc(db, 'users', comment.userId)).then(snap => {
        if (snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
      }).catch(() => {});
    });
    return () => unsub();
  }, [comment.userId]);

  const cf = commentFrameStyle(liveUser);
  const hasBorder = cf && cf.id !== 'none';
  const borderColor = hasBorder ? cf.color : 'transparent';
  const isChampionFrame = cf?.id === 'cf_champion';

  useEffect(() => {
    if (!cf?.animated || !cf?.glow) { cfPulse.setValue(0.65); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(cfPulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      Animated.timing(cfPulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [cf?.id]);

  // Name color + animated effect — mirrors CommentsScreen
  const _baseNameColor = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'board' ? '#00E676'
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.accountType === 'developer' ? '#7C4DFF'
    : liveUser?.plan === 'legendary' ? COLORS.gold
    : COLORS.white;
  const _ueItem = USERNAME_EFFECTS?.find(e => e.id === liveUser?.equippedUsernameEffect);
  const nameColor = _ueItem ? (_ueItem.color || _ueItem.colors?.[0] || _baseNameColor) : _baseNameColor;
  const nameGlow = _ueItem?.glow || false;
  const nameAnim = _ueItem?.animated || false;
  const uePulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!nameAnim) { uePulse.setValue(1); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(uePulse, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      Animated.timing(uePulse, { toValue: 1,    duration: 750, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [nameAnim, nameColor]);

  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.3, useNativeDriver: true, speed: 60 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    try {
      await updateDoc(doc(db, 'tipComments', comment.id), { likes: increment(newLiked ? 1 : -1) });
    } catch (e) {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    }
  };

  return (
    <View>
      {/* ── Top-level comment ── */}
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={handleLongPress}
        style={[
          cS.card,
          hasBorder && { borderColor, borderWidth: 1.5 },
          isChampionFrame && { borderColor: '#E8C96B', borderWidth: 2 },
        ]}
      >
        {hasBorder && !isChampionFrame && cf.glow && (
          cf.animated ? (
            <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 12, borderWidth: 2, borderColor, shadowColor: borderColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 14, opacity: cfPulse }]} pointerEvents="none" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { borderRadius: 12, borderWidth: 1.5, borderColor, shadowColor: borderColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 5 }]} pointerEvents="none" />
          )
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Avatar user={liveUser} size={28} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              {nameAnim ? (
                <Animated.Text style={[cS.name, { color: nameColor, opacity: uePulse, textShadowColor: nameColor, textShadowRadius: 9, textShadowOffset: { width: 0, height: 0 } }]}>
                  {liveUser?.username || comment.username}
                </Animated.Text>
              ) : (
                <Text style={[cS.name, { color: nameColor, textShadowColor: nameGlow ? nameColor : 'transparent', textShadowRadius: nameGlow ? 6 : 0, textShadowOffset: { width: 0, height: 0 } }]}>
                  {liveUser?.username || comment.username}
                </Text>
              )}
              {(() => {
                const excl = ['creator', 'gameconic'];
                if (liveUser?.isChampion && !excl.includes(liveUser?.accountType)) return <ChampionBadge small />;
                if (liveUser?.isCurrentLeader && !excl.includes(liveUser?.accountType)) return <LeaderBadge small />;
                return null;
              })()}
              <Text style={cS.time}> · {tipFmtTime(comment.createdAt)}</Text>
            </View>
            {editing ? (
              <View style={{ marginTop: 4 }}>
                <TextInput
                  value={editText}
                  onChangeText={setEditText}
                  style={[cS.text, { backgroundColor: COLORS.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.blue }]}
                  multiline
                  maxLength={100}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 5 }}>
                  <TouchableOpacity onPress={handleSaveEdit} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COLORS.blue, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, color: COLORS.white, fontWeight: '700' }}>Sauvegarder</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditing(false)} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, color: COLORS.gray }}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : renderRichText(comment.text, cS.text)}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
              <TouchableOpacity onPress={() => onReply({ parentId: comment.id, username: liveUser?.username || comment.username, toUserId: comment.userId })} style={cS.actionBtn}>
                <Ionicons name="chatbubble-outline" size={12} color={COLORS.gray} />
                <Text style={cS.actionText}>Reply{replies.length > 0 ? ` · ${replies.length}` : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLike} style={cS.actionBtn}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={13} color={liked ? COLORS.red : COLORS.gray} />
                </Animated.View>
                {likeCount > 0 && <Text style={[cS.actionText, liked && { color: COLORS.red }]}> {likeCount}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* ── View replies toggle ── */}
      {replies.length > 0 && (
        <TouchableOpacity onPress={() => setShowReplies(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 44, paddingVertical: 4, marginBottom: 2, gap: 6 }}>
          <View style={{ width: 20, height: 1, backgroundColor: COLORS.gray3 }} />
          <Text style={{ fontSize: 11, color: COLORS.blue, fontWeight: '700' }}>
            {showReplies ? 'Masquer les réponses' : `Voir ${replies.length} réponse${replies.length > 1 ? 's' : ''}`}
          </Text>
          <Ionicons name={showReplies ? 'chevron-up' : 'chevron-down'} size={11} color={COLORS.blue} />
        </TouchableOpacity>
      )}

      {/* ── Inline replies (feed style: indented, minimal, no avatar) ── */}
      {showReplies && replies.map(r => (
        <TipReplyBubble key={r.id} comment={r} onDelete={onDelete} onEdit={onEdit} currentUser={currentUser} />
      ))}
    </View>
  );
}

// ─── Reply bubble (minimal, indented — feed style) ───────────────────────────
function TipReplyBubble({ comment, onDelete, onEdit, currentUser }) {
  const [liveUser, setLiveUser] = useState(comment);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(comment.likes || 0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text || '');
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const isMine = comment.userId && currentUser?.uid === comment.userId;
  const handleLongPress = () => {
    if (!isMine) return;
    Alert.alert('Réponse', 'Que veux-tu faire ?', [
      { text: 'Modifier ✏️', onPress: () => { setEditText(comment.text || ''); setEditing(true); } },
      { text: 'Supprimer 🗑️', style: 'destructive', onPress: () => onDelete?.(comment.id) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };
  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditing(false);
    await onEdit?.(comment.id, trimmed);
  };

  useEffect(() => {
    if (!comment.userId) return;
    const unsub = onSnapshot(doc(db, 'users', comment.userId), snap => {
      if (snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
    }, () => {});
    return () => unsub();
  }, [comment.userId]);

  const _base = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'board' ? '#00E676'
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.plan === 'legendary' ? COLORS.gold : COLORS.white;
  const _ue = USERNAME_EFFECTS?.find(e => e.id === liveUser?.equippedUsernameEffect);
  const nameColor = _ue ? (_ue.color || _ue.colors?.[0] || _base) : _base;
  const nameGlow = _ue?.glow || false;
  const nameAnim = _ue?.animated || false;
  const uePulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!nameAnim) { uePulse.setValue(1); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(uePulse, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      Animated.timing(uePulse, { toValue: 1,    duration: 750, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [nameAnim, nameColor]);

  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.3, useNativeDriver: true, speed: 60 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    try {
      await updateDoc(doc(db, 'tipComments', comment.id), { likes: increment(newLiked ? 1 : -1) });
    } catch (e) {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.9} onLongPress={handleLongPress} style={cS.replyCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
        {nameAnim ? (
          <Animated.Text style={{ fontSize: 11, fontWeight: '800', color: nameColor, opacity: uePulse, textShadowColor: nameColor, textShadowRadius: 9, textShadowOffset: { width: 0, height: 0 } }}>
            {liveUser?.username || comment.username}
          </Animated.Text>
        ) : (
          <Text style={{ fontSize: 11, fontWeight: '800', color: nameColor, textShadowColor: nameGlow ? nameColor : 'transparent', textShadowRadius: nameGlow ? 5 : 0, textShadowOffset: { width: 0, height: 0 } }}>
            {liveUser?.username || comment.username}
          </Text>
        )}
        <Text style={{ fontSize: 9, color: COLORS.gray }}> · {tipFmtTime(comment.createdAt)}</Text>
      </View>
      {editing ? (
        <View style={{ marginTop: 2 }}>
          <TextInput
            value={editText}
            onChangeText={setEditText}
            style={{ fontSize: 12, color: COLORS.white, backgroundColor: COLORS.card, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.blue }}
            multiline maxLength={100} autoFocus
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity onPress={handleSaveEdit} style={{ paddingHorizontal: 9, paddingVertical: 3, backgroundColor: COLORS.blue, borderRadius: 5 }}>
              <Text style={{ fontSize: 10, color: COLORS.white, fontWeight: '700' }}>Sauvegarder</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={{ fontSize: 10, color: COLORS.gray }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: COLORS.white, lineHeight: 17 }} numberOfLines={3}>
          {(comment.text || '').split(/(@\w+|#\w+)/g).map((part, i) => {
            if (part.startsWith('@')) return <Text key={i} style={{ color: COLORS.blue, fontWeight: '600' }}>{part}</Text>;
            if (part.startsWith('#')) return <Text key={i} style={{ color: COLORS.gold, fontWeight: '600' }}>{part}</Text>;
            return <Text key={i}>{part}</Text>;
          })}
        </Text>
      )}
      <TouchableOpacity onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={11} color={liked ? COLORS.red : COLORS.gray} />
        </Animated.View>
        {likeCount > 0 && <Text style={{ fontSize: 9, color: liked ? COLORS.red : COLORS.gray, marginLeft: 3 }}>{likeCount}</Text>}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const cS = StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden', marginBottom: 8 },
  replyCard: { marginLeft: 52, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: COLORS.gray3, marginBottom: 6 },
  name: { fontSize: 12, fontWeight: '800' },
  time: { fontSize: 10, color: COLORS.gray },
  text: { fontSize: 13, color: COLORS.white, lineHeight: 18, marginTop: 3 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  actionText: { fontSize: 11, color: COLORS.gray, marginLeft: 3, fontWeight: '600' },
});

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function TipDetailScreen({ navigation, route }) {
  const { tip } = route.params;
  const { user: authUser, userProfile } = useAuthStore();

  const player = useVideoPlayer(getVideoUrl(tip), (p) => {
    p.loop = false;
    p.play();
  });

  // Thanks
  const [skipThanksConfirm, setSkipThanksConfirm] = useState(false);
  const [showThanksConfirm, setShowThanksConfirm] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [thanksQty, setThanksQty] = useState(1);
  const [customQtyStr, setCustomQtyStr] = useState('');
  const [thanksCount, setThanksCount] = useState(tip.thanksCount || 0);
  const [thankLoading, setThankLoading] = useState(false);

  // Comments
  const [comments, setComments] = useState([]);
  const [commentsCount, setCommentsCount] = useState(tip.commentsCount || 0);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [loadingComments, setLoadingComments] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef(null);

  // Creator
  const [creatorProfile, setCreatorProfile] = useState(null);

  const CAT_COLORS = { flashtuto: COLORS.blue, flashinfo: COLORS.red, gameindev: '#7C4DFF', gatv: COLORS.gold };
  const catColor = CAT_COLORS[tip.contentType] || COLORS.gray;
  const CAT_LABELS = { flashtuto: 'FLASHTUTO', flashinfo: 'FLASHINFO', gameindev: 'GAMEINDEV' };
  const BADGES = {
    gameconic: { bg: COLORS.red, text: COLORS.white, label: 'ICON' },
    creator: { bg: COLORS.blue, text: '#0A0A0F', label: 'CREATOR' },
    developer: { bg: '#7C4DFF', text: COLORS.white, label: 'DEV' },
    gamer: { bg: COLORS.gray2, text: COLORS.white, label: 'GA' },
  };
  const badge = BADGES[tip.accountType] || BADGES.gamer;

  const maxAffordableQty = Math.floor((userProfile?.gaPoints || 0) / THANKS_COST);
  const effectiveQty = (() => {
    if (customQtyStr) { const n = parseInt(customQtyStr); if (!isNaN(n) && n >= 1) return n; }
    return thanksQty;
  })();
  const totalCost = THANKS_COST * effectiveQty;

  const showFanbase = tip.accountType !== 'gamer' && tip.userId !== authUser?.uid;
  const _creatorBase = accountNameColor(creatorProfile?.accountType || tip.accountType, creatorProfile?.plan || tip.plan);
  const _creatorUe = USERNAME_EFFECTS?.find(e => e.id === creatorProfile?.equippedUsernameEffect);
  const creatorNameColor = _creatorUe ? (_creatorUe.color || _creatorUe.colors?.[0] || _creatorBase) : _creatorBase;
  const creatorNameGlow = _creatorUe?.glow || false;
  const creatorNameAnim = _creatorUe?.animated || false;
  const creatorUePulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!creatorNameAnim) { creatorUePulse.setValue(1); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(creatorUePulse, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      Animated.timing(creatorUePulse, { toValue: 1,    duration: 750, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [creatorNameAnim, creatorNameColor]);

  // Load comments
  const loadFirstComments = async () => {
    setLoadingComments(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'tipComments'),
        where('tipId', '==', tip.id),
        orderBy('createdAt', 'desc'),
        limit(COMMENT_PAGE)
      ));
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      setHasMore(snap.docs.length === COMMENT_PAGE);
    } catch (e) { setComments([]); }
    finally { setLoadingComments(false); }
  };

  const loadMoreComments = async () => {
    if (loadingMore || !hasMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'tipComments'),
        where('tipId', '==', tip.id),
        orderBy('createdAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(COMMENT_PAGE)
      ));
      setComments(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] || lastDocRef.current;
      setHasMore(snap.docs.length === COMMENT_PAGE);
    } catch (e) {}
    finally { setLoadingMore(false); }
  };

  useEffect(() => {
    let unsubCreator = null;
    if (tip.userId) {
      unsubCreator = onSnapshot(doc(db, 'users', tip.userId), snap => {
        if (snap.exists()) setCreatorProfile({ uid: tip.userId, ...snap.data() });
      }, () => {
        getDoc(doc(db, 'users', tip.userId)).then(snap => {
          if (snap.exists()) setCreatorProfile({ uid: tip.userId, ...snap.data() });
        }).catch(() => {});
      });
    }
    AsyncStorage.getItem('@ga_skip_thanks_confirm').then(val => {
      if (val === 'true') setSkipThanksConfirm(true);
    }).catch(() => {});
    const unsub = onSnapshot(doc(db, 'videos', tip.id), snap => {
      if (snap.exists()) {
        setCommentsCount(snap.data().commentsCount || 0);
        setThanksCount(snap.data().thanksCount || 0);
      }
    });
    loadFirstComments();
    return () => { unsub(); if (unsubCreator) unsubCreator(); };
  }, [tip.id]);

  // Thanks
  const handleThanks = () => {
    if (!authUser?.uid) return;
    if (userProfile?.accountType === 'creator' || userProfile?.accountType === 'gameconic') {
      Alert.alert('Non disponible', "Les créateurs et Gameconics ne peuvent pas envoyer de THX pour garder l'économie équitable. 🛡️", [{ text: 'OK' }]);
      return;
    }
    if ((userProfile?.gaPoints || 0) < THANKS_COST) {
      Alert.alert('❌ Pas assez de GA Points', `Minimum ${THANKS_COST} pts (1 THX). Tu en as ${userProfile?.gaPoints || 0}.`, [{ text: 'OK' }]);
      return;
    }
    if (skipThanksConfirm) { doThanks(); return; }
    setDontAskAgain(false); setThanksQty(1); setCustomQtyStr('');
    setShowThanksConfirm(true);
  };

  const doThanks = async () => {
    if (!authUser?.uid) return;
    const qty = effectiveQty;
    const cost = THANKS_COST * qty;
    if ((userProfile?.gaPoints || 0) < cost) { setShowThanksConfirm(false); return; }
    if (dontAskAgain) {
      try { await AsyncStorage.setItem('@ga_skip_thanks_confirm', 'true'); } catch {}
      setSkipThanksConfirm(true);
    }
    setShowThanksConfirm(false);
    setThankLoading(true);
    try {
      await addDoc(collection(db, 'thanks'), { userId: authUser.uid, tipId: tip.id, creatorId: tip.userId, points: cost, qty, createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'users', authUser.uid), { gaPoints: increment(-cost) });
      await updateDoc(doc(db, 'users', tip.userId), { gaPoints: increment(cost) });
      await updateDoc(doc(db, 'videos', tip.id), { thanksCount: increment(qty) });
      await addDoc(collection(db, 'notifications'), {
        userId: tip.userId, type: 'thanks', fromUserId: authUser.uid,
        fromUsername: userProfile?.username || 'Someone',
        text: `t'a envoyé ${qty > 1 ? qty + '× ' : ''}THX sur ton tip ! ⚡ +${cost} GA Points`,
        videoId: tip.id, read: false, createdAt: serverTimestamp(),
      });
      useAuthStore.setState(state => ({
        userProfile: state.userProfile
          ? { ...state.userProfile, gaPoints: Math.max(0, (state.userProfile.gaPoints || 0) - cost) }
          : state.userProfile,
      }));
      setThanksCount(prev => prev + qty);
    } catch (e) {
      Alert.alert('Erreur', 'Une erreur est survenue. Réessaie.');
    } finally { setThankLoading(false); }
  };

  // Comments — split top-level vs replies
  const topComments = comments.filter(c => !c.parentId);
  const repliesMap = {};
  comments.forEach(c => {
    if (c.parentId) {
      if (!repliesMap[c.parentId]) repliesMap[c.parentId] = [];
      repliesMap[c.parentId].push(c);
    }
  });

  const handleDeleteComment = async (commentId) => {
    try {
      await deleteDoc(doc(db, 'tipComments', commentId));
      await updateDoc(doc(db, 'videos', tip.id), { commentsCount: increment(-1) });
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (e) { Alert.alert('Erreur', 'Impossible de supprimer.'); }
  };

  const handleEditComment = async (commentId, newText) => {
    try {
      await updateDoc(doc(db, 'tipComments', commentId), { text: newText });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, text: newText } : c));
    } catch (e) { Alert.alert('Erreur', 'Impossible de modifier.'); }
  };

  const handleSendComment = async () => {
    // replyTo is { parentId, username } | null
    const prefix = replyTo ? '@' + replyTo.username + ' ' : '';
    const raw = prefix + commentText.trim();
    if (!raw || !userProfile?.uid) return;
    const capturedReplyTo = replyTo;
    setCommentText(''); setReplyTo(null);
    const banned = findBannedWords(raw);
    const body = banned.length > 0 ? censorText(raw) : raw;
    if (banned.length > 0) logModeration(userProfile.uid, userProfile.username, raw, banned);
    try {
      const ref = await addDoc(collection(db, 'tipComments'), {
        tipId: tip.id, userId: userProfile.uid, username: userProfile.username,
        avatar: userProfile.avatar || '', accountType: userProfile.accountType || 'gamer',
        plan: userProfile.plan || 'free', equippedFrame: userProfile.equippedFrame || 'none',
        equippedCommentFrame: userProfile.equippedCommentFrame || 'none',
        isChampion: userProfile.isChampion || false, text: body, likes: 0,
        parentId: capturedReplyTo?.parentId || null,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'videos', tip.id), { commentsCount: increment(1) });

      // ── Notification au créateur du tip (commentaire top-level) ──
      if (!capturedReplyTo && tip.userId && tip.userId !== userProfile.uid) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: tip.userId, type: 'comment', fromUserId: userProfile.uid,
            fromUsername: userProfile.username || 'Someone',
            text: `a commenté ton tip "${tip.title || tip.caption}" : "${body.slice(0, 50)}${body.length > 50 ? '…' : ''}"`,
            videoId: tip.id, read: false, createdAt: serverTimestamp(),
          });
        } catch (_) {}
      }
      // ── Notification à l'auteur du commentaire (reply) ──
      if (capturedReplyTo?.parentId && capturedReplyTo?.toUserId && capturedReplyTo.toUserId !== userProfile.uid) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: capturedReplyTo.toUserId, type: 'reply', fromUserId: userProfile.uid,
            fromUsername: userProfile.username || 'Someone',
            text: `a répondu à ton commentaire : "${body.slice(0, 60)}${body.length > 60 ? '…' : ''}"`,
            videoId: tip.id, read: false, createdAt: serverTimestamp(),
          });
        } catch (_) {}
      }

      setComments(prev => [{
        id: ref.id, tipId: tip.id, userId: userProfile.uid,
        username: userProfile.username, avatar: userProfile.avatar || '',
        accountType: userProfile.accountType, plan: userProfile.plan,
        equippedFrame: userProfile.equippedFrame, equippedCommentFrame: userProfile.equippedCommentFrame,
        text: body, likes: 0, parentId: capturedReplyTo?.parentId || null,
        createdAt: { toDate: () => new Date() },
      }, ...prev]);
    } catch (e) {}
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* ── Thanks modal ─────────────────────────────────────────── */}
      <Modal visible={showThanksConfirm} transparent animationType="fade" statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => setShowThanksConfirm(false)}>
          <View style={tcS.backdrop}>
            <TouchableWithoutFeedback>
              <View style={tcS.card}>
                <View style={tcS.iconCircle}>
                  <Ionicons name="flash" size={28} color={THANKS_COLOR} />
                </View>
                <Text style={tcS.title}>Envoyer des THX ⚡</Text>
                <Text style={tcS.subtitle}>
                  <Text style={{ color: COLORS.white, fontWeight: '800' }}>1 THX = {THANKS_COST} GA Points</Text>
                  {'\n'}Tu as {userProfile?.gaPoints || 0} pts · max {maxAffordableQty} THX
                </Text>

                <View style={tcS.qtyRow}>
                  {[1, 2, 5, 10].map(q => {
                    const isActive = !customQtyStr && thanksQty === q;
                    const tooExp = (userProfile?.gaPoints || 0) < THANKS_COST * q;
                    return (
                      <TouchableOpacity
                        key={q}
                        onPress={() => { if (!tooExp) { setThanksQty(q); setCustomQtyStr(''); } }}
                        style={[tcS.qtyBtn, isActive && tcS.qtyBtnActive, tooExp && { opacity: 0.28 }]}
                        disabled={tooExp}
                      >
                        <Text style={[tcS.qtyNum, isActive && { color: COLORS.black }]}>{q} THX</Text>
                        <Text style={[tcS.qtyCost, isActive && { color: COLORS.black }]}>{THANKS_COST * q} pts</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={tcS.customRow}>
                  <Ionicons name="create-outline" size={14} color={COLORS.gray} style={{ marginRight: 8 }} />
                  <TextInput
                    value={customQtyStr}
                    onChangeText={v => {
                      const raw = v.replace(/[^0-9]/g, '');
                      if (!raw) { setCustomQtyStr(''); return; }
                      setCustomQtyStr(String(Math.min(parseInt(raw), maxAffordableQty)));
                    }}
                    placeholder={`Custom (max ${maxAffordableQty} THX)`}
                    placeholderTextColor={COLORS.gray}
                    style={tcS.customInput}
                    keyboardType="number-pad"
                  />
                </View>

                <View style={tcS.summaryRow}>
                  <Text style={tcS.summaryText}>
                    {effectiveQty} THX = <Text style={{ color: THANKS_COLOR, fontWeight: '800' }}>{totalCost} pts</Text>
                  </Text>
                  <Text style={tcS.balanceText}>
                    Solde après : {Math.max(0, (userProfile?.gaPoints || 0) - totalCost)} pts
                  </Text>
                </View>

                <TouchableOpacity style={tcS.checkRow} onPress={() => setDontAskAgain(v => !v)} activeOpacity={0.8}>
                  <View style={[tcS.checkbox, dontAskAgain && tcS.checkboxOn]}>
                    {dontAskAgain && <Ionicons name="checkmark" size={14} color={COLORS.black} />}
                  </View>
                  <Text style={tcS.checkLabel}>Ne plus me demander</Text>
                </TouchableOpacity>

                <View style={tcS.btnRow}>
                  <TouchableOpacity onPress={() => setShowThanksConfirm(false)} style={tcS.cancelBtn}>
                    <Text style={tcS.cancelText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={doThanks}
                    style={[tcS.confirmBtn, effectiveQty < 1 && { opacity: 0.4 }]}
                    disabled={effectiveQty < 1}
                  >
                    <Ionicons name="flash" size={13} color={COLORS.white} style={{ marginRight: 5 }} />
                    <Text style={tcS.confirmText}>{effectiveQty} THX · {totalCost} pts</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Fixed header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{tip.title || tip.caption}</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* ── Fixed top content ─────────────────────────────────────── */}
      <View>
        {/* Video */}
        <View style={styles.videoArea}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsFullscreen />
          {fmtDuration(tip.duration) && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{fmtDuration(tip.duration)}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <View style={[styles.catTag, { backgroundColor: catColor + '20' }]}>
            <Text style={[styles.catTagText, { color: catColor }]}>{CAT_LABELS[tip.contentType] || tip.contentType?.toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>{tip.title || tip.caption}</Text>
          {!!(tip.caption && tip.title) && (
            <Text style={styles.tipDesc}>{tip.caption}</Text>
          )}
          <Text style={styles.game}>🎮 {tip.game}</Text>
        </View>

        {/* Action bar: Views | THX | Comments | [Fanbase] */}
        <View style={styles.actionBar}>
          <View style={styles.actionItem}>
            <Ionicons name="eye-outline" size={19} color={COLORS.gray} />
            <Text style={styles.actionLabel}>{tip.viewsCount || 0}</Text>
          </View>
          <View style={styles.actionDivider} />
          <TouchableOpacity
            style={styles.actionItem}
            onPress={tip.userId !== authUser?.uid ? handleThanks : undefined}
            disabled={thankLoading || tip.userId === authUser?.uid}
          >
            {thankLoading
              ? <ActivityIndicator size="small" color={THANKS_COLOR} />
              : <Ionicons name="flash-outline" size={19} color={THANKS_COLOR} />}
            <Text style={[styles.actionLabel, { color: THANKS_COLOR }]}>{thanksCount} THX</Text>
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <View style={styles.actionItem}>
            <Ionicons name="chatbubble-outline" size={19} color={COLORS.blue} />
            <Text style={[styles.actionLabel, { color: COLORS.blue }]}>{commentsCount}</Text>
          </View>
          {showFanbase && (
            <>
              <View style={styles.actionDivider} />
              <TouchableOpacity
                style={[styles.actionItem, styles.fanbaseActionItem]}
                onPress={() => navigation.navigate('Fanbase', { creator: creatorProfile || { ...tip, uid: tip.userId } })}
              >
                <Ionicons name="star" size={19} color={GREEN} />
                <Text style={[styles.actionLabel, { color: GREEN }]}>Fanbase</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Creator card */}
        <TouchableOpacity
          onPress={() => navigation.navigate('UserProfile', { userId: tip.userId })}
          style={styles.creatorCard}
          activeOpacity={0.85}
        >
          <Avatar user={creatorProfile || { ...tip, uid: tip.userId }} size={44} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            {/* Username + feed-style badges */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              {creatorNameAnim ? (
                <Animated.Text style={[styles.creatorName, { color: creatorNameColor, opacity: creatorUePulse, textShadowColor: creatorNameColor, textShadowRadius: 9, textShadowOffset: { width: 0, height: 0 } }]}>
                  {creatorProfile?.username || tip.username}
                </Animated.Text>
              ) : (
                <Text style={[styles.creatorName, { color: creatorNameColor, textShadowColor: creatorNameGlow ? creatorNameColor : 'transparent', textShadowRadius: creatorNameGlow ? 8 : 0, textShadowOffset: { width: 0, height: 0 } }]}>
                  {creatorProfile?.username || tip.username}
                </Text>
              )}
              {/* Account type icon */}
              {(creatorProfile?.accountType || tip.accountType) === 'gameconic' && <Ionicons name="flash" size={13} color={COLORS.red} style={{ marginLeft: 4 }} />}
              {(creatorProfile?.accountType || tip.accountType) === 'creator' && <Ionicons name="videocam" size={13} color={COLORS.blue} style={{ marginLeft: 4 }} />}
              {(creatorProfile?.accountType || tip.accountType) === 'developer' && <Ionicons name="code-slash" size={13} color="#7C4DFF" style={{ marginLeft: 4 }} />}
              {/* Feed-style LEG / ICON / CR / GA badges */}
              <UserPlanBadges
                accountType={creatorProfile?.accountType || tip.accountType}
                plan={creatorProfile?.plan || tip.plan}
                style={{ marginLeft: 5 }}
              />
            </View>
            {/* Profile badge cosmétique (GOD MODE, G.O.A.T, etc.) */}
            <ProfileBadgePill equippedProfileBadge={creatorProfile?.equippedProfileBadge} />
            <Text style={styles.creatorSub}>
              {creatorProfile?.followers ? `${creatorProfile.followers} abonnés · ` : ''}Voir le profil
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={COLORS.gray} />
        </TouchableOpacity>
      </View>

      {/* ── Comments section — scrolls independently ──────────────── */}
      <View style={styles.commentsSection}>
        <View style={styles.commentsHeader}>
          <Ionicons name="chatbubble-outline" size={14} color={COLORS.gray} />
          <Text style={styles.commentsHeaderText}>{commentsCount} Commentaires</Text>
        </View>
        {loadingComments ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={topComments}
            keyExtractor={c => c.id}
            renderItem={({ item }) => (
              <View style={styles.commentWrap}>
                <TipCommentBubble
                  comment={item}
                  replies={repliesMap[item.id] || []}
                  onReply={setReplyTo}
                  onDelete={handleDeleteComment}
                  onEdit={handleEditComment}
                  currentUser={authUser}
                  currentProfile={userProfile}
                />
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyComments}>Aucun commentaire. Sois le premier ! 👇</Text>
            }
            ListFooterComponent={
              loadingMore
                ? <ActivityIndicator color={COLORS.gold} style={{ marginVertical: 12 }} />
                : !hasMore && comments.length > 0
                  ? <Text style={styles.noMoreText}>— fin —</Text>
                  : <View style={{ height: 10 }} />
            }
            onEndReached={loadMoreComments}
            onEndReachedThreshold={0.4}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      {/* ── Sticky comment input ──────────────────────────────────── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {replyTo && (
          <View style={styles.replyBar}>
            <Ionicons name="return-down-forward" size={13} color={COLORS.blue} />
            <Text style={styles.replyBarText}> Répondre à <Text style={{ fontWeight: '800' }}>@{replyTo.username}</Text></Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close-circle" size={17} color={COLORS.gray} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <Avatar user={userProfile} size={30} />
          <TextInput
            value={commentText}
            onChangeText={t => setCommentText(t.slice(0, MAX_COMMENT))}
            placeholder="Ajouter un commentaire..."
            placeholderTextColor={COLORS.gray}
            style={styles.commentInput}
            maxLength={MAX_COMMENT}
            multiline
          />
          <TouchableOpacity
            onPress={handleSendComment}
            style={[styles.sendBtn, !commentText.trim() && { opacity: 0.35 }]}
            disabled={!commentText.trim()}
          >
            <Ionicons name="send" size={14} color={COLORS.black} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 10,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3,
  },
  backBtn: { width: 36 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.white, marginHorizontal: 8 },
  videoArea: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#060610', position: 'relative' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  durationText: { fontSize: 10, color: COLORS.white, fontWeight: '700' },
  infoSection: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  catTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 5 },
  catTagText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  title: { fontSize: 17, fontWeight: '900', color: COLORS.white, marginBottom: 3, lineHeight: 22 },
  tipDesc: { fontSize: 12, color: COLORS.gray, fontStyle: 'italic', lineHeight: 16, marginBottom: 4 },
  game: { fontSize: 11, color: COLORS.gold },
  // Action bar
  actionBar: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  actionItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11 },
  fanbaseActionItem: { backgroundColor: 'rgba(0,200,83,0.08)' },
  actionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '600', marginTop: 3 },
  actionDivider: { width: 0.5, backgroundColor: COLORS.gray3, alignSelf: 'stretch' },
  // Creator
  creatorCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  creatorName: { fontSize: 15, fontWeight: '700' },
  creatorSub: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 7, fontWeight: '900' },
  // Comments section
  commentsSection: { flex: 1 },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  commentsHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.white, marginLeft: 7 },
  commentWrap: { paddingHorizontal: 12, paddingVertical: 4 },
  emptyComments: { fontSize: 13, color: COLORS.gray, textAlign: 'center', marginTop: 24 },
  noMoreText: { fontSize: 10, color: COLORS.gray2, textAlign: 'center', paddingVertical: 12 },
  // Comment input
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(0,122,255,0.08)', borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  replyBarText: { fontSize: 12, color: COLORS.blue },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12,
    paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    borderTopWidth: 0.5, borderTopColor: COLORS.gray3, backgroundColor: COLORS.black,
  },
  commentInput: {
    flex: 1, marginHorizontal: 10, backgroundColor: COLORS.card, borderRadius: 20,
    paddingHorizontal: 13, paddingVertical: 9, fontSize: 14, color: COLORS.white, maxHeight: 80,
  },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
});

const tcS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#141420', borderRadius: 22, padding: 22, width: '100%', alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(124,77,255,0.3)' },
  iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(124,77,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(124,77,255,0.3)' },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.white, marginBottom: 5, textAlign: 'center' },
  subtitle: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 19, marginBottom: 14 },
  qtyRow: { flexDirection: 'row', width: '100%', marginBottom: 11 },
  qtyBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.gray3, marginHorizontal: 3 },
  qtyBtnActive: { backgroundColor: THANKS_COLOR, borderColor: THANKS_COLOR },
  qtyNum: { fontSize: 12, fontWeight: '800', color: COLORS.white },
  qtyCost: { fontSize: 9, color: COLORS.gray, marginTop: 2 },
  customRow: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, marginBottom: 11, borderWidth: 0.5, borderColor: COLORS.gray3 },
  customInput: { flex: 1, fontSize: 14, color: COLORS.white, paddingVertical: 9 },
  summaryRow: { alignItems: 'center', marginBottom: 3 },
  summaryText: { fontSize: 14, color: COLORS.white, fontWeight: '700' },
  balanceText: { fontSize: 11, color: COLORS.gray, marginTop: 2, marginBottom: 13 },
  checkRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 16 },
  checkbox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.gray2, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  checkboxOn: { backgroundColor: THANKS_COLOR, borderColor: THANKS_COLOR },
  checkLabel: { fontSize: 13, color: COLORS.white, fontWeight: '600' },
  btnRow: { flexDirection: 'row', width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, alignItems: 'center', marginRight: 8 },
  cancelText: { fontSize: 14, color: COLORS.gray, fontWeight: '700' },
  confirmBtn: { flex: 1.5, paddingVertical: 13, borderRadius: 12, backgroundColor: THANKS_COLOR, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  confirmText: { fontSize: 13, color: COLORS.white, fontWeight: '900' },
});

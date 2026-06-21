import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Platform, KeyboardAvoidingView, ActivityIndicator, Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, onSnapshot, addDoc,
  serverTimestamp, updateDoc, doc, increment, getDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import { commentFrameStyle } from '../../constants/frames';
import FramedAvatar from '../../components/FramedAvatar';
import { ElectricBorder } from '../../components/ElectricEffect';
import { logError } from '../../utils/errorLogger';
import { globalNavigate } from '../../utils/navigationRef';

const MAX_CHARS = 100;

// Formate le timestamp en "Xm" / "Xh" / "Xd"
function fmtTime(ts) {
  if (!ts) return 'now';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

// Récupère le profil live depuis Firestore — pas de cache pour avoir toujours les frames à jour
async function getLiveProfile(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) return { uid: userId, ...snap.data() };
  } catch (e) {}
  return null;
}

// Rendu d'une bulle de commentaire avec comment frame
function CommentItem({ item, onReply, onLike, currentUserId }) {
  const [liveUser, setLiveUser] = useState(item);
  // Initialise liked depuis likedBy (persistant entre ouvertures)
  const [liked, setLiked] = useState(!!(item.likedBy || []).includes(currentUserId));
  const [likeCount, setLikeCount] = useState(item.likes || 0);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (item.userId) {
      getLiveProfile(item.userId).then(p => { if (p) setLiveUser(p); });
    }
  }, [item.userId]);

  // Re-sync si l'item change (ex: onSnapshot refresh)
  useEffect(() => {
    setLiked(!!(item.likedBy || []).includes(currentUserId));
    setLikeCount(item.likes || 0);
  }, [item.likedBy, item.likes]);

  const cf = commentFrameStyle(liveUser);
  const isChampionFrame = cf?.id === 'cf_champion';
  const borderColor = cf ? cf.color : 'transparent';
  const hasBorder = cf && cf.id !== 'none';

  const handleLike = async () => {
    if (!currentUserId) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.3, useNativeDriver: true, speed: 60 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    try {
      await updateDoc(doc(db, 'comments', item.id), {
        likes: increment(newLiked ? 1 : -1),
        likedBy: newLiked ? arrayUnion(currentUserId) : arrayRemove(currentUserId),
      });
    } catch (e) {
      // Rollback si erreur
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    }
  };

  // Badges
  const BADGES = {
    gameconic: { label: 'ICON', bg: COLORS.red },
    creator:   { label: 'CR',   bg: COLORS.blue },
  };
  const badge = BADGES[liveUser?.accountType];
  const nameColor = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.plan === 'legendary' ? COLORS.gold
    : COLORS.white;

  return (
    <View style={[
      styles.commentCard,
      hasBorder && { borderColor, borderWidth: 1.5 },
      isChampionFrame && { borderColor: '#E8C96B', borderWidth: 2 },
    ]}>
      {isChampionFrame && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ElectricBorder width="100%" height="100%" radius={12} />
        </View>
      )}
      {hasBorder && !isChampionFrame && cf.glow && (
        <View style={[StyleSheet.absoluteFill, {
          borderRadius: 12, borderWidth: 1.5, borderColor,
          shadowColor: borderColor, shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6, shadowRadius: 6,
        }]} pointerEvents="none" />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <TouchableOpacity onPress={() => { if (item.userId) globalNavigate('UserProfile', { userId: item.userId }); }} activeOpacity={0.7}>
          <FramedAvatar user={liveUser} size={30} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <TouchableOpacity onPress={() => { if (item.userId) globalNavigate('UserProfile', { userId: item.userId }); }} activeOpacity={0.7}>
              <Text style={[styles.commentName, { color: nameColor }]}>{liveUser?.username || item.username}</Text>
            </TouchableOpacity>
            {badge && <View style={[styles.badge, { backgroundColor: badge.bg }]}><Text style={styles.badgeText}>{badge.label}</Text></View>}
            {liveUser?.plan === 'legendary' && !badge && <View style={[styles.badge, { backgroundColor: COLORS.gold }]}><Text style={[styles.badgeText, { color: COLORS.black }]}>LEG</Text></View>}
            <Text style={styles.commentTime}> · {fmtTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <TouchableOpacity onPress={() => onReply(liveUser?.username || item.username)} style={styles.replyBtn}>
              <Ionicons name="chatbubble-outline" size={12} color={COLORS.gray} />
              <Text style={styles.replyBtnText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLike} style={styles.likeBtn} disabled={liked}>
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? COLORS.red : COLORS.gray} />
              </Animated.View>
              {likeCount > 0 && <Text style={[styles.likeCount, liked && { color: COLORS.red }]}>{likeCount}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function CommentsScreen({ navigation, route }) {
  const { video } = route?.params || {};
  const { user, userProfile } = useAuthStore();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);

  useEffect(() => {
    if (!video?.id) { setLoading(false); return; }
    const q = query(
      collection(db, 'comments'),
      where('videoId', '==', video.id),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [video?.id]);

  const handleSend = async () => {
    const body = (replyTo ? '@' + replyTo + ' ' : '') + text.trim();
    if (!body || !user?.uid || !video?.id) return;
    setText('');
    setReplyTo(null);
    try {
      await addDoc(collection(db, 'comments'), {
        videoId: video.id,
        userId: user.uid,
        username: userProfile?.username || 'Player',
        avatar: userProfile?.avatar || '',
        accountType: userProfile?.accountType || 'gamer',
        plan: userProfile?.plan || 'free',
        equippedFrame: userProfile?.equippedFrame || 'none',
        equippedCommentFrame: userProfile?.equippedCommentFrame || 'none',
        isChampion: userProfile?.isChampion || false,
        isCurrentLeader: userProfile?.isCurrentLeader || false,
        streakLevel: userProfile?.streakLevel || 'noob',
        text: body,
        likes: 0,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'videos', video.id), { commentsCount: increment(1) });
      if (video.userId && video.userId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: video.userId, type: 'comment', fromUserId: user.uid,
          fromUsername: userProfile?.username || 'Someone',
          text: 'commented: "' + body.slice(0, 50) + '"',
          videoId: video.id, read: false, createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      await logError('CommentsScreen_send', e, user?.uid);
    }
  };

  const remaining = MAX_CHARS - text.length;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{comments.length} Comments</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <CommentItem
              item={item}
              onReply={setReplyTo}
              currentUserId={user?.uid}
            />
          )}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>No comments yet. Be the first! 👇</Text>
          }
        />
      )}

      {replyTo && (
        <View style={styles.replyBar}>
          <Ionicons name="return-down-forward" size={14} color={COLORS.blue} />
          <Text style={styles.replyText}> Replying to @{replyTo}</Text>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ marginLeft: 'auto' }}>
            <Ionicons name="close-circle" size={18} color={COLORS.gray} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBar}>
        <FramedAvatar user={userProfile} size={28} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <TextInput
            value={text}
            onChangeText={t => setText(t.slice(0, MAX_CHARS))}
            placeholder={replyTo ? `Reply to @${replyTo}...` : 'Add a comment...'}
            placeholderTextColor={COLORS.gray}
            style={styles.input}
            multiline
            maxLength={MAX_CHARS}
          />
          {text.length > 70 && (
            <Text style={[styles.charCount, remaining < 15 && { color: COLORS.red }]}>
              {remaining}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendBtn, !text.trim() && { opacity: 0.4 }]}
          disabled={!text.trim()}
        >
          <Ionicons name="send" size={16} color={COLORS.black} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30,
    paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  empty: { color: COLORS.gray, textAlign: 'center', marginTop: 50, fontSize: 14 },
  commentCard: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden',
  },
  commentName: { fontSize: 12, fontWeight: '800' },
  commentTime: { fontSize: 10, color: COLORS.gray },
  commentText: { fontSize: 13, color: COLORS.white, marginTop: 4, lineHeight: 18 },
  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, marginLeft: 5 },
  badgeText: { fontSize: 8, fontWeight: '900', color: COLORS.white },
  replyBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  replyBtnText: { fontSize: 11, color: COLORS.gray, marginLeft: 4, fontWeight: '600' },
  likeBtn: { flexDirection: 'row', alignItems: 'center' },
  likeCount: { fontSize: 11, color: COLORS.gray, marginLeft: 4, fontWeight: '600' },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.card, borderTopWidth: 0.5, borderTopColor: COLORS.gray3,
  },
  replyText: { fontSize: 12, color: COLORS.blue, fontWeight: '600' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 0.5, borderTopColor: COLORS.gray3, backgroundColor: COLORS.dark,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  input: { fontSize: 14, color: COLORS.white, maxHeight: 80, paddingVertical: 6 },
  charCount: { fontSize: 10, color: COLORS.gray, textAlign: 'right', marginTop: 2 },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
});

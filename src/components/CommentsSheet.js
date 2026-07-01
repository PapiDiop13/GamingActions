// ════════════════════════════════════════════════════════════════════════════
// CommentsSheet — SHARED comment system (used by Feed AND VideoPlayer).
// Single source of truth: replies, @mention autocomplete, #hashtags,
// live frames, like, edit/delete/report. Keep changes here only.
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, Platform, Animated, Modal, ActivityIndicator, KeyboardAvoidingView,
  TouchableWithoutFeedback, Image, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import useAuthStore from '../store/useAuthStore';
import { logError, LOG_CONTEXT } from '../utils/errorLogger';
import {
  collection, query, where, onSnapshot, getDoc, getDocs, doc,
  updateDoc, deleteDoc, increment, arrayUnion, arrayRemove, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { commentFrameStyle } from '../constants/frames';
import { USERNAME_EFFECTS } from '../constants/cosmetics';
import FramedAvatar from './FramedAvatar';
import { LeaderBadge, ChampionBadge } from './ElectricEffect';
import { globalNavigate } from '../utils/navigationRef';
import { showAlert } from '../store/useAlertStore';

const { height: SH } = require('react-native').Dimensions.get('window');
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

function fmtCommentTime(ts) {
  if (!ts) return 'now';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

// Bulle de commentaire avec comment frame + profil live + like

function CommentBubble({ comment, onReply, compact, navigation }) {
  const { user, userProfile } = useAuthStore();
  const isAdminUser = !!userProfile?.isAdmin;
  const [liveUser, setLiveUser] = useState(comment);
  const [liked, setLiked] = useState(!!(comment.likedBy || []).includes(user?.uid));
  const [likeCount, setLikeCount] = useState(comment.likes || 0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [deleted, setDeleted] = useState(false);

  // Re-sync quand la prop comment change (ex: refresh de la liste)
  useEffect(() => {
    setLiked(!!(comment.likedBy || []).includes(user?.uid));
    setLikeCount(comment.likes || 0);
  }, [comment.likedBy, comment.likes, user?.uid]);

  useEffect(() => {
    if (!comment.userId) return;
    const unsub = onSnapshot(doc(db, 'users', comment.userId), (snap) => {
      if (snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
    }, () => {
      getDoc(doc(db, 'users', comment.userId)).then(snap => {
        if (snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
      }).catch(() => {});
    });
    return () => unsub();
  }, [comment.userId]);

  const isOwnComment = comment.userId === user?.uid;
  const canModerate = isOwnComment || isAdminUser;

  const handleLongPress = () => {
    if (!canModerate) {
      // Pas son commentaire → seulement report
      showAlert({
        title: 'Report Comment?',
        message: '',
        type: 'warning',
        buttons: [
          { text: 'Report', style: 'destructive', onPress: () => {
            globalNavigate('Report', { target: { ...comment, id: comment.id }, targetType: 'comment' });
          }},
          { text: 'Cancel', style: 'cancel' },
        ],
      });
      return;
    }
    const buttons = [];
    if (isOwnComment) {
      buttons.push({ text: '✏️ Edit', onPress: () => { setEditText(comment.text); setEditing(true); } });
    }
    buttons.push({ text: '🗑️ Delete', style: 'destructive', onPress: handleDelete });
    if (!isOwnComment) {
      buttons.push({ text: 'Report', onPress: () => { globalNavigate('Report', { target: { ...comment, id: comment.id }, targetType: 'comment' }); } });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    showAlert({
      title: 'Comment Options',
      message: isAdminUser && !isOwnComment ? 'Admin moderation' : '',
      type: 'info',
      buttons,
    });
  };

  const handleDelete = () => {
    showAlert({
      title: 'Delete Comment?',
      message: 'This cannot be undone.',
      type: 'danger',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'comments', comment.id));
            if (comment.videoId) await updateDoc(doc(db, 'videos', comment.videoId), { commentsCount: increment(-1) });
            setDeleted(true);
          } catch (e) {}
        }},
      ],
    });
  };

  const handleSaveEdit = async () => {
    const newText = editText.trim().slice(0, 100);
    if (!newText) return;
    try {
      await updateDoc(doc(db, 'comments', comment.id), { text: newText, edited: true });
      setEditing(false);
    } catch (e) {}
  };

  const cf = commentFrameStyle(liveUser);
  const hasBorder = cf && cf.id !== 'none';
  const borderColor = hasBorder ? cf.color : 'transparent';
  const isChampionFrame = cf?.id === 'cf_champion';

  // Animated pulsing border for animated comment frames
  const cfPulse = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    if (!cf?.animated || !cf?.glow) { cfPulse.setValue(0.65); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(cfPulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      Animated.timing(cfPulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [cf?.id]);

  // Reflet (sweep) + boules pulsantes — identique au shop
  const cfSweep = React.useRef(new Animated.Value(0)).current;
  const cfSpark = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!cf?.shimmer && !cf?.animated) { cfSweep.setValue(0); cfSpark.setValue(0); return; }
    const sweepA = Animated.loop(Animated.timing(cfSweep, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    const sparkA = Animated.loop(Animated.sequence([
      Animated.timing(cfSpark, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(cfSpark, { toValue: 0, duration: 480, useNativeDriver: true }),
    ]));
    sweepA.start(); sparkA.start();
    return () => { sweepA.stop(); sparkA.stop(); };
  }, [cf?.id]);
  const cfSweepTx   = cfSweep.interpolate({ inputRange: [0, 1], outputRange: [-50, 360] });
  const cfSweepOpac = cfSweep.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 0.7, 0.25, 0] });
  const cfDotScale  = cfSpark.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.6] });
  const cfDotOpac   = cfSpark.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  const _baseNameColor = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'board' ? '#00E676'
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.plan === 'legendary' ? COLORS.gold
    : COLORS.gold;
  const _ueItem1  = USERNAME_EFFECTS?.find(e => e.id === liveUser?.equippedUsernameEffect);
  const nameColor = _ueItem1 ? (_ueItem1.color || _ueItem1.colors?.[0] || _baseNameColor) : _baseNameColor;
  const nameGlow1 = _ueItem1?.glow || false;

  const handleLike = async () => {
    if (!user?.uid) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    try {
      await updateDoc(doc(db, 'comments', comment.id), {
        likes: increment(newLiked ? 1 : -1),
        likedBy: newLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
      });
      // Notifie l'auteur seulement si like (pas unlike)
      if (newLiked && comment.userId && comment.userId !== user?.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: comment.userId,
          type: 'comment_like',
          fromUserId: user?.uid,
          fromUsername: userProfile?.username || 'Someone',
          text: 'liked your comment ❤️',
          videoId: comment.videoId,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    }
  };

  if (deleted) return null;

  return (
    <TouchableOpacity activeOpacity={0.9} onLongPress={handleLongPress} delayLongPress={350} style={[
      sheetS.commentCard,
      compact && { padding: 8, marginBottom: 6 },
      // Frames visible in compact (preview) too — just slightly thinner border
      hasBorder && { borderColor, borderWidth: compact ? 1 : 1.5 },
      isChampionFrame && { borderColor: '#E8C96B', borderWidth: compact ? 1.5 : 2 },
    ]}>
      {/* Animated glow border for animated comment frames (sakura, holographic, etc.) */}
      {hasBorder && !isChampionFrame && cf.glow && (
        cf.animated ? (
          <Animated.View style={[StyleSheet.absoluteFill, {
            borderRadius: 12, borderWidth: 2, borderColor,
            shadowColor: borderColor, shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1, shadowRadius: 14,
            opacity: cfPulse,
          }]} pointerEvents="none" />
        ) : (
          <View style={[StyleSheet.absoluteFill, {
            borderRadius: 12, borderWidth: 1.5, borderColor,
            shadowColor: borderColor, shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6, shadowRadius: 5,
          }]} pointerEvents="none" />
        )
      )}
      {hasBorder && !isChampionFrame && (cf.shimmer || cf.animated) && (
        <>
          <View style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]} pointerEvents="none">
            <Animated.View style={{
              position: 'absolute', top: -24, bottom: -24, width: 38,
              backgroundColor: borderColor, opacity: cfSweepOpac,
              transform: [{ translateX: cfSweepTx }, { skewX: '-18deg' }],
            }} />
          </View>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 5, right: 6, width: 5, height: 5, borderRadius: 2.5, backgroundColor: borderColor, opacity: cfDotOpac, transform: [{ scale: cfDotScale }] }} />
          <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 5, right: 7, width: 4, height: 4, borderRadius: 2, backgroundColor: borderColor, opacity: cfDotOpac, transform: [{ scale: cfDotScale }] }} />
        </>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <TouchableOpacity onPress={() => { if (comment.userId) globalNavigate('UserProfile', { userId: comment.userId }); }} activeOpacity={0.7}>
          <FramedAvatar user={liveUser} size={compact ? 24 : 28} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { if (comment.userId) globalNavigate('UserProfile', { userId: comment.userId }); }} activeOpacity={0.7}>
              <Text style={[sheetS.commentUser, { color: nameColor, textShadowColor: nameGlow1 ? nameColor : 'transparent', textShadowRadius: nameGlow1 ? 6 : 0, textShadowOffset: { width: 0, height: 0 } }, compact && { fontSize: 11 }]}>{liveUser?.username || comment.username}</Text>
            </TouchableOpacity>
            {(() => {
              const excl = ['creator','gameconic'];
              if (liveUser?.isChampion && !excl.includes(liveUser?.accountType)) return <ChampionBadge small />;
              if (liveUser?.isCurrentLeader && !excl.includes(liveUser?.accountType)) return <LeaderBadge small />;
              return null;
            })()}
            <Text style={sheetS.commentTime}> · {fmtCommentTime(comment.createdAt)}</Text>
            {comment.edited && <Text style={[sheetS.commentTime, { fontStyle: 'italic' }]}> · edited</Text>}
          </View>
          {editing ? (
            <View style={{ marginTop: 4 }}>
              <TextInput
                value={editText}
                onChangeText={t => setEditText(t.slice(0, 100))}
                style={{ backgroundColor: COLORS.dark, borderRadius: 8, padding: 8, color: COLORS.white, fontSize: 13 }}
                multiline
                maxLength={100}
                autoFocus
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
                <TouchableOpacity onPress={() => setEditing(false)} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: COLORS.gray, fontSize: 12 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveEdit} style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: COLORS.gold, borderRadius: 16 }}>
                  <Text style={{ color: COLORS.black, fontSize: 12, fontWeight: '800' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <Text style={[sheetS.commentText, compact && { fontSize: 12, marginTop: 1 }]} numberOfLines={compact ? 2 : undefined}>
                {comment.text.split(/(@\w+)/g).map((part, i) =>
                  part.startsWith('@')
                    ? <Text key={i} style={{ color: COLORS.blue, fontWeight: '700' }}>{part}</Text>
                    : <Text key={i}>{part}</Text>
                )}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: compact ? 3 : 5 }}>
                <TouchableOpacity onPress={() => onReply(liveUser?.username || comment.username)} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                  <Ionicons name="chatbubble-outline" size={12} color={COLORS.gray} />
                  <Text style={{ fontSize: 11, color: COLORS.gray, marginLeft: 4, fontWeight: '600' }}>Reply</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? COLORS.red : COLORS.gray} />
                  {likeCount > 0 && <Text style={{ fontSize: 11, color: liked ? COLORS.red : COLORS.gray, marginLeft: 4 }}>{likeCount}</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}


function CommentsSheet({ visible, video, onClose, userProfile }) {
  const { user } = useAuthStore();
  const [allComments, setAllComments] = useState([]);
  const [replies, setReplies]         = useState({});
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [loading, setLoading]         = useState(true);
  // ── @mention autocomplete ──────────────────────────────────────────────────
  const [mentionQuery, setMentionQuery]   = useState(null); // null = not mentioning
  const [mentionUsers, setMentionUsers]   = useState([]);   // followers + following
  const [mentionResults, setMentionResults] = useState([]); // filtered list
  const replyTargetRef = useRef(null);
  const inputRef = useRef(null);
  const MAX = 150;

  // Load followers + following once when the sheet opens (for @mention suggestions)
  useEffect(() => {
    if (!visible || !user?.uid) return;
    (async () => {
      try {
        const [followersSnap, followingSnap] = await Promise.all([
          getDocs(query(collection(db, 'follows'), where('followingId', '==', user.uid))),
          getDocs(query(collection(db, 'follows'), where('followerId', '==', user.uid))),
        ]);
        // Collect unique user IDs from both directions
        const ids = new Set();
        followersSnap.docs.forEach(d => ids.add(d.data().followerId));
        followingSnap.docs.forEach(d => ids.add(d.data().followingId));
        ids.delete(user.uid);

        // Fetch their profiles (username + avatar)
        const profiles = await Promise.all(
          [...ids].slice(0, 50).map(async (uid) => {
            try {
              const snap = await getDoc(doc(db, 'users', uid));
              if (snap.exists()) {
                const d = snap.data();
                return { uid, username: d.username || 'Player', avatar: d.avatar || '', accountType: d.accountType, plan: d.plan };
              }
            } catch (_) {}
            return null;
          })
        );
        setMentionUsers(profiles.filter(Boolean));
      } catch (_) {}
    })();
  }, [visible, user?.uid]);

  // Detect when user is typing @something and filter the suggestion list
  const handleTextChange = (text) => {
    setCommentText(text.slice(0, MAX));
    // Find an @mention being typed at the cursor (last @ not followed by a space)
    const match = text.match(/@(\w*)$/);
    if (match) {
      const q = match[1].toLowerCase();
      setMentionQuery(q);
      const filtered = mentionUsers
        .filter(u => u.username.toLowerCase().includes(q))
        .slice(0, 6);
      setMentionResults(filtered);
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  };

  // When a suggestion is tapped, replace the partial @query with the full @username
  const handleSelectMention = (username) => {
    const newText = commentText.replace(/@(\w*)$/, '@' + username + ' ');
    setCommentText(newText);
    setMentionQuery(null);
    setMentionResults([]);
    inputRef.current?.focus();
  };

  // Real-time listener — separated into top-level + reply map
  useEffect(() => {
    if (!visible || !video?.id) return;
    setLoading(true);
    // No orderBy in the query — avoids requiring a composite Firestore index.
    // We sort in memory instead (small dataset per video, negligible cost).
    const q = query(
      collection(db, 'comments'),
      where('videoId', '==', video.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => !c.deleted)
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0) * 1000;
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0) * 1000;
          return ta - tb; // ascending — oldest first
        });
      // A reply has parentId = string (comment ID). Top-level has parentId = null or undefined.
      const topLevel = all.filter(c => !c.parentId).reverse();
      const replyMap = {};
      all.filter(c => c.parentId && typeof c.parentId === 'string').forEach(r => {
        if (!replyMap[r.parentId]) replyMap[r.parentId] = [];
        replyMap[r.parentId].push(r);
      });
      setAllComments(topLevel);
      setReplies(replyMap);
      setLoading(false);
    });
    return () => unsub();
  }, [visible, video?.id]);

  const handleReply = ({ parentId, username }) => {
    const target = { parentId, username };
    replyTargetRef.current = target;
    setReplyTarget(target);
    setCommentText('@' + username + ' ');
  };

  const handleSend = async () => {
    const body = commentText.trim();
    if (!body || !user?.uid || !video?.id) return;
    // Capture BOTH state and ref at function entry — whichever is non-null wins
    // This double-capture makes the closure immune to async timing issues
    const capturedState = replyTarget;                // state value at call time
    const capturedRef   = replyTargetRef.current;     // ref value at call time
    const currentReplyTarget = capturedState || capturedRef;
    replyTargetRef.current = null;
    setReplyTarget(null);
    setCommentText('');

    // Extract @mentions and #hashtags for indexing + notifications
    const mentions  = (body.match(/@(\w+)/g) || []).map(m => m.slice(1));
    const hashtags  = (body.match(/#(\w+)/g) || []).map(h => h.slice(1).toLowerCase());

    try {
      await addDoc(collection(db, 'comments'), {
        videoId:              video.id,
        userId:               user.uid,
        username:             userProfile?.username || 'Player',
        avatar:               userProfile?.avatar || '',
        accountType:          userProfile?.accountType || 'gamer',
        plan:                 userProfile?.plan || 'free',
        equippedFrame:        userProfile?.equippedFrame || 'none',
        equippedCommentFrame: userProfile?.equippedCommentFrame || 'none',
        isChampion:           userProfile?.isChampion || false,
        isCurrentLeader:      userProfile?.isCurrentLeader || false,
        streakLevel:          userProfile?.streakLevel || 'noob',
        text:    body,
        likes:   0,
        likedBy: [],
        mentions,
        hashtags,
        parentId:  currentReplyTarget?.parentId || null,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'videos', video.id), { commentsCount: increment(1) });

      // Notify video owner
      if (!currentReplyTarget && video.userId && video.userId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: video.userId, type: 'comment',
          fromUserId: user.uid, fromUsername: userProfile?.username || 'Someone',
          text: 'commented: "' + body.slice(0, 50) + '"',
          videoId: video.id, read: false, createdAt: serverTimestamp(),
        });
      }
      // Notify parent comment author on reply
      if (currentReplyTarget?.parentId) {
        try {
          const parentSnap = await getDoc(doc(db, 'comments', currentReplyTarget.parentId));
          if (parentSnap.exists()) {
            const ownerId = parentSnap.data().userId;
            if (ownerId && ownerId !== user.uid) {
              await addDoc(collection(db, 'notifications'), {
                userId: ownerId, type: 'reply',
                fromUserId: user.uid, fromUsername: userProfile?.username || 'Someone',
                text: 'replied to your comment: "' + body.slice(0, 40) + '"',
                videoId: video.id, read: false, createdAt: serverTimestamp(),
              });
            }
          }
        } catch (e) {}
      }

      // ── Notify mentioned users (@username) ──────────────────────────────────
      // For each @mention, find the user (from our followers/following cache first,
      // fall back to a username lookup) and send them a notification.
      if (mentions.length > 0) {
        for (const mentionedName of [...new Set(mentions)]) {
          try {
            // Try the cached followers/following list first (fast, no query)
            let target = mentionUsers.find(u => u.username.toLowerCase() === mentionedName.toLowerCase());
            // Fall back to a username lookup if not in cache
            if (!target) {
              const lookupSnap = await getDocs(
                query(collection(db, 'users'), where('username', '==', mentionedName))
              );
              if (!lookupSnap.empty) {
                target = { uid: lookupSnap.docs[0].id };
              }
            }
            if (target?.uid && target.uid !== user.uid) {
              await addDoc(collection(db, 'notifications'), {
                userId: target.uid, type: 'mention',
                fromUserId: user.uid, fromUsername: userProfile?.username || 'Someone',
                text: 'mentioned you in a comment: "' + body.slice(0, 40) + '"',
                videoId: video.id, read: false, createdAt: serverTimestamp(),
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      await logError(LOG_CONTEXT.COMMENT_FAIL, e, user?.uid);
    }
  };

  const totalCount = allComments.length + Object.values(replies).reduce((s,r) => s + r.length, 0);
  const remaining  = MAX - commentText.length;

  if (!video) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={sheetS.backdrop} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={sheetS.sheetWrap}>
        <View style={sheetS.sheet}>
          <View style={sheetS.handle} />
          <View style={sheetS.tabRow}>
            <Ionicons name="chatbubble-outline" size={14} color={COLORS.gold} />
            <Text style={sheetS.tabText}> {totalCount} Comments</Text>
          </View>
          <ScrollView style={sheetS.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8 }}>
            {loading ? (
              <ActivityIndicator color={COLORS.gold} size="large" style={{ marginTop: 40 }} />
            ) : allComments.length === 0 ? (
              <Text style={sheetS.emptyText}>No comments yet. Be the first! 👇</Text>
            ) : allComments.map((c) => (
              <SheetCommentItem
                key={c.id}
                comment={c}
                replies={replies[c.id] || []}
                onReply={handleReply}
                currentUserId={user?.uid}
              />
            ))}
          </ScrollView>
          {/* @mention autocomplete dropdown — followers + following */}
          {mentionQuery !== null && mentionResults.length > 0 && (
            <View style={{ maxHeight: 180, backgroundColor: COLORS.card, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 }}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {mentionResults.map((u) => (
                  <TouchableOpacity
                    key={u.uid}
                    onPress={() => handleSelectMention(u.username)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}
                  >
                    <FramedAvatar user={u} size={28} />
                    <Text style={{ fontSize: 13, color: COLORS.white, fontWeight: '700', marginLeft: 10 }}>{u.username}</Text>
                    {u.accountType === 'gameconic' && <Text style={{ fontSize: 9, color: COLORS.red, marginLeft: 6, fontWeight: '800' }}>GAMECONIC</Text>}
                    {u.accountType === 'creator' && <Text style={{ fontSize: 9, color: COLORS.blue, marginLeft: 6, fontWeight: '800' }}>CREATOR</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {replyTarget && (
            <View style={sheetS.replyBar}>
              <Ionicons name="return-down-forward" size={14} color={COLORS.blue} />
              <Text style={sheetS.replyBarText}> Replying to @{replyTarget.username}</Text>
              <TouchableOpacity onPress={() => { replyTargetRef.current = null; setReplyTarget(null); setCommentText(''); }} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close-circle" size={18} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
          )}
          <View style={sheetS.inputRow}>
            <FramedAvatar user={userProfile} size={28} />
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <TextInput
                ref={inputRef}
                value={commentText}
                onChangeText={handleTextChange}
                placeholder={replyTarget ? `Reply to @${replyTarget.username}...` : 'Add a comment... Use @ and #'}
                placeholderTextColor={COLORS.gray}
                style={sheetS.input}
                autoFocus
                maxLength={MAX}
                multiline
              />
              {commentText.length > 100 && (
                <Text style={{ fontSize: 10, color: remaining < 20 ? COLORS.red : COLORS.gray, textAlign: 'right', marginTop: 2 }}>{remaining}</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={handleSend}
              style={[sheetS.sendBtn, !commentText.trim() && { opacity: 0.4 }]}
              disabled={!commentText.trim()}
            >
              <Ionicons name="send" size={15} color={COLORS.black} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── SheetCommentItem — renders one comment bubble in the bottom sheet ─────────
// Supports 1-level replies, @mention highlight (blue), #hashtag highlight (gold),
// like with optimistic update, and "View X replies" expand/collapse.

function SheetCommentItem({ comment, replies = [], onReply, currentUserId, isReply = false }) {
  const [liked, setLiked]         = useState(!!(comment.likedBy || []).includes(currentUserId));
  const [likeCount, setLikeCount] = useState(comment.likes || 0);
  const [showReplies, setShowReplies] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [editText, setEditText]   = useState(comment.text || '');
  const [deleted, setDeleted]     = useState(false);
  // liveUser fetches the commenter's CURRENT profile (live frame, plan, etc.)
  // so equipped frames update in real-time, not frozen at comment-creation time.
  const [liveUser, setLiveUser]   = useState(comment);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!comment.userId) return;
    const unsub = onSnapshot(doc(db, 'users', comment.userId), (snap) => {
      if (snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
    }, () => {
      getDoc(doc(db, 'users', comment.userId)).then(snap => {
        if (snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
      }).catch(() => {});
    });
    return () => unsub();
  }, [comment.userId]);

  const isOwn   = comment.userId === currentUserId;
  const ADMINS  = ['admin@gamingactions.com', 'pdiop08@outlook.fr', 'free08man@gmail.com'];

  const handleLongPress = () => {
    if (!isOwn) {
      // Not own comment → Report only (via showAlert to work inside Modal on iOS)
      showAlert({
        title: 'Report Comment?',
        message: '',
        type: 'warning',
        buttons: [
          { text: 'Report', style: 'destructive', onPress: () => {
            globalNavigate('Report', { target: { ...comment, id: comment.id }, targetType: 'comment' });
          }},
          { text: 'Cancel', style: 'cancel' },
        ],
      });
      return;
    }
    // Own comment → Edit + Delete via showAlert (works reliably inside Modal on iOS)
    showAlert({
      title: 'Comment Options',
      message: '',
      type: 'info',
      buttons: [
        { text: '✏️ Edit', onPress: () => { setEditText(comment.text); setEditing(true); } },
        { text: '🗑️ Delete', style: 'destructive', onPress: () => {
          showAlert({
            title: 'Delete Comment?',
            message: 'This cannot be undone.',
            type: 'danger',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => {
                try {
                  await deleteDoc(doc(db, 'comments', comment.id));
                  if (comment.videoId) await updateDoc(doc(db, 'videos', comment.videoId), { commentsCount: increment(-1) });
                  setDeleted(true);
                } catch (e) {}
              }},
            ],
          });
        }},
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const handleSaveEdit = async () => {
    const newText = editText.trim().slice(0, 150);
    if (!newText) return;
    try {
      await updateDoc(doc(db, 'comments', comment.id), { text: newText, edited: true });
      setEditing(false);
    } catch (e) {}
  };

  useEffect(() => {
    setLiked(!!(comment.likedBy || []).includes(currentUserId));
    setLikeCount(comment.likes || 0);
  }, [comment.likedBy, comment.likes]);

  if (deleted) return null;

  const handleLike = async () => {
    if (!currentUserId) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.3, useNativeDriver: true, speed: 60 }),
      Animated.spring(scaleAnim, { toValue: 1,   useNativeDriver: true, speed: 30 }),
    ]).start();
    try {
      await updateDoc(doc(db, 'comments', comment.id), {
        likes:   increment(newLiked ? 1 : -1),
        likedBy: newLiked ? arrayUnion(currentUserId) : arrayRemove(currentUserId),
      });
    } catch (e) {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    }
  };

  const _baseNameColor2 = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'board' ? '#00E676'
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.plan === 'legendary'      ? COLORS.gold
    : COLORS.white;
  const _ueItem2  = USERNAME_EFFECTS?.find(e => e.id === liveUser?.equippedUsernameEffect);
  const nameColor = _ueItem2 ? (_ueItem2.color || _ueItem2.colors?.[0] || _baseNameColor2) : _baseNameColor2;
  const nameGlow2 = _ueItem2?.glow || false;

  // Frame styling — uses liveUser so equipped frames show in real-time
  const cf = commentFrameStyle(liveUser);
  const hasBorder = cf && cf.id !== 'none';
  const borderColor = hasBorder ? cf.color : 'transparent';
  const isChampionFrame = cf?.id === 'cf_champion';

  // Animated pulsing border for animated comment frames
  const cfPulse2 = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    if (!cf?.animated || !cf?.glow) { cfPulse2.setValue(0.65); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(cfPulse2, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      Animated.timing(cfPulse2, { toValue: 0.3, duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [cf?.id]);

  // Reflet (sweep) + boules pulsantes — identique au shop
  const cfSweep2 = React.useRef(new Animated.Value(0)).current;
  const cfSpark2 = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!cf?.shimmer && !cf?.animated) { cfSweep2.setValue(0); cfSpark2.setValue(0); return; }
    const sweepA = Animated.loop(Animated.timing(cfSweep2, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    const sparkA = Animated.loop(Animated.sequence([
      Animated.timing(cfSpark2, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(cfSpark2, { toValue: 0, duration: 480, useNativeDriver: true }),
    ]));
    sweepA.start(); sparkA.start();
    return () => { sweepA.stop(); sparkA.stop(); };
  }, [cf?.id]);
  const cfSweep2Tx   = cfSweep2.interpolate({ inputRange: [0, 1], outputRange: [-50, 360] });
  const cfSweep2Opac = cfSweep2.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 0.7, 0.25, 0] });
  const cfDot2Scale  = cfSpark2.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.6] });
  const cfDot2Opac   = cfSpark2.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  // Render text with @mention (blue) and #hashtag (gold) highlights
  const renderRichText = (text) => {
    if (!text) return null;
    const parts = text.split(/(@\w+|#\w+)/g);
    return (
      <Text style={sheetS.commentText}>
        {parts.map((part, i) => {
          if (part.startsWith('@')) return <Text key={i} style={{ color: COLORS.blue, fontWeight: '700' }}>{part}</Text>;
          if (part.startsWith('#')) return <Text key={i} style={{ color: COLORS.gold, fontWeight: '700' }}>{part}</Text>;
          return <Text key={i}>{part}</Text>;
        })}
      </Text>
    );
  };

  return (
    <View>
      {isReply ? (
        // ── Reply bubble: minimal — indented, smaller text, no avatar/border/frame ──
        <View style={[sheetS.replyCard, { marginLeft: 52, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: COLORS.gray3 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: nameColor, textShadowColor: nameGlow2 ? nameColor : 'transparent', textShadowRadius: nameGlow2 ? 5 : 0, textShadowOffset: { width: 0, height: 0 } }}>{comment.username}</Text>
            <Text style={{ fontSize: 9, color: COLORS.gray }}> · {fmtFeedTime(comment.createdAt)}</Text>
          </View>
          {/* Limit reply text to 2 lines — tap to open full sheet */}
          <Text style={{ fontSize: 12, color: COLORS.white, lineHeight: 17 }} numberOfLines={2}>
            {(comment.text || '').split(/(@\w+|#\w+)/g).map((part, i) => {
              if (part.startsWith('@')) return <Text key={i} style={{ color: COLORS.blue, fontWeight: '600' }}>{part}</Text>;
              if (part.startsWith('#')) return <Text key={i} style={{ color: COLORS.gold, fontWeight: '600' }}>{part}</Text>;
              return <Text key={i}>{part}</Text>;
            })}
          </Text>
          <TouchableOpacity onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={11} color={liked ? COLORS.red : COLORS.gray} />
            </Animated.View>
            {likeCount > 0 && <Text style={{ fontSize: 9, color: liked ? COLORS.red : COLORS.gray, marginLeft: 3 }}>{likeCount}</Text>}
          </TouchableOpacity>
        </View>
      ) : (
      // ── Top-level comment: long press → edit/delete ──────────────────────────
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={[
          sheetS.commentCard,
          hasBorder && { borderColor, borderWidth: 1.5 },
          isChampionFrame && { borderColor: '#E8C96B', borderWidth: 2 },
        ]}
      >
        {/* Animated glow border for animated comment frames */}
        {hasBorder && !isChampionFrame && cf.glow && (
          cf.animated ? (
            <Animated.View style={[StyleSheet.absoluteFill, {
              borderRadius: 12, borderWidth: 2, borderColor,
              shadowColor: borderColor, shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1, shadowRadius: 14,
              opacity: cfPulse2,
            }]} pointerEvents="none" />
          ) : (
            <View style={[StyleSheet.absoluteFill, {
              borderRadius: 12, borderWidth: 1.5, borderColor,
              shadowColor: borderColor, shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6, shadowRadius: 5,
            }]} pointerEvents="none" />
          )
        )}
        {hasBorder && !isChampionFrame && (cf.shimmer || cf.animated) && (
          <>
            <View style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]} pointerEvents="none">
              <Animated.View style={{
                position: 'absolute', top: -24, bottom: -24, width: 38,
                backgroundColor: borderColor, opacity: cfSweep2Opac,
                transform: [{ translateX: cfSweep2Tx }, { skewX: '-18deg' }],
              }} />
            </View>
            <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 5, right: 6, width: 5, height: 5, borderRadius: 2.5, backgroundColor: borderColor, opacity: cfDot2Opac, transform: [{ scale: cfDot2Scale }] }} />
            <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 5, right: 7, width: 4, height: 4, borderRadius: 2, backgroundColor: borderColor, opacity: cfDot2Opac, transform: [{ scale: cfDot2Scale }] }} />
          </>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <TouchableOpacity onPress={() => comment.userId && globalNavigate('UserProfile', { userId: comment.userId })} activeOpacity={0.7}>
            <FramedAvatar user={liveUser} size={28} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={[sheetS.commentUser, { color: nameColor, textShadowColor: nameGlow2 ? nameColor : 'transparent', textShadowRadius: nameGlow2 ? 6 : 0, textShadowOffset: { width: 0, height: 0 } }]}>{liveUser?.username || comment.username}</Text>
              {(() => {
                const excl = ['creator','gameconic'];
                if (liveUser?.isChampion && !excl.includes(liveUser?.accountType)) return <ChampionBadge small />;
                if (liveUser?.isCurrentLeader && !excl.includes(liveUser?.accountType)) return <LeaderBadge small />;
                return null;
              })()}
              <Text style={sheetS.commentTime}> · {fmtFeedTime(comment.createdAt)}</Text>
            </View>
            {editing ? (
              <View style={{ marginTop: 4 }}>
                <TextInput
                  value={editText}
                  onChangeText={t => setEditText(t.slice(0, 150))}
                  style={{ backgroundColor: COLORS.dark, borderRadius: 8, padding: 8, color: COLORS.white, fontSize: 13 }}
                  multiline maxLength={150} autoFocus
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, gap: 8 }}>
                  <TouchableOpacity onPress={() => setEditing(false)} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ color: COLORS.gray, fontSize: 12 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveEdit} style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: COLORS.gold, borderRadius: 16 }}>
                    <Text style={{ color: COLORS.black, fontSize: 12, fontWeight: '800' }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : renderRichText(comment.text)}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
              {!isReply && (
                <TouchableOpacity
                  onPress={() => onReply({ parentId: comment.id, username: comment.username })}
                  style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}
                >
                  <Ionicons name="chatbubble-outline" size={12} color={COLORS.gray} />
                  <Text style={{ fontSize: 11, color: COLORS.gray, marginLeft: 4, fontWeight: '600' }}>
                    Reply{replies.length > 0 ? ` · ${replies.length}` : ''}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={13} color={liked ? COLORS.red : COLORS.gray} />
                </Animated.View>
                {likeCount > 0 && <Text style={{ fontSize: 11, color: liked ? COLORS.red : COLORS.gray, marginLeft: 3 }}>{likeCount}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
      )}

      {/* Expand/collapse replies */}
      {!isReply && replies.length > 0 && (
        <TouchableOpacity onPress={() => setShowReplies(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 44, paddingVertical: 4, marginBottom: 4, gap: 6 }}>
          <View style={{ width: 20, height: 1, backgroundColor: COLORS.gray3 }} />
          <Text style={{ fontSize: 11, color: COLORS.blue, fontWeight: '700' }}>
            {showReplies ? 'Hide replies' : `View ${replies.length} repl${replies.length > 1 ? 'ies' : 'y'}`}
          </Text>
          <Ionicons name={showReplies ? 'chevron-up' : 'chevron-down'} size={11} color={COLORS.blue} />
        </TouchableOpacity>
      )}

      {/* Inline replies */}
      {!isReply && showReplies && replies.map(r => (
        <View key={r.id} style={{ marginBottom: 4 }}>
          <SheetCommentItem comment={r} replies={[]} onReply={onReply} currentUserId={currentUserId} isReply={true} />
        </View>
      ))}
    </View>
  );
}

function fmtFeedTime(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

// Affiche les 2 derniers commentaires directement dans le feed

const sheetS = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap:   { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet:       { backgroundColor: COLORS.dark, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 12, maxHeight: SH - TAB_BAR_HEIGHT },
  handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.gray2, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  tabRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  tabText:     { fontSize: 13, color: COLORS.gold, fontWeight: '700' },
  list:        { maxHeight: SH - TAB_BAR_HEIGHT - 180, paddingHorizontal: 12 }, // 180 = handle + header + input bar
  emptyText:   { fontSize: 14, color: COLORS.gray, textAlign: 'center', marginTop: 30, marginBottom: 20 },
  commentCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 11, marginBottom: 6, borderWidth: 1, borderColor: 'transparent' },
  replyCard:   { backgroundColor: COLORS.dark, marginBottom: 4 },
  commentUser: { fontSize: 12, fontWeight: '800', color: COLORS.gold },
  commentTime: { fontSize: 10, color: COLORS.gray },
  commentText: { fontSize: 13, color: COLORS.white, lineHeight: 18, marginTop: 3 },
  replyBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.card, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  replyBarText:{ fontSize: 12, color: COLORS.blue, fontWeight: '600' },
  inputRow:    { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  input:       { backgroundColor: COLORS.card, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.white, maxHeight: 80 },
  sendBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
});


export default CommentsSheet;
export { CommentBubble, SheetCommentItem };

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, ScrollView, TextInput, Alert,
  Platform, Animated, Modal, Image,
  TouchableWithoutFeedback, KeyboardAvoidingView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import useFeedStore from '../../store/useFeedStore';
import useAuthStore from '../../store/useAuthStore';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { globalNavigate } from '../../utils/navigationRef';
import { recordView } from '../../utils/feedAlgo';
import { CONSOLES, GENRES } from '../../constants/data';
import { GAMES } from '../../constants/games';
import useUserStore from '../../store/useUserStore';
import { collection, query, where, orderBy, onSnapshot, getDoc, getDocs, doc, updateDoc, deleteDoc, increment, arrayUnion, arrayRemove, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { optimizeVideoUrl } from '../../config/cloudinary';
import ConsoleIcon from '../../components/ConsoleIcon';
import { ringColorForUser, glowColorForUser, getFrameById, getVideoFrameById, commentFrameStyle } from '../../constants/frames';
import { ElectricBorder, ChampionBadge, LeaderBadge } from '../../components/ElectricEffect';
import FramedAvatar from '../../components/FramedAvatar';


const { width: SW, height: SH } = Dimensions.get('window');
// Tab bar height (matches MainNavigator CustomTabBar)
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;
const HEADER_H = Platform.OS === 'ios' ? 110 : 90;
// CRITICAL: subtract tab bar height so the feed card never goes under the navbar.
// iOS Pro Max (932px): 932 - 110 - 80 = 742px card
// iPhone Pro (852px):  852 - 110 - 80 = 662px card
// iPhone SE (667px):   667 - 110 - 80 = 477px card
const CARD_HEIGHT = SH - HEADER_H - TAB_BAR_HEIGHT;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function timeAgo(date) {
  if (!date) return '';
  const d = date?.toDate ? date.toDate() : new Date(date);
  const diff = Math.floor((new Date() - d) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function GGButton({ hasGG, count, onPress, onShowList, disabled = false }) {
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.15, useNativeDriver: true, speed: 60, bounciness: 20 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    if (!hasGG) {
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
    }
    onPress();
  };
  return (
    <View style={ggS.wrapper}>
      <TouchableOpacity onPress={disabled ? null : handlePress} activeOpacity={disabled ? 1 : 0.85} style={[ggS.btnWrap, disabled && { opacity: 0.4 }]}>
        <Animated.View style={[ggS.glowBurst, { opacity: glowOpacity }]} />
        <Animated.View style={[ggS.btn, { transform: [{ scale }] }, hasGG ? ggS.btnFilled : ggS.btnOutline]}>
          <Text style={[ggS.text, { color: hasGG ? COLORS.black : COLORS.gold }]}>GG</Text>
        </Animated.View>
      </TouchableOpacity>
      <TouchableOpacity onPress={count > 0 ? onShowList : null} activeOpacity={count > 0 ? 0.6 : 1}>
        <Text style={[ggS.count, { color: hasGG ? COLORS.gold : COLORS.gray }]}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count}{count > 0 ? ' ▾' : ''}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const ggS = StyleSheet.create({
  wrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  btnWrap: { alignItems: 'center', justifyContent: 'center' },
  glowBurst: { position: 'absolute', width: 80, height: 36, borderRadius: 18, backgroundColor: COLORS.gold },
  btn: { width: 68, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.gold },
  btnFilled: { backgroundColor: COLORS.gold, borderWidth: 1.5, borderColor: '#E8C96B' },
  text: { fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  count: { fontSize: 11, fontWeight: '700', marginTop: 4 },
});

// Modal listant les utilisateurs ayant donné un GG à une vidéo
function GGListModal({ visible, onClose, videoId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !videoId) return;
    setLoading(true);
    (async () => {
      try {
        const ggSnap = await getDocs(query(collection(db, 'ggs'), where('videoId', '==', videoId)));
        const userIds = ggSnap.docs.map(d => d.data().userId).filter(Boolean);
        const profiles = await Promise.all(userIds.slice(0, 100).map(async (uid) => {
          try {
            const s = await getDoc(doc(db, 'users', uid));
            return s.exists() ? { uid, ...s.data() } : null;
          } catch (e) { return null; }
        }));
        setUsers(profiles.filter(Boolean));
      } catch (e) {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, videoId]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      </TouchableWithoutFeedback>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.dark, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SH * 0.6, paddingBottom: Platform.OS === 'ios' ? 30 : 10 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.gray2, alignSelf: 'center', marginTop: 10, marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.gold }}>⭐ {users.length} GG{users.length > 1 ? 's' : ''}</Text>
        </View>
        {loading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: 30 }} />
        ) : (
          <ScrollView style={{ paddingHorizontal: 16 }} contentContainerStyle={{ paddingVertical: 10 }}>
            {users.length === 0 ? (
              <Text style={{ color: COLORS.gray, textAlign: 'center', marginTop: 20 }}>No GGs yet.</Text>
            ) : users.map((u) => (
              <View key={u.uid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                <FramedAvatar user={u} size={36} />
                <Text style={{ fontSize: 14, color: COLORS.white, fontWeight: '600', marginLeft: 12 }}>{u.username || 'Player'}</Text>
                {u.plan === 'legendary' && <View style={[cardS.legBadge, { marginLeft: 6 }]}><Text style={cardS.legBadgeText}>LEG</Text></View>}
                {u.accountType === 'gameconic' && <View style={[cardS.legBadge, { marginLeft: 6, backgroundColor: COLORS.red }]}><Text style={cardS.legBadgeText}>ICON</Text></View>}
                {u.accountType === 'creator' && <View style={[cardS.legBadge, { marginLeft: 6, backgroundColor: COLORS.blue }]}><Text style={[cardS.legBadgeText, { color: COLORS.dark }]}>CR</Text></View>}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

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
  const ADMIN_EMAILS_CB = ['admin@gamingactions.com', 'pdiop08@outlook.fr', 'free08man@gmail.com'];
  const isAdminUser = !!userProfile?.isAdmin || ADMIN_EMAILS_CB.includes(user?.email?.toLowerCase());
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
    let alive = true;
    if (comment.userId) {
      getDoc(doc(db, 'users', comment.userId)).then(snap => {
        if (alive && snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [comment.userId]);

  const isOwnComment = comment.userId === user?.uid;
  const canModerate = isOwnComment || isAdminUser;

  const handleLongPress = () => {
    if (!canModerate) {
      // Pas son commentaire → seulement report
      Alert.alert('Comment', '', [
        { text: 'Report', style: 'destructive', onPress: () => {
          globalNavigate('Report', { target: { ...comment, id: comment.id }, targetType: 'comment' });
        }},
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    const options = [];
    if (isOwnComment) {
      options.push({ text: '✏️ Edit', onPress: () => { setEditText(comment.text); setEditing(true); } });
    }
    options.push({ text: '🗑️ Delete', style: 'destructive', onPress: handleDelete });
    if (!isOwnComment) {
      options.push({ text: 'Report', onPress: () => { globalNavigate('Report', { target: { ...comment, id: comment.id }, targetType: 'comment' }); } });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Comment options', isAdminUser && !isOwnComment ? 'Admin moderation' : '', options);
  };

  const handleDelete = () => {
    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'comments', comment.id));
          if (comment.videoId) await updateDoc(doc(db, 'videos', comment.videoId), { commentsCount: increment(-1) });
          setDeleted(true);
        } catch (e) {}
      }},
    ]);
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

  const nameColor = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.plan === 'legendary' ? COLORS.gold
    : COLORS.gold;

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
      !compact && hasBorder && cf.glow && { shadowColor: borderColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 5 },
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <TouchableOpacity onPress={() => { if (comment.userId) globalNavigate('UserProfile', { userId: comment.userId }); }} activeOpacity={0.7}>
          <FramedAvatar user={liveUser} size={compact ? 24 : 28} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { if (comment.userId) globalNavigate('UserProfile', { userId: comment.userId }); }} activeOpacity={0.7}>
              <Text style={[sheetS.commentUser, { color: nameColor }, compact && { fontSize: 11 }]}>{liveUser?.username || comment.username}</Text>
            </TouchableOpacity>
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
    let alive = true;
    if (comment.userId) {
      getDoc(doc(db, 'users', comment.userId)).then(snap => {
        if (alive && snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [comment.userId]);

  const isOwn   = comment.userId === currentUserId;
  const ADMINS  = ['admin@gamingactions.com', 'pdiop08@outlook.fr', 'free08man@gmail.com'];

  const handleLongPress = () => {
    const options = [];
    if (isOwn) {
      options.push({ text: '✏️ Edit', onPress: () => { setEditText(comment.text); setEditing(true); } });
    }
    options.push({
      text: '🗑️ Delete', style: 'destructive', onPress: () => {
        Alert.alert('Delete comment?', 'This cannot be undone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteDoc(doc(db, 'comments', comment.id));
              if (comment.videoId) await updateDoc(doc(db, 'videos', comment.videoId), { commentsCount: increment(-1) });
              setDeleted(true);
            } catch (e) {}
          }},
        ]);
      }
    });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Comment', isOwn ? '' : 'Report this comment?', options);
  };

  const handleSaveEdit = async () => {
    const newText = editText.trim().slice(0, 150);
    if (!newText) return;
    try {
      await updateDoc(doc(db, 'comments', comment.id), { text: newText, edited: true });
      setEditing(false);
    } catch (e) {}
  };

  if (deleted) return null;

  useEffect(() => {
    setLiked(!!(comment.likedBy || []).includes(currentUserId));
    setLikeCount(comment.likes || 0);
  }, [comment.likedBy, comment.likes]);

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

  const nameColor = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.plan === 'legendary'      ? COLORS.gold
    : COLORS.white;

  // Frame styling — uses liveUser so equipped frames show in real-time
  const cf = commentFrameStyle(liveUser);
  const hasBorder = cf && cf.id !== 'none';
  const borderColor = hasBorder ? cf.color : 'transparent';
  const isChampionFrame = cf?.id === 'cf_champion';

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
            <Text style={{ fontSize: 10, fontWeight: '800', color: nameColor }}>{comment.username}</Text>
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
          hasBorder && cf.glow && { shadowColor: borderColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 5 },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <TouchableOpacity onPress={() => comment.userId && globalNavigate('UserProfile', { userId: comment.userId })} activeOpacity={0.7}>
            <FramedAvatar user={liveUser} size={28} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={[sheetS.commentUser, { color: nameColor }]}>{liveUser?.username || comment.username}</Text>
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

function FilterModal({ visible, onClose, onApply }) {
  const [selConsole, setSelConsole] = useState(null);
  const [selGenre, setSelGenre] = useState(null);
  const [selGame, setSelGame] = useState(null);
  const [gameSearch, setGameSearch] = useState('');

  const filteredGames = gameSearch.length > 0
    ? GAMES.filter(g => g.name.toLowerCase().includes(gameSearch.toLowerCase())).slice(0, 30)
    : GAMES.slice(0, 30);

  const handleClear = () => {
    setSelConsole(null);
    setSelGenre(null);
    setSelGame(null);
    setGameSearch('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={fS.overlay}>
          <TouchableWithoutFeedback>
            <View style={fS.sheet}>
              <Text style={fS.title}>Filter Feed</Text>

              {/* CONSOLE */}
              <Text style={fS.sectionLabel}>CONSOLE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {[{ id: null, label: 'All', icon: '🎮' }, ...CONSOLES].map((c) => (
                  <TouchableOpacity
                    key={String(c.id)}
                    onPress={() => setSelConsole(c.id)}
                    style={[fS.chip, selConsole === c.id && fS.chipActive]}
                  >
                    <ConsoleIcon id={c.id} size={14} style={{ marginRight: 4 }} />
                    <Text style={[fS.chipText, selConsole === c.id && fS.chipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* GENRE */}
              <Text style={fS.sectionLabel}>GENRE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {[{ id: null, label: 'All' }, ...GENRES].map((g) => (
                  <TouchableOpacity
                    key={String(g.id)}
                    onPress={() => { setSelGenre(g.id); setSelGame(null); }}
                    style={[fS.chip, selGenre === g.id && fS.chipActive]}
                  >
                    <Text style={[fS.chipText, selGenre === g.id && fS.chipTextActive]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* GAME */}
              <Text style={fS.sectionLabel}>SPECIFIC GAME</Text>
              <View style={fS.ddSearch}>
                <Ionicons name="search-outline" size={14} color={COLORS.gray} />
                <TextInput
                  value={gameSearch}
                  onChangeText={setGameSearch}
                  placeholder="Search a game..."
                  placeholderTextColor={COLORS.gray}
                  style={{ flex: 1, color: COLORS.white, fontSize: 13, marginLeft: 8, paddingVertical: 6 }}
                />
                {gameSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setGameSearch('')}>
                    <Ionicons name="close-circle" size={14} color={COLORS.gray} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => setSelGame(null)}
                  style={[fS.chip, selGame === null && fS.chipActive]}
                >
                  <Text style={[fS.chipText, selGame === null && fS.chipTextActive]}>All</Text>
                </TouchableOpacity>
                {filteredGames.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setSelGame(g.name)}
                    style={[fS.chip, selGame === g.name && fS.chipActive]}
                  >
                    <Text style={[fS.chipText, selGame === g.name && fS.chipTextActive]}>{g.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={fS.btnRow}>
                <TouchableOpacity onPress={handleClear} style={fS.clearBtn}>
                  <Text style={fS.clearText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onApply(selConsole, selGenre, selGame)} style={fS.applyBtn}>
                  <Text style={fS.applyText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const fS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-start' },
  sheet: { backgroundColor: '#141420', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, padding: 20, paddingBottom: 30, paddingTop: 60, maxHeight: SH * 0.85 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.gray2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.white, marginBottom: 16 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '600', letterSpacing: 1, marginBottom: 8 },
  ddSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 10, borderWidth: 0.5, borderColor: COLORS.gray3 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8 },
  chipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  chipEmoji: { fontSize: 12, marginRight: 4 },
  chipText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  chipTextActive: { color: COLORS.gold, fontWeight: '700' },
  btnRow: { flexDirection: 'row' },
  clearBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, alignItems: 'center', marginRight: 8 },
  clearText: { fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  applyBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.gold, alignItems: 'center' },
  applyText: { fontSize: 13, color: COLORS.black, fontWeight: '800' },
});


function fmtFeedTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

// Affiche les 2 derniers commentaires directement dans le feed
function PreviewComments({ videoId, isActive, onOpenSheet }) {
  const { getVideoComments, fetchComments } = useFeedStore();
  const comments = getVideoComments(videoId);
  const [loadingPreview, setLoadingPreview] = useState(true);

  useEffect(() => {
    if (isActive && videoId) {
      setLoadingPreview(true);
      const unsub = fetchComments(videoId);
      // Mark loaded after a short delay — fetchComments is a listener, not a promise
      const t = setTimeout(() => setLoadingPreview(false), 800);
      return () => { unsub && unsub(); clearTimeout(t); };
    }
  }, [isActive, videoId]);

  // Show top 2 top-level comments in preview (replies shown as count only)
  const topLevel = comments.filter(c => !c.parentId);
  const replyMap = {};
  comments.filter(c => c.parentId).forEach(r => {
    if (!replyMap[r.parentId]) replyMap[r.parentId] = [];
    replyMap[r.parentId].push(r);
  });

  // Show spinner while loading
  if (loadingPreview && comments.length === 0) {
    return <ActivityIndicator color={COLORS.gold} size="small" style={{ marginTop: 8, alignSelf: 'flex-start' }} />;
  }

  if (topLevel.length === 0) {
    return (
      <TouchableOpacity onPress={onOpenSheet} style={{ paddingVertical: 4 }}>
        <Text style={{ fontSize: 11, color: COLORS.gray }}>No comments yet. Be the first 👇</Text>
      </TouchableOpacity>
    );
  }

  // Sort by likes (most liked first), take top 2 for the preview.
  const preview = [...topLevel]
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 2);

  return (
    <View>
      <Text style={{ fontSize: 10, color: COLORS.gray2, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>
        Most liked
      </Text>
      {preview.map((c) => {
        const replyCount = (replyMap[c.id] || []).length;
        return (
          <View key={c.id}>
            <CommentBubble
              comment={c}
              onReply={() => onOpenSheet()}
              compact
            />
            {replyCount > 0 && (
              <TouchableOpacity onPress={onOpenSheet} style={{ paddingLeft: 36, marginTop: -4, marginBottom: 6 }}>
                <Text style={{ fontSize: 10, color: COLORS.blue, fontWeight: '700' }}>
                  ↳ {replyCount} repl{replyCount > 1 ? 'ies' : 'y'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

function VideoCardInner({ item, onNavigateProfile, navigation, userProfile, isActive, shouldLoad = true }) {
  const { toggleGG, incrementView } = useFeedStore();
  const { user } = useAuthStore();
  const { toggleFollow, isFollowing } = useUserStore();
  const [showComments, setShowComments] = useState(false);
  const [showGGList, setShowGGList] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isLegendary = item.plan === 'legendary';
  const ADMIN_EMAILS = ['admin@gamingactions.com', 'pdiop08@outlook.fr', 'free08man@gmail.com'];
  const isAdminInFeed = !!userProfile?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase());

  const handleAdminAction = async () => {
    const opts = [];
    if (!item.restricted) {
      opts.push({ text: '🚫 Hide (monitoring)', onPress: () => promptAdminAction('hide') });
      opts.push({ text: '⛔ Ban (content removed)', onPress: () => promptAdminAction('ban') });
    } else {
      opts.push({ text: '✅ Unhide', onPress: () => promptAdminAction('unhide') });
    }
    opts.push({ text: 'View in Admin', onPress: () => navigation.navigate('Admin', { openVideo: item }) });
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Admin Actions', `Video by ${item.username}`, opts);
  };

  const promptAdminAction = (action) => {
    const reasons = action === 'hide'
      ? ['Suspicious content', 'Under review', 'Copyright issue', 'Spam', 'Other']
      : ['Pornographic content', 'Graphic violence', 'Hate speech', 'Harassment', 'Illegal content', 'Other'];
    Alert.alert(
      action === 'hide' ? '🚫 Hide Video' : action === 'ban' ? '⛔ Ban Video' : '✅ Unhide Video',
      action === 'unhide' ? 'Restore this video?' : 'Select reason:',
      action === 'unhide'
        ? [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Unhide', onPress: async () => {
              try {
                const { updateDoc, doc } = await import('firebase/firestore');
                const { db: fdb } = await import('../../config/firebase');
                await updateDoc(doc(fdb, 'videos', item.id), { restricted: false, banned: false });
                Alert.alert('✅ Video restored');
              } catch(e) { Alert.alert('Error', e.message); }
            }},
          ]
        : [
            ...reasons.map(r => ({ text: r, onPress: () => applyAdminAction(action, r) })),
            { text: 'Cancel', style: 'cancel' },
          ]
    );
  };

  const applyAdminAction = async (action, reason) => {
    try {
      const { updateDoc, doc, serverTimestamp, addDoc, collection, increment } = await import('firebase/firestore');
      const { db: fdb } = await import('../../config/firebase');
      if (action === 'hide') {
        await updateDoc(doc(fdb, 'videos', item.id), {
          restricted: true, restrictedAt: serverTimestamp(),
          restrictedReason: reason, restrictedBy: 'admin',
        });
        Alert.alert('🚫 Video hidden', `Reason: ${reason}`);
      } else if (action === 'ban') {
        await updateDoc(doc(fdb, 'videos', item.id), {
          restricted: true, banned: true,
          restrictedAt: serverTimestamp(), restrictedReason: reason, restrictedBy: 'admin',
        });
        // Strike au user
        const userRef = doc(fdb, 'users', item.userId);
        await updateDoc(userRef, { strikes: increment(1) });
        // Notif in-app au user
        await addDoc(collection(fdb, 'notifications'), {
          userId: item.userId, type: 'system', fromUserId: 'SYSTEM',
          fromUsername: 'Gaming Actions',
          text: `⛔ Your video "${item.title || 'Untitled'}" was removed for violating our Community Guidelines: ${reason}. Strike added to your account.`,
          read: false, createdAt: serverTimestamp(),
        });
        Alert.alert('⛔ Video banned', `Strike issued to ${item.username}`);
      }
    } catch(e) { Alert.alert('Error', e.message); }
  };
const isOwnVideo = item.userId === user?.uid;
  // Frame vidéo : chaque vidéo conserve la frame choisie à l'upload.
  const videoFrameId = item.videoFrame || 'none';
  const videoFrame = getVideoFrameById(videoFrameId);
  const isChampionFrame = videoFrameId === 'vf_champion' || (item.isChampion && item.isLegendaryFrame);
  const hasVideoFrame = (videoFrame && videoFrame.id !== 'none') || item.isLegendaryFrame || isChampionFrame;
  const videoFrameColor = isChampionFrame ? '#C9A84C' : (videoFrame && videoFrame.id !== 'none') ? videoFrame.color : '#C9A84C';
  // Compteur de commentaires réactif (suit le store, pas la copie figée de la carte)
  const liveCommentCount = useFeedStore(s => s.videos.find(v => v.id === item.id)?.commentCount ?? item.commentCount ?? 0);
  const liveViewCount = useFeedStore(s => s.videos.find(v => v.id === item.id)?.viewCount ?? item.viewCount ?? 0);

  // Player expo-video (en boucle ; lecture pilotée par isActive/isPaused plus bas)
  // shouldLoad gates the source — far-off clips get null (thumbnail only) to save memory.
  const player = useVideoPlayer(
    (shouldLoad && item.videoUrl) ? optimizeVideoUrl(item.videoUrl) : null,
    (p) => {
      p.loop = true;
      p.muted = false;
    }
  );

  // firstFrame = true dès que le premier frame est rendu → cache l'overlay ET l'icône native
  const [firstFrame, setFirstFrame] = useState(false);
  const videoLoading = !firstFrame;

  useFocusEffect(
    useCallback(() => {
      setIsPaused(false);
      return () => setIsPaused(true);
    }, [])
  );

  const VIDEO_H = Math.floor(SW / (16 / 9));
  const META_H = 72;
  const CREATOR_H = 52;
  const ACTIONS_H = 54;
  const PREVIEW_H = CARD_HEIGHT - VIDEO_H - META_H - CREATOR_H - ACTIONS_H;

  // Joue le clip actif, met en pause les autres (ou si l'utilisateur a tapé pause)
  useEffect(() => {
    const shouldPlay = isActive && !isPaused;
    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch (e) {}
  }, [isActive, isPaused]);

  // ── 5-second view tracking ──────────────────────────────────────────────────
  // A clip counts as "viewed" only after 5 continuous seconds active in the feed.
  // This both increments the Firestore viewCount (deduped per session) AND feeds
  // the recommendation algorithm (recordView updates genre/game preferences).
  // Fast scrolling past a clip in <5s does NOT count — keeps the algo accurate.
  const viewTimerRef = useRef(null);
  useEffect(() => {
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);

    if (isActive && item?.id) {
      viewTimerRef.current = setTimeout(async () => {
        incrementView(item.id, user?.uid);   // Firestore viewCount (session-deduped)
        await recordView(item);                // Local algo preference update
      }, 5000);
    }

    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    };
  }, [isActive, item?.id]);

  // Synchronise le mute
  useEffect(() => {
    try { player.muted = isMuted; } catch (e) {}
  }, [isMuted]);

  return (
    <View style={{ width: SW, height: CARD_HEIGHT, backgroundColor: COLORS.black }}>

      {/* CREATOR — en haut de la vidéo */}
      <View style={{ height: CREATOR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}>
        <FramedAvatar user={item.userId === user?.uid ? { ...item, ...userProfile } : item} size={32} onPress={onNavigateProfile} />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={cardS.creatorName}>{item.username}</Text>
            {isLegendary && <View style={cardS.legBadge}><Text style={cardS.legBadgeText}>LEG</Text></View>}
            {item.accountType === 'gameconic' && <View style={[cardS.legBadge, { backgroundColor: COLORS.red }]}><Text style={cardS.legBadgeText}>ICON</Text></View>}
            {item.accountType === 'creator' && <View style={[cardS.legBadge, { backgroundColor: COLORS.blue }]}><Text style={[cardS.legBadgeText, { color: COLORS.dark }]}>CR</Text></View>}
            {item.isChampion ? <ChampionBadge small /> : item.isCurrentLeader ? <LeaderBadge small /> : null}
          </View>
          {(() => {
            const sl = item.streakLevel;
            if (!sl || sl === 'noob') return null;
            if (item.hideStreakLevel) return null;
            const SL_COLORS = { bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', goat: '#FF2D55' };
            const c = SL_COLORS[sl] || COLORS.gray;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <View style={{ backgroundColor: c, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: '#1A1A2E', letterSpacing: 0.5 }}>{sl.toUpperCase()}</Text>
                </View>
              </View>
            );
          })()}
        </View>
        {item.userId !== user?.uid && (
          <TouchableOpacity
            onPress={() => toggleFollow(user?.uid, item.userId, userProfile?.username)}
            style={[cardS.followBtn, isFollowing(item.userId) && { borderColor: COLORS.gray3 }]}
          >
            <Text style={[cardS.followBtnText, isFollowing(item.userId) && { color: COLORS.gray }]}>
              {isFollowing(item.userId) ? 'Following' : '+ Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* VIDEO */}
      <View style={[
        { height: VIDEO_H, width: '100%', backgroundColor: '#060610', overflow: 'hidden' },
        hasVideoFrame && { borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderColor: videoFrameColor },
      ]}>
        {item.videoUrl ? (
          <>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
              onFirstFrameRender={() => setFirstFrame(true)}
            />
            {videoLoading && (
              <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#060610' }}>
                {(item.thumbnail || item.thumbnailUrl) ? (
                  // Sharp thumbnail (no blur) — looks like the video is already there.
                  // The transition to video is seamless when the first frame renders.
                  <Image source={{ uri: item.thumbnail || item.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
                {/* Spinner only shows when this clip is the active one being watched */}
                {isActive && <ActivityIndicator size="large" color={COLORS.gold} />}
              </View>
            )}
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="game-controller" size={60} color={COLORS.gold} style={{ opacity: 0.1 }} />
          </View>
        )}

        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsPaused(p => !p)}>
          {(!isActive || isPaused) && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play" size={28} color={COLORS.white} />
              </View>
            </View>
          )}
        </TouchableOpacity>

        <View style={{ position: 'absolute', bottom: 8, right: 8, flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => setIsMuted(m => !m)} style={cardS.controlBtn}>
            <Ionicons name={isMuted ? 'volume-mute' : 'volume-medium'} size={14} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('VideoPlayer', { video: item })} style={[cardS.controlBtn, { marginLeft: 6 }]}>
            <Ionicons name="expand" size={14} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {hasVideoFrame && !isChampionFrame && (
          <>
            <View style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderTopWidth: 2, borderLeftWidth: 2, borderColor: videoFrameColor }} />
            <View style={{ position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderTopWidth: 2, borderRightWidth: 2, borderColor: videoFrameColor }} />
            <View style={{ position: 'absolute', bottom: 6, left: 6, width: 14, height: 14, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: videoFrameColor }} />
            <View style={{ position: 'absolute', bottom: 6, right: 6, width: 14, height: 14, borderBottomWidth: 2, borderRightWidth: 2, borderColor: videoFrameColor }} />
          </>
        )}
        {isChampionFrame && (
          <ElectricBorder width={SW} height={VIDEO_H} radius={0} />
        )}
      </View>

      {/* META */}
      <View style={{ height: META_H, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="game-controller-outline" size={11} color={COLORS.gold} />
          <Text style={cardS.gameText} numberOfLines={1}> {item.game} · {item.console} · {item.genre?.toUpperCase()}</Text>
          <Text style={cardS.dot}> · </Text>
          <Text style={cardS.dateText}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text style={cardS.videoTitle} numberOfLines={1}>{item.title || item.caption || 'Untitled'}</Text>
        {(item.caption || item.title) && (
          <Text style={cardS.videoDesc} numberOfLines={2}>{item.title ? item.caption : "Share your best clips and get GG'd 🎯"}</Text>
        )}
      </View>

      {/* ACTIONS */}
      <View style={{ height: ACTIONS_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}>
        <GGButton
          hasGG={item.hasGG}
          count={item.ggCount || 0}
          onPress={() => toggleGG(item.id, user?.uid)}
          onShowList={() => setShowGGList(true)}
          disabled={item.userId === user?.uid}
        />
        {!isOwnVideo && (
          <TouchableOpacity onPress={() => navigation.navigate('Report', { target: item, targetType: 'video' })} style={cardS.actionItem}>
            <Ionicons name="flag-outline" size={18} color={COLORS.gray} />
          </TouchableOpacity>
        )}
        {isAdminInFeed && (
          <TouchableOpacity onPress={handleAdminAction} style={cardS.actionItem}>
            <Ionicons name="shield" size={18} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>

      {/* COMMENTS PREVIEW — gros bouton Comments en haut, 2 most-liked en dessous */}
      <View style={{ height: PREVIEW_H, backgroundColor: COLORS.dark, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 }}>
        {/* Gros bouton Comments — ouvre l'overlay, bien visible et touchable */}
        <TouchableOpacity
          onPress={() => setShowComments(true)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.gold} />
            <Text style={{ fontSize: 14, color: COLORS.white, fontWeight: '800', marginLeft: 8 }}>{liveCommentCount} Comments</Text>
            <Text style={{ fontSize: 11, color: COLORS.gray2, marginLeft: 10 }}>⭐ {item.ggCount >= 1000 ? `${(item.ggCount / 1000).toFixed(1)}K` : item.ggCount || 0}</Text>
            <Ionicons name="eye-outline" size={12} color={COLORS.gray2} style={{ marginLeft: 8 }} />
            <Text style={{ fontSize: 11, color: COLORS.gray2, marginLeft: 3 }}>{liveViewCount >= 1000 ? `${(liveViewCount / 1000).toFixed(1)}K` : liveViewCount}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, color: COLORS.black, fontWeight: '800' }}>Open</Text>
            <Ionicons name="chevron-up" size={13} color={COLORS.black} style={{ marginLeft: 3 }} />
          </View>
        </TouchableOpacity>
        {/* 2 most-liked comments — tap opens overlay */}
        <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 8 }}>
          <PreviewComments videoId={item.id} isActive={isActive} onOpenSheet={() => setShowComments(true)} />
        </View>
      </View>

      <CommentsSheet visible={showComments} video={item} onClose={() => setShowComments(false)} userProfile={userProfile} />
      <GGListModal visible={showGGList} videoId={item.id} onClose={() => setShowGGList(false)} />
    </View>
  );
}

// Memoize VideoCard — only re-render when its own active/load state or item changes.
// Without this, changing activeIndex re-renders EVERY card in the feed (laggy scroll).
const VideoCard = React.memo(VideoCardInner, (prev, next) => {
  return prev.item.id === next.item.id
    && prev.isActive === next.isActive
    && prev.shouldLoad === next.shouldLoad
    && prev.item.ggCount === next.item.ggCount
    && prev.item.hasGG === next.item.hasGG
    && prev.item.commentCount === next.item.commentCount
    && prev.item.viewCount === next.item.viewCount
    && prev.userProfile?.uid === next.userProfile?.uid;
});

const cardS = StyleSheet.create({
  controlBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  gameText: { fontSize: 11, color: COLORS.gold, fontWeight: '600', flex: 1 },
  dot: { fontSize: 11, color: COLORS.gray2 },
  dateText: { fontSize: 10, color: COLORS.gray2 },
  videoTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  videoDesc: { fontSize: 11, color: COLORS.gray, lineHeight: 15 },
  creatorName: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  legBadge: { backgroundColor: COLORS.gold, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginLeft: 5 },
  legBadgeText: { fontSize: 7, fontWeight: '900', color: COLORS.black },
  followBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.gold },
  followBtnText: { fontSize: 11, color: COLORS.gold, fontWeight: '700' },
  actionItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export const uploadStore = { isUploading: false, progress: 0, listeners: [] };
export const setUploadState = (state) => {
  Object.assign(uploadStore, state);
  uploadStore.listeners.forEach(l => l(uploadStore));
};

function UploadIndicator() {
  const [state, setState] = useState({ isUploading: false, progress: 0 });
  useEffect(() => {
    uploadStore.listeners.push(setState);
    return () => { uploadStore.listeners = uploadStore.listeners.filter(l => l !== setState); };
  }, []);
  if (!state.isUploading) return null;
  return (
    <View style={{
      position: 'absolute', top: Platform.OS === 'ios' ? 54 : 30, left: 16,
      backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
      flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gold, zIndex: 999,
    }}>
      <ActivityIndicator size="small" color={COLORS.gold} />
      <Text style={{ color: COLORS.gold, fontSize: 11, fontWeight: '700', marginLeft: 6 }}>
        Uploading... {state.progress > 0 ? `${state.progress}%` : ''}
      </Text>
    </View>
  );
}

export default function FeedScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const { fetchFollowing } = useUserStore();
  const { getFilteredVideos, activeTab, setActiveTab, setFilter, fetchVideos, cleanup, videos, userProfiles, isLoading, filterConsole, filterGenre, filterGame } = useFeedStore();  const [displayVideos, setDisplayVideos] = useState([]);
  const [filterModal, setFilterModal] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Force playlist refresh — picks up newly uploaded videos and re-checks position
    useFeedStore.setState({ lastDoc: null, hasMore: true, _playlist: null, _docCache: null, _followingCache: null });
    await fetchVideos(user?.uid, false);
    setRefreshing(false);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => setUnreadCount(snap.size));
    return () => unsub();
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      // On every focus: fetch fresh videos.
      // fetchVideos reads sessionSeenIds from AsyncStorage internally,
      // so even after Expo reload, the session IDs exclude already-seen clips.
      fetchVideos(user?.uid, false);
      if (user?.uid) fetchFollowing(user.uid);
      return () => { setActiveIndex(-1); };
    }, [user?.uid])
  );

  useEffect(() => {
    // cleanup only — fetchVideos is handled by useFocusEffect to avoid duplicate calls
    return () => cleanup();
  }, [user?.uid]);

  useEffect(() => {
    const filtered = getFilteredVideos();
    if (displayVideos.length === 0) {
      setDisplayVideos(shuffle(filtered));
    } else if (filtered.length > displayVideos.length) {
      setDisplayVideos(prev => {
        const existingIds = new Set(prev.map(v => v.id));
        const newOnes = filtered.filter(v => !existingIds.has(v.id));
        return [...prev.map(v => filtered.find(f => f.id === v.id) || v), ...newOnes];
      });
    } else {
      setDisplayVideos(prev => prev.map(v => {
        const updated = filtered.find(f => f.id === v.id);
        return updated || v;
      }));
    }
  }, [videos, userProfiles]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const currentIndex = viewableItems[0].index;
      setActiveIndex(currentIndex);
      const { hasMore, isLoading } = useFeedStore.getState();
      // With the in-memory doc cache, loadMore is near-instant (no Firestore wait),
      // so triggering 3 clips early keeps the feed seamless without over-fetching.
      if (currentIndex >= displayVideos.length - 3 && hasMore && !isLoading) {
        fetchVideos(user?.uid, true);
      }
    }
  }, [displayVideos.length, user?.uid]);

  const viewabilityConfig = { itemVisiblePercentThreshold: 80 };

  const renderItem = useCallback(({ item, index }) => (
    <VideoCard
      item={item}
      navigation={navigation}
      userProfile={userProfile}
      isActive={index === activeIndex}
      // Preload window: current clip + next 2 (forward) + previous 1 (back).
      // Forward bias because users scroll down — the next clips are ready instantly.
      // Keeping previous 1 means scrolling back up is also instant.
      // This is the TikTok pattern: aggressive forward preload for seamless feel.
      shouldLoad={index >= activeIndex - 1 && index <= activeIndex + 2}
      onNavigateProfile={() => navigation.navigate('UserProfile', { userId: item.userId })}
    />
  ), [userProfile, activeIndex]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <UploadIndicator />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={{ uri: 'https://res.cloudinary.com/doeqzltv0/image/upload/v1781665036/high-level-description-a-minimal-esports_suTAzMGBVkuiFDGhTaiWqg_FbErQD1GTfqf2I9I1w4rWQ_x5hlui.jpg' }}
            style={{ width: 32, height: 32, borderRadius: 8, marginRight: 8 }}
            resizeMode="contain"
          />
          <Text style={styles.logoGA}>GAMING</Text>
          <Text style={styles.logoActions}>ACTIONS</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Search')} style={styles.headerBtn}>
            <Ionicons name="search-outline" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFilterModal(true)} style={styles.headerBtn}>
  <Ionicons 
    name="options-outline" 
    size={22} 
    color={filterConsole || filterGenre || filterGame ? COLORS.gold : COLORS.white} 
  />
  {(filterConsole || filterGenre || filterGame) && (
    <View style={{
      position: 'absolute', top: -4, right: -4,
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: COLORS.gold,
    }} />
  )}
</TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.headerBtn}>
            <View>
              <Ionicons name="notifications-outline" size={22} color={COLORS.white} />
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 16, height: 16, borderRadius: 8,
                  backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: COLORS.black,
                }}>
                  <Text style={{ color: COLORS.white, fontSize: 9, fontWeight: '900' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: user?.uid })} style={styles.headerBtn}>
            <FramedAvatar user={userProfile} size={30} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
  {['For You', 'Following'].map((tab, i) => {
    const key = i === 0 ? 'forYou' : 'following';
    return (
      <TouchableOpacity
        key={tab}
        onPress={() => {
          setActiveTab(key);
          if (key === 'following') {
            useFeedStore.setState({ videos: [], lastDoc: null, hasMore: true });
            fetchVideos(user?.uid, false);
            setDisplayVideos([]);
          } else {
            useFeedStore.setState({ videos: [], lastDoc: null, hasMore: true });
            fetchVideos(user?.uid, false);
            setDisplayVideos([]);
          }
        }}
        style={styles.tabItem}
      >
        <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{tab}</Text>
        {activeTab === key && <View style={styles.tabIndicator} />}
      </TouchableOpacity>
    );
  })}
</View>

      {/* QUICK FILTER BAR — filtre rapide par genre, en haut du feed */}
      <View style={styles.quickFilterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickFilterRow}>
          {[{ id: null, label: 'All' }, ...GENRES].map((g) => {
            const active = (filterGenre || null) === g.id;
            return (
              <TouchableOpacity
                key={String(g.id)}
                onPress={() => {
                  setFilter(filterConsole, g.id, filterGame);
                  setDisplayVideos(shuffle(getFilteredVideos()));
                }}
                style={[styles.quickChip, active && styles.quickChipActive]}
              >
                <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
          {(filterConsole || filterGame) && (
            <TouchableOpacity
              onPress={() => {
                setFilter(null, filterGenre, null);
                setDisplayVideos(shuffle(getFilteredVideos()));
              }}
              style={[styles.quickChip, styles.quickChipClear]}
            >
              <Ionicons name="close" size={12} color={COLORS.gold} />
              <Text style={[styles.quickChipText, { color: COLORS.gold }]}> {filterGame || filterConsole?.toUpperCase()}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
      {isLoading && displayVideos.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={{ color: COLORS.gray, fontSize: 13, marginTop: 12, fontWeight: '600' }}>Loading clips... 🎮</Text>
        </View>
      ) : (
        <FlatList
          data={displayVideos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={CARD_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={2}
          windowSize={3}
          initialNumToRender={2}
          updateCellsBatchingPeriod={50}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: CARD_HEIGHT, offset: CARD_HEIGHT * index, index })}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.gold}
              progressBackgroundColor={COLORS.dark}
            />
          }
          ListFooterComponent={
            isLoading && displayVideos.length > 0 ? (
              <View style={{ height: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.black }}>
                <ActivityIndicator size="small" color={COLORS.gold} />
                <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 6, fontWeight: '600' }}>Loading more clips... 🎮</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: CARD_HEIGHT }}>
              <Ionicons name="game-controller-outline" size={60} color={COLORS.gray2} />
              <Text style={{ color: COLORS.gray, fontSize: 16, fontWeight: '700', marginTop: 16 }}>No clips yet</Text>
              <Text style={{ color: COLORS.gray2, fontSize: 13, marginTop: 8 }}>Be the first to upload! 🎮</Text>
            </View>
          }
        />
      )}

      <FilterModal
        visible={filterModal}
        onClose={() => setFilterModal(false)}
        onApply={(console_, genre, game) => {
          setFilter(console_, genre, game);
          setDisplayVideos(shuffle(getFilteredVideos()));
          setFilterModal(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 52 : 30, paddingBottom: 10, backgroundColor: COLORS.black, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  logoGA: { fontSize: 19, fontWeight: '900', color: COLORS.white, letterSpacing: 2 },
  logoActions: { fontSize: 19, fontWeight: '900', color: COLORS.gold, letterSpacing: 2, marginLeft: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { marginLeft: 14 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 9, backgroundColor: COLORS.black, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  tabItem: { alignItems: 'center', marginRight: 24 },
  tabText: { fontSize: 13, color: COLORS.gray, fontWeight: '500' },
  tabTextActive: { color: COLORS.white, fontWeight: '800' },
  tabIndicator: { height: 2, width: '100%', backgroundColor: COLORS.gold, borderRadius: 1, marginTop: 3 },
  quickFilterWrap: { backgroundColor: COLORS.black, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  quickFilterRow: { paddingHorizontal: 14, paddingVertical: 8 },
  quickChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, height: 30 },
  quickChipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  quickChipClear: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.08)' },
  quickChipText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  quickChipTextActive: { color: COLORS.gold, fontWeight: '700' },
});
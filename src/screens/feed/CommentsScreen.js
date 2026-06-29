/**
 * CommentsScreen.js — Threaded comments with replies, @mentions, and #hashtags
 *
 * Features:
 *  - 1-level reply threads (tap "Reply" → indented under parent comment)
 *  - @mention auto-fill when replying (typed in input, highlighted in blue)
 *  - #hashtag detection in comment text (tappable, navigates to HashtagScreen)
 *  - Comment likes with optimistic update + rollback on failure
 *  - Live avatar/frame refresh from Firestore (always shows latest frames)
 *  - Notifications sent to: video owner (on new comment) + mentioned users
 *
 * Data model:
 *   comments/{id}
 *   → { videoId, userId, username, text, parentId (null or commentId),
 *       likes, likedBy[], createdAt, mentions[], hashtags[] }
 *
 * Reply threading: parentId links a reply to its parent comment.
 * Replies are rendered inline below their parent (flat list with indent).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Platform, KeyboardAvoidingView, ActivityIndicator, Animated, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, onSnapshot, addDoc,
  serverTimestamp, updateDoc, doc, increment, getDoc, arrayUnion, arrayRemove,
  getDocs, deleteDoc,
} from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { USERNAME_EFFECTS } from '../../constants/cosmetics';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import { commentFrameStyle } from '../../constants/frames';
import FramedAvatar from '../../components/FramedAvatar';
import { ElectricBorder } from '../../components/ElectricEffect';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { globalNavigate } from '../../utils/navigationRef';

const MAX_CHARS = 150; // Increased from 100 to accommodate @mentions

// ─── Time formatter ───────────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return 'now';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)    return 'now';
  if (diff < 3600)  return Math.floor(diff / 60)    + 'm';
  if (diff < 86400) return Math.floor(diff / 3600)  + 'h';
  return Math.floor(diff / 86400) + 'd';
}

// ─── Extract @mentions from comment text ─────────────────────────────────────
// Returns array of usernames (without the @ sign)
function extractMentions(text) {
  const matches = text.match(/@(\w+)/g) || [];
  return matches.map(m => m.slice(1));
}

// ─── Extract #hashtags from comment text ─────────────────────────────────────
function extractHashtags(text) {
  const matches = text.match(/#(\w+)/g) || [];
  return matches.map(h => h.slice(1).toLowerCase());
}

/**
 * RichText — renders comment text with @mentions (blue) and #hashtags (gold) highlighted.
 * Splits the text into segments and applies color per token type.
 */
function RichText({ text, style }) {
  if (!text) return null;

  // Split on @word or #word boundaries, keeping the delimiters
  const parts = text.split(/(@\w+|#\w+)/g);

  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const username = part.slice(1).toUpperCase();
          return (
            <Text
              key={i}
              style={{ color: COLORS.blue, fontWeight: '700' }}
              onPress={async () => {
                // Resolve username → userId on tap (lazy lookup — not on render)
                // Usernames are stored in uppercase in Firestore
                try {
                  const { getDocs: gd, query: q2, collection: col, where: w } =
                    await import('firebase/firestore');
                  const { db: db2 } = await import('../../config/firebase');
                  const snap = await gd(q2(col(db2, 'users'), w('username', '==', username)));
                  if (!snap.empty) {
                    globalNavigate('UserProfile', { userId: snap.docs[0].id });
                  }
                } catch (_) {}
              }}
            >
              {part}
            </Text>
          );
        }
        if (part.startsWith('#')) {
          return (
            <Text
              key={i}
              style={{ color: COLORS.gold, fontWeight: '700' }}
              onPress={() => globalNavigate('Hashtag', { tag: part.slice(1).toLowerCase() })}
            >
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

// ─── Live profile loader ──────────────────────────────────────────────────────
async function getLiveProfile(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) return { uid: userId, ...snap.data() };
  } catch (e) {}
  return null;
}

/**
 * CommentItem — renders a single comment bubble with:
 *  - Comment frame / champion electric border
 *  - @mention + #hashtag rich text
 *  - Like button (optimistic update)
 *  - Reply button (calls onReply with parentId + username)
 *  - Inline replies (indented, shown when expanded)
 */
function CommentItem({ item, replies = [], onReply, onDelete, currentUserId, isReply = false, onAuthRequired }) {
  const [liveUser, setLiveUser] = useState(item);
  const [liked, setLiked] = useState(!!(item.likedBy || []).includes(currentUserId));
  const [likeCount, setLikeCount] = useState(item.likes || 0);
  const [showReplies, setShowReplies] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Fetch live user profile for up-to-date frames/badges
  useEffect(() => {
    if (item.userId) getLiveProfile(item.userId).then(p => { if (p) setLiveUser(p); });
  }, [item.userId]);

  // Sync like state when real-time snapshot updates the item
  useEffect(() => {
    setLiked(!!(item.likedBy || []).includes(currentUserId));
    setLikeCount(item.likes || 0);
  }, [item.likedBy, item.likes]);

  const cf = commentFrameStyle(liveUser);
  const isChampionFrame = cf?.id === 'cf_champion';
  const borderColor = cf ? cf.color : 'transparent';
  const hasBorder = cf && cf.id !== 'none';

  const handleLike = async () => {
    if (!currentUserId) { onAuthRequired?.(); return; }
    const newLiked = !liked;
    // Optimistic update — revert on error
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.3, useNativeDriver: true, speed: 60 }),
      Animated.spring(scaleAnim, { toValue: 1,   useNativeDriver: true, speed: 30 }),
    ]).start();
    try {
      await updateDoc(doc(db, 'comments', item.id), {
        likes:   increment(newLiked ? 1 : -1),
        likedBy: newLiked ? arrayUnion(currentUserId) : arrayRemove(currentUserId),
      });
    } catch (e) {
      // Rollback on Firestore write failure
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1);
    }
  };

  const BADGES = {
    gameconic: { label: 'ICON', bg: COLORS.red },
    creator:   { label: 'CR',   bg: COLORS.blue },
  };
  const badge = BADGES[liveUser?.accountType];
  const baseNameColor = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.plan === 'legendary'      ? COLORS.gold
    : COLORS.white;

  // Username effect from live profile
  const ueId   = liveUser?.equippedUsernameEffect;
  const ueItem = ueId ? USERNAME_EFFECTS?.find(e => e.id === ueId) : null;
  const nameColor  = ueItem ? (ueItem.color || ueItem.colors?.[0] || baseNameColor) : baseNameColor;
  const nameGlow   = ueItem?.glow || false;
  const nameAnim   = ueItem?.animated || false;

  // useNativeDriver:true — opacity only, textShadowRadius stays static (no JS thread cost)
  // Animated border for animated comment frames (sakura, void_pulse, holographic, etc.)
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

  const uePulse = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    if (!nameAnim) { uePulse.setValue(1); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(uePulse, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      Animated.timing(uePulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [nameAnim, ueId]);
  const ueOpacity = uePulse;

  return (
    <View style={isReply ? styles.replyWrapper : null}>
      {/* Indent line for replies */}
      {isReply && <View style={styles.replyLine} />}

      <TouchableOpacity
        activeOpacity={1}
        onLongPress={() => {
          if (onDelete && (item.userId === currentUserId)) {
            Alert.alert('Supprimer', 'Supprimer ce commentaire ?', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(item) },
            ]);
          }
        }}
        delayLongPress={400}
      >
      <View style={[
        styles.commentCard,
        hasBorder && { borderColor, borderWidth: 1.5 },
        isChampionFrame && { borderColor: '#E8C96B', borderWidth: 2 },
        isReply && styles.replyCard,
      ]}>
        {isChampionFrame && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ElectricBorder width="100%" height="100%" radius={12} />
          </View>
        )}
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
              shadowOpacity: 0.6, shadowRadius: 6,
            }]} pointerEvents="none" />
          )
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <TouchableOpacity
            onPress={() => { if (item.userId) globalNavigate('UserProfile', { userId: item.userId }); }}
            activeOpacity={0.7}
          >
            <FramedAvatar user={liveUser} size={isReply ? 26 : 30} />
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 8 }}>
            {/* Username + badges + timestamp */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <TouchableOpacity
                onPress={() => { if (item.userId) globalNavigate('UserProfile', { userId: item.userId }); }}
                activeOpacity={0.7}
              >
                {nameAnim ? (
                  <Animated.Text style={[styles.commentName, {
                    color: nameColor, opacity: ueOpacity,
                    textShadowColor: nameColor, textShadowRadius: 9, textShadowOffset: { width: 0, height: 0 },
                  }]}>
                    {liveUser?.username || item.username}
                  </Animated.Text>
                ) : (
                  <Text style={[styles.commentName, {
                    color: nameColor,
                    textShadowColor: nameGlow ? nameColor : 'transparent',
                    textShadowRadius: nameGlow ? 6 : 0,
                    textShadowOffset: { width: 0, height: 0 },
                  }]}>
                    {liveUser?.username || item.username}
                  </Text>
                )}
              </TouchableOpacity>
              {badge && (
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={styles.badgeText}>{badge.label}</Text>
                </View>
              )}
              {liveUser?.plan === 'legendary' && !badge && (
                <View style={[styles.badge, { backgroundColor: COLORS.gold }]}>
                  <Text style={[styles.badgeText, { color: COLORS.black }]}>LEG</Text>
                </View>
              )}
              <Text style={styles.commentTime}> · {fmtTime(item.createdAt)}</Text>
            </View>

            {/* Comment text with @mention + #hashtag highlights */}
            <RichText text={item.text} style={styles.commentText} />

            {/* Action row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              {/* Reply button — only on top-level comments (1 level deep) */}
              {!isReply && (
                <TouchableOpacity
                  onPress={() => {
                    if (!currentUserId) { onAuthRequired?.(); return; }
                    onReply({ parentId: item.id, username: liveUser?.username || item.username });
                  }}
                  style={styles.replyBtn}
                >
                  <Ionicons name="chatbubble-outline" size={12} color={COLORS.gray} />
                  <Text style={styles.replyBtnText}>Reply</Text>
                  {replies.length > 0 && (
                    <Text style={[styles.replyBtnText, { color: COLORS.blue, marginLeft: 4 }]}>
                      · {replies.length}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {/* Like button */}
              <TouchableOpacity onPress={handleLike} style={styles.likeBtn}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <Ionicons
                    name={liked ? 'heart' : 'heart-outline'}
                    size={14}
                    color={liked ? COLORS.red : COLORS.gray}
                  />
                </Animated.View>
                {likeCount > 0 && (
                  <Text style={[styles.likeCount, liked && { color: COLORS.red }]}>
                    {likeCount}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      </TouchableOpacity>

      {/* Expand/collapse replies */}
      {!isReply && replies.length > 0 && (
        <TouchableOpacity
          onPress={() => setShowReplies(v => !v)}
          style={styles.showRepliesBtn}
        >
          <View style={styles.showRepliesLine} />
          <Text style={styles.showRepliesText}>
            {showReplies ? 'Hide replies' : `View ${replies.length} repl${replies.length > 1 ? 'ies' : 'y'}`}
          </Text>
          <Ionicons
            name={showReplies ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={COLORS.blue}
          />
        </TouchableOpacity>
      )}

      {/* Inline replies (1 level) */}
      {!isReply && showReplies && replies.map(reply => (
        <CommentItem
          key={reply.id}
          item={reply}
          replies={[]}
          onReply={onReply}
          onDelete={onDelete}
          currentUserId={currentUserId}
          onAuthRequired={onAuthRequired}
          isReply={true}
        />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CommentsScreen({ navigation, route }) {
  const { video } = route?.params || {};
  const { user, userProfile } = useAuthStore();
  const insets = useSafeAreaInsets();

  const handleAuthRequired = () => {
    Alert.alert('Connecte-toi', 'Crée un compte pour interagir avec les commentaires !', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se connecter', onPress: () => navigation.navigate('Auth') },
    ]);
  };

  const [comments, setComments] = useState([]);     // top-level comments only
  const [replies, setReplies]   = useState({});     // { [parentId]: [reply, ...] }
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [replyTarget, setReplyTarget] = useState(null); // { parentId, username }
  // Use a ref in addition to state so the value is never stale inside handleSend
  // (iOS keyboard opening can cause re-renders that lose state in closures)
  const replyTargetRef = useRef(null);
  const inputRef = useRef(null);

  // ── Real-time comment listener ────────────────────────────────────────────
  useEffect(() => {
    if (!video?.id) { setLoading(false); return; }

    const q = query(
      collection(db, 'comments'),
      where('videoId', '==', video.id),
      orderBy('createdAt', 'asc') // oldest first so threads read naturally
    );

    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Separate top-level comments from replies
      const topLevel  = all.filter(c => !c.parentId);
      const replyMap  = {};
      all.filter(c => c.parentId).forEach(r => {
        if (!replyMap[r.parentId]) replyMap[r.parentId] = [];
        replyMap[r.parentId].push(r);
      });

      // Sort top-level by newest first for display (replies stay chronological)
      setComments(topLevel.reverse());
      setReplies(replyMap);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [video?.id]);

  // ── Send comment or reply ─────────────────────────────────────────────────
  const handleSend = async () => {
    const body = text.trim();
    if (!body || !user?.uid || !video?.id) return;

    setText('');
    // Read from ref (not state) to guarantee the value even if re-renders happened
    const currentReplyTarget = replyTargetRef.current;
    replyTargetRef.current = null;
    setReplyTarget(null);

    // Extract metadata from text for indexing
    const mentions  = extractMentions(body);
    const hashtags  = extractHashtags(body);

    try {
      const commentData = {
        videoId:             video.id,
        userId:              user.uid,
        username:            userProfile?.username || 'Player',
        avatar:              userProfile?.avatar || '',
        accountType:         userProfile?.accountType || 'gamer',
        plan:                userProfile?.plan || 'free',
        equippedFrame:       userProfile?.equippedFrame || 'none',
        equippedCommentFrame:userProfile?.equippedCommentFrame || 'none',
        isChampion:          userProfile?.isChampion || false,
        isCurrentLeader:     userProfile?.isCurrentLeader || false,
        streakLevel:         userProfile?.streakLevel || 'noob',
        text:                body,
        likes:               0,
        likedBy:             [],
        mentions,   // ['username1', 'username2'] — used to send notifications
        hashtags,   // ['fifa', 'clutch'] — indexed for hashtag search
        parentId:            currentReplyTarget?.parentId || null,
        createdAt:           serverTimestamp(),
      };

      await addDoc(collection(db, 'comments'), commentData);

      // Increment comment count on the video document
      await updateDoc(doc(db, 'videos', video.id), {
        commentsCount: increment(1),
      });

      // Notify the video owner (skip if replying to their own content)
      if (!currentReplyTarget && video.userId && video.userId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId:       video.userId,
          type:         'comment',
          fromUserId:   user.uid,
          fromUsername: userProfile?.username || 'Someone',
          text:         'commented: "' + body.slice(0, 50) + '"',
          videoId:      video.id,
          read:         false,
          createdAt:    serverTimestamp(),
        });
      }

      // Notify the parent comment author when replying
      if (currentReplyTarget?.parentId) {
        const parentSnap = await getDoc(doc(db, 'comments', currentReplyTarget.parentId));
        if (parentSnap.exists()) {
          const parentOwnerId = parentSnap.data().userId;
          if (parentOwnerId && parentOwnerId !== user.uid) {
            await addDoc(collection(db, 'notifications'), {
              userId:       parentOwnerId,
              type:         'reply',
              fromUserId:   user.uid,
              fromUsername: userProfile?.username || 'Someone',
              text:         'replied to your comment: "' + body.slice(0, 40) + '"',
              videoId:      video.id,
              read:         false,
              createdAt:    serverTimestamp(),
            });
          }
        }
      }

      // Notify all @mentioned users (skip the sender)
      if (mentions.length > 0) {
        for (const username of mentions) {
          try {
            const mentionSnap = await getDocs(
              query(collection(db, 'users'), where('username', '==', username.toUpperCase()))
            );
            if (!mentionSnap.empty) {
              const mentionedUserId = mentionSnap.docs[0].id;
              if (mentionedUserId !== user.uid) {
                await addDoc(collection(db, 'notifications'), {
                  userId:       mentionedUserId,
                  type:         'mention',
                  fromUserId:   user.uid,
                  fromUsername: userProfile?.username || 'Someone',
                  text:         'mentioned you in a comment: "' + body.slice(0, 40) + '"',
                  videoId:      video.id,
                  read:         false,
                  createdAt:    serverTimestamp(),
                });
              }
            }
          } catch (e) {} // Don't block the send if mention lookup fails
        }
      }

    } catch (e) {
      await logError(LOG_CONTEXT.COMMENT_FAIL, e, user?.uid);
    }
  };

  // ── Delete comment ────────────────────────────────────────────────────────
  const handleDelete = async (comment) => {
    if (!comment?.id || !video?.id) return;
    try {
      // Supprimer le commentaire lui-même
      await deleteDoc(doc(db, 'comments', comment.id));

      // Compter les replies de ce commentaire pour décrémenter correctement
      const repliesOfComment = replies[comment.id] || [];
      const totalDeleted = 1 + repliesOfComment.length;

      // Supprimer les replies orphelines
      for (const reply of repliesOfComment) {
        try { await deleteDoc(doc(db, 'comments', reply.id)); } catch (_) {}
      }

      await updateDoc(doc(db, 'videos', video.id), {
        commentsCount: increment(-totalDeleted),
      });
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de supprimer ce commentaire.');
    }
  };

  const handleReply = ({ parentId, username }) => {
    const target = { parentId, username };
    replyTargetRef.current = target;   // ref is always up-to-date, immune to re-render
    setReplyTarget(target);            // state drives the UI indicator bar
    setText('@' + username + ' ');
    inputRef.current?.focus();
  };

  const remaining = MAX_CHARS - text.length;
  const totalCount = comments.length + Object.values(replies).reduce((s, r) => s + r.length, 0);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{totalCount} Comments</Text>
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
          style={{ flex: 1 }}
          renderItem={({ item }) => (
            <CommentItem
              item={item}
              replies={replies[item.id] || []}
              onReply={handleReply}
              onDelete={handleDelete}
              currentUserId={user?.uid}
              onAuthRequired={handleAuthRequired}
            />
          )}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>No comments yet. Be the first! 👇</Text>
          }
        />
      )}

      {/* Reply indicator bar */}
      {replyTarget && (
        <View style={styles.replyBar}>
          <Ionicons name="return-down-forward" size={14} color={COLORS.blue} />
          <Text style={styles.replyBarText}> Replying to @{replyTarget.username}</Text>
          <TouchableOpacity
            onPress={() => { replyTargetRef.current = null; setReplyTarget(null); setText(''); }}
            style={{ marginLeft: 'auto' }}
          >
            <Ionicons name="close-circle" size={18} color={COLORS.gray} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <FramedAvatar user={userProfile} size={28} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={t => setText(t.slice(0, MAX_CHARS))}
            placeholder={replyTarget ? `Reply to @${replyTarget.username}...` : 'Add a comment... Use @ and #'}
            placeholderTextColor={COLORS.gray}
            style={styles.input}
            multiline
            maxLength={MAX_CHARS}
            editable={!!user}
            onPressIn={!user ? handleAuthRequired : undefined}
          />
          {text.length > 100 && (
            <Text style={[styles.charCount, remaining < 20 && { color: COLORS.red }]}>
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

  // ── Comment card ────────────────────────────────────────────────────────────
  commentCard: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden',
  },
  commentName: { fontSize: 12, fontWeight: '800' },
  commentTime: { fontSize: 10, color: COLORS.gray },
  commentText: { fontSize: 13, color: COLORS.white, marginTop: 4, lineHeight: 18 },

  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, marginLeft: 5 },
  badgeText: { fontSize: 8, fontWeight: '900', color: COLORS.white },

  // ── Reply system ────────────────────────────────────────────────────────────
  replyWrapper: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  replyLine: {
    width: 2, backgroundColor: COLORS.gray3, borderRadius: 1,
    marginLeft: 16, marginRight: 8, minHeight: 40,
  },
  replyCard: { flex: 1, marginBottom: 4 },

  showRepliesBtn: {
    flexDirection: 'row', alignItems: 'center', paddingLeft: 52,
    paddingVertical: 6, marginBottom: 8, gap: 6,
  },
  showRepliesLine: { width: 20, height: 1, backgroundColor: COLORS.gray3 },
  showRepliesText: { fontSize: 11, color: COLORS.blue, fontWeight: '700' },

  // ── Action buttons ──────────────────────────────────────────────────────────
  replyBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  replyBtnText: { fontSize: 11, color: COLORS.gray, marginLeft: 4, fontWeight: '600' },
  likeBtn: { flexDirection: 'row', alignItems: 'center' },
  likeCount: { fontSize: 11, color: COLORS.gray, marginLeft: 4, fontWeight: '600' },

  // ── Reply indicator bar ──────────────────────────────────────────────────────
  replyBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.card, borderTopWidth: 0.5, borderTopColor: COLORS.gray3,
  },
  replyBarText: { fontSize: 12, color: COLORS.blue, fontWeight: '600' },

  // ── Input bar ───────────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: 0.5, borderTopColor: COLORS.gray3, backgroundColor: COLORS.dark,
    flexShrink: 0,
  },
  input: { fontSize: 14, color: COLORS.white, maxHeight: 80, paddingVertical: 6 },
  charCount: { fontSize: 10, color: COLORS.gray, textAlign: 'right', marginTop: 2 },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
});

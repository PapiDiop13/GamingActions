import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TouchableWithoutFeedback, KeyboardAvoidingView,
  TextInput, Platform, Image, Alert, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, getDoc, serverTimestamp, increment, getDocs,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import { optimizeVideoUrl } from '../../config/cloudinary';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../../components/FramedAvatar';
import { commentFrameStyle } from '../../constants/frames';
import { findBannedWords, censorText, logModeration } from '../../utils/moderation';

const THANKS_COST = 5;
const THANKS_COLOR = '#7C4DFF';


function tipFmtTime(ts) {
  if (!ts) return 'now';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

function TipCommentBubble({ comment, onReply, currentUser, currentProfile }) {
  const [liveUser, setLiveUser] = useState(comment);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(comment.likes || 0);

  useEffect(() => {
    let alive = true;
    if (comment.userId) {
      getDoc(doc(db, 'users', comment.userId)).then(snap => {
        if (alive && snap.exists()) setLiveUser({ uid: comment.userId, ...snap.data() });
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [comment.userId]);

  const cf = commentFrameStyle(liveUser);
  const hasBorder = cf && cf.id !== 'none';
  const borderColor = hasBorder ? cf.color : 'transparent';
  const isChampionFrame = cf?.id === 'cf_champion';
  const nameColor = liveUser?.accountType === 'gameconic' ? COLORS.red
    : liveUser?.accountType === 'creator' ? COLORS.blue
    : liveUser?.plan === 'legendary' ? COLORS.gold
    : COLORS.gold;

  const handleLike = async () => {
    if (liked) return;
    setLiked(true);
    setLikeCount(c => c + 1);
    try {
      await updateDoc(doc(db, 'tipComments', comment.id), { likes: increment(1) });
      if (comment.userId && comment.userId !== currentUser?.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: comment.userId, type: 'comment_like', fromUserId: currentUser?.uid,
          fromUsername: currentProfile?.username || 'Someone', text: 'liked your comment ❤️',
          read: false, createdAt: serverTimestamp(),
        });
      }
    } catch (e) {}
  };

  return (
    <View style={[
      sheetS.commentCard,
      hasBorder && { borderColor, borderWidth: 1.5 },
      isChampionFrame && { borderColor: '#E8C96B', borderWidth: 2 },
      hasBorder && cf.glow && { shadowColor: borderColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 5 },
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Avatar user={liveUser} size={28} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[sheetS.commentName, { color: nameColor }]}>{liveUser?.username || comment.username}</Text>
            <Text style={sheetS.commentTime}> · {tipFmtTime(comment.createdAt)}</Text>
          </View>
          <Text style={sheetS.commentText}>
            {comment.text.split(/(@\w+)/g).map((part, i) =>
              part.startsWith('@')
                ? <Text key={i} style={{ color: COLORS.blue, fontWeight: '700' }}>{part}</Text>
                : <Text key={i}>{part}</Text>
            )}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
            <TouchableOpacity onPress={() => onReply(liveUser?.username || comment.username)} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
              <Ionicons name="chatbubble-outline" size={12} color={COLORS.gray} />
              <Text style={{ fontSize: 11, color: COLORS.gray, marginLeft: 4, fontWeight: '600' }}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center' }} disabled={liked}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? COLORS.red : COLORS.gray} />
              {likeCount > 0 && <Text style={{ fontSize: 11, color: liked ? COLORS.red : COLORS.gray, marginLeft: 4 }}>{likeCount}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

function CommentsSheet({ visible, onClose, tipId, userProfile }) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const MAX = 100;

  useEffect(() => {
    if (!visible || !tipId) return;
    const q = query(
      collection(db, 'tipComments'),
      where('tipId', '==', tipId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [visible, tipId]);

  const handleSend = async () => {
    const raw = (replyTo ? '@' + replyTo + ' ' : '') + text.trim();
    if (!raw || !userProfile?.uid) return;
    setText('');
    setReplyTo(null);
    // Modération
    const banned = findBannedWords(raw);
    const body = banned.length > 0 ? censorText(raw) : raw;
    if (banned.length > 0) logModeration(userProfile.uid, userProfile.username, raw, banned);
    try {
      await addDoc(collection(db, 'tipComments'), {
        tipId,
        userId: userProfile.uid,
        username: userProfile.username,
        avatar: userProfile.avatar || '',
        accountType: userProfile.accountType || 'gamer',
        plan: userProfile.plan || 'free',
        equippedFrame: userProfile.equippedFrame || 'none',
        equippedCommentFrame: userProfile.equippedCommentFrame || 'none',
        isChampion: userProfile.isChampion || false,
        text: body,
        likes: 0,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'videos', tipId), { commentsCount: increment(1) });
    } catch(e){}
  };

  const remaining = MAX - text.length;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={sheetS.backdrop} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={sheetS.wrap}>
        <View style={sheetS.sheet}>
          <View style={sheetS.handle} />
          <Text style={sheetS.title}>{comments.length} Comments</Text>
          {loading ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginTop: 20 }} />
          ) : (
            <ScrollView style={sheetS.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8 }}>
              {comments.length === 0 ? (
                <Text style={{ color: COLORS.gray, textAlign: 'center', marginTop: 30, fontSize: 14 }}>No comments yet. Be the first! 👇</Text>
              ) : comments.map((c) => (
                <TipCommentBubble key={c.id} comment={c} onReply={setReplyTo} currentUser={user} currentProfile={userProfile} />
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
          {replyTo && (
            <View style={sheetS.replyBar}>
              <Ionicons name="return-down-forward" size={14} color={COLORS.blue} />
              <Text style={sheetS.replyBarText}> Replying to @{replyTo}</Text>
              <TouchableOpacity onPress={() => setReplyTo(null)} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close-circle" size={18} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
          )}
          <View style={sheetS.inputRow}>
            <Avatar user={userProfile} size={28} />
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <TextInput
                value={text}
                onChangeText={t => setText(t.slice(0, MAX))}
                placeholder={replyTo ? `Reply to @${replyTo}...` : 'Add a comment...'}
                placeholderTextColor={COLORS.gray}
                style={sheetS.input}
                autoFocus
                maxLength={MAX}
                multiline
              />
              {text.length > 70 && (
                <Text style={{ fontSize: 10, color: remaining < 15 ? COLORS.red : COLORS.gray, textAlign: 'right', marginTop: 2 }}>{remaining}</Text>
              )}
            </View>
            <TouchableOpacity onPress={handleSend} style={[sheetS.sendBtn, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()}>
              <Ionicons name="send" size={14} color={COLORS.black} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheetS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  wrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: { backgroundColor: 'rgba(18,18,26,0.96)', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 30 : 10, height: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.gray2, alignSelf: 'center', marginTop: 10, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.white, paddingHorizontal: 16, marginBottom: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, paddingBottom: 10 },
  list: { flex: 1, paddingHorizontal: 12 },
  commentCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 11, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  commentName: { fontSize: 12, fontWeight: '800' },
  commentTime: { fontSize: 10, color: COLORS.gray },
  commentText: { fontSize: 13, color: COLORS.white, lineHeight: 18, marginTop: 3 },
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.card, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  replyBarText: { fontSize: 12, color: COLORS.blue, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  input: { backgroundColor: COLORS.card, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.white, maxHeight: 80 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
});

export default function TipDetailScreen({ navigation, route }) {
  const { tip } = route.params;
  const { user: authUser, userProfile, saveProfile } = useAuthStore();
  const player = useVideoPlayer(tip.videoUrl ? optimizeVideoUrl(tip.videoUrl) : null, (p) => {
    p.loop = false;
  });

  const [skipThanksConfirm, setSkipThanksConfirm] = useState(false);
  const [showThanksConfirm, setShowThanksConfirm] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [thanksCount, setThanksCount] = useState(tip.thanksCount || 0);
  const [commentsCount, setCommentsCount] = useState(tip.commentsCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [thankLoading, setThankLoading] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState(null);

  const CAT_COLORS = {
    flashtuto: COLORS.blue,
    flashinfo: COLORS.red,
    gameindev: '#7C4DFF',
    gatv: COLORS.gold,
  };
  const catColor = CAT_COLORS[tip.contentType] || COLORS.gray;

  const BADGE_COLORS = {
    gameconic: { bg: COLORS.red, text: COLORS.white, label: 'ICON' },
    creator: { bg: COLORS.blue, text: COLORS.dark, label: 'CREATOR' },
    gamer: { bg: COLORS.gray2, text: COLORS.white, label: 'GA' },
  };
  const badge = BADGE_COLORS[tip.accountType] || BADGE_COLORS.gamer;

  useEffect(() => {
    // Charge le profil créateur
    if (tip.userId) {
      getDoc(doc(db, 'users', tip.userId)).then(snap => {
        if (snap.exists()) setCreatorProfile(snap.data());
      });
    }
    // Charge la préférence "ne plus me demander" pour le Thanks (mémorisée définitivement)
    AsyncStorage.getItem('@ga_skip_thanks_confirm').then(val => {
      if (val === 'true') setSkipThanksConfirm(true);
    }).catch(() => {});
    // Écoute les commentaires count
    const unsub = onSnapshot(doc(db, 'videos', tip.id), (snap) => {
      if (snap.exists()) {
        setCommentsCount(snap.data().commentsCount || 0);
        setThanksCount(snap.data().thanksCount || 0);
      }
    });
    return () => unsub();
  }, [tip.id, authUser?.uid]);

  // Étape 1 : clic Thanks → vérifie les points, puis confirme (ou envoie direct si "ne plus demander")
  const handleThanks = () => {
    if (!authUser?.uid) return;
    // Les creators et gameconics ne peuvent pas envoyer de Thanks
    // (empêche le blanchiment GA Points → Thanks → cash entre créateurs)
    if (userProfile?.accountType === 'creator' || userProfile?.accountType === 'gameconic') {
      Alert.alert(
        'Not available',
        'Creators and Gameconics cannot send Thanks. This keeps the rewards economy fair for everyone. 🛡️',
        [{ text: 'OK' }]
      );
      return;
    }
    const currentPoints = userProfile?.gaPoints || 0;
    if (currentPoints < THANKS_COST) {
      Alert.alert(
        '❌ Pas assez de GA Points',
        `Il te faut ${THANKS_COST} GA Points pour envoyer un Thanks. Tu en as ${currentPoints}.`,
        [{ text: 'OK' }]
      );
      return;
    }
    if (skipThanksConfirm) {
      doThanks();
    } else {
      setDontAskAgain(false);
      setShowThanksConfirm(true);
    }
  };

  // Étape 2 : envoi réel — ILLIMITÉ, l'user peut remercier autant qu'il veut (il paie ses points à chaque fois)
  const doThanks = async () => {
    if (!authUser?.uid) return;
    const currentPoints = userProfile?.gaPoints || 0;
    if (currentPoints < THANKS_COST) { setShowThanksConfirm(false); return; }

    // "Ne plus me demander" coché → on mémorise définitivement
    if (dontAskAgain) {
      try { await AsyncStorage.setItem('@ga_skip_thanks_confirm', 'true'); } catch (e) {}
      setSkipThanksConfirm(true);
    }
    setShowThanksConfirm(false);

    setThankLoading(true);
    try {
      // Enregistre le thanks (un doc par Thanks — illimité)
      await addDoc(collection(db, 'thanks'), {
        userId: authUser.uid,
        tipId: tip.id,
        creatorId: tip.userId,
        points: THANKS_COST,
        createdAt: serverTimestamp(),
      });

      // Déduit les points du user
      await updateDoc(doc(db, 'users', authUser.uid), {
        gaPoints: increment(-THANKS_COST),
      });

      // Crédite le créateur
      await updateDoc(doc(db, 'users', tip.userId), {
        gaPoints: increment(THANKS_COST),
      });

      // Incrémente le count de thanks sur la vidéo
      await updateDoc(doc(db, 'videos', tip.id), {
        thanksCount: increment(1),
      });

      // Notifie le créateur
      await addDoc(collection(db, 'notifications'), {
        userId: tip.userId,
        type: 'thanks',
        fromUserId: authUser.uid,
        fromUsername: userProfile?.username || 'Someone',
        text: `sent you a Thanks on your tip! 👍 +${THANKS_COST} GA Points`,
        videoId: tip.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Met à jour le profil local
      await saveProfile({ gaPoints: currentPoints - THANKS_COST });

      setThanksCount(prev => prev + 1);
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setThankLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const CAT_LABELS = {
    flashtuto: 'FLASHTUTO',
    flashinfo: 'FLASHINFO',
    gameindev: 'GAMEINDEV',
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        tipId={tip.id}
        userProfile={userProfile}
      />

      {/* Confirmation Thanks (-5 pts) avec "ne plus me demander" */}
      <Modal visible={showThanksConfirm} transparent animationType="fade" statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => setShowThanksConfirm(false)}>
          <View style={tcS.backdrop}>
            <TouchableWithoutFeedback>
              <View style={tcS.card}>
                <View style={tcS.iconCircle}>
                  <Ionicons name="thumbs-up" size={28} color={THANKS_COLOR} />
                </View>
                <Text style={tcS.title}>Envoyer un Thanks ?</Text>
                <Text style={tcS.subtitle}>
                  Tu vas envoyer <Text style={{ color: THANKS_COLOR, fontWeight: '800' }}>{THANKS_COST} GA Points</Text> à {tip.username}.
                  {'\n'}Solde après : {Math.max(0, (userProfile?.gaPoints || 0) - THANKS_COST)} pts
                </Text>

                <TouchableOpacity style={tcS.checkRow} onPress={() => setDontAskAgain(v => !v)} activeOpacity={0.8}>
                  <View style={[tcS.checkbox, dontAskAgain && tcS.checkboxOn]}>
                    {dontAskAgain && <Ionicons name="checkmark" size={14} color={COLORS.black} />}
                  </View>
                  <Text style={tcS.checkLabel}>Ne plus me demander</Text>
                </TouchableOpacity>

                <View style={tcS.btnRow}>
                  <TouchableOpacity onPress={() => setShowThanksConfirm(false)} style={tcS.cancelBtn}>
                    <Text style={tcS.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={doThanks} style={tcS.confirmBtn}>
                    <Text style={tcS.confirmText}>Envoyer · {THANKS_COST} pts</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{tip.caption}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Video */}
        <View style={styles.videoArea}>
          {tip.videoUrl ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              nativeControls
              allowsFullscreen
            />
          ) : (
            <Ionicons name="game-controller" size={48} color={COLORS.gold} style={{ opacity: 0.15 }} />
          )}
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(tip.duration)}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <View style={[styles.catTag, { backgroundColor: catColor + '18' }]}>
            <Text style={[styles.catTagText, { color: catColor }]}>{CAT_LABELS[tip.contentType] || tip.contentType?.toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>{tip.caption}</Text>
          <Text style={styles.game}>🎮 {tip.game}</Text>
        </View>

        {/* Creator */}
        <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: tip.userId })} style={styles.creatorCard} activeOpacity={0.85}>
          <Avatar user={{ ...tip, ...creatorProfile }} size={44} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.creatorName}>{tip.username}</Text>
              <View style={[styles.badge, { backgroundColor: badge.bg, marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
              </View>
            </View>
            <Text style={styles.creatorSub}>Tap to view profile</Text>
          </View>
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{tip.viewsCount || 0}</Text>
            <Text style={styles.statLabel}>Views</Text>
          </View>
          <TouchableOpacity style={styles.stat} onPress={() => setShowComments(true)}>
            <Text style={[styles.statNum, { color: COLORS.blue }]}>{commentsCount}</Text>
            <Text style={styles.statLabel}>Comments 💬</Text>
          </TouchableOpacity>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: THANKS_COLOR }]}>{thanksCount}</Text>
            <Text style={styles.statLabel}>Thanks 👍</Text>
          </View>
        </View>

        {/* Comments button */}
        <TouchableOpacity onPress={() => setShowComments(true)} style={styles.commentsBtn}>
          <Ionicons name="chatbubble-outline" size={18} color={COLORS.white} />
          <Text style={styles.commentsBtnText}>View {commentsCount} Comments</Text>
          <Ionicons name="chevron-up" size={16} color={COLORS.gray} />
        </TouchableOpacity>

        {/* Thanks section */}
        {tip.userId !== authUser?.uid && (
          <View style={styles.thanksSection}>
            <Ionicons name="thumbs-up-outline" size={22} color={THANKS_COLOR} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.thanksTitle}>Found this helpful?</Text>
              <Text style={styles.thanksDesc}>
                Send {THANKS_COST} GA Points to thank {tip.username}
                {'\n'}
                <Text style={{ color: THANKS_COLOR, fontWeight: '700' }}>
                  Tes points: {userProfile?.gaPoints || 0} pts
                </Text>
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleThanks}
              disabled={thankLoading}
              style={styles.thanksBtn}
            >
              {thankLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.thanksBtnText}>{`Thanks · ${THANKS_COST} pts`}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Join fanbase CTA */}
        {tip.accountType !== 'gamer' && tip.userId !== authUser?.uid && (
          <TouchableOpacity
            onPress={() => navigation.navigate('Fanbase', { creator: { ...tip, ...creatorProfile } })}
            style={styles.fanbaseCTA}
          >
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.blue} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.fanbaseCTATitle}>Join {tip.username}'s Fanbase</Text>
              <Text style={styles.fanbaseCTADesc}>Exclusive clips, private tips & direct chat · $4.99/mo</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.blue} />
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  backBtn: { width: 36 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.white, marginHorizontal: 8 },
  shareBtn: { width: 36, alignItems: 'flex-end' },
  videoArea: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#060610', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  durationBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  durationText: { fontSize: 11, color: COLORS.white, fontWeight: '700' },
  infoSection: { padding: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  catTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 8 },
  catTagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.white, marginBottom: 6, lineHeight: 24 },
  game: { fontSize: 12, color: COLORS.gold },
  creatorCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  creatorName: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  creatorSub: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 8, fontWeight: '900' },
  statsRow: { flexDirection: 'row', margin: 14, backgroundColor: COLORS.card, borderRadius: 12, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.gray3 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statNum: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  statLabel: { fontSize: 9, color: COLORS.gray, textTransform: 'uppercase', marginTop: 2 },
  commentsBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 14, padding: 14, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  commentsBtnText: { flex: 1, fontSize: 14, color: COLORS.white, fontWeight: '600', marginLeft: 10 },
  thanksSection: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 14, padding: 14, backgroundColor: 'rgba(124,77,255,0.08)', borderRadius: 12, borderWidth: 0.5, borderColor: 'rgba(124,77,255,0.25)' },
  thanksTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  thanksDesc: { fontSize: 11, color: COLORS.gray, marginTop: 2, lineHeight: 16 },
  thanksBtn: { backgroundColor: '#7C4DFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  thanksBtnDone: { backgroundColor: 'rgba(124,77,255,0.15)', borderWidth: 1, borderColor: '#7C4DFF' },
  thanksBtnText: { fontSize: 11, color: COLORS.white, fontWeight: '700' },
  fanbaseCTA: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 14, padding: 14, backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.blue + '40' },
  fanbaseCTATitle: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  fanbaseCTADesc: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
});
const tcS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(124,77,255,0.3)' },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(124,77,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(124,77,255,0.3)' },
  title: { fontSize: 19, fontWeight: '900', color: COLORS.white, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  checkRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 18 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.gray2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxOn: { backgroundColor: THANKS_COLOR, borderColor: THANKS_COLOR },
  checkLabel: { fontSize: 13, color: COLORS.white, fontWeight: '600' },
  btnRow: { flexDirection: 'row', width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, alignItems: 'center', marginRight: 8 },
  cancelText: { fontSize: 14, color: COLORS.gray, fontWeight: '700' },
  confirmBtn: { flex: 1.4, paddingVertical: 13, borderRadius: 12, backgroundColor: THANKS_COLOR, alignItems: 'center' },
  confirmText: { fontSize: 14, color: COLORS.white, fontWeight: '900' },
});
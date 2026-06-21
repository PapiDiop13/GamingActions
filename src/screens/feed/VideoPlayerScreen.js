import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  KeyboardAvoidingView, TextInput, ScrollView, Modal,
  TouchableWithoutFeedback, Image, Animated,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { optimizeVideoUrl } from '../../config/cloudinary';
import useFeedStore from '../../store/useFeedStore';
import useAuthStore from '../../store/useAuthStore';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ringColorForUser, commentFrameStyle } from '../../constants/frames';
import FramedAvatar from '../../components/FramedAvatar';
import { recordView } from '../../utils/feedAlgo';

// ─── GG Button animé ─────────────────────────────────────────────────────────
function GGBtn({ hasGG, count, onPress, disabled }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const tap = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.2, useNativeDriver: true, speed: 60, bounciness: 20 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onPress();
  };
  return (
    <TouchableOpacity onPress={disabled ? null : tap} activeOpacity={disabled ? 1 : 0.8} style={{ alignItems: 'center' }}>
      <Animated.View style={[styles.ggBtn, hasGG && styles.ggBtnActive, { transform: [{ scale }] }, disabled && { opacity: 0.4 }]}>
        <Text style={[styles.ggText, { color: hasGG ? COLORS.black : COLORS.gold }]}>GG</Text>
      </Animated.View>
      <Text style={{ color: hasGG ? COLORS.gold : COLORS.gray, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
        {count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Comments Sheet ───────────────────────────────────────────────────────────
function CommentsSheet({ visible, onClose, video, userProfile, onCommentAdded }) {
  const { getVideoComments, fetchComments, addComment } = useFeedStore();
  const [text, setText] = useState('');
  const comments = getVideoComments(video?.id);

  useEffect(() => {
    if (visible && video?.id) {
      const unsub = fetchComments(video.id);
      return () => unsub?.();
    }
  }, [visible, video?.id]);

  const send = () => {
    if (!text.trim() || !userProfile?.uid) return;
    addComment(video.id, text.trim(), userProfile);
    setText('');
    onCommentAdded?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Ionicons name="chatbubble-outline" size={14} color={COLORS.gold} />
            <Text style={styles.sheetHeaderText}> {comments.length} Comments</Text>
          </View>
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {comments.length === 0
              ? <Text style={styles.emptyComments}>No comments yet. Be the first! 👇</Text>
              : comments.map(c => {
                const cf = commentFrameStyle(c);
                const hasBorder = cf && cf.id !== 'none';
                return (
                  <View key={c.id} style={[
                    styles.commentRow,
                    hasBorder && { borderWidth: 1.5, borderColor: cf.color, borderRadius: 10, padding: 8 },
                  ]}>
                    <FramedAvatar user={c} size={26} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.commentUser}>{c.username}</Text>
                      <Text style={styles.commentText}>
                        {(c.text || '').split(/(@\w+)/g).map((part, i) =>
                          part.startsWith('@')
                            ? <Text key={i} style={{ color: COLORS.blue, fontWeight: '700' }}>{part}</Text>
                            : <Text key={i}>{part}</Text>
                        )}
                      </Text>
                    </View>
                  </View>
                );
              })
            }
          </ScrollView>
          <View style={styles.inputRow}>
            <FramedAvatar user={userProfile} size={26} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a comment..."
              placeholderTextColor={COLORS.gray}
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity onPress={send} disabled={!text.trim()} style={[styles.sendBtn, !text.trim() && { opacity: 0.4 }]}>
              <Ionicons name="send" size={14} color={COLORS.black} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VideoPlayerScreen({ navigation, route }) {
  const { video } = route?.params || {};
  const { user, userProfile } = useAuthStore();
  const { toggleGG, incrementView } = useFeedStore();

  const [isMuted, setIsMuted] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showComments, setShowComments] = useState(false);

  // Récupère l'état GG live depuis le store
  const liveVideo = useFeedStore(s => s.videos.find(v => v.id === video?.id));

  // Si la vidéo vient du profil (pas dans le store), charger GG + counts depuis Firestore
  const [localHasGG, setLocalHasGG] = useState(false);
  const [localGGCount, setLocalGGCount] = useState(video?.ggCount ?? 0);
  const [localCommentCount, setLocalCommentCount] = useState(video?.commentCount ?? 0);

  useEffect(() => {
    if (!video?.id || liveVideo) return; // si dans le store, pas besoin
    // Charger le doc vidéo pour avoir les counts à jour
    getDoc(doc(db, 'videos', video.id)).then(snap => {
      if (snap.exists()) {
        setLocalGGCount(snap.data().ggCount || 0);
        setLocalCommentCount(snap.data().commentCount || 0);
      }
    }).catch(() => {});
    // Vérifier si l'user a déjà GG cette vidéo
    if (user?.uid) {
      getDoc(doc(db, 'ggs', `${user.uid}_${video.id}`)).then(snap => {
        setLocalHasGG(snap.exists());
      }).catch(() => {});
    }
  }, [video?.id, user?.uid, liveVideo]);

  const hasGG = liveVideo ? (liveVideo.hasGG ?? false) : localHasGG;
  const ggCount = liveVideo ? (liveVideo.ggCount ?? video?.ggCount ?? 0) : localGGCount;
  const commentCount = liveVideo ? (liveVideo.commentCount ?? video?.commentCount ?? 0) : localCommentCount;

  // ── 5-second view timer ─────────────────────────────────────────────────────
  // A clip is only counted as "viewed" after 5 continuous seconds of watch time.
  // Scrolling past in 1-2 seconds = ignored (avoids polluting preference model).
  // On confirmed view: increments Firestore viewCount + updates local feed algo prefs.
  const viewTimerRef = useRef(null);
  const viewConfirmedRef = useRef(false);

  useEffect(() => {
    // Clear any previous timer when video changes
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    viewConfirmedRef.current = false;

    if (!video?.id) return;

    viewTimerRef.current = setTimeout(async () => {
      if (!viewConfirmedRef.current) {
        viewConfirmedRef.current = true;
        // Increment Firestore viewCount (deduped per session in the store)
        incrementView(video.id, user?.uid);
        // Update local preference model for recommendation algo
        await recordView(video);
      }
    }, 5000); // 5 seconds = intentional watch, not a scroll-past

    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    };
  }, [video?.id]);

  const player = useVideoPlayer(video?.videoUrl ? optimizeVideoUrl(video.videoUrl) : null, (p) => {
    p.loop = true;
    p.muted = false;
    p.timeUpdateEventInterval = 0.5;
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: player.currentTime || 0 });
  const duration = player.duration || 0;
  const position = currentTime || 0;
  const progress = duration ? Math.min(position / duration, 1) : 0;

  useEffect(() => { player.muted = isMuted; }, [isMuted]);

  useFocusEffect(useCallback(() => {
    return () => {
      try { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch (e) {}
      try { player.pause(); } catch (e) {}
    };
  }, []));

  const formatTime = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  };

  const toggleOrientation = async () => {
    if (!isLandscape) {
      setShowComments(false); // Fermer commentaires avant landscape (évite crash)
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
      setIsLandscape(true);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setIsLandscape(false);
    }
  };

  const handleBack = async () => {
    try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch (e) {}
    try { player.pause(); } catch (e) {}
    navigation.goBack();
  };

  const isOwnVideo = video?.userId === user?.uid;

  return (
    <View style={styles.container}>
      <CommentsSheet 
        visible={showComments} 
        onClose={() => setShowComments(false)} 
        video={video} 
        userProfile={userProfile}
        onCommentAdded={() => {
          if (!liveVideo) setLocalCommentCount(c => c + 1);
        }}
      />

      <View style={styles.videoArea}>
        {video?.videoUrl
          ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
          : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="game-controller" size={80} color={COLORS.gold} style={{ opacity: 0.15 }} />
            </View>
        }

        {/* Tap pour show/hide controls */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowControls(c => !c)} />

        {showControls && (
          <>
            {/* Top bar */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={handleBack} style={styles.iconBtn}>
                <Ionicons name="chevron-down" size={28} color={COLORS.white} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>{video?.title || video?.caption || ''}</Text>
              <TouchableOpacity onPress={() => setIsMuted(!isMuted)} style={styles.iconBtn}>
                <Ionicons name={isMuted ? 'volume-mute' : 'volume-medium'} size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            {/* Centre play/pause — masqué en landscape */}
            {!isLandscape && (
              <TouchableOpacity style={styles.centerBtn} onPress={() => { if (player.playing) player.pause(); else player.play(); }}>
                <View style={styles.playIcon}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color={COLORS.white} />
                </View>
              </TouchableOpacity>
            )}

            {/* Right side actions — masqué en landscape pour éviter crash + gêne */}
            {!isLandscape && (
              <View style={styles.sideBar}>
                <GGBtn
                  hasGG={hasGG}
                  count={ggCount}
                  onPress={() => {
                    toggleGG(video?.id, user?.uid);
                    // Si hors store, mettre à jour l'état local aussi
                    if (!liveVideo) {
                      setLocalHasGG(prev => {
                        setLocalGGCount(c => prev ? c - 1 : c + 1);
                        return !prev;
                      });
                    }
                  }}
                  disabled={isOwnVideo}
                />
                <TouchableOpacity onPress={() => { setShowComments(true); }} style={[styles.sideAction, { marginTop: 20 }]}>
                  <Ionicons name="chatbubble-outline" size={22} color={COLORS.white} />
                  <Text style={styles.sideActionText}>{commentCount}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Bottom bar */}
            <View style={styles.bottomBar}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                <View style={[styles.progressDot, { left: `${Math.min(progress * 100, 97)}%` }]} />
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.time}>{formatTime(position)}</Text>
                <TouchableOpacity onPress={toggleOrientation} style={styles.rotateBtn}>
                  <Ionicons name={isLandscape ? 'phone-portrait-outline' : 'phone-landscape-outline'} size={18} color={COLORS.white} />
                  <Text style={styles.rotateBtnText}>{isLandscape ? 'Portrait' : 'Landscape'}</Text>
                </TouchableOpacity>
                <Text style={styles.time}>{formatTime(duration)}</Text>
              </View>
              {!isLandscape && video?.game && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Ionicons name="game-controller-outline" size={12} color={COLORS.gold} />
                  <Text style={{ color: COLORS.gold, fontSize: 11, marginLeft: 4 }}>{video.game} · {video.console}</Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  videoArea: { flex: 1, backgroundColor: '#060610', position: 'relative' },
  topBar: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 30, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, zIndex: 10 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: COLORS.white, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  centerBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  sideBar: { position: 'absolute', right: 16, bottom: Platform.OS === 'ios' ? 110 : 90, alignItems: 'center', zIndex: 10 },
  sideAction: { alignItems: 'center' },
  sideActionText: { color: COLORS.white, fontSize: 11, fontWeight: '700', marginTop: 3 },
  ggBtn: { width: 56, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  ggBtnActive: { backgroundColor: COLORS.gold },
  ggText: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  bottomBar: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20, left: 0, right: 80, paddingHorizontal: 16, zIndex: 10 },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, position: 'relative', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: COLORS.gold, borderRadius: 2 },
  progressDot: { position: 'absolute', top: -5, width: 13, height: 13, borderRadius: 7, backgroundColor: COLORS.gold, marginLeft: -6 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  rotateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  rotateBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '700', marginLeft: 5 },
  // Comments sheet
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: { backgroundColor: COLORS.dark, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 30 : 12 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.gray2, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  sheetHeaderText: { fontSize: 13, color: COLORS.gold, fontWeight: '700' },
  emptyComments: { fontSize: 14, color: COLORS.gray, textAlign: 'center', marginVertical: 30 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  commentUser: { fontSize: 12, fontWeight: '700', color: COLORS.gold, marginBottom: 2 },
  commentText: { fontSize: 13, color: COLORS.white, lineHeight: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: COLORS.gray3 },
  input: { flex: 1, backgroundColor: COLORS.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: COLORS.white, marginHorizontal: 8 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
});

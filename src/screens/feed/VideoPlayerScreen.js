import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  KeyboardAvoidingView, TextInput, ScrollView, Modal,
  TouchableWithoutFeedback, Image, Animated, Share, Vibration, PanResponder,
  Dimensions, Alert,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getVideoUrl, getThumbnailUrl } from '../../config/mux';
import useFeedStore from '../../store/useFeedStore';
import useAuthStore from '../../store/useAuthStore';
import { db } from '../../config/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { ringColorForUser, commentFrameStyle } from '../../constants/frames';
import FramedAvatar from '../../components/FramedAvatar';
import CommentsSheet from '../../components/CommentsSheet';
import { recordView, loadPrefs } from '../../utils/feedAlgo';

const { width: SCREEN_W } = Dimensions.get('window');

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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VideoPlayerScreen({ navigation, route }) {
  const { video } = route?.params || {};
  const { user, userProfile } = useAuthStore();
  const { toggleGG, toggleGGDirect, incrementView } = useFeedStore();

  const [isMuted, setIsMuted] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = React.useRef(null);

  const showControlsTemporarily = React.useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  React.useEffect(() => {
    showControlsTemporarily();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [showControlsTemporarily]);

  const [showComments, setShowComments] = useState(false);

  // ─── Double tap + étoiles ─────────────────────────────────────────────────
  const lastTapRef = useRef(0);
  const [ggParticles, setGGParticles] = useState([]);
  const particleIdRef = useRef(0);

  const liveVideo = useFeedStore(s => s.videos.find(v => v.id === video?.id));

  const [localHasGG, setLocalHasGG] = useState(false);
  const [localGGCount, setLocalGGCount] = useState(video?.ggCount ?? 0);
  const [liveCommentCount, setLiveCommentCount] = useState(video?.commentCount ?? video?.commentsCount ?? 0);

  useEffect(() => {
    if (!video?.id) return;
    const unsub = onSnapshot(
      query(collection(db, 'comments'), where('videoId', '==', video.id)),
      (snap) => setLiveCommentCount(snap.size),
      () => {}
    );
    return () => unsub();
  }, [video?.id]);

  useEffect(() => {
    if (!video?.id || liveVideo) return;
    getDoc(doc(db, 'videos', video.id)).then(snap => {
      if (snap.exists()) setLocalGGCount(snap.data().ggCount || 0);
    }).catch(() => {});
    if (user?.uid) {
      getDoc(doc(db, 'ggs', `${user.uid}_${video.id}`)).then(snap => {
        setLocalHasGG(snap.exists());
      }).catch(() => {});
    }
  }, [video?.id, user?.uid, liveVideo]);

  const hasGG = liveVideo ? (liveVideo.hasGG ?? false) : localHasGG;
  const ggCount = liveVideo ? (liveVideo.ggCount ?? video?.ggCount ?? 0) : localGGCount;
  const commentCount = liveCommentCount;

  const viewTimerRef = useRef(null);
  const progressWidth = React.useRef(SCREEN_W);
  const viewConfirmedRef = useRef(false);

  useEffect(() => {
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    viewConfirmedRef.current = false;

    if (!video?.id) return;

    viewTimerRef.current = setTimeout(async () => {
      if (!viewConfirmedRef.current) {
        viewConfirmedRef.current = true;
        incrementView(video.id, user?.uid);
        await recordView(video);
      }
    }, 5000);

    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    };
  }, [video?.id]);

  const player = useVideoPlayer(video?.videoUrl ? getVideoUrl(video) : null, (p) => {
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
  }, [player]));

  const formatTime = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  };

  const toggleOrientation = async () => {
    if (!isLandscape) {
      setShowComments(false);
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

  // ─── Explosion d'étoiles au double tap ───────────────────────────────────
  const triggerGGParticles = (tapX, tapY) => {
    const id = particleIdRef.current++;
    const count = 8;
    const particles = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist  = 55 + Math.random() * 45;
      return {
        key: `${id}_${i}`,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        anim: new Animated.Value(0),
        emoji: i % 3 === 0 ? '✨' : '⭐',
        size: 16 + Math.floor(Math.random() * 14),
      };
    });
    // étoile centrale plus grosse
    const centerAnim = new Animated.Value(0);
    const group = { id, x: tapX, y: tapY, particles, centerAnim };
    setGGParticles(prev => [...prev, group]);

    Animated.parallel([
      Animated.timing(centerAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
      ...particles.map(p =>
        Animated.timing(p.anim, { toValue: 1, duration: 680 + Math.random() * 120, useNativeDriver: true })
      ),
    ]).start(() => {
      setGGParticles(prev => prev.filter(g => g.id !== id));
    });
  };

  // Ref vers handleBack pour le PanResponder (créé une seule fois)
  const handleBackRef = useRef(null);
  handleBackRef.current = handleBack;

  // ─── Swipe vers le bas pour fermer ───────────────────────────────────────
  const swipePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 && g.vy > 0.25) handleBackRef.current?.();
      },
    })
  ).current;

  // ─── Double tap : détection + GG + étoiles ───────────────────────────────
  // On utilise un délai 320ms sur le single tap pour que le double tap
  // soit détecté AVANT que le single tap s'exécute — évite le conflit pause/play
  const tapTimeoutRef = useRef(null);

  // ─── Cleanup tap timeout on unmount (NC16) ───────────────────────────────
  useEffect(() => {
    return () => { if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current); };
  }, []);

  const handleVideoTap = (evt) => {
    const now = Date.now();
    const { locationX, locationY } = evt.nativeEvent;

    if (now - lastTapRef.current < 320) {
      // Double tap confirmé — annule le single tap en attente
      if (tapTimeoutRef.current) { clearTimeout(tapTimeoutRef.current); tapTimeoutRef.current = null; }
      lastTapRef.current = 0; // reset pour éviter triple tap
      if (!isOwnVideo) {
        Vibration.vibrate(40);
        triggerGGParticles(locationX, locationY);
        if (liveVideo) {
          toggleGG(video?.id, user?.uid, liveVideo);
        } else if (!localHasGG) {
          setLocalHasGG(true);
          setLocalGGCount(c => c + 1);
          toggleGGDirect(video?.id, video?.userId, user?.uid, false, localGGCount)
            .then(r => { if (r) { setLocalHasGG(r.hasGG); setLocalGGCount(r.ggCount); } })
            .catch(() => {});
        }
      }
    } else {
      // Single tap — on attend 320ms pour voir si un 2e tap arrive
      lastTapRef.current = now;
      tapTimeoutRef.current = setTimeout(() => {
        tapTimeoutRef.current = null;
        showControlsTemporarily();
      }, 320);
    }
  };

  return (
    <View style={styles.container} {...swipePanResponder.panHandlers}>
      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        video={video}
        userProfile={userProfile}
        onCommentAdded={() => {}}
      />

      <View style={styles.videoArea}>
        {video?.videoUrl
          ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
          : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="game-controller" size={80} color={COLORS.gold} style={{ opacity: 0.15 }} />
            </View>
        }

        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleVideoTap} />

        {showControls && (
          <>
            <View style={styles.topBar}>
              <TouchableOpacity onPress={handleBack} style={styles.iconBtn}>
                <Ionicons name="chevron-down" size={28} color={COLORS.white} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>{video?.title || video?.caption || ''}</Text>
              <TouchableOpacity onPress={() => setIsMuted(!isMuted)} style={styles.iconBtn}>
                <Ionicons name={isMuted ? 'volume-mute' : 'volume-medium'} size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            {!isLandscape && (
              <TouchableOpacity style={styles.centerBtn} onPress={() => { if (player.playing) player.pause(); else player.play(); }}>
                <View style={styles.playIcon}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color={COLORS.white} />
                </View>
              </TouchableOpacity>
            )}

            {!isLandscape && (
              <View style={styles.sideBar}>
                <GGBtn
                  hasGG={hasGG}
                  count={ggCount}
                  onPress={async () => {
                    if (!user) {
                      Alert.alert('Connecte-toi', 'Crée un compte pour GG ce clip !', [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Se connecter', onPress: () => useAuthStore.getState().exitGuestMode() },
                      ]);
                      return;
                    }
                    Vibration.vibrate(40);
                    if (liveVideo) {
                      toggleGG(video?.id, user?.uid, liveVideo);
                    } else {
                      const prevHasGG = localHasGG;
                      const prevCount = localGGCount;
                      setLocalHasGG(!prevHasGG);
                      setLocalGGCount(prevHasGG ? Math.max(0, prevCount - 1) : prevCount + 1);
                      const result = await toggleGGDirect(
                        video?.id, video?.userId, user?.uid, prevHasGG, prevCount
                      );
                      if (result) {
                        setLocalHasGG(result.hasGG);
                        setLocalGGCount(result.ggCount);
                      } else {
                        setLocalHasGG(prevHasGG);
                        setLocalGGCount(prevCount);
                      }
                    }
                  }}
                  disabled={isOwnVideo}
                />
                <TouchableOpacity
                  onPress={() => {
                    if (!user) {
                      Alert.alert('Connecte-toi', 'Crée un compte pour commenter !', [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Se connecter', onPress: () => useAuthStore.getState().exitGuestMode() },
                      ]);
                      return;
                    }
                    setShowComments(true);
                  }}
                  style={[styles.sideAction, { marginTop: 20 }]}>
                  <Ionicons name="chatbubble-outline" size={22} color={COLORS.white} />
                  <Text style={styles.sideActionText}>{commentCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Share.share({
                    message: `Check out this clip on Gaming Actions! 🎮\nhttps://gamingactions.app/clip/${video?.id}`,
                  })}
                  style={[styles.sideAction, { marginTop: 20 }]}
                >
                  <Ionicons name="share-social-outline" size={22} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.bottomBar}>
              <TouchableOpacity
                activeOpacity={1}
                onLayout={(e) => { progressWidth.current = e.nativeEvent.layout.width; }}
                onPress={(e) => {
                  const w = progressWidth.current || 1;
                  const fraction = Math.max(0, Math.min(1, e.nativeEvent.locationX / w));
                  try {
                    const targetTime = fraction * duration;
                    const delta = targetTime - (player.currentTime ?? 0);
                    player.seekBy(delta);
                  } catch {}
                  showControlsTemporarily();
                }}
                style={[styles.progressTrack, { paddingVertical: 10, marginVertical: -10 }]}
              >
                <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, position: 'relative' }}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  <View style={[styles.progressDot, { left: `${Math.min(progress * 100, 97)}%` }]} />
                </View>
              </TouchableOpacity>
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
                  <Text style={{ color: COLORS.gold, fontSize: 11, marginLeft: 4 }}>{video.game}{video.console ? ` · ${video.console}` : ''}</Text>
                </View>
              )}
              {!isLandscape && (video?.caption || video?.description) && (
                <Text numberOfLines={2} style={{ color: COLORS.white, fontSize: 11, marginTop: 4, opacity: 0.85, lineHeight: 15 }}>
                  {video.caption || video.description}
                </Text>
              )}
            </View>
          </>
        )}

        {/* ── Explosion d'étoiles double tap ── */}
        {ggParticles.map(group => {
          const centerScale = group.centerAnim.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [0.3, 1.8, 1.2, 0] });
          const centerOpacity = group.centerAnim.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] });
          return (
            <View key={group.id} style={{ position: 'absolute', left: group.x, top: group.y }} pointerEvents="none">
              {/* Étoile centrale */}
              <Animated.Text style={{
                position: 'absolute', fontSize: 36, marginLeft: -18, marginTop: -18,
                transform: [{ scale: centerScale }], opacity: centerOpacity,
              }}>⭐</Animated.Text>
              {/* Particules qui explosent */}
              {group.particles.map(p => {
                const scale   = p.anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1.4, 0.2] });
                const opacity = p.anim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] });
                const tx      = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.tx] });
                const ty      = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.ty] });
                return (
                  <Animated.Text key={p.key} style={{
                    position: 'absolute', fontSize: p.size,
                    marginLeft: -p.size / 2, marginTop: -p.size / 2,
                    transform: [{ translateX: tx }, { translateY: ty }, { scale }],
                    opacity,
                  }}>{p.emoji}</Animated.Text>
                );
              })}
            </View>
          );
        })}
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

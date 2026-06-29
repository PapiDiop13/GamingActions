/**
 * ProfileFeedScreen.js
 * Feed vertical swipeable depuis le profil — utilise expo-video comme le feed principal
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, FlatList, StyleSheet, Dimensions, Platform,
  TouchableOpacity, Text, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { doc, getDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import useFeedStore from '../../store/useFeedStore';
import { db } from '../../config/firebase';
import { getVideoUrl } from '../../config/mux';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

function ProfileVideoItem({ video, isActive, navigation }) {
  const { user } = useAuthStore();
  const { userProfiles, toggleGGDirect } = useFeedStore();
  const [hasGG, setHasGG] = useState(video?.hasGG ?? false);
  const [ggCount, setGGCount] = useState(video?.ggCount ?? 0);

  // Vérifie le vrai statut GG depuis Firestore (les vidéos de profil n'ont pas hasGG)
  useEffect(() => {
    if (!user?.uid || !video?.id || video?.userId === user?.uid) return;
    getDoc(doc(db, 'ggs', `${user.uid}_${video.id}`))
      .then(snap => { if (snap.exists()) setHasGG(true); })
      .catch(() => {});
  }, [user?.uid, video?.id]);

  const player = useVideoPlayer(
    isActive && video?.videoUrl ? getVideoUrl(video) : null,
    (p) => { p.loop = true; }
  );

  React.useEffect(() => {
    if (!player) return;
    if (isActive) { try { player.play(); } catch {} }
    else { try { player.pause(); } catch {} }
    return () => {
      try { player.pause(); } catch {}
    };
  }, [isActive]);

  const handleGG = async () => {
    if (!user?.uid) {
      Alert.alert('Connecte-toi', 'Crée un compte pour GG ce clip !', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se connecter', onPress: () => navigation.navigate('Auth') },
      ]);
      return;
    }
    if (video?.userId === user?.uid) return;
    // Optimistic UI local
    const prevHasGG = hasGG;
    const prevCount = ggCount;
    const newHasGG = !hasGG;
    const newCount = newHasGG ? ggCount + 1 : Math.max(0, ggCount - 1);
    setHasGG(newHasGG);
    setGGCount(newCount);

    // Source unique : on écrit seulement le doc ggs via le store.
    // Le trigger serveur onGGWritten recompte counts/points/streak et notifie.
    const result = await toggleGGDirect(video.id, video.userId, user.uid, prevHasGG, prevCount);
    if (!result) {
      // Rollback si l'écriture a échoué
      setHasGG(prevHasGG);
      setGGCount(prevCount);
    }
  };

  return (
    <View style={{ height: SCREEN_H, width: SCREEN_W, backgroundColor: '#000' }}>
      {isActive && player ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#060610' }} />
      )}

      {/* Bottom overlay */}
      <View style={st.overlay} pointerEvents="box-none">
        <View style={st.info} pointerEvents="none">
          <Text style={st.title} numberOfLines={2}>{video?.title || video?.caption || 'Untitled'}</Text>
          <Text style={st.username}>@{video?.username}</Text>
        </View>
        <View style={st.actions} pointerEvents="box-none">
          <TouchableOpacity onPress={handleGG} style={st.actionBtn} disabled={video?.userId === user?.uid}>
            <View style={[st.ggBtn, hasGG && st.ggBtnActive]}>
              <Text style={[st.ggText, { color: hasGG ? '#000' : COLORS.gold }]}>GG</Text>
            </View>
            <Text style={st.actionCount}>{ggCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!user?.uid) {
                Alert.alert('Connecte-toi', 'Crée un compte pour commenter !', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Se connecter', onPress: () => navigation.navigate('Auth') },
                ]);
                return;
              }
              navigation.navigate('Comments', { video });
            }}
            style={st.actionBtn}
          >
            <Ionicons name="chatbubble-outline" size={28} color={COLORS.white} />
            <Text style={st.actionCount}>{video?.commentsCount || video?.commentCount || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ProfileFeedScreen({ route, navigation }) {
  const { videos = [], startIndex = 0, username } = route?.params || {};
  const flatRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(startIndex);

  useFocusEffect(useCallback(() => {
    if (flatRef.current && startIndex > 0) {
      setTimeout(() => {
        flatRef.current?.scrollToIndex({ index: startIndex, animated: false });
      }, 100);
    }
  }, []));

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  return (
    <View style={st.container}>
      {/* Back button */}
      <View style={st.backBtn} pointerEvents="box-none">
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backTouch}>
          <Ionicons name="chevron-down" size={22} color={COLORS.white} />
          <Text style={st.backLabel}>{username || 'Profile'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatRef}
        data={videos}
        keyExtractor={item => item.id}
        pagingEnabled
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        initialScrollIndex={startIndex}
        onScrollToIndexFailed={() => {}}
        getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <ProfileVideoItem
            video={item}
            isActive={index === activeIndex}
            navigation={navigation}
          />
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 30,
    left: 16,
    zIndex: 100,
  },
  backTouch: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, gap: 6,
  },
  backLabel: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  overlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  info: { flex: 1, marginRight: 12 },
  title: { color: COLORS.white, fontSize: 14, fontWeight: '700', marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  username: { color: COLORS.gray, fontSize: 12 },
  actions: { alignItems: 'center', gap: 18 },
  actionBtn: { alignItems: 'center' },
  actionCount: { color: COLORS.white, fontSize: 11, fontWeight: '700', marginTop: 3 },
  ggBtn: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, borderColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  ggBtnActive: { backgroundColor: COLORS.gold },
  ggText: { fontSize: 13, fontWeight: '900' },
});

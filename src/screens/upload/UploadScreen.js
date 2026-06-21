import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { uploadToCloudinary, CLOUDINARY_FOLDERS } from '../../config/cloudinary';
import { db } from '../../config/firebase';
import { useVideoPlayer, VideoView } from 'expo-video';
import ConsoleIcon from '../../components/ConsoleIcon';
import { awardPoints, POINTS } from '../../utils/points';
import { VIDEO_FRAMES, getVideoFrameById } from '../../constants/frames';
import { setUploadState } from '../feed/FeedScreen';
import { globalNavigate } from '../../utils/navigationRef';
import * as StoreReview from 'expo-store-review';
import { logError, logEvent, LOG_CONTEXT } from '../../utils/errorLogger';

const GREEN = '#00C853';

import { GAMES } from '../../constants/games';

const GENRES_WITH_GAMES = [
  { id: 'all', label: 'All Games', icon: '🎮', games: GAMES.map(g => g.name) },
  { id: 'fps', label: 'FPS', icon: '🎯', games: GAMES.filter(g => g.genre === 'fps').map(g => g.name) },
  { id: 'sports', label: 'Sports', icon: '⚽', games: GAMES.filter(g => g.genre === 'sports').map(g => g.name) },
  { id: 'battle_royale', label: 'Battle Royale', icon: '🏆', games: GAMES.filter(g => g.genre === 'battle_royale').map(g => g.name) },
  { id: 'rpg', label: 'RPG', icon: '⚔️', games: GAMES.filter(g => g.genre === 'rpg').map(g => g.name) },
  { id: 'action', label: 'Action', icon: '💥', games: GAMES.filter(g => g.genre === 'action').map(g => g.name) },
  { id: 'adventure', label: 'Adventure', icon: '🗺️', games: GAMES.filter(g => g.genre === 'adventure').map(g => g.name) },
  { id: 'moba', label: 'MOBA', icon: '🧙', games: GAMES.filter(g => g.genre === 'moba').map(g => g.name) },
  { id: 'racing', label: 'Racing', icon: '🏎️', games: GAMES.filter(g => g.genre === 'racing').map(g => g.name) },
  { id: 'fighting', label: 'Fighting', icon: '🥊', games: GAMES.filter(g => g.genre === 'fighting').map(g => g.name) },
  { id: 'strategy', label: 'Strategy', icon: '♟️', games: GAMES.filter(g => g.genre === 'strategy').map(g => g.name) },
  { id: 'other', label: 'Other', icon: '🎮', games: GAMES.filter(g => g.genre === 'other').map(g => g.name) },
];

const CONSOLES = [
  { id: 'ps5', label: 'PS5', emoji: '🎮' },
  { id: 'ps4', label: 'PS4', emoji: '🎮' },
  { id: 'xbox', label: 'Xbox', emoji: '🟢' },
  { id: 'pc', label: 'PC', emoji: '🖥️' },
  { id: 'switch', label: 'Switch', emoji: '🕹️' },
  { id: 'mobile', label: 'Mobile', emoji: '📱' },
];

function StepIndicator({ step }) {
  return (
    <View style={styles.stepIndicator}>
      <View style={[styles.stepDot, step >= 1 && styles.stepDotActive, step > 1 && styles.stepDotDone]} />
      <View style={[styles.stepLine, step > 1 && styles.stepLineDone]} />
      <View style={[styles.stepDot, step >= 2 && styles.stepDotActive, step > 2 && styles.stepDotDone]} />
      <View style={[styles.stepLine, step > 2 && styles.stepLineDone]} />
      <View style={[styles.stepDot, step >= 3 && styles.stepDotActive]} />
    </View>
  );
}

export default function UploadScreen({ navigation, route }) {
  const { user, userProfile } = useAuthStore();
  const contentType = route?.params?.contentType || 'clip';

  const isLegendaryUser = userProfile?.plan === 'legendary' || userProfile?.accountType === 'admin';

  const [step, setStep] = useState(1);
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [customGame, setCustomGame] = useState('');
  const [showCustomGame, setShowCustomGame] = useState(false);
  const [gameSearch, setGameSearch] = useState('');
  const [selectedConsole, setSelectedConsole] = useState(null);
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [videoFrame, setVideoFrame] = useState('none');
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [customGamesFromDB, setCustomGamesFromDB] = useState([]);

  // Charge les jeux ajoutés via l'admin depuis Firestore
  useEffect(() => {
    getDocs(query(collection(db, 'custom_games'), orderBy('addedAt', 'desc')))
      .then(snap => setCustomGamesFromDB(snap.docs.map(d => ({ name: d.data().name, genre: d.data().genre }))))
      .catch(() => {});
  }, []);
  // Frames disponibles = free + celles achetées dans le Shop
  // Fusionne les jeux statiques + ceux ajoutés via admin
  const ownedVideoFrames = userProfile?.ownedVideoFrames || [];
  const allCustomNames = customGamesFromDB.map(g => g.name);
  const GENRES_WITH_ALL = GENRES_WITH_GAMES.map(g => {
    if (g.id === 'all') return { ...g, games: [...g.games, ...allCustomNames] };
    const extra = customGamesFromDB.filter(cg => cg.genre === g.id).map(cg => cg.name);
    return { ...g, games: [...g.games, ...extra] };
  });
  const availableFrames = VIDEO_FRAMES.filter(f => !f.exclusive && (f.free || ownedVideoFrames.includes(f.id)));
  const [isFanbaseExclusive, setIsFanbaseExclusive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoUri, setVideoUri] = useState(null);

  // Preview expo-video (muet, sans lecture auto). Suit la vidéo locale sélectionnée.
  const previewPlayer = useVideoPlayer(videoUri || null, (p) => { p.muted = true; });
  useEffect(() => {
    if (videoUri) { try { previewPlayer.replace(videoUri); } catch (e) {} }
  }, [videoUri]);

  const currentGenre = GENRES_WITH_ALL.find(g => g.id === selectedGenre);
  const currentGames = currentGenre?.games || [];
  const filteredGames = gameSearch.length > 0
    ? currentGames.filter(g => g.toLowerCase().includes(gameSearch.toLowerCase()))
    : currentGames;

  const handlePickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission required', 'Please allow access to your gallery.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: isLegendaryUser ? 120 : 60,
      quality: 1,
    });
    if (!result.canceled) {
        const asset = result.assets[0];
        // duration peut être en ms ou en secondes selon la version d'expo
        const durationInSeconds = asset.duration > 1000 ? asset.duration / 1000 : asset.duration;
        if (durationInSeconds && durationInSeconds < 8) {
          return Alert.alert('Too Short', 'Video must be at least 10 seconds long to prevent spam.');
        }
        if (durationInSeconds && durationInSeconds > (isLegendaryUser ? 120 : 60)) {
          return Alert.alert(
            'Too long',
            isLegendaryUser
              ? 'Legendary clips must be under 2 minutes. 👑'
              : `Clips must be under 60 seconds.\nUpgrade to Legendary for 2 min clips! 👑`
          );
        }
        // Utilise l'URI trimmé si disponible, sinon l'URI original
        const finalUri = asset.uri;
        setVideoUri(finalUri);
      }
  };


  const WEEKLY_UPLOAD_LIMIT = 50;

  const handlePublish = async () => {
    const game = showCustomGame ? customGame.trim() : selectedGame;
    if (!title.trim() && !caption.trim()) return Alert.alert('Missing', 'Please add a title for your clip.');
    if (!game) return Alert.alert('Missing', 'Please select or enter a game.');
    if (!selectedConsole) return Alert.alert('Missing', 'Please select your console.');
    if (!videoUri) return Alert.alert('Missing', 'Please select a video.');

    // ─── Limite : 50 uploads max par utilisateur sur une fenêtre glissante de 7 jours ───
    // (filtrage côté client pour éviter d'imposer un index composite Firestore)
    if (user?.uid) {
      try {
        const snap = await getDocs(query(collection(db, 'videos'), where('userId', '==', user.uid)));
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentCount = snap.docs.filter((d) => {
          const ts = d.data().createdAt;
          const ms = ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : 0);
          return ms >= weekAgo;
        }).length;
        if (recentCount >= WEEKLY_UPLOAD_LIMIT) {
          await logEvent(LOG_CONTEXT.UPLOAD_LIMIT, { recentCount }, user?.uid);
          return Alert.alert(
            'Weekly limit reached',
            `You can upload up to ${WEEKLY_UPLOAD_LIMIT} videos per week. You've hit the limit — please try again in a few days. 🎮`
          );
        }
      } catch (e) {
        // En cas d'échec du check, on laisse passer (on ne bloque pas l'utilisateur par erreur réseau)
      }
    }

    setUploading(true);
    setUploadState({ isUploading: true, progress: 0 });
    await logEvent(LOG_CONTEXT.UPLOAD_START, { contentType, game, console: selectedConsole }, user?.uid);
  
    const destTab = contentType === 'clip' ? 'Feed' : 'Tips';
  
    // L'upload continue en arrière-plan
    try {
      const folder = isFanbaseExclusive
        ? CLOUDINARY_FOLDERS.exclusives
        : contentType === 'flashtuto'
        ? CLOUDINARY_FOLDERS.flashtutos
        : contentType === 'flashinfo'
        ? CLOUDINARY_FOLDERS.flashinfos
        : CLOUDINARY_FOLDERS.clips;
  
      const uploaded = await uploadToCloudinary(videoUri, folder, null, isLegendaryUser);

      // Si l'utilisateur a saisi un jeu custom, l'ajouter à la liste partagée (s'il n'existe pas déjà)
      if (showCustomGame && customGame.trim()) {
        try {
          const exists = await getDocs(query(collection(db, 'custom_games'), where('name', '==', customGame.trim())));
          const existsStatic = GAMES.some(g => g.name.toLowerCase() === customGame.trim().toLowerCase());
          if (exists.empty && !existsStatic) {
            await addDoc(collection(db, 'custom_games'), {
              name: customGame.trim(),
              genre: selectedGenre || 'other',
              addedAt: serverTimestamp(),
              addedBy: user?.uid || 'user',
            });
          }
        } catch (e) {}
      }

      // Extract hashtags from title + caption for search indexing
      const allText = (title.trim() + ' ' + caption).toLowerCase();
      const hashtagMatches = allText.match(/#(\w+)/g) || [];
      const hashtags = [...new Set(hashtagMatches.map(h => h.slice(1)))];

      await addDoc(collection(db, 'videos'), {
        userId: user?.uid,
        username: userProfile?.username || 'PLAYER',
        avatar: userProfile?.avatar || '',
        title: title.trim(),
        caption,
        hashtags, // indexed array for HashtagScreen queries
        game,
        genre: selectedGenre,
        console: selectedConsole,
        contentType,
        videoFrame,
        isLegendaryFrame: videoFrame !== 'none',
        isFanbaseExclusive,
        videoUrl: uploaded.url,
        thumbnail: uploaded.thumbnail,
        publicId: uploaded.publicId,
        duration: uploaded.duration || 0,
        ggCount: 0,
        commentsCount: 0,
        viewCount: 0,
        createdAt: serverTimestamp(),
        // randomOrder: timestamp-seeded unique value for feed shuffle.
        // Using Date.now() as base + random suffix ensures no two videos
        // ever get the same value, even if uploaded simultaneously.
        // Cloud Function reshuffles all values every 6h for true feed variety.
        randomOrder: Date.now() + Math.floor(Math.random() * 100000),
      });
  
      setUploadState({ isUploading: false, progress: 0 });
      if (user?.uid) await awardPoints(user.uid, POINTS.POST_CLIP, 0, 'Posted a clip');
      await logEvent(LOG_CONTEXT.UPLOAD_SUCCESS, { contentType, game }, user?.uid);

      // Store review — Apple gère la fréquence (max 3x/an), on demande à chaque upload
      try {
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) await StoreReview.requestReview();
      } catch (e) {}

      // Pop le stack upload pour revenir à ContentType (tab bar visible)
      try { navigation.popToTop(); } catch (e) {}

      Alert.alert(
        '✅ Published!',
        'Your content is now live. +50 GA Points earned! 🎮',
        [
          { text: 'Go to Feed', onPress: () => { try { globalNavigate('Feed'); } catch(e) {} }},
          { text: 'My Profile', onPress: () => { try { globalNavigate('Feed', { screen: 'UserProfile', params: { userId: user?.uid } }); } catch(e) {} }},
        ]
      );
  
    } catch (e) {
      setUploadState({ isUploading: false, progress: 0 });
      await logError(LOG_CONTEXT.UPLOAD_FAIL, e, user?.uid);
      Alert.alert('❌ Upload failed', 'Something went wrong. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ─── STEP 1 — Genre ───────────────────────────────────
  if (step === 1) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Genre</Text>
          <View style={{ width: 24 }} />
        </View>
        <StepIndicator step={1} />
        <Text style={styles.stepLabel}>Step 1 of 3 — What type of game?</Text>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100 }}>
          <TouchableOpacity
            onPress={() => { setSelectedGenre('all'); setGameSearch(''); setStep(2); }}
            style={[styles.genreCard, { width: '100%', flexDirection: 'row', justifyContent: 'center', marginBottom: 12 }]}
            activeOpacity={0.8}
          >
            <Text style={styles.genreEmoji}>🎮</Text>
            <Text style={[styles.genreLabel, { marginLeft: 10 }]}>All Games</Text>
          </TouchableOpacity>
          <View style={styles.genreGrid}>
            {GENRES_WITH_ALL.filter(g => g.id !== 'all').map((genre) => (
              <TouchableOpacity
                key={genre.id}
                onPress={() => { setSelectedGenre(genre.id); setGameSearch(''); setStep(2); }}
                style={styles.genreCard}
                activeOpacity={0.8}
              >
                <Text style={styles.genreEmoji}>{genre.icon}</Text>
                <Text style={styles.genreLabel}>{genre.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── STEP 2 — Game ───────────────────────────────────
  if (step === 2) {
    const genreLabel = selectedGenre === 'all' ? 'All Games' : currentGenre?.label;
    const genreIcon = selectedGenre === 'all' ? '🎮' : currentGenre?.icon;
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setStep(1); setSelectedGenre(null); setGameSearch(''); }}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{genreIcon} {genreLabel}</Text>
          <View style={{ width: 24 }} />
        </View>
        <StepIndicator step={2} />
        <Text style={styles.stepLabel}>Step 2 of 3 — Which game?</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={COLORS.gray} />
          <TextInput
            value={gameSearch}
            onChangeText={setGameSearch}
            placeholder="Search game..."
            placeholderTextColor={COLORS.gray}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {gameSearch.length > 0 && (
            <TouchableOpacity onPress={() => setGameSearch('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100 }}>
        {filteredGames.map((game, index) => (
  <TouchableOpacity
    key={`${game}_${index}`}
              onPress={() => { setSelectedGame(game); setShowCustomGame(false); setStep(3); }}
              style={styles.gameRow}
              activeOpacity={0.8}
            >
              <Ionicons name="game-controller-outline" size={18} color={COLORS.gold} />
              <Text style={styles.gameLabel}>{game}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
            </TouchableOpacity>
          ))}
          {filteredGames.length === 0 && gameSearch.length > 0 && (
            <Text style={{ color: COLORS.gray, textAlign: 'center', marginTop: 20, fontSize: 13 }}>
              No game found for "{gameSearch}"
            </Text>
          )}
          <TouchableOpacity
            onPress={() => setShowCustomGame(!showCustomGame)}
            style={[styles.gameRow, { borderColor: COLORS.gold + '40', backgroundColor: 'rgba(201,168,76,0.06)', marginTop: 8 }]}
          >
            <Ionicons name="add-circle-outline" size={18} color={COLORS.gold} />
            <Text style={[styles.gameLabel, { color: COLORS.gold }]}>My game is not listed</Text>
          </TouchableOpacity>
          {showCustomGame && (
            <View style={styles.customGameWrap}>
              <TextInput
                value={customGame}
                onChangeText={setCustomGame}
                placeholder="Enter game name..."
                placeholderTextColor={COLORS.gray}
                style={styles.customGameInput}
                autoFocus
              />
              <TouchableOpacity
                onPress={() => { if (customGame.trim()) { setSelectedGame(customGame.trim()); setStep(3); } }}
                style={[styles.customGameBtn, !customGame.trim() && { opacity: 0.4 }]}
                disabled={!customGame.trim()}
              >
                <Text style={styles.customGameBtnText}>Continue →</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── STEP 3 — Details ────────────────────────────────
  const genreIcon = selectedGenre === 'all' ? '🎮' : currentGenre?.icon;
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep(2)}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {contentType === 'clip' ? 'Clip Details' : contentType === 'flashtuto' ? 'FlashTuto Details' : contentType === 'flashinfo' ? 'FlashInfo Details' : 'GameInDev Details'}
        </Text>
        <TouchableOpacity onPress={handlePublish} style={[styles.publishBtn, uploading && { opacity: 0.6 }]} disabled={uploading}>
          <Text style={styles.publishBtnText}>{uploading ? 'Uploading...' : 'Publish'}</Text>
        </TouchableOpacity>
      </View>
      <StepIndicator step={3} />
      <Text style={styles.stepLabel}>Step 3 of 3 — Finalize</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
      <TouchableOpacity
  style={[styles.videoArea, isFanbaseExclusive && { borderColor: GREEN, borderWidth: 2 }, videoUri && { borderColor: COLORS.green, borderStyle: 'solid' }]}
  activeOpacity={0.85}
  onPress={handlePickVideo}
>
  {videoUri ? (
    <View style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}>
      <VideoView
        player={previewPlayer}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark-circle" size={44} color={COLORS.green} />
        <Text style={[styles.videoAreaText, { color: COLORS.green }]}>Video selected ✓</Text>
        <Text style={styles.videoAreaSub}>Tap to change</Text>
      </View>
    </View>
  ) : (
    <>
      <Ionicons name="cloud-upload-outline" size={44} color={isFanbaseExclusive ? GREEN : COLORS.gold} style={{ opacity: 0.7 }} />
      <Text style={[styles.videoAreaText, isFanbaseExclusive && { color: GREEN }]}>
        {isFanbaseExclusive ? '🔒 Exclusive — Tap to select video' : 'Tap to select video'}
      </Text>
      <Text style={styles.videoAreaSub}>MP4, MOV · Max 500MB</Text>
    </>
  )}
</TouchableOpacity>

        <View style={styles.selectedInfo}>
          <Text style={styles.selectedInfoEmoji}>{genreIcon}</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.gray2} style={{ marginHorizontal: 4 }} />
          <View style={styles.selectedChip}>
            <Ionicons name="game-controller-outline" size={12} color={COLORS.gold} />
            <Text style={styles.selectedChipText}>{selectedGame || customGame}</Text>
          </View>
          <TouchableOpacity onPress={() => setStep(2)} style={{ marginLeft: 8 }}>
            <Ionicons name="pencil-outline" size={14} color={COLORS.gray} />
          </TouchableOpacity>
        </View>

        {/* Video Frame Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>VIDEO FRAME</Text>
          <TouchableOpacity
            onPress={() => setShowFramePicker(!showFramePicker)}
            style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 0, paddingVertical: 12 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: getVideoFrameById(videoFrame)?.color || COLORS.gray3, marginRight: 8 }} />
              <Text style={{ color: videoFrame !== 'none' ? COLORS.white : COLORS.gray, fontSize: 14 }}>
                {getVideoFrameById(videoFrame)?.name || 'No Frame'}
              </Text>
            </View>
            <Ionicons name={showFramePicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gray} />
          </TouchableOpacity>
          {showFramePicker && (
            <View style={{ backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, marginTop: 8, overflow: 'hidden' }}>
              {availableFrames.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => { setVideoFrame(f.id); setShowFramePicker(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, backgroundColor: videoFrame === f.id ? 'rgba(201,168,76,0.08)' : 'transparent' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 22, height: 14, borderWidth: 2, borderColor: f.color, marginRight: 10, backgroundColor: f.glow ? f.color + '22' : 'transparent', borderRadius: 3 }} />
                    <View>
                      <Text style={{ fontSize: 13, color: videoFrame === f.id ? COLORS.gold : COLORS.white, fontWeight: '600' }}>{f.name}</Text>
                      <Text style={{ fontSize: 10, color: COLORS.gray }}>{f.desc}</Text>
                    </View>
                  </View>
                  {videoFrame === f.id && <Ionicons name="checkmark" size={16} color={COLORS.gold} />}
                </TouchableOpacity>
              ))}
              {availableFrames.length <= 1 && (
                <View style={{ padding: 14 }}>
                  <Text style={{ fontSize: 12, color: COLORS.gray, textAlign: 'center' }}>
                    Buy video frames in the Shop to unlock more options 🎨
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {contentType !== 'clip' && (
          <TouchableOpacity
            onPress={() => setIsFanbaseExclusive(!isFanbaseExclusive)}
            style={[styles.toggle_row, isFanbaseExclusive && styles.toggle_rowGreen]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={GREEN} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.toggle_title}>Fanbase Exclusive 🔒</Text>
              <Text style={styles.toggle_sub}>Only visible to your fanbase subscribers</Text>
            </View>
            <View style={[styles.toggleTrack, isFanbaseExclusive && styles.toggleTrackGreen]}>
              <View style={[styles.toggleThumb, isFanbaseExclusive && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TITLE</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Give your clip a title..."
            placeholderTextColor={COLORS.gray}
            style={styles.input}
            maxLength={60}
          />
          <Text style={styles.charCount}>{title.length}/60</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DESCRIPTION</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Describe your content..."
            placeholderTextColor={COLORS.gray}
            style={styles.input}
            multiline
            maxLength={150}
          />
          <Text style={styles.charCount}>{caption.length}/150</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CONSOLE</Text>
          <View style={styles.consoleGrid}>
            {CONSOLES.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setSelectedConsole(c.id)}
                style={[styles.consoleChip, selectedConsole === c.id && styles.consoleChipActive]}
              >
                <ConsoleIcon id={c.id} size={16} style={{ marginRight: 5 }} />
                <Text style={[styles.consoleLabel, selectedConsole === c.id && { color: COLORS.gold }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={isFanbaseExclusive ? GREEN : COLORS.gold} />
          <Text style={styles.infoText}>
            {isFanbaseExclusive
              ? '🔒 This content will only be visible in your Fanbase — not in the public feed.'
              : 'Your content will appear after review. GG rewards calculated every 24h.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white, flex: 1, textAlign: 'center' },
  publishBtn: { backgroundColor: COLORS.gold, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  publishBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.gray3 },
  stepDotActive: { backgroundColor: COLORS.gold, width: 12, height: 12, borderRadius: 6 },
  stepDotDone: { backgroundColor: COLORS.green },
  stepLine: { width: 60, height: 2, backgroundColor: COLORS.gray3 },
  stepLineDone: { backgroundColor: COLORS.green },
  stepLabel: { fontSize: 12, color: COLORS.gray, textAlign: 'center', marginBottom: 12 },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  genreCard: { width: '48%', backgroundColor: COLORS.card, borderRadius: 14, padding: 18, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 12 },
  genreEmoji: { fontSize: 32, marginBottom: 8 },
  genreLabel: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 12, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.white, paddingVertical: 11, marginLeft: 8 },
  gameRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 10 },
  gameLabel: { flex: 1, fontSize: 14, color: COLORS.white, fontWeight: '500', marginLeft: 10 },
  customGameWrap: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gold, marginBottom: 10 },
  customGameInput: { fontSize: 14, color: COLORS.white, marginBottom: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, paddingBottom: 8 },
  customGameBtn: { backgroundColor: COLORS.gold, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  customGameBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.black },
  selectedInfo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  selectedInfoEmoji: { fontSize: 18 },
  selectedChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: COLORS.gold },
  selectedChipText: { fontSize: 12, color: COLORS.gold, fontWeight: '600', marginLeft: 5 },
  videoArea: { margin: 14, height: 180, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.gray3, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  videoAreaText: { fontSize: 15, fontWeight: '700', color: COLORS.white, marginTop: 10 },
  videoAreaSub: { fontSize: 11, color: COLORS.gray, marginTop: 4 },
  toggle_row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 10, padding: 14, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  toggle_rowGold: { borderColor: COLORS.gold, backgroundColor: 'rgba(201,168,76,0.06)' },
  toggle_rowGreen: { borderColor: GREEN, backgroundColor: 'rgba(0,200,83,0.06)' },
  toggle_title: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  toggle_sub: { fontSize: 10, color: COLORS.gray, marginTop: 1 },
  toggleTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: COLORS.gray3, justifyContent: 'center', paddingHorizontal: 2 },
  toggleTrackGold: { backgroundColor: COLORS.gold },
  toggleTrackGreen: { backgroundColor: GREEN },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.gray },
  toggleThumbActive: { backgroundColor: COLORS.black, alignSelf: 'flex-end' },
  section: { paddingHorizontal: 14, marginBottom: 20 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: COLORS.card, borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 10, color: COLORS.gray, textAlign: 'right', marginTop: 4 },
  consoleGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  consoleChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, marginBottom: 8 },
  consoleEmoji: { fontSize: 14, marginRight: 5 },
  consoleLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  consoleChipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 14, padding: 12, backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 10, borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.2)' },
  infoText: { flex: 1, fontSize: 11, color: COLORS.gray, lineHeight: 16, marginLeft: 8 },
});
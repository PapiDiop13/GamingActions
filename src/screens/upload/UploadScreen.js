import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Modal, Pressable, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadBannerToCloudinary } from '../../config/cloudinary';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, updateDoc, doc, increment, limit } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { getMuxThumbnailUrl, getMuxPlaybackUrl } from '../../config/mux';
import { db, auth } from '../../config/firebase';
import { useVideoPlayer, VideoView } from 'expo-video';
import ConsoleIcon from '../../components/ConsoleIcon';
import { awardPoints, POINTS } from '../../utils/points';
import { showAlert } from '../../store/useAlertStore';
import { VIDEO_FRAMES, getVideoFrameById } from '../../constants/frames';
import { isFreebieCosmetic, userHasLegendary } from '../../constants/cosmeticAccess';
import { setUploadState } from '../feed/FeedScreen';
import { globalNavigate } from '../../utils/navigationRef';
import * as StoreReview from 'expo-store-review';
import { logError, logEvent, LOG_CONTEXT } from '../../utils/errorLogger';
import * as FileSystem from 'expo-file-system/legacy';

const GREEN = '#00C853';

import { GAMES } from '../../constants/games';

const GENRES_WITH_GAMES = [
  { id: 'all',          label: 'All Games',    icon: '🎮', games: GAMES.map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'fps',          label: 'FPS',          icon: '🎯', games: GAMES.filter(g => g.genre === 'fps').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'sports',       label: 'Sports',       icon: '⚽', games: GAMES.filter(g => g.genre === 'sports').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'battle_royale',label: 'Battle Royale',icon: '🏆', games: GAMES.filter(g => g.genre === 'battle_royale').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'action',       label: 'Action / Adventure', icon: '💥', games: GAMES.filter(g => g.genre === 'action').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'rpg',          label: 'RPG',          icon: '⚔️', games: GAMES.filter(g => g.genre === 'rpg').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'fighting',     label: 'Fighting',     icon: '🥊', games: GAMES.filter(g => g.genre === 'fighting').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'moba',         label: 'MOBA / Strategy', icon: '🧙', games: GAMES.filter(g => g.genre === 'moba').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'racing',       label: 'Racing',       icon: '🏎️', games: GAMES.filter(g => g.genre === 'racing').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'horror',       label: 'Horror',       icon: '👻', games: GAMES.filter(g => g.genre === 'horror').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'simulation',   label: 'Simulation / Sandbox', icon: '🏗️', games: GAMES.filter(g => g.genre === 'simulation').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
  { id: 'other',        label: 'Other',        icon: '🕹️', games: GAMES.filter(g => g.genre === 'other').map(g => g.name).sort((a, b) => a.localeCompare(b)) },
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
  const _legendaryAccess = userHasLegendary(userProfile);
  const availableFrames = VIDEO_FRAMES.filter(f => !f.exclusive && (f.free || ownedVideoFrames.includes(f.id) || (_legendaryAccess && isFreebieCosmetic(f))));
  const [isFanbaseExclusive, setIsFanbaseExclusive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoUri, setVideoUri] = useState(null);
  const [agreedRights, setAgreedRights] = useState(false);
  const [showRightsModal, setShowRightsModal] = useState(false);
  // Cover / thumbnail
  const [thumbTime, setThumbTime] = useState(null);       // frame choisie (secondes)
  const [customThumbUrl, setCustomThumbUrl] = useState(null); // image custom uploadée
  const [thumbBarW, setThumbBarW] = useState(0);
  const [thumbFrac, setThumbFrac] = useState(null);
  const [thumbUploading, setThumbUploading] = useState(false);

  const handlePickThumbnail = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setThumbUploading(true);
      const url = await uploadBannerToCloudinary(res.assets[0].uri);
      setCustomThumbUrl(url);
      setThumbTime(null);
    } catch (e) { Alert.alert('Error', 'Could not upload cover image.'); }
    setThumbUploading(false);
  };

  const seekCover = (e) => {
    if (thumbBarW <= 0) return;
    const frac = Math.max(0, Math.min(1, e.nativeEvent.locationX / thumbBarW));
    setThumbFrac(frac);                       // déplace le thumb tout de suite
    const dur = previewPlayer?.duration || 0;
    if (dur > 0) {
      const t = frac * dur;
      setThumbTime(t);
      try { previewPlayer.pause(); previewPlayer.currentTime = t; } catch (err) {}
    }
  };
  const coverPct = thumbFrac != null ? thumbFrac * 100 : 0;

  // NC21 — guard against setState on unmounted component
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

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
        // Expo ImagePicker retourne toujours la durée en millisecondes
        const durationInSeconds = asset.duration / 1000;
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


  // Upload limit: 20/week for free, unlimited for Legendary/Creator/Admin
  const isCreator = userProfile?.accountType === 'creator' || userProfile?.accountType === 'gameconic';
  const hasUnlimitedUploads = isLegendaryUser || isCreator;
  const WEEKLY_UPLOAD_LIMIT = hasUnlimitedUploads ? Infinity : 20;

  const handlePublish = async () => {
    const game = showCustomGame ? customGame.trim() : selectedGame;
    if (!title.trim()) return Alert.alert('Missing', 'Please add a title for your clip.');
    if (!game) return Alert.alert('Missing', 'Please select or enter a game.');
    if (!selectedConsole) return Alert.alert('Missing', 'Please select your console.');
    if (!videoUri) return Alert.alert('Missing', 'Please select a video.');
    if (!agreedRights) return Alert.alert('Confirmation required', 'Please check the content-rights box below the video before posting.');

    // ─── Limite hebdomadaire ───────────────────────────────────────────────
    if (user?.uid && !hasUnlimitedUploads) {
      try {
        const weekSnap = await getDocs(query(collection(db, 'videos'), where('userId', '==', user.uid), limit(20)));
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentCount = weekSnap.docs.filter((d) => {
          const ts = d.data().createdAt;
          const ms = ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : 0);
          return ms >= weekAgo;
        }).length;
        if (recentCount >= WEEKLY_UPLOAD_LIMIT) {
          logEvent(LOG_CONTEXT.UPLOAD_LIMIT, { recentCount }, user?.uid).catch(() => {});
          return Alert.alert(
            '📊 Weekly limit reached',
            'You can upload up to 20 videos per week on the free plan.\n\nUpgrade to Legendary for unlimited uploads! 🏆',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Go Legendary ⭐', onPress: () => navigation.navigate('Subscription') },
            ]
          );
        }
      } catch (e) {
        Alert.alert('Erreur', "Impossible de vérifier la limite d'upload. Réessaie.");
        return;
      }
    }

    setUploading(true);
    setUploadState({ isUploading: true, progress: 0 });
    logEvent(LOG_CONTEXT.UPLOAD_START, { contentType, game, console: selectedConsole }, user?.uid).catch(() => {});

    // Helper : naviguer vers Feed depuis n'importe quel niveau de stack
    const goToFeed = () => {
      try { navigation.popToTop(); } catch(e) {}
      try { globalNavigate('Feed'); } catch(e) {}
    };

    try {
      // ── 1. Obtenir l'URL d'upload Mux ──────────────────────────────────
      const idToken = await auth.currentUser?.getIdToken();
      const urlResponse = await fetch(
        'https://us-central1-gamingactions-app.cloudfunctions.net/muxGetUploadUrl',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${idToken}` },
        }
      );
      if (!urlResponse.ok) throw new Error("Impossible d'obtenir l'URL Mux: " + urlResponse.status);
      const { uploadUrl, uploadId } = await urlResponse.json();
      if (!uploadUrl) throw new Error('uploadUrl manquant dans la réponse');

      // ── 2. PUT binaire vers Mux — timeout 120s pour éviter freeze ─────
      const uploadTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Upload timeout — connexion trop lente')), 120000)
      );
      const uploadResult = await Promise.race([
        FileSystem.uploadAsync(uploadUrl, videoUri, {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': 'video/mp4' },
        }),
        uploadTimeout,
      ]);
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error('Mux upload failed: ' + uploadResult.status);
      }

      // ── 3. Succès immédiat : reset état + alerte native + naviguer ─────
      //    Les writes Firestore se font en background pour ne pas bloquer l'UI
      if (mountedRef.current) {
        setUploading(false);
        setUploadState({ isUploading: false, progress: 0 });
      }

      logEvent(LOG_CONTEXT.UPLOAD_SUCCESS, { contentType, game }, user?.uid).catch(() => {});

      // Alerte native (toujours fiable, pas de dépendance Zustand/Modal)
      Alert.alert(
        '✅ Published!',
        'Your clip is being processed and will appear soon. +25 GA Points earned! 🎮',
        [
          { text: 'OK 🎮', style: 'default', onPress: () => {} },
          { text: 'My Profile', onPress: () => {
            try { globalNavigate('UserProfile', { userId: user?.uid }); } catch(e) {}
          }},
        ]
      );

      // Naviguer vers Feed après un court délai
      setTimeout(() => goToFeed(), 300);

      // ── 4. Writes Firestore en background (ne bloquent pas l'UI) ───────
      (async () => {
        try {
          // Jeu custom
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

          // Hashtags
          const allText = (title.trim() + ' ' + caption).toLowerCase();
          const hashtags = [...new Set((allText.match(/#(\w+)/g) || []).map(h => h.slice(1)))];

          // Frame choisie pour le cover : résout en secondes (au cas où la durée
          // n'était pas chargée pendant le scrub → on utilise la fraction + durée).
          let resolvedThumbTime = null;
          if (!customThumbUrl) {
            const dur = previewPlayer?.duration || 0;
            if (thumbTime != null) resolvedThumbTime = Math.round(thumbTime * 10) / 10;
            else if (thumbFrac != null && dur > 0) resolvedThumbTime = Math.round(thumbFrac * dur * 10) / 10;
          }

          // Doc vidéo Firestore
          await addDoc(collection(db, 'videos'), {
            userId: user?.uid,
            username: userProfile?.username || 'PLAYER',
            avatar: userProfile?.avatar || '',
            title: title.trim(),
            caption,
            hashtags,
            game,
            genre: selectedGenre,
            console: selectedConsole,
            contentType,
            videoFrame,
            isLegendaryFrame: videoFrame !== 'none',
            isFanbaseExclusive,
            videoUrl: null,
            thumbnail: customThumbUrl || null,
            thumbnailTime: customThumbUrl ? null : resolvedThumbTime,
            publicId: uploadId,
            muxUploadId: uploadId,
            muxPlaybackId: null,
            muxStatus: 'processing',
            duration: 0,
            ggCount: 0,
            commentsCount: 0,
            viewCount: 0,
            createdAt: serverTimestamp(),
            randomOrder: Date.now() + Math.floor(Math.random() * 100000),
          });

          // Points + videoCount
          if (user?.uid) {
            awardPoints(user.uid, POINTS.POST_CLIP, 0, 'Posted a clip').catch(() => {});
            updateDoc(doc(db, 'users', user.uid), { videoCount: increment(1) }).catch(() => {});
          }

          // Store review (1er clip seulement) — fire & forget
          try {
            const currentCount = (userProfile?.videoCount || 0) + 1;
            if (currentCount === 1) {
              StoreReview.isAvailableAsync().then(isAvailable => {
                if (isAvailable) StoreReview.requestReview().catch(() => {});
              }).catch(() => {});
            }
          } catch (e) {}
        } catch (e) {
          logError(LOG_CONTEXT.UPLOAD_FAIL, e, user?.uid).catch(() => {});
        }
      })();

    } catch (e) {
      if (mountedRef.current) {
        setUploading(false);
        setUploadState({ isUploading: false, progress: 0 });
      }
      logError(LOG_CONTEXT.UPLOAD_FAIL, e, user?.uid).catch(() => {});
      // Alerte native AVANT navigation — toujours fiable
      Alert.alert(
        '❌ Upload Failed',
        'Something went wrong. Please try again.\n\n' + (e?.message || ''),
        [{ text: 'OK', style: 'cancel' }]
      );
      setTimeout(() => goToFeed(), 300);
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
      {/* Badge coin haut-droit — n'obscurcit plus la frame qu'on choisit */}
      <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 14 }}>
        <Ionicons name="checkmark-circle" size={15} color={COLORS.green} />
        <Text style={{ color: COLORS.green, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>Selected</Text>
      </View>
      <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 12 }}>
        <Text style={{ color: COLORS.white, fontSize: 10, fontWeight: '600' }}>Tap to change</Text>
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

      {/* ── Content rights checkbox (obligatoire, façon TikTok) ── */}
      <TouchableOpacity onPress={() => setAgreedRights(v => !v)} activeOpacity={0.8} style={styles.rightsRow}>
        <View style={[styles.checkbox, agreedRights && styles.checkboxChecked]}>
          {agreedRights && <Ionicons name="checkmark" size={13} color={COLORS.black} />}
        </View>
        <Text style={styles.rightsText}>
          I confirm I own or have the rights to all content in this clip (gameplay, music, etc.).{' '}
          <Text style={styles.rightsLink} onPress={() => setShowRightsModal(true)}>Content Usage Confirmation ›</Text>
        </Text>
      </TouchableOpacity>

      <Modal visible={showRightsModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowRightsModal(false)}>
        <View style={styles.rightsBackdrop}>
          <View style={styles.rightsModalCard}>
            <Text style={styles.rightsModalTitle}>Content Usage Confirmation</Text>
            <Text style={styles.rightsModalText}>
              By checking this box, you confirm that (A) you own all of the rights to the content included in this video (gameplay, music, voices, and any third-party material); or (B) the content is in the public domain; or (C) you have permission from all necessary rights holders to use it on Gaming Actions. If you cannot confirm (A), (B), or (C), the content may be removed, and you are solely responsible for it.
            </Text>
            <TouchableOpacity onPress={() => setShowRightsModal(false)} style={styles.rightsModalBtn}>
              <Text style={styles.rightsModalBtnText}>Got it 👍</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Cover / thumbnail (frame picker + image custom) ── */}
      {videoUri && (
        <View style={styles.coverSection}>
          <Text style={styles.coverLabel}>COVER</Text>
          <Text style={styles.coverHint}>Tap the bar to pick a frame from your clip, or upload your own image.</Text>
          {customThumbUrl ? (
            <View style={styles.coverCustomRow}>
              <Image source={{ uri: customThumbUrl }} style={styles.coverCustomImg} />
              <TouchableOpacity onPress={() => setCustomThumbUrl(null)}>
                <Text style={styles.coverRemoveText}>Remove custom cover</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Pressable onLayout={(e) => setThumbBarW(e.nativeEvent.layout.width)} onPress={seekCover} style={styles.scrubTrack}>
              <View style={[styles.scrubFill, { width: `${coverPct}%` }]} />
              <View style={[styles.scrubThumb, { left: `${coverPct}%` }]} />
            </Pressable>
          )}
          <TouchableOpacity onPress={handlePickThumbnail} disabled={thumbUploading} style={styles.coverUploadBtn}>
            <Ionicons name="image-outline" size={15} color={COLORS.gold} />
            <Text style={styles.coverUploadText}>{thumbUploading ? 'Uploading…' : 'Upload custom cover'}</Text>
          </TouchableOpacity>
        </View>
      )}

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
  rightsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 14, marginTop: 12, marginBottom: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.gray, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  rightsText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17 },
  rightsLink: { color: COLORS.gold, fontWeight: '700' },
  rightsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  rightsModalCard: { width: '100%', maxWidth: 380, backgroundColor: COLORS.card, borderRadius: 18, padding: 22, borderWidth: 1, borderColor: COLORS.gray3 },
  rightsModalTitle: { fontSize: 17, fontWeight: '900', color: COLORS.white, marginBottom: 12, textAlign: 'center' },
  rightsModalText: { fontSize: 13, color: COLORS.gray, lineHeight: 20, marginBottom: 20 },
  rightsModalBtn: { backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  rightsModalBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black },
  coverSection: { marginHorizontal: 14, marginTop: 16, padding: 14, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  coverLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  coverHint: { fontSize: 11, color: COLORS.gray, marginBottom: 12, lineHeight: 15 },
  scrubTrack: { height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', overflow: 'visible' },
  scrubFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(201,168,76,0.3)', borderRadius: 13 },
  scrubThumb: { position: 'absolute', width: 14, height: 30, borderRadius: 7, backgroundColor: COLORS.gold, marginLeft: -7, borderWidth: 2, borderColor: COLORS.black },
  coverUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.gold + '50' },
  coverUploadText: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },
  coverCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coverCustomImg: { width: 80, height: 45, borderRadius: 8, backgroundColor: COLORS.gray3 },
  coverRemoveText: { fontSize: 12, color: '#FF2D55', fontWeight: '700' },
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
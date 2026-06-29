import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import { GAMES } from '../../constants/games';
import { VIDEO_FRAMES, getVideoFrameById } from '../../constants/frames';
import useAuthStore from '../../store/useAuthStore';

const GENRES = [
  { id: 'fps',           label: 'FPS',                  icon: '🎯' },
  { id: 'sports',        label: 'Sports',               icon: '⚽' },
  { id: 'battle_royale', label: 'Battle Royale',        icon: '🏆' },
  { id: 'action',        label: 'Action / Adventure',   icon: '💥' },
  { id: 'rpg',           label: 'RPG',                  icon: '⚔️' },
  { id: 'fighting',      label: 'Fighting',             icon: '🥊' },
  { id: 'moba',          label: 'MOBA / Strategy',      icon: '🧙' },
  { id: 'racing',        label: 'Racing',               icon: '🏎️' },
  { id: 'horror',        label: 'Horror',               icon: '👻' },
  { id: 'simulation',    label: 'Simulation / Sandbox', icon: '🏗️' },
  { id: 'other',         label: 'Other',                icon: '🕹️' },
];

const CONSOLES = [
  { id: 'PS5',    icon: '🎮' },
  { id: 'PS4',    icon: '🎮' },
  { id: 'Xbox',   icon: '🟢' },
  { id: 'PC',     icon: '💻' },
  { id: 'Switch', icon: '🕹️' },
  { id: 'Mobile', icon: '📱' },
];

export default function EditVideoScreen({ navigation, route }) {
  const { video } = route.params;
  const { userProfile } = useAuthStore();

  const [caption, setCaption]           = useState(video?.caption || '');
  const [game, setGame]                 = useState(video?.game || '');
  const [genre, setGenre]               = useState(video?.genre || null);
  const [console_, setConsole]          = useState(video?.console || null);
  const [gameSearch, setGameSearch]     = useState('');
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [pickerGenre, setPickerGenre]   = useState(null);
  const [loading, setLoading]           = useState(false);
  const [videoFrame, setVideoFrame]     = useState(video?.videoFrame || 'none');
  const [showFramePicker, setShowFramePicker] = useState(false);

  const ownedVideoFrames = userProfile?.ownedVideoFrames || [];
  const availableFrames = VIDEO_FRAMES.filter(f => !f.exclusive && (f.free || ownedVideoFrames.includes(f.id)));

  const filteredGames = GAMES.filter(g => {
    const matchGenre  = pickerGenre ? g.genre === pickerGenre : true;
    const matchSearch = gameSearch.length > 0
      ? g.name.toLowerCase().includes(gameSearch.toLowerCase())
      : true;
    return matchGenre && matchSearch;
  });

  const selectedGenre = GENRES.find(g => g.id === genre);

  const handleSave = async () => {
    if (!caption.trim()) return Alert.alert('Erreur', 'La description est obligatoire.');
    setLoading(true);
    try {
      await updateDoc(doc(db, 'videos', video.id), {
        caption: caption.trim(),
        game,
        genre,
        console: console_,
        videoFrame: videoFrame === 'none' ? null : videoFrame,
        isLegendaryFrame: videoFrame !== 'none',
      });
      Alert.alert('✅ Vidéo mise à jour !', '', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Erreur', 'Une erreur est survenue. Réessaie.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>Enregistrement...</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="close" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Modifier la vidéo</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Sauvegarder</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >

        {/* Aperçu miniature */}
        {video?.thumbnailUrl ? (
          <View style={styles.thumbnailRow}>
            <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
            <View style={styles.thumbnailMeta}>
              <Text style={styles.thumbnailLabel} numberOfLines={2}>{video.caption || 'Sans description'}</Text>
              {selectedGenre && (
                <View style={styles.genreBadge}>
                  <Text style={styles.genreBadgeText}>{selectedGenre.icon} {selectedGenre.label}</Text>
                </View>
              )}
              {console_ && (
                <View style={[styles.genreBadge, { marginTop: 4 }]}>
                  <Text style={styles.genreBadgeText}>
                    {CONSOLES.find(c => c.id === console_)?.icon} {console_}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {/* Caption */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DESCRIPTION</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Décris ton clip..."
            placeholderTextColor={COLORS.gray}
            style={styles.textArea}
            multiline
            maxLength={150}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, caption.length > 130 && { color: COLORS.gold }]}>
            {caption.length}/150
          </Text>
        </View>

        {/* Jeu */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>JEU</Text>
          <TouchableOpacity
            onPress={() => setShowGamePicker(!showGamePicker)}
            style={styles.selector}
            activeOpacity={0.8}
          >
            <View style={styles.selectorLeft}>
              <Ionicons name="game-controller-outline" size={16} color={game ? COLORS.gold : COLORS.gray} style={{ marginRight: 8 }} />
              <Text style={{ color: game ? COLORS.white : COLORS.gray, fontSize: 14 }}>
                {game || 'Sélectionner un jeu...'}
              </Text>
            </View>
            <View style={styles.selectorRight}>
              {game ? (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setGame(''); setGenre(null); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={COLORS.gray} />
                </TouchableOpacity>
              ) : null}
              <Ionicons name={showGamePicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gray} style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>

          {showGamePicker && (
            <View style={styles.gamePicker}>
              {/* Chips genre */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.genreChipsRow}
              >
                <TouchableOpacity
                  onPress={() => setPickerGenre(null)}
                  style={[styles.genreChip, !pickerGenre && styles.genreChipActive]}
                >
                  <Text style={[styles.genreChipText, !pickerGenre && styles.genreChipTextActive]}>Tous</Text>
                </TouchableOpacity>
                {GENRES.map(g => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setPickerGenre(pickerGenre === g.id ? null : g.id)}
                    style={[styles.genreChip, pickerGenre === g.id && styles.genreChipActive]}
                  >
                    <Text style={styles.genreChipEmoji}>{g.icon}</Text>
                    <Text style={[styles.genreChipText, pickerGenre === g.id && styles.genreChipTextActive]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Recherche */}
              <View style={styles.gameSearch}>
                <Ionicons name="search-outline" size={14} color={COLORS.gray} />
                <TextInput
                  value={gameSearch}
                  onChangeText={setGameSearch}
                  placeholder={pickerGenre ? `Chercher en ${GENRES.find(g => g.id === pickerGenre)?.label}...` : 'Chercher un jeu...'}
                  placeholderTextColor={COLORS.gray}
                  style={{ flex: 1, color: COLORS.white, fontSize: 13, marginLeft: 8 }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {gameSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setGameSearch('')}>
                    <Ionicons name="close-circle" size={16} color={COLORS.gray} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.gameCount}>{filteredGames.length} jeu{filteredGames.length !== 1 ? 'x' : ''}</Text>

              <ScrollView
                style={{ maxHeight: 240 }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {filteredGames.length === 0 ? (
                  <Text style={styles.emptyText}>Aucun jeu trouvé</Text>
                ) : filteredGames.map(g => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => {
                      setGame(g.name);
                      setGenre(g.genre);
                      setShowGamePicker(false);
                      setGameSearch('');
                      setPickerGenre(null);
                    }}
                    style={[styles.gameOption, game === g.name && styles.gameOptionActive]}
                  >
                    <View>
                      <Text style={[styles.gameOptionText, game === g.name && { color: COLORS.gold }]}>{g.name}</Text>
                      {g.genre && (
                        <Text style={styles.gameOptionGenre}>
                          {GENRES.find(x => x.id === g.genre)?.icon} {GENRES.find(x => x.id === g.genre)?.label}
                        </Text>
                      )}
                    </View>
                    {game === g.name && <Ionicons name="checkmark-circle" size={18} color={COLORS.gold} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Console / Plateforme */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PLATEFORME</Text>
          <View style={styles.consoleRow}>
            {CONSOLES.map(c => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setConsole(console_ === c.id ? null : c.id)}
                style={[styles.consolePill, console_ === c.id && styles.consolePillActive]}
              >
                <Text style={styles.consoleIcon}>{c.icon}</Text>
                <Text style={[styles.consoleName, console_ === c.id && styles.consoleNameActive]}>{c.id}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Video Frame */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FRAME VIDÉO</Text>
          <TouchableOpacity
            onPress={() => setShowFramePicker(!showFramePicker)}
            style={[styles.selector, { marginBottom: 0 }]}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 22, height: 14, borderRadius: 3, borderWidth: 2,
                borderColor: getVideoFrameById(videoFrame)?.color || COLORS.gray3,
                backgroundColor: getVideoFrameById(videoFrame)?.glow ? (getVideoFrameById(videoFrame)?.color + '22') : 'transparent',
                marginRight: 10,
              }} />
              <Text style={{ color: videoFrame !== 'none' ? COLORS.white : COLORS.gray, fontSize: 14 }}>
                {getVideoFrameById(videoFrame)?.name || 'Pas de frame'}
              </Text>
              {videoFrame !== 'none' && getVideoFrameById(videoFrame)?.animated && (
                <View style={{ marginLeft: 8, backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, color: COLORS.gold, fontWeight: '700' }}>ANIMÉ</Text>
                </View>
              )}
            </View>
            <Ionicons name={showFramePicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gray} />
          </TouchableOpacity>

          {showFramePicker && (
            <View style={[styles.gamePicker, { marginTop: 8 }]}>
              {/* None option */}
              <TouchableOpacity
                onPress={() => { setVideoFrame('none'); setShowFramePicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, backgroundColor: videoFrame === 'none' ? 'rgba(201,168,76,0.08)' : 'transparent' }}
              >
                <Text style={{ fontSize: 13, color: videoFrame === 'none' ? COLORS.gold : COLORS.gray, fontWeight: '600' }}>Pas de frame</Text>
                {videoFrame === 'none' && <Ionicons name="checkmark" size={16} color={COLORS.gold} />}
              </TouchableOpacity>

              {availableFrames.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => { setVideoFrame(f.id); setShowFramePicker(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, backgroundColor: videoFrame === f.id ? 'rgba(201,168,76,0.08)' : 'transparent' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 22, height: 14, borderWidth: 2, borderColor: f.color, marginRight: 10, backgroundColor: f.glow ? f.color + '22' : 'transparent', borderRadius: 3 }} />
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, color: videoFrame === f.id ? COLORS.gold : COLORS.white, fontWeight: '600' }}>{f.name}</Text>
                        {f.animated && (
                          <View style={{ backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, color: COLORS.gold, fontWeight: '700' }}>ANIMÉ</Text>
                          </View>
                        )}
                      </View>
                      {f.desc ? <Text style={{ fontSize: 10, color: COLORS.gray }}>{f.desc}</Text> : null}
                    </View>
                  </View>
                  {videoFrame === f.id && <Ionicons name="checkmark" size={16} color={COLORS.gold} />}
                </TouchableOpacity>
              ))}

              {availableFrames.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.gray, fontSize: 13, textAlign: 'center' }}>
                    Achète des frames dans la boutique pour les utiliser ici.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.black },
  loadingOverlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  loadingText:     { color: COLORS.white, marginTop: 12, fontSize: 14, fontWeight: '600' },

  // Header
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' },
  headerBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { fontSize: 17, fontWeight: '800', color: COLORS.white },
  saveBtn:         { backgroundColor: COLORS.gold, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  saveBtnText:     { fontSize: 13, fontWeight: '800', color: COLORS.black },

  scrollContent:   { paddingBottom: 80 },

  // Thumbnail preview
  thumbnailRow:    { flexDirection: 'row', alignItems: 'flex-start', margin: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' },
  thumbnail:       { width: 72, height: 96, borderRadius: 10, backgroundColor: COLORS.card },
  thumbnailMeta:   { flex: 1, marginLeft: 12 },
  thumbnailLabel:  { fontSize: 13, color: COLORS.gray, lineHeight: 18 },
  genreBadge:      { marginTop: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(201,168,76,0.12)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.3)' },
  genreBadgeText:  { fontSize: 11, color: COLORS.gold, fontWeight: '600' },

  // Sections
  section:         { paddingHorizontal: 16, marginTop: 24 },
  sectionLabel:    { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },

  // Caption
  textArea:        { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', height: 90, lineHeight: 22 },
  charCount:       { fontSize: 10, color: COLORS.gray, textAlign: 'right', marginTop: 5 },

  // Game selector
  selector:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },
  selectorLeft:    { flexDirection: 'row', alignItems: 'center', flex: 1 },
  selectorRight:   { flexDirection: 'row', alignItems: 'center' },

  // Game picker dropdown
  gamePicker:      { backgroundColor: 'rgba(30,30,30,0.98)', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', marginTop: 8, overflow: 'hidden' },
  genreChipsRow:   { paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  genreChip:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', marginRight: 6 },
  genreChipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  genreChipEmoji:  { fontSize: 11, marginRight: 4 },
  genreChipText:   { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  genreChipTextActive: { color: COLORS.gold },
  gameSearch:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.07)' },
  gameCount:       { fontSize: 10, color: COLORS.gray, paddingHorizontal: 14, paddingBottom: 6 },
  gameOption:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.05)' },
  gameOptionActive:{ backgroundColor: 'rgba(201,168,76,0.07)' },
  gameOptionText:  { fontSize: 13, color: COLORS.white, fontWeight: '500' },
  gameOptionGenre: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
  emptyText:       { color: COLORS.gray, textAlign: 'center', padding: 20, fontSize: 13 },

  // Console
  consoleRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  consolePill:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },
  consolePillActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  consoleIcon:     { fontSize: 14, marginRight: 6 },
  consoleName:     { fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  consoleNameActive: { color: COLORS.gold },
});

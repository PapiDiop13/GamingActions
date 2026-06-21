import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import { GAMES } from '../../constants/games';

const GENRES = [
  { id: 'fps', label: 'FPS', icon: '🎯' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'battle_royale', label: 'Battle Royale', icon: '🏆' },
  { id: 'rpg', label: 'RPG', icon: '⚔️' },
  { id: 'moba', label: 'MOBA', icon: '🧙' },
  { id: 'racing', label: 'Racing', icon: '🏎️' },
  { id: 'fighting', label: 'Fighting', icon: '🥊' },
  { id: 'strategy', label: 'Strategy', icon: '♟️' },
  { id: 'other', label: 'Other', icon: '🎮' },
];

const CONSOLES = ['PS5', 'PS4', 'Xbox', 'PC', 'Switch', 'Mobile'];

export default function EditVideoScreen({ navigation, route }) {
  const { video } = route.params;

  const [caption, setCaption] = useState(video?.caption || '');
  const [game, setGame] = useState(video?.game || '');
  const [genre, setGenre] = useState(video?.genre || null);
  const [console_, setConsole] = useState(video?.console || null);
  const [gameSearch, setGameSearch] = useState('');
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const filteredGames = gameSearch.length > 0
    ? GAMES.filter(g => g.name.toLowerCase().includes(gameSearch.toLowerCase())).slice(0, 20)
    : GAMES.slice(0, 20);

  const handleSave = async () => {
    if (!caption.trim()) return Alert.alert('Error', 'Please add a caption.');
    setLoading(true);
    try {
      await updateDoc(doc(db, 'videos', video.id), {
        caption: caption.trim(),
        game,
        genre,
        console: console_,
      });
      Alert.alert('✅ Video updated!', '', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
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
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Video</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Caption */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CAPTION</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Describe your clip..."
            placeholderTextColor={COLORS.gray}
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
            multiline
            maxLength={150}
          />
          <Text style={styles.charCount}>{caption.length}/150</Text>
        </View>

        {/* Game */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>GAME</Text>
          <TouchableOpacity
            onPress={() => setShowGamePicker(!showGamePicker)}
            style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          >
            <Text style={{ color: game ? COLORS.white : COLORS.gray, fontSize: 14 }}>
              {game || 'Select game...'}
            </Text>
            <Ionicons name={showGamePicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gray} />
          </TouchableOpacity>
          {showGamePicker && (
            <View style={styles.gamePicker}>
              <View style={styles.gameSearch}>
                <Ionicons name="search-outline" size={14} color={COLORS.gray} />
                <TextInput
                  value={gameSearch}
                  onChangeText={setGameSearch}
                  placeholder="Search game..."
                  placeholderTextColor={COLORS.gray}
                  style={{ flex: 1, color: COLORS.white, fontSize: 13, marginLeft: 8 }}
                  autoCapitalize="none"
                />
              </View>
              {filteredGames.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => { setGame(g.name); setShowGamePicker(false); setGameSearch(''); }}
                  style={[styles.gameOption, game === g.name && { backgroundColor: 'rgba(201,168,76,0.1)' }]}
                >
                  <Text style={[styles.gameOptionText, game === g.name && { color: COLORS.gold }]}>{g.name}</Text>
                  {game === g.name && <Ionicons name="checkmark" size={16} color={COLORS.gold} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Genre */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>GENRE</Text>
          <View style={styles.chips}>
            {GENRES.map((g) => (
              <TouchableOpacity
                key={g.id}
                onPress={() => setGenre(g.id)}
                style={[styles.chip, genre === g.id && styles.chipActive]}
              >
                <Text style={styles.chipEmoji}>{g.icon}</Text>
                <Text style={[styles.chipText, genre === g.id && { color: COLORS.gold }]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Console */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CONSOLE</Text>
          <View style={styles.chips}>
            {CONSOLES.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setConsole(c)}
                style={[styles.chip, console_ === c && styles.chipActive]}
              >
                <Text style={[styles.chipText, console_ === c && { color: COLORS.gold }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  saveBtn: { backgroundColor: COLORS.gold, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3 },
  charCount: { fontSize: 10, color: COLORS.gray, textAlign: 'right', marginTop: 4 },
  gamePicker: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, marginTop: 8, maxHeight: 250, overflow: 'hidden' },
  gameSearch: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  gameOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  gameOptionText: { fontSize: 13, color: COLORS.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, marginBottom: 8 },
  chipEmoji: { fontSize: 12, marginRight: 4 },
  chipText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  chipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
});
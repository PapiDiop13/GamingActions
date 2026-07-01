import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Image, ActivityIndicator, Dimensions, Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { logError, logEvent, LOG_CONTEXT } from '../../utils/errorLogger';
import { db } from '../../config/firebase';
import { uploadAvatar, uploadBanner } from '../../config/storage';
import { GAMES } from '../../constants/games';
import { COUNTRIES, getCountryByName } from '../../constants/countries';

const { width: SW } = Dimensions.get('window');
// Bannière au ratio 3:1 → ce qu'on recadre = ce qu'on affiche (plus de mauvais cadrage)
const BANNER_H = Math.round(SW / 3);

const SOCIAL_LINKS = [
  { id: 'youtube', label: 'YouTube', icon: 'logo-youtube', color: '#FF0000', placeholder: 'youtube.com/c/yourchannel' },
  { id: 'twitch', label: 'Twitch', icon: 'logo-twitch', color: '#9146FF', placeholder: 'twitch.tv/yourname' },
  { id: 'twitter', label: 'Twitter / X', icon: 'logo-twitter', color: '#1DA1F2', placeholder: 'twitter.com/yourname' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C', placeholder: 'instagram.com/yourname' },
  { id: 'tiktok', label: 'TikTok', icon: 'musical-notes-outline', color: '#01D4FF', placeholder: 'tiktok.com/@yourname' },
  { id: 'discord', label: 'Discord', icon: 'chatbubbles-outline', color: '#5865F2', placeholder: 'discord.gg/yourserver' },
];

const CONSOLES = ['PS5', 'PS4', 'Xbox', 'PC', 'Switch', 'Mobile'];

export default function EditProfileScreen({ navigation }) {
  const { user, userProfile, saveProfile } = useAuthStore();
  const isAdmin = useMemo(() => !!userProfile?.isAdmin, [userProfile?.isAdmin]);

  const [username, setUsername] = useState(userProfile?.username || '');
  const [bio, setBio] = useState(userProfile?.bio || '');
  const [mainConsole, setMainConsole] = useState(userProfile?.mainConsole || 'PS5');
  const [mainGame, setMainGame] = useState(userProfile?.mainGame || '');
  const [gameSearch, setGameSearch] = useState('');
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [country, setCountry] = useState(userProfile?.country || '');
  const [hideStreakLevel, setHideStreakLevel] = useState(userProfile?.hideStreakLevel || false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [avatar, setAvatar] = useState(userProfile?.avatar || '');
  const [banner, setBanner] = useState(userProfile?.banner || '');
  const [links, setLinks] = useState({
    youtube: userProfile?.socialLinks?.youtube || '',
    twitch: userProfile?.socialLinks?.twitch || '',
    twitter: userProfile?.socialLinks?.twitter || '',
    instagram: userProfile?.socialLinks?.instagram || '',
    tiktok: userProfile?.socialLinks?.tiktok || '',
    discord: userProfile?.socialLinks?.discord || '',
  });
  const [loading, setLoading] = useState(false);

  const filteredGames = gameSearch.length > 0
    ? GAMES.filter(g => g.name.toLowerCase().includes(gameSearch.toLowerCase()))
    : GAMES;

  const filteredCountries = countrySearch.length > 0
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;
  const selectedCountry = getCountryByName(country);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission required', 'Please allow access to your gallery.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setLoading(true);
      try {
        const url = await uploadAvatar(result.assets[0].uri, user.uid);
        setAvatar(url);
      } catch (e) {
        await logError(LOG_CONTEXT.AVATAR_FAIL, e, user?.uid);
        Alert.alert('Error', 'Could not upload the photo.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePickBanner = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission required', 'Please allow access to your gallery.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });
    if (!result.canceled) {
      setLoading(true);
      try {
        const url = await uploadBanner(result.assets[0].uri, user.uid);
        setBanner(url);
      } catch (e) {
        Alert.alert('Error', 'Could not upload the banner.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSave = async () => {
    if (!username.trim()) return Alert.alert('Error', 'GamerTag is required.');
    // Vérifie l'unicité du GamerTag seulement si changé
    if (username.trim().toUpperCase() !== (userProfile?.username || '').toUpperCase()) {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('username', '==', username.trim().toUpperCase())));
        if (!snap.empty) return Alert.alert('GamerTag already taken', 'This GamerTag is already used by someone else — choose another one.');
      } catch (e) {}
    }
    setLoading(true);
    try {
      const newUsername = username.trim().toUpperCase();
      const usernameChanged = newUsername !== (userProfile?.username || '').toUpperCase();
      const updates = {
        username: newUsername,
        usernameLower: newUsername.toLowerCase(),
        bio: bio.trim(),
        mainConsole,
        mainGame: mainGame.trim(),
        country: country.trim(),
        avatar,
        banner,
        socialLinks: links,
        hideStreakLevel,
      };
      await updateDoc(doc(db, 'users', user.uid), updates);
      await saveProfile(updates);

      // Si le username a changé, propager aux vidéos (l'affichage live gère le reste)
      if (usernameChanged) {
        try {
          const vids = await getDocs(query(collection(db, 'videos'), where('userId', '==', user.uid)));
          await Promise.all(vids.docs.map(d => updateDoc(doc(db, 'videos', d.id), { username: newUsername, avatar })));
        } catch (e) {}
      }

      await logEvent(LOG_CONTEXT.PROFILE_UPDATE, { usernameChanged: username.trim().toUpperCase() !== (userProfile?.username||'').toUpperCase() }, user?.uid);
      Alert.alert('✅ Profile updated', '', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      await logError(LOG_CONTEXT.PROFILE_FAIL, e, user?.uid);
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
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Banner + Avatar */}
        <View style={styles.bannerSection}>
          <TouchableOpacity style={styles.banner} onPress={handlePickBanner} activeOpacity={0.85}>
            {banner ? (
              <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="image-outline" size={28} color={COLORS.gray} />
                <Text style={{ color: COLORS.gray, fontSize: 11, marginTop: 4 }}>Tap to set banner</Text>
              </View>
            )}
            <View style={styles.bannerEditBadge}>
              <Ionicons name="camera" size={12} color={COLORS.white} />
            </View>
          </TouchableOpacity>
          {/* Hint crop bannière */}
          <Text style={{ fontSize: 9, color: COLORS.gray2, textAlign: 'center', marginTop: 4, marginBottom: 4, paddingHorizontal: 20 }}>
            📐 The banner will be cropped 3:1 — center your image on what matters
          </Text>
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar} activeOpacity={0.85}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarInitials}>{username.slice(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color={COLORS.black} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Username */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>USERNAME (GAMERTAG)</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Your GamerTag..."
            style={[styles.input, { fontSize: SW < 375 ? 13 : 14 }]}
            placeholderTextColor={COLORS.gray}
            maxLength={14}
            autoCapitalize="characters"
            returnKeyType="done"
          />
          <Text style={[styles.hint, { textAlign: 'right' }]}>{username.length}/14 · Unique</Text>
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BIO</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Tell your story..."
            placeholderTextColor={COLORS.gray}
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
            multiline
            maxLength={120}
          />
          <Text style={styles.charCount}>{bio.length}/120</Text>
        </View>

        {/* Country */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>COUNTRY</Text>
          <TouchableOpacity
            onPress={() => setShowCountryPicker(!showCountryPicker)}
            style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          >
            <Text style={{ color: country ? COLORS.white : COLORS.gray, fontSize: 14 }}>
              {selectedCountry ? `${selectedCountry.flag}  ${selectedCountry.name}` : (country || 'Select your country...')}
            </Text>
            <Ionicons name={showCountryPicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gray} />
          </TouchableOpacity>
          {showCountryPicker && (
            <View style={styles.gamePicker}>
              <View style={styles.gameSearch}>
                <Ionicons name="search-outline" size={14} color={COLORS.gray} />
                <TextInput
                  value={countrySearch}
                  onChangeText={setCountrySearch}
                  placeholder="Search country..."
                  placeholderTextColor={COLORS.gray}
                  style={{ flex: 1, color: COLORS.white, fontSize: 13, marginLeft: 8 }}
                  autoCapitalize="none"
                />
              </View>
              <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {filteredCountries.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    onPress={() => { setCountry(c.name); setShowCountryPicker(false); setCountrySearch(''); }}
                    style={[styles.gameOption, country === c.name && { backgroundColor: 'rgba(201,168,76,0.1)' }]}
                  >
                    <Text style={[styles.gameOptionText, country === c.name && { color: COLORS.gold }]}>{c.flag}  {c.name}</Text>
                    {country === c.name && <Ionicons name="checkmark" size={16} color={COLORS.gold} />}
                  </TouchableOpacity>
                ))}
                {filteredCountries.length === 0 && (
                  <Text style={{ color: COLORS.gray, fontSize: 12, padding: 14 }}>No country found.</Text>
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Main Console */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MAIN CONSOLE</Text>
          <View style={styles.chips}>
            {CONSOLES.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setMainConsole(c)}
                style={[styles.chip, mainConsole === c && styles.chipActive]}
              >
                <Text style={[styles.chipText, mainConsole === c && { color: COLORS.gold }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Main Game */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MAIN GAME</Text>
          <TouchableOpacity
            onPress={() => setShowGamePicker(!showGamePicker)}
            style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          >
            <Text style={{ color: mainGame ? COLORS.white : COLORS.gray, fontSize: 14 }}>
              {mainGame || 'Select your main game...'}
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
                  placeholder="Search among 500+ games..."
                  placeholderTextColor={COLORS.gray}
                  style={{ flex: 1, color: COLORS.white, fontSize: 13, marginLeft: 8 }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {gameSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setGameSearch('')} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={16} color={COLORS.gray} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView
                style={{ maxHeight: 280 }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {filteredGames.length === 0 ? (
                  <Text style={{ color: COLORS.gray, fontSize: 12, padding: 14, textAlign: 'center' }}>No game found — try another name.</Text>
                ) : (
                  filteredGames.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => { setMainGame(g.name); setShowGamePicker(false); setGameSearch(''); }}
                      style={[styles.gameOption, mainGame === g.name && { backgroundColor: 'rgba(201,168,76,0.1)' }]}
                    >
                      <Text style={[styles.gameOptionText, mainGame === g.name && { color: COLORS.gold }]}>{g.name}</Text>
                      {mainGame === g.name && <Ionicons name="checkmark" size={16} color={COLORS.gold} />}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Social Links */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SOCIAL LINKS</Text>
          {SOCIAL_LINKS.map((s) => (
            <View key={s.id} style={styles.socialRow}>
              <View style={[styles.socialIcon, { backgroundColor: s.color + '18' }]}>
                <Ionicons name={s.icon} size={18} color={s.color} />
              </View>
              <TextInput
                value={links[s.id]}
                onChangeText={(v) => setLinks(prev => ({ ...prev, [s.id]: v }))}
                placeholder={s.placeholder}
                placeholderTextColor={COLORS.gray}
                style={styles.socialInput}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          ))}
        </View>

        {/* Privacy / Display */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DISPLAY</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 14, color: COLORS.white, fontWeight: '600' }}>Show my Streak Level</Text>
              <Text style={{ fontSize: 11, color: COLORS.gray, marginTop: 2 }}>Display your streak plaque on your clips for everyone to see.</Text>
            </View>
            <Switch
              value={!hideStreakLevel}
              onValueChange={(v) => setHideStreakLevel(!v)}
              trackColor={{ false: COLORS.gray3, true: COLORS.gold }}
              thumbColor={COLORS.white}
            />
          </View>
        </View>

        {/* Plan */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUBSCRIPTION PLAN</Text>
          {(() => {
            // iOS : tout le monde peut gérer/s'abonner. Android : coming soon (sauf admin).
            const canManage = Platform.OS === 'ios' || isAdmin;
            return (
              <TouchableOpacity
                style={[styles.planRow, !canManage && { opacity: 0.6 }]}
                onPress={() => canManage ? navigation.navigate('Subscription') : null}
                activeOpacity={canManage ? 0.7 : 1}
              >
                <View style={[styles.planBadge, { backgroundColor: userProfile?.plan === 'legendary' ? COLORS.gold : COLORS.gray3 }]}>
                  <Text style={[styles.planBadgeText, { color: userProfile?.plan === 'legendary' ? COLORS.black : COLORS.gray }]}>
                    {userProfile?.plan === 'legendary' ? '⭐ LEGENDARY' : 'FREE'}
                  </Text>
                </View>
                <Text style={styles.planUpgrade}>
                  {canManage
                    ? (userProfile?.plan === 'legendary' ? 'Manage plan →' : 'Upgrade to Legendary →')
                    : '🔒 Coming soon'}
                </Text>
              </TouchableOpacity>
            );
          })()}
        </View>

        {/* Support us */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Support')}
            activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 0.5, borderColor: COLORS.gold + '50' }}
          >
            <Text style={{ fontSize: 22 }}>💛</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.white }}>Support us</Text>
              <Text style={{ fontSize: 11, color: COLORS.gray, marginTop: 2 }}>Help Gaming Actions keep growing</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.gray} />
          </TouchableOpacity>
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
  bannerSection: { height: BANNER_H + 30, position: 'relative', marginBottom: 40 },
  banner: { width: '100%', height: BANNER_H, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3, overflow: 'hidden' },
  bannerEditBadge: { position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { position: 'absolute', bottom: -10, left: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.black },
  avatarInitials: { fontSize: 22, fontWeight: '900', color: COLORS.gold },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3 },
  hint: { fontSize: 10, color: COLORS.gray, marginTop: 5 },
  charCount: { fontSize: 10, color: COLORS.gray, textAlign: 'right', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: COLORS.gold },
  chipText: { fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  gamePicker: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, marginTop: 8 },
  gameSearch: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  gameOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  gameOptionText: { fontSize: 13, color: COLORS.white },
  socialRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  socialIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  socialInput: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3 },
  planRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.gray3 },
  planBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 12 },
  planBadgeText: { fontSize: 11, fontWeight: '900' },
  planUpgrade: { fontSize: 13, color: COLORS.gold, fontWeight: '600' },
});
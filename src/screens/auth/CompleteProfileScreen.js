import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Image
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { db } from '../../config/firebase';

const ACCOUNT_TYPES = ['gamer', 'creator', 'developer'];
const LOGO_URI = 'https://res.cloudinary.com/doeqzltv0/image/upload/v1781665036/high-level-description-a-minimal-esports_suTAzMGBVkuiFDGhTaiWqg_FbErQD1GTfqf2I9I1w4rWQ_x5hlui.jpg';

export default function CompleteProfileScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [accountType, setAccountType] = useState('gamer');
  const [mainGame, setMainGame] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { saveProfile } = useAuthStore();

  const checkUsernameAvailable = async (name) => {
    const snap = await getDocs(query(collection(db, 'users'), where('username', '==', name.toUpperCase())));
    return snap.empty;
  };

  const handleComplete = async () => {
    const trimmed = username.trim();
    if (!trimmed) return setError('G is required');
    if (trimmed.length < 3) return setError('G must be at least 3 characters');
    if (trimmed.length > 20) return setError('G must be under 20 characters');
    if (!/^[A-Z0-9_]+$/i.test(trimmed)) return setError('G can only contain letters, numbers and _');
    setError('');
    setLoading(true);
    try {
      const available = await checkUsernameAvailable(trimmed);
      if (!available) {
        setError('This G is already taken — try another one');
        setLoading(false);
        return;
      }
      await saveProfile({
        username: trimmed.toUpperCase(),
        bio: bio.trim(),
        accountType,
        mainGame: mainGame.trim(),
        avatar: '',
      });
    } catch (e) {
      // Message générique, pas de détails techniques
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <StatusBar style="light" />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Image source={{ uri: LOGO_URI }} style={{ width: 70, height: 70, borderRadius: 16, marginBottom: 14 }} resizeMode="cover" />
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.subtitle}>Let the world know who you are</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.inputLabel}>YOUR G (USERNAME)</Text>
        <View style={styles.inputBox}>
          <Ionicons name="game-controller-outline" size={16} color={COLORS.gray} />
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="ECHO_KING"
            placeholderTextColor={COLORS.gray}
            style={styles.input}
            autoCapitalize="characters"
            maxLength={20}
          />
        </View>
        <Text style={{ fontSize: 11, color: COLORS.gray, marginTop: -10, marginBottom: 14, marginLeft: 4 }}>
          Your G is your unique identity on Gaming Actions — choose wisely.
        </Text>

        <Text style={styles.inputLabel}>ACCOUNT TYPE</Text>
        <View style={styles.typeRow}>
          {ACCOUNT_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => setAccountType(type)}
              style={[styles.typeBtn, accountType === type && styles.typeBtnActive]}
            >
              <Text style={[styles.typeText, accountType === type && styles.typeTextActive]}>
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.inputLabel}>MAIN GAME (optional)</Text>
        <View style={styles.inputBox}>
          <Ionicons name="trophy-outline" size={16} color={COLORS.gray} />
          <TextInput value={mainGame} onChangeText={setMainGame} placeholder="Call of Duty, FIFA..." placeholderTextColor={COLORS.gray} style={styles.input} />
        </View>

        <Text style={styles.inputLabel}>BIO (optional)</Text>
        <View style={[styles.inputBox, { alignItems: 'flex-start', paddingVertical: 10 }]}>
          <TextInput value={bio} onChangeText={setBio} placeholder="Tell the community about yourself..." placeholderTextColor={COLORS.gray} style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline maxLength={150} />
        </View>
        <Text style={styles.charCount}>{bio.length}/150</Text>

        <TouchableOpacity onPress={handleComplete} style={styles.doneBtn}>
          <Text style={styles.doneText}>LET'S GO 🎮</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 64, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.gray, marginBottom: 28 },
  errorText: { fontSize: 13, color: COLORS.red, marginBottom: 12 },
  inputLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '600', letterSpacing: 1, marginBottom: 6 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 14 },
  input: { flex: 1, fontSize: 14, color: COLORS.white, marginLeft: 8 },
  typeRow: { flexDirection: 'row', marginBottom: 14 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, marginHorizontal: 3, borderWidth: 0.5, borderColor: COLORS.gray3 },
  typeBtnActive: { backgroundColor: COLORS.goldDim, borderColor: COLORS.gold },
  typeText: { fontSize: 11, fontWeight: '700', color: COLORS.gray },
  typeTextActive: { color: COLORS.gold },
  charCount: { fontSize: 11, color: COLORS.gray, textAlign: 'right', marginTop: -10, marginBottom: 14 },
  doneBtn: { backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  doneText: { fontSize: 15, fontWeight: '900', color: COLORS.black, letterSpacing: 1 },
});

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { OAuthProvider, signInWithCredential } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { auth, db } from '../../config/firebase';
import { friendlyError, logError } from '../../utils/errorLogger';

export default function SignUpScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuthStore();

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim() || !confirm.trim()) return setError('Please fill all fields');
    if (password !== confirm) return setError('Passwords do not match');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    setError('');
    setLoading(true);
    try {
      await signUp(email, password);
      Alert.alert(
        '📧 Check your email',
        'A confirmation link was sent to ' + email + '. Click it to activate your account.',
        [{ text: 'OK', onPress: () => navigation.replace('Login') }]
      );
    } catch (e) {
      await logError('SignUp', e);
      // ── Migrated user: already exists in Firestore but tries to create a new account ──
      // Direct them to reset their password instead of showing a generic error.
      if (e.code === 'auth/email-already-in-use') {
        Alert.alert(
          '⚠️ Account already exists',
          'This email is already registered. Would you like to reset your password to access your account?',
          [
            { text: 'Reset Password', onPress: () => navigation.navigate('Forgot') },
            { text: 'Sign In Instead', onPress: () => navigation.replace('Login') },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        setError(friendlyError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      setLoading(true);
      const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId: '878199468974-3b55nbhu4473q4l6huu7tqner349gtmn.apps.googleusercontent.com' });
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const { idToken } = userInfo.data || userInfo;
      const { GoogleAuthProvider, signInWithCredential: swc } = await import('firebase/auth');
      const credential = GoogleAuthProvider.credential(idToken);
      const { user } = await swc(auth, credential);
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, { uid: user.uid, email: user.email || '', username: (user.displayName || 'PLAYER').toUpperCase().slice(0, 20), avatar: user.photoURL || '', accountType: 'gamer', plan: 'free', followers: 0, following: 0, gaPoints: 0, createdAt: serverTimestamp() });
      }
    } catch (e) {
      if (e.message?.includes('RNGoogleSignin')) {
        Alert.alert('Google Sign-In', 'Available in the full app build.');
        return;
      }
      try {
        const { statusCodes } = require('@react-native-google-signin/google-signin');
        if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (e.code === statusCodes.IN_PROGRESS) return;
      } catch (_) {}
      await logError('SignUp_Google', e);
      Alert.alert('Sign-In Error', 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const provider = new OAuthProvider('apple.com');
      const oAuthCredential = provider.credential({
        idToken: credential.identityToken,
        rawNonce: credential.authorizationCode,
      });
      const { user } = await signInWithCredential(auth, oAuthCredential);
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, {
          uid: user.uid, email: user.email || '',
          username: credential.fullName?.givenName?.toUpperCase() || 'PLAYER',
          avatar: '', accountType: 'gamer', plan: 'free',
          followers: 0, following: 0, gaPoints: 0, createdAt: serverTimestamp(),
        });
      }
      navigation.replace('CompleteProfile');
    } catch (e) {
      if (e.code !== 'ERR_CANCELED') {
        await logError('SignUp_Apple', e);
        Alert.alert('Sign-In Error', 'Could not sign in. Please try again.');
      }
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Image
            source={{ uri: 'https://res.cloudinary.com/doeqzltv0/image/upload/v1781665036/high-level-description-a-minimal-esports_suTAzMGBVkuiFDGhTaiWqg_FbErQD1GTfqf2I9I1w4rWQ_x5hlui.jpg' }}
            style={{ width: 90, height: 90, borderRadius: 22, marginBottom: 14 }}
            resizeMode="cover"
          />
          <Text style={styles.title}>Join the game</Text>
          <Text style={styles.subtitle}>Create your free account</Text>
        </View>
        <TouchableOpacity onPress={handleGoogle} style={styles.googleBtn}>
          <Ionicons name="logo-google" size={20} color="#4285F4" />
          <Text style={styles.googleText}>Continue with Google</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleApple} style={styles.appleBtn}>
          <Ionicons name="logo-apple" size={20} color={COLORS.white} />
          <Text style={styles.appleText}>Continue with Apple</Text>
        </TouchableOpacity>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Text style={styles.inputLabel}>EMAIL</Text>
        <View style={styles.inputBox}>
          <Ionicons name="mail-outline" size={16} color={COLORS.gray} />
          <TextInput value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={COLORS.gray} style={styles.input} keyboardType="email-address" autoCapitalize="none" />
        </View>
        <Text style={styles.inputLabel}>PASSWORD</Text>
        <View style={styles.inputBox}>
          <Ionicons name="lock-closed-outline" size={16} color={COLORS.gray} />
          <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={COLORS.gray} style={[styles.input, { flex: 1 }]} secureTextEntry={!showPass} autoCapitalize="none" />
          <TouchableOpacity onPress={() => setShowPass(!showPass)}>
            <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.gray} />
          </TouchableOpacity>
        </View>
        <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
        <View style={styles.inputBox}>
          <Ionicons name="lock-closed-outline" size={16} color={COLORS.gray} />
          <TextInput value={confirm} onChangeText={setConfirm} placeholder="••••••••" placeholderTextColor={COLORS.gray} style={styles.input} secureTextEntry autoCapitalize="none" />
        </View>
        <TouchableOpacity onPress={handleSignUp} style={styles.createBtn}>
          <Text style={styles.createText}>CREATE ACCOUNT</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.replace('Login')} style={styles.loginLink}>
          <Text style={styles.loginLinkText}>Already a gamer? <Text style={{ color: COLORS.gold, fontWeight: '700' }}>Sign in</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 40 },
  backBtn: { marginTop: 54, marginBottom: 20, width: 40 },
  title: { fontSize: 26, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.gray, marginBottom: 24 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 13, marginBottom: 12 },
  googleText: { fontSize: 14, fontWeight: '700', color: '#333', marginLeft: 10 },
  appleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderRadius: 12, paddingVertical: 13, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 20 },
  appleText: { fontSize: 14, fontWeight: '700', color: COLORS.white, marginLeft: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: COLORS.gray3 },
  dividerText: { fontSize: 12, color: COLORS.gray, marginHorizontal: 12 },
  errorText: { fontSize: 13, color: COLORS.red, marginBottom: 12 },
  inputLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 14 },
  input: { flex: 1, fontSize: 14, color: COLORS.white, marginLeft: 8 },
  createBtn: { backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  createText: { fontSize: 15, fontWeight: '900', color: COLORS.black, letterSpacing: 1 },
  loginLink: { alignItems: 'center' },
  loginLinkText: { fontSize: 13, color: COLORS.gray },
});

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { OAuthProvider, signInWithCredential, signInWithEmailAndPassword, sendEmailVerification, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { auth, db } from '../../config/firebase';
import { friendlyError, logError } from '../../utils/errorLogger';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return setError('Please fill all fields');
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (e) {
      if (e.message === 'EMAIL_NOT_VERIFIED') {
        Alert.alert(
          '📧 Email not verified',
          'Please check your inbox and click the verification link before logging in.',
          [
            { text: 'Resend email', onPress: async () => {
              try {
                const { user } = await signInWithEmailAndPassword(auth, email, password);
                await sendEmailVerification(user);
                await firebaseSignOut(auth);
                Alert.alert('✅ Email sent', 'Check your inbox!');
              } catch (err) {}
            }},
            { text: 'OK' },
          ]
        );
      } else {
        await logError('Login', e);
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
      GoogleSignin.configure({ webClientId: '878199468974-3b55nbhu4473q4l6huu7tqner349gtmn.apps.googleusercontent.com', iosClientId: '878199468974-57kfnd5o91gatnl3lv079v49gdvhkt2t.apps.googleusercontent.com' });
      // hasPlayServices() is Android-only — it throws on iOS (no Play Services on iPhone).
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
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
      // User cancelled — silent, no error popup
      try {
        const { statusCodes } = require('@react-native-google-signin/google-signin');
        if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (e.code === statusCodes.IN_PROGRESS) return;
      } catch (_) {}
      // Native module genuinely missing (only happens in Expo Go, never in a real build)
      if (e.message?.includes('RNGoogleSignin') || e.message?.includes('null is not an object')) {
        Alert.alert('Google Sign-In', 'Please use email or Apple sign-in for now.');
        return;
      }
      await logError('Login_Google', e);
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
    } catch (e) {
      if (e.code !== 'ERR_CANCELED') {
        await logError('Login_Apple', e);
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
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <Image
            source={require('../../../assets/logo.png')}
            style={{ width: 90, height: 90, borderRadius: 22, marginBottom: 14 }}
            resizeMode="cover"
          />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>
        <View style={styles.socialRow}>
          <TouchableOpacity onPress={handleGoogle} style={styles.socialBtn}>
            <Ionicons name="logo-google" size={20} color="#4285F4" />
            <Text style={styles.socialText}>Google</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleApple} style={styles.socialBtn}>
            <Ionicons name="logo-apple" size={20} color={COLORS.white} />
            <Text style={styles.socialText}>Apple</Text>
          </TouchableOpacity>
        </View>
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
          <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={COLORS.gray} style={[styles.input, { flex: 1 }]} secureTextEntry={!showPassword} autoCapitalize="none" />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.gray} />
          </TouchableOpacity>
        </View>
        {/* Forgot password — also useful for migrated users setting their password */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Forgot')}
          style={{ alignSelf: 'flex-end', marginBottom: 12, marginTop: -4 }}
        >
          <Text style={{ fontSize: 12, color: COLORS.gold, fontWeight: '600' }}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleLogin} style={styles.signInBtn}>
          <Text style={styles.signInText}>SIGN IN</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.replace('SignUp')} style={styles.signUpLink}>
          <Text style={styles.signUpText}>New here? <Text style={{ color: COLORS.gold, fontWeight: '700' }}>Create account</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.gray, marginBottom: 0 },
  socialRow: { flexDirection: 'row', marginBottom: 20 },
  socialBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingVertical: 13, borderWidth: 0.5, borderColor: COLORS.gray3, marginHorizontal: 5 },
  socialText: { fontSize: 14, fontWeight: '700', color: COLORS.white, marginLeft: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: COLORS.gray3 },
  dividerText: { fontSize: 12, color: COLORS.gray, marginHorizontal: 12 },
  errorText: { fontSize: 13, color: COLORS.red, marginBottom: 12 },
  inputLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 14 },
  input: { flex: 1, fontSize: 14, color: COLORS.white, marginLeft: 8 },
  signInBtn: { backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8, marginBottom: 20 },
  signInText: { fontSize: 15, fontWeight: '900', color: COLORS.black, letterSpacing: 1 },
  signUpLink: { alignItems: 'center' },
  signUpText: { fontSize: 13, color: COLORS.gray },
});

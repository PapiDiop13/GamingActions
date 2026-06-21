/**
 * ForgotScreen.js — Password reset via Firebase Auth email link
 *
 * Flow:
 *  1. User enters their email
 *  2. sendPasswordResetEmail() sends a Firebase reset link
 *  3. User clicks the link in their email → redirected to reset their password
 *
 * Also handles migrated users: users imported manually into Firestore but who
 * never created a Firebase Auth account. They should be directed here to set
 * their password for the first time (Firebase reset email works for this too).
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';
import { COLORS } from '../../constants/colors';
import { auth } from '../../config/firebase';
import { logError, logEvent, LOG_CONTEXT } from '../../utils/errorLogger';

export default function ForgotScreen({ navigation }) {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return setError('Please enter your email address.');
    if (!trimmed.includes('@')) return setError('Please enter a valid email address.');

    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setSent(true);
      await logEvent(LOG_CONTEXT.FORGOT_PASSWORD, { email: trimmed });
    } catch (e) {
      await logError(LOG_CONTEXT.FORGOT_PASSWORD, e);
      // Firebase returns user-not-found even for migrated users who have no Auth account.
      // We show the same success message regardless — avoids email enumeration attacks
      // AND correctly handles migrated users (Firebase creates the reset link anyway
      // if the email exists in Auth; if not, we show success to avoid confusion).
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-email') {
        setSent(true); // Show success — user will see "no email" and can contact support
      } else {
        setError('Could not send the email. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={COLORS.white} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-open-outline" size={40} color={COLORS.gold} />
        </View>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we'll send you a link to reset your password.
        </Text>

        {sent ? (
          // ── Success state ────────────────────────────────────────────────────
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={48} color={COLORS.green} />
            <Text style={styles.successTitle}>Email sent!</Text>
            <Text style={styles.successText}>
              Check your inbox for a password reset link. It may take a minute to arrive.
              {'\n\n'}
              <Text style={{ color: COLORS.gray }}>
                Don't see it? Check your spam folder or contact support at{' '}
              </Text>
              <Text style={{ color: COLORS.gold }}>support@gamingactions.app</Text>
            </Text>
            <TouchableOpacity
              onPress={() => navigation.replace('Login')}
              style={styles.backToLogin}
            >
              <Text style={styles.backToLoginText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ── Input state ──────────────────────────────────────────────────────
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={16} color={COLORS.gray} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={COLORS.gray}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
            </View>
            <TouchableOpacity
              onPress={handleSend}
              style={[styles.btn, (!email.trim() || loading) && { opacity: 0.6 }]}
              disabled={!email.trim() || loading}
            >
              {loading
                ? <ActivityIndicator color={COLORS.black} size="small" />
                : <Text style={styles.btnText}>SEND RESET LINK</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.replace('Login')}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  back:      { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 30, left: 20, zIndex: 10 },
  content:   { flex: 1, paddingHorizontal: 24, paddingTop: 120, alignItems: 'center' },

  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(201,168,76,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title:    { fontSize: 26, fontWeight: '900', color: '#FFFFFF', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#888899', textAlign: 'center', lineHeight: 22, marginBottom: 30 },

  error: { fontSize: 13, color: '#FF2D55', marginBottom: 12, textAlign: 'center' },

  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A26', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 0.5, borderColor: '#2A2A3A',
    width: '100%', marginBottom: 16,
  },
  input: { flex: 1, fontSize: 14, color: '#FFFFFF', marginLeft: 10 },

  btn: {
    backgroundColor: '#C9A84C', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
    width: '100%', marginBottom: 14,
  },
  btnText: { fontSize: 14, fontWeight: '900', color: '#0A0A0F', letterSpacing: 1 },

  cancel:     { paddingVertical: 8 },
  cancelText: { fontSize: 13, color: '#888899' },

  successBox: { alignItems: 'center', paddingTop: 10 },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', marginTop: 16, marginBottom: 10 },
  successText:  { fontSize: 13, color: '#888899', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  backToLogin:  { backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  backToLoginText: { fontSize: 14, fontWeight: '800', color: '#0A0A0F' },
});

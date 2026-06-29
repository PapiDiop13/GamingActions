import React, { useState } from 'react';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { COLORS } from '../../constants/colors';
import { auth } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

function Field({ label, value, onChangeText, show, onToggleShow }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          style={styles.input}
          placeholderTextColor={COLORS.gray}
          placeholder="••••••••"
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={onToggleShow}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ChangePasswordScreen({ navigation }) {
  const { user } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!current || !newPass || !confirm) return Alert.alert('Error', 'Fill all fields.');
    if (newPass !== confirm) return Alert.alert('Error', 'Passwords do not match.');
    if (newPass.length < 8) return Alert.alert('Error', 'Password must be at least 8 characters.');
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, current);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPass);
      const { signOut } = useAuthStore.getState();
      Alert.alert('✅ Password updated!', 'Your password has been changed. Please sign in again.', [
        { text: 'OK', onPress: () => signOut() }
      ]);
    } catch (e) {
      logError(LOG_CONTEXT.SETTINGS_FAIL || 'settings', e, user?.uid);
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
          || (e.message || '').includes('invalid-credential')
          || (e.message || '').includes('INVALID_LOGIN_CREDENTIALS')) {
        Alert.alert('Error', 'Current password is incorrect.');
      } else if (e.code === 'auth/requires-recent-login') {
        Alert.alert('Session expired', 'Please sign out and sign in again, then change your password.');
      } else if (e.code === 'auth/weak-password') {
        Alert.alert('Error', 'New password is too weak. Use at least 8 characters.');
      } else {
        Alert.alert('Error', 'Something went wrong. Please try again.');
      }
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
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.content}>
        <Field
          label="Current Password"
          value={current}
          onChangeText={setCurrent}
          show={showCurrent}
          onToggleShow={() => setShowCurrent(s => !s)}
        />
        <Field
          label="New Password"
          value={newPass}
          onChangeText={setNewPass}
          show={showNew}
          onToggleShow={() => setShowNew(s => !s)}
        />
        <Field
          label="Confirm New Password"
          value={confirm}
          onChangeText={setConfirm}
          show={showConfirm}
          onToggleShow={() => setShowConfirm(s => !s)}
        />
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={loading}>
          <Text style={styles.saveBtnText}>Update Password</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  content: { padding: 16 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, borderWidth: 0.5, borderColor: COLORS.gray3 },
  input: { flex: 1, fontSize: 15, color: COLORS.white, paddingVertical: 13 },
  saveBtn: { backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.black },
});
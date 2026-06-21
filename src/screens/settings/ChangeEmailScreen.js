import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, sendEmailVerification } from 'firebase/auth';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { auth } from '../../config/firebase';

export default function ChangeEmailScreen({ navigation }) {
  const { user } = useAuthStore();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!newEmail.includes('@')) return Alert.alert('Error', 'Enter a valid email.');
    if (!password) return Alert.alert('Error', 'Enter your password to confirm.');
    setLoading(true);
    try {
      // Réauthentifier l'user
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      // Mettre à jour l'email
      await updateEmail(auth.currentUser, newEmail);
      // Envoyer email de vérification
      await sendEmailVerification(auth.currentUser);
      const { signOut } = useAuthStore.getState();
      Alert.alert(
        '📧 Email updated!',
        `A verification email was sent to ${newEmail}. Sign in again with your new email.`,
        [{ text: 'OK', onPress: () => signOut() }]
      );
    } catch (e) {
      if (e.code === 'auth/wrong-password') {
        Alert.alert('Error', 'Incorrect password.');
      } else if (e.code === 'auth/email-already-in-use') {
        Alert.alert('Error', 'This email is already in use.');
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
        <Text style={styles.headerTitle}>Change Email</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.content}>
        <View style={styles.currentEmail}>
          <Ionicons name="mail-outline" size={18} color={COLORS.gold} />
          <Text style={styles.currentEmailText}>Current: {user?.email || 'user@email.com'}</Text>
        </View>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.blue} />
          <Text style={styles.infoText}>A verification email will be sent to your new address. You will need to confirm it before you can log in.</Text>
        </View>
        <Text style={styles.fieldLabel}>NEW EMAIL</Text>
        <TextInput value={newEmail} onChangeText={setNewEmail} style={styles.input} placeholder="new@email.com" placeholderTextColor={COLORS.gray} autoCapitalize="none" keyboardType="email-address" />
        <Text style={styles.fieldLabel}>CONFIRM WITH PASSWORD</Text>
        <View style={styles.inputRow}>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPass} style={[styles.input, { flex: 1, borderWidth: 0 }]} placeholder="Your current password" placeholderTextColor={COLORS.gray} autoCapitalize="none" />
          <TouchableOpacity onPress={() => setShowPass(!showPass)}>
            <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={loading}>
          <Text style={styles.saveBtnText}>Update Email</Text>
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
  currentEmail: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: COLORS.gray3 },
  currentEmailText: { fontSize: 13, color: COLORS.gray, marginLeft: 10 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 0.5, borderColor: COLORS.blue + '40' },
  infoText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17, marginLeft: 8 },
  fieldLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 12 },
  saveBtn: { backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.black },
});
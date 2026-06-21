import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

export default function ReportBugScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (description.trim().length < 10) return Alert.alert('Too short', 'Please describe the bug in at least 10 characters.');
    try {
      await addDoc(collection(db, 'bug_reports'), {
        userId: user?.uid,
        username: userProfile?.username || 'Unknown',
        email: user?.email || '',
        description: description.trim(),
        platform: Platform.OS,
        createdAt: serverTimestamp(),
        status: 'new',
      });
      setSubmitted(true);
    } catch (e) {
      Alert.alert('Error', 'Could not submit. Please try again later.');
    }
  };

  if (submitted) {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <View style={s.center}>
          <Ionicons name="checkmark-circle" size={60} color="#00C853" />
          <Text style={s.thankTitle}>Thank you!</Text>
          <Text style={s.thankDesc}>Your bug report has been submitted. We'll investigate and fix it as soon as possible.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.btn}>
            <Text style={s.btnText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Report a Bug</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.label}>What happened?</Text>
        <Text style={s.hint}>Describe the bug as clearly as possible. Include what you were doing when it happened.</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={s.input}
          placeholder="Ex: When I tap on a video in the feed, the app freezes for 3 seconds..."
          placeholderTextColor={COLORS.gray}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity onPress={handleSubmit} style={s.btn}>
          <Ionicons name="send" size={16} color={COLORS.black} />
          <Text style={s.btnText}> Submit Bug Report</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  content: { padding: 16, paddingBottom: 60 },
  label: { fontSize: 16, fontWeight: '800', color: COLORS.white, marginBottom: 6 },
  hint: { fontSize: 13, color: COLORS.gray, lineHeight: 19, marginBottom: 14 },
  input: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, height: 160, marginBottom: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 14 },
  btnText: { fontSize: 15, fontWeight: '900', color: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  thankTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginTop: 16, marginBottom: 10 },
  thankDesc: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 21, marginBottom: 30 },
});
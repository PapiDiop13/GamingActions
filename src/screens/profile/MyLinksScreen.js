import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', icon: 'logo-youtube', color: '#FF0000' },
  { id: 'twitch', label: 'Twitch', icon: 'logo-twitch', color: '#9146FF' },
  { id: 'twitter', label: 'Twitter/X', icon: 'logo-twitter', color: COLORS.blue },
  { id: 'tiktok', label: 'TikTok', icon: 'musical-notes-outline', color: COLORS.white },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C' },
  { id: 'discord', label: 'Discord', icon: 'chatbubbles-outline', color: '#5865F2' },
];

export default function MyLinksScreen({ navigation }) {
  const [links, setLinks] = useState({});

  const handleSave = () => {
    Alert.alert('Saved!', 'Your links have been updated.');
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Links</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>
        <Text style={styles.subtitle}>Add your social media links to your profile</Text>
        {PLATFORMS.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: p.color + '18' }]}>
              <Ionicons name={p.icon} size={20} color={p.color} />
            </View>
            <View style={styles.inputWrap}>
              <Text style={styles.platformLabel}>{p.label}</Text>
              <TextInput
                value={links[p.id] || ''}
                onChangeText={(v) => setLinks(prev => ({ ...prev, [p.id]: v }))}
                placeholder={`https://${p.id}.com/yourname`}
                placeholderTextColor={COLORS.gray2}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  saveBtn: { backgroundColor: COLORS.gold, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  subtitle: { fontSize: 12, color: COLORS.gray, marginBottom: 20, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: COLORS.gray3 },
  iconWrap: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  inputWrap: { flex: 1 },
  platformLabel: { fontSize: 11, fontWeight: '700', color: COLORS.white, marginBottom: 4 },
  input: { fontSize: 12, color: COLORS.gray, padding: 0 },
});
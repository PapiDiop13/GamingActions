import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Platform, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

const SETTINGS_DEF = [
  { key: 'gg',          icon: 'star-outline',        color: COLORS.gold,   label: 'GG Received',   desc: 'When someone GGs your clip' },
  { key: 'newFollower', icon: 'person-add-outline',   color: COLORS.blue,   label: 'New Followers', desc: 'When someone follows you' },
  { key: 'comments',    icon: 'chatbubble-outline',   color: COLORS.blue,   label: 'Comments',      desc: 'When someone comments on your clip' },
  { key: 'fanbase',     icon: 'lock-open-outline',    color: '#00C853',     label: 'Fanbase',       desc: 'New subscribers and fanbase activity' },
  { key: 'rankings',    icon: 'trophy-outline',       color: COLORS.gold,   label: 'Rankings',      desc: 'Monthly ranking updates' },
  { key: 'system',      icon: 'megaphone-outline',    color: COLORS.gray,   label: 'System',        desc: 'Updates from Gaming Actions' },
];

const DEFAULT_SETTINGS = { gg: true, newFollower: true, comments: true, fanbase: true, rankings: true, system: true };

export default function NotificationsSettingsScreen({ navigation }) {
  const { user } = useAuthStore();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // key being saved

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists() && snap.data().notifSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...snap.data().notifSettings });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.uid]);

  const toggle = async (key) => {
    const newVal = !settings[key];
    setSettings(prev => ({ ...prev, [key]: newVal }));
    setSaving(key);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`notifSettings.${key}`]: newVal,
      });
    } catch (e) {
      // rollback on error
      setSettings(prev => ({ ...prev, [key]: !newVal }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.gold} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <Text style={styles.sectionLabel}>NOTIFICATION TYPES</Text>
          {SETTINGS_DEF.map((s) => (
            <View key={s.key} style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: s.color + '18' }]}>
                <Ionicons name={s.icon} size={18} color={s.color} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.settingLabel}>{s.label}</Text>
                <Text style={styles.settingDesc}>{s.desc}</Text>
              </View>
              {saving === s.key
                ? <ActivityIndicator size="small" color={COLORS.gold} style={{ marginRight: 4 }} />
                : <Switch
                    value={settings[s.key]}
                    onValueChange={() => toggle(s.key)}
                    trackColor={{ false: COLORS.gray3, true: COLORS.gold + '80' }}
                    thumbColor={settings[s.key] ? COLORS.gold : COLORS.gray}
                  />
              }
            </View>
          ))}
          <Text style={styles.hint}>Changes are saved automatically.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  settingIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  settingDesc: { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  hint: { fontSize: 11, color: COLORS.gray2, textAlign: 'center', marginTop: 20, paddingHorizontal: 16 },
});

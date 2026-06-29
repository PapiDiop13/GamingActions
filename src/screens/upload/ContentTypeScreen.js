import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';

const CLIP_TYPE = {
  id: 'clip',
  icon: 'game-controller-outline',
  title: 'Gaming Clip',
  desc: 'Share your best gameplay moments. Get GG\'d by the community.',
  color: COLORS.gold,
};

const GAMER_TYPES = [CLIP_TYPE];

const CREATOR_TYPES = [
  CLIP_TYPE,
  {
    id: 'flashtuto',
    icon: 'bulb-outline',
    title: 'FlashTuto',
    desc: 'Short tutorial or tip to help other gamers improve.',
    color: COLORS.blue,
  },
  {
    id: 'flashinfo',
    icon: 'newspaper-outline',
    title: 'FlashInfo',
    desc: 'Gaming news, meta updates, patch notes breakdown.',
    color: COLORS.red,
  },
  {
    id: 'gameindev',
    icon: 'code-slash-outline',
    title: 'GameInDev',
    desc: 'Dev diary or reveal for a game you are building.',
    color: '#7C4DFF',
  },
];

export default function ContentTypeScreen({ navigation }) {
  const { userProfile } = useAuthStore();
  const isCreator = userProfile?.accountType === 'creator' || userProfile?.accountType === 'gameconic' || userProfile?.accountType === 'admin';
  const types = isCreator ? CREATOR_TYPES : GAMER_TYPES;

  const handleSelect = (type) => {
    navigation.navigate('UploadMain', { contentType: type.id });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>What are you sharing?</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          {isCreator ? 'Creator mode — choose your content type' : 'Share your best gaming moments'}
        </Text>

        {!isCreator && (
          <View style={styles.gamerNote}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.blue} />
            <Text style={styles.gamerNoteText}>
              Want to post tips or news? <Text style={{ color: COLORS.blue, fontWeight: '700' }}>Request Creator status</Text> in Settings.
            </Text>
          </View>
        )}

        {types.map((type) => (
          <TouchableOpacity
            key={type.id}
            onPress={() => handleSelect(type)}
            style={[styles.card, { borderColor: type.color + '40' }]}
            activeOpacity={0.85}
          >
            <View style={[styles.iconWrap, { backgroundColor: type.color + '18' }]}>
              <Ionicons name={type.icon} size={28} color={type.color} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{type.title}</Text>
              <Text style={styles.cardDesc}>{type.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={type.color} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  content: { padding: 16 },
  subtitle: { fontSize: 13, color: COLORS.gray, marginBottom: 16, textAlign: 'center' },
  gamerNote: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: COLORS.blue + '40', marginBottom: 20 },
  gamerNoteText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17, marginLeft: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 0.5 },
  iconWrap: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.white, marginBottom: 4 },
  cardDesc: { fontSize: 12, color: COLORS.gray, lineHeight: 16 },
});
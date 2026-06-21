import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export default function FanBoxScreen({ navigation }) {
  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>FanBox</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <Ionicons name="chatbubbles" size={50} color="#00C853" />
        </View>
        <Text style={s.title}>FanBox — Coming Soon</Text>
        <Text style={s.desc}>
          Le FanBox sera un espace de chat exclusif entre le createur et ses fans abonnes.{'\n\n'}
          Messages, annonces, previews, discussions — tout en temps reel.{'\n\n'}
          Cette fonctionnalite sera disponible dans une prochaine mise a jour.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.btn}>
          <Text style={s.btnText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  iconWrap: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(0,200,83,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,200,83,0.3)' },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginBottom: 14, textAlign: 'center' },
  desc: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 21, marginBottom: 30 },
  btn: { backgroundColor: '#00C853', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  btnText: { fontSize: 15, fontWeight: '900', color: COLORS.black },
});
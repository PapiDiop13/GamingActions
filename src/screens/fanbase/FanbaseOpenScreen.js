import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Platform, Alert, Modal, TouchableWithoutFeedback,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

function ComingSoonModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={modal.backdrop}>
          <TouchableWithoutFeedback>
            <View style={modal.card}>
              <Ionicons name="time-outline" size={52} color={COLORS.gold} />
              <Text style={modal.title}>Fanbase Coming Soon</Text>
              <Text style={modal.subtitle}>
                Fanbase creation will be available soon.{'\n\n'}
                We're completing our payment integration.{'\n\n'}
                🚀 Thanks for your patience!
              </Text>
              <TouchableOpacity onPress={onClose} style={modal.btn}>
                <Text style={modal.btnText}>Got it 👌</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const modal = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#141420', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginTop: 14, marginBottom: 10 },
  subtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  btn: { backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 30 },
  btnText: { fontSize: 15, fontWeight: '800', color: COLORS.black },
});

export default function FanbaseOpenScreen({ navigation }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showPopup, setShowPopup] = useState(false);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ComingSoonModal visible={showPopup} onClose={() => { setShowPopup(false); navigation.goBack(); }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Open My Fanbase</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="people" size={40} color="#7C4DFF" />
        </View>
        <Text style={styles.title}>Create Your Fanbase</Text>
        <Text style={styles.subtitle}>Give your exclusive community a name and let your fans in.</Text>

        <Text style={styles.label}>FANBASE NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex: FLAME's Inner Circle"
          placeholderTextColor={COLORS.gray}
          style={styles.input}
          maxLength={40}
        />
        <Text style={styles.charCount}>{name.length}/40</Text>

        <Text style={styles.label}>DESCRIPTION (optionnel)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What will your fans get access to?"
          placeholderTextColor={COLORS.gray}
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          multiline
          maxLength={120}
        />
        <Text style={styles.charCount}>{description.length}/120</Text>

        <View style={styles.priceInfo}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.blue} />
          <Text style={styles.priceInfoText}>Price fixed at <Text style={{ color: COLORS.gold, fontWeight: '700' }}>$4.99/month</Text> per subscriber. You receive 80% after fees.</Text>
        </View>

        <TouchableOpacity
          onPress={() => { if (!name.trim()) { Alert.alert('Missing', 'Please give your fanbase a name.'); return; } setShowPopup(true); }}
          style={[styles.createBtn, !name.trim() && { opacity: 0.4 }]}
          disabled={!name.trim()}
        >
          <Ionicons name="lock-open-outline" size={18} color={COLORS.black} />
          <Text style={styles.createBtnText}>Open My Fanbase</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  content: { flex: 1, padding: 24, alignItems: 'center' },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(124,77,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#7C4DFF' + '40' },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  label: { alignSelf: 'flex-start', fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input: { width: '100%', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 4 },
  charCount: { alignSelf: 'flex-end', fontSize: 10, color: COLORS.gray, marginBottom: 20 },
  priceInfo: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: COLORS.blue + '40', marginBottom: 28, width: '100%' },
  priceInfoText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17, marginLeft: 8 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C4DFF', borderRadius: 14, paddingVertical: 16, width: '100%' },
  createBtnText: { fontSize: 16, fontWeight: '900', color: COLORS.white, marginLeft: 8 },
});
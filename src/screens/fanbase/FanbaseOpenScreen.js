import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';

export default function FanbaseOpenScreen({ navigation }) {
  const { user } = useAuthStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Champ requis', 'Donne un nom à ta fanbase.'); return; }
    if (!user?.uid) { Alert.alert('Erreur', 'Tu dois être connecté.'); return; }

    setLoading(true);
    try {
      await setDoc(doc(db, 'fanbases', user.uid), {
        creatorId: user.uid,
        name: name.trim(),
        description: description.trim(),
        createdAt: serverTimestamp(),
        subscriberCount: 0,
        isActive: true,
      });
      await updateDoc(doc(db, 'users', user.uid), {
        hasFanbase: true,
        fanbaseName: name.trim(),
      });
      Alert.alert(
        'Fanbase ouverte !',
        '"' + name.trim() + '" est maintenant accessible à tes fans.',
        [{ text: 'Gérer ma fanbase', onPress: () => navigation.replace('FanbaseManage') }]
      );
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de créer la fanbase. Réessaie.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ouvrir ma Fanbase</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="people" size={40} color="#7C4DFF" />
        </View>
        <Text style={styles.title}>Crée ta communauté exclusive</Text>
        <Text style={styles.subtitle}>Donne un nom à ta fanbase et accueille tes fans dans un espace privé.</Text>
        <Text style={styles.label}>NOM DE LA FANBASE</Text>
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
          placeholder="Ce que tes fans vont débloquer..."
          placeholderTextColor={COLORS.gray}
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          multiline
          maxLength={120}
        />
        <Text style={styles.charCount}>{description.length}/120</Text>
        <View style={styles.priceInfo}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.blue} />
          <Text style={styles.priceInfoText}>
            Accès gratuit pendant la phase de lancement. Les abonnements payants arrivent prochainement.
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleCreate}
          style={[styles.createBtn, (!name.trim() || loading) && { opacity: 0.5 }]}
          disabled={!name.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="lock-open-outline" size={18} color={COLORS.white} />
              <Text style={styles.createBtnText}>Ouvrir ma Fanbase</Text>
            </>
          )}
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
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(124,77,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#7C4DFF40' },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.white, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  label: { alignSelf: 'flex-start', fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input: { width: '100%', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.white, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 4 },
  charCount: { alignSelf: 'flex-end', fontSize: 10, color: COLORS.gray, marginBottom: 20 },
  priceInfo: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: '#00D4FF40', marginBottom: 28, width: '100%' },
  priceInfoText: { flex: 1, fontSize: 12, color: COLORS.gray, lineHeight: 17, marginLeft: 8 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C4DFF', borderRadius: 14, paddingVertical: 16, width: '100%', gap: 8 },
  createBtnText: { fontSize: 16, fontWeight: '900', color: COLORS.white },
});

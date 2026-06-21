import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export default function BlockedUsersScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.content}>
        <Ionicons name="shield-checkmark-outline" size={50} color={COLORS.gray2} />
        <Text style={styles.emptyTitle}>No blocked users</Text>
        <Text style={styles.emptyDesc}>Users you block will appear here. You can block someone from their profile or from a report.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white, marginTop: 16 },
  emptyDesc: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 19, marginTop: 8 },
});
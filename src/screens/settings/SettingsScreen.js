import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Image,
  } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import useAuthStore from '../../store/useAuthStore';
import { doc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../../config/firebase';
import { clearPrefs } from '../../utils/feedAlgo';
import { resetPlaylist } from '../../utils/feedSession';

function SettingsRow({ icon, label, onPress, right, danger = false, color }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: (color || (danger ? COLORS.red : COLORS.gold)) + '18' }]}>
        <Ionicons name={icon} size={17} color={danger ? COLORS.red : (color || COLORS.gold)} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: COLORS.red }]}>{label}</Text>
      {right || <Ionicons name="chevron-forward" size={15} color={COLORS.gray2} />}
    </TouchableOpacity>
  );
}

function Avatar({ user, size = 52 }) {
    const initials = (user?.username || 'GA').slice(0, 2).toUpperCase();
    return (
      <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, borderWidth: 2, borderColor: COLORS.gold, opacity: 0.5 }} />
        {user?.avatar ? (
          <Image
            source={{ uri: user.avatar }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.gold }}>
            <Text style={{ color: COLORS.gold, fontWeight: '800', fontSize: size * 0.35 }}>{initials}</Text>
          </View>
        )}
      </View>
    );
  }

export default function SettingsScreen({ navigation }) {
  const { user, userProfile, signOut } = useAuthStore();
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    setShowAdmin(!!userProfile?.isAdmin);
  }, [userProfile?.isAdmin]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Watch History',
      'Your feed preferences will be reset. The algorithm will start fresh.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: async () => {
          await clearPrefs();
          await resetPlaylist(); // Also reset feed session so feed starts fresh
          Alert.alert('✅ Done', 'Your watch history and feed session have been cleared.');
        }},
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Account',
      'Your account and all your content will be deleted. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'All your clips, GGs and progress will be permanently removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const uid = user?.uid;
                      if (!uid) return;

                      // Soft delete — données conservées côté admin, suppression effective après 90j.
                      await updateDoc(doc(db, 'users', uid), {
                        status: 'pending_deletion',
                        deletedAt: serverTimestamp(),
                        banned: true,
                        username: `deleted_${uid.slice(0, 6)}`,
                        avatar: null,
                        bio: '',
                      });

                      await signOut(auth);

                    } catch (e) {
                      Alert.alert('Error', 'Could not delete account. Please try again or contact support@gamingactions.com');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const Badge = ({ label, color, textColor }) => (
    <View style={{ backgroundColor: color, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginLeft: 6 }}>
      <Text style={{ fontSize: 8, fontWeight: '900', color: textColor || COLORS.black }}>{label}</Text>
    </View>
  );

  const ActiveBadge = ({ label }) => (
    <View style={styles.activeBadge}>
      <Text style={styles.activeBadgeText}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} style={styles.profileCard} activeOpacity={0.85}>
          <Avatar user={userProfile} size={52} />
          <View style={styles.profileInfo}>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName}>{userProfile?.username}</Text>
              {userProfile?.plan === 'legendary' && <Badge label="LEG" color={COLORS.gold} />}
              {userProfile?.accountType === 'creator' && <Badge label="CR" color={COLORS.blue} textColor={COLORS.dark} />}
              {userProfile?.accountType === 'gameconic' && <Badge label="ICON" color={COLORS.red} textColor={COLORS.white} />}
            </View>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <Text style={styles.profileMeta}>🎮 {userProfile?.mainGame || 'Gaming'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
        </TouchableOpacity>

        {/* GA Points + GG */}
        <View style={styles.pointsCard}>
          <View style={styles.pointsItem}>
            <Text style={styles.pointsNum}>{userProfile?.gaPoints?.toLocaleString() || 0}</Text>
            <Text style={styles.pointsLabel}>GA Points</Text>
          </View>
          <View style={styles.pointsDivider} />
          <View style={styles.pointsItem}>
            <Text style={styles.pointsNum}>{userProfile?.ggReceived || 0}</Text>
            <Text style={styles.pointsLabel}>GG Received</Text>
          </View>
          <View style={styles.pointsDivider} />
          <TouchableOpacity onPress={() => navigation.navigate('Shop')} style={styles.pointsItem}>
            <Text style={[styles.pointsNum, { color: COLORS.gold }]}>Shop</Text>
            <Text style={styles.pointsLabel}>Use Points</Text>
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.section}>
          <SettingsRow icon="person-outline" label="Edit Profile" onPress={() => navigation.navigate('EditProfile')} />
          <SettingsRow icon="mail-outline" label="Change Email" onPress={() => navigation.navigate('ChangeEmail')} />
          <SettingsRow icon="lock-closed-outline" label="Change Password" onPress={() => navigation.navigate('ChangePassword')} />
        </View>

        {/* Subscription */}
        <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
        <View style={styles.section}>
          <SettingsRow
            icon="star-outline"
            label="Legendary subscription"
            onPress={() => navigation.navigate('Subscription')}
            right={<ActiveBadge label={userProfile?.plan === 'legendary' ? 'ACTIVE' : 'UPGRADE'} />}
          />
          <SettingsRow
            icon="heart-outline"
            label="Support the App 💛"
            onPress={() => navigation.navigate('Support')}
            color={COLORS.gold}
          />
          {(userProfile?.accountType === 'creator' || userProfile?.accountType === 'gameconic') && (
            <SettingsRow
              icon="people-outline"
              label="My Fanbase"
              onPress={() => navigation.navigate('FanbaseManage')}
            />
          )}
          {(userProfile?.accountType === 'creator' || userProfile?.accountType === 'gameconic') && (
            <SettingsRow
              icon="cash-outline"
              label="Creator Earnings"
              onPress={() => navigation.navigate('CreatorEarnings')}
            />
          )}
          <SettingsRow
            icon="lock-open-outline"
            label="Fanbase subscription"
            onPress={() => navigation.navigate('MyFanbase')}
          />
        </View>

        {/* Creator request */}
        {userProfile?.accountType === 'gamer' && (
          <>
            <Text style={styles.sectionTitle}>CREATOR</Text>
            <View style={styles.section}>
              <SettingsRow
                icon="rocket-outline"
                label="Request Creator Status"
                onPress={() => navigation.navigate('RequestCreator')}
              />
            </View>
          </>
        )}

        {/* Community */}
        {/* Admin — visible uniquement pour les emails autorisés */}
        {showAdmin && (
          <>
            <Text style={styles.sectionTitle}>ADMIN</Text>
            <View style={styles.section}>
              <SettingsRow
                icon="shield-checkmark-outline"
                label="Admin Panel"
                onPress={() => navigation.navigate('Admin')}
                color={COLORS.red}
              />
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>COMMUNITY</Text>
        <View style={styles.section}>
          <SettingsRow icon="person-remove-outline" label="Blocked Users" onPress={() => navigation.navigate('BlockedUsers')} />
          <SettingsRow icon="notifications-outline" label="Notifications" onPress={() => navigation.navigate('NotificationsSettings')} />
          <SettingsRow icon="notifications-outline" label="Bells & Alerts" onPress={() => navigation.navigate('BellsList')} />
        </View>

        {/* Help */}
        <Text style={styles.sectionTitle}>HELP & LEARN</Text>
        <View style={styles.section}>
          <SettingsRow icon="cloud-upload-outline" label="How to Upload Clips" onPress={() => navigation.navigate('HowToUpload')} color={COLORS.blue} />
          <SettingsRow icon="book-outline" label="Community Guidelines" onPress={() => navigation.navigate('CommunityGuidelines')} />
          <SettingsRow icon="trophy-outline" label="Championship Contest Rules" onPress={() => navigation.navigate('ContestRules')} color={COLORS.gold} />
          <SettingsRow icon="bug-outline" label="Report a Bug" onPress={() => navigation.navigate('ReportBug')} />
          <SettingsRow icon="document-text-outline" label="Terms of Use" onPress={() => navigation.navigate('Terms')} />
          <SettingsRow icon="shield-outline" label="Privacy Policy" onPress={() => navigation.navigate('PrivacyPolicy')} />
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionTitle}>ACCOUNT ACTIONS</Text>
        <View style={styles.section}>
          <SettingsRow icon="log-out-outline" label="Sign Out" onPress={handleLogout} danger />
          <SettingsRow icon="time-outline" label="Clear Watch History" onPress={handleClearHistory} />
          <SettingsRow icon="trash-outline" label="Delete Account" onPress={handleDelete} danger />
        </View>

        <Text style={styles.version}>Gaming Actions v1.0.0 · Rize to the GG 🏆</Text>
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  profileCard: { flexDirection: 'row', alignItems: 'center', margin: 14, padding: 14, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.gray3 },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  profileName: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  profileEmail: { fontSize: 11, color: COLORS.gray, marginBottom: 2 },
  profileMeta: { fontSize: 10, color: COLORS.gold },
  pointsCard: { flexDirection: 'row', marginHorizontal: 14, marginBottom: 8, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, overflow: 'hidden' },
  pointsItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  pointsNum: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  pointsLabel: { fontSize: 9, color: COLORS.gray, marginTop: 2, textTransform: 'uppercase' },
  pointsDivider: { width: 0.5, backgroundColor: COLORS.gray3, marginVertical: 8 },
  sectionTitle: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 6 },
  section: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.gray3, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowLabel: { flex: 1, fontSize: 13, color: COLORS.white, fontWeight: '500' },
  activeBadge: { backgroundColor: 'rgba(0,200,83,0.15)', borderWidth: 0.5, borderColor: '#00C853', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeBadgeText: { fontSize: 9, color: '#00C853', fontWeight: '800' },
  version: { fontSize: 11, color: COLORS.gray2, textAlign: 'center', paddingTop: 20 },
});
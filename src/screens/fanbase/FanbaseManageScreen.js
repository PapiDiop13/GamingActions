import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, Image, ActivityIndicator, Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../../components/FramedAvatar';

const GREEN = '#00C853';


export default function FanbaseManageScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [fans, setFans] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      // Vrais fans (fanbase_subscriptions)
      const fSnap = await getDocs(query(collection(db, 'fanbase_subscriptions'), where('creatorId', '==', user.uid)));
      const fansList = [];
      for (const d of fSnap.docs) {
        const sub = d.data();
        try {
          const uSnap = await getDoc(doc(db, 'users', sub.subscriberId));
          if (uSnap.exists()) {
            fansList.push({ id: d.id, subId: sub.subscriberId, ...uSnap.data(), subscribedAt: sub.subscribedAt });
          }
        } catch (e) {}
      }
      setFans(fansList);

      // Vraies vidéos exclusives
      const vSnap = await getDocs(query(collection(db, 'videos'), where('userId', '==', user.uid)));
      setVideos(vSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.isFanbaseExclusive));
    } catch(e){}
    setLoading(false);
  };

  const handleKick = (fan) => {
    Alert.alert('Retirer ' + fan.username + ' ?', 'Il perdra acces au contenu exclusif.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'fanbase_subscriptions', fan.id));
          await updateDoc(doc(db, 'users', user.uid), { fanbaseSubscribers: increment(-1) });
          // Sync creator_earnings.subscriberCount
          const earningsRef = doc(db, 'creator_earnings', user.uid);
          const earningsSnap = await getDoc(earningsRef);
          if (earningsSnap.exists()) {
            await updateDoc(earningsRef, {
              subscriberCount: Math.max(0, (earningsSnap.data()?.subscriberCount || 0) - 1),
            });
          }
          setFans(prev => prev.filter(f => f.id !== fan.id));
        } catch (e) { Alert.alert('Error', 'Something went wrong. Please try again.'); }
      }},
    ]);
  };

  const handleDeleteVideo = (video) => {
    Alert.alert('Delete Video', 'This cannot be undone. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'videos', video.id));
          setVideos(prev => prev.filter(v => v.id !== video.id));
        } catch (e) { Alert.alert('Error', 'Could not delete video. Please try again later.'); }
      }},
    ]);
  };

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'grid-outline' },
    { id: 'fans', label: 'Fans', icon: 'people-outline' },
    { id: 'videos', label: 'Videos', icon: 'videocam-outline' },
    { id: 'settings', label: 'Settings', icon: 'settings-outline' },
  ];

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Ma Fanbase</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)} style={[s.tab, activeTab === t.id && s.tabActive]}>
            <Ionicons name={t.icon} size={13} color={activeTab === t.id ? COLORS.black : COLORS.gray} />
            <Text style={[s.tabText, activeTab === t.id && s.tabTextActive]}> {t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              <View style={s.statsGrid}>
                <View style={s.statCard}>
                  <Text style={[s.statNum, { color: '#7C4DFF' }]}>{fans.length}</Text>
                  <Text style={s.statLabel}>Fans</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={[s.statNum, { color: GREEN }]}>$0.00</Text>
                  <Text style={s.statLabel}>Revenue</Text>
                  <Text style={[s.statLabel, { color: COLORS.gold, fontSize: 8 }]}>Coming soon</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={[s.statNum, { color: COLORS.blue }]}>{videos.length}</Text>
                  <Text style={s.statLabel}>Exclusifs</Text>
                </View>
              </View>

              <Text style={s.sectionLabel}>ACTIONS RAPIDES</Text>
              <View style={s.actionsCard}>
                <TouchableOpacity style={s.actionRow} onPress={() => {
                  const parent = navigation.getParent();
                  if (parent) parent.navigate('Upload');
                  else navigation.navigate('Upload');
                }}>
                  <View style={[s.actionIcon, { backgroundColor: COLORS.gold + '18' }]}>
                    <Ionicons name="cloud-upload-outline" size={20} color={COLORS.gold} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.actionTitle}>Publier du contenu exclusif</Text>
                    <Text style={s.actionDesc}>Active le toggle "Exclusive" dans Upload</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
                </TouchableOpacity>

                <TouchableOpacity style={s.actionRow} onPress={() => setActiveTab('fans')}>
                  <View style={[s.actionIcon, { backgroundColor: COLORS.blue + '18' }]}>
                    <Ionicons name="people-outline" size={20} color={COLORS.blue} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.actionTitle}>Gerer mes fans</Text>
                    <Text style={s.actionDesc}>{fans.length} abonnes</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
                </TouchableOpacity>
              </View>

              {fans.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>FANS RECENTS</Text>
                  {fans.slice(0, 5).map(fan => (
                    <View key={fan.id} style={s.fanRow}>
                      <Avatar user={fan} size={36} />
                      <View style={s.fanInfo}>
                        <Text style={s.fanName}>{fan.username}</Text>
                        <Text style={s.fanSince}>Depuis {fmtDate(fan.subscribedAt)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {/* FANS */}
          {activeTab === 'fans' && (
            <>
              <Text style={s.sectionLabel}>ABONNES ({fans.length})</Text>
              {fans.length === 0 ? (
                <Text style={s.emptyText}>Aucun abonne pour le moment. Publie du contenu exclusif pour attirer des fans !</Text>
              ) : (
                fans.map(fan => (
                  <View key={fan.id} style={s.fanRow}>
                    <Avatar user={fan} size={40} />
                    <View style={s.fanInfo}>
                      <Text style={s.fanName}>{fan.username}</Text>
                      <Text style={s.fanSince}>Depuis {fmtDate(fan.subscribedAt)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleKick(fan)} style={s.kickBtn}>
                      <Text style={s.kickBtnText}>Retirer</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}

          {/* VIDEOS */}
          {activeTab === 'videos' && (
            <>
              <TouchableOpacity onPress={() => {
                const parent = navigation.getParent();
                if (parent) parent.navigate('Upload');
                else navigation.navigate('Upload');
              }} style={s.uploadBtn}>
                <Ionicons name="cloud-upload-outline" size={20} color={COLORS.black} />
                <Text style={s.uploadBtnText}>Publier du contenu exclusif</Text>
              </TouchableOpacity>

              <Text style={s.sectionLabel}>CONTENU EXCLUSIF ({videos.length})</Text>
              {videos.length === 0 ? (
                <Text style={s.emptyText}>Aucun contenu exclusif publie. Va dans Upload et active le toggle "Exclusive" !</Text>
              ) : (
                videos.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => navigation.navigate('TipDetail', { tip: v })}
                    onLongPress={() => {
                      Alert.alert('Video options', '', [
                        { text: 'Edit', onPress: () => navigation.navigate('EditVideo', { video: v }) },
                        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteVideo(v) },
                        { text: 'Cancel', style: 'cancel' },
                      ]);
                    }}
                    style={s.videoCard}
                  >
                    <View style={s.videoThumb}>
                      {(v.thumbnail || v.thumbnailUrl) ? (
                        <Image source={{ uri: v.thumbnail || v.thumbnailUrl }} style={{ width: '100%', height: '100%', borderRadius: 8 }} resizeMode="cover" />
                      ) : (
                        <Ionicons name="lock-closed" size={18} color={GREEN} />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.videoTitle} numberOfLines={1}>{v.caption}</Text>
                      <Text style={s.videoMeta}>{v.game} · {v.contentType} · {v.ggCount || 0} GG</Text>
                      <Text style={{ fontSize: 9, color: COLORS.gray2, marginTop: 2 }}>Long press to edit or delete</Text>
                    </View>
                    <Ionicons name="lock-closed" size={14} color={GREEN} />
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <>
              <Text style={s.sectionLabel}>PARAMETRES FANBASE</Text>
              <View style={s.settingCard}>
                <View style={s.settingRow}>
                  <Text style={s.settingLabel}>Notifications nouveaux fans</Text>
                  <Switch value={true} disabled trackColor={{ true: GREEN }} />
                </View>
                <View style={s.settingRow}>
                  <Text style={s.settingLabel}>Prix mensuel</Text>
                  <View style={s.comingSoon}><Text style={s.comingSoonText}>Coming soon</Text></View>
                </View>
                <View style={s.settingRow}>
                  <Text style={s.settingLabel}>FanBox (chat groupe)</Text>
                  <View style={s.comingSoon}><Text style={s.comingSoonText}>Coming soon</Text></View>
                </View>
                <View style={s.settingRow}>
                  <Text style={s.settingLabel}>Retrait des revenus</Text>
                  <View style={s.comingSoon}><Text style={s.comingSoonText}>Coming soon</Text></View>
                </View>
              </View>
            </>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.white },
  tabsRow: { paddingHorizontal: 14, paddingVertical: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, height: 34 },
  tabActive: { backgroundColor: GREEN, borderColor: GREEN },
  tabText: { fontSize: 11, color: COLORS.gray, fontWeight: '700' },
  tabTextActive: { color: COLORS.black, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', paddingHorizontal: 14, justifyContent: 'space-between', marginTop: 4 },
  statCard: { width: '31%', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.gray3 },
  statNum: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 10, color: COLORS.gray, marginTop: 2, textTransform: 'uppercase' },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },
  actionsCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.gray3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  actionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  actionDesc: { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  fanRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  fanInfo: { flex: 1, marginLeft: 12 },
  fanName: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  fanSince: { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  kickBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: COLORS.red },
  kickBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.red },
  emptyText: { fontSize: 13, color: COLORS.gray, paddingHorizontal: 14, lineHeight: 19 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: GREEN, marginHorizontal: 14, borderRadius: 14, paddingVertical: 14 },
  uploadBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
  videoCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  videoThumb: { width: 56, height: 36, borderRadius: 8, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 0.5, borderColor: GREEN + '40' },
  videoTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  videoMeta: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
  settingCard: { marginHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.gray3, padding: 14 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  settingLabel: { fontSize: 13, color: COLORS.white },
  comingSoon: { backgroundColor: COLORS.goldDim, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 0.5, borderColor: COLORS.goldBorder },
  comingSoonText: { fontSize: 10, color: COLORS.gold, fontWeight: '700' },
});
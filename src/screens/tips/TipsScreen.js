import React, { useState, useEffect, useRef } from 'react';
import { RefreshControl,
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, Dimensions, Image, ActivityIndicator,
  Modal, TouchableWithoutFeedback, TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs, limit, startAfter } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { db } from '../../config/firebase';
import useAuthStore from '../../store/useAuthStore';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import useFanbaseStore from '../../store/useFanbaseStore';
import Avatar from '../../components/FramedAvatar';

const { width: SW } = Dimensions.get('window');
const GREEN = '#00C853';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'grid-outline', color: COLORS.gold },
  { id: 'flashtuto', label: 'FlashTutos', icon: 'bulb-outline', color: COLORS.blue, desc: 'Quick tips & tutorials' },
  { id: 'flashinfo', label: 'FlashInfos', icon: 'newspaper-outline', color: COLORS.red, desc: 'Gaming news & meta' },
  { id: 'gameindev', label: 'GameInDev', icon: 'code-slash-outline', color: '#7C4DFF', desc: 'Dev diaries & game reveals' },
  { id: 'gatv', label: 'GA TV', icon: 'tv-outline', color: COLORS.gray, desc: 'Coming soon — not yet launched' },
];

const BADGE_COLORS = {
  gameconic: { bg: COLORS.red, text: COLORS.white, label: 'ICON' },
  creator: { bg: COLORS.blue, text: '#0A0A0F', label: 'CR' },
  developer: { bg: '#7C4DFF', text: COLORS.white, label: 'DEV' },
  gamer: { bg: COLORS.gray2, text: COLORS.white, label: 'GA' },
};


// ─── POPUP "Abonne-toi pour débloquer" ──────────────────────────────────────
function LockedPopup({ visible, tip, onClose, onJoin }) {
  if (!tip) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={lp.backdrop}>
          <TouchableWithoutFeedback>
            <View style={lp.card}>
              <View style={lp.iconCircle}>
                <Ionicons name="lock-closed" size={30} color={GREEN} />
              </View>
              <Text style={lp.title}>Contenu exclusif 🔒</Text>
              <Text style={lp.subtitle}>
                Ce contenu est réservé aux fans de{' '}
                <Text style={{ color: COLORS.white, fontWeight: '700' }}>{tip.username}</Text>.
                Rejoins sa Fanbase pour le débloquer ainsi que tous ses contenus privés.
              </Text>
              <TouchableOpacity onPress={onJoin} style={lp.joinBtn}>
                <Ionicons name="lock-open-outline" size={16} color={COLORS.black} />
                <Text style={lp.joinBtnText}>Rejoindre la Fanbase</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={lp.cancelBtn}>
                <Text style={lp.cancelBtnText}>Plus tard</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const lp = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#0a1a0a', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(0,200,83,0.3)' },
  iconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,200,83,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 1, borderColor: 'rgba(0,200,83,0.3)' },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14, width: '100%', marginBottom: 8 },
  joinBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.black, marginLeft: 8 },
  cancelBtn: { paddingVertical: 10 },
  cancelBtnText: { fontSize: 13, color: COLORS.gray, fontWeight: '600' },
});

function TipCardBase({ tip, locked, onPress }) {
  const cat = CATEGORIES.find(c => c.id === tip.contentType);
  const badge = BADGE_COLORS[tip.accountType] || BADGE_COLORS.gamer;

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity onPress={onPress} style={[cardS.container, tip.isFanbaseExclusive && { borderLeftWidth: 3, borderLeftColor: GREEN, backgroundColor: 'rgba(0,200,83,0.04)' }]} activeOpacity={0.85}>
      <View style={[cardS.thumb, { borderColor: cat?.color || COLORS.gray3 }]}>
        {tip.thumbnail ? (
          <Image source={{ uri: tip.thumbnail }} style={{ width: '100%', height: '100%', borderRadius: 10 }} resizeMode="cover" blurRadius={locked ? 12 : 0} />
        ) : (
          <Ionicons name={cat?.icon || 'videocam-outline'} size={28} color={cat?.color || COLORS.gray} style={{ opacity: 0.4 }} />
        )}
        {/* Overlay cadenas si verrouillé */}
        {locked && (
          <View style={cardS.lockOverlay}>
            <Ionicons name="lock-closed" size={22} color={GREEN} />
          </View>
        )}
        <View style={cardS.duration}>
          <Text style={cardS.durationText}>{formatDuration(tip.duration)}</Text>
        </View>
        {/* Tag catégorie coloré sur le thumbnail */}
        <View style={[cardS.thumbCatTag, { backgroundColor: (cat?.color || COLORS.gray) }]}>
          <Text style={cardS.thumbCatText}>{cat?.label || tip.contentType}</Text>
        </View>
        {tip.isFanbaseExclusive && !locked && (
          <View style={cardS.fanbaseLock}>
            <Ionicons name="lock-open" size={10} color={GREEN} />
          </View>
        )}
      </View>
      <View style={cardS.info}>
        <View style={[cardS.catTag, { backgroundColor: (cat?.color || COLORS.gray) + '18' }]}>
          <Text style={[cardS.catTagText, { color: cat?.color || COLORS.gray }]}>{cat?.label || tip.contentType}</Text>
        </View>
        <Text style={cardS.title} numberOfLines={2}>{tip.caption}</Text>
        <Text style={cardS.desc} numberOfLines={1}>🎮 {tip.game}</Text>
        <View style={cardS.creatorRow}>
          <Avatar user={tip} size={20} />
          <Text style={[cardS.creatorName, { marginLeft: 5 }]}>{tip.username}</Text>
          <View style={[cardS.badge, { backgroundColor: badge.bg, marginLeft: 4 }]}>
            <Text style={[cardS.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
        <View style={cardS.statsRow}>
          <Text style={cardS.stat}>{tip.viewsCount || 0} views</Text>
          <Text style={cardS.statDot}> · </Text>
          <Ionicons name="thumbs-up-outline" size={11} color="#7C4DFF" />
          <Text style={[cardS.stat, { color: '#7C4DFF' }]}> {tip.thanksCount || 0} Thanks</Text>
          {tip.isFanbaseExclusive && (
            <Text style={[cardS.stat, { color: GREEN, marginLeft: 4 }]}> · {locked ? '🔒' : '🔓'} Fanbase</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
const TipCard = React.memo(TipCardBase);

const cardS = StyleSheet.create({
  container: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  thumb: { width: 110, height: 74, borderRadius: 10, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', borderWidth: 0.5, marginRight: 12 },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  durationText: { fontSize: 9, color: COLORS.white, fontWeight: '700' },
  thumbCatTag: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  thumbCatText: { fontSize: 8, color: COLORS.white, fontWeight: '900', letterSpacing: 0.3 },
  fanbaseLock: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,200,83,0.15)', padding: 3, borderRadius: 4 },
  info: { flex: 1 },
  catTag: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  catTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  title: { fontSize: 13, fontWeight: '700', color: COLORS.white, lineHeight: 17, marginBottom: 3 },
  desc: { fontSize: 11, color: COLORS.gray, lineHeight: 14, marginBottom: 6 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  creatorName: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  badgeText: { fontSize: 7, fontWeight: '900' },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { fontSize: 10, color: COLORS.gray },
  statDot: { fontSize: 10, color: COLORS.gray2 },
});

export default function TipsScreen({ navigation }) {
  const { user, userProfile } = useAuthStore();
  const { loadMySubscriptions, isSubscribedTo } = useFanbaseStore();
  const [activeCategory, setActiveCategory] = useState('all');
  const [tips, setTips] = useState([]);
  const [searchTips, setSearchTips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lockedTip, setLockedTip] = useState(null);
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const lastDocRef = useRef(null);
  const hasMoreRef = useRef(true);
  const searchTimeout = useRef(null);

  // Quand l'user tape, chercher sur toute la base tips
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!search.trim()) { setSearchTips([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const types = activeCategory === 'all'
          ? ['flashtuto', 'flashinfo', 'gameindev']
          : [activeCategory];
        const snap = await getDocs(query(
          collection(db, 'videos'),
          where('contentType', 'in', types),
          orderBy('createdAt', 'desc')
        ));
        const q = search.trim().toLowerCase();
        const results = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => !t.restricted && (
            (t.game || '').toLowerCase().includes(q) ||
            (t.title || t.caption || '').toLowerCase().includes(q) ||
            (t.username || '').toLowerCase().includes(q)
          ));
        setSearchTips(results);
      } catch(e) { setSearchTips([]); }
    }, 400);
    return () => clearTimeout(searchTimeout.current);
  }, [search, activeCategory]);

  const PAGE = 10;

  // Construit la requête de base selon la catégorie
  const buildQuery = (after = null) => {
    const base = activeCategory === 'all'
      ? [collection(db, 'videos'), where('contentType', 'in', ['flashtuto', 'flashinfo', 'gameindev']), orderBy('createdAt', 'desc')]
      : [collection(db, 'videos'), where('contentType', '==', activeCategory), orderBy('createdAt', 'desc')];
    return after ? query(...base, startAfter(after), limit(PAGE)) : query(...base, limit(PAGE));
  };

  // Charge la première page (au changement de catégorie)
  const loadFirstPage = async () => {
    setLoading(true);
    lastDocRef.current = null;
    hasMoreRef.current = true;
    try {
      const snap = await getDocs(buildQuery());
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.restricted);
      setTips(list);
      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      hasMoreRef.current = snap.docs.length === PAGE;
    } catch (e) {
      setTips([]);
    } finally {
      setLoading(false);
    }
  };

  // Charge les pages suivantes (scroll)
  const loadMoreTips = async () => {
    if (loadingMore || !hasMoreRef.current || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(buildQuery(lastDocRef.current));
      const more = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.restricted);
      setTips(prev => [...prev, ...more]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] || lastDocRef.current;
      hasMoreRef.current = snap.docs.length === PAGE;
    } catch (e) {}
    finally { setLoadingMore(false); }
  };

  // Charge mes abonnements au montage (1 query, aucun index composite)
  useEffect(() => {
    if (user?.uid) loadMySubscriptions(user.uid);
  }, [user?.uid]);

  useEffect(() => {
    loadFirstPage();
  }, [activeCategory]);

  // Décide si un tip est verrouillé pour l'utilisateur courant
  const isLockedForMe = (tip) => {
    if (!tip.isFanbaseExclusive) return false;     // contenu public
    if (tip.userId === user?.uid) return false;     // c'est mon propre contenu
    return !isSubscribedTo(tip.userId);             // verrouillé si pas abonné
  };

  // Filtre par genre sur les tips affichés
  const sourceTips = search.trim() ? searchTips : tips;
  const filteredTips = sourceTips.filter(t => {
    if (genreFilter !== 'all' && t.genre !== genreFilter) return false;
    return true;
  });

  // Liste des genres présents dans les tips chargés
  const availableGenres = ['all', ...Array.from(new Set(tips.map(t => t.genre).filter(Boolean)))];

  const handleTipPress = (tip) => {
    if (isLockedForMe(tip)) {
      setLockedTip(tip);                            // ouvre le popup "abonne-toi"
    } else {
      navigation.navigate('TipDetail', { tip });    // accès normal
    }
  };

  const handleJoinFromPopup = () => {
    const tip = lockedTip;
    setLockedTip(null);
    // On envoie vers la page Fanbase du créateur avec ses infos
    navigation.navigate('Fanbase', {
      creator: {
        uid: tip.userId,
        id: tip.userId,
        username: tip.username,
        accountType: tip.accountType,
        plan: tip.plan,
        avatar: tip.avatar,
      },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <LockedPopup
        visible={!!lockedTip}
        tip={lockedTip}
        onClose={() => setLockedTip(null)}
        onJoin={handleJoinFromPopup}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tips & Tutos</Text>
        <Text style={styles.headerSub}>Learn · Discover · Watch</Text>
      </View>

      <View style={{ height: 52 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategory(cat.id)}
              style={[styles.catPill, activeCategory === cat.id && { backgroundColor: cat.color + '20', borderColor: cat.color }]}
              activeOpacity={0.8}
            >
              <Ionicons name={cat.icon} size={13} color={activeCategory === cat.id ? cat.color : COLORS.gray} />
              <Text style={[styles.catPillText, activeCategory === cat.id && { color: cat.color, fontWeight: '700' }]}>
                {' '}{cat.label}
              </Text>
              {cat.id === 'gatv' && <View style={styles.soonDot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {activeCategory !== 'gatv' && (
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={COLORS.gray} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search game, title or creator..."
              placeholderTextColor={COLORS.gray}
              style={styles.searchInput}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.gray} />
              </TouchableOpacity>
            )}
          </View>
          {availableGenres.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {availableGenres.map(g => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGenreFilter(g)}
                  style={[styles.genreChip, genreFilter === g && { backgroundColor: COLORS.gold, borderColor: COLORS.gold }]}
                >
                  <Text style={[styles.genreChipText, genreFilter === g && { color: COLORS.black, fontWeight: '800' }]}>
                    {g === 'all' ? 'All Genres' : g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {activeCategory !== 'all' && activeCategory !== 'gatv' && (
        <View style={styles.catDesc}>
          <Text style={styles.catDescText}>
            {CATEGORIES.find(c => c.id === activeCategory)?.desc}
          </Text>
        </View>
      )}

      {activeCategory === 'gatv' ? (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }} tintColor={COLORS.gold} />} contentContainerStyle={styles.comingSoonContainer}>
          <View style={styles.comingSoonIcon}>
            <Ionicons name="tv-outline" size={48} color={COLORS.gray2} />
          </View>
          <Text style={styles.comingSoonTitle}>GA TV</Text>
          <Text style={styles.comingSoonSubtitle}>Coming Soon</Text>
          <Text style={styles.comingSoonDesc}>
            Notre chaîne de gaming live arrive bientôt. Tournois en direct, révélations exclusives et shows gaming — restez connectés ! 🎮
          </Text>
          <View style={styles.comingSoonBadge}>
            <Ionicons name="notifications-outline" size={14} color={COLORS.gold} />
            <Text style={styles.comingSoonBadgeText}>You'll be notified when it's live</Text>
          </View>
        </ScrollView>
      ) : loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : filteredTips.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bulb-outline" size={48} color={COLORS.gray2} />
          <Text style={styles.emptyText}>{search || genreFilter !== 'all' ? 'No results found' : 'No content in this category yet'}</Text>
          <Text style={styles.emptySubText}>{search || genreFilter !== 'all' ? 'Try a different search or filter' : 'Be the first to post! 🎮'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTips}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TipCard tip={item} locked={isLockedForMe(item)} onPress={() => handleTipPress(item)} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          removeClippedSubviews={true}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          onEndReached={() => { if (!search && genreFilter === 'all') loadMoreTips(); }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await loadFirstPage(); setRefreshing(false); }}
              tintColor={COLORS.gold}
            />
          }
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator color={COLORS.gold} />
            </View>
          ) : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white },
  headerSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  catRow: { paddingHorizontal: 14, paddingBottom: 10, alignItems: 'center' },
  searchWrap: { paddingHorizontal: 14, paddingBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: 0.5, borderColor: COLORS.gray3 },
  searchInput: { flex: 1, marginLeft: 8, color: COLORS.white, fontSize: 13 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8 },
  genreChipText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  catPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, height: 34 },
  catPillText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  soonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gold, marginLeft: 4 },
  catDesc: { paddingHorizontal: 16, paddingBottom: 8 },
  catDescText: { fontSize: 11, color: COLORS.gray, fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: COLORS.gray, marginTop: 12, fontWeight: '600' },
  emptySubText: { fontSize: 12, color: COLORS.gray2, marginTop: 6 },
  comingSoonContainer: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 24, paddingBottom: 100 },
  comingSoonIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 14 },
  comingSoonTitle: { fontSize: 26, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  comingSoonSubtitle: { fontSize: 13, color: COLORS.gold, fontWeight: '700', marginBottom: 12 },
  comingSoonDesc: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  comingSoonBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.12)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: COLORS.gold },
  comingSoonBadgeText: { fontSize: 12, color: COLORS.gold, fontWeight: '700', marginLeft: 6 },
});
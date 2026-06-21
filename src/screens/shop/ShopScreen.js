import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Alert, Modal, TouchableWithoutFeedback, Image, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { doc, runTransaction, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import { awardPoints } from '../../utils/points';
import { logError, LOG_CONTEXT } from '../../utils/errorLogger';
import { FRAMES, VIDEO_FRAMES, COMMENT_FRAMES, getFrameById, getVideoFrameById, getCommentFrameById } from '../../constants/frames';
import { ElectricRing, ElectricBorder, RotatingElectricRing } from '../../components/ElectricEffect';
import useAuthStore from '../../store/useAuthStore';
import { db } from '../../config/firebase';

const { width: SW } = Dimensions.get('window');
const ITEM_W = (SW - 14 * 2 - 12) / 2;

// Enregistre un achat dans points_history avec le delta négatif réel
async function logPurchase(userId, frame, frameType, balanceAfter) {
  if (!userId) return;
  try {
    await addDoc(collection(db, 'points_history'), {
      userId,
      delta: -(frame.pointsPrice || 0),
      reason: `Frame purchased: ${frame.name}`,
      total: balanceAfter,
      frameId: frame.id,
      frameType,
      createdAt: serverTimestamp(),
    });
  } catch (e) {}
}

const CATEGORIES = [
  { id: 'avatar_frames',  label: 'Avatar Frames', icon: 'person-circle-outline' },
  { id: 'video_frames',   label: 'Video Frames',  icon: 'videocam-outline' },
  { id: 'comment_frames', label: 'Comment',       icon: 'chatbubble-outline' },
  { id: 'badges',         label: 'Badges',        icon: 'ribbon-outline' },
];

const BADGE_ITEMS = [
  { id: 'b1', name: 'Champion',  desc: 'Monthly winners only', icon: 'trophy-outline',  color: COLORS.gold,  exclusive: true },
  { id: 'b2', name: 'OG Badge',  desc: 'First 1000 users',    icon: 'star-outline',    color: COLORS.gold,  exclusive: true },
  { id: 'b3', name: 'Verified',  desc: 'Identity confirmed',   icon: 'shield-checkmark-outline', color: COLORS.blue, exclusive: true },
];

// ─── Achat GA Points via transaction Firestore ────────────────────────────────
async function purchaseWithPoints(userId, cost, onSuccess) {
  const userRef = doc(db, 'users', userId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error('User not found');
      const current = snap.data().gaPoints || 0;
      if (current < cost) throw new Error('NOT_ENOUGH_POINTS');
      tx.update(userRef, { gaPoints: current - cost });
    });
    await onSuccess();
    return { ok: true };
  } catch (e) {
    await logError(LOG_CONTEXT.SHOP_FAIL, e, userId);
    return { ok: false, reason: e.message };
  }
}

// ─── Avatar Frame Preview ─────────────────────────────────────────────────────
function AvatarFramePreview({ frame, avatar, username, size = 58 }) {
  const initials = (username || 'GA').slice(0, 2).toUpperCase();
  const showRing = frame.id !== 'none';
  return (
    <View style={{ width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center' }}>
      {showRing && frame.glow && (
        <View style={{ position: 'absolute', width: size + 20, height: size + 20, borderRadius: (size + 20) / 2, backgroundColor: frame.color, opacity: 0.18 }} />
      )}
      {showRing && (
        <View style={{ position: 'absolute', width: size + 10, height: size + 10, borderRadius: (size + 10) / 2, borderWidth: 2.5, borderColor: frame.color }} />
      )}
      {avatar ? (
        <Image source={{ uri: avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: showRing ? frame.color : COLORS.gray3 }}>
          <Text style={{ color: COLORS.gold, fontWeight: '800', fontSize: size * 0.34 }}>{initials}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Video Frame Preview ──────────────────────────────────────────────────────
function VideoFramePreview({ frame, size = 70 }) {
  const hasFrame = frame.id !== 'none';
  return (
    <View style={{ width: size, height: size * 0.6, position: 'relative', borderRadius: 8, overflow: 'hidden', backgroundColor: '#0a0a1a' }}>
      {/* Simulated video content */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="game-controller" size={22} color={hasFrame ? frame.color : COLORS.gray3} style={{ opacity: 0.4 }} />
      </View>
      {/* Frame border */}
      {hasFrame && (
        <>
          <View style={{ position: 'absolute', inset: 0, borderWidth: 2.5, borderColor: frame.color, borderRadius: 8, opacity: frame.glow ? 0.9 : 0.7 }} />
          {/* Corner accents */}
          <View style={{ position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderTopWidth: 2, borderLeftWidth: 2, borderColor: frame.color }} />
          <View style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: frame.color }} />
          <View style={{ position: 'absolute', bottom: 3, left: 3, width: 8, height: 8, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: frame.color }} />
          <View style={{ position: 'absolute', bottom: 3, right: 3, width: 8, height: 8, borderBottomWidth: 2, borderRightWidth: 2, borderColor: frame.color }} />
          {frame.glow && (
            <View style={{ position: 'absolute', inset: 0, borderWidth: 6, borderColor: frame.color, borderRadius: 8, opacity: 0.08 }} />
          )}
        </>
      )}
    </View>
  );
}

// ─── Bannière Champion spectaculaire ──────────────────────────────────────────
// Met en avant la frame exclusive Champion du mois avec l'effet électrique réel.
function ChampionBanner({ type }) {
  // type: 'avatar' | 'video' | 'comment'
  const TITLES = {
    avatar: 'CHAMPION Avatar Frame',
    video: 'CHAMPION Video Frame',
    comment: 'CHAMPION Comment Frame',
  };
  const SUBS = {
    avatar: 'Win the monthly GG Championship to wear the electric gold ring for the whole month. The most coveted frame in the game.',
    video: 'Monthly Champions get the legendary electric gold border around every clip they post. Everyone will know who is #1.',
    comment: 'Champions stand out in every comment section with the exclusive electric gold frame. Pure flex.',
  };

  return (
    <View style={champS.wrap}>
      <View style={champS.glowBg} />
      <View style={champS.row}>
        {/* Preview électrique selon le type */}
        <View style={champS.previewBox}>
          {type === 'avatar' && (
            <View style={{ width: 74, height: 74, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={26} color={COLORS.gold} />
              </View>
              <RotatingElectricRing size={56} />
            </View>
          )}
          {type === 'video' && (
            <View style={{ width: 90, height: 60 }}>
              <View style={{ width: 90, height: 60, borderRadius: 8, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Ionicons name="play" size={22} color={COLORS.gold} />
              </View>
              <ElectricBorder width={90} height={60} radius={8} />
            </View>
          )}
          {type === 'comment' && (
            <View style={{ width: 90, height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 10, borderWidth: 2, borderColor: '#E8C96B', backgroundColor: '#1A1A2E', shadowColor: '#E8C96B', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.gold }} />
                <Text style={{ marginLeft: 6, fontSize: 10, color: COLORS.gold, fontWeight: '800' }}>GG! ⚡</Text>
              </View>
            </View>
          )}
        </View>

        {/* Texte */}
        <View style={{ flex: 1, marginLeft: 14 }}>
          <View style={champS.tagRow}>
            <Ionicons name="flash" size={12} color="#FFD700" />
            <Text style={champS.tag}>EXCLUSIVE · MONTHLY REWARD</Text>
          </View>
          <Text style={champS.title}>{TITLES[type]}</Text>
          <Text style={champS.sub}>{SUBS[type]}</Text>
          <View style={champS.lockRow}>
            <Ionicons name="lock-closed" size={11} color={COLORS.gold} />
            <Text style={champS.lockText}>Cannot be bought — earned by becoming Champion of the month</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const champS = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginTop: 12, marginBottom: 6, borderRadius: 16, padding: 14, backgroundColor: '#15130a', borderWidth: 1, borderColor: '#E8C96B55', overflow: 'hidden' },
  glowBg: { position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: '#E8C96B', opacity: 0.08 },
  row: { flexDirection: 'row', alignItems: 'center' },
  previewBox: { width: 92, alignItems: 'center', justifyContent: 'center' },
  crown: { position: 'absolute', top: -10, fontSize: 18, textShadowColor: '#E8C96B', textShadowRadius: 6 },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  tag: { fontSize: 8, fontWeight: '900', color: '#FFD700', letterSpacing: 1, marginLeft: 4 },
  title: { fontSize: 15, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  sub: { fontSize: 11, color: COLORS.gray, lineHeight: 16, marginBottom: 8 },
  lockRow: { flexDirection: 'row', alignItems: 'center' },
  lockText: { fontSize: 9, color: COLORS.gold, marginLeft: 5, flex: 1, fontWeight: '600' },
});

export default function ShopScreen() {
  const navigation = useNavigation();
  const { user, userProfile, saveProfile } = useAuthStore();
  const [category, setCategory] = useState('avatar_frames');
  const [loading, setLoading] = useState(false);

  const gaPoints        = userProfile?.gaPoints || 0;
  const equippedFrame   = userProfile?.equippedFrame || 'none';
  const [ownFilter, setOwnFilter] = useState('all'); // 'all' | 'owned' | 'new'
  const ownedFrames     = userProfile?.ownedFrames || ['none'];
  const ownedVideoFrames = userProfile?.ownedVideoFrames || ['none'];

  // ─── AVATAR FRAME ───────────────────────────────────────────────────────────
  const handleAvatarFrame = async (frame) => {
    if (frame.exclusive) return Alert.alert('Exclusive 🔒', 'This frame is awarded automatically.');
    if (frame.free || frame.id === 'none') {
      // Équiper sans payer
      await _equipAvatarFrame(frame.id);
      return;
    }
    const owned = ownedFrames.includes(frame.id);
    if (owned) {
      // Déjà acheté → juste équiper/retirer
      if (equippedFrame === frame.id) {
        await _equipAvatarFrame('none');
      } else {
        await _equipAvatarFrame(frame.id);
      }
      return;
    }
    // Pas encore acheté → confirmer l'achat
    if (gaPoints < frame.pointsPrice) {
      return Alert.alert(
        'Not enough GA Points',
        `You need ${frame.pointsPrice} pts. You have ${gaPoints} pts.\n\nEarn more by posting clips, receiving GGs, and getting followers!`
      );
    }
    Alert.alert(
      `Buy "${frame.name}"?`,
      `Cost: ${frame.pointsPrice} GA Points\nYou have: ${gaPoints} pts`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Buy — ${frame.pointsPrice} pts`, onPress: () => _buyAvatarFrame(frame) },
      ]
    );
  };

  const _buyAvatarFrame = async (frame) => {
    setLoading(true);
    const result = await purchaseWithPoints(user.uid, frame.pointsPrice, async () => {
      const newOwned = [...new Set([...ownedFrames, frame.id])];
      // gaPoints déjà déduit par la transaction → ne pas redéduire ici
      await saveProfile({ ownedFrames: newOwned, equippedFrame: frame.id });
    });
    setLoading(false);
    if (result.ok) {
      await logPurchase(user.uid, frame, 'avatar', (gaPoints - frame.pointsPrice));
      Alert.alert('✅ Purchased!', `"${frame.name}" equipped! −${frame.pointsPrice} GA Points`);
    } else if (result.reason === 'NOT_ENOUGH_POINTS') {
      Alert.alert('Not enough GA Points', `You need ${frame.pointsPrice} pts.`);
    } else {
      Alert.alert('Error', 'Purchase failed. Please try again later.');
    }
  };

  const _equipAvatarFrame = async (frameId) => {
    setLoading(true);
    try { await saveProfile({ equippedFrame: frameId }); } catch (e) {}
    setLoading(false);
  };

  // ─── VIDEO FRAME ────────────────────────────────────────────────────────────
  const handleVideoFrame = async (frame) => {
    if (frame.exclusive) return Alert.alert('Exclusive 🔒', 'This frame is awarded automatically.');
    if (frame.free || frame.id === 'none') {
      Alert.alert('Free frame', 'This frame is already available for free when you upload a clip!');
      return;
    }
    const owned = ownedVideoFrames.includes(frame.id);
    if (owned) {
      return Alert.alert('Already owned ✓', `You already own "${frame.name}". Select it when uploading a clip!`);
    }
    if (gaPoints < frame.pointsPrice) {
      return Alert.alert(
        'Not enough GA Points',
        `You need ${frame.pointsPrice} pts. You have ${gaPoints} pts.`
      );
    }
    Alert.alert(
      `Buy "${frame.name}"?`,
      `Cost: ${frame.pointsPrice} GA Points\nYou have: ${gaPoints} pts\n\nThis frame will be available when you upload a clip.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Buy — ${frame.pointsPrice} pts`, onPress: () => _buyVideoFrame(frame) },
      ]
    );
  };

  const _buyVideoFrame = async (frame) => {
    setLoading(true);
    const result = await purchaseWithPoints(user.uid, frame.pointsPrice, async () => {
      const newOwned = [...new Set([...ownedVideoFrames, frame.id])];
      await saveProfile({ ownedVideoFrames: newOwned });
    });
    setLoading(false);
    if (result.ok) {
      await logPurchase(user.uid, frame, 'video', gaPoints - frame.pointsPrice);
      Alert.alert('✅ Purchased!', `"${frame.name}" unlocked! Select it next time you upload a clip. −${frame.pointsPrice} GA Points`);
    } else if (result.reason === 'NOT_ENOUGH_POINTS') {
      Alert.alert('Not enough GA Points', `You need ${frame.pointsPrice} pts.`);
    } else {
      Alert.alert('Error', 'Purchase failed. Please try again later.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Shop</Text>
          <Text style={styles.headerSub}>Spend your GA Points</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={styles.pointsBadge}>
            <Ionicons name="star" size={14} color={COLORS.gold} />
            <Text style={styles.pointsText}>{gaPoints.toLocaleString()}</Text>
            <Text style={styles.pointsLabel}> pts</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Purchases')} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Ionicons name="bag-outline" size={14} color={COLORS.gold} />
            <Text style={{ fontSize: 11, color: COLORS.gold, fontWeight: '700', marginLeft: 4 }}>My Purchases</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Earn banner */}
      <View style={styles.earnBanner}>
        <Ionicons name="information-circle-outline" size={14} color={COLORS.blue} />
        <Text style={styles.earnText}>
          Earn points: +50 per clip · +2 per GG · +5 per follower · +10 daily login
        </Text>
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => setCategory(c.id)} style={[styles.catChip, category === c.id && styles.catChipActive]}>
            <Ionicons name={c.icon} size={13} color={category === c.id ? COLORS.black : COLORS.gray} />
            <Text style={[styles.catChipText, category === c.id && styles.catChipTextActive]}> {c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filtres Owned / Not yet (sauf badges) */}
      {category !== 'badges' && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 8 }}>
          {[{ id: 'all', label: 'All' }, { id: 'owned', label: '✓ Owned' }, { id: 'new', label: '🔓 Not yet' }].map(f => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setOwnFilter(f.id)}
              style={[{ flex: 1, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.gray3, alignItems: 'center' },
                ownFilter === f.id && { backgroundColor: COLORS.gold, borderColor: COLORS.gold }]}
            >
              <Text style={[{ fontSize: 11, fontWeight: '700', color: COLORS.gray },
                ownFilter === f.id && { color: COLORS.black }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ─── AVATAR FRAMES ─── */}
      {category === 'avatar_frames' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <ChampionBanner type="avatar" />
          <View style={styles.grid}>
            {[...FRAMES].filter(f => !f.exclusive).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)).filter(frame => { const owned = frame.free || ownedFrames.includes(frame.id); return ownFilter === "all" || (ownFilter === "owned" && owned) || (ownFilter === "new" && !owned); }).map((frame) => {
              const isEquipped = equippedFrame === frame.id;
              const isOwned    = frame.free || ownedFrames.includes(frame.id);
              return (
                <TouchableOpacity
                  key={frame.id}
                  onPress={() => handleAvatarFrame(frame)}
                  activeOpacity={0.85}
                  style={[styles.frameCard, isEquipped && { borderColor: frame.color === COLORS.gray3 ? COLORS.gold : frame.color, borderWidth: 1.5 }]}
                >
                  <View style={styles.framePreviewWrap}>
                    <AvatarFramePreview frame={frame} avatar={userProfile?.avatar} username={userProfile?.username} size={54} />
                    {isEquipped && (
                      <View style={[styles.statusDot, { backgroundColor: COLORS.green }]}>
                        <Ionicons name="checkmark" size={9} color={COLORS.black} />
                      </View>
                    )}
                    {isOwned && !isEquipped && !frame.free && (
                      <View style={[styles.statusDot, { backgroundColor: COLORS.blue }]}>
                        <Ionicons name="bag-check" size={9} color={COLORS.white} />
                      </View>
                    )}
                  </View>

                  <Text style={styles.itemName} numberOfLines={1}>{frame.name}</Text>
                  <Text style={styles.itemDesc} numberOfLines={1}>{frame.desc}</Text>

                  {frame.exclusive ? (
                    <Text style={styles.exclusiveLabel}>🔒 EXCLUSIVE</Text>
                  ) : isEquipped ? (
                    <View style={[styles.actionBtn, { backgroundColor: 'rgba(0,200,83,0.15)', borderColor: COLORS.green }]}>
                      <Text style={[styles.actionBtnText, { color: COLORS.green }]}>✓ EQUIPPED</Text>
                    </View>
                  ) : isOwned ? (
                    <View style={[styles.actionBtn, { backgroundColor: 'rgba(0,212,255,0.1)', borderColor: COLORS.blue }]}>
                      <Text style={[styles.actionBtnText, { color: COLORS.blue }]}>TAP TO EQUIP</Text>
                    </View>
                  ) : frame.free ? (
                    <View style={[styles.actionBtn]}>
                      <Text style={styles.actionBtnText}>FREE — EQUIP</Text>
                    </View>
                  ) : (
                    <View style={[styles.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}>
                      <Ionicons name="star" size={10} color={COLORS.gold} />
                      <Text style={[styles.actionBtnText, { color: COLORS.gold, marginLeft: 4 }]}>{frame.pointsPrice} pts</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ─── VIDEO FRAMES ─── */}
      {category === 'video_frames' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={styles.infoBanner}>
            <Ionicons name="videocam-outline" size={14} color={COLORS.gold} />
            <Text style={styles.infoText}>Video frames appear as a border around your clips in the feed. Choose one when uploading.</Text>
          </View>
          <ChampionBanner type="video" />
          <View style={styles.grid}>
            {[...VIDEO_FRAMES].filter(f => !f.exclusive).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)).filter(frame => { const owned = (userProfile?.ownedVideoFrames || []).includes(frame.id); return ownFilter === "all" || (ownFilter === "owned" && owned) || (ownFilter === "new" && !owned); }).map((frame) => {
              const isOwned = frame.free || ownedVideoFrames.includes(frame.id);
              return (
                <TouchableOpacity
                  key={frame.id}
                  onPress={() => handleVideoFrame(frame)}
                  activeOpacity={0.85}
                  style={[styles.frameCard, isOwned && !frame.free && { borderColor: COLORS.blue, borderWidth: 1 }]}
                >
                  <View style={[styles.framePreviewWrap, { height: 80 }]}>
                    <VideoFramePreview frame={frame} size={ITEM_W - 28} />
                    {isOwned && !frame.free && (
                      <View style={[styles.statusDot, { backgroundColor: COLORS.blue }]}>
                        <Ionicons name="bag-check" size={9} color={COLORS.white} />
                      </View>
                    )}
                  </View>

                  <Text style={styles.itemName} numberOfLines={1}>{frame.name}</Text>
                  <Text style={styles.itemDesc} numberOfLines={1}>{frame.desc}</Text>

                  {frame.exclusive ? (
                    <Text style={styles.exclusiveLabel}>🔒 EXCLUSIVE</Text>
                  ) : isOwned ? (
                    <View style={[styles.actionBtn, { backgroundColor: 'rgba(0,212,255,0.1)', borderColor: COLORS.blue }]}>
                      <Text style={[styles.actionBtnText, { color: COLORS.blue }]}>✓ OWNED</Text>
                    </View>
                  ) : frame.free ? (
                    <View style={[styles.actionBtn]}>
                      <Text style={styles.actionBtnText}>FREE</Text>
                    </View>
                  ) : (
                    <View style={[styles.actionBtn, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: COLORS.gold }]}>
                      <Ionicons name="star" size={10} color={COLORS.gold} />
                      <Text style={[styles.actionBtnText, { color: COLORS.gold, marginLeft: 4 }]}>{frame.pointsPrice} pts</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ─── COMMENT FRAMES ─── */}
      {category === 'comment_frames' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.infoBanner, { marginBottom: 12 }]}>
            <Text style={styles.infoText}>💬 Comment Frames add a glowing border around your comments — visible to everyone!</Text>
          </View>
          <ChampionBanner type="comment" />
          <View style={styles.grid}>
            {[...COMMENT_FRAMES].filter(f => !f.exclusive).sort((a, b) => (a.pointsPrice || 0) - (b.pointsPrice || 0)).filter(frame => { const owned = frame.pointsPrice === 0 || (userProfile?.ownedCommentFrames || []).includes(frame.id); return ownFilter === "all" || (ownFilter === "owned" && owned) || (ownFilter === "new" && !owned); }).map((frame) => {
              const owned = frame.pointsPrice === 0 || (userProfile?.ownedCommentFrames || []).includes(frame.id);
              const equipped = userProfile?.equippedCommentFrame === frame.id;
              return (
                <TouchableOpacity
                  key={frame.id}
                  activeOpacity={0.85}
                  style={[styles.frameCard, equipped && { borderColor: frame.color || COLORS.gold, borderWidth: 1.5 }]}
                  onPress={async () => {
                    if (frame.exclusive) {
                      Alert.alert('Exclusive 🔒', 'This frame is awarded automatically to the Monthly Champion.');
                      return;
                    }
                    if (owned) {
                      await saveProfile({ equippedCommentFrame: frame.id });
                      Alert.alert('✅ Equipped!', `"${frame.name}" is now your comment frame.`);
                      return;
                    }
                    Alert.alert(
                      frame.name,
                      `Cost: ${frame.pointsPrice} GA Points\nYou have: ${gaPoints} pts`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: `Buy — ${frame.pointsPrice} pts`, onPress: async () => {
                          if (gaPoints < frame.pointsPrice) {
                            Alert.alert('Not enough GA Points', `You need ${frame.pointsPrice} pts.`);
                            return;
                          }
                          const newOwned = [...new Set([...(userProfile?.ownedCommentFrames || []), frame.id])];
                          await saveProfile({ ownedCommentFrames: newOwned, equippedCommentFrame: frame.id, gaPoints: gaPoints - frame.pointsPrice });
                          await logPurchase(user?.uid, frame, 'comment', gaPoints - frame.pointsPrice);
                          Alert.alert('✅ Purchased!', `"${frame.name}" equipped on your comments! −${frame.pointsPrice} GA Points`);
                        }},
                      ]
                    );
                  }}
                >
                  {/* Aperçu : bulle de commentaire avec le contour coloré */}
                  <View style={{
                    width: '100%', borderRadius: 10, padding: 10, marginBottom: 8,
                    borderWidth: frame.id === 'none' ? 1 : 2,
                    borderColor: frame.id === 'none' ? COLORS.gray3 : frame.color,
                    backgroundColor: COLORS.black,
                    shadowColor: frame.glow ? frame.color : 'transparent',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: frame.glow ? 0.7 : 0,
                    shadowRadius: 6,
                  }}>
                    <Text style={{ fontSize: 10, color: COLORS.gold, fontWeight: '800' }}>YOU</Text>
                    <Text style={{ fontSize: 11, color: COLORS.white, marginTop: 2 }}>Sample comment 🔥</Text>
                  </View>
                  <Text style={styles.frameName}>{frame.name}</Text>
                  {frame.exclusive ? (
                    <Text style={styles.framePrice}>🏆 Champion only</Text>
                  ) : frame.pointsPrice === 0 ? (
                    <Text style={[styles.framePrice, { color: COLORS.green }]}>Free</Text>
                  ) : owned ? (
                    <Text style={[styles.framePrice, { color: equipped ? COLORS.gold : COLORS.gray }]}>{equipped ? '✓ Equipped' : 'Owned'}</Text>
                  ) : (
                    <Text style={styles.framePrice}>⭐ {frame.pointsPrice} pts</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ─── BADGES ─── */}
      {category === 'badges' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={styles.infoBanner}>
            <Ionicons name="ribbon-outline" size={14} color={COLORS.gray} />
            <Text style={styles.infoText}>Badges are awarded automatically based on your achievements. They cannot be purchased.</Text>
          </View>
          <View style={styles.grid}>
            {BADGE_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => Alert.alert(`${item.name} 🔒`, `${item.desc}\n\nThis badge is awarded automatically — it cannot be purchased.`)}
                activeOpacity={0.85}
                style={[styles.frameCard, { opacity: 0.7 }]}
              >
                <View style={[styles.framePreviewWrap, { backgroundColor: item.color + '12', borderRadius: 12 }]}>
                  <Ionicons name={item.icon} size={36} color={item.color} />
                </View>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDesc}>{item.desc}</Text>
                <Text style={styles.exclusiveLabel}>🔒 EXCLUSIVE</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white },
  headerSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  pointsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.gold },
  pointsText: { fontSize: 15, color: COLORS.gold, fontWeight: '800', marginLeft: 5 },
  pointsLabel: { fontSize: 11, color: COLORS.gray },
  earnBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 8, padding: 10, backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.blue + '40' },
  earnText: { flex: 1, fontSize: 10, color: COLORS.gray, marginLeft: 7, lineHeight: 14 },
  catRow: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.gray3, marginRight: 8, height: 34 },
  catChipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  catChipText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  catChipTextActive: { color: COLORS.black, fontWeight: '800' },
  infoBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 12, padding: 11, backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.goldBorder },
  infoText: { flex: 1, fontSize: 11, color: COLORS.gray, marginLeft: 8, lineHeight: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, justifyContent: 'space-between' },
  frameCard: { width: ITEM_W, backgroundColor: COLORS.card, borderRadius: 14, padding: 10, borderWidth: 0.5, borderColor: COLORS.gray3, marginBottom: 12, alignItems: 'center' },
  framePreviewWrap: { height: 90, width: '100%', alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative' },
  statusDot: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.card },
  itemName: { fontSize: 12, fontWeight: '700', color: COLORS.white, marginBottom: 2, textAlign: 'center' },
  itemDesc: { fontSize: 10, color: COLORS.gray, marginBottom: 8, textAlign: 'center' },
  frameName: { fontSize: 12, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginBottom: 4 },
  framePrice: { fontSize: 11, color: COLORS.gray, textAlign: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingVertical: 6, borderWidth: 0.5, borderColor: COLORS.gray3 },
  actionBtnText: { fontSize: 10, color: COLORS.white, fontWeight: '700' },
  exclusiveLabel: { fontSize: 10, color: COLORS.gray2, fontWeight: '700', textAlign: 'center', paddingVertical: 6 },
});

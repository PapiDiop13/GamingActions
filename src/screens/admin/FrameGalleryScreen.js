import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { FRAMES, VIDEO_FRAMES, COMMENT_FRAMES } from '../../constants/frames';
import { ElectricRing, ElectricBorder, RotatingElectricRing } from '../../components/ElectricEffect';

// Aperçu d'un anneau avatar simple (utilise le VRAI anneau rotatif pour champion)
function AvatarRing({ frame, size = 58 }) {
  if (frame.electric) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={size * 0.45} color={COLORS.gold} />
        </View>
        <RotatingElectricRing size={size} />
      </View>
    );
  }
  const showRing = frame.id !== 'none';
  return (
    <View style={{ width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center' }}>
      {showRing && frame.glow && (
        <View style={{ position: 'absolute', width: size + 12, height: size + 12, borderRadius: (size + 12) / 2, backgroundColor: frame.color, opacity: 0.25 }} />
      )}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: showRing ? 2.5 : 1, borderColor: showRing ? frame.color : COLORS.gray3,
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A2E',
      }}>
        <Ionicons name="person" size={size * 0.45} color={COLORS.gray2} />
      </View>
    </View>
  );
}

// Aperçu d'une frame vidéo (rectangle) — utilise le VRAI ElectricBorder pour champion
function VideoFramePreview({ frame, w = 110, h = 64 }) {
  if (frame.electric) {
    return (
      <View style={{ width: w, height: h }}>
        <View style={{ width: w, height: h, borderRadius: 8, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Ionicons name="play" size={20} color={COLORS.gray2} />
        </View>
        <ElectricBorder width={w} height={h} radius={8} />
      </View>
    );
  }
  const showRing = frame.id !== 'none';
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      {showRing && frame.glow && (
        <View style={{ position: 'absolute', width: w, height: h, borderRadius: 10, backgroundColor: frame.color, opacity: 0.22 }} />
      )}
      <View style={{
        width: w - 8, height: h - 8, borderRadius: 8,
        borderWidth: showRing ? 2.5 : 1, borderColor: showRing ? frame.color : COLORS.gray3,
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A2E',
      }}>
        <Ionicons name="play" size={20} color={COLORS.gray2} />
      </View>
    </View>
  );
}

// Aperçu frame commentaire (champion = bordure dorée pulsée via glow)
function CommentFramePreview({ frame }) {
  const showBorder = frame.id !== 'none';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 10, width: 150,
      borderWidth: showBorder ? 1.5 : 0, borderColor: showBorder ? frame.color : 'transparent',
      backgroundColor: '#1A1A2E',
      ...(frame.glow ? { shadowColor: frame.color, shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } } : {}),
    }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.gray3 }} />
      <View style={{ marginLeft: 8 }}>
        <Text style={{ fontSize: 11, color: COLORS.gold, fontWeight: '700' }}>Player {frame.electric ? '⚡' : ''}</Text>
        <Text style={{ fontSize: 10, color: COLORS.gray }}>Nice clip! 🔥</Text>
      </View>
    </View>
  );
}

export default function FrameGalleryScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Frame Gallery</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.intro}>
          <Text style={styles.introText}>
            Preview of all frames. The "Champion ⚡" frames show the animated gold electric dragon ring reserved for the monthly GG champion.
          </Text>
        </View>

        {/* AVATAR FRAMES */}
        <Text style={styles.sectionLabel}>AVATAR FRAMES ({FRAMES.length})</Text>
        <View style={styles.grid}>
          {FRAMES.map((f) => (
            <View key={f.id} style={styles.frameCard}>
              <AvatarRing frame={f} size={58} />
              <Text style={styles.frameName}>{f.name}</Text>
              <Text style={styles.framePrice}>
                {f.exclusive ? '🏆 Exclusive' : f.free ? 'Free' : `${f.pointsPrice} pts`}
              </Text>
              <Text style={styles.frameId}>{f.id}</Text>
            </View>
          ))}
        </View>

        {/* VIDEO FRAMES */}
        <Text style={styles.sectionLabel}>VIDEO FRAMES ({VIDEO_FRAMES.length})</Text>
        <View style={styles.grid}>
          {VIDEO_FRAMES.map((f) => (
            <View key={f.id} style={styles.frameCard}>
              <VideoFramePreview frame={f} />
              <Text style={styles.frameName}>{f.name}</Text>
              <Text style={styles.framePrice}>
                {f.exclusive ? '🏆 Exclusive' : f.free ? 'Free' : `${f.pointsPrice} pts`}
              </Text>
              <Text style={styles.frameId}>{f.id}</Text>
            </View>
          ))}
        </View>

        {/* COMMENT FRAMES */}
        <Text style={styles.sectionLabel}>COMMENT FRAMES ({COMMENT_FRAMES.length})</Text>
        <View style={styles.gridWide}>
          {COMMENT_FRAMES.map((f) => (
            <View key={f.id} style={styles.frameCardWide}>
              <CommentFramePreview frame={f} />
              <Text style={styles.frameName}>{f.name}</Text>
              <Text style={styles.framePrice}>
                {f.exclusive ? '🏆 Exclusive' : f.pointsPrice === 0 ? 'Free' : `${f.pointsPrice} pts`}
              </Text>
              <Text style={styles.frameId}>{f.id}</Text>
            </View>
          ))}
        </View>

        {/* Comment ajouter */}
        <Text style={styles.sectionLabel}>HOW TO ADD MORE FRAMES</Text>
        <View style={styles.howCard}>
          <Text style={styles.howText}>
            Frames are defined in <Text style={styles.code}>src/constants/frames.js</Text>.{'\n\n'}
            • Avatar frames → add an object to <Text style={styles.code}>FRAMES</Text>{'\n'}
            • Video frames → add to <Text style={styles.code}>VIDEO_FRAMES</Text>{'\n'}
            • Comment frames → add to <Text style={styles.code}>COMMENT_FRAMES</Text>{'\n\n'}
            Each frame needs: <Text style={styles.code}>id</Text>, <Text style={styles.code}>name</Text>, <Text style={styles.code}>color</Text>, <Text style={styles.code}>glow</Text> (true/false) and <Text style={styles.code}>pointsPrice</Text>. Add <Text style={styles.code}>electric: true</Text> for an animated champion-style ring, or <Text style={styles.code}>exclusive: true</Text> to lock it to special users.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray3 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  intro: { padding: 16 },
  introText: { fontSize: 12, color: COLORS.gray, lineHeight: 18 },
  sectionLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, justifyContent: 'flex-start' },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  frameCard: { width: '33.33%', alignItems: 'center', paddingVertical: 14 },
  frameCardWide: { width: '50%', alignItems: 'center', paddingVertical: 14 },
  frameName: { fontSize: 12, fontWeight: '700', color: COLORS.white, marginTop: 8, textAlign: 'center' },
  framePrice: { fontSize: 10, color: COLORS.gold, marginTop: 2 },
  frameId: { fontSize: 9, color: COLORS.gray2, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  howCard: { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: COLORS.gray3 },
  howText: { fontSize: 12, color: COLORS.gray, lineHeight: 19 },
  code: { color: COLORS.gold, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11 },
});

import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, FlatList, TouchableOpacity, Animated, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

// ATT est géré dans App.js au lancement — plus besoin ici.

const { width } = Dimensions.get('window');
const LOGO_URI = require('../../../assets/logo.png');

const SLIDES = [
  {
    id: '1',
    icon: 'game-controller',
    iconColor: COLORS.gold,
    title: 'Share Your Best Clips',
    desc: 'Upload your greatest gaming moments and get rated by the community with GG votes.',
  },
  {
    id: '2',
    icon: 'trophy',
    iconColor: COLORS.gold,
    title: 'Compete & Rise',
    desc: 'Climb the monthly rankings. Top gamers win exclusive rewards and the Champion crown. 👑',
  },
  {
    id: '3',
    icon: 'people',
    iconColor: COLORS.purple,
    title: 'Build Your Fanbase',
    desc: 'Creators share exclusive tips and clips. Earn GA Points and grow your community.',
  },
];

export default function OnboardingScreen({ navigation }) {
  const [index, setIndex] = useState(0);
  const flatRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    } else {
      navigation.replace('SignUp');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Skip */}
      <TouchableOpacity onPress={() => navigation.replace('SignUp')} style={styles.skip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Logo header */}
      <View style={styles.logoRow}>
        <Image source={LOGO_URI} style={styles.logoImg} resizeMode="contain" />
        <View style={styles.logoTextWrap}>
          <Text style={styles.logoGA}>GAMING</Text>
          <Text style={styles.logoActions}>ACTIONS</Text>
        </View>
      </View>

      {/* Slides */}
      <Animated.FlatList
        ref={flatRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={80} color={item.iconColor} />
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideDesc}>{item.desc}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const dotWidth   = scrollX.interpolate({ inputRange, outputRange: [6, 24, 6], extrapolate: 'clamp' });
          const dotOpacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
          return <Animated.View key={i} style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]} />;
        })}
      </View>

      {/* Bottom */}
      <View style={styles.bottomArea}>
        <TouchableOpacity onPress={goNext} style={styles.nextBtn} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>{index === SLIDES.length - 1 ? 'Get Started 🎮' : 'Next'}</Text>
          <Ionicons name="arrow-forward" size={18} color={COLORS.black} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={styles.loginLink}>
            Already a gamer? <Text style={{ color: COLORS.gold, fontWeight: '700' }}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.black, alignItems: 'center' },
  skip:         { position: 'absolute', top: 54, right: 20, zIndex: 10 },
  skipText:     { color: COLORS.gray, fontSize: 14 },
  // Logo header
  logoRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 56, marginBottom: 8 },
  logoImg:      { width: 42, height: 42, borderRadius: 10, marginRight: 10 },
  logoTextWrap: { alignItems: 'flex-start' },
  logoGA:       { fontSize: 15, fontWeight: '900', color: COLORS.white, letterSpacing: 3, lineHeight: 18 },
  logoActions:  { fontSize: 15, fontWeight: '900', color: COLORS.gold,  letterSpacing: 3, lineHeight: 18 },
  // Slides
  slide:        { width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, flex: 1 },
  iconWrap:     { width: 140, height: 140, borderRadius: 70, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gray3, marginBottom: 24 },
  slideTitle:   { fontSize: 26, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginBottom: 12 },
  slideDesc:    { fontSize: 15, color: COLORS.gray, textAlign: 'center', lineHeight: 22 },
  // Dots
  dots:         { flexDirection: 'row', marginVertical: 20 },
  dot:          { height: 6, borderRadius: 3, backgroundColor: COLORS.gold, marginHorizontal: 3 },
  // Bottom
  bottomArea:   { width: '100%', paddingHorizontal: 20, paddingBottom: 50, alignItems: 'center' },
  nextBtn:      { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 15, marginBottom: 16 },
  nextBtnText:  { fontSize: 16, fontWeight: '800', color: COLORS.black, marginRight: 8 },
  loginLink:    { fontSize: 13, color: COLORS.gray },
});

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '../../constants/colors';

const { width, height } = Dimensions.get('window');
const LOGO_URI = require('../../../assets/logo.png');

export default function SplashScreen({ navigation }) {
  const logoScale   = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale,   { toValue: 1, useNativeDriver: true, speed: 6, bounciness: 10 }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(1000),
    ]).start(() => navigation.replace('Onboarding'));
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
        {/* Logo image */}
        <Image source={LOGO_URI} style={styles.logoImg} resizeMode="contain" />
        {/* Nom sous le logo */}
        <View style={styles.nameRow}>
          <Text style={styles.logoGA}>GAMING</Text>
          <Text style={styles.logoActions}> ACTIONS</Text>
        </View>
        <View style={styles.logoDivider} />
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Rize to the GG ⚡
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.black, alignItems: 'center', justifyContent: 'center' },
  logoWrap:   { alignItems: 'center' },
  logoImg:    { width: 110, height: 110, borderRadius: 26, marginBottom: 18 },
  nameRow:    { flexDirection: 'row', alignItems: 'center' },
  logoGA:     { fontSize: 36, fontWeight: '900', color: COLORS.white, letterSpacing: 4 },
  logoActions:{ fontSize: 36, fontWeight: '900', color: COLORS.gold,  letterSpacing: 4 },
  logoDivider:{ width: 60, height: 3, backgroundColor: COLORS.gold, borderRadius: 2, marginTop: 10 },
  tagline:    { position: 'absolute', bottom: 80, fontSize: 14, color: COLORS.gray, fontStyle: 'italic', letterSpacing: 2 },
});

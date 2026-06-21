import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../screens/auth/SplashScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import CompleteProfileScreen from '../screens/auth/CompleteProfileScreen';

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="SignUp" component={SignUpScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}
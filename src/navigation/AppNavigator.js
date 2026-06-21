import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useAuthStore from '../store/useAuthStore';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import AppOverlays from '../components/AppOverlays';
import CompleteProfileScreen from '../screens/auth/CompleteProfileScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const userProfile = useAuthStore((state) => state.userProfile);
  const user = useAuthStore((state) => state.user);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#C9A84C" />
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Navigator>
    );
  }

  if (!userProfile?.username) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainNavigator} />
      </Stack.Navigator>
      <AppOverlays />
    </>
  );
}

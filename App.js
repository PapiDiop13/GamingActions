import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './src/config/firebase';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/useAuthStore';
import { navigationRef } from './src/utils/navigationRef';
import { loadCustomBannedWords } from './src/utils/moderation';
import { registerPushToken, updateLastSeen } from './src/utils/registerPush';

async function handleDeepLink(url) {
  if (!url || !navigationRef.isReady()) return;
  try {
    const path = url
      .replace('https://gamingactions.app', '')
      .replace('https://www.gamingactions.app', '')
      .replace('ga:/', '');
    const parts = path.split('/').filter(Boolean);

    if (parts[0] === 'clip' && parts[1]) {
      // Load video from Firestore then open VideoPlayer
      const snap = await getDoc(doc(db, 'videos', parts[1]));
      if (snap.exists()) {
        const video = { id: snap.id, ...snap.data() };
        navigationRef.navigate('Feed', { screen: 'VideoPlayer', params: { video } });
      }
    } else if (parts[0] === 'user' && parts[1]) {
      // Resolve username → userId
      const uSnap = await getDoc(doc(db, 'username', parts[1].toLowerCase()));
      if (uSnap.exists()) {
        const userId = uSnap.data().uid;
        navigationRef.navigate('Feed', { screen: 'UserProfile', params: { userId } });
      }
    }
  } catch (e) {}
}

export default function App() {
  const init = useAuthStore((state) => state.init);
  const user = useAuthStore((state) => state.user);

  useEffect(() => { init(); loadCustomBannedWords(); }, []);

  useEffect(() => {
    if (user?.uid) {
      registerPushToken(user.uid);
      updateLastSeen(user.uid);
    }
  }, [user?.uid]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); }).catch(() => {});
    return () => sub?.remove();
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator />
    </NavigationContainer>
  );
}

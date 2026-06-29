import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './src/config/firebase';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/useAuthStore';
import { navigationRef } from './src/utils/navigationRef';
import { loadCustomBannedWords } from './src/utils/moderation';
import { registerPushToken, updateLastSeen } from './src/utils/registerPush';

// ─── Deep link handler (URL-based) ───────────────────────────────────────────
// Handles: https://gamingactions.app/clip/:id  → VideoPlayer
//          https://gamingactions.app/user/:username → UserProfile
//          ga:/clip/:id  or  ga:/user/:username   (custom scheme fallback)
async function handleDeepLink(url) {
  if (!url || !navigationRef.isReady()) return;
  try {
    const path = url
      .replace('https://gamingactions.app', '')
      .replace('https://www.gamingactions.app', '')
      .replace('ga:/', '');
    const parts = path.split('/').filter(Boolean);

    if (parts[0] === 'clip' && parts[1]) {
      const snap = await getDoc(doc(db, 'videos', parts[1]));
      if (snap.exists()) {
        const video = { id: snap.id, ...snap.data() };
        navigationRef.navigate('Feed', { screen: 'VideoPlayer', params: { video } });
      }
    } else if (parts[0] === 'user' && parts[1]) {
      const uSnap = await getDoc(doc(db, 'username', parts[1].toLowerCase()));
      if (uSnap.exists()) {
        navigationRef.navigate('Feed', { screen: 'UserProfile', params: { userId: uSnap.data().uid } });
      }
    }
  } catch (e) { console.warn('DeepLink error:', e?.message); }
}

// ─── Notification tap handler ─────────────────────────────────────────────────
// Handles taps on push notifications sent by Cloud Functions.
// Notification data payload:  { screen, videoId?, userId? }
//   screen = "Feed"       + videoId  → VideoPlayer
//   screen = "UserProfile"+ userId   → UserProfile
//   screen = "Rankings"              → Rankings tab
//   screen = "Upload"                → Upload tab
async function handleNotifNav(data) {
  if (!data || !navigationRef.isReady()) return;
  try {
    if (data.videoId) {
      const snap = await getDoc(doc(db, 'videos', data.videoId));
      if (snap.exists()) {
        const video = { id: snap.id, ...snap.data() };
        navigationRef.navigate('Feed', { screen: 'VideoPlayer', params: { video } });
      }
    } else if (data.userId) {
      navigationRef.navigate('Feed', { screen: 'UserProfile', params: { userId: data.userId } });
    } else if (data.screen === 'Rankings') {
      navigationRef.navigate('Rankings');
    } else if (data.screen === 'Upload') {
      navigationRef.navigate('Upload');
    } else {
      navigationRef.navigate('Feed');
    }
  } catch (e) { console.warn('NotifNav error:', e?.message); }
}

// ─── Retry navigator mount before cold-start navigation ──────────────────────
function waitForNavAndNavigate(data, maxAttempts = 10) {
  let attempts = 0;
  const tryNav = () => {
    if (navigationRef.isReady()) {
      handleNotifNav(data);
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(tryNav, 200);
    }
  };
  setTimeout(tryNav, 200);
}

export default function App() {
  const init = useAuthStore((state) => state.init);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    init();
    loadCustomBannedWords();
  }, []);

  useEffect(() => {
    if (user?.uid) {
      registerPushToken(user.uid);
      updateLastSeen(user.uid);
    }
  }, [user?.uid]);

  // URL-based deep links (Universal Links + custom scheme)
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); }).catch(() => {});
    return () => sub?.remove();
  }, []);

  // Push notification tap — app open / background
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      handleNotifNav(data);
    });
    return () => sub.remove();
  }, []);

  // Push notification tap — app was killed (cold start)
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification?.request?.content?.data) {
        // Retry until navigator is ready (avoids fixed 500ms blind delay)
        waitForNavAndNavigate(response.notification.request.content.data);
      }
    }).catch(() => {});
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator />
    </NavigationContainer>
  );
}

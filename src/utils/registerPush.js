import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { awardPoints, getDailyBonus } from './points';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(userId) {
  if (!userId) return;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    // Token Expo partout — Expo Push Service gère APNs (iOS) et FCM (Android)
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '3c5066a4-e461-4e70-b99f-19476e0b45af',
    });
    const token = tokenData.data;
    if (!token) return;

    await updateDoc(doc(db, 'users', userId), {
      fcmToken: token,
      lastSeen: new Date(),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('gaming_actions', {
        name: 'Gaming Actions',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C9A84C',
      });
    }

    return token;
  } catch(e){}
}

// Bonus quotidien selon le streak level — appelé à chaque ouverture de l'app
export async function updateLastSeen(userId) {
  if (!userId) return;
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const now = new Date();
    const lastSeen = data.lastSeen?.toDate ? data.lastSeen.toDate() : null;

    const isNewDay = !lastSeen || (
      now.getFullYear() !== lastSeen.getFullYear() ||
      now.getMonth() !== lastSeen.getMonth() ||
      now.getDate() !== lastSeen.getDate()
    );

    await updateDoc(userRef, { lastSeen: now });

    if (isNewDay) {
      const bonus = getDailyBonus(data.streakLevel || 'noob');
      await awardPoints(userId, bonus, 0, `Daily login bonus (${(data.streakLevel || 'noob').toUpperCase()})`);
    }
  } catch(e){}
}
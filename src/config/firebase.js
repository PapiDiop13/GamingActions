import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDHYlFVDkF85KknGDiqatsCSOzW2bkMyDU",
  authDomain: "gamingactions-app.firebaseapp.com",
  projectId: "gamingactions-app",
  storageBucket: "gamingactions-app.firebasestorage.app",
  messagingSenderId: "878199468974",
  appId: "1:878199468974:web:ba90762a320f3e2eda0e3f",
  measurementId: "G-CG0LN6VL0H"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
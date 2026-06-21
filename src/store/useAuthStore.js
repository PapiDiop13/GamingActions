import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { friendlyError } from '../utils/errorLogger';

const useAuthStore = create((set, get) => ({
  user: null,
  userProfile: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  init: () => {
    let profileUnsub = null;
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        profileUnsub = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const profile = docSnap.data();
            if (profile.banned) {
              firebaseSignOut(auth);
              if (profileUnsub) { profileUnsub(); profileUnsub = null; }
              set({ user: null, userProfile: null, isAuthenticated: false, isLoading: false });
              return;
            }
            set({ user: firebaseUser, userProfile: profile, isAuthenticated: true, isLoading: false });
          } else {
            set({ user: firebaseUser, userProfile: null, isAuthenticated: true, isLoading: false });
          }
        }, () => {
          getDoc(docRef).then((snap) => {
            if (snap.exists()) {
              set({ user: firebaseUser, userProfile: snap.data(), isAuthenticated: true, isLoading: false });
            }
          });
        });
      } else {
        set({ user: null, userProfile: null, isAuthenticated: false, isLoading: false });
      }
    });
  },

  signUp: async (email, password) => {
    try {
      set({ error: null });
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email, uid: user.uid, createdAt: serverTimestamp(),
        username: '', bio: '', accountType: 'gamer', mainGame: '', avatar: '', banner: '',
        gaPoints: 0, streakPoints: 0, streakLevel: 'noob', ggReceived: 0,
        followers: 0, following: 0, isChampion: false, isCurrentLeader: false,
        ownedFrames: [], ownedVideoFrames: [], equippedFrame: 'none',
        fcmToken: '', lastSeen: serverTimestamp(), banned: false, plan: 'free',
      });
      await sendEmailVerification(user);
      await firebaseSignOut(auth);
      return user;
    } catch (error) {
      set({ error: friendlyError(error) });
      throw error;
    }
  },

  signIn: async (email, password) => {
    try {
      set({ error: null });
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      await reload(user);
      if (!user.emailVerified) {
        await firebaseSignOut(auth);
        throw new Error('EMAIL_NOT_VERIFIED');
      }
      return user;
    } catch (error) {
      if (error.message !== 'EMAIL_NOT_VERIFIED') {
        set({ error: friendlyError(error) });
      }
      throw error;
    }
  },

  resendVerification: async () => {
    try {
      const { user } = get();
      if (user) await sendEmailVerification(user);
    } catch (e) {}
  },

  signOut: async () => {
    try {
      await firebaseSignOut(auth);
      set({ user: null, userProfile: null, isAuthenticated: false });
    } catch (error) {
      set({ error: friendlyError(error) });
    }
  },

  saveProfile: async (profileData) => {
    try {
      const { user } = get();
      if (!user) throw new Error('No user');
      const docRef = doc(db, 'users', user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, profileData);
      } else {
        await setDoc(docRef, {
          email: user.email, uid: user.uid, createdAt: serverTimestamp(),
          gaPoints: 0, streakPoints: 0, streakLevel: 'noob', ggReceived: 0,
          followers: 0, following: 0, isChampion: false, isCurrentLeader: false,
          ownedFrames: [], ownedVideoFrames: [], equippedFrame: 'none',
          fcmToken: '', lastSeen: serverTimestamp(), banned: false, plan: 'free',
          ...profileData,
        });
      }
      set((state) => ({ userProfile: { ...state.userProfile, ...profileData } }));
    } catch (error) {
      set({ error: friendlyError(error) });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;

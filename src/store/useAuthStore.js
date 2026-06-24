/**
 * useAuthStore.js — Firebase Authentication state management (Zustand)
 *
 * Single source of truth for the current user session:
 *   - user        : Firebase Auth user object (uid, email, emailVerified)
 *   - userProfile : Firestore /users/{uid} document (username, avatar, plan, points...)
 *
 * Auth flow:
 *   1. init() subscribes to onAuthStateChanged — persists across app restarts
 *   2. On login, opens a real-time Firestore listener on the user document
 *      so profile updates (avatar, points, plan) reflect instantly everywhere
 *   3. Banned users are auto-signed-out when the listener fires
 *
 * Email verification is enforced at sign-in (not sign-up) to avoid blocking
 * the account creation flow on poor networks.
 */
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
import { friendlyError, logError, logEvent, LOG_CONTEXT } from '../utils/errorLogger';

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
            // Patch missing fields for migrated users — ensures gaPoints, streakLevel etc.
            // are always present without requiring a full re-registration.
            const needsPatch = profile.gaPoints === undefined
              || profile.streakPoints === undefined
              || profile.streakLevel === undefined;
            if (needsPatch) {
              const patch = {};
              if (profile.gaPoints     === undefined) patch.gaPoints     = 0;
              if (profile.streakPoints === undefined) patch.streakPoints = 0;
              if (profile.streakLevel  === undefined) patch.streakLevel  = 'noob';
              if (profile.ggReceived   === undefined) patch.ggReceived   = 0;
              if (profile.plan         === undefined) patch.plan         = 'free';
              if (profile.banned       === undefined) patch.banned       = false;
              import('firebase/firestore').then(({ updateDoc, doc: fDoc }) => {
                import('../config/firebase').then(({ db: fdb }) => {
                  updateDoc(fDoc(fdb, 'users', firebaseUser.uid), patch).catch(() => {});
                });
              });
            }
            set({ user: firebaseUser, userProfile: { ...profile, ...(!profile.gaPoints && { gaPoints: profile.gaPoints ?? 0 }), streakLevel: profile.streakLevel ?? 'noob', streakPoints: profile.streakPoints ?? 0 }, isAuthenticated: true, isLoading: false });
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
      await logError(LOG_CONTEXT.SIGNUP, error);
      set({ error: friendlyError(error) });
      throw error;
    }
  },

  signIn: async (email, password) => {
    try {
      set({ error: null });
      // Normalize email — same normalization as the password reset flow,
      // so a reset done with "John@Email.com" matches login "john@email.com ".
      const normalizedEmail = (email || '').trim().toLowerCase();
      const { user } = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await reload(user);

      // Note: clicking a Firebase password-reset link automatically verifies the
      // email (it proves ownership). So users who reset their password can log in
      // even if they never clicked a separate verification link.
      // We still block only genuinely unverified accounts (signed up, never verified).
      if (!user.emailVerified) {
        await firebaseSignOut(auth);
        throw new Error('EMAIL_NOT_VERIFIED');
      }
      return user;
    } catch (error) {
      if (error.message !== 'EMAIL_NOT_VERIFIED') {
        await logError(LOG_CONTEXT.LOGIN, error);
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
      await logError(LOG_CONTEXT.SIGNOUT, error);
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
      await logError(LOG_CONTEXT.PROFILE_SAVE, error);
      set({ error: friendlyError(error) });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;

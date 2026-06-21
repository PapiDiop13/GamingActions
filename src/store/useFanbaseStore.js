import { create } from 'zustand';
import {
  doc, getDoc, setDoc, deleteDoc, updateDoc, increment,
  collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import useAuthStore from './useAuthStore';

const useFanbaseStore = create((set, get) => ({
  // Cache local : { [creatorId]: true }
  subscriptions: {},

  // ── Vérif unitaire (1 getDoc, ID composite, aucune query, aucun index) ──────
  checkIsSubscribed: async (currentUserId, creatorId) => {
    if (!currentUserId || !creatorId) return false;
    try {
      const subId = `${currentUserId}_${creatorId}`;
      const snap = await getDoc(doc(db, 'fanbase_subscriptions', subId));
      const isSub = snap.exists();
      set(state => ({ subscriptions: { ...state.subscriptions, [creatorId]: isSub } }));
      return isSub;
    } catch (e) {
      return false;
    }
  },

  // ── Charge tous mes abonnements d'un coup (login / mount écran) ─────────────
  // where('subscriberId','==',uid) : égalité simple sur un champ → AUCUN index composite.
  loadMySubscriptions: async (currentUserId) => {
    if (!currentUserId) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'fanbase_subscriptions'), where('subscriberId', '==', currentUserId))
      );
      const subscriptions = {};
      snap.docs.forEach(d => { subscriptions[d.data().creatorId] = true; });
      set({ subscriptions });
    } catch(e){}
  },

  // ── Lecture synchrone du cache (à utiliser dans le rendu) ───────────────────
  isSubscribedTo: (creatorId) => get().subscriptions[creatorId] || false,

  // ── JOIN (mode test : pas de paiement, AUCUN point donné — anti-triche) ─────
  joinFanbase: async (currentUserId, creator) => {
    const creatorId = creator?.uid || creator?.id;
    if (!currentUserId || !creatorId) return false;
    // Garde-fou : on ne rejoint pas sa propre fanbase
    if (currentUserId === creatorId) return false;

    const subId = `${currentUserId}_${creatorId}`;
    const subRef = doc(db, 'fanbase_subscriptions', subId);

    // Optimistic update
    set(state => ({ subscriptions: { ...state.subscriptions, [creatorId]: true } }));

    try {
      await setDoc(subRef, {
        subscriberId: currentUserId,
        creatorId,
        creatorUsername: creator?.username || '',
        status: 'active',
        isTest: true,               // flag pour nettoyer les abos test au switch RevenueCat
        createdAt: serverTimestamp(),
      });

      // Compteur fans côté créateur (safe, non trichable de façon utile)
      await updateDoc(doc(db, 'users', creatorId), {
        fanbaseSubscribers: increment(1),
      });

      // Notification au créateur (PAS de points — décision anti-triche)
      const myUsername = useAuthStore.getState().userProfile?.username || 'Someone';
      await addDoc(collection(db, 'notifications'), {
        userId: creatorId,
        type: 'fanbase_join',
        fromUserId: currentUserId,
        fromUsername: myUsername,
        text: 'joined your Fanbase 🔓',
        read: false,
        createdAt: serverTimestamp(),
      });

      return true;
    } catch (e) {
      console.log('joinFanbase error:', e.message);
      set(state => ({ subscriptions: { ...state.subscriptions, [creatorId]: false } }));
      return false;
    }
  },

  // ── CANCEL (mode test : supprime le document) ───────────────────────────────
  cancelFanbase: async (currentUserId, creatorId) => {
    if (!currentUserId || !creatorId) return false;

    const subId = `${currentUserId}_${creatorId}`;
    const subRef = doc(db, 'fanbase_subscriptions', subId);

    // Optimistic update → les exclusifs se re-verrouillent direct
    set(state => ({ subscriptions: { ...state.subscriptions, [creatorId]: false } }));

    try {
      await deleteDoc(subRef);
      await updateDoc(doc(db, 'users', creatorId), {
        fanbaseSubscribers: increment(-1),
      });
      return true;
    } catch (e) {
      console.log('cancelFanbase error:', e.message);
      set(state => ({ subscriptions: { ...state.subscriptions, [creatorId]: true } }));
      return false;
    }
  },
}));

export default useFanbaseStore;
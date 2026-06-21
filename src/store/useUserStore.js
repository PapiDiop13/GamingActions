import { create } from 'zustand';
import {
  doc, getDoc, setDoc, deleteDoc, updateDoc, increment,
  collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import useAuthStore from './useAuthStore';
import { awardPoints, POINTS } from '../utils/points';

const useUserStore = create((set, get) => ({
  following: {},

  checkIsFollowing: async (currentUserId, targetUserId) => {
    if (!currentUserId || !targetUserId) return false;
    try {
      const followId = `${currentUserId}_${targetUserId}`;
      const snap = await getDoc(doc(db, 'follows', followId));
      const isFollowing = snap.exists();
      set(state => ({ following: { ...state.following, [targetUserId]: isFollowing } }));
      return isFollowing;
    } catch (e) {
      return false;
    }
  },

  toggleFollow: async (currentUserId, targetUserId, currentUsername) => {
    if (!currentUserId || !targetUserId) return;
    const followId = `${currentUserId}_${targetUserId}`;
    const followRef = doc(db, 'follows', followId);
    const { following } = get();
    const isCurrentlyFollowing = following[targetUserId] || false;

    // Optimistic update
    set(state => ({
      following: { ...state.following, [targetUserId]: !isCurrentlyFollowing },
    }));

    // Met à jour isFollowing dans le feed store
    try {
      const feedStore = require('./useFeedStore').default;
      const { videos } = feedStore.getState();
      feedStore.setState({
        videos: videos.map(v =>
          v.userId === targetUserId ? { ...v, isFollowing: !isCurrentlyFollowing } : v
        )
      });
    } catch (e) {}

    try {
      if (!isCurrentlyFollowing) {
        await setDoc(followRef, {
          followerId: currentUserId,
          followingId: targetUserId,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', currentUserId), { following: increment(1) });
        await updateDoc(doc(db, 'users', targetUserId), { followers: increment(1) });
        // +5 pts au joueur qui gagne un follower
        await awardPoints(targetUserId, POINTS.NEW_FOLLOWER);
        await addDoc(collection(db, 'notifications'), {
          userId: targetUserId,
          type: 'follow',
          fromUserId: currentUserId,
          fromUsername: currentUsername || 'Someone',
          text: 'started following you 👤',
          read: false,
          createdAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(followRef);
        await updateDoc(doc(db, 'users', currentUserId), { following: increment(-1) });
        await updateDoc(doc(db, 'users', targetUserId), { followers: increment(-1) });
        // −5 pts (anti-triche : les points disparaissent si le follow part)
        await awardPoints(targetUserId, -POINTS.NEW_FOLLOWER);
      }

      // Met à jour le profil local dans useAuthStore
      const updatedSnap = await getDoc(doc(db, 'users', currentUserId));
      if (updatedSnap.exists()) {
        useAuthStore.getState().saveProfile(updatedSnap.data());
      }

    } catch (e) {
      console.log('toggleFollow error:', e.message);
      // Rollback
      set(state => ({
        following: { ...state.following, [targetUserId]: isCurrentlyFollowing },
      }));
      // Rollback feed store
      try {
        const feedStore = require('./useFeedStore').default;
        const { videos } = feedStore.getState();
        feedStore.setState({
          videos: videos.map(v =>
            v.userId === targetUserId ? { ...v, isFollowing: isCurrentlyFollowing } : v
          )
        });
      } catch (e2) {}
    }
  },

  fetchFollowing: async (userId) => {
    if (!userId) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'follows'), where('followerId', '==', userId))
      );
      const following = {};
      snap.docs.forEach(d => { following[d.data().followingId] = true; });
      set({ following });
    } catch (e) {}
  },

  isFollowing: (userId) => get().following[userId] || false,
}));

export default useUserStore;
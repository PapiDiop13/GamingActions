/**
 * useSubscriptionStore.js — Legendary subscription state
 *
 * Gère l'abonnement Legendary du user connecté.
 * Architecture prête pour RevenueCat — seules les clés manquent.
 *
 * Firestore schema:
 *   subscriptions/{userId} {
 *     userId, tier: 'legendary'|'free',
 *     status: 'active'|'cancelled'|'expired'|'trial',
 *     platform: 'ios'|'android'|'test',
 *     productId: 'legendary_monthly'|'legendary_yearly',
 *     startDate: Timestamp,
 *     currentPeriodStart: Timestamp,
 *     currentPeriodEnd: Timestamp,
 *     cancelAtPeriodEnd: bool,
 *     isTest: bool,
 *     revenueCatId: string (null until RC integrated),
 *   }
 *
 * Legendary benefits:
 *   - Unlimited video uploads (free = 20/week)
 *   - 1080p max resolution
 *   - Exclusive frames (free tier in shop)
 *   - Gold LEGENDARY badge
 *   - Priority feed placement
 *   - Advanced stats
 *   - 500 GA Points/month bonus
 */
import { create } from 'zustand';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logError, LOG_CONTEXT } from '../utils/errorLogger';

// ── Upload limits ─────────────────────────────────────────────────────────────
export const UPLOAD_LIMITS = {
  free:      20, // per week
  legendary: Infinity,
  creator:   Infinity,
  gameconic: Infinity,
};

export const LEGENDARY_BENEFITS = [
  { icon: 'infinite-outline',           label: 'Unlimited uploads',               sub: 'Free users: 20 videos/week',        color: '#C9A84C' },
  { icon: 'videocam-outline',           label: '4K/1080p video quality',          sub: 'Maximum resolution for all clips',  color: '#C9A84C' },
  { icon: 'color-palette-outline',      label: 'Exclusive Legendary frames',      sub: '15+ premium frames free',           color: '#C9A84C' },
  { icon: 'star-outline',               label: 'LEGENDARY gold badge',            sub: 'Stands out everywhere in the app',  color: '#C9A84C' },
  { icon: 'trending-up-outline',        label: 'Priority feed placement',         sub: 'Your clips seen first',             color: '#C9A84C' },
  { icon: 'analytics-outline',          label: 'Advanced clip analytics',         sub: 'Views, reach, retention, GG rate',  color: '#C9A84C' },
  { icon: 'diamond-outline',            label: '500 GA Points/month bonus',       sub: 'Credited on each billing date',     color: '#C9A84C' },
  { icon: 'shield-checkmark-outline',   label: 'Early access to new features',    sub: 'Test features before everyone',     color: '#C9A84C' },
  { icon: 'notifications-outline',      label: 'Priority support',                sub: 'Direct line to the GA team',        color: '#C9A84C' },
];

export const PLANS = [
  {
    id: 'legendary_monthly',
    label: 'Monthly',
    price: 2.99,
    priceStr: '$2.99',
    period: '/month',
    periodDays: 30,
    desc: 'Billed monthly · Cancel anytime',
    badge: null,
    saving: null,
  },
  {
    id: 'legendary_yearly',
    label: 'Yearly',
    price: 19.99,
    priceStr: 'CA$19.99',
    period: '/year',
    periodDays: 365,
    desc: 'Only CA$1.67/month · Best deal',
    badge: 'SAVE 44%',
    saving: 44,
  },
];

// ── Store ─────────────────────────────────────────────────────────────────────
const useSubscriptionStore = create((set, get) => ({
  subscription: null,   // null = not loaded, {} = loaded (may be free)
  isLoading: false,

  // Computed helpers
  isLegendary: () => {
    const sub = get().subscription;
    return sub?.tier === 'legendary' && sub?.status === 'active';
  },

  canUploadThisWeek: async (userId, currentWeekCount) => {
    const plan = get().subscription?.tier || 'free';
    const limit = UPLOAD_LIMITS[plan] ?? UPLOAD_LIMITS.free;
    return currentWeekCount < limit;
  },

  // Load subscription from Firestore
  loadSubscription: async (userId) => {
    if (!userId) return;
    set({ isLoading: true });
    try {
      const snap = await getDoc(doc(db, 'subscriptions', userId));
      if (snap.exists()) {
        set({ subscription: { id: snap.id, ...snap.data() }, isLoading: false });
      } else {
        set({ subscription: { tier: 'free', status: 'none' }, isLoading: false });
      }
    } catch (e) {
      set({ isLoading: false });
    }
  },

  // TEST ONLY — simulate a Legendary subscription (admin/sandbox)
  activateTestSubscription: async (userId, planId = 'legendary_monthly') => {
    if (!userId) return false;
    const plan = PLANS.find(p => p.id === planId) || PLANS[0];
    const now = Timestamp.now();
    const periodEnd = Timestamp.fromDate(
      new Date(Date.now() + plan.periodDays * 86400000)
    );
    try {
      await setDoc(doc(db, 'subscriptions', userId), {
        userId,
        tier: 'legendary',
        status: 'active',
        platform: 'test',
        productId: plan.id,
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        isTest: true,
        revenueCatId: null,
        updatedAt: serverTimestamp(),
      });
      // Update user plan field
      await updateDoc(doc(db, 'users', userId), { plan: 'legendary' });
      set({
        subscription: {
          userId, tier: 'legendary', status: 'active',
          platform: 'test', productId: plan.id,
          currentPeriodEnd: periodEnd, isTest: true,
        }
      });
      return true;
    } catch (e) {
      console.error('subscription_activate error:', e);
      return false;
    }
  },

  // Cancel test subscription
  cancelTestSubscription: async (userId) => {
    if (!userId) return false;
    try {
      await updateDoc(doc(db, 'subscriptions', userId), {
        status: 'cancelled',
        cancelAtPeriodEnd: true,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', userId), { plan: 'free' });
      set(s => ({ subscription: { ...s.subscription, status: 'cancelled', cancelAtPeriodEnd: true } }));
      return true;
    } catch (e) {
      return false;
    }
  },

  // Called by RevenueCat webhook / SDK when payment confirmed (v2)
  activateFromRevenueCat: async (userId, rcData) => {
    const plan = PLANS.find(p => p.id === rcData.productId) || PLANS[0];
    const now = Timestamp.now();
    const periodEnd = Timestamp.fromMillis(rcData.expirationDate || Date.now() + 30 * 86400000);
    await setDoc(doc(db, 'subscriptions', userId), {
      userId,
      tier: 'legendary',
      status: 'active',
      platform: rcData.platform || 'unknown',
      productId: rcData.productId,
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      isTest: false,
      revenueCatId: rcData.originalAppUserId || null,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'users', userId), { plan: 'legendary' });
    set({
      subscription: {
        userId, tier: 'legendary', status: 'active',
        platform: rcData.platform, productId: rcData.productId,
        currentPeriodEnd: periodEnd, isTest: false,
      }
    });
  },

  clear: () => set({ subscription: null }),
}));

export default useSubscriptionStore;

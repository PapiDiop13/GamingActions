/**
 * useRevenueCat.js — RevenueCat integration
 *
 * SETUP (quand tu as les clés) :
 *   1. npx expo install react-native-purchases
 *   2. Remplacer REVENUECAT_IOS_KEY + REVENUECAT_ANDROID_KEY
 *
 * Product IDs Apple:
 *   com.gamingactions.app.legendary_monthly   $2.99/mois
 *   com.gamingactions.app.legendary_yearly    $24.99/an
 *   com.gamingactions.app.frame_[frameId]     one-time frames animées
 *
 * Product IDs Google:
 *   legendary_monthly / legendary_yearly / frame_[frameId]
 *
 * Entitlements RevenueCat:
 *   "legendary" → abonnement actif
 *   "frame_[frameId]" → frame achetée définitivement
 */
import { Platform } from 'react-native';
import {
  doc, setDoc, updateDoc, getDoc, arrayUnion,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const REVENUECAT_IOS_KEY     = 'YOUR_IOS_RC_KEY';
export const REVENUECAT_ANDROID_KEY = 'YOUR_ANDROID_RC_KEY';

export const STORE_FEE     = 0.30;
export const CREATOR_SHARE = 0.70;

export const PRODUCT_IDS = {
  legendary_monthly: Platform.OS === 'ios'
    ? 'com.gamingactions.app.legendary_monthly' : 'legendary_monthly',
  legendary_yearly: Platform.OS === 'ios'
    ? 'com.gamingactions.app.legendary_yearly'  : 'legendary_yearly',
  frame:   (id) => Platform.OS === 'ios' ? `com.gamingactions.app.frame_${id}` : `frame_${id}`,
  fanbase: (id) => Platform.OS === 'ios' ? `com.gamingactions.app.fanbase_${id}` : `fanbase_${id}`,
};

// ── Init ──────────────────────────────────────────────────────────────────────
export async function initRevenueCat(userId) {
  try {
    const Purchases = require('react-native-purchases').default;
    const key = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
    await Purchases.configure({ apiKey: key, appUserID: userId });
  } catch (e) {
    console.log('[RC] not available:', e.message);
  }
}

// ── Legendary subscription ────────────────────────────────────────────────────
export async function purchaseLegendary(userId, planId = 'legendary_monthly') {
  try {
    const Purchases = require('react-native-purchases').default;
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.find(
      p => p.product.identifier === PRODUCT_IDS[planId]
    );
    if (!pkg) throw new Error('Package not found');
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = !!customerInfo.entitlements.active['legendary'];
    if (active) {
      await _saveLegendaryFirestore(userId, planId, customerInfo);
      return { success: true };
    }
    return { success: false, error: 'Not active' };
  } catch (e) {
    if (e.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: e.message };
  }
}

export async function _saveLegendaryFirestore(userId, planId, customerInfo) {
  const ent = customerInfo?.entitlements?.active?.['legendary'];
  const end = ent?.expirationDate
    ? Timestamp.fromDate(new Date(ent.expirationDate))
    : Timestamp.fromDate(new Date(Date.now() + 30 * 86400000));
  const now = Timestamp.now();
  await setDoc(doc(db, 'subscriptions', userId), {
    userId, tier: 'legendary', status: 'active',
    platform: Platform.OS, productId: planId,
    startDate: now, currentPeriodStart: now, currentPeriodEnd: end,
    cancelAtPeriodEnd: false, isTest: false,
    revenueCatId: customerInfo?.originalAppUserId || null,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'users', userId), { plan: 'legendary' });
}

// ── Animated frame one-time purchase ─────────────────────────────────────────
export async function purchaseFrame(userId, frameId) {
  try {
    const Purchases = require('react-native-purchases').default;
    const productId = PRODUCT_IDS.frame(frameId);
    const products = await Purchases.getProducts([productId]);
    if (!products?.length) throw new Error('Product not found');
    const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
    const owned = customerInfo.nonSubscriptionTransactions?.some(
      t => t.productIdentifier === productId
    );
    if (owned) {
      await updateDoc(doc(db, 'users', userId), {
        ownedAnimatedFrames: arrayUnion(frameId),
      });
      return { success: true };
    }
    return { success: false };
  } catch (e) {
    if (e.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: e.message };
  }
}

// ── Restore purchases ─────────────────────────────────────────────────────────
export async function restorePurchases(userId) {
  try {
    const Purchases = require('react-native-purchases').default;
    const customerInfo = await Purchases.restorePurchases();
    const isLegendary = !!customerInfo.entitlements.active['legendary'];
    if (isLegendary) await _saveLegendaryFirestore(userId, 'legendary_monthly', customerInfo);
    // Restore frames
    const frames = customerInfo.nonSubscriptionTransactions
      ?.filter(t => t.productIdentifier.includes('frame_'))
      ?.map(t => t.productIdentifier.replace('com.gamingactions.app.frame_', '').replace(/^frame_/, ''))
      || [];
    if (frames.length) {
      for (const f of frames) {
        await updateDoc(doc(db, 'users', userId), { ownedAnimatedFrames: arrayUnion(f) });
      }
    }
    return { success: true, isLegendary };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Frame access check ────────────────────────────────────────────────────────
// animated → faut avoir acheté en one-time
// legendaryFree → faut être Legendary actif
export function canUseFrame(frame, userPlan, ownedAnimatedFrames = []) {
  if (!frame) return false;
  if (!frame.animated && !frame.legendaryFree) return true;
  if (frame.animated) return ownedAnimatedFrames.includes(frame.id);
  if (frame.legendaryFree) return userPlan === 'legendary';
  return false;
}

// ── Test mode admin ───────────────────────────────────────────────────────────
export async function activateTestLegendary(userId, planId = 'legendary_monthly') {
  const days = planId === 'legendary_yearly' ? 365 : 30;
  const now = Timestamp.now();
  const end = Timestamp.fromDate(new Date(Date.now() + days * 86400000));
  await setDoc(doc(db, 'subscriptions', userId), {
    userId, tier: 'legendary', status: 'active',
    platform: 'test', productId: planId,
    startDate: now, currentPeriodStart: now, currentPeriodEnd: end,
    cancelAtPeriodEnd: false, isTest: true, revenueCatId: null,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'users', userId), { plan: 'legendary' });
}

export async function cancelTestLegendary(userId) {
  await updateDoc(doc(db, 'subscriptions', userId), {
    status: 'cancelled', cancelAtPeriodEnd: true, updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'users', userId), { plan: 'free' });
}

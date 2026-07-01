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

export const REVENUECAT_IOS_KEY     = 'appl_waSCArpfxsGyNClgmnrcuuEFSUk';
export const REVENUECAT_ANDROID_KEY = 'YOUR_ANDROID_RC_KEY'; // À configurer quand Android prêt

export const STORE_FEE     = 0.30;
export const CREATOR_SHARE = 0.70;

const _IOS = Platform.OS === 'ios';
const _PREFIX = 'com.gamingactions.app.';
// iOS = identifiant complet préfixé ; Android = identifiant nu
const _pid = (slug) => _IOS ? `${_PREFIX}${slug}` : slug;

export const PRODUCT_IDS = {
  legendary_monthly: _pid('legendary_monthly'),
  legendary_yearly:  _pid('legendary_yearly'),
  // Générateurs one-time (doivent matcher iap_setup/catalog.json)
  frame:        (id) => _pid(`frame_${id}`),
  videoFrame:   (id) => _pid(`videoframe_${id}`),
  commentFrame: (id) => _pid(`commentframe_${id}`),
  background:   (id) => _pid(`bg_${id}`),
  banner:       (id) => _pid(`banner_${id}`),
  username:     (id) => _pid(`username_${id}`),
  badge:        (id) => _pid(`badge_${id}`),
  cardBorder:   (id) => _pid(`card_${id}`),
  theme:        (id) => _pid(`theme_${id}`),
  fanbase:      (id) => _pid(`fanbase_${id}`),
};

// Map catégorie cosmétique (constants/cosmetics.js) → builder de Product ID
const _COSMETIC_BUILDER = {
  background: PRODUCT_IDS.background,
  banner:     PRODUCT_IDS.banner,
  username:   PRODUCT_IDS.username,
  badge:      PRODUCT_IDS.badge,
  card:       PRODUCT_IDS.cardBorder,
  theme:      PRODUCT_IDS.theme,
};

// Renvoie le Product ID App Store pour un item du shop selon sa catégorie.
export function cosmeticProductId(category, id) {
  const build = _COSMETIC_BUILDER[category];
  return build ? build(id) : _pid(`cosmetic_${id}`);
}

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

// Guard interne — s'assure que RC est configuré avant chaque appel
async function _ensureConfigured(userId) {
  try {
    const Purchases = require('react-native-purchases').default;
    if (!Purchases.isConfigured()) {
      const key = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
      await Purchases.configure({ apiKey: key, appUserID: userId });
    }
    return Purchases;
  } catch (e) {
    throw new Error('RevenueCat non disponible: ' + e.message);
  }
}

// ── Legendary subscription ────────────────────────────────────────────────────
export async function purchaseLegendary(userId, planId = 'legendary_monthly') {
  try {
    const Purchases = await _ensureConfigured(userId);
    const productId = PRODUCT_IDS[planId];

    // 1) Essaie via l'Offering RevenueCat (si elle est configurée dans le dashboard)
    let pkg = null;
    try {
      const offerings = await Purchases.getOfferings();
      pkg = offerings?.current?.availablePackages?.find(p => p.product.identifier === productId);
    } catch (e) { /* pas d'offering → on tombe sur le fallback direct */ }

    let customerInfo;
    if (pkg) {
      ({ customerInfo } = await Purchases.purchasePackage(pkg));
    } else {
      // 2) Fallback direct StoreKit — ne nécessite AUCUNE config RevenueCat (offering/entitlement)
      const products = await Purchases.getProducts([productId]);
      if (!products?.length) throw new Error('Product not found: ' + productId);
      ({ customerInfo } = await Purchases.purchaseStoreProduct(products[0]));
    }

    // Actif si l'entitlement legendary est présent OU si l'abo est dans les souscriptions actives
    const active = !!customerInfo.entitlements?.active?.['legendary']
      || (customerInfo.activeSubscriptions || []).includes(productId);
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

// ── Achat générique non-consommable (cosmétiques shop) ───────────────────────
// Achète le produit App Store correspondant et journalise le gain dans
// la collection `shop_purchases` (utilisée par les stats admin du shop).
// itemMeta = { itemId, category, amountCAD, name }
export async function purchaseNonConsumable(userId, productId, itemMeta = {}) {
  try {
    const Purchases = await _ensureConfigured(userId);
    const products = await Purchases.getProducts([productId]);
    if (!products?.length) throw new Error('Product not found: ' + productId);
    const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
    const owned = customerInfo.nonSubscriptionTransactions?.some(
      t => t.productIdentifier === productId
    );
    if (owned) {
      try { await logShopPurchase(userId, productId, itemMeta); } catch (e) {}
      return { success: true };
    }
    return { success: false, error: 'Not owned' };
  } catch (e) {
    if (e.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: e.message };
  }
}

// Enregistre un achat payant du shop pour les statistiques de gains.
export async function logShopPurchase(userId, productId, itemMeta = {}) {
  const amount = Number(itemMeta.amountCAD || 0);
  await setDoc(doc(db, 'shop_purchases', `${userId}_${itemMeta.itemId || productId}_${Date.now()}`), {
    userId,
    productId,
    itemId: itemMeta.itemId || null,
    itemName: itemMeta.name || null,
    category: itemMeta.category || 'unknown',   // avatar_frame, background, theme, …
    amount,                                      // prix CAD payé (brut)
    netAmount: +(amount * (1 - STORE_FEE)).toFixed(2), // après frais store 30%
    currency: 'CAD',
    platform: Platform.OS,
    isTest: false,
    createdAt: serverTimestamp(),
  });
}

// ── Support the App (don consommable au développeur) ─────────────────────────
// Achète un palier "Support" et le journalise dans `support_purchases`.
export async function purchaseSupport(userId, productId, amountCAD) {
  try {
    const Purchases = await _ensureConfigured(userId);
    const products = await Purchases.getProducts([productId]);
    if (!products?.length) throw new Error('Product not found: ' + productId);
    const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
    const ok = customerInfo.nonSubscriptionTransactions?.some(t => t.productIdentifier === productId);
    if (ok) {
      try {
        const amount = Number(amountCAD || 0);
        await setDoc(doc(db, 'support_purchases', `${userId}_${Date.now()}`), {
          userId, productId, amount,
          netAmount: +(amount * (1 - STORE_FEE)).toFixed(2),
          currency: 'CAD', platform: Platform.OS, source: 'ios_iap',
          createdAt: serverTimestamp(),
        });
      } catch (e) {}
      return { success: true };
    }
    return { success: false, error: 'Not completed' };
  } catch (e) {
    if (e.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: e.message };
  }
}

// ── Restore purchases ─────────────────────────────────────────────────────────
export async function restorePurchases(userId) {
  try {
    const Purchases = await _ensureConfigured(userId);
    const customerInfo = await Purchases.restorePurchases();
    const ent = customerInfo.entitlements?.active?.['legendary'];
    const isLegendary = !!ent;
    if (isLegendary) {
      // Détecte annuel vs mensuel depuis le produit restauré (sinon on mislabel)
      const pid = (ent.productIdentifier || '').toLowerCase().includes('year')
        ? 'legendary_yearly' : 'legendary_monthly';
      await _saveLegendaryFirestore(userId, pid, customerInfo);
    }
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

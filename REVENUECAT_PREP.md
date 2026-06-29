# RevenueCat Integration Prep — Gaming Actions Mobile

## Overview
Mobile (iOS + Android) in-app subscriptions will go through RevenueCat.
Web subscriptions continue through Stripe.
Both sources write to the same Firestore `users/{uid}.plan` field.

---

## 1. Products to Create in App Store Connect & Google Play Console

### App Store Connect (iOS)
- **Subscription Group**: "Gaming Actions Legendary"
- Product 1: `com.gamingactions.legendary.monthly`
  - Price: CA$1.99/month (Tier 2 or equivalent)
  - Display name: "Legendary Monthly"
  - Duration: 1 month
- Product 2: `com.gamingactions.legendary.yearly`
  - Price: CA$14.99/year (Tier 14 or equivalent)
  - Display name: "Legendary Yearly"
  - Duration: 1 year

### Google Play Console (Android)
- **Subscription**: `legendary`
  - Base Plan 1: `monthly` → CA$1.99/month
  - Base Plan 2: `yearly` → CA$14.99/year

---

## 2. RevenueCat Dashboard Setup

### Entitlements
- Name: `legendary`
- Description: Access to Legendary plan features

### Products to attach to `legendary` entitlement:
- `com.gamingactions.legendary.monthly` (iOS)
- `com.gamingactions.legendary.yearly` (iOS)
- `legendary:monthly` (Android)
- `legendary:yearly` (Android)

### Offerings
- Default offering: `legendary`
  - Package 1: Monthly (`$rc_monthly`) → monthly products
  - Package 2: Annual (`$rc_annual`) → yearly products

---

## 3. Firestore Field Mapping

When RevenueCat webhook fires (or when app validates purchase), write to Firestore:

```js
// users/{uid}
{
  plan: "legendary",           // or "free" on expiry
  subscriptionSource: "revenuecat",
  revenueCatCustomerId: "<rc_app_user_id>",
  subscriptionExpiresAt: Timestamp,  // from RC expiration date
  revenueCatProductId: "com.gamingactions.legendary.monthly",
  updatedAt: serverTimestamp(),
}
```

On expiry (RC sends `EXPIRATION` event):
```js
{
  plan: "free",
  subscriptionSource: "revenuecat",
  revenueCatCustomerId: "<rc_app_user_id>",
  subscriptionExpiresAt: null,
  updatedAt: serverTimestamp(),
}
```

---

## 4. Mobile Code Snippets

### Install
```bash
npx expo install react-native-purchases
```

### Configure RevenueCat (App.js or auth init)
```js
import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

const RC_API_KEY_IOS     = 'appl_XXXXXXXXXXXXXXXXXXXXXX';
const RC_API_KEY_ANDROID = 'goog_XXXXXXXXXXXXXXXXXXXXXX';

// Call after user is authenticated
export async function initRevenueCat(firebaseUid) {
  const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
  Purchases.configure({ apiKey, appUserID: firebaseUid });
}
```

### Fetch offerings + purchase
```js
import Purchases from 'react-native-purchases';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function fetchLegendaryOfferings() {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages || [];
}

export async function purchaseLegendary(pkg, uid) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isActive = customerInfo.entitlements.active['legendary'];
    if (isActive) {
      await updateDoc(doc(db, 'users', uid), {
        plan: 'legendary',
        subscriptionSource: 'revenuecat',
        revenueCatProductId: pkg.product.productIdentifier,
        subscriptionExpiresAt: isActive.expirationDate
          ? new Date(isActive.expirationDate)
          : null,
        updatedAt: serverTimestamp(),
      });
    }
    return { success: true, customerInfo };
  } catch (e) {
    if (!e.userCancelled) throw e;
    return { success: false, cancelled: true };
  }
}
```

### Check entitlement on app launch
```js
export async function checkLegendaryStatus(uid) {
  try {
    const info = await Purchases.getCustomerInfo();
    const legendary = info.entitlements.active['legendary'];
    if (legendary) {
      await updateDoc(doc(db, 'users', uid), {
        plan: 'legendary',
        subscriptionSource: 'revenuecat',
        subscriptionExpiresAt: legendary.expirationDate
          ? new Date(legendary.expirationDate)
          : null,
        updatedAt: serverTimestamp(),
      });
    }
    return !!legendary;
  } catch (e) {
    console.warn('RevenueCat check failed:', e);
    return false;
  }
}
```

### Restore purchases
```js
export async function restorePurchases(uid) {
  const info = await Purchases.restorePurchases();
  const legendary = info.entitlements.active['legendary'];
  if (legendary) {
    await updateDoc(doc(db, 'users', uid), {
      plan: 'legendary',
      subscriptionSource: 'revenuecat',
      updatedAt: serverTimestamp(),
    });
  }
  return !!legendary;
}
```

---

## 5. RevenueCat Webhook (Cloud Function)

Add to `functions/src/index.ts` — handles server-side entitlement grants:

```ts
// POST body from RevenueCat webhook
export const revenueCatWebhook = onRequest(
  { cors: false, region: "us-central1" },
  async (req, res) => {
    // Verify RevenueCat webhook authorization header
    const RC_WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (req.headers.authorization !== RC_WEBHOOK_AUTH) {
      res.status(401).send("Unauthorized");
      return;
    }

    const event = req.body;
    const type  = event.event?.type;
    const uid   = event.event?.app_user_id;      // = Firebase UID (set as RC app user ID)
    const expAt = event.event?.expiration_at_ms;

    if (!uid) { res.status(400).json({ error: "no app_user_id" }); return; }

    const userRef = db.collection("users").doc(uid);
    const isActive = ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE"].includes(type);
    const isExpired = ["CANCELLATION", "EXPIRATION", "BILLING_ISSUE"].includes(type);

    if (isActive) {
      await userRef.update({
        plan: "legendary",
        subscriptionSource: "revenuecat",
        subscriptionExpiresAt: expAt ? admin.firestore.Timestamp.fromMillis(expAt) : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (isExpired) {
      await userRef.update({
        plan: "free",
        subscriptionSource: "revenuecat",
        subscriptionExpiresAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.status(200).json({ received: true });
  }
);
```

---

## 6. Migration Strategy: Stripe Web vs RevenueCat Mobile

### Source of truth
`users/{uid}.subscriptionSource` determines which system manages the subscription:
- `"stripe_web"` → managed by Stripe (web checkout)
- `"revenuecat"` → managed by RevenueCat (mobile IAP)
- `null` → free plan

### Rules
1. **Do not mix sources**: if a user has an active Stripe sub, do not start a RevenueCat sub (show "Manage on web" in app).
2. **Expiry wins**: `checkExpiredSubscriptions` Cloud Function checks Stripe only. RevenueCat webhook handles its own expiry events.
3. **Restore purchases**: always use `revenueCatWebhook` or `Purchases.getCustomerInfo()` as the source of truth for mobile users — never re-read from Firestore alone.
4. **Display in settings**: show correct management UI based on `subscriptionSource`.

### In-app subscription screen logic
```js
const { plan, subscriptionSource } = userProfile;

if (plan === 'legendary' && subscriptionSource === 'stripe_web') {
  // Show "Manage your subscription on gamingactions.app"
  // Link to web Customer Portal
} else if (plan === 'legendary' && subscriptionSource === 'revenuecat') {
  // Show native manage subscription (RevenueCat.showManageSubscriptions())
} else {
  // Show upgrade options via RevenueCat packages
}
```

---

## 7. Checklist Before Going Live

- [ ] Create products in App Store Connect + Google Play Console
- [ ] Connect both stores to RevenueCat dashboard
- [ ] Create `legendary` entitlement and attach all products
- [ ] Add `RC_API_KEY_IOS` and `RC_API_KEY_ANDROID` to app config
- [ ] Add `REVENUECAT_WEBHOOK_AUTH` to `functions/.env`
- [ ] Deploy `revenueCatWebhook` Cloud Function
- [ ] Register webhook URL in RevenueCat dashboard
- [ ] Test sandbox purchase on iOS + Android
- [ ] Verify Firestore `plan: "legendary"` is set after purchase
- [ ] Test restore purchases
- [ ] Test expiry flow (sandbox forced expiry)

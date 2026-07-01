# Gaming Actions — Récap monétisation (App Store + RevenueCat + code)

Document de suivi. Coche au fur et à mesure. Rien n'est déployé tant que tu ne le décides pas.

---

## 1. État actuel (fait ✅)

**App Store Connect — Achats intégrés**
- ✅ 128 achats intégrés **non-consommables** créés (cosmétiques payés en $).
- ✅ Prix **CAD** posés sur les 128 (territoire de base : Canada).
- ✅ Disponibilité : **toutes régions** (175 territoires).
- ✅ Localisation en-US (nom + description) sur les 128.
- ⏳ Captures de revue : ~124/128 — relancer `python finalize_iap.py` pour finir les dernières.
- ✅ Abonnements Legendary (mensuel CA$2.99 / annuel CA$24.99) : déjà créés (avant ce chantier).

**Code mobile (modifié, NON déployé)**
- ✅ `src/hooks/useRevenueCat.js` — Product IDs cosmétiques + `purchaseNonConsumable()` + `logShopPurchase()`.
- ✅ `src/screens/shop/ShopScreen.js` — boutons « Bientôt disponible » → **vrais achats** App Store + prix CAD affiché.
- ✅ `src/components/AdminFinanceTab.js` — nouvel onglet **Shop 🛒** : gains par catégorie / semaine / mois / total.
- ✅ `firestore.rules` — collection `shop_purchases` (lecture admin + écriture par l'acheteur).

---

## 2. Ce qui BLOQUE les ventes : le contrat « Apps payantes »

Tant que ce contrat n'est pas **Actif**, StoreKit ne renvoie **aucun produit** → ni abonnements ni cosmétiques ne se testent ou ne se vendent (même en Sandbox).

Pour l'activer, dans **Business → Accords** :

- [ ] **Compte bancaire** — routage `081590042`, compte `177063` (Caisse Desjardins).
- [ ] **Formulaire US — W-8BEN** : Particulier · Canada · TIN = NAS · Article **XII** / **0 %** / « Income from the sale of applications » · signature.
- [ ] **Formulaire US — Certificate of Foreign Status** : mêmes infos.
- [ ] **Formulaire Québec — FP 2506-V** : numéros **RT** (TPS) + **TQ** (TVQ) → obtenus via inscription Revenu Québec.
- [ ] **Conformité DSA (UE)** : statut commerçant + coordonnées publiques (adresse, tél, e-mail support@gamingactions.app).

### Inscription taxes (pour obtenir RT + TQ)
- Résident du Québec aujourd'hui → **Revenu Québec gère TPS + TVQ**.
- Inscription en ligne bloquée (pas de carte RAMQ) → **par téléphone : 1-800-567-4692**.
- À préparer : NAS, date de naissance, adresse, statut « travailleur autonome », activité « édition d'application mobile », date de début, revenu estimé, période de déclaration **annuelle**.
- Sous 30 000 $/an = « petit fournisseur » → inscription **facultative** fiscalement, mais **exigée par Apple** pour vendre depuis le Québec.
- ⚠️ À valider avec un comptable (s'inscrire maintenant vs attendre le déménagement en Ontario, où le régime est plus simple).

---

## 3. Séquence pour aller jusqu'à la vente

1. [ ] Activer le contrat « Apps payantes » (section 2 complète) → statut **Actif**.
2. [ ] **Re-soumettre l'abonnement Legendary** (la review actuelle risque d'être bloquée tant que le contrat n'est pas actif — c'est normal, ça se corrige).
3. [ ] **Déployer les règles Firestore** : `firebase deploy --only firestore:rules`.
4. [ ] **Nouveau build** (EAS) avec le code à jour (achats cosmétiques activés) :
   `eas build -p ios` → upload App Store Connect.
5. [ ] Attacher les **128 cosmétiques** à cette version et les soumettre.
6. [ ] **Test Sandbox** : créer un testeur Sandbox → acheter un cosmétique → vérifier :
   - l'item se débloque,
   - un doc apparaît dans `shop_purchases`,
   - la stat remonte dans **Admin → Finance → Shop**.
7. [ ] Soumettre la version + IAP pour revue → publication.

---

## 4. Scripts (dossier `iap_setup/`)

Toujours activer le venv d'abord : `source .venv/bin/activate`

- `create_iap.py` — crée les achats intégrés manquants (idempotent).
- `finalize_iap.py` — **tout-en-un** : prix CAD + disponibilité + localisation + capture. Relançable.
  - `python finalize_iap.py --no-image` → tout sauf les captures.
- `update_iap.py` — prix + disponibilité + localisation (sans image).
- `screenshot_iap.py` — captures de revue seules.
- `catalog.json` — les 130 produits (2 abonnements + 128 cosmétiques).
- `IAP_Catalog_GamingActions.xlsx` — catalogue lisible (à la racine du projet).

Identifiants : Key ID `3TGG4V5N9Z` · Issuer `83dd4669-4c02-4eb7-9dac-f681a2c95288` · Bundle `com.gamingactions.app`.
Clé `.p8` dans `Mes Projets/keys/` (jamais commitée).

---

## 5. Notes utiles
- **W-8BEN** : « resident of Canada » = résidence **fiscale** (tu vis et paies tes impôts ici), pas le statut d'immigration. 0 % de retenue US grâce à la convention Canada-USA.
- **DSA** : coordonnées publiques **modifiables** plus tard (utile au déménagement à Toronto). Numéro vérifié par code — utiliser un numéro qui reçoit SMS/appel.
- Les revenus restent **imposables au Canada** (revenu de travailleur autonome) — régime normal.
- Rien n'est déployé : tu gardes la main sur le moment du build et de la soumission.

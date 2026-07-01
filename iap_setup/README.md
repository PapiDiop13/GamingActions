# Création des 128 achats intégrés — Gaming Actions

Ce dossier crée automatiquement, dans App Store Connect, les **128 achats non-consommables**
payables en argent ($ CAD). Les **abonnements Legendary sont ignorés** (déjà créés).

## Ce que fait le script
- Crée chaque produit (type **non-consommable**), à l'état **brouillon** — rien n'est soumis.
- Fixe le **prix en CAD** (territoire de base = Canada) selon le catalogue.
- Ajoute une **localisation en-US** (nom + description) pour limiter la saisie manuelle.
- **Idempotent** : relançable sans créer de doublon (les produits déjà présents sont ignorés).

## Lancer

Ouvre le Terminal et colle :

```bash
cd "/Users/papaassanediop/Documents/Mes Projets/GamingActions/iap_setup"
python3 create_iap.py
```

Pour juste voir la liste sans rien créer :

```bash
python3 create_iap.py --dry-run
```

La clé `AuthKey_3TGG4V5N9Z.p8` est lue automatiquement depuis `Mes Projets/keys/`.

## Après exécution
- Un **résumé** s'affiche (créés / prix posés / localisés / erreurs).
- En cas de souci, les détails sont écrits dans `iap_errors.log`.
- Va dans App Store Connect → ton app → **Achats intégrés** pour vérifier.
- Chaque produit en brouillon a encore besoin (avant soumission) : capture d'écran de revue
  + éventuellement ajustement nom/description. Le prix et le type sont déjà posés.

## Identifiants utilisés
- Key ID : `3TGG4V5N9Z`
- Issuer ID : `83dd4669-4c02-4eb7-9dac-f681a2c95288`
- Bundle : `com.gamingactions.app`
- Catalogue : `catalog.json` (128 produits + 2 abonnements ignorés)

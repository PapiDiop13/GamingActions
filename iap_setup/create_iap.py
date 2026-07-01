#!/usr/bin/env python3
"""
Création automatique des achats intégrés (IAP) Gaming Actions dans App Store Connect.

- Crée les 128 produits NON-consommables payables en $ (catalogue généré depuis le code).
- Fixe le prix de chaque produit en CAD (territoire de base = Canada).
- Crée une localisation en-US (nom + description) pour réduire le travail manuel.
- Idempotent : ne recrée pas un produit déjà existant (basé sur le Product ID).
- Ne soumet RIEN à la revue : les produits restent en brouillon.

Usage :
    cd "iap_setup"
    python3 create_iap.py            # crée tout
    python3 create_iap.py --dry-run  # affiche ce qui serait fait, sans rien créer

Prérequis : la clé AuthKey_3TGG4V5N9Z.p8 doit être dans ../../keys/ (déjà le cas).
"""
import json, time, sys, os, subprocess

# ─── Auto-install des dépendances ────────────────────────────────────────────
def _ensure(pkg, imp=None):
    try:
        __import__(imp or pkg)
    except ImportError:
        print(f"Installation de {pkg}…")
        for args in (["--user", "--quiet", pkg],
                     ["--user", "--quiet", "--break-system-packages", pkg],
                     ["--quiet", "--break-system-packages", pkg]):
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install"] + args)
                return
            except subprocess.CalledProcessError:
                continue
        raise SystemExit(f"❌ Impossible d'installer {pkg}. Lance manuellement :\n"
                         f"   {sys.executable} -m pip install --break-system-packages 'pyjwt[crypto]' requests cryptography")
_ensure("pyjwt[crypto]", "jwt")
_ensure("cryptography")
_ensure("requests")
import jwt, requests

# ─── Configuration ───────────────────────────────────────────────────────────
KEY_ID    = "3TGG4V5N9Z"
ISSUER_ID = "83dd4669-4c02-4eb7-9dac-f681a2c95288"
BUNDLE_ID = "com.gamingactions.app"
TERRITORY = "CAN"            # prix en dollars canadiens
HERE      = os.path.dirname(os.path.abspath(__file__))
P8_PATH   = os.path.normpath(os.path.join(HERE, "..", "..", "keys", "AuthKey_3TGG4V5N9Z.p8"))
CATALOG   = os.path.join(HERE, "catalog.json")
BASE      = "https://api.appstoreconnect.apple.com"
DRY       = "--dry-run" in sys.argv

# ─── Auth ────────────────────────────────────────────────────────────────────
with open(P8_PATH) as f:
    PRIVATE_KEY = f.read()

def token():
    now = int(time.time())
    return jwt.encode(
        {"iss": ISSUER_ID, "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
        PRIVATE_KEY, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})

_session = requests.Session()
def H():
    return {"Authorization": "Bearer " + token(), "Content-Type": "application/json"}

def api(method, path, **kw):
    url = path if path.startswith("http") else BASE + path
    last = None
    for attempt in range(6):
        try:
            r = _session.request(method, url, headers=H(), timeout=90, **kw)
        except requests.exceptions.RequestException as e:
            last = e; time.sleep(4); continue   # timeout / réseau → on retente
        if r.status_code == 429:
            time.sleep(6); continue
        return r
    if last:
        raise last
    return r

# ─── Étapes ──────────────────────────────────────────────────────────────────
def get_app_id():
    r = api("GET", "/v1/apps", params={"filter[bundleId]": BUNDLE_ID, "limit": 200})
    r.raise_for_status()
    for a in r.json().get("data", []):
        if a["attributes"].get("bundleId") == BUNDLE_ID:
            print(f"App trouvée : {a['attributes'].get('name')} (id {a['id']})")
            return a["id"]
    raise SystemExit(f"❌ App {BUNDLE_ID} introuvable dans ce compte.")

def existing_iaps(app_id):
    """Retourne {productId: iapId} des IAP déjà créés."""
    out = {}
    url = f"/v1/apps/{app_id}/inAppPurchasesV2?limit=200"
    while url:
        r = api("GET", url); r.raise_for_status()
        d = r.json()
        for it in d.get("data", []):
            out[it["attributes"]["productId"]] = it["id"]
        url = d.get("links", {}).get("next")
    return out

def price_point_id(iap_id, price):
    """Trouve l'ID du price point CAD pour CE produit (les price points sont propres à chaque IAP)."""
    target = f"{price:.2f}"
    url = f"/v2/inAppPurchases/{iap_id}/pricePoints?filter[territory]={TERRITORY}&limit=200"
    while url:
        r = api("GET", url); r.raise_for_status()
        d = r.json()
        for pp in d.get("data", []):
            cp = pp["attributes"].get("customerPrice")
            if cp is not None and f"{float(cp):.2f}" == target:
                return pp["id"]
        url = d.get("links", {}).get("next")
    return None

def create_iap(app_id, row):
    payload = {"data": {"type": "inAppPurchases",
        "attributes": {"name": row["ref"][:64], "productId": row["product_id"],
                       "inAppPurchaseType": "NON_CONSUMABLE"},
        "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}}
    r = api("POST", "/v2/inAppPurchases", data=json.dumps(payload))
    if r.status_code not in (200, 201):
        raise RuntimeError(f"create IAP {r.status_code}: {r.text[:300]}")
    return r.json()["data"]["id"]

def set_price(iap_id, price):
    pp = price_point_id(iap_id, price)
    if not pp:
        raise RuntimeError(f"price point CAD {price} introuvable")
    tmp = "${price1}"
    payload = {"data": {"type": "inAppPurchasePriceSchedules",
        "relationships": {
            "inAppPurchase": {"data": {"type": "inAppPurchases", "id": iap_id}},
            "baseTerritory": {"data": {"type": "territories", "id": TERRITORY}},
            "manualPrices": {"data": [{"type": "inAppPurchasePrices", "id": tmp}]}}},
        "included": [{"type": "inAppPurchasePrices", "id": tmp,
            "attributes": {"startDate": None},
            "relationships": {
                "inAppPurchasePricePoint": {"data": {"type": "inAppPurchasePricePoints", "id": pp}},
                "territory": {"data": {"type": "territories", "id": TERRITORY}}}}]}
    r = api("POST", "/v1/inAppPurchasePriceSchedules", data=json.dumps(payload))
    if r.status_code not in (200, 201):
        raise RuntimeError(f"set price {r.status_code}: {r.text[:300]}")

def add_localization(iap_id, row):
    payload = {"data": {"type": "inAppPurchaseLocalizations",
        "attributes": {"locale": "en-US", "name": row["display"][:30],
                       "description": row["desc"][:45]},
        "relationships": {"inAppPurchaseV2": {"data": {"type": "inAppPurchases", "id": iap_id}}}}}
    r = api("POST", "/v1/inAppPurchaseLocalizations", data=json.dumps(payload))
    return r.status_code in (200, 201), (r.text[:200] if r.status_code not in (200,201) else "")

# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    rows = [r for r in json.load(open(CATALOG)) if r["type"] == "Non-Consumable"]
    print(f"{len(rows)} produits non-consommables à traiter (territoire {TERRITORY}).")
    if DRY:
        for r in rows: print("  ", r["product_id"], "→ CA$", r["price"])
        print("(dry-run, rien créé)"); return

    app_id = get_app_id()
    print("Lecture des produits déjà existants…")
    existing = existing_iaps(app_id)
    print(f"  {len(existing)} produit(s) déjà présents.")

    created = skipped = priced = loc_ok = errors = 0
    log = []
    for i, row in enumerate(rows, 1):
        pid = row["product_id"]
        try:
            if pid in existing:
                iap_id = existing[pid]; skipped += 1; status = "déjà existant"
            else:
                iap_id = create_iap(app_id, row); created += 1; status = "créé"
                time.sleep(0.3)
            # prix
            try:
                set_price(iap_id, row["price"]); priced += 1
            except Exception as e:
                log.append(f"PRIX {pid}: {e}")
            # localisation
            ok, err = add_localization(iap_id, row)
            if ok: loc_ok += 1
            elif "already exists" not in err.lower():
                log.append(f"LOC {pid}: {err}")
            print(f"[{i}/{len(rows)}] {pid:50} {status} · CA${row['price']}", flush=True)
        except Exception as e:
            errors += 1
            log.append(f"IAP {pid}: {e}")
            print(f"[{i}/{len(rows)}] {pid:50} ❌ {e}", flush=True)
        time.sleep(0.2)

    print("\n──────── RÉSUMÉ ────────")
    print(f"Créés      : {created}")
    print(f"Ignorés    : {skipped} (déjà existants)")
    print(f"Prix posés : {priced}")
    print(f"Localisés  : {loc_ok}")
    print(f"Erreurs    : {errors}")
    if log:
        with open(os.path.join(HERE, "iap_errors.log"), "w") as f:
            f.write("\n".join(log))
        print(f"Détails des soucis → iap_setup/iap_errors.log ({len(log)} lignes)")
    print("\nLes produits sont en brouillon dans App Store Connect (rien soumis).")

if __name__ == "__main__":
    main()

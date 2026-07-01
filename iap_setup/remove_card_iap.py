#!/usr/bin/env python3
# remove_card_iap.py — Supprime définitivement les IAP "Card Border" de l'App Store.
# Cible tous les produits dont cat == "card_border" dans catalog.json.
# Usage:
#   python3 remove_card_iap.py          → mode DRY-RUN (liste seulement, ne supprime rien)
#   python3 remove_card_iap.py --apply  → supprime réellement
import json, time, os, sys, subprocess
def _ensure(pkg, imp=None):
    try: __import__(imp or pkg)
    except ImportError:
        for args in (["--quiet","--break-system-packages",pkg],["--user","--quiet","--break-system-packages",pkg]):
            try: subprocess.check_call([sys.executable,"-m","pip","install"]+args); return
            except: continue
_ensure("pyjwt[crypto]","jwt"); _ensure("cryptography"); _ensure("requests")
import jwt, requests

KEY_ID="3TGG4V5N9Z"; ISSUER_ID="83dd4669-4c02-4eb7-9dac-f681a2c95288"; BUNDLE_ID="com.gamingactions.app"
HERE=os.path.dirname(os.path.abspath(__file__))
P8=os.path.normpath(os.path.join(HERE,"..","..","keys","AuthKey_3TGG4V5N9Z.p8"))
PRIVATE_KEY=open(P8).read()
APPLY = "--apply" in sys.argv

def tok():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER_ID,"iat":now,"exp":now+1100,"aud":"appstoreconnect-v1"},
                      PRIVATE_KEY,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})
def hdr(): return {"Authorization":f"Bearer {tok()}"}
def api_get(path,params=None):
    return requests.get("https://api.appstoreconnect.apple.com"+path,headers=hdr(),params=params)
def api_delete(path):
    return requests.delete("https://api.appstoreconnect.apple.com"+path,headers=hdr())

def app_id():
    r=api_get("/v1/apps",{"filter[bundleId]":BUNDLE_ID,"limit":200}).json()
    for a in r.get("data",[]):
        if a["attributes"].get("bundleId")==BUNDLE_ID: return a["id"]
    raise SystemExit("app introuvable")

# 1) Cible : tout IAP "card border" identifié par son product_id sur l'App Store.
#    Les card borders ont un product_id de la forme com.gamingactions.app.card_cb_*
#    (on matche directement sur l'App Store, indépendamment du catalog).
CARD_PREFIX = "com.gamingactions.app.card_"          # préfixe des card borders
def is_card(pid):
    return bool(pid) and (pid.startswith(CARD_PREFIX) or ".card_cb" in pid)

# 2) liste des IAP existants sur l'App Store, on garde ceux qui matchent
aid=app_id()
found={}  # productId -> (iap_id, state)
url=f"/v1/apps/{aid}/inAppPurchasesV2?limit=200&fields[inAppPurchases]=name,productId,state"
while url:
    r=api_get(url).json()
    for d in r.get("data",[]):
        a=d["attributes"]; pid=a.get("productId")
        if is_card(pid): found[pid]=(d["id"],a.get("state"))
    nxt=r.get("links",{}).get("next")
    url=nxt.replace("https://api.appstoreconnect.apple.com","") if nxt else None

print(f"Card borders trouvés sur l'App Store : {len(found)}")
for p in sorted(found): print("   -",p,f"(state={found[p][1]})")

if not APPLY:
    print("\n--- DRY-RUN (rien supprimé). Relance avec --apply pour supprimer. ---")
    for pid,(iid,st) in sorted(found.items()):
        print(f"   [SUPPRIMERAIT] {pid}  (state={st})")
    sys.exit(0)

# 3) suppression réelle
print("\n=== SUPPRESSION ===")
ok=0; fail=0
for pid,(iid,st) in sorted(found.items()):
    r=api_delete(f"/v2/inAppPurchases/{iid}")
    if r.status_code in (200,204):
        print(f"   ✅ supprimé {pid}"); ok+=1
    else:
        print(f"   ❌ échec {pid} (state={st}) → HTTP {r.status_code} {r.text[:180]}"); fail+=1
    time.sleep(0.3)
print(f"\nTerminé : {ok} supprimés, {fail} échecs.")
if fail:
    print("Note : un produit déjà 'Approved/live' ne peut pas être supprimé par l'API — "
          "dans ce cas retire-le de la vente manuellement dans App Store Connect (Remove from Sale).")

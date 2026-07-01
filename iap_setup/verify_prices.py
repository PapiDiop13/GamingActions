#!/usr/bin/env python3
"""
Vérifie que le prix CAD de CHAQUE produit sur App Store == prix du catalogue.
Affiche seulement les écarts (ou "TOUT MATCH" si parfait).
Usage: source .venv/bin/activate && python verify_prices.py
"""
import json, time, os, sys, subprocess
def _ensure(pkg, imp=None):
    try: __import__(imp or pkg)
    except ImportError:
        for a in (["-q","--break-system-packages",pkg],["--user","-q","--break-system-packages",pkg]):
            try: subprocess.check_call([sys.executable,"-m","pip","install"]+a); return
            except: continue
_ensure("pyjwt[crypto]","jwt"); _ensure("cryptography"); _ensure("requests")
import jwt, requests
KEY_ID="3TGG4V5N9Z"; ISSUER_ID="83dd4669-4c02-4eb7-9dac-f681a2c95288"; BUNDLE_ID="com.gamingactions.app"; TERRITORY="CAN"
HERE=os.path.dirname(os.path.abspath(__file__))
P8=os.path.normpath(os.path.join(HERE,"..","..","keys","AuthKey_3TGG4V5N9Z.p8"))
CATALOG=os.path.join(HERE,"catalog.json")
BASE="https://api.appstoreconnect.apple.com"
PRIVATE_KEY=open(P8).read()
S=requests.Session()
def tok():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER_ID,"iat":now,"exp":now+1100,"aud":"appstoreconnect-v1"},PRIVATE_KEY,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})
def api(path,params=None):
    for _ in range(6):
        r=S.get((path if path.startswith("http") else BASE+path),headers={"Authorization":"Bearer "+tok()},params=params,timeout=90)
        if r.status_code==429: time.sleep(6); continue
        return r
    return r
def app_id():
    for a in api("/v1/apps",{"filter[bundleId]":BUNDLE_ID,"limit":200}).json().get("data",[]):
        if a["attributes"]["bundleId"]==BUNDLE_ID: return a["id"]
    raise SystemExit("app introuvable")
aid=app_id()
# Map productId -> iap id
iaps={}
url=f"/v1/apps/{aid}/inAppPurchasesV2?limit=200"
while url:
    d=api(url).json()
    for it in d["data"]: iaps[it["attributes"]["productId"]]=it["id"]
    url=d.get("links",{}).get("next")

def apple_price(iap_id):
    # 1) l'ID du price schedule de ce produit
    r=api(f"/v2/inAppPurchases/{iap_id}/iapPriceSchedule")
    if r.status_code!=200: return None
    d=r.json().get("data")
    if not d: return None
    sid=d["id"]
    # 2) les prix manuels (territoire de base CAN) + leur price point
    r2=api(f"/v1/inAppPurchasePriceSchedules/{sid}/manualPrices",
           {"include":"inAppPurchasePricePoint","limit":200})
    if r2.status_code!=200: return None
    j=r2.json()
    inc={i["id"]:i for i in j.get("included",[])}
    for p in j.get("data",[]):
        pp=p.get("relationships",{}).get("inAppPurchasePricePoint",{}).get("data",{})
        if pp and pp.get("id") in inc:
            cp=inc[pp["id"]]["attributes"].get("customerPrice")
            if cp is not None: return float(cp)
    return None

cat={x["product_id"]:x for x in json.load(open(CATALOG))}
mism=[]; ok=0; missing=[]
for pid,row in cat.items():
    iid=iaps.get(pid)
    if not iid: missing.append(pid); continue
    ap=apple_price(iid)
    want=float(row["price"])
    if ap is None:
        mism.append((pid, want, "??")); continue
    if abs(ap-want)>0.001: mism.append((pid, want, ap))
    else: ok+=1
    time.sleep(0.1)
print(f"\n=== RÉSULTAT === {ok} OK / {len(cat)} produits")
if missing: print(f"⚠️ Absents d'Apple ({len(missing)}): {missing[:10]}")
if mism:
    print(f"❌ ÉCARTS DE PRIX ({len(mism)}) :")
    for pid,w,a in mism: print(f"   {pid}: catalogue CA${w:.2f} ≠ Apple CA${a}")
else:
    print("✅ TOUT MATCH — tous les prix Apple == catalogue.")

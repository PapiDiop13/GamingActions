#!/usr/bin/env python3
"""
Ajoute la DISPONIBILITÉ (toutes régions + nouveaux territoires) aux abonnements
auto-renouvelables. Sans ça, StoreKit renvoie "Product not found" même si l'abo
est APPROVED avec un prix. Idempotent.
Usage: source .venv/bin/activate && python fix_sub_availability.py
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
KEY_ID="3TGG4V5N9Z"; ISSUER_ID="83dd4669-4c02-4eb7-9dac-f681a2c95288"; BUNDLE_ID="com.gamingactions.app"
HERE=os.path.dirname(os.path.abspath(__file__))
P8=os.path.normpath(os.path.join(HERE,"..","..","keys","AuthKey_3TGG4V5N9Z.p8"))
BASE="https://api.appstoreconnect.apple.com"
PRIVATE_KEY=open(P8).read()
S=requests.Session()
def tok():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER_ID,"iat":now,"exp":now+1100,"aud":"appstoreconnect-v1"},PRIVATE_KEY,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})
def H(): return {"Authorization":"Bearer "+tok(),"Content-Type":"application/json"}
def req(method,path,**kw):
    url=path if path.startswith("http") else BASE+path
    for _ in range(6):
        r=S.request(method,url,headers=H(),timeout=90,**kw)
        if r.status_code==429: time.sleep(6); continue
        return r
    return r
def app_id():
    for a in req("GET","/v1/apps",params={"filter[bundleId]":BUNDLE_ID,"limit":200}).json().get("data",[]):
        if a["attributes"]["bundleId"]==BUNDLE_ID: return a["id"]
    raise SystemExit("app introuvable")
def all_territories():
    ids=[]; url="/v1/territories?limit=200"
    while url:
        d=req("GET",url).json()
        ids+=[t["id"] for t in d["data"]]; url=d.get("links",{}).get("next")
    return ids
aid=app_id()
groups=req("GET",f"/v1/apps/{aid}/subscriptionGroups",params={"include":"subscriptions","limit":50}).json()
subs=[i for i in groups.get("included",[]) if i["type"]=="subscriptions"]
terr=all_territories()
print(f"{len(subs)} abonnement(s), {len(terr)} territoires")
for s in subs:
    sid=s["id"]; pid=s["attributes"].get("productId")
    # déjà dispo ?
    cur=req("GET",f"/v1/subscriptions/{sid}/availability",params={"limit":1}).json()
    if cur.get("data"):
        print(f"  {pid}: déjà une disponibilité — skip")
        continue
    payload={"data":{"type":"subscriptionAvailabilities",
        "attributes":{"availableInNewTerritories":True},
        "relationships":{
            "subscription":{"data":{"type":"subscriptions","id":sid}},
            "availableTerritories":{"data":[{"type":"territories","id":t} for t in terr]},
        }}}
    r=req("POST","/v1/subscriptionAvailabilities",data=json.dumps(payload))
    if r.status_code in (200,201):
        print(f"  {pid}: ✅ disponibilité ajoutée ({len(terr)} territoires)")
    else:
        print(f"  {pid}: ❌ {r.status_code} {r.text[:200]}")
print("\nFini. Relance diag_sub.py pour confirmer, puis re-teste l'achat (après propagation).")

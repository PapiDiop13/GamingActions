#!/usr/bin/env python3
"""
Diagnostic ciblé des ABONNEMENTS auto-renouvelables :
  - état, prix (par territoire), disponibilité, localisations, capture de revue.
Révèle pourquoi StoreKit renvoie "Product not found" alors que l'état est APPROVED.
Usage: source .venv/bin/activate && python diag_sub.py
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
def tok():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER_ID,"iat":now,"exp":now+1100,"aud":"appstoreconnect-v1"},PRIVATE_KEY,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})
def api(path,params=None):
    return requests.get(path if path.startswith("http") else BASE+path,headers={"Authorization":"Bearer "+tok()},params=params)
def app_id():
    for a in api("/v1/apps",{"filter[bundleId]":BUNDLE_ID,"limit":200}).json().get("data",[]):
        if a["attributes"]["bundleId"]==BUNDLE_ID: return a["id"]
    raise SystemExit("app introuvable")
aid=app_id()
groups=api(f"/v1/apps/{aid}/subscriptionGroups",{"include":"subscriptions","limit":50}).json()
subs=[i for i in groups.get("included",[]) if i["type"]=="subscriptions"]
print(f"{len(subs)} abonnement(s)\n")
for s in subs:
    sid=s["id"]; a=s["attributes"]
    print(f"── {a.get('productId')}  [{a.get('state')}]  ({a.get('name')})")
    # Prix
    pr=api(f"/v1/subscriptions/{sid}/prices",{"include":"subscriptionPricePoint,territory","limit":200})
    pj=pr.json()
    inc={ (x['type'],x['id']):x for x in pj.get("included",[]) }
    prices=pj.get("data",[])
    print(f"   prix configurés: {len(prices)}")
    shown=0
    for p in prices:
        rels=p.get("relationships",{})
        terr=rels.get("territory",{}).get("data",{})
        pp=rels.get("subscriptionPricePoint",{}).get("data",{})
        tname=terr.get("id","?")
        amount="?"
        if pp:
            ppobj=inc.get(("subscriptionPricePoints",pp.get("id")))
            if ppobj: amount=ppobj["attributes"].get("customerPrice")
        if tname in ("CAN","USA") or shown<3:
            print(f"      {tname}: {amount}")
            shown+=1
    # Dispo
    av=api(f"/v1/subscriptions/{sid}/availability",{"include":"availableTerritories","limit":5}).json()
    if av.get("data"):
        ad=av["data"]["attributes"]
        print(f"   availableInNewTerritories: {ad.get('availableInNewTerritories')}")
        terrs=[t['id'] for t in av.get('included',[]) if t['type']=='territories']
        print(f"   territoires dispo (échantillon): {terrs[:6]}{'…' if len(terrs)>=6 else ''}  | CAN présent: {'CAN' in [t['id'] for t in av.get('included',[])]}")
    else:
        print("   ⚠️ AUCUNE disponibilité configurée (availability vide) → StoreKit ne renverra PAS le produit !")
    # Localisations
    loc=api(f"/v1/subscriptions/{sid}/subscriptionLocalizations",{"limit":10}).json()
    print(f"   localisations: {[l['attributes'].get('locale') for l in loc.get('data',[])]}")
    print()
print("Si 'prix configurés: 0' ou 'AUCUNE disponibilité' → c'est la cause. Sinon c'est la propagation sandbox.")

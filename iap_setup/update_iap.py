#!/usr/bin/env python3
"""
Complète les infos manquantes des achats intégrés déjà créés :
  - PRIX en CAD (territoire de base = Canada)
  - DISPONIBILITÉ (toutes les régions, + nouvelles régions automatiques)
  - LOCALISATION en-US (créée si absente)

Idempotent et relançable. Ne soumet rien à la revue.

Usage :
    source .venv/bin/activate   # si pas déjà actif
    python update_iap.py
    python update_iap.py --no-availability   # prix + localisation seulement
"""
import json, time, sys, os, subprocess

def _ensure(pkg, imp=None):
    try: __import__(imp or pkg)
    except ImportError:
        for a in (["--user","-q",pkg],["--user","-q","--break-system-packages",pkg],["-q","--break-system-packages",pkg]):
            try: subprocess.check_call([sys.executable,"-m","pip","install"]+a); return
            except subprocess.CalledProcessError: continue
        raise SystemExit(f"pip install {pkg} a échoué")
_ensure("pyjwt[crypto]","jwt"); _ensure("cryptography"); _ensure("requests")
import jwt, requests

KEY_ID="3TGG4V5N9Z"; ISSUER_ID="83dd4669-4c02-4eb7-9dac-f681a2c95288"
BUNDLE_ID="com.gamingactions.app"; TERRITORY="CAN"
HERE=os.path.dirname(os.path.abspath(__file__))
P8_PATH=os.path.normpath(os.path.join(HERE,"..","..","keys","AuthKey_3TGG4V5N9Z.p8"))
CATALOG=os.path.join(HERE,"catalog.json")
BASE="https://api.appstoreconnect.apple.com"
DO_AVAIL="--no-availability" not in sys.argv
PRIVATE_KEY=open(P8_PATH).read()

def token():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER_ID,"iat":now,"exp":now+1100,"aud":"appstoreconnect-v1"},
                      PRIVATE_KEY,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})
S=requests.Session()
def H(): return {"Authorization":"Bearer "+token(),"Content-Type":"application/json"}
def api(method,path,**kw):
    url=path if path.startswith("http") else BASE+path
    last=None
    for _ in range(6):
        try: r=S.request(method,url,headers=H(),timeout=90,**kw)
        except requests.exceptions.RequestException as e: last=e; time.sleep(4); continue
        if r.status_code==429: time.sleep(6); continue
        return r
    if last: raise last
    return r

def app_id():
    r=api("GET","/v1/apps",params={"filter[bundleId]":BUNDLE_ID,"limit":200}); r.raise_for_status()
    for a in r.json()["data"]:
        if a["attributes"]["bundleId"]==BUNDLE_ID: return a["id"]
    raise SystemExit("app introuvable")

def all_iaps(aid):
    out={}; url=f"/v1/apps/{aid}/inAppPurchasesV2?limit=200"
    while url:
        r=api("GET",url); r.raise_for_status(); d=r.json()
        for it in d["data"]: out[it["attributes"]["productId"]]=it["id"]
        url=d.get("links",{}).get("next")
    return out

def all_territories():
    ids=[]; url="/v1/territories?limit=200"
    while url:
        r=api("GET",url); r.raise_for_status(); d=r.json()
        ids+=[t["id"] for t in d["data"]]
        url=d.get("links",{}).get("next")
    return ids

def price_point(iap_id,price):
    # Les price points sont propres à CHAQUE produit → on les lit produit par produit.
    key=f"{price:.2f}"; found=None
    url=f"/v2/inAppPurchases/{iap_id}/pricePoints?filter[territory]={TERRITORY}&limit=200"
    while url:
        r=api("GET",url); r.raise_for_status(); d=r.json()
        for p in d["data"]:
            cp=p["attributes"].get("customerPrice")
            if cp is not None and f"{float(cp):.2f}"==key:
                return p["id"]
        url=d.get("links",{}).get("next")
    return found

def set_price(iap_id,price):
    pp=price_point(iap_id,price)
    if not pp: return False,f"price point {price} introuvable"
    tmp="${price1}"
    payload={"data":{"type":"inAppPurchasePriceSchedules",
        "relationships":{"inAppPurchase":{"data":{"type":"inAppPurchases","id":iap_id}},
            "baseTerritory":{"data":{"type":"territories","id":TERRITORY}},
            "manualPrices":{"data":[{"type":"inAppPurchasePrices","id":tmp}]}}},
        "included":[{"type":"inAppPurchasePrices","id":tmp,"attributes":{"startDate":None},
            "relationships":{"inAppPurchasePricePoint":{"data":{"type":"inAppPurchasePricePoints","id":pp}},
                "territory":{"data":{"type":"territories","id":TERRITORY}}}}]}
    r=api("POST","/v1/inAppPurchasePriceSchedules",data=json.dumps(payload))
    return (r.status_code in (200,201)), ("" if r.status_code in (200,201) else f"{r.status_code}:{r.text[:160]}")

def set_availability(iap_id,terr_ids):
    payload={"data":{"type":"inAppPurchaseAvailabilities",
        "attributes":{"availableInNewTerritories":True},
        "relationships":{"inAppPurchase":{"data":{"type":"inAppPurchases","id":iap_id}},
            "availableTerritories":{"data":[{"type":"territories","id":t} for t in terr_ids]}}}}
    r=api("POST","/v1/inAppPurchaseAvailabilities",data=json.dumps(payload))
    if r.status_code in (200,201): return True,""
    if "already" in r.text.lower() or r.status_code==409: return True,"déjà configuré"
    return False,f"{r.status_code}:{r.text[:160]}"

def ensure_loc(iap_id,row):
    payload={"data":{"type":"inAppPurchaseLocalizations",
        "attributes":{"locale":"en-US","name":row["display"][:30],"description":row["desc"][:45]},
        "relationships":{"inAppPurchaseV2":{"data":{"type":"inAppPurchases","id":iap_id}}}}}
    r=api("POST","/v1/inAppPurchaseLocalizations",data=json.dumps(payload))
    return r.status_code in (200,201) or "duplicate" in r.text.lower()

def main():
    rows=[r for r in json.load(open(CATALOG)) if r["type"]=="Non-Consumable"]
    aid=app_id(); print("app",aid)
    iaps=all_iaps(aid); print(f"{len(iaps)} IAP trouvés dans App Store Connect")
    terr=all_territories() if DO_AVAIL else []
    if DO_AVAIL: print(f"{len(terr)} territoires (disponibilité = toutes régions)")
    priced=avail=loc=miss=err=0; log=[]
    for i,row in enumerate(rows,1):
        pid=row["product_id"]; iid=iaps.get(pid)
        if not iid:
            miss+=1; log.append(f"ABSENT {pid}"); print(f"[{i}/{len(rows)}] {pid:48} ⚠️ absent",flush=True); continue
        ok,e=set_price(iid,row["price"])
        if ok: priced+=1
        else: log.append(f"PRIX {pid}: {e}")
        if DO_AVAIL:
            ok2,e2=set_availability(iid,terr)
            if ok2: avail+=1
            else: log.append(f"DISPO {pid}: {e2}")
        if ensure_loc(iid,row): loc+=1
        tag="✅" if ok else "❌ prix"
        print(f"[{i}/{len(rows)}] {pid:48} {tag} CA${row['price']}",flush=True)
        time.sleep(0.15)
    print("\n──────── RÉSUMÉ ────────")
    print(f"Prix posés    : {priced}/{len(rows)}")
    if DO_AVAIL: print(f"Disponibilité : {avail}/{len(rows)}")
    print(f"Localisés     : {loc}/{len(rows)}")
    print(f"Absents       : {miss}")
    if log:
        open(os.path.join(HERE,"update_errors.log"),"w").write("\n".join(log))
        print(f"Soucis → iap_setup/update_errors.log ({len(log)} lignes)")
    else:
        print("Aucune erreur 🎉")

if __name__=="__main__":
    main()

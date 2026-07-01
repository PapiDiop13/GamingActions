#!/usr/bin/env python3
"""
Met à jour UNIQUEMENT le prix CAD de chaque achat intégré déjà créé,
d'après iap_setup/catalog.json (nouveaux prix bas).

Idempotent. Ne touche ni au type, ni aux régions, ni aux captures.

Usage :
    source .venv/bin/activate
    python reprice_iap.py
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

def price_point(iap_id, price):
    target=f"{price:.2f}"
    url=f"/v2/inAppPurchases/{iap_id}/pricePoints?filter[territory]={TERRITORY}&limit=200"
    while url:
        r=api("GET",url); r.raise_for_status(); d=r.json()
        for p in d["data"]:
            cp=p["attributes"].get("customerPrice")
            if cp is not None and f"{float(cp):.2f}"==target: return p["id"]
        url=d.get("links",{}).get("next")
    return None

def set_price(iap_id, price):
    pp=price_point(iap_id, price)
    if not pp: return False, f"price point {price} introuvable"
    tmp="${price1}"
    payload={"data":{"type":"inAppPurchasePriceSchedules",
        "relationships":{"inAppPurchase":{"data":{"type":"inAppPurchases","id":iap_id}},
            "baseTerritory":{"data":{"type":"territories","id":TERRITORY}},
            "manualPrices":{"data":[{"type":"inAppPurchasePrices","id":tmp}]}}},
        "included":[{"type":"inAppPurchasePrices","id":tmp,"attributes":{"startDate":None},
            "relationships":{"inAppPurchasePricePoint":{"data":{"type":"inAppPurchasePricePoints","id":pp}},
                "territory":{"data":{"type":"territories","id":TERRITORY}}}}]}
    r=api("POST","/v1/inAppPurchasePriceSchedules",data=json.dumps(payload))
    return (r.status_code in (200,201)), ("" if r.status_code in (200,201) else f"{r.status_code}:{r.text[:140]}")

def main():
    rows=[r for r in json.load(open(CATALOG)) if r["type"]=="Non-Consumable"]
    aid=app_id(); iaps=all_iaps(aid)
    print(f"{len(rows)} produits · {len(iaps)} IAP en ligne")
    ok=miss=err=0; log=[]
    for i,row in enumerate(rows,1):
        pid=row["product_id"]; iid=iaps.get(pid)
        if not iid: miss+=1; print(f"[{i}/{len(rows)}] {pid:46} ⚠️ absent",flush=True); continue
        good,e=set_price(iid,row["price"])
        if good: ok+=1; print(f"[{i}/{len(rows)}] {pid:46} ✅ CA${row['price']}",flush=True)
        else: err+=1; log.append(f"{pid}: {e}"); print(f"[{i}/{len(rows)}] {pid:46} ❌ {e}",flush=True)
        time.sleep(0.15)
    print(f"\n──── RÉSUMÉ ────\nPrix mis à jour : {ok}/{len(rows)}\nAbsents : {miss}\nErreurs : {err}")
    if log: open(os.path.join(HERE,"reprice_errors.log"),"w").write("\n".join(log)); print("→ reprice_errors.log")
    else: print("Tous les prix à jour 🎉")

if __name__=="__main__":
    main()

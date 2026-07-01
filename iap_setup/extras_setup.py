#!/usr/bin/env python3
"""
Crée et complète les produits CONSOMMABLES (Fanbase Pass + Support the App).
Pour chaque produit du catalog_extra.json :
  1. CRÉE l'achat intégré (type CONSUMABLE) s'il n'existe pas
  2. PRIX CAD (territoire de base = Canada)
  3. DISPONIBILITÉ (toutes régions)
  4. LOCALISATION en-US
  5. CAPTURE d'écran de revue (générée)

Idempotent. Ne soumet rien.

Usage :
    source .venv/bin/activate
    python extras_setup.py
"""
import json, time, sys, os, subprocess, hashlib, io

def _ensure(pkg, imp=None):
    try: __import__(imp or pkg)
    except ImportError:
        for a in (["--user","-q",pkg],["--user","-q","--break-system-packages",pkg],["-q","--break-system-packages",pkg]):
            try: subprocess.check_call([sys.executable,"-m","pip","install"]+a); return
            except subprocess.CalledProcessError: continue
        raise SystemExit(f"pip install {pkg} a échoué")
_ensure("pyjwt[crypto]","jwt"); _ensure("cryptography"); _ensure("requests"); _ensure("Pillow","PIL")
import jwt, requests
from PIL import Image, ImageDraw, ImageFont

KEY_ID="3TGG4V5N9Z"; ISSUER_ID="83dd4669-4c02-4eb7-9dac-f681a2c95288"
BUNDLE_ID="com.gamingactions.app"; TERRITORY="CAN"
HERE=os.path.dirname(os.path.abspath(__file__))
P8_PATH=os.path.normpath(os.path.join(HERE,"..","..","keys","AuthKey_3TGG4V5N9Z.p8"))
CATALOG=os.path.join(HERE,"catalog_extra.json")
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

def all_territories():
    ids=[]; url="/v1/territories?limit=200"
    while url:
        r=api("GET",url); r.raise_for_status(); d=r.json()
        ids+=[t["id"] for t in d["data"]]; url=d.get("links",{}).get("next")
    return ids

def create_iap(aid,row):
    payload={"data":{"type":"inAppPurchases",
        "attributes":{"name":row["ref"][:64],"productId":row["product_id"],"inAppPurchaseType":"CONSUMABLE"},
        "relationships":{"app":{"data":{"type":"apps","id":aid}}}}}
    r=api("POST","/v2/inAppPurchases",data=json.dumps(payload))
    if r.status_code not in (200,201): raise RuntimeError(f"create {r.status_code}:{r.text[:160]}")
    return r.json()["data"]["id"]

def price_point(iap_id,price):
    target=f"{price:.2f}"
    url=f"/v2/inAppPurchases/{iap_id}/pricePoints?filter[territory]={TERRITORY}&limit=200"
    while url:
        r=api("GET",url); r.raise_for_status(); d=r.json()
        for p in d["data"]:
            cp=p["attributes"].get("customerPrice")
            if cp is not None and f"{float(cp):.2f}"==target: return p["id"]
        url=d.get("links",{}).get("next")
    return None

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
    return (r.status_code in (200,201)),("" if r.status_code in (200,201) else f"{r.status_code}:{r.text[:140]}")

def set_availability(iap_id,terr):
    payload={"data":{"type":"inAppPurchaseAvailabilities","attributes":{"availableInNewTerritories":True},
        "relationships":{"inAppPurchase":{"data":{"type":"inAppPurchases","id":iap_id}},
            "availableTerritories":{"data":[{"type":"territories","id":t} for t in terr]}}}}
    r=api("POST","/v1/inAppPurchaseAvailabilities",data=json.dumps(payload))
    return r.status_code in (200,201) or r.status_code==409

def ensure_loc(iap_id,row):
    payload={"data":{"type":"inAppPurchaseLocalizations",
        "attributes":{"locale":"en-US","name":row["display"][:30],"description":row["desc"][:45]},
        "relationships":{"inAppPurchaseV2":{"data":{"type":"inAppPurchases","id":iap_id}}}}}
    r=api("POST","/v1/inAppPurchaseLocalizations",data=json.dumps(payload))
    return r.status_code in (200,201) or "duplicate" in r.text.lower()

def _font(sz):
    for p in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf","/Library/Fonts/Arial.ttf","/System/Library/Fonts/SFNS.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p,sz)
            except Exception: pass
    return ImageFont.load_default()

def make_png(title,sub):
    W,Hh=1242,2208; img=Image.new("RGB",(W,Hh),(10,10,22)); d=ImageDraw.Draw(img)
    d.rectangle([0,0,W,420],fill=(18,18,38))
    def c(t,y,f,col):
        w=d.textlength(t,font=f); d.text(((W-w)/2,y),t,font=f,fill=col)
    c("GAMING ACTIONS",150,_font(58),(255,210,90))
    c(sub,250,_font(44),(180,180,200))
    d.rounded_rectangle([171,820,W-171,1388],40,fill=(28,28,54),outline=(255,210,90),width=4)
    c(title[:24],1040,_font(80),(255,255,255))
    c("Achat in-app",1700,_font(44),(150,150,170))
    b=io.BytesIO(); img.save(b,format="PNG"); return b.getvalue()

def has_shot(iap_id):
    r=api("GET",f"/v2/inAppPurchases/{iap_id}/appStoreReviewScreenshot")
    return r.status_code==200 and bool(r.json().get("data"))

def upload_shot(iap_id,png):
    payload={"data":{"type":"inAppPurchaseAppStoreReviewScreenshots",
        "attributes":{"fileName":"review.png","fileSize":len(png)},
        "relationships":{"inAppPurchaseV2":{"data":{"type":"inAppPurchases","id":iap_id}}}}}
    r=api("POST","/v1/inAppPurchaseAppStoreReviewScreenshots",data=json.dumps(payload))
    if r.status_code not in (200,201): return False
    data=r.json()["data"]; sid=data["id"]
    for op in (data["attributes"].get("uploadOperations") or []):
        hdrs={h["name"]:h["value"] for h in (op.get("requestHeaders") or [])}
        up=S.request(op["method"],op["url"],headers=hdrs,data=png[op["offset"]:op["offset"]+op["length"]],timeout=120)
        if up.status_code not in (200,201): return False
    patch={"data":{"type":"inAppPurchaseAppStoreReviewScreenshots","id":sid,
        "attributes":{"uploaded":True,"sourceFileChecksum":hashlib.md5(png).hexdigest()}}}
    r=api("PATCH",f"/v1/inAppPurchaseAppStoreReviewScreenshots/{sid}",data=json.dumps(patch))
    return r.status_code in (200,201)

def main():
    rows=json.load(open(CATALOG))
    aid=app_id(); print("app",aid,"·",len(rows),"produits consommables")
    iaps=all_iaps(aid); terr=all_territories()
    log=[]
    for i,row in enumerate(rows,1):
        pid=row["product_id"]
        try:
            iid=iaps.get(pid)
            if not iid: iid=create_iap(aid,row); time.sleep(0.3); st="créé"
            else: st="existant"
            okp,ep=set_price(iid,row["price"]);  log.append(None if okp else f"PRIX {pid}:{ep}")
            set_availability(iid,terr); ensure_loc(iid,row)
            shot = "img⏭️" if has_shot(iid) else ("img✅" if upload_shot(iid,make_png(row["display"],row["cat"].title())) else "img❌")
            print(f"[{i}/{len(rows)}] {pid:42} {st} · CA${row['price']} {'✅prix' if okp else '❌prix'} {shot}",flush=True)
        except Exception as e:
            log.append(f"{pid}:{e}"); print(f"[{i}/{len(rows)}] {pid:42} ❌ {e}",flush=True)
        time.sleep(0.2)
    errs=[x for x in log if x]
    print("\n──────── RÉSUMÉ ────────")
    print(f"{len(rows)} produits traités · {len(errs)} erreur(s)")
    if errs:
        open(os.path.join(HERE,"extras_errors.log"),"w").write("\n".join(errs)); print("→ extras_errors.log")
    else:
        print("Tout est complet 🎉")

if __name__=="__main__":
    main()

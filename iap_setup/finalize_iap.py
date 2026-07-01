#!/usr/bin/env python3
"""
TOUT-EN-UN : complète tout ce qui manque sur les 128 achats intégrés, en une passe.
Pour chaque produit :
  1. PRIX en CAD (territoire de base = Canada)
  2. DISPONIBILITÉ (toutes les régions + nouvelles régions automatiques)
  3. LOCALISATION en-US (nom + description)
  4. CAPTURE D'ÉCRAN de revue (image 1242x2208 générée avec le nom du produit)

Idempotent et relançable. Ne soumet RIEN à la revue (tout reste en brouillon).

Usage :
    source .venv/bin/activate
    python finalize_iap.py
    python finalize_iap.py --no-image    # tout sauf la capture
"""
import json, time, sys, os, subprocess, hashlib, io

def _ensure(pkg, imp=None):
    try: __import__(imp or pkg)
    except ImportError:
        for a in (["--user","-q",pkg],["--user","-q","--break-system-packages",pkg],["-q","--break-system-packages",pkg]):
            try: subprocess.check_call([sys.executable,"-m","pip","install"]+a); return
            except subprocess.CalledProcessError: continue
        raise SystemExit(f"pip install {pkg} a échoué")
_ensure("pyjwt[crypto]","jwt"); _ensure("cryptography"); _ensure("requests")
DO_IMAGE = "--no-image" not in sys.argv
if DO_IMAGE: _ensure("Pillow","PIL")
import jwt, requests
if DO_IMAGE: from PIL import Image, ImageDraw, ImageFont

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

def all_territories():
    ids=[]; url="/v1/territories?limit=200"
    while url:
        r=api("GET",url); r.raise_for_status(); d=r.json()
        ids+=[t["id"] for t in d["data"]]; url=d.get("links",{}).get("next")
    return ids

# ── 1. PRIX ──────────────────────────────────────────────────────────────────
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
    return (r.status_code in (200,201)), ("" if r.status_code in (200,201) else f"{r.status_code}:{r.text[:140]}")

# ── 2. DISPONIBILITÉ ─────────────────────────────────────────────────────────
def set_availability(iap_id,terr_ids):
    payload={"data":{"type":"inAppPurchaseAvailabilities",
        "attributes":{"availableInNewTerritories":True},
        "relationships":{"inAppPurchase":{"data":{"type":"inAppPurchases","id":iap_id}},
            "availableTerritories":{"data":[{"type":"territories","id":t} for t in terr_ids]}}}}
    r=api("POST","/v1/inAppPurchaseAvailabilities",data=json.dumps(payload))
    if r.status_code in (200,201): return True,""
    if r.status_code==409 or "already" in r.text.lower(): return True,"déjà"
    return False,f"{r.status_code}:{r.text[:140]}"

# ── 3. LOCALISATION ──────────────────────────────────────────────────────────
def ensure_loc(iap_id,row):
    payload={"data":{"type":"inAppPurchaseLocalizations",
        "attributes":{"locale":"en-US","name":row["display"][:30],"description":row["desc"][:45]},
        "relationships":{"inAppPurchaseV2":{"data":{"type":"inAppPurchases","id":iap_id}}}}}
    r=api("POST","/v1/inAppPurchaseLocalizations",data=json.dumps(payload))
    return r.status_code in (200,201) or "duplicate" in r.text.lower()

# ── 4. CAPTURE D'ÉCRAN ───────────────────────────────────────────────────────
def _font(size):
    for p in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/Library/Fonts/Arial.ttf","/System/Library/Fonts/SFNS.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p,size)
            except Exception: pass
    return ImageFont.load_default()

def make_png(title, subtitle):
    W,H=1242,2208
    img=Image.new("RGB",(W,H),(10,10,22)); d=ImageDraw.Draw(img)
    d.rectangle([0,0,W,420],fill=(18,18,38))
    big=_font(92); med=_font(58); small=_font(44)
    def center(t,y,f,c):
        w=d.textlength(t,font=f); d.text(((W-w)/2,y),t,font=f,fill=c)
    center("GAMING ACTIONS",150,med,(255,210,90))
    center("Shop - Cosmetic Item",250,small,(180,180,200))
    d.rounded_rectangle([171,820,W-171,1388],40,fill=(28,28,54),outline=(255,210,90),width=4)
    center(title[:24],1000,big,(255,255,255))
    center(subtitle,1180,med,(150,160,255))
    center("Apercu de l'article - boutique in-app",1700,small,(150,150,170))
    buf=io.BytesIO(); img.save(buf,format="PNG"); return buf.getvalue()

def has_screenshot(iap_id):
    r=api("GET",f"/v2/inAppPurchases/{iap_id}/appStoreReviewScreenshot")
    return r.status_code==200 and bool(r.json().get("data"))

def upload_screenshot(iap_id,png,fname):
    payload={"data":{"type":"inAppPurchaseAppStoreReviewScreenshots",
        "attributes":{"fileName":fname,"fileSize":len(png)},
        "relationships":{"inAppPurchaseV2":{"data":{"type":"inAppPurchases","id":iap_id}}}}}
    r=api("POST","/v1/inAppPurchaseAppStoreReviewScreenshots",data=json.dumps(payload))
    if r.status_code not in (200,201): return False,f"reserve {r.status_code}"
    data=r.json()["data"]; sid=data["id"]
    for op in (data["attributes"].get("uploadOperations") or []):
        hdrs={h["name"]:h["value"] for h in (op.get("requestHeaders") or [])}
        chunk=png[op["offset"]:op["offset"]+op["length"]]
        up=S.request(op["method"],op["url"],headers=hdrs,data=chunk,timeout=120)
        if up.status_code not in (200,201): return False,f"put {up.status_code}"
    md5=hashlib.md5(png).hexdigest()
    patch={"data":{"type":"inAppPurchaseAppStoreReviewScreenshots","id":sid,
        "attributes":{"uploaded":True,"sourceFileChecksum":md5}}}
    r=api("PATCH",f"/v1/inAppPurchaseAppStoreReviewScreenshots/{sid}",data=json.dumps(patch))
    return (r.status_code in (200,201)), ("" if r.status_code in (200,201) else f"commit {r.status_code}")

# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    rows=[r for r in json.load(open(CATALOG)) if r["type"]=="Non-Consumable"]
    aid=app_id(); print("app",aid)
    iaps=all_iaps(aid); print(f"{len(iaps)} IAP trouvés sur {len(rows)} attendus")
    terr=all_territories(); print(f"{len(terr)} territoires (disponibilité = toutes régions)")
    if DO_IMAGE: print("Captures d'écran : ACTIVÉES")
    c={"price":0,"avail":0,"loc":0,"img":0,"imgskip":0,"miss":0}; log=[]
    for i,row in enumerate(rows,1):
        pid=row["product_id"]; iid=iaps.get(pid)
        if not iid:
            c["miss"]+=1; log.append(f"ABSENT {pid}"); print(f"[{i}/{len(rows)}] {pid:46} ⚠️ absent",flush=True); continue
        ok,e=set_price(iid,row["price"]);  c["price"]+= ok
        if not ok: log.append(f"PRIX {pid}: {e}")
        ok2,e2=set_availability(iid,terr); c["avail"]+= ok2
        if not ok2: log.append(f"DISPO {pid}: {e2}")
        if ensure_loc(iid,row): c["loc"]+=1
        img_tag=""
        if DO_IMAGE:
            try:
                if has_screenshot(iid): c["imgskip"]+=1; img_tag="img⏭️"
                else:
                    oki,ei=upload_screenshot(iid,make_png(row["display"],row["cat"].replace('_',' ').title()),"review.png")
                    if oki: c["img"]+=1; img_tag="img✅"
                    else: log.append(f"IMG {pid}: {ei}"); img_tag="img❌"
            except Exception as ex:
                log.append(f"IMG {pid}: {ex}"); img_tag="img❌"
        print(f"[{i}/{len(rows)}] {pid:46} {'✅' if ok else '❌'}prix CA${row['price']} {img_tag}",flush=True)
        time.sleep(0.15)
    print("\n──────── RÉSUMÉ ────────")
    print(f"Prix posés     : {c['price']}/{len(rows)}")
    print(f"Disponibilité  : {c['avail']}/{len(rows)}")
    print(f"Localisés      : {c['loc']}/{len(rows)}")
    if DO_IMAGE: print(f"Captures       : {c['img']} uploadées, {c['imgskip']} déjà présentes")
    print(f"Absents        : {c['miss']}")
    if log:
        open(os.path.join(HERE,"finalize_errors.log"),"w").write("\n".join(log))
        print(f"Soucis → iap_setup/finalize_errors.log ({len(log)} lignes)")
    else:
        print("Tout est complet 🎉 — produits prêts à finaliser/soumettre.")

if __name__=="__main__":
    main()

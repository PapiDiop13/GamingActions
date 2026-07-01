#!/usr/bin/env python3
"""
Uploade la CAPTURE D'ÉCRAN DE REVUE (obligatoire) sur chaque achat intégré.
Génère une image 1242x2208 personnalisée (nom du produit) et l'envoie via l'API.

Idempotent : saute les produits qui ont déjà une capture.
Ne soumet rien à la revue.

Usage :
    source .venv/bin/activate
    python screenshot_iap.py
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
BUNDLE_ID="com.gamingactions.app"
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
def H(extra=None):
    h={"Authorization":"Bearer "+token(),"Content-Type":"application/json"}
    if extra: h.update(extra)
    return h
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

def _font(size):
    for p in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/System/Library/Fonts/SFNS.ttf","/Library/Fonts/Arial.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p,size)
            except Exception: pass
    return ImageFont.load_default()

def make_png(title, subtitle):
    W,H=1242,2208
    img=Image.new("RGB",(W,H),(10,10,22))
    d=ImageDraw.Draw(img)
    d.rectangle([0,0,W,420],fill=(18,18,38))
    big=_font(96); med=_font(60); small=_font(46)
    def center(text,y,font,fill):
        w=d.textlength(text,font=font); d.text(((W-w)/2,y),text,font=font,fill=fill)
    center("GAMING ACTIONS",150,med,(255,210,90))
    center("Shop — Cosmetic Item",250,small,(180,180,200))
    # carte centrale
    d.rounded_rectangle([171,820,W-171,1388],40,fill=(28,28,54),outline=(255,210,90),width=4)
    center(title[:24],1000,big,(255,255,255))
    center(subtitle,1180,med,(150,160,255))
    center("Aperçu de l'article — boutique in-app",1700,small,(150,150,170))
    buf=io.BytesIO(); img.save(buf,format="PNG"); return buf.getvalue()

def has_screenshot(iap_id):
    r=api("GET",f"/v2/inAppPurchases/{iap_id}/appStoreReviewScreenshot")
    if r.status_code!=200: return False
    return bool(r.json().get("data"))

def upload_screenshot(iap_id, png, fname):
    # 1) réservation
    payload={"data":{"type":"inAppPurchaseAppStoreReviewScreenshots",
        "attributes":{"fileName":fname,"fileSize":len(png)},
        "relationships":{"inAppPurchaseV2":{"data":{"type":"inAppPurchases","id":iap_id}}}}}
    r=api("POST","/v1/inAppPurchaseAppStoreReviewScreenshots",data=json.dumps(payload))
    if r.status_code not in (200,201): return False,f"reserve {r.status_code}:{r.text[:160]}"
    data=r.json()["data"]; sid=data["id"]
    ops=data["attributes"].get("uploadOperations") or []
    # 2) upload binaire
    for op in ops:
        hdrs={h["name"]:h["value"] for h in (op.get("requestHeaders") or [])}
        chunk=png[op["offset"]:op["offset"]+op["length"]]
        up=S.request(op["method"],op["url"],headers=hdrs,data=chunk,timeout=120)
        if up.status_code not in (200,201): return False,f"put {up.status_code}"
    # 3) commit
    md5=hashlib.md5(png).hexdigest()
    patch={"data":{"type":"inAppPurchaseAppStoreReviewScreenshots","id":sid,
        "attributes":{"uploaded":True,"sourceFileChecksum":md5}}}
    r=api("PATCH",f"/v1/inAppPurchaseAppStoreReviewScreenshots/{sid}",data=json.dumps(patch))
    if r.status_code not in (200,201): return False,f"commit {r.status_code}:{r.text[:160]}"
    return True,""

def main():
    rows=[r for r in json.load(open(CATALOG)) if r["type"]=="Non-Consumable"]
    aid=app_id(); print("app",aid)
    iaps=all_iaps(aid); print(f"{len(iaps)} IAP trouvés")
    done=skip=miss=err=0; log=[]
    for i,row in enumerate(rows,1):
        pid=row["product_id"]; iid=iaps.get(pid)
        if not iid: miss+=1; print(f"[{i}/{len(rows)}] {pid:46} ⚠️ absent",flush=True); continue
        try:
            if has_screenshot(iid):
                skip+=1; print(f"[{i}/{len(rows)}] {pid:46} ⏭️ déjà une capture",flush=True); continue
            png=make_png(row["display"], row["cat"].replace("_"," ").title())
            ok,e=upload_screenshot(iid,png,"review.png")
            if ok: done+=1; print(f"[{i}/{len(rows)}] {pid:46} ✅ capture uploadée",flush=True)
            else: err+=1; log.append(f"{pid}: {e}"); print(f"[{i}/{len(rows)}] {pid:46} ❌ {e}",flush=True)
        except Exception as ex:
            err+=1; log.append(f"{pid}: {ex}"); print(f"[{i}/{len(rows)}] {pid:46} ❌ {ex}",flush=True)
        time.sleep(0.2)
    print("\n──────── RÉSUMÉ ────────")
    print(f"Uploadées : {done}")
    print(f"Déjà OK   : {skip}")
    print(f"Absents   : {miss}")
    print(f"Erreurs   : {err}")
    if log:
        open(os.path.join(HERE,"screenshot_errors.log"),"w").write("\n".join(log))
        print(f"Soucis → iap_setup/screenshot_errors.log")
    else:
        print("Tout est bon 🎉 — produits prêts à finaliser/soumettre.")

if __name__=="__main__":
    main()

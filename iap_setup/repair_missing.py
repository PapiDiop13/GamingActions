#!/usr/bin/env python3
"""
Répare les IAP bloqués en MISSING_METADATA alors que prix/dispo/loc semblent OK.
Cause habituelle : capture de revue réservée mais jamais validée (uploaded=false),
ou localisation incomplète.

1. Inspecte chaque produit ciblé (état IAP, localisations, état réel de la capture).
2. Supprime toute capture non "COMPLETE" et en ré-uploade une propre.
3. (Re)crée la localisation en-US si absente.

Usage :
    source .venv/bin/activate
    python repair_missing.py            # répare les 4 détectés
    python repair_missing.py --all-missing   # répare TOUS ceux en MISSING_METADATA
"""
import json, time, sys, os, subprocess, hashlib, io
def _ensure(pkg, imp=None):
    try: __import__(imp or pkg)
    except ImportError:
        for a in (["-q","--break-system-packages",pkg],["--user","-q","--break-system-packages",pkg]):
            try: subprocess.check_call([sys.executable,"-m","pip","install"]+a); return
            except subprocess.CalledProcessError: continue
_ensure("pyjwt[crypto]","jwt"); _ensure("cryptography"); _ensure("requests"); _ensure("Pillow","PIL")
import jwt, requests
from PIL import Image, ImageDraw, ImageFont

KEY_ID="3TGG4V5N9Z"; ISSUER_ID="83dd4669-4c02-4eb7-9dac-f681a2c95288"
BUNDLE_ID="com.gamingactions.app"; TERRITORY="CAN"
HERE=os.path.dirname(os.path.abspath(__file__))
P8=os.path.normpath(os.path.join(HERE,"..","..","keys","AuthKey_3TGG4V5N9Z.p8"))
CATALOG=os.path.join(HERE,"catalog.json")
BASE="https://api.appstoreconnect.apple.com"
PRIVATE_KEY=open(P8).read()
S=requests.Session()
def token():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER_ID,"iat":now,"exp":now+1100,"aud":"appstoreconnect-v1"},
                      PRIVATE_KEY,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})
def H(): return {"Authorization":"Bearer "+token(),"Content-Type":"application/json"}
def api(method,path,**kw):
    url=path if path.startswith("http") else BASE+path
    for _ in range(6):
        r=S.request(method,url,headers=H(),timeout=90,**kw)
        if r.status_code==429: time.sleep(6); continue
        return r
    return r

def app_id():
    r=api("GET","/v1/apps",params={"filter[bundleId]":BUNDLE_ID,"limit":200}); r.raise_for_status()
    for a in r.json()["data"]:
        if a["attributes"]["bundleId"]==BUNDLE_ID: return a["id"]
    raise SystemExit("app introuvable")

def all_iaps(aid):
    out={}; url=f"/v1/apps/{aid}/inAppPurchasesV2?limit=200&fields[inAppPurchases]=name,productId,state"
    while url:
        r=api("GET",url); r.raise_for_status(); d=r.json()
        for it in d["data"]: out[it["attributes"]["productId"]]={"id":it["id"],"state":it["attributes"]["state"],"name":it["attributes"].get("name")}
        url=d.get("links",{}).get("next")
    return out

def _font(size):
    for p in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf","/Library/Fonts/Arial.ttf","/System/Library/Fonts/SFNS.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p,size)
            except Exception: pass
    return ImageFont.load_default()
def make_png(title, subtitle):
    W,H=1242,2208
    img=Image.new("RGB",(W,H),(10,10,22)); d=ImageDraw.Draw(img)
    d.rectangle([0,0,W,420],fill=(18,18,38))
    med=_font(58); small=_font(44); big=_font(92)
    def center(t,y,f,c):
        w=d.textlength(t,font=f); d.text(((W-w)/2,y),t,font=f,fill=c)
    center("GAMING ACTIONS",150,med,(255,210,90))
    center("Shop - Cosmetic Item",250,small,(180,180,200))
    d.rounded_rectangle([171,820,W-171,1388],40,fill=(28,28,54),outline=(255,210,90),width=4)
    center(title[:24],1000,big,(255,255,255))
    center(subtitle,1180,med,(150,160,255))
    center("Apercu de l'article - boutique in-app",1700,small,(150,150,170))
    buf=io.BytesIO(); img.save(buf,format="PNG"); return buf.getvalue()

def get_localizations(iid):
    r=api("GET",f"/v1/inAppPurchases/{iid}/inAppPurchaseLocalizations?limit=50")
    return r.json().get("data",[]) if r.status_code==200 else []
def ensure_loc(iid,row):
    locs=get_localizations(iid)
    for l in locs:
        a=l["attributes"]
        if a.get("locale")=="en-US" and a.get("name") and a.get("state")!="MISSING_METADATA":
            return "ok"
    payload={"data":{"type":"inAppPurchaseLocalizations",
        "attributes":{"locale":"en-US","name":row["display"][:30],"description":(row.get("desc") or row["display"])[:45]},
        "relationships":{"inAppPurchaseV2":{"data":{"type":"inAppPurchases","id":iid}}}}}
    r=api("POST","/v1/inAppPurchaseLocalizations",data=json.dumps(payload))
    return "created" if r.status_code in (200,201) else f"loc_err {r.status_code}:{r.text[:120]}"

def get_screenshot(iid):
    r=api("GET",f"/v2/inAppPurchases/{iid}/appStoreReviewScreenshot")
    if r.status_code!=200: return None
    return r.json().get("data")
def delete_screenshot(sid):
    return api("DELETE",f"/v1/inAppPurchaseAppStoreReviewScreenshots/{sid}").status_code in (200,204)
def upload_screenshot(iid,png,fname="review.png"):
    payload={"data":{"type":"inAppPurchaseAppStoreReviewScreenshots",
        "attributes":{"fileName":fname,"fileSize":len(png)},
        "relationships":{"inAppPurchaseV2":{"data":{"type":"inAppPurchases","id":iid}}}}}
    r=api("POST","/v1/inAppPurchaseAppStoreReviewScreenshots",data=json.dumps(payload))
    if r.status_code not in (200,201): return False,f"reserve {r.status_code}:{r.text[:120]}"
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
    return (r.status_code in (200,201)), ("ok" if r.status_code in (200,201) else f"commit {r.status_code}:{r.text[:120]}")

def main():
    rows={r["product_id"]:r for r in json.load(open(CATALOG))}
    aid=app_id(); iaps=all_iaps(aid)
    if "--all-missing" in sys.argv:
        targets=[pid for pid,v in iaps.items() if v["state"]=="MISSING_METADATA"]
    else:
        targets=[pid for pid,v in iaps.items() if v["state"]=="MISSING_METADATA"]
    print(f"À réparer : {len(targets)} produit(s) MISSING_METADATA\n")
    for pid in targets:
        info=iaps[pid]; iid=info["id"]; row=rows.get(pid)
        print(f"── {pid}  (state={info['state']})")
        # localisations
        locs=get_localizations(iid)
        for l in locs:
            a=l["attributes"]; print(f"   loc {a.get('locale')}: name={a.get('name')!r} state={a.get('state')}")
        if row:
            print("   loc fix:", ensure_loc(iid,row))
        # screenshot
        sc=get_screenshot(iid)
        if sc:
            a=sc["attributes"]; ads=a.get("assetDeliveryState",{})
            print(f"   screenshot id={sc['id']} file={a.get('fileName')} delivery={ads.get('state')} errors={ads.get('errors')}")
            if ads.get("state")!="COMPLETE":
                print("   → suppression capture incomplète:", delete_screenshot(sc["id"]))
                sc=None
        else:
            print("   screenshot: AUCUNE")
        if not sc and row:
            ok,msg=upload_screenshot(iid,make_png(row["display"],row["cat"].replace('_',' ').title()))
            print("   → ré-upload capture:", "OK" if ok else msg)
        time.sleep(0.3)
    print("\nTerminé. Relance diag_iap.py pour confirmer READY_TO_SUBMIT.")

if __name__=="__main__":
    main()

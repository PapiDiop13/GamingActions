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
def tok():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER_ID,"iat":now,"exp":now+1100,"aud":"appstoreconnect-v1"},PRIVATE_KEY,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})
def api(path,params=None):
    return requests.get("https://api.appstoreconnect.apple.com"+path,
        headers={"Authorization":f"Bearer {tok()}"},params=params)
def app_id():
    r=api("/v1/apps",{"filter[bundleId]":BUNDLE_ID,"limit":200}).json()
    for a in r.get("data",[]):
        if a["attributes"].get("bundleId")==BUNDLE_ID: return a["id"]
    raise SystemExit("app not found")
aid=app_id()
print("APP_ID:",aid)
# IAP V2
print("\n=== IN-APP PURCHASES (consumables/non-consumables) ===")
url=f"/v1/apps/{aid}/inAppPurchasesV2?limit=200&fields[inAppPurchases]=name,productId,inAppPurchaseType,state"
data=api(url).json()
from collections import Counter
c=Counter()
rows=[]
for d in data.get("data",[]):
    a=d["attributes"]; c[a.get("state")]+=1
    rows.append((a.get("state"),a.get("inAppPurchaseType"),a.get("productId")))
for st,n in c.items(): print(f"  {st}: {n}")
print("  -- sample legendary/support/themes --")
for st,ty,pid in rows:
    if any(k in (pid or "") for k in ["legendary","support","theme_","frame_","bg_"]):
        print(f"    [{st}] {ty} {pid}")
# Subscriptions
print("\n=== SUBSCRIPTION GROUPS ===")
sg=api(f"/v1/apps/{aid}/subscriptionGroups?limit=50&include=subscriptions&fields[subscriptions]=name,productId,state").json()
inc={i["id"]:i for i in sg.get("included",[])}
for g in sg.get("data",[]):
    print("  group:",g["attributes"].get("referenceName"),g["id"])
for i in sg.get("included",[]):
    if i["type"]=="subscriptions":
        a=i["attributes"]; print(f"    [{a.get('state')}] {a.get('productId')} ({a.get('name')})")

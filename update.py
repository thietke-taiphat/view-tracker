#!/usr/bin/env python3
"""Thu thập view từ YouTube Shorts + TikTok + Facebook Reels, ghép video trùng nhau, ghi data/*.json"""
import json, os, re, subprocess, sys, time, unicodedata, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
CFG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
PLATS = ["yt", "tt", "fb", "ig"]
YT_KEY = os.environ.get("YT_API_KEY", "").strip()


class NeedsSetup(Exception):
    pass


def load(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default


def run_ytdlp(url):
    cmd = [sys.executable, "-m", "yt_dlp", "--flat-playlist", "-J", "--no-warnings", url]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if r.returncode != 0 or not r.stdout.strip():
        raise RuntimeError(r.stderr[-300:] or "yt-dlp lỗi")
    return json.loads(r.stdout).get("entries") or []


def fetch_yt(url):
    items = []
    for e in run_ytdlp(url):
        vid = e.get("id")
        if not vid:
            continue
        items.append({"id": vid, "url": f"https://www.youtube.com/shorts/{vid}",
                      "title": e.get("title") or "", "views": e.get("view_count") or 0})
    if YT_KEY and items:  # có API key -> số view chính xác tuyệt đối
        try:
            for i in range(0, len(items), 50):
                chunk = items[i:i + 50]
                q = urllib.parse.urlencode({"part": "statistics", "id": ",".join(x["id"] for x in chunk), "key": YT_KEY})
                with urllib.request.urlopen("https://www.googleapis.com/youtube/v3/videos?" + q, timeout=30) as r:
                    stats = {v["id"]: int(v["statistics"].get("viewCount", 0)) for v in json.load(r).get("items", [])}
                for x in chunk:
                    if x["id"] in stats:
                        x["views"] = stats[x["id"]]
        except Exception as ex:
            print("YT API lỗi, dùng số view từ trang:", ex)
    return items


def fetch_tt(url):
    url = url.split("?")[0]
    items = []
    for e in run_ytdlp(url):
        vid = e.get("id")
        if not vid:
            continue
        items.append({"id": vid, "url": e.get("url") or f"{url}/video/{vid}",
                      "title": e.get("title") or e.get("description") or "", "views": e.get("view_count") or 0})
    return items


def graph(path, token, **params):
    params["access_token"] = token
    with urllib.request.urlopen(f"https://graph.facebook.com/v21.0/{path}?" + urllib.parse.urlencode(params), timeout=40) as r:
        return json.load(r)


def fetch_fb_graph(token, public):
    """Tuỳ chọn: Page Access Token (đặt secret FB_TOKEN_FUJI / FB_TOKEN_KAITASHI) -> lấy ĐỦ toàn bộ reels của Page."""
    pub = {x["id"]: x for x in public}
    reels, nxt = [], {"fields": "id,description,permalink_url", "limit": 100}
    path = "me/video_reels"
    while True:
        j = graph(path, token, **nxt)
        reels += j.get("data", [])
        after = j.get("paging", {}).get("cursors", {}).get("after")
        if not j.get("paging", {}).get("next") or not after:
            break
        nxt["after"] = after
    views = {}
    for i in range(0, len(reels), 40):
        ids = ",".join(r["id"] for r in reels[i:i + 40])
        try:
            j = graph("", token, ids=ids, fields="video_insights.metric(blue_reels_play_count)")
            for rid, v in j.items():
                for m in (v.get("video_insights", {}).get("data") or []):
                    vals = m.get("values") or [{}]
                    views[rid] = int(vals[0].get("value", 0))
        except Exception as ex:
            print("Graph insights lỗi:", str(ex)[:120])
    out = []
    for r in reels:
        pv = pub.get(r["id"], {}).get("views", 0)
        out.append({"id": r["id"], "url": r.get("permalink_url") or f"https://www.facebook.com/reel/{r['id']}/",
                    "title": (r.get("description") or "").split("\n")[0], "views": views.get(r["id"], pv)})
    if not out:
        raise RuntimeError("Graph API không trả về reel")
    return out


def fetch_fb(url, tag):
    items, err = [], None
    try:
        out = DATA / f"_fb_{tag}.json"
        cache = DATA / f"fb_titles_{tag}.json"
        cmd = ["node", str(ROOT / "fb.mjs"), url, str(out), str(cache)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=1500, cwd=ROOT)
        print(r.stdout.strip(), r.stderr.strip()[-300:])
        items = json.loads(out.read_text(encoding="utf-8"))
        out.unlink(missing_ok=True)
        items = [{"id": x["id"], "url": x["url"], "title": x.get("title") or "", "views": x.get("views") or 0} for x in items]
    except Exception as ex:
        err = ex
    token = os.environ.get(f"FB_TOKEN_{tag.upper()}", "").strip()
    if token:
        try:
            return fetch_fb_graph(token, items)
        except Exception as ex:
            print("Graph API lỗi, dùng dữ liệu công khai:", str(ex)[:160])
    if not items:
        raise RuntimeError(str(err) if err else "Facebook không trả về reel nào")
    return items


def fetch_ig(url, tag):
    """Instagram chặn khách chưa đăng nhập -> dùng Instagram Graph API chính thức.
    Cần secret IG_TOKEN_<KÊNH> (hoặc dùng lại FB_TOKEN_<KÊNH> nếu token có quyền instagram_basic + instagram_manage_insights)
    và tuỳ chọn IG_USER_ID_<KÊNH> (nếu bỏ trống sẽ tự tìm từ Fanpage liên kết)."""
    t = tag.upper()
    token = os.environ.get(f"IG_TOKEN_{t}", "").strip() or os.environ.get(f"FB_TOKEN_{t}", "").strip()
    if not token:
        raise NeedsSetup("Chưa kết nối Instagram (thiếu IG_TOKEN)")
    uid = os.environ.get(f"IG_USER_ID_{t}", "").strip()
    if not uid:
        uid = graph("me", token, fields="instagram_business_account").get("instagram_business_account", {}).get("id")
        if not uid:
            raise RuntimeError("Không tìm thấy tài khoản Instagram liên kết với token")
    media, params = [], {"fields": "id,caption,permalink,media_product_type", "limit": 100}
    while True:
        j = graph(f"{uid}/media", token, **params)
        media += [m for m in j.get("data", []) if m.get("media_product_type") == "REELS"]
        after = j.get("paging", {}).get("cursors", {}).get("after")
        if not j.get("paging", {}).get("next") or not after:
            break
        params["after"] = after
    items = []
    for m in media:
        views = 0
        try:
            d = graph(f"{m['id']}/insights", token, metric="views").get("data", [])
            views = int(d[0]["values"][0]["value"]) if d else 0
        except Exception:
            try:
                d = graph(f"{m['id']}/insights", token, metric="plays").get("data", [])
                views = int(d[0]["values"][0]["value"]) if d else 0
            except Exception:
                pass
        items.append({"id": m["id"], "url": m.get("permalink") or url, "title": (m.get("caption") or "").split("\n")[0], "views": views})
    return items


# ---------- ghép video trùng nhau ----------
def norm(t):
    t = re.sub(r"#\S*", " ", t or "")
    t = unicodedata.normalize("NFKD", t.lower().replace("đ", "d"))
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def clean_title(t):
    t = re.sub(r"\s*#\S*", "", t or "").strip()
    return t


def build_rows(per):
    groups = []  # {key, trunc, items:{plat:item}}
    for plat in ["yt", "fb", "ig", "tt"]:
        for it in per.get(plat, []):
            raw = it["title"]
            key = norm(raw)
            trunc = raw.rstrip().endswith(("...", "…"))
            it["_key"], it["_trunc"] = key, trunc
            best = None
            if key:
                for g in groups:
                    if plat in g["items"]:
                        continue
                    if g["key"] == key:
                        best = g; break
                for g in ([] if best else groups):
                    if plat in g["items"]:
                        continue
                    if (trunc and g["key"].startswith(key)) or (g["trunc"] and key.startswith(g["key"])):
                        best = g; break
            if best:
                best["items"][plat] = it
                if (best["trunc"] and not trunc) or (best["trunc"] == trunc and len(key) > len(best["key"])):
                    best["key"], best["trunc"] = key, trunc
            else:
                groups.append({"key": key, "trunc": trunc, "items": {plat: it}})
    rows = []
    for g in groups:
        its = g["items"]
        title = clean_title((its.get("yt") or its.get("fb") or its.get("ig") or its.get("tt"))["title"])
        if "fb" in its and its["fb"]["title"]:
            title = clean_title(its["fb"]["title"]) or title
        rows.append({
            "title": title,
            "links": {p: its[p]["url"] for p in PLATS if p in its},
            "views": {p: its[p]["views"] for p in PLATS if p in its},
            "total": sum(its[p]["views"] for p in its),
            "n": len(its),
        })
    rows.sort(key=lambda r: (-r["n"], -r["total"]))
    return rows


def thin(history, now):
    """Giữ mọi điểm trong 7 ngày; 7-60 ngày: 1 điểm/3 giờ; cũ hơn: 1 điểm/ngày."""
    out, seen = [], set()
    for h in history:
        age = now - h["t"]
        if age <= 7 * 86400:
            out.append(h); continue
        bucket = (h["t"] // (3 * 3600)) if age <= 60 * 86400 else (h["t"] // 86400)
        k = ("a" if age <= 60 * 86400 else "b", bucket)
        if k not in seen:
            seen.add(k); out.append(h)
    return out


def main():
    now = int(time.time())
    old = load(DATA / "data.json", {"channels": {}})
    hist = load(DATA / "history.json", {})
    result = {"updated": now, "channels": {}}
    for ch in CFG["channels"]:
        cid = ch["id"]
        prev = old.get("channels", {}).get(cid, {}).get("raw", {})
        per, status = {}, {}
        for plat, fn in (("yt", lambda: fetch_yt(ch["youtube"])), ("tt", lambda: fetch_tt(ch["tiktok"])),
                         ("fb", lambda: fetch_fb(ch["facebook"], cid.lower())),
                         ("ig", lambda: fetch_ig(ch.get("instagram", ""), cid.lower()))):
            try:
                per[plat] = fn(); status[plat] = {"ok": True, "count": len(per[plat])}
                print(f"[{cid}] {plat}: {len(per[plat])} video")
            except NeedsSetup as ex:
                per[plat] = []; status[plat] = {"ok": False, "setup": True, "count": 0, "error": str(ex)}
                print(f"[{cid}] {plat}: {ex}")
            except Exception as ex:
                per[plat] = prev.get(plat, [])  # lỗi -> giữ số liệu lần trước để biểu đồ không bị tụt
                status[plat] = {"ok": False, "count": len(per[plat]), "error": str(ex)[:200]}
                print(f"[{cid}] {plat} LỖI: {ex}")
        rows = build_rows({p: [dict(x) for x in per[p]] for p in per})
        tot_all = {p: sum(x["views"] for x in per[p]) for p in PLATS}
        tot_match = {p: sum(r["views"].get(p, 0) for r in rows if r["n"] >= 2) for p in PLATS}
        result["channels"][cid] = {
            "name": ch["name"], "sources": {"yt": ch["youtube"], "tt": ch["tiktok"], "fb": ch["facebook"], "ig": ch.get("instagram", "")},
            "status": status, "totals_all": tot_all, "totals_matched": tot_match,
            "rows": rows, "raw": {p: [{k: v for k, v in x.items() if not k.startswith("_")} for x in per[p]] for p in PLATS},
        }
        # chỉ ghi điểm lịch sử khi có ít nhất 1 nền tảng cập nhật thành công
        if any(s["ok"] for s in status.values()):  # (ig chưa kết nối không tính là lỗi)
            h = hist.setdefault(cid, [])
            h.append({"t": now, "all": tot_all, "matched": tot_match, "videos": len(rows),
                      "matched_videos": sum(1 for r in rows if r["n"] >= 2)})
            hist[cid] = thin(h, now)
    (DATA / "data.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "history.json").write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("Xong.")


if __name__ == "__main__":
    main()

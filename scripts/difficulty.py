"""
Per-mode difficulty tiers.

The old model was a single tier per country, ranked by population. That is wrong
in two ways.

Population is a poor proxy for how well known a place is: Bangladesh is the 8th
most populous country and rarely recognised, while Iceland is 171st and famous.

More importantly a country is not uniformly hard. Egypt is an easy capital and
an easy country to find on a globe, but its flag is a red/white/black tricolour
that is nearly identical to Yemen's, Iraq's and Syria's. Rasterising all 194
flags to 16x10 and measuring nearest-neighbour distance puts Egypt and Yemen at
distance 0, while Central African Republic (population rank 120) has one of the
most distinctive flags in the set. A single tier cannot express that, so each
mode gets its own.

Signals, all computed at build time from data already in the repo:

  familiarity   Wikipedia language-link count, population and area, blended by
                rank. Sitelinks are the strongest single signal for "would a
                player have heard of this place".
  flag          nearest-neighbour distance between rasterised flags. A flag with
                a close twin is hard no matter how famous the country is.
  shape         land area plus how elongated the country is. Chile and Norway
                are unmistakable; a compact inland country is not.
  capital       sitelink count of the capital city itself, which is what the
                player is actually being asked to name.
  locate        land area dominates. Russia is trivial to hit, Nauru is not.
"""
import json, math, os, re, subprocess, tempfile

def _rank_scores(items, key, reverse=True):
    """Map each item to 0..1 by its rank on `key` (1.0 = easiest end)."""
    ordered = sorted(items, key=lambda c: (key(c) is None, key(c)), reverse=reverse)
    n = max(1, len(ordered) - 1)
    return {id(c): 1 - i / n for i, c in enumerate(ordered)}

# ---------------------------------------------------------------- notability
def load_notability(cache):
    path = os.path.join(cache, "wikidata_notability.json")
    if not os.path.exists(path):
        return {}
    rows = json.load(open(path, encoding="utf-8"))["results"]["bindings"]
    out = {}
    for r in rows:
        iso, n = r["iso3"]["value"], int(r["links"]["value"])
        # several entities can carry the same ISO3 (a country and its kingdom);
        # the best-linked one is the article players would actually know
        out[iso] = max(out.get(iso, 0), n)
    return out

def load_capital_notability(cache, norm):
    path = os.path.join(cache, "wikidata_capital_notability.json")
    if not os.path.exists(path):
        return {}
    rows = json.load(open(path, encoding="utf-8"))["results"]["bindings"]
    out = {}
    for r in rows:
        key = (r["iso3"]["value"], norm(r["en"]["value"]))
        out[key] = max(out.get(key, 0), int(r["links"]["value"]))
    return out

# ---------------------------------------------------------------- flags
def flag_distinctiveness(countries, flags_dir):
    """
    Rasterise every flag small and measure the distance to its nearest twin.
    Small on purpose: at a glance a player sees blocks of colour, not emblems,
    which is exactly why Chad and Romania are confusable in play.
    Returns {cca2: 0..1}, higher = more distinctive. Empty if flags are missing.
    """
    if not os.path.isdir(flags_dir):
        return {}
    vecs = {}
    with tempfile.TemporaryDirectory() as tmp:
        for c in countries:
            src = os.path.join(flags_dir, f"{c['cca2']}.svg")
            if not os.path.exists(src):
                continue
            dst = os.path.join(tmp, f"{c['cca2']}.ppm")
            try:
                subprocess.run(
                    ["convert", "-background", "none", src, "-resize", "16x10!",
                     "-depth", "8", dst],
                    check=True, capture_output=True, timeout=20)
                vecs[c["cca2"]] = _read_ppm(dst)
            except Exception:
                continue
    keys = [k for k, v in vecs.items() if len(v) == 16 * 10 * 3]
    if len(keys) < 2:
        return {}
    near = {}
    for a in keys:
        va, best = vecs[a], None
        for b in keys:
            if a == b:
                continue
            d = sum((x - y) ** 2 for x, y in zip(va, vecs[b]))
            if best is None or d < best:
                best = d
        near[a] = math.sqrt(best)
    lo, hi = min(near.values()), max(near.values())
    span = (hi - lo) or 1
    return {k: (v - lo) / span for k, v in near.items()}

def _read_ppm(path):
    data = open(path, "rb").read()
    parts, i = [], 0
    while len(parts) < 4:
        while data[i:i + 1].isspace():
            i += 1
        if data[i:i + 1] == b"#":
            while data[i:i + 1] != b"\n":
                i += 1
            continue
        s = i
        while not data[i:i + 1].isspace():
            i += 1
        parts.append(data[s:i])
    return list(data[i + 1:])

# ---------------------------------------------------------------- shapes
def shape_spread(topo):
    """
    {ccn3: elongation} from the 50m geometry, where elongation is how far the
    bounding box is from square. Chile and Norway score high and are instantly
    recognisable; a country that fills a squarish box is not.
    """
    tr = topo.get("transform")
    arcs_raw = topo["arcs"]
    def decode(idx):
        arc = arcs_raw[idx]
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x, y))
        if tr:
            sx, sy = tr["scale"]; tx, ty = tr["translate"]
            pts = [(px * sx + tx, py * sy + ty) for px, py in pts]
        return pts

    out = {}
    for g in topo["objects"]["countries"]["geometries"]:
        gid = g.get("id")
        if not gid:
            continue
        idxs = []
        def walk(a):
            for v in a:
                if isinstance(v, list):
                    walk(v)
                else:
                    idxs.append(~v if v < 0 else v)
        walk(g.get("arcs", []))
        xs, ys = [], []
        for i in idxs:
            for px, py in decode(i):
                xs.append(px); ys.append(py)
        if len(xs) < 3:
            continue
        w = max(xs) - min(xs)
        h = max(ys) - min(ys)
        if w <= 0 or h <= 0:
            continue
        # >180 wide means the country straddles the antimeridian; ignore, the
        # box is meaningless there (Russia, Fiji, Kiribati)
        if w > 180:
            continue
        out[gid] = abs(math.log((w / math.cos(math.radians(sum(ys) / len(ys)))) / h))
    if not out:
        return {}
    hi = max(out.values()) or 1
    return {k: min(1.0, v / hi) for k, v in out.items()}

# ---------------------------------------------------------------- tiers
MODES = ("flag", "shape", "capital", "locate")

def assign_tiers(countries, notability, cap_notability, flag_score, shape_score,
                 norm, easy_cut=50, med_cut=122):
    """Writes c['tiers'] = {mode: 'easy'|'medium'|'hard'} on every country."""
    pop = _rank_scores(countries, lambda c: c.get("pop") or 0)
    area = _rank_scores(countries, lambda c: c.get("area") or 0)
    note = _rank_scores(countries, lambda c: notability.get(c["cca3"], 0))
    capn = _rank_scores(
        countries,
        lambda c: cap_notability.get((c["cca3"], norm(c["capital"])), 0))

    # How likely a player is to have heard of the place at all. Notability leads
    # because it measures exactly that; population and area only correlate.
    familiarity = {
        id(c): 0.60 * note[id(c)] + 0.28 * pop[id(c)] + 0.12 * area[id(c)]
        for c in countries
    }

    scores = {m: {} for m in MODES}
    for c in countries:
        f = familiarity[id(c)]
        fl = flag_score.get(c["cca2"])
        sh = shape_score.get(c["ccn3"])
        # each mode leans on familiarity, then on what that mode actually asks
        scores["flag"][id(c)] = 0.55 * f + 0.45 * (fl if fl is not None else 0.5)
        scores["shape"][id(c)] = (0.50 * f + 0.30 * area[id(c)]
                                  + 0.20 * (sh if sh is not None else 0.4))
        scores["capital"][id(c)] = 0.45 * f + 0.55 * capn[id(c)]
        scores["locate"][id(c)] = 0.45 * f + 0.55 * area[id(c)]

    for c in countries:
        c["tiers"] = {}
    for m in MODES:
        ordered = sorted(countries, key=lambda c: -scores[m][id(c)])
        for i, c in enumerate(ordered):
            c["tiers"][m] = "easy" if i < easy_cut else ("medium" if i < med_cut else "hard")
    return scores

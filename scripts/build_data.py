#!/usr/bin/env python3
"""
Atlas Arcade — data build.

Joins three verified open datasets into a single trimmed `assets/data/countries.json`
that the game loads at runtime, and copies the country geometry into `assets/geo/`.

Sources (downloaded once, cached in scripts/cache/):
  - world-atlas countries-50m.json     -> country shapes (TopoJSON, id = ISO numeric ccn3)
  - mledoze/countries countries.json   -> names, capital, region, altSpellings, area, latlng
  - Natural Earth 110m populated places -> capital lat/lng (adm0cap), matched by ISO3
  - samayo country-by-population        -> population, for difficulty tiering

Run:  python3 scripts/build_data.py
Then: scripts/fetch_flags.sh   (downloads flag SVGs listed in scripts/cache/flags-list.txt)
"""
import json, os, re, unicodedata, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache")
os.makedirs(CACHE, exist_ok=True)

SOURCES = {
    "countries-50m.json": "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
    "mledoze.json": "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
    "ne_capitals.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places_simple.geojson",
    "population.json": "https://raw.githubusercontent.com/samayo/country-json/master/src/country-by-population.json",
}

def load(name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print(f"  downloading {name} ...")
        urllib.request.urlretrieve(SOURCES[name], path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())

# ---- manual patches -------------------------------------------------------
# capitals the Natural Earth 110m layer omits (lng, lat)
CAPITAL_PATCH = {
    "SSD": ("Juba", 31.582, 4.859),
    "NRU": ("Yaren", 166.920867, -0.547778),
    "TUV": ("Funafuti", 179.194, -8.5211),
}
# populations missing due to name spelling differences (approx, 2023)
POPULATION_PATCH = {
    "COD": 102262808, "CPV": 598682, "CZE": 10510751, "FJI": 924610,
    "FSM": 113131, "TLS": 1360596, "TUR": 85341241, "VAT": 764,
}
# well-known small countries — floor their tier so they aren't "hard"
FAMOUS = {"MCO", "VAT", "ISL", "LUX", "MLT", "SGP", "LIE", "AND", "SMR", "BRB", "BHS"}
# extra answer aliases players are likely to type
ALIAS_PATCH = {
    "USA": ["usa", "us", "america", "unitedstates", "unitedstatesofamerica"],
    "GBR": ["uk", "britain", "greatbritain", "england", "unitedkingdom"],
    "CZE": ["czechrepublic", "czechia"],
    "MMR": ["burma", "myanmar"],
    "NLD": ["holland", "netherlands", "thenetherlands"],
    "ARE": ["uae", "emirates", "unitedarabemirates"],
    "COD": ["drc", "drcongo", "democraticrepublicofthecongo", "congokinshasa", "zaire"],
    "COG": ["congo", "republicofthecongo", "congobrazzaville"],
    "KOR": ["southkorea", "korea", "republicofkorea"],
    "PRK": ["northkorea", "dprk"],
    "TUR": ["turkey", "turkiye"],
    "CIV": ["ivorycoast", "cotedivoire"],
    "CPV": ["capeverde", "caboverde"],
    "TLS": ["easttimor", "timorleste"],
    "SWZ": ["swaziland", "eswatini"],
    "MKD": ["macedonia", "northmacedonia"],
    "VAT": ["vatican", "vaticancity", "holysee"],
}

def main():
    print("Loading sources ...")
    topo = load("countries-50m.json")
    countries = load("mledoze.json")
    ne = load("ne_capitals.geojson")
    pop_raw = load("population.json")

    topo_ids = {g["id"] for g in topo["objects"]["countries"]["geometries"] if g.get("id")}

    # capital lat/lng by ISO3
    cap_by3 = {}
    for f in ne["features"]:
        p = f["properties"]
        if p.get("adm0cap") == 1:
            lng, lat = f["geometry"]["coordinates"]
            for key in (p.get("adm0_a3"), p.get("sov_a3")):
                if key and key not in cap_by3:
                    cap_by3[key] = (p.get("name"), lng, lat)

    pop_by = {norm(x["country"]): x["population"] for x in pop_raw if x.get("population")}

    out, dropped = [], []
    for c in countries:
        if not c.get("unMember"):
            continue
        cca3 = c["cca3"]
        ccn3 = c["ccn3"]
        common = c["name"]["common"]
        capital = (c.get("capital") or [None])[0]

        # capital coordinates
        if cca3 in CAPITAL_PATCH:
            cname, clng, clat = CAPITAL_PATCH[cca3]
            capital = capital or cname
        elif cca3 in cap_by3:
            cname, clng, clat = cap_by3[cca3]
            capital = capital or cname
        else:
            dropped.append((cca3, common, "no capital coords"))
            continue
        if not capital:
            dropped.append((cca3, common, "no capital name"))
            continue

        population = pop_by.get(norm(common)) or POPULATION_PATCH.get(cca3)

        # aliases
        aliases = set()
        for a in [common, c["name"].get("official"), *(c.get("altSpellings") or [])]:
            n = norm(a)
            if n:
                aliases.add(n)
        aliases.update(ALIAS_PATCH.get(cca3, []))

        lat, lng = c["latlng"]  # mledoze is [lat, lng]
        area = c.get("area") or 0
        has_shape = ccn3 in topo_ids
        out.append({
            "ccn3": ccn3,
            "cca2": c["cca2"].lower(),
            "cca3": cca3,
            "name": common,
            "capital": capital,
            "region": c.get("region"),
            "subregion": c.get("subregion"),
            "ll": [round(lng, 3), round(lat, 3)],       # country centroid [lng,lat]
            "cap": [round(clng, 3), round(clat, 3)],     # capital [lng,lat]
            "pop": population or 0,
            "area": area,
            "hasShape": has_shape,
            # only sizeable countries make a fair "name the shape" clue (micro-states
            # render as uninformative blobs); they still appear as flag/capital/locate.
            "shapeClue": has_shape and area >= 1000,
            "aliases": sorted(aliases),
        })

    # difficulty tiers by population rank
    ranked = sorted(out, key=lambda c: c["pop"], reverse=True)
    n = len(ranked)
    easy_cut, med_cut = 50, 122
    for i, c in enumerate(ranked):
        c["tier"] = "easy" if i < easy_cut else ("medium" if i < med_cut else "hard")
    for c in out:
        if c["cca3"] in FAMOUS and c["tier"] == "hard":
            c["tier"] = "medium"

    out.sort(key=lambda c: c["name"])
    data = {
        "generated": True,
        "count": len(out),
        "tiers": {t: sum(1 for c in out if c["tier"] == t) for t in ("easy", "medium", "hard")},
        "countries": out,
    }

    os.makedirs(os.path.join(ROOT, "assets", "data"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "assets", "geo"), exist_ok=True)
    with open(os.path.join(ROOT, "assets", "data", "countries.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(ROOT, "assets", "geo", "countries-50m.json"), "w", encoding="utf-8") as f:
        json.dump(topo, f, separators=(",", ":"))
    with open(os.path.join(CACHE, "flags-list.txt"), "w") as f:
        f.write("\n".join(c["cca2"] for c in out))

    print(f"\nWrote {len(out)} countries -> assets/data/countries.json")
    print(f"tiers: {data['tiers']}")
    noshape = [c["cca3"] for c in out if not c["hasShape"]]
    nopop = [c["cca3"] for c in out if not c["pop"]]
    print(f"no shape (flag/capital/locate only): {noshape}")
    print(f"no population: {nopop}")
    if dropped:
        print("DROPPED:", dropped)

if __name__ == "__main__":
    main()

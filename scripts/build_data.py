#!/usr/bin/env python3
"""
Atlas Arcade — data build.

Joins three verified open datasets into a single trimmed `assets/data/countries.json`
that the game loads at runtime, and copies the country geometry into `assets/geo/`.

Sources (downloaded once, cached in scripts/cache/):
  - world-atlas countries-50m.json     -> country shapes (TopoJSON, id = ISO numeric ccn3)
  - mledoze/countries countries.json   -> names, capital, region, altSpellings, area, latlng
                                          and pt country names (translations.por)
  - Natural Earth 110m populated places -> capital lat/lng (adm0cap), matched by ISO3
  - samayo country-by-population        -> population, for difficulty tiering
  - Wikidata SPARQL                     -> pt / pt-BR capital city names

Run:  python3 scripts/build_data.py
Then: scripts/fetch_flags.sh   (downloads flag SVGs listed in scripts/cache/flags-list.txt)
"""
import json, os, re, unicodedata, sys, urllib.request, urllib.parse
import difficulty

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

# ---- Wikidata: pt / pt-BR capital names -----------------------------------
# mledoze has no capital translations, so the Portuguese capital names come from
# Wikidata. Only capitals with no end date are taken, and each is matched to the
# exact capital this dataset already uses (by English label), so countries with
# several seats of government do not silently swap.
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
CAPITAL_QUERY = """
SELECT ?iso3 ?en ?pt ?ptbr WHERE {
  ?country wdt:P298 ?iso3 ; p:P36 ?st .
  ?st ps:P36 ?capQ .
  FILTER NOT EXISTS { ?st pq:P582 ?end }
  ?capQ rdfs:label ?enL . FILTER(LANG(?enL)="en") BIND(STR(?enL) AS ?en)
  OPTIONAL { ?capQ rdfs:label ?ptL . FILTER(LANG(?ptL)="pt")    BIND(STR(?ptL) AS ?pt) }
  OPTIONAL { ?capQ rdfs:label ?brL . FILTER(LANG(?brL)="pt-br") BIND(STR(?brL) AS ?ptbr) }
}
"""

def load_wikidata_capitals():
    """{(iso3, norm(english capital)): {'pt':..., 'ptbr':...}}"""
    path = os.path.join(CACHE, "wikidata_capitals.json")
    if not os.path.exists(path):
        print("  downloading wikidata_capitals.json ...")
        url = WIKIDATA_SPARQL + "?" + urllib.parse.urlencode({"query": CAPITAL_QUERY})
        req = urllib.request.Request(url, headers={
            "Accept": "application/sparql-results+json",
            "User-Agent": "atlas-arcade-data-build/1.0 (https://github.com/azevedev/atlas-arcade)",
        })
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
            f.write(r.read())
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)["results"]["bindings"]
    out = {}
    for r in rows:
        key = (r["iso3"]["value"], norm(r["en"]["value"]))
        e = out.setdefault(key, {"pt": None, "ptbr": None})
        for k in ("pt", "ptbr"):
            if k in r and not e[k]:
                e[k] = r[k]["value"]
    return out

# Curated pt-BR capital names. The bar is deliberately high: whenever Wikidata
# has a Portuguese label it wins, even where the international spelling is also
# common in Brazil. An earlier version of this list overrode a dozen perfectly
# good Portuguese names (São Jorge -> "Saint George's", Bancoque -> "Bangkok")
# on a judgement call about usage, which just left English on a Portuguese
# screen. Both spellings are accepted as answers either way, so preferring the
# Portuguese one costs the player nothing.
#
# What is left are the two cases the data genuinely gets wrong:
#   1. The label is an artifact rather than a name ("Cidade de Bruxelas" is the
#      disambiguated municipality; the city is Bruxelas).
#   2. Wikidata's English label does not match the one this dataset uses, so the
#      automatic join finds nothing at all (ATG, GNQ, MNG, NRU, NGA, SMR).
CAPITAL_PT_PATCH = {
    "BEL": "Bruxelas",
    "KWT": "Cidade do Kuwait",   # pt label is the bare country name
    "KIR": "Tarawa do Sul",      # pt-br label reads "Taraua"
    # join misses, filled from the Portuguese Wikipedia
    "ATG": "Saint John's",
    "GNQ": "Malabo",
    "MNG": "Ulan Bator",
    "NRU": "Yaren",
    "NGA": "Abuja",
    "SMR": "São Marinho",
}

# mledoze's translations.por is EUROPEAN Portuguese, so the vowel before a nasal
# is the giveaway (Polónia / Polônia, Quénia / Quênia). These are the Brazilian
# forms, plus two outright typos in the source (Azerbeijão, São Vincente).
NAME_PT_PATCH = {
    "ARM": "Armênia", "AZE": "Azerbaijão", "BLR": "Bielorrússia", "BWA": "Botsuana",
    "CZE": "Tchéquia", "DJI": "Djibuti", "SVN": "Eslovênia", "EST": "Estônia",
    "YEM": "Iêmen", "IRN": "Irã", "LVA": "Letônia", "MKD": "Macedônia do Norte",
    "MDG": "Madagascar", "MWI": "Malaui", "MCO": "Mônaco", "PER": "Peru",
    "POL": "Polônia", "KEN": "Quênia", "ROU": "Romênia",
    "VCT": "São Vicente e Granadinas", "TTO": "Trinidad e Tobago",
    "TKM": "Turcomenistão", "VNM": "Vietnã", "ZWE": "Zimbábue",
}

# Portuguese article for "a capital DO Brasil" / "DA França" / "DE Portugal".
# Shipped as data rather than inferred at runtime: the -a ending is a decent
# guess but wrong often enough to matter (o Camboja, o Sri Lanka, a Costa Rica),
# and a player noticing broken grammar is exactly the kind of thing that makes a
# translation feel machine-made.
ARTICLE_NONE = {  # takes no article at all
    "AGO", "ATG", "AND", "BWA", "BLZ", "CPV", "CUB", "CYP", "DMA", "SLV", "GHA",
    "GRD", "HND", "ISR", "KIR", "MDG", "MLT", "MHL", "NRU", "PRT", "WSM", "LCA",
    "SGP", "STP", "TLS", "TON", "TUV", "UGA", "VUT", "MCO", "SMR", "OMN", "QAT",
    "BHR", "KWT", "PLW", "FJI", "BRB", "HTI", "JAM", "MOZ", "NAM", "NIU",
}
ARTICLE_PLURAL_M = {"USA", "ARE"}                 # os Estados Unidos
ARTICLE_PLURAL_F = {"PHL", "MDV", "BHS", "COM", "MHL", "SLB", "SYC"}  # as Filipinas
ARTICLE_MASC = {  # ends in -a but masculine
    "KHM", "LKA", "PAN", "CAN", "SUR", "ZWE",
}
ARTICLE_FEM = {  # feminine without an -a ending, so the suffix rule misses them
    "ZAF", "CIV", "PRK", "KOR", "GIN", "GNQ", "GNB", "PNG", "COD", "VAT", "NLD",
}

def pt_article(cca3, name):
    if cca3 in ARTICLE_NONE:
        return None
    if cca3 in ARTICLE_PLURAL_M:
        return "os"
    if cca3 in ARTICLE_PLURAL_F:
        return "as"
    if cca3 in ARTICLE_MASC:
        return "o"
    if cca3 in ARTICLE_FEM:
        return "a"
    return "a" if name.endswith("a") else "o"

# ---- World Cup pool --------------------------------------------------------
# Countries that have played in a FIFA World Cup FINAL tournament.
#
# Derived from Wikidata (editions of Q19317 carrying an edition number, joined
# through each team's "country for sport"), but only for 1930-2010, because the
# recent editions are unreliable there: 2014 lists 51 teams, 2018 lists 86 and
# 2022 lists 4, since qualifying sides leak into the finals statements. Field
# sizes for 1930-2010 all check out (13-32), so that range is trusted and the
# four later debutants are named explicitly.
#
# Teams that no longer map to a current UN member are dropped by the join:
# Czechoslovakia, Soviet Union, East Germany, Yugoslavia, Serbia and Montenegro.
# GBR is added by hand: the United Kingdom never competes as such, but England,
# Scotland, Wales and Northern Ireland do, and a World Cup pool without it would
# be a conspicuous hole.
WORLD_CUP = {
    "AGO",
    "ARE",
    "ARG",
    "AUS",
    "AUT",
    "BEL",
    "BGR",
    "BIH",
    "BOL",
    "BRA",
    "CAN",
    "CHE",
    "CHL",
    "CHN",
    "CIV",
    "CMR",
    "COD",
    "COL",
    "CRI",
    "CUB",
    "CZE",
    "DEU",
    "DNK",
    "DZA",
    "ECU",
    "EGY",
    "ESP",
    "FRA",
    "GBR",
    "GHA",
    "GRC",
    "HND",
    "HRV",
    "HTI",
    "HUN",
    "IRL",
    "IRN",
    "IRQ",
    "ISL",
    "ISR",
    "ITA",
    "JAM",
    "JPN",
    "KOR",
    "KWT",
    "MAR",
    "MEX",
    "NGA",
    "NOR",
    "NZL",
    "PAN",
    "PER",
    "POL",
    "PRK",
    "PRT",
    "PRY",
    "QAT",
    "ROU",
    "RUS",
    "SAU",
    "SEN",
    "SLV",
    "SRB",
    "SVK",
    "SVN",
    "SWE",
    "TGO",
    "TTO",
    "TUN",
    "TUR",
    "UKR",
    "URY",
    "USA",
    "ZAF"
}
WORLD_CUP_LATE_DEBUT = {"BIH": 2014, "ISL": 2018, "PAN": 2018, "QAT": 2022}

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

    wiki_caps = load_wikidata_capitals()

    out, dropped, untranslated = [], [], []
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

        # Portuguese country name (mledoze covers all 250) and capital (Wikidata,
        # curated). Falls back to the English name so a gap is never a blank.
        por = (c.get("translations") or {}).get("por") or {}
        name_pt = NAME_PT_PATCH.get(cca3) or por.get("common") or common
        wd = wiki_caps.get((cca3, norm(capital))) or {}
        capital_pt = CAPITAL_PT_PATCH.get(cca3) or wd.get("ptbr") or wd.get("pt") or capital
        if cca3 not in CAPITAL_PT_PATCH and not (wd.get("ptbr") or wd.get("pt")):
            untranslated.append((cca3, capital))

        # Aliases accept BOTH languages no matter which one is being played, so a
        # player who knows a country by its English name is never marked wrong.
        aliases = set()
        for a in [common, c["name"].get("official"), name_pt, por.get("official"),
                  *(c.get("altSpellings") or [])]:
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
            "namePt": name_pt,
            "artPt": pt_article(cca3, name_pt),
            "capital": capital,
            "capitalPt": capital_pt,
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
            "worldCup": cca3 in WORLD_CUP,
            "aliases": sorted(aliases),
        })

    # Difficulty. A single population-ranked tier said Egypt was easy while its
    # flag is a near-twin of Yemen's, so each mode is scored separately.
    # See scripts/difficulty.py for the signals.
    notability = difficulty.load_notability(CACHE)
    cap_notability = difficulty.load_capital_notability(CACHE, norm)
    flag_score = difficulty.flag_distinctiveness(out, os.path.join(ROOT, "assets", "flags"))
    shape_score = difficulty.shape_spread(topo)
    if not notability:
        print("  WARNING: no notability cache, tiers fall back to population/area only")
    if not flag_score:
        print("  WARNING: no flags on disk, flag tiers lose their distinctiveness term")
    difficulty.assign_tiers(out, notability, cap_notability, flag_score, shape_score, norm)

    # a well-known small country is never the hardest of anything
    for c in out:
        if c["cca3"] in FAMOUS:
            for m, t in c["tiers"].items():
                if t == "hard":
                    c["tiers"][m] = "medium"

    # legacy single tier, kept so anything not yet mode-aware still works
    for c in out:
        ranked_t = [c["tiers"][m] for m in difficulty.MODES]
        c["tier"] = max(set(ranked_t), key=ranked_t.count)

    out.sort(key=lambda c: c["name"])
    data = {
        "generated": True,
        "count": len(out),
        "tiers": {t: sum(1 for c in out if c["tier"] == t) for t in ("easy", "medium", "hard")},
        "modeTiers": {
            m: {t: sum(1 for c in out if c["tiers"][m] == t) for t in ("easy", "medium", "hard")}
            for m in difficulty.MODES
        },
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
    wc = [c for c in out if c["worldCup"]]
    print(f"World Cup pool: {len(wc)} countries")
    pt_same = [c["cca3"] for c in out if c["capitalPt"] == c["capital"]]
    print(f"pt-BR capitals translated: {len(out) - len(pt_same)}/{len(out)} "
          f"({len(pt_same)} identical to English, which is usually correct)")
    if untranslated:
        print("no Portuguese capital label found (fell back to English):", untranslated)
    if dropped:
        print("DROPPED:", dropped)

if __name__ == "__main__":
    main()

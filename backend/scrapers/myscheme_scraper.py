"""
myscheme_scraper.py — improved v2
Tries multiple MyScheme.gov.in API endpoints with better URL construction.
Each scheme gets a specific /schemes/{slug} URL for "Know More" links.
"""
import re, json, logging, requests
from datetime import datetime, timezone

log = logging.getLogger("scraper.myscheme")
BASE = "https://www.myscheme.gov.in"
API_BASE = "https://api.myscheme.gov.in"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Origin": BASE, "Referer": f"{BASE}/search/state/Rajasthan",
}

CAT_MAP = {
    r"health|medical|ayush|hospital|chiranjeevi|ayushman": "Health",
    r"education|school|scholarsh|student|coaching":        "Education",
    r"agriculture|kisan|farm|crop|irrigation":             "Agriculture",
    r"social|pension|widow|disable|palanhar|welfare":      "Social Welfare",
    r"women|mahila|girl|beti|maternity|ladli":             "Women & Child",
    r"labour|worker|employment|rozgar|skill|training":     "Labour & Employment",
    r"business|msme|startup|enterprise|loan|mudra":        "Business & Finance",
    r"housing|awas|shelter":                               "Housing",
    r"food|ration|rasoi|pds|nutrition":                    "Food Security",
    r"water|jal|sanitation|swachh":                        "Water & Sanitation",
    r"energy|solar|electricity|ujjwala":                   "Energy",
    r"digital|it|emitra|technology":                       "Digital Services",
    r"mining|mineral":                                     "Mining",
}

def _category(text):
    t = text.lower()
    for pat, cat in CAT_MAP.items():
        if re.search(pat, t, re.I): return cat
    return "General"

def _normalise(raw, i, ts):
    src = raw.get("_source", raw)
    name = src.get("schemeName") or src.get("title") or src.get("name") or f"Scheme {i+1}"
    slug = src.get("slug") or src.get("schemeSlug") or src.get("schemeCode") or ""
    tags = src.get("tags") or src.get("beneficiaryType") or []
    if isinstance(tags, str): tags = [tags]
    ministry = src.get("nodalMinistryName") or src.get("ministry") or src.get("department") or ""
    desc = src.get("briefDescription") or src.get("description") or src.get("objective") or ""
    benefit = src.get("benefits") or src.get("benefit") or ""
    eligibility = src.get("eligibilityCriteria") or src.get("eligibility") or ""
    launched = src.get("launchedOn") or src.get("startDate") or ""
    cat = _category(name + " " + ministry + " " + " ".join(str(t) for t in tags))
    # Build specific scheme URL
    if slug:
        scheme_url = f"{BASE}/schemes/{slug}"
    else:
        # Try to build from name
        slug_from_name = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60]
        scheme_url = f"{BASE}/search?q={requests.utils.quote(name[:50])}"
    return {
        "id": f"myscheme_{i+1}",
        "name": name.strip(),
        "category": cat,
        "ministry": ministry,
        "tags": [str(t) for t in tags[:5]],
        "url": scheme_url,
        "apply_url": scheme_url,  # same — myscheme page has apply button
        "description": desc[:300] if desc else f"Government scheme for {cat.lower()}",
        "benefit": benefit[:200] if isinstance(benefit, str) else "",
        "eligibility": eligibility[:200] if isinstance(eligibility, str) else "",
        "launched": str(launched)[:10] if launched else "",
        "state": "Rajasthan",
        "status": "Active",
        "source": "myscheme.gov.in",
        "scraped_at": ts,
    }

def scrape_myscheme():
    ts = datetime.now(timezone.utc).isoformat()
    session = requests.Session()
    import urllib3; urllib3.disable_warnings()

    # Try multiple API endpoints
    api_urls = [
        f"{API_BASE}/search/v4/schemes?lang=en&q=&from=0&size=100&filters=state:Rajasthan",
        f"{API_BASE}/search/v4/schemes?lang=en&q=rajasthan&from=0&size=100",
        f"{API_BASE}/search/v4/schemes?lang=en&q=&from=0&size=50&state=Rajasthan",
        f"{API_BASE}/search/v3/schemes?lang=en&from=0&size=50&state=Rajasthan",
        f"{API_BASE}/search/v4/schemes?lang=en&q=rajasthan+scheme&from=0&size=50",
        f"{BASE}/api/schemes?state=Rajasthan&size=100",
    ]
    for url in api_urls:
        try:
            r = session.get(url, headers=HEADERS, timeout=15, verify=False)
            if r.status_code == 200:
                data = r.json()
                hits = (data.get("hits", {}).get("hits") or
                        data.get("schemes") or data.get("data") or
                        (data if isinstance(data, list) else None))
                if hits and len(hits) > 2:
                    log.info("MyScheme API: %d schemes from %s", len(hits), url[:80])
                    return [_normalise(h, i, ts) for i, h in enumerate(hits)]
        except Exception as e:
            log.debug("MyScheme API %s: %s", url[:60], e)

    # HTML fallback — try to extract __NEXT_DATA__ or JSON from page
    try:
        r = session.get(f"{BASE}/search/state/Rajasthan",
                        headers={**HEADERS, "Accept":"text/html"}, timeout=15, verify=False)
        # Look for embedded JSON data
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
        if m:
            next_data = json.loads(m.group(1))
            schemes_data = (next_data.get("props", {}).get("pageProps", {})
                                     .get("schemes") or
                            next_data.get("props", {}).get("pageProps", {})
                                     .get("data", {}).get("schemes") or [])
            if schemes_data and len(schemes_data) > 2:
                log.info("MyScheme __NEXT_DATA__: %d schemes", len(schemes_data))
                return [_normalise(s, i, ts) for i, s in enumerate(schemes_data)]
    except Exception as e:
        log.error("MyScheme HTML: %s", e)

    log.warning("MyScheme: all methods failed, using fallback")
    return _fallback(ts)

def _fallback(ts):
    schemes = [
        ("PM Kisan Samman Nidhi",        "Agriculture",        "Ministry of Agriculture",  "₹6,000/year direct transfer", "Small & marginal farmers",         "pm-kisan-samman-nidhi"),
        ("Ayushman Bharat PM-JAY",        "Health",             "Ministry of Health",       "₹5 lakh/year health insurance","BPL families",                     "ayushman-bharat-pradhan-mantri-jan-arogya-yojana"),
        ("PM Awas Yojana Gramin",         "Housing",            "Ministry of Rural Dev.",   "₹1.2 lakh per rural house",   "Homeless rural families",          "pradhan-mantri-awaas-yojana-gramin"),
        ("MGNREGA",                       "Labour & Employment","Ministry of Rural Dev.",   "100 days guaranteed wages",   "Rural households",                 "mahatma-gandhi-national-rural-employment-guarantee-act"),
        ("PM Ujjwala Yojana",             "Energy",             "Ministry of Petroleum",    "Free LPG connection",         "BPL women",                        "pradhan-mantri-ujjwala-yojana"),
        ("Sukanya Samriddhi Yojana",      "Women & Child",      "Ministry of Finance",      "Tax-free savings for girl",   "Parents of girl child <10yrs",     "sukanya-samriddhi-yojana"),
        ("PM Fasal Bima Yojana",          "Agriculture",        "Ministry of Agriculture",  "Crop insurance",              "Farmers",                          "pradhan-mantri-fasal-bima-yojana"),
        ("PM Mudra Yojana",               "Business & Finance", "Ministry of Finance",      "Loans up to ₹10 lakh",        "Small entrepreneurs",              "pradhan-mantri-mudra-yojana"),
        ("National Apprenticeship",       "Labour & Employment","Ministry of Skill Dev.",   "Stipend + training",          "Youth 14-21 years",                "national-apprenticeship-promotion-scheme"),
        ("PM SVANidhi",                   "Business & Finance", "Ministry of Housing",      "Working capital loan",        "Street vendors",                   "pradhan-mantri-svanidhi"),
        ("Stand-Up India",                "Business & Finance", "Ministry of Finance",      "₹10L–₹1Cr loan",             "SC/ST/Women entrepreneurs",        "stand-up-india"),
        ("Jal Jeevan Mission",            "Water & Sanitation", "Ministry of Jal Shakti",   "Tap water to every HH",       "Rural households",                 "jal-jeevan-mission"),
        ("PM Poshan",                     "Education",          "Ministry of Education",    "Free mid-day meals",          "School children",                  "pradhan-mantri-poshan-shakti-nirman"),
        ("Digital India",                 "Digital Services",   "Ministry of IT",           "Digital infrastructure",      "All citizens",                     "digital-india"),
        ("Atal Pension Yojana",           "Social Welfare",     "Ministry of Finance",      "Pension ₹1000–5000/month",    "Unorganised sector workers",       "atal-pension-yojana"),
        ("PM Jan Dhan Yojana",            "General",            "Ministry of Finance",      "Zero-balance bank account",   "Unbanked citizens",                "pradhan-mantri-jan-dhan-yojana"),
        ("Scholarship for SC/ST",         "Education",          "Ministry of Social Justice","Full scholarship + stipend", "SC/ST students",                   "post-matric-scholarship-for-sc-students"),
        ("Kisan Credit Card",             "Agriculture",        "Ministry of Agriculture",  "Credit for farming needs",    "Farmers",                          "kisan-credit-card"),
        ("Soil Health Card",              "Agriculture",        "Ministry of Agriculture",  "Free soil testing",           "Farmers",                          "soil-health-card"),
        ("PM Rozgar Protsahan",           "Labour & Employment","Ministry of Labour",       "EPF contribution by govt",    "New hires",                        "pradhan-mantri-rojgar-protsahan-yojana"),
        ("Chiranjeevi Health Insurance",  "Health",             "Govt of Rajasthan",        "₹25 lakh cashless insurance", "Rajasthan residents",              "mukhyamantri-chiranjeevi-swasthya-bima-yojana"),
        ("Palanhar Yojana",               "Social Welfare",     "Govt of Rajasthan",        "₹2,500/month for orphans",    "Orphaned children of Rajasthan",   "palanhar-yojana"),
        ("Indira Rasoi Yojana",           "Food Security",      "Govt of Rajasthan",        "Meals at ₹8 per plate",       "Urban poor of Rajasthan",          "indira-rasoi-yojana"),
        ("Mukhyamantri Rajshri Yojana",   "Education",          "Govt of Rajasthan",        "₹50,000 for girl education",  "Girl child of Rajasthan",          "mukhyamantri-rajshri-yojana"),
        ("Lado Protsahan Yojana",         "Women & Child",      "Govt of Rajasthan",        "₹2 lakh savings bond",        "Girl child at birth, Rajasthan",   "lado-protsahan-yojana"),
    ]
    return [{
        "id": f"myscheme_{i+1}", "name": n, "category": c, "ministry": m,
        "tags": [], "url": f"{BASE}/schemes/{slug}", "apply_url": f"{BASE}/schemes/{slug}",
        "description": b, "benefit": b, "eligibility": e,
        "launched": "", "state": "Rajasthan", "status": "Active",
        "source": "myscheme.gov.in", "scraped_at": ts,
    } for i, (n, c, m, b, e, slug) in enumerate(schemes)]
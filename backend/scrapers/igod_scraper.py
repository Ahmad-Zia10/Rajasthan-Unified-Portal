"""
igod_scraper.py
Scrapes igod.gov.in for Rajasthan government portals directory.
Also fetches meta from each portal homepage for richer data.
"""
import re, logging, requests
from datetime import datetime, timezone
from urllib.parse import urlparse
from bs4 import BeautifulSoup

log = logging.getLogger("scraper.igod")
IGOD_URL = "https://igod.gov.in/sg/RJ/SPMA/organizations"
HEADERS  = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
}
SKIP_DOMAINS = re.compile(r"igod\.gov\.in|india\.gov\.in|data\.gov\.in|guidelines\.india|s3waas\.gov\.in|passportindia|(?<!raj\.)nic\.in|meity\.gov\.in|digitalindia|karmashree|pareshram|pgt\.dbt|mygov\.in|pmindia|pgportal", re.I)
SKIP_TEXT    = re.compile(r"^(home|categories|sectors|contribute|sitemap|about|help|feedback|contact|suggest|share|link to us|bookmark|more sites|advanced search|passport seva|national portal|open government|digital india|national informatics|guidelines for indian|secure.*scalable)$", re.I)
CAT_MAP = {
    r"jan soochna|jansoochna|soochna": "Transparency & RTI",
    r"labour|ldms|worker":             "Labour & Employment",
    r"pregnancy|child|pcts|health|medical": "Health & Family Welfare",
    r"pushkar|fair|mela":              "Tourism & Culture",
    r"invest|nivesh|rising":           "Industry & Investment",
    r"civil registration|pehchan|birth|death": "Civil Registration",
    r"farmer|agri|kisan|rjfr|rjfrc":  "Agriculture & Farmers",
    r"recruitment|job":                "Recruitment",
    r"wam|accounts|work account":      "Finance & Accounts",
}

def _cat(name, domain):
    t = (name+" "+domain).lower()
    for pat, c in CAT_MAP.items():
        if re.search(pat, t, re.I): return c
    return "Government Services"

def _is_raj(domain, name):
    return bool(re.search(r"rajasthan\.gov\.in|raj\.nic\.in|rajmedical|agristack\.gov\.in|ldms\.raj|pehchan\.raj|rjfr|rjfrc|rajnivesh|pushkarmela|jansoochna|rising\.rajasthan|wam\.rajasthan|recruitment\.rajasthan", domain, re.I) or re.search(r"rajasthan|raj\b", name, re.I))

def _fetch_meta(url, session):
    try:
        r = session.get(url, headers=HEADERS, timeout=8, verify=False)
        soup = BeautifulSoup(r.text, "html.parser")
        title = soup.find("title")
        meta  = soup.find("meta", attrs={"name":"description"}) or soup.find("meta", attrs={"property":"og:description"})
        h1    = soup.find("h1")
        return {
            "portal_title": (title.get_text(strip=True)[:100] if title else ""),
            "meta_description": (meta.get("content","").strip()[:250] if meta else ""),
            "portal_h1": (h1.get_text(strip=True)[:100] if h1 else ""),
        }
    except: return {}

def _last_updated(soup):
    txt = soup.get_text(" ")
    m = re.search(r"Last\s+Updated\s*[:\-]?\s*\*?\*?([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})\*?\*?", txt, re.I)
    return m.group(1).strip() if m else ""

def scrape_igod():
    ts  = datetime.now(timezone.utc).isoformat()
    ses = requests.Session()
    log.info("Fetching IGOD: %s", IGOD_URL)
    try:
        r = ses.get(IGOD_URL, headers=HEADERS, timeout=15, verify=False)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        log.error("IGOD fetch failed: %s", e)
        return _fallback(ts)

    last_upd = _last_updated(soup)
    total_txt = ""
    m = re.search(r"(\d+)\s+Results?", soup.get_text(" "), re.I)
    if m: total_txt = m.group(0)

    main = soup.find(id="main-content") or soup.find("main") or soup
    stop = re.compile(r"new additions|in focus|connect with us|help us", re.I)
    anchors, seen, portals, pos = [], set(), [], 1

    for el in main.descendants:
        if not hasattr(el,"name"): continue
        if el.name in ("h2","h3","h4","h5") and stop.search(el.get_text(strip=True)): break
        if el.name == "a" and el.get("href"): anchors.append(el)

    for a in anchors:
        href = a.get("href","").strip()
        name = a.get_text(strip=True)
        if not href or not name or not href.startswith("http"): continue
        if SKIP_DOMAINS.search(href) or SKIP_TEXT.match(name) or len(name)<5: continue
        norm = href.rstrip("/").split("#")[0].lower()
        if norm in seen: continue
        seen.add(norm)
        domain = urlparse(href).netloc.lower()
        if not _is_raj(domain, name): continue
        meta = _fetch_meta(href, ses)
        portals.append({
            "id": f"igod_{pos}",
            "position": pos,
            "name": name,
            "url": href,
            "domain": domain,
            "category": _cat(name, domain),
            "description": meta.get("meta_description") or meta.get("portal_h1") or f"Official Rajasthan government portal: {name}",
            "portal_title": meta.get("portal_title",""),
            "directory_last_updated": last_upd,
            "total_portals_listed": total_txt,
            "status": "Active",
            "source": "igod.gov.in",
            "scraped_at": ts,
        })
        pos += 1

    log.info("IGOD: %d portals", len(portals))
    return portals if portals else _fallback(ts)

def _fallback(ts):
    known = [
        ("Jan Soochna Portal","https://jansoochna.rajasthan.gov.in","Transparency & RTI","Citizen transparency portal — RTI, beneficiary data, govt scheme info"),
        ("Labour Dept Management System","https://ldms.rajasthan.gov.in","Labour & Employment","Online portal for labour registration and welfare schemes"),
        ("Pregnancy, Child Tracking & Health","https://pctsrajmedical.rajasthan.gov.in","Health & Family Welfare","Track maternal & child health services across Rajasthan"),
        ("Pushkar Fair Portal","https://pushkarmela.rajasthan.gov.in","Tourism & Culture","Official Pushkar Mela registration and information portal"),
        ("Raj Nivesh Portal","https://rajnivesh.rajasthan.gov.in","Industry & Investment","Single window clearance for industrial investment in Rajasthan"),
        ("Rajasthan Civil Registration","https://pehchan.raj.nic.in","Civil Registration","Birth, death, marriage certificate registration"),
        ("Rajasthan Farmer Registry","https://rjfr.agristack.gov.in","Agriculture & Farmers","Digital registry of all farmers in Rajasthan"),
        ("Farmer Registry Camps Portal","https://rjfrc.rajasthan.gov.in","Agriculture & Farmers","Camp-based farmer registration and verification"),
        ("Rajasthan Recruitment Portal","https://recruitment.rajasthan.gov.in","Recruitment","Government job recruitment and exam notifications"),
        ("Rising Rajasthan Summit","https://rising.rajasthan.gov.in","Industry & Investment","Global Investment Summit — MoU tracking and investment pledges"),
        ("Work Accounts Management","https://wam.rajasthan.gov.in","Finance & Accounts","Government work accounts and payment management system"),
    ]
    return [{"id":f"igod_{i+1}","position":i+1,"name":n,"url":u,"domain":u.split("//")[-1].split("/")[0],"category":c,"description":d,"portal_title":"","directory_last_updated":"","total_portals_listed":"11 Results","status":"Active","source":"igod.gov.in (fallback)","scraped_at":ts} for i,(n,u,c,d) in enumerate(known)]
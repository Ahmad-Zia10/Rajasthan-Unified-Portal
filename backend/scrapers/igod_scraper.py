"""
igod_scraper.py
Scrapes igod.gov.in for Rajasthan government portals directory.
Extracts organization_name, department/ministry, category, and website_url.
"""
import re, logging, requests, time, urllib3
from datetime import datetime, timezone
from urllib.parse import urlparse
from bs4 import BeautifulSoup

urllib3.disable_warnings()

log = logging.getLogger("scraper.igod")
BASE_URL = "https://igod.gov.in"
IGOD_URL = "https://igod.gov.in/sg/RJ/SPMA/organizations"
HEADERS  = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
}

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

def scrape_igod():
    ts  = datetime.now(timezone.utc).isoformat()
    ses = requests.Session()
    log.info("Fetching IGOD Organizations: %s", IGOD_URL)
    
    portals = []
    seen = set()
    pos = 1
    
    current_url = IGOD_URL
    
    while current_url:
        try:
            log.info(f"Fetching {current_url}...")
            r = ses.get(current_url, headers=HEADERS, timeout=15, verify=False)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
        except Exception as e:
            log.error("IGOD fetch failed on %s: %s", current_url, e)
            return _fallback(ts) if not portals else portals
            
        search_rows = soup.find_all("div", class_="search-result-row")
        for row in search_rows:
            link_tag = row.find("a", class_="search-title")
            if not link_tag:
                continue
                
            href = link_tag.get("href", "").strip()
            
            # Clean text by removing any span output if needed
            name_text = ""
            for child in link_tag.children:
                if child.name is None:
                    txt = child.text.strip()
                    if txt:
                        name_text += " " + txt
            
            name = name_text.strip()
            # fallback string replace if children parsing fails
            if not name:
                name = link_tag.get_text(strip=True).replace("External link that opens in a new window", "").strip()
            
            if not href or not name or not href.startswith("http"): 
                continue
                
            norm = href.rstrip("/").split("#")[0].lower()
            if norm in seen: 
                continue
                
            seen.add(norm)
            domain = urlparse(href).netloc.lower()
            
            portals.append({
                "id": f"igod_{pos}",
                "organization_name": name,
                "department": "Government of Rajasthan", # explicit requirement
                "ministry": "Government of Rajasthan",
                "category": _cat(name, domain),
                "website_url": href,
                "domain": domain,
                "status": "Active",
                "source": "igod.gov.in",
                "scraped_at": ts,
            })
            pos += 1

        # Handling Pagination dynamically
        next_link_tag = soup.find("a", string=re.compile(r"Next", re.I))
        if next_link_tag and next_link_tag.get("href"):
            next_url = next_link_tag.get("href")
            # Usually pagination relies on parameters or absolute path
            if next_url.startswith("/"):
                current_url = BASE_URL + next_url
            elif next_url.startswith("http"):
                current_url = next_url
            else:
                current_url = None
            time.sleep(2)
        else:
            pagination = soup.find("ul", class_="pagination")
            if pagination:
                next_li = pagination.find("li", class_="next")
                if next_li and next_li.find("a"):
                    next_url = next_li.find("a").get("href")
                    if next_url.startswith("/"):
                        current_url = BASE_URL + next_url
                    elif next_url.startswith("http"):
                        current_url = next_url
                    else:
                        current_url = None
                    time.sleep(2)
                    continue
            current_url = None

    log.info("IGOD: %d organizations found", len(portals))
    return portals if portals else _fallback(ts)

def _fallback(ts):
    known = [
        ("Jan Soochna Portal","https://jansoochna.rajasthan.gov.in","Transparency & RTI"),
        ("Labour Department Management System (LDMS), Rajasthan","https://ldms.rajasthan.gov.in","Labour & Employment"),
        ("Pregnancy, Child Tracking & Health Services Management System (PCTS), Rajasthan","https://pctsrajmedical.rajasthan.gov.in","Health & Family Welfare"),
        ("Pushkar Fair, Rajasthan","https://pushkarmela.rajasthan.gov.in","Tourism & Culture"),
        ("Raj Nivesh Portal, Rajasthan","https://rajnivesh.rajasthan.gov.in","Industry & Investment"),
        ("Rajasthan Civil Registration System","https://pehchan.raj.nic.in","Civil Registration"),
        ("Rajasthan Farmer Registry","https://rjfr.agristack.gov.in/farmer-registry-rj/#","Agriculture & Farmers"),
        ("Rajasthan Farmer Registry Camps Portal","https://rjfrc.rajasthan.gov.in","Agriculture & Farmers"),
        ("Rajasthan Recruitment Portal","https://recruitment.rajasthan.gov.in","Recruitment"),
        ("Rising Rajasthan Global Investment Summit, Rajasthan","https://rising.rajasthan.gov.in","Industry & Investment"),
        ("Work Accounts Management System (WAM), Rajasthan","https://wam.rajasthan.gov.in","Finance & Accounts"),
    ]
    return [{
        "id": f"igod_{i+1}",
        "organization_name": n,
        "department": "Government of Rajasthan",
        "ministry": "Government of Rajasthan",
        "category": c,
        "website_url": u,
        "domain": u.split("//")[-1].split("/")[0],
        "status": "Active",
        "source": "igod.gov.in (fallback)",
        "scraped_at": ts
    } for i,(n,u,c) in enumerate(known)]
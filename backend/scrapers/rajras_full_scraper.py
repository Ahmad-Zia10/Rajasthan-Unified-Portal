"""
Production-ready RajRAS scheme scraper.

Pipeline:
1. Fetch all scheme links from RajRAS index page
2. Visit each scheme page with retry + timeout handling
3. Extract structured fields
4. Save dataset to backend/data/rajras_schemes.json
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag
from requests.adapters import HTTPAdapter
from tqdm import tqdm
from urllib3.util.retry import Retry


INDEX_URL = "https://rajras.in/ras/pre/rajasthan/adm/schemes/"
BASE_URL = "https://rajras.in"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "rajras_schemes.json"
REQUEST_TIMEOUT = 20
REQUEST_DELAY_SECONDS = 0.8

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "Connection": "keep-alive",
}

SKIP_PATH_PARTS = {
    "/ras/pre/rajasthan/adm/schemes/",
    "/category/",
    "/tag/",
    "/author/",
    "/feed/",
}

SECTION_KEYWORDS = {
    "benefits": [
        "benefit",
        "benefits",
        "लाभ",
        "advantage",
        "assistance",
        "subsidy",
        "incentive",
    ],
    "eligibility": [
        "eligibility",
        "eligible",
        "criteria",
        "who can apply",
        "qualification",
        "पात्रता",
        "beneficiary",
    ],
    "documents_required": [
        "document",
        "documents",
        "required documents",
        "necessary documents",
        "दस्तावेज",
        "proof",
        "certificate",
    ],
}

CATEGORY_MAP = [
    (r"health|medical|swasth|ayush", "Health"),
    (r"education|student|scholarship|school", "Education"),
    (r"agri|agriculture|kisan|farm|crop", "Agriculture"),
    (r"social|welfare|pension|widow|disabled|\bsc\b|\bst\b|\bobc\b", "Social Welfare"),
    (r"employment|labou?r|rozgar|skill", "Labour & Employment"),
    (r"housing|awas|urban", "Housing"),
    (r"water|jal|irrigation|sanitation", "Water & Irrigation"),
    (r"digital|it|e-mitra|technology", "Digital & IT"),
]

PROGRESS_KEYWORDS = [
    "implementation",
    "progress",
    "coverage",
    "covered",
    "completion",
    "completed",
    "achieved",
    "target",
    "beneficiaries covered",
    "enrolled",
    "registered",
    "saturation",
    "uptake",
]


log = logging.getLogger("scraper.rajras_full")


@dataclass
class ScraperConfig:
    timeout: int = REQUEST_TIMEOUT
    polite_delay: float = REQUEST_DELAY_SECONDS


def _get_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=4,
        backoff_factor=0.8,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(["GET"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=20)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update(HEADERS)
    return session


def _clean_text(text: Optional[str]) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def _is_probable_scheme_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc and "rajras.in" not in parsed.netloc:
        return False
    path = parsed.path.lower()
    if not path or path == "/":
        return False
    if any(part in path for part in SKIP_PATH_PARTS):
        return False
    if "/wp-" in path:
        return False
    return True


def _extract_main_content(soup: BeautifulSoup) -> Tag:
    content = (
        soup.select_one(".entry-content")
        or soup.select_one("article")
        or soup.select_one("main")
        or soup.body
    )
    return content if isinstance(content, Tag) else soup


def get_scheme_links(
    index_url: str = INDEX_URL,
    session: Optional[requests.Session] = None,
    config: Optional[ScraperConfig] = None,
) -> List[str]:
    config = config or ScraperConfig()
    own_session = session is None
    session = session or _get_session()

    try:
        response = session.get(index_url, timeout=config.timeout)
        response.raise_for_status()
    except requests.RequestException as exc:
        log.exception("Failed to fetch RajRAS index page: %s", exc)
        return []
    finally:
        if own_session:
            session.close()

    soup = BeautifulSoup(response.text, "html.parser")
    content = _extract_main_content(soup)

    links: Set[str] = set()
    for anchor in content.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        if not href:
            continue
        absolute_url = urljoin(BASE_URL, href)
        absolute_url = absolute_url.split("#", 1)[0].rstrip("/")
        if _is_probable_scheme_url(absolute_url):
            links.add(absolute_url)

    cleaned_links = sorted(links)
    log.info("Collected %s unique RajRAS scheme links", len(cleaned_links))
    return cleaned_links


def _iter_section_chunks(content: Tag) -> List[Tuple[str, List[str]]]:
    chunks: List[Tuple[str, List[str]]] = []
    current_heading = "General"
    current_lines: List[str] = []

    for node in content.descendants:
        if not isinstance(node, Tag):
            continue

        if node.name in {"h1", "h2", "h3", "h4"}:
            if current_lines:
                chunks.append((current_heading, current_lines))
                current_lines = []
            current_heading = _clean_text(node.get_text(" ", strip=True)) or "General"
            continue

        if node.name == "p":
            text = _clean_text(node.get_text(" ", strip=True))
            if len(text) > 20:
                current_lines.append(text)
        elif node.name in {"ul", "ol"}:
            for li in node.find_all("li", recursive=False):
                li_text = _clean_text(li.get_text(" ", strip=True))
                if li_text:
                    current_lines.append(li_text)

    if current_lines:
        chunks.append((current_heading, current_lines))
    return chunks


def _extract_progress_signal(chunks: List[Tuple[str, List[str]]]) -> Tuple[Optional[float], Optional[str]]:
    best_score = -1
    best_pct: Optional[float] = None
    best_source: Optional[str] = None

    for heading, lines in chunks:
        heading_lower = heading.lower()
        for line in lines:
            line_lower = line.lower()
            context = f"{heading_lower} {line_lower}"

            # Prefer percentage statements in progress/coverage context.
            pct_matches = re.findall(r"(\d{1,3}(?:\.\d+)?)\s*%", line)
            if pct_matches:
                for raw in pct_matches:
                    pct = float(raw)
                    if pct < 0 or pct > 100:
                        continue
                    kw_hits = sum(1 for kw in PROGRESS_KEYWORDS if kw in context)
                    if kw_hits == 0:
                        continue
                    score = 2 + kw_hits
                    if score > best_score:
                        best_score = score
                        best_pct = round(pct, 2)
                        best_source = _clean_text(line)[:240]

            # Fallback: derive percent from "x out of y" style counts.
            ratio = re.search(r"(\d{1,6})\s*(?:out of|of)\s*(\d{1,6})", line_lower)
            if ratio:
                num = float(ratio.group(1))
                den = float(ratio.group(2))
                if den > 0:
                    pct = (num / den) * 100.0
                    if 0 <= pct <= 100:
                        kw_hits = sum(1 for kw in PROGRESS_KEYWORDS if kw in context)
                        if kw_hits == 0:
                            continue
                        score = 1 + kw_hits
                        if score > best_score:
                            best_score = score
                            best_pct = round(pct, 2)
                            best_source = _clean_text(line)[:240]

    return best_pct, best_source


def extract_sections(soup: BeautifulSoup) -> Dict[str, Optional[object]]:
    content = _extract_main_content(soup)
    chunks = _iter_section_chunks(content)

    headings: List[str] = []
    description_parts: List[str] = []
    benefits: List[str] = []
    eligibility: List[str] = []
    documents: List[str] = []

    for heading, lines in chunks:
        if heading and heading != "General":
            headings.append(heading)
        heading_lower = heading.lower()

        if not description_parts and lines:
            description_parts.extend(lines[:2])

        if any(key in heading_lower for key in SECTION_KEYWORDS["benefits"]):
            benefits.extend(lines)
        if any(key in heading_lower for key in SECTION_KEYWORDS["eligibility"]):
            eligibility.extend(lines)
        if any(key in heading_lower for key in SECTION_KEYWORDS["documents_required"]):
            documents.extend(lines)

    # Fallback keyword extraction from all lines if heading-based detection misses data.
    if not benefits or not eligibility or not documents:
        all_lines = [line for _, lines in chunks for line in lines]
        for line in all_lines:
            ll = line.lower()
            if not benefits and any(k in ll for k in SECTION_KEYWORDS["benefits"]):
                benefits.append(line)
            if not eligibility and any(k in ll for k in SECTION_KEYWORDS["eligibility"]):
                eligibility.append(line)
            if not documents and any(k in ll for k in SECTION_KEYWORDS["documents_required"]):
                documents.append(line)

    # De-duplicate while preserving order.
    def uniq(items: List[str]) -> List[str]:
        seen: Set[str] = set()
        out: List[str] = []
        for item in items:
            cleaned = _clean_text(item)
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                out.append(cleaned)
        return out

    headings = uniq(headings)
    benefits = uniq(benefits)
    eligibility = uniq(eligibility)
    documents = uniq(documents)
    description = _clean_text(" ".join(description_parts[:3])) or None
    progress_pct, progress_source = _extract_progress_signal(chunks)

    return {
        "description": description,
        "headings": headings or None,
        "benefits": benefits or None,
        "eligibility": eligibility or None,
        "documents_required": documents or None,
        "progress_pct": progress_pct,
        "progress_source": progress_source,
    }


def _detect_category(name: str, headings: Optional[List[str]], description: Optional[str]) -> Optional[str]:
    text = f"{name} {' '.join(headings or [])} {description or ''}".lower()
    for pattern, label in CATEGORY_MAP:
        if re.search(pattern, text, re.IGNORECASE):
            return label
    return None


def scrape_scheme_page(
    url: str,
    session: Optional[requests.Session] = None,
    config: Optional[ScraperConfig] = None,
) -> Dict[str, Optional[object]]:
    config = config or ScraperConfig()
    own_session = session is None
    session = session or _get_session()

    try:
        response = session.get(url, timeout=config.timeout)
        response.raise_for_status()
    except requests.RequestException as exc:
        log.warning("Failed to fetch scheme page %s: %s", url, exc)
        return {
            "scheme_name": None,
            "description": None,
            "category": None,
            "headings": None,
            "benefits": None,
            "eligibility": None,
            "documents_required": None,
            "source": "RajRAS",
            "source_url": url,
        }
    finally:
        if own_session:
            session.close()

    soup = BeautifulSoup(response.text, "html.parser")
    title_node = soup.find("h1") or soup.find("title")
    scheme_name = _clean_text(title_node.get_text(" ", strip=True) if title_node else "")
    if scheme_name:
        scheme_name = re.sub(r"\s*[-|]\s*RajRAS.*$", "", scheme_name, flags=re.IGNORECASE).strip()

    sections = extract_sections(soup)
    category = _detect_category(
        scheme_name or "",
        sections.get("headings") if isinstance(sections.get("headings"), list) else None,
        sections.get("description") if isinstance(sections.get("description"), str) else None,
    )

    return {
        "scheme_name": scheme_name or None,
        "description": sections["description"],
        "category": category,
        "headings": sections["headings"],
        "benefits": sections["benefits"],
        "eligibility": sections["eligibility"],
        "documents_required": sections["documents_required"],
        "progress_pct": sections["progress_pct"],
        "progress_source": sections["progress_source"],
        "source": "RajRAS",
        "source_url": url,
    }


def save_json(data: List[Dict[str, object]], output_path: Path = OUTPUT_PATH) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    log.info("Saved %s RajRAS schemes to %s", len(data), output_path)


def run_scraper(
    index_url: str = INDEX_URL,
    output_path: Path = OUTPUT_PATH,
    config: Optional[ScraperConfig] = None,
) -> List[Dict[str, object]]:
    config = config or ScraperConfig()
    session = _get_session()
    run_ts = datetime.now(timezone.utc).isoformat()
    collected: List[Dict[str, object]] = []
    try:
        scheme_links = get_scheme_links(index_url=index_url, session=session, config=config)
        if not scheme_links:
            log.warning("No RajRAS scheme links found; creating empty dataset.")
            save_json([], output_path=output_path)
            return []

        for idx, url in enumerate(tqdm(scheme_links, desc="Scraping RajRAS schemes"), start=1):
            item = scrape_scheme_page(url, session=session, config=config)
            collected.append(
                {
                    "id": f"rajras_{idx:03d}",
                    "name": item["scheme_name"],
                    "category": item["category"],
                    "description": item["description"],
                    "headings": item["headings"],
                    "benefits": item["benefits"],
                    "eligibility": item["eligibility"],
                    "documents_required": item["documents_required"],
                    "progress_pct": item["progress_pct"],
                    "progress": (
                        f"{item['progress_pct']}%"
                        if isinstance(item.get("progress_pct"), (int, float))
                        else None
                    ),
                    "progress_source": item["progress_source"],
                    "progress_updated_at": run_ts if item["progress_pct"] is not None else None,
                    "source": item["source"],
                    "url": item["source_url"],
                }
            )
            time.sleep(config.polite_delay)

        # Deduplicate by URL; keep first seen.
        unique: List[Dict[str, object]] = []
        seen_urls: Set[str] = set()
        for row in collected:
            row_url = str(row.get("url") or "")
            if row_url in seen_urls:
                continue
            seen_urls.add(row_url)
            unique.append(row)

        save_json(unique, output_path=output_path)
        return unique
    finally:
        session.close()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    )
    run_scraper()


if __name__ == "__main__":
    main()

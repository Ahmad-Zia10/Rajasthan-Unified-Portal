# 🏛️ AI Chief of Staff — Rajasthan Dashboard

Real-time dashboard that scrapes **4 live government websites** and displays all data.

## 📘 Detailed RajRAS Documentation

For complete RajRAS pipeline implementation details (changes, architecture, stack, APIs, schema, and operations), see:

- `docs/RAJRAS_PRODUCTION_DOCUMENTATION.md`

## 📡 Data Sources

| Source | URL | Method |
|--------|-----|--------|
| IGOD Portal | igod.gov.in/sg/RJ/SPMA/organizations | requests + BeautifulSoup |
| RajRAS Schemes | rajras.in/ras/pre/rajasthan/adm/schemes/ | requests + BeautifulSoup |
| Jan Soochna Portal | jansoochna.rajasthan.gov.in/Scheme | API + Playwright fallback |
| MyScheme Rajasthan | myscheme.gov.in/search/state/Rajasthan | Official REST API |

---

## ⚡ Quick Start (VS Code)

### Prerequisites
- Python 3.10+ 
- Node.js 18+
- npm

---

### Step 1 — Backend Setup

Open a terminal in VS Code and run:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

✅ Test it: open http://localhost:8000 in browser — you'll see the API info.

> **Optional — Install Playwright** (for Jan Soochna Angular scraping):
> ```bash
> playwright install chromium
> ```
> Without this, Jan Soochna will use its API or fallback data instead.

---

### Step 2 — Frontend Setup

Open a **second** terminal in VS Code:

```bash
cd frontend
npm install
npm start
```

Browser opens automatically at **http://localhost:3000**

---

### Step 3 — Use the Dashboard

1. Dashboard loads — shows **"Backend Online"** in green header
2. Click **"⚡ Scrape All"** — scrapes all 4 sites in parallel
3. Watch **Live Log** tab for real-time progress
4. Data appears on **Dashboard**, **Schemes**, and **Analytics** tabs
5. Click **🔄 Refresh** to reload cached data
6. Click **"⚡ Scrape"** on individual source cards to re-scrape one source

---

## 📁 Project Structure

```
rajasthan-dashboard/
├── backend/
│   ├── main.py                    # FastAPI app — API routes
│   ├── requirements.txt           # Python dependencies
│   └── scrapers/
│       ├── __init__.py
│       ├── igod_scraper.py        # IGOD portal directory scraper
│       ├── rajras_scraper.py      # RajRAS scheme index scraper
│       ├── jansoochna_scraper.py  # Jan Soochna Portal scraper
│       └── myscheme_scraper.py    # MyScheme.gov.in scraper
│
├── frontend/
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.js
│       ├── index.css
│       └── App.js                 # Full React dashboard
│
├── start.bat    # Windows: start both servers
├── start.sh     # Mac/Linux: start both servers
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API info |
| GET | `/status` | Status of all 4 sources |
| POST | `/scrape/all` | Scrape all 4 sources in parallel |
| POST | `/scrape/{source_id}` | Scrape one source (igod, rajras, jansoochna, myscheme) |
| GET | `/data/{source_id}` | Get cached data for a source |
| GET | `/data` | Get all cached data |
| GET | `/docs` | Interactive Swagger API docs |

---

## 🛠️ Troubleshooting

**"Backend Offline" shown in dashboard**
→ Make sure `uvicorn main:app --reload` is running in the `backend/` folder

**Jan Soochna shows fallback data**
→ This is normal — JSP is an Angular app. Install Playwright for full scraping:
```bash
pip install playwright
playwright install chromium
```

**CORS errors in browser console**
→ The backend already has CORS enabled for all origins. Ensure backend is on port 8000.

**SSL errors when scraping**
→ Some govt sites have SSL issues. The scrapers use `verify=False` to handle this.

**npm install fails**
→ Make sure Node.js 18+ is installed: `node --version`

---

## 🎛️ Dashboard Features

- **Dashboard Tab** — KPIs, source cards, live data preview
- **Schemes Tab** — Full searchable scheme list with filters by source + category
- **Sources Tab** — Per-source scraping controls with status
- **Analytics Tab** — Bar charts and pie charts of categories
- **Live Log Tab** — Real-time scrape activity log
- **Auto-status polling** — Status bar updates every 5 seconds
- **Smart fallbacks** — If live scrape fails, falls back to known data

---

## 📦 Dependencies

**Backend:**
- FastAPI — REST API framework
- Uvicorn — ASGI server
- Requests — HTTP client
- BeautifulSoup4 — HTML parser
- Playwright — Browser automation (optional, for Jan Soochna)

**Frontend:**
- React 18
- Recharts — Charts
- Axios — HTTP client

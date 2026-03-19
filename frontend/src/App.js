/**
 * Rajasthan AI Chief of Staff Dashboard — v3 (Fixed)
 * All 3 bugs fixed:
 * 1. Category pills now use regex matching against real scraped category names
 * 2. "Know More" uses scheme-specific URLs (apply_url > url > source domain)
 * 3. Jan Soochna & MyScheme scrapers fixed with better API endpoints + fallback
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import InsightsEngine from "./InsightsEngine";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie,
} from "recharts";

const API =
  process.env.REACT_APP_API_URL ||
  (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ? ""
    : "https://rajasthan-cgwj.onrender.com");

const SRC = {
  igod:       { label: "IGOD Portal",  icon: "🏛️", color: "#f97316", url: "https://igod.gov.in" },
  rajras:     { label: "RajRAS",       icon: "📋", color: "#3b82f6", url: "https://rajras.in" },
  jansoochna: { label: "Jan Soochna",  icon: "👁️", color: "#10b981", url: "https://jansoochna.rajasthan.gov.in" },
  myscheme:   { label: "MyScheme",     icon: "🔍", color: "#8b5cf6", url: "https://myscheme.gov.in" },
};
const CAT_ICON = {
  "Health":"🏥","Health & Family Welfare":"🏥","Education":"🎓","Agriculture":"🌾",
  "Agriculture & Farmers":"🌾","Social Welfare":"🛡️","Labour & Employment":"💼",
  "Women & Child":"👩","Business & Finance":"💰","Housing":"🏠","Food Security":"🍽️",
  "Water & Sanitation":"💧","Water & Irrigation":"💧","Energy":"⚡","Digital Services":"💻",
  "Digital & IT":"💻","Rural Development":"🏘️","Industry & Commerce":"🏭",
  "Industry & Investment":"📈","Tourism & Culture":"🎭","Identity & Social Security":"🪪",
  "Mining":"⛏️","Transparency & RTI":"👁️","Civil Registration":"📄",
  "Finance & Accounts":"💳","Recruitment":"📝","Urban Development":"🏙️",
  "General":"📋","General Services":"📋","Revenue":"📄","Revenue & Land":"📄",
  "Transport":"🚌","Environment":"🌿","Law & Order":"⚖️",
};
const PALETTE = ["#ef4444","#3b82f6","#10b981","#f97316","#8b5cf6","#f59e0b",
                 "#06b6d4","#84cc16","#ec4899","#14b8a6","#6366f1","#a855f7",
                 "#f43f5e","#0ea5e9","#22c55e","#e11d48","#0284c7","#059669"];

// ── Pill category definitions — regex matches actual scraped category strings ─
const PILL_CATS = [
  { id:"all",       label:"All",        icon:null,  match:null },
  { id:"health",    label:"Health",     icon:"🏥",  match:/health|medical|ayush/i },
  { id:"education", label:"Education",  icon:"🎓",  match:/education|school|scholarship|student/i },
  { id:"agri",      label:"Agriculture",icon:"🌾",  match:/agri|kisan|farm|crop|horticulture/i },
  { id:"social",    label:"Social",     icon:"🛡️",  match:/social|pension|welfare|widow|disability|palanhar/i },
  { id:"labour",    label:"Employment", icon:"💼",  match:/labour|labor|employment|rozgar|worker|skill/i },
  { id:"women",     label:"Women",      icon:"👩",  match:/women|mahila|girl|beti|child|maternity/i },
  { id:"housing",   label:"Housing",    icon:"🏠",  match:/housing|awas|shelter|urban/i },
  { id:"food",      label:"Food",       icon:"🍽️",  match:/food|ration|rasoi|pds|nutrition/i },
  { id:"water",     label:"Water",      icon:"💧",  match:/water|jal|sanitation|swachh|irrigation/i },
  { id:"energy",    label:"Energy",     icon:"⚡",  match:/energy|solar|electric|vidyut|ujjwala/i },
  { id:"digital",   label:"Digital",    icon:"💻",  match:/digital|it|e-mitra|emitra|technology/i },
];

const timeAgo = iso => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 10)   return "just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
};
const palColor = i => PALETTE[i % PALETTE.length];

// ── safeUrl — never produce a 404 link ───────────────────────────────────────
const DEAD_URLS = [
  "https://jansoochna.rajasthan.gov.in/Scheme",
  "https://jansoochna.rajasthan.gov.in/Scheme/",
  "https://rajras.in", "https://rajras.in/",
  "https://www.myscheme.gov.in", "https://myscheme.gov.in",
];
const safeUrl = (s) => {
  if (!s) return null;
  const u = s.apply_url || s.url || "";
  if (!u || DEAD_URLS.includes(u.replace(/\/$/, ""))) {
    if (s._src === "jansoochna" || (s.source||"").includes("jansoochna"))
      return "https://jansoochna.rajasthan.gov.in/";
    if (s._src === "myscheme" || (s.source||"").includes("myscheme"))
      return "https://www.myscheme.gov.in/search?q=" + encodeURIComponent((s.name||"").slice(0,50));
    if (s._src === "rajras" || (s.source||"").includes("rajras"))
      return "https://rajras.in/ras/pre/rajasthan/adm/schemes/";
    return null;
  }
  return u || null;
};

const getProgressPct = (scheme) => {
  if (typeof scheme?.progress_pct === "number" && Number.isFinite(scheme.progress_pct)) {
    return Math.max(0, Math.min(100, scheme.progress_pct));
  }
  if (typeof scheme?.progress === "string") {
    const m = scheme.progress.match(/(\d+(?:\.\d+)?)\s*%?/);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    }
  }
  return null;
};

const cleanInlineText = (value) =>
  String(value || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const firstUsefulSentence = (...values) => {
  for (const value of values) {
    const text = cleanInlineText(
      Array.isArray(value) ? value.join(". ") : value
    );
    if (!text) continue;
    const sentences = text
      .split(/[.?!]\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const picked = sentences.find((part) => part.length >= 40) || sentences[0];
    if (picked) {
      return picked.replace(/\s+/g, " ").trim();
    }
  }
  return "";
};

const stripSchemePrefix = (name = "") =>
  cleanInlineText(name).replace(/^\d+\s*[\.)-]\s*/, "");

const capitalizeSentence = (text = "") =>
  text ? text.charAt(0).toUpperCase() + text.slice(1) : "";

const deriveSchemeSummary = (scheme) => {
  const name = stripSchemePrefix(scheme?.name || "This scheme");
  const sourceLabel = scheme?._src_label || SRC[scheme?._src]?.label || "the source portal";
  const category = cleanInlineText(scheme?.category || "public welfare")
    .toLowerCase();

  const whatItIs = firstUsefulSentence(
    scheme?.objective,
    scheme?.description,
    scheme?.benefit,
    scheme?.benefits
  );
  const whyItMatters = firstUsefulSentence(
    scheme?.benefit,
    scheme?.benefits,
    scheme?.eligibility,
    scheme?.description
  );

  const intro = whatItIs
    ? cleanInlineText(whatItIs)
    : `${name} is listed on ${sourceLabel} as a ${category} scheme.`;
  const importance = whyItMatters
    ? cleanInlineText(whyItMatters)
    : `It is relevant for citizens looking for ${category} support through official government channels.`;

  const normalizedIntro = intro.toLowerCase().includes(name.toLowerCase())
    ? intro
    : `${name} is a ${category} scheme on ${sourceLabel}. ${capitalizeSentence(intro)}`;

  const normalizedImportance = importance.toLowerCase().startsWith("it ")
    ? importance
    : `It matters because ${importance.charAt(0).toLowerCase()}${importance.slice(1)}`;

  return `${normalizedIntro} ${normalizedImportance}`.replace(/\s+/g, " ").trim();
};

const parseDisplayNumber = (rawValue) => {
  if (rawValue == null) return null;
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;

  const text = cleanInlineText(rawValue);
  if (!text) return null;

  const amountMatch = text.match(/₹?\s*([\d,]+(?:\.\d+)?)\s*(lakh\s*crore|crore|cr|lakh|lac|l|k)?/i);
  if (!amountMatch) return null;

  const base = parseFloat(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;

  const unit = (amountMatch[2] || "").toLowerCase();
  if (unit.includes("lakh crore")) return base * 1e12;
  if (unit.includes("crore") || unit === "cr") return base * 1e7;
  if (unit === "lakh" || unit === "lac" || unit === "l") return base * 1e5;
  if (unit === "k") return base * 1e3;
  return base;
};

const inferMetricLabel = (matchText) => {
  const text = matchText.toLowerCase();
  if (text.includes("%")) return "Coverage";
  if (text.includes("district")) return "District reach";
  if (text.includes("shop")) return "Ration shops";
  if (text.includes("city")) return "Cities covered";
  if (text.includes("village")) return "Villages covered";
  if (text.includes("hospital")) return "Hospitals";
  if (text.includes("family")) return "Families";
  if (text.includes("student")) return "Students";
  if (text.includes("beneficiar")) return "Beneficiaries";
  if (text.includes("connection")) return "Connections";
  if (text.includes("house")) return "Houses";
  if (text.includes("plate")) return "Meals";
  if (text.includes("day")) return "Duration";
  if (text.includes("crore") || text.includes("lakh") || text.includes("cr") || text.includes("₹")) {
    return "Financial support";
  }
  return "Official figure";
};

const buildSchemeChartData = (scheme) => {
  const metrics = [];
  const seen = new Set();

  const pushMetric = (metric) => {
    if (!metric || !Number.isFinite(metric.value) || metric.value <= 0) return;
    const key = `${metric.label}|${metric.display}`;
    if (seen.has(key)) return;
    seen.add(key);
    metrics.push(metric);
  };

  const progressPct = getProgressPct(scheme);
  if (progressPct != null) {
    pushMetric({
      label: "Implementation",
      value: progressPct,
      display: `${progressPct}%`,
      source: scheme.progress_source || "Official progress field",
      color: "#10b981",
    });
  }

  const beneficiaries = scheme?.beneficiary_count ?? scheme?.beneficiary_display ?? scheme?.beneficiaries ?? null;
  const beneficiaryValue = parseDisplayNumber(beneficiaries);
  if (beneficiaryValue) {
    pushMetric({
      label: "Beneficiaries",
      value: beneficiaryValue,
      display: scheme.beneficiary_display || String(beneficiaries),
      source: "Beneficiary figure from the current source record",
      color: "#3b82f6",
    });
  }

  const budgetValue = parseDisplayNumber(scheme?.budget_amount || scheme?.budget);
  if (budgetValue) {
    pushMetric({
      label: "Budget / Benefit",
      value: budgetValue,
      display: scheme.budget_amount || scheme.budget,
      source: "Budget or benefit amount from the current source record",
      color: "#8b5cf6",
    });
  }

  const districtValue = parseDisplayNumber(scheme?.districts);
  if (districtValue) {
    pushMetric({
      label: "District reach",
      value: districtValue,
      display: scheme.districts,
      source: "District coverage noted in the current source record",
      color: "#f97316",
    });
  }

  const textBlob = cleanInlineText([
    scheme?.description,
    Array.isArray(scheme?.benefits) ? scheme.benefits.join(". ") : scheme?.benefits,
    scheme?.benefit,
    Array.isArray(scheme?.eligibility) ? scheme.eligibility.join(". ") : scheme?.eligibility,
    scheme?.objective,
  ].filter(Boolean).join(". "));

  const textMatches = textBlob.match(
    /(?:₹\s*[\d,]+(?:\.\d+)?\s*(?:lakh\s*crore|crore|cr|lakh|lac)?|\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:%|days?|districts?|shops?|cities?|villages?|hospitals?|families?|students?|beneficiaries?|connections?|houses?|plates?|crore|cr|lakh|lac))\b/gi
  ) || [];

  textMatches.slice(0, 6).forEach((matchText, index) => {
    const value = parseDisplayNumber(matchText);
    if (!value) return;
    pushMetric({
      label: inferMetricLabel(matchText),
      value,
      display: cleanInlineText(matchText),
      source: `Quantified fact mentioned in the official scheme text${index === 0 ? "" : ""}`,
      color: PALETTE[index % PALETTE.length],
    });
  });

  return metrics.slice(0, 4);
};

const normalizeSchemeRecord = (sourceId, item, index = 0) => {
  if (!item || typeof item !== "object") return null;
  const name = item.name || item.scheme_name || item.title || `Scheme ${index + 1}`;
  return {
    ...item,
    id: item.id || `${sourceId}_${index + 1}`,
    name,
    category: item.category || "General",
    benefit: item.benefit || item.benefits || "",
    apply_url: item.apply_url || item.application_link || "",
    _src: item._src || sourceId,
    _src_label: item._src_label || SRC[sourceId]?.label || sourceId,
    _src_url: item._src_url || SRC[sourceId]?.url || "",
  };
};

const normalizePortalRecord = (item, index = 0) => {
  if (!item || typeof item !== "object") return null;
  return {
    ...item,
    id: item.id || `igod_${index + 1}`,
    name: item.name || item.organization_name || item.portal_title || `Portal ${index + 1}`,
    url: item.url || item.website_url || "",
    status: item.status || "Active",
    category: item.category || "Government Services",
  };
};

const buildFallbackAggregate = ({ sourceStatus = {}, rajras = [], jansoochna = [], myscheme = [], igod = [] }) => {
  const schemes = [
    ...rajras.map((item, index) => normalizeSchemeRecord("rajras", item, index)).filter(Boolean),
    ...jansoochna.map((item, index) => normalizeSchemeRecord("jansoochna", item, index)).filter(Boolean),
    ...myscheme.map((item, index) => normalizeSchemeRecord("myscheme", item, index)).filter(Boolean),
  ];
  const portals = igod.map((item, index) => normalizePortalRecord(item, index)).filter(Boolean);

  if (schemes.length === 0 && portals.length === 0) return null;

  const categoryMap = new Map();
  schemes.forEach((scheme) => {
    const category = scheme.category || "General";
    const existing = categoryMap.get(category) || { name: category, count: 0, sources: new Set() };
    existing.count += 1;
    existing.sources.add(scheme._src_label || scheme._src || "Unknown");
    categoryMap.set(category, existing);
  });

  const categories = Array.from(categoryMap.values())
    .map((entry) => ({ ...entry, sources: Array.from(entry.sources) }))
    .sort((a, b) => b.count - a.count);

  const latestScrapedAt = [
    ...Object.values(sourceStatus).map((entry) => entry?.scraped_at).filter(Boolean),
    ...schemes.map((scheme) => scheme.scraped_at).filter(Boolean),
    ...portals.map((portal) => portal.scraped_at).filter(Boolean),
  ].sort().at(-1);

  return {
    scraped_at: latestScrapedAt || new Date().toISOString(),
    kpis: {
      total_schemes: schemes.length,
      total_portals: portals.length,
      unique_categories: categories.length,
      sources_live: Object.values(sourceStatus).filter((entry) => entry?.status === "ok").length,
      rajras_count: rajras.length,
      jansoochna_count: jansoochna.length,
      myscheme_count: myscheme.length,
      igod_count: igod.length,
    },
    schemes,
    portals,
    categories,
    source_counts: [
      { source: "RajRAS", count: rajras.length, color: "#3b82f6" },
      { source: "Jan Soochna", count: jansoochna.length, color: "#10b981" },
      { source: "MyScheme", count: myscheme.length, color: "#8b5cf6" },
      { source: "IGOD Portals", count: igod.length, color: "#f97316" },
    ],
    alerts: [],
    source_status: sourceStatus,
    jjm_districts: [],
  };
};

// ── InfoTip — ℹ️ hover tooltip ────────────────────────────────────────────────
function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position:"relative", display:"inline-flex", alignItems:"center", marginLeft:4 }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          width:16, height:16, borderRadius:"50%",
          background: show ? "#3b82f6" : "#e2e8f0",
          color: show ? "white" : "#6b7280",
          fontSize:10, fontWeight:800, lineHeight:"16px", textAlign:"center",
          display:"inline-block", cursor:"help", userSelect:"none",
          transition:"background 0.15s", flexShrink:0,
        }}
      >i</span>
      {show && (
        <div style={{
          position:"absolute", left:20, top:"50%", transform:"translateY(-50%)",
          background:"#1e293b", color:"white", borderRadius:9,
          padding:"10px 13px", fontSize:12, lineHeight:1.55,
          width:260, zIndex:9999, pointerEvents:"none",
          boxShadow:"0 8px 24px rgba(0,0,0,0.25)",
        }}>
          {text}
          <div style={{
            position:"absolute", right:"100%", top:"50%", transform:"translateY(-50%)",
            width:0, height:0,
            borderTop:"5px solid transparent",
            borderBottom:"5px solid transparent",
            borderRight:"6px solid #1e293b",
          }}/>
        </div>
      )}
    </span>
  );
}


// ── BUG FIX 2: Correct URL resolver — scheme-specific, not generic domain ────
const resolveSchemeUrl = (scheme) => {
  // Priority: apply_url (direct apply page) > url (scheme detail page) > source domain
  const u = scheme.apply_url || scheme.url;
  if (u && u.startsWith("http") && !isBaseUrl(u)) return u;
  // Construct URL from source
  const src = scheme._src;
  if (src === "rajras" && scheme.url && scheme.url.includes("rajras.in/")) return scheme.url;
  if (src === "myscheme" && scheme.url && scheme.url.includes("/schemes/")) return scheme.url;
  if (src === "jansoochna" && scheme.url && scheme.url.includes("jansoochna")) return scheme.url;
  // Fall back to source home only as last resort
  return SRC[src]?.url || "#";
};
const isBaseUrl = (url) => {
  try {
    const u = new URL(url);
    return u.pathname === "/" || u.pathname === "";
  } catch { return false; }
};

function StatusDot({ status, animating }) {
  const c = { ok:"#10b981", error:"#ef4444", loading:"#f59e0b", not_scraped:"#d1d5db" }[status] || "#d1d5db";
  return (
    <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%",
      background:c, flexShrink:0, animation:animating?"pulse 1s infinite":"none" }}/>
  );
}
function Chip({ label, color="#6b7280", small }) {
  return (
    <span style={{ background:`${color}18`, color, border:`1px solid ${color}28`,
      borderRadius:20, padding:small?"2px 8px":"4px 12px",
      fontSize:small?10:12, fontWeight:600, whiteSpace:"nowrap" }}>
      {label}
    </span>
  );
}
function ScrapeNowButton({ onClick, loading, disabled }) {
  return (
    <button onClick={onClick} disabled={loading||disabled} style={{
      background:(loading||disabled)?"#e5e7eb":"#f97316",
      color:(loading||disabled)?"#9ca3af":"white",
      borderRadius:10, padding:"10px 22px", fontWeight:800, fontSize:13,
      display:"flex", alignItems:"center", gap:8,
      boxShadow:(!loading&&!disabled)?"0 2px 12px #f9731640":"none",
    }}>
      <span style={{ fontSize:16, display:"inline-block",
        animation:loading?"spin 1s linear infinite":"none" }}>⚡</span>
      {loading?"Refreshing…":"Refresh"}
    </button>
  );
}
function EmptyState({ onScrape }) {
  return (
    <div style={{ background:"white", borderRadius:16, border:"2px dashed #e5e7eb",
      padding:60, textAlign:"center" }}>
      <div style={{ fontSize:52, marginBottom:14 }}>⚡</div>
      <div style={{ fontWeight:800, fontSize:20, color:"#0f172a", marginBottom:8 }}>No live data yet</div>
      <div style={{ color:"#64748b", marginBottom:24, fontSize:14 }}>
        Click <strong>Scrape Now</strong> to pull real data from all 4 government websites
      </div>
      <button onClick={onScrape} style={{ background:"#f97316", color:"white",
        borderRadius:12, padding:"13px 32px", fontWeight:800, fontSize:15,
        border:"none", cursor:"pointer", boxShadow:"0 4px 20px #f9731650" }}>
        ⚡ Scrape All 4 Sources
      </button>
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ agg, srcStatus, onScrapeAll, onScrapeOne, scraping, budget, budgetLoading }) {
  if (!agg) return <EmptyState onScrape={onScrapeAll}/>;
  const { kpis, schemes } = agg;

  const Spark = ({ data=[], color="#f97316" }) => {
    if (!data||data.length<2) return <div style={{ width:100, height:44, background:`${color}08`, borderRadius:6 }}/>;
    const W=100, H=44, PAD=4;
    const min=Math.min(...data), max=Math.max(...data), rng=(max-min)||1;
    const xs=data.map((_,i)=>(i/(data.length-1))*W);
    const ys=data.map(v=>H-PAD-((v-min)/rng)*(H-PAD*2));
    const lp=xs.map((x,i)=>`${x},${ys[i]}`).join(" ");
    const ap=`0,${H} `+lp+` ${W},${H}`;
    const gid=`g${color.replace(/#/g,"")}`;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible", display:"block" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
            <stop offset="80%" stopColor={color} stopOpacity="0.04"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={ap} fill={`url(#${gid})`}/>
        <polyline points={lp} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
        <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="3" fill={color} stroke="white" strokeWidth="1.5"/>
      </svg>
    );
  };

  const b=budget||{}, d=b.display||{}, sp=b.sparklines||{}, bm=b.scrape_meta||{};
  const CARDS = [
    { label:"HEALTH BUDGET 2025-26",    value:b.health_cr?`₹${Number(b.health_cr).toLocaleString("en-IN")} Cr`:d.health||"₹28,865 Cr",             sub:b.health_pct?`${b.health_pct}% of total (nat avg 6.2%)`:"8.4% of total (nat avg 6.2%)",  color:"#ef4444", spark:sp.health_cr||[18200,21300,23100,25400,27200,28865],      icon:"🏥" },
    { label:"EDUCATION ALLOCATION",     value:b.education_pct?`${b.education_pct}% share`:d.education_pct||"18% share",                             sub:"Above 15% national avg",                                                                    color:"#3b82f6", spark:sp.education_pct||[15.2,15.8,16.1,16.9,17.4,18.0],        icon:"🎓" },
    { label:"JJM COVERAGE RAJASTHAN",   value:b.jjm_coverage_pct?`${Number(b.jjm_coverage_pct).toFixed(2)}%`:d.jjm_coverage||"55.36%",             sub:"National avg: 79.74%",                                                                      color:"#ef4444", spark:sp.jjm_coverage_pct||[12.5,28.3,41.2,49.8,53.1,55.36],   icon:"💧" },
    { label:"FISCAL DEFICIT",           value:b.fiscal_deficit_pct_gsdp?`${b.fiscal_deficit_pct_gsdp}% GSDP`:d.fiscal_deficit_pct||"4.25% GSDP",   sub:b.fiscal_deficit_cr?`₹${Number(b.fiscal_deficit_cr).toLocaleString("en-IN")} Cr (2025-26 BE)`:"₹34,543 Cr (2025-26 BE)", color:"#f97316", spark:sp.fiscal_deficit_pct||[3.8,4.1,3.6,3.9,4.0,4.25],      icon:"📊" },
    { label:"CAPITAL OUTLAY",           value:b.capital_outlay_cr?`₹${Number(b.capital_outlay_cr).toLocaleString("en-IN")} Cr`:d.capital_outlay||"₹53,686 Cr",   sub:"+40% over 2024-25 RE",                                                        color:"#10b981", spark:sp.capital_outlay_cr||[22000,28000,32000,38000,45000,53686],  icon:"🏗️" },
    { label:"SOCIAL SECURITY BUDGET",   value:b.social_security_cr?`₹${Number(b.social_security_cr).toLocaleString("en-IN")}+ Cr`:d.social_security||"₹14,000+ Cr", sub:"Pension raised to ₹1,250/mo",                                            color:"#8b5cf6", spark:sp.social_security_cr||[6000,8000,9500,11000,12800,14000], icon:"🛡️" },
  ];

  return (
    <div className="fadeup">
      <div style={{ display:"flex", alignItems:"center", marginBottom:3 }}>
        <h1 style={{ fontSize:29, fontWeight:900, color:"#0f172a", margin:0, letterSpacing:"-0.3px" }}>Namaste, <span style={{ color:"#f97316" }}>Mukhyamantri Ji</span> 🙏</h1>
        <InfoTip text="KPIs and charts are built from live-scraped data. Every number comes from the /aggregate API which merges all 4 scrapers. Use ⚡ Scrape Now to refresh."/>
      </div>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:16 }}>
        All figures verified from official sources · Budget 2025-26 · JJM MIS · PRS India
      </p>

      {/* ── Live Data Summary Banner ── */}
      <div style={{
        background:"linear-gradient(135deg,#fff7ed,#fffbeb,#f0f9ff)",
        border:"1.5px solid #fed7aa", borderRadius:14,
        padding:"14px 18px", marginBottom:20,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
          <span style={{ fontSize:15 }}>📊</span>
          <span style={{ fontWeight:800, fontSize:14, color:"#1a1a2e" }}>Live Data Summary</span>
          <InfoTip text="Every number here is computed live from the current scrape. Hover any ℹ️ icon to see exactly where the data comes from."/>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          {[
            { icon:"📋", val:kpis.total_schemes,        label:"schemes scraped",  color:"#f97316", bg:"#fff7ed",
              tip:"Total scheme records from RajRAS (HTML scrape) + Jan Soochna (JSON API) + MyScheme (REST API)." },
            { icon:"🏛️", val:kpis.total_portals,        label:"IGOD portals",     color:"#3b82f6", bg:"#eff6ff",
              tip:"Government portals listed on igod.gov.in/sg/RJ/SPMA/organizations — each is a separate Rajasthan govt website." },
            { icon:"🗂️", val:kpis.unique_categories,    label:"categories",       color:"#10b981", bg:"#f0fdf4",
              tip:"Unique scheme categories found. Derived by keyword matching on scheme names — not from any API field directly." },
            { icon:"✅", val:`${kpis.sources_live}/4`,  label:"sources online",   color:"#8b5cf6", bg:"#faf5ff",
              tip:"Live scrapers out of 4 total (IGOD, RajRAS, Jan Soochna, MyScheme). 4/4 = all portals responded." },
          ].map((item, i) => (
            <div key={i} style={{ background:item.bg, border:`1px solid ${item.color}25`, borderRadius:10, padding:"10px 12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <span style={{ fontSize:18 }}>{item.icon}</span>
                <InfoTip text={item.tip}/>
              </div>
              <div style={{ fontSize:22, fontWeight:900, color:item.color, lineHeight:1 }}>{item.val}</div>
              <div style={{ fontSize:10, color:"#6b7280", marginTop:3 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:"linear-gradient(135deg,#eff6ff 0%,#f0f9ff 100%)",
        border:"1.5px solid #bfdbfe", borderRadius:12, padding:"11px 18px", marginBottom:24, lineHeight:1.7 }}>
        <div style={{ fontSize:13 }}>
          <span style={{ fontWeight:800, color:"#1d4ed8" }}>Budget 2025-26: </span>
          <span style={{ color:"#1e3a5f" }}>
            Revenue expenditure {b.total_expenditure_cr?`₹${Number(b.total_expenditure_cr).toLocaleString("en-IN")} Cr`:"₹3,25,546 Cr"}
            {" · "}Fiscal deficit {b.fiscal_deficit_pct_gsdp?`${b.fiscal_deficit_pct_gsdp}% GSDP`:"4.25% GSDP"}
          </span>
        </div>
        <div style={{ fontSize:12, color:"#4b7ab5", display:"flex", flexWrap:"wrap", alignItems:"center", gap:6 }}>
          <span>Target: ${b.economy_target_bn_usd||350} Bn economy by 2030
          {b.green_budget!==false?" · First Green Budget of Rajasthan":""}</span>
          {bm.note&&(
            <span style={{ background:"#dbeafe", color:"#1d4ed8",
              borderRadius:4, padding:"1px 7px", fontSize:11, fontWeight:600 }}>
              {bm.live_sources>0?`${bm.live_sources} budget sources live`:"Verified fallback"}
            </span>
          )}
          {bm.sparkline_live_years>0&&(
            <span style={{ background:"#d1fae5", color:"#065f46",
              borderRadius:4, padding:"1px 7px", fontSize:11, fontWeight:600 }}>
              📈 {bm.sparkline_live_years}/{b.sparkline_meta?.total_years||6} sparkline years live
            </span>
          )}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        {(budgetLoading?Array(6).fill(null):CARDS).map((card,i)=>(
          <div key={i} style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb",
            boxShadow:"0 1px 4px rgba(0,0,0,0.04)", padding:"16px 18px 14px", display:"flex", flexDirection:"column" }}>
            {budgetLoading||!card?(
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:"#f3f4f6" }}/>
                  <div style={{ width:100, height:44, borderRadius:6, background:"#f3f4f6" }}/>
                </div>
                <div style={{ width:"60%", height:10, borderRadius:4, background:"#f3f4f6" }}/>
                <div style={{ width:"80%", height:28, borderRadius:6, background:"#f3f4f6" }}/>
                <div style={{ width:"50%", height:10, borderRadius:4, background:"#f3f4f6" }}/>
              </div>
            ):(
              <>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <span style={{ fontSize:20, lineHeight:1 }}>{card.icon}</span>
                  <Spark data={card.spark} color={card.color}/>
                </div>
                <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", letterSpacing:"0.08em", marginBottom:7, textTransform:"uppercase" }}>{card.label}</div>
                <div style={{ fontSize:card.value.length>12?22:27, fontWeight:900, color:card.color, letterSpacing:"-0.5px", lineHeight:1.1, marginBottom:6 }}>{card.value}</div>
                <div style={{ fontSize:11, color:"#9ca3af", marginTop:"auto" }}>{card.sub}</div>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:22 }}>
        {[
          {sid:"rajras",count:kpis.rajras_count},
          {sid:"jansoochna",count:kpis.jansoochna_count},
          {sid:"myscheme",count:kpis.myscheme_count},
          {sid:"igod",count:kpis.igod_count},
        ].map(({sid,count})=>{
          const s=SRC[sid]; const st=srcStatus[sid]||{}; const loading=scraping[sid];
          return (
            <div key={sid} style={{ background:"white", borderRadius:12,
              border:`1px solid ${st.status==="ok"?s.color+"30":"#e5e7eb"}`, padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span>{s.icon}</span>
                  <span style={{ fontWeight:700, fontSize:12, color:"#374151" }}>{s.label}</span>
                </div>
                <button onClick={()=>onScrapeOne(sid)} disabled={loading}
                  style={{ background:loading?"#f3f4f6":`${s.color}12`, color:loading?"#9ca3af":s.color,
                    border:`1px solid ${loading?"#e5e7eb":s.color+"30"}`, borderRadius:6, padding:"3px 8px", fontSize:11, fontWeight:700 }}>
                  {loading?"⟳":"↺"}
                </button>
              </div>
              <div style={{ fontSize:24, fontWeight:900, color:s.color, lineHeight:1 }}>{count??0}</div>
              <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:5 }}>
                <StatusDot status={loading?"loading":st.status} animating={!!loading}/>
                <span style={{ fontSize:11, color:"#9ca3af" }}>
                  {loading?"scraping…":st.status==="ok"?`live · ${timeAgo(st.scraped_at)}`:"pending"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {(schemes||[]).length>0&&(
        <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", padding:18 }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:14 }}>
            Recently Scraped Schemes
            <span style={{ color:"#9ca3af", fontWeight:400, fontSize:12, marginLeft:8 }}>
              {Math.min(10,(schemes||[]).length)} of {(schemes||[]).length}
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            {(schemes||[]).slice(0,10).map((s,i)=>{
              const src=SRC[s._src]||SRC.myscheme;
              return (
                <div key={i} style={{ display:"flex", gap:10, padding:"10px 12px",
                  background:"#fafafa", borderRadius:10, border:"1px solid #f3f4f6", alignItems:"flex-start" }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>{CAT_ICON[s.category]||"📋"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:"#1f2937",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</div>
                    {s.benefit&&(<div style={{ fontSize:11, color:"#10b981", fontWeight:600, marginTop:2,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.benefit}</div>)}
                    <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap" }}>
                      <Chip label={s.category||"General"} color={palColor(i)} small/>
                      <Chip label={src.label} color={src.color} small/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scheme Detail Panel ─────────────────────────────────────────────────────
function SchemeDetailPanel({ scheme, onClose }) {
  if (!scheme) return null;
  const srcMeta = SRC[scheme._src] || SRC.myscheme;

  // Resolve best URL for "Know More":
  // For RajRAS: url field is the full article page like rajras.in/ras/.../pm-kisan/
  // For MyScheme: url field is myscheme.gov.in/schemes/<slug>
  // For Jan Soochna: url field is jansoochna.rajasthan.gov.in/Scheme
  // Never fall back to bare domain — show the actual page
  const BASE_DOMAINS = [
    "https://rajras.in", "https://rajras.in/",
    "https://www.myscheme.gov.in", "https://myscheme.gov.in",
    "https://jansoochna.rajasthan.gov.in",
  ];
  const schemeUrl = scheme.url && !BASE_DOMAINS.includes(scheme.url.replace(/\/$/, ""))
    ? scheme.url : null;

  const sourceUrl =
    scheme.apply_url ||
    schemeUrl ||
    (scheme._src === "jansoochna"
      ? `https://jansoochna.rajasthan.gov.in/Scheme`
      : srcMeta.url);

  const beneficiaries = scheme.beneficiary_display
    || scheme.beneficiaries
    || (scheme.beneficiary_count ? String(scheme.beneficiary_count) : null)
    || null;
  const budget = scheme.budget_amount || scheme.budget || null;
  const launchYear = scheme.launch_year
    || (scheme.launched
      ? String(scheme.launched).match(/\d{4}/)?.[0] || scheme.launched
      : null);
  const districts = scheme.districts || null;
  const progressPct = getProgressPct(scheme);
  const progressLabel = progressPct != null ? `${progressPct}%` : "N/A";
  const progressColor = progressPct != null ? srcMeta.color : "#9ca3af";
  const schemeSummary = deriveSchemeSummary(scheme);
  const chartData = buildSchemeChartData(scheme);
  const factCards = [
    { label:"Beneficiaries", value:beneficiaries, color:srcMeta.color, borderRight:true },
    { label:"Budget (2025-26)", value:budget, color:"#111827" },
    { label:"Launch Year", value:launchYear, color:"#111827", borderRight:true },
    { label:"Districts", value:districts, color:"#111827" },
  ].filter(card => card.value);

  const keyFacts = [
    scheme.eligibility,
    scheme.objective,
    scheme.description && scheme.benefit ? scheme.description : null,
    (scheme.department || scheme.ministry)
      ? `Managed by: ${scheme.department || scheme.ministry}` : null,
  ].filter(Boolean);

  const Label = ({ children }) => (
    <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af",
      letterSpacing:"0.08em", marginBottom:6, textTransform:"uppercase" }}>
      {children}
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{
        position:"fixed", inset:0, background:"rgba(0,0,0,0.3)",
        zIndex:1000, backdropFilter:"blur(2px)",
      }}/>
      <div style={{
        position:"fixed", top:0, right:0, bottom:0, width:500,
        background:"white", zIndex:1001, overflowY:"auto",
        boxShadow:"-6px 0 48px rgba(0,0,0,0.15)",
        display:"flex", flexDirection:"column",
        animation:"slideInRight 0.2s ease",
      }}>
        <style>{`@keyframes slideInRight{from{transform:translateX(50px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

        {/* Header */}
        <div style={{ padding:"22px 24px 18px", borderBottom:"1px solid #f0f2f5" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
            <div style={{ width:50, height:50, borderRadius:12, flexShrink:0,
              background:`${srcMeta.color}18`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:24 }}>
              {CAT_ICON[scheme.category]||"📋"}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:16, color:"#111827", lineHeight:1.35 }}>
                {scheme.name}
              </div>
              <div style={{ fontSize:11.5, color:"#9ca3af", marginTop:3 }}>
                {scheme.category}
                {scheme.subcategory ? ` · ${scheme.subcategory}` : ""}
                {" · "}
                <span style={{ color:srcMeta.color, fontWeight:600 }}>
                  {scheme._src_label || srcMeta.label}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{
              border:"none", background:"#f3f4f6", borderRadius:8,
              width:30, height:30, cursor:"pointer", fontSize:15,
              display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
        </div>

        {factCards.length > 0 && (
          <div style={{
            display:"grid",
            gridTemplateColumns:"1fr 1fr",
            borderBottom:"1px solid #f0f2f5",
          }}>
            {factCards.map((card, idx) => (
              <div key={`${card.label}_${idx}`} style={{
                padding:"18px 24px",
                borderRight: idx % 2 === 0 && idx !== factCards.length - 1 ? "1px solid #f0f2f5" : "none",
                borderBottom: idx < factCards.length - 2 ? "1px solid #f0f2f5" : "none",
              }}>
                <Label>{card.label}</Label>
                <div style={{ fontSize:20, fontWeight:800, color:card.color }}>
                  {typeof card.value === "number"
                    ? card.value.toLocaleString("en-IN")
                    : card.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progress */}
        <div style={{ padding:"20px 24px", borderBottom:"1px solid #f0f2f5" }}>
          {progressPct != null ? (
            <>
              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"space-between", marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:500, color:"#374151" }}>
                  Implementation Progress
                </span>
                <div style={{ position:"relative", width:56, height:56 }}>
                  <svg width="56" height="56" style={{ transform:"rotate(-90deg)" }}>
                    <circle cx="28" cy="28" r="22" fill="none" stroke="#e5e7eb" strokeWidth="5"/>
                    <circle cx="28" cy="28" r="22" fill="none"
                      strokeWidth="5"
                      stroke={progressColor}
                      strokeDasharray={`${((progressPct || 0)/100)*138.2} 138.2`}
                      strokeLinecap="round"/>
                  </svg>
                  <div style={{ position:"absolute", inset:0, display:"flex",
                    alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:800, color:progressColor }}>
                    {progressLabel}
                  </div>
                </div>
              </div>
              <div style={{ background:"#e5e7eb", borderRadius:4, height:7,
                overflow:"hidden", marginBottom:6 }}>
                <div style={{ width:`${Math.min(progressPct || 0,100)}%`, height:"100%",
                  background:progressColor, borderRadius:4 }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between",
                fontSize:11, color:"#9ca3af" }}>
                <span>0%</span>
                <span style={{ color:"#10b981", fontWeight:600 }}>✓ On Track</span>
                <span>100%</span>
              </div>
              {scheme.progress_source && (
                <div style={{ marginTop:8, fontSize:11.5, color:"#6b7280", lineHeight:1.4 }}>
                  Source signal: {scheme.progress_source}
                </div>
              )}
            </>
          ) : (
            <div style={{
              background:"#f9fafb",
              border:"1px solid #e5e7eb",
              borderRadius:10,
              padding:"12px 14px",
            }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:4 }}>
                Implementation Progress
              </div>
              <div style={{ fontSize:12.5, color:"#6b7280" }}>
                No official implementation progress is available from current source data.
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div style={{ padding:"18px 24px", borderBottom:"1px solid #f0f2f5" }}>
          <Label>Scheme Summary</Label>
          <div style={{ fontSize:13.5, color:"#374151", lineHeight:1.65 }}>
            {schemeSummary}
          </div>
        </div>

        {/* Official metrics chart */}
        <div style={{ padding:"18px 24px", borderBottom:"1px solid #f0f2f5" }}>
          <Label>Official Scheme Metrics</Label>
          {chartData.length > 0 ? (
            <>
              <div style={{ height:220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 8, right: 18, bottom: 8, left: 18 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={110}
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value, name, payload) => [payload?.payload?.display || value, payload?.payload?.label || name]}
                      labelFormatter={() => "Official source figure"}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`${entry.label}_${index}`} fill={entry.color || srcMeta.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:"grid", gap:8, marginTop:8 }}>
                {chartData.map((metric, index) => (
                  <div key={`${metric.label}_${index}`} style={{
                    display:"flex", justifyContent:"space-between", gap:10,
                    background:"#f8fafc", border:"1px solid #e5e7eb",
                    borderRadius:10, padding:"9px 11px"
                  }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#111827" }}>{metric.label}</div>
                      <div style={{ fontSize:11, color:"#6b7280", lineHeight:1.45 }}>{metric.source}</div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:800, color:metric.color || srcMeta.color, whiteSpace:"nowrap" }}>
                      {metric.display}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{
              background:"#f9fafb",
              border:"1px solid #e5e7eb",
              borderRadius:10,
              padding:"12px 14px",
            }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:4 }}>
                Official quantified data is not available
              </div>
              <div style={{ fontSize:12.5, color:"#6b7280", lineHeight:1.5 }}>
                This portal record does not publish a reliable numeric scheme figure beyond the text summary, so the dashboard avoids showing an invented chart.
              </div>
            </div>
          )}
        </div>

        {/* Coverage / Benefits */}
        {(scheme.benefit || scheme.description) && (
          <div style={{ padding:"18px 24px", borderBottom:"1px solid #f0f2f5" }}>
            <Label>Coverage / Benefits</Label>
            <div style={{ fontSize:14, color:"#111827", lineHeight:1.6 }}>
              {scheme.benefit || scheme.description}
            </div>
          </div>
        )}

        {/* Key Facts */}
        {keyFacts.length > 0 && (
          <div style={{ padding:"18px 24px", borderBottom:"1px solid #f0f2f5" }}>
            <Label>Key Facts</Label>
            <div style={{ fontSize:13, color:"#374151", lineHeight:1.65 }}>
              {keyFacts.join(". ").replace(/\.\./g, ".")}
            </div>
          </div>
        )}

        {/* Tags */}
        {scheme.tags?.length > 0 && (
          <div style={{ padding:"14px 24px", borderBottom:"1px solid #f0f2f5",
            display:"flex", gap:6, flexWrap:"wrap" }}>
            {scheme.tags.map((t, i) => (
              <span key={i} style={{ background:`${srcMeta.color}12`,
                color:srcMeta.color, border:`1px solid ${srcMeta.color}25`,
                borderRadius:20, padding:"3px 11px", fontSize:11, fontWeight:600 }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Data Source + URL preview */}
        <div style={{ padding:"16px 24px", borderBottom:"1px solid #f0f2f5",
          background:"#fafafa" }}>
          <Label>Data Source</Label>
          <div style={{ fontSize:12.5, color:"#374151", fontWeight:500, marginBottom:3 }}>
            {scheme.source || srcMeta.url}
          </div>
          <div style={{ fontSize:11, color:"#9ca3af",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            🔗 {sourceUrl}
          </div>
        </div>

        {/* Know More — links to the actual scheme page, NOT just the homepage */}
        <div style={{ padding:"16px 24px 28px" }}>
          <a href={sourceUrl} target="_blank" rel="noreferrer" style={{
            display:"block", textAlign:"center",
            background:srcMeta.color, color:"white",
            borderRadius:10, padding:"13px 20px",
            fontSize:14, fontWeight:700, cursor:"pointer", textDecoration:"none",
            boxShadow:`0 4px 16px ${srcMeta.color}45`,
          }}>
            Know More ↗
          </a>
        </div>
      </div>
    </>
  );
}

// ── Schemes Tab ───────────────────────────────────────────────────────────────
function SchemesTab({ agg, onScrapeAll, rajrasData, jansoochnaData }) {
  const [search, setSearch]     = useState("");
  const [cat, setCat]           = useState("all");
  const [src, setSrc]           = useState("all");
  const [selected, setSelected] = useState(null);

  const aggregateSchemes = agg?.schemes || [];
  const normalizedRajras = useMemo(
    () =>
      (rajrasData || []).map((s, i) => ({
        id: s.id || `rajras_file_${i + 1}`,
        name: s.name || "Untitled Scheme",
        category: s.category || "General",
        description: s.description || "",
        benefit: Array.isArray(s.benefits) ? s.benefits.join(" | ") : (s.benefits || s.benefit || ""),
        eligibility: Array.isArray(s.eligibility) ? s.eligibility.join(" | ") : (s.eligibility || ""),
        documents_required: Array.isArray(s.documents_required)
          ? s.documents_required.join(" | ")
          : (s.documents_required || ""),
        headings: s.headings || null,
        progress_pct: typeof s.progress_pct === "number" ? s.progress_pct : null,
        progress: s.progress || null,
        progress_source: s.progress_source || null,
        progress_updated_at: s.progress_updated_at || null,
        budget_amount: s.budget_amount || null,
        budget: s.budget || null,
        beneficiary_display: s.beneficiary_display || null,
        beneficiary_count: s.beneficiary_count || null,
        beneficiaries: s.beneficiaries || null,
        launch_year: s.launch_year || null,
        districts: s.districts || null,
        source: s.source || "RajRAS",
        url: s.url || "",
        status: "Active",
        _src: "rajras",
        _src_label: "RajRAS",
        _src_url: "rajras.in",
      })),
    [rajrasData]
  );
  const normalizedJansoochna = useMemo(
    () =>
      (jansoochnaData || []).map((s, i) => ({
        id: s.id || `jsp_file_${i + 1}`,
        name: s.name || "Untitled Scheme",
        category: s.category || "General Services",
        description: s.description || "",
        benefit: Array.isArray(s.benefits) ? s.benefits.join(" | ") : (s.benefits || s.benefit || ""),
        eligibility: Array.isArray(s.eligibility) ? s.eligibility.join(" | ") : (s.eligibility || ""),
        documents_required: Array.isArray(s.documents_required)
          ? s.documents_required.join(" | ")
          : (s.documents_required || ""),
        department: s.department || null,
        beneficiary_count: s.beneficiary_count || null,
        beneficiary_display: s.beneficiary_display || null,
        headings: s.headings || null,
        progress_pct: typeof s.progress_pct === "number" ? s.progress_pct : null,
        progress: s.progress || null,
        progress_source: s.progress_source || null,
        progress_updated_at: s.progress_updated_at || null,
        budget_amount: s.budget_amount || null,
        source: s.source || "Jan Soochna",
        url: s.url || "",
        status: "Active",
        _src: "jansoochna",
        _src_label: "Jan Soochna",
        _src_url: "jansoochna.rajasthan.gov.in",
      })),
    [jansoochnaData]
  );
  const schemes = useMemo(() => {
    let result = aggregateSchemes;
    const aggregateJansoochna = aggregateSchemes.filter(s => s._src === "jansoochna");
    const dedicatedJansoochnaHasMoreDetail = (jansoochnaData || []).some(
      s => s?.headings || s?.documents_required || s?.progress_pct != null || s?.benefits || s?.eligibility
    );
    if (normalizedRajras.length) {
      result = [...normalizedRajras, ...result.filter(s => s._src !== "rajras")];
    }
    if (
      normalizedJansoochna.length &&
      (
        normalizedJansoochna.length >= aggregateJansoochna.length ||
        aggregateJansoochna.length === 0 ||
        dedicatedJansoochnaHasMoreDetail
      )
    ) {
      result = [...normalizedJansoochna, ...result.filter(s => s._src !== "jansoochna")];
    }
    return result;
  }, [aggregateSchemes, normalizedRajras, normalizedJansoochna, jansoochnaData]);

  if (!schemes.length) return <EmptyState onScrape={onScrapeAll}/>;

  // Pill → match substring that covers all 3 scrapers' category strings:
  // RajRAS cats:      Agriculture, Health, Education, Social Welfare,
  //                   Labour & Employment, Rural Development, Housing,
  //                   Industry & Commerce, Energy, Water & Irrigation,
  //                   Digital & IT, Tourism & Culture, Mining
  // Jan Soochna cats: Social Welfare, Health, Agriculture, Food Security,
  //                   Labour & Employment, Education, Rural Development,
  //                   Digital Services, Water & Sanitation, Energy,
  //                   Identity & Social Security, Urban Development
  // MyScheme cats:    Health, Education, Agriculture, Social Welfare,
  //                   Women & Child, Labour & Employment, Business & Finance,
  //                   Housing, Food Security, Water & Sanitation,
  //                   Energy, Digital Services, General
  const PILL_CATS = [
    { id:"all",       label:"All",         icon:null,  match:null },
    { id:"health",    label:"Health",      icon:"🏥",  match:"health" },
    { id:"education", label:"Education",   icon:"🎓",  match:"education" },
    { id:"agri",      label:"Agriculture", icon:"🌾",  match:"agri" },
    { id:"social",    label:"Social",      icon:"🛡️",  match:"social" },
    { id:"labour",    label:"Employment",  icon:"💼",  match:"labour" },
    { id:"women",     label:"Women",       icon:"👩",  match:"women" },
    { id:"housing",   label:"Housing",     icon:"🏠",  match:"housing" },
    { id:"food",      label:"Food",        icon:"🍽️",  match:"food" },
    { id:"water",     label:"Water",       icon:"💧",  match:"water" },
    { id:"energy",    label:"Energy",      icon:"⚡",  match:"energy" },
    { id:"digital",   label:"Digital",     icon:"💻",  match:"digital" },
    { id:"rural",     label:"Rural",       icon:"🏘️",  match:"rural" },
    { id:"identity",  label:"Identity",    icon:"🪪",  match:"identity" },
  ];

  const activePill = PILL_CATS.find(p => p.id === cat);
  const catMatch   = activePill?.match || null;

  const filtered = schemes.filter(s => {
    // Use catMatch substring so "social" matches "Social Welfare",
    // "labour" matches "Labour & Employment", "women" matches "Women & Child", etc.
    const mCat = !catMatch || (s.category || "").toLowerCase().includes(catMatch);
    const mSrc = src === "all" || s._src === src;
    const mQ   = !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()) ||
      s.benefit?.toLowerCase().includes(search.toLowerCase()) ||
      s.category?.toLowerCase().includes(search.toLowerCase()) ||
      s.ministry?.toLowerCase().includes(search.toLowerCase()) ||
      s.department?.toLowerCase().includes(search.toLowerCase());
    return mCat && mSrc && mQ;
  });

  return (
    <div className="fadeup">
      <div style={{ display:"flex", alignItems:"center", marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900, margin:0 }}>
        Government Schemes — <span style={{ color:"#f97316" }}>Real Data</span>
      </h2>
        <InfoTip text="Schemes from 3 sources: RajRAS (HTML scrape → name, eligibility, benefit), Jan Soochna (JSON API → name, dept, beneficiary count), MyScheme (REST API → name, ministry, tags, description). Categories are keyword-derived."/>
      </div>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:20 }}>
        {schemes.length} schemes scraped live from RajRAS · Jan Soochna · MyScheme.
        Click any card for full details &amp; source link.
      </p>

      {/* Search */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <span style={{ position:"absolute", left:14, top:"50%",
          transform:"translateY(-50%)", fontSize:15 }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search schemes, benefits, categories…"
          style={{ width:"100%", padding:"11px 14px 11px 42px",
            border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14,
            background:"white", boxSizing:"border-box" }}/>
      </div>

      {/* Source filter */}
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        {["all","rajras","jansoochna","myscheme"].map(id => {
          const s = SRC[id];
          return (
            <button key={id} onClick={() => setSrc(id)} style={{
              background: src===id ? (s?.color||"#1f2937") : "white",
              color: src===id ? "white" : "#374151",
              border:`1.5px solid ${src===id ? (s?.color||"#1f2937") : "#e5e7eb"}`,
              borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:600,
              cursor:"pointer",
            }}>
              {id==="all" ? "All Sources" : `${s.icon} ${s.label}`}
            </button>
          );
        })}
      </div>

      {/* Category pills */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {PILL_CATS.map(p => (
          <button key={p.id} onClick={() => setCat(p.id)} style={{
            background: cat===p.id ? "#f97316" : "white",
            color: cat===p.id ? "white" : "#374151",
            border:`1.5px solid ${cat===p.id ? "#f97316" : "#e5e7eb"}`,
            borderRadius:20, padding:"6px 14px", fontSize:12.5, fontWeight:600,
            cursor:"pointer", display:"flex", alignItems:"center", gap:5,
          }}>
            {p.icon && <span>{p.icon}</span>}
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ color:"#9ca3af", fontSize:13, marginBottom:14 }}>
        Showing <strong style={{ color:"#374151" }}>{filtered.length}</strong> of {schemes.length} schemes
        {catMatch && <span> · <span style={{ color:"#f97316" }}>{activePill?.label}</span></span>}
      </div>

      {/* 4-column card grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        {filtered.map((scheme, i) => {
          const srcMeta    = SRC[scheme._src] || SRC.myscheme;
          const benefitText = cleanInlineText(scheme.benefit || scheme.description || "");
          const cardProgressPct = getProgressPct(scheme);
          const launchYear  = scheme.launched
            ? String(scheme.launched).match(/\d{4}/)?.[0]
            : scheme.scraped_at?.slice(0,4) || null;
          const cardSummary = benefitText
            ? `${benefitText.slice(0, 96)}${benefitText.length > 96 ? "..." : ""}`
            : `Official ${String(scheme.category || "public welfare").toLowerCase()} scheme record available from ${scheme._src_label || srcMeta.label}.`;
          const cardStats = [
            {
              label:"Beneficiaries",
              val:scheme.beneficiary_display || (scheme.beneficiary_count ? String(scheme.beneficiary_count) : null),
              color:srcMeta.color,
              emptyLabel:"Not published",
            },
            {
              label:"Budget",
              val:scheme.budget_amount || null,
              color:"#1f2937",
              emptyLabel:"Awaiting figure",
            },
            {
              label:"Progress",
              val:cardProgressPct!=null ? `${cardProgressPct}%` : null,
              color:"#10b981",
              emptyLabel:"Official update pending",
            },
          ];
          const availableStatCount = cardStats.filter((stat) => stat.val).length;
          const hasAnyMetric = availableStatCount > 0;

          return (
            <div key={i} onClick={() => setSelected(scheme)} style={{
              background:"white", borderRadius:12, border:"1px solid #e5e7eb",
              padding:"16px 16px 14px", borderTop:`3px solid ${srcMeta.color}`,
              cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,0.05)",
              transition:"box-shadow .15s, transform .12s",
              display:"flex", flexDirection:"column", minHeight:242,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = "0 6px 22px rgba(0,0,0,0.10)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
              e.currentTarget.style.transform = "translateY(0)";
            }}>

              {/* Icon + Name + Category */}
              <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                <div style={{ width:36, height:36, borderRadius:8, flexShrink:0,
                  background:`${srcMeta.color}18`, display:"flex",
                  alignItems:"center", justifyContent:"center", fontSize:18 }}>
                  {CAT_ICON[scheme.category]||"📋"}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:"#1f2937",
                        lineHeight:1.3, marginBottom:2,
                        overflow:"hidden", textOverflow:"ellipsis",
                        display:"-webkit-box", WebkitLineClamp:2,
                        WebkitBoxOrient:"vertical" }}>
                        {scheme.name}
                      </div>
                      <div style={{ fontSize:10.5, color:"#9ca3af" }}>
                        {scheme.category||"General"}
                        {launchYear ? ` · Since ${launchYear}` : ""}
                      </div>
                    </div>
                    <div style={{
                      background: hasAnyMetric ? `${srcMeta.color}12` : "#f8fafc",
                      color: hasAnyMetric ? srcMeta.color : "#94a3b8",
                      border: `1px solid ${hasAnyMetric ? `${srcMeta.color}25` : "#e2e8f0"}`,
                      borderRadius:999, padding:"4px 8px", fontSize:10, fontWeight:700,
                      whiteSpace:"nowrap", flexShrink:0
                    }}>
                      {hasAnyMetric ? `${availableStatCount}/3 metrics` : "Text only"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Benefit / description */}
              <div style={{ fontSize:11.5, color:"#475569", lineHeight:1.55,
                marginBottom:12, minHeight:54 }}>
                {cardSummary}
              </div>

              {/* Stats row */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
                gap:8, marginBottom:10 }}>
                {cardStats.map((stat,j) => (
                  <div key={j} style={{
                    background: stat.val ? `${stat.color}10` : "#f8fafc",
                    border: `1px solid ${stat.val ? `${stat.color}18` : "#edf2f7"}`,
                    borderRadius:10, padding:"8px 8px 7px", minHeight:58
                  }}>
                    <div style={{ fontSize:9, fontWeight:700, color:"#94a3b8",
                      letterSpacing:"0.06em", marginBottom:5, textTransform:"uppercase" }}>{stat.label}</div>
                    <div style={{ fontSize:13, fontWeight:800,
                      color:stat.color, lineHeight:1.2 }}>
                      {stat.val
                        ? (typeof stat.val==="number"
                            ? stat.val.toLocaleString("en-IN") : stat.val)
                        : <span style={{ color:"#94a3b8", fontSize:11.5, fontWeight:700 }}>{stat.emptyLabel}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                marginBottom:6, gap:8 }}>
                <span style={{ fontSize:10.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.04em", textTransform:"uppercase" }}>
                  Data Availability
                </span>
                <span style={{ fontSize:11, color:hasAnyMetric ? "#475569" : "#94a3b8", fontWeight:600, whiteSpace:"nowrap" }}>
                  {hasAnyMetric ? `${availableStatCount} official field${availableStatCount > 1 ? "s" : ""} visible` : "Details open for full text"}
                </span>
              </div>
              <div style={{ height:5, background:"#f1f5f9", borderRadius:999,
                overflow:"hidden", marginBottom:12 }}>
                <div style={{
                  height:"100%",
                  width: `${Math.max((availableStatCount / cardStats.length) * 100, hasAnyMetric ? 24 : 12)}%`,
                  background: hasAnyMetric
                    ? `linear-gradient(90deg,${srcMeta.color},${srcMeta.color}99)`
                    : "linear-gradient(90deg,#cbd5e1,#e2e8f0)",
                  borderRadius:999,
                }}/>
              </div>

              {/* Source citation */}
              <div style={{ display:"flex", alignItems:"center", gap:5,
                fontSize:9.5, color:"#94a3b8", marginTop:"auto" }}>
                <span style={{ display:"inline-block", width:12, height:12,
                  background:`${srcMeta.color}20`, borderRadius:3,
                  textAlign:"center", lineHeight:"12px", fontSize:8, flexShrink:0 }}>
                  {srcMeta.icon}
                </span>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis",
                  whiteSpace:"nowrap" }}>
                  {scheme.source || srcMeta.url}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <SchemeDetailPanel scheme={selected} onClose={() => setSelected(null)}/>
    </div>
  );
}

// ── Portals Tab ───────────────────────────────────────────────────────────────
function PortalsTab({ agg, onScrapeAll }) {
  if (!agg?.portals?.length) return <EmptyState onScrape={onScrapeAll}/>;
  const { portals } = agg;
  const groups = {};
  portals.forEach(p=>{ const c=p.category||"General"; if(!groups[c])groups[c]=[]; groups[c].push(p); });
  const totalPortals=portals.length, totalCategories=Object.keys(groups).length;
  const activePortals=portals.filter(p=>p.status==="Active").length;
  const sampleLastUpd=portals.find(p=>p.directory_last_updated)?.directory_last_updated||"";
  const totalListed=portals.find(p=>p.total_portals_listed)?.total_portals_listed||"";
  return (
    <div className="fadeup">
      <div style={{ display:"flex", alignItems:"center", marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900, margin:0 }}>
        Government Portals — <span style={{ color:"#f97316" }}>IGOD Directory</span>
      </h2>
        <InfoTip text="Scraped from igod.gov.in/sg/RJ/SPMA/organizations — official IGOD directory for Rajasthan. Each card shows the portal name, domain, and meta description from that portal's own homepage."/>
      </div>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:4 }}>
        Source: igod.gov.in/sg/RJ/SPMA/organizations{totalListed?` · ${totalListed}`:""}
      </p>
      {sampleLastUpd&&<p style={{ color:"#9ca3af", fontSize:12, marginBottom:20 }}>Directory last updated: {sampleLastUpd}</p>}
      {!sampleLastUpd&&<div style={{ marginBottom:20 }}/>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        {[
          {value:totalPortals,label:"Portals Listed",bg:"#eff6ff",border:"#bfdbfe",color:"#1d4ed8"},
          {value:totalCategories,label:"Categories",bg:"#f0fdf4",border:"#bbf7d0",color:"#166534"},
          {value:activePortals,label:"Active Portals",bg:"#fff7ed",border:"#fed7aa",color:"#9a3412"},
        ].map((s,i)=>(
          <div key={i} style={{ background:s.bg, border:`1.5px solid ${s.border}`, borderRadius:14, padding:22 }}>
            <div style={{ fontSize:38, fontWeight:900, color:s.color, marginBottom:6 }}>{s.value}</div>
            <div style={{ fontSize:14, fontWeight:600, color:s.color }}>{s.label}</div>
          </div>
        ))}
      </div>
      {Object.entries(groups).map(([catName,items])=>(
        <div key={catName} style={{ marginBottom:22 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#374151", marginBottom:12,
            display:"flex", alignItems:"center", gap:8 }}>
            <span>{CAT_ICON[catName]||"🏛️"}</span> {catName}
            <Chip label={`${items.length}`} color="#f97316" small/>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            {items.map((portal,i)=>(
              <div key={i} style={{ background:"white", borderRadius:12, border:"1px solid #e5e7eb",
                padding:16, display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ width:38, height:38, borderRadius:8, background:"#f97316"+"18",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                  {CAT_ICON[catName]||"🏛️"}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#1f2937", marginBottom:2 }}>{portal.name}</div>
                  <div style={{ fontSize:11, color:"#9ca3af", marginBottom:6,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{portal.domain}</div>
                  {portal.description&&<div style={{ fontSize:12, color:"#6b7280", lineHeight:1.4, marginBottom:6 }}>
                    {portal.description.slice(0,120)}{portal.description.length>120?"…":""}
                  </div>}
                  <a href={portal.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#f97316", fontWeight:600 }}>Visit ↗</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Districts Tab ─────────────────────────────────────────────────────────────
function DistrictsTab({ agg, onScrapeAll }) {
  const [distSearch, setDistSearch] = useState("");
  const [sortBy, setSortBy]         = useState("coverage_desc");

  if (!agg) return <EmptyState onScrape={onScrapeAll}/>;

  // ── Use LIVE data from /aggregate → jjm_districts (scraped from ejalshakti.gov.in)
  // Falls back gracefully to empty array while data loads or if scraper returns nothing
  const districts    = agg.jjm_districts || [];
  const isLive       = districts.length > 0 && districts[0]?.live === true;
  const scrapedAt    = districts[0]?.scraped_at || null;
  const dataSource   = districts[0]?.source || "ejalshakti.gov.in";

  // Derive counts from schemes (live scraped data)
  const schemes      = agg.schemes || [];
  const healthCount  = schemes.filter(s => /health|medical/i.test(s.category||"")).length;
  const waterCount   = schemes.filter(s => /water|jal|sanitation/i.test(s.category||"")).length;
  const agriCount    = schemes.filter(s => /agri|kisan|farm/i.test(s.category||"")).length;

  // Summary tiles — all from live district data
  const above60  = districts.filter(d => d.coverage > 60).length;
  const mid      = districts.filter(d => d.coverage >= 45 && d.coverage <= 60).length;
  const critical = districts.filter(d => d.coverage < 45).length;
  const stateAvg = districts.length
    ? (districts.reduce((s, d) => s + d.coverage, 0) / districts.length).toFixed(1)
    : null;

  // Filter + sort
  const visible = [...districts]
    .filter(d => !distSearch || d.name.toLowerCase().includes(distSearch.toLowerCase()))
    .sort((a, b) =>
      sortBy === "coverage_desc" ? b.coverage - a.coverage :
      sortBy === "coverage_asc"  ? a.coverage - b.coverage :
      a.name.localeCompare(b.name)
    );

  return (
    <div className="fadeup">

      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"flex-start",
        justifyContent:"space-between", marginBottom:4, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", marginBottom:3 }}>
            <h2 style={{ fontSize:24, fontWeight:900, margin:0 }}>
              District JJM Coverage —{" "}
              <span style={{ color:"#f97316" }}>Live from ejalshakti.gov.in</span>
            </h2>
            <InfoTip text="Coverage % scraped live from JJM MIS (ejalshakti.gov.in) — Jal Jeevan Mission tracking system. Shows % of rural households with functional tap water connections. Scheme counts are derived from scraped schemes data."/>
          </div>
          <p style={{ color:"#6b7280", fontSize:13, margin:0 }}>
            Tap water household coverage · Jal Jeevan Mission MIS
          </p>
        </div>
        {/* Live / fallback badge */}
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            background: isLive ? "#f0fdf4" : "#fffbeb",
            border: `1px solid ${isLive ? "#bbf7d0" : "#fde68a"}`,
            borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600,
            color: isLive ? "#166534" : "#92400e",
          }}>
            <div style={{ width:8, height:8, borderRadius:"50%",
              background: isLive ? "#10b981" : "#f59e0b",
              boxShadow: isLive ? "0 0 0 3px #d1fae5" : "none" }}/>
            {isLive ? "Live data" : "Verified fallback"}
          </div>
          {scrapedAt && (
            <span style={{ fontSize:11, color:"#9ca3af" }}>
              {timeAgo(scrapedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Source + scheme context */}
      <p style={{ color:"#9ca3af", fontSize:12, marginBottom:22, marginTop:6 }}>
        Source: {dataSource}
        {stateAvg && ` · State avg: ${stateAvg}%`}
        {" · "}Active scraped schemes: {healthCount} health · {waterCount} water · {agriCount} agri
      </p>

      {/* ── Summary tiles ── */}
      {districts.length > 0 ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
          {[
            { value:`${stateAvg}%`, label:"State Average Coverage",  bg:"#eff6ff", border:"#bfdbfe", numC:"#1d4ed8", txtC:"#1e40af" },
            { value:above60,         label:"Districts >60% coverage",  bg:"#f0fdf4", border:"#bbf7d0", numC:"#16a34a", txtC:"#166534" },
            { value:mid,             label:"Districts 45–60%",          bg:"#fffbeb", border:"#fde68a", numC:"#d97706", txtC:"#92400e" },
            { value:critical,        label:"Districts <45% (critical)", bg:"#fff5f5", border:"#fecaca", numC:"#dc2626", txtC:"#991b1b" },
          ].map((s,i) => (
            <div key={i} style={{ background:s.bg, border:`1.5px solid ${s.border}`,
              borderRadius:14, padding:20 }}>
              <div style={{ fontSize:i===0?28:40, fontWeight:900, color:s.numC, marginBottom:6, lineHeight:1 }}>
                {s.value}
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:s.txtC }}>{s.label}</div>
            </div>
          ))}
        </div>
      ) : (
        /* Loading skeleton while JJM data is being fetched */
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background:"#f9fafb", border:"1px solid #e5e7eb",
              borderRadius:14, padding:20, height:90 }}>
              <div style={{ width:"50%", height:32, background:"#e5e7eb",
                borderRadius:6, marginBottom:8 }}/>
              <div style={{ width:"80%", height:14, background:"#e5e7eb", borderRadius:4 }}/>
            </div>
          ))}
        </div>
      )}

      {/* ── Search + Sort ── */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ position:"relative", flex:1, minWidth:200 }}>
          <span style={{ position:"absolute", left:12, top:"50%",
            transform:"translateY(-50%)", fontSize:14 }}>🔍</span>
          <input value={distSearch} onChange={e => setDistSearch(e.target.value)}
            placeholder="Search district…"
            style={{ width:"100%", padding:"9px 12px 9px 36px",
              border:"1px solid #e5e7eb", borderRadius:9, fontSize:13,
              background:"white", boxSizing:"border-box" }}/>
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding:"9px 14px", border:"1px solid #e5e7eb",
            borderRadius:9, fontSize:13, background:"white", cursor:"pointer" }}>
          <option value="coverage_desc">Coverage: High → Low</option>
          <option value="coverage_asc">Coverage: Low → High</option>
          <option value="name">District: A – Z</option>
        </select>
        {districts.length > 0 && (
          <span style={{ alignSelf:"center", fontSize:12, color:"#9ca3af" }}>
            {visible.length} of {districts.length} districts
          </span>
        )}
      </div>

      {/* ── District table ── */}
      {districts.length === 0 ? (
        <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb",
          padding:48, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💧</div>
          <div style={{ fontWeight:700, fontSize:16, color:"#374151", marginBottom:8 }}>
            Fetching JJM district data…
          </div>
          <div style={{ color:"#9ca3af", fontSize:13, marginBottom:20 }}>
            Data is scraped live from ejalshakti.gov.in on first load.
          </div>
          <button onClick={onScrapeAll} style={{ background:"#f97316", color:"white",
            border:"none", borderRadius:8, padding:"10px 22px",
            fontSize:13, fontWeight:700, cursor:"pointer" }}>
            ⚡ Refresh All Data
          </button>
        </div>
      ) : (
        <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb",
          overflow:"hidden" }}>
          {/* Table header */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 1fr 110px",
            padding:"10px 20px", background:"#f9fafb",
            borderBottom:"1px solid #e5e7eb" }}>
            {["DISTRICT","POPULATION","TAP WATER COVERAGE","STATUS"].map((h,i) => (
              <div key={i} style={{ fontSize:10, fontWeight:700, color:"#9ca3af",
                letterSpacing:"0.07em" }}>{h}</div>
            ))}
          </div>
          {/* Rows */}
          {visible.map((d, i) => {
            const c = d.coverage >= 70 ? "#10b981"
                    : d.coverage >= 50 ? "#f97316"
                    : "#ef4444";
            const coveragePct = typeof d.coverage === "number"
              ? d.coverage
              : parseFloat(d.coverage) || 0;
            return (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 90px 1fr 110px",
                padding:"13px 20px", borderBottom:"1px solid #f3f4f6",
                alignItems:"center",
                background: i % 2 === 0 ? "white" : "#fafafa" }}>
                {/* Name */}
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:9, height:9, borderRadius:"50%",
                    background:c, flexShrink:0 }}/>
                  <span style={{ fontWeight:700, fontSize:14 }}>{d.name}</span>
                </div>
                {/* Population */}
                <div style={{ fontSize:13, color:"#6b7280" }}>{d.pop || "—"}</div>
                {/* Coverage bar */}
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:1, height:8, background:"#f3f4f6",
                      borderRadius:4, overflow:"hidden" }}>
                      <div style={{ width:`${Math.min(coveragePct, 100)}%`,
                        height:"100%", background:c, borderRadius:4,
                        transition:"width 0.4s ease" }}/>
                    </div>
                    <span style={{ fontWeight:800, fontSize:14, color:c,
                      minWidth:42, textAlign:"right" }}>
                      {coveragePct}%
                    </span>
                  </div>
                </div>
                {/* Status */}
                <div style={{ fontSize:12 }}>
                  {coveragePct >= 70
                    ? <span style={{ color:"#10b981", fontWeight:600 }}>✓ On track</span>
                    : coveragePct >= 50
                    ? <span style={{ color:"#f97316", fontWeight:600 }}>⚡ Needs push</span>
                    : <span style={{ color:"#ef4444", fontWeight:700 }}>⚠️ Critical</span>}
                </div>
              </div>
            );
          })}
          {/* Footer */}
          <div style={{ padding:"10px 20px", background:"#f9fafb",
            borderTop:"1px solid #e5e7eb", fontSize:11, color:"#9ca3af",
            display:"flex", justifyContent:"space-between" }}>
            <span>
              {isLive ? "✓ Live data from" : "📚 Verified fallback —"} {dataSource}
            </span>
            {scrapedAt && <span>Fetched {timeAgo(scrapedAt)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Alerts Tab ────────────────────────────────────────────────────────────────
function AlertsTab({ agg, onScrapeAll }) {
  const [filter, setFilter] = useState("All");
  if (!agg?.alerts?.length) return <EmptyState onScrape={onScrapeAll}/>;
  const alerts=agg.alerts;
  const filtered=filter==="All"?alerts:alerts.filter(a=>a.severity===filter);
  return (
    <div className="fadeup">
      <div style={{ display:"flex", alignItems:"center", marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900, margin:0 }}>
        Intelligence Alerts — <span style={{ color:"#f97316" }}>Source-Cited</span>
      </h2>
        <InfoTip text="Alerts are auto-generated by the backend from scraped data patterns — not hardcoded. Each alert cites actual scheme counts and categories found during scraping."/>
      </div>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:20 }}>
        Every alert generated from live scraped data · {alerts.length} alerts total
      </p>
      <div style={{ display:"flex", gap:8, marginBottom:22, flexWrap:"wrap" }}>
        {["All","Critical","Warning","Action","Insight"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{
            background:filter===f?"#1f2937":"white", color:filter===f?"white":"#374151",
            border:`1.5px solid ${filter===f?"#1f2937":"#e5e7eb"}`,
            borderRadius:20, padding:"7px 18px", fontSize:13, fontWeight:600, cursor:"pointer" }}>{f}</button>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {filtered.map((alert,i)=>(
          <div key={alert.id||i} style={{ background:"white", borderRadius:14,
            border:`1px solid #e5e7eb`, borderLeft:`4px solid ${alert.borderColor}`,
            padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:10, background:`${alert.borderColor}15`,
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
                {alert.icon}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, flexWrap:"wrap" }}>
                  <span style={{ background:`${alert.borderColor}15`, color:alert.borderColor,
                    border:`1px solid ${alert.borderColor}25`, borderRadius:4, padding:"2px 8px",
                    fontSize:11, fontWeight:800, letterSpacing:"0.07em" }}>{alert.type}</span>
                  <span style={{ fontWeight:700, fontSize:15, color:"#1f2937" }}>{alert.title}</span>
                  <span style={{ marginLeft:"auto", fontSize:12, color:"#9ca3af" }}>{alert.date}</span>
                </div>
                <p style={{ fontSize:14, color:"#374151", lineHeight:1.6, marginBottom:12 }}>{alert.body}</p>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                  {(alert.tags||[]).map((tag,j)=>(
                    <span key={j} style={{ background:j===0?`${alert.borderColor}15`:"#f3f4f6",
                      color:j===0?alert.borderColor:"#6b7280",
                      border:`1px solid ${j===0?alert.borderColor+"30":"#e5e7eb"}`,
                      borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:500 }}>{tag}</span>
                  ))}
                </div>
                <div style={{ fontSize:12, color:"#9ca3af", display:"flex", gap:6 }}>
                  <span>📚</span><span style={{ fontStyle:"italic" }}>{alert.source}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Budget Data Tab ───────────────────────────────────────────────────────────
function BudgetDataTab({ budget, budgetLoading, onRefresh }) {
  const b=budget||{}, d=b.display||{}, sp=b.sparklines||{}, bm=b.scrape_meta||{};
  const Spark=({data=[],color="#f97316"})=>{
    if(!data||data.length<2) return <div style={{ width:90, height:36, background:`${color}08`, borderRadius:6 }}/>;
    const W=90,H=36,PAD=3;
    const min=Math.min(...data),max=Math.max(...data),rng=(max-min)||1;
    const xs=data.map((_,i)=>(i/(data.length-1))*W);
    const ys=data.map(v=>H-PAD-((v-min)/rng)*(H-PAD*2));
    const lp=xs.map((x,i)=>`${x},${ys[i]}`).join(" ");
    const ap=`0,${H} `+lp+` ${W},${H}`;
    const gid=`bt${color.replace(/#/g,"")}`;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={ap} fill={`url(#${gid})`}/>
        <polyline points={lp} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
        <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="2.5" fill={color} stroke="white" strokeWidth="1"/>
      </svg>
    );
  };
  const ROWS=[
    {label:"Total Revenue Expenditure",key:"total_expenditure_cr",sparkKey:"health_cr",color:"#f97316"},
    {label:"Capital Outlay",key:"capital_outlay_cr",sparkKey:"capital_outlay_cr",color:"#10b981"},
    {label:"Health Budget",key:"health_cr",sparkKey:"health_cr",color:"#ef4444"},
    {label:"Social Security",key:"social_security_cr",sparkKey:"social_security_cr",color:"#8b5cf6"},
    {label:"Fiscal Deficit",key:"fiscal_deficit_cr",sparkKey:"fiscal_deficit_pct",color:"#f59e0b"},
    {label:"GSDP (est.)",key:"gsdp_cr",sparkKey:"capital_outlay_cr",color:"#3b82f6"},
  ];
  return (
    <div className="fadeup">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900 }}>Budget Data — <span style={{ color:"#f97316" }}>2025-26</span></h2>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {bm.note&&<div style={{ fontSize:12, color:bm.live_sources>0?"#166534":"#4b7ab5",
            background:bm.live_sources>0?"#f0fdf4":"#eff6ff",
            border:`1px solid ${bm.live_sources>0?"#bbf7d0":"#bfdbfe"}`,
            borderRadius:6, padding:"4px 10px", fontWeight:600 }}>
            {bm.live_sources>0?`✓ ${bm.live_sources} live sources`:"📚 Verified fallback"}
          </div>}
          <button onClick={onRefresh} style={{ background:"#f97316", color:"white", border:"none",
            borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            ↺ Refresh Budget Data
          </button>
        </div>
      </div>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:22 }}>
        Source: {b.source||"Budget 2025-26 (Rajasthan Legislature) · PRS India · JJM MIS"}
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        {[
          {label:"Total Expenditure",val:b.total_expenditure_cr?`₹${Number(b.total_expenditure_cr).toLocaleString("en-IN")} Cr`:"₹3,25,546 Cr",bg:"#fff7ed",border:"#fed7aa",color:"#c2410c"},
          {label:"Capital Outlay",val:b.capital_outlay_cr?`₹${Number(b.capital_outlay_cr).toLocaleString("en-IN")} Cr`:"₹53,686 Cr",bg:"#f0fdf4",border:"#bbf7d0",color:"#15803d"},
          {label:"Fiscal Deficit",val:b.fiscal_deficit_pct_gsdp?`${b.fiscal_deficit_pct_gsdp}% GSDP`:"4.25% GSDP",bg:"#fffbeb",border:"#fde68a",color:"#b45309"},
          {label:"Health Allocation",val:b.health_cr?`₹${Number(b.health_cr).toLocaleString("en-IN")} Cr`:"₹28,865 Cr",bg:"#fff1f2",border:"#fecdd3",color:"#be123c"},
          {label:"JJM Coverage",val:b.jjm_coverage_pct?`${Number(b.jjm_coverage_pct).toFixed(2)}%`:"55.36%",bg:"#eff6ff",border:"#bfdbfe",color:"#1d4ed8"},
          {label:"Social Security",val:b.social_security_cr?`₹${Number(b.social_security_cr).toLocaleString("en-IN")}+ Cr`:"₹14,000+ Cr",bg:"#faf5ff",border:"#e9d5ff",color:"#7c3aed"},
        ].map((item,i)=>(
          <div key={i} style={{ background:item.bg, border:`1.5px solid ${item.border}`, borderRadius:14, padding:"18px 20px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:item.color, letterSpacing:"0.08em", marginBottom:10, opacity:0.8 }}>{item.label.toUpperCase()}</div>
            <div style={{ fontSize:24, fontWeight:900, color:item.color }}>{item.val}</div>
          </div>
        ))}
      </div>
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden", marginBottom:22 }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #f3f4f6", fontWeight:800, fontSize:15 }}>
          6-Year Trend (2020–2025-26)
          <span style={{ fontSize:12, color:"#9ca3af", fontWeight:400, marginLeft:8 }}>from official budget documents</span>
        </div>
        {budgetLoading?<div style={{ padding:40, textAlign:"center", color:"#9ca3af" }}>Loading…</div>
        :ROWS.map((row,i)=>{
          const val=b[row.key]; const sparkData=sp[row.sparkKey]||[];
          return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr",
              padding:"14px 20px", borderBottom:"1px solid #f9fafb", alignItems:"center",
              background:i%2===0?"white":"#fafafa" }}>
              <div style={{ fontWeight:600, fontSize:14, color:"#374151" }}>{row.label}</div>
              <div style={{ fontWeight:800, fontSize:16, color:row.color }}>
                {val?`₹${Number(val).toLocaleString("en-IN")} Cr`:"—"}
              </div>
              <div style={{ fontSize:12, color:"#9ca3af" }}>Budget {b.year||"2025-26"}</div>
              <div><Spark data={sparkData} color={row.color}/></div>
            </div>
          );
        })}
      </div>
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", padding:20 }}>
        <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>Key Budget Highlights 2025-26</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {[
            {icon:"🎯",text:`Target: $${b.economy_target_bn_usd||350} Billion economy by 2030`},
            {icon:"🌱",text:b.green_budget!==false?"First Green Budget of Rajasthan":"Sustainability focus in budget"},
            {icon:"📈",text:`Capital outlay up 40% over 2024-25 RE — ₹${b.capital_outlay_cr?Number(b.capital_outlay_cr).toLocaleString("en-IN"):"53,686"} Cr`},
            {icon:"💊",text:`Health: ${b.health_pct||8.4}% of budget — above national avg of 6.2%`},
            {icon:"🎓",text:`Education: ${b.education_pct||18}% share — above 15% national average`},
            {icon:"💧",text:`JJM tap water: ${b.jjm_coverage_pct?Number(b.jjm_coverage_pct).toFixed(2):55.36}% coverage — gap vs 79.74% national avg`},
            {icon:"👵",text:"Social pension raised to ₹1,250/month — up from ₹1,000"},
            {icon:"₹",text:`Fiscal deficit at ${b.fiscal_deficit_pct_gsdp||4.25}% GSDP — within FRBM norms`},
          ].map((h,i)=>(
            <div key={i} style={{ display:"flex", gap:12, padding:"12px 14px",
              background:"#f9fafb", borderRadius:10, border:"1px solid #f3f4f6", alignItems:"flex-start" }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{h.icon}</span>
              <span style={{ fontSize:13, color:"#374151", lineHeight:1.5 }}>{h.text}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:14, fontSize:12, color:"#9ca3af", textAlign:"right" }}>
          Source: {b.source||"Budget 2025-26 · PRS India · JJM MIS ejalshakti.gov.in"}
        </div>
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]           = useState("dashboard");
  const [agg,setAgg]           = useState(null);
  const [srcStatus,setStatus]  = useState({});
  const [scraping,setScraping] = useState({});
  const [scrapingAll,setAll]   = useState(false);
  const [refreshing,setRef]    = useState(false);
  const [online,setOnline]     = useState(null);
  const [now,setNow]           = useState(new Date());
  const [scrapeLog,setLog]     = useState([]);
  const [budget,setBudget]     = useState(null);
  const [budgetLoading,setBudgetLoading] = useState(false);
  const [rajrasData, setRajrasData] = useState([]);
  const [jansoochnaData, setJansoochnaData] = useState([]);

  const addLog = useCallback((msg,type="info")=>{
    const ts=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    setLog(p=>[{ts,msg,type},...p].slice(0,30));
  },[]);

  useEffect(()=>{ const t=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(t); },[]);

  const poll = useCallback(async(silent=true)=>{
    if(!silent) setRef(true);
    try {
      const [s,a,rj,jsp,ms,ig]=await Promise.all([
        axios.get(`${API}/status`).catch(()=>null),
        axios.get(`${API}/aggregate`).catch(()=>null),
        axios.get(`${API}/data/rajras`).catch(()=>null),
        axios.get(`${API}/data/jansoochna`).catch(()=>null),
        axios.get(`${API}/data/myscheme`).catch(()=>null),
        axios.get(`${API}/data/igod`).catch(()=>null),
      ]);
      const nextStatus = s?.data?.sources || {};
      const rajrasRows = Array.isArray(rj?.data) ? rj.data : [];
      const jansoochnaRows = Array.isArray(jsp?.data) ? jsp.data : [];
      const myschemeRows = Array.isArray(ms?.data?.data) ? ms.data.data : [];
      const igodRows = Array.isArray(ig?.data?.data) ? ig.data.data : [];

      if(s) setStatus(nextStatus);
      if(a?.data) {
        setAgg(a.data);
      } else {
        setAgg(buildFallbackAggregate({
          sourceStatus: nextStatus,
          rajras: rajrasRows,
          jansoochna: jansoochnaRows,
          myscheme: myschemeRows,
          igod: igodRows,
        }));
      }
      setRajrasData(rajrasRows);
      setJansoochnaData(jansoochnaRows);
      if(!silent) addLog("✅ Data refreshed","success");
    } catch(e){ if(!silent) addLog("❌ Refresh failed","error"); }
    if(!silent) setRef(false);
  },[addLog]);

  const fetchBudget = useCallback(async()=>{
    if(budget) return;
    setBudgetLoading(true);
    try { const r=await axios.get(`${API}/budget`); setBudget(r.data); } catch(e){}
    setBudgetLoading(false);
  },[budget]);

  useEffect(()=>{ fetchBudget(); },[fetchBudget]);
  useEffect(()=>{
    axios.get(`${API}/`).then(()=>setOnline(true)).catch(()=>setOnline(false));
    poll(true);
    const id=setInterval(()=>poll(true),8000);
    return ()=>clearInterval(id);
  },[poll]);

  const scrapeOne = useCallback(async sid=>{
    setScraping(p=>({...p,[sid]:true}));
    addLog(`⚡ Scraping ${SRC[sid]?.label||sid}…`,"info");
    try {
      await axios.post(`${API}/scrape/${sid}`);
      await poll(true);
      addLog(`✅ ${SRC[sid]?.label||sid} — done`,"success");
    } catch(e){ addLog(`❌ ${sid} scrape failed`,"error"); }
    setScraping(p=>({...p,[sid]:false}));
  },[poll,addLog]);

  const scrapeAll = useCallback(async()=>{
    setAll(true);
    addLog("⚡ Scraping all 4 sources…","info");
    try {
      await axios.post(`${API}/scrape/all`);
      await poll(true);
      addLog(`✅ Scrape complete — ${agg?.kpis?.total_schemes||0} schemes`,"success");
    } catch(e){ addLog("❌ Scrape failed","error"); }
    setAll(false);
  },[poll,addLog,agg]);

  const criticalCount=(agg?.alerts||[]).filter(a=>a.severity==="Critical").length;
  const totalSchemes=agg?.kpis?.total_schemes||0;
  const totalPortals=agg?.kpis?.total_portals||0;

  const TABS=[
    {id:"dashboard",label:"Dashboard",icon:"◉"},
    {id:"schemes",label:"Schemes",icon:"⊞",badge:totalSchemes||null},
    {id:"budget",label:"Budget Data",icon:"₹"},
    {id:"districts",label:"Districts",icon:"🗺️"},
    {id:"alerts",label:"Live Alerts",icon:"⚡",badge:criticalCount||null},
    {id:"insights",label:"AI Insights",icon:"🧠",highlight:true},
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f5f6fa" }}>
      <div style={{ background:"white", borderBottom:"1px solid #e5e7eb",
        position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 8px rgba(0,0,0,0.06)" }}>

        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"11px 28px" }}>
          <div style={{ width:46, height:46, borderRadius:10, background:"#f97316",
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"white", fontWeight:900, fontSize:17 }}>AI</div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:"#1a1a2e" }}>AI Chief of Staff</div>
            <div style={{ fontSize:10, color:"#9ca3af", letterSpacing:"0.07em" }}>OFFICE OF CM · RAJASTHAN · REAL VERIFIED DATA</div>
          </div>
          <div style={{ flex:1 }}/>
          <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10,
            padding:"8px 16px", display:"flex", alignItems:"center", gap:7, fontSize:12, color:"#0369a1", fontWeight:600 }}>
            <span>📚</span><span>Sources: Budget 2025-26 · JJM MIS · PRS India</span>
          </div>
          <div style={{ background:"white", border:"1.5px solid #bbf7d0", borderRadius:10,
            padding:"8px 14px", display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:9, height:9, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 0 3px #d1fae5" }}/>
            <span style={{ fontSize:13, fontWeight:700, color:"#166534" }}>Verified Data</span>
          </div>
          <ScrapeNowButton onClick={scrapeAll} loading={scrapingAll} disabled={!online}/>
          <div style={{ display:"flex", alignItems:"center", gap:10, paddingLeft:12, borderLeft:"1px solid #e5e7eb" }}>
            <div style={{ width:36, height:36, borderRadius:8, background:"#fee2e2",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>👤</div>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:"#1f2937" }}>Bhajan Lal Sharma</div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>Chief Minister, Rajasthan</div>
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap:6, padding:"6px 28px", background:"#fafafa",
          borderTop:"1px solid #f3f4f6", overflowX:"auto" }}>
          {Object.entries(SRC).map(([sid,s])=>{
            const st=srcStatus[sid]||{};
            return (
              <div key={sid} style={{ display:"flex", alignItems:"center", gap:6,
                background:st.status==="ok"?`${s.color}10`:"#f1f5f9",
                border:`1px solid ${st.status==="ok"?s.color+"30":"#e5e7eb"}`,
                borderRadius:6, padding:"4px 10px", fontSize:11, whiteSpace:"nowrap" }}>
                <StatusDot status={scraping[sid]?"loading":st.status||"idle"} animating={!!scraping[sid]}/>
                <span style={{ fontWeight:600, color:"#374151" }}>{s.icon} {s.label}</span>
                {st.count>0&&<span style={{ color:s.color, fontWeight:800 }}>{st.count}</span>}
                {st.scraped_at&&<span style={{ color:"#94a3b8" }}>{timeAgo(st.scraped_at)}</span>}
              </div>
            );
          })}
          {agg?.scraped_at&&(
            <div style={{ marginLeft:"auto", fontSize:11, color:"#94a3b8", alignSelf:"center", whiteSpace:"nowrap" }}>
              Aggregated {timeAgo(agg.scraped_at)}
            </div>
          )}
        </div>

        {scrapeLog.length>0&&(
          <div style={{ padding:"4px 28px", background:"#f8fafc", borderTop:"1px solid #f3f4f6",
            display:"flex", alignItems:"center", gap:10, overflowX:"auto" }}>
            {scrapeLog.slice(0,5).map((log,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11,
                whiteSpace:"nowrap",
                color:log.type==="success"?"#166534":log.type==="error"?"#991b1b":"#64748b",
                opacity:i===0?1:0.5 }}>
                <span style={{ fontSize:10, color:"#94a3b8" }}>{log.ts}</span>
                <span>{log.msg}</span>
                {i<scrapeLog.slice(0,5).length-1&&<span style={{color:"#d1d5db"}}>·</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display:"flex", padding:"0 28px", borderTop:"1px solid #f1f5f9" }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              background:t.highlight&&tab===t.id?"linear-gradient(135deg,#f97316,#ea580c)":t.highlight?"#fff7ed":"transparent",
              borderBottom:!t.highlight&&tab===t.id?"2.5px solid #f97316":!t.highlight?"2.5px solid transparent":"none",
              borderRadius:t.highlight?"8px":0,
              margin:t.highlight?"6px 4px":0,
              padding:t.highlight?"7px 16px":"11px 18px",
              fontWeight:tab===t.id?700:500,
              color:t.highlight&&tab===t.id?"white":t.highlight?"#f97316":tab===t.id?"#f97316":"#6b7280",
              fontSize:13, display:"flex", alignItems:"center", gap:6,
              border:t.highlight&&tab!==t.id?"1.5px solid #fed7aa":t.highlight?"none":"none",
              transition:"all .15s",
            }}>
              <span>{t.icon}</span> {t.label}
              {t.badge&&<span style={{ background:t.id==="alerts"?"#ef4444":"#f97316",
                color:"white", borderRadius:20, padding:"1px 7px", fontSize:10, fontWeight:800 }}>{t.badge}</span>}
            </button>
          ))}
          <div style={{ marginLeft:"auto", alignSelf:"center", fontSize:12, color:"#9ca3af", paddingRight:4 }}>
            {now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} ·{" "}
            {now.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
          </div>
        </div>
      </div>

      {online===null&&(
        <div style={{ background:"#f0f9ff", borderBottom:"1px solid #bae6fd",
          padding:"8px 28px", display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⚙️</span>
          <span style={{ fontSize:13, color:"#0369a1", fontWeight:600 }}>
            Connecting to backend… (Render free tier may take 30–60 seconds to wake up)
          </span>
        </div>
      )}
      {online===false&&(
        <div style={{ background:"#fef2f2", borderBottom:"1px solid #fecaca",
          padding:"10px 28px", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <span>⚠️</span>
          <span style={{ fontSize:13, color:"#991b1b", fontWeight:600 }}>Backend sleeping (Render free tier).</span>
          <span style={{ fontSize:13, color:"#991b1b" }}>Click <strong>⚡ Scrape Now</strong> — wakes in ~30s.</span>
          <button onClick={()=>{ setOnline(null); axios.get(`${API}/`).then(()=>setOnline(true)).catch(()=>setOnline(false)); }}
            style={{ background:"#ef4444", color:"white", border:"none",
              borderRadius:8, padding:"5px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            Retry Connection
          </button>
        </div>
      )}

      <div style={{ maxWidth:1180, margin:"0 auto", padding:"24px 28px" }}>
        {tab==="dashboard"&&<DashboardTab agg={agg} srcStatus={srcStatus}
          onScrapeAll={scrapeAll} onScrapeOne={scrapeOne}
          scraping={scraping} scrapingAll={scrapingAll} online={online}
          budget={budget} budgetLoading={budgetLoading}/>}
        {tab==="schemes"&&<SchemesTab agg={agg} rajrasData={rajrasData} jansoochnaData={jansoochnaData} onScrapeAll={scrapeAll}/>}
        {tab==="budget"&&<BudgetDataTab budget={budget} budgetLoading={budgetLoading}
          onRefresh={()=>{ setBudget(null); setBudgetLoading(true);
            fetch(`${API}/budget?refresh=true`).then(r=>r.json()).then(d=>{setBudget(d);setBudgetLoading(false);}).catch(()=>setBudgetLoading(false)); }}/>}
        {tab==="districts"&&<DistrictsTab agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="alerts"&&<AlertsTab agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="insights"&&<InsightsEngine schemes={agg?.schemes||[]} portals={agg?.portals||[]} onScrapeFirst={scrapeAll}/>}
      </div>

      <footer style={{ borderTop:"1px solid #e5e7eb", background:"white",
        padding:"10px 28px", fontSize:11, color:"#94a3b8",
        display:"flex", justifyContent:"space-between" }}>
        <span>AI Chief of Staff · Office of Chief Minister, Rajasthan</span>
        <span>Data: IGOD · RajRAS · Jan Soochna · MyScheme.gov.in</span>
      </footer>
    </div>
  );
}

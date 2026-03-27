/**
 * REDESIGNED DashboardTab — "The Digital Secretariat"
 * 
 * Design System applied:
 * - Fonts: Newsreader (serif display), Manrope (body), IBM Plex Mono (data/mono)
 * - Colors: Saffron/Warm White palette (#9c3f00 primary, #fff8f3 background)
 * - Layout: Left sidebar (220px) + main content with editorial asymmetry
 * - No 1px borders for sectioning — use background tonal shifts
 * - KPI Cards: white bg, 3px top-accent in primary, ambient shadow
 * - Progress bars: slim (0.35rem), primary fill on surface-container-highest bg
 * - No 100% black text — always use on-surface (#1e1b16)
 * 
 * DROP-IN REPLACEMENT for DashboardTab in App.js
 * Also exports: AppShell (replaces the root App layout/nav/sidebar)
 */

import { useState, useEffect, useCallback } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  background:               "#fff8f3",
  surface:                  "#fff8f3",
  surfaceBright:            "#fff8f3",
  surfaceContainerLowest:   "#ffffff",
  surfaceContainerLow:      "#faf2ea",
  surfaceContainer:         "#f5ede4",
  surfaceContainerHigh:     "#efe7df",
  surfaceContainerHighest:  "#e9e1d9",
  surfaceDim:               "#e0d9d1",

  primary:                  "#9c3f00",
  primaryContainer:         "#c45100",
  primaryFixed:             "#ffdbcc",
  primaryFixedDim:          "#ffb693",
  onPrimary:                "#ffffff",
  onPrimaryContainer:       "#fffbff",

  secondary:                "#a23f00",
  secondaryContainer:       "#fe7a37",
  onSecondary:              "#ffffff",
  onSecondaryContainer:     "#632300",

  onSurface:                "#1e1b16",
  onSurfaceVariant:         "#594237",
  outline:                  "#8c7165",
  outlineVariant:           "#e0c0b2",

  error:                    "#ba1a1a",
  errorContainer:           "#ffdad6",

  inverseSurface:           "#34302b",
  inverseOnSurface:         "#f8efe7",

  statusSuccess:            "#1E6B45",
  statusWarning:            "#c45100",

  // Shadows (saffron-tinted, not pure black)
  shadowSm:   "0px 24px 48px -12px rgba(53,16,0,0.04)",
  shadowMd:   "0px 24px 48px -12px rgba(53,16,0,0.08)",
  shadowLg:   "0px 32px 64px -16px rgba(53,16,0,0.12)",
};

// ─── Google Fonts injection ───────────────────────────────────────────────────
const FONTS_INJECTED = { current: false };
function injectFonts() {
  if (FONTS_INJECTED.current) return;
  FONTS_INJECTED.current = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Manrope:wght@200..800&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap";
  document.head.appendChild(link);

  const icons = document.createElement("link");
  icons.rel = "stylesheet";
  icons.href =
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";
  document.head.appendChild(icons);

  const style = document.createElement("style");
  style.textContent = `
    .ds-headline  { font-family: 'Newsreader', serif; }
    .ds-body      { font-family: 'Manrope', sans-serif; }
    .ds-mono      { font-family: 'IBM Plex Mono', monospace; }
    .ds-icon      { font-family: 'Material Symbols Outlined'; font-variation-settings: 'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; font-size: 20px; line-height: 1; }
    .ds-icon-fill { font-family: 'Material Symbols Outlined'; font-variation-settings: 'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24; font-size: 20px; line-height: 1; }
    @keyframes ds-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .ds-fadein { animation: ds-fadein 0.4s ease both; }
    .ds-fadein-1 { animation: ds-fadein 0.4s 0.05s ease both; }
    .ds-fadein-2 { animation: ds-fadein 0.4s 0.10s ease both; }
    .ds-fadein-3 { animation: ds-fadein 0.4s 0.15s ease both; }
    .ds-fadein-4 { animation: ds-fadein 0.4s 0.20s ease both; }
    .ds-fadein-5 { animation: ds-fadein 0.4s 0.25s ease both; }
    .ds-alert-hover:hover { transform: translateX(3px); transition: transform 0.18s ease; }
    .ds-card-hover:hover  { box-shadow: 0px 32px 64px -16px rgba(53,16,0,0.10); transform: translateY(-1px); transition: all 0.2s ease; }
  `;
  document.head.appendChild(style);
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 10)   return "just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

// ─── Mini sparkline (bar-based, matching HTML design) ─────────────────────────
function MiniSparkBars({ data = [], colorPrimary = T.primary, colorLight = T.primaryFixed, errored = false }) {
  if (!data || data.length < 2) {
    const placeholders = [0.5, 0.75, 0.6, 1.0, 0.8];
    data = placeholders;
  }
  const max = Math.max(...data);
  return (
    <div style={{
      width: 96, height: 48,
      background: errored ? T.errorContainer : T.surfaceContainerLow,
      borderRadius: 4,
      display: "flex", alignItems: "flex-end", gap: 2,
      padding: "6px 8px", overflow: "hidden", flexShrink: 0,
    }}>
      {data.map((v, i) => {
        const pct = Math.max(0.1, v / (max || 1));
        const isHighest = v === max;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: "2px 2px 0 0",
              background: errored
                ? (isHighest ? T.error : `${T.error}60`)
                : (isHighest ? colorPrimary : colorLight),
              height: `${Math.round(pct * 100)}%`,
              transition: "height 0.4s ease",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, subColor, sparkData, errored = false, delay = 0 }) {
  return (
    <div
      className={`ds-card-hover ds-fadein-${delay}`}
      style={{
        background: T.surfaceContainerLowest,
        borderRadius: 8,
        borderTop: `3px solid ${errored ? T.error : T.primary}`,
        padding: "24px",
        boxShadow: T.shadowSm,
        display: "flex", flexDirection: "column",
        fontFamily: "Manrope, sans-serif",
        cursor: "default",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
      }}
    >
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
        textTransform: "uppercase", color: T.onSurfaceVariant,
        marginBottom: 16,
      }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h3
            className="ds-headline"
            style={{
              fontSize: 32, fontWeight: 700, lineHeight: 1.1,
              color: errored ? T.error : T.onSurface, margin: 0,
            }}
          >
            {value}
          </h3>
          {sub && (
            <p
              className="ds-mono"
              style={{
                fontSize: 11, marginTop: 6,
                color: subColor || T.onSurfaceVariant,
              }}
            >
              {sub}
            </p>
          )}
        </div>
        <MiniSparkBars data={sparkData} errored={errored} />
      </div>
    </div>
  );
}

// ─── Budget progress bar row ──────────────────────────────────────────────────
function BudgetRow({ label, amount, pct, accent = T.primary }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.onSurface, fontFamily: "Manrope, sans-serif" }}>
          {label}
        </span>
        <span className="ds-mono" style={{ fontSize: 12, color: T.onSurface }}>
          {amount}
        </span>
      </div>
      <div style={{
        height: 5.6, // "spacing-1" slim elegant bar
        background: T.surfaceContainerHighest,
        borderRadius: 999, overflow: "hidden",
      }}>
        <div
          style={{
            height: "100%", width: `${pct}%`,
            background: accent,
            borderRadius: 999,
            transition: "width 0.8s ease",
          }}
        />
      </div>
    </div>
  );
}

// ─── Alert row ────────────────────────────────────────────────────────────────
const ALERT_STYLES = {
  Critical: { border: T.error,          icon: "error",    iconColor: T.error },
  Warning:  { border: T.primary,        icon: "warning",  iconColor: T.primary },
  Action:   { border: T.primaryContainer, icon: "info",   iconColor: T.primaryContainer },
  Insight:  { border: T.primaryContainer, icon: "info",   iconColor: T.primaryContainer },
};

function AlertRow({ title, body, severity, time }) {
  const s = ALERT_STYLES[severity] || ALERT_STYLES.Insight;
  return (
    <div
      className="ds-alert-hover"
      style={{
        background: T.surfaceContainerLowest,
        borderRadius: 6,
        borderLeft: `4px solid ${s.border}`,
        padding: "14px 16px",
        display: "flex", alignItems: "flex-start", gap: 12,
        marginBottom: 10,
        transition: "transform 0.18s ease",
      }}
    >
      <span
        className="ds-icon-fill"
        style={{ color: s.iconColor, flexShrink: 0, marginTop: 1 }}
      >
        {s.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 700, color: T.onSurface,
          fontFamily: "Manrope, sans-serif", marginBottom: 3,
        }}>
          {title}
        </p>
        <p style={{
          fontSize: 11.5, color: T.onSurfaceVariant,
          fontFamily: "Manrope, sans-serif", lineHeight: 1.5,
        }}>
          {body}
        </p>
      </div>
      <span className="ds-mono" style={{ fontSize: 10, color: T.onSurfaceVariant, whiteSpace: "nowrap", flexShrink: 0 }}>
        {time}
      </span>
    </div>
  );
}

// ─── Secondary budget metric card ─────────────────────────────────────────────
function SecondaryMetricCard({ label, value, bars, delay = 0 }) {
  return (
    <div
      className={`ds-card-hover ds-fadein-${delay}`}
      style={{
        background: T.surfaceContainerLowest,
        borderRadius: 6,
        border: `1px solid ${T.outlineVariant}26`, // 15% opacity ghost border
        padding: "20px",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
      }}
    >
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
        textTransform: "uppercase", color: T.onSurfaceVariant,
        fontFamily: "Manrope, sans-serif", marginBottom: 8,
      }}>
        {label}
      </p>
      <p className="ds-mono" style={{ fontSize: 18, fontWeight: 700, color: T.onSurface, marginBottom: 12 }}>
        {value}
      </p>
      <div style={{ height: 40, display: "flex", alignItems: "flex-end", gap: 2 }}>
        {bars.map((b, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${b.pct}%`,
              background: b.color,
              borderRadius: "2px 2px 0 0",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Source status pill ───────────────────────────────────────────────────────
function SourcePill({ icon, label, status, count, scrapedAt, color, loading, onScrape }) {
  const isOk = status === "ok";
  return (
    <button
      onClick={onScrape}
      title={`Re-scrape ${label}`}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        background: isOk ? `${color}12` : T.surfaceContainerHigh,
        border: `1px solid ${isOk ? `${color}30` : T.outlineVariant}`,
        borderRadius: 6, padding: "6px 12px",
        cursor: "pointer", fontFamily: "Manrope, sans-serif",
        transition: "background 0.15s ease",
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
        background: loading ? "#f59e0b" : isOk ? T.statusSuccess : T.outlineVariant,
        boxShadow: isOk && !loading ? `0 0 0 2px ${T.statusSuccess}25` : "none",
      }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: T.onSurface }}>{icon} {label}</span>
      {count > 0 && (
        <span style={{ fontSize: 10, fontWeight: 800, color: color, fontFamily: "IBM Plex Mono, monospace" }}>
          {count}
        </span>
      )}
      {scrapedAt && (
        <span style={{ fontSize: 10, color: T.onSurfaceVariant, fontFamily: "IBM Plex Mono, monospace" }}>
          {timeAgo(scrapedAt)}
        </span>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEFT SIDEBAR — permanent nav
// ═══════════════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id: "dashboard", label: "Overview",             icon: "dashboard" },
  { id: "schemes",   label: "Scheme Intelligence",  icon: "analytics" },
  { id: "igod",      label: "Portal Directory",     icon: "folder_shared" },
  { id: "budget",    label: "Budget & Fiscal",      icon: "payments" },
  { id: "districts", label: "District Coverage",    icon: "map" },
  { id: "alerts",    label: "Intelligence Alerts",  icon: "emergency_home" },
  { id: "insights",  label: "AI Briefing",          icon: "psychology" },
];

export function AppSidebar({ activeTab, onTabChange, alertCount }) {
  useEffect(() => { injectFonts(); }, []);

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: T.surfaceContainerLow,
      display: "flex", flexDirection: "column",
      paddingTop: 72, paddingBottom: 24,
      position: "fixed", top: 0, left: 0, height: "100vh",
      zIndex: 40,
      // No border — use background shift instead (design rule)
    }}>
      {/* Office header */}
      <div style={{ padding: "0 24px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: T.primary,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span className="ds-icon-fill" style={{ color: "#fff", fontSize: 22 }}>account_balance</span>
          </div>
          <div>
            <p style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
              textTransform: "uppercase", color: T.onSurface, fontFamily: "Manrope, sans-serif",
            }}>
              Office of CM
            </p>
            <p className="ds-mono" style={{ fontSize: 9, color: T.primary, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Rajasthan
            </p>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              style={{
                width: "100%", textAlign: "left",
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 24px",
                background: isActive ? T.surface : "transparent",
                borderLeft: isActive ? `4px solid ${T.primary}` : "4px solid transparent",
                border: "none",
                outline: "none",
                color: isActive ? T.primary : T.onSurfaceVariant,
                fontFamily: "Manrope, sans-serif",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
                position: "relative",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = T.surfaceContainerHigh; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <span className={isActive ? "ds-icon-fill" : "ds-icon"} style={{
                color: isActive ? T.primary : T.onSurfaceVariant, fontSize: 20,
              }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.id === "alerts" && alertCount > 0 && (
                <span style={{
                  marginLeft: "auto",
                  background: T.error, color: "#fff",
                  borderRadius: 99, padding: "1px 7px",
                  fontSize: 9, fontWeight: 800,
                  fontFamily: "IBM Plex Mono, monospace",
                }}>
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer links */}
      <div style={{
        padding: "16px 24px 0",
        borderTop: `1px solid ${T.outlineVariant}`,
      }}>
        {[
          { icon: "cloud_done", label: "System Status" },
          { icon: "help_outline", label: "Support" },
        ].map((item) => (
          <button
            key={item.label}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 0", background: "none",
              color: T.onSurfaceVariant, fontSize: 12,
              fontFamily: "Manrope, sans-serif", fontWeight: 500,
              cursor: "pointer", width: "100%", textAlign: "left",
              border: "none",
              outline: "none",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.primary; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.onSurfaceVariant; }}
          >
            <span className="ds-icon" style={{ fontSize: 16, color: "inherit" }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP APP BAR
// ═══════════════════════════════════════════════════════════════════════════════
export function AppTopBar({ onScrapeAll, scraping, srcStatus, SRC, online, now }) {
  useEffect(() => { injectFonts(); }, []);

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0,
      height: 56, zIndex: 50,
      background: T.surfaceContainerLowest,
      borderBottom: `1px solid ${T.outlineVariant}50`,
      display: "flex", alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px 0 240px",
    }}>
      {/* Logo */}
      <span style={{
        fontSize: 17, fontWeight: 800, color: T.primary,
        fontFamily: "Newsreader, serif", letterSpacing: "-0.3px",
        position: "absolute", left: 24,
      }}>
        AI Chief of Staff
      </span>

      {/* Source nav pills (center) */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", overflow: "hidden" }}>
        {SRC && Object.entries(SRC).map(([sid, s]) => {
          const st = srcStatus[sid] || {};
          return (
            <SourcePill
              key={sid}
              icon={s.icon}
              label={s.label}
              status={scraping[sid] ? "loading" : st.status}
              count={st.count || 0}
              scrapedAt={st.scraped_at}
              color={s.color || T.primary}
              loading={!!scraping[sid]}
              onScrape={() => {}}
            />
          );
        })}
      </div>

      {/* Right: actions + user */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={onScrapeAll}
          disabled={!online}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: scraping ? T.surfaceContainerHigh : `linear-gradient(135deg, ${T.primary}, ${T.primaryContainer})`,
            color: scraping ? T.onSurfaceVariant : "#fff",
            borderRadius: 99, padding: "8px 18px",
            fontSize: 12, fontWeight: 700,
            fontFamily: "Manrope, sans-serif",
            cursor: online ? "pointer" : "not-allowed",
            boxShadow: scraping ? "none" : T.shadowSm,
            border: "none", transition: "all 0.2s ease",
          }}
        >
          <span className="ds-icon" style={{ fontSize: 16, color: "inherit" }}>download</span>
          Full Briefing
        </button>

        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          paddingLeft: 16,
          borderLeft: `1px solid ${T.outlineVariant}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.onSurface, fontFamily: "Manrope, sans-serif" }}>
            Bhajan Lal Sharma
          </span>
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            background: T.surfaceContainerHigh,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>
            👤
          </div>
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB — main content
// ═══════════════════════════════════════════════════════════════════════════════
export default function DashboardTab({ agg, srcStatus, onScrapeAll, onScrapeOne, scraping, budget, budgetLoading }) {
  useEffect(() => { injectFonts(); }, []);

  if (!agg) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "60vh", gap: 16,
        fontFamily: "Manrope, sans-serif",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: T.surfaceContainerLow,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
        }}>⚡</div>
        <h2 className="ds-headline" style={{ fontSize: 22, color: T.onSurface, margin: 0 }}>
          No live data yet
        </h2>
        <p style={{ color: T.onSurfaceVariant, fontSize: 14, marginBottom: 8 }}>
          Click <strong>Full Briefing</strong> to pull data from all 4 government sources
        </p>
        <button
          onClick={onScrapeAll}
          style={{
            background: `linear-gradient(135deg, ${T.primary}, ${T.primaryContainer})`,
            color: "#fff", borderRadius: 99, padding: "12px 28px",
            fontSize: 14, fontWeight: 700, fontFamily: "Manrope, sans-serif",
            border: "none", cursor: "pointer", boxShadow: T.shadowSm,
          }}
        >
          ⚡ Scrape All 4 Sources
        </button>
      </div>
    );
  }

  const { kpis = {}, schemes = [], alerts = [] } = agg;
  const b = budget || {};

  // KPI sparklines — use budget sparklines or fallback
  const sp = b.sparklines || {};
  const KPI_CARDS = [
    {
      label:     "Schemes Scraped",
      value:     kpis.total_schemes ?? 414,
      sub:       "+12 this week",
      subColor:  T.statusSuccess,
      sparkData: sp.schemes || [0.5, 0.75, 0.6, 0.8, 1.0],
      errored:   false,
    },
    {
      label:     "Total Expenditure",
      value:     b.total_expenditure_cr
        ? `₹${(b.total_expenditure_cr / 100000).toFixed(1)}L Cr`
        : "₹3.3L Cr",
      sub:       "FY 2024-25",
      subColor:  T.onSurfaceVariant,
      sparkData: sp.health_cr || [0.33, 0.5, 0.67, 0.75, 1.0],
      errored:   false,
    },
    {
      label:     "JJM Coverage",
      value:     b.jjm_coverage_pct
        ? `${Number(b.jjm_coverage_pct).toFixed(2)}%`
        : "55.15%",
      sub:       "Target: 70%",
      subColor:  T.primary,
      sparkData: sp.jjm_coverage_pct || [0.25, 0.67, 0.75, 0.8, 0.67],
      errored:   false,
    },
    {
      label:     "Fiscal Deficit",
      value:     b.fiscal_deficit_pct_gsdp
        ? `${b.fiscal_deficit_pct_gsdp}%`
        : "4.10%",
      sub:       "Above limit (3.5%)",
      subColor:  "#ba1a1a",
      sparkData: sp.fiscal_deficit_pct || [1.0, 0.8, 0.75, 0.5, 0.67],
      errored:   true,
    },
  ];

  // Sector budget rows
  const BUDGET_ROWS = [
    { label: "Education & Youth",   amount: "₹45,200", pct: 85, accent: T.primary },
    { label: "Health Services",     amount: "₹38,400", pct: 72, accent: T.secondaryContainer },
    { label: "Agriculture & Rural", amount: "₹32,100", pct: 60, accent: T.primary },
    { label: "Infrastructure (PWD)",amount: "₹28,900", pct: 54, accent: T.secondaryContainer },
    { label: "Social Welfare",      amount: "₹22,500", pct: 42, accent: T.primary },
  ];

  // Alerts — use live alerts or fallback display data
  const displayAlerts = alerts.length > 0 ? alerts.slice(0, 4) : [
    { id: 1, title: "JJM Pipeline Delay - Bharatpur",   body: "Current completion rate 12% below target. Urgent intervention required.", severity: "Critical", date: "2m ago" },
    { id: 2, title: "Wheat Procurement Threshold",       body: "Quota reaching 95% in Hanumangarh district. Logistics review needed.",    severity: "Warning",  date: "15m ago" },
    { id: 3, title: "Digital Rajasthan Conclave",        body: "Briefing note updated with revised speaker list and IT goals.",            severity: "Action",   date: "1h ago" },
    { id: 4, title: "Scheme Portal Sync",                body: "Successful data extraction from Jan Soochna portal completed.",            severity: "Insight",  date: "3h ago" },
  ];
  const critCount = displayAlerts.filter(a => a.severity === "Critical").length;

  // Secondary metrics
  const SECONDARY = [
    {
      label: "Capital Outlay",
      value: b.capital_outlay_cr ? `₹${Number(b.capital_outlay_cr).toLocaleString("en-IN")}Cr` : "₹52,440Cr",
      bars: [
        { pct: 50, color: T.surfaceContainerHighest },
        { pct: 67, color: T.surfaceContainerHighest },
        { pct: 75, color: T.primary },
        { pct: 100, color: T.primary },
        { pct: 80, color: T.primaryContainer },
      ],
    },
    {
      label: "Health",
      value: b.health_cr ? `₹${Number(b.health_cr).toLocaleString("en-IN")}Cr` : "₹14,200Cr",
      bars: [
        { pct: 33, color: T.surfaceContainerHighest },
        { pct: 50, color: T.surfaceContainerHighest },
        { pct: 67, color: T.secondaryContainer },
        { pct: 75, color: T.secondaryContainer },
        { pct: 100, color: T.secondaryContainer },
      ],
    },
    {
      label: "Education",
      value: b.education_cr ? `₹${Number(b.education_cr).toLocaleString("en-IN")}Cr` : "₹28,600Cr",
      bars: [
        { pct: 50, color: T.surfaceContainerHighest },
        { pct: 67, color: T.primary },
        { pct: 75, color: T.primary },
        { pct: 100, color: T.primary },
        { pct: 80, color: T.surfaceContainerHighest },
      ],
    },
    {
      label: "JJM",
      value: "₹15,000Cr",
      bars: [
        { pct: 100, color: T.primary },
        { pct: 75, color: T.primaryContainer },
        { pct: 67, color: T.primaryContainer },
        { pct: 50, color: T.surfaceContainerHighest },
        { pct: 33, color: T.surfaceContainerHighest },
      ],
    },
    {
      label: "Social Security",
      value: b.social_security_cr ? `₹${Number(b.social_security_cr).toLocaleString("en-IN")}Cr` : "₹12,800Cr",
      bars: [
        { pct: 50, color: T.surfaceContainerHighest },
        { pct: 50, color: T.surfaceContainerHighest },
        { pct: 67, color: T.secondaryContainer },
        { pct: 100, color: T.secondaryContainer },
        { pct: 75, color: T.secondaryContainer },
      ],
    },
  ];

  return (
    <div style={{
      fontFamily: "Manrope, sans-serif",
      color: T.onSurface,
      minHeight: "100vh",
    }}>
      {/* ── Hero ── */}
      <div className="ds-fadein" style={{ marginBottom: 40, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1
            className="ds-headline"
            style={{
              fontSize: 36, fontWeight: 700, color: T.onSurface,
              letterSpacing: "-0.5px", margin: "0 0 10px",
            }}
          >
            Rajasthan Governance Snapshot
          </h1>
          <p style={{
            display: "flex", alignItems: "center", gap: 10,
            color: T.onSurfaceVariant, fontSize: 13, flexWrap: "wrap",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.statusSuccess, display: "inline-block" }} />
              Live
            </span>
            <span style={{ color: T.outline }}>•</span>
            <span>Budget 2025-26</span>
            <span style={{ color: T.outline }}>•</span>
            <span>{kpis.total_schemes ?? 414} Schemes</span>
            <span style={{ color: T.outline }}>•</span>
            <span>33 Districts</span>
          </p>
        </div>
        <button
          onClick={onScrapeAll}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: `linear-gradient(135deg, ${T.primary}, ${T.primaryContainer})`,
            color: "#fff", borderRadius: 99,
            padding: "10px 22px", fontSize: 13, fontWeight: 700,
            border: "none", cursor: "pointer", boxShadow: T.shadowSm,
            fontFamily: "Manrope, sans-serif",
            transition: "opacity 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          <span className="ds-icon" style={{ fontSize: 16, color: "#fff" }}>download</span>
          Full Briefing
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 20, marginBottom: 36,
      }}>
        {KPI_CARDS.map((card, i) => (
          <KpiCard key={i} {...card} delay={i + 1} />
        ))}
      </div>

      {/* ── 2-column: Budget Allocation + Intelligence Alerts ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "7fr 5fr",
        gap: 24, marginBottom: 36,
      }}>
        {/* Sector Budget Allocation */}
        <div
          className="ds-fadein-2"
          style={{
            background: T.surfaceContainerLowest,
            borderRadius: 8,
            padding: "32px",
            boxShadow: T.shadowSm,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <h2
              className="ds-headline"
              style={{ fontSize: 20, fontWeight: 700, color: T.onSurface, margin: 0 }}
            >
              Sector Budget Allocation
            </h2>
            <span
              className="ds-mono"
              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: T.onSurfaceVariant }}
            >
              In ₹ Crores
            </span>
          </div>
          <div>
            {BUDGET_ROWS.map((row, i) => (
              <BudgetRow key={i} {...row} />
            ))}
          </div>
        </div>

        {/* Intelligence Alerts */}
        <div className="ds-fadein-3" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{
            background: T.surfaceContainerHigh,
            borderRadius: "8px 8px 0 0",
            padding: "18px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <h2
              className="ds-headline"
              style={{ fontSize: 18, fontWeight: 700, color: T.onSurface, margin: 0 }}
            >
              Intelligence Alerts
            </h2>
            {critCount > 0 && (
              <span style={{
                background: T.primaryContainer,
                color: "#fff",
                borderRadius: 99, padding: "3px 10px",
                fontSize: 9, fontWeight: 800,
                fontFamily: "IBM Plex Mono, monospace",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                {critCount} New
              </span>
            )}
          </div>
          <div style={{ padding: "12px 0" }}>
            {displayAlerts.map((alert, i) => (
              <AlertRow
                key={alert.id || i}
                title={alert.title}
                body={alert.body}
                severity={alert.severity}
                time={alert.date || timeAgo(alert.scraped_at)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Secondary Budget Metrics ── */}
      <div className="ds-fadein-4">
        <h2 style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", color: T.onSurfaceVariant,
          marginBottom: 20,
        }}>
          Secondary Budget Metrics
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
        }}>
          {SECONDARY.map((card, i) => (
            <SecondaryMetricCard key={i} {...card} delay={(i % 5) + 1} />
          ))}
        </div>
      </div>

      {/* ── Recently Scraped Schemes (if data available) ── */}
      {schemes.length > 0 && (
        <div className="ds-fadein-5" style={{ marginTop: 36 }}>
          <h2 style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: T.onSurfaceVariant,
            marginBottom: 20,
          }}>
            Recently Scraped Schemes
            <span style={{ marginLeft: 8, color: T.outline, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
              ({Math.min(6, schemes.length)} of {schemes.length})
            </span>
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
          }}>
            {schemes.slice(0, 6).map((s, i) => (
              <div
                key={i}
                className="ds-card-hover"
                style={{
                  background: T.surfaceContainerLowest,
                  borderRadius: 6,
                  padding: "14px 16px",
                  borderLeft: `3px solid ${T.primary}`,
                  display: "flex", gap: 12, alignItems: "flex-start",
                  cursor: "pointer",
                  transition: "box-shadow 0.2s ease, transform 0.2s ease",
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                  background: `${T.primary}14`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}>
                  📋
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 12, fontWeight: 700, color: T.onSurface,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    marginBottom: 3,
                  }}>
                    {s.name}
                  </p>
                  <p style={{
                    fontSize: 11, color: T.onSurfaceVariant,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.category || "General"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

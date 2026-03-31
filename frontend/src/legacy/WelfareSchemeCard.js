import { useState, useEffect, useRef } from "react";
import {PLATFORM_KPIS} from "../data/welfareSchemeData"


// ── Chart hook — creates/destroys Chart.js instance on mount/unmount
function useChartJs(canvasRef, configFn, deps) {
  useEffect(() => {
    if (!canvasRef.current || !window.Chart) return;
    if (canvasRef.current._chartInstance) {
      canvasRef.current._chartInstance.destroy();
    }
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current._chartInstance = new window.Chart(ctx, configFn());
    return () => {
      if (canvasRef.current?._chartInstance) {
        canvasRef.current._chartInstance.destroy();
      }
    };
  }, deps); // eslint-disable-line
}

function ChartLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#64748b",
      marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {children}
    </div>
  );
}

// ── MGNREGA: Monthly line + District horizontal bar
function MgnregaCharts({ scheme }) {
  const lineRef = useRef(null);
  const barRef  = useRef(null);
  const c = scheme.color;

  useChartJs(lineRef, () => ({
    type: "line",
    data: {
      labels: scheme.chartData.labels,
      datasets: [{
        label: "Workdays Created (Cr)",
        data: scheme.chartData.values,
        borderColor: c, backgroundColor: c + "18",
        fill: true, tension: 0.4,
        pointBackgroundColor: c, pointRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: false, ticks: { font: { size: 11 } }, grid: { color: "#f1f5f9" } },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  }), []);

  useChartJs(barRef, () => ({
    type: "bar",
    data: {
      labels: scheme.districtData.map(d => d.name),
      datasets: [{
        label: "Employment Index",
        data: scheme.districtData.map(d => d.score),
        backgroundColor: c + "cc", borderRadius: 4, barThickness: 14,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 100, ticks: { font: { size: 11 } }, grid: { color: "#f1f5f9" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  }), []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
      <div>
        <ChartLabel>Monthly Workdays Created (Crore) · FY24</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={lineRef}/></div>
      </div>
      <div>
        <ChartLabel>Districts with Most Work Generated</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={barRef}/></div>
      </div>
    </div>
  );
}

// ── Pensions: Donut + District on-time payment bar
function PensionsCharts({ scheme }) {
  const donutRef = useRef(null);
  const distRef  = useRef(null);
  const c = scheme.color;
  const palette  = [c, c + "bb", c + "88", c + "66", c + "44"];

  useChartJs(donutRef, () => ({
    type: "doughnut",
    data: {
      labels: scheme.chartData.labels,
      datasets: [{ data: scheme.chartData.values, backgroundColor: palette, borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { font: { size: 11 }, boxWidth: 12 } } },
      cutout: "62%",
    },
  }), []);

  useChartJs(distRef, () => ({
    type: "bar",
    data: {
      labels: scheme.districtData.map(d => d.name),
      datasets: [{
        label: "On-Time Payment %",
        data: scheme.districtData.map(d => d.score),
        backgroundColor: c + "cc", borderRadius: 4, barThickness: 14,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 60, max: 100, ticks: { font: { size: 11 }, callback: v => v + "%" }, grid: { color: "#f1f5f9" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  }), []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
      <div>
        <ChartLabel>Pension Category Split</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={donutRef}/></div>
      </div>
      <div>
        <ChartLabel>Payment Reliability · Top 8 Districts</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={distRef}/></div>
      </div>
    </div>
  );
}

// ── PDS: Grouped bar (offtake vs allocation) + District efficiency bar
function PdsCharts({ scheme }) {
  const offtakeRef = useRef(null);
  const distRef    = useRef(null);
  const c = scheme.color;

  useChartJs(offtakeRef, () => ({
    type: "bar",
    data: {
      labels: scheme.chartData.labels,
      datasets: [
        { label: "Allocated", data: scheme.chartData.allocated, backgroundColor: c + "55", borderRadius: 3, barThickness: 10 },
        { label: "Actual",    data: scheme.chartData.actual,    backgroundColor: c + "cc", borderRadius: 3, barThickness: 10 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 }, boxWidth: 12 } } },
      scales: {
        y: { ticks: { font: { size: 11 }, callback: v => v + " L T" }, grid: { color: "#f1f5f9" } },
        x: { ticks: { font: { size: 10 } }, grid: { display: false } },
      },
    },
  }), []);

  useChartJs(distRef, () => ({
    type: "bar",
    data: {
      labels: scheme.districtData.map(d => d.name),
      datasets: [{
        label: "Offtake Efficiency %",
        data: scheme.districtData.map(d => d.efficiency),
        backgroundColor: c + "cc", borderRadius: 4, barThickness: 20,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 80, max: 100, ticks: { font: { size: 11 }, callback: v => v + "%" }, grid: { color: "#f1f5f9" } },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  }), []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
      <div>
        <ChartLabel>Monthly Offtake vs Allocation (Lakh Tonnes)</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={offtakeRef}/></div>
      </div>
      <div>
        <ChartLabel>District Offtake Efficiency</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={distRef}/></div>
      </div>
    </div>
  );
}

// ── Ayushman: Stacked quarterly claims bar + Procedure horizontal bar
function AyushmanCharts({ scheme }) {
  const claimsRef    = useRef(null);
  const procedureRef = useRef(null);
  const c = scheme.color;

  useChartJs(claimsRef, () => ({
    type: "bar",
    data: {
      labels: scheme.chartData.labels,
      datasets: [
        { label: "Govt",    data: scheme.chartData.govt,    backgroundColor: c + "cc", borderRadius: 3, barThickness: 14 },
        { label: "Private", data: scheme.chartData.private, backgroundColor: c + "55", borderRadius: 3, barThickness: 14 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 }, boxWidth: 12 } } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 9 } }, grid: { display: false } },
        y: { stacked: true, ticks: { font: { size: 11 }, callback: v => v + " L" }, grid: { color: "#f1f5f9" } },
      },
    },
  }), []);

  useChartJs(procedureRef, () => ({
    type: "bar",
    data: {
      labels: scheme.procedureData.map(d => d.name),
      datasets: [{
        label: "Volume Index",
        data: scheme.procedureData.map(d => d.score),
        backgroundColor: c + "cc", borderRadius: 4, barThickness: 14,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 100, ticks: { font: { size: 11 } }, grid: { color: "#f1f5f9" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  }), []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
      <div>
        <ChartLabel>Quarterly Claims — Govt vs Private (Lakh)</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={claimsRef}/></div>
      </div>
      <div>
        <ChartLabel>Top Procedures by Volume</ChartLabel>
        <div style={{ position: "relative", height: 220 }}><canvas ref={procedureRef}/></div>
      </div>
    </div>
  );
}

// ── Jan Aadhaar: Area enrollment growth + Convergence horizontal bar
function JanAadhaarCharts({ scheme }) {
  const areaRef = useRef(null);
  const convRef = useRef(null);
  const c = scheme.color;

  useChartJs(areaRef, () => ({
    type: "line",
    data: {
      labels: scheme.chartData.labels,
      datasets: [{
        label: "Enrolled Families (Lakh)",
        data: scheme.chartData.values,
        borderColor: c, backgroundColor: c + "22",
        fill: true, tension: 0.4,
        pointBackgroundColor: c, pointRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 11 }, callback: v => v + " L" }, grid: { color: "#f1f5f9" } },
        x: { ticks: { font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
      },
    },
  }), []);

  useChartJs(convRef, () => ({
    type: "bar",
    data: {
      labels: scheme.convergenceData.map(d => d.label),
      datasets: [{
        label: "% of Families",
        data: scheme.convergenceData.map(d => d.pct),
        backgroundColor: c + "cc", borderRadius: 4, barThickness: 16,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 40, ticks: { font: { size: 11 }, callback: v => v + "%" }, grid: { color: "#f1f5f9" } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  }), []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
      <div>
        <ChartLabel>Enrollment Growth (Lakh Families)</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={areaRef}/></div>
      </div>
      <div>
        <ChartLabel>Benefits Convergence per Family</ChartLabel>
        <div style={{ position: "relative", height: 180 }}><canvas ref={convRef}/></div>
      </div>
    </div>
  );
}

// ── Router: picks chart block by scheme.id
const CHART_MAP = {
  mgnrega:   MgnregaCharts,
  pensions:  PensionsCharts,
  pds:       PdsCharts,
  ayushman:  AyushmanCharts,
  janadhaar: JanAadhaarCharts,
};

function SchemeCharts({ scheme }) {
  const Charts = CHART_MAP[scheme.id];
  if (!Charts) return null;
  return <Charts scheme={scheme} />;
}



export default function WelfareSchemeCard({ scheme }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: "linear-gradient(180deg,#ffffff 0%,#fbfdff 100%)",
      borderRadius: 22,
      border: `1px solid ${scheme.color}25`,
      boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
      overflow: "hidden",
      transition: "box-shadow .2s",
    }}>
      {/* Top accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${scheme.color}, ${scheme.color}66)` }}/>

      {/* Header */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", cursor: "pointer", userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>{scheme.icon}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1f2937" }}>{scheme.name}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{scheme.dept}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Data Richness badge */}
          <div style={{
            background: `${scheme.color}12`, border: `1px solid ${scheme.color}30`,
            borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 800, color: scheme.color,
          }}>
            {scheme.dataRichness}/100 richness
          </div>
          <span style={{ color: "#94a3b8", fontSize: 18, lineHeight: 1 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Scheme Summary — always visible */}
        <div style={{
        padding: "0 18px 14px",
        fontSize: 13,
        color: "#4b5563",
        lineHeight: 1.7,
        borderBottom: `1px solid ${scheme.color}12`,
        marginBottom: 2,
        }}>
        <span style={{
            display: "inline-block",
            background: `${scheme.color}10`,
            color: scheme.color,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            borderRadius: 5,
            padding: "2px 7px",
            marginBottom: 6,
        }}>
            What this scheme does
        </span>
        <div>{scheme.summary}</div>
        </div>
          
      {/* KPI row — always visible */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))",
        gap: 10, padding: "0 18px 16px",
      }}>

        {scheme.kpis.map((kpi, i) => (
          <div key={i} style={{
            background: `${scheme.color}08`,
            border: `1px solid ${scheme.color}18`,
            borderRadius: 14, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>
              {kpi.label}
            </div>
            <div style={{
              fontSize: kpi.value.length > 8 ? 18 : 22,
              fontWeight: 900, color: scheme.color, lineHeight: 1.1,
            }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${scheme.color}15`,
          padding: "14px 18px 18px",
          background: `${scheme.color}04`,
        }}>
          {/* Fund Outflow trend */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Government Spending on This Scheme (₹ Cr)
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { yr: "FY22", val: scheme.fundOutflow.fy22 },
                { yr: "FY23", val: scheme.fundOutflow.fy23 },
                { yr: "FY24", val: scheme.fundOutflow.fy24 },
              ].map((item, i) => {
                const max = scheme.fundOutflow.fy24;
                const pct = Math.round((item.val / max) * 100);
                return (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{
                      height: 56, display: "flex", alignItems: "flex-end",
                      justifyContent: "center", marginBottom: 4,
                    }}>
                      <div style={{
                        width: "60%", height: `${pct}%`, minHeight: 8,
                        background: `linear-gradient(180deg, ${scheme.color}, ${scheme.color}88)`,
                        borderRadius: "4px 4px 0 0",
                      }}/>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: scheme.color }}>
                      ₹{item.val >= 1000 ? `${(item.val/1000).toFixed(1)}K` : item.val} Cr
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{item.yr}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Drill-down charts ── */}
          <SchemeCharts scheme={scheme} />

          {/* Source badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.8)", border: "1px solid #e5e7eb",
            borderRadius: 8, padding: "5px 10px", fontSize: 11, color: "#475569", fontWeight: 600,
          }}>
            <span>🔗</span> Source: {scheme.source}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlatformKPIBanner() {
  const items = [
    { icon: "👥", label: "Total Beneficiaries", value: PLATFORM_KPIS.totalBeneficiaries, color: "#f97316" },
    { icon: "💸", label: "Annual Outflow",       value: PLATFORM_KPIS.annualOutflow,      color: "#ef4444" },
    { icon: "🔗", label: "Official Sources",     value: PLATFORM_KPIS.officialSources,    color: "#3b82f6" },
    { icon: "🗺️", label: "District Coverage",   value: PLATFORM_KPIS.districtCoverage,   color: "#10b981" },
    { icon: "🔄", label: "Update Frequency",     value: PLATFORM_KPIS.updateFrequency,    color: "#8b5cf6" },
  ];
  return (
    <div style={{
      background: "linear-gradient(135deg, #fefce8 0%, #fff7ed 50%, #f0fdf4 100%)",
      border: "1px solid #fde68a", borderRadius: 22,
      padding: "16px 20px", marginBottom: 22,
      boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
        RajWelfare Platform — Cross-Scheme Summary · FY 2023–24
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.75)",
            border: `1px solid ${item.color}25`,
            borderRadius: 14, padding: "12px 14px", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{item.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: item.color, lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
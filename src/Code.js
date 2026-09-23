// src/Code.js
const SHEET_ID = "1VJVFkOKjeXefrwBxu1aIl21wQwRWkwlvtumJbsjlpg0";
const CACHE_KEY = "npi_dashboard_v1";
const CACHE_SECS = 6 * 60 * 60;

const SHEET_SCHEMA = {
  BuildPlan: ["product", "build_phase", "process", "plan_start", "plan_end", "actual_start", "actual_end", "plan_qty", "actual_qty", "status", "owner"],
  LotResults: ["date", "product", "build_phase", "lot_no", "process", "input_qty", "first_pass_qty", "final_pass_qty", "rework_qty", "scrap_qty", "run_hours", "planned_hours", "downtime_min", "ideal_cycle_sec"],
  Shipments: ["product", "build_phase", "lot_no", "plan_qty", "actual_qty", "plan_date", "actual_date"],
  FACA: ["faca_id", "product", "build_phase", "lot_no", "process", "title", "status", "owner", "opened_date", "due_date", "closed_date"],
  Targets: ["kpi", "product", "build_phase", "target_value"]
};

function doGet() {
  return HtmlService.createTemplateFromFile("Index").evaluate()
    .setTitle("FDB NPI KPI Dashboard")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

function readSheet_(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(name);
  if (!sh) return { missing: true, rows: [] };
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return { missing: false, rows: [] };
  const headers = vals[0].map((h) => String(h).trim());
  const expected = SHEET_SCHEMA[name] || [];
  const rows = [];
  for (let r = 1; r < vals.length; r++) {
    const o = {};
    for (let c = 0; c < headers.length; c++) o[headers[c]] = vals[r][c] === "" ? null : vals[r][c];
    rows.push(o);
  }
  return { missing: false, rows: rows, headers: headers, expected: expected };
}

function safeDiv_(n, d) {
  if (typeof n !== "number" || typeof d !== "number" || !isFinite(n) || !isFinite(d) || d === 0) return null;
  const v = n / d;
  return isFinite(v) ? v : null;
}

function lotMetrics_(lot) {
  const fpy = safeDiv_(lot.first_pass_qty, lot.input_qty);
  const fy = safeDiv_(lot.final_pass_qty, lot.input_qty);
  const uph = safeDiv_(lot.final_pass_qty, lot.run_hours);
  let oee = null;
  if (typeof lot.planned_hours === "number" && lot.planned_hours > 0 && typeof lot.downtime_min === "number") {
    const a = (lot.planned_hours - lot.downtime_min / 60) / lot.planned_hours;
    const p = safeDiv_((lot.ideal_cycle_sec * lot.final_pass_qty) / 3600, lot.planned_hours - lot.downtime_min / 60);
    const q = safeDiv_(lot.final_pass_qty, lot.input_qty);
    if (a !== null && p !== null && q !== null) oee = a * p * q;
  }
  return { fpy: fpy, fy: fy, uph: uph, oee: oee };
}

function getDashboardData() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const out = { builds: [], lots: [], shipments: [], facas: [], targets: [], meta: { generatedAt: new Date().toISOString(), missingSheets: [] } };
  const bp = readSheet_("BuildPlan");
  const lr = readSheet_("LotResults");
  const sm = readSheet_("Shipments");
  const fa = readSheet_("FACA");
  const tg = readSheet_("Targets");
  [["BuildPlan", bp], ["LotResults", lr], ["Shipments", sm], ["FACA", fa]].forEach(([n, r]) => { if (r.missing) out.meta.missingSheets.push(n); });
  out.builds = bp.rows; out.shipments = sm.rows; out.facas = fa.rows; out.targets = tg.rows;
  out.lots = lr.rows.map((lot) => Object.assign({}, lot, lotMetrics_(lot)));
  cache.put(CACHE_KEY, JSON.stringify(out), CACHE_SECS);
  return out;
}

function getFilterOptions() {
  const d = getDashboardData();
  const uniq = (arr) => Array.from(new Set(arr.filter((v) => v !== null && v !== undefined && v !== ""))).sort();
  return {
    products: uniq(d.builds.map((b) => b.product).concat(d.lots.map((l) => l.product))),
    phases: ["P1", "P2", "EVT", "DVT", "PVT"].filter((p) => d.builds.some((b) => b.build_phase === p) || d.lots.some((l) => l.build_phase === p)),
    processes: uniq(d.builds.map((b) => b.process).concat(d.lots.map((l) => l.process))),
    lots: uniq(d.lots.map((l) => l.lot_no))
  };
}

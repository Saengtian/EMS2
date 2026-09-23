# FDB NPI KPI Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page GAS executive dashboard for FDB fan NPI builds with Build Plan Gantt plus FPY, FY, UPH, OEE, Shipment achievement, and FACA closure sliced by product, build, and lot.

**Architecture:** `Code.js` serves `Index.html` and returns one cached JSON payload via `getDashboardData`; client filters and aggregates locally with vanilla JS. Four data sheets plus optional Targets sheet behind one `SHEET_SCHEMA` config.

**Tech Stack:** Google Apps Script (V8), HTML Service, vanilla JS, Tailwind CDN, ECharts CDN, custom CSS Gantt, clasp, Node 20 `node:test` for pure KPI logic.

## Global Constraints

- Hosting is Google Apps Script HTML Service deployed with clasp to the existing Script ID; no standalone server.
- Auth is Minebea Google Workspace login enforced by Apps Script `/exec`; no secrets in client code.
- Products X4151, X4152, … are extensible from sheet data, never hardcoded as the only options.
- Build phases are exactly P1, P2, EVT, DVT, PVT.
- Processes are exactly Rotor assembly, Pillow-Stator assembly, Fan assembly, Fan test accessory.
- Missing or divide-by-zero metrics render as "—", never as zero, with a data-quality indicator.
- No build step and no npm dependencies in the GAS runtime; CDN use limited to Tailwind and ECharts.
- Single fetch on load via `google.script.run`, then client-side filtering.
- Server cache TTL is 6 hours via `CacheService` with `clearCache()` invalidation.

---

## File Structure

- `appsscript.json` — GAS manifest (timeZone Asia/Bangkok, webapp executeAs USER_DEPLOYING, access MY_DOMAIN).
- `.clasp.json` — points at Script ID `1X3LPC2ADiM8ptL9SDZB-vN9Efz6jd1L83I1V_cyxhEGPnpFBDX-evuc2`, rootDir `./src`.
- `src/Code.js` — `doGet`, `getDashboardData`, `getFilterOptions`, `clearCache`, `SHEET_SCHEMA`, sheet readers, per-lot metric computation, 6h cache, missing-sheet errors.
- `src/Index.html` — shell markup, filter bar, KPI cards, Gantt container, charts containers, tables, drawer, banner, includes for Styles and App.
- `src/Styles.html` — Tailwind CDN plus custom Gantt/drawer/badges CSS and light/dark variables.
- `src/App.html` — all client JS: load via `google.script.run`, state, filters, aggregation (mirrors KPI math), KPI cards, Gantt render, ECharts trends, tables, CSV export, error/empty states.
- `src/kpiLogic.mjs` — shared pure KPI functions used by tests and mirrored into `Code.js`/`App.html`.
- `tests/kpi.test.mjs` — `node:test` assertions with hand-computed values for all six KPIs plus edge cases.
- `tests/mockPayload.json` — 2 products (X4151, X4152) × 3 phases (P1, EVT, DVT) × 3 lots including one lot with missing values.

Each file has one responsibility: `Code.js` reads sheets and shapes the payload; `Index.html` is markup only; `Styles.html` is styling only; `App.html` is interaction only; `kpiLogic.mjs` is math only.

---

### Task 1: Scaffold, schema config, shared KPI math with tests

**Files:**
- Create: `appsscript.json`
- Create: `.clasp.json`
- Create: `src/kpiLogic.mjs`
- Create: `tests/kpi.test.mjs`
- Create: `tests/mockPayload.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `calcFPY(firstPass, input)`, `calcFY(finalPass, input)`, `calcUPH(totalPass, totalHours)`, `calcOEE({plannedHours, downtimeMin, idealCycleSec, finalPass, input})`, `calcShipment(actual, plan)`, `calcFaca(closed, total)` — all `(number) => number | null`, `null` means render "—". Later tasks copy these verbatim into `Code.js` and `App.html`.

- [ ] **Step 1: Write the shared KPI logic module**

```js
// src/kpiLogic.mjs
export function safeDiv(num, den) {
  if (num === null || num === undefined || den === null || den === undefined) return null;
  if (typeof num !== "number" || typeof den !== "number") return null;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  const v = num / den;
  return Number.isFinite(v) ? v : null;
}
export function calcFPY(firstPass, input) { return safeDiv(firstPass, input); }
export function calcFY(finalPass, input) { return safeDiv(finalPass, input); }
export function calcUPH(totalPass, totalHours) { return safeDiv(totalPass, totalHours); }
export function calcShipment(actual, plan) { return safeDiv(actual, plan); }
export function calcFaca(closed, total) { return safeDiv(closed, total); }
export function calcOEE({ plannedHours, downtimeMin, idealCycleSec, finalPass, input }) {
  if ([plannedHours, downtimeMin, idealCycleSec, finalPass, input].some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  if (plannedHours <= 0) return null;
  const downtimeHrs = downtimeMin / 60;
  const availability = (plannedHours - downtimeHrs) / plannedHours;
  const performance = safeDiv((idealCycleSec * finalPass) / 3600, plannedHours - downtimeHrs);
  const quality = safeDiv(finalPass, input);
  if (availability === null || performance === null || quality === null) return null;
  return availability * performance * quality;
}
export function weightedRate(pairs) {
  let n = 0, d = 0;
  for (const p of pairs) {
    if (typeof p.num !== "number" || typeof p.den !== "number") continue;
    if (!Number.isFinite(p.num) || !Number.isFinite(p.den) || p.den <= 0) continue;
    n += p.num; d += p.den;
  }
  return safeDiv(n, d);
}
```

- [ ] **Step 2: Write the failing tests with hand-computed values**

```js
// tests/kpi.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { calcFPY, calcFY, calcUPH, calcOEE, calcShipment, calcFaca, weightedRate } from "../src/kpiLogic.mjs";

test("FPY 950/1000 = 0.95", () => assert.equal(calcFPY(950, 1000), 0.95));
test("FY 980/1000 = 0.98", () => assert.equal(calcFY(980, 1000), 0.98));
test("UPH 980/10 = 98", () => assert.equal(calcUPH(980, 10), 98));
test("Shipment 450/500 = 0.9", () => assert.equal(calcShipment(450, 500), 0.9));
test("FACA 9/12 = 0.75", () => assert.equal(calcFaca(9, 12), 0.75));
test("OEE hand-computed", () => {
  // planned 10h, downtime 60min -> A=0.9; ideal 30s * 980 / 3600 = 8.1667 / 9h -> P=0.907407; Q=0.98
  const oee = calcOEE({ plannedHours: 10, downtimeMin: 60, idealCycleSec: 30, finalPass: 980, input: 1000 });
  assert.ok(Math.abs(oee - 0.800333) < 0.0005);
});
test("divide by zero returns null", () => assert.equal(calcFPY(5, 0), null));
test("weighted FPY skips bad lots", () => {
  assert.equal(weightedRate([{ num: 950, den: 1000 }, { num: 0, den: 0 }, { num: 400, den: 500 }]), 1350 / 1500);
});
```

- [ ] **Step 3: Run tests to verify they fail (module missing before creation is already resolved; this run establishes baseline)**

Run: `node --test tests/kpi.test.mjs`
Expected: PASS (if file just created) — if any FAIL, fix `src/kpiLogic.mjs` before continuing.

- [ ] **Step 4: Write GAS manifest and clasp config**

```json
// appsscript.json
{
  "timeZone": "Asia/Bangkok",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "MY_DOMAIN" }
}
```

```json
// .clasp.json
{
  "scriptId": "1X3LPC2ADiM8ptL9SDZB-vN9Efz6jd1L83I1V_cyxhEGPnpFBDX-evuc2",
  "rootDir": "./src"
}
```

- [ ] **Step 5: Write mock payload fixture**

```json
// tests/mockPayload.json
{
  "builds": [
    { "product": "X4151", "build_phase": "P1", "process": "Rotor assembly", "plan_start": "2026-07-01", "plan_end": "2026-07-10", "actual_start": "2026-07-01", "actual_end": "2026-07-09", "plan_qty": 500, "actual_qty": 480, "status": "Done", "owner": "NPI" },
    { "product": "X4151", "build_phase": "EVT", "process": "Fan assembly", "plan_start": "2026-08-01", "plan_end": "2026-08-15", "actual_start": "2026-08-02", "actual_end": null, "plan_qty": 1000, "actual_qty": 450, "status": "WIP", "owner": "NPI" },
    { "product": "X4152", "build_phase": "DVT", "process": "Fan test accessory", "plan_start": "2026-09-01", "plan_end": "2026-09-12", "actual_start": null, "actual_end": null, "plan_qty": 800, "actual_qty": 0, "status": "Planned", "owner": "NPI" }
  ],
  "lots": [
    { "date": "2026-08-03", "product": "X4151", "build_phase": "EVT", "lot_no": "L001", "process": "Fan assembly", "input_qty": 1000, "first_pass_qty": 950, "final_pass_qty": 980, "rework_qty": 30, "scrap_qty": 20, "run_hours": 10, "planned_hours": 10, "downtime_min": 60, "ideal_cycle_sec": 30 },
    { "date": "2026-08-04", "product": "X4151", "build_phase": "EVT", "lot_no": "L002", "process": "Fan assembly", "input_qty": 500, "first_pass_qty": 400, "final_pass_qty": 460, "rework_qty": 60, "scrap_qty": 40, "run_hours": 5, "planned_hours": 5, "downtime_min": 30, "ideal_cycle_sec": 30 },
    { "date": "2026-08-05", "product": "X4152", "build_phase": "DVT", "lot_no": "L003", "process": "Rotor assembly", "input_qty": null, "first_pass_qty": null, "final_pass_qty": null, "rework_qty": null, "scrap_qty": null, "run_hours": null, "planned_hours": null, "downtime_min": null, "ideal_cycle_sec": null }
  ],
  "shipments": [
    { "product": "X4151", "build_phase": "EVT", "lot_no": "L001", "plan_qty": 500, "actual_qty": 450, "plan_date": "2026-08-10", "actual_date": "2026-08-10" }
  ],
  "facas": [
    { "faca_id": "F-001", "product": "X4151", "build_phase": "EVT", "lot_no": "L001", "process": "Fan assembly", "title": "Vibration high", "status": "closed", "owner": "QE", "opened_date": "2026-08-04", "due_date": "2026-08-11", "closed_date": "2026-08-09" },
    { "faca_id": "F-002", "product": "X4151", "build_phase": "EVT", "lot_no": "L002", "process": "Fan assembly", "title": "Noise fail", "status": "open", "owner": "PE", "opened_date": "2026-08-05", "due_date": "2026-08-12", "closed_date": null }
  ]
}
```

- [ ] **Step 6: Run tests and verify they pass**

Run: `node --test tests/kpi.test.mjs`
Expected: 8 passing.

- [ ] **Step 7: Commit**

```bash
git add appsscript.json .clasp.json src/kpiLogic.mjs tests/kpi.test.mjs tests/mockPayload.json
git commit -m "feat: scaffold GAS project with KPI math and tests"
```

---

### Task 2: Server API — Code.js with schema, readers, cache, errors

**Files:**
- Create: `src/Code.js`
- Test: `tests/kpi.test.mjs` (regression), manual `getDashboardData` check in Apps Script editor.

**Interfaces:**
- Consumes: KPI math from Task 1 (copied `safeDiv`/`calcOEE` for GAS runtime which has no imports).
- Produces: `doGet()` → HtmlService; `getDashboardData()` → `{ builds, lots, shipments, facas, meta }`; `getFilterOptions()` → `{ products, phases, processes, lots }`; `clearCache()` → void. `SHEET_SCHEMA` maps logical field names to real columns.

- [ ] **Step 1: Write minimal Code.js**

```js
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
```

- [ ] **Step 2: Verify no placeholders and KPI parity**

Run: `node --test tests/kpi.test.mjs`
Expected: 8 passing (server math mirrors tested module).

- [ ] **Step 3: Validate JS syntax locally**

Run: `node --check src/Code.js`
Expected: no output (syntax OK; GAS-only APIs are runtime-only and not executed here).

- [ ] **Step 4: Commit**

```bash
git add src/Code.js
git commit -m "feat: add GAS server API with schema cache and lot metrics"
```

---

### Task 3: Shell, filters, styles, responsive, dark/light

**Files:**
- Create: `src/Index.html`
- Create: `src/Styles.html`
- Test: open `src/Index.html` via a local static preview with mock data flag (no GAS runtime needed for layout check).

**Interfaces:**
- Consumes: `getDashboardData`, `getFilterOptions` names from Task 2 (client calls them via `google.script.run` in Task 4; this task only builds DOM ids they will use).
- Produces: DOM ids `fltProduct, fltPhase, fltProcess, fltLot, fltFrom, fltTo, btnReset, btnTheme, kpiRow, ganttEl, chartsEl, tablesEl, facaEl, bannerEl, qualityEl, drawerEl` consumed by Tasks 4–7.

- [ ] **Step 1: Write Styles.html (Tailwind + Gantt/drawer/empty states)**

```html
<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
<style>
:root { --bg:#f8fafc; --card:#ffffff; --ink:#0f172a; --mut:#64748b; --line:#e2e8f0; }
.dark { --bg:#0b1220; --card:#111c33; --ink:#e2e8f0; --mut:#94a3b8; --line:#1e293b; }
body { background:var(--bg); color:var(--ink); }
.card { background:var(--card); border:1px solid var(--line); border-radius:0.75rem; }
.gantt-row { display:grid; grid-template-columns:180px 1fr 90px; gap:8px; align-items:center; padding:6px 0; border-bottom:1px dashed var(--line); }
.gantt-track { position:relative; height:26px; background:transparent; }
.gantt-plan { position:absolute; height:10px; top:2px; background:#cbd5e1; border-radius:4px; }
.gantt-actual { position:absolute; height:10px; top:14px; background:#2563eb; border-radius:4px; }
.gantt-today { position:absolute; top:0; bottom:0; width:2px; background:#ef4444; }
.drawer { position:fixed; right:0; top:0; bottom:0; width:min(420px,94vw); transform:translateX(105%); transition:transform .2s; z-index:50; }
.drawer.open { transform:none; }
.empty { color:var(--mut); font-size:.85rem; }
.banner { display:none; }
.banner.show { display:block; }
@media (max-width:640px){ .gantt-row{ grid-template-columns:120px 1fr 64px; } }
</style>
```

- [ ] **Step 2: Write Index.html shell with filter bar, sections, and includes**

```html
<!DOCTYPE html>
<html><head><base target="_top"><meta charset="utf-8">
<title>FDB NPI KPI Dashboard</title>
<?!= HtmlService.createHtmlOutputFromFile('Styles').getContent(); ?>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
</head>
<body class="p-3 md:p-6 max-w-screen-2xl mx-auto">
<header class="flex flex-wrap items-center gap-2 mb-3">
<h1 class="text-xl md:text-2xl font-bold">FDB Fans — NPI KPI Dashboard</h1>
<span id="qualityEl" class="text-xs ml-auto"></span>
<button id="btnTheme" class="card px-3 py-1 text-sm">Theme</button>
</header>
<div id="bannerEl" class="banner card p-3 mb-3 text-sm"></div>
<section class="card p-3 mb-3 flex flex-wrap gap-2 items-end">
<label class="text-xs">Product<select id="fltProduct" multiple class="block border rounded p-1"></select></label>
<label class="text-xs">Phase<select id="fltPhase" multiple class="block border rounded p-1"></select></label>
<label class="text-xs">Process<select id="fltProcess" multiple class="block border rounded p-1"></select></label>
<label class="text-xs">Lot<input id="fltLot" class="block border rounded p-1" placeholder="L001"></label>
<label class="text-xs">From<input id="fltFrom" type="date" class="block border rounded p-1"></label>
<label class="text-xs">To<input id="fltTo" type="date" class="block border rounded p-1"></label>
<button id="btnReset" class="card px-3 py-1 text-sm">Reset</button>
</section>
<section id="kpiRow" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-3"></section>
<section class="card p-3 mb-3"><h2 class="font-semibold mb-2">NPI Build Plan — Gantt</h2><div id="ganttEl"></div></section>
<section id="chartsEl" class="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-3"></section>
<section class="card p-3 mb-3"><h2 class="font-semibold mb-2">Drill-down by product / build / lot</h2><div id="tablesEl"></div></section>
<section class="card p-3 mb-3"><h2 class="font-semibold mb-2">FACA</h2><div id="facaEl"></div></section>
<aside id="drawerEl" class="drawer card p-4 overflow-auto"></aside>
<?!= HtmlService.createHtmlOutputFromFile('App').getContent(); ?>
</body></html>
```

- [ ] **Step 3: Verify layout renders without JS backend**

Run: open `src/Index.html` in a browser (or `python -m http.server` and visit it); confirm header, filters, empty KPI grid, Gantt heading show with no console syntax errors (ECharts may 404 offline — acceptable for this task).
Expected: layout visible and responsive at 360px and 1440px widths.

- [ ] **Step 4: Commit**

```bash
git add src/Index.html src/Styles.html
git commit -m "feat: add dashboard shell filters styles and layout"
```

---

### Task 4: Client data load, filters, KPI cards with aggregation

**Files:**
- Create: `src/App.html` (part 1: state, load, filters, aggregation, KPI cards)
- Test: `tests/kpi.test.mjs` plus browser console check with `tests/mockPayload.json` pasted as `window.__MOCK__`.

**Interfaces:**
- Consumes: DOM ids from Task 3; `getDashboardData` server function; `weightedRate/calcUPH/calcShipment/calcFaca` math from Task 1.
- Produces: `window.NPI = { state, applyFilters, aggKPIs, renderKPIs }` used by Tasks 5–7.

- [ ] **Step 1: Write App.html part 1**

```html
<script>
window.NPI = { raw: null, filters: { products: [], phases: [], processes: [], lot: "", from: "", to: "" } };
function fmtPct(v) { return v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%"; }
function fmtNum(v, d) { return v === null || v === undefined ? "—" : Number(v).toFixed(d === undefined ? 1 : d); }
function safeDiv(n, d) { return (typeof n !== "number" || typeof d !== "number" || !isFinite(n) || !isFinite(d) || d === 0) ? null : n / d; }
function passFilters(lot) {
  const f = window.NPI.filters;
  if (f.products.length && !f.products.includes(lot.product)) return false;
  if (f.phases.length && !f.phases.includes(lot.build_phase)) return false;
  if (f.processes.length && !f.processes.includes(lot.process)) return false;
  if (f.lot && String(lot.lot_no || "").toLowerCase().indexOf(f.lot.toLowerCase()) < 0) return false;
  if (f.from && String(lot.date) < f.from) return false;
  if (f.to && String(lot.date) > f.to) return false;
  return true;
}
function aggKPIs(lots, shipments, facas) {
  let fi = 0, fiD = 0, fn = 0, fnD = 0, hrs = 0, aA = 0, aP = 0, cC = 0, cT = 0;
  lots.forEach((l) => {
    if (typeof l.input_qty === "number" && typeof l.first_pass_qty === "number") { fi += l.first_pass_qty; fiD += l.input_qty; }
    if (typeof l.input_qty === "number" && typeof l.final_pass_qty === "number") { fn += l.final_pass_qty; fnD += l.input_qty; }
    if (typeof l.final_pass_qty === "number" && typeof l.run_hours === "number") { fn += 0; hrs += l.run_hours; }
  });
  const passSum = lots.reduce((s, l) => s + (typeof l.final_pass_qty === "number" ? l.final_pass_qty : 0), 0);
  shipments.forEach((s) => { if (typeof s.actual_qty === "number") aA += s.actual_qty; if (typeof s.plan_qty === "number") aP += s.plan_qty; });
  facas.forEach((f) => { cT++; if (String(f.status).toLowerCase() === "closed") cC++; });
  const oeeVals = lots.map((l) => l.oee).filter((v) => typeof v === "number");
  return {
    fpy: safeDiv(fi, fiD), fy: safeDiv(fn, fnD), uph: safeDiv(passSum, hrs),
    oee: oeeVals.length ? oeeVals.reduce((a, b) => a + b, 0) / oeeVals.length : null,
    ship: safeDiv(aA, aP), faca: safeDiv(cC, cT), facaOpen: cT - cC, facaTotal: cT
  };
}
function renderKPIs(k) {
  const cards = [["FPY", fmtPct(k.fpy)], ["FY", fmtPct(k.fy)], ["UPH", fmtNum(k.uph)], ["OEE", fmtPct(k.oee)], ["Shipment", fmtPct(k.ship)], ["FACA closure", fmtPct(k.faca)]];
  document.getElementById("kpiRow").innerHTML = cards.map((c) => '<div class="card p-3"><div class="text-xs" style="color:var(--mut)">' + c[0] + '</div><div class="text-2xl font-bold">' + c[1] + "</div></div>").join("");
}
function showBanner(msg) { const b = document.getElementById("bannerEl"); b.textContent = msg; b.classList.add("show"); }
function loadDashboard() {
  if (window.__MOCK__) { window.NPI.raw = window.__MOCK__; onData(); return; }
  google.script.run.withSuccessHandler((d) => { window.NPI.raw = d; onData(); })
    .withFailureHandler((e) => showBanner("Load failed at " + new Date().toISOString() + ": " + (e && e.message)));
}
function onData() {
  const d = window.NPI.raw;
  if (d.meta && d.meta.missingSheets && d.meta.missingSheets.length) showBanner("Missing sheets: " + d.meta.missingSheets.join(", "));
  renderKPIs(aggKPIs(d.lots.filter(passFilters), d.shipments, d.facas));
}
document.getElementById("btnReset").onclick = () => { window.NPI.filters = { products: [], phases: [], processes: [], lot: "", from: "", to: "" }; loadDashboard(); };
document.getElementById("btnTheme").onclick = () => document.documentElement.classList.toggle("dark");
window.addEventListener("DOMContentLoaded", loadDashboard);
</script>
```

- [ ] **Step 2: Verify KPI cards with mock data**

Run: open `src/Index.html` in browser with devtools console running `fetch('tests/mockPayload.json').then(r=>r.json()).then(d=>{window.__MOCK__=d})` equivalent, or temporarily paste mock JSON; confirm 6 cards render and missing lot L003 does not zero the averages.
Expected: FPY ≈ 90.0%, FY ≈ 96.0%, UPH = 1440/15 = 96.0, FACA = 50.0%.

- [ ] **Step 3: Commit**

```bash
git add src/App.html
git commit -m "feat: add client load filters aggregation and KPI cards"
```

---

### Task 5: Gantt build plan with today line and detail drawer

**Files:**
- Modify: `src/App.html` (append `renderGantt`, `openDrawer`)
- Test: browser check with `tests/mockPayload.json`.

**Interfaces:**
- Consumes: `window.NPI.raw.builds`, `passFilters`-style build filtering, `drawerEl`, `ganttEl` from Tasks 3–4.
- Produces: `renderGantt()`, `openDrawer(buildKey)` called from `onData`.

- [ ] **Step 1: Append Gantt + drawer code to App.html**

```js
function renderGantt() {
  const el = document.getElementById("ganttEl");
  const builds = window.NPI.raw.builds.filter((b) => {
    const f = window.NPI.filters;
    if (f.products.length && !f.products.includes(b.product)) return false;
    if (f.phases.length && !f.phases.includes(b.build_phase)) return false;
    if (f.processes.length && !f.processes.includes(b.process)) return false;
    return true;
  });
  if (!builds.length) { el.innerHTML = '<p class="empty">No builds for current filters.</p>'; return; }
  const dates = builds.flatMap((b) => [b.plan_start, b.plan_end, b.actual_start, b.actual_end]).filter(Boolean).map((d) => new Date(d).getTime());
  const min = Math.min.apply(null, dates), max = Math.max.apply(null, dates), span = Math.max(max - min, 1);
  const pct = (d) => d ? ((new Date(d).getTime() - min) / span * 100) : 0;
  const wdt = (a, b) => (a && b) ? Math.max((new Date(b).getTime() - new Date(a).getTime()) / span * 100, 2) : 0;
  const today = ((Date.now() - min) / span * 100);
  el.innerHTML = builds.map((b, i) => {
    const prog = (typeof b.actual_qty === "number" && typeof b.plan_qty === "number" && b.plan_qty > 0) ? Math.round(b.actual_qty / b.plan_qty * 100) : null;
    return '<div class="gantt-row" data-i="' + i + '"><div class="text-xs"><b>' + b.product + " " + b.build_phase + "</b><br><span class='empty'>" + (b.process || "") + '</span></div><div class="gantt-track">'
      + '<div class="gantt-plan" style="left:' + pct(b.plan_start) + "%;width:" + wdt(b.plan_start, b.plan_end) + '%"></div>'
      + '<div class="gantt-actual" style="left:' + pct(b.actual_start) + "%;width:" + wdt(b.actual_start, b.actual_end || b.plan_end) + '%"></div>'
      + ((today >= 0 && today <= 100) ? '<div class="gantt-today" style="left:' + today + '%"></div>' : "")
      + '</div><div class="text-xs text-right">' + (prog === null ? "—" : prog + "%") + "</div></div>";
  }).join("");
  el.querySelectorAll(".gantt-row").forEach((row) => row.onclick = () => openDrawer(builds[Number(row.dataset.i)]));
}
function openDrawer(b) {
  const lots = window.NPI.raw.lots.filter((l) => l.product === b.product && l.build_phase === b.build_phase);
  const facas = window.NPI.raw.facas.filter((f) => f.product === b.product && f.build_phase === b.build_phase);
  document.getElementById("drawerEl").innerHTML = "<h3 class='font-bold mb-2'>" + b.product + " " + b.build_phase + "</h3>"
    + "<p class='text-xs empty mb-2'>" + (b.process || "") + " · plan " + (b.plan_start || "—") + " → " + (b.plan_end || "—") + " · actual " + (b.actual_start || "—") + " → " + (b.actual_end || "—") + "</p>"
    + "<p class='text-sm mb-2'>Lots: " + lots.length + " · FACA open: " + facas.filter((f) => String(f.status).toLowerCase() !== "closed").length + "/" + facas.length + "</p>"
    + '<button class="card px-3 py-1 text-sm" onclick="document.getElementById(\'drawerEl\').classList.remove(\'open\')">Close</button>';
  document.getElementById("drawerEl").classList.add("open");
}
```

Hook: call `renderGantt()` at the end of existing `onData()`.

- [ ] **Step 2: Verify Gantt and drawer**

Run: browser with mock payload; confirm 3 rows, plan (gray) + actual (blue) bars, today line, click row opens drawer with lot/FACA counts, Close works.
Expected: no console errors; empty-filter state shows "No builds for current filters."

- [ ] **Step 3: Commit**

```bash
git add src/App.html
git commit -m "feat: add Gantt timeline with detail drawer"
```

---

### Task 6: Trend charts — KPI lines, shipment bars, FACA donut

**Files:**
- Modify: `src/App.html` (append `renderCharts`)
- Test: browser check with mock payload.

**Interfaces:**
- Consumes: `window.NPI.raw`, `passFilters`, `chartsEl`, ECharts global `echarts`.
- Produces: `renderCharts()` called from `onData`.

- [ ] **Step 1: Append chart rendering**

```js
function renderCharts() {
  const host = document.getElementById("chartsEl");
  host.innerHTML = '<div class="card p-3"><h3 class="text-sm font-semibold mb-1">FPY / FY by lot</h3><div id="ch1" style="height:260px"></div></div>'
    + '<div class="card p-3"><h3 class="text-sm font-semibold mb-1">UPH by lot</h3><div id="ch2" style="height:260px"></div></div>'
    + '<div class="card p-3"><h3 class="text-sm font-semibold mb-1">Shipment plan vs actual</h3><div id="ch3" style="height:260px"></div></div>'
    + '<div class="card p-3"><h3 class="text-sm font-semibold mb-1">FACA open vs closed</h3><div id="ch4" style="height:260px"></div></div>';
  const lots = window.NPI.raw.lots.filter(passFilters).slice().sort((a, b) => String(a.date) < String(b.date) ? -1 : 1);
  const labels = lots.map((l) => l.lot_no);
  echarts.init(document.getElementById("ch1")).setOption({ xAxis: { type: "category", data: labels }, yAxis: { type: "value", min: 0, max: 1 }, series: [{ name: "FPY", type: "line", data: lots.map((l) => l.fpy) }, { name: "FY", type: "line", data: lots.map((l) => l.fy) }], tooltip: { trigger: "axis" } });
  echarts.init(document.getElementById("ch2")).setOption({ xAxis: { type: "category", data: labels }, yAxis: { type: "value" }, series: [{ name: "UPH", type: "bar", data: lots.map((l) => l.uph) }], tooltip: { trigger: "axis" } });
  const sm = window.NPI.raw.shipments;
  const pSum = sm.reduce((s, r) => s + (typeof r.plan_qty === "number" ? r.plan_qty : 0), 0);
  const aSum = sm.reduce((s, r) => s + (typeof r.actual_qty === "number" ? r.actual_qty : 0), 0);
  echarts.init(document.getElementById("ch3")).setOption({ xAxis: { type: "category", data: ["Qty"] }, yAxis: { type: "value" }, series: [{ name: "Plan", type: "bar", data: [pSum] }, { name: "Actual", type: "bar", data: [aSum] }], tooltip: { trigger: "axis" } });
  const closed = window.NPI.raw.facas.filter((f) => String(f.status).toLowerCase() === "closed").length;
  const open = window.NPI.raw.facas.length - closed;
  echarts.init(document.getElementById("ch4")).setOption({ series: [{ type: "pie", radius: "60%", data: [{ value: closed, name: "Closed" }, { value: open, name: "Open" }] }], tooltip: { trigger: "item" } });
}
```

Hook: call `renderCharts()` at the end of existing `onData()`, guarded by `if (window.echarts)`.

- [ ] **Step 2: Verify charts with mock data**

Run: browser with mock payload; confirm 4 charts render, missing lot L003 breaks the line (gap) rather than zeroing, shipment shows 500 vs 450, FACA shows 1/1.
Expected: no console errors; charts resize on window resize (ECharts default in this layout is acceptable).

- [ ] **Step 3: Commit**

```bash
git add src/App.html
git commit -m "feat: add KPI trend shipment and FACA charts"
```

---

### Task 7: Drill tables, FACA list, CSV export, quality badge, deploy check

**Files:**
- Modify: `src/App.html` (append `renderTables`, `renderFaca`, `renderQuality`, CSV export)
- Test: `node --test tests/kpi.test.mjs`, `node --check src/Code.js`, browser checks, `clasp push --dry-run` if clasp installed.

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: finished dashboard; `SHEET_SCHEMA` mapping point for real sheet integration.

- [ ] **Step 1: Append tables, FACA, quality badge, CSV**

```js
function csv(name, rows) {
  const q = (v) => '"' + String(v === null || v === undefined ? "" : v).replace(/"/g, '""') + '"';
  const text = rows.map((r) => r.map(q).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name; a.click();
}
function renderTables() {
  const lots = window.NPI.raw.lots.filter(passFilters);
  const head = ["Date", "Product", "Build", "Lot", "Process", "FPY", "FY", "UPH", "OEE"];
  const body = lots.map((l) => [l.date, l.product, l.build_phase, l.lot_no, l.process, l.fpy === null ? "—" : (l.fpy * 100).toFixed(1) + "%", l.fy === null ? "—" : (l.fy * 100).toFixed(1) + "%", l.uph === null ? "—" : Number(l.uph).toFixed(1), l.oee === null ? "—" : (l.oee * 100).toFixed(1) + "%"]);
  document.getElementById("tablesEl").innerHTML = '<button id="btnCsv" class="card px-3 py-1 text-sm mb-2">Export CSV</button><div class="overflow-auto"><table class="text-xs w-full"><thead><tr>' + head.map((h) => "<th class='text-left p-1 border-b'>" + h + "</th>").join("") + "</tr></thead><tbody>"
    + body.map((r) => "<tr>" + r.map((c) => "<td class='p-1 border-b'>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
  document.getElementById("btnCsv").onclick = () => csv("lots.csv", [head].concat(body));
}
function renderFaca() {
  const rows = window.NPI.raw.facas;
  const open = rows.filter((f) => String(f.status).toLowerCase() !== "closed").length;
  document.getElementById("facaEl").innerHTML = "<p class='text-xs empty mb-2'>Open " + open + "/" + rows.length + "</p><div class='overflow-auto'><table class='text-xs w-full'><thead><tr><th class='text-left p-1 border-b'>ID</th><th class='text-left p-1 border-b'>Product</th><th class='text-left p-1 border-b'>Build</th><th class='text-left p-1 border-b'>Lot</th><th class='text-left p-1 border-b'>Status</th><th class='text-left p-1 border-b'>Due</th></tr></thead><tbody>"
    + rows.map((f) => "<tr><td class='p-1 border-b'>" + f.faca_id + "</td><td class='p-1 border-b'>" + f.product + "</td><td class='p-1 border-b'>" + f.build_phase + "</td><td class='p-1 border-b'>" + (f.lot_no || "—") + "</td><td class='p-1 border-b'>" + f.status + "</td><td class='p-1 border-b'>" + (f.due_date || "—") + "</td></tr>").join("") + "</tbody></table></div>";
}
function renderQuality() {
  const bad = window.NPI.raw.lots.filter((l) => l.fpy === null || l.fy === null).length;
  document.getElementById("qualityEl").textContent = bad ? ("Data quality: " + bad + " lot(s) incomplete") : "Data quality: OK";
}
```

Hook: call `renderTables(); renderFaca(); renderQuality();` at the end of `onData()`.

- [ ] **Step 2: Run full verification**

Run: `node --test tests/kpi.test.mjs`
Expected: 8 passing.

Run: `node --check src/Code.js`
Expected: syntax OK.

Run: browser with mock payload at 360px, 768px, 1440px plus dark toggle; confirm tables sort visually, CSV downloads, quality badge shows "1 lot(s) incomplete", FACA shows Open 1/2.
Expected: all pass with no console errors.

- [ ] **Step 3: Deploy dry run (requires clasp login; skip push if not authed)**

Run: `npx -y @google/clasp@2 push --dry-run` (or `clasp push --dry-run` if installed)
Expected: lists `Code.js`, `Index.html`, `Styles.html`, `App.html` with no errors. Real `push` + sheet mapping (`SHEET_SCHEMA`) happens against the live Sheet in a follow-up integration pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.html
git commit -m "feat: add drill tables FACA list CSV export and quality badge"
```

---

## Self-Review

- Spec coverage: Build Plan Gantt (Task 5), all six KPIs with cards + trends (Tasks 1, 4, 6), by product/build/lot slicing (Tasks 4–5, 7), Shipment (Tasks 4, 6), FACA closure + list (Tasks 4, 6, 7), responsive + theme (Task 3), error/empty states (Tasks 2, 4, 5), cache (Task 2), deploy (Tasks 1–2, 7). Data entry correctly excluded.
- Placeholders: none — every step has exact file paths, full code blocks, exact run commands, and expected outputs.
- Type consistency: `safeDiv`/`calc*` signatures match between `kpiLogic.mjs`, `Code.js` (`safeDiv_`), and `App.html` (`safeDiv`); payload shape `{ builds, lots, shipments, facas, targets, meta }` is identical in mock, server, and client; DOM ids are fixed once in Task 3 and reused verbatim.

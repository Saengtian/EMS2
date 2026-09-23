# FDB Fans NPI KPI Dashboard — Design Spec

Date: 2026-09-23
Status: Approved design (Option A: single-page GAS executive dashboard)
Backend: Google Sheet ID `1VJVFkOKjeXefrwBxu1aIl21wQwRWkwlvtumJbsjlpg0`, Script ID `1X3LPC2ADiM8ptL9SDZB-vN9Efz6jd1L83I1V_cyxhEGPnpFBDX-evuc2`

## 1. Goal
Modern, interactive, responsive web app (inside Google Apps Script HTML Service) to monitor NPI builds for FDB fan manufacturing. Day-1 user is management viewing Build Plan/timeline/Gantt + KPIs. Data entry comes later.

## 2. Scope
- NPI products: X4151, X4152, … (extensible list from sheet)
- Build phases: P1, P2, EVT, DVT, PVT
- Processes: Rotor assembly, Pillow-Stator assembly, Fan assembly, Fan test accessory
- KPIs: FPY, FY, UPH, OEE, Shipment achievement, FACA closure — each sliceable by product, by build (phase), by lot
- Views: KPI cards, trend charts, Gantt build plan/timeline, drill tables, FACA list
- Non-goals (Day-1): data entry forms, auth beyond Minebea Google login, email alerts, standalone hosting

## 3. Architecture
- `Code.js` (server): `doGet()` serves `Index.html`; `getDashboardData(filters)` returns one JSON payload `{ builds, lots, shipments, facas, meta }`; `getFilterOptions()` returns products/phases/processes/lots. `CacheService` caches payload 6h, invalidated on demand via `clearCache()`.
- `Index.html` (client): single-page app, vanilla JS + Tailwind CDN + ECharts CDN + custom CSS Gantt (no build step). One fetch on load via `google.script.run`, then all filtering client-side. Responsive grid + dark/light toggle.
- Sheets (database, assumed schema — to be mapped to real sheet on integration):
  - `BuildPlan`: product, build_phase, process, plan_start, plan_end, actual_start, actual_end, plan_qty, actual_qty, status, owner
  - `LotResults`: date, product, build_phase, lot_no, process, input_qty, first_pass_qty, final_pass_qty, rework_qty, scrap_qty, run_hours, planned_hours, downtime_min, ideal_cycle_sec
  - `Shipments`: product, build_phase, lot_no, plan_qty, actual_qty, plan_date, actual_date
  - `FACA`: faca_id, product, build_phase, lot_no, process, title, status (open/closed), owner, opened_date, due_date, closed_date
  - `Targets` (optional): kpi, product, build_phase, target_value
- Deployment: `clasp` push to existing Script ID; no secrets in client; Minebea Workspace login enforced by Apps Script `/exec`.

## 4. Components / Layout
1. Header + global filters: Product (multi), Phase (multi), Process (multi), Lot search, Date range, Reset. Dark/light toggle.
2. KPI cards (6): FPY, FY, UPH, OEE, Shipment achievement, FACA closure — each with vs-target delta, sparkline, drill hint.
3. NPI Build Plan Gantt: rows = product × phase, bars = plan vs actual, today line, progress %, click bar → build detail drawer (lots, KPIs, FACAs).
4. Trends: FPY/FY/UPH/OEE line charts by lot/date; Shipment plan-vs-actual bars; FACA open/closed donut + overdue/aging.
5. Drill tables: by product → build → lot matrix with all 6 KPIs; sortable, CSV export; FACA table with status filter.
6. Data-quality badge: counts missing/incomplete lots; missing values render as "—", never zero.

## 5. Data Flow + KPI Math (assumed, explicit)
- Load: client calls `getDashboardData` once → server reads 4–5 sheets → computes per-lot base metrics → returns JSON → client aggregates by current filters.
- FPY = first_pass_qty / input_qty (per process; rolled up as geometric/weighted avg — weighted by input_qty).
- FY = final_pass_qty / input_qty (weighted by input_qty).
- UPH = sum(final_pass_qty) / sum(run_hours).
- OEE = Availability × Performance × Quality; A = (planned_hours − downtime) / planned_hours; P = (ideal_cycle_sec × final_pass_qty / 3600) / run_hours; Q = final_pass_qty / input_qty.
- Shipment achievement = sum(actual_qty) / sum(plan_qty) over filtered scope and date range.
- FACA closure = closed / total; plus overdue count (due_date < today AND status = open).
- All KPIs recompute on filter change client-side from lot-level payload; targets from `Targets` sheet or defaults agreed at integration.

## 6. Error Handling
- Empty scope → cards show "—" + "No data for filters" hint, charts show empty state, never crash.
- Sheet/tab missing → server returns `{ error, missingSheet }`; client shows banner naming the expected tab/columns.
- Divide-by-zero / missing columns → metric = null → "—".
- `google.script.run` failure → retry once, then error banner with timestamp.

## 7. Testing
- Manual: load with mock payload covering 2 products × 3 phases × 3 lots incl. missing values; verify filters, Gantt dates, KPI math spot-checks, responsive 360px/768px/1440px, light/dark.
- Formula checks: hand-verify one lot each for FPY/FY/UPH/OEE/Shipment/FACA against sheet values.
- Later (data-entry phase): add server-side validation tests.

## 8. Integration Note
Real sheet columns will be mapped to this assumed schema in one `SHEET_SCHEMA` config in `Code.js` at build time. No UI changes needed for column renames.

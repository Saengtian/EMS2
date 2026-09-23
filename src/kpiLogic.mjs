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

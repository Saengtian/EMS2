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
  const oee = calcOEE({ plannedHours: 10, downtimeMin: 60, idealCycleSec: 30, finalPass: 980, input: 1000 });
  assert.ok(Math.abs(oee - 0.800333) < 0.0005);
});
test("divide by zero returns null", () => assert.equal(calcFPY(5, 0), null));
test("weighted FPY skips bad lots", () => {
  assert.equal(weightedRate([{ num: 950, den: 1000 }, { num: 0, den: 0 }, { num: 400, den: 500 }]), 1350 / 1500);
});

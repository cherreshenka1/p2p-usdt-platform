import test from "node:test";
import assert from "node:assert/strict";
import { createSeedData } from "../../packages/domain/index.js";
import { buildReadinessReport, tokenEquals } from "../../packages/security/index.js";

test("token comparison is strict", () => {
  assert.equal(tokenEquals("abc", "abc"), true);
  assert.equal(tokenEquals("abc", "abcd"), false);
  assert.equal(tokenEquals("abc", "xyz"), false);
});

test("readiness reports missing production blockers", () => {
  const db = createSeedData();
  const report = buildReadinessReport(db);
  assert.equal(report.ready, false);
  assert.ok(report.checks.some((check) => check.name === "at least one active legal document" && !check.pass));
});

test("readiness passes legal document check when active doc exists", () => {
  const db = createSeedData();
  db.legalDocuments[0].status = "active";
  const report = buildReadinessReport(db);
  assert.ok(report.checks.some((check) => check.name === "at least one active legal document" && check.pass));
});

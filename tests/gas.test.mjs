/**
 * Integration test backend Apps Script di Node: layanan Google (Sheets,
 * Cache, Lock, Properties, Utilities) diganti tiruan in-memory, lalu
 * fungsi uji bawaan gas/06_Tests.gs dijalankan apa adanya.
 */
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const GAS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../gas");
const signed = (buf) => [...buf].map((b) => (b > 127 ? b - 256 : b));
const storeValue = (v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v);

class FakeRange {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    return Array.from({ length: this.numRows }, (_, r) =>
      Array.from({ length: this.numCols }, (_, c) => this.sheet.rows[this.row - 1 + r]?.[this.col - 1 + c] ?? ""),
    );
  }
  setValues(values) {
    values.forEach((rowVals, r) => {
      const target = (this.sheet.rows[this.row - 1 + r] ??= []);
      rowVals.forEach((v, c) => (target[this.col - 1 + c] = storeValue(v)));
    });
    return this;
  }
  clearContent() {
    return this.setValues(Array.from({ length: this.numRows }, () => Array(this.numCols).fill("")));
  }
  createTextFinder(text) {
    const range = this;
    return {
      matchEntireCell: function () { return this; },
      matchCase: function () { return this; },
      findNext() {
        const values = range.getValues();
        const i = values.findIndex((row) => row.some((cell) => String(cell) === text));
        return i < 0 ? null : { getRow: () => range.row + i };
      },
    };
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.numRows; }
  getSheet() { return this.sheet; }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
  }
  getName() { return this.name; }
  getLastRow() {
    let last = this.rows.length;
    while (last > 0 && this.rows[last - 1].every((v) => v === "" || v == null)) last--;
    return last;
  }
  getRange(row, col, numRows, numCols) { return new FakeRange(this, row, col, numRows, numCols); }
  appendRow(values) { this.rows.splice(this.getLastRow(), 0, values.map(storeValue)); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
  setFrozenRows() {}
  hideSheet() {}
}

function createContext() {
  const sheets = new Map();
  const spreadsheet = {
    getSheetByName: (n) => sheets.get(n) ?? null,
    insertSheet: (n) => (sheets.set(n, new FakeSheet(n)), sheets.get(n)),
    getUrl: () => "memory://spreadsheet",
  };
  const props = new Map();
  const cache = new Map();
  const ctx = {
    console: { log() {}, error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) ?? null,
        put: (k, v) => cache.set(k, v),
        removeAll: (keys) => keys.forEach((k) => cache.delete(k)),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_, text) => signed(createHash("sha256").update(text, "utf8").digest()),
      computeHmacSha256Signature: (value, key) => signed(createHmac("sha256", key).update(value, "utf8").digest()),
      getUuid: () => randomUUID(),
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }) },
    MailApp: { sendEmail() {} },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger: () => {
        const builder = { forSpreadsheet: () => builder, onEdit: () => builder, timeBased: () => builder, everyDays: () => builder, atHour: () => builder, create() {} };
        return builder;
      },
    },
    __sheets: sheets,
    __props: props,
  };
  vm.createContext(ctx);
  const source = fs
    .readdirSync(GAS_DIR)
    .filter((f) => f.endsWith(".gs"))
    .sort()
    .map((f) => fs.readFileSync(path.join(GAS_DIR, f), "utf8"))
    .join("\n");
  vm.runInContext(source, ctx);
  return ctx;
}

const run = (ctx, code) => vm.runInContext(code, ctx);

test("GAS: setup membuat skema, seed konten & properti aman", () => {
  const ctx = createContext();
  run(ctx, "setup()");
  for (const name of ["Users", "Otps", "Sessions", "Faq", "Announcements", "AuditLog"]) assert.ok(ctx.__sheets.has(name), name);
  assert.equal(ctx.__props.get("DEV_MODE"), "true");
  assert.equal(ctx.__props.get("PEPPER").length, 64);
  assert.equal(ctx.__sheets.get("Faq").getLastRow(), 9); // header + 8 FAQ
});

test("GAS: unit test, alur autentikasi end-to-end, dan kontrak HTTP lulus", () => {
  const ctx = createContext();
  run(ctx, "setup()");
  assert.equal(run(ctx, "runUnitTests()"), "Semua unit test lulus.");
  assert.equal(run(ctx, "runSmokeTestAuth()"), "Smoke test autentikasi lulus.");
  assert.equal(run(ctx, "runSmokeTestHttp()"), "Smoke test HTTP lulus.");
  // Data uji dibersihkan, tidak ada token mentah tersimpan
  assert.equal(ctx.__sheets.get("Users").getLastRow(), 1);
});

test("GAS: respons FAQ sesuai kontrak frontend { version, items[] }", () => {
  const ctx = createContext();
  run(ctx, "setup()");
  const body = JSON.parse(run(ctx, "doGet({ parameter: { action: 'faq' } }).getContent()"));
  assert.equal(body.ok, true);
  assert.match(body.data.version, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(body.data.items[0]), ["id", "question", "answer"]);
  assert.ok(body.meta.requestId);
});

test("GAS: rate limit login setelah 10 percobaan", () => {
  const ctx = createContext();
  run(ctx, "setup()");
  const attempt = () =>
    JSON.parse(run(ctx, `doPost({ postData: { contents: JSON.stringify({ action: 'login', payload: { email: 'x@contoh.id', password: 'salah123' } }) } }).getContent()`));
  for (let i = 0; i < 10; i++) assert.equal(attempt().error.code, "invalidCredentials");
  const blocked = attempt();
  assert.equal(blocked.error.code, "rateLimited");
  assert.equal(blocked.error.status, 429);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { appConfig } from "../src/assets/js/config/app.config.js";
import { getMarketStatus } from "../src/assets/js/features/landing/market-hours.js";
import { buildModel, detectSignals, mulberry32 } from "../src/assets/js/features/landing/threshold-model.js";

// Waktu WIB = UTC+7
const wib = (iso) => new Date(`${iso}+07:00`);

test("jam bursa: sesi I, istirahat, sesi II, tutup", () => {
  const m = appConfig.market;
  assert.equal(getMarketStatus(wib("2026-10-07T08:50:00"), m).state, "pre"); // Rabu
  assert.equal(getMarketStatus(wib("2026-10-07T10:00:00"), m).state, "session1");
  assert.equal(getMarketStatus(wib("2026-10-07T12:30:00"), m).state, "break");
  assert.equal(getMarketStatus(wib("2026-10-07T14:00:00"), m).state, "session2");
  assert.equal(getMarketStatus(wib("2026-10-07T17:00:00"), m).state, "closed");
});

test("jam bursa: Jumat sesi I berakhir 11.30, akhir pekan tutup hingga Senin", () => {
  const m = appConfig.market;
  const friday = getMarketStatus(wib("2026-10-09T11:45:00"), m);
  assert.equal(friday.state, "break");
  assert.equal(friday.at, 840); // Sesi II Jumat 14.00
  const saturday = getMarketStatus(wib("2026-10-10T10:00:00"), m);
  assert.equal(saturday.state, "closed");
  assert.equal(saturday.weekday, 1);
  assert.equal(saturday.dayOffset, 2);
});

test("PRNG deterministik", () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  assert.equal(a(), b());
});

test("deteksi sinyal: hanya saat menembus dari bawah", () => {
  assert.deepEqual(detectSignals([0.5, 0.7, 0.8, 0.5, 0.65], 0.6), [1, 4]);
});

test("ambang dinamis lebih selektif saat pasar bergejolak dibanding ambang statis", () => {
  const volatile = buildModel("volatile");
  assert.ok(volatile.dynamicSignals.length < volatile.staticSignals.length);
  const calm = buildModel("calm");
  assert.ok(calm.k < volatile.k);
  assert.equal(calm.scores.length, 60);
});

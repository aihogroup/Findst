/**
 * Model ILUSTRASI dynamic threshold (murni, deterministik, teruji).
 * Bukan model produksi — hanya untuk menjelaskan konsep di landing page.
 *
 *   ambang_t = rata-rata(skor[t-w..t-1]) + k × simpangan_baku(skor[t-w..t-1])
 *   k mengikuti rezim pasar: tenang < normal < bergejolak
 */
export const STATIC_THRESHOLD = 0.6;

export const REGIMES = Object.freeze({
  calm: Object.freeze({ sigma: 0.03, k: 0.6 }),
  normal: Object.freeze({ sigma: 0.065, k: 1.0 }),
  volatile: Object.freeze({ sigma: 0.13, k: 1.5 }),
});

/** PRNG deterministik (mulberry32) → grafik selalu sama untuk seed yang sama. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => Math.min(0.98, Math.max(0.02, v));

export function generateScores(regime, { length = 60, seed = 7 } = {}) {
  const { sigma } = REGIMES[regime] ?? REGIMES.normal;
  const rand = mulberry32(seed);
  const gaussian = () => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return Array.from({ length }, (_, i) => clamp01(0.5 + 0.12 * Math.sin(i / 6) + 0.04 * Math.sin(i / 2.3) + gaussian() * sigma));
}

export function rollingStats(values, window) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window), i);
    const sample = slice.length >= 3 ? slice : values.slice(0, Math.max(3, i + 1));
    const mean = sample.reduce((s, v) => s + v, 0) / sample.length;
    const variance = sample.reduce((s, v) => s + (v - mean) ** 2, 0) / sample.length;
    return { mean, std: Math.sqrt(variance) };
  });
}

/** Indeks saat skor menembus ambang dari bawah (crossing up). */
export function detectSignals(scores, thresholds) {
  const at = (arr, i) => (Array.isArray(arr) ? arr[i] : arr);
  const signals = [];
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > at(thresholds, i) && scores[i - 1] <= at(thresholds, i - 1)) signals.push(i);
  }
  return signals;
}

export function buildModel(regime = "normal", { length = 60, seed = 7, window = 10 } = {}) {
  const { k } = REGIMES[regime] ?? REGIMES.normal;
  const scores = generateScores(regime, { length, seed });
  const stats = rollingStats(scores, window);
  const thresholds = stats.map(({ mean, std }) => Math.min(0.98, mean + k * std));
  const lower = stats.map(({ mean, std }) => Math.max(0.02, mean - k * std));
  return {
    regime,
    k,
    scores,
    thresholds,
    lower,
    dynamicSignals: detectSignals(scores, thresholds),
    staticSignals: detectSignals(scores, STATIC_THRESHOLD),
  };
}

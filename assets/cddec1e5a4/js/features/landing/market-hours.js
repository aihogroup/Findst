/**
 * Model jam perdagangan BEI (murni, tanpa DOM → teruji di tests/).
 * Mengembalikan status sesi untuk waktu tertentu di zona Asia/Jakarta.
 */
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { weekday: WEEKDAY_INDEX[get("weekday")], minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const scheduleFor = (weekday, market) => (weekday === 5 ? market.schedule.friday : market.schedule.default);
const within = (m, [start, end]) => m >= start && m < end;

/**
 * @returns {{ state: "pre"|"session1"|"break"|"session2"|"preClose"|"closed",
 *             at: number, dayOffset: number, weekday: number }}
 *   `at` = menit acuan untuk label (mis. kapan sesi berikutnya mulai/berakhir)
 */
export function getMarketStatus(date, market) {
  const { weekday, minutes } = zonedParts(date, market.timeZone);
  const isTradingDay = market.weekdays.includes(weekday);

  if (isTradingDay) {
    const s = scheduleFor(weekday, market);
    if (within(minutes, s.preOpen)) return { state: "pre", at: s.session1[0], dayOffset: 0, weekday };
    if (within(minutes, s.session1)) return { state: "session1", at: s.session1[1], dayOffset: 0, weekday };
    if (minutes >= s.session1[1] && minutes < s.session2[0]) return { state: "break", at: s.session2[0], dayOffset: 0, weekday };
    if (within(minutes, s.session2)) return { state: "session2", at: s.session2[1], dayOffset: 0, weekday };
    if (within(minutes, s.preClose)) return { state: "preClose", at: s.preClose[1], dayOffset: 0, weekday };
    if (minutes < s.preOpen[0]) return { state: "closed", at: s.session1[0], dayOffset: 0, weekday };
  }

  // Cari hari bursa berikutnya
  for (let offset = 1; offset <= 7; offset++) {
    const next = (weekday + offset) % 7;
    if (market.weekdays.includes(next)) {
      return { state: "closed", at: scheduleFor(next, market).session1[0], dayOffset: offset, weekday: next };
    }
  }
  return { state: "closed", at: 540, dayOffset: 1, weekday: (weekday + 1) % 7 };
}

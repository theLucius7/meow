/** Run: node --experimental-strip-types --test scripts/test-ojflare-contributions.mjs */
import assert from "node:assert/strict";
import test from "node:test";
import {
  getContributionCalendar,
  getTaipeiToday,
  parseContributions,
} from "../src/utils/ojflare-contributions.ts";

function event(id, iso, platform = "codeforces", problem = "a") {
  return { id, epoch: Date.parse(iso) / 1000, platform, problemId: `${platform}:${problem}` };
}

const dashboard = (accepted = []) => ({ schemaVersion: 2, accepted });
const cells = (calendar) => calendar.weeks.flat().filter(Boolean);

test("invalid schemas fail distinctly from an empty accepted history", () => {
  for (const value of [null, [], {}, { schemaVersion: 1, accepted: [] }, { schemaVersion: "2", accepted: [] }, { schemaVersion: 2, accepted: {} }]) {
    assert.throws(() => parseContributions(value), /Invalid OJFlare dashboard/);
  }
  assert.deepEqual(parseContributions(dashboard()), { days: [], years: [] });
});

test("first AC is selected across all years before a year is requested", () => {
  const model = parseContributions(dashboard([
    event(20, "2024-02-02T12:00:00Z"),
    event(10, "2023-03-03T12:00:00Z"),
    event(11, "2023-03-03T12:00:00Z"),
    event(10, "2023-03-03T12:00:00Z"),
  ]));
  assert.deepEqual(model.years, [2024, 2023], "Repeat-only AC years remain selectable");
  assert.deepEqual(model.days, [{ date: "2023-03-03", platform: "codeforces", count: 1 }]);
  assert.equal(getContributionCalendar(model, 2024, "all", "2024-12-31").total, 0);
  assert.equal(getContributionCalendar(model, 2023, "all", "2024-12-31").total, 1);
});

test("repeat ACs count once while different platforms and problems stay separate", () => {
  const model = parseContributions(dashboard([
    event(1, "2026-09-08T00:00:00Z"),
    event(2, "2026-09-08T01:00:00Z"),
    event(3, "2026-09-08T02:00:00Z", "codeforces", "b"),
    event(1, "2026-09-08T03:00:00Z", "atcoder"),
    event(1, "2026-09-08T04:00:00Z", "qoj"),
    event(1, "2026-09-09T00:00:00Z", "nowcoder"),
  ]));
  const all = getContributionCalendar(model, 2026, "all", "2026-09-09");
  assert.equal(all.total, 5);
  assert.equal(all.activeDays, 2);
  assert.equal(cells(all).find((day) => day.date === "2026-09-08").count, 4);
  for (const [platform, expected] of [["codeforces", 2], ["atcoder", 1], ["qoj", 1], ["nowcoder", 1]]) {
    const calendar = getContributionCalendar(model, 2026, platform, "2026-09-09");
    assert.equal(calendar.total, expected);
    assert.equal(calendar.activeDays, 1);
  }
});

test("UTC+8 midnight changes the day and year independently of the host timezone", () => {
  const value = dashboard([
    event(1, "2023-12-31T15:59:59Z", "atcoder", "a"),
    event(2, "2023-12-31T16:00:00Z", "atcoder", "b"),
    event(3, "2024-01-01T00:00:00Z", "atcoder", "c"),
  ]);
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      const model = parseContributions(value);
      assert.deepEqual(model.days, [
        { date: "2023-12-31", platform: "atcoder", count: 1 },
        { date: "2024-01-01", platform: "atcoder", count: 2 },
      ]);
      assert.deepEqual(model.years, [2024, 2023]);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("invalid rows and disabled platforms are skipped and undated solves create no dates", () => {
  const valid = event(1, "2026-09-08T00:00:00Z");
  const broken = [null, [], {},
    ...[0, -1, 1.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((id) => ({ ...valid, id })),
    ...[0, -1, 1.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER, 253402272000].map((epoch) => ({ ...valid, epoch })),
    ...["", "codeforces:", "atcoder:a", " codeforces:a", "codeforces:a "].map((problemId) => ({ ...valid, problemId })),
    { ...valid, platform: "luogu", problemId: "luogu:P1001" },
    { ...valid, platform: "unknown", problemId: "unknown:a" },
  ];
  const model = parseContributions({ ...dashboard([...broken, valid]), undatedSolved: ["qoj:100", "nowcoder:200"] });
  assert.deepEqual(model.days, [{ date: "2026-09-08", platform: "codeforces", count: 1 }]);
  assert.deepEqual(model.years, [2026]);
});

test("a leap year has Monday-first columns, February 29, and correct final padding", () => {
  const calendar = getContributionCalendar(parseContributions(dashboard()), 2024, "all", "2024-02-29");
  assert.equal(calendar.weeks.length, 53);
  assert.ok(calendar.weeks.every((week) => week.length === 7));
  assert.equal(calendar.weeks[0][0].date, "2024-01-01");
  assert.equal(cells(calendar).length, 366);
  assert.equal(cells(calendar)[59].date, "2024-02-29");
  assert.equal(calendar.weeks.at(-1)[1].date, "2024-12-31");
  assert.deepEqual(calendar.weeks.at(-1).slice(2), [null, null, null, null, null]);
  assert.equal(cells(calendar).find((day) => day.date === "2024-02-29").future, false);
  assert.equal(cells(calendar).find((day) => day.date === "2024-03-01").future, true);
});

test("a Sunday year start gets six blank cells and month positions match their first day", () => {
  const calendar = getContributionCalendar(parseContributions(dashboard()), 2023, "all", "2026-09-09");
  assert.deepEqual(calendar.weeks[0].slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(calendar.weeks[0][6].date, "2023-01-01");
  assert.equal(cells(calendar).length, 365);
  assert.equal(calendar.months.length, 12);
  assert.deepEqual(calendar.months.slice(0, 3), [{ month: 1, week: 0 }, { month: 2, week: 5 }, { month: 3, week: 9 }]);
  for (const { month, week } of calendar.months) {
    assert.ok(calendar.weeks[week].some((day) => day?.date === `2023-${String(month).padStart(2, "0")}-01`));
  }
});

test("color levels cover the official fixed boundaries and annual totals exclude other years", () => {
  const counts = [0, 1, 2, 3, 5, 6, 9, 10, 20];
  const days = counts.map((count, index) => ({ date: `2026-01-${String(index + 1).padStart(2, "0")}`, platform: "codeforces", count }));
  const model = { days: [...days, { date: "2025-12-31", platform: "codeforces", count: 100 }], years: [2026, 2025] };
  const calendar = getContributionCalendar(model, 2026, "all", "2026-01-05");
  assert.deepEqual(cells(calendar).slice(0, counts.length).map((day) => day.level), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(calendar.total, 56);
  assert.equal(calendar.activeDays, 8);
  assert.equal(cells(calendar)[5].future, true);
});

test("today defaults to Taipei rather than the browser timezone", (t) => {
  t.mock.method(Date, "now", () => Date.parse("2025-12-31T16:00:00Z"));
  assert.equal(getTaipeiToday(), "2026-01-01");
  const calendar = getContributionCalendar(parseContributions(dashboard()), 2026, "all");
  assert.equal(calendar.today, "2026-01-01");
  assert.equal(cells(calendar)[0].future, false);
  assert.equal(cells(calendar)[1].future, true);
});

test("invalid calendar arguments are rejected without normalizing impossible dates", () => {
  const model = parseContributions(dashboard());
  for (const year of [0, -1, 1.5, NaN, Infinity, 10000]) {
    assert.throws(() => getContributionCalendar(model, year, "all", "2026-09-09"), /Invalid contribution year/);
  }
  for (const today of ["2026-02-29", "2026-13-01", "2026-9-9", "", "invalid"]) {
    assert.throws(() => getContributionCalendar(model, 2026, "all", today), /Invalid contribution date/);
  }
  assert.throws(() => getContributionCalendar(model, 2026, "luogu", "2026-09-09"), /Invalid contribution platform/);
});

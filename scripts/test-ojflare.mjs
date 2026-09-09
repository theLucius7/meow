/** Run: node --experimental-strip-types --test scripts/test-ojflare.mjs */
import assert from "node:assert/strict";
import test from "node:test";
import { parseRecentSubmissions, subscribeOJFlareDashboard, subscribeRecentSubmissions } from "../src/utils/ojflare.ts";

const BASE = "https://ojflare.example.test";

function submission(id, epoch, platform = "codeforces", overrides = {}) {
  return {
    id, epoch, platform,
    problemId: `${platform}:problem-a`,
    url: platform === "atcoder"
      ? `https://atcoder.jp/contests/abc123/submissions/${id}`
      : `https://codeforces.com/contest/123/submission/${id}`,
    ...overrides,
  };
}

function dashboard(accepted = [submission(1, 1_700_000_000)]) {
  return {
    schemaVersion: 2,
    problems: [
      { id: "codeforces:problem-a", name: "Codeforces problem" },
      { id: "atcoder:problem-a", name: "AtCoder problem" },
    ],
    accepted,
  };
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function harness(t, { hidden = false, ignoreAbort = false } = {}) {
  const descriptors = new Map(["document", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timers = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const pendingTimers = new Set();
  globalThis.setTimeout = (callback, delay, ...args) => {
    let id;
    id = timers.setTimeout(() => { pendingTimers.delete(id); callback(...args); }, delay);
    pendingTimers.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => { pendingTimers.delete(id); timers.clearTimeout(id); };
  const listeners = new Set();
  const page = new EventTarget();
  page.hidden = hidden;
  const add = page.addEventListener.bind(page);
  const remove = page.removeEventListener.bind(page);
  page.addEventListener = (type, callback) => { listeners.add(callback); add(type, callback); };
  page.removeEventListener = (type, callback) => { listeners.delete(callback); remove(type, callback); };
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: page });
  const requests = [];
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    const request = {
      url: new URL(url), options, settled: false,
      respond(body = dashboard(), status = 200) {
        if (request.settled) return;
        request.settled = true;
        options.signal.removeEventListener("abort", abort);
        resolve({ ok: status >= 200 && status < 300, status, json: async () => {
          if (body instanceof Error) throw body;
          return body;
        } });
      },
      reject(error = new TypeError("Network failure")) {
        if (request.settled) return;
        request.settled = true;
        options.signal.removeEventListener("abort", abort);
        reject(error);
      },
    };
    const abort = () => { if (!ignoreAbort) request.reject(new DOMException("Aborted", "AbortError")); };
    options.signal.addEventListener("abort", abort, { once: true });
    requests.push(request);
  });
  const updates = [];
  const disposers = [];
  const h = {
    requests, updates,
    latest: () => updates.at(-1),
    listenerCount: () => listeners.size,
    start(baseUrl = BASE) {
      const dispose = subscribeRecentSubmissions(baseUrl, (state) => updates.push(structuredClone(state)));
      disposers.push(dispose);
      return dispose;
    },
    startDashboard(baseUrl = BASE) {
      const states = [];
      const dispose = subscribeOJFlareDashboard(baseUrl, (state) => states.push(structuredClone(state)));
      disposers.push(dispose);
      return { states, dispose, latest: () => states.at(-1) };
    },
    visibility(hidden) { page.hidden = hidden; page.dispatchEvent(new Event("visibilitychange")); },
    async advance(milliseconds) { t.mock.timers.tick(milliseconds); await settle(); },
    async respond(body = dashboard(), status = 200) { requests.at(-1).respond(body, status); await settle(); },
  };
  t.after(async () => {
    try {
      for (const dispose of disposers) dispose();
      for (const request of requests.filter((item) => !item.settled)) {
        assert.equal(request.options.signal.aborted, true, "Outstanding fetches must be aborted on disposal");
        request.reject(new DOMException("Test cleanup", "AbortError"));
      }
      await settle();
      assert.equal(listeners.size, 0, "Visibility listeners must be removed");
      assert.equal(pendingTimers.size, 0, "Polling and timeout timers must be cleared");
    } finally {
      Object.assign(globalThis, timers);
      t.mock.timers.reset();
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
  return h;
}

test("invalid dashboard schemas fail instead of pretending the history is empty", () => {
  const invalid = [null, [], {}, { ...dashboard(), schemaVersion: 1 }, { ...dashboard(), schemaVersion: "2" }, { ...dashboard(), accepted: {} }, { ...dashboard(), problems: null }];
  for (const value of invalid) assert.throws(() => parseRecentSubmissions(value), /Invalid OJFlare dashboard/);
  assert.deepEqual(parseRecentSubmissions(dashboard([])), []);
});

test("the newest three supported submissions are selected by epoch seconds with joined problem names", () => {
  const data = dashboard([
    submission(90, 100),
    submission(2, 300, "atcoder"),
    submission(80, 200),
    submission(3, 400),
    submission(4, 500, "nowcoder"),
  ]);
  data.attempted = [submission(5, 600)];
  const result = parseRecentSubmissions(data);
  assert.deepEqual(result.map((item) => item.id), ["3", "2", "80"]);
  assert.deepEqual(result.map((item) => item.title), ["Codeforces problem", "AtCoder problem", "Codeforces problem"]);
  assert.equal(result[0].submittedAt, "1970-01-01T00:06:40.000Z");
  assert.equal(result[1].platform, "atcoder");
  assert.equal(result[1].url, "https://atcoder.jp/contests/abc123/submissions/2");
});

test("deduplication uses platform and submission ID while retaining separate submissions of the same problem", () => {
  const result = parseRecentSubmissions(dashboard([
    submission(1, 100), submission(1, 400), submission(2, 300), submission(1, 200, "atcoder"),
  ]));
  assert.deepEqual(result.map((item) => `${item.platform}:${item.id}`), ["codeforces:1", "codeforces:2", "atcoder:1"]);
  assert.equal(result[0].submittedAt, new Date(400_000).toISOString());
});

test("invalid individual records are skipped without losing valid supported submissions", () => {
  const broken = [
    null, [], {},
    submission("1", 100), submission(0, 100), submission(1.5, 100),
    submission(Number.MAX_SAFE_INTEGER + 1, 100),
    submission(1, "100"), submission(1, -1), submission(1, Infinity), submission(1, NaN),
    submission(1, Number.MAX_SAFE_INTEGER),
    submission(1, 100, "codeforces", { problemId: " " }),
    submission(1, 100, "codeforces", { url: "https://codeforces.com/contest/123/submission/999" }),
    submission(1, 100, "atcoder", { url: "https://codeforces.com/contest/123/submission/1" }),
  ];
  assert.deepEqual(parseRecentSubmissions(dashboard([...broken, submission(7, 500)])).map((item) => item.id), ["7"]);
});

test("missing problem metadata falls back to its problem ID", () => {
  const data = dashboard([submission(7, 500)]);
  data.problems = [null, { id: "codeforces:problem-a", name: " " }];
  assert.equal(parseRecentSubmissions(data)[0].title, "codeforces:problem-a");
});

test("official contest, gym, problemset, direct, and AtCoder submission URLs stay intact", () => {
  const urls = [
    ["codeforces", "https://codeforces.com/contest/123/submission/42"],
    ["codeforces", "https://codeforces.com/gym/104976/submission/42"],
    ["codeforces", "https://codeforces.com/problemset/submission/123/42"],
    ["codeforces", "https://codeforces.com/submission/42"],
    ["atcoder", "https://atcoder.jp/contests/APG4b/submissions/42"],
  ];
  for (const [platform, url] of urls) {
    assert.equal(parseRecentSubmissions(dashboard([submission(42, 100, platform, { url })]))[0].url, url);
  }
});

test("only real HTTPS submission destinations for the declared platform are accepted", () => {
  const unsafe = [
    "javascript:alert(1)", "data:text/html,hello", "//codeforces.com/contest/123/submission/42",
    "http://codeforces.com/contest/123/submission/42",
    "https://codeforces.com.attacker.test/contest/123/submission/42",
    "https://user:secret@codeforces.com/contest/123/submission/42",
    "https://codeforces.com:8443/contest/123/submission/42",
    "https://codeforces.com/profile/someone",
    "https://codeforces.com/contest/123/submission/42?redirect=https://attacker.test",
    "https://codeforces.com/contest/123/submission/42#fragment",
    "https://codeforces.com/contest/123/submission/0",
    "https://codeforces.com/contest/123/other/../submission/42",
    "https://codeforces.com/contest/123/%2e%2e/123/submission/42",
    "https://codeforces.com/contest/123/submission%2f42",
    "https://codeforces.com\\contest\\123\\submission\\42",
    " https://codeforces.com/contest/123/submission/42",
    "https://codeforces.com/contest/123/submission/42\n",
  ];
  for (const url of unsafe) assert.deepEqual(parseRecentSubmissions(dashboard([submission(42, 100, "codeforces", { url })])), [], url);
  for (const url of ["https://atcoder.jp.attacker.test/contests/abc123/submissions/42", "https://atcoder.jp/contests/abc123/tasks/a", "https://atcoder.jp/contests/abc123/submissions/42?lang=en"]) {
    assert.deepEqual(parseRecentSubmissions(dashboard([submission(42, 100, "atcoder", { url })])), [], url);
  }
});

test("subscription loads immediately, retains HTTP caching, and polls once per five minutes without overlap", async (t) => {
  const h = harness(t);
  h.start();
  assert.deepEqual(h.latest(), { status: "loading", submissions: [] });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url.href, `${BASE}/data/dashboard.json`);
  assert.equal(h.requests[0].options.credentials, "omit");
  assert.equal(h.requests[0].options.referrerPolicy, "no-referrer");
  assert.equal(h.requests[0].options.cache, undefined, "The public snapshot should use browser HTTP caching");
  await h.respond();
  await h.advance(299_999);
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  assert.equal(h.requests.length, 2);
  h.visibility(false);
  h.visibility(false);
  await h.advance(1_000);
  assert.equal(h.requests.length, 2);
  await h.respond();
  await h.advance(300_000);
  assert.equal(h.requests.length, 3);
});

for (const failure of ["network", "HTTP 503", "invalid JSON", "invalid schema"]) {
  test(`an initial ${failure} reports unavailable and can recover on a later poll`, async (t) => {
    const h = harness(t);
    h.start();
    if (failure === "network") h.requests[0].reject();
    else if (failure === "HTTP 503") h.requests[0].respond({}, 503);
    else if (failure === "invalid JSON") h.requests[0].respond(new SyntaxError("Invalid JSON"));
    else h.requests[0].respond({});
    await settle();
    assert.deepEqual(h.latest(), { status: "unavailable", submissions: [] });
    await h.advance(300_000);
    await h.respond();
    assert.equal(h.latest().status, "ready");
    assert.equal(h.latest().submissions[0].id, "1");
  });
}

test("an in-flight request times out after 12 seconds and is retried after five minutes", async (t) => {
  const h = harness(t);
  h.start();
  await h.advance(11_999);
  assert.equal(h.requests[0].options.signal.aborted, false);
  await h.advance(1);
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.latest().status, "unavailable");
  await h.advance(299_999);
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  assert.equal(h.requests.length, 2);
});

for (const failure of ["network", "HTTP 503", "invalid schema", "timeout"]) {
  test(`background ${failure} retains the last successful history`, async (t) => {
    const h = harness(t);
    h.start();
    await h.respond();
    const previous = structuredClone(h.latest());
    await h.advance(300_000);
    const request = h.requests.at(-1);
    if (failure === "network") request.reject();
    else if (failure === "HTTP 503") request.respond({}, 503);
    else if (failure === "invalid schema") request.respond({});
    else await h.advance(12_000);
    await settle();
    assert.deepEqual(h.latest(), previous);
    await h.advance(300_000);
    await h.respond(dashboard([submission(9, 1_800_000_000, "atcoder")]));
    assert.equal(h.latest().submissions[0].id, "9");
  });
}

test("a successful empty history also remains ready after a later fetch failure", async (t) => {
  const h = harness(t);
  h.start();
  await h.respond(dashboard([]));
  await h.advance(300_000);
  h.requests.at(-1).reject();
  await settle();
  assert.deepEqual(h.latest(), { status: "ready", submissions: [] });
});

test("hidden pages pause requests and visibility restoration refreshes only once", async (t) => {
  const h = harness(t, { hidden: true });
  h.start();
  await h.advance(600_000);
  assert.equal(h.requests.length, 0);
  h.visibility(false);
  h.visibility(false);
  assert.equal(h.requests.length, 1);
  await h.respond();
  h.visibility(true);
  await h.advance(600_000);
  assert.equal(h.requests.length, 1);
  h.visibility(false);
  assert.equal(h.requests.length, 2);
});

test("an aborted response arriving after visibility restoration cannot overwrite newer history", async (t) => {
  const h = harness(t, { ignoreAbort: true });
  h.start();
  const old = h.requests[0];
  h.visibility(true);
  assert.equal(old.options.signal.aborted, true);
  h.visibility(false);
  await h.respond(dashboard([submission(2, 200)]));
  old.respond(dashboard([submission(1, 100)]));
  await settle();
  assert.equal(h.latest().submissions[0].id, "2");
});

test("dispose aborts work and prevents requests or updates after late responses and visibility events", async (t) => {
  const h = harness(t, { ignoreAbort: true });
  const dispose = h.start();
  dispose();
  dispose();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].respond();
  await settle();
  h.visibility(true);
  h.visibility(false);
  await h.advance(900_000);
  assert.equal(h.requests.length, 1);
  assert.equal(h.updates.length, 1);
});

test("the sidebar and dashboard subscriber share one request and retain the complete payload", async (t) => {
  const h = harness(t);
  h.start();
  const about = h.startDashboard();
  assert.equal(h.requests.length, 1);
  assert.equal(h.listenerCount(), 1, "A shared client needs only one visibility listener");
  assert.deepEqual(about.latest(), { status: "loading", data: null });
  const data = {
    ...dashboard(),
    generatedAt: "2030-01-01T00:00:00Z",
    timezone: "Asia/Shanghai",
    sources: [{ platform: "codeforces", handle: "example" }],
    attempted: [{ problemId: "atcoder:problem-b", count: 2 }],
    extraHeatmapField: { day: "2030-01-01", count: 3 },
  };
  await h.respond(data);
  assert.deepEqual(about.latest(), { status: "ready", data });
  assert.equal(h.latest().submissions[0].id, "1");
  await h.advance(300_000);
  assert.equal(h.requests.length, 2, "Both subscribers must use one polling loop");
});

test("entering and leaving about reuses the sidebar cache without fetching or resetting its polling deadline", async (t) => {
  const h = harness(t);
  h.start();
  const data = dashboard();
  await h.respond(data);
  for (let visit = 0; visit < 3; visit++) {
    const about = h.startDashboard();
    assert.deepEqual(about.latest(), { status: "ready", data });
    assert.equal(h.requests.length, 1);
    about.dispose();
  }
  await h.advance(299_999);
  const about = h.startDashboard();
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  assert.equal(h.requests.length, 2);
  about.dispose();
  assert.equal(h.requests[1].options.signal.aborted, false, "Leaving about must not cancel the sidebar's refresh");
  const count = about.states.length;
  await h.respond(dashboard([submission(2, 1_800_000_000)]));
  assert.equal(h.latest().submissions[0].id, "2");
  assert.equal(about.states.length, count, "An unsubscribed component must stop receiving updates");
});

test("unsubscribing the sidebar leaves an active dashboard subscription working", async (t) => {
  const h = harness(t);
  const stopSidebar = h.start();
  const about = h.startDashboard();
  stopSidebar();
  stopSidebar();
  assert.equal(h.requests[0].options.signal.aborted, false);
  assert.equal(h.listenerCount(), 1);
  await h.respond();
  assert.equal(about.latest().status, "ready");
  assert.equal(h.updates.length, 1);
  await h.advance(300_000);
  assert.equal(h.requests.length, 2);
  about.dispose();
  assert.equal(h.requests[1].options.signal.aborted, true, "The last subscriber must cancel the request");
  assert.equal(h.listenerCount(), 0);
});

test("different dashboard origins stay isolated while equivalent base URLs share their endpoint", async (t) => {
  const h = harness(t);
  const first = h.startDashboard(BASE);
  const equivalent = h.startDashboard("https://OJFLARE.example.test/unused/base/");
  const second = h.startDashboard("https://other.example.test");
  assert.equal(h.requests.length, 2);
  h.requests[0].respond(dashboard([submission(1, 100)]));
  h.requests[1].respond(dashboard([submission(2, 200)]));
  await settle();
  assert.equal(first.latest().data.accepted[0].id, 1);
  assert.equal(equivalent.latest().data.accepted[0].id, 1);
  assert.equal(second.latest().data.accepted[0].id, 2);
  first.dispose();
  equivalent.dispose();
  await h.advance(300_000);
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].url.origin, "https://other.example.test");
});

test("shared schema failures report initial unavailability and preserve complete successful snapshots later", async (t) => {
  const h = harness(t);
  const about = h.startDashboard();
  h.start();
  await h.respond({ schemaVersion: 1, accepted: [], problems: [] });
  assert.deepEqual(about.latest(), { status: "unavailable", data: null });
  assert.equal(h.latest().status, "unavailable");
  await h.advance(300_000);
  const data = { ...dashboard(), generatedAt: "2030-01-01T00:00:00Z" };
  await h.respond(data);
  await h.advance(300_000);
  await h.respond({ schemaVersion: 2, accepted: null, problems: [] });
  assert.deepEqual(about.latest(), { status: "ready", data });
  assert.equal(h.latest().status, "ready");
  const nextVisit = h.startDashboard();
  assert.deepEqual(nextVisit.latest(), { status: "ready", data });
  assert.equal(h.requests.length, 3);
});

test("releasing the last subscriber clears the client and old late responses cannot reach a replacement", async (t) => {
  const h = harness(t, { ignoreAbort: true });
  const about = h.startDashboard();
  const stopSidebar = h.start();
  about.dispose();
  stopSidebar();
  const old = h.requests[0];
  assert.equal(old.options.signal.aborted, true);
  assert.equal(h.listenerCount(), 0);
  const replacement = h.startDashboard();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(replacement.latest(), { status: "loading", data: null });
  old.respond(dashboard([submission(1, 100)]));
  await settle();
  assert.deepEqual(replacement.latest(), { status: "loading", data: null });
  await h.respond(dashboard([submission(2, 200)]));
  assert.equal(replacement.latest().data.accepted[0].id, 2);
  assert.equal(about.states.length, 1);
});

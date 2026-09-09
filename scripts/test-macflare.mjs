/** Run with Node 22: node --experimental-strip-types --test scripts/test-macflare.mjs */
import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyActivity,
  parseActivitySnapshot,
  parseAppIcons,
  subscribeMacFlare,
} from "../src/utils/macflare.ts";

const NOW = Date.parse("2030-01-02T03:04:05Z");
const BASE = "https://activity.example.test";
const ARTWORK = "https://is1-ssl.mzstatic.com/image/thumb/Music/cover.jpg";
const TRACK = "https://music.apple.com/us/album/example/123?i=456";

function payload(overrides = {}) {
  return {
    schema_version: 1,
    status: "online",
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    active_app: "Code Editor",
    music: { state: "playing", track: "Song", artist: "Artist", artwork_url: ARTWORK, track_url: TRACK },
    ...overrides,
  };
}

function assertEmpty(state, status) {
  assert.deepEqual(state, { status, app: null, music: null, delaySeconds: 0 });
}

async function settle() {
  // Flush fetch -> json -> request -> poll continuations without real timers.
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

class TestDocument extends EventTarget {
  hidden = false;
  visibilityListeners = new Set();

  addEventListener(type, listener, options) {
    if (type === "visibilitychange") this.visibilityListeners.add(listener);
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    if (type === "visibilitychange") this.visibilityListeners.delete(listener);
    super.removeEventListener(type, listener, options);
  }

  setHidden(hidden) {
    this.hidden = hidden;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

function harness(t, { hidden = false, automaticIcons = { icons: [] }, ignoreAbort = false } = {}) {
  const originals = new Map(["document", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: NOW });
  const mockTimers = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  const timeouts = new Set();
  const intervals = new Set();
  globalThis.setTimeout = (callback, delay, ...args) => {
    let id;
    id = mockTimers.setTimeout(() => { timeouts.delete(id); callback(...args); }, delay);
    timeouts.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => { timeouts.delete(id); mockTimers.clearTimeout(id); };
  globalThis.setInterval = (callback, delay, ...args) => {
    const id = mockTimers.setInterval(callback, delay, ...args);
    intervals.add(id);
    return id;
  };
  globalThis.clearInterval = (id) => { intervals.delete(id); mockTimers.clearInterval(id); };

  const page = new TestDocument();
  page.hidden = hidden;
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: page });
  const requests = [];
  const updates = [];
  const disposers = [];
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    const request = {
      url: new URL(url),
      options,
      settled: false,
      respond(body, { status = 200, json = async () => body } = {}) {
        if (request.settled) return;
        request.settled = true;
        options.signal.removeEventListener("abort", onAbort);
        resolve({ ok: status >= 200 && status < 300, status, json });
      },
      reject(error = new TypeError("Network failure")) {
        if (request.settled) return;
        request.settled = true;
        options.signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    };
    const onAbort = () => {
      if (!ignoreAbort) request.reject(new DOMException("Aborted", "AbortError"));
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    requests.push(request);
    if (request.url.pathname === "/api/icons" && automaticIcons !== false) request.respond(automaticIcons);
    if (options.signal.aborted) onAbort();
  });

  const h = {
    page,
    requests,
    updates,
    calls: (pathname = "/api/now") => requests.filter((request) => request.url.pathname === pathname),
    latest: () => updates.at(-1),
    start() {
      const dispose = subscribeMacFlare(BASE, (state) => updates.push(structuredClone(state)));
      disposers.push(dispose);
      return dispose;
    },
    async advance(milliseconds) {
      t.mock.timers.tick(milliseconds);
      await settle();
    },
    async respond(body = payload()) {
      const request = h.calls().at(-1);
      assert(request && !request.settled, "Expected a pending snapshot request");
      request.respond(body);
      await settle();
    },
  };

  t.after(async () => {
    try {
      for (const dispose of disposers) dispose();
      for (const request of requests.filter((request) => !request.settled)) {
        assert.equal(request.options.signal.aborted, true, "dispose must abort outstanding requests");
        // Release deliberately uncooperative fake requests used by race tests.
        request.reject(new DOMException("Test cleanup", "AbortError"));
      }
      await settle();
      assert.equal(page.visibilityListeners.size, 0, "dispose must remove visibility listeners");
      assert.equal(timeouts.size, 0, "dispose must clear every request and polling timeout");
      assert.equal(intervals.size, 0, "dispose must clear the expiry interval");
    } finally {
      Object.assign(globalThis, mockTimers);
      t.mock.timers.reset();
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
  return h;
}

test("playing exposes a trimmed track and valid Apple artwork/link", () => {
  const snapshot = parseActivitySnapshot(payload({
    expires_at: new Date(NOW + 60_000).toISOString(),
    active_app: "  Code Editor  ",
    music: { state: "playing", track: "  Song  ", artist: "  Artist  ", artwork_url: ARTWORK, track_url: TRACK },
    playback: { mode: "delayed", delay_seconds: 120 },
  }), NOW);
  assert.equal(snapshot.expiresAt, NOW + 60_000);
  assert.deepEqual(snapshot.state, {
    status: "online",
    app: { name: "Code Editor", iconUrl: null },
    music: { title: "Song", artist: "Artist", artworkUrl: ARTWORK, trackUrl: TRACK },
    delaySeconds: 120,
  });
});

for (const state of ["paused", "stopped", "unavailable"]) {
  test(`${state} hides music even when track, artist, artwork, and link remain populated`, () => {
    const data = payload();
    data.music.state = state;
    const snapshot = parseActivitySnapshot(data, Date.now());
    assert.equal(snapshot.state.status, "online");
    assert.equal(snapshot.state.music, null);
    assert.equal(snapshot.state.app.name, "Code Editor");
  });
}

test("empty tracks/apps and invalid delay values do not fabricate activity", () => {
  const data = payload({ active_app: "  " });
  data.music.track = " \n ";
  assert.equal(parseActivitySnapshot(data).state.music, null);
  assert.equal(parseActivitySnapshot(data).state.app, null);
  for (const delay of [-1, 0, NaN, Infinity, "120", null]) {
    data.playback = { mode: "delayed", delay_seconds: delay };
    assert.equal(parseActivitySnapshot(data).state.delaySeconds, 0);
  }
  data.playback = { mode: "live", delay_seconds: 120 };
  assert.equal(parseActivitySnapshot(data).state.delaySeconds, 0);
});

test("offline and expired snapshots discard all former public details", () => {
  assertEmpty(parseActivitySnapshot(payload({ status: "offline" })).state, "offline");
  for (const expiry of [NOW - 1, NOW]) {
    const snapshot = parseActivitySnapshot(payload({ expires_at: new Date(expiry).toISOString() }), NOW);
    assertEmpty(snapshot.state, "offline");
    assert.equal(snapshot.expiresAt, null);
  }
  assertEmpty(emptyActivity("unavailable"), "unavailable");
});

test("invalid online snapshots are rejected", () => {
  const invalid = [null, [], "online", {}, payload({ status: "unknown" }), payload({ schema_version: 2 }), payload({ schema_version: "1" }), payload({ expires_at: "not a date" }), payload({ active_app: {} }), payload({ music: null }), payload({ music: { state: "unknown" } })];
  for (const value of invalid) assert.throws(() => parseActivitySnapshot(value), /Invalid MacFlare snapshot/);
});

test("unsafe artwork and track URLs are omitted while safe music text remains", () => {
  const unsafe = ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "http://is1-ssl.mzstatic.com/a.jpg", "https://mzstatic.com/a.jpg", "https://evil-mzstatic.com/a.jpg", "https://is1-ssl.mzstatic.com.attacker.test/a.jpg", "https://user:password@is1-ssl.mzstatic.com/a.jpg", "https://is1-ssl.mzstatic.com:8443/a.jpg", "https://127.0.0.1/a.jpg", "/relative.jpg", "not a URL"];
  for (const url of unsafe) {
    const data = payload();
    data.music.artwork_url = url;
    assert.equal(parseActivitySnapshot(data).state.music.artworkUrl, null, url);
  }
  const unsafeTracks = ["javascript:alert(1)", "data:text/html,hello", "http://music.apple.com/us/song/1", "https://music.apple.com.attacker.test/1", "https://attacker.test/?url=https://music.apple.com", "https://user@music.apple.com/1", "https://music.apple.com:8443/1", "//music.apple.com/1", "https://is1-ssl.mzstatic.com/1"];
  for (const url of unsafeTracks) {
    const data = payload();
    data.music.track_url = url;
    const music = parseActivitySnapshot(data).state.music;
    assert.equal(music.trackUrl, null, url);
    assert.equal(music.title, "Song");
  }
  const data = payload();
  data.music.track_url = "https://itunes.apple.com/us/album/123";
  assert.equal(parseActivitySnapshot(data).state.music.trackUrl, data.music.track_url);
});

test("app names and aliases normalize Unicode, spaces, and case without guessing unknown apps", () => {
  const icons = parseAppIcons({ icons: [{ id: "code-editor", app: " Code Editor ", aliases: ["ＶＳ   ＣＯＤＥ", "editor", null] }] }, BASE);
  assert.equal(icons.get("code editor"), `${BASE}/app-icons/code-editor.png`);
  assert.equal(icons.get("vs code"), `${BASE}/app-icons/code-editor.png`);
  assert.equal(icons.get("editor"), `${BASE}/app-icons/code-editor.png`);
  assert.equal(icons.get("unknown app"), undefined);
});

test("icon catalogs ignore invalid entries and cannot choose external paths", () => {
  for (const value of [null, [], { icons: {} }, "icons"]) assert.equal(parseAppIcons(value, BASE).size, 0);
  const invalidIds = ["../secret", "https://attacker.test/icon", "foo/bar", "foo.png", "foo?x=1", "foo#x", "Uppercase", "-leading", "trailing-", "a--b"];
  const icons = parseAppIcons({ icons: invalidIds.map((id) => ({ id, app: id, aliases: ["unsafe"] })) }, BASE);
  assert.equal(icons.size, 0);
  const safe = parseAppIcons({ icons: [{ id: "safe-app", app: "Safe", url: "https://attacker.test/icon.png", aliases: [" ", 42] }] }, `${BASE}/ignored/path/`);
  assert.deepEqual([...safe], [["safe", `${BASE}/app-icons/safe-app.png`]]);
});

test("subscription starts immediately and polls once after each 120-second interval without overlap", async (t) => {
  const h = harness(t);
  h.start();
  assertEmpty(h.updates[0], "loading");
  assert.equal(h.calls().length, 1);
  assert.equal(h.calls("/api/icons").length, 1);
  const options = h.calls()[0].options;
  assert.equal(options.credentials, "omit");
  assert.equal(options.referrerPolicy, "no-referrer");
  assert.equal(options.cache, "no-store");
  await h.respond();
  await h.advance(119_999);
  assert.equal(h.calls().length, 1);
  await h.advance(1);
  assert.equal(h.calls().length, 2);
  h.page.setHidden(false);
  h.page.setHidden(false);
  await h.advance(1_000);
  assert.equal(h.calls().length, 2, "visibility events must not overlap an active request");
  await h.respond(payload({ active_app: "Terminal" }));
  assert.equal(h.latest().app.name, "Terminal");
  await h.advance(120_000);
  assert.equal(h.calls().length, 3);
  assert.equal(h.calls("/api/icons").length, 1, "icon catalog must not be fetched every poll");
});

test("a snapshot request aborts after 12 seconds and retries at the next polling interval", async (t) => {
  const h = harness(t);
  h.start();
  await settle();
  await h.advance(11_999);
  assert.equal(h.calls()[0].options.signal.aborted, false);
  await h.advance(1);
  assert.equal(h.calls()[0].options.signal.aborted, true);
  assertEmpty(h.latest(), "unavailable");
  await h.advance(119_999);
  assert.equal(h.calls().length, 1);
  await h.advance(1);
  assert.equal(h.calls().length, 2);
});

for (const failure of ["network", "HTTP 503", "invalid JSON", "invalid snapshot"]) {
  test(`${failure} clears previously displayed activity instead of leaving stale details`, async (t) => {
    const h = harness(t);
    h.start();
    await h.respond(payload({ playback: { mode: "delayed", delay_seconds: 120 } }));
    assert.equal(h.latest().music.title, "Song");
    await h.advance(120_000);
    const request = h.calls().at(-1);
    if (failure === "network") request.reject();
    else if (failure === "HTTP 503") request.respond({}, { status: 503 });
    else if (failure === "invalid JSON") request.respond(null, { json: async () => { throw new SyntaxError("Invalid JSON"); } });
    else request.respond({ status: "online", schema_version: 2 });
    await settle();
    assertEmpty(h.latest(), "unavailable");
  });
}

test("offline responses clear app, music, and delay from the previous successful poll", async (t) => {
  const h = harness(t);
  h.start();
  await h.respond(payload({ playback: { mode: "delayed", delay_seconds: 120 } }));
  await h.advance(120_000);
  await h.respond(payload({ status: "offline" }));
  assertEmpty(h.latest(), "offline");
});

test("the local expiry check clears a snapshot before another network poll", async (t) => {
  const h = harness(t);
  h.start();
  await h.respond(payload({ expires_at: new Date(NOW + 2_500).toISOString() }));
  await h.advance(2_000);
  assert.equal(h.latest().status, "online");
  await h.advance(1_000);
  assertEmpty(h.latest(), "offline");
  assert.equal(h.calls().length, 1);
  const updates = h.updates.length;
  await h.advance(10_000);
  assert.equal(h.updates.length, updates, "expiry must not repeatedly publish an already-cleared snapshot");
});

test("a snapshot already expired on arrival never exposes its app or music", async (t) => {
  const h = harness(t);
  h.start();
  await h.respond(payload({ expires_at: new Date(NOW).toISOString() }));
  assertEmpty(h.latest(), "offline");
  assert(h.updates.every((state) => state.app === null && state.music === null));
});

test("a hidden page makes no initial requests and resumes only one polling loop", async (t) => {
  const h = harness(t, { hidden: true });
  h.start();
  await h.advance(300_000);
  assert.equal(h.requests.length, 0);
  h.page.setHidden(false);
  h.page.setHidden(false);
  assert.equal(h.calls().length, 1);
  assert.equal(h.calls("/api/icons").length, 1);
  await h.respond();
  h.page.setHidden(true);
  await h.advance(240_000);
  assert.equal(h.calls().length, 1);
  h.page.setHidden(false);
  h.page.setHidden(false);
  assert.equal(h.calls().length, 2);
  await h.respond();
  await h.advance(120_000);
  assert.equal(h.calls().length, 3);
});

test("hiding aborts in-flight work and a late old response cannot replace resumed activity", async (t) => {
  const h = harness(t, { ignoreAbort: true });
  h.start();
  const old = h.calls()[0];
  h.page.setHidden(true);
  assert.equal(old.options.signal.aborted, true);
  h.page.setHidden(false);
  assert.equal(h.calls().length, 2);
  await h.respond(payload({ active_app: "New App" }));
  old.respond(payload({ active_app: "Stale App" }));
  await settle();
  assert.equal(h.latest().app.name, "New App");
  assert(h.updates.every((state) => state.app?.name !== "Stale App"));
});

test("returning to a page clears expired activity before its resumed request completes", async (t) => {
  const h = harness(t);
  h.start();
  await h.respond(payload({ expires_at: new Date(NOW + 5_000).toISOString() }));
  h.page.setHidden(true);
  // Background browser timers may be throttled; jump wall time without firing them.
  t.mock.timers.setTime(NOW + 10_000);
  h.page.setHidden(false);
  assertEmpty(h.latest(), "offline");
  assert.equal(h.calls().length, 2);
  await h.respond(payload({ active_app: "Resumed App" }));
  assert.equal(h.latest().app.name, "Resumed App");
});

test("a late icon catalog enriches matching aliases but preserves unknown app names", async (t) => {
  const h = harness(t, { automaticIcons: false });
  h.start();
  await h.respond(payload({ active_app: " ＣＯＤＥ   EDITOR " }));
  assert.equal(h.latest().app.iconUrl, null);
  h.calls("/api/icons")[0].respond({ icons: [{ id: "editor", app: "Visual Studio", aliases: ["code editor"] }] });
  await settle();
  assert.equal(h.latest().app.iconUrl, `${BASE}/app-icons/editor.png`);
  await h.advance(120_000);
  await h.respond(payload({ active_app: "My Unknown App" }));
  assert.deepEqual(h.latest().app, { name: "My Unknown App", iconUrl: null });
});

for (const failure of ["network", "HTTP 503", "timeout"]) {
  test(`icon catalog ${failure} does not hide successful app and music data`, async (t) => {
    const h = harness(t, { automaticIcons: false });
    h.start();
    await h.respond();
    const iconRequest = h.calls("/api/icons")[0];
    if (failure === "network") iconRequest.reject();
    else if (failure === "HTTP 503") iconRequest.respond({}, { status: 503 });
    else await h.advance(12_000);
    await settle();
    assert.equal(h.latest().status, "online");
    assert.deepEqual(h.latest().app, { name: "Code Editor", iconUrl: null });
    assert.equal(h.latest().music.title, "Song");
    assert.equal(h.calls().length, 1);
  });
}

test("dispose aborts requests, removes listeners, and prevents later updates or polling", async (t) => {
  const h = harness(t, { automaticIcons: false });
  const dispose = h.start();
  const count = h.updates.length;
  dispose();
  dispose();
  assert(h.requests.every((request) => request.options.signal.aborted));
  assert.equal(h.page.visibilityListeners.size, 0);
  await settle();
  h.page.setHidden(true);
  h.page.setHidden(false);
  await h.advance(600_000);
  assert.equal(h.updates.length, count);
  assert.equal(h.requests.length, 2);
});

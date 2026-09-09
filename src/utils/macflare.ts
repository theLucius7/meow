export type MacFlareState = {
	status: "loading" | "online" | "offline" | "unavailable" | "waiting";
	app: { name: string; iconUrl: string | null } | null;
	music: {
		title: string;
		artist: string;
		artworkUrl: string | null;
		trackUrl: string | null;
	} | null;
	delaySeconds: number;
};

export type ActivitySnapshot = {
	state: MacFlareState;
	expiresAt: number | null;
};

export const POLL_INTERVAL_MS = 120_000;
export const REQUEST_TIMEOUT_MS = 12_000;

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function emptyActivity(status: MacFlareState["status"]): MacFlareState {
	return { status, app: null, music: null, delaySeconds: 0 };
}

function musicUrl(value: unknown, artwork: boolean): string | null {
	try {
		const url = new URL(text(value));
		const allowedHost = artwork
			? url.hostname.endsWith(".mzstatic.com")
			: ["music.apple.com", "itunes.apple.com"].includes(url.hostname);
		return url.protocol === "https:" &&
			allowedHost &&
			!url.username &&
			!url.password &&
			!url.port
			? url.href
			: null;
	} catch {
		return null;
	}
}

/** Parse only the public fields displayed by the sidebar. */
export function parseActivitySnapshot(
	value: unknown,
	now = Date.now(),
): ActivitySnapshot {
	const data = record(value);
	if (data.status === "offline") {
		return { state: emptyActivity("offline"), expiresAt: null };
	}
	const expiresAt = Date.parse(text(data.expires_at));
	const music = record(data.music);
	if (
		data.status !== "online" ||
		data.schema_version !== 1 ||
		!Number.isFinite(expiresAt) ||
		!(data.active_app === null || typeof data.active_app === "string") ||
		!["playing", "paused", "stopped", "unavailable"].includes(text(music.state))
	) {
		throw new Error("Invalid MacFlare snapshot");
	}
	if (expiresAt <= now) {
		return { state: emptyActivity("offline"), expiresAt: null };
	}
	const playback = record(data.playback);
	const delaySeconds =
		playback.mode === "delayed" &&
		typeof playback.delay_seconds === "number" &&
		Number.isFinite(playback.delay_seconds) &&
		playback.delay_seconds > 0
			? playback.delay_seconds
			: 0;
	const name = text(data.active_app);
	const title = text(music.track);
	return {
		expiresAt,
		state: {
			status: "online",
			delaySeconds,
			app: name ? { name, iconUrl: null } : null,
			music:
				music.state === "playing" && title
					? {
							title,
							artist: text(music.artist),
							artworkUrl: musicUrl(music.artwork_url, true),
							trackUrl: musicUrl(music.track_url, false),
						}
					: null,
		},
	};
}

function appKey(name: string): string {
	return name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function parseAppIcons(
	value: unknown,
	baseUrl: string,
): Map<string, string> {
	const icons = record(value).icons;
	const result = new Map<string, string>();
	if (!Array.isArray(icons)) return result;
	for (const value of icons) {
		const icon = record(value);
		const id = text(icon.id);
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) continue;
		const names = [
			icon.app,
			...(Array.isArray(icon.aliases) ? icon.aliases : []),
		];
		for (const name of names) {
			if (typeof name === "string" && name.trim()) {
				result.set(appKey(name), new URL(`/app-icons/${id}.png`, baseUrl).href);
			}
		}
	}
	return result;
}

/** One snapshot request per visible polling interval; never fetch during a build. */
export function subscribeMacFlare(
	baseUrl: string,
	onUpdate: (state: MacFlareState) => void,
): () => void {
	let stopped = false;
	let snapshot: ActivitySnapshot = {
		state: emptyActivity("loading"),
		expiresAt: null,
	};
	let icons = new Map<string, string>();
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	let activeRequest: AbortController | undefined;
	const iconRequest = new AbortController();
	const page = document;

	const publish = () => {
		if (stopped) return;
		const app = snapshot.state.app;
		onUpdate({
			...snapshot.state,
			app: app
				? { ...app, iconUrl: icons.get(appKey(app.name)) ?? null }
				: null,
		});
	};
	const expire = () => {
		if (snapshot.expiresAt !== null && snapshot.expiresAt <= Date.now()) {
			snapshot = { state: emptyActivity("offline"), expiresAt: null };
			publish();
		}
	};
	const request = async (path: string, controller: AbortController) => {
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(new URL(path, baseUrl), {
				signal: controller.signal,
				credentials: "omit",
				referrerPolicy: "no-referrer",
				...(path === "/api/now" ? { cache: "no-store" as const } : {}),
			});
			if (!response.ok) throw new Error(`MacFlare HTTP ${response.status}`);
			return await response.json();
		} finally {
			clearTimeout(timeout);
		}
	};
	const poll = async () => {
		if (stopped || page.hidden || activeRequest) return;
		clearTimeout(pollTimer);
		const controller = new AbortController();
		activeRequest = controller;
		try {
			const data: unknown = await request("/api/now", controller);
			if (
				stopped ||
				page.hidden ||
				activeRequest !== controller ||
				controller.signal.aborted
			)
				return;
			snapshot = parseActivitySnapshot(data);
			publish();
		} catch {
			if (!stopped && !page.hidden && activeRequest === controller) {
				snapshot = { state: emptyActivity("unavailable"), expiresAt: null };
				publish();
			}
		} finally {
			if (activeRequest === controller) {
				activeRequest = undefined;
				if (!stopped && !page.hidden)
					pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
			}
		}
	};
	let iconsLoaded = false;
	const loadIcons = async () => {
		if (iconsLoaded || stopped || page.hidden) return;
		iconsLoaded = true;
		try {
			const data: unknown = await request("/api/icons", iconRequest);
			if (stopped) return;
			icons = parseAppIcons(data, baseUrl);
			expire();
			publish();
		} catch {
			// A missing icon catalog must not prevent music or application text.
		}
	};
	const onVisibility = () => {
		clearTimeout(pollTimer);
		expire();
		if (page.hidden) {
			activeRequest?.abort();
			activeRequest = undefined;
		} else {
			void poll();
			void loadIcons();
		}
	};
	page.addEventListener("visibilitychange", onVisibility);
	const expiryTimer = setInterval(expire, 1_000);
	publish();
	void poll();
	void loadIcons();
	return () => {
		stopped = true;
		clearTimeout(pollTimer);
		clearInterval(expiryTimer);
		activeRequest?.abort();
		iconRequest.abort();
		page.removeEventListener("visibilitychange", onVisibility);
	};
}

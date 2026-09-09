export type RecentSubmission = {
	platform: "codeforces" | "atcoder";
	id: string;
	title: string;
	url: string;
	submittedAt: string;
};

export type SubmissionState = {
	status: "loading" | "ready" | "unavailable";
	submissions: RecentSubmission[];
};

const POLL_INTERVAL_MS = 300_000;
const REQUEST_TIMEOUT_MS = 12_000;

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function submissionUrl(
	value: unknown,
	platform: RecentSubmission["platform"],
	id: string,
): string | null {
	if (
		typeof value !== "string" ||
		value !== value.trim() ||
		/\s|\\/.test(value)
	)
		return null;
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			url.hostname !==
				(platform === "codeforces" ? "codeforces.com" : "atcoder.jp") ||
			url.username ||
			url.password ||
			url.port ||
			url.search ||
			url.hash
		)
			return null;
		const pathStart = value.indexOf("/", value.indexOf("://") + 3);
		if (pathStart < 0 || value.slice(pathStart) !== url.pathname) return null;
		const match =
			platform === "codeforces"
				? /^\/(?:(?:contest|gym)\/[1-9]\d*\/submission|problemset\/submission\/[1-9]\d*|submission)\/([1-9]\d*)\/?$/.exec(
						url.pathname,
					)
				: /^\/contests\/[A-Za-z0-9][A-Za-z0-9_-]*\/submissions\/([1-9]\d*)\/?$/.exec(
						url.pathname,
					);
		return match?.[1] === id ? url.href : null;
	} catch {
		return null;
	}
}

/** OJFlare schema v2 exposes individual accepted submissions, not all verdicts. */
export function parseRecentSubmissions(value: unknown): RecentSubmission[] {
	const data = record(value);
	if (
		data.schemaVersion !== 2 ||
		!Array.isArray(data.accepted) ||
		!Array.isArray(data.problems)
	) {
		throw new Error("Invalid OJFlare dashboard");
	}
	const titles = new Map<string, string>();
	for (const value of data.problems) {
		const problem = record(value);
		const id = text(problem.id);
		const name = text(problem.name);
		if (id && name) titles.set(id, name);
	}
	const submissions: RecentSubmission[] = [];
	for (const value of data.accepted) {
		const item = record(value);
		if (item.platform !== "codeforces" && item.platform !== "atcoder") continue;
		if (
			typeof item.id !== "number" ||
			!Number.isSafeInteger(item.id) ||
			item.id <= 0
		)
			continue;
		if (
			typeof item.epoch !== "number" ||
			!Number.isSafeInteger(item.epoch) ||
			item.epoch < 0
		)
			continue;
		const date = new Date(item.epoch * 1_000);
		if (!Number.isFinite(date.getTime())) continue;
		const id = String(item.id);
		const problemId = text(item.problemId);
		const url = submissionUrl(item.url, item.platform, id);
		if (!problemId || !url) continue;
		submissions.push({
			platform: item.platform,
			id,
			title: titles.get(problemId) ?? problemId,
			url,
			submittedAt: date.toISOString(),
		});
	}
	submissions.sort(
		(a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
	);
	const seen = new Set<string>();
	return submissions
		.filter((submission) => {
			const key = `${submission.platform}:${submission.id}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, 3);
}

/** Fetch the public cached snapshot only while a browser page is visible. */
export function subscribeRecentSubmissions(
	baseUrl: string,
	onUpdate: (state: SubmissionState) => void,
): () => void {
	let stopped = false;
	let state: SubmissionState = { status: "loading", submissions: [] };
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	let activeRequest: AbortController | undefined;
	const page = document;
	const publish = () => {
		if (!stopped)
			onUpdate({
				...state,
				submissions: state.submissions.map((item) => ({ ...item })),
			});
	};
	const poll = async () => {
		if (stopped || page.hidden || activeRequest) return;
		clearTimeout(pollTimer);
		const controller = new AbortController();
		activeRequest = controller;
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(new URL("/data/dashboard.json", baseUrl), {
				signal: controller.signal,
				credentials: "omit",
				referrerPolicy: "no-referrer",
			});
			if (!response.ok) throw new Error(`OJFlare HTTP ${response.status}`);
			const data: unknown = await response.json();
			if (
				stopped ||
				page.hidden ||
				activeRequest !== controller ||
				controller.signal.aborted
			)
				return;
			state = { status: "ready", submissions: parseRecentSubmissions(data) };
			publish();
		} catch {
			if (
				!stopped &&
				!page.hidden &&
				activeRequest === controller &&
				state.status !== "ready"
			) {
				state = { status: "unavailable", submissions: [] };
				publish();
			}
		} finally {
			clearTimeout(timeout);
			if (activeRequest === controller) {
				activeRequest = undefined;
				if (!stopped && !page.hidden)
					pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
			}
		}
	};
	const onVisibility = () => {
		clearTimeout(pollTimer);
		if (page.hidden) {
			activeRequest?.abort();
			activeRequest = undefined;
		} else {
			void poll();
		}
	};
	page.addEventListener("visibilitychange", onVisibility);
	publish();
	void poll();
	return () => {
		stopped = true;
		clearTimeout(pollTimer);
		activeRequest?.abort();
		page.removeEventListener("visibilitychange", onVisibility);
	};
}

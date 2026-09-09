export type OJPlatform = "atcoder" | "codeforces" | "qoj" | "nowcoder";
export type ContributionFilter = OJPlatform | "all";

export type ContributionsModel = {
	days: { date: string; platform: OJPlatform; count: number }[];
	years: number[];
};

export type ContributionCell = {
	date: string;
	count: number;
	level: 0 | 1 | 2 | 3 | 4;
	future: boolean;
};

export type ContributionCalendar = {
	year: number;
	today: string;
	weeks: (ContributionCell | null)[][];
	months: { month: number; week: number }[];
	total: number;
	activeDays: number;
};

const DAY_MS = 86_400_000;
const TAIPEI_OFFSET_MS = 8 * 3_600_000;

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function isPlatform(value: unknown): value is OJPlatform {
	return (
		value === "atcoder" ||
		value === "codeforces" ||
		value === "qoj" ||
		value === "nowcoder"
	);
}

/** Schema v2 archives dates in UTC+8, independently of the visitor's timezone. */
export function getTaipeiToday(): string {
	return new Date(Date.now() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/** Find each problem's first AC over all history before selecting any year. */
export function parseContributions(value: unknown): ContributionsModel {
	const data = record(value);
	if (data.schemaVersion !== 2 || !Array.isArray(data.accepted)) {
		throw new Error("Invalid OJFlare dashboard");
	}

	const first = new Map<
		string,
		{ platform: OJPlatform; id: number; epoch: number; date: string }
	>();
	const years = new Set<number>();
	for (const value of data.accepted) {
		const item = record(value);
		if (
			!isPlatform(item.platform) ||
			typeof item.id !== "number" ||
			!Number.isSafeInteger(item.id) ||
			item.id <= 0 ||
			typeof item.epoch !== "number" ||
			!Number.isSafeInteger(item.epoch) ||
			item.epoch <= 0 ||
			typeof item.problemId !== "string" ||
			!item.problemId.startsWith(`${item.platform}:`) ||
			item.problemId.length <= item.platform.length + 1 ||
			/\s/.test(item.problemId)
		)
			continue;
		const timestamp = new Date(item.epoch * 1_000 + TAIPEI_OFFSET_MS);
		if (
			!Number.isFinite(timestamp.getTime()) ||
			timestamp.getUTCFullYear() > 9999
		)
			continue;
		const date = timestamp.toISOString().slice(0, 10);
		years.add(timestamp.getUTCFullYear());
		const previous = first.get(item.problemId);
		if (
			!previous ||
			item.epoch < previous.epoch ||
			(item.epoch === previous.epoch && item.id < previous.id)
		) {
			first.set(item.problemId, {
				platform: item.platform,
				id: item.id,
				epoch: item.epoch,
				date,
			});
		}
	}

	const daily = new Map<string, ContributionsModel["days"][number]>();
	for (const { date, platform } of first.values()) {
		const key = `${date}:${platform}`;
		const day = daily.get(key);
		if (day) day.count++;
		else daily.set(key, { date, platform, count: 1 });
	}
	return {
		days: [...daily.values()].sort(
			(a, b) =>
				a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform),
		),
		years: [...years].sort((a, b) => b - a),
	};
}

/** Columns are weeks; each contains Monday–Sunday cells, with null year padding. */
export function getContributionCalendar(
	model: ContributionsModel,
	year: number,
	filter: ContributionFilter,
	today = getTaipeiToday(),
): ContributionCalendar {
	if (!Number.isInteger(year) || year < 1 || year > 9999) {
		throw new RangeError("Invalid contribution year");
	}
	if (filter !== "all" && !isPlatform(filter)) {
		throw new RangeError("Invalid contribution platform");
	}
	const todayTime = Date.parse(`${today}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(today) ||
		!Number.isFinite(todayTime) ||
		new Date(todayTime).toISOString().slice(0, 10) !== today
	) {
		throw new RangeError("Invalid contribution date");
	}
	const prefix = `${String(year).padStart(4, "0")}-`;
	const counts = new Map<string, number>();
	for (const day of model.days) {
		if (
			day.date.startsWith(prefix) &&
			(filter === "all" || day.platform === filter)
		) {
			counts.set(day.date, (counts.get(day.date) ?? 0) + day.count);
		}
	}
	const start = Date.parse(`${prefix}01-01T00:00:00Z`);
	const end = Date.parse(`${prefix}12-31T00:00:00Z`);
	const dayCount = Math.round((end - start) / DAY_MS) + 1;
	const offset = (new Date(start).getUTCDay() + 6) % 7;
	const weeks: ContributionCalendar["weeks"] = Array.from(
		{ length: Math.ceil((offset + dayCount) / 7) },
		() => Array<ContributionCell | null>(7).fill(null),
	);
	const months: ContributionCalendar["months"] = [];
	for (let index = 0; index < dayCount; index++) {
		const timestamp = new Date(start + index * DAY_MS);
		const date = timestamp.toISOString().slice(0, 10);
		const week = Math.floor((offset + index) / 7);
		const count = counts.get(date) ?? 0;
		weeks[week][(offset + index) % 7] = {
			date,
			count,
			level:
				count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4,
			future: date > today,
		};
		if (timestamp.getUTCDate() === 1) {
			months.push({ month: timestamp.getUTCMonth() + 1, week });
		}
	}
	return {
		year,
		today,
		weeks,
		months,
		total: [...counts.values()].reduce((total, count) => total + count, 0),
		activeDays: [...counts.values()].filter((count) => count > 0).length,
	};
}

<script lang="ts">
import { onMount, tick } from "svelte";
import type { Locale } from "@/i18n/locales";
import { subscribeOJFlareDashboard } from "@/utils/ojflare";
import {
	type ContributionFilter,
	type ContributionsModel,
	getContributionCalendar,
	getTaipeiToday,
	parseContributions,
} from "@/utils/ojflare-contributions";

export let locale: Locale;
export let baseUrl: string;

let model: ContributionsModel | null = null;
let status: "loading" | "ready" | "unavailable" = "loading";
let today = getTaipeiToday();
let year = Number(today.slice(0, 4));
let platform: ContributionFilter = "all";
let selectedDate = "";
let calendarElement: HTMLDivElement;

const platforms: Array<{ value: ContributionFilter; name: string }> = [
	{ value: "all", name: locale === "en" ? "All platforms" : "全部平台" },
	{ value: "atcoder", name: "AtCoder" },
	{ value: "codeforces", name: "Codeforces" },
	{ value: "qoj", name: "QOJ" },
	{ value: "nowcoder", name: locale === "en" ? "Nowcoder" : "牛客" },
];
const monthFormat = new Intl.DateTimeFormat(locale === "en" ? "en" : "zh-CN", {
	month: "short",
	timeZone: "UTC",
});
const weekdays =
	locale === "en"
		? ["Mon", "", "Wed", "", "Fri", "", "Sun"]
		: ["一", "", "三", "", "五", "", "日"];

$: years = [
	...new Set([Number(today.slice(0, 4)), ...(model?.years ?? [])]),
].sort((a, b) => b - a);
$: calendar = model
	? getContributionCalendar(model, year, platform, today)
	: null;
$: days =
	calendar?.weeks.flat().filter((day) => day !== null && !day.future) ?? [];
$: if (days.length && !days.some((day) => day.date === selectedDate)) {
	selectedDate =
		days.findLast((day) => day.count > 0)?.date ?? days[days.length - 1].date;
}
$: selectedDay = days.find((day) => day.date === selectedDate);

function dayLabel(date: string, count: number): string {
	return locale === "en"
		? `${date} · ${count} first AC${count === 1 ? "" : "s"}`
		: `${date} · ${count} 道首次 AC`;
}

async function moveFocus(event: KeyboardEvent, date: string) {
	const index = days.findIndex((day) => day.date === date);
	const offsets: Record<string, number> = {
		ArrowLeft: -7,
		ArrowRight: 7,
		ArrowUp: -1,
		ArrowDown: 1,
		Home: -index,
		End: days.length - index - 1,
	};
	if (!(event.key in offsets)) return;
	event.preventDefault();
	const next = days[index + offsets[event.key]];
	if (!next) return;
	selectedDate = next.date;
	await tick();
	calendarElement
		?.querySelector<HTMLButtonElement>(`[data-date="${next.date}"]`)
		?.focus();
}

onMount(() =>
	subscribeOJFlareDashboard(baseUrl, (state) => {
		if (state.status !== "ready") {
			if (!model) status = state.status;
			return;
		}
		try {
			model = parseContributions(state.data);
			today = getTaipeiToday();
			status = "ready";
		} catch {
			if (!model) status = "unavailable";
		}
	}),
);
</script>

<div class="text-75" data-ac-contributions data-pagefind-ignore>
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-50" aria-live="polite" data-contribution-summary>
            {#if calendar}
                <strong class="text-90">{calendar.total}</strong> {locale === "en" ? "new problems" : "道新题"}
                <span aria-hidden="true"> · </span>
                <strong class="text-90">{calendar.activeDays}</strong> {locale === "en" ? "active days" : "个活跃日"}
            {:else}
                {locale === "en" ? "First accepted problems · UTC+8" : "首次 AC 题数 · UTC+8"}
            {/if}
        </p>
        <div class="flex items-center gap-2">
            <select class="contribution-select" bind:value={platform} aria-label={locale === "en" ? "Contribution platform" : "贡献图平台"}>
                {#each platforms as option}
                    <option value={option.value}>{option.name}</option>
                {/each}
            </select>
            <select class="contribution-select" bind:value={year} aria-label={locale === "en" ? "Contribution year" : "贡献图年份"}>
                {#each years as option}
                    <option value={option}>{option}</option>
                {/each}
            </select>
        </div>
    </div>

    {#if calendar}
        <div class="calendar-scroll" role="group" aria-label={locale === "en" ? `${year} AC contribution calendar` : `${year} 年 AC 贡献图`}>
            <div class="calendar" style={`--weeks: ${calendar.weeks.length}`}>
                <div class="month-labels" aria-hidden="true">
                    {#each calendar.months as month}
                        <span style={`grid-column: ${month.week + 1} / span 3`}>{monthFormat.format(new Date(Date.UTC(year, month.month - 1, 1)))}</span>
                    {/each}
                </div>
                <div class="calendar-body">
                    <div class="weekday-labels" aria-hidden="true">
                        {#each weekdays as day}<span>{day}</span>{/each}
                    </div>
                    <div class="calendar-weeks" bind:this={calendarElement}>
                        {#each calendar.weeks as week}
                            <div class="calendar-week">
                                {#each week as day}
                                    {#if day}
                                        <button
                                            type="button"
                                            class="day"
                                            class:future={day.future}
                                            class:selected={selectedDate === day.date && !day.future}
                                            data-date={day.date}
                                            data-count={day.count}
                                            data-level={day.level}
                                            disabled={day.future}
                                            tabindex={selectedDate === day.date ? 0 : -1}
                                            aria-label={dayLabel(day.date, day.count)}
                                            aria-pressed={selectedDate === day.date}
                                            title={dayLabel(day.date, day.count)}
                                            on:click={() => selectedDate = day.date}
                                            on:focus={() => selectedDate = day.date}
                                            on:keydown={(event) => moveFocus(event, day.date)}
                                        ></button>
                                    {:else}
                                        <span class="day outside" aria-hidden="true"></span>
                                    {/if}
                                {/each}
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-50">
            <p class="min-h-4" aria-live="polite" data-selected-contribution>{selectedDay ? dayLabel(selectedDay.date, selectedDay.count) : ""}</p>
            <div class="flex items-center gap-1.5" aria-label={locale === "en" ? "Color scale: 0, 1–2, 3–5, 6–9, 10 or more first ACs" : "颜色分级：0、1–2、3–5、6–9、10 道及以上首次 AC"}>
                <span>{locale === "en" ? "Less" : "少"}</span>
                {#each [0, 1, 2, 3, 4] as level}<span class="day legend-day" data-level={level} aria-hidden="true"></span>{/each}
                <span>{locale === "en" ? "More" : "多"}</span>
            </div>
        </div>
    {:else}
        <p class="flex min-h-40 items-center justify-center text-sm text-50" role="status">
            {status === "loading" ? (locale === "en" ? "Loading contributions…" : "正在加载贡献图…") : (locale === "en" ? "Contributions unavailable" : "暂时无法获取贡献图")}
        </p>
    {/if}
</div>

<style>
    .contribution-select {
        border: 1px solid var(--line-divider);
        border-radius: 0.5rem;
        padding: 0.375rem 0.5rem;
        background: var(--card-bg);
        color: inherit;
        font-size: 0.75rem;
    }
    .contribution-select:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    :global(.dark) .contribution-select { color-scheme: dark; }
    .calendar-scroll { overflow-x: auto; padding: 3px 2px 8px; scrollbar-width: thin; }
    .calendar { --cell: 11px; --gap: 3px; --step: calc(var(--cell) + var(--gap)); width: max-content; }
    .month-labels { display: grid; grid-template-columns: repeat(var(--weeks), var(--step)); margin-left: 30px; height: 24px; font-size: 11px; opacity: 0.6; }
    .calendar-body { display: flex; gap: 8px; }
    .weekday-labels { display: grid; grid-template-rows: repeat(7, var(--cell)); gap: var(--gap); width: 22px; font-size: 9px; line-height: var(--cell); opacity: 0.6; }
    .calendar-weeks { display: flex; gap: var(--gap); }
    .calendar-week { display: flex; flex-direction: column; gap: var(--gap); }
    .day { display: block; flex-shrink: 0; width: var(--cell, 11px); height: var(--cell, 11px); border-radius: 2px; background: #edf0f2; }
    .day[data-level="1"] { background: #ddf1c2; }
    .day[data-level="2"] { background: #b4dc87; }
    .day[data-level="3"] { background: #87bb54; }
    .day[data-level="4"] { background: #4e8429; }
    :global(.dark) .day[data-level="0"] { background: #30363d; }
    .day.future { opacity: 0.2; }
    .day.outside { background: transparent; }
    button.day:hover, button.day:focus-visible, button.day.selected { outline: 2px solid var(--primary); outline-offset: 1px; }
</style>

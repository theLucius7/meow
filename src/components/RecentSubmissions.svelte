<script lang="ts">
import { onMount } from "svelte";
import atcoderIcon from "@/assets/icons/atcoder.png";
import codeforcesIcon from "@/assets/icons/codeforces.svg";
import type { Locale } from "@/i18n/locales";
import {
	type SubmissionState,
	subscribeRecentSubmissions,
} from "@/utils/ojflare";

export let locale: Locale;
export let baseUrl: string;

let state: SubmissionState = { status: "loading", submissions: [] };
const platforms = {
	codeforces: { name: "Codeforces", icon: codeforcesIcon.src },
	atcoder: { name: "AtCoder", icon: atcoderIcon.src },
};
const dateFormat = new Intl.DateTimeFormat(
	locale === "en" ? "en-GB" : "zh-CN",
	{
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	},
);

onMount(() =>
	subscribeRecentSubmissions(baseUrl, (next) => {
		state = next;
	}),
);
</script>

<div data-pagefind-ignore>
    {#if state.status === "ready" && state.submissions.length > 0}
        <ul class="flex flex-col gap-1" aria-label={locale === "en" ? "Recent accepted submissions" : "最近通过的提交"}>
            {#each state.submissions as submission (`${submission.platform}:${submission.id}`)}
                {@const platform = platforms[submission.platform]}
                <li>
                    <a
                        href={submission.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-no-swup
                        class="group flex min-w-0 items-center gap-3 rounded-lg p-2 transition hover:bg-[var(--btn-plain-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                        aria-label={locale === "en" ? `${submission.title} — ${platform.name}, accepted submission ${submission.id}` : `${submission.title} — ${platform.name}，通过提交 ${submission.id}`}
                        title={`${platform.name} · ${submission.title} · AC`}
                    >
                        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
                            <img src={platform.icon} alt="" width="24" height="24" class="h-6 w-6 object-contain" />
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-75 transition group-hover:text-[var(--primary)]">{submission.title}</span>
                            <span class="mt-0.5 flex items-center justify-between gap-2 text-xs text-50">
                                <time datetime={submission.submittedAt}>{dateFormat.format(new Date(submission.submittedAt))}</time>
                                <span class="shrink-0 font-medium text-emerald-700 dark:text-emerald-400">AC</span>
                            </span>
                        </span>
                    </a>
                </li>
            {/each}
        </ul>
    {:else}
        <p class="px-2 py-3 text-sm text-50" role="status">
            {#if state.status === "loading"}
                {locale === "en" ? "Loading…" : "加载中…"}
            {:else if state.status === "unavailable"}
                {locale === "en" ? "Submissions unavailable" : "暂时无法获取提交"}
            {:else}
                {locale === "en" ? "No submissions yet" : "暂无提交"}
            {/if}
        </p>
    {/if}
</div>

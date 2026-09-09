<script lang="ts">
import { onMount } from "svelte";
import type { Locale } from "@/i18n/locales";
import { type MacFlareState, subscribeMacFlare } from "@/utils/macflare";

export let locale: Locale;
export let baseUrl: string;

let state: MacFlareState = {
	status: "loading",
	app: null,
	music: null,
	delaySeconds: 0,
};
let artworkFailed = false;
let appIconFailed = false;

$: text =
	locale === "en"
		? {
				heading: "Recent activity",
				music: "Listening",
				app: "Current app",
				loading: "Loading activity…",
				offline: "No recent activity",
				unavailable: "Activity unavailable",
				waiting: "Waiting for activity",
				empty: "No public activity",
				openTrack: "Open track",
			}
		: {
				heading: "最近动态",
				music: "正在听",
				app: "当前应用",
				loading: "正在加载动态…",
				offline: "暂无动态",
				unavailable: "动态暂不可用",
				waiting: "等待动态更新",
				empty: "暂无公开动态",
				openTrack: "打开歌曲",
			};

$: music = state.status === "online" ? state.music : null;
$: app = state.status === "online" ? state.app : null;
$: statusText = state.status === "online" ? text.empty : text[state.status];

onMount(() =>
	subscribeMacFlare(baseUrl, (next) => {
		// Retry failed images when the track, app, image URL, or connection changes.
		if (
			next.status !== state.status ||
			next.music?.title !== state.music?.title ||
			next.music?.artist !== state.music?.artist ||
			next.music?.artworkUrl !== state.music?.artworkUrl
		) {
			artworkFailed = false;
		}
		if (
			next.status !== state.status ||
			next.app?.name !== state.app?.name ||
			next.app?.iconUrl !== state.app?.iconUrl
		) {
			appIconFailed = false;
		}
		state = next;
	}),
);
</script>

<section class="card-base p-4" aria-label={text.heading} data-pagefind-ignore>
    <h2 class="mb-3 text-sm font-bold text-90">{text.heading}</h2>

    <div aria-live="polite" aria-atomic="true">
        {#if music}
            <svelte:element
                this={music.trackUrl ? "a" : "div"}
                href={music.trackUrl || undefined}
                target={music.trackUrl ? "_blank" : undefined}
                rel={music.trackUrl ? "noopener noreferrer" : undefined}
                aria-label={music.trackUrl ? `${text.openTrack}: ${music.title}` : undefined}
                class="music-row flex min-w-0 items-center gap-3 rounded-xl"
            >
                <div class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--btn-regular-bg)] text-[var(--primary)]">
                    {#key `${music.title}\n${music.artist}\n${music.artworkUrl}`}
                        {#if music.artworkUrl && !artworkFailed}
                            <img src={music.artworkUrl} alt="" width="80" height="80" class="h-full w-full object-cover" on:error={() => artworkFailed = true} />
                        {:else}
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8">
                                <path d="M9 18V5l11-2v13M9 9l11-2" />
                                <ellipse cx="6" cy="18" rx="3" ry="2.5" />
                                <ellipse cx="17" cy="16" rx="3" ry="2.5" />
                            </svg>
                        {/if}
                    {/key}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-1 text-xs text-50">{text.music}</p>
                    <p class="line-clamp-2 break-words text-sm font-bold leading-snug text-90" title={music.title}>{music.title}</p>
                    {#if music.artist}<p class="mt-1 truncate text-xs text-50" title={music.artist}>{music.artist}</p>{/if}
                </div>
            </svelte:element>
        {/if}

        {#if app}
            <div class="flex min-w-0 items-center gap-3" class:mt-4={!!music}>
                <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--btn-regular-bg)] text-[var(--primary)]">
                    {#key `${app.name}\n${app.iconUrl}`}
                        {#if app.iconUrl && !appIconFailed}
                            <img src={app.iconUrl} alt="" width="40" height="40" class="h-full w-full object-contain" on:error={() => appIconFailed = true} />
                        {:else}
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5">
                                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                            </svg>
                        {/if}
                    {/key}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs text-50">{text.app}</p>
                    <p class="mt-0.5 truncate text-sm font-medium text-90" title={app.name}>{app.name}</p>
                </div>
            </div>
        {/if}

        {#if !music && !app}
            <p class="text-sm text-50" role="status">{statusText}</p>
        {/if}
    </div>
</section>

<style>
    a.music-row {
        outline-offset: 4px;
    }
    a.music-row:hover p {
        color: var(--primary);
    }
</style>

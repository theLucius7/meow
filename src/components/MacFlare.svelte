<script lang="ts">
import { onMount } from "svelte";
import { writable } from "svelte/store";
import type { Locale } from "@/i18n/locales";
import { emptyActivity, subscribeMacFlare } from "@/utils/macflare";
import { compactArtworkUrl } from "@/utils/macflare-images";
import ActivityIcon from "./ActivityIcon.svelte";

export let locale: Locale;
export let baseUrl: string;

let state = emptyActivity("loading");
const activeTooltip = writable<"app" | "music" | null>(null);
$: app = state.status === "online" ? state.app : null;
$: music = state.status === "online" ? state.music : null;

onMount(() =>
	subscribeMacFlare(baseUrl, (next) => {
		state = next;
	}),
);
</script>

{#if app || music}
    <div class="flex shrink-0 items-center gap-1" data-macflare-activity data-pagefind-ignore>
        {#if app}
            {#key `${app.name}\n${app.iconUrl}`}
                <ActivityIcon
                    kind="app"
                    {activeTooltip}
                    label={locale === "en" ? `I'm using ${app.name}` : `我正在使用 ${app.name}`}
                    imageUrl={app.iconUrl}
                />
            {/key}
        {/if}
        {#if music}
            {#key `${music.title}\n${music.artist}\n${music.artworkUrl}`}
                <ActivityIcon
                    kind="music"
                    {activeTooltip}
                    label={locale === "en" ? `I'm listening to ${music.title}` : `我正在听 ${music.title}`}
                    imageUrl={music.artworkUrl ? compactArtworkUrl(music.artworkUrl) : null}
                    fallbackUrl={music.artworkUrl}
                />
            {/key}
        {/if}
    </div>
{/if}

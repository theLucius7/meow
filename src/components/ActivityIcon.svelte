<script lang="ts">
import { onMount, tick } from "svelte";
import { type Writable, writable } from "svelte/store";

export let kind: "app" | "music";
export let label: string;
export let imageUrl: string | null;
export let fallbackUrl: string | null = null;
export let activeTooltip: Writable<"app" | "music" | null> = writable(null);

let button: HTMLButtonElement;
let tooltip: HTMLSpanElement;
let img: HTMLImageElement;
let open = false;
let left = 0;
let originalImage = false;
let imageFailed = false;
$: source = originalImage ? fallbackUrl : imageUrl;
$: if ($activeTooltip !== kind) open = false;

async function showTooltip() {
	activeTooltip.set(kind);
	open = true;
	await tick();
	if (!open || !tooltip || !button) return;
	const rect = button.getBoundingClientRect();
	const width = tooltip.offsetWidth;
	// Keep the popup inside the viewport even when the title is truncated.
	const x = Math.max(
		8,
		Math.min(
			rect.left + (rect.width - width) / 2,
			window.innerWidth - width - 8,
		),
	);
	left = x - rect.left;
}

function hideTooltip() {
	open = false;
	if ($activeTooltip === kind) activeTooltip.set(null);
}
function leaveTooltip() {
	if (document.activeElement !== button) hideTooltip();
}
function onOutsidePointer(event: PointerEvent) {
	if (!button?.contains(event.target as Node)) hideTooltip();
}
function onImageError() {
	if (!originalImage && fallbackUrl && fallbackUrl !== imageUrl)
		originalImage = true;
	else imageFailed = true;
}

onMount(() => {
	// A cached failure can finish before hydration attaches the error listener.
	if (img?.complete && img.naturalWidth === 0) onImageError();
});
</script>

<svelte:window
    on:keydown={(event) => { if (event.key === "Escape") hideTooltip(); }}
    on:pointerdown={onOutsidePointer}
    on:scroll={hideTooltip}
    on:resize={hideTooltip}
/>

<button
    bind:this={button}
    type="button"
    data-activity-icon={kind}
    aria-label={label}
    aria-describedby={open ? `macflare-tooltip-${kind}` : undefined}
    class="activity-icon btn-plain rounded-lg shrink-0 text-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
    on:mouseenter={showTooltip}
    on:mouseleave={leaveTooltip}
    on:focus={showTooltip}
    on:blur={hideTooltip}
    on:click={showTooltip}
>
    {#if source && !imageFailed}
        <img bind:this={img} src={source} alt="" width="28" height="28" decoding="async" referrerpolicy="no-referrer" class:cover={kind === "music"} on:error={onImageError} />
    {:else if kind === "app"}
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
    {:else}
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l11-2v13M9 9l11-2" />
            <ellipse cx="6" cy="18" rx="3" ry="2.5" />
            <ellipse cx="17" cy="16" rx="3" ry="2.5" />
        </svg>
    {/if}
    {#if open}
        <span bind:this={tooltip} id={`macflare-tooltip-${kind}`} role="tooltip" class="activity-tooltip" style:left={`${left}px`}>
            <span class="block rounded-lg px-3 py-2 text-xs font-medium text-90 shadow-lg bg-[var(--float-panel-bg)]">{label}</span>
        </span>
    {/if}
</button>

<style>
    .activity-icon { position: relative; width: 28px; height: 36px; }
    img, svg { width: 24px; height: 24px; flex-shrink: 0; object-fit: contain; }
    img { border-radius: 5px; }
    img.cover { object-fit: cover; }
    .activity-tooltip {
        position: absolute;
        z-index: 60;
        top: 100%;
        padding-top: 8px;
        width: max-content;
        max-width: min(256px, calc(100vw - 16px));
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        cursor: default;
    }
    @media (min-width: 640px) {
        .activity-icon { width: 36px; height: 40px; }
        img, svg { width: 28px; height: 28px; }
    }
</style>

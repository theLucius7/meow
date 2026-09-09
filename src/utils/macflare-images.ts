const COMPACT_ARTWORK_SIZE = 64;
const APPLE_IMAGE_HOST = /^is\d+(?:-ssl)?\.mzstatic\.com$/;
const MUSIC_THUMBNAIL =
	/^(\/image\/thumb\/Music\d*\/v4\/(?:[A-Za-z0-9._~-]+\/)+)([1-9]\d{0,4})x([1-9]\d{0,4})bb(?:-\d{1,3})?\.(?:jpg|jpeg|png|webp)$/;

/**
 * Request a 64px cover for small, high-density displays without adding a proxy.
 * Apple documents size substitution in Artwork URLs; JPEG quality 60 is
 * CDN-tested and best-effort. The component must retain the original fallback.
 * https://developer.apple.com/documentation/applemusicapi/artwork
 */
export function compactArtworkUrl(original: string): string {
	// Avoid URL normalization silently accepting whitespace or path separators.
	if (
		!/^https:\/\//i.test(original) ||
		original !== original.trim() ||
		/\s|\\/.test(original) ||
		[...original].some((character) => {
			const code = character.charCodeAt(0);
			return code < 0x20 || code === 0x7f;
		})
	) {
		return original;
	}
	try {
		const url = new URL(original);
		if (
			url.protocol !== "https:" ||
			!APPLE_IMAGE_HOST.test(url.hostname) ||
			url.username ||
			url.password ||
			url.port ||
			url.search ||
			url.hash
		) {
			return original;
		}
		const pathStart = original.indexOf("/", "https://".length);
		// Reject paths normalized by URL parsing, including encoded dot segments.
		if (pathStart < 0 || original.slice(pathStart) !== url.pathname)
			return original;
		const thumbnail = MUSIC_THUMBNAIL.exec(url.pathname);
		if (!thumbnail) return original;
		const [, prefix, width, height] = thumbnail;
		// Preserve non-square images and avoid upscaling already-small artwork.
		if (width !== height || Number(width) < COMPACT_ARTWORK_SIZE)
			return original;
		url.pathname = `${prefix}${COMPACT_ARTWORK_SIZE}x${COMPACT_ARTWORK_SIZE}bb-60.jpg`;
		return url.href;
	} catch {
		return original;
	}
}

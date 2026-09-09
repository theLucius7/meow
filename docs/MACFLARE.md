# MacFlare sidebar activity

The sidebar below the profile displays the currently playing track's cover, title and artist, plus the foreground application's icon and name. The labels follow the blog's Chinese or English interface. Only `music.state: "playing"` displays a track; paused, stopped or unavailable music is hidden, even when the API retains its last track and artwork.

Configure the widget in `src/config.ts`:

```ts
export const macFlareConfig: MacFlareConfig = {
  enable: true,
  baseUrl: "https://macflare.lucius7.dev",
};
```

Set `enable: false` to remove it. The browser reads the public API after hydration; builds and GitHub Pages do not need credentials, a proxy, or a scheduled rebuild. Never put the MacFlare ingestion token in blog configuration.

## Requests and freshness

- One `GET /api/now` supplies music and the foreground app from the same snapshot. It is polled every 120 seconds while the tab is visible, with a 12-second request timeout. Returning to the tab requests fresh data immediately.
- A local expiry check clears displayed activity at `expires_at`, including during a failed or paused refresh. Offline responses also clear it; they can represent an expired device snapshot, initial buffering or an observation gap, so the UI says “No recent activity.” Network, HTTP and invalid-data failures show “Activity unavailable.”
- Buffered MacFlare snapshots are delayed, currently by 420 seconds. The widget labels the delay from `playback.delay_seconds`; it does not describe the delayed snapshot as a real-time device connection.
- `GET /api/icons` is loaded once per component mount and may use its one-hour HTTP cache. It does not read KV. Names and aliases are matched after Unicode and whitespace normalization. The static catalog lacks cross-origin JSON access, so it is not fetched by the blog.
- Application images use `/app-icons/<id>.png` on the configured host. Music artwork uses the API's HTTPS Apple CDN URL without rewriting its size; optional track links open Apple Music or iTunes. Missing or failed images show a generic icon with the original title or app name.

The widget does not render running-app lists, battery information or system metrics. It is excluded from Pagefind. Same-language Swup navigation preserves the sidebar subscription; switching language reloads the translated component. Unmounting cancels its requests, timers and visibility listener.

## Validation

```sh
pnpm test:macflare
pnpm lint
pnpm check
pnpm build
pnpm preview
```

Check `/zh/` and `/en/`, including mobile widths. Use an isolated preview fixture for playing, paused, missing artwork, expired and unavailable states; never push synthetic snapshots to the public MacFlare service or publish test articles.

References: [MacFlare integration guide](https://macflare.lucius7.dev/integrations), [API contract](https://macflare.lucius7.dev/api), [application icons](https://macflare.lucius7.dev/app-icons).

## Preview

These screenshots use an isolated local fixture to show the playing state; they are not a record of the current public status.

![Chinese desktop preview in dark mode](images/macflare-desktop.png)

<img src="images/macflare-mobile.png" alt="English mobile preview in light mode" width="390" />

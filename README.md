# Lucius7's Blog

[![CI](https://github.com/xw7qwq/nfuwari/actions/workflows/build.yml/badge.svg)](https://github.com/xw7qwq/nfuwari/actions/workflows/build.yml)
[![GitHub Pages](https://github.com/xw7qwq/nfuwari/actions/workflows/deploy.yml/badge.svg)](https://github.com/xw7qwq/nfuwari/actions/workflows/deploy.yml)

Source for [blog.lucius7.cn](https://blog.lucius7.cn/), built with [Fuwari](https://github.com/saicaca/fuwari) and Astro. Write posts in Markdown, merge them into `main`, and GitHub Actions publishes the site to GitHub Pages. Alibaba Cloud ESA serves the custom domain.

[Writing guide](docs/WRITING.md) · [Bilingual content](docs/I18N.md) · [LaTeX guide](docs/LATEX.md) · [Deployment](docs/DEPLOYMENT.md) · [Contributing](CONTRIBUTING.md) · [Dependency review](docs/DEPENDENCY-REVIEW.md)

## Current state

As of September 9, 2026, "Lucius7's Blog" has separate [Chinese](https://blog.lucius7.cn/zh/) and [English](https://blog.lucius7.cn/en/) entry points. Template posts and default profile details have been removed. Fuwari's default banner image is enabled; other template images remain removed. The post directories start empty; each home page shows an empty state until a public post is added. Posts from the previous AstroPaper blog have not yet been migrated.

| Item | Configuration |
| --- | --- |
| Website | The root redirects to `/zh/`; Chinese uses `/zh/` and English uses `/en/` |
| Languages | Separate post directories, lists, category and tag counts, post navigation, RSS, and search |
| Author | Lucius7 |
| Avatar | QQ account `3012967200`, through Tencent's HTTPS avatar endpoint |
| Site icon | `public/icon.svg`, an L7 wordmark |
| Banner | Fuwari's default `src/assets/images/demo-banner.png`, centered and processed by Astro |
| Writing | Markdown; new posts are drafts visible in local development |
| Reading | Light and dark themes, categories, tags, Pagefind search, RSS, and sitemap |
| Math | `remark-math` + `rehype-katex`; styles and fonts ship with the site |
| Social links | GitHub, X, and LinkedIn |
| Recent submissions | Latest three accepted Codeforces/AtCoder submissions from OJFlare, with platform icons and direct submission links |
| About | AC contribution calendar with year and platform filters, using OJFlare's first-acceptance statistics |
| Footer registration | [ICP registration](https://beian.miit.gov.cn/), preserved in the site footer |
| Publishing | Style checks, type checks, build, and deployment on updates to `main` |

ESA provides HTTPS for the public site. The GitHub Pages origin certificate has a separate outstanding task; see [Domain and HTTPS](docs/DEPLOYMENT.md#domain-and-https).

## First run

Install Git, **Node.js 22 (at least 22.12)**, and **pnpm 9.14.4**:

```sh
git clone https://github.com/xw7qwq/nfuwari.git
cd nfuwari
npm install -g pnpm@9.14.4
pnpm install --frozen-lockfile
pnpm dev
```

If you use nvm, run `nvm install` and `nvm use` before installing pnpm to use the version in `.nvmrc`. Open the address shown in the terminal, normally `http://localhost:4321/`. Saved changes update the development page; press `Ctrl+C` to stop the server.

## Write your first post

Sync the default branch and create a writing branch:

```sh
git switch main
git pull --ff-only
git switch -c post/my-first-post
pnpm new-post en/my-first-post
pnpm dev
```

Edit `src/content/posts/en/my-first-post.md`. The generator defaults to `draft: true`, with `lang: en` for `en/` posts and `lang: zh_CN` for `zh/` posts. The body starts after the second `---`:

```markdown
---
title: "My first post"
published: 2026-09-08
description: "A short introduction to this post"
image: ''
tags: [notes]
category: Journal
draft: true
lang: en
---

## Getting started

Write the body here. Inline math looks like $E = mc^2$.
```

Use the actual publication date. Preview drafts with `pnpm dev`; set `draft: false` when ready to publish. **Production builds and deployments exclude drafts**, so they do not appear in `pnpm preview`.

For posts with several images, use `pnpm new-post en/my-first-post/index` to keep text and images together. Choose either a single file or a directory; do not create both for the same post. See the [writing guide](docs/WRITING.md) for fields, image paths, URLs, and Markdown, and the [LaTeX guide](docs/LATEX.md) for math.

Chinese posts use `pnpm new-post zh/my-first-post`; omitting the language prefix also defaults to `zh/`. Languages can publish independently. Matching relative paths identify translations automatically; different paths can share a `translationKey`. The language switcher opens the translation when available and otherwise opens the target language's home page. See the [bilingual content guide](docs/I18N.md).

## Check and publish

Stop the development server, set posts intended for publication to `draft: false`, and run:

```sh
pnpm lint
pnpm check
pnpm build
pnpm preview
```

Check posts, images, math, and search at the preview address. `pnpm preview` serves the last build; run `pnpm build` again after changes. The build clears Astro's content cache so deleted posts do not survive in the output.

Commit the reviewed post:

```sh
git status
git add src/content/posts/en/my-first-post.md
git commit -m "docs: publish first post"
git push -u origin post/my-first-post
```

Include any associated images in `git add`. Open a PR targeting `main` in the [repository](https://github.com/xw7qwq/nfuwari), wait for the current commit's CI to pass, and merge. Check the [deployment workflow](https://github.com/xw7qwq/nfuwari/actions/workflows/deploy.yml), then inspect the live site.

See the [deployment guide](docs/DEPLOYMENT.md) for regular updates, failures, and cache troubleshooting. Commit source and post assets; exclude `dist/`, `.astro/`, and `node_modules/`.

## Configuration and layout

| Path | Purpose |
| --- | --- |
| `src/content/posts/zh/`, `src/content/posts/en/` | Chinese and English posts with their dedicated images |
| `src/content/spec/zh/about.md`, `src/content/spec/en/about.md` | Chinese and English About pages |
| `src/i18n/` | Language identifiers and interface translations |
| `src/config.ts` | Site identity, theme, profile, navigation, social links, and post license |
| `src/content/config.ts` | Frontmatter fields and validation |
| `src/components/Footer.astro` | Footer and registration link |
| `src/assets/` | Assets processed by Astro; create directories as needed |
| `public/` | Files published unchanged; `CNAME` records the domain |
| `astro.config.mjs` | Site URL, integrations, and Markdown plugins |
| `scripts/new-post.js` | Markdown draft generator |
| `.github/workflows/` | CI and GitHub Pages deployment |
| `docs/` | Writing, math, deployment, and maintenance guides |

`profileConfig.avatar` currently uses Tencent's endpoint directly: `https://q1.qlogo.cn/g?b=qq&nk=3012967200&s=640`. Changes to the QQ avatar appear once browser and endpoint caches refresh; no repository image replacement is needed.

Local profile and banner images use `assets/...` for paths relative to `src/`, or `/images/...` for files in `public/`. See [Images](docs/WRITING.md#images) for post cover and body image paths.

The banner currently uses [Fuwari's bundled demo image](https://github.com/saicaca/fuwari/blob/main/src/assets/images/demo-banner.png) with the theme's default layout on both language home pages. To replace it, add an image under `src/assets/images/` and update `siteConfig.banner.src` in `src/config.ts`, for example `"assets/images/banner.jpg"`. Use `siteConfig.banner.position` to adjust the crop (`"top"`, `"center"`, or `"bottom"`), and `siteConfig.banner.credit` to display the image source when needed. Set `siteConfig.banner.enable` to `false` to hide the banner.

The sidebar's **Recent Submissions** widget reads [OJFlare's public dashboard API](https://ojflare.lucius7.dev/data/dashboard.json) in the browser. Its schema v2 `accepted` array contains accepted submissions only; failed attempts are not exported. The widget combines Codeforces and AtCoder entries, sorts by submission time, and displays the latest three, including repeated submissions to the same problem. Each row opens the API's original submission URL in a new tab. Problem titles come from the matching `problems` entry; times use the visitor's local time zone.

The widget checks for updates every five minutes while the page is visible, respects HTTP caching, and refreshes when the tab becomes visible again. Data freshness depends on OJFlare's published snapshot. A failed refresh keeps previously loaded records; initial loading, empty results, and unavailable data have distinct Chinese/English states. No API key is needed, and the blog build does not depend on OJFlare availability. Set `ojFlareConfig.enable` to `false` to hide the OJFlare widgets or update `ojFlareConfig.baseUrl` to use a compatible API host. The contract is documented in [OJFlare's API guide](https://github.com/xw7qwq/ojflare/blob/main/docs/API.md).

The [Chinese About page](https://blog.lucius7.cn/zh/about/) and [English About page](https://blog.lucius7.cn/en/about/) include an **AC Contributions** calendar. `/about/` keeps its existing redirect to `/zh/about/`. Each square counts problems first accepted on that date, after deduplicating the complete accepted history by `problemId`; repeated ACs in later years do not become new problems. Dates follow OJFlare's **Asia/Taipei (UTC+8)** convention. Undated solves are excluded. The default view shows the current calendar year across AtCoder, Codeforces, QOJ, and Nowcoder, with year/platform selectors and annual problem/active-day totals. Color levels match OJFlare: 0, 1–2, 3–5, 6–9, and 10 or more new problems. Future cells are disabled.

Hover or select a day to inspect its date and first-AC count. Keyboard users can enter the calendar with Tab, move between days with arrow keys, and use Home/End for its first/last available day. On narrow screens, scroll the calendar horizontally. The contribution calendar and recent-submissions card share one dashboard request and polling loop; entering or leaving About keeps the sidebar subscription working. Empty histories render an empty calendar, while loading and unavailable states remain distinct.

| Setting in `src/config.ts` | Purpose |
| --- | --- |
| `siteConfig.title`, `subtitle` | Site name and subtitle; `/zh/` or `/en/` determines the interface language |
| `siteConfig.themeColor.hue` | Theme hue, from 0 to 360 |
| `siteConfig.banner.enable`, `src` | Banner visibility and image |
| `profileConfig.avatar`, `name`, `bio` | Avatar, author name, and biography |
| `profileConfig.links` | Sidebar social links and icons |
| `macFlareConfig.enable`, `baseUrl` | Application and music icons beside the blog title; see [MacFlare integration](docs/MACFLARE.md) |
| `ojFlareConfig.enable`, `baseUrl` | Recent accepted submissions below the profile card and the About contribution calendar |
| `navBarConfig.links` | Top navigation |
| `licenseConfig` | Post license display and link |

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development preview, including drafts |
| `pnpm new-post zh/name` / `pnpm new-post en/name` | Create a draft for that language; accepts `language/directory/index` and defaults to Chinese when the language is omitted |
| `pnpm test:i18n` | Test language routes, content isolation, search indexes, and the post generator in a temporary directory |
| `pnpm test:macflare` | Test activity parsing, expiry, timeouts, and visibility-aware polling without the live service |
| `pnpm test:ojflare` | Test submission links, shared polling, failure recovery, first-AC counts, UTC+8 dates, leap years, calendar alignment, and platform filters without the live API |
| `pnpm lint` | Read-only code checks |
| `pnpm lint:fix` | Apply supported code and formatting fixes |
| `pnpm check` | Astro, Svelte, and TypeScript checks; also available as `type-check` |
| `pnpm build` | Build public pages and the Pagefind index |
| `pnpm preview` | Preview the built site, excluding drafts |

## Maintenance and licensing

The stack uses Astro 5, Svelte 5, Tailwind CSS 3, and TypeScript. `package.json` and `pnpm-lock.yaml` define exact dependency versions. Dependabot checks npm and GitHub Actions weekly. Expressive Code's core, Astro integration, and plugins update together; other npm patch updates are grouped, minor updates receive separate PRs, and major upgrades and KaTeX minor-version changes need separate evaluation.

Dependabot PRs are update proposals. Review compatibility, validate the current head, then use **Squash and merge** and delete the merged branch. Close duplicate or unsuitable updates with a reason. Merges trigger deployment; inspect the live site afterward. See the [PR workflow](CONTRIBUTING.md#pr-workflow).

Report problems or content corrections through [Issues](https://github.com/xw7qwq/nfuwari/issues). Read [CONTRIBUTING.md](CONTRIBUTING.md) for submission conventions and the [upstream repository](https://github.com/saicaca/fuwari) for general Fuwari documentation.

Thanks to Fuwari, Astro, and the open-source projects used here. Project code retains the [MIT license](LICENSE) and original attribution. The post license is configured in `src/config.ts`; images and other third-party materials retain their own licenses.

Platform icons are bundled under `src/assets/icons/`: the Codeforces SVG comes from [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/codeforces.svg), distributed under [CC0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md); the AtCoder image is its [official favicon](https://img.atcoder.jp/assets/favicon.png). Platform names and logos belong to their respective owners.

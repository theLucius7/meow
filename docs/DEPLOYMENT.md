# Local development and deployment

Website: [blog.lucius7.cn](https://blog.lucius7.cn/) · Source: [xw7qwq/nfuwari](https://github.com/xw7qwq/nfuwari)

See the [writing guide](WRITING.md) for posts and images, and the [LaTeX guide](LATEX.md) for math.

## Install the development environment

Install Git and Node.js 22 (at least 22.12), then the project's required pnpm 9.14.4:

```sh
node --version
npm install -g pnpm@9.14.4
pnpm --version
git clone https://github.com/xw7qwq/nfuwari.git
cd nfuwari
pnpm install --frozen-lockfile
pnpm dev
```

With nvm, run `nvm install` and `nvm use` in the repository before installing pnpm and dependencies. `.nvmrc` selects Node.js 22; `engines` and `packageManager` in `package.json` specify the detailed requirements. Do not clone the repository again inside an existing working copy.

Open the terminal's URL, normally `http://localhost:4321/`. Development mode includes drafts. Press `Ctrl+C` to stop. If the port is occupied, use the actual port shown or run `pnpm dev --port 4322`.

## Regular writing and publishing

### 1. Sync and create a branch

Before each set of changes:

```sh
git status
git switch main
git pull --ff-only
git switch -c post/my-first-post
pnpm install --frozen-lockfile
```

Handle any existing local changes before switching branches. Use a distinct branch name for each change, such as `post/binary-search` or `docs/update-about`. If `git pull --ff-only` cannot fast-forward, inspect the history instead of overwriting local commits.

### 2. Edit and preview

```sh
pnpm new-post en/my-first-post
pnpm dev
```

Edit `src/content/posts/en/my-first-post.md`, which defaults to `draft: true`. Edit existing posts directly without rerunning the generator. See the [writing guide](WRITING.md) for images, post directories, and fields.

### 3. Check production output

Set posts ready for publication to `draft: false`, stop the development server, and run:

```sh
pnpm lint
pnpm check
pnpm build
pnpm preview
```

The build clears Astro's content cache, excludes drafts, and generates static pages and a Pagefind index in `dist/`. This prevents deleted posts from surviving in the output. Inspect titles, images, math, links, and search. Rebuild after further changes. `pnpm lint` is read-only; use `pnpm lint:fix` for automatic fixes and review its changes.

### 4. Commit and push

Stop the preview and review the changes:

```sh
git status
git diff
git add src/content/posts/en/my-first-post.md
git commit -m "docs: publish first post"
git push -u origin post/my-first-post
```

For a post directory, stage that directory, for example `git add src/content/posts/en/my-first-post/`. Explicitly include changed configuration and other assets. Exclude generated output and dependency directories.

### 5. Merge the PR and check the live site

Open a PR from the writing branch to `main` in [Pull Requests](https://github.com/xw7qwq/nfuwari/pulls), explain the change and validation, and wait for CI to pass before merging. Pushing a branch or opening a PR does not update the live site; merging into `main` triggers deployment.

Check the current commit in [Deploy to GitHub Pages](https://github.com/xw7qwq/nfuwari/actions/workflows/deploy.yml). Once it succeeds, inspect affected pages on the [website](https://blog.lucius7.cn/). The workflow also supports manual runs from Actions.

Sync the merged default branch locally:

```sh
git switch main
git pull --ff-only
```

## Automatic deployment

CI uses Node.js 22, the pinned pnpm version, and the lockfile, then runs `pnpm lint`, `pnpm check`, `pnpm test:i18n`, `pnpm test:macflare`, `pnpm test:ojflare`, and `pnpm build`. Merging a validated PR into `main` triggers another full check and build, uploads the output, and deploys it to GitHub Pages. Deployment does not reuse Astro's content cache, preventing deleted posts from reappearing.

In [Settings → Pages](https://github.com/xw7qwq/nfuwari/settings/pages), the source should be **GitHub Actions** and the custom domain should be `blog.lucius7.cn`. Commit source files only; no separate `gh-pages` branch is needed.

## Domain and HTTPS

`astro.config.mjs` currently contains:

```js
site: "https://blog.lucius7.cn/",
```

The custom domain does not set `base`. The root redirects to `/zh/`; Chinese posts use `/zh/posts/post-name/` and English posts use `/en/posts/post-name/`. These language prefixes come from Astro i18n routing, not `base`. The repository name does not require an `/nfuwari/` prefix on the custom domain.

`public/CNAME` records the domain. With Actions publishing, the actual binding is controlled by GitHub Pages settings; editing this file alone is insufficient. A domain change must update `site`, `public/CNAME`, the Pages binding, and DNS/CDN settings together. The current domain is bound to `xw7qwq/nfuwari` and should not also be bound to another repository.

Requests follow this path: browser → Alibaba Cloud ESA → GitHub Pages. After the move to `xw7qwq`, the organization's Pages hostname is `xw7qwq.github.io`. Use that hostname when checking ESA's origin settings, with origin Host `blog.lucius7.cn` and no repository path prefix. If old content persists, refresh the relevant ESA cache and inspect browser caching.

**Certificate status recorded on September 8, 2026:** the public site is accessible over HTTPS using ESA's certificate. The GitHub Pages API reported origin certificate status `bad_authz` and `https_enforced: false`. Public availability does not establish that the origin certificate has recovered. Follow [GitHub's custom domain guidance](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) to check domain validation and certificate issuance, and verify ESA's origin protocol and certificate validation settings. After the origin certificate recovers, review whether to enable Pages' Enforce HTTPS.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `node` or `pnpm` is missing | Check Node.js installation; with nvm, run `nvm use` before installing the required pnpm version |
| Unsupported Node.js version | Use Node.js 22.12 or a later 22.x release; do not substitute another major version |
| Frozen lockfile installation fails | Sync the repository and confirm `package.json` and the lockfile belong to the same commit; dependency changes must update both |
| Local build passes but CI fails | Inspect the failing step, especially filename case, uncommitted images, and environment versions |
| Push is rejected | Check GitHub authentication and write access; sync and resolve conflicts instead of overwriting remote changes with force-push |
| Merged changes are missing online | Confirm the current commit's Pages deployment succeeded, then refresh ESA and browser caches |
| Build or deployment fails | Inspect the failing Actions step; the site continues serving the last successful deployment |
| A published change must be reverted | Create a Revert PR on GitHub, validate and merge it, then let the workflow deploy the restored source |

See [CONTRIBUTING.md](../CONTRIBUTING.md) for maintenance and dependency updates.

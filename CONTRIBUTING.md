# Contributing

This repository maintains [blog.lucius7.cn](https://blog.lucius7.cn/), built with Fuwari and Astro 5. Content corrections, reading improvements, and code fixes are welcome through Issues and pull requests.

Use English for project documentation, Issues, pull requests, and commit messages. Blog posts and theme localizations retain their intended language.

## Local development

Use Node.js 22 (at least 22.12) and pnpm 9.14.4 to match CI:

```sh
npm install -g pnpm@9.14.4
pnpm install --frozen-lockfile
pnpm dev
```

Chinese and English posts live in `src/content/posts/zh/` and `src/content/posts/en/`; site and social link settings live in `src/config.ts`. See the [writing guide](docs/WRITING.md) for fields, images, and drafts, the [deployment guide](docs/DEPLOYMENT.md) for publishing, and the [LaTeX guide](docs/LATEX.md) for math.

## Submitting changes

- Keep each PR focused. Avoid mixing content edits, interface changes, and dependency upgrades.
- Describe the concrete outcome in commit titles, such as `docs: clarify writing instructions` or `fix: correct post image paths`.
- Explain the problem, resulting behavior, and validation in the PR description. Include screenshots for interface changes.
- Check titles, dates, links, images, and math in changed posts. The generator defaults to `draft: true`; set it to `false` when ready to publish.

Before submitting code or dependency changes, run:

```sh
pnpm lint
pnpm check
pnpm build
```

`pnpm lint` is read-only. Use `pnpm lint:fix` for automatic fixes, then review its changes. The build generates static pages and a Pagefind index; use `pnpm preview` to inspect the result. For documentation-only changes, describe the checks performed and why a local build was omitted, if applicable.

## Dependency updates

Commit `package.json` and `pnpm-lock.yaml` together when changing dependencies. Review release notes, compatibility, and build results. Validate major upgrades to core dependencies such as Astro and Svelte separately. Security reviews must consider dependency paths and actual input sources; an alert in a static build tool does not by itself establish a live-site vulnerability. See the [dependency security review](docs/DEPENDENCY-REVIEW.md) for completed fixes and remaining exposure assessments.

Dependabot PRs need the same review and page validation as other updates. Do not merge solely because a bot opened the PR or CI passed.

Dependabot groups Expressive Code's core, Astro integration, and plugins to avoid mixing renderer versions. For KaTeX updates, confirm that the renderer used by `rehype-katex` matches the direct dependency's CSS and fonts. The post directory is currently empty: use temporary posts to validate changes affecting Markdown, math, or code blocks, then remove the fixtures before committing or publishing.

Changes to language routing, content filtering, search, or the post generator also require `pnpm test:i18n`. Preview both `/zh/` and `/en/`: the same query should return only the active language, a language switch should update the whole interface, and a missing translation should lead to the target language's home page. The test creates posts in a temporary directory without changing real content. See the [bilingual content guide](docs/I18N.md).

Changes to the recent-submissions widget or its OJFlare integration also require `pnpm test:ojflare`. Verify both interface languages and direct submission links in the browser; the public API exports accepted submissions only.

## PR workflow

1. Review the changes and official release notes. Use a title such as `type(scope): concrete change`, and describe purpose, compatibility, and validation.
2. Sync the latest `main` and resolve conflicts. A green check on an older commit does not validate the current head.
3. Wait for the current PR's CI to pass. For dependency changes, inspect affected math, code blocks, or pages. State the check scope for documentation-only changes.
4. Use **Squash and merge** once the PR is ready, then delete the merged remote branch. Close duplicate, outdated, or incompatible PRs with an explanation.
5. Confirm that main-branch CI and GitHub Pages deployment succeed, then inspect the live site. When merging several dependency updates, validate their combined effect in subsequent PRs.

Do not merge unverified updates simply to empty the PR list. Dependabot will continue its weekly checks.

## Publishing

Updates to `main` trigger a GitHub Actions build and deployment to GitHub Pages. Alibaba Cloud ESA serves the custom domain. Confirm that content is ready before merging, then check Actions and affected live pages. See the [deployment guide](docs/DEPLOYMENT.md) for domain, Pages, and ESA settings.

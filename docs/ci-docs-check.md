# Docs check

Pull requests run `.github/workflows/docs-check.yml`. The job name is `docs-check`. It runs on `opened`, `synchronize`, `reopened`, `labeled`, and `unlabeled`.

The check fails when a watched design or behaviour file changes and nothing under `docs/` changes. It passes when the `no-docs-needed` label is on the pull request. The diff is the three-dot diff `base.sha...head.sha`.

## Watched paths

Same list as the top of the workflow and `scripts/docs_check_pr.py`:

- `src/**/*.css`
- `src/**/*.ts`, except `src/**/*.test.ts`
- `index.html`
- `vite.config.ts`

## Not watched

- `art/` and `public/` (artwork and other content)
- `src/**/*.test.ts`
- Sprite scripts: `scripts/align_sprite_frame.py`, `scripts/build_cat_parts.sh`, `scripts/prepare_sprite.py`
- `vercel.json` and `.github/workflows/pages.yml` (deploy settings; do not change them from a docs-only pull request)
- README, `AGENTS.md`, and files under `docs/`

A change that only touches an unwatched path does not need a docs update. A change to CSS, the app TypeScript, `index.html`, or `vite.config.ts` needs `docs/` in the same pull request, usually `docs/design.md`, unless `no-docs-needed` truly applies.

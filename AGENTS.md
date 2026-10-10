# Agents

Design or behaviour changes (CSS, templates, app JS, build scripts, config) must update docs/ (usually docs/design.md) in the same PR. Use the `no-docs-needed` label only for changes that truly need no docs.

The start screen is `src/start.css` and the markup in `renderTitle()` in `src/main.ts`. The pinball shell is `src/styles.css`. Table rules are `src/game/rules.ts`. Phaser draws the table in `src/game/GameScene.ts`.

Vite `base` in `vite.config.ts` is `./`. Local play is `http://localhost:5173/`. Do not set the base to `/` or `/cat-pinball-game/`: the first breaks the Pages subpath, and the second is not rewritten by the polah `/balls/` proxy.

Do not change `vercel.json`, the Vercel project, or the trigger in `.github/workflows/pages.yml` unless asked. Hosting is described in the README. The public game is [polah.app/balls](https://polah.app/balls/), which proxies the GitHub Pages build.

Pull requests run the `docs-check` workflow. Watched paths are listed in [docs/ci-docs-check.md](docs/ci-docs-check.md) and at the top of `.github/workflows/docs-check.yml`.

Runtime artwork is under `public/assets`. Production notes are in [art/README.md](art/README.md).

# Cat Balls: Paws of Chaos

A playful browser pinball game about five house cats causing harmless midnight chaos. Choose Oyen, Tompok, Kicap, Belang, or Kapas, then launch the selected cat-comet into a hand-illustrated house table.

**Play:** [polah.app/balls](https://polah.app/balls/) or [hafiy.my/cat-pinball-game](https://hafiy.my/cat-pinball-game/)

Vite `base` is `./`. Script, stylesheet, favicon, and game images are relative to the page, so the same `dist/` loads under `/cat-pinball-game/` and under `/balls/`. See [Deployment](#deployment).

## Current playable features

- Five cosmetic cat choices with identical gameplay physics
- Animated loading screen on every site load
- Original procedural background music with an upbeat, cheeky cat theme
- Cat-matched ball, paw-flipper, and tail-launcher artwork
- Hold-and-release launcher with a minimum charge threshold and a squared launch-strength curve
- Responsive paw flippers and a genuine centre drain
- Moving laser-pointer target that starts Laser Chase on the first hit (four hits to finish)
- Timed Mouse Hunt with a harmless sensor target that patrols the table
- Knockable vase sequence
- Three-hit cardboard-box lock leading to Zoomies Multiball
- Roomba Rumble sweeps the lower table and speeds up as it takes hits. It starts after Laser Chase is finished and the Zoomies timer ends, while at least one ball is still in play
- Three lives, ball save, combos, scoring, pause, and restart
- The start bar shows the top score stored on this device. Completed runs are also stored (up to ten). There is no name prompt and no on-screen score table
- Keyboard controls and touch controls on mobile layouts

## Local development

```sh
npm install
npm run dev
```

Vite `base` is `./`. The dev server is still at the site root, so open `http://localhost:5173/`.

Useful checks:

```sh
npm run check
npm run build
npm run preview
```

`npm run build` is `tsc -b && vite build`. Output is `dist/`. `npm run check` is the TypeScript build plus `vitest run`.

No environment variables are required. The app does not read custom `VITE_*` variables. `import.meta.env.BASE_URL` is Vite's own base path.

## Controls

- Left paw: `A`
- Right paw: `D`
- Wind and launch: hold `Space`, then release
- Previous or next cat on the start screen: `ArrowLeft` / `ArrowRight`
- Pause: `P`
- Restart: `R`

## Architecture

The interface is a small TypeScript application mounted by `src/main.ts`. Phaser renders the table and Matter-based collisions at a fixed internal size of 1000×1600, while the surrounding interface handles character selection, HUD updates, overlays, responsive controls, and browser storage.

Cat selection is cosmetic. Every character uses the same mass, size, bounce, flipper strength, rules, and scoring opportunities.

Design notes are in [docs/design.md](docs/design.md). Agent rules are in [AGENTS.md](AGENTS.md).

## Artwork

Runtime artwork lives under `public/assets`. High-resolution masters, approved concepts, production references, and generated source sheets live under `art` so non-runtime material is not copied into the deployed bundle.

The project uses original project-specific artwork, including assets developed through an AI-assisted illustration workflow and then reviewed, cropped, aligned, recoloured, or animated for the game. Game images are local files. The start screen loads Fredoka and Bricolage Grotesque from Google Fonts. The app does not load analytics or third-party advertising.

See [art/README.md](art/README.md) for the production conventions and source layout.

## Deployment

The playable site is the GitHub Pages build.

- **Pages URL:** [hafiy.my/cat-pinball-game](https://hafiy.my/cat-pinball-game/). `nazirulhafiy.github.io/cat-pinball-game` redirects there. Pages serves the `gh-pages` branch. Relative URLs such as `./assets/…` resolve to `/cat-pinball-game/assets/…` on that host.
- **Workflow:** [`.github/workflows/pages.yml`](.github/workflows/pages.yml) is manual only (`workflow_dispatch`). It does not run on push. The job uses Node 22, runs `npm ci` and `npm run build`, and publishes `dist/` with `peaceiris/actions-gh-pages`. Publishing this base change still takes a manual run. This repo does not start that workflow.
- **Public play URL:** [polah.app/balls](https://polah.app/balls/) proxies the Pages build. The proxy lives in the polah repo (`server/middleware/balls-proxy.ts`), not here. It fetches `hafiy.my/cat-pinball-game/` plus the path under `/balls/`, and it rewrites only root-absolute `/assets/` and `/favicon.svg` onto `/balls/`, including inside JavaScript. A relative `./assets/…` URL is not rewritten. From a page at `/balls/`, the browser requests `/balls/assets/…`, and the proxy fetches that file from the Pages subpath. `asset()` drops a leading `balls/` so a rewritten `"/balls/assets/…"` string still becomes `./assets/…`. There is no service worker and no web app manifest. A base of `/cat-pinball-game/` would fix Pages and miss this rewrite, so polah would ask its own host for `/cat-pinball-game/assets/…`.
- The Pages build that was live on 24 September 2026 (`ceff2b7`) still used `base: '/'`, so opening that published HTML directly requested `/assets/…` and those root URLs 404. This change is what makes a later manual publish load at the Pages URL without changing the proxy.
- **Vercel:** [cat-balls-paws-of-chaos.vercel.app](https://cat-balls-paws-of-chaos.vercel.app/) still responds. It is a different bundle from the 24 September Pages build (different hashed script name). Its `Last-Modified` is 4 October 2026. `/balls/` on that host returns 404. `vercel.json` in this repo rewrites `/balls` onto the root files; this repository does not change the Vercel project or those settings.

High scores stay in each player's browser (`localStorage`). A global leaderboard would require a future backend.

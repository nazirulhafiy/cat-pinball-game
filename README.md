# Cat Balls: Paws of Chaos

A playful browser pinball game about five house cats causing harmless midnight chaos. Choose Oyen, Tompok, Kicap, Belang, or Kapas, then launch the selected cat-comet into a hand-illustrated house table.

**Play:** [polah.app/balls](https://polah.app/balls/)

That address proxies the GitHub Pages build. Opening [hafiy.my/cat-pinball-game](https://hafiy.my/cat-pinball-game/) directly does not load the game script: Vite `base` is `/`, so the published HTML requests `/assets/…`, and those root URLs 404 on `hafiy.my`. The files are present under `/cat-pinball-game/assets/…`. See [Deployment](#deployment).

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

Vite `base` is `/`, so open `http://localhost:5173/`.

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

- **Pages URL:** [hafiy.my/cat-pinball-game](https://hafiy.my/cat-pinball-game/). `nazirulhafiy.github.io/cat-pinball-game` redirects there. Pages serves the `gh-pages` branch.
- **Workflow:** [`.github/workflows/pages.yml`](.github/workflows/pages.yml) is manual only (`workflow_dispatch`). It does not run on push. The job uses Node 22, runs `npm ci` and `npm run build`, and publishes `dist/` with `peaceiris/actions-gh-pages`.
- **Last published build checked:** 24 September 2026 (workflow run on `main` at `ceff2b7`). Because `base` is `/`, that HTML's `/assets/…` URLs 404 on the Pages host. The same files return 200 under `/cat-pinball-game/assets/…`.
- **Public play URL:** [polah.app/balls](https://polah.app/balls/) proxies that Pages build. Its response carries the same `Last-Modified` as the Pages deploy and GitHub's edge headers, and it rewrites asset URLs onto `/balls/…`, which return 200. The proxy configuration is not in this repository. A comment in `pages.yml` still says polah.app is served from Vercel; that comment does not match the live response.
- **Vercel:** [cat-balls-paws-of-chaos.vercel.app](https://cat-balls-paws-of-chaos.vercel.app/) still responds. It is a different bundle from the 24 September Pages build (different hashed script name). Its `Last-Modified` is 4 October 2026. `/balls/` on that host returns 404. `vercel.json` in this repo rewrites `/balls` onto the root files; this repository does not change the Vercel project or those settings.

High scores stay in each player's browser (`localStorage`). A global leaderboard would require a future backend.

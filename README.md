# Cat Balls: Paws of Chaos

A playful browser pinball game about five house cats causing harmless midnight chaos. Choose Oyen, Tompok, Kicap, Belang, or Kapas, then launch the selected cat-comet into a hand-illustrated house table.

## Current playable features

- Five cosmetic cat choices with identical gameplay physics
- Animated loading screen on every site load
- One-time player-name registration saved on the current device
- Original procedural background music with an upbeat, cheeky cat theme
- Cat-matched ball, paw-flipper, and tail-launcher artwork
- Hold-and-release launcher with a minimum charge threshold and nonlinear launch strength
- Responsive paw flippers and a genuine centre drain
- Moving laser-pointer target that starts Laser Chase on the first hit
- Timed Mouse Hunt with a harmless sensor target that patrols the table
- Knockable vase sequence
- Three-hit cardboard-box lock leading to Zoomies Multiball
- Moving Roomba Rumble boss that sweeps the lower table and accelerates as it takes hits
- Roomba Rumble unlocks after finishing Laser Chase and surviving the full Zoomies timer in one run, then returning to one ball
- Three lives, ball save, combos, scoring, pause, restart, and an on-device all-time high-score table
- Keyboard controls and touch controls on mobile layouts

## Local development

```sh
npm install
npm run dev
```

Useful checks:

```sh
npm run check
npm run build
npm run preview
```

## Controls

- Left paw: `A`
- Right paw: `D`
- Wind and launch: hold `Space`, then release
- Pause: `P`
- Restart: `R`

## Architecture

The interface is a small TypeScript application mounted by `src/main.ts`. Phaser renders the table and Matter-based collisions at a fixed internal aspect ratio, while the surrounding interface handles character selection, HUD updates, overlays, responsive controls, and browser storage.

Cat selection is cosmetic. Every character uses the same mass, size, bounce, flipper strength, rules, and scoring opportunities.

## Artwork

Runtime artwork lives under `public/assets`. High-resolution masters, approved concepts, production references, and generated source sheets live under `art` so non-runtime material is not copied into the deployed bundle.

The project uses original project-specific artwork, including assets developed through an AI-assisted illustration workflow and then reviewed, cropped, aligned, recoloured, or animated for the game. It does not load remote images, fonts, analytics, or third-party advertising.

See [art/README.md](art/README.md) for the production conventions and source layout.

## Deployment plan

The application is designed for Vercel's Vite preset:

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: none currently required

Production deployment can be connected to the `main` branch when the game is ready to publish. Until then, the project can use private repository and preview deployments.

High scores currently remain in each player's browser. A global leaderboard would require a future backend or hosted database.

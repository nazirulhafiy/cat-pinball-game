# Design

The live UI has two screens, plus a loader and a few overlays. The start screen is Night Mock A (`src/start.css`). The table screen is the dark arcade shell (`src/styles.css`). `src/main.ts` replaces `#app` when the player moves between them.

## Loader

`index.html` paints a full-screen loader before JavaScript runs. Theme colour is `#140c2e`. The panel is cream type (`#fff6ea`) on a purple radial wash (`#3a2278` into `#140c2e` into `#100818`). The kicker is pink `#ff4d93`. The title uses Fredoka with a pink offset shadow and a gold dot `#ffd84a`. A gold bar fills across an ink-bordered track. The loader stays at least 1.1 seconds unless the visitor prefers reduced motion, then the start screen replaces it.

## Start screen

Night sky, cream cards, ink outlines, and hard offset shadows.

Tokens in `.start-shell`:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#1a120c` | Borders and button text |
| `--cream` | `#fff6ea` | Cards, balls, flippers |
| `--butter` | `#ffd84a` | Play button, chevrons, chaos pill |
| `--pink` | `#ff4d93` | Kicker, selected ball, hero shadow |
| `--amber` | `#e07a32` | Subtitle under the title |
| `--sky` | `#140c2c` | Sky base |
| `--felt` | `#6b349f` | Decorative table strip |
| `--wood` | `#c9843e` | Table rails |

Body type is Bricolage Grotesque. Titles, the Play button, pills, and the mute chip use Fredoka. Both families are loaded from Google Fonts in `index.html`. Lede text is `#ddd4f2`.

Layout, from the top:

1. Star field and a cream moon, top right.
2. Bar aligned to the end: device high score (hidden when the stored top score is 0) and a Sound / Muted chip.
3. Stage. From 981px wide it is two columns: kicker, taped title card ("CAT BALLS." / "Paws of Chaos"), lede, ball row, and Play on the left; the cat portrait panel on the right. The title card is cream with an ink border, a tape tab, and an ink shadow. The hero panel is cream with a large pink shadow and two pills: the cat's name and title, and "Chaos mode".
4. A decorative felt strip with wooden rails, two bumpers, and two flippers. It does not receive clicks.

The ball row is five circular cat-ball buttons between gold chevrons. The selected ball gets a pink border. Chevrons and arrow keys cycle the five cats. Choosing a cat stores `nine-lives-selected-cat` and plays a selection cue unless muted.

At 980px and below the stage becomes one column, at most 460px, with the hero between the title and the lede. Play stretches to the column width. At 420px the balls and chevrons shrink so the row still fits.

## Table screen

`.game-shell` sits on the dark page from `src/styles.css`: canvas `#0d1022`, body radial from `#3b3375` through `#15172f` to `#090b18`, text `#fff8ef`. Headings in this shell use Georgia. The shell sets `--cat-primary`, `--cat-secondary`, and `--cat-accent` from the selected cat. Tuxedo and Kapas use their accent colour as the UI primary so the controls stay visible; the others use their fur colour.

| Cat | Id | UI primary | Secondary | Accent |
| --- | --- | --- | --- | --- |
| Tompok | calico | `#f2b56b` | `#fff2d8` | `#353340` |
| Kicap | tuxedo | `#73d7ff` (accent used as UI primary) | `#f7f2e8` | `#73d7ff` |
| Oyen | orange | `#f0843c` | `#ffd18a` | `#fff4c7` |
| Belang | tabby | `#8d8176` | `#d6c8b9` | `#b8f3c8` |
| Kapas | white | `#5ea6d5` (accent used as UI primary) | `#d8e6f2` | `#5ea6d5` |

The header is one arcade bar: back to the cats, score and device best, life balls (the selected cat's ball art), the mode title, and help, mute, and pause. The table sits in a 5:8 frame, at most 520px wide, with a `#171522` border. Phaser mounts in that frame at an internal 1000×1600. A launch note ("Hold Space · Release") sits over the table until the ball leaves the plunger.

Touch controls are a row under the table: Left, a round Launch button tinted with the cat primary, and Right. At 760px and below that row is fixed to the bottom of the viewport and the keyboard hint is hidden from 420px down. Focus on the table uses an amber ring `#f3a52c`.

## Overlays

- **Launch transition.** The cat ball streaks across a dark veil for about 1.1 seconds ("catching the moonbeam"). Skip ends it immediately. Reduced motion shortens it to 120ms.
- **How to play.** Four steps: wind and launch, flippers, mouse and laser, box lock and vacuum.
- **Pause.** Resume or restart. Music pauses with the table.
- **Game over.** "Nine lives spent", the score, and whether it beat the score from the start of the run. Retry keeps the cat. The other action returns to the start screen.

Buttons share the chunky treatment: ink or translucent borders, a pressed shift, and a visible focus ring (`#fff6ae` on the dark shell, white or gold on the start screen).

## Behaviour worth keeping in mind

Cat choice does not change physics. Scores, mute, and the selected cat stay in `localStorage` (`nine-lives-high-score`, `nine-lives-muted`, `nine-lives-selected-cat`, `cat-balls-all-time-high-scores`). A stored `nine-lives-player-name` is read if present; the UI never asks for one. Game over saves the run under that name, or "Player".

Modes, from `src/game/rules.ts`: Mouse Hunt (18s, 3 catches), Laser Chase (20s, 4 hits), Zoomies multiball after 3 box locks (25s), then Roomba Rumble (30s, 6 hits) once Laser Chase and the Zoomies timer are both done and a ball is still in play. A new ball gets a few seconds of ball save. Combos multiply ordinary scores for a short window.

`prefers-reduced-motion` collapses the loader wait, the launch streak, and CSS animation.

## Public address

`canonical` and `og:url` in `index.html` are `https://polah.app/balls/`.

The same file runs an inline script immediately after the charset tag, before the loader. It returns unless `location.hostname` is `hafiy.my` or `nazirulhafiy.github.io`. On those hosts, `/cat-pinball-game` and `/cat-pinball-game/…` are rewritten so the prefix becomes `/balls`, then `location.replace` goes to `https://polah.app` plus that path, `location.search`, and `location.hash`. A path that is already `/balls` or `/balls/…` on those hosts is sent to the same path on `polah.app`. Every other host stays, including `polah.app`, `localhost`, and `cat-balls-paws-of-chaos.vercel.app`. The document is still HTTP 200: there is no meta refresh and no response status the `/balls/` proxy would follow.

## Asset URLs

Vite `base` is `./`. `index.html` uses `%BASE_URL%` for the favicon. `src/game/asset.ts` prefixes every runtime image with `import.meta.env.BASE_URL`, so a path like `/assets/cats/calico/ball-v1.png` becomes `./assets/cats/calico/ball-v1.png`. The built script and stylesheet are relative too. There is no service worker and no web app manifest.

Relative URLs resolve against the page. At `hafiy.my/cat-pinball-game/` they stay under that folder. At `polah.app/balls/` the browser asks for `/balls/assets/…`, and the proxy fetches that file from the Pages folder. The built HTML uses `./assets/…` and `./favicon.svg`. The character before those paths is a dot, so the proxy's root-absolute rewrite does not change the HTML.

The proxy does rewrite JavaScript. A string `"/assets/…"` in the bundle becomes `"/balls/assets/…"`. `asset()` removes a leading slash and a leading `balls/` before adding `./`, so that rewritten argument still becomes `./assets/…` instead of `./balls/assets/…`.

Three background rules in `src/styles.css` (`.title-shell` and `.welcome-shell`, which the current screens do not render) are written as `url('/assets/concepts/title-world-background-draft-v1.png')`. The production build rewrites each one to `url(../assets/concepts/title-world-background-draft-v1.png)`, relative to the stylesheet in `assets/`. From either host that still lands on `…/assets/concepts/title-world-background-draft-v1.png`. The character before `/assets/` is a dot, so the proxy rewrite does not touch it.

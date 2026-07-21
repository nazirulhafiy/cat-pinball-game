# Nine Lives art production guide

The approved direction is the flat, hand-drawn cartoon style shown in:

- `art/concepts/cat-character-pinball-forms-cartoon-v2.png`

## Character assets

- Keep bold charcoal outlines with slight natural variation.
- Use large, flat color regions and no realistic fur rendering.
- Preserve each cat's markings between portrait and curled forms.
- Portraits must remain readable at 54 pixels in the character cards.
- Keep expressions simple, asymmetric, and easy to distinguish.

## Pinball assets

- Use a near-perfect circular outer silhouette.
- Prioritize one eye, one ear, the muzzle, paws, and tail over small details.
- The runtime texture is displayed at 80 by 80 table units on a 62-unit circular collider.
- At the current browser scale, the ball is roughly 25 screen pixels wide, so markings must be bold.

## Pilot export sizes

- Character portrait: 512 by 512 RGBA PNG.
- Curled pinball: 256 by 256 RGBA PNG.
- High-resolution transparent masters are stored under `art/source/<cat>/`.
- Runtime assets are stored under `public/assets/cats/<cat>/`.

Mika, Domino, Marmalade, Pepper, and Wisp each have a production portrait and curled pinball form following these rules. Character-select portraits also include a registered closed-eye frame for cosmetic blink animation.

## Table assets

- The approved visual source is `art/concepts/cutaway-house-table-concept-v1.png`.
- The background layer contains only the cabinet, house scenery, floor, drain, rugs, and furniture bases.
- Collision rails, launcher guides, targets, flippers, and moving objects remain separate runtime layers.
- Runtime table backgrounds export at exactly 1000 by 1600 pixels to match the Phaser canvas.
- High-resolution table masters are stored under `art/source/table/`.
- Runtime table assets are stored under `public/assets/table/`.

## Interactive object sprites

- Paw flipper runtime canvas: 240 by 90 pixels, displayed over a 190 by 50 Matter rectangle.
- Both flippers use the same right-facing source sprite; the right assembly is rotated by Phaser.
- Each cat has its own `paw-flipper-v4.png` and `tail-launcher-v4.png` matching its portrait markings.
- Yarn bumper runtime canvas: 110 by 110 pixels, with a radius-50 Matter circle.
- Laser target runtime canvas: 84 by 84 pixels, with a radius-38 Matter circle.
- Laser activation halos remain code-driven so the neutral target sprite never bakes in a glow.
- Cardboard box lock runtime canvas: 150 by 110 pixels, with a centered 130 by 76 Matter sensor.
- Vase target runtime canvas: 70 by 100 pixels, with a centered 52 by 78 Matter sensor.
- The three vase variants use zigzag, vertical-stripe, and fish-scale patterns while sharing identical physics.
- Reusable guide-rail runtime canvas: 280 by 48 pixels, scaled and rotated over unchanged Matter walls.
- Kitchen-ramp runtime canvas: 270 by 105 pixels, centered at 729,838 and rotated by -0.96 radians.
- Mouse runtime sprite: 160 by 103 pixels, displayed over a sensor-only 96 by 48 Matter rectangle during Mouse Hunt.
- Robot-vacuum runtime sprite: 220 by 162 pixels, displayed over a sensor-only radius-88 Matter circle during Roomba Rumble.
- Tail-launcher runtime canvas: 120 by 240 pixels, placed beside the launcher ball as non-colliding spring decoration.
- Transparent masters are stored under `art/source/objects/`.
- Shared runtime sprites are stored under `public/assets/table/objects/`; cat-specific parts are stored under `public/assets/cats/<cat>/`.

The mouse and robot-vacuum masters were generated against the approved table concept on removable chroma-key backgrounds, then reviewed and converted to alpha PNGs. Their retained chroma sources live under `art/generated/enemies/`.

## Generated cat-part sources

The reviewed chroma-key and alpha source sheets for cat paws and tails are stored under `art/generated/cat-parts/`. Run `scripts/build_cat_parts.sh` to rebuild the five aligned runtime exports from the alpha sheets.

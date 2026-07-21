# Cat-part source sheets

These source sheets produce the character-matched paw flippers and spring tails used by the table.

Row order in both sheets:

1. Mika, calico
2. Domino, tuxedo
3. Marmalade, orange
4. Pepper, tabby
5. Wisp, white

The built-in image-generation workflow used the approved flat-cartoon portraits as character references. The final prompt set requested:

- five identically posed, right-facing cat foreleg-and-paw sprites with each cat's exact fur palette and markings;
- five identically posed, smoothly curled cat tails with the same character mapping;
- bold charcoal outlines, simple cel colours, no mechanical parts, no text, and uniform chroma-key backgrounds.

Files ending in `-chroma.png` are the generated sources. Files ending in `-alpha.png` are reviewed chroma-removed intermediates retained for deterministic cropping and alignment.

Run the project-root script below to recreate the production `v4` assets:

```sh
./scripts/build_cat_parts.sh
```

The script requires `ffmpeg` and writes to `public/assets/cats/<cat>/`.

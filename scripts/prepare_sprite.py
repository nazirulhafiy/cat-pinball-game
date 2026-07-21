#!/usr/bin/env python3
"""Trim a transparent master and fit it into an exact runtime canvas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--canvas", nargs=2, type=int, required=True, metavar=("WIDTH", "HEIGHT"))
    parser.add_argument("--content", nargs=2, type=int, required=True, metavar=("WIDTH", "HEIGHT"))
    parser.add_argument("--mirror", action="store_true")
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise SystemExit(f"No visible pixels found in {args.input}")

    sprite = image.crop(bounds)
    if args.mirror:
        sprite = ImageOps.mirror(sprite)
    sprite.thumbnail(tuple(args.content), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", tuple(args.canvas), (0, 0, 0, 0))
    offset = ((canvas.width - sprite.width) // 2, (canvas.height - sprite.height) // 2)
    canvas.alpha_composite(sprite, offset)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, optimize=True)


if __name__ == "__main__":
    main()

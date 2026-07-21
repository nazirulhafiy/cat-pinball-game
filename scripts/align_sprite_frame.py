#!/usr/bin/env python3
"""Register an alternate RGBA frame to the visible bounds of a base sprite."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def visible_bounds(image: Image.Image, path: Path) -> tuple[int, int, int, int]:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise SystemExit(f"No visible pixels found in {path}")
    return bounds


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base", type=Path)
    parser.add_argument("frame", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    base = Image.open(args.base).convert("RGBA")
    frame = Image.open(args.frame).convert("RGBA")
    if frame.size != base.size:
        raise SystemExit(f"Canvas mismatch: base {base.size}, frame {frame.size}")

    base_bounds = visible_bounds(base, args.base)
    frame_bounds = visible_bounds(frame, args.frame)
    target_width = base_bounds[2] - base_bounds[0]
    target_height = base_bounds[3] - base_bounds[1]
    registered = frame.crop(frame_bounds).resize(
        (target_width, target_height), Image.Resampling.LANCZOS
    )

    canvas = Image.new("RGBA", base.size, (0, 0, 0, 0))
    canvas.alpha_composite(registered, (base_bounds[0], base_bounds[1]))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, optimize=True)


if __name__ == "__main__":
    main()

"""Normalize independent navigation icon cutouts for the Phaser menu.

Run from the repository root: python3 art-source/navigation-icons-v2/process.py
The checked-in raw images are the inputs; each output is a separate 96px RGBA
texture with the same visual padding and centre anchor.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parents[1] / "public/assets/ui/navigation/icons"
ICON_NAMES = ("rewards", "shop", "boost", "managers", "map")
CANVAS_SIZE = 96
PADDING = 7


def process_icon(name: str) -> None:
    source_path = ROOT / "raw" / f"{name}.png"
    source = Image.open(source_path)
    if source.mode != "RGBA":
        raise ValueError(f"{source_path} must have a real alpha channel")

    alpha = source.getchannel("A")
    if alpha.getextrema() != (0, 255):
        raise ValueError(f"{source_path} must have transparent and opaque pixels")

    bounds = alpha.point(lambda value: 255 if value > 4 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"{source_path} has no visible subject")

    cropped = source.crop(bounds)
    max_subject_size = CANVAS_SIZE - PADDING * 2
    scale = min(
        max_subject_size / cropped.width,
        max_subject_size / cropped.height,
    )
    size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    subject = cropped.resize(size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE))
    output.alpha_composite(
        subject,
        ((CANVAS_SIZE - size[0]) // 2, (CANVAS_SIZE - size[1]) // 2),
    )

    OUTPUT.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT / f"{name}.png", optimize=True)


if __name__ == "__main__":
    for icon_name in ICON_NAMES:
        process_icon(icon_name)

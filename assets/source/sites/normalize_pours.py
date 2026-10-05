"""Normalize generated resource-pour animation candidates to the Gold 2x2 sheet."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/source/sites"
OUTPUT = ROOT / "public/assets/sites"
SITE_IDS = ("amethyst", "ruby", "sapphire", "emerald", "diamond")
SHEET_SIZE = (256, 256)


def normalize(site_id: str) -> None:
    source = SOURCE / site_id / "pour-source.png"
    destination = OUTPUT / site_id / "pour-sheet.png"
    with Image.open(source) as image:
        image = image.convert("RGBA")
        if image.width != image.height or image.width % 2:
            raise ValueError(f"{site_id}: expected a square 2x2 source sheet")
        cell_size = image.width // 2
        sheet = Image.new("RGBA", SHEET_SIZE)
        for row in range(2):
            for column in range(2):
                left = column * cell_size
                top = row * cell_size
                frame = image.crop((left, top, left + cell_size, top + cell_size))
                frame = frame.resize((128, 128), Image.Resampling.LANCZOS)
                sheet.alpha_composite(frame, (column * 128, row * 128))
        destination.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(destination, optimize=True)


if __name__ == "__main__":
    for mine_id in SITE_IDS:
        normalize(mine_id)

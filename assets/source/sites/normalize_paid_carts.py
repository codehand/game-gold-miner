"""Align paid Hauler loaded variants to their original 128px vehicle anchors."""

from pathlib import Path
from shutil import copyfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
GENERATED = Path('/Users/mofy/.codex/generated_images/01a0f681-596c-72a2-889d-c239ec0fbb90')
SOURCES = {
    'amethyst': {
        'tobi': 'exec-36c2a2d2-0c7a-4b9d-b0d8-bc77dbf7f7d3.png',
        'rivet': 'exec-162f2a38-9d0b-4dda-82a6-083be884b5b6.png',
    },
    'ruby': {
        'tobi': 'exec-12ba4fdf-cdc1-48e7-96f6-c913920548f6.png',
        'rivet': 'exec-a03eae42-6bfb-4280-bf66-95c8750d934a.png',
    },
    'sapphire': {
        'tobi': 'exec-0bcd4006-d1d2-49db-a5ed-0165050f624e.png',
        'rivet': 'exec-4d974058-fdcf-4144-bbb9-37852df82fa4.png',
    },
    'emerald': {
        'tobi': 'exec-1b5739dc-fd9c-4d4f-b28e-dcef3448bc38.png',
        'rivet': 'exec-93d69d6f-ce5f-477a-bb00-ea4fe9664693.png',
    },
    'diamond': {
        'tobi': 'exec-8be2a419-2253-4e0a-9673-92fcf718cd84.png',
        'rivet': 'exec-57b9307a-45df-4c9b-a284-105ceb66b586.png',
    },
}

for site, vehicles in SOURCES.items():
    for vehicle, generated_name in vehicles.items():
        source = ROOT / 'assets' / 'source' / 'sites' / site / f'{vehicle}-cart-filled-source.png'
        source.parent.mkdir(parents=True, exist_ok=True)
        if not source.exists():
            copyfile(GENERATED / generated_name, source)
        reference = Image.open(
            ROOT / 'public' / 'assets' / 'marketplace' / 'runtime' / 'hauler' /
            f'{vehicle}-cart-filled.png'
        )
        x0, y0, x1, y1 = reference.getchannel('A').getbbox()
        with Image.open(source) as original:
            image = original.convert('RGBA')
            crop = image.crop(image.getchannel('A').getbbox())
            normalized = crop.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (128, 128))
            canvas.paste(normalized, (x0, y0))
            output = ROOT / 'public' / 'assets' / 'sites' / site / f'{vehicle}-cart-filled.png'
            output.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(output, optimize=True)
        print(f'{site}/{vehicle}: aligned to {(x0, y0, x1, y1)}')

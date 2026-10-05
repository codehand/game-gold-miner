"""Align loaded default carts to the original 256px gameplay anchor."""

from pathlib import Path
from shutil import copyfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
GENERATED = Path('/Users/mofy/.codex/generated_images/01a0f681-596c-72a2-889d-c239ec0fbb90')
SOURCES = {
    'amethyst': 'exec-706cdd1b-784b-4c69-9c0b-3a2ca1d6003a.png',
    'ruby': 'exec-dfa6043a-1db8-44d0-bdb2-aea8d3c86491.png',
    'sapphire': 'exec-ae1e2e2f-796f-47b8-9c43-c6b77991d9c3.png',
    'emerald': 'exec-ca79515a-f9c0-4ab7-a52f-767c6b2f0a87.png',
    'diamond': 'exec-0d260941-5da7-469c-8ba8-e27fe9c37ab0.png',
}
target = Image.open(ROOT / 'public/assets/step-32a/gold-container-filled.png').getchannel('A').getbbox()
x0, y0, x1, y1 = target

for site, generated_name in SOURCES.items():
    source = ROOT / 'assets' / 'source' / 'sites' / site / 'cart-filled-source.png'
    source.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        copyfile(GENERATED / generated_name, source)
    with Image.open(source) as original:
        image = original.convert('RGBA')
        crop = image.crop(image.getchannel('A').getbbox())
        normalized = crop.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (256, 256))
        canvas.paste(normalized, (x0, y0))
        output = ROOT / 'public' / 'assets' / 'sites' / site / 'cart-filled.png'
        output.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output, optimize=True)
    print(f'{site}: loaded cart aligned to {target}')

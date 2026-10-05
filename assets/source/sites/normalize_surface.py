"""Normalize the five approved surface landscape candidates to game resolution."""

from pathlib import Path
from shutil import copyfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
GENERATED = Path('/Users/mofy/.codex/generated_images/01a0f681-596c-72a2-889d-c239ec0fbb90')
SOURCE_FILES = {
    'amethyst': 'exec-9de0b31e-039d-4d6d-882e-e86d9f525779.png',
    'ruby': 'exec-30a853f0-5a17-4307-b822-617d2beb5c59.png',
    'sapphire': 'exec-d4797f7f-6860-4481-bb42-dd36bc9c3b3d.png',
    'emerald': 'exec-29198ba4-0bbe-4262-9088-23634100081e.png',
    'diamond': 'exec-266d2fbf-59f4-4d76-b358-64aa5f935e59.png',
}

for site_id, generated_name in SOURCE_FILES.items():
    source = ROOT / 'assets' / 'source' / 'sites' / site_id / 'surface-source.png'
    output = ROOT / 'public' / 'assets' / 'sites' / site_id / 'surface.webp'
    source.parent.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        copyfile(GENERATED / generated_name, source)
    with Image.open(source) as image:
        image.convert('RGB').resize((720, 328), Image.Resampling.LANCZOS).save(
            output, 'WEBP', quality=88, method=6
        )
    print(f'{site_id}: {source} -> {output}')

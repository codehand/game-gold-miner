"""Export the resource-specific repeating shaft candidates at native size."""

from pathlib import Path
from shutil import copyfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
GENERATED = Path('/Users/mofy/.codex/generated_images/01a0f681-596c-72a2-889d-c239ec0fbb90')
SOURCES = {
    'amethyst': 'exec-97dc4a34-e7c4-4583-830c-16c8ee9b6875.png',
    'ruby': 'exec-bd68a1bf-977a-45aa-aa47-977118c8021a.png',
    'sapphire': 'exec-7e0fed17-e092-42d5-bd1e-59a37efdad7c.png',
    'emerald': 'exec-c318198f-343a-4f26-ba10-68a453e19e9d.png',
    'diamond': 'exec-d1e6cf35-989a-47c7-a493-7b79de8a93aa.png',
}

for site, generated_name in SOURCES.items():
    source = ROOT / 'assets' / 'source' / 'sites' / site / 'shaft-source.png'
    source.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        copyfile(GENERATED / generated_name, source)
    with Image.open(source) as image:
        output = ROOT / 'public' / 'assets' / 'sites' / site / 'shaft.png'
        output.parent.mkdir(parents=True, exist_ok=True)
        image.convert('RGB').resize((192, 528), Image.Resampling.LANCZOS).save(
            output, optimize=True
        )
    print(f'{site}: shaft exported at 192x528')

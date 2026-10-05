"""Align approved structure candidates to the existing game sprite anchors."""

from pathlib import Path
from shutil import copyfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
GENERATED = Path('/Users/mofy/.codex/generated_images/01a0f681-596c-72a2-889d-c239ec0fbb90')
SOURCES = {
    'amethyst': {
        'tower-loaded': 'exec-6b5f8ed7-635c-4ad2-a7f3-d41e58853e0d.png',
        'tower-empty': 'exec-f662f3eb-6a9a-44c4-ac36-fd6755d60349.png',
        'warehouse': 'exec-edde467e-1c44-42e7-a608-3a2dc4b85ed9.png',
    },
    'ruby': {
        'tower-loaded': 'exec-14c90b31-e6cf-4f69-9362-a1975f34082d.png',
        'tower-empty': 'exec-8fec49b9-c379-4aaa-a6fd-bd59077a3e6e.png',
        'warehouse': 'exec-5133d8b7-ed80-47c4-b018-64f582c537f4.png',
    },
    'sapphire': {
        'tower-loaded': 'exec-0c100cda-3f0b-4cce-b01c-42d863226507.png',
        'tower-empty': 'exec-4ec4a7d6-568c-4598-9bda-c2ff98ce2815.png',
        'warehouse': 'exec-81f8c7f0-c4b6-4175-a491-5a17c85010e8.png',
    },
    'emerald': {
        'tower-loaded': 'exec-58bdfe98-9749-4fc9-a3b8-23d9e6d682bd.png',
        'tower-empty': 'exec-223dfe3d-03c2-423a-b391-f19cda2595cc.png',
        'warehouse': 'exec-ec173d67-99c0-4b36-b430-5e686354e75c.png',
    },
    'diamond': {
        'tower-loaded': 'exec-431ccd14-e3b2-456c-bcb9-bbfc2f0de484.png',
        'tower-empty': 'exec-834543d1-0a16-4c2e-8042-8ffb333d1923.png',
        'warehouse': 'exec-574afc0a-b877-4591-9ad8-7305dacfc614.png',
    },
}


def source_image(site_id: str, asset: str, generated_name: str) -> Image.Image:
    path = ROOT / 'assets' / 'source' / 'sites' / site_id / f'{asset}-source.png'
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        copyfile(GENERATED / generated_name, path)
    return Image.open(path).convert('RGBA')


def export(image: Image.Image, source_bounds: tuple[int, int, int, int],
           target_bounds: tuple[int, int, int, int], output: Path) -> None:
    x0, y0, x1, y1 = target_bounds
    normalized = image.crop(source_bounds).resize(
        (x1 - x0, y1 - y0), Image.Resampling.LANCZOS
    )
    canvas = Image.new('RGBA', (512, 512))
    canvas.paste(normalized, (x0, y0))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)


tower_target = Image.open(ROOT / 'public/assets/step-32a/elevator-tower-v2.png').getchannel('A').getbbox()
warehouse_target = Image.open(ROOT / 'public/assets/step-32a/warehouse-building.png').getchannel('A').getbbox()

for site, assets in SOURCES.items():
    loaded = source_image(site, 'tower-loaded', assets['tower-loaded'])
    empty = source_image(site, 'tower-empty', assets['tower-empty'])
    common_tower_bounds = loaded.getchannel('A').getbbox()
    for name, image in [('tower-loaded', loaded), ('tower-empty', empty)]:
        export(image, common_tower_bounds, tower_target,
               ROOT / 'public/assets/sites' / site / f'{name}.png')
    warehouse = source_image(site, 'warehouse', assets['warehouse'])
    export(warehouse, warehouse.getchannel('A').getbbox(), warehouse_target,
           ROOT / 'public/assets/sites' / site / 'warehouse.png')
    print(f'{site}: tower loaded/empty and warehouse aligned to original sprite bounds')

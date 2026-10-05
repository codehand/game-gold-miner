"""Register generated Boru frames to their chassis, never to the moving bucket.

Deterministic postprocessing only. Run after generate2dsprite QC; no drawn art.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/cat-role-catalog/miner/ssr/boru'
PUBLIC = ROOT / 'public/assets/marketplace/runtime/miner'
PUBLIC.mkdir(parents=True, exist_ok=True)
report = {}
for action in ('travel-empty', 'scoop', 'travel-loaded', 'deposit'):
    folder = SOURCE / action / 'processed'
    sheet = Image.open(folder / 'sheet-transparent.png').convert('RGBA')
    frames = []
    records = []
    for index in range(8):
        frame = sheet.crop((index % 4 * 128, index // 4 * 128,
                            index % 4 * 128 + 128, index // 4 * 128 + 128))
        pixels = np.array(frame)
        # The tracks are the longest dark horizontal span near the baseline.
        # Ignore the right-hand boom/cargo; neither may move the chassis root.
        dark = (pixels[:, :, :3].max(axis=2) < 115) & (pixels[:, :, 3] > 180)
        best = (0, 0, 0, 0)
        for y in range(98, 115):
            start = None
            for x in range(20, 88):
                if dark[y, x] and start is None:
                    start = x
                if start is not None and (not dark[y, x] or x == 87):
                    if x - start > best[0]:
                        best = (x - start, start, x, y)
                    start = None
        assert best[0] >= 20, (action, index, 'track root not found')
        center = (best[1] + best[2]) / 2
        track_x = int(center)
        track_bottom = max(y for y in range(95, 120)
                           if pixels[y, track_x, 3] > 180)
        dx, dy = round(64 - center), 112 - track_bottom
        bounds = frame.getbbox()
        assert bounds and bounds[0] + dx > 0 and bounds[2] + dx < 128
        assert bounds[1] + dy > 0 and bounds[3] + dy < 128
        aligned = Image.new('RGBA', (128, 128))
        aligned.paste(frame, (dx, dy))
        frames.append(aligned)
        records.append({'frame': index, 'translation': [dx, dy],
                        'trackRoot': [64, 112], 'bounds': aligned.getbbox()})
    out = SOURCE / action / 'aligned'
    out.mkdir(exist_ok=True)
    atlas = Image.new('RGBA', (512, 256))
    for index, frame in enumerate(frames):
        frame.save(out / f'frame-{index + 1}.png')
        atlas.paste(frame, (index % 4 * 128, index // 4 * 128))
    atlas.save(out / 'sheet-transparent.png')
    atlas.save(PUBLIC / f'boru-{action}-8f-sheet.png')
    frames[0].save(out / 'animation.gif', save_all=True, append_images=frames[1:],
                   duration=110, loop=0, disposal=2)
    report[action] = records
portrait = ROOT / 'public/assets/marketplace/catalog/miner/ssr/boru'
portrait.mkdir(parents=True, exist_ok=True)
# Catalog/assignment portraits share one 128px asset. Enlarge the existing
# authored sprite within that canvas; runtime action sheets stay unchanged.
portrait_source = Image.open(SOURCE / 'travel-empty/aligned/frame-1.png').convert('RGBA')
bbox = portrait_source.getbbox()
assert bbox is not None
subject = portrait_source.crop(bbox)
scale = min(116 / subject.width, 104 / subject.height)
subject = subject.resize((round(subject.width * scale), round(subject.height * scale)),
                         Image.Resampling.LANCZOS)
portrait_canvas = Image.new('RGBA', (128, 128))
portrait_canvas.paste(subject, ((128 - subject.width) // 2,
                                (128 - subject.height) // 2))
portrait_source_path = SOURCE / 'portrait/idle-1.png'
portrait_source_path.parent.mkdir(exist_ok=True)
portrait_canvas.save(portrait_source_path)
portrait_canvas.save(portrait / 'idle-1.png')
(SOURCE / 'alignment-qc.json').write_text(json.dumps(report, indent=2) + '\n')
print('Boru: 32 frames registered to track root (64,112); no scaling/clipping.')

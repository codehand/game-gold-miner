# Warm lantern-lit cave — style reference prompt

Derived from a competitor screenshot supplied on 2026-08-30 as *art direction*
only. It describes lighting, materials, character proportions, and staging — not
any specific character design — because `memory-bank` requires original art and
forbids reusing the reference game's protected content.

**Aspect ratio:** 1.9:1 (the source was 1024x548). The live floor panel is 2.2:1
at 288x132, so this is a mood/direction study, not a panel mockup.

## Prompt

```
Flat 2D cartoon mobile game art, side-scrolling underground mine interior, front view, orthographic, no perspective distortion. Wide horizontal scene, aspect ratio 1.9:1.

SETTING: a warm lantern-lit cave tunnel cut into rock.
- CEILING: a thick dark brown-black rock mass across the top third, with angular grey-blue stone chunks #6b7a8a embedded in it at irregular angles, each stone flat-shaded with one lighter facet.
- BACKGROUND: a deep warm amber glow #b5651d pooling in the middle distance, as if lit from within the tunnel, fading to dark brown at the edges.
- SIDE WALLS: chunky angular grey-blue rock formations framing the left and right edges, faceted like cut gemstones, cooler in colour than the warm centre.
- SUPPORT STRUCTURE: a wooden A-frame timber beam #c98a4b on the right side, with a small metal lantern hanging from it casting a warm yellow pool of light #f4bd3e.
- GROUND: a flat dark brown soil floor running the full width, with a slightly darker band along the very bottom edge, scattered with small pebbles and loose gold flecks.

CHARACTERS: chunky cute cartoon cats, big rounded heads, small stocky bodies, large expressive eyes, soft flat vector shading with no hard outlines.
- an orange tabby cat wearing a golden mining helmet, standing on the soil floor, holding a shovel, mid-work pose
- a second orange tabby cat beside it in a work outfit, holding a pickaxe
- a white and grey cat standing apart to the left, arms relaxed, no helmet, wearing a dark apron, acting as an overseer

GOLD: bright glowing gold nuggets #f4bd3e piled on the ground to the right of the cats, a generous scattered heap catching warm rim light, with a few loose nuggets spilling across the floor. On the far left, a wooden cart or open crate #a9713c brimming with the same gold nuggets.

UI OVERLAY, flat and clean, drawn on top of the scene:
- top left: a small dark rounded badge with a green border containing a grey pickaxe icon, followed by a bold white timer "04m:15s"
- left, beside the cart: a round gold coin icon and a bold white amount "108.10b" with a dark outline for legibility
- FLUSH RIGHT, hugging the right edge: a rounded rectangle button, bright steel blue #41658a with a lighter blue inner face, containing "Level" above "250" in bold white, with a chunky gold upward arrow #f4bd3e sitting on its top edge

STYLE: mobile idle game art, chunky and readable, warm and inviting, rich saturated colours, soft gradient shading, clean flat vector shapes, subtle glow around gold and lantern light, no outlines on characters, no photorealism, no pixel art.
```

## Negative prompt

```
photorealistic, 3D render, isometric, perspective, pixel art, retro 8-bit, human miner, dwarf, anime girl, sketch, line art, watermark, text gibberish, cluttered, muddy colours, harsh black outlines, dark gloomy, horror
```

## Notes carried from the review

- **Confirms two layout decisions.** The level button sits flush right with a gold
  arrow on its top edge, and it displays the *level*, not the price — the same two
  choices taken during the 2026-08-30 panel iteration.
- **Conflicts with the current palette.** This direction is warm (brown, amber,
  lantern gold); `src/game/layout/palette.ts` is cool (navy `#101827`, steel-blue
  `#2c4260`, teal `#2ea9a1`). Adopting it is a palette rewrite, and every e2e pixel
  probe reads those same constants.
- **Much denser than a floor panel.** Three characters, a cart, a lantern, a beam,
  ceiling rock and two UI clusters in 1.9:1. The live panel is 132 px tall and four
  of them must stack inside a 404 px mine region — this composition is closer to a
  whole screen than to one row.

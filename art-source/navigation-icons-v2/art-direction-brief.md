# Mine navigation icon family

Five independent item icons for the fixed 360×80 logical bottom menu. Each
ships as a 96×96 transparent PNG and is rendered near 42×42 logical pixels.
The panel, tile boundaries, labels, and press feedback remain code drawn.

- Shapes: compact three-quarter props with a thick charcoal silhouette and
  broad faces; one immediately recognizable subject per item.
- Colors: slate-blue painted steel, warm timber, honey-gold ore, tan parchment,
  and the orange miner cat. The dark navy menu uses the game's HUD colors.
- Light: upper left, restrained highlights, no glows or star particles.
- Native-scale rule: the reward chest, shop canopy, boost bolt, cat helmet, and
  map route must remain distinct at 42×42. No words are baked into textures.
- Texture rule: one file per icon with real alpha, common padding, no shared
  atlas or menu sprite sheet. The normalization script crops only transparent
  margins and resizes the artwork; it does not draw or retouch generated art.

The former purple-and-gold full-menu strip under `art-source/navigation-menu/`
remains the historical source. Its runtime file is no longer loaded.

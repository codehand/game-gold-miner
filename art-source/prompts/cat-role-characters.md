# Cat role characters — rarity ladder prompt pack (Gemini / Nano Banana)

Mục tiêu: mỗi **role** vận hành trong mỏ có **5 nhân vật** riêng, mỗi nhân vật có
**tên** và **bậc hiếm** C → R → SR → SSR. Tổng: 5 role × 5 nhân vật = **25 nhân vật**.

Prompt trong file này bám theo `public/assets/placeholder/art-direction-brief.md`
và `src/game/layout/palette.ts`, nên output ghép thẳng vào pipeline chroma-key
sẵn có của Step 32A (`art-source/step-32a-asset-pack`).

## 1. Năm role (lấy từ sprite runtime hiện tại)

| Role key | Sprite hiện tại | Vai trò trong pipeline |
|---|---|---|
| `miner` | `miner-walk-sheet.png` | Đào quặng trong 4 tầng mỏ |
| `unloader` | `unloader-idle-sheet.png` | Dỡ quặng ở đầu tầng vào container |
| `elevator-cargo` | `elevator-cargo-cat-v2-sheet.png` | Áp tải trong cabin thang máy |
| `surface-hauler` | `surface-hauler-cat-sheet.png` | Đẩy xe vàng trên mặt đất |
| `warehouse-manager` | `warehouse-manager-idle-sheet.png` | Giám sát / kiểm đếm tại kho |

## 2. Phân bổ bậc hiếm trong mỗi role

Tháp hiếm đáy rộng, **2 C · 1 R · 1 SR · 1 SSR**. Nếu muốn đổi sang 1C/2R/1SR/1SSR
thì chỉ sửa cột Rarity ở bảng mục 5, phần prompt không đổi.

## 3. Thang thị giác của rarity (RÀNG BUỘC CỨNG — dán vào mọi prompt)

Nhân vật hiển thị ở 28–48 logical pixel, nên rarity phải đọc được bằng
**silhouette + số lượng màu nhấn + độ hào quang**, không phải bằng chi tiết nhỏ.

```
RARITY LADDER (must be readable at 32 pixels tall):
- C  (Common): plain cloth workwear, ONE accent colour, no metal trim, no gems,
  no glow, no cape. Simplest silhouette of the role. Rarity key colour steel blue #6688aa.
- R  (Regular): sturdier workwear, TWO accent colours, exactly one metal piece
  (buckle, goggles, carabiner or spectacles), small teal #2ea9a1 accent, no glow,
  no cape. Slightly bulkier silhouette than C. Rarity key colour teal #2ea9a1.
- SR (Super Role): layered outfit with shoulder piece, warm gold #f4bd3e trim on
  two elements, ONE signature prop unique to this character, a faint soft rim glow
  only, still no full cape. Distinctly larger silhouette. Rarity key colour violet #8a5cd6.
- SSR (Super Super Role): full ornate set — mantle or short cape, gold #f4bd3e
  brocade, one coloured gem, glowing eyes, a soft energy aura hugging the body and
  three to five small floating light motes close to the body. Boldest, most
  asymmetric silhouette. Rarity key colour warm gold #f4bd3e.
Escalation rule: C < R < SR < SSR strictly increases in outfit layers, gold coverage
and silhouette width. Never give a lower tier a feature reserved for a higher tier.
Aura rule: any glow must stay inside the subject bounding box and must NOT be a
detached effect, because effects are composited by code at runtime.
```

## 4. Style lock (dán NGUYÊN VĂN vào mọi prompt, không sửa)

```
STYLE LOCK — identical for every character in this project:
Clean HD 2D cartoon mobile-game sprite, flat vector shading, front-facing three-quarter
side view, orthographic, no perspective distortion. Chunky cute cat: big rounded head,
small stocky body, short limbs, large expressive eyes, rounded chunky silhouette that
stays readable at 32 pixels. Dark navy outline, two or three value bands per material,
minimal surface texture, soft upper-left highlight.
Palette anchors: mine navy #101827, shaft navy #172536, steel blue #6688aa,
beam blue #304a66, panel steel blue #41658a, warm gold #f4bd3e, teal #2ea9a1,
cream #f4ead5, warm soil #8a5a32.
Scale family: every character shares the same head-to-body ratio and the same feet
baseline; the subject stands on an invisible ground line at the bottom of the frame
with its feet flat, occupying the central 70% of the canvas with even padding.
Technical output: single subject, centred, solid exact #FF00FF magenta background
filling the entire canvas edge to edge, no transparency, no cast shadow outside the
subject, no ground plane, no scenery, no props that touch the frame edge.
```

## 5. Bảng 25 nhân vật

Cột `Slot` = `{{ROLE}}-{{RARITY}}-{{NAME}}`, dùng luôn làm tên file
(`miner-ssr-obsidian.png`).

### 5.1 Miner — đào quặng, cầm cuốc, mũ bảo hộ

| # | Rarity | Name | Identity brief (chèn vào `{{CHARACTER}}`) |
|---|---|---|---|
| 1 | C | **Pebble** | grey tabby cat, soft cloth cap, plain brown work shirt, short wooden-handled pickaxe held low |
| 2 | C | **Soot** | charcoal-black cat with soot smudges on cheeks and paws, sleeveless grey tunic, stubby iron pick |
| 3 | R | **Flint** | ginger tabby cat, steel-blue #41658a helmet with brass goggles pushed up on the brim, teal #2ea9a1 neckerchief, reinforced steel pickaxe |
| 4 | SR | **Quarry** | brown-and-cream cat, heavy layered mining coat with a gold #f4bd3e trimmed shoulder plate, helmet with a lit gold lamp, twin crossed picks, faint warm rim glow |
| 5 | SSR | **Obsidian** | deep navy-black cat with glowing gold #f4bd3e rune markings on the fur, ornate gold brocade mantle over dark armour, crystal-headed greatpick with a teal #2ea9a1 gem, glowing amber eyes, soft gold aura and four small floating crystal shards |

### 5.2 Unloader — dỡ quặng ở đầu tầng, tạp dề

| # | Rarity | Name | Identity brief |
|---|---|---|---|
| 1 | C | **Mitten** | white-and-grey cat, plain cream #f4ead5 apron, empty paws held ready |
| 2 | C | **Biscuit** | cream-coloured cat, simple brown shoulder sack, rolled sleeves |
| 3 | R | **Tally** | grey cat, teal #2ea9a1 apron with a metal buckle, small brass hand counter clipped to the belt |
| 4 | SR | **Bushel** | orange cat, heavy-duty leather harness with gold #f4bd3e buckles and a gold-rimmed shoulder pad, wide gold panning dish as signature prop, faint warm rim glow |
| 5 | SSR | **Cornucopia** | white-and-gold cat, gilded ceremonial mantle with gold #f4bd3e brocade, amber gem clasp, glowing eyes, holding an ornate overflowing gold basin, soft gold aura and five small floating gold nuggets close to the body |

### 5.3 Elevator cargo — đứng trong cabin, ôm thùng hàng

| # | Rarity | Name | Identity brief |
|---|---|---|---|
| 1 | C | **Latch** | brown tabby cat, plain steel-blue #41658a cloth vest, arms wrapped around a small wooden crate |
| 2 | C | **Bolt** | grey cat, simple hard hat, plain grey overalls, one paw gripping an imaginary rail |
| 3 | R | **Cable** | black-and-white tuxedo cat, work harness with a single steel carabiner, teal #2ea9a1 armband, coil of rope over one shoulder |
| 4 | SR | **Winch** | orange cat, mechanic overall with a gold #f4bd3e pulley-shaped shoulder pauldron and gold cuff trim, signature gold winch crank, faint warm rim glow |
| 5 | SSR | **Skyline** | silver-white cat, flowing navy-and-gold short cape, gold #f4bd3e chest plate, teal #2ea9a1 gem at the collar, glowing eyes, glowing gold cable coiled around one arm, soft aura and three floating light motes |

### 5.4 Surface hauler — đẩy xe vàng trên mặt đất

| # | Rarity | Name | Identity brief |
|---|---|---|---|
| 1 | C | **Rusty** | ginger cat, plain brown work shirt, bare paws pushing forward at waist height |
| 2 | C | **Clover** | grey-and-white cat, simple straw hat, plain cream #f4ead5 tunic |
| 3 | R | **Tread** | brown cat, sturdy boots and gloves, teal #2ea9a1 bandana, one metal belt buckle |
| 4 | SR | **Bullion** | cream-and-gold cat, courier coat with gold #f4bd3e trimmed hem and shoulder strap, gold-buckled hauling harness as signature gear, faint warm rim glow |
| 5 | SSR | **Caravan** | white-and-navy cat, ornate silk mantle with gold #f4bd3e brocade and small gold bells, amber gem brooch, glowing eyes, ceremonial hauling straps, soft gold aura and four floating light motes |

### 5.5 Warehouse manager — kiểm đếm tại kho, clipboard

| # | Rarity | Name | Identity brief |
|---|---|---|---|
| 1 | C | **Ledger** | grey cat, plain cloth cap, simple navy vest, holding a small wooden clipboard |
| 2 | C | **Penny** | calico cat, plain cream #f4ead5 waistcoat, holding a short tally stick |
| 3 | R | **Abacus** | black-and-white cat, round metal spectacles, teal #2ea9a1 vest with a brass button row, holding a small abacus |
| 4 | SR | **Vault** | dark grey cat, gold #f4bd3e trimmed supervisor cap and gold epaulettes over a navy coat, heavy ring of gold keys as signature prop, faint warm rim glow |
| 5 | SSR | **Midas** | white-and-gold cat, ornate gold #f4bd3e brocade coat with a crown-like gold cap, amber gem at the collar, glowing eyes, holding a gilded ledger, soft gold aura and five floating gold coins close to the body |

## 6. Prompt A — sinh **từng nhân vật** (bản production, chạy 25 lần)

Thay `{{ROLE_ACTION}}`, `{{RARITY}}`, `{{NAME}}`, `{{CHARACTER}}` từ bảng trên.
Đính kèm sprite sheet role tương ứng ở mục 1 làm **reference ảnh** (chỉ để khoá
style, không copy bố cục).

```
Use case: stylized-concept
Asset type: one original 2D character sprite for a 360x640 portrait idle mining game
Reference image role: the attached sheet is a STYLE and SCALE anchor only — same cartoon
family, same outline weight, same palette, same head-to-body ratio, same feet baseline.
Do NOT copy its outfit, colours or pose; this is a different character.

Primary request: Draw one single cat character, standing, {{ROLE_ACTION}}.

Character: {{NAME}} — {{CHARACTER}}
Rarity tier: {{RARITY}}

<PASTE THE RARITY LADDER BLOCK FROM SECTION 3 HERE>

<PASTE THE STYLE LOCK BLOCK FROM SECTION 4 HERE>

Pose: neutral standing idle, weight even, both feet visible and flat on the invisible
baseline, body facing three-quarter to the right, head turned slightly toward the camera.
Game-scale read: the character is displayed 32 to 48 pixels tall; exaggerate the
silhouette-defining shapes (hat, shoulder line, held prop) and drop small detail.

Constraints: exactly one character, no second cat, no duplicate subject, no variation grid.
Avoid: text, letters, numbers, name tags, rarity badges, stars, UI frames, panels, cards,
card borders, rarity ribbons, scenery, rock walls, ground planes, grid lines, cell borders,
mockup frames, cropped edges, background gradients, drop shadows on the background,
signatures, watermarks, logos, photorealism, 3D render, isometric view, pixel art,
human miner, dwarf, anime girl.
```

### `{{ROLE_ACTION}}` theo role

| Role | `{{ROLE_ACTION}}` |
|---|---|
| miner | `holding a mining pickaxe close to the body, ready to swing` |
| unloader | `standing at a receiving station with both paws free and ready to lift` |
| elevator-cargo | `holding a cargo crate against the chest with both paws` |
| surface-hauler | `both paws forward at waist height as if gripping a cart handle, no cart drawn` |
| warehouse-manager | `holding a clipboard against the chest with one paw, the other paw relaxed` |

## 7. Prompt B — contact sheet duyệt nhanh cả thang rarity (5 nhân vật / 1 ảnh)

Dùng để **review** độ chênh lệch giữa C → SSR trong cùng một role, không dùng làm
asset runtime (identity từng nhân vật sẽ kém ổn định hơn Prompt A).

```
Use case: stylized-concept
Asset type: original character line-up sheet for a 2D idle mining game
Primary request: Create one exact 5x1 horizontal sheet with five DIFFERENT cat characters,
one centred character per cell, all from the same job role: {{ROLE_LABEL}}.

Cell order, left to right, strictly increasing in rarity:
1) {{C1_NAME}} — tier C — {{C1_CHARACTER}}
2) {{C2_NAME}} — tier C — {{C2_CHARACTER}}
3) {{R_NAME}}  — tier R — {{R_CHARACTER}}
4) {{SR_NAME}} — tier SR — {{SR_CHARACTER}}
5) {{SSR_NAME}} — tier SSR — {{SSR_CHARACTER}}

<PASTE THE RARITY LADDER BLOCK FROM SECTION 3 HERE>

<PASTE THE STYLE LOCK BLOCK FROM SECTION 4 HERE>

Registration: all five characters share the same camera, the same scale family, the same
head-to-body ratio and the same feet baseline across the whole sheet, so the visual growth
from cell 1 to cell 5 comes only from outfit, gold coverage and silhouette width.
Technical output: 5 columns by 1 row, each character fully inside the central 70% of its
cell with generous padding, matched visual density, solid exact #FF00FF background across
the entire image, no cell borders, no separators.
Avoid: text, letters, numbers, name labels, tier labels, stars, badges, card frames,
UI panels, scenery, ground planes, grid lines, cropped edges, duplicate characters,
signatures, watermarks, logos.
```

## 8. Negative prompt dùng chung (nếu model có trường riêng)

```
photorealistic, 3D render, isometric, perspective distortion, pixel art, retro 8-bit,
human miner, dwarf, anime girl, sketch, line art, text, letters, numbers, name tags,
rarity stars, badges, card frames, UI panels, watermark, signature, logo, cluttered,
muddy colours, harsh black outlines, dark gloomy, horror, detached particle effects,
cast shadow on background, background gradient, cropped subject, multiple subjects
```

## 9. Hậu kỳ để khớp runtime

1. Chroma-key `#FF00FF` → alpha (đúng pipeline `generate2dsprite` đang dùng).
2. Resize về **128×128** RGBA PNG, canh **feet baseline** giống các sheet Step 32A.
3. Nếu cần animation, chạy lại prompt với ràng buộc `exact 2x2 grid, four frames of the
   same character, stable feet baseline` — giữ nguyên Character/Rarity/Style lock.
4. QC như manifest hiện tại: `emptyFrames = 0`, `outputEdgeTouchFrames = 0`,
   `bodyScaleCv < 0.02`, `anchorYStd < 0.05`.

## 10. Việc còn lại ở phía code (chưa làm)

- `#8a5cd6` (SR) chưa có trong `src/game/layout/palette.ts`; nếu UI vẽ khung rarity
  thì cần thêm hằng số mới — e2e pixel probe đọc trực tiếp các hex này.
- Chưa có cấu trúc dữ liệu cho nhân vật/rarity trong `src/config` hay `src/core`.
  Prompt pack này chỉ là art brief; phần gameplay là bước riêng.

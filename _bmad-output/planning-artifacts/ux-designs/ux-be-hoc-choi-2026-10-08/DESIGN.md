---
title: "DESIGN – Bé Học Chơi"
status: final
created: 2026-10-08
updated: 2026-10-08
sources:
  - ../../prds/prd-be-hoc-choi-2026-10-08/prd.md
  - ../../prds/prd-be-hoc-choi-2026-10-08/addendum.md
name: Bé Học Chơi
description: Thế giới đồ chơi low-poly trên một hòn đảo cho bé 3 tuổi – iPad ngang, giọng đọc dẫn dắt, không có chữ hướng dẫn, không có thua.
colors:
  # Cảnh (lấy từ render-con-duong-v2.png / render-tiem-kem-v2.png)
  sea: '#2EA8E6'
  sea-shallow: '#7FD8F5'
  sky: '#A9D3F0'
  grass: '#7CCB4E'
  sand: '#F6D79A'
  road: '#5B6270'
  road-dash: '#FFE15A'
  road-edge: '#FFF6E0'
  cave-mouth: '#E9D8B4'   # nền đá sáng trước cửa hang (Tìm bóng) – không dùng nền hang tối
  # Toà nhà & đồ vật tô pastel
  tint-pink: '#FF9EC4'
  tint-sky: '#8FD3FF'
  tint-mint: '#B7F59A'
  tint-lilac: '#C9A8FF'
  tint-butter: '#FFE08A'
  truck-pink: '#FF8FC0'
  counter-pink: '#FFC6E4'
  counter-top: '#FFFFFF'
  oven-glow: '#FF9A3C'
  # Tô lại màu sinh vật (thay màu xám tối/nâu xám của Quaternius)
  creature-green: '#5CC46A'
  creature-blue: '#6EC6FF'
  creature-pink: '#FF6FA8'
  creature-purple: '#8A5CF6'
  creature-orange: '#FF9A3C'
  # Lớp giao diện
  button-home: '#FFD23F'
  button-speaker: '#7FC8FF'
  button-play: '#FFD23F'
  button-replay: '#5CC46A'
  button-map: '#7FC8FF'
  hint-core: '#FFFFFF'    # lõi vòng gợi ý + quầng ngoài
  hint-line: '#5B21B6'    # nét tím đậm giữa vòng gợi ý – khác hẳn mọi màu vàng của nút/vạch đường
  sparkle: '#FFE45C'      # lấp lánh trang trí – không phải tín hiệu gợi ý
  shadow-target: '#5B4E96'
  ghost-fill: '#5B4E96'
  ghost-line: '#FFFFFF'
  icon-ink: '#1F2433'
  label-outline: '#1F2433'
  ink-parent: '#1F2433'
  ink-parent-muted: '#5B6475'
typography:
  # [ASSUMPTION] Baloo 2 – tròn, đủ dấu tiếng Việt, tự host để chạy offline. Dự phòng: Nunito, system-ui.
  station-label:
    fontFamily: "'Baloo 2', Nunito, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.2'
  parent-note:
    fontFamily: "'Baloo 2', Nunito, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 12px
  md: 24px
  lg: 36px
  full: 9999px
spacing:
  # px = CSS px = pt trên iPad (80 pt ≈ 15 mm)
  '1': 8px
  '2': 16px
  '3': 24px
  '4': 32px
  '5': 48px
  edge-inset: 20px          # cộng thêm env(safe-area-inset-*)
  edge-dead-side: 24px      # dải mép trái/phải: chạm bắt đầu ở đây không nhặt vật trò chơi
  edge-dead-top: 32px       # dải mép trên (Trung tâm thông báo / Control Center)
  edge-dead-bottom: 40px    # dải mép dưới (thanh Home, vuốt đa nhiệm)
  button-top: 40px          # nút Nhà cách mép trên
  speaker-top: 120px        # nút Loa hạ xuống, xa góc Control Center
  target-min: 80px
  target-gap: 24px
  hit-pad: 24px             # vùng chạm vật = hình + 24 mỗi phía
  station-gap: 40px         # khe tối thiểu giữa vùng chạm hai trạm
  snap-radius: 100px        # bán kính hút quanh tâm đích
components:
  button-round:
    size: 88px
    radius: '{rounded.full}'
    highlight: '{colors.counter-top}'
    icon: '{colors.icon-ink}'
    shadow: '0 6px 0 rgba(0,0,0,.18), 0 10px 18px rgba(0,0,0,.2), inset 0 -6px 10px rgba(0,0,0,.12)'
  button-home:
    base: '{components.button-round}'
    background: '{colors.button-home}'
    position: 'top-left: left {spacing.edge-inset}, top {spacing.button-top}'
  button-speaker:
    base: '{components.button-round}'
    background: '{colors.button-speaker}'
    position: 'right {spacing.edge-inset}, top {spacing.speaker-top}'
    wave: '2 vòng {colors.counter-top} 40% lan ra, 1 Hz'
  button-play: { size: 200px, radius: '{rounded.full}', background: '{colors.button-play}' }
  button-replay: { size: 160px, radius: '{rounded.full}', background: '{colors.button-replay}' }
  button-back-to-map: { size: 160px, radius: '{rounded.full}', background: '{colors.button-map}' }
  play-again-overlay: { gap: '{spacing.5}', backdrop: 'rgba(31,36,51,.15)', placement: 'giữa màn, phía trên trạm vừa chơi, ngoài các dải mép' }
  station-hotspot:
    min-size: '{spacing.target-min}'
    gap: '{spacing.station-gap}'
    shape: 'đa giác riêng theo ảnh (hit-map), không nở đều'
    ring: '{components.hint-ring}'
    pulse: 'scale .92→1.08, 1.4s ease-in-out'
  station-label: { typography: '{typography.station-label}', color: '{colors.counter-top}', outline: '2px {colors.label-outline}', opacity: '0.85' }
  hint-ring: { core: '6px {colors.hint-core}', line: '4px {colors.hint-line}', halo: '3px {colors.hint-core} 80%', pulse: 'scale .95→1.05, 1.4s' }
  hint-hand: { size: 72px, shadow: 'drop-shadow(0 6px 6px rgba(0,0,0,.3))' }
  counter-tray: { background: '{colors.counter-pink}', top: '{colors.counter-top}', radius: '{rounded.sm}' }
  draggable-item:
    min-size: 90px
    hit-pad: '{spacing.hit-pad}'
    lift-scale: '1.1'
    lift-shadow: 'drop-shadow(0 14px 8px rgba(0,0,0,.25))'
    return: '0.5s ease-out'
  drop-target: { snap-radius: '{spacing.snap-radius}', snap: '0.2s ease-out, nảy 1.05×' }
  ghost-slot: { fill: '{colors.ghost-fill}', fill-opacity: '0.35', line: '4px dashed {colors.ghost-line}' }
  shadow-target: { fill: '{colors.shadow-target}', ground: '{colors.cave-mouth}', min-size: 120px }
  fish: { hit-pad: 30px, min-size: 100px, speed-max: 60px/s }
  oven: { size: 200px, glow: '{colors.oven-glow}' }
  trace-path:
    width: 100px
    surface: '{colors.road}'
    edge: '6px {colors.road-edge}'
    guide: '{colors.road-dash}'
    tolerance: 80px
  kart: { size: 96px, hit-pad: '{spacing.hit-pad}' }
  character: { min-size: 220px, celebrate: 'nhún 1.0→1.12→1.0, 2 lần, 0.8s' }
  scene-bubble: { base: '{components.button-round}', background: '{colors.counter-top}', active-ring: '{components.hint-ring}' }
  tappable-prop: { hit-pad: '{spacing.hit-pad}', react: 'nảy 1.1×, 0.3s' }
  decoration-item: { min-size: '{spacing.target-min}', sparkle: '{colors.sparkle}' }
  loading-strip: { surface: '{colors.road}', kart: '{components.kart}' }
---

> **Amendment 2026-10-21 (parent decision, spec-bo-do-trang-tri):** island decorations are removed at runtime. No gift is offered, chosen, flown in, placed, shown or stored; decorations saved by older builds are deleted on the next app start (difficulty is kept). Superseded: the decoration parts of Stories 2.2 and 2.3, the reward of Story 4.6 (a gift every ~8 touched props), and Story 5.5 (choose 1 of 2 and place it). Where the body below still describes decorations or gifts, this note wins. Continuous play is a separate follow-up.

## Brand & Style

Bé Học Chơi là một **hòn đảo đồ chơi low-poly**: biển xanh, bãi cát, cỏ tươi, một con đường uốn lượn nối 7 trạm (xe kem, tiệm pizza, đường đua, hồ cá, phố "Chạm là nói", công viên khủng long, cửa hang "Tìm bóng"). Mọi thứ trông như đồ chơi nhựa mềm đặt trên bàn: khối bo tròn, bề mặt mịn (smooth shading), nhân vật chibi đầu to mắt to má hồng, màu pastel tươi, không có kết cấu chi tiết. (Đổi ngày 2026-10-16 từ "khối đa giác rõ mặt, flat shading": cây/hoa Tiny Treats CC0, Shiba và cáo chibi tự dựng – xem `app/tools/render/blender/cute.py`.) Phong cách này **thay cho** "3D mềm như đất sét" trong PRD NFR9 (cả mốc Pixar cũng đã bỏ).

Tài nguyên: mô hình **Kenney** (GLB, CC0 – xe, toà nhà, đường, đồ ăn) và **Quaternius** (FBX, CC0 – khủng long, động vật gồm Shiba và cáo `animals/Fox.fbx`, cá, xe, đồ ăn) trong `play/assets/`; ánh sáng HDRI **Poly Haven meadow_2** (CC0). Cảnh dựng và render trong Blender (`.working/be-hoc-choi-map-v2.blend`), xuất thành **ảnh/sprite render sẵn theo đúng góc camera của màn** (kart trên bản đồ render theo góc chéo, không nhìn thẳng từ trên); chuyển động trong app là 2D (nhún, lắc, co giãn, bay) – theo phụ lục PRD. Khung hình chuẩn: iPad ngang **4:3**.

Lớp giao diện (nút, vòng sáng, bàn tay) đặt chồng lên ảnh và phải trông cùng họ: tròn, bóng, như nút đồ chơi.

→ Bản mẫu đã duyệt: [`mockups/direction-C-lowpoly.html`](mockups/direction-C-lowpoly.html), [`mockups/render-con-duong-v2.png`](mockups/render-con-duong-v2.png) (màn Con đường), [`mockups/render-tiem-kem-v2.png`](mockups/render-tiem-kem-v2.png) (màn Tiệm kem). Các bản cũ trong `.working/` (`directions-1.html`, `direction-C-3d.html`, render v1, `preview-assets.png`) đã bị thay, chỉ để lưu vết. Spine thắng khi có mâu thuẫn với mock (vd nút ⭐ trong mock đã bị bỏ; vòng gợi ý vàng trong render cũ đã đổi sang `{components.hint-ring}`).

## Colors

Màu chia ba lớp; không lớp nào dùng để báo "sai".

- **Cảnh nền** – `{colors.sea}` biển sâu, `{colors.sea-shallow}` mép nước, `{colors.sand}` bãi cát, `{colors.grass}` cỏ, `{colors.road}` mặt đường với vạch `{colors.road-dash}` và lề `{colors.road-edge}`. Màn trò chơi có trời `{colors.sky}`; Tìm bóng dùng nền đá sáng `{colors.cave-mouth}`. Đây là "mặt bàn" – bão hoà vừa phải để đồ vật nổi lên.
- **Đồ vật & nhà** – năm màu pastel `{colors.tint-pink}`, `{colors.tint-sky}`, `{colors.tint-mint}`, `{colors.tint-lilac}`, `{colors.tint-butter}`; xe kem `{colors.truck-pink}`, quầy kem `{colors.counter-pink}` với mặt quầy `{colors.counter-top}`; lò pizza sáng `{colors.oven-glow}` khi nướng.
- **Sinh vật** – khủng long, cá, Shiba, cáo **bắt buộc tô lại** bằng `{colors.creature-green}`, `{colors.creature-blue}`, `{colors.creature-pink}`, `{colors.creature-purple}`, `{colors.creature-orange}` (Shiba, cáo: cam ấm, mặt/bụng trắng). Không giữ màu xám tối/nâu xám gốc.
- **Giao diện** – `{colors.button-home}` (vàng) cho Nhà và Chơi, `{colors.button-speaker}` cho Loa, `{colors.button-replay}` / `{colors.button-map}` cho hai nút cuối lượt [ASSUMPTION – màu chưa chốt]. Gợi ý dùng **riêng** cặp `{colors.hint-core}` + `{colors.hint-line}` (trắng + tím đậm), không trùng màu vàng nào của nút hay vạch đường. `{colors.sparkle}` chỉ cho lấp lánh trang trí. Biểu tượng trên nút: `{colors.icon-ink}`. Chữ bố mẹ: `{colors.ink-parent}` / `{colors.ink-parent-muted}`.

**Tương phản (đã đo, WCAG):** vòng gợi ý ba lớp đảm bảo **ít nhất một lớp ≥ 3:1 với nền sát nó** ở mọi màn: nét `{colors.hint-line}` so với trắng 9.0:1, quầy hồng 6.2:1, cát 6.5:1, trời 5.7:1, cỏ 4.5:1, biển 3.4:1; trên mặt đường (`{colors.road}`, nét tím chỉ 1.5:1) thì lõi/quầng `{colors.hint-core}` đạt 6.1:1. (Vàng cũ `#FFE45C` chỉ đạt 1.1–1.6:1 trên trắng/cát/cỏ – đã bỏ.) `{colors.shadow-target}` trên `{colors.cave-mouth}` 5.0:1, trên cát 5.1:1. `{colors.icon-ink}` trên nút vàng 10.7:1, trên nút xanh 8.6:1. `{colors.ink-parent}` trên nền sáng ≥ 4.5:1. Nhãn trạm trắng có viền `{colors.label-outline}` 2px. Kiểm lại trên ảnh render thật trước khi chốt.

**Màu là nội dung học (Tiệm kem, Câu cá) nên không bao giờ là tín hiệu duy nhất:** mỗi vị kem có hình riêng (dâu: quả dâu nhỏ trên đỉnh, màu hồng sáng; sô-cô-la: hạt chip, nâu tối; vani: tròn trơn, ngà; bạc hà: lá nhỏ, xanh), cá mỗi màu có hoa văn riêng (sọc, chấm, vây to). Các vị/cá khác nhau rõ cả về **độ sáng**. Khay/bệ đặt đồ luôn màu trung tính (`{colors.counter-top}`), không trùng màu vật.

Tránh: đỏ báo lỗi, xám tối, màu neon gắt, gradient cầu vồng trên nền, nền tối/đen đặc.

## Typography

Bé chưa biết đọc → **không có chữ hướng dẫn** (NFR3). Chữ chỉ là nhãn nhỏ cho bố mẹ:

- `{typography.station-label}` – tên trạm nhỏ, mờ, đặt dưới trạm trên màn Con đường.
- `{typography.parent-note}` – mẹo cho bố mẹ (vd bật Guided Access) nếu cần hiển thị.

Font: **Baloo 2** [ASSUMPTION] – nét tròn hợp phong cách đồ chơi, đủ dấu tiếng Việt; tự host trong PWA. Không có cỡ chữ hiển thị lớn, không viết hoa toàn bộ.

## Layout & Spacing

- Khung chuẩn **1024×768 pt (4:3)**, luôn ngang; px = CSS px = pt. Ảnh nền phủ kín (`object-fit: cover`); toạ độ vùng chạm định nghĩa theo **ảnh** rồi ánh xạ qua scale/crop của `cover`. iPad tỉ lệ ~1.43 bị cắt ~5–7% trên/dưới → mọi vật tương tác nằm trong vùng an toàn 4:3 trung tâm trừ phần bị cắt.
- **Dải mép:** `{spacing.edge-dead-side}` trái/phải, `{spacing.edge-dead-top}` trên, `{spacing.edge-dead-bottom}` dưới (cộng safe-area). Không đặt vật kéo, đích thả, cá, đường đua hay nút cảnh trong các dải này.
- Nút cố định: Nhà góc trên trái (`{spacing.edge-inset}` từ trái, `{spacing.button-top}` từ trên). Loa ở mép phải nhưng **hạ xuống** `{spacing.speaker-top}` – xa góc trên phải nơi vuốt xuống mở Control Center. Góc dưới để trống. Vùng ~120×120 quanh mỗi nút không đặt vật trò chơi.
- Mọi vùng chạm ≥ `{spacing.target-min}` và cách nhau ≥ `{spacing.target-gap}` (NFR1). Vùng chạm vật = hình + `{spacing.hit-pad}` mỗi phía; vật kéo hiển thị ≥ 90 pt trong render cuối.
- **Bản đồ:** vùng chạm trạm là đa giác riêng (hit-map), giữa hai trạm luôn có khe ≥ `{spacing.station-gap}`; chỗ giao nhau chia theo đường giữa. Bố cục render cần dời: tách hồ cá khỏi công viên khủng long, hang khỏi khu phố ≥ `{spacing.station-gap}`; vật trang trí và đạo cụ cảnh không nằm trong vùng chạm trạm.
- Màn trò chơi: nhân vật ở giữa-sau, đạo cụ trên quầy/khay ở 1/3 dưới (nhưng trên dải mép dưới), xếp hàng ngang với khoảng cách rộng (Tiệm kem: kem – ốc quế – kem, cách nhau ~180 pt).
- Thang khoảng cách 8 / 16 / 24 / 32 / 48 px.

## Elevation & Depth

Chiều sâu đến từ **render 3D** (ánh sáng HDRI, bóng đổ mềm trên mặt đất), không từ shadow giao diện. Camera nhìn chéo từ trên xuống ở màn Con đường; ngang tầm mắt, sát quầy ở màn trò chơi.

Lớp giao diện có một kiểu nổi duy nhất: nút "đồ chơi" với highlight trắng góc trên trái, bóng đáy đặc 6px và bóng lan mờ (`{components.button-round}`). Vật đang kéo phóng `{components.draggable-item.lift-scale}` và có bóng rơi dưới tay để thấy "nhấc lên". Lớp phủ Hỏi chơi tiếp chỉ làm tối cảnh rất nhẹ (15%) để đảo vẫn thấy rõ.

## Shapes

- Nút: luôn tròn `{rounded.full}`.
- Khay/quầy và khung giao diện (nếu có): `{rounded.sm}`–`{rounded.md}`.
- Hình 3D: low-poly nhưng bo tròn và đổ bóng mịn (smooth shading; cạnh sắc trên 45° vẫn giữ); không dùng modifier subdivision trong file build – độ mịn được nướng sẵn vào lưới.
- Vòng gợi ý: elip/tròn ôm vật, không vuông. Ô mảnh ghép và bóng đích: đúng hình bóng của vật, góc mềm.

## Components

| Component | Hình thức |
|---|---|
| **button-home** | Tròn 88px, nền `{colors.button-home}`, biểu tượng ngôi nhà `{colors.icon-ink}`, highlight + bóng đồ chơi. Mọi màn trò chơi, góc trên trái. Khi chạm: lún 0.9× rồi bật lại. |
| **button-speaker** | Tròn 88px, nền `{colors.button-speaker}`, biểu tượng loa. Ở Con đường, mọi trò và lớp phủ Hỏi chơi tiếp; không có ở Mở đầu. Mép phải, hạ xuống `{spacing.speaker-top}`. Khi đang phát: 2 vòng sóng trắng lan ra chậm (1 Hz), không chớp. |
| **button-play** | Tròn lớn ~200px giữa màn mở đầu, `{colors.button-play}`, biểu tượng ▶; nhún chậm. |
| **play-again-overlay** | Lớp phủ trên bản đồ (không phải màn riêng): cảnh tối nhẹ 15%, hai nút 160px đặt ngang giữa màn, cách nhau `{spacing.5}`, phía trên trạm vừa chơi để thấy món trang trí mới. |
| **button-replay** | Tròn 160px `{colors.button-replay}`; biểu tượng là **nhân vật/trạm của trò vừa chơi** (Shiba, cáo, cá…) to, kèm mũi tên vòng nhỏ ở góc. |
| **button-back-to-map** | Tròn 160px `{colors.button-map}`, biểu tượng hòn đảo nhỏ có kart. |
| **station-hotspot** | Vùng chạm đa giác vô hình quanh trạm. Trạng thái mời: `{components.hint-ring}` quanh trạm + trạm nhún/lắc nhẹ. |
| **station-label** | `{typography.station-label}`, trắng 85%, viền `{colors.label-outline}` 2px. |
| **hint-ring** | Ba lớp: lõi `{colors.hint-core}` 6px, nét `{colors.hint-line}` 4px, quầng trắng 3px; nhịp scale .95↔1.05 (1.4s). Vật bên trong cũng nhún. |
| **hint-hand** | Bàn tay chỉ 72px, bóng đổ; diễn chạm, kéo từ vật tới đích, hoặc vạch một đoạn đường. |
| **counter-tray** | Quầy/khay: thân `{colors.counter-pink}` (Tiệm kem) hoặc pastel theo trạm, mặt trên `{colors.counter-top}`; bệ đặt vật trung tính. |
| **draggable-item** | Vật kéo (kem, topping, mảnh khủng long, con vật/xe ở Tìm bóng): hiển thị ≥ 90px, vùng chạm + 24; khi nhấc phóng 1.1× + bóng rơi. |
| **drop-target** | Đích thả chung: ốc quế (kem chồng lên theo thứ tự đặt), đế bánh pizza (8 chỗ đặt topping đánh dấu mờ), ô mảnh, bóng đích. Vùng hút `{spacing.snap-radius}`; khi hút: nảy 1.05×. |
| **oven** | Lò pizza low-poly 200px bên phải quầy. Nghỉ: cửa đóng, tối. Sẵn sàng: cửa hé, viền `{components.hint-ring}`. Đang nướng: ô kính sáng `{colors.oven-glow}` dịu (không chớp), khói hơi trắng nhỏ. |
| **fish** | Cá Quaternius tô lại, hiển thị ≥ 100px, có hoa văn theo màu (sọc/chấm), hai cỡ khác nhau rõ (to ≈ 1.6× nhỏ). Bơi chậm trong vùng hồ an toàn; khi lặn: chìm mờ dần + bong bóng. |
| **ghost-slot** | Bóng mờ cả con khủng long trên cỏ: `{colors.ghost-fill}` 35% + nét đứt `{colors.ghost-line}`; mỗi mảnh có ô riêng đúng hình. Ô đã đầy: mảnh có màu thật. |
| **shadow-target** | Bóng đích ở Tìm bóng: hình bóng đặc `{colors.shadow-target}` (tím-xám, không đen) trên nền đá sáng, ≥ 120px. Khi đúng: bóng "đổ màu" thành con vật thật. |
| **trace-path** | Đường đua để vạch: rộng 100px, mặt `{colors.road}`, lề `{colors.road-edge}`, vạch giữa `{colors.road-dash}`; điểm đầu có kart, điểm cuối có cổng caro. Đoạn đã đi sáng hơn. |
| **kart** | Xe kart Kenney có **bạn nhỏ** lái – "xe của bé"; render theo góc camera của màn. |
| **scene-bubble** | Ba nút tròn 88px dọc mép phải (dưới nút Loa) ở Chạm là nói, mỗi nút là hình thu nhỏ của cảnh (biển, phố, bếp); cảnh hiện tại có `{components.hint-ring}` mảnh. |
| **tappable-prop** | Đồ vật trong cảnh có phản ứng (Chạm là nói, đạo cụ bản đồ): vùng chạm + 24, nảy 1.1×. |
| **decoration-item** | Đồ trang trí low-poly (bóng bay, cây, cá, cờ…) tại vị trí có sẵn gần trạm; khi xuất hiện có sao nhỏ `{colors.sparkle}` mờ dần (không chớp). Danh mục chưa chốt. |
| **loading-strip** | Dải đường ngắn giữa màn Mở đầu, kart chạy vòng trên đó thay thanh tiến độ. |
| **character** | Xem bảng nhân vật dưới. Mỗi nhân vật cao ≥ 220px trong màn trò, có tư thế chờ (thở, nhìn bé) và tư thế vui. |

**Nhân vật** (tô lại màu tươi, mặt sáng, mắt to rõ):

| Nhân vật | Trò | Hình | Tư thế vui |
|---|---|---|---|
| Shiba | Tiệm kem | Cam ấm, mặt trắng, sau quầy hồng | Vẫy đuôi, liếm kem |
| Cáo | Làm pizza | Quaternius `Fox.fbx`, cam tươi, bụng/mõm trắng | Cầm bánh "măm măm", vẫy đuôi |
| Bạn nhỏ trong kart | Đường đua, bản đồ | Mặt sáng, mắt to, mũ màu tươi (không mũ trắng/mặt tối) | Giơ tay vẫy, bóp còi |
| Cá | Câu cá | Bỏ vệt đỏ quanh miệng | Nhảy khỏi nước, quẫy |
| Khủng long hiền (cổ dài, ba sừng, phiến lưng) | Ghép khủng long | Tô màu sinh vật | Kêu nhỏ vui + **nhún nhảy** – không gầm |
| Khủng long ba sừng (dẫn dắt) | Tìm bóng | `{colors.creature-green}` | Nhún nhảy, gật đầu, kêu nhỏ vui |

## Do's and Don'ts

| Do | Don't |
|---|---|
| Dùng mô hình Kenney/Quaternius CC0, tô lại màu tươi | Giữ màu xám tối gốc của khủng long/cá/Shiba |
| Chỉ khủng long hiền: cổ dài, ba sừng, phiến lưng | T-rex nhe răng, răng nanh, móng vuốt, tiếng gầm |
| Hướng dẫn bằng giọng đọc + vòng sáng + bàn tay | Chữ hướng dẫn, bóng thoại chữ trong app thật |
| Phản hồi sai bằng vật trôi về nhẹ nhàng | Màu đỏ, dấu ✗, rung lắc mạnh, tiếng "sai" |
| Một vòng gợi ý cho một vật tại một thời điểm | Nhiều vật nhấp nháy cùng lúc |
| Màu học kèm hình dạng/hoa văn riêng | Phân biệt vị kem/cá chỉ bằng màu |
| Nút tròn ≥ 88px, kiểu đồ chơi, xa góc hệ thống | Nút nhỏ, phẳng, sát nhau hoặc sát góc trên phải |
| Ánh sáng ban ngày đều (meadow_2), bóng mềm; Tìm bóng ở cửa hang sáng | Cảnh tối, đêm, trong hang tối, bóng đen đặc |
| Ăn mừng bằng nhân vật vui mừng | Pháo giấy, sao điểm, chữ khen |
| Núi lửa trên bản đồ tĩnh (hoặc đổi đỉnh thành cây/tuyết) | Núi lửa phun, khói, rung |

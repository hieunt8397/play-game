---
title: 'Nhà Xoài kiểu nhà búp bê: trong nhà và ngoài sân'
type: 'feature'
created: '2026-11-13'
status: 'approved'
route: 'dispatch'
baseline_commit: 'd47b6c0'
review_loop_iteration: 0
context: ['spec-7-1-tram-nha-xoai-san-nha.md', 'spec-dao-moi-xe-ra-dao.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nhà Xoài's yard is a lawn with unrelated things scattered on it: a bed, a wardrobe and a giant first-aid kit
stand on the grass. The parent finds it cluttered and illogical ("phải sắp xếp lại làm sao cho thật logic"). On
2026-11-13 the parent chose the dollhouse with a yard.

**Approach:** One screen, two clear places a 3-year-old already knows:
- **Inside the house.** On the left is a dollhouse cut open so Xoài sees in.
  - Upstairs is **the bedroom**: the bed (Giờ đi ngủ) and the wardrobe (Thay đồ cho Shiba).
  - Downstairs is **the living room**: a toy drum kit and a little piano on a rug (Ban nhạc).
- **Outside in the yard,** on the right and in front:
  - **the animal pen** by the back fence (Ú òa chuồng thú);
  - **the vegetable garden** with its watering can (Trồng cây);
  - **Shiba's dog house** with a first-aid kit beside it, where Xoài looks after the pets (Bác sĩ thú cưng);
  - **the driveway with a garage**, the family car and a hose (Rửa xe).

Each game sits where it belongs in real life: sleep and dressing in the bedroom, music in the living room, plants and
animals outside, the car on the driveway.

## Boundaries & Constraints

**Always:**
- **The 7 games keep their scenes and gameplay.** Only the yard screen (`bg.home`, `atlas.home`, `home.layout.json`) and
  the corner list change.
- **Tap targets:** each of the 7 is one corner (sprite + hit hull).
  - Each is ≥ 150 px.
  - Each is ≥ `targetGap` from the next.
  - Each is off the Home/Speaker zones.
  - `validateHome` checks them.

  The two bedroom corners and the two living-room corners are the props themselves, not the room, so a tap on a
  wall does nothing. The two upstairs props sit far enough apart to pass the gap rule.
- **Readable at a glance:** the house is cut open with its front wall removed. Its roof, floor and inner walls make the
  two rooms clearly separate. Each prop faces the camera.
- **Labels and names:** the parent-facing labels and voice lines name the thing, not the game:
  - Giường ngủ, Tủ đồ, Ban nhạc, Chuồng thú, Vườn rau, Nhà Shiba, Rửa xe.

  Where a label changes (Sân khấu → Ban nhạc, Vườn → Vườn rau, Phòng khám → Nhà Shiba), its corner-name line is
  re-voiced (ElevenLabs Thắm).
- **Corners still bounce and speak** on a tap, and open their game as today (`yard:open`). The Speaker prompt and the
  yard's invite line are unchanged.
- **Art:** cute-toy style (`cute.py`; Tiny Treats Homely House pieces where they fit: walls, floor, windows, rug, roof).
  Back up every edited file to `_backup/2026-11-13-nha-bup-be/`.

**Never:**
- Changing any game's own scene, art or gameplay.
- A room or prop that is not tappable but looks like a game (no extra toys that look like they open something). The
  rest of the dressing stays clearly part of the background: a lamp, a picture on the wall, a window, a fence, flowers.
- Stairs or doors that suggest Xoài can walk somewhere else.

</frozen-after-approval>

## Code Map

All under `app/`.

**Art:** `tools/render/blender/build_home.py` is rebuilt:
- the dollhouse (cut-open walls, two floors, a roof);
- the rooms' dressing;
- the yard (fence, garden bed, pen, dog house, driveway, garage);
- `CORNER_BOXES` and `CORNER_YAW` for the 7 corners.

Props reuse today's corner models where they fit (bed, wardrobe, pen, garden, car wash). Add new ones for the drum kit
with piano and the dog house with kit.

Run `npm run art:build -- home`, `npm run render -- home` and `npm run atlas -- home`.

**Content:** `src/content/home.ts`: `CORNER_IDS` / `YARD_CORNERS` (7; the corner ids keep their names so the tests and
the save data stay valid); the labels.

**Voice:** `vo.shell.corner-name.stage|garden|clinic` re-voiced (`npm run tts`).

**Rules and tests:** `validateHome` (`tools/layout/rules.ts`), `home.test.ts`, `home-yard.test.ts`, `yard-flow.test.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] Back up.
- [ ] `build_home.py`: the dollhouse and the yard. Show the parent a composite of the screen before wiring.
- [ ] Render, atlas, `validateHome`.
- [ ] `home.ts` labels, re-voiced lines, tests.
- [ ] A browser run: tap each of the 7 corners, play a little, Home back to the yard.

**Acceptance Criteria:**
- Given the yard screen, then Xoài sees a house cut open with a bedroom upstairs (bed, wardrobe) and a living room
  downstairs (drums, piano), and outside a pen, a vegetable garden, Shiba's dog house with a first-aid kit, and a car
  on the driveway.
- Given a tap on any of the 7, then it bounces, says its name and opens its game. Home in the game comes back to this
  screen.
- Given a tap on a wall, the roof or the lawn, then nothing opens.
- Given `npm run check`, then it exits 0.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- A composite for the parent; a browser run at 1024 × 768; the iPad.

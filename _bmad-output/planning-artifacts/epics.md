---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - prds/prd-be-hoc-choi-2026-10-08/prd.md
  - prds/prd-be-hoc-choi-2026-10-08/addendum.md
  - ux-designs/ux-be-hoc-choi-2026-10-08/DESIGN.md
  - ux-designs/ux-be-hoc-choi-2026-10-08/EXPERIENCE.md
  - architecture/architecture-be-hoc-choi-2026-10-08/ARCHITECTURE-SPINE.md
  - prds/prd-be-hoc-choi-2026-10-08/research-hap-dan-tre-3-tuoi.md
---

# Bé Học Chơi - Epic Breakdown

> **Amendment 2026-10-21 (parent decision, spec-bo-do-trang-tri):** island decorations are removed at runtime. No gift is offered, chosen, flown in, placed, shown or stored; decorations saved by older builds are deleted on the next app start (difficulty is kept). Superseded: the decoration parts of Stories 2.2 and 2.3, the reward of Story 4.6 (a gift every ~8 touched props), and Story 5.5 (choose 1 of 2 and place it). Where the body below still describes decorations or gifts, this note wins. Continuous play is a separate follow-up.

> **Amendment 2026-10-21 (parent decision, spec-choi-lien-mach — seamless play):** after a round the character celebrates as before, then the next round starts by itself in the same game (~0.5 s pause and a short fade; next difficulty, new questions). There is no island visit and no "Chơi nữa?" / play-again overlay between rounds (Story 2.4 and the state "Hỏi chơi tiếp" are superseded, with its voice lines). Post-round free play (e.g. the ice-cream tower) is effectively dropped, and the free-play parent invitation with it; the round-start invitation stays. The child returns to the island only with Home: between rounds it pulls back to the island and Map invites again ("Mời chơi"); mid-round it keeps the resume point as before. Where the body below still describes the overlay or post-round free play, this note wins.

## Overview

This document provides the complete epic and story breakdown for Bé Học Chơi, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

> Quy tắc ưu tiên: UX spines (DESIGN.md, EXPERIENCE.md – final) thắng PRD về hành vi; Architecture spine (final) quyết định cách hiện thực. FR giữ ID của PRD; FR được chỉnh có ghi "(điều chỉnh theo UX: …)"; FR mới từ FR24 có ghi "(mới từ UX)". Mọi con số hành vi (thời gian gợi ý, kích thước, LUFS…) đi vào code chỉ qua `Tokens` / `Tokens.Timing`.

## Requirements Inventory

### Functional Requirements

**F1 – Mở đầu, Con đường & điều hướng**

- **FR1**: Màn Mở đầu có một nút "Chơi" (`button-play`) lớn, nhún chậm. Lần chạm đầu tiên mở khoá âm thanh (AudioContext) cho cả phiên, bật nhạc nền nhẹ và sang màn Con đường. Trong lúc tải lần đầu hiện dải đường có kart chạy vòng (`loading-strip`); nút "Chơi" chỉ hiện khi tài nguyên cần thiết đã lưu sẵn. (điều chỉnh theo UX: thêm trạng thái tải bằng kart, không chữ lỗi; tải thất bại → kart chờ và tự thử lại)
- **FR2**: Màn Con đường là một hòn đảo đồ chơi low-poly liền mạch với 7 trạm trong cảnh (xe kem, tiệm pizza, đường đua/cổng caro, hồ cá, phố "Chạm là nói", công viên khủng long, cửa hang "Tìm bóng"). Chạm vùng trạm (hit-map đa giác) → trạm nhún + đọc tên trạm → kart đi tới trạm rồi vào trò. Khi bé ngồi yên ~8s, một trạm có vòng gợi ý + lời mời + đọc tên (tối đa 3 lần, cách ≥ 20s); mỗi 4–6s chỉ một trạm khẽ cử động. Tên trạm hiện dạng chữ nhỏ mờ cho bố mẹ. Đồ trang trí đã nhận hiện trên đảo. (điều chỉnh theo UX: bản đồ đảo thay con đường; không có nút loa riêng từng trạm – đọc tên khi chạm/khi mời, nút Loa chung phát lại lời mời; trạm là đa giác cách nhau ≥ 40px)
- **FR3**: Mọi màn trò chơi có nút "Nhà" (góc trên trái) để về Con đường, không hỏi xác nhận, kèm lời *"Về đảo nào!"*. Nút "Loa" có ở Con đường, mọi trò và lớp phủ Hỏi chơi tiếp, phát lại câu gần nhất của màn (yêu cầu hiện tại / lời mời / câu hỏi), chạm khi đang phát → phát lại từ đầu, không chồng tiếng, không reset gợi ý. (điều chỉnh theo UX: Loa có cả trên bản đồ và lớp phủ, hạ xuống 120px tránh góc Control Center; Nhà không hỏi xác nhận và giữ lượt dở – xem FR27)

**F2 – Tiệm kem (nhân vật: Shiba)**

- **FR4**: Giọng nói yêu cầu một vị kem gọi cả vị lẫn màu ("kem dâu màu hồng", "kem sô-cô-la màu nâu"). Bé kéo viên kem đúng lên ốc quế; thả lên thân Shiba/nửa trên quầy cũng tính là "đưa cho Shiba". Đúng → kem hút vào, Shiba vẫy đuôi, liếm kem + nhạc vui 1–2s. (điều chỉnh theo UX: người bán là chó Shiba thay chú gấu; gọi "vị + màu" thay "màu dâu")
- **FR5**: Độ khó tăng dần: 1 viên chọn trong 2 vị → 2–3 viên. Nhận mọi thứ tự (kem chồng theo thứ tự bé đặt), **trừ bậc khó cao nhất** bắt đúng thứ tự được đọc; sai thứ tự → viên kem trôi về, giọng nhắc lại thứ tự, gợi ý leo thang như thường. (điều chỉnh theo UX: chấp nhận mọi thứ tự trừ bậc cao nhất)
- **FR6**: Kéo sai vị → viên kem nhẹ nhàng trôi về chỗ cũ (~0.5s) và giọng nói nhắc lại yêu cầu ngắn ("Mình tìm kem sô-cô-la màu nâu nhé!"), sau đó gợi ý leo thang (NFR4). Kem không bao giờ hết trên quầy. (điều chỉnh theo UX: Shiba; câu nhắc tránh đồng âm dâu/đâu; gắn với thang gợi ý 4 bậc)

**F3 – Làm pizza (nhân vật: cáo)**

- **FR7**: Giọng nói yêu cầu số lượng topping ("Bé ơi, ba lát xúc xích nào!"). Bé kéo từng lát lên đế bánh (8 chỗ đặt mờ), mỗi lát hút vào một chỗ trống và app đếm to theo từng lát ("Một!… Hai!… Ba!"). Topping khác loại trôi về; lát thừa trôi về + *"Đủ ba lát rồi!"*. Lúc đầu có 2 loại topping. (điều chỉnh theo UX: thêm xử lý topping sai loại/lát thừa)
- **FR8**: Đặt đủ → lò hé cửa có vòng mời + *"Mình nướng bánh nào!"*; lò chỉ nhận chạm khi đã đủ topping. Chạm lò → bánh trượt vào, nướng ~2s (ô kính sáng cam dịu, không chớp), "ting", bánh ra bốc hơi → **cáo** cầm bánh "măm măm", vẫy đuôi. Đủ mà ~6s chưa chạm lò → vòng + bàn tay chạm lò. (điều chỉnh theo UX: nhân vật ăn bánh là cáo)
- **FR9**: Số lượng đếm tăng từ 1–3 lên đến 5.

**F4 – Đường đua (nhân vật: bạn nhỏ trong kart)**

- **FR10**: Bé vạch ngón tay dọc một đường đua có sẵn (`trace-path`) từ kart tới cổng caro; kart chạy theo ngón tay và không bao giờ rời đường (lấy điểm chiếu gần nhất, chỉ tiến không lùi). Tới cổng → bạn nhỏ vẫy tay, còi "bíp" vui. (điều chỉnh theo UX: vạch theo đường dẫn có sẵn, kart có bạn nhỏ lái)
- **FR11**: Hình dạng đường tăng dần: gần thẳng → cong nhẹ → zíc-zắc → vòng tròn; 3–5 đường mỗi lượt.
- **FR12**: Ngón lệch ≤ 80px mỗi bên → kart theo sát; 80–140px → kart vẫn tiến nhưng chậm một nửa; > 140px → kart dừng chờ như nhấc tay. Nhấc tay giữa chừng → kart dừng chờ, khẽ nhấp nháy; đặt ngón lại trong ~100px quanh kart → đi tiếp, không làm lại từ đầu. (điều chỉnh theo UX: dung sai cụ thể 80/140px và bán kính tiếp tục 100px)

**F5 – Câu cá**

- **FR13**: 3–5 cá bơi chậm (≤ 60px/s) trong vùng hồ an toàn, không ra mép. Giọng nói yêu cầu theo màu hoặc kích thước ("Câu con cá màu vàng nào!", "Câu con cá to nào!"). Bé chạm cá đúng để câu lên; cá sai lặn xuống nhẹ, nổi lại sau ~3s; chạm vào nước → gợn "tõm", không tính. Cá mỗi màu có hoa văn riêng, cá to ≈ 1.6× cá nhỏ; luôn ≥ 1 cá đúng và cá đúng không bao giờ rời màn. Độ khó: khác rõ → nhiều cá hơn (3→5). (điều chỉnh theo UX: thêm hành vi cá sai/chạm nước, hoa văn chống mù màu, bù trễ chạm 150ms)
- **FR14**: Mỗi con cá câu lên được kéo lên dây, quẫy và được đọc tên/mô tả ("Cá vàng nhỏ!").

**F6 – Chạm là nói**

- **FR15**: Có 3 cảnh: biển, đường phố, nhà bếp; mỗi cảnh 8–12 đồ vật. Đổi cảnh bằng 3 `scene-bubble` dọc mép phải: chạm → cảnh trượt ngang (~0.6s) + đọc tên cảnh ("Biển!"). (điều chỉnh theo UX: thêm cơ chế đổi cảnh bằng scene-bubble)
- **FR16**: Bé chạm vật nào thì vật đó nảy/cử động hoặc phát tiếng (ô tô bóp còi, cá quẫy) và app đọc tên tiếng Việt của vật.
- **FR17**: Không yêu cầu, không đúng/sai, không gợi ý, không kết lượt; yên ~15s → một vật ngẫu nhiên khẽ lắc (không giọng). Mỗi ~8 vật **khác nhau** được chạm → 1 món trang trí đảo hiện ngay trong cảnh cạnh vật vừa chạm, lấp lánh, rồi bay ra về phía bản đồ; bé vẫn chơi tiếp; lần về bản đồ sau món đó lấp lánh ở trạm phố. Rời trò chỉ bằng nút Nhà. (điều chỉnh theo UX: phần thưởng trang trí đảo sau ~8 lần chạm khác nhau)

**F7 – Ghép khủng long**

- **FR18**: Xếp hình một con khủng long hiền (cổ dài, ba sừng, phiến lưng – không T-rex) từ 3 → 4 → 6 mảnh, có bóng mờ cả con (`ghost-slot`) gợi ý vị trí từng mảnh; mỗi mảnh chỉ khớp ô của nó, không cần xoay, ghép theo thứ tự bất kỳ; mảnh thả sai ô trôi về; 3 con mỗi lượt. (điều chỉnh theo UX: chỉ khủng long hiền, bậc 3→4→6, 3 con/lượt)
- **FR19**: Ghép xong thì khủng long "sống dậy": chớp mắt, nhún nhảy, đi vài bước, **kêu nhỏ vui** và app đọc tên loài ("Khủng long cổ dài!"). (điều chỉnh theo UX: kêu nhỏ vui + nhún nhảy, không gầm)

**F8 – Tìm bóng (nhân vật: khủng long ba sừng)**

- **FR20**: Ở cửa hang sáng, khủng long ba sừng đưa ra một con vật hoặc chiếc xe ("Bạn mèo trốn ở cái bóng nào?"); màn có 2–4 bóng (tím-xám, không đen). Bé kéo vật vào đúng bóng → vật hút vào, bóng đổ màu thành vật thật, ba sừng nhún nhảy + kêu nhỏ vui, đọc tên ("Con mèo!"). Sai → vật trôi về tay ba sừng, nhắc lại. (điều chỉnh theo UX: nhân vật dẫn dắt ba sừng, cửa hang sáng, bóng tím-xám)
- **FR21**: Số bóng tăng dần và các bóng dần giống nhau hơn: 2 bóng khác hẳn → 3 → 4 bóng giống dần.

**F9 – Phần thưởng (trang trí hòn đảo)**

- **FR22**: Xong một lượt trò (3–5 câu) → nhân vật ăn mừng (~1.5s) → camera lùi về cảnh đảo quanh trạm (≤ 1.5s) → một món trang trí low-poly (bóng bay, cây, cá, cờ…) **tự bay** vào vị trí có sẵn gần trạm vừa chơi (~1s), sao nhỏ lấp lánh mờ dần; tổng ≤ 4s trước khi lớp phủ Hỏi chơi tiếp hiện. Bé không cần làm gì; chạm món trang trí → nảy + tiếng vui. Ăn mừng bằng nhân vật + nhạc ngắn, không pháo giấy/sao/lời khen. (điều chỉnh theo UX: sticker THAY bằng trang trí đảo, tự bay vào ô gần trạm)
- **FR23**: Đồ trang trí được lưu trên máy, không mất khi tắt app. Khi các ô của trạm đã đầy → món cũ nhất ở ô đó bay vút lên như bóng bay rồi món mới bay vào cùng chỗ. Đảo trống lần đầu không hiện ô chờ/dấu "còn thiếu". **Không có màn Bộ sưu tập và không có nút ⭐**. (điều chỉnh theo UX: bỏ màn Bộ sưu tập; thay món cũ nhất khi đầy)

**Mới từ UX**

- **FR24**: Kart đi tới trạm – sau khi chạm trạm, kart của bé (có bạn nhỏ lái) chạy dọc đường tới trạm trong tối đa 2s bất kể quãng đường (lần sau trong phiên 1.5s), camera phóng vào rồi vào trò. Đang chạy mà chạm trạm khác → kart đổi hướng (đọc tên trạm mới); chạm kart → "bíp" + tăng tốc. Khi về bản đồ, kart đỗ ở trạm vừa chơi. (mới từ UX)
- **FR25**: Lớp phủ "Hỏi chơi tiếp" – cuối lượt, trên bản đồ hiện 2 nút to: `button-replay` (nhân vật của trò + mũi tên vòng; *"Chơi nữa với bạn Shiba nhé?"*) và `button-back-to-map` (hòn đảo có kart; *"Hay mình đi chỗ khác?"*). Chơi tiếp → camera phóng vào lại (~1.5s), lượt mới cùng trò với độ khó tiếp nối. Về bản đồ → chỉ đóng lớp phủ. Chạm trạm bất kỳ → đóng lớp phủ, kart đi tới trạm đó. Yên ~10s → nhắc một lần + vòng gợi ý luân phiên hai nút; yên ~30s → tự đóng nhẹ, bé ở lại bản đồ. (mới từ UX)
- **FR26**: Nhớ độ khó qua các lần mở app – độ khó từng trò (trừ Chạm là nói) lưu trên máy; sau mỗi lượt: +1 bậc nếu mọi câu đúng ngay lần đầu, −1 bậc nếu có câu bất kỳ chạm gợi ý bậc 4, còn lại giữ nguyên (kẹp trong thang của trò). (mới từ UX)
- **FR27**: Giữ lượt dở trong phiên – bấm Nhà giữa lượt thì trạm đó có vòng nhỏ trên bản đồ; vào lại → tiếp tục đúng câu đang dở (vật đã đặt, số lát, vị trí kart trên đường, cảnh + vật đã chạm ở Chạm là nói). Chỉ giữ trong phiên; tắt app thì mất. (mới từ UX)
- **FR28**: Mở lại âm thanh khi quay lại từ nền – app bị ẩn thì dừng giọng đọc và nhạc; quay lại mà AudioContext bị treo → `button-play` phủ lên màn hiện tại (cảnh tối nhẹ), mọi thứ tạm dừng (kể cả đồng hồ gợi ý); chạm → tiếp tục đúng chỗ, giữ nguyên tiến trình. (mới từ UX)

### NonFunctional Requirements

- **NFR1 – Dễ chạm**: mọi vùng chạm ≥ 80px, cách nhau ≥ 24px; vùng chạm vật = hình + 24px mỗi phía; vật kéo hiển thị ≥ 90px; trạm cách nhau ≥ 40px. Chống chạm vô tình bằng "ngón đầu tiên thắng" (mọi chạm thêm – ngón cái giữ máy, bố mẹ chỉ vào màn – bị bỏ qua, không huỷ chạm đầu) và dải mép chết (24px trái/phải, 32px trên, 40px dưới + safe-area). Lọc lòng bàn tay chỉ khi đo được `Touch.radiusX/Y` trên iPad thật. (điều chỉnh theo UX: thay "bỏ qua lòng bàn tay/nhiều ngón" bằng first-finger-wins + dead-zones cụ thể)
- **NFR2 – Kéo thả "dễ dãi"**: vùng hút 100px quanh tâm đích; thả giữa đường trên quầy → vật nằm lại (tự đẩy nhẹ tránh chồng); thả ngoài quầy → ~1.5s trượt về chỗ cũ; nhấc tay không mất tiến trình. (điều chỉnh theo UX: con số snap radius và hành vi thả giữa đường)
- **NFR3 – Giọng nói trước hết**: không có chữ hướng dẫn; mọi yêu cầu bằng file giọng nữ tiếng Việt tạo sẵn (TTS, người lớn nghe duyệt), nghe lại được bằng nút Loa. Câu ≤ 8 từ, một yêu cầu mỗi câu, từ khoá cuối câu, nghỉ ~300ms trước từ khoá, tốc độ ~0.85×; cấm cặp gần đồng âm trong cùng câu (dâu/đâu, cá/cà, ba/bà, bóng/bông, cam/cầm); nhắc lại tối đa 1 lần/10s; không bao giờ nói "sai"/"không đúng"; không lời khen. Chữ duy nhất: tên trạm nhỏ mờ cho bố mẹ. (điều chỉnh theo UX: thêm quy tắc giọng, nhịp, đồng âm)
- **NFR4 – Không có thua, gợi ý leo thang**: không điểm, không hẹn giờ, không mạng sống, không tiếng/màu "sai". Gợi ý 4 bậc, leo theo thời gian **hoặc** số lần chưa đúng (cái nào tới trước), không hạ bậc trong một câu, reset khi sang câu mới; đồng hồ chỉ chạy sau khi câu yêu cầu nói xong: bậc 1 (lần 1 sai) trôi về + nhắc ngắn; bậc 2 (lần 2 hoặc ~6s) vòng gợi ý quanh vật đúng + vật nhún, nền dừng chuyển động, vòng giữ tới khi đúng; bậc 3 (lần 3 hoặc +~6s) bàn tay diễn động tác, lặp ~15s (giọng ~30s); bậc 4 (lần 4+) vật sai mờ 60% không nhấc được, vùng hút đích ×2 – không bao giờ làm hộ. (điều chỉnh theo UX: thay "~5s nhấp nháy rồi bàn tay" bằng thang 4 bậc)
- **NFR5 – Phản hồi tức thì**: mỗi lần chạm có phản hồi hình ảnh hoặc âm thanh trong ≤ 100ms (hiệu ứng nảy/"pụp" phát ngay kể cả khi kênh giọng đang bận).
- **NFR6 – Chống thoát nhầm**: tắt pinch-zoom, double-tap zoom, kéo xuống tải lại, nhấn giữ/menu ngữ cảnh/"Lưu ảnh", chọn chữ (`touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`, `overscroll-behavior: none`, `draggable="false"`, viewport `user-scalable=no, viewport-fit=cover`). Luôn ngang, toàn màn hình (PWA standalone/fullscreen); iPad dọc → xoay toàn sân khấu 90° bằng CSS, không màn "xoay máy". Guided Access chỉ ghi trong README. (điều chỉnh theo UX: xoay CSS thay khoá hướng; nút Loa hạ xuống tránh Control Center)
- **NFR7 – Chạy offline**: sau lần mở đầu, app chạy hoàn toàn không cần mạng (service worker precache toàn bộ tài nguyên), cài được lên màn hình chính; offline không báo lỗi; nếu iOS xoá dữ liệu PWA thì tải lại khi có mạng và đảo về trống. Bản cập nhật SW chỉ áp dụng ở lần mở lạnh sau, không bao giờ tải lại giữa lúc bé chơi.
- **NFR8 – An toàn**: không quảng cáo, không liên kết ra ngoài, không tài khoản, không gửi dữ liệu; không mạng sau cài đặt (không analytics, không font CDN, không TTS từ xa).
- **NFR9 – Nhìn vui mắt**: phong cách **đồ chơi low-poly** (Kenney + Quaternius CC0, flat shading, màu pastel tươi), ảnh/sprite render sẵn từ Blender (HDRI meadow_2), chuyển động 2D (tween + frame animation) mượt trên iPad; sinh vật tô lại màu tươi, chỉ khủng long hiền. (điều chỉnh theo UX: low-poly toy thay "đất sét"; mốc Pixar đã bỏ)
- **NFR10 – Âm lượng & ducking**: giọng nói ≈ −16 LUFS; nhạc nền nhạc cụ ≤ −30 LUFS và tự hạ thêm ≥ 18 dB khi có giọng (hạ trong 150ms, trả lại 500ms sau khi câu kết thúc); hiệu ứng không to hơn giọng, fade-in ≥ 50ms; tiếng nhân vật cao, ngắn (≤ 0.8s), không dải trầm < 150Hz; không tiếng gầm/to đột ngột; một kênh giọng duy nhất. Audio `.m4a` AAC mono 44.1kHz. (mới từ UX)
- **NFR11 – Chuyển động an toàn**: nhấp nháy ≤ 1Hz; không vùng sáng–tối đảo nhanh > 25% màn; lấp lánh là sao nhỏ mờ dần, không chớp; một chuyển động nổi bật tại một thời điểm; tôn trọng `prefers-reduced-motion` (giảm biên độ, thay zoom camera bằng chuyển mờ); không cảnh tối, núi lửa tĩnh. (mới từ UX)
- **NFR12 – Không chỉ dựa vào màu**: gợi ý dùng vòng ba lớp + chuyển động + bàn tay; vị kem/cá khác nhau cả về hình/hoa văn và độ sáng; giọng gọi cả tên vị/đặc điểm; vòng gợi ý có ít nhất một lớp ≥ 3:1 với nền ở mọi màn; biểu tượng nút ≥ 8.6:1. (mới từ UX)
- **NFR13 – Hiệu năng & ngân sách tài nguyên**: trang atlas ≤ 2048×2048; mọi file ship ≤ 8 MiB (cùng giới hạn precache); tài nguyên trò tải trong lúc kart chạy (≤ 2s) và giải phóng khi rời trò; xong lượt → nút Hỏi chơi tiếp hiện trong ≤ 4s. (mới từ UX/Architecture)
- **NFR14 – Nền tảng đích**: iPadOS ≥ 16.4 Safari, PWA trên màn hình chính, ngang; khung thiết kế 1024×768 (4:3) phủ kín (cover), mọi vật tương tác nằm trong vùng an toàn hiển thị trên mọi tỉ lệ iPad. [ASSUMPTION – xác nhận thiết bị] (mới từ Architecture)

### Additional Requirements

**Starter template (Epic 1 Story 1 – bắt buộc làm đầu tiên)**

- **AR1 – Khởi tạo dự án từ starter**: `npx degit phaserjs/template-vite-ts app` (template 1.4.0) → nâng **Phaser 4.2.1**, **Vite 8.3.3**; gộp `vite/config.dev.mjs` + `config.prod.mjs` thành **một `vite.config.ts`** (không object `manualChunks`, không `terser`, dùng Oxc mặc định); **xoá `log.js` telemetry** và dùng script không log; **TypeScript ~5.9.3** (typescript-eslint 8.71.1, peer `<6.1.0`); Vitest 5.0.3; **Node 24 LTS** (`engines: ">=24 <25"`, `.nvmrc`). `main.ts`: 1024×768, `Scale.ENVELOP` + `CENTER_BOTH`, cấu hình `input.activePointers`. Vite `base: './'`.

**Cấu trúc & quy tắc phụ thuộc**

- **AR2**: Dựng cấu trúc thư mục `app/src/{core,content,scenes,games}`, `app/tools/`, `art/`, `assets/` theo Structural Seed; quy tắc phụ thuộc (scenes→games/core/content; games→core/content, không import game khác hay scenes; core không import scenes/games; content chỉ import type) được ép bằng ESLint `no-restricted-imports` theo thư mục.

**AD-1 – MiniGame contract & shell**

- **AR3**: `MiniGameBase` (Phaser.Scene) + `games/registry.ts`; `GameId` ∈ `ice-cream | pizza | race | fishing | touch-talk | dino-puzzle | shadow-match`, `stationId === GameId`; mỗi game khai báo `ladder` và `assets`.
- **AR4**: Shell scenes `Boot`, `Start`, `Map`, `Hud` (song song; Loa mọi màn, Nhà ở màn trò), `PlayAgainOverlay`, `AudioUnlockOverlay`; chỉ shell gọi `scene.start(gameId, { level, seed, resume? })`; tối đa một MiniGame chạy; Map chỉ start game khi kart tới (chạm khi đang chạy → đổi hướng).
- **AR5**: Guard sự kiện kết thúc: mỗi lần start game phát đúng một `round:complete` (`RoundOutcome = { gameId, questions, firstTryCorrect, maxHintLevel }`, phát SAU khi nhân vật ăn mừng xong) hoặc `round:abandon { gameId, snapshot }` khi `hud:home`; sau đó game trơ (không input, tắt gợi ý, bỏ qua Nhà).
- **AR6**: Chuỗi sau lượt của Map là một chuỗi await: `ProgressStore.setDifficulty` (đồng bộ) → dừng game → camera lùi → bay trang trí từ `pendingFlyIns` → mở `PlayAgainOverlay`; chạm trạm trong chuỗi được xếp hàng (cái cuối thắng) và áp dụng khi kết thúc; Loa vẫn hoạt động; Replay đọc level từ `ProgressStore`.
- **AR7**: `PlayAgainOverlay` không có backdrop tương tác (chạm ngoài 2 nút rơi xuống hotspot trạm, Map đóng overlay qua `overlay:close`); `AudioUnlockOverlay` dùng `scene.pause()`/`resume()` – cơ chế tạm dừng duy nhất.
- **AR8**: `core/difficulty.ts › nextLevel(current, outcome, ladderLength)` là hàm thuần (+1 khi `firstTryCorrect === questions`, −1 khi `maxHintLevel === 4`, ngược lại 0, kẹp trong thang), chỉ Map gọi; có unit test Vitest.
- **AR9**: `touch-talk` không có lượt: không phát `round:complete`, phát `reward:earned { gameId }` mỗi ~8 chạm khác nhau, chỉ rời qua `round:abandon`.
- **AR10**: Chuyển cảnh (kart, zoom vào/ra, mờ khi reduced-motion) thuộc shell qua `core/motion`; game không bao giờ gọi `scene.start/stop/launch`.

**AD-2 – Dữ liệu lưu & trao thưởng**

- **AR11**: `ProgressStore` là nơi duy nhất đọc/ghi lưu trữ: key `bhc.progress`, JSON `{ schemaVersion, seq, difficulty, decorations: DecorationSlot[] }`; ghi đồng bộ mỗi action; đổi schema → tăng `schemaVersion` + migration; `init()` gọi từ `Start` ở lần chạm đầu, là nơi duy nhất gọi `navigator.storage.persist()`; difficulty kẹp khi đọc, thiếu key = 0, không có `touch-talk`.
- **AR12**: `grantDecoration(stationId) → { slot, replaced? }`: chọn ô trống đầu tiên, nếu hết thì ô có `seq` nhỏ nhất của trạm, và món kế tiếp trong danh mục của trạm; `seq` là bộ đếm đơn điệu (không đồng hồ).
- **AR13**: `core/reward-service` (đăng ký lúc boot) là caller duy nhất của `grantDecoration` khi nhận `round:complete`/`reward:earned`; đẩy vào `SessionStore.pendingFlyIns`; trả `reward:granted { gameId, decorationId }` cho touch-talk; Map chỉ diễn hoạt.
- **AR14**: `SessionStore` (chỉ bộ nhớ) giữ `resume`, `pendingFlyIns`, `lastStation`; chỉ Map ghi snapshot (khi `round:abandon`) và xoá (khi `round:complete` của trò đó hoặc start không resume). `Snapshot = { v: 1, level, seed, questionIndex, partial }`, JSON thuần, câu hỏi suy ra tất định từ `seed`.

**AD-3 – AudioDirector**

- **AR15**: `core/audio-director` với API `say(lineId) → token`, `sayChain(ids)` (chỉ cho đếm và đọc tên, liền mạch), `sfx(id)`, `music(id)`, `setPrompt`/`replayPrompt`; cấm `this.sound.*` và đường dẫn file trong scenes/games.
- **AR16**: Bọc cơ chế unlock WebAudio của Phaser (`sound.locked`, `Sound.Events.UNLOCKED`) + re-resume khi `visibilitychange`; còn treo → mở `AudioUnlockOverlay`; dừng giọng + nhạc khi ẩn app; một kênh giọng (quy tắc hàng đợi/bỏ qua), ducking nhạc nền; `speechEnded { token }`.
- **AR17**: Loa trong `Hud`: gọi `hint.replayPrompt()` khi có câu hỏi đang hoạt động, ngược lại `audio.replayPrompt()`.

**AD-4 – InputGuard**

- **AR18**: `core/input` cung cấp primitives `TapTarget`, `DragController`, `TracePath`, `HotspotPolygon`; cấm xử lý `pointerdown/move/up` thô và đọc `clientX/Y` ngoài `core/input` (lint).
- **AR19**: Một pointer gameplay mỗi scene; nút Hud nhận pointer khác chỉ khi bắt đầu ngoài dải mép và không có kéo đang diễn ra; dải mép tính bằng CSS px màn hình + `env(safe-area-inset-*)`.
- **AR20**: `core/input/space.ts › toDesign(pointer)` là chỗ duy nhất đổi toạ độ (tính scale/crop ENVELOP và xoay dọc CSS); spike trên iPad thật trong story shell.
- **AR21**: `InputGuard.setPickable(obj, bool)` và `setSnapScale(target, k)` là cách duy nhất đổi khả năng nhấc/bán kính hút.
- **AR22**: Bảo vệ trang NFR6 trong `index.html` (viewport) và `src/styles/stage.css` (CSS guards + xoay 90° khi dọc).

**AD-5 – HintDirector**

- **AR23**: `core/hint-director` với giao thức `beginQuestion({ promptLineId, retryLineId, step })`, `wrong()`, `stepDone(nextStep, { promptLineId?, retryLineId? })` (giữ bậc, khởi động lại đồng hồ; line tuỳ chọn cho bước nhiều giai đoạn như lò pizza), `questionDone()` (reset bậc), `replayPrompt()` (dừng đồng hồ khi nói, giữ bậc).
- **AR24**: HintDirector tự phát câu yêu cầu, đồng hồ bắt đầu từ `speechEnded` đúng token; là nơi duy nhất phát giọng gợi ý; đồng hồ dùng `time` của scene (không `setTimeout`) nên dừng khi pause; mọi thời lượng từ `Tokens.Timing`.
- **AR25**: Bậc 4 chỉ qua `setPickable(distractor,false)` + `setSnapScale(target,2)`; làm mờ qua `core/hint-visuals`; phát `hint:level { gameId, level }`, game dừng chuyển động nền ở bậc ≥ 2.
- **AR26**: `core/hint-visuals` vẽ vòng/bàn tay, dùng lại cho lịch mời trên Map và nhắc lại ở overlay.

**AD-6 – Nội dung là dữ liệu**

- **AR27**: `content/voice-lines.ts` `{ id, text, keywordPauseMs?, rate?, approved?: { textHash } }`, id `vo.<scope>.<intent>[.<subjectId>][.<n>]`, file `public/assets/audio/vo/<id>.m4a`; một yêu cầu = một file (tổ hợp được liệt kê trong content).
- **AR28**: `content/audio-catalog.ts` cho SFX/nhạc, id `sfx.<scope>.<name>` / `music.<name>`; `content/games/<GameId>.ts`, `stations.ts`, `decorations.ts`, `assets.ts`.
- **AR29**: Validator nội dung: line thiếu file, file thiếu line, `.hash` lệch text, `approved.textHash` lệch, chứa cặp đồng âm cấm → fail.

**AD-7 – Không gian toạ độ**

- **AR30**: Design space 1024×768 (1×), cover; `Tokens.safeRect` = vùng hiển thị trên mọi tỉ lệ iPad hỗ trợ, mọi vật tương tác/đích thả nằm trong đó (validator); nút Hud đặt theo viewport thật + safe-area.

**AD-8 – Tokens**

- **AR31**: `tools/tokens` sinh `core/tokens.generated.ts` từ YAML front matter của DESIGN.md (tách chuỗi tổ hợp thành field có kiểu); check fail khi lệch; `core/timing.ts` chứa mọi thời lượng hành vi trong EXPERIENCE; chỉ dùng qua `Tokens.*` / `Tokens.Timing.*`.
- **AR32**: Lint `src/scenes/**`, `src/games/**`: cấm literal màu hex/`rgba(`; `@typescript-eslint/no-magic-numbers` (ignore `[-1,0,1,2,0.5]`, enums, type index).

**AD-9 – PWA & offline**

- **AR33**: `vite-plugin-pwa` 2.0.0 (Workbox 7.4.1) `generateSW`, `globPatterns: ['**/*.{js,css,html,png,webp,json,m4a,woff2,svg,ico,webmanifest}']`, `maximumFileSizeToCacheInBytes: 8388608`; manifest `display: fullscreen/standalone`, landscape, `start_url`/`scope` tương đối.
- **AR34**: Chính sách cập nhật: `registerType: 'prompt'` không UI, `skipWaiting: false`, `clientsClaim: true`; không gọi `updateSW()`, không reload phiên đang chạy.
- **AR35**: `Boot` chỉ hiện `button-play` sau `navigator.serviceWorker.ready` + precache xong (bỏ qua ở dev không SW) + `document.fonts.load` font tự host (Baloo 2).
- **AR36**: Precache check sau `vite build`: fail nếu file nào dưới `public/assets/` không có trong manifest precache.

**AD-10 – Hợp đồng tài nguyên**

- **AR37**: `tools/render` (Blender CLI qua `BLENDER_BIN`, Blender 5.2.2 LTS): mỗi màn xuất PNG frame + `content/generated/<screenId>.layout.json` (px design 1×) từ object `anchor.<id>`, `hit.<id>`, `slot.<id>`; không nhập toạ độ tay; check fail nếu `stationId`/`slotId` không có polygon/anchor.
- **AR38**: `tools/atlas` (free-tex-packer-core 0.3.9) → `public/assets/atlases/<screenId>.png|json` (Phaser JSON hash), key `atlas.<screenId>`, frame `<object>/<state>/<nn>`; nền riêng `bg.<screenId>`; trang ≤ 2048², file ≤ 8 MiB.
- **AR39**: Tải: `Boot` tải `shared` + `map`; shell tải `assets` của game trước khi start (trong lúc kart chạy) và giải phóng khi shutdown; game không gọi `this.load.*`.
- **AR40**: File `.blend` mỗi màn trong `art/` với camera cố định; nguồn mô hình Kenney (GLB) / Quaternius (FBX) CC0 trong `assets/` (không ship); HDRI Poly Haven meadow_2; danh sách giấy phép trong README.

**AD-11 – Bus**

- **AR41**: `core/bus.ts` với `EventMap` có kiểu (`round:complete`, `round:abandon`, `reward:earned`, `reward:granted`, `hint:level`, `hud:home`, `overlay:close`, …); scene chỉ đăng ký qua `bus.scoped(scene)` (tự huỷ khi SHUTDOWN/DESTROY); chỉ service boot dùng đăng ký toàn cục.

**AD-12 – Cổng kiểm tra**

- **AR42**: `npm run check` = `tsc --noEmit` + ESLint (dependency rule, AD-4, AD-8) + Vitest (`core/`, `content/`) + validator nội dung (voice↔file↔hash, đồng âm, id, polygon trong `safeRect` và ngoài dải mép, kích thước/khe vùng chạm ≥ tokens, độ phủ layout sinh ra) + tokens diff + precache check (sau `vite build`). Mọi story phải qua trước khi done; CI GitHub Actions tuỳ chọn chạy cùng lệnh.

**Pipeline tài nguyên (tools/)**

- **AR43 – TTS**: `npm run content:export` → `voice-lines.json`; `tools/tts` dùng edge-tts 7.2.8 giọng `vi-VN-HoaiMyNeural` (chỉ rate/pitch/volume, không SSML); `keywordPauseMs` = tách `text` ở `|` + ghép khoảng lặng do ffmpeg tạo; ffmpeg `loudnorm` hai lượt; ghi `<id>.hash`; không ghi đè file đã duyệt có `textHash` khớp. Dự phòng: Azure/Google Cloud vi-VN nếu edge-tts hỏng.
- **AR44 – Audio SFX/nhạc**: `tools/audio` chuẩn hoá loudness SFX/nhạc (nguồn CC0, giấy phép trong README), kiểm tra như voice.
- **AR45 – Render/atlas/tokens/lint**: các tool `tools/render`, `tools/atlas`, `tools/tokens`, `tools/lint` (validators + precache check) chạy được bằng npm script.
- **AR46 – Tiền đề công cụ**: Python 3.12+ + `pipx install edge-tts==7.2.8`; ffmpeg trên PATH (`winget install Gyan.FFmpeg`); biến môi trường `BLENDER_BIN` → Blender 5.2.2 (**hiện CHƯA có trên máy này**); `tools/doctor` (tuỳ chọn) kiểm tra cả ba.

**Môi trường & triển khai**

- **AR47 – Dev envelope**: chính = trình duyệt PC `http://localhost` (vite; secure context nên SW/offline chạy) + DevTools giả lập iPad ngang 1024×768 có touch; kiểm tra thiết bị = iPad thật qua **HTTPS preview deploy** ở các mốc (chạm ngón thật, đa chạm/lòng bàn tay, mở khoá âm thanh Safari & công tắc im lặng, cài Home Screen, offline, xoay dọc); không cài chứng chỉ, không mkcert LAN.
- **AR48 – Prod**: host tĩnh HTTPS (GitHub Pages hoặc Cloudflare Pages) [ASSUMPTION], triển khai bằng `npm run check` + `npm run build` + upload; `base: './'` giữ được cả `/<repo>/` lẫn root; không server, không secrets.
- **AR49 – README**: bước tin cậy/cài đặt trên iPad, mẹo Guided Access + tắt "Cử chỉ đa nhiệm" cho bố mẹ, danh sách giấy phép tài nguyên.
- **AR50 – Kiểm thử thủ công**: checklist trên iPad thật cho touch, audio (gồm `navigator.audioSession.type = 'playback'` với công tắc im lặng), xoay dọc, offline, cập nhật SW.
- **AR51 – Lỗi**: không bao giờ hiện lỗi cho bé; thiếu tài nguyên → bỏ qua im lặng + `console.warn`.

### UX Design Requirements

**Tokens & nền tảng hình ảnh**

- **UX-DR1**: Sinh design tokens từ DESIGN.md YAML (màu cảnh, pastel, sinh vật, giao diện, hint-core `#FFFFFF`/hint-line `#5B21B6`, sparkle, shadow-target, ghost; typography `station-label` 18px/600 và `parent-note` 15px/500; rounded sm/md/lg/full; spacing 8/16/24/32/48, edge-inset 20, edge-dead-side 24, edge-dead-top 32, edge-dead-bottom 40, button-top 40, speaker-top 120, target-min 80, target-gap 24, hit-pad 24, station-gap 40, snap-radius 100; mọi component token) thành `Tokens` có kiểu; không literal màu/kích thước trong scenes/games.
- **UX-DR2**: Font Baloo 2 (dự phòng Nunito, system-ui) tự host, đủ dấu tiếng Việt; không cỡ chữ hiển thị lớn, không viết hoa toàn bộ. [ASSUMPTION – cần duyệt]
- **UX-DR3**: Bảng màu không có đỏ báo lỗi, xám tối, neon, gradient cầu vồng nền, nền tối/đen; khay/bệ đặt đồ luôn màu trung tính `counter-top`, không trùng màu vật.
- **UX-DR4**: Tương phản đo được: vòng gợi ý có ít nhất một lớp ≥ 3:1 với nền sát nó ở mọi màn (gồm mặt đường – dùng lõi trắng 6.1:1); `shadow-target` trên `cave-mouth` ≥ 5:1; `icon-ink` trên nút vàng 10.7:1, xanh 8.6:1; chữ bố mẹ ≥ 4.5:1; kiểm lại trên ảnh render thật.
- **UX-DR5**: Sinh vật (khủng long, cá, Shiba, cáo) tô lại bằng màu `creature-*` (Shiba/cáo cam ấm, mặt/bụng trắng); không giữ màu xám/nâu gốc; chỉ khủng long hiền (cổ dài, ba sừng, phiến lưng); cá bỏ vệt đỏ quanh miệng; bạn nhỏ trong kart mặt sáng, mắt to, mũ màu tươi.
- **UX-DR6**: Render 3D sẵn theo đúng góc camera mỗi màn (bản đồ: chéo từ trên xuống; màn trò: ngang tầm mắt sát quầy), low-poly không subdivision, ánh sáng ban ngày đều, bóng mềm; núi lửa trên bản đồ tĩnh.

**Bố cục**

- **UX-DR7**: Khung chuẩn 1024×768 (4:3), ảnh nền cover; toạ độ vùng chạm định nghĩa theo ảnh và ánh xạ qua scale/crop; mọi vật tương tác trong vùng an toàn 4:3 trừ phần bị cắt (~5–7% trên/dưới).
- **UX-DR8**: Dải mép chết 24px trái/phải, 32px trên, 40px dưới (+ safe-area): không đặt vật kéo, đích thả, cá, đường đua, nút cảnh trong đó; vùng ~120×120 quanh mỗi nút cố định không đặt vật trò chơi; góc dưới để trống.
- **UX-DR9**: Bố cục bản đồ: hit-map đa giác riêng mỗi trạm, khe ≥ 40px, chỗ giao chia theo đường giữa; tách hồ cá khỏi công viên khủng long và hang khỏi khu phố; đồ trang trí/đạo cụ không nằm trong vùng chạm trạm.
- **UX-DR10**: Bố cục màn trò: nhân vật giữa-sau (≥ 220px), đạo cụ trên quầy/khay ở 1/3 dưới (trên dải mép dưới), xếp hàng ngang rộng (Tiệm kem: kem – ốc quế – kem cách ~180px).

**Components**

- **UX-DR11 – button-round (cơ sở)**: tròn 88px, highlight trắng góc trên trái, bóng đáy đặc 6px + bóng lan mờ + inset; chạm → lún 0.9× rồi bật lại.
- **UX-DR12 – button-play**: tròn ~200px giữa màn Mở đầu, vàng, biểu tượng ▶, nhún chậm; chạm → nảy + "pụp" (sau chạm), mở khoá AudioContext, bật nhạc nền, sang Con đường hoặc tiếp tục màn dở; dùng lại làm lớp mở khoá âm thanh.
- **UX-DR13 – button-home**: 88px vàng, biểu tượng ngôi nhà, trên trái (left 20, top 40 + safe-area); mọi màn trò; chạm → lún + "pụp" + *"Về đảo nào!"* → về bản đồ, không xác nhận, giữ lượt dở.
- **UX-DR14 – button-speaker**: 88px xanh, biểu tượng loa, mép phải hạ xuống top 120; ở Con đường, mọi trò, lớp phủ (không ở Mở đầu); khi phát: 2 vòng sóng trắng 40% lan ra 1Hz, không chớp; phát lại câu gần nhất, chạm khi đang phát → phát lại từ đầu, không tính "sai", không reset gợi ý.
- **UX-DR15 – station-hotspot**: đa giác vô hình theo ảnh (không nở đều), ≥ 80px, khe 40px; trạng thái mời = hint-ring + trạm nhún/lắc (scale .92→1.08, 1.4s); chạm → trạm nhún + đọc tên (~0.5s) → kart chạy; chạm khi kart chạy → đổi hướng.
- **UX-DR16 – station-label**: chữ Baloo 2 18px trắng 85%, viền `label-outline` 2px, dưới trạm, tĩnh, không chạm được.
- **UX-DR17 – kart (bản đồ)**: kart Kenney 96px + hit-pad 24, bạn nhỏ lái, render theo góc camera; chạy tới trạm trần cứng 2s (lần sau trong phiên 1.5s); chạm kart → "bíp" + tăng tốc; đỗ ở trạm vừa chơi khi về bản đồ.
- **UX-DR18 – hint-ring**: ba lớp lõi trắng 6px + nét tím `#5B21B6` 4px + quầng trắng 3px 80%, elip/tròn ôm vật, nhịp scale .95↔1.05 (1.4s), vật bên trong cũng nhún; chỉ một vòng tại một thời điểm; giữ tới khi đúng, không tắt khi chạm vật khác.
- **UX-DR19 – hint-hand**: bàn tay chỉ 72px có bóng đổ; diễn chạm, kéo từ vật tới đích, hoặc vạch một đoạn đường; lặp ~15s.
- **UX-DR20 – counter-tray**: thân `counter-pink` (Tiệm kem) hoặc pastel theo trạm, mặt `counter-top`, bo `rounded.sm`; chứa vật nguồn, đích ở giữa; vật nguồn tự hiện lại khi đã dùng (không bao giờ hết).
- **UX-DR21 – draggable-item**: hiển thị ≥ 90px, vùng chạm + 24; nhấc → phóng 1.1× + bóng rơi; theo ngón nhưng bị giữ ngoài dải mép và vùng nút; thả trong snap-radius đích đúng → hút; thả ở đích sai → trôi về (~0.5s ease-out); thả trên quầy → nằm lại, tự đẩy nhẹ tránh chồng; thả ngoài quầy → ~1.5s trượt về.
- **UX-DR22 – drop-target**: ốc quế (kem chồng theo thứ tự đặt), đế pizza (8 chỗ đánh dấu mờ), ô mảnh, bóng đích; snap-radius 100px; hút 0.2s ease-out nảy 1.05×; nhận đúng theo mọi thứ tự (trừ bậc cao nhất Tiệm kem); Tiệm kem: thân Shiba/nửa trên quầy cũng tính.
- **UX-DR23 – oven**: lò low-poly 200px bên phải quầy; trạng thái nghỉ (cửa đóng, tối) / sẵn sàng (cửa hé + hint-ring) / đang nướng (ô kính `oven-glow` dịu, không chớp, khói trắng nhỏ); chỉ nhận chạm khi đủ topping; nướng ~2s → "ting" → bánh ra bốc hơi.
- **UX-DR24 – fish**: cá Quaternius tô lại, ≥ 100px, hit-pad 30, hoa văn theo màu (sọc/chấm/vây to), hai cỡ (to ≈ 1.6× nhỏ); 3–5 con bơi ≤ 60px/s trong vùng an toàn; hit-test theo vị trí cả 150ms trước (bù trễ); khi lặn: chìm mờ dần + bong bóng; cá đúng không rời màn.
- **UX-DR25 – ghost-slot**: bóng mờ cả con khủng long trên cỏ, `ghost-fill` 35% + nét đứt trắng 4px; mỗi mảnh một ô đúng hình; ô đã đầy → mảnh hiện màu thật; mỗi mảnh chỉ khớp ô của nó, không xoay.
- **UX-DR26 – shadow-target**: bóng đặc tím-xám `#5B4E96` (không đen) trên nền đá sáng `cave-mouth`, ≥ 120px; một bóng đúng còn lại là bóng mồi; đúng → bóng đổ màu thành vật thật.
- **UX-DR27 – trace-path**: đường rộng 100px, mặt `road`, lề 6px `road-edge`, vạch giữa `road-dash`; điểm đầu có kart, điểm cuối cổng caro; đoạn đã đi sáng hơn; kart không rời đường (chiếu điểm gần nhất, chỉ tiến); dung sai ≤ 80px theo sát, 80–140px tiến nửa tốc độ, > 140px dừng chờ.
- **UX-DR28 – kart (Đường đua)**: bạn nhỏ trong kart; nhấc tay → dừng chờ, khẽ nhấp nháy (≤ 1Hz); đặt ngón trong ~100px quanh kart → đi tiếp.
- **UX-DR29 – scene-bubble**: 3 nút tròn 88px dọc mép phải dưới nút Loa ở Chạm là nói, mỗi nút là hình thu nhỏ cảnh (biển, phố, bếp); cảnh hiện tại có hint-ring mảnh; chạm → cảnh trượt ngang ~0.6s + đọc tên cảnh.
- **UX-DR30 – tappable-prop**: vùng chạm + 24, chạm → nảy 1.1× (0.3s) + tiếng nhỏ ≤ 100ms; ở Chạm là nói đọc tên vật; trên bản đồ (Shiba đi dạo, xe đua, cây…) không mở trò.
- **UX-DR31 – character**: mỗi nhân vật ≥ 220px, tư thế chờ (thở, nhìn bé) và tư thế vui (nhún 1.0→1.12→1.0, 2 lần, 0.8s) + nhạc 1–2s; bảng nhân vật: Shiba (vẫy đuôi, liếm kem), cáo (cầm bánh "măm măm", vẫy đuôi), bạn nhỏ trong kart (giơ tay vẫy, bóp còi), cá (nhảy khỏi nước, quẫy), khủng long hiền (kêu nhỏ vui + nhún nhảy, không gầm), ba sừng dẫn dắt Tìm bóng (`creature-green`, nhún, gật đầu, kêu nhỏ vui, xuất hiện từ từ).
- **UX-DR32 – play-again-overlay**: lớp phủ trên bản đồ (không màn riêng), tối nhẹ 15%, hai nút 160px ngang giữa màn cách 48px, phía trên trạm vừa chơi để thấy món trang trí mới, ngoài dải mép; không backdrop tương tác.
- **UX-DR33 – button-replay**: tròn 160px `button-replay` (xanh lá [ASSUMPTION]), biểu tượng là nhân vật/trạm của trò vừa chơi to + mũi tên vòng nhỏ ở góc; chạm → đóng lớp phủ, zoom vào lại (~1.5s), lượt mới cùng trò, độ khó tiếp nối.
- **UX-DR34 – button-back-to-map**: tròn 160px `button-map`, biểu tượng hòn đảo nhỏ có kart; chạm → chỉ đóng lớp phủ.
- **UX-DR35 – decoration-item**: đồ trang trí low-poly (bóng bay, cây, cá, cờ…) ≥ 80px tại vị trí `slot.<id>` có sẵn gần trạm; xuất hiện có sao nhỏ `sparkle` mờ dần (không chớp); tự bay vào; chạm → nảy + tiếng vui; đầy → món cũ bay vút lên như bóng bay rồi món mới bay vào. Danh mục + số ô mỗi trạm chưa chốt (nội dung).
- **UX-DR36 – loading-strip**: dải đường ngắn giữa màn Mở đầu, kart chạy vòng liên tục thay thanh tiến độ; mất mạng → kart chậm lại đứng chờ, tự thử lại; không chữ lỗi.
- **UX-DR37 – Lớp mở khoá âm thanh**: `button-play` phủ lên màn hiện tại với cảnh tối nhẹ khi AudioContext bị treo; chạm → tiếp tục đúng chỗ.
- **UX-DR38 – Chỉ báo lượt dở**: trạm có lượt dở hiện vòng nhỏ trên bản đồ (chỉ trong phiên).

**Trạng thái**

- **UX-DR39 – Đang tải / tải thất bại**: loading-strip; nút Chơi chỉ hiện khi tài nguyên cần thiết đã lưu; thất bại → kart chờ, tự thử lại.
- **UX-DR40 – Âm thanh bị khoá**: xem UX-DR37; giữ nguyên tiến trình; ứng dụng bị ẩn → dừng giọng + nhạc, quay lại giữ nguyên màn.
- **UX-DR41 – Mời chơi (rảnh) trên bản đồ**: mỗi 4–6s chỉ một trạm khẽ cử động; yên ~8s → một trạm có hint-ring + lời mời + tên trạm; các lần sau cách ≥ 20s, tối đa 3 lần rồi im (chỉ còn nhún).
- **UX-DR42 – Đảo trống / đảo đầy**: lần đầu không hiện ô chờ hay dấu "còn thiếu"; đầy → thay món cũ (UX-DR35).
- **UX-DR43 – Đang chuyển cảnh**: kart chạy + camera zoom; chạm trạm khác → đổi hướng; chạm kart → bíp + tăng tốc; Loa vẫn chạy; chạm khác chỉ nảy nhẹ.
- **UX-DR44 – Chờ yêu cầu**: giọng nói yêu cầu khi vào màn, nhân vật nhìn về phía bé; đồng hồ gợi ý bắt đầu khi câu nói kết thúc.
- **UX-DR45 – Gợi ý bậc 1**: lần 1 chưa đúng → vật trôi về + nhắc lại ngắn.
- **UX-DR46 – Gợi ý bậc 2**: lần 2 hoặc ~6s yên → hint-ring quanh vật đúng + vật nhún; mọi chuyển động nền dừng; vòng giữ tới khi đúng.
- **UX-DR47 – Gợi ý bậc 3**: lần 3 hoặc thêm ~6s → hint-hand diễn động tác, lặp ~15s (giọng ~30s).
- **UX-DR48 – Gợi ý bậc 4**: lần 4+ → vật sai mờ 60% và không nhấc được, vùng hút đích ×2; bé vẫn tự làm. Thang không hạ bậc trong câu, reset khi sang câu; mốc giây cần thử với bé.
- **UX-DR49 – Đúng**: vật hút vào đích, nhân vật vui + nhạc 1–2s, rồi câu tiếp; phản hồi bắt đầu ≤ 100ms.
- **UX-DR50 – Chưa đúng**: theo bảng trò (trôi về / cá lặn); không màu đỏ, không ✗, không rung mạnh, không tiếng sai.
- **UX-DR51 – Bị gián đoạn giữa kéo/vạch**: vật nằm lại/trượt về theo UX-DR21; kart dừng chờ theo UX-DR28; không mất tiến trình.
- **UX-DR52 – Xong lượt**: ăn mừng ~1.5s → camera lùi ≤ 1.5s → trang trí bay vào ~1s → lớp phủ; tổng ≤ 4s.
- **UX-DR53 – Hỏi chơi tiếp**: `button-replay` nhún + *"Chơi nữa với bạn <nhân vật> nhé?"*, rồi `button-back-to-map` nhún + *"Hay mình đi chỗ khác?"*; yên ~10s → nhắc một lần, hint-ring luân phiên hai nút; yên ~30s → tự đóng, Mời chơi tiếp tục; chạm trạm → đóng + kart đi.
- **UX-DR54 – Tự do (Chạm là nói)**: không yêu cầu/gợi ý/kết lượt; yên ~15s → một vật ngẫu nhiên khẽ lắc (không giọng); ~8 vật khác nhau → trang trí hiện cạnh vật vừa chạm, lấp lánh, bay ra khỏi khung về bản đồ.
- **UX-DR55 – Offline**: không báo lỗi; iOS xoá dữ liệu → tải lại khi có mạng, đảo về trống.

**Bảng trò chơi (mỗi dòng là một yêu cầu kiểm thử được; lượt = 3–5 câu)**

- **UX-DR56 – Tiệm kem**: yêu cầu "Cho bạn Shiba… kem dâu màu hồng nào!"; kéo kem lên ốc quế; đúng → hút, Shiba vẫy đuôi/liếm; chưa đúng → trôi về + nhắc; gợi ý: vòng quanh kem đúng, tay kéo kem → ốc quế; độ khó 1 viên/2 vị → 2–3 viên, mọi thứ tự trừ bậc cao nhất; vị kem có hình riêng (dâu: quả dâu, hồng sáng; sô-cô-la: hạt chip, nâu tối; vani: tròn trơn, ngà; bạc hà: lá nhỏ, xanh).
- **UX-DR57 – Làm pizza**: "Bé ơi, ba lát xúc xích nào!"; kéo lát lên đế rồi chạm lò; đếm "Một!… Hai!… Ba!"; đủ → lò hé + vòng + *"Mình nướng bánh nào!"*; topping khác loại trôi về, lát thừa trôi về + *"Đủ ba lát rồi!"*; gợi ý: vòng quanh bát topping đúng, đủ mà ~6s chưa chạm lò → vòng + tay chạm lò; đếm 1–3 → 5, 2 loại topping lúc đầu (bát xúc xích, bát nấm).
- **UX-DR58 – Đường đua**: "Bé lái xe tới cổng nhé!"; vạch dọc trace-path; tới cổng → bạn nhỏ vẫy tay, còi bíp vui; không có "sai"; gợi ý: tay vạch một đoạn trước kart, vạch giữa đường phía trước sáng chạy dần; gần thẳng → cong nhẹ → zíc-zắc → vòng tròn, 3–5 đường/lượt.
- **UX-DR59 – Câu cá**: "Câu con cá màu vàng nào!" / "Câu con cá to nào!"; chạm cá; đúng → kéo lên dây, quẫy, đọc tên ("Cá vàng nhỏ!"); sai → cá lặn nhẹ, nổi lại ~3s; chạm nước → "tõm", không tính; gợi ý: vòng quanh cá đúng + cá đúng bơi chậm lại, tay chạm cá; 3 → 5 cá, luôn ≥ 1 cá đúng.
- **UX-DR60 – Chạm là nói**: không yêu cầu; chạm vật → cử động/kêu + đọc tên; chạm scene-bubble đổi cảnh; không gợi ý (chỉ lắc nhẹ sau ~15s); không kết lượt; mỗi ~8 vật khác nhau → 1 trang trí.
- **UX-DR61 – Ghép khủng long**: "Mình ghép bạn khủng long nào!"; kéo mảnh vào ô bóng mờ; mảnh hút + có màu; đủ → chớp mắt, nhún nhảy, đi vài bước, kêu nhỏ vui, đọc tên loài; mảnh sai ô trôi về; gợi ý: vòng quanh 1 mảnh + ô của nó sáng nét đứt, tay kéo; 3 → 4 → 6 mảnh, 3 con/lượt (cổ dài, ba sừng, phiến lưng).
- **UX-DR62 – Tìm bóng**: ba sừng đưa vật "Bạn mèo trốn ở cái bóng nào?"; kéo vật vào bóng; đúng → hút, bóng đổ màu, ba sừng nhún + kêu nhỏ vui, đọc tên; sai → trôi về tay ba sừng, nhắc lại; gợi ý: vòng quanh bóng đúng, tay kéo; 2 bóng khác hẳn → 3 → 4 bóng giống dần; diễn ra ở cửa hang sáng.

**Nguyên tắc tương tác**

- **UX-DR63 – Ngón đầu tiên thắng**: chạm đầu tiên lên vật/nút sở hữu nó theo `pointerId`; mọi chạm thêm bị bỏ qua, không huỷ chạm đầu; chạm đầu kết thúc → áp dụng "nhấc tay giữa đường"; bố mẹ chạm màn không phá lượt của bé.
- **UX-DR64 – Dải mép chết**: chạm bắt đầu trong dải mép không nhặt vật trò chơi (nút Nhà/Loa ngoài dải vẫn chạm được); vật đang kéo và đường đua không đi vào dải.
- **UX-DR65 – Lọc lòng bàn tay**: chỉ khi đo được `Touch.radiusX/Y` trên iPad thật; nếu không thì dựa vào ngón đầu tiên thắng.
- **UX-DR66 – Một kênh giọng nói**: chạm vật mới khi câu cũ còn < 0.5s → cho xong rồi phát; chạm lại vật đang nói → bỏ qua; hiệu ứng (nảy, "pụp") vẫn phát ngay ≤ 100ms.
- **UX-DR67 – Thao tác cấm**: pinch, xoay, vuốt nhiều ngón, nhấn giữ, double-tap zoom, kéo xuống tải lại, chọn chữ, menu ngữ cảnh/"Lưu ảnh", liên kết ra ngoài.

**Giọng nói & âm thanh**

- **UX-DR68 – Quy tắc lời nói**: giọng nữ nhẹ nhàng ấm áp; gọi "Bé ơi", không tên riêng; câu ≤ 8 từ, một yêu cầu, từ khoá cuối câu, nghỉ ~300ms trước từ khoá, tốc độ ~0.85×; kem gọi cả vị lẫn màu; từ mượn ("sô-cô-la", "pizza") nghe duyệt riêng; nhắc lại tối đa 1 lần/10s; không "sai"/"không đúng"; không lời khen – chỉ đọc tên thứ bé làm ra.
- **UX-DR69 – Cấm cặp đồng âm**: không đặt cặp dâu/đâu, cá/cà, ba/bà, bóng/bông, cam/cầm trong cùng câu (nhất là cạnh từ khoá); không dùng "ở đâu" trong câu có "dâu"; rà toàn bộ kịch bản (validator).
- **UX-DR70 – Loudness & ducking**: giọng ≈ −16 LUFS; nhạc nền ≤ −30 LUFS, hạ thêm ≥ 18dB khi có giọng (150ms xuống, trả lại 500ms sau khi câu kết thúc); SFX không to hơn giọng, fade-in ≥ 50ms; tiếng nhân vật cao, ngắn ≤ 0.8s, không dải < 150Hz; không tiếng gầm.

**Chuyển động, khả năng tiếp cận, nền tảng**

- **UX-DR71 – An toàn quang**: nhấp nháy ≤ 1Hz; không vùng sáng–tối đảo nhanh > 25% màn; lấp lánh mờ dần, không chớp; oven glow không chớp.
- **UX-DR72 – Một chuyển động nổi bật**: tại một thời điểm chỉ một thứ chuyển động nổi bật; có hint-ring thì chuyển động nền dừng.
- **UX-DR73 – Reduced motion**: tôn trọng `prefers-reduced-motion`: giảm biên độ, thay camera zoom bằng chuyển cảnh mờ.
- **UX-DR74 – Hỗ trợ mù màu**: không thông tin nào chỉ truyền bằng màu; kem/cá khác nhau về hình/hoa văn và độ sáng; giọng gọi cả tên vị/đặc điểm ("cá vàng sọc"); bậc gợi ý 4 luôn tới được nên bé không kẹt.
- **UX-DR75 – Không cảnh tối/đáng sợ**: Tìm bóng ở cửa hang sáng, bóng tím-xám; ba sừng xuất hiện từ từ, không bật ra; không T-rex, răng nanh, móng vuốt.
- **UX-DR76 – Xoay dọc bằng CSS**: iPad dọc → xoay toàn bộ sân khấu 90° bằng CSS, vẫn chơi được, không màn "xoay máy"; ánh xạ pointer đúng. [ASSUMPTION – thử trên máy]
- **UX-DR77 – CSS/HTML guards**: `touch-action: none` trên sân khấu, `user-select: none`, `-webkit-touch-callout: none`, `overscroll-behavior: none`, `draggable="false"` cho mọi ảnh/sprite; nút Loa xa góc Control Center.
- **UX-DR78 – Không có**: màn Bộ sưu tập, nút ⭐, menu, cài đặt trong app, tính năng phụ huynh, nghi thức "tạm biệt"/nhắc thời gian, mẹo Guided Access trong app (chỉ README).

### FR Coverage Map

FR1: Epic 1 - Màn Mở đầu, nút Chơi, mở khoá âm thanh, dải tải bằng kart
FR2: Epic 1 - Màn Con đường với 7 trạm (6 trạm "ngủ" tới khi trò được build)
FR3: Epic 1 - Nút Nhà / Loa dùng chung (Hud)
FR4: Epic 1 - Tiệm kem: kéo kem theo vị + màu cho Shiba
FR5: Epic 1 - Tiệm kem: độ khó tăng dần, thứ tự chỉ bắt ở bậc cao nhất
FR6: Epic 1 - Tiệm kem: thả sai → trôi về, nhắc lại
FR7: Epic 3 - Làm pizza: đếm topping theo yêu cầu
FR8: Epic 3 - Làm pizza: lò nướng, cáo ăn bánh
FR9: Epic 3 - Làm pizza: số lượng tăng tới 5
FR10: Epic 4 - Đường đua: vạch đường cho kart chạy
FR11: Epic 4 - Đường đua: hình dạng đường tăng dần
FR12: Epic 4 - Đường đua: dung sai, nhấc tay không mất tiến trình
FR13: Epic 4 - Câu cá: chạm cá theo màu/kích thước
FR14: Epic 4 - Câu cá: đọc tên cá câu được
FR15: Epic 4 - Chạm là nói: 3 cảnh, 8–12 đồ vật
FR16: Epic 4 - Chạm là nói: chạm → đọc tên + cử động/âm thanh
FR17: Epic 4 - Chạm là nói: tự do, thưởng sau ~8 vật
FR18: Epic 3 - Ghép khủng long: 3–6 mảnh, khuôn mờ
FR19: Epic 3 - Ghép khủng long: sống dậy, kêu vui nhỏ, đọc tên loài
FR20: Epic 3 - Tìm bóng: kéo vào đúng bóng
FR21: Epic 3 - Tìm bóng: số bóng tăng, bóng giống nhau hơn
FR22: Epic 2 - Đồ trang trí tự bay lên đảo sau lượt chơi
FR23: Epic 2 - Lưu đồ trang trí, thay món cũ khi đầy
FR24: Epic 1 - Kart chạy tới trạm, đổi hướng, bấm còi
FR25: Epic 2 - Lớp phủ Hỏi chơi tiếp
FR26: Epic 2 - Nhớ độ khó qua các lần mở app
FR27: Epic 2 - Giữ lượt dở trong phiên
FR28: Epic 1 - Lớp mở khoá âm thanh khi quay lại từ nền

## Epic List

### Epic 1: Bé mở app, lái kart trên đảo và chơi Tiệm kem
Bé chạm "Chơi" (mở khoá âm thanh), thấy hòn đảo, lái kart tới xe kem và chơi trọn một lượt Tiệm kem với Shiba – có giọng đọc, gợi ý, ăn mừng – rồi quay về đảo; chạy offline trên iPad. Gồm starter (AR1), các dịch vụ core, pipeline Blender + TTS cho bản đồ và Tiệm kem, PWA, `npm run check`, preview deploy để thử iPad. 6 trạm còn lại hiện trên đảo nhưng "ngủ" (chạm → nảy + kêu vui).
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR24, FR28

### Epic 2: Đảo đẹp dần và app nhớ bé
Chơi xong, đồ trang trí tự bay lên đảo (đầy thì thay món cũ), lớp phủ "Hỏi chơi tiếp" hiện ra; độ khó được nhớ qua các lần mở app; lượt dở được giữ trong phiên.
**FRs covered:** FR22, FR23, FR25, FR26, FR27

### Epic 3: Trò kéo và ghép – Làm pizza, Ghép khủng long, Tìm bóng
Bé làm pizza cho cáo ăn (đếm topping, cho vào lò), ghép khủng long sống dậy, kéo con vật vào đúng bóng cùng khủng long ba sừng. Dùng lại DragController, drop-target và HintDirector từ Epic 1.
**FRs covered:** FR7, FR8, FR9, FR18, FR19, FR20, FR21

### Epic 4: Trò chạm và vạch – Đường đua, Câu cá, Chạm là nói
Bé vạch đường cho kart chạy, chạm câu cá đúng màu/kích thước, và chạm khám phá 3 cảnh để nghe tên đồ vật (chạm đủ ~8 vật được 1 món trang trí).
**FRs covered:** FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17

Phụ thuộc: Epic 1 → Epic 2 → (Epic 3, Epic 4 theo thứ tự bất kỳ). Epic 3/4 dùng hệ thống thưởng của Epic 2 nếu có; thiếu Epic 2 vẫn chơi được.

## Epic 1: Bé mở app, lái kart trên đảo và chơi Tiệm kem

Bé chạm "Chơi" (mở khoá âm thanh), thấy hòn đảo đồ chơi low-poly, lái kart tới xe kem và chơi trọn một lượt Tiệm kem với Shiba – có giọng đọc tiếng Việt, gợi ý leo thang, ăn mừng – rồi quay về đảo; app chạy offline trên iPad. Epic này dựng nền móng cho cả dự án: starter Phaser (AR1), cấu trúc thư mục và quy tắc phụ thuộc, tokens sinh từ DESIGN.md, các dịch vụ core (Bus, AudioDirector, InputGuard, HintDirector, difficulty), pipeline Blender → atlas và TTS → audio, PWA offline, cổng `npm run check` và quy trình preview deploy để thử trên iPad thật. 6 trạm còn lại hiện trên đảo nhưng "ngủ" (chạm → nảy + kêu vui, không vào trò).

### Story 1.1: Khởi tạo app từ starter Phaser

As a phụ huynh (người build app bằng AI),
I want một dự án Phaser 4 chuẩn hoá từ starter với cấu trúc thư mục, tokens, Bus và lệnh `npm run check` dựng sẵn,
So that mọi story sau xây trên cùng một nền, sai quy ước bị bắt tự động và app chạy được ngay trên PC.

**Covers:** NFR6, NFR8, NFR14, AR1, AR2, AR22, AR30, AR31, AR32, AR41, AR42, AR45, AR47, UX-DR1, UX-DR3, UX-DR7, UX-DR67, UX-DR76, UX-DR77

**Acceptance Criteria:**

**Given** máy có Node 24 LTS
**When** dự án được tạo bằng `npx degit phaserjs/template-vite-ts app` (template 1.4.0) rồi nâng cấp
**Then** `package.json` khai báo Phaser 4.2.1, Vite 8.3.3, TypeScript ~5.9.3, typescript-eslint 8.71.1, Vitest 5.0.3, `engines: ">=24 <25"` và có `.nvmrc`
**And** `vite/config.dev.mjs` + `config.prod.mjs` được gộp thành một `vite.config.ts` (`base: './'`, không object `manualChunks`, không `terser`, minify Oxc mặc định)
**And** `log.js` telemetry bị xoá, các script `dev`/`build` không gọi bất kỳ request mạng nào ra ngoài

**Given** app chạy bằng `npm run dev` trên trình duyệt PC `http://localhost`
**When** mở trang ở DevTools giả lập iPad ngang 1024×768 có touch, rồi đổi sang tỉ lệ khác (vd 1180×820, 1366×1024)
**Then** `main.ts` cấu hình khung 1024×768, `Scale.ENVELOP` + `CENTER_BOTH`, `input.activePointers` được đặt, canvas phủ kín màn không viền đen
**And** `Tokens.safeRect` là vùng design-space hiển thị được trên mọi tỉ lệ iPad hỗ trợ (phần cắt ~5–7% trên/dưới nằm ngoài nó)

**Given** `index.html` và `src/styles/stage.css`
**When** bé pinch, double-tap, nhấn giữ lên ảnh, kéo xuống ở đầu trang hoặc cố chọn chữ
**Then** không zoom, không tải lại, không hiện menu ngữ cảnh/"Lưu ảnh", không bôi chọn chữ (viewport `user-scalable=no, viewport-fit=cover`; `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`, `overscroll-behavior: none`, `draggable="false"` cho ảnh)
**And** khi khung nhìn dọc, CSS xoay toàn bộ sân khấu 90° để vẫn hiển thị ngang, không có màn "xoay máy"

**Given** cấu trúc `app/src/{core,content,scenes,games}`, `app/tools/`, `art/`, `assets/` theo Structural Seed
**When** một file trong `core/` import từ `scenes/` hoặc `games/`, một game import game khác hoặc `scenes/`, hoặc `content/` import giá trị (không phải type)
**Then** ESLint `no-restricted-imports` báo lỗi và `npm run check` thất bại
**And** literal màu hex/`rgba(` hoặc số "magic" (ngoài `[-1,0,1,2,0.5]`, enum, type index) trong `src/scenes/**`, `src/games/**` cũng làm check thất bại

**Given** front matter YAML của `ux-designs/.../DESIGN.md`
**When** chạy `tools/tokens`
**Then** sinh `core/tokens.generated.ts` có kiểu (chuỗi tổ hợp như `hint-ring` tách thành field: core 6px `#FFFFFF`, line 4px `#5B21B6`, halo 3px 80%), gồm màu, typography, rounded, spacing (edge-dead-side 24, edge-dead-top 32, edge-dead-bottom 40, target-min 80, target-gap 24, hit-pad 24, station-gap 40, snap-radius 100) và mọi component token
**And** `core/timing.ts` chứa mọi thời lượng hành vi nêu trong EXPERIENCE; cả hai chỉ được dùng qua `Tokens.*` / `Tokens.Timing.*`
**And** nếu DESIGN.md đổi mà file sinh ra chưa sinh lại, bước tokens diff trong `npm run check` thất bại

**Given** `core/bus.ts` với `EventMap` có kiểu (`round:complete`, `round:abandon`, `reward:earned`, `reward:granted`, `hint:level`, `hud:home`, `overlay:close`)
**When** code phát hoặc đăng ký một sự kiện không có trong map, hoặc sai kiểu payload
**Then** `tsc --noEmit` báo lỗi
**And** `bus.scoped(scene)` tự huỷ đăng ký khi scene `SHUTDOWN`/`DESTROY` (có unit test Vitest)

**Given** dự án vừa khởi tạo
**When** chạy `npm run check`
**Then** lệnh chạy lần lượt `tsc --noEmit`, ESLint, Vitest (`core/`, `content/`), tokens diff và stub validator nội dung, và thoát mã 0 khi mọi bước đạt
**And** README ghi lệnh chạy dev trên PC và quy tắc "mọi story phải qua `npm run check` trước khi done"

### Story 1.2: Màn Mở đầu: nút Chơi + mở khoá âm thanh

As a bé 3 tuổi,
I want chạm một nút "Chơi" to là nghe nhạc và vào đảo ngay,
So that con tự bắt đầu chơi được mà không cần đọc chữ hay nhờ người lớn.

**Covers:** FR1, FR28, NFR5, AR4, AR7, AR11, AR16, AR35, AR51, UX-DR2, UX-DR11, UX-DR12, UX-DR36, UX-DR37, UX-DR39, UX-DR40

**Acceptance Criteria:**

**Given** bé mở app lần đầu và tài nguyên `shared` + `map` + font Baloo 2 tự host chưa tải xong
**When** màn `Start` hiện
**Then** chỉ có `loading-strip` (dải đường ngắn, kart chạy vòng liên tục) ở giữa màn, không có chữ, không thanh tiến độ, không có `button-play`
**And** nếu mất mạng giữa chừng, kart chậm lại đứng chờ trên dải đường và tự thử tải lại khi có mạng, không hiện chữ lỗi (lỗi chỉ ghi `console.warn`)

**Given** tài nguyên cần thiết đã tải (bản build có SW: sau `navigator.serviceWorker.ready` + precache xong; dev không SW: bỏ qua bước này) và `document.fonts.load` font Baloo 2 xong
**When** `Boot` hoàn tất
**Then** `button-play` tròn ~200px màu `button-play` (vàng) với biểu tượng ▶ hiện giữa màn, nhún chậm, dùng kiểu `button-round` (highlight trắng góc trên trái, bóng đáy đặc 6px)

**Given** `button-play` đang hiện và AudioContext đang khoá
**When** bé chạm nút lần đầu
**Then** nút lún 0.9× rồi bật lại và phát "pụp" trong ≤ 100ms sau chạm
**And** `AudioDirector` mở khoá âm thanh bằng cơ chế của Phaser (`sound.locked`, `Sound.Events.UNLOCKED`), bật nhạc nền nhẹ cho cả phiên và chuyển sang scene `Map` (được phép là placeholder)
**And** `ProgressStore.init()` (khung tối thiểu) được gọi đúng một lần và là nơi duy nhất gọi `navigator.storage.persist()`; nếu trình duyệt từ chối, app vẫn chạy bình thường

**Given** bé đang ở `Map` (hoặc bất kỳ scene nào) và app bị ẩn (về Home Screen, đổi app)
**When** `visibilitychange` báo ẩn
**Then** giọng đọc và nhạc nền dừng ngay
**And** khi quay lại, `AudioDirector` thử resume AudioContext; nếu resume thành công thì mọi thứ tiếp tục, không overlay

**Given** app quay lại từ nền mà AudioContext vẫn bị treo
**When** `AudioDirector` yêu cầu `AudioUnlockOverlay`
**Then** `button-play` phủ lên màn hiện tại với cảnh tối nhẹ, scene bên dưới bị `scene.pause()` (tween, đồng hồ scene dừng)
**And** khi bé chạm nút, âm thanh mở lại, overlay đóng, scene bên dưới `resume()` đúng chỗ cũ, không reset tiến trình, không quay về `Start`
**And** chạm ở bất kỳ chỗ nào khác ngoài nút khi overlay đang mở không có tác dụng lên scene bên dưới

### Story 1.3: Bé nghe giọng đọc tiếng Việt

As a bé 3 tuổi,
I want nghe một giọng cô ấm áp nói tiếng Việt rõ ràng, chậm,
So that con hiểu app muốn gì mà không cần biết đọc.

**Covers:** NFR3, NFR10, AR15, AR16, AR27, AR28, AR29, AR43, AR44, AR46, UX-DR66, UX-DR68, UX-DR69, UX-DR70

**Acceptance Criteria:**

**Given** `content/voice-lines.ts` khai báo các dòng `{ id, text, keywordPauseMs?, rate?, approved?: { textHash } }` với id theo ngữ pháp `vo.<scope>.<intent>[.<subjectId>][.<n>]` (scope = `shell` hoặc một `GameId`)
**When** chạy `npm run content:export` rồi `tools/tts`
**Then** mỗi dòng sinh `public/assets/audio/vo/<id>.m4a` (AAC mono 44.1kHz) bằng edge-tts 7.2.8 giọng `vi-VN-HoaiMyNeural`, tốc độ ~0.85× (chỉ dùng rate/pitch/volume, không SSML) và file `<id>.hash`
**And** dòng có `keywordPauseMs` được tách `text` ở dấu `|`, ghép các đoạn với khoảng lặng do ffmpeg tạo (~300ms trước từ khoá)
**And** ffmpeg `loudnorm` hai lượt đưa giọng về ≈ −16 LUFS; file đã duyệt (`approved.textHash` khớp) không bị ghi đè khi chạy lại

**Given** validator nội dung trong `npm run check`
**When** có dòng thiếu file, file thiếu dòng, `.hash` lệch `text`, `approved.textHash` lệch `text` hiện tại, id sai ngữ pháp, hoặc một câu chứa cặp đồng âm cấm (dâu/đâu, cá/cà, ba/bà, bóng/bông, cam/cầm; "ở đâu" trong câu có "dâu")
**Then** check thất bại và báo đúng id vi phạm

**Given** `AudioDirector` đã mở khoá
**When** scene gọi `say(lineId)`
**Then** hàm trả về một token và khi câu nói xong phát `speechEnded { token }` đúng token đó
**And** chỉ có một kênh giọng: gọi `say` khi câu cũ còn < 0.5s thì chờ câu cũ xong rồi phát; gọi lại đúng câu đang phát thì bỏ qua; SFX (nảy, "pụp") vẫn phát ngay ≤ 100ms dù kênh giọng đang bận
**And** khi giọng bắt đầu, nhạc nền hạ thêm ≥ 18dB trong 150ms và trả lại 500ms sau khi câu kết thúc (nhạc nền ≤ −30 LUFS, SFX không to hơn giọng, fade-in ≥ 50ms)

**Given** lint ESLint
**When** code trong `scenes/` hoặc `games/` gọi `this.sound.*` hoặc chứa đường dẫn file audio
**Then** `npm run check` thất bại; âm thanh chỉ phát qua `AudioDirector` (`say`, `sayChain`, `sfx`, `music`, `setPrompt`/`replayPrompt`) với id từ `content/voice-lines.ts` và `content/audio-catalog.ts` (`sfx.<scope>.<name>`, `music.<name>`)
**And** `tools/audio` chuẩn hoá loudness cho SFX/nhạc nguồn CC0 và giấy phép được ghi trong README

**Given** bé vừa chạm `button-play` (Story 1.2)
**When** âm thanh mở khoá xong
**Then** câu chào `vo.shell.*` (≤ 8 từ, gọi "Bé ơi", không lời khen) phát một lần sau khi mở khoá, nhạc nền tự hạ khi giọng nói

**Given** người build app trên máy Windows mới
**When** đọc README
**Then** README liệt kê tiền đề: Python 3.12+ + `pipx install edge-tts==7.2.8`, ffmpeg trên PATH (`winget install Gyan.FFmpeg`), và phương án dự phòng (Azure/Google Cloud vi-VN) nếu edge-tts hỏng
**And** nếu thiếu edge-tts hoặc ffmpeg, `tools/tts` dừng với thông báo rõ thiếu công cụ nào, không ghi file dở

### Story 1.4: Pipeline hình: render Blender → atlas + layout bản đồ

As a phụ huynh (người build app bằng AI),
I want một pipeline chạy bằng npm script biến file `.blend` của bản đồ thành ảnh, atlas và `map.layout.json` có toạ độ trạm/ô sinh tự động,
So that hòn đảo đồ chơi low-poly hiện đúng như render, vùng chạm khớp ảnh và không ai phải nhập toạ độ tay.

**Covers:** FR2 (hình đảo + hit-map 7 trạm), NFR1, NFR9, NFR13, AR3, AR37, AR38, AR40, AR45, AR46, UX-DR5, UX-DR6, UX-DR9

**Acceptance Criteria:**

**Given** biến môi trường `BLENDER_BIN` trỏ tới Blender 5.2.2 và file `art/map.blend` (camera cố định chéo từ trên xuống, HDRI meadow_2, mô hình Kenney/Quaternius CC0 tô lại màu tươi `creature-*`, low-poly không subdivision, ánh sáng ban ngày đều, bóng mềm, núi lửa tĩnh)
**When** chạy `tools/render` cho `map` (npm script)
**Then** xuất PNG 2x theo camera của bản đồ và `content/generated/map.layout.json` (design px 1×) chứa anchor `anchor.<id>`, đa giác `hit.<id>` cho đủ 7 trạm và slot `slot.<id>` (placeholder) lấy từ object Blender đặt tên tương ứng – không nhập toạ độ tay
**And** nếu thiếu `BLENDER_BIN` hoặc đường dẫn không chạy được, tool dừng với thông báo rõ thiếu gì, không ghi file dở

**Given** ảnh render của `map`
**When** chạy `tools/atlas` (free-tex-packer-core 0.3.9)
**Then** sinh `public/assets/atlases/map.png|json` (Phaser JSON hash, key `atlas.map`, frame `<object>/<state>/<nn>`) và nền riêng `bg.map`
**And** check thất bại nếu trang atlas > 2048×2048 hoặc file > 8 MiB

**Given** validator layout trong `npm run check`
**When** một `stationId` trong `content/stations.ts` không có polygon/anchor trong layout, `slotId` không có anchor, polygon nằm ngoài `Tokens.safeRect` hoặc trong dải mép chết, vùng chạm < 80px, hai trạm cách nhau < 40px, hoặc hồ cá/công viên khủng long và hang/khu phố không tách đa giác
**Then** `npm run check` thất bại và báo đúng id vi phạm; `stationId === GameId` cho cả 7 id (`ice-cream | pizza | race | fishing | touch-talk | dino-puzzle | shadow-match`)

**Given** người build app trên máy Windows mới
**When** đọc README
**Then** README ghi tiền đề pipeline hình: Blender 5.2.2 cài sẵn và có trên PATH hoặc khai báo qua `BLENDER_BIN` (máy hiện tại CHƯA có Blender), lệnh npm cho `tools/render`/`tools/atlas`, nguồn mô hình `assets/` (không ship) và danh sách giấy phép tài nguyên CC0 (Kenney, Quaternius, HDRI Poly Haven meadow_2)
**And** `tools/doctor` (nếu có) báo thiếu Blender cùng với edge-tts/ffmpeg

### Story 1.5: Màn Con đường: 7 trạm, nhãn, lời mời, trạm ngủ

As a bé 3 tuổi,
I want thấy một hòn đảo đồ chơi đầy màu với các trạm chạm vào là nhún và nói tên,
So that con tò mò khám phá và biết chỗ nào chơi được.

**Covers:** FR2, NFR1, NFR5, NFR11, AR3, AR26, AR39, AR51, UX-DR2, UX-DR15, UX-DR16, UX-DR30, UX-DR41, UX-DR42, UX-DR71, UX-DR72, UX-DR73

**Acceptance Criteria:**

**Given** `atlas.map`, `bg.map` và `map.layout.json` từ Story 1.4, được `Boot` tải cùng gói `shared`
**When** bé vào `Map`
**Then** hòn đảo phủ kín màn với 7 trạm, mỗi trạm có `station-label` Baloo 2 18px trắng 85% viền 2px nhỏ mờ bên dưới, tĩnh, không chạm được
**And** đảo lần đầu không hiện ô chờ hay dấu "còn thiếu" cho đồ trang trí; frame thiếu trong atlas → bỏ qua im lặng + `console.warn`, không hiện lỗi

**Given** bé chạm vào đa giác của trạm `ice-cream` (qua `HotspotPolygon` của `core/input`)
**When** chạm được nhận
**Then** trạm nhún (~0.5s) và có phản hồi ≤ 100ms, giọng đọc tên trạm (`vo.shell.station-name.ice-cream`)
**And** chạm vào 6 trạm chưa build ("ngủ") → trạm nảy + tiếng vui, không điều hướng, không lỗi; chạm vào đồ trang trí/đạo cụ (tappable-prop) → nảy 1.1× + tiếng nhỏ, không mở trò

**Given** bé ngồi yên trên `Map`
**When** đồng hồ scene chạy
**Then** mỗi 4–6s chỉ một trạm khẽ cử động (một chuyển động nổi bật tại một thời điểm)
**And** sau ~8s yên, một trạm có `hint-ring` (vẽ bằng `core/hint-visuals`) + nhún scale .92→1.08 (1.4s) + lời mời + đọc tên; các lần mời sau cách ≥ 20s, tối đa 3 lần rồi chỉ còn nhún; mọi chạm của bé reset đồng hồ yên; mọi thời lượng lấy từ `Tokens.Timing`
**And** khi `prefers-reduced-motion` bật, biên độ nhún/lắc giảm; không có nhấp nháy > 1Hz, lấp lánh chỉ là sao nhỏ mờ dần

### Story 1.6: Nút Nhà và Loa, chống chạm nhầm

As a bé 3 tuổi,
I want nút Loa nghe lại lời cô nói và nút Nhà luôn ở chỗ quen thuộc, còn ngón tay khác vô tình chạm vào màn không làm hỏng trò,
So that con không bị lạc, không bị gián đoạn khi mẹ chỉ vào màn hay ngón cái giữ máy.

**Covers:** FR3, NFR1, NFR5, AR4, AR17, AR18, AR19, AR20, AR30, UX-DR8, UX-DR11, UX-DR13, UX-DR14, UX-DR63, UX-DR64, UX-DR65, UX-DR76, UX-DR78

**Acceptance Criteria:**

**Given** scene `Hud` chạy song song với scene chính
**When** đang ở `Map`
**Then** `button-speaker` 88px xanh, biểu tượng loa, nằm mép phải ở top 120 (hạ xuống tránh góc Control Center), cách mép phải 20 + safe-area
**And** `button-home` 88px vàng, biểu tượng ngôi nhà, ở left 20, top 40 + safe-area chỉ hiện ở màn trò, không hiện ở `Map` và `Start`; không có menu, nút ⭐ hay cài đặt nào khác

**Given** `button-speaker` hiện
**When** bé chạm Loa
**Then** nút lún 0.9× + "pụp" ≤ 100ms, `AudioDirector.replayPrompt()` phát lại câu gần nhất của màn (lời mời/tên trạm trên `Map`); khi phát, 2 vòng sóng trắng 40% lan ra 1Hz, không chớp
**And** chạm Loa khi câu đang phát → phát lại từ đầu, không chồng tiếng; nếu màn chưa có câu nào thì chỉ có hiệu ứng nút

**Given** `InputGuard` trong `core/input`
**When** ngón thứ nhất đang chạm/kéo một vật và một ngón khác (ngón cái giữ máy, tay bố mẹ) chạm màn
**Then** pointer thêm bị bỏ qua hoàn toàn, không huỷ chạm đầu (ngón đầu tiên thắng theo `pointerId`)
**And** nút Hud chỉ nhận pointer khác khi pointer đó bắt đầu ngoài dải mép và không có kéo đang diễn ra

**Given** dải mép chết tính bằng CSS px màn hình (24 trái/phải, 32 trên, 40 dưới) cộng `env(safe-area-inset-*)`
**When** một chạm bắt đầu trong dải mép
**Then** chạm đó không chọn trạm/vật trò chơi nào; nút Nhà/Loa đặt ngoài dải vẫn chạm được
**And** ESLint thất bại nếu code ngoài `core/input` đăng ký `pointerdown/move/up` thô hoặc đọc `clientX/Y`

**Given** `core/input/space.ts › toDesign(pointer)`
**When** unit test Vitest đưa vào toạ độ màn hình ở các tỉ lệ iPad (4:3, 1180×820, 1366×1024) với crop ENVELOP, và trường hợp sân khấu xoay 90° bằng CSS khi dọc
**Then** toạ độ design-space trả về đúng (sai số ≤ 1px), các góc `safeRect` ánh xạ đúng
**And** đây là chỗ duy nhất đổi toạ độ; việc kiểm trên iPad thật được ghi vào checklist thiết bị (Story 1.11)

**Given** nút Nhà được tham chiếu ở `Map` (vd do code gọi nhầm `hud:home` khi không có trò)
**When** `hud:home` phát ra mà không có MiniGame đang chạy
**Then** không có gì xảy ra (không reload, không đổi scene, không lỗi)

### Story 1.7: Kart chạy tới trạm (FR24)

As a bé 3 tuổi,
I want chạm một trạm là thấy chiếc kart của con chạy tới đó rồi vào trò,
So that con cảm thấy mình đang "đi" trên đảo và chờ vào trò không thấy lâu.

**Covers:** FR2, FR24, NFR5, NFR11, NFR13, AR3, AR4, AR10, AR14, AR39, UX-DR15, UX-DR17, UX-DR43, UX-DR72, UX-DR73

**Acceptance Criteria:**

**Given** bé ở `Map`, kart 96px (vùng chạm + 24) có bạn nhỏ lái đỗ ở điểm xuất phát và trạm `ice-cream` đang thức
**When** bé chạm `ice-cream`
**Then** trạm nhún + đọc tên (~0.5s), kart chạy dọc đường lấy từ `map.layout.json` tới anchor của trạm trong tối đa 2s bất kể quãng đường; các lần sau trong cùng phiên tối đa 1.5s
**And** trong lúc kart chạy, shell tải `assets` của game (khai báo trong `games/registry.ts`) để game sẵn sàng khi kart tới

**Given** kart đang chạy tới một trạm
**When** bé chạm một trạm đang thức khác
**Then** kart đổi hướng tới trạm mới và đọc tên trạm mới; thời gian còn lại vẫn tuân trần 2s/1.5s tính từ lần đổi hướng
**And** chạm vào kart → "bíp" + kart tăng tốc; Loa vẫn chạy; chạm chỗ khác chỉ nảy nhẹ, không làm gì

**Given** bé chạm một trạm "ngủ" (chưa build)
**When** kart đang đỗ hoặc đang chạy
**Then** trạm chỉ nảy + tiếng vui, kart không đổi hướng và không chạy tới trạm đó

**Given** kart tới trạm `ice-cream`
**When** tài nguyên game đã tải
**Then** shell (qua `core/motion`) phóng camera vào trạm rồi gọi `scene.start('ice-cream', { level, seed })`; tối đa một MiniGame chạy; game không bao giờ gọi `scene.start/stop/launch`
**And** khi `prefers-reduced-motion` bật, zoom camera được thay bằng chuyển mờ
**And** `MiniGameBase` + `games/registry.ts` tồn tại; ở story này `ice-cream` được phép là scene khung tối thiểu (màn trống có nút Nhà)

**Given** bé đang ở màn trò và quay về `Map` (qua nút Nhà)
**When** `Map` hiện lại
**Then** kart đỗ ở trạm vừa chơi (`SessionStore.lastStation`), chỉ trong phiên; mở lại app thì kart về điểm xuất phát

### Story 1.8: Tiệm kem: kéo kem đúng vị cho Shiba (FR4, FR6)

As a bé 3 tuổi,
I want nghe Shiba gọi một vị kem rồi kéo đúng viên kem lên ốc quế,
So that con học tên vị và màu qua việc "bán kem" cho bạn chó.

**Covers:** FR3, FR4, FR6, NFR1, NFR2, NFR5, NFR9, NFR12, AR3, AR5, AR15, AR18, AR21, AR23 (stub `hint.wrong()`), AR37, AR38, UX-DR5, UX-DR6, UX-DR10, UX-DR13, UX-DR20, UX-DR21, UX-DR22, UX-DR31, UX-DR44, UX-DR49, UX-DR50, UX-DR51, UX-DR56, UX-DR74

**Acceptance Criteria:**

**Given** `.blend` Tiệm kem (camera ngang tầm mắt sát quầy, Shiba tô `creature-orange` mặt/bụng trắng sau quầy `counter-pink` mặt `counter-top`)
**When** chạy `tools/render` + `tools/atlas` cho `ice-cream`
**Then** sinh atlas `atlas.ice-cream`, nền `bg.ice-cream` và `ice-cream.layout.json` với anchor ốc quế, các ô kem trên quầy, vùng thân Shiba; check thất bại nếu thiếu anchor được content dùng
**And** bố cục: Shiba giữa-sau ≥ 220px, kem – ốc quế – kem xếp ngang cách ~180px ở 1/3 dưới, trên dải mép dưới

**Given** bé vào Tiệm kem
**When** màn hiện
**Then** Shiba ở tư thế chờ (thở, nhìn bé) và giọng đọc một câu "vị + màu" (vd "Cho bạn Shiba… kem dâu màu hồng nào!") – ≤ 8 từ, từ khoá cuối câu
**And** mỗi vị có hình riêng ngoài màu (dâu: quả dâu nhỏ, hồng sáng; sô-cô-la: hạt chip, nâu tối; vani: tròn trơn, ngà; bạc hà: lá nhỏ, xanh) và khác rõ độ sáng

**Given** bé nhấc một viên kem bằng ngón đầu tiên (`DragController`)
**When** kéo
**Then** viên kem (≥ 90px, vùng chạm + 24) phóng 1.1× + bóng rơi ≤ 100ms và theo ngón nhưng bị giữ ngoài dải mép và vùng nút Hud
**And** thả trong 100px quanh ốc quế, hoặc trên thân Shiba/nửa trên quầy, với vị đúng → kem hút vào ốc quế 0.2s ease-out nảy 1.05×, Shiba vẫy đuôi + liếm kem (nhún 1.0→1.12→1.0) + nhạc vui 1–2s

**Given** bé thả viên kem sai vị lên ốc quế/Shiba
**When** thả
**Then** viên kem nhẹ nhàng trôi về chỗ cũ (~0.5s ease-out) và game gọi `hint.wrong()`; giọng nhắc lại yêu cầu ngắn (vd "Mình tìm kem sô-cô-la màu nâu nhé!", `vo.ice-cream.retry.<flavorId>`) do HintDirector phát qua `AudioDirector.say` – game không tự phát câu nhắc; không màu đỏ, không ✗, không rung, không tiếng sai, không chữ "sai"
**And** kem trên quầy không bao giờ hết (vật nguồn tự hiện lại khi đã dùng)

**Given** `core/hint-director` ở dạng stub tối thiểu trong story này: `beginQuestion({ promptLineId, retryLineId, step })` phát câu yêu cầu qua `AudioDirector.say` và ghi nhớ `retryLineId`; `wrong()` phát `retryLineId` qua `AudioDirector.say`; `stepDone`, `questionDone`, `replayPrompt` là no-op hợp lệ (giữ đúng chữ ký AD-5)
**When** Tiệm kem chạy một câu
**Then** game chỉ giao tiếp với gợi ý/lời nhắc qua API `hint.*` này (không gọi `audio.say` cho câu yêu cầu hay câu nhắc), nên Story 1.9 thay stub bằng HintDirector đầy đủ mà không phải sửa code Tiệm kem
**And** Vitest cho stub: `wrong()` phát đúng `retryLineId` của câu hiện tại; `wrong()` khi chưa có câu nào là no-op

**Given** bé nhấc tay giữa đường
**When** thả trên quầy (không phải đích)
**Then** viên kem nằm lại, tự đẩy nhẹ để không chồng viên khác; thả ngoài quầy → sau ~1.5s trượt về chỗ cũ; không mất tiến trình

**Given** bé đang chơi một câu Tiệm kem
**When** bé chạm `button-home`
**Then** nút lún + "pụp" + *"Về đảo nào!"*, không hỏi xác nhận; game phát đúng một `round:abandon { gameId, snapshot }`, sau đó trơ (không nhận input, bỏ qua Nhà lần nữa); shell về `Map`, kart đỗ ở xe kem, không có phần thưởng
**And** ở story này chưa có gợi ý leo thang (stub `hint.*` không có đồng hồ, vòng hay bàn tay): chỉ có hành vi trôi về + câu nhắc qua `hint.wrong()` ở trên; một câu chơi trọn vẹn từ đầu tới đúng là được

### Story 1.9: Gợi ý leo thang (NFR4)

As a bé 3 tuổi,
I want khi con lúng túng thì app chỉ dần dần – vòng sáng, bàn tay – mà không bao giờ làm hộ,
So that con không bao giờ bị kẹt và vẫn tự làm được.

**Covers:** NFR4, NFR11, NFR12, AR17, AR21, AR23, AR24, AR25, AR26, UX-DR4, UX-DR18, UX-DR19, UX-DR44, UX-DR45, UX-DR46, UX-DR47, UX-DR48, UX-DR72, UX-DR74

**Acceptance Criteria:**

**Given** `core/hint-director` đầy đủ thay stub của Story 1.8, với giao thức `beginQuestion({ promptLineId, retryLineId, step })`, `wrong()`, `stepDone(nextStep, { promptLineId?, retryLineId? })`, `questionDone()`, `replayPrompt()`
**When** Tiệm kem gọi `beginQuestion` (code Tiệm kem không phải sửa)
**Then** HintDirector tự phát câu yêu cầu và chỉ bắt đầu đồng hồ khi nhận `speechEnded` đúng token của câu đó; đồng hồ dùng `time` của scene (không `setTimeout`), mọi thời lượng lấy từ `Tokens.Timing`
**And** HintDirector là nơi duy nhất phát giọng gợi ý; game không tự phát câu nhắc lại

**Given** một câu đang hoạt động
**When** bé chưa đúng hoặc ngồi yên
**Then** bậc leo theo thời gian **hoặc** số lần chưa đúng, cái nào tới trước: bậc 1 (lần 1 chưa đúng) trôi về + nhắc ngắn; bậc 2 (lần 2 hoặc ~6s yên) `hint-ring` quanh kem đúng + kem nhún; bậc 3 (lần 3 hoặc thêm ~6s) `hint-hand` 72px diễn kéo kem → ốc quế, lặp ~15s, giọng lặp ~30s; bậc 4 (lần 4+) kem sai mờ 60% không nhấc được và vùng hút ốc quế ×2
**And** không bao giờ hạ bậc trong một câu, `questionDone()` reset về 0 khi sang câu mới; nhắc lại bằng giọng tối đa 1 lần/10s

**Given** `hint-ring` đang hiện
**When** bé chạm/kéo vật khác
**Then** vòng vẫn giữ tới khi đúng; chỉ một vòng tại một thời điểm; vòng gồm lõi trắng 6px + nét tím `#5B21B6` 4px + quầng trắng 3px 80%, nhịp .95↔1.05 (1.4s) và có ít nhất một lớp ≥ 3:1 với nền sát nó (kiểm trên ảnh render thật)
**And** `hint:level { gameId, level }` phát trên Bus; ở bậc ≥ 2 game dừng chuyển động nền

**Given** bậc 4
**When** HintDirector áp dụng
**Then** chỉ dùng `InputGuard.setPickable(distractor, false)` + `InputGuard.setSnapScale(target, 2)` và làm mờ qua `core/hint-visuals`; bé vẫn phải tự kéo, app không làm hộ

**Given** bé chạm Loa khi có câu hỏi đang hoạt động
**When** `Hud` gọi `hint.replayPrompt()`
**Then** câu yêu cầu phát lại từ đầu, đồng hồ dừng trong lúc nói rồi chạy lại từ `speechEnded`, bậc gợi ý giữ nguyên, không tính là "chưa đúng"

**Given** app bị ẩn hoặc `AudioUnlockOverlay` pause scene
**When** thời gian trôi
**Then** đồng hồ gợi ý không chạy; khi resume, gợi ý tiếp tục từ thời điểm đã dừng

**Given** unit test Vitest với đồng hồ giả
**When** mô phỏng chuỗi lỗi/thời gian (vd 1 lỗi rồi 6s, 4 lỗi liên tiếp, Loa ở bậc 3, `stepDone` giữa câu, `speechEnded` của token khác)
**Then** bậc và các lần lặp tay/giọng đúng như bảng trên, `speechEnded` của token khác không khởi động đồng hồ

**Given** unit test Vitest cho `stepDone(nextStep, { promptLineId?, retryLineId? })`
**When** gọi `stepDone(nextStep)` không có tuỳ chọn, rồi `stepDone(nextStep, { retryLineId: 'X' })`, rồi `stepDone(nextStep, { promptLineId: 'P' })`
**Then** không tuỳ chọn → giữ nguyên prompt/retry của câu; có `retryLineId` → `wrong()` sau đó phát `X`; có `promptLineId` → `P` được phát, trở thành câu `replayPrompt()`/Loa phát lại và đồng hồ chỉ chạy lại từ `speechEnded` của `P`
**And** trong mọi trường hợp bậc gợi ý giữ nguyên và đồng hồ khởi động lại; `questionDone()` xoá các line ghi đè theo bước

### Story 1.10: Tiệm kem: lượt 3–5 câu và độ khó tăng dần (FR5)

As a bé 3 tuổi,
I want chơi một lượt vài câu kem, dễ trước rồi khó dần, xong thì về đảo,
So that con vừa sức, thấy mình giỏi lên và có một lượt chơi trọn vẹn.

**Covers:** FR5, FR6, AR5, AR8, AR14, AR41, UX-DR22, UX-DR31, UX-DR49, UX-DR52, UX-DR56

**Acceptance Criteria:**

**Given** `content/games/ice-cream.ts` khai báo `ladder: Level[]` (dữ liệu thuần)
**When** đọc thang
**Then** bậc thấp nhất là 1 viên chọn trong 2 vị, các bậc sau tăng số vị trên quầy và số viên tới 2–3 viên; mỗi lượt 3–5 câu, câu hỏi suy ra tất định từ `seed`
**And** mọi câu yêu cầu là một voice line đã liệt kê trong `content/voice-lines.ts` (tổ hợp được liệt kê, không ghép runtime)

**Given** câu yêu cầu 2–3 viên ở bậc không phải cao nhất
**When** bé đặt các viên đúng theo thứ tự bất kỳ
**Then** kem chồng lên ốc quế theo thứ tự bé đặt và câu được tính đúng khi đủ viên; HintDirector nhận `stepDone` sau mỗi viên đúng (giữ bậc, khởi động lại đồng hồ)

**Given** bậc cao nhất của thang
**When** bé đặt một viên đúng vị nhưng sai thứ tự được đọc
**Then** viên đó trôi về, giọng nhắc lại thứ tự, gợi ý leo thang như thường (tính là một lần chưa đúng)

**Given** câu cuối của lượt được trả lời đúng
**When** Shiba ăn mừng xong (~1.5s)
**Then** game phát đúng một `round:complete` với `RoundOutcome = { gameId, questions, firstTryCorrect, maxHintLevel }` rồi trơ (không input, tắt gợi ý, bỏ qua Nhà)
**And** `Map` nhận sự kiện, dừng game, chuyển về đảo với kart đỗ ở xe kem; chưa có trang trí hay lớp phủ Hỏi chơi tiếp (Epic 2)

**Given** `core/difficulty.ts › nextLevel(current, outcome, ladderLength)` là hàm thuần, chỉ `Map` gọi
**When** unit test Vitest chạy
**Then** +1 khi `firstTryCorrect === questions`, −1 khi `maxHintLevel === 4`, ngược lại 0, luôn kẹp trong `[0, ladderLength − 1]` (gồm trường hợp ở bậc 0 bị −1 và ở bậc cuối được +1)
**And** ở story này level chỉ giữ trong bộ nhớ phiên: vào lại Tiệm kem trong cùng phiên dùng level mới, mở lại app thì về bậc 0 (lưu bền ở Epic 2)

### Story 1.11: Chạy offline và thử trên iPad (NFR7)

As a phụ huynh,
I want cài app lên màn hình chính iPad và cho con chơi cả khi không có mạng,
So that con chơi được mọi lúc mà không bị lỗi hay quảng cáo, và tôi biết app chạy đúng trên máy thật.

**Covers:** NFR6, NFR7, NFR8, NFR13, NFR14, AR33, AR34, AR35, AR36, AR42, AR47, AR48, AR49, AR50, UX-DR55, UX-DR65, UX-DR76

**Acceptance Criteria:**

**Given** `vite-plugin-pwa` 2.0.0 (Workbox 7.4.1) chế độ `generateSW`
**When** chạy `npm run build`
**Then** cấu hình có `globPatterns: ['**/*.{js,css,html,png,webp,json,m4a,woff2,svg,ico,webmanifest}']` và `maximumFileSizeToCacheInBytes: 8388608`
**And** manifest có name, icons, `display` fullscreen/standalone, hướng ngang, `start_url`/`scope` tương đối; `base: './'` chạy được cả dưới `/<repo>/` lẫn root

**Given** bản build
**When** precache check chạy (trong `npm run check`, sau `vite build`)
**Then** check thất bại nếu bất kỳ file nào dưới `public/assets/` không có trong manifest precache hoặc file nào > 8 MiB

**Given** app đã được mở một lần khi có mạng
**When** mở lại khi bật chế độ máy bay
**Then** app chạy đầy đủ (Start, Map, Tiệm kem, giọng, nhạc) không báo lỗi và không có request mạng nào (không analytics, không font CDN, không TTS từ xa)

**Given** có bản build mới được deploy trong lúc bé đang chơi
**When** SW mới tải xong
**Then** SW mới chờ (`registerType: 'prompt'` không UI, `skipWaiting: false`, `clientsClaim: true`), app không gọi `updateSW()` và không bao giờ reload giữa phiên; bản mới chỉ áp dụng ở lần mở lạnh sau

**Given** README
**When** phụ huynh đọc
**Then** có quy trình HTTPS preview deploy (`npm run check` + `npm run build` + upload lên host tĩnh – GitHub Pages hoặc Cloudflare Pages, còn chờ chốt), các bước cài Home Screen trên iPad, mẹo Guided Access + tắt "Cử chỉ đa nhiệm" (chỉ trong README, không trong app)

**Given** checklist thử thủ công trên iPad thật (iPadOS ≥ 16.4) qua bản preview HTTPS
**When** chạy checklist
**Then** checklist gồm và ghi kết quả cho: chạm bằng ngón thật; lòng bàn tay/đa chạm (ghi lại có đo được `Touch.radiusX/Y` không); mở khoá âm thanh Safari và công tắc im lặng (`navigator.audioSession.type = 'playback'`); quay lại từ nền; cài Home Screen; offline chế độ máy bay; xoay dọc (CSS xoay 90°, `toDesign` đúng); cập nhật SW ở lần mở lạnh sau
**And** mọi mục không đạt được ghi lại thành việc cần sửa trước khi đóng epic

## Epic 2: Đảo đẹp dần và app nhớ bé

Chơi xong một lượt, bé thấy nhân vật ăn mừng, camera lùi về hòn đảo và một món trang trí low-poly tự bay vào chỗ có sẵn gần trạm vừa chơi (đầy chỗ thì món cũ nhất bay vút lên như bóng bay, món mới vào thay); các món đã nhận được lưu trên máy và vẫn còn khi mở lại app. Lớp phủ "Hỏi chơi tiếp" mời bé chơi nữa hoặc đi chỗ khác, tự nhắc khi bé ngồi yên và tự đóng nhẹ. Độ khó từng trò được nhớ qua các lần mở app; bấm Nhà giữa lượt thì trạm đó giữ lượt dở trong phiên và vào lại tiếp tục đúng câu đang dở. Epic này dựng `ProgressStore` bền vững (schemaVersion + migration), danh mục và ô trang trí, `reward-service` (kể cả đường `reward:earned` cho Chạm là nói ở Epic 4), chuỗi sau lượt của Map, `PlayAgainOverlay` và `SessionStore` snapshot – tất cả dùng được ngay cho Tiệm kem và sẵn sàng cho các trò ở Epic 3/4 mà không phải sửa lại.

### Story 2.1: ProgressStore lưu bền vững và nhớ độ khó qua các lần mở app

As a bé (và bố mẹ đứng cạnh),
I want độ khó từng trò được app nhớ lại sau khi tắt và mở lại app,
So that lần sau bé chơi tiếp đúng mức vừa sức, không phải bắt đầu lại từ dễ nhất hay bị nhảy lên quá khó.

**Covers:** FR26, NFR7, NFR8, AR8, AR11, AR42, AR51, UX-DR55, UX-DR78

**Acceptance Criteria:**

**Given** `core/progress-store` là nơi duy nhất đọc/ghi lưu trữ bền vững
**When** bất kỳ action nào được gọi (`setDifficulty`, và các action sau này)
**Then** tài liệu JSON `{ schemaVersion, seq, difficulty, decorations }` được ghi đồng bộ vào một key duy nhất `bhc.progress` ngay trong action đó (không debounce, không ghi bất đồng bộ)
**And** ESLint/`npm run check` fail nếu file ngoài `core/progress-store` truy cập `localStorage`/`indexedDB`/`navigator.storage`

**Given** bé chạm "Chơi" lần đầu ở màn Mở đầu
**When** `Start` gọi `ProgressStore.init()`
**Then** `init()` là chỗ duy nhất gọi `navigator.storage.persist()` (đúng một lần mỗi phiên); nếu API không có hoặc promise bị từ chối thì chỉ `console.warn`, không chặn việc vào bản đồ
**And** tài liệu được nạp từ `bhc.progress`; không có key → tài liệu mặc định `{ schemaVersion: <hiện tại>, seq: 0, difficulty: {}, decorations: [] }` (đảo trống, mọi trò bậc 0, không hiện gì báo "mới")

**Given** Map nhận `round:complete` của Tiệm kem với `RoundOutcome`
**When** Map gọi `ProgressStore.setDifficulty('ice-cream', nextLevel(current, outcome, ladder.length))` (thay cho biến độ khó trong bộ nhớ của Epic 1)
**Then** mọi câu đúng ngay lần đầu (`firstTryCorrect === questions`) → bậc +1; có câu chạm gợi ý bậc 4 (`maxHintLevel === 4`) → bậc −1; còn lại giữ nguyên; luôn kẹp trong `[0, ladder.length − 1]` (Vitest cho cả 3 nhánh và 2 biên)
**And** tắt hẳn app (đóng PWA / reload trang) rồi mở lại → lượt Tiệm kem đầu tiên bắt đầu ở đúng bậc đã lưu

**Given** `getDifficulty(gameId)` được đọc
**When** key của trò không có, giá trị không phải số nguyên, âm, hoặc lớn hơn `ladder.length − 1` (ví dụ thang bị rút ngắn ở bản sau)
**Then** trả về giá trị đã kẹp (thiếu key = 0) mà không ghi đè dữ liệu
**And** `setDifficulty('touch-talk', …)` là no-op và `touch-talk` không bao giờ xuất hiện trong `difficulty`

**Given** tài liệu lưu có `schemaVersion` cũ hơn phiên bản hiện tại
**When** `init()` chạy
**Then** các hàm migration được áp dụng tuần tự từng bậc (v1→v2→…) rồi ghi lại ngay với `schemaVersion` mới; có Vitest với fixture cho mỗi bậc migration và một fixture "v1 → hiện tại" giữ nguyên độ khó
**And** nếu `schemaVersion` lớn hơn phiên bản app biết (app cũ chạy dữ liệu mới) thì dùng tài liệu mặc định trong bộ nhớ và **không** ghi đè key cũ

**Given** lưu trữ không dùng được (Safari Private, `localStorage` ném lỗi khi đọc/ghi, hết quota) hoặc JSON hỏng/không đúng shape
**When** app khởi động hoặc một action ghi
**Then** `ProgressStore` chuyển sang chế độ chỉ-bộ-nhớ cho phiên đó, `console.warn` một lần, bé vẫn chơi bình thường (độ khó vẫn tiến/lùi trong phiên) và không có chữ/âm báo lỗi nào hiện ra
**And** JSON hỏng được thay bằng tài liệu mặc định ở lần ghi kế tiếp (đảo trống, như khi iOS xoá dữ liệu PWA – UX-DR55)

### Story 2.2: Danh mục trang trí, ô trên đảo và reward-service trao thưởng lưu ngay

As a bé,
I want mỗi lượt chơi xong (hoặc mỗi ~8 vật khác nhau ở Chạm là nói) đổi được một món trang trí được giữ lại trên đảo,
So that hòn đảo của bé đẹp dần và lần sau mở app các món vẫn còn đó.

**Covers:** FR23, FR2 (phần "đồ trang trí đã nhận hiện trên đảo"), NFR1, NFR13, AR12, AR13, AR28, AR37, AR38, AR41, AR42, UX-DR9, UX-DR30, UX-DR35, UX-DR42, UX-DR78

**Acceptance Criteria:**

**Given** `art/map.blend` được bổ sung các object `slot.<stationId>.<n>` cho **cả 7 trạm** và `content/decorations.ts` khai báo danh mục món theo trạm (thứ tự cố định, ví dụ xe kem: bóng bay, cờ, cây kem lớn…; số ô mỗi trạm 3–5 [ASSUMPTION – danh mục chốt khi duyệt nội dung])
**When** chạy `tools/render` + `tools/atlas` và `npm run check`
**Then** `content/generated/map.layout.json` có anchor cho mọi `slotId`; frame `decoration/<decorationId>/<nn>` nằm trong `atlas.map` (trang ≤ 2048×2048)
**And** validator fail nếu: trạm có trò đăng ký mà 0 ô; `slotId` trong content không có anchor; ô nằm ngoài `Tokens.safeRect`, trong dải mép chết, hoặc chồng lên đa giác chạm của bất kỳ trạm nào (UX-DR9); món hiển thị < 80px; danh mục một trạm rỗng

**Given** `ProgressStore.grantDecoration(stationId)` với trạm còn ô trống
**When** được gọi
**Then** nó chọn ô trống đầu tiên theo thứ tự `slot.<stationId>.<n>` và món kế tiếp trong danh mục trạm (món sau món có `seq` lớn nhất của trạm, quay vòng khi hết danh mục; trạm chưa có món → món đầu), tăng `seq` đơn điệu (không dùng đồng hồ), ghi đồng bộ và trả `{ slot }` không có `replaced`
**And** Vitest: 3 lần grant liên tiếp lấp 3 ô khác nhau với 3 món theo đúng thứ tự danh mục; tài liệu đọc lại sau "tắt app" (khởi tạo lại store từ cùng storage) có đủ 3 `DecorationSlot`

**Given** mọi ô của trạm đã đầy (đảo đầy chỗ)
**When** `grantDecoration(stationId)` được gọi
**Then** ô có `seq` nhỏ nhất **của chính trạm đó** được thay bằng món mới với `seq` mới, và kết quả là `{ slot, replaced: { decorationId cũ } }`; ô của trạm khác không bao giờ bị đụng
**And** số `DecorationSlot` của trạm không bao giờ vượt số ô; Vitest phủ trường hợp đầy, thay vòng lần 2 (ô bị thay tiếp theo là ô cũ nhất kế tiếp)

**Given** `core/reward-service` được đăng ký toàn cục lúc boot (không phải scene), là caller duy nhất của `grantDecoration`
**When** Bus phát `round:complete { gameId, … }` hoặc `reward:earned { gameId }`
**Then** service gọi `grantDecoration(gameId)` **trước** mọi hoạt cảnh (dữ liệu đã lưu dù Map có đang chạy hay không), đẩy kết quả vào `SessionStore.pendingFlyIns`, và với `reward:earned` phát lại `reward:granted { gameId, decorationId }` đúng món vừa trao
**And** Vitest (không cần Epic 4): phát `reward:earned { gameId: 'touch-talk' }` giả lập → có đúng 1 slot mới ở trạm phố, 1 phần tử `pendingFlyIns`, 1 `reward:granted` với cùng `decorationId`; một `round:complete` chỉ tạo đúng 1 grant (không trao trùng khi listener đăng ký lại sau replay)

**Given** bé mở app (lần đầu hoặc lần sau) và vào bản đồ
**When** Map dựng cảnh
**Then** mọi `DecorationSlot` đã lưu hiện tĩnh tại anchor của ô, không có hoạt cảnh bay; đảo trống lần đầu không hiện ô chờ, khung mờ hay dấu "còn thiếu"; không có màn Bộ sưu tập hay nút ⭐
**And** chạm một món trang trí → nảy 1.1× (~0.3s) + tiếng vui ≤ 100ms, không mở trò, không kích hoạt trạm; món có `decorationId` không còn trong danh mục/atlas (sau cập nhật nội dung) → bỏ qua im lặng + `console.warn`

### Story 2.3: Chuỗi sau lượt trên bản đồ – lưu độ khó, camera lùi, trang trí bay vào

As a bé,
I want chơi xong thấy nhân vật vui, rồi thấy hòn đảo và món quà mới tự bay tới gần trạm vừa chơi,
So that bé cảm nhận mình vừa "làm ra" một thứ đẹp cho đảo mà không phải bấm gì.

**Covers:** FR22, FR23 (hoạt cảnh thay món cũ), FR26 (ghi ngay khi nhận kết quả), NFR11, NFR13, AR5, AR6, AR10, AR14, AR17, UX-DR17, UX-DR35, UX-DR42, UX-DR52, UX-DR71, UX-DR72, UX-DR73

**Acceptance Criteria:**

**Given** Tiệm kem đã xong câu cuối, Shiba ăn mừng (~1.5s) rồi game phát `round:complete`
**When** Map nhận sự kiện
**Then** Map chạy **một chuỗi await duy nhất**: `ProgressStore.setDifficulty` đồng bộ ngay khi nhận → xoá `resume['ice-cream']` → dừng scene trò và giải phóng tài nguyên trò → camera lùi về cảnh đảo quanh trạm, kart đỗ ở trạm vừa chơi (≤ 1.5s, `Tokens.Timing`) → hoạt cảnh từng phần tử `pendingFlyIns` → kết thúc chuỗi (hook `onChainEnd`; Story 2.4 gắn lớp phủ vào đây, trước đó Map trở về trạng thái Mời chơi)
**And** từ lúc nhân vật bắt đầu ăn mừng tới khi chuỗi kết thúc ≤ 4s (tức từ `round:complete` tới `onChainEnd` ≤ 2.5s), đo bằng log thời gian trong dev build

**Given** `pendingFlyIns` có một món cho ô còn trống
**When** tới bước bay trang trí
**Then** món tự bay từ phía trạm vào anchor của ô (~1s, ease-out, kết thúc nảy nhẹ), có sao nhỏ `sparkle` mờ dần (không chớp, ≤ 1Hz), bé không phải chạm gì; trong lúc bay chỉ món này là chuyển động nổi bật (trạm khác ngừng khẽ cử động)
**And** phần tử được xoá khỏi `pendingFlyIns` khi đã diễn xong; ăn mừng chỉ bằng nhân vật + nhạc ngắn, không pháo giấy, không lời khen

**Given** kết quả grant có `replaced` (ô của trạm đã đầy)
**When** tới bước bay trang trí
**Then** món cũ ở ô đó bay vút lên và mờ đi như bóng bay, món mới bay vào cùng chỗ ngay sau khi món cũ rời ô; cả hai hoạt cảnh gối nhau nằm trong ngân sách ~1s của bước bay (tổng vẫn ≤ 4s)
**And** sau chuỗi, đảo chỉ còn món mới tại ô đó (không còn sprite món cũ)

**Given** bé chạm một trạm (hoặc nhiều trạm liên tiếp) trong lúc chuỗi đang chạy
**When** chuỗi kết thúc
**Then** chỉ chạm **cuối cùng** được áp dụng (trạm nhún + đọc tên, kart chạy tới trạm đó, không hiện lớp phủ); các chạm trước bị bỏ, không chạm nào cắt ngang camera hay hoạt cảnh bay
**And** nút Loa vẫn hoạt động trong suốt chuỗi (phát lại câu gần nhất qua `audio.replayPrompt()`), không làm dừng chuỗi

**Given** `prefers-reduced-motion: reduce`
**When** chuỗi chạy
**Then** camera lùi được thay bằng chuyển cảnh mờ qua `core/motion`, món trang trí hiện mờ dần tại ô thay vì bay, món cũ mờ đi tại chỗ thay vì bay vút lên; tổng thời gian vẫn ≤ 4s

**Given** app bị ẩn/tắt hoặc AudioContext bị treo giữa chuỗi
**When** bé quay lại
**Then** nếu chỉ bị ẩn: chuỗi tạm dừng theo `scene.pause()` của `AudioUnlockOverlay` và chạy tiếp đúng chỗ sau khi chạm; nếu app bị kill giữa lúc bay: lần mở sau món đã có sẵn tĩnh ở ô (đã lưu ở Story 2.2) và độ khó đã là bậc mới, không bay lại, không trao thêm món
**And** khi bé về bản đồ bằng `round:abandon` (ví dụ từ Chạm là nói, Epic 4) mà `pendingFlyIns` còn món, Map vẫn camera lùi rồi diễn các món đó lần lượt (cách nhau ~0.3s) nhưng **không** gọi `setDifficulty` và **không** mở lớp phủ (kiểm bằng Vitest/dev hook đẩy sẵn một phần tử `pendingFlyIns` cho trạm phố)

### Story 2.4: Lớp phủ "Hỏi chơi tiếp" với lời mời, nhắc lại và tự đóng

As a bé,
I want cuối lượt có hai nút to hỏi bé chơi nữa hay đi chỗ khác, có giọng nói và tự biến mất nếu bé không chọn,
So that bé tự quyết định tiếp theo mà không cần chữ, không bị kẹt trên một màn chờ.

**Covers:** FR25, FR3 (Loa trên lớp phủ), NFR1, NFR3, NFR4, NFR13, AR4, AR6, AR7, AR15, AR17, AR19, AR26, AR27, UX-DR14, UX-DR18, UX-DR32, UX-DR33, UX-DR34, UX-DR41, UX-DR53, UX-DR66, UX-DR73

**Acceptance Criteria:**

**Given** chuỗi sau lượt của Map (Story 2.3) kết thúc mà không có chạm trạm xếp hàng
**When** Map mở `PlayAgainOverlay`
**Then** lớp phủ hiện trên bản đồ (không phải màn riêng) với lớp tối 15%, hai nút tròn 160px `button-replay` (`colors.button-replay`, biểu tượng nhân vật trò vừa chơi – Shiba – + mũi tên vòng ở góc) và `button-back-to-map` (`colors.button-map`, hòn đảo có kart), xếp ngang giữa màn cách nhau 48px, phía trên trạm vừa chơi sao cho món trang trí mới vẫn thấy được, nằm trong `safeRect` và ngoài dải mép chết
**And** `button-replay` nhún + *"Chơi nữa với bạn Shiba nhé?"* (`vo.shell.play-again-ask.ice-cream`), khi câu nói xong `button-back-to-map` nhún + *"Hay mình đi chỗ khác?"*; câu hỏi được đăng ký bằng `audio.setPrompt` để nút Loa phát lại từ đầu, không chồng tiếng; lớp phủ không bao giờ mở sau `round:abandon` hay cho `touch-talk`

**Given** lớp phủ đang mở
**When** bé chạm `button-replay`
**Then** lớp phủ đóng, camera phóng vào lại trạm (~1.5s; reduced-motion → chuyển mờ), Map xoá `resume` của trò và start lượt mới cùng trò với `level` đọc từ `ProgressStore.getDifficulty` (đã là bậc tiếp nối) và `seed` mới
**And** chạm thêm lần nữa hoặc ngón thứ hai trong lúc phóng vào bị bỏ qua (ngón đầu tiên thắng), không start trò hai lần

**Given** lớp phủ đang mở
**When** bé chạm `button-back-to-map`
**Then** chỉ đóng lớp phủ: kart vẫn đỗ ở trạm vừa chơi, mọi trạm chạm được ngay, lịch Mời chơi trên bản đồ chạy lại từ đầu (UX-DR41)

**Given** lớp phủ đang mở (lớp phủ không có backdrop tương tác)
**When** bé chạm vào đa giác của một trạm bất kỳ (kể cả trạm vừa chơi)
**Then** chạm rơi xuống hotspot của Map, Map phát `overlay:close`, lớp phủ đóng, trạm nhún + đọc tên và kart chạy tới trạm đó như bình thường; trạm "ngủ" vẫn chỉ nảy + kêu vui nhưng lớp phủ vẫn đóng
**And** chạm vào chỗ trống/món trang trí không đóng lớp phủ (món trang trí vẫn nảy)

**Given** lớp phủ mở và bé không chạm gì
**When** ~10s (`Tokens.Timing`, tính từ khi câu thứ hai nói xong) trôi qua
**Then** app nhắc lại câu hỏi **một lần** và `hint-ring` (từ `core/hint-visuals`) luân phiên giữa hai nút, chỉ một vòng tại một thời điểm
**And** yên tổng ~30s → lớp phủ tự đóng nhẹ (mờ dần), bé ở lại bản đồ, lịch Mời chơi tiếp tục; đồng hồ dùng `time` của scene nên dừng khi `AudioUnlockOverlay` pause và khi app bị ẩn, không dùng `setTimeout`

**Given** chuỗi sau lượt có chạm trạm xếp hàng (Story 2.3)
**When** chuỗi kết thúc
**Then** lớp phủ không hiện (hoặc đóng ngay qua `overlay:close` trước khi phát câu hỏi) và kart đi tới trạm được chạm cuối cùng; không có câu *"Chơi nữa…"* nào phát dở

### Story 2.5: Giữ lượt dở trong phiên và tiếp tục đúng câu đang dở

As a bé,
I want bấm Nhà giữa lượt rồi quay lại trạm đó vẫn thấy kem đã đặt và đúng câu đang làm,
So that bé không mất công sức khi lỡ tay bấm Nhà hay muốn đi xem chỗ khác một lát.

**Covers:** FR27, FR3 (Nhà giữ lượt dở), AR3, AR5, AR14, AR41, UX-DR13, UX-DR38

**Acceptance Criteria:**

**Given** bé đang ở câu thứ 2 của Tiệm kem, đã đặt 1 viên kem lên ốc quế (bậc nhiều viên)
**When** bé chạm `button-home`
**Then** "pụp" + *"Về đảo nào!"*, `MiniGameBase` phát đúng một `round:abandon { gameId: 'ice-cream', snapshot }` với `snapshot = { v: 1, level, seed, questionIndex: 1, partial: { placed: [...] } }` rồi game trơ (không input, tắt gợi ý, bỏ qua Nhà lần hai)
**And** snapshot là JSON thuần: Vitest kiểm `JSON.parse(JSON.stringify(snapshot))` bằng sâu bản gốc và không chứa tham chiếu GameObject/hàm

**Given** Map nhận `round:abandon`
**When** về bản đồ (camera lùi, kart đỗ ở trạm Tiệm kem)
**Then** chỉ Map ghi `SessionStore.resume['ice-cream'] = snapshot` và trạm xe kem hiện vòng nhỏ chỉ báo lượt dở (tĩnh, không nhấp nháy, khác `hint-ring` mời chơi); không gọi `setDifficulty`, không trao trang trí, không mở lớp phủ

**Given** trạm có lượt dở
**When** bé chạm lại trạm đó và kart tới nơi
**Then** Map start trò với `{ level: snapshot.level, seed: snapshot.seed, resume: snapshot }` (dùng `snapshot.level` kể cả khi `ProgressStore` có bậc khác); câu 2 được dựng lại tất định từ `seed`, viên kem đã đặt nằm sẵn trên ốc quế theo đúng thứ tự, HintDirector bắt đầu câu ở bậc 0 và đọc lại yêu cầu
**And** vòng chỉ báo trên trạm biến mất khi trò bắt đầu; chơi xong lượt (`round:complete`) → `resume['ice-cream']` bị xoá (Story 2.3) và chạm `button-replay` luôn start không resume

**Given** bé bấm Nhà khi câu cuối đã đúng và Shiba đang ăn mừng (trước khi `round:complete` được phát)
**When** `hud:home` tới
**Then** `MiniGameBase` không tạo lượt dở mà kết thúc lượt: phát `round:complete` (đúng một sự kiện kết thúc), Map chạy chuỗi sau lượt bình thường – độ khó được lưu, trang trí được trao và bay vào, không có vòng lượt dở trên trạm

**Given** có lượt dở ở Tiệm kem
**When** app bị tắt hẳn/reload rồi mở lại
**Then** không còn vòng lượt dở nào (SessionStore chỉ trong bộ nhớ) và vào Tiệm kem bắt đầu lượt mới ở bậc đã lưu trong `ProgressStore`
**And** khi chỉ bị ẩn rồi quay lại (lớp mở khoá âm thanh của Epic 1), lượt dở vẫn còn nguyên

**Given** kiểu `resume: Partial<Record<GameId, Snapshot>>` và các trò khác chưa có (Epic 3/4)
**When** chạy Vitest cho `SessionStore` và logic Map
**Then** nhiều trò có thể giữ lượt dở cùng lúc, mỗi trạm có vòng riêng; `partial` của `touch-talk` (cảnh hiện tại + id vật đã chạm khác nhau) được khai báo trong kiểu `Snapshot` để Epic 4 dùng lại mà không đổi hợp đồng

## Epic 3: Trò kéo và ghép – Làm pizza, Ghép khủng long, Tìm bóng

Bé đánh thức ba trạm mới trên đảo và chơi ba trò kéo-thả: làm pizza cho bạn cáo (kéo đúng số lát topping, nghe app đếm to "Một!… Hai!… Ba!", chạm lò nướng rồi xem cáo "măm măm"), ghép khủng long hiền từ các mảnh vào bóng mờ rồi xem bạn ấy "sống dậy" kêu nhỏ vui, và cùng khủng long ba sừng ở cửa hang sáng kéo con vật/chiếc xe vào đúng cái bóng tím-xám. Mỗi trò dùng lại nguyên các dịch vụ của Epic 1 (`MiniGameBase` + registry, `DragController`/`drop-target`, `HintDirector` 4 bậc, `AudioDirector` với `say`/`sayChain`, pipeline Blender → layout → atlas, pipeline TTS) và chỉ thêm game scene + dữ liệu `content/games/<GameId>.ts` + tài nguyên render. Mỗi trò phát đúng một `RoundOutcome` sau màn ăn mừng của nhân vật và cung cấp `Snapshot` cho lượt dở; nếu có Epic 2 thì đồ trang trí, lớp phủ Hỏi chơi tiếp, nhớ độ khó và giữ lượt dở tự hoạt động, còn thiếu Epic 2 thì trò vẫn chơi trọn lượt và quay về đảo bình thường. Thứ tự story: Pizza (3.1 → 3.2), Khủng long (3.3 → 3.4), Tìm bóng (3.5 → 3.6); mỗi cặp độc lập với cặp khác.

### Story 3.1: Đánh thức tiệm pizza – bé đếm topping, nướng bánh cho cáo ăn

As a bé 2–4 tuổi,
I want kéo đúng số lát topping mà giọng nói yêu cầu lên đế bánh, nghe app đếm theo từng lát rồi chạm lò để nướng,
So that em tập đếm 1–3 và được thấy bạn cáo ăn chiếc bánh do chính mình làm.

**Covers:** FR7, FR8, FR2 (đánh thức trạm), FR3, NFR1, NFR2, NFR3, NFR4, NFR5, NFR9, NFR10, NFR11, NFR12, NFR13, AR3, AR5, AR10, AR15, AR18, AR21, AR23, AR24, AR25, AR27, AR28, AR29, AR37, AR38, AR39, AR42, AR51, UX-DR5, UX-DR6, UX-DR10, UX-DR15, UX-DR20, UX-DR21, UX-DR22, UX-DR23, UX-DR31, UX-DR44, UX-DR45, UX-DR46, UX-DR47, UX-DR48, UX-DR49, UX-DR50, UX-DR57, UX-DR66, UX-DR68, UX-DR69, UX-DR70, UX-DR71, UX-DR72, UX-DR73, UX-DR74

**Acceptance Criteria:**

**Given** `games/registry.ts` đăng ký `pizza` (scene key `pizza`, `ladder` tạm 1 bậc: 3 câu, số lát 1–3, 2 loại topping xúc xích + nấm) và `content/stations.ts` chuyển trạm tiệm pizza từ "ngủ" sang "thức"
**When** bé chạm đa giác trạm tiệm pizza trên bản đồ
**Then** trạm nhún + đọc tên trạm, kart chạy tới trạm (≤ 2s, lần sau trong phiên ≤ 1.5s) trong lúc shell tải `atlas.pizza` + `bg.pizza`, rồi shell `scene.start('pizza', { level, seed })` – game không tự gọi `scene.start/stop/launch` hay `this.load.*`
**And** lịch Mời chơi trên bản đồ (yên ~8s) giờ có thể chọn trạm tiệm pizza; 4 trạm còn "ngủ" vẫn giữ hành vi nảy + kêu vui của Epic 1

**Given** `art/pizza.blend` (camera ngang tầm mắt sát quầy; cáo Quaternius `Fox.fbx` tô `creature-orange`, bụng/mõm trắng; đế bánh, bát xúc xích, bát nấm, lò từ Kenney food-kit/low-poly) có object `anchor.fox`, `anchor.base`, `slot.base.1`…`slot.base.8`, `anchor.bowl.sausage`, `anchor.bowl.mushroom`, `hit.oven`
**When** chạy `tools/render` rồi `tools/atlas`
**Then** sinh ra `content/generated/pizza.layout.json` (px design 1×) và `public/assets/atlases/pizza.png|json` với trang ≤ 2048×2048, mỗi file ≤ 8 MiB, frame theo `<object>/<state>/<nn>` (cáo: `idle`, `happy`, `eat`; lò: `rest`, `ready`, `baking`; bánh: `raw`, `baked`)
**And** `npm run check` pass: cả 8 `slot.base.*`, 2 bát và lò nằm trong `Tokens.safeRect`, ngoài dải mép (24/32/40px), vùng chạm ≥ 80px; cáo ≥ 220px ở giữa-sau, quầy + đế + bát ở 1/3 dưới; lò 200px bên phải quầy

**Given** câu hỏi "Bé ơi, ba lát xúc xích nào!" đã được `HintDirector.beginQuestion({ promptLineId: 'vo.pizza.ask.sausage.3', retryLineId, step: { correct: [bát xúc xích], distractors: [bát nấm], target: đế, action: 'drag' } })` phát xong
**When** bé kéo lát xúc xích thứ nhất, thứ hai, thứ ba thả trong 100px quanh đế
**Then** mỗi lát hút vào chỗ `slot.base.*` trống kế tiếp (0.2s ease-out, nảy 1.05×, "pụp" ≤ 100ms) và giọng đếm đúng số đó (`vo.pizza.count.1` "Một!", `vo.pizza.count.2` "Hai!", `vo.pizza.count.3` "Ba!"); bát luôn hiện lại lát mới (không bao giờ hết)
**And** khi đủ 3 lát app đếm lại liền mạch bằng `audio.sayChain(['vo.pizza.count.1','vo.pizza.count.2','vo.pizza.count.3'])`, mỗi lát nảy nhẹ đúng lúc số của nó được đọc (một chuyển động nổi bật tại một thời điểm), rồi lò chuyển sang `ready` (cửa hé + hint-ring) và HintDirector phát *"Mình nướng bánh nào!"* (`vo.pizza.bake`, truyền qua `stepDone`)

**Given** đang ở bước đặt topping với yêu cầu 3 lát xúc xích
**When** bé thả lát nấm lên đế, hoặc (sau khi đã đủ 3) thả thêm lát xúc xích thứ tư
**Then** lát nấm trôi về bát (~0.5s) và game gọi `hint.wrong()` (HintDirector phát câu nhắc ngắn bậc 1 – game không tự phát lời nhắc); lát thừa trôi về bát và câu nhắc bậc 1 là *"Đủ ba lát rồi!"* (`retryLineId: 'vo.pizza.enough.3'` của bước nướng được truyền qua `hint.stepDone(nextStep, { promptLineId: 'vo.pizza.bake', retryLineId: 'vo.pizza.enough.3' })`)
**And** không có màu đỏ, dấu ✗, rung hay tiếng "sai"; số lát đã đặt không bao giờ bị giảm; thả lát giữa đường trên quầy → nằm lại (tự đẩy tránh chồng), thả ngoài quầy → ~1.5s trượt về bát

**Given** đế đã đủ topping và game đã gọi `hint.stepDone({ correct: [lò], distractors: [], target: null, action: 'tap' }, { promptLineId: 'vo.pizza.bake', retryLineId: 'vo.pizza.enough.3' })`
**When** bé chạm lò (hoặc không chạm)
**Then** chạm lò → bánh trượt vào, ô kính sáng `oven-glow` dịu tăng trong 0.4s rồi giữ đều ~2s (không chớp, khói trắng nhỏ), "ting" (`sfx.pizza.ting`), bánh ra bốc hơi, cáo cầm bánh "măm măm" (`sfx.pizza.munch` ≤ 0.8s) + vẫy đuôi, rồi `hint.questionDone()` và sang câu kế với đế mới
**And** chạm lò khi chưa đủ topping chỉ làm lò nảy nhẹ 1.05× (phản hồi ≤ 100ms), không nướng, không gọi `hint.wrong()`; đủ mà không chạm → ~6s (`Tokens.Timing`) hint-ring quanh lò (bậc 2), rồi bàn tay chạm lò (bậc 3); Loa trong bước này phát lại *"Mình nướng bánh nào!"*

**Given** bé đã xong câu thứ 3 của lượt
**When** cáo diễn tư thế vui (nhún 1.0→1.12→1.0 hai lần trong 0.8s + nhạc 1–2s, tổng ~1.5s)
**Then** game phát đúng một `round:complete` với `RoundOutcome = { gameId: 'pizza', questions: 3, firstTryCorrect, maxHintLevel }` SAU khi ăn mừng xong, rồi trơ (bỏ qua input, gợi ý, Nhà); bấm Nhà giữa lượt → đúng một `round:abandon { gameId: 'pizza', snapshot }`
**And** game không import gì của Epic 2: nếu chưa có reward-service/overlay thì Map vẫn đưa bé về đảo, kart đỗ ở tiệm pizza

**Given** mọi câu thoại mới (`vo.pizza.ask.<topping>.<n>` cho n = 1–3 × 2 loại, `vo.pizza.retry.*`, `vo.pizza.enough.<n>`, `vo.pizza.bake`, `vo.pizza.count.1`–`vo.pizza.count.3`, tên trạm nếu chưa có) và SFX được thêm vào `content/voice-lines.ts` / `content/audio-catalog.ts`
**When** chạy `tools/tts`, `tools/audio` rồi `npm run check`
**Then** mỗi câu ≤ 8 từ, từ khoá cuối câu có `keywordPauseMs` ~300, ~0.85×, ≈ −16 LUFS; "pizza" và "xúc xích" được đánh dấu cần người lớn nghe duyệt; validator không tìm thấy cặp đồng âm cấm (ba/bà…) và không câu nào chứa "sai"/"không đúng"/lời khen
**And** xúc xích (lát tròn có chấm, đỏ cam đậm) và nấm (mũ nấm có cuống, kem sáng) khác nhau cả về hình lẫn độ sáng; giọng luôn gọi tên loại topping; với `prefers-reduced-motion` biên độ nảy giảm và khói lò tĩnh

### Story 3.2: Làm pizza – thang độ khó tới 5 lát, nhiều loại topping và lượt dở

As a bé 2–4 tuổi,
I want các lượt pizza sau yêu cầu nhiều lát hơn (tới 5) và có thêm loại topping khi em đã làm tốt,
So that em được thử thách vừa sức và tiếp tục học đếm tới 5 mà không bị kẹt.

**Covers:** FR9, FR7, FR8, NFR3, NFR4, NFR12, AR3, AR5, AR8, AR14, AR23, AR25, AR27, AR29, AR42, UX-DR22, UX-DR48, UX-DR57, UX-DR68, UX-DR69, UX-DR74

**Acceptance Criteria:**

**Given** `content/games/pizza.ts` export `ladder` gồm 3 bậc dữ liệu: bậc 0 = 3 câu, số lát 1–3, 2 loại (xúc xích, nấm); bậc 1 = 4 câu, số lát 2–4, 2 loại; bậc 2 = 5 câu, số lát 3–5, 3 loại (loại thứ ba lấy từ Kenney food-kit, chốt trong content, có hình + độ sáng khác hẳn hai loại kia)
**When** shell start `pizza` với `level` 0, 1 hoặc 2
**Then** số câu, khoảng số lát và số bát trên quầy đúng theo bậc; số lát không bao giờ > 5 và không bao giờ > 8 chỗ trên đế
**And** `nextLevel` (AR8) dùng `ladder.length = 3` – không có logic độ khó riêng trong game

**Given** cùng một `seed` và `level`
**When** sinh danh sách câu hỏi (Vitest trong `content/`)
**Then** chuỗi (loại topping, số lát) giống hệt nhau qua mỗi lần chạy, hai câu liên tiếp không trùng cả loại lẫn số, và mỗi lượt có ít nhất một câu ở số lát lớn nhất của bậc
**And** test bao phủ biên: bậc 0 không có câu 4–5 lát, bậc 2 có câu 5 lát

**Given** bậc 2 đang hỏi "Bé ơi, năm lát nấm nào!" và có 3 bát topping
**When** bé đặt lần lượt 5 lát nấm
**Then** giọng đếm từng lát `vo.pizza.count.1`…`vo.pizza.count.5` và đếm lại liền mạch bằng `sayChain` 5 id trước khi lò mở; câu "năm lát nấm" (năm/nấm cạnh nhau) được đánh dấu cần người lớn nghe duyệt riêng, nếu không đạt thì content đổi sang câu khác ≤ 8 từ
**And** ở bậc gợi ý 4 hai bát sai mờ 60% và không nhấc được (`setPickable(false)`), vùng hút đế ×2 (`setSnapScale(đế, 2)`); app không bao giờ tự đặt lát hộ

**Given** bé đã đặt 2/4 lát xúc xích ở câu thứ 3 rồi bấm Nhà
**When** game phát `round:abandon`
**Then** `snapshot = { v: 1, level, seed, questionIndex: 2, partial: { placed: [số slot đã đặt], baked: false } }` là JSON thuần, không tham chiếu object
**And** khi shell start lại với `resume` (nếu Epic 2 có), 2 lát hiện sẵn đúng slot cũ không đếm lại từng lát, câu yêu cầu được phát lại, bé đặt tiếp lát thứ 3 → giọng đếm "Ba!"; nếu `partial` hỏng/thiếu field thì bắt đầu lại câu đó với đế trống + `console.warn`, không hiện lỗi

**Given** toàn bộ câu thoại cho mọi tổ hợp (loại × số lát 1–5) và `vo.pizza.enough.<n>` cho n = 1–5
**When** chạy `npm run check`
**Then** mỗi tổ hợp có đúng một file `.m4a` (một yêu cầu = một file), validator voice↔file↔hash pass, không cặp đồng âm cấm
**And** `RoundOutcome.questions` bằng số câu của bậc (3/4/5) và `firstTryCorrect` chỉ đếm câu không có lần `hint.wrong()` nào kể cả ở bước lò

### Story 3.3: Đánh thức công viên khủng long – ghép 3 mảnh cho khủng long sống dậy

As a bé 2–4 tuổi,
I want kéo từng mảnh khủng long vào đúng chỗ trên bóng mờ và xem bạn ấy sống dậy,
So that em luyện nhận biết hình – vị trí và vui vì đã "tạo ra" một bạn khủng long hiền.

**Covers:** FR18, FR19, FR2 (đánh thức trạm), FR3, NFR1, NFR2, NFR3, NFR4, NFR5, NFR9, NFR10, NFR11, NFR12, NFR13, AR3, AR5, AR10, AR15, AR18, AR21, AR23, AR24, AR25, AR27, AR29, AR37, AR38, AR39, AR42, AR44, AR51, UX-DR5, UX-DR6, UX-DR21, UX-DR22, UX-DR25, UX-DR31, UX-DR44, UX-DR45, UX-DR46, UX-DR47, UX-DR48, UX-DR49, UX-DR50, UX-DR61, UX-DR70, UX-DR71, UX-DR72, UX-DR73, UX-DR74, UX-DR75

**Acceptance Criteria:**

**Given** `games/registry.ts` đăng ký `dino-puzzle` (ladder tạm 1 bậc: 3 mảnh, 3 con/lượt) và trạm công viên khủng long chuyển sang "thức"
**When** bé chạm trạm công viên khủng long
**Then** trạm nhún + đọc tên, kart chạy tới trong lúc shell tải `atlas.dino-puzzle`, rồi game bắt đầu; lịch Mời chơi có thể chọn trạm này
**And** 3 con trong lượt là cổ dài (Apatosaurus), ba sừng (Triceratops), phiến lưng (Stegosaurus), thứ tự xáo theo `seed`; không có T-rex, răng nanh, móng vuốt ở bất kỳ asset nào

**Given** `art/dino-puzzle.blend` với 3 loài Quaternius tô lại bằng `creature-*` (không giữ xám/nâu gốc), mỗi loài cắt thành mảnh theo dữ liệu (3 mảnh: đầu-cổ, thân-chân, đuôi), có `slot.<species>.<piece>` và `anchor.<species>.<piece>.start`
**When** chạy `tools/render` + `tools/atlas`
**Then** mỗi loài có frame bóng mờ cả con (`ghost-fill` 35% + nét đứt trắng 4px), frame từng mảnh màu thật, frame `idle/blink/happy/walk`; atlas ≤ 2048², file ≤ 8 MiB
**And** validator pass: mọi vị trí bắt đầu của mảnh nằm trong `safeRect`, ngoài dải mép và vùng ~120×120 quanh nút Nhà/Loa, mảnh hiển thị ≥ 90px, các mảnh cách nhau ≥ 24px và không đè lên bóng mờ

**Given** bóng mờ khủng long cổ dài trên cỏ, 3 mảnh nằm quanh, câu *"Mình ghép bạn khủng long nào!"* đã phát xong qua `hint.beginQuestion`
**When** bé kéo mảnh thân thả vào ô đầu, rồi kéo đúng vào ô thân
**Then** thả ở ô khác → mảnh trôi về chỗ bắt đầu (~0.5s) + `hint.wrong()`; thả vào ô của chính nó (trong 100px) → hút vào (0.2s, nảy 1.05×), ô đó đổi từ bóng mờ sang màu thật, "pụp" ≤ 100ms, rồi `hint.stepDone(nextStep)` với mảnh còn lại
**And** mảnh nào cũng khớp theo thứ tự bất kỳ, không cần xoay; khi điểm thả nằm trong vùng hút của cả ô đúng lẫn ô khác thì ô đúng của mảnh thắng; thả trên cỏ xa mọi ô → mảnh nằm lại (tự đẩy tránh chồng), thả ra ngoài vùng chơi → ~1.5s trượt về

**Given** gợi ý ở một con khủng long
**When** HintDirector leo bậc (lần sai hoặc ~6s)
**Then** bậc 2: hint-ring quanh MỘT mảnh chưa ghép (mảnh đầu tiên chưa ghép theo thứ tự trong content) và ô của nó sáng nét đứt; bậc 3: bàn tay kéo mảnh đó → ô; bậc 4: `setSnapScale(ô đó, 2)` và không mảnh nào bị mờ (mọi mảnh đều "đúng"), trò vẫn không ghép hộ
**And** nếu bé ghép một mảnh khác mảnh đang được gợi ý thì vẫn tính đúng, vòng chuyển sang mảnh chưa ghép kế tiếp, bậc giữ nguyên cho tới `hint.questionDone()`; ở bậc ≥ 2 cỏ/mây nền dừng chuyển động

**Given** mảnh cuối cùng của một con vừa hút vào
**When** khủng long "sống dậy"
**Then** theo thứ tự: chớp mắt, nhún nhảy (1.0→1.12→1.0 hai lần), đi vài bước (≤ 120px, vẫn trong `safeRect`), kêu nhỏ vui `sfx.dino-puzzle.<species>.happy` rồi đọc tên loài (*"Khủng long cổ dài!"*, *"Khủng long ba sừng!"*, *"Khủng long phiến lưng!"*); sau đó con mới (bóng mờ + mảnh) hiện bằng chuyển mờ ~0.5s
**And** `tools/audio` kiểm tra mỗi tiếng khủng long ≤ 0.8s, không dải < 150Hz, không to hơn giọng, fade-in ≥ 50ms – không có tiếng gầm; với `prefers-reduced-motion` bước đi được thay bằng nhún tại chỗ biên độ nhỏ

**Given** con thứ 3 vừa sống dậy và đọc tên xong
**When** màn ăn mừng của lượt (con cuối nhún + nhạc 1–2s) kết thúc
**Then** game phát đúng một `round:complete { gameId: 'dino-puzzle', questions: 3, firstTryCorrect, maxHintLevel }` (mỗi con là một câu) rồi trơ; Nhà giữa lượt → đúng một `round:abandon`
**And** trò hoạt động đầy đủ khi không có Epic 2 (Map đưa bé về đảo, kart đỗ ở công viên khủng long)

### Story 3.4: Ghép khủng long – thang 3 → 4 → 6 mảnh và lượt dở

As a bé 2–4 tuổi,
I want khủng long có nhiều mảnh hơn (4 rồi 6) khi em đã ghép giỏi,
So that trò ghép vẫn thú vị khi em lớn dần mà không bao giờ quá khó.

**Covers:** FR18, FR19, NFR1, NFR4, AR3, AR8, AR14, AR37, AR42, UX-DR25, UX-DR48, UX-DR61

**Acceptance Criteria:**

**Given** `content/games/dino-puzzle.ts` export `ladder` 3 bậc: bậc 0 = 3 mảnh, bậc 1 = 4 mảnh, bậc 2 = 6 mảnh (đầu, cổ, thân, chân trước, chân sau, đuôi), mỗi bậc 3 con/lượt
**When** shell start `dino-puzzle` với `level` 0, 1 hoặc 2
**Then** mỗi con được cắt đúng số mảnh của bậc, mỗi mảnh có một `slot.<species>.<piece>` riêng do `tools/render` sinh (không nhập toạ độ tay)
**And** validator fail nếu bất kỳ mảnh nào ở bậc 6 hiển thị < 90px hoặc vùng chạm < 80px, hoặc hai ô cạnh nhau có tâm cách < 100px mà không có quy tắc "ô đúng thắng" (mảnh nhỏ như chân được phóng to tới tối thiểu)

**Given** bậc 2 với 6 mảnh nằm quanh bóng mờ
**When** sắp vị trí bắt đầu theo `seed`
**Then** 6 mảnh không chồng nhau (khe ≥ 24px), đều trong `safeRect`, ngoài dải mép; cùng `seed` cho cùng thứ tự loài và cùng vị trí (Vitest)
**And** không có mảnh nào bắt đầu nằm trong vùng hút 100px của chính ô của nó

**Given** bé đã ghép 4/6 mảnh của con thứ 2 rồi bấm Nhà
**When** game phát `round:abandon`
**Then** `snapshot = { v: 1, level, seed, questionIndex: 1, partial: { placed: [pieceId…] } }` là JSON thuần
**And** khi shell `scene.start('dino-puzzle', { level, seed, resume: snapshot })` (kiểm phía game; việc Map giữ và trả snapshot khi vào lại trạm chỉ có khi có Epic 2 – Story 2.5), 4 mảnh hiện sẵn ở ô với màu thật, 2 mảnh còn lại ở chỗ bắt đầu, câu yêu cầu phát lại và gợi ý bắt đầu từ bậc 0; `partial` không hợp lệ → làm lại con đó từ đầu + `console.warn`

**Given** một lượt ở bậc 1 mà bé ghép mọi con không lần sai nào
**When** phát `round:complete`
**Then** `firstTryCorrect === questions === 3` và `maxHintLevel` = bậc gợi ý cao nhất đã đạt trong lượt (0 nếu không có)
**And** nếu chỉ một mảnh của một con đã chạm gợi ý bậc 4 thì `maxHintLevel === 4`

### Story 3.5: Đánh thức cửa hang – tìm bóng cùng khủng long ba sừng

As a bé 2–4 tuổi,
I want kéo con vật hoặc chiếc xe mà bạn khủng long ba sừng đưa ra vào đúng cái bóng của nó,
So that em luyện nhận biết hình dáng và học tên con vật, đồ vật bằng tiếng Việt.

**Covers:** FR20, FR2 (đánh thức trạm), FR3, NFR1, NFR2, NFR3, NFR4, NFR5, NFR9, NFR10, NFR11, NFR12, NFR13, AR3, AR5, AR10, AR15, AR18, AR21, AR23, AR24, AR25, AR27, AR29, AR37, AR38, AR39, AR42, AR44, AR51, UX-DR3, UX-DR4, UX-DR5, UX-DR6, UX-DR21, UX-DR22, UX-DR26, UX-DR31, UX-DR44, UX-DR45, UX-DR46, UX-DR47, UX-DR48, UX-DR49, UX-DR50, UX-DR62, UX-DR68, UX-DR69, UX-DR70, UX-DR71, UX-DR72, UX-DR73, UX-DR75

**Acceptance Criteria:**

**Given** `games/registry.ts` đăng ký `shadow-match` (ladder tạm 1 bậc: 2 bóng khác hẳn nhau, 4 câu/lượt) và trạm cửa hang chuyển sang "thức"
**When** bé chạm trạm cửa hang trên bản đồ
**Then** trạm nhún + đọc tên, kart chạy tới trong lúc shell tải `atlas.shadow-match`, rồi game bắt đầu; lịch Mời chơi có thể chọn trạm này
**And** khi vào màn khủng long ba sừng (`creature-green`, ≥ 220px) xuất hiện từ từ (mờ dần vào + nhô lên trong ≥ 0.8s), không bật ra đột ngột

**Given** `art/shadow-match.blend` dựng cửa hang sáng: nền đá `cave-mouth`, lòng hang tông sáng (không đen, không vùng tối), các vật (con vật Quaternius, xe Kenney) render 2 trạng thái `color` và `shadow` (bóng đặc `shadow-target` `#5B4E96`, cùng đường viền với vật)
**When** chạy `tools/render` + `tools/atlas` và đo tương phản trên ảnh render thật
**Then** `shadow-target` trên `cave-mouth` ≥ 5:1, mỗi bóng ≥ 120px; vật đang cầm hiển thị ≥ 90px tại `anchor.triceratops.hand`
**And** validator pass: 2–4 vị trí `slot.shadow-match.*` nằm trong `safeRect`, ngoài dải mép, cách nhau ≥ 24px; danh mục vật không chứa bóng bay/quả bóng/bông hoa (tránh trùng nghĩa với "bóng" và cặp bóng/bông)

**Given** ba sừng cầm con mèo, có 2 bóng (mèo + ô tô), câu *"Bạn mèo trốn ở cái bóng nào?"* đã phát xong qua `hint.beginQuestion({ step: { correct: [vật], distractors: [bóng mồi], target: bóng đúng, action: 'drag' } })`
**When** bé kéo mèo thả lên bóng ô tô, rồi thả lên bóng mèo
**Then** thả lên bóng mồi → mèo trôi về tay ba sừng (~0.5s) + `hint.wrong()` (HintDirector nhắc lại câu hỏi); thả trong 100px quanh bóng đúng → mèo hút vào, bóng chuyển từ tím-xám sang màu thật bằng chuyển mờ ~0.4s (không chớp, không đảo sáng–tối > 25% màn), ba sừng nhún + gật đầu + kêu nhỏ vui (`sfx.shadow-match.trike.happy` ≤ 0.8s, không < 150Hz, không gầm), rồi đọc tên *"Con mèo!"*
**And** thả ra nền xa mọi bóng → ~1.5s trượt về tay ba sừng, không tính sai; không màu đỏ/✗/tiếng sai

**Given** gợi ý trong một câu Tìm bóng
**When** HintDirector leo bậc
**Then** bậc 2: hint-ring quanh bóng đúng (vòng ba lớp, lớp trắng/tím đạt ≥ 3:1 trên `cave-mouth`) + bóng nhún, ba sừng thôi lắc lư nền; bậc 3: bàn tay kéo vật từ tay ba sừng → bóng đúng; bậc 4: bóng mồi mờ 60% và không nhận vật, `setSnapScale(bóng đúng, 2)`
**And** bậc không giảm trong câu, reset khi sang câu mới; Loa phát lại câu hỏi mà không reset bậc

**Given** câu thoại `vo.shadow-match.ask.<itemId>` ("<Tên> trốn ở cái bóng nào?") và `vo.shadow-match.name.<itemId>` ("Con mèo!", "Ô tô!"…) cho mọi vật của danh mục bậc này
**When** chạy `tools/tts` + `npm run check`
**Then** mọi câu ≤ 8 từ, từ khoá ("bóng nào") cuối câu, không cặp đồng âm cấm, không "sai"/lời khen; tên đọc ra bằng `say` (một id) hoặc `sayChain` khi ghép tên
**And** sau câu thứ 4 ba sừng diễn tư thế vui + nhạc 1–2s, rồi game phát đúng một `round:complete { gameId: 'shadow-match', questions: 4, firstTryCorrect, maxHintLevel }`; Nhà giữa lượt → đúng một `round:abandon`; trò chạy đủ khi không có Epic 2

### Story 3.6: Tìm bóng – thang 2 → 3 → 4 bóng giống nhau dần và lượt dở

As a bé 2–4 tuổi,
I want có thêm bóng và các bóng giống nhau hơn khi em đã tìm giỏi,
So that em phải quan sát kỹ hình dáng hơn mà vẫn luôn tìm ra được.

**Covers:** FR21, FR20, NFR1, NFR4, NFR12, AR3, AR8, AR14, AR29, AR42, UX-DR26, UX-DR48, UX-DR62, UX-DR74

**Acceptance Criteria:**

**Given** `content/games/shadow-match.ts` gắn mỗi vật một `shapeGroup` (ví dụ `quadruped`, `bird`, `car`, `truck`) và export `ladder` 3 bậc: bậc 0 = 2 bóng khác `shapeGroup`, bậc 1 = 3 bóng (ít nhất 2 nhóm khác nhau), bậc 2 = 4 bóng cùng một `shapeGroup` (ví dụ mèo, chó, bò, ngựa); mỗi bậc 4 câu/lượt
**When** sinh câu hỏi theo `seed` và `level` (Vitest)
**Then** số bóng và quy tắc nhóm đúng theo bậc, luôn có đúng 1 bóng đúng, không bao giờ có hai bóng của cùng một vật
**And** cùng `seed` cho cùng chuỗi vật + vị trí bóng; vị trí bóng đúng không trùng vị trí của câu ngay trước; không vật nào lặp lại trong một lượt

**Given** bậc 2 với 4 bóng cùng nhóm bốn chân
**When** kiểm tra danh mục bằng validator nội dung
**Then** mọi cặp bóng trong cùng nhóm vẫn khác nhau rõ về đường viền (mỗi vật có ít nhất một đặc điểm hình riêng: sừng, bờm, đuôi dài, tai vểnh… ghi trong content) – bóng là thông tin hình, không dựa vào màu
**And** mỗi bóng ≥ 120px, 4 bóng cùng nằm trong `safeRect` với khe ≥ 24px, ngoài vùng ~120×120 quanh nút Nhà/Loa

**Given** bé đang ở câu thứ 3, đã thả sai 2 lần rồi bấm Nhà
**When** game phát `round:abandon`
**Then** `snapshot = { v: 1, level, seed, questionIndex: 2, partial: {} }` là JSON thuần (vật đã xong ở câu trước suy ra từ `seed`)
**And** khi shell `scene.start('shadow-match', { level, seed, resume: snapshot })` (kiểm phía game; việc Map giữ và trả snapshot khi vào lại trạm chỉ có khi có Epic 2 – Story 2.5), ba sừng đưa lại đúng vật của câu 3 với cùng bộ bóng, câu hỏi phát lại, gợi ý bắt đầu từ bậc 0; `partial` hỏng → bắt đầu câu đó bình thường + `console.warn`

**Given** câu thoại cho toàn bộ danh mục vật của 3 bậc
**When** chạy `npm run check`
**Then** mỗi vật có đúng một file câu hỏi và một file đọc tên, validator voice↔file↔hash và đồng âm pass
**And** `RoundOutcome.questions === 4` ở mọi bậc; một lượt chỉ cần một câu chạm bậc gợi ý 4 thì `maxHintLevel === 4` (để `nextLevel` hạ bậc)

## Epic 4: Trò chạm và vạch – Đường đua, Câu cá, Chạm là nói

Ba trạm cuối cùng còn "ngủ" trên đảo (cổng caro, hồ cá, phố) thức dậy và chơi được: bé vạch ngón tay dọc đường đua để kart có bạn nhỏ lái chạy tới cổng caro (kart không bao giờ rời đường, nhấc tay không mất tiến trình); bé chạm câu đúng con cá theo màu/hoa văn hoặc kích thước và nghe đọc tên con cá vừa câu; bé chạm tự do khám phá 3 cảnh (biển, đường phố, nhà bếp) để nghe tên tiếng Việt của đồ vật, cứ ~8 vật khác nhau thì được một món trang trí đảo. Mỗi trò là một `MiniGame` (AD-1) đăng ký trong `games/registry.ts`, dùng primitives `TracePath`/`TapTarget` của `core/input` (AD-4), âm thanh qua `AudioDirector` (AD-3), gợi ý qua `HintDirector` (AD-5, trừ Chạm là nói), nội dung là dữ liệu (AD-6) và hình render sẵn qua pipeline Blender → layout/atlas (AD-10). Đường đua và Câu cá phát đúng một `round:complete` sau khi nhân vật ăn mừng xong; Chạm là nói không có lượt, phát `reward:earned` mỗi ~8 chạm khác nhau và chỉ rời qua `round:abandon`. Mọi trò vẫn chơi trọn vẹn khi không có phản hồi thưởng của Epic 2.

### Story 4.1: Đường đua – vạch đường thẳng cho kart chạy tới cổng caro

As a bé 2–4 tuổi,
I want vạch ngón tay dọc con đường để chiếc kart có bạn nhỏ lái chạy theo tới cổng caro,
So that bé luyện vận động ngón tay có kiểm soát mà không bao giờ bị "sai" hay phải làm lại từ đầu.

**Covers:** FR10, FR12, NFR1, NFR3, NFR4, NFR5, NFR11, NFR13, AR3, AR5, AR15, AR18, AR23, AR24, AR25, AR27, AR29, AR37, AR38, AR39, AR41, AR42, UX-DR5, UX-DR8, UX-DR19, UX-DR27, UX-DR28, UX-DR31, UX-DR44, UX-DR49, UX-DR51, UX-DR58, UX-DR64, UX-DR71

**Acceptance Criteria:**

**Given** `art/race.blend` (kart Kenney car-kit có bạn nhỏ mặt sáng, mắt to, mũ màu tươi; cọc cone, cổng caro) với camera cố định và các object `anchor.path.straight-<n>.<nn>` cho tối thiểu 3 đường gần thẳng
**When** chạy `tools/render` rồi `tools/atlas`
**Then** sinh ra `content/generated/race.layout.json` (toạ độ px design 1×), `public/assets/atlases/race.png|json` (key `atlas.race`, frame `kart/idle/<nn>`, `kart/wave/<nn>`, `gate/idle/<nn>`; trang ≤ 2048², file ≤ 8 MiB) và nền `bg.race`
**And** validator của `npm run check` fail nếu bất kỳ điểm nào của dải đường rộng 100px (`components.trace-path.width`) nằm ngoài `Tokens.safeRect`, trong dải mép chết (24/32/40px + safe-area) hoặc trong vùng 120×120px quanh nút Nhà/Loa

**Given** game `race` đã đăng ký trong `games/registry.ts` với `ladder` (bậc 0 = đường gần thẳng) và `assets` (`atlas.race`, `bg.race`, các voice/SFX của trò)
**When** bé chạm trạm cổng caro trên bản đồ
**Then** trạm không còn ở trạng thái "ngủ": trạm nhún + đọc tên, kart bản đồ chạy tới (≤ 2s, tài nguyên tải trong lúc kart chạy), shell `scene.start('race', { level, seed })`
**And** màn hiện `trace-path` (mặt `road`, lề 6px `road-edge`, vạch giữa `road-dash`) với kart ở điểm đầu, cổng caro ở điểm cuối, và `HintDirector.beginQuestion({ promptLineId: 'vo.race.prompt', step: { action: 'trace', path, correct: [kart], distractors: [], target: gate } })` phát *"Bé lái xe tới cổng nhé!"*; đồng hồ gợi ý chỉ chạy sau `speechEnded` đúng token

**Given** bé đặt ngón trong ~100px quanh kart và vạch dọc đường (xử lý chỉ qua `TracePath` của `core/input`; nếu `TracePath` chưa có thì story này hiện thực nó cùng Vitest cho phép chiếu/dung sai)
**When** ngón lệch khỏi tâm đường lần lượt 60px, 110px và 160px
**Then** ở 60px (≤ 80px) kart theo sát điểm chiếu gần nhất; ở 110px (80–140px) kart vẫn tiến nhưng với một nửa tốc độ; ở 160px (> 140px) kart dừng chờ như nhấc tay
**And** kart luôn nằm trên đường và chỉ tiến không lùi: kéo ngón ngược về phía điểm đầu không làm kart lùi; điểm chiếu chỉ được tìm trong đoạn liền kề phía trước kart (không nhảy cóc sang đoạn đường khác đang nằm gần ngón)
**And** đoạn đường kart đã đi sáng hơn đoạn chưa đi; phản hồi hình ảnh đầu tiên khi đặt ngón (kart nhích/nhún) xuất hiện ≤ 100ms

**Given** kart đang ở giữa đường
**When** bé nhấc tay (hoặc ngón lệch > 140px)
**Then** kart dừng tại chỗ, khẽ nhấp nháy với tần số ≤ 1Hz (không chớp sáng–tối mạnh), tiến trình giữ nguyên
**And** đặt ngón lại trong ~100px quanh kart → kart đi tiếp từ vị trí đang dừng; đặt ngón cách kart > 100px → không có gì xảy ra (không tính lỗi, không làm lại từ đầu)
**And** ngón thứ hai chạm màn trong lúc vạch bị bỏ qua và không huỷ ngón đầu (ngón đầu tiên thắng); chạm bắt đầu trong dải mép chết không bắt đầu vạch

**Given** bé không vạch sau khi câu yêu cầu kết thúc
**When** đồng hồ của `HintDirector` đạt bậc 2 (~6s) rồi bậc 3 (+~6s)
**Then** bậc 2: `hint-ring` quanh kart + vạch giữa đường phía trước sáng chạy dần, mọi chuyển động nền dừng; bậc 3: `hint-hand` 72px diễn vạch một đoạn phía trước kart, lặp ~15s (giọng nhắc ~30s, do HintDirector phát)
**And** trò không bao giờ gọi `hint.wrong()` (đường đua không có "sai"), không phát tiếng/màu "sai", và kart không bao giờ tự chạy hộ bé

**Given** kart chạm cổng caro ở đường cuối cùng của lượt (3 đường ở bậc 0)
**When** bạn nhỏ vẫy tay (`kart/wave`) + còi "bíp" vui + nhạc 1–2s và tư thế vui (nhún 1.0→1.12→1.0, 2 lần, 0.8s) kết thúc
**Then** game phát đúng một `round:complete` với `RoundOutcome = { gameId: 'race', questions: 3, firstTryCorrect, maxHintLevel }`, trong đó một đường tính "đúng ngay lần đầu" khi xong mà bậc gợi ý của đường đó vẫn là 0
**And** sau khi phát, game trơ (không nhận vạch, tắt gợi ý, bỏ qua Nhà); ở các đường trước đường cuối, tới cổng chỉ ăn mừng ngắn rồi `hint.questionDone()` và sang đường tiếp theo; bấm Nhà giữa lượt phát `round:abandon` (không phát `round:complete`)

**Given** mọi câu thoại mới của trò (`vo.race.prompt`, `vo.race.retry`…) trong `content/voice-lines.ts`
**When** chạy `npm run content:export` + `tools/tts` rồi `npm run check`
**Then** mỗi id có file `public/assets/audio/vo/<id>.m4a` + `.hash` khớp, câu ≤ 8 từ, từ khoá cuối câu, không cặp đồng âm cấm; SFX (`sfx.race.horn`, `sfx.race.engine`) có trong `content/audio-catalog.ts`, không gọi `this.sound.*` hay `this.load.*` trong `games/race`
**And** `npm run check` qua toàn bộ

### Story 4.2: Đường đua – thang hình dạng đường và giữ vị trí kart khi lượt dở

As a bé 2–4 tuổi,
I want đường đua dần cong hơn, zíc-zắc rồi thành vòng tròn khi bé đã vạch giỏi,
So that thử thách lớn lên cùng bé mà bé vẫn luôn về tới cổng.

**Covers:** FR11, FR12, NFR4, NFR11, AR8, AR14, AR25, AR37, AR42, UX-DR27, UX-DR47, UX-DR51, UX-DR58, UX-DR72, UX-DR73

**Acceptance Criteria:**

**Given** `art/race.blend` bổ sung anchor cho các hình `curve-<n>`, `zigzag-<n>`, `loop-<n>` và `content/games/race.ts` khai báo `ladder` 4 bậc: gần thẳng → cong nhẹ → zíc-zắc → vòng tròn, mỗi bậc chỉ định số đường mỗi lượt trong khoảng 3–5
**When** chạy render + `npm run check`
**Then** mọi đường ở mọi bậc đều nằm trọn trong `Tokens.safeRect`, ngoài dải mép chết và vùng nút 120×120px; zíc-zắc có bán kính góc đủ để dải 100px không tự chồng lên chính nó
**And** check fail nếu một `pathId` dùng trong content không có anchor trong `race.layout.json`

**Given** cùng `{ level, seed }`
**When** shell start `race` hai lần
**Then** danh sách đường (hình, thứ tự, số đường 3–5) giống hệt nhau (suy ra tất định từ `seed`), và hai đường liên tiếp trong một lượt không trùng nhau

**Given** đường vòng tròn mà điểm đầu và cổng caro cách nhau ≤ 150px
**When** bé đặt ngón ngay tại cổng lúc kart còn ở điểm đầu
**Then** kart không nhảy tới cổng (chỉ chiếu trong đoạn liền kề phía trước kart); kart chỉ tới cổng sau khi đi hết vòng
**And** ở các khúc zíc-zắc, ngón cắt góc trong phạm vi 80px vẫn kéo kart tiến dọc đường, không làm kart đi tắt khỏi mặt đường

**Given** bé đã vạch được 60% đường thứ 2 rồi bấm Nhà
**When** game phát `round:abandon { gameId: 'race', snapshot }`
**Then** `snapshot = { v: 1, level, seed, questionIndex: 1, partial: { traceIndex } }` là JSON thuần (không tham chiếu object)
**And** khi shell `scene.start('race', { level, seed, resume: snapshot })` (kiểm phía game; (nếu có Epic 2) Map trả snapshot này khi bé vào lại trạm trong cùng phiên) → cùng đường thứ 2, kart đứng đúng vị trí cũ (sai lệch ≤ 1 điểm mẫu của đường), đoạn đã đi vẫn sáng, kart ở trạng thái dừng chờ, câu yêu cầu được phát lại và thang gợi ý bắt đầu từ bậc 0

**Given** gợi ý đang ở bậc ≥ 2 (`hint:level`)
**When** cảnh có chuyển động nền (cờ, cone lắc, mây)
**Then** mọi chuyển động nền dừng, chỉ còn một chuyển động nổi bật (vòng gợi ý/vạch sáng chạy dần); không vùng sáng–tối đảo nhanh > 25% màn
**And** khi `prefers-reduced-motion` bật: biên độ nhún/vẫy giảm, vạch sáng chạy dần thay bằng sáng tĩnh mờ dần, nhấp nháy của kart khi chờ vẫn ≤ 1Hz

**Given** `RoundOutcome` của một lượt bậc 2 với mọi đường xong ở bậc gợi ý 0
**When** Map gọi `nextLevel`
**Then** lượt sau ở bậc 3 (vòng tròn); vì đường đua không gọi `hint.wrong()`, `maxHintLevel` của trò tối đa là 3, nên lượt có gợi ý chỉ giữ nguyên bậc, không bao giờ hạ; bậc 3 xong hoàn hảo vẫn ở bậc 3 (kẹp trong `ladder.length = 4`)
**And** `npm run check` qua

### Story 4.3: Câu cá – chạm câu đúng con cá theo màu và hoa văn

As a bé 2–4 tuổi,
I want chạm vào con cá có màu (và hoa văn) cô vừa gọi để câu nó lên và nghe tên của nó,
So that bé học màu sắc qua một trò chạm đơn giản, kể cả khi bé khó phân biệt màu.

**Covers:** FR13, FR14, NFR1, NFR3, NFR4, NFR5, NFR9, NFR12, AR3, AR5, AR18, AR21, AR23, AR24, AR25, AR27, AR37, AR38, AR39, AR42, UX-DR5, UX-DR24, UX-DR31, UX-DR45, UX-DR46, UX-DR47, UX-DR48, UX-DR49, UX-DR50, UX-DR59, UX-DR74

**Acceptance Criteria:**

**Given** `art/fishing.blend` với hồ, cầu gỗ (dock), cần câu và cá Quaternius cutefish (Goldfish, Clownfish, Koi…) tô lại màu `creature-*`, bỏ vệt đỏ quanh miệng, mỗi màu một hoa văn riêng (ví dụ vàng–sọc, cam–chấm, xanh–vây to) và độ sáng khác nhau rõ, mỗi con hai cỡ (to ≈ 1.6× nhỏ, nhỏ hiển thị ≥ 100px)
**When** chạy render + atlas
**Then** sinh `fishing.layout.json` có đa giác `hit.pond-swim` (vùng bơi an toàn) và anchor dock/cần câu, atlas `atlas.fishing` với frame `fish-<color>-<size>/swim|dive|caught/<nn>`, nền `bg.fishing`
**And** validator: `hit.pond-swim` (đã trừ nửa kích thước cá to + hit-pad 30px) không được nằm ngoài `Tokens.safeRect`, không được chạm dải mép chết hay vùng nút 120×120px – vi phạm → check fail; ảnh render được kiểm: hai màu bất kỳ khác nhau cả về hoa văn lẫn độ sáng

**Given** game `fishing` đăng ký trong registry (bậc 0: 3 cá, câu theo màu, các màu khác hẳn nhau), trạm hồ cá trên bản đồ thức dậy và vào trò như Story 4.1
**When** câu hỏi bắt đầu
**Then** 3 cá bơi chậm ≤ 60px/s (`components.fish.speed-max`), luôn nằm trọn trong vùng bơi, cách nhau ≥ 24px; luôn có ≥ 1 cá đúng và cá đúng không bao giờ rời màn
**And** `HintDirector.beginQuestion({ promptLineId, step: { action: 'tap', correct: [cá đúng], distractors: [cá sai] } })` phát câu dạng *"Câu con cá vàng sọc nào!"* (gọi cả màu lẫn hoa văn, ≤ 8 từ, từ khoá cuối, không cặp đồng âm cá/cà, cam/cầm…)

**Given** cá đang bơi 60px/s và bé chạm vào chỗ con cá ở 150ms trước (bị lệch ~9px so với vị trí hiện tại, nằm ngoài vùng chạm hiện tại)
**When** `TapTarget` kiểm tra chạm
**Then** chạm được tính trúng con cá đó (hit-test theo vị trí 150ms trước, vùng chạm = hình + 30px); nếu chạm trúng hai cá thì cá có tâm gần điểm chạm nhất thắng
**And** phản hồi hình ảnh/âm thanh (gợn nước hoặc cá nảy) bắt đầu ≤ 100ms; ngón thứ hai trong lúc ngón đầu đang giữ bị bỏ qua

**Given** bé chạm cá sai
**When** game gọi `hint.wrong()`
**Then** cá sai lặn xuống nhẹ (chìm mờ dần + bong bóng), không nhận chạm khi đang lặn, nổi lại ở vùng bơi sau ~3s; không màu đỏ, không ✗, không tiếng "sai"; câu nhắc ngắn do HintDirector phát (tối đa 1 lần/10s)
**And** bé chạm vào nước (không trúng cá nào, kể cả cá đang lặn) → gợn nước + "tõm", không gọi `hint.wrong()` và không tính vào số lần chưa đúng

**Given** thang gợi ý leo theo thời gian hoặc số lần chưa đúng
**When** đạt bậc 2, 3, 4
**Then** bậc 2: `hint-ring` quanh cá đúng, cá đúng bơi chậm lại, cá khác dừng bơi; bậc 3: `hint-hand` diễn chạm vào cá đúng, lặp ~15s; bậc 4: cá sai mờ 60% và không chạm được (chỉ qua `InputGuard.setPickable(fish, false)`), bé vẫn phải tự chạm cá đúng
**And** vòng gợi ý giữ nguyên khi bé chạm nước/cá khác, chỉ tắt khi câu đúng

**Given** bé chạm cá đúng
**When** cá được câu
**Then** dây câu kéo cá lên, cá quẫy (frame `caught`), app đọc tên/mô tả bằng một line hoặc `sayChain` (ví dụ *"Cá vàng nhỏ!"*), cá nhảy khỏi nước vui + nhạc 1–2s, rồi `hint.questionDone()` và sang câu tiếp với cá mới
**And** sau câu cuối (3 câu ở bậc 0) và khi màn ăn mừng kết thúc, game phát đúng một `round:complete` `{ gameId: 'fishing', questions: 3, firstTryCorrect, maxHintLevel }` (câu "đúng ngay lần đầu" = lần chạm cá đầu tiên của câu là cá đúng; chạm nước không tính), rồi trơ; `npm run check` qua (voice ↔ file ↔ hash cho mọi line `vo.fishing.*`)

### Story 4.4: Câu cá – câu theo kích thước, thang 3→5 cá và giữ câu dở

As a bé 2–4 tuổi,
I want có khi được gọi câu cá to hay cá nhỏ, và hồ có thêm cá khi bé đã giỏi,
So that bé học thêm khái niệm to/nhỏ và luôn có thử thách vừa sức.

**Covers:** FR13, FR14, NFR4, NFR11, NFR12, AR8, AR14, AR25, AR27, AR42, UX-DR24, UX-DR59, UX-DR72, UX-DR73, UX-DR74

**Acceptance Criteria:**

**Given** `content/games/fishing.ts` có `ladder` ≥ 4 bậc: 3 cá theo màu khác hẳn → 3–4 cá có câu theo cỡ ("Câu con cá to nào!") → 4 cá trộn màu/cỡ → 5 cá
**When** shell start `fishing` ở từng bậc với cùng `seed`
**Then** số cá, yêu cầu và vị trí xuất phát giống hệt nhau giữa hai lần start (tất định từ `seed`), số cá ∈ [3, 5] và đúng như bậc khai báo
**And** mỗi lượt có 3–5 câu; luôn ≥ 1 cá đúng trên màn trong suốt câu hỏi

**Given** câu hỏi theo cỡ "Câu con cá to nào!"
**When** sinh cá cho câu
**Then** cá to ≈ 1.6× cá nhỏ (dung sai ±0.1), có ít nhất một cá nhỏ cùng màu với một cá to (để cỡ là đặc điểm duy nhất phân biệt), và chạm cá nhỏ → lặn như cá sai; tên đọc khi câu lên gồm cỡ (ví dụ *"Cá cam to!"*)
**And** không bao giờ có câu vừa hỏi màu vừa hỏi cỡ (một yêu cầu mỗi câu)

**Given** 5 cá trên màn cùng bơi
**When** quan sát bằng log vị trí từng frame
**Then** không cá nào vượt 60px/s, không cá nào ra khỏi vùng bơi an toàn, các cá giữ khoảng cách ≥ 24px; tại một thời điểm chỉ một chuyển động nổi bật (khi có vòng gợi ý, cá khác dừng bơi)
**And** khi `prefers-reduced-motion` bật: tốc độ bơi giảm, biên độ quẫy/nhảy giảm, bong bóng khi lặn thay bằng mờ dần

**Given** bé đang ở câu 3 của lượt, đã chạm sai 1 lần, rồi bấm Nhà
**When** game phát `round:abandon`
**Then** `snapshot = { v: 1, level, seed, questionIndex: 2, partial: {} }` là JSON thuần; shell `scene.start('fishing', { level, seed, resume: snapshot })` (kiểm phía game; (nếu có Epic 2) Map trả snapshot khi vào lại trạm trong phiên) → tiếp tục đúng câu 3 với cùng yêu cầu (tất định từ `seed`), câu yêu cầu phát lại, thang gợi ý bắt đầu từ bậc 0
**And** lượt có câu chạm gợi ý bậc 4 → `RoundOutcome.maxHintLevel = 4` và Map hạ một bậc qua `nextLevel` (kẹp ≥ 0); mọi câu đúng ngay lần đầu → tăng một bậc (kẹp ≤ `ladder.length - 1`)

**Given** toàn bộ line mới (`vo.fishing.prompt.size.*`, `vo.fishing.name.<color>-<size>`)
**When** `npm run check`
**Then** mỗi tổ hợp màu × cỡ dùng trong `ladder` có đúng một line + file + hash, validator đồng âm qua, và check qua toàn bộ

### Story 4.5: Chạm là nói – cảnh biển, chạm vật nghe tên

As a bé 2–4 tuổi,
I want chạm vào bất cứ đồ vật nào trong cảnh biển để nó cử động, kêu và được đọc tên,
So that bé tự do khám phá và học từ tiếng Việt mà không có yêu cầu hay đúng/sai.

**Covers:** FR16, FR17, NFR1, NFR3, NFR5, NFR10, NFR11, AR3, AR9, AR15, AR16, AR18, AR27, AR28, AR37, AR38, AR39, AR41, AR42, UX-DR30, UX-DR54, UX-DR60, UX-DR66, UX-DR71, UX-DR72

**Acceptance Criteria:**

**Given** `art/touch-talk.blend` có cảnh biển với 8–12 đồ vật (ví dụ thuyền, cá, cua, sao biển, ô che nắng, xô xẻng, hải âu, quả dừa) từ Kenney/Quaternius, tô màu tươi, mỗi vật có `hit.prop.<propId>`
**When** chạy render + atlas + `npm run check`
**Then** sinh `touch-talk.layout.json`, `atlas.touch-talk` (frame `<propId>/idle|react/<nn>`), nền `bg.touch-talk.sea`
**And** validator fail nếu vùng chạm một vật (hình + 24px) < 80px, hai vùng chạm cách nhau < 24px, hoặc nằm ngoài `Tokens.safeRect`/trong dải mép chết/trong vùng nút 120×120px và cột `scene-bubble` mép phải

**Given** game `touch-talk` đăng ký trong registry (không có `ladder`, không có mục difficulty trong `ProgressStore`), trạm phố trên bản đồ thức dậy
**When** bé vào trò
**Then** cảnh biển hiện, không có câu yêu cầu, không gọi `HintDirector`, không có tiếng/hình "sai"
**And** game không bao giờ phát `round:complete` (kiểm bằng test bus spy sau ≥ 30 lần chạm)

**Given** bé chạm một vật (qua `TapTarget`)
**When** chạm được nhận
**Then** vật nảy 1.1× trong 0.3s và tiếng của vật (ví dụ thuyền "tu tu", cá quẫy) phát ≤ 100ms sau chạm, rồi `audio.say('vo.touch-talk.name.<propId>')` đọc tên (ví dụ *"Con cua!"*)
**And** chạm vào nền (không trúng vật) → không phát giọng, không lỗi

**Given** một kênh giọng duy nhất
**When** bé chạm vật B lúc tên vật A còn < 0.5s → tên A phát xong rồi mới đọc tên B; bé chạm lại vật A đang được đọc tên → bỏ qua phần giọng; bé chạm liên tiếp 5 vật trong 1s
**Then** không bao giờ có hai câu chồng nhau; hiệu ứng nảy + tiếng nhỏ vẫn phát ngay ≤ 100ms cho mọi lần chạm; nhạc nền hạ ≥ 18dB khi có giọng
**And** nút Loa phát lại tên vật được đọc gần nhất (qua `audio.setPrompt`); chưa chạm vật nào thì Loa đọc tên cảnh *"Biển!"*

**Given** bé không chạm gì
**When** yên ~15s (`Tokens.Timing`, đồng hồ theo `time` của scene nên dừng khi pause)
**Then** một vật ngẫu nhiên khẽ lắc (không giọng, không vòng gợi ý), mỗi lần chỉ một vật, lặp lại sau mỗi ~15s yên tiếp theo; chạm bất kỳ reset đồng hồ yên
**And** không có nhấp nháy > 1Hz; khi `prefers-reduced-motion` bật biên độ nảy/lắc giảm

**Given** bé bấm Nhà
**When** `Hud` phát `hud:home`
**Then** game phát `round:abandon { gameId: 'touch-talk', snapshot }` với `partial: { sceneId: 'sea', touchedIds: [...] }` (JSON thuần) rồi trơ; đây là cách duy nhất rời trò
**And** mọi line `vo.touch-talk.*` có file + hash, câu tên ≤ 8 từ; `npm run check` qua

### Story 4.6: Chạm là nói – ba cảnh, nút đổi cảnh và món trang trí sau ~8 vật

As a bé 2–4 tuổi,
I want đổi giữa biển, đường phố và nhà bếp, và thỉnh thoảng được một món quà bay về đảo,
So that bé có nhiều đồ vật để khám phá và thấy hòn đảo của mình đẹp dần lên nhờ chơi.

**Covers:** FR15, FR17, NFR3, NFR11, NFR13, AR9, AR13, AR14, AR37, AR41, AR42, UX-DR29, UX-DR35, UX-DR54, UX-DR60, UX-DR73

**Acceptance Criteria:**

**Given** `art/touch-talk.blend` bổ sung cảnh đường phố (Kenney city kits: ô tô, xe buýt, đèn giao thông, cây, nhà…) và nhà bếp (Kenney food kit: nồi, chảo, quả táo, bánh mì…), mỗi cảnh 8–12 vật
**When** chạy render + atlas + `npm run check`
**Then** có nền `bg.touch-talk.street`, `bg.touch-talk.kitchen`, `hit.prop.<propId>` cho mọi vật, mọi vật qua cùng validator vùng chạm như Story 4.5; tổng atlas của trò vẫn ≤ 2048² mỗi trang và ≤ 8 MiB mỗi file
**And** chạm ô tô → bóp còi + *"Ô tô!"*; mọi tên vật có line + file + hash, không cặp đồng âm cấm trong cùng câu (validator)

**Given** 3 `scene-bubble` 88px dọc mép phải dưới nút Loa (bắt đầu dưới top 120), khe ≥ 24px, ngoài dải mép chết, mỗi nút là hình thu nhỏ của cảnh
**When** bé chạm bubble "phố" khi đang ở biển
**Then** cảnh trượt ngang sang đường phố trong ~0.6s + đọc *"Đường phố!"*; bubble của cảnh hiện tại có `hint-ring` mảnh
**And** chạm bubble của cảnh đang hiện chỉ đọc lại tên cảnh, không trượt; chạm vật trong lúc đang trượt bị bỏ qua; khi `prefers-reduced-motion` bật, trượt ngang thay bằng chuyển mờ

**Given** bộ đếm vật **khác nhau** đã chạm (tính trên cả 3 cảnh, chạm lại vật đã chạm không tăng đếm)
**When** bé chạm vật khác nhau thứ 8 (ngưỡng ~8 lấy từ content)
**Then** game phát đúng một `reward:earned { gameId: 'touch-talk' }` và bộ đếm bắt đầu lại từ 0 (vật đã chạm được tính lại trong nhóm mới)
**And** chạm 8 lần cùng một vật → không phát `reward:earned`; chạm 16 vật khác nhau → phát đúng 2 lần

**Given** `reward-service` trả `reward:granted { gameId: 'touch-talk', decorationId }`
**When** game nhận sự kiện (qua `bus.scoped(scene)`)
**Then** đúng món `decorationId` đó hiện cạnh vật vừa chạm, có sao nhỏ `sparkle` mờ dần (không chớp), rồi bay ra khỏi khung về phía bản đồ (~1s); bé vẫn chạm vật được trong lúc món bay; (nếu có Epic 2) `SessionStore.pendingFlyIns` có món đó cho trạm `touch-talk` để lần về bản đồ sau món lấp lánh ở trạm phố
**And** nếu không có `reward:granted` (không có dịch vụ thưởng) → không hiện gì, không lỗi, trò chơi tiếp bình thường

**Given** bé đang ở nhà bếp, đã chạm 5 vật khác nhau trong nhóm hiện tại, rồi bấm Nhà
**When** game phát `round:abandon`
**Then** `snapshot.partial = { sceneId: 'kitchen', touchedIds: [5 id] }`; shell `scene.start('touch-talk', { seed, resume: snapshot })` (kiểm phía game; (nếu có Epic 2) Map trả snapshot khi vào lại trạm trong phiên) → mở đúng cảnh nhà bếp, chạm thêm 3 vật khác nhau mới → phát `reward:earned`
**And** tắt app rồi mở lại → bắt đầu ở cảnh biển với bộ đếm 0; `npm run check` qua

---

# Cập nhật 2026-10-16: trò vui hơn cho bé 3 tuổi và Nhà Xoài

> Nguồn: PRD cập nhật 2026-10-16 (`prds/prd-be-hoc-choi-2026-10-08/prd.md`, FR29–FR63; research `research-hap-dan-tre-3-tuoi.md`). Epic 1–4 đã build. Phần dưới **thêm** yêu cầu và Epic 5–8; yêu cầu cũ vẫn có hiệu lực trừ chỗ ghi "thay".
>
> Quyết định khi chia việc (2026-10-18, memlog): (1) PRD NFR10 "lời ngắn" ghi ở đây là **NFR15** (NFR10 đã là âm lượng); (2) NFR3 "không lời khen" giữ nguyên – tên "Xoài" dùng trong chào, mời, yêu cầu, không trong lời khen; (3) 5 trò mới nằm trong **một trạm mới "Nhà Xoài"** trên đảo, mở ra màn **sân nhà** có 5 góc chơi (đảo đã kín chỗ: 7 trạm + ô trang trí); (4) phong cách hình theo NFR9 sửa dưới đây (đã áp dụng cho 8 cảnh hiện có bằng `tools/render/blender/cute.py` và `art/src/map-v3.blend`).

## Yêu cầu bổ sung

### Functional Requirements (mới / sửa)

**F0 – Trải nghiệm chung**
- **FR29 – Chạm-rồi-chạm**: mọi thao tác "đưa vật đến chỗ" làm được bằng kéo, hoặc chạm vật (vật nhấc lên, có vòng chọn) rồi chạm chỗ đặt. Kéo mà nhấc tay giữa chừng thì vật nằm yên tại chỗ nhấc tay (trong vùng chơi), không bật về.
- **FR30 – Chọn khác yêu cầu cũng vui**: mỗi trò có một phản ứng hài riêng của nhân vật khi bé chọn khác yêu cầu, rồi một câu nhắc ngắn; không âm báo "sai".
- **FR31 – Phản ứng ngẫu nhiên**: mỗi trò có ≥ 3 phản ứng khác nhau cho kết quả đúng, chọn ngẫu nhiên không lặp liền.
- **FR32 – Chơi tự do**: hết câu hỏi của lượt, trò sang chế độ tự do (giọng đọc im; bé nghịch tiếp; Nhà để thoát). Thưởng và chuỗi sau lượt chạy khi bé về đảo.
- **FR33 – Chạm gì cũng có phản ứng**: mọi nhân vật, đồ vật sprite và đồ trang trí nhún/kêu khi chạm; chạm vào nền trống có gợn sáng nhỏ ở ngón tay.
- **FR34 – Bạn dẫn đường**: Shiba ở bản đồ chào bé khi vào đảo và vẫy khi bé ngồi yên.
- **FR35 – Câu nhắc cho bố mẹ**: tối đa 1 câu mời bố mẹ mỗi lượt ("Hỏi mẹ xem…"), mặc định bật.
- **FR36 – Gọi tên Xoài**: lời chào, lời mời và một phần câu yêu cầu gọi "Xoài" (không lời khen – NFR3).

**F1 – Đảo**
- **FR37**: mỗi trạm có dấu hiệu nhận ra từ xa; đảo có chuyển động nhẹ (mây trôi, sóng, cá voi phun nước, đài phun nước) – một chuyển động nổi bật một lúc (NFR11).

**F2–F8 – Bảy trò**
- **FR6 (thay)**: Tiệm kem – viên khác vị: Shiba liếm thử, phản ứng hài theo vị, rồi kem trôi về và giọng nhắc.
- **FR38**: Tiệm kem – phản ứng đúng: liếm / rùng mình / hắt xì; đôi khi kem dính mũi, bé chạm để lau.
- **FR39**: Tiệm kem – tự do: xếp tháp kem cao tùy thích, quá cao thì lắc rồi đổ vui.
- **FR40**: Pizza – đặt nhiều hơn yêu cầu vẫn được (bánh rung, cáo tròn mắt, đếm tiếp).
- **FR41**: Pizza – cáo ăn có phản ứng theo topping (ớt: "cay quá!" + khói nhỏ); bánh phồng khi nướng, khói, cáo nhai. *(Hình + hoạt hình nướng/ăn đã làm 2026-10-16.)*
- **FR42**: Pizza – tự do: phủ topping tùy ý, nướng bao nhiêu lần cũng được.
- **FR43**: Đường đua – đường cấp đầu ngắn (một lần đặt tay); về đích có rửa xe (chạm phun nước, bọt, xe bóng).
- **FR44**: Đường đua – bé chọn màu xe trước khi chạy; xe giữ màu đó trên đảo.
- **FR45**: Câu cá – cá trốn sau rong/đá rồi ló ra; chạm nhầm thì cá té nước. *(Té nước đã làm.)*
- **FR46**: Câu cá – cá câu được vào bể cá của bé trên đảo; chạm bể xem cá bơi. *(Hình hồ + dây võng đã làm.)*
- **FR47**: Chạm là nói – mỗi vật 2–3 phản ứng; mỗi cảnh ≥ 2 chỗ trốn có con vật/đồ vật nhảy ra.
- **FR48**: Ghép khủng long – mỗi loài có điệu nhảy + tiếng kêu riêng khi sống dậy (tiếng nhỏ, không gầm to – NFR10).
- **FR49**: Ghép khủng long – mảnh đặt nhầm chỗ gắn tạm, khủng long kêu "ơ?", sau vài giây mảnh tự trượt về khay.
- **FR50**: Tìm bóng – vật để bé cầm ≥ kích thước kéo tối thiểu (NFR1), không nhỏ hơn bóng quá nhiều.
- **FR51**: Tìm bóng – vào bóng khác: con vật lắc đầu "không phải nhà tớ"; đúng: chui vào, bóng hóa màu, ló ra chào.

**F9 – Đồ thưởng (thay FR22, FR23 cũ)**
- **FR22 (thay)**: hết lượt có quà theo chủ đề trò, không giống nhau, không phải lượt nào cũng có (thưởng bất ngờ).
- **FR23 (thay)**: đồ thưởng lưu trên máy, xem trên đảo (giữ quy tắc thay món cũ khi đầy).
- **FR52**: có quà → bé chọn 1 trong 2 món rồi đặt vào một ô trống bé chọn gần trạm.
- **FR53**: đồ trên đảo phản ứng khi chạm (lắc, kêu).

**F10–F14 – Nhà Xoài (5 trò mới)**
- **FR54–55 – Ú òa chuồng thú**: 3–5 cửa chuồng rung + tiếng kêu mờ; chạm → con vật ló ra, kêu, đọc tên. Thỉnh thoảng giọng hỏi "Con gì kêu…?".
- **FR56–57 – Bác sĩ thú cưng**: bạn thú có vấn đề nhìn thấy (bùn, đói, trầy, buồn ngủ); bé dùng dụng cụ tương ứng; phản ứng từng bước; cảm ơn khi khỏe.
- **FR58–59 – Ban nhạc**: 4–6 nhạc cụ/con vật kêu theo nốt hài hòa; nhiều ngón cùng lúc; nhịp nền tự làm thỉnh thoảng; **không bài hát**.
- **FR60–61 – Thay đồ Shiba**: chọn mũ/kính/áo; Shiba soi gương, phản ứng; bộ đồ lưu và Shiba mặc ở bản đồ + Tiệm kem.
- **FR62–63 – Giờ đi ngủ**: đánh răng, tắt đèn, đắp chăn cho bạn thú; nhịp chậm, nhạc ru nhẹ tự làm, kết thúc cảnh đêm yên tĩnh (không tối hẳn – NFR11).

### NonFunctional Requirements (sửa / mới)
- **NFR1 (bổ sung)**: đích chạm nhắm ~2 cm (vật kéo ≥ 90px giữ nguyên); không vùng chạm quan trọng sát mép dưới (đã có dải 40px); trò Ban nhạc nhận nhiều ngón cùng lúc (ngoại lệ first-finger-wins, chỉ trong trò đó).
- **NFR2 (bổ sung)**: xem FR29 – nhấc tay giữa đường thì vật nằm lại ở mọi trò kéo (không chỉ trên quầy).
- **NFR9 (thay)**: phong cách **đồ chơi mềm**: bo tròn, smooth shading (cạnh > 65° vẫn sắc), nhân vật chibi đầu to mắt to má hồng, pastel tươi; nguồn Tiny Treats / KayKit / Kenney / Quaternius CC0 + dựng trong Blender (`cute.py`); không modifier subdivision trong file build.
- **NFR15 – Lời ngắn, không bắt chờ**: câu yêu cầu ~2–4 giây; bé chạm thì không phải chờ giọng nói hết; mọi hoạt hình thưởng/chuyển cảnh > ~1.5s chạm bỏ qua được.

### Additional Requirements (bổ sung)
- **AR-N1**: trạm mới `home` ("Nhà Xoài") vào `GAME_IDS`/`STATIONS`, hit đa giác + ô trang trí, qua `validateLayout`/`validateDecorations` như 7 trạm cũ; màn sân nhà là một scene shell mới mở 5 trò con.
- **AR-N2**: 5 trò mới theo khung `MiniGameBase` (round model thuần + scene mỏng), có test vitest cho round model; mỗi trò một builder Blender `build_<id>.py`, sprite render sẵn + atlas ≤ 2048² (NFR13).
- **AR-N3**: mọi lời mới (gồm "Xoài") qua `content` → `npm run tts`; validator đồng âm giữ nguyên.
- **AR-N4**: số liệu hành vi mới đi vào `Tokens` / `Tokens.Timing` (lint `no-magic-numbers`).

## FR Coverage Map (bổ sung)

FR29, FR30, FR31, FR32, FR33: Epic 5 – khung trải nghiệm chung (core)
FR34, FR35, FR36, FR37: Epic 5 – đảo, bạn dẫn đường, tên Xoài, câu nhắc bố mẹ
FR22, FR23, FR52, FR53: Epic 5 – đồ thưởng bé chọn và đặt
FR6, FR38–FR51: Epic 6 – bảy trò vui hơn
FR54, FR55, FR58, FR59, FR62, FR63: Epic 7 – Nhà Xoài: trò chạm
FR56, FR57, FR60, FR61: Epic 8 – Nhà Xoài: chăm sóc và thay đồ

## Epic List (bổ sung)

### Epic 5: Mọi trò đều dễ chạm, vui khi "sai" và có giờ chơi tự do
Bé chạm-rồi-chạm thay vì phải kéo; chọn khác yêu cầu thì nhân vật làm trò hề; hết câu thì được nghịch tự do; chạm gì cũng có phản ứng; Shiba chào "Xoài ơi"; quà thì bé tự chọn và tự đặt lên đảo; đảo có chuyển động vui.
**FRs covered:** FR22, FR23, FR29–FR37, FR52, FR53, NFR2, NFR15

### Epic 6: Bảy trò quen thuộc vui hơn
Áp khung Epic 5 vào từng trò với phản ứng riêng: Shiba hắt xì kem, pizza chất topping, rửa xe sau đua, cá ú òa và bể cá, vật trốn trong Chạm là nói, khủng long nhảy múa, con vật lắc đầu ở hang bóng.
**FRs covered:** FR6, FR38–FR51

### Epic 7: Nhà Xoài – trò chạm mới
Trạm Nhà Xoài trên đảo mở ra sân nhà; bé chơi Ú òa chuồng thú, Ban nhạc trên đảo và Giờ đi ngủ – toàn chạm, không đúng/sai.
**FRs covered:** FR54, FR55, FR58, FR59, FR62, FR63, AR-N1, AR-N2

### Epic 8: Nhà Xoài – chăm sóc và thay đồ
Bé làm bác sĩ cho bạn thú và thay đồ cho Shiba; bộ đồ Shiba mặc theo bé ra đảo và Tiệm kem.
**FRs covered:** FR56, FR57, FR60, FR61

Phụ thuộc: Epic 5 → Epic 6; Epic 5 (5.1, 5.8) → Epic 7 → Epic 8 (8.2 cần Shiba của 5.2).

## Epic 5: Mọi trò đều dễ chạm, vui khi "sai" và có giờ chơi tự do

### Story 5.1: Chạm-rồi-chạm và vật không bật về khi nhấc tay

As a bé 3 tuổi hay nhấc tay giữa chừng,
I want chạm vật rồi chạm chỗ đặt, hoặc kéo mà tuột tay vật vẫn nằm đó,
So that bé không phải giữ ngón tay suốt cả đoạn đường.

**Covers:** FR29, NFR1, NFR2, NFR5

**Acceptance Criteria:**

**Given** một vật kéo được ở Tiệm kem, Pizza, Ghép khủng long hoặc Tìm bóng (`core/input/drag-controller`)
**When** bé chạm (nhấn rồi nhả, di chuyển < ngưỡng chạm) vào vật
**Then** vật nhấc lên (scale nâng + vòng chọn mảnh) trong ≤ 100ms và ở trạng thái "đã chọn"
**And** chạm tiếp vào đích hợp lệ → vật bay tới đích và xử lý y như thả bằng kéo (cùng `outcome`); chạm vào chỗ khác trong vùng chơi → vật bay tới đó và nằm lại; chạm lại chính vật → bỏ chọn

**Given** bé đang kéo một vật
**When** ngón tay nhấc lên ở giữa đường, không trúng đích, vẫn trong vùng chơi của trò
**Then** vật nằm lại tại chỗ nhấc tay (tự đẩy nhẹ tránh chồng), không trượt về chỗ cũ; tiến trình câu không mất
**And** thả ra ngoài vùng chơi (mép chết, ngoài khung) → vật trượt về chỗ cũ như cũ

**Given** thang gợi ý NFR4
**When** bé dùng chạm-rồi-chạm
**Then** mỗi lần chạm đích sai tính như một lần thả sai (bậc gợi ý leo như kéo); bàn tay gợi ý bậc 3 diễn động tác chạm-rồi-chạm (chạm vật, chạm đích)
**And** test vitest cho drag-controller: chạm-chọn, chạm-đích, bỏ chọn, nhấc giữa đường nằm lại, thả ngoài vùng trượt về; `npm run check` qua

### Story 5.2: Shiba dẫn đường chào "Xoài ơi" và giọng đọc gọi tên Xoài

As a bé Xoài,
I want nghe gọi đúng tên mình và thấy bạn Shiba chào khi vào đảo,
So that bé thấy trò chơi là của mình.

**Covers:** FR34, FR36, NFR3, AR-N3

**Acceptance Criteria:**

**Given** content lời đọc
**When** chạy `npm run content:export` + `npm run tts`
**Then** có các line mới: chào vào đảo ("Xoài ơi, chơi gì nào?"), mời trạm có tên ("Xoài ơi, … nào!") và ít nhất một câu yêu cầu mỗi trò có "Xoài"; mọi line ≤ 8 từ, qua validator đồng âm; không có lời khen chứa tên
**And** file `.m4a` + `.hash` có đủ; `npm run audio:check` / `validate:content` qua

**Given** bé vào bản đồ lần đầu trong phiên
**When** màn Con đường hiện
**Then** Shiba chibi trên đảo vẫy (sprite frame/tween) và đọc lời chào một lần; khi bé ngồi yên tới lượt lời mời, Shiba vẫy cùng lúc
**And** chạm Shiba → Shiba nhún + kêu "gâu" nhỏ (FR33); `npm run check` qua

### Story 5.3: Lời ngắn, chạm là không phải chờ

As a bé 3 tuổi,
I want không phải ngồi chờ giọng nói hay hoạt hình dài,
So that bé không chán bỏ đi.

**Covers:** NFR15, NFR3, NFR5

**Acceptance Criteria:**

**Given** một câu yêu cầu đang phát
**When** bé chạm vào vật chơi được
**Then** thao tác của bé được nhận ngay (không chặn input chờ giọng xong); giọng yêu cầu dừng nhỏ dần trong ≤ 200ms nếu bé đã làm đúng
**And** hint timer vẫn chỉ chạy sau khi câu yêu cầu kết thúc hoặc bị ngắt

**Given** một hoạt hình ăn mừng / chuyển cảnh dài hơn ngưỡng bỏ qua (`Tokens.Timing`, ~1.5s)
**When** bé chạm màn hình
**Then** hoạt hình tua tới trạng thái cuối và trò đi tiếp; không bỏ qua chuỗi lưu tiến trình
**And** validator content báo câu yêu cầu > 4s (theo độ dài file); `npm run check` qua

### Story 5.4: Chạm gì cũng có phản ứng

As a bé 3 tuổi,
I want chạm vào bất cứ thứ gì cũng thấy nó cử động,
So that màn hình là một món đồ chơi chứ không phải bài tập.

**Covers:** FR33, FR53, NFR5, NFR11

**Acceptance Criteria:**

**Given** một màn trò chơi hoặc bản đồ
**When** bé chạm vào một nhân vật hoặc sprite không phải mục tiêu của câu hiện tại
**Then** sprite đó nhún (scale bounce `Tokens`) + âm "pụp" nhỏ trong ≤ 100ms; không tính là chọn sai, không leo gợi ý
**And** chạm nền trống → gợn sáng nhỏ tại ngón tay (≤ 1Hz, mờ dần), không âm báo

**Given** đồ trang trí trên đảo
**When** bé chạm
**Then** món đó lắc + phát âm theo loại món (FR53); không mở trạm, không chặn chạm trạm bên cạnh
**And** test vitest cho bộ định tuyến chạm (vật mục tiêu / vật thường / nền); `npm run check` qua

### Story 5.5: Quà bất ngờ, bé chọn 1 trong 2 và tự đặt lên đảo

As a bé 3 tuổi,
I want tự chọn món quà và đặt nó chỗ mình thích trên đảo,
So that hòn đảo là của bé, và quà là điều bất ngờ chứ không phải tiền công.

**Covers:** FR22 (thay), FR23 (thay), FR52, FR53

**Acceptance Criteria:**

**Given** `reward-service` khi hết lượt
**When** quyết định có quà
**Then** xác suất có quà lấy từ `Tokens` (không phải 100%), lượt đầu tiên mỗi trò trong phiên luôn có quà; món không trùng 2 lần liền
**And** test vitest với rng cố định cho xác suất và chống trùng

**Given** có quà khi về đảo
**When** chuỗi sau lượt chạy
**Then** hiện 2 món (≥ 120px, cách xa) cạnh trạm; bé chạm một món → món kia bay đi; món chọn đi theo chạm-rồi-chạm/kéo vào một ô trống bé chọn trong các ô của trạm đó (ô sáng lên khi đang cầm món)
**And** bé không chọn trong ~10s → Shiba chỉ vào một món (gợi ý); đầy ô → giữ quy tắc thay món cũ; lưu ngay vào ProgressStore

**Given** đồ đã đặt
**When** mở lại app
**Then** đồ ở đúng ô bé đặt; chạm đồ có phản ứng (Story 5.4); `npm run check` qua

### Story 5.6: Đảo sinh động – dấu hiệu trạm và chuyển động nền

As a bé 3 tuổi,
I want nhìn đảo là nhận ra trạm nào là gì và thấy đảo đang "sống",
So that bé muốn chạm vào khám phá.

**Covers:** FR37, NFR9, NFR11, NFR12

**Acceptance Criteria:**

**Given** `build_map.py`
**When** `npm run art:build -- map` + render + atlas
**Then** đảo có đường màu đồ chơi, đài phun nước, phao bơi, cá voi chibi (theo bản thử `.working/render-ban-do-v4.png`), mỗi trạm có một dấu hiệu lớn (que kem, ống khói pizza, cờ đua, …); mọi thứ mới không lấn vùng chạm trạm/ô trang trí (validator)
**And** hint contrast mọi màn vẫn qua; màn Đường đua dùng màu đường mới nếu đổi token

**Given** bản đồ đang hiện
**When** không có chạm
**Then** mây trôi chậm, sóng lăn tăn, cá voi phun nước theo chu kỳ, chỉ một chuyển động nổi bật một lúc; `prefers-reduced-motion` → giảm biên độ
**And** `npm run check` qua

### Story 5.7: Câu mời bố mẹ cùng chơi

As a bố mẹ ngồi cạnh,
I want thỉnh thoảng được app mời tham gia,
So that bé và bố mẹ cùng chơi.

**Covers:** FR35, NFR3

**Acceptance Criteria:**

**Given** content mỗi trò có 1–2 câu mời bố mẹ ("Hỏi mẹ xem…", "Chỉ cho bố xem…")
**When** một lượt diễn ra
**Then** tối đa 1 câu mời bố mẹ mỗi lượt, không chen giữa câu yêu cầu và gợi ý (chỉ phát ở đầu lượt hoặc lúc chơi tự do), bật mặc định qua một hằng content
**And** test vitest: không quá 1 câu/lượt; `npm run check` qua

### Story 5.8: Khung chơi tự do, phản ứng "chọn khác" và phản ứng ngẫu nhiên

As a bé 3 tuổi,
I want hết câu vẫn được nghịch tiếp, chọn khác thì có trò hề, đúng thì mỗi lần một kiểu,
So that bé muốn chơi lại.

**Covers:** FR30, FR31, FR32

**Acceptance Criteria:**

**Given** `MiniGameBase` và round model mỗi trò
**When** câu cuối của lượt xong
**Then** trò phát `round:complete` (thưởng + độ khó lưu như cũ) nhưng ở lại màn ở chế độ tự do: giọng im, mục tiêu tắt, đồ vật vẫn chơi được theo luật tự do của trò; Nhà → về đảo chạy chuỗi sau lượt
**And** trò chưa có luật tự do riêng (trước Epic 6) → vẫn ở lại màn với chạm-phản ứng (Story 5.4)

**Given** một bộ chọn phản ứng chung (`core/reactions`)
**When** trò yêu cầu phản ứng "đúng" hoặc "chọn khác"
**Then** chọn ngẫu nhiên từ danh sách của trò (rng seed), không lặp liền; "chọn khác" không bao giờ phát âm báo sai
**And** test vitest cho bộ chọn và cho chuyển chế độ tự do của 1 trò mẫu (Tiệm kem); `npm run check` qua

## Epic 6: Bảy trò quen thuộc vui hơn

### Story 6.1: Tiệm kem – Shiba hắt xì, lau mũi và tháp kem

As a bé Xoài,
I want thấy Shiba liếm, rùng mình, hắt xì kem dính mũi và tự xếp tháp kem,
So that mỗi viên kem là một trò cười.

**Covers:** FR6 (thay), FR38, FR39, FR30, FR31, FR32

**Acceptance Criteria:**

**Given** `build_ice_cream.py`
**When** build + render
**Then** Shiba chibi có thêm các khung: rùng mình, hắt xì, nhăn mặt (chọn khác), mũi dính kem; layout có `hit.shiba-nose`
**And** atlas ≤ 2048², `npm run check` qua

**Given** bé đưa đúng vị
**When** viên kem lên ốc quế
**Then** Shiba chọn ngẫu nhiên liếm / rùng mình / hắt xì (FR31); với hắt xì đôi khi có kem dính mũi → chạm mũi để lau (Shiba cười)
**And** đưa khác vị → Shiba liếm thử, nhăn mặt theo vị, kem trôi về, giọng nhắc ngắn (FR6)

**Given** chế độ tự do (Story 5.8)
**When** bé đưa thêm kem
**Then** kem chồng thành tháp tới ~8 viên; quá cao thì lắc rồi đổ vui (kem rơi xuống quầy), xếp lại được
**And** test vitest round model cho tự do + hắt xì/lau; `npm run check` qua

### Story 6.2: Pizza – chất topping thoải mái và cáo phản ứng theo vị

As a bé Xoài,
I want đặt bao nhiêu topping cũng được và xem cáo ăn kêu cay,
So that làm pizza như chơi thật.

**Covers:** FR40, FR41, FR42, FR30, FR31, FR32

**Acceptance Criteria:**

**Given** bé đã đặt đủ số lát yêu cầu
**When** bé đặt thêm
**Then** lát vẫn nhận (ô tiếp theo hoặc chồng lệch), bánh rung, cáo tròn mắt, giọng đếm tiếp; không trạng thái sai
**And** chạm lò vẫn nướng như đủ

**Given** cáo ăn bánh
**When** bánh có ớt chuông
**Then** cáo "cay quá!" + làn khói nhỏ; nấm / xúc xích có phản ứng riêng (FR31); hoạt hình nướng/ăn hiện có (2026-10-16) giữ nguyên
**And** chế độ tự do: phủ topping tùy ý, nướng lặp lại; test vitest round; `npm run check` qua

### Story 6.3: Đường đua – đường ngắn, chọn màu xe và rửa xe

As a bé Xoài,
I want chọn màu xe, chạy đoạn ngắn và rửa xe bọt xà phòng,
So that đua xe không mỏi tay mà lại có trò sau đích.

**Covers:** FR43, FR44, FR32

**Acceptance Criteria:**

**Given** content đường cấp 1
**When** bắt đầu lượt cấp đầu
**Then** đường đủ ngắn để vạch trong một lần đặt tay (độ dài ≤ token)
**And** trước con đường đầu tiên có 3–4 ô màu xe (≥ 120px); chạm ô → xe đổi màu (sprite tint hoặc frame), màu lưu vào ProgressStore và kart trên đảo dùng màu đó

**Given** xe về đích ở con đường cuối
**When** cảnh rửa xe hiện
**Then** bé chạm/vuốt lên xe → nước phun, bọt xà phòng sinh ra nơi chạm, đủ bọt thì xả nước và xe lấp lánh (không chớp); không có đúng/sai
**And** test vitest; `npm run check` qua

### Story 6.4: Câu cá – cá ú òa sau rong và bể cá của bé

As a bé Xoài,
I want cá trốn rồi ló ra, và giữ cá câu được trong bể của mình,
So that câu cá có bất ngờ và có bộ sưu tập.

**Covers:** FR45, FR46, FR31

**Acceptance Criteria:**

**Given** plate câu cá có rong và đá (`build_fishing.py`)
**When** cá bơi qua
**Then** đôi khi cá trốn sau rong/đá (ẩn một phần) rồi ló ra; cá đang trốn không thể là mục tiêu duy nhất còn lại trong câu
**And** chạm nhầm cá → té nước + cá lặn (đã có) + phản ứng ngẫu nhiên

**Given** bé câu được cá
**When** về đảo
**Then** cá đó thêm vào bể cá của bé (ProgressStore, tối đa N con); bể cá là đồ trên đảo cạnh hồ, chạm bể → mở lớp phủ bể cá xem các con cá đã câu bơi, chạm cá → cá quẫy + đọc tên
**And** test vitest; `npm run check` qua

### Story 6.5: Chạm là nói – nhiều phản ứng và chỗ trốn

As a bé Xoài,
I want mỗi đồ vật có nhiều kiểu cử động và có chỗ trốn bất ngờ,
So that chạm lại vẫn vui.

**Covers:** FR47, FR31

**Acceptance Criteria:**

**Given** content Chạm là nói
**When** bé chạm cùng một vật nhiều lần
**Then** vật lần lượt/ngẫu nhiên có 2–3 phản ứng (khung + âm khác nhau)
**And** mỗi cảnh có ≥ 2 chỗ trốn (bụi cây, thùng, cửa…) – chạm → con vật/đồ vật nhảy ra, kêu, đọc tên, rồi trốn lại; vẫn tính vào bộ đếm vật khác nhau
**And** test vitest; `npm run check` qua

### Story 6.6: Ghép khủng long – điệu nhảy riêng và mảnh đặt nhầm ngộ nghĩnh

As a bé Xoài,
I want khủng long nhảy múa khi sống dậy và đặt nhầm mảnh thì trông ngộ nghĩnh,
So that ghép hình có tiếng cười.

**Covers:** FR48, FR49, FR30

**Acceptance Criteria:**

**Given** ba loài khủng long
**When** khủng long sống dậy
**Then** mỗi loài có điệu nhảy riêng (khung/tween) + tiếng kêu nhỏ riêng (≤ 0.8s, NFR10)
**And** đặt mảnh vào ô của mảnh khác → mảnh gắn tạm, khủng long kêu "ơ?", sau ~2s (token) mảnh tự trượt về khay; không leo gợi ý quá một bậc mỗi lần
**And** test vitest; `npm run check` qua

### Story 6.7: Tìm bóng – vật to hơn, lắc đầu và ló ra chào

As a bé Xoài,
I want con vật đủ to để cầm và phản ứng vui khi vào nhầm nhà,
So that bé không bực và muốn tìm tiếp.

**Covers:** FR50, FR51, FR30

**Acceptance Criteria:**

**Given** `build_shadow_match.py`
**When** build + render
**Then** vật cầm có kích thước trim ≥ `Tokens` vật kéo tối thiểu và ≥ một tỉ lệ của bóng (token); layout/validator cập nhật
**And** thả vào bóng khác → con vật lắc đầu + câu "Không phải nhà tớ" rồi về tay khủng long; đúng → chui vào, bóng hóa màu, con vật ló ra chào
**And** test vitest; `npm run check` qua

## Epic 7: Nhà Xoài – trò chạm mới

### Story 7.1: Trạm Nhà Xoài trên đảo và màn sân nhà

As a bé Xoài,
I want thấy ngôi nhà của mình trên đảo và vào sân nhà có nhiều góc chơi,
So that có thêm trò mới mà đảo không rối.

**Covers:** AR-N1, AR-N2, FR2

**Acceptance Criteria:**

**Given** `build_map.py` + content `stations`
**When** build + render bản đồ
**Then** có trạm `home` (ngôi nhà Tiny Treats/KayKit, tên nhỏ "Nhà Xoài" cho bố mẹ) với hit đa giác, điểm dừng kart, ≥ 1 ô trang trí; mọi validator layout/decoration/hint contrast qua
**And** kart chạy tới trạm như các trạm khác

**Given** bé vào trạm Nhà Xoài
**When** màn sân nhà hiện
**Then** có 5 góc chơi lớn (chuồng thú, phòng khám, sân khấu, tủ đồ, giường ngủ), góc chưa build hiện "ngủ" (chạm → nhún + kêu vui); chạm góc → vào trò; Nhà → về đảo
**And** test vitest điều hướng; `npm run check` qua

### Story 7.2: Ú òa chuồng thú

As a bé Xoài,
I want chạm cửa chuồng để con vật ló ra kêu,
So that bé được chơi trốn tìm và học tên, tiếng kêu con vật.

**Covers:** FR54, FR55, FR33

**Acceptance Criteria:**

**Given** builder chuồng thú (Tiny Treats + con vật chibi dựng bằng `cute.chibi` hoặc mô hình CC0 dễ thương)
**When** build + render + atlas
**Then** có 3–5 cửa chuồng với khung đóng/rung/mở và ≥ 5 con vật, mỗi con có khung ló ra + kêu
**And** chạm cửa → con vật ló ra, phát tiếng kêu ngắn + đọc tên; chạm lại → đổi con khác (ngẫu nhiên, không lặp liền)

**Given** thỉnh thoảng (token)
**When** giọng hỏi "Con gì kêu …?"
**Then** cửa có con đó rung mạnh hơn; bé chạm cửa nào cũng được, không đúng/sai
**And** round model + test vitest; mọi lời qua TTS/validator; `npm run check` qua

### Story 7.3: Ban nhạc trên đảo

As a bé Xoài và bố mẹ,
I want chạm nhạc cụ cùng nhau để tạo tiếng nhạc vui,
So that bé chơi âm nhạc và chơi cùng người lớn.

**Covers:** FR58, FR59, NFR1, NFR10

**Acceptance Criteria:**

**Given** sân khấu 4–6 nhạc cụ/con vật (trống, đàn, kèn, chim, ếch…)
**When** bé chạm
**Then** mỗi cái phát một nốt trong cùng một âm giai ngũ cung (chạm tổ hợp nào cũng hài hòa) + nhún; âm tự tạo (`tools/audio`), không bài hát
**And** 2 ngón chạm 2 nhạc cụ cùng lúc → cả hai kêu (ngoại lệ first-finger-wins chỉ trong trò này)

**Given** bé ngồi yên một lúc
**When** nhịp nền bật (trống nhẹ, tự làm)
**Then** các nhạc cụ nhún theo nhịp để mời; chạm theo nhịp thì có lấp lánh nhỏ (không chấm điểm)
**And** âm lượng theo NFR10; test vitest; `npm run check` qua

### Story 7.4: Giờ đi ngủ

As a bé Xoài trước giờ ngủ,
I want giúp bạn thú đánh răng, tắt đèn, đắp chăn,
So that bé có thói quen đi ngủ nhẹ nhàng.

**Covers:** FR62, FR63, NFR11

**Acceptance Criteria:**

**Given** phòng ngủ (Tiny Treats Homely House hoặc dựng) với một bạn thú chibi
**When** bé làm 3 bước bằng chạm (bàn chải → răng, công tắc → đèn, chăn → bạn thú)
**Then** mỗi bước có phản ứng (bọt kem đánh răng, ngáp, ngủ khò) và giọng nhẹ; thứ tự gợi ý nhưng không bắt buộc
**And** xong 3 bước → cảnh dịu dần sang đêm (không tối hẳn), nhạc ru nhẹ tự làm, sao nhỏ mờ dần; chạm bạn thú → trở mình
**And** test vitest; `npm run check` qua

## Epic 8: Nhà Xoài – chăm sóc và thay đồ

### Story 8.1: Bác sĩ thú cưng

As a bé Xoài,
I want chữa cho bạn thú bị bẩn, đói, trầy, buồn ngủ,
So that bé tập chăm sóc và thấy mình giúp được bạn.

**Covers:** FR56, FR57, FR29, FR30

**Acceptance Criteria:**

**Given** phòng khám với 4 dụng cụ (vòi tắm, bình sữa, miếng dán, chăn) và bạn thú chibi có 4 vấn đề nhìn thấy (vết bùn, bụng réo, vết trầy, ngáp)
**When** một bạn thú đến với 1–2 vấn đề
**Then** bé đưa dụng cụ (chạm-rồi-chạm hoặc kéo) tới bạn thú → vấn đề hết với phản ứng từng bước (cười khi tắm, ợ khi no…); dụng cụ không hợp → bạn thú nghiêng đầu ngộ nghĩnh (FR30)
**And** hết vấn đề → bạn thú cảm ơn, nhảy, rồi bạn khác đến; round model + test vitest; `npm run check` qua

### Story 8.2: Thay đồ cho Shiba

As a bé Xoài,
I want chọn mũ, kính, áo cho Shiba và thấy Shiba mặc ra đảo,
So that Shiba là bạn của riêng bé.

**Covers:** FR60, FR61

**Acceptance Criteria:**

**Given** builder tủ đồ: Shiba chibi + ≥ 4 mũ, 3 kính, 4 áo (mesh dựng, gắn theo khớp đầu/thân của `cute.chibi`)
**When** build + render
**Then** mỗi món có sprite riêng khớp với Shiba ở màn tủ đồ, bản đồ và Tiệm kem (cùng góc, cùng điểm neo)
**And** bé chạm món → Shiba mặc, soi gương, phản ứng (xoay, cười); chạm món đang mặc → cởi

**Given** bé rời tủ đồ
**When** vào bản đồ hoặc Tiệm kem
**Then** Shiba mặc đúng bộ đồ đã chọn (ProgressStore)
**And** test vitest; `npm run check` qua

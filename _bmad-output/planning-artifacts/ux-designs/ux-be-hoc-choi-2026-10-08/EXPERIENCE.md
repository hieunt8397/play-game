---
title: "EXPERIENCE – Bé Học Chơi"
status: final
created: 2026-10-08
updated: 2026-10-08
sources:
  - ../../prds/prd-be-hoc-choi-2026-10-08/prd.md
  - ../../prds/prd-be-hoc-choi-2026-10-08/addendum.md
---

# Bé Học Chơi — Experience Spine

> **Amendment 2026-10-21 (parent decision, spec-bo-do-trang-tri):** island decorations are removed at runtime. No gift is offered, chosen, flown in, placed, shown or stored; decorations saved by older builds are deleted on the next app start (difficulty is kept). Superseded: the decoration parts of Stories 2.2 and 2.3, the reward of Story 4.6 (a gift every ~8 touched props), and Story 5.5 (choose 1 of 2 and place it). Where the body below still describes decorations or gifts, this note wins. Continuous play is a separate follow-up.

> **Amendment 2026-10-21 (parent decision, spec-choi-lien-mach — seamless play):** after a round the character celebrates as before, then the next round starts by itself in the same game (~0.5 s pause and a short fade; next difficulty, new questions). There is no island visit and no "Chơi nữa?" / play-again overlay between rounds (Story 2.4 and the state "Hỏi chơi tiếp" are superseded, with its voice lines). Post-round free play (e.g. the ice-cream tower) is effectively dropped, and the free-play parent invitation with it; the round-start invitation stays. The child returns to the island only with Home: between rounds it pulls back to the island and Map invites again ("Mời chơi"); mid-round it keeps the resume point as before. Where the body below still describes the overlay or post-round free play, this note wins.

## Foundation

Một bề mặt duy nhất: **PWA trên Safari iPad, luôn ngang, toàn màn hình** (cài lên màn hình chính, `display: fullscreen/standalone`). Không dùng UI system có sẵn; mọi thành phần tự vẽ theo `DESIGN.md` (hòn đảo đồ chơi low-poly). Hình là ảnh/sprite render sẵn từ Blender, chuyển động 2D. Mọi lời nói là file âm thanh tạo sẵn (giọng nữ), người lớn nghe duyệt từng file. Không tài khoản, không mạng sau lần tải đầu (NFR7–NFR8). Không có tính năng cho phụ huynh (PRD Non-goals).

Mock tham khảo: [`mockups/direction-C-lowpoly.html`](mockups/direction-C-lowpoly.html) (Con đường + Tiệm kem đang gợi ý). Khung lời thoại trong mock chỉ để minh họa giọng đọc. Quy tắc "spine thắng mock" xem `DESIGN.md` › Brand & Style.

## Information Architecture

| Màn | Đến từ | Mục đích |
|---|---|---|
| Mở đầu (Chơi) | Mở app lần đầu trong phiên | Một nút `button-play`; lần chạm mở khoá âm thanh (FR1) |
| Con đường (bản đồ đảo) | Mở đầu; nút Nhà; "về bản đồ" | 7 trạm trong cảnh, kart của bé, đồ trang trí đã nhận |
| Tiệm kem | Trạm xe kem | FR4–FR6 – Shiba bán kem |
| Làm pizza | Trạm tiệm pizza | FR7–FR9 – cáo ăn bánh |
| Đường đua | Trạm cổng caro | FR10–FR12 – bạn nhỏ trong `kart` |
| Câu cá | Trạm hồ cá | FR13–FR14 |
| Chạm là nói | Trạm phố/thị trấn | FR15–FR17 – 3 cảnh, tự do; chạm đủ ~8 vật → 1 món trang trí |
| Ghép khủng long | Trạm công viên khủng long | FR18–FR19 |
| Tìm bóng | Trạm cửa hang | FR20–FR21 – khủng long ba sừng dẫn dắt |
| Hỏi chơi tiếp | Cuối mỗi lượt trò | **Lớp phủ trên bản đồ** (`play-again-overlay`) sau khi camera lùi ra và món trang trí bay vào |
| Lớp mở khoá âm thanh | Quay lại từ nền khi AudioContext bị treo | `button-play` phủ lên màn hiện tại; chạm → tiếp tục đúng chỗ |

Phân cấp phẳng: Con đường là trung tâm; mỗi trò cách bản đồ đúng một bước. **Không có màn Bộ sưu tập** và không có nút ⭐ – phần thưởng là đồ trang trí hiện thẳng trên đảo (thay FR22–FR23). Không menu, không cài đặt trong app.

## Voice and Tone

Giọng nữ, nhẹ nhàng, ấm áp như mẹ kể chuyện. App gọi "Bé ơi", không gọi tên riêng. Câu ngắn (≤ 8 từ), một yêu cầu mỗi câu, từ khoá (vị/màu, số, tên con vật) đặt cuối câu, **nghỉ ~300 ms trước từ khoá** và nhấn rõ. Tốc độ ~0.85× giọng nói thường.

**Quy tắc lời nói:**
- **Không đặt cặp gần đồng âm trong cùng câu**, nhất là cạnh từ khoá: dâu/đâu, cá/cà, ba/bà, bóng/bông, cam/cầm. Không dùng "ở đâu" trong câu có "dâu". Rà toàn bộ kịch bản theo danh sách này.
- Kem gọi **cả vị lẫn màu**: "kem dâu màu hồng", "kem sô-cô-la màu nâu" (bé học "màu hồng", không phải "màu dâu"). Từ mượn ("sô-cô-la", "pizza") phải nghe duyệt riêng.
- Nhắc lại yêu cầu tối đa 1 lần mỗi 10s; không bao giờ nói "sai", "không đúng".
- Ăn mừng bằng nhân vật + nhạc, **không bằng lời khen** (đã chốt). Chỉ đọc tên thứ bé vừa làm ra.

| Do | Don't |
|---|---|
| "Bé ơi, mình đi ăn kem nhé!" (mời ở trạm) | "Chọn một trò chơi để bắt đầu." |
| "Cho bạn Shiba… kem dâu màu hồng nào!" | "Hãy kéo viên kem màu dâu vào ốc quế." |
| "Mình tìm kem dâu màu hồng nhé!" (sau khi thả sai) | "Viên kem màu dâu đâu nhỉ?", "Sai rồi!", tiếng buzz |
| "Một, hai, ba!" (đếm theo từng lát) | Đếm im lặng, hiện số |
| "Khủng long ba sừng!" (đọc tên khi xong) | "Giỏi lắm! Bạn được 10 điểm!" |
| "Cá vàng nhỏ!" (đọc tên cá vừa câu) | Lời khen chung chung lặp lại |

**Âm thanh:** giọng nói chuẩn ≈ −16 LUFS; nhạc nền nhạc cụ ít giai điệu ≤ −30 LUFS, **tự hạ thêm ≥ 18 dB khi có giọng nói** (hạ trong 150 ms, trả lại sau 500 ms khi câu kết thúc). Hiệu ứng không to hơn giọng nói, có fade-in ≥ 50 ms. Tiếng nhân vật cao, ngắn, mềm (≤ 0.8s), không có dải trầm < 150 Hz. **Khủng long ăn mừng bằng tiếng kêu nhỏ, vui, dễ thương + nhún nhảy – không bao giờ gầm.**

## Component Patterns

Hành vi. Hình thức xem `DESIGN.md` › Components.

| Component | Dùng ở | Quy tắc hành vi |
|---|---|---|
| `button-play` | Mở đầu; lớp mở khoá âm thanh | Nhún chậm. Chạm → nảy + "pụp" (sau chạm, không trước), mở khoá AudioContext, bật nhạc nền, sang Con đường (hoặc tiếp tục màn đang dở). |
| `button-home` | Mọi màn trò chơi | Chạm 1 lần → lún + "pụp" + *"Về đảo nào!"* → về Con đường, không hỏi xác nhận. Lượt dở **được giữ trong phiên**: trạm đó có vòng nhỏ; vào lại → tiếp tục đúng câu đang dở. |
| `button-speaker` | Con đường, mọi trò, Hỏi chơi tiếp | Phát lại câu gần nhất của màn (trò: yêu cầu hiện tại; bản đồ: lời mời; lớp phủ: câu hỏi). Chạm khi đang phát → phát lại từ đầu, không chồng tiếng. Không tính là "sai", không reset gợi ý. |
| `station-hotspot` | Con đường | Chạm → trạm nhún + đọc tên (~0.5s) → kart chạy. Khi kart đang chạy, chạm trạm khác → **kart đổi hướng** tới trạm mới (đọc tên mới). Vùng chạm theo hit-map đa giác. |
| `station-label` | Con đường | Tĩnh, không chạm được. |
| `kart` (bản đồ) | Con đường | Chạy tới trạm, trần cứng 2s bất kể quãng đường (lần sau trong phiên 1.5s). Chạm kart → "bíp" + tăng tốc. Khi quay lại bản đồ, đỗ ở trạm vừa chơi. |
| `kart` (Đường đua) | Đường đua | Xem bảng trò › Đường đua và `trace-path`. |
| `hint-ring` / `hint-hand` | Mọi trò có yêu cầu | Leo thang theo State "Gợi ý". Vòng **giữ nguyên tới khi bé làm đúng**, không tắt khi bé chạm vật khác. |
| `draggable-item` | Kem, topping, mảnh khủng long, Tìm bóng | Ngón đầu tiên nhấc vật; vật theo ngón nhưng bị giữ ngoài dải mép và vùng nút. Thả trong `{spacing.snap-radius}` quanh đích đúng → hút vào. Thả ở đích sai → trôi về chỗ cũ (~0.5s). Thả giữa đường trên quầy/khay → nằm lại, tự đẩy nhẹ để không chồng vật khác; thả ngoài quầy → sau ~1.5s trượt về chỗ cũ. Không mất tiến trình. |
| `drop-target` | Ốc quế, đế bánh, ô mảnh, bóng đích | Nhận mọi vật đúng **theo bất kỳ thứ tự nào** (ngoại lệ: bậc khó cao nhất của Tiệm kem bắt đúng thứ tự); với Tiệm kem, thân nhân vật/nửa trên quầy cũng tính là "đưa cho Shiba". |
| `counter-tray` | Tiệm kem, Làm pizza | Chứa vật nguồn; đích thả luôn ở giữa. Vật nguồn tự hiện lại khi đã dùng (topping, kem không bao giờ hết). |
| `oven` | Làm pizza | Chỉ nhận chạm khi đã đặt đủ topping. Chạm → bánh trượt vào, nướng ~2s, "ting", bánh ra bốc hơi nhẹ. |
| `fish` | Câu cá | 3–5 cá bơi chậm ≤ 60 pt/s trong vùng an toàn, không ra mép. Kiểm tra chạm theo vị trí cá cả 150 ms trước (bù trễ). Cá đúng không bao giờ rời màn. |
| `ghost-slot` | Ghép khủng long | Mỗi mảnh chỉ khớp ô của nó; không cần xoay. |
| `shadow-target` | Tìm bóng | Một bóng đúng, còn lại là bóng mồi; đúng → bóng đổ màu thành vật thật. |
| `trace-path` | Đường đua | Kart không bao giờ rời đường: lấy điểm chiếu gần nhất của ngón lên đường, chỉ tiến không lùi. Ngón lệch ≤ 80 pt mỗi bên → kart theo sát; 80–140 pt → kart vẫn tiến nhưng chậm một nửa; > 140 pt → kart dừng chờ như nhấc tay. |
| `scene-bubble` | Chạm là nói | Chạm → cảnh trượt ngang sang cảnh đó (~0.6s) + đọc tên cảnh ("Biển!"). |
| `tappable-prop` | Chạm là nói; đạo cụ bản đồ (Shiba đi dạo, xe đua, cây…) | Chạm → nảy + tiếng nhỏ ≤ 100 ms; ở Chạm là nói còn đọc tên. Trên bản đồ không mở trò. |
| `character` | Mọi trò | Đứng chờ thở/nhìn bé. Đúng → tư thế vui (`DESIGN.md` › Nhân vật) + nhạc 1–2s. |
| `play-again-overlay` | Bản đồ, cuối lượt | Xem Flow 1 bước 8–11 và State "Hỏi chơi tiếp". Chạm một trạm bất kỳ cũng được: đóng lớp phủ, kart đi tới trạm đó. |
| `button-replay` | Hỏi chơi tiếp | Đóng lớp phủ, camera phóng vào lại trạm (~1.5s), lượt mới cùng trò, độ khó tiếp nối (FR5, FR9, FR11, FR21). |
| `button-back-to-map` | Hỏi chơi tiếp | Chỉ đóng lớp phủ – bé đã ở bản đồ, kart đỗ ở trạm vừa chơi, mọi trạm chạm được ngay. |
| `decoration-item` | Con đường (Chạm là nói: xuất hiện trong cảnh) | Tự bay vào vị trí có sẵn gần trạm vừa chơi; bé không cần làm gì; chạm → nảy + tiếng vui. Đảo đầy chỗ → món cũ ở vị trí đó bay vút lên như bóng bay rồi món mới bay vào. Lưu trên máy. |
| `loading-strip` | Mở đầu | Kart chạy vòng liên tục khi đang tải (không dừng dù lâu); mất mạng → kart chậm lại đứng chờ, tự thử lại khi có mạng; không chữ lỗi. |

### Bảng trò chơi

Chung cho mọi trò có yêu cầu: lượt = 3–5 câu; mỗi câu nói xong mới bắt đầu tính giờ gợi ý; gợi ý leo thang theo State "Gợi ý".

| Trò | Yêu cầu (ví dụ) | Thao tác | Đúng | Chưa đúng | Gợi ý riêng | Kết lượt / độ khó |
|---|---|---|---|---|---|---|
| **Tiệm kem** (FR4–6) | "Cho bạn Shiba… kem dâu màu hồng nào!" | Kéo kem lên ốc quế | Kem hút vào, Shiba vẫy đuôi, liếm | Kem trôi về, nhắc lại | Vòng quanh kem đúng; tay kéo kem → ốc quế | 1 viên/2 vị → 2–3 viên; **nhận mọi thứ tự**, kem chồng theo thứ tự bé đặt; riêng bậc cao nhất bắt đúng thứ tự được đọc (FR5) |
| **Làm pizza** (FR7–9) | "Bé ơi, ba lát xúc xích nào!" | Kéo từng lát lên đế bánh, rồi chạm lò | Mỗi lát hút vào 1 chỗ trống, giọng đếm "Một!… Hai!… Ba!"; đủ số → lò hé cửa có vòng mời, *"Mình nướng bánh nào!"*; chạm lò → nướng ~2s → cáo cầm bánh "măm măm", vẫy đuôi | Topping khác loại trôi về; lát thừa trôi về + *"Đủ ba lát rồi!"* | Vòng quanh bát topping đúng; khi đã đủ mà ~6s chưa chạm lò → vòng + tay chạm lò | Đếm 1–3 → tới 5 (FR9); 2 loại topping lúc đầu |
| **Đường đua** (FR10–12) | "Bé lái xe tới cổng nhé!" | Vạch ngón dọc `trace-path` | Kart tới cổng caro, bạn nhỏ vẫy tay, còi "bíp" vui | Không có "sai" – lệch xa thì kart chậm/chờ | Tay vạch một đoạn phía trước kart; vạch giữa đường phía trước sáng chạy dần | Gần thẳng → cong nhẹ → zíc-zắc → vòng tròn (FR11); 3–5 đường/lượt |
| **Câu cá** (FR13–14) | "Câu con cá màu vàng nào!" / "Câu con cá to nào!" | Chạm cá | Cá được kéo lên dây, quẫy, đọc tên ("Cá vàng nhỏ!") | Cá sai lặn xuống nhẹ, nổi lại sau ~3s; chạm vào nước → gợn nước "tõm", không tính | Vòng quanh cá đúng, cá đúng bơi chậm lại; tay chạm cá | Màu hoặc cỡ khác rõ → nhiều cá hơn (3→5); luôn ≥ 1 cá đúng |
| **Chạm là nói** (FR15–17) | Không yêu cầu | Chạm vật; chạm `scene-bubble` đổi cảnh | Vật cử động/kêu (ô tô bóp còi, cá quẫy) + đọc tên | Không có | Không gợi ý; yên ~15s → một vật ngẫu nhiên khẽ lắc (không giọng) | Không kết lượt. Mỗi ~8 vật **khác nhau** → 1 món trang trí |
| **Ghép khủng long** (FR18–19) | "Mình ghép bạn khủng long nào!" | Kéo mảnh vào ô bóng mờ | Mảnh hút vào, có màu; đủ mảnh → khủng long "sống dậy": chớp mắt, nhún nhảy, đi vài bước, **kêu nhỏ vui**, đọc tên loài | Mảnh thả ở ô khác trôi về | Vòng quanh 1 mảnh + ô của nó sáng nét đứt; tay kéo | 3 → 4 → 6 mảnh; 3 con/lượt (cổ dài, ba sừng, phiến lưng) |
| **Tìm bóng** (FR20–21) | Khủng long ba sừng đưa ra 1 vật: "Bạn mèo trốn ở cái bóng nào?" | Kéo vật vào bóng | Vật hút vào, bóng đổ màu, ba sừng nhún nhảy + kêu nhỏ vui, đọc tên ("Con mèo!") | Vật trôi về tay ba sừng, nhắc lại | Vòng quanh bóng đúng; tay kéo | 2 bóng khác hẳn → 3 → 4 bóng giống dần (FR21) |

## State Patterns

| Trạng thái | Màn | Cách thể hiện |
|---|---|---|
| Đang tải (lần đầu) | Mở đầu | `loading-strip`; `button-play` chỉ hiện khi tài nguyên cần thiết đã lưu sẵn. |
| Tải lần đầu thất bại | Mở đầu | Kart chậm lại, đứng chờ trên dải đường, tự thử lại khi có mạng. Không chữ lỗi. |
| Âm thanh bị khoá | Mọi màn | Quay lại từ nền mà AudioContext bị treo → `button-play` phủ lên màn hiện tại (cảnh tối nhẹ); chạm → tiếp tục đúng chỗ, giữ nguyên tiến trình. |
| Mời chơi (rảnh) | Con đường | Mỗi 4–6s chỉ một trạm khẽ cử động. Yên ~8s → một trạm có `hint-ring` + lời mời + tên trạm (FR2); các lần sau cách ≥ 20s, tối đa 3 lần rồi im (chỉ còn nhún). |
| Đảo trống (lần đầu) | Con đường | Vị trí trang trí để trống, không hiện ô chờ hay dấu "còn thiếu". |
| Đảo đầy chỗ | Con đường | Món cũ bay vút lên như bóng bay, món mới bay vào cùng chỗ. |
| Đang chuyển cảnh | Bản đồ ↔ trò | Kart chạy + camera phóng vào. Chạm trạm khác → đổi hướng; chạm kart → bíp + tăng tốc; `button-speaker` vẫn chạy; chạm khác có nảy nhẹ, không làm gì. |
| Chờ yêu cầu | Mọi trò | Giọng nói yêu cầu khi vào màn; nhân vật nhìn về phía bé. Đồng hồ gợi ý bắt đầu khi câu nói kết thúc. |
| Gợi ý | Mọi trò có yêu cầu | Leo thang theo **thời gian hoặc số lần chưa đúng, cái nào tới trước**; không bao giờ hạ bậc trong một câu, reset khi sang câu mới. **Bậc 1** – lần 1 chưa đúng: vật trôi về + nhắc lại ngắn. **Bậc 2** – lần 2, hoặc ~6s yên: `hint-ring` quanh vật đúng + vật đúng nhún; mọi chuyển động nền dừng; vòng giữ tới khi đúng. **Bậc 3** – lần 3, hoặc thêm ~6s: `hint-hand` diễn động tác, lặp mỗi ~15s (giọng mỗi ~30s). **Bậc 4** – lần 4+: vật sai mờ 60% và không nhấc được, vùng hút đích gấp đôi; bé vẫn tự làm (không làm hộ). Mốc giây cần thử với bé. |
| Đúng | Mọi trò | Vật hút vào đích, nhân vật vui + nhạc 1–2s, rồi câu tiếp. Phản hồi bắt đầu trong 100 ms (NFR5). |
| Chưa đúng | Mọi trò có yêu cầu | Theo bảng trò (trôi về / cá lặn). Không màu đỏ, không tiếng sai. |
| Bị gián đoạn giữa kéo | Kéo thả, Đường đua | Xem `draggable-item`, `trace-path`: kart dừng chờ, khẽ nhấp nháy; ngón đặt lại trong ~100 pt quanh kart → đi tiếp (FR12, NFR2). |
| Xong lượt | Trò → bản đồ | Nhân vật ăn mừng (~1.5s) → camera lùi về cảnh đảo quanh trạm (≤ 1.5s) → món trang trí bay vào (~1s) → lớp phủ Hỏi chơi tiếp. Tổng ≤ 4s trước khi 2 nút hiện. |
| Hỏi chơi tiếp | Lớp phủ trên bản đồ | Hai nút hiện: `button-replay` nhún + *"Chơi nữa với bạn Shiba nhé?"* (tên nhân vật theo trò), rồi `button-back-to-map` nhún + *"Hay mình đi chỗ khác?"*. Yên ~10s → nhắc một lần, `hint-ring` luân phiên giữa hai nút. Yên ~30s → lớp phủ tự đóng nhẹ, bé ở lại bản đồ (Mời chơi tiếp tục). |
| Lượt dở | Con đường | Sau nút Nhà: trạm đó có vòng nhỏ; vào lại → tiếp tục câu đang dở (chỉ trong phiên). |
| Tự do | Chạm là nói | Không yêu cầu, không gợi ý, không kết lượt. Đủ ~8 vật khác nhau → món trang trí hiện ngay trong cảnh cạnh vật vừa chạm, lấp lánh, rồi bay ra khỏi khung về phía bản đồ; bé vẫn chơi tiếp. Lần về bản đồ sau, món đó đang lấp lánh ở trạm phố. |
| Offline | Toàn app | Không báo lỗi; mọi thứ đã lưu sẵn. Nếu iOS xoá dữ liệu PWA, app tải lại khi có mạng và đảo trở về trống. |
| Ứng dụng bị ẩn | Toàn app | Dừng giọng đọc và nhạc; quay lại → giữ nguyên màn, kèm Âm thanh bị khoá nếu cần. |

## Interaction Primitives

- **Chạm** một ngón: chọn trạm, câu cá, chạm vật ở Chạm là nói, nút.
- **Kéo dễ dãi**: vùng hút `{spacing.snap-radius}` quanh đích; nhấc tay không mất tiến trình (NFR2).
- **Vạch theo đường** (Đường đua): dung sai `{components.trace-path.tolerance}` mỗi bên, kart không rời đường (xem `trace-path`).
- Vùng chạm ≥ `{spacing.target-min}`, cách nhau ≥ `{spacing.target-gap}`; vật = hình + `{spacing.hit-pad}` (NFR1). Trạm cách nhau ≥ `{spacing.station-gap}`.
- **Ngón đầu tiên thắng:** chạm đầu tiên đặt lên một vật/nút sở hữu nó (theo `pointerId`); mọi chạm thêm (ngón cái giữ máy, tay kia, **bố mẹ chỉ vào màn**) bị bỏ qua, **không huỷ** chạm đầu. Chạm đầu kết thúc → áp dụng "nhấc tay giữa đường". Bố mẹ chạm màn không bao giờ phá lượt của bé.
- **Dải mép chết:** chạm bắt đầu trong `{spacing.edge-dead-side}` trái/phải, `{spacing.edge-dead-top}` trên, `{spacing.edge-dead-bottom}` dưới không nhặt vật trò chơi (nút Nhà/Loa nằm ngoài dải nên vẫn chạm được). Vật đang kéo và đường đua không đi vào các dải này – tránh kích hoạt Control Center, Trung tâm thông báo, vuốt Home.
- **Lòng bàn tay:** chỉ lọc nếu đo được bán kính chạm (`Touch.radiusX/Y`) trên iPad thật; nếu không đo được thì dựa vào "ngón đầu tiên thắng".
- **Một kênh giọng nói:** chạm vật mới khi câu cũ còn < 0.5s → cho xong rồi phát; chạm lại vật đang nói → bỏ qua. Hiệu ứng (nảy, "pụp") vẫn phát ngay ≤ 100 ms.
- **Cấm**: pinch, xoay, vuốt nhiều ngón, nhấn giữ, double-tap zoom, kéo xuống tải lại, chọn chữ, menu ngữ cảnh/"Lưu ảnh", liên kết ra ngoài (NFR6, NFR8).

## Accessibility Floor

Hành vi. Màu sắc & độ tương phản xem `DESIGN.md`.

- Mọi yêu cầu bằng giọng đọc và nghe lại được bằng `button-speaker` (NFR3); không có thông tin chỉ truyền bằng chữ.
- **Không chỉ dựa vào màu:** gợi ý dùng vòng ba lớp + chuyển động của chính vật + bàn tay. Khi màu là nội dung học (kem, cá): vật còn khác nhau về hình/hoa văn và độ sáng, và giọng đọc gọi cả tên vị/đặc điểm ("kem dâu màu hồng", "cá vàng sọc"). Bé có thể mù màu đỏ–lục (~8% bé trai) – vẫn tới được bậc gợi ý 4 nên không kẹt.
- Không thời gian giới hạn, không áp lực (NFR4). Gợi ý chỉ thêm trợ giúp, không bao giờ tự làm hộ.
- Nhấp nháy ≤ 1 Hz; không vùng sáng–tối đảo nhanh > 25% màn; lấp lánh là sao nhỏ mờ dần, không chớp.
- **Một thứ chuyển động nổi bật tại một thời điểm**; khi có `hint-ring` thì chuyển động nền dừng. Tôn trọng `prefers-reduced-motion`: giảm biên độ, thay camera zoom bằng chuyển cảnh mờ.
- Âm lượng theo Voice and Tone › Âm thanh; không có âm thanh to/trầm đột ngột, không tiếng gầm.
- Không cảnh tối: Tìm bóng diễn ra ở cửa hang sáng, bóng màu tím-xám chứ không đen; khủng long ba sừng xuất hiện từ từ, không bật ra.

## Key Flows

Nhân vật chính: **Bé** – cậu bé 3 tuổi (quyết định không đặt tên riêng; app gọi "Bé ơi").

### Flow 1 — UJ-1: Một buổi chơi buổi tối (Bé, sau bữa tối, ngồi trên sofa)

1. Bé chạm biểu tượng app trên màn hình chính iPad.
2. Màn Mở đầu: `button-play` nhún. Bé chạm → "pụp", nhạc nền nhẹ bắt đầu.
3. Màn Con đường: hòn đảo, thỉnh thoảng một trạm khẽ cử động. ~8s sau xe kem có vòng gợi ý: *"Bé ơi, mình đi ăn kem nhé!"*
4. Bé chạm xe kem → xe kem nhún, đọc tên; kart chạy tới (≤ 2s), camera phóng vào quầy.
5. Tiệm kem: Shiba sau quầy hồng. *"Cho bạn Shiba… kem dâu màu hồng nào!"*
6. Bé kéo kem hồng (có quả dâu nhỏ) lên ốc quế → hút vào, Shiba vẫy đuôi, nhạc vui 1–2s. Câu tiếp theo.
7. Sau 3–5 câu, Shiba liếm kem, lượt kết thúc.
8. Camera lùi về cảnh đảo quanh xe kem; một quả bóng bay tự bay tới gắn vào xe kem, lấp lánh.
9. **Climax:** hòn đảo của Bé đẹp thêm một chút – thứ bé vừa "làm ra" nằm ngay đó, lần sau mở app vẫn còn.
10. Lớp phủ Hỏi chơi tiếp hiện trên bản đồ: nút Shiba nhún – *"Chơi nữa với bạn Shiba nhé?"*; nút hòn đảo nhún – *"Hay mình đi chỗ khác?"*
11. Bé chạm nút hòn đảo → lớp phủ đóng, bé chạm hồ cá → kart chạy tới.
12. Bé gập máy hoặc bố mẹ cất máy. Không có màn kết thúc.

Thất bại: mở lần đầu khi offline → kart chờ trên dải đường, tự tải khi có mạng. Quay lại từ nền → `button-play` phủ lên, chạm là chơi tiếp đúng chỗ.

### Flow 2 — Chưa đúng và được gợi ý (Bé, Tiệm kem, lượt 2 viên)

1. *"Cho bạn Shiba… kem sô-cô-la và kem dâu nào!"*
2. Bé kéo kem dâu trước, thả lên ốc quế → **hút vào** (mọi thứ tự đều nhận).
3. Bé kéo tiếp kem vani, thả lên ốc quế → kem trôi về nhẹ nhàng; *"Mình tìm kem sô-cô-la màu nâu nhé!"* (bậc 1).
4. Bé lại thả vani → vòng gợi ý quanh kem sô-cô-la, kem sô-cô-la nhún (bậc 2). Bé chạm thử kem khác – vòng vẫn giữ.
5. Bé ngồi nhìn ~6s → bàn tay diễn động tác kéo kem sô-cô-la tới ốc quế (bậc 3).
6. Bé làm theo → hút vào, chồng lên kem dâu.
7. **Climax:** Shiba vẫy đuôi, liếm kem – bé chưa bao giờ nghe thấy chữ "sai".

### Flow 3 — Nhấc tay giữa đường đua (Bé, Đường đua, đường cong)

1. Đường cong hiện, `kart` có bạn nhỏ ở đầu: *"Bé lái xe tới cổng nhé!"*
2. Bé vạch theo đường, kart chạy theo ngón; ngón lệch vẫn được tính, kart không bao giờ rời đường.
3. Bé nhấc tay giữa đường → kart dừng chờ, nhấp nháy nhẹ.
4. Bé đặt ngón lại gần kart → tiếp tục, không làm lại từ đầu.
5. **Climax:** kart qua cổng caro, bạn nhỏ vẫy tay, còi bíp vui.

### Flow 4 — Làm pizza cho cáo (Bé, lượt đầu)

1. Cáo ngồi sau quầy, đế bánh ở giữa, bát xúc xích và bát nấm hai bên: *"Bé ơi, hai lát xúc xích nào!"*
2. Bé kéo lát thứ nhất → hút vào đế: *"Một!"*; lát thứ hai: *"Hai!"*
3. Lò hé cửa, có vòng mời: *"Mình nướng bánh nào!"*
4. Bé chạm lò → bánh trượt vào, ô kính sáng cam dịu ~2s, "ting!", bánh ra bốc hơi.
5. **Climax:** cáo cầm bánh "măm măm", vẫy đuôi.

### Flow 5 — Ghép khủng long sống dậy (Bé, 3 mảnh)

1. Bóng mờ khủng long cổ dài trên cỏ, 3 mảnh nằm quanh: *"Mình ghép bạn khủng long nào!"*
2. Bé kéo mảnh đầu vào ô thân → trôi về; kéo vào ô đầu → hút vào, mảnh có màu.
3. Bé ghép nốt hai mảnh, theo thứ tự bất kỳ.
4. **Climax:** khủng long chớp mắt, nhún nhảy, đi vài bước, kêu nhỏ vui – *"Khủng long cổ dài!"*

## Inspiration & Anti-patterns

- **Lấy từ Sago Mini World / Toca Boca:** chơi tự do không thua – mẫu cho Chạm là nói.
- **Lấy từ Khan Academy Kids:** nhân vật dẫn dắt hoạt động bằng giọng nói.
- **Lấy từ bản đồ phiêu lưu trong game:** một thế giới liền mạch, trạm là điểm trong cảnh, xe của bé di chuyển giữa các trạm.
- **Từ chối — app thẻ hình tiếng Việt (Vkids…):** quảng cáo, mua trong app, chỉ xem không làm.
- **Từ chối — pháo giấy, sao, điểm, lời khen:** ăn mừng bằng nhân vật.
- **Từ chối — màn Bộ sưu tập sticker:** thay bằng trang trí đảo; phần thưởng ở ngay nơi bé chơi.

## Responsive & Platform

- Chỉ iPad ngang. Safari không khoá hướng qua manifest → khi iPad dọc, **xoay toàn bộ sân khấu 90° bằng CSS** để vẫn chơi được (không hiện màn "xoay máy" bé không hiểu). [ASSUMPTION – cần thử trên máy]
- iPad không phải 4:3: xem `DESIGN.md` › Layout (vùng an toàn, hit-map theo ảnh).
- Mở khoá âm thanh bằng `button-play` (phụ lục PRD).
- Chặn bằng CSS/HTML: `touch-action: none` trên sân khấu, `user-select: none`, `-webkit-touch-callout: none`, `overscroll-behavior: none`, `draggable="false"` cho mọi ảnh/sprite.
- Cử chỉ hệ thống (Control Center, vuốt Home, đa nhiệm) PWA không chặn được → dải mép chết + vị trí nút Loa (Interaction Primitives) giảm chạm nhầm; chặn hẳn chỉ bằng Guided Access.
- **Mẹo cho bố mẹ:** bật Guided Access (Trợ năng › Truy cập được hướng dẫn) và tắt "Cử chỉ đa nhiệm". Chỉ ghi trong README, không hiện trong app (đã chốt).

## Open Questions

1. **PRD cần cập nhật:** FR22–FR23 (sticker + Bộ sưu tập → đồ trang trí đảo); FR5 (thứ tự → nhận mọi thứ tự, trừ bậc khó cao nhất); FR19 ("gầm lên" → kêu nhỏ vui + nhún nhảy); UJ-1 bước 4–6 (gấu → Shiba, sticker → trang trí); NFR9 (đất sét → đồ chơi low-poly). State "Xong lượt" vẫn dựa mốc 3–5 câu của FR22.
2. **Danh mục đồ trang trí theo trạm** và số vị trí mỗi trạm.
3. **Tinh chỉnh thời gian:** mốc gợi ý ~6s/+6s, nhịp lời mời bản đồ, 30s tự đóng lớp phủ – cần thử với bé.
4. **Font:** Baloo 2 là giả định – cần duyệt.
**Đã chốt (2026-10-08):**
- **Độ khó** từng trò được **lưu trên máy** qua các lần mở app (cùng chỗ với đồ trang trí).
- **Không** có nghi thức "tạm biệt" hay bất kỳ nhắc thời gian nào – đúng PRD.
- **Thứ tự nhiều bước:** nhận mọi thứ tự ở mọi bậc, **trừ bậc khó cao nhất** của Tiệm kem (FR5) bắt đúng thứ tự; khi sai thứ tự → viên kem trôi về, giọng nhắc lại thứ tự, gợi ý leo thang như thường.
- **Giọng đọc:** TTS tạo sẵn, giọng nữ nhẹ nhàng (không thu giọng mẹ).
- **Mẹo Guided Access:** chỉ ghi trong README, không hiện trong app.
- **Lượt dở sau nút Nhà:** chỉ giữ trong phiên; tắt app thì mất.

**Đã chốt từ danh sách cũ:** nhân vật đồng hành – Tiệm kem: Shiba · Làm pizza: cáo (Quaternius `Fox.fbx`) · Đường đua: bạn nhỏ trong kart · Tìm bóng: khủng long ba sừng. Đảo đầy chỗ → thay món cũ bằng món mới. Nút Nhà không hỏi xác nhận, giữ lượt dở. Khủng long ăn mừng: kêu nhỏ vui + nhún nhảy, không gầm.

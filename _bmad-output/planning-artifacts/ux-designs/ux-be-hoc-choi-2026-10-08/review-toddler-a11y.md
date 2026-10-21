---
title: "Review – Khả năng tiếp cận & thao tác cho trẻ 3 tuổi – Bé Học Chơi"
created: 2026-10-08
reviewer: lens trẻ 3 tuổi (chưa biết đọc, vận động tinh đang phát triển, tập trung ngắn, dễ nản/dễ sợ)
inputs:
  - DESIGN.md
  - EXPERIENCE.md
  - .memlog.md
  - .working/render-con-duong-v2.png
  - .working/render-tiem-kem-v2.png
---

# Review khả năng tiếp cận cho trẻ 3 tuổi

**Kết luận:** Nền tảng đúng hướng (không chữ, không thua, giọng đọc, nút to, kéo dễ dãi, nghe lại được). Nhưng spine còn **hai lỗ hổng có thể làm bé bỏ chơi hoặc khóc**: (1) quy tắc "bỏ qua chạm nhiều ngón" sẽ làm thao tác kéo của bé chết đứng mỗi khi tay kia/ngón cái chạm màn hình hoặc bố mẹ chỉ vào màn, và (2) chuỗi gợi ý chỉ chạy khi bé *ngồi yên* – bé đang loay hoay làm sai sẽ không bao giờ được giúp, còn vòng sáng lại biến mất đúng lúc bé cần. Ngoài ra có một loạt điểm cần thông số cụ thể (vùng hút, dung sai, âm lượng, nhịp lặp lời) trước khi làm.

Mức độ đã hiệu chỉnh theo dự án hobby: **Critical** = rất có thể làm bé bỏ cuộc/khóc trong vài phút đầu; **High** = gây nản lặp lại hoặc sợ; **Medium** = khó chịu, nên sửa trước khi làm trò tương ứng; **Low** = đánh bóng.

Số liệu tham chiếu: render 1600×1200 ↔ khung 1024×768 pt (hệ số 0.64). iPad 2× ≈ 132 pt/inch → 80 pt ≈ 15 mm, 88 pt ≈ 17 mm.

---

## CRITICAL

### C1. "Bỏ qua chạm nhiều ngón" sẽ giết thao tác kéo và chơi cùng bố mẹ
- **Vị trí:** EXPERIENCE › Interaction Primitives ("Bỏ qua: lòng bàn tay, chạm nhiều ngón cùng lúc"); Component Patterns › `button-play` ("Chỉ phản ứng với 1 ngón").
- **Vì sao quan trọng với bé 3 tuổi:** Bé 3 tuổi gần như luôn có chạm thứ hai: ngón cái tay kia giữ mép iPad, cổ tay/lòng bàn tay tì lên màn khi kéo, hoặc bố mẹ ngồi cạnh chỉ "kem dâu đây con". Nếu "chạm nhiều ngón" nghĩa là *huỷ/không nhận*, cây kem sẽ không nhấc lên hoặc tuột khỏi ngón giữa chừng – với bé đó là "máy hỏng", không phải lỗi của bé. Đây là lý do số 1 khiến trẻ nhỏ bỏ app kéo-thả.
- **Sửa cụ thể:**
  - Đổi quy tắc thành **"ngón đầu tiên thắng"**: theo dõi `pointerId` của chạm đầu tiên đặt lên một vật/nút; mọi chạm thêm sau đó bị *bỏ qua* (không huỷ chạm đầu).
  - Chạm bắt đầu trong dải **~24 pt sát mép màn** (nơi ngón cái giữ máy) không được nhặt vật trò chơi (vẫn cho nút Nhà/Loa vì chúng có inset riêng).
  - "Lòng bàn tay": chỉ lọc nếu đo được bán kính chạm (`Touch.radiusX/Y` – cần thử trên Safari iPad thật; nếu không đo được thì bỏ quy tắc này, dựa vào "ngón đầu thắng").
  - Khi đang kéo mà chạm đầu kết thúc → áp dụng quy tắc "nhấc tay giữa đường" bình thường.
  - Ghi rõ trong spine: bố mẹ chạm vào màn để chỉ **không** phá lượt của bé.

### C2. Chuỗi gợi ý không giúp bé đang làm sai; vòng sáng biến mất đúng lúc cần
- **Vị trí:** EXPERIENCE › State "Gợi ý" (~5s chưa làm → vòng; +5s → bàn tay); Component `hint-ring/hint-hand` ("Biến mất ngay khi bé chạm/kéo bất kỳ vật nào"); State "Thả sai"; Flow 2.
- **Vì sao:** Bé 3 tuổi không "ngồi yên 5 giây" khi bí – bé **thử liên tục**: nhấc kem sai, thả, nhấc lại. Theo spine, mỗi lần chạm reset đồng hồ không-hoạt-động, nên bé đang thử-sai sẽ **không bao giờ** thấy vòng sáng hay bàn tay. Khi vòng sáng vừa hiện, bé chạm nhầm vật khác → vòng tắt ngay, phải chờ lại 5s. Kết quả là vòng lặp: thả sai → kem trôi về → giọng nhắc → thả sai… – đúng kịch bản bé gạt máy/khóc.
- **Sửa cụ thể:** Leo thang theo **cả thời gian lẫn số lần sai**:
  1. Sai lần 1: vật trôi về + nhắc lại yêu cầu (như spine).
  2. Sai lần 2 (hoặc 5s không làm): `hint-ring` quanh vật đúng **và vật đúng nhún nhẹ**; vòng **không tắt** khi bé chạm vật khác – chỉ tắt khi đặt đúng.
  3. Sai lần 3 (hoặc thêm 5s): `hint-hand` diễn động tác.
  4. Sai lần 4+: "lỗi không thể xảy ra" – các vật sai mờ nhẹ và không nhấc được, chỉ vật đúng còn sáng; vùng hút của đích phóng to gấp đôi. Bé vẫn tự kéo (không vi phạm "không làm hộ").
  - Đồng hồ gợi ý bắt đầu **sau khi câu nói kết thúc**, không phải khi vào màn.
  - Sau khi đúng, reset bậc leo thang cho câu sau.

### C3. Yêu cầu hai bước bắt buộc thứ tự làm vật "đúng" bị từ chối
- **Vị trí:** EXPERIENCE › Flow 2 ("kem sô-cô-la rồi kem dâu" → bé kéo kem dâu trước → kem trôi về).
- **Vì sao:** Trí nhớ làm việc của bé 3 tuổi thường giữ được 1 yêu cầu, 2 yêu cầu có thứ tự là mức khó. Bé thường nhớ **từ cuối** ("dâu") – đúng là thứ bé kéo trong Flow 2. Bé đưa *một viên kem có trong câu nói* mà bị đẩy về: bé không hiểu vì sao, cảm giác như bị từ chối dù đã nghe đúng. Đây là cảm giác "sai" mà spine muốn tránh.
- **Sửa cụ thể:** Ở bé 3 tuổi, **nhận cả hai thứ tự** (kem nào có trong yêu cầu cũng hút vào; ốc quế xếp đúng chồng). Nếu muốn dạy thứ tự, tách thành hai câu nối tiếp: "Kem sô-cô-la trước nào!" → đúng → "Giờ thêm kem dâu!". Chỉ bật "bắt buộc thứ tự" ở bậc khó cao nhất sau khi bé đã làm đúng nhiều lượt.

---

## HIGH

### H1. Vòng gợi ý vàng gần như vô hình trên quầy trắng, cỏ và cát
- **Vị trí:** DESIGN › colors `hint-glow #FFE45C`; Colors ("phải nổi rõ… kiểm lại trên ảnh render thật"); render-tiem-kem-v2.png (vòng quanh kem dâu).
- **Đo:** `#FFE45C` trên trắng ≈ **1.3:1**, trên cỏ `#7CCB4E` ≈ **1.6:1**, trên cát `#F6D79A` ≈ **1.1:1** (chỉ trên đường `#5B6270` đạt ≈ 4.8:1). Trong render Tiệm kem, vòng vàng nhạt trên mặt quầy trắng chỉ thấy khi nhìn kỹ.
- **Vì sao:** Vòng sáng là kênh gợi ý chính cho bé chưa biết đọc. Nếu bé không thấy nó thì gợi ý bậc 2 coi như không tồn tại.
- **Sửa:** Vòng **hai lớp**: lõi `#FFE45C` dày 6–8 pt + viền ngoài tối/đậm 3 pt (vd `#FF8A00` hoặc `{colors.ink-parent}` ở 60%) + quầng trắng mờ; cộng **chuyển động của chính vật** (nhún/lắc) để không dựa vào màu. Đặt tiêu chí: vòng đạt ≥ 3:1 so với nền ngay sát nó trên *mọi* màn (cỏ, cát, trắng, hồng). Kiểm lại trên ảnh render.

### H2. Vùng chạm các trạm trên bản đồ chồng nhau → kart chạy nhầm 2–3s mà không huỷ được
- **Vị trí:** DESIGN › Layout ("vùng chạm lớn hơn hình hiển thị", gap ≥ 24); EXPERIENCE › `station-hotspot`, State "Đang chuyển cảnh" (mọi chạm bị bỏ qua); render-con-duong-v2.png.
- **Đo trên render:** Hàng rào công viên khủng long và mép trên hồ cá cách nhau ~30 px render ≈ **19 pt** (< 24), con cá cam nổi trên hồ lấn vào hàng rào; mái toà nhà phố và chân hang chạm nhau (khoảng cách ≈ 0). Nếu nở vùng chạm "lớn hơn mô hình", các vùng này chắc chắn chồng nhau.
- **Vì sao:** Bé chạm khủng long → được đưa đi câu cá. Kart chạy 2–3s, mọi chạm bị bỏ qua, rồi vào nhầm trò; muốn sửa phải tìm nút Nhà. Với bé 3 tuổi muốn "khủng long" thì đây là chuyện khóc được.
- **Sửa:** (a) Dời bố cục: tách hồ cá khỏi công viên khủng long và hang khỏi khu phố ≥ 40 pt; (b) vẽ bản đồ vùng chạm (hit-map) riêng theo đa giác, không nở đồng đều; vùng giao nhau chia theo đường giữa; (c) chạm trạm → **đọc tên trạm + trạm nhún trước** (~0.5s), kart mới chạy; trong lúc kart chạy, **chạm trạm khác thì kart đổi hướng** (thay vì bỏ qua) – vừa sửa chạm nhầm vừa cho bé quyền điều khiển.

### H3. "dâu" / "đâu" + nhạc nền + TTS: nguy cơ bé không nghe ra từ khoá
- **Vị trí:** EXPERIENCE › Voice and Tone ("Mình thử lại nhé – viên kem màu dâu đâu nhỉ?"; "Cho bạn Shiba một viên kem màu dâu nào!"); Foundation (TTS tạo sẵn); "Nhạc nền nhỏ… tự hạ khi giọng nói".
- **Vì sao:**
  - "màu **dâu** **đâu** nhỉ" đặt hai từ gần đồng âm cạnh nhau – chính từ khoá bị một từ hỏi gần giống đè lên.
  - "màu dâu" là màu gián tiếp: quả dâu tây **màu đỏ**, kem dâu **màu hồng**; bé 3 tuổi học "màu hồng", chưa chắc hiểu "màu dâu".
  - Tiếng Việt có thanh điệu; nhạc nền có giai điệu dưới giọng nói làm nhoè đường thanh – bé 3 tuổi nghe kém trong nhiễu hơn người lớn rất nhiều.
  - TTS tiếng Việt hay sai thanh/nhịp ở từ mượn ("sô-cô-la"), đọc nhanh, không nhấn từ khoá.
- **Sửa:**
  - Lời: "Cho bạn Shiba **kem dâu** – **màu hồng** nào!" / khi thử lại: "Kem dâu màu hồng ở đâu nhỉ?" (không để "dâu đâu" liền nhau). Lập danh sách cặp dễ lẫn (dâu/đâu, cá/cà, ba/bà…) và rà toàn bộ kịch bản.
  - Âm thanh: khi giọng nói, **hạ nhạc ≥ 15–20 dB hoặc tắt hẳn** (không chỉ "nhỏ hơn"); cho nhạc dạng nhạc cụ ít giai điệu.
  - TTS: tốc độ ~0.85×, nghỉ ~300 ms trước từ khoá, câu ≤ 8 từ; người lớn nghe duyệt **từng file**; cân nhắc thu giọng mẹ thật cho các câu yêu cầu.

### H4. "Khủng long gầm vui" có thể làm bé sợ đúng lúc vừa làm đúng
- **Vị trí:** EXPERIENCE › Component `character` ("khủng long gầm vui"); DESIGN › character; Do/Don't (đã cấm T-rex nhưng không nói về âm thanh).
- **Vì sao:** Với trẻ 3 tuổi, tiếng gầm trầm/to đột ngột là kích thích gây sợ kinh điển – dù khủng long hiền. Nó lại xảy ra như *phần thưởng*, ngay sau hành động của bé, nên bé có thể liên kết "làm đúng → bị doạ" và ngại chơi tiếp. Spine nói "không có âm thanh to đột ngột" nhưng không có con số.
- **Sửa:** Thay "gầm" bằng tiếng kêu **cao, ngắn, mềm** ("ù-ù!", "bíp-bíp", tiếng cười khúc khích) dài ≤ 0.8s, không dải trầm < 150 Hz, có fade-in ≥ 50 ms. Thêm chuẩn âm lượng: giọng nói ≈ −16 LUFS, hiệu ứng đỉnh không vượt giọng nói, nhạc nền ≤ −30 LUFS. Ghi vào Accessibility Floor.

### H5. Vật thả giữa chừng "đứng yên tại chỗ" → vật rơi vãi, che nhau, kẹt ở mép
- **Vị trí:** EXPERIENCE › `draggable-item` ("Nhấc tay giữa đường → vật đứng yên tại chỗ, không reset"), State "Bị gián đoạn giữa kéo".
- **Vì sao:** Bé 3 tuổi nhấc tay giữa đường rất thường xuyên. Nếu vật nằm lại bất kỳ đâu: kem có thể đè lên kem khác, nằm dưới nút Nhà/Loa, sát mép dưới (vùng vuốt Home của iPad) hoặc lơ lửng trên nền cảnh – bé không biết nhặt lại ở đâu, và lần kéo sau dễ kích hoạt cử chỉ hệ thống.
- **Sửa:** Giữ nguyên ý "không mất tiến trình", nhưng: vật thả **trong vùng hút** → hút vào đích; thả **trên quầy/khay** → nằm đó nhưng tự đẩy nhẹ để không chồng vật khác; thả **ngoài quầy** → sau ~1.5s trượt nhẹ về chỗ cũ. Giới hạn vùng kéo: vật không vào dải 40 pt sát mép dưới và vùng nút góc trên. Ghi rõ **bán kính vùng hút** (đề xuất ≥ 100 pt quanh tâm đích, hoặc cả nửa trên quầy + thân nhân vật đều tính là "đưa cho Shiba").

### H6. Cử chỉ hệ thống iPad ở mép màn: Control Center ngay trên nút Loa, vuốt Home ở mép dưới
- **Vị trí:** DESIGN › `button-speaker` (top-right, inset 20); Layout (inset 20 pt); EXPERIENCE › Responsive (Guided Access chỉ là "mẹo", vị trí chưa chốt – Open Q6).
- **Vì sao:** Trên iPad, vuốt xuống từ góc trên phải mở Control Center, vuốt lên từ mép dưới về màn hình chính, kéo 4–5 ngón/lòng bàn tay có thể chuyển app. PWA trên Safari **không** chặn được các cử chỉ này. Bé kéo kem lên cao hoặc trượt ngón khi chạm Loa → bị đẩy ra khỏi app, mất âm thanh (phải chạm Play lại) – rất khó hiểu với bé.
- **Sửa:** (a) Inset các nút = `env(safe-area-inset-*) + 20 pt`, dời nút Loa xuống ~ 32 pt từ mép trên; (b) không đặt vật kéo/đường đua/đích thả trong dải 40 pt sát mép dưới và 32 pt sát mép trên; (c) nâng mẹo Guided Access + tắt "Cử chỉ đa nhiệm" thành **bước thiết lập bắt buộc cho bố mẹ** (vd hiện chữ nhỏ dưới nút Play ở lần mở đầu tiên, có thể ẩn) thay vì Open Question.

### H7. Đường đua: "dung sai" chưa có con số – vạch theo đường cong là kỹ năng khó ở tuổi 3
- **Vị trí:** EXPERIENCE › Interaction Primitives ("Vạch theo đường… lệch trong dung sai vẫn tính"), Flow 3.
- **Vì sao:** Trẻ 3 tuổi mới vẽ được nét thẳng/vòng tròn thô; bám theo đường cong là khó. Spine không nói điều gì xảy ra khi ngón lệch *quá* dung sai – nếu ô tô dừng/không chạy, bé sẽ thấy "xe không chịu đi".
- **Sửa:** Ô tô **không bao giờ rời đường**: lấy điểm chiếu gần nhất của ngón lên đường và chỉ cho tiến lên; dung sai ≥ 80 pt mỗi bên; lệch xa hơn thì xe chạy chậm lại chứ không dừng; chỉ tiến, không lùi. Đường rộng ≥ 100 pt, độ cong lớn ở bậc đầu (bắt đầu bằng đường gần thẳng).

### H8. Nút Nhà chạm 1 lần là mất lượt dở – nút nổi bật nhất màn hình
- **Vị trí:** EXPERIENCE › `button-home` ("không hỏi xác nhận. Lượt dở không được thưởng"), Open Q5.
- **Vì sao:** Nút tròn vàng 88 pt nhún bóng là thứ "trông như để bấm" nhất màn – bé sẽ bấm thử, hoặc bấm nhầm khi với lấy kem bên trái. Bé đang ở câu 4/5 bị đưa về bản đồ, không có bóng bay – cảm giác mất mát. Hỏi xác nhận bằng chữ thì bé không hiểu, nên không phải giải pháp.
- **Sửa:** Giữ "không hỏi", nhưng **lưu lượt dở**: về bản đồ, trạm đó có vòng nhỏ; vào lại trạm → tiếp tục câu đang dở. Thêm phản hồi ngay khi chạm Nhà (nút lún + tiếng "pụp" + giọng "Về đảo nào!") để bé hiểu chuyện gì xảy ra.

---

## MEDIUM

### M1. Hai nút cuối lượt: bé không đọc được ↻ và không biết phải chọn
- **Vị trí:** EXPERIENCE › Flow 1 bước 10, `button-replay`, `button-back-to-map`; DESIGN (icon ↻ [ASSUMPTION]).
- **Vì sao:** ↻ là biểu tượng trừu tượng; hai nút to hiện cùng lúc không có lời dẫn → bé chạm bừa hoặc ngồi chờ. Không quy định chuyện gì xảy ra nếu bé không chọn.
- **Sửa:** Giọng đọc + nhún lần lượt: nút replay nhún kèm "Chơi nữa với Shiba?" (icon là hình Shiba/xe kem to, không chỉ ↻), rồi nút bản đồ nhún kèm "Hay đi chơi chỗ khác?". Không chọn sau ~15s → nhắc một lần; ~30s → tự về bản đồ nhẹ nhàng.

### M2. Không có điểm dừng tự nhiên; phần thưởng vô tận → giành máy khó
- **Vị trí:** EXPERIENCE › Flow 1 bước 11 ("Không có màn kết thúc"); State "Tự do" (Chạm là nói không kết lượt, thưởng mỗi ~8 vật).
- **Vì sao:** Mỗi lượt đều có món mới bay vào đảo, Chạm là nói thưởng không ngừng → không có khoảnh khắc "xong rồi". Lúc bố mẹ cất máy thường là giữa chừng → ăn vạ. Dự án hobby nhưng đây là tình huống *hằng ngày*.
- **Sửa:** Thêm nghi thức kết thúc nhẹ: sau ~15–20 phút chơi chủ động (hằng số trong code, bố mẹ đổi được), sau khi xong lượt hiện tại: các bạn trên đảo ngáp/vẫy tay, giọng "Hôm nay đảo của Bé đẹp quá! Tạm biệt nhé!", máy quay lướt qua các món trang trí. Không khoá app – chỉ tạo khoảnh khắc để bố mẹ nói "mình cất máy nhé". Không dùng cảnh đêm (giữ quy tắc DESIGN).

### M3. Lời mời và lời nhắc lặp vô hạn → cằn nhằn
- **Vị trí:** EXPERIENCE › State "Mời chơi" ("Lần lượt đổi trạm"), "Gợi ý", "Thả sai" (nhắc lại mỗi lần sai).
- **Vì sao:** Bé đang ngắm đảo/chạm đồ trang trí mà cứ vài giây lại bị mời; mỗi lần thả sai lại nghe nguyên câu yêu cầu. Lặp nhiều làm bé lờ giọng nói đi (hoặc bực).
- **Sửa:** Bản đồ: lời mời đầu sau ~8s yên, các lần sau cách ≥ 20s, tối đa 3 lần rồi im (chỉ còn trạm nhún). Trong trò: giọng nói lặp yêu cầu tối đa 1 lần/10s; sau bàn tay, lặp bàn tay mỗi ~15s nhưng giọng chỉ mỗi ~30s.

### M4. Quy tắc chen tiếng nói chưa có (nhất là Chạm là nói)
- **Vị trí:** EXPERIENCE › `button-speaker` (chỉ quy định cho Loa); State "Tự do".
- **Vì sao:** Bé chạm liên tục nhiều vật → từ nào cũng bị cắt nửa chừng, bé không bao giờ nghe trọn tên; hoặc tiếng chồng nhau.
- **Sửa:** Một kênh giọng nói duy nhất; chạm vật mới khi từ cũ còn < 0.5s → cho xong rồi phát; chạm lại cùng vật đang nói → bỏ qua. Hiệu ứng (nảy, "pụp") vẫn phát ngay ≤ 100 ms để bé thấy phản hồi.

### M5. Chuyển động liên tục khắp nơi → quá tải
- **Vị trí:** DESIGN › `button-play` (nhún liên tục), `station-hotspot` pulse; EXPERIENCE › "Mỗi trạm khẽ cử động", `button-speaker` "sóng âm nhấp nháy", character thở, decoration lấp lánh.
- **Vì sao:** Bảy trạm cùng cử động + vòng sáng + kart + đồ trang trí lấp lánh: bé 3 tuổi khó biết nhìn đâu, và chuyển động nền cạnh tranh với vòng gợi ý (vốn là tín hiệu duy nhất cần chú ý).
- **Sửa:** Quy tắc "một thứ chuyển động nổi bật tại một thời điểm": trạm nghỉ thì tĩnh, mỗi ~4–6s một trạm cử động nhẹ ngẫu nhiên; khi có `hint-ring` thì mọi chuyển động nền dừng. Tôn trọng `prefers-reduced-motion` (giảm biên độ, bỏ camera zoom).

### M6. Thời gian chuyển cảnh: chấp nhận được nhưng cần trần và chỗ cho bé "tham gia"
- **Vị trí:** EXPERIENCE › `kart` (2–3s), State "Đang chuyển cảnh", Flow 1 bước 4 và 8.
- **Vì sao:** 2–3s kart + zoom + (lúc ra) lùi camera + bóng bay bay + 2 nút hiện: mỗi vòng ~6–8s chờ thụ động; ×7 trạm vẫn ổn với bé (bé thích xem xe chạy), nhưng nếu thời gian phụ thuộc quãng đường thì trạm xa có thể lâu hơn, và chạm bị bỏ qua làm bé tưởng máy đơ.
- **Sửa:** Trần cứng 2s cho kart bất kể quãng đường (lần đầu trong phiên có thể 2.5s, các lần sau 1.5s). Chạm vào kart lúc chạy → "bin bin" + tăng tốc (phản hồi thay vì im lặng). Toàn bộ chuỗi kết lượt ≤ 4s trước khi 2 nút hiện.

### M7. Chạm vào thứ "trông chạm được" mà không có gì xảy ra
- **Vị trí:** EXPERIENCE › IA/Con đường (chỉ trạm + đồ trang trí có phản ứng); render-con-duong-v2.png.
- **Vì sao:** Trên bản đồ có Shiba đi dạo, xe đua đỏ, kart, núi lửa, cây, bể bơi… – trẻ 3 tuổi sẽ chạm tất cả. Chạm không phản ứng = "app hỏng" và bé chạm mạnh/liên tục hơn.
- **Sửa:** Mọi vật nổi bật có phản ứng tối thiểu (nảy + tiếng nhỏ), không mở trò. Kart: còi "bíp". Tránh để vật trang trí trùng vùng chạm trạm (xem H2).

### M8. Bé có thể mù màu đỏ–lục; "màu" đang là nội dung học
- **Vị trí:** EXPERIENCE › Accessibility Floor ("Không phân biệt chỉ bằng màu khi màu không phải là nội dung học"); Flow 1–2 (kem dâu / sô-cô-la); render-tiem-kem-v2.png.
- **Vì sao:** ~8% bé trai bị mù màu đỏ–lục; bé là cậu bé. Nếu bé không phân biệt được, các câu "màu…" trở thành vòng lặp sai không lối thoát mà bố mẹ không hiểu vì sao. Thêm nữa, trong render **kem sô-cô-la đặt trên đế màu hồng/tím** – chính màu của kem dâu → tín hiệu lẫn ngay cả với bé nhìn màu bình thường.
- **Sửa:** Mỗi vị kem có **hình dạng/chi tiết riêng** (kem dâu có quả dâu nhỏ trên đỉnh, sô-cô-la có hạt chip, vani có hình tròn trơn); đế/khay đồng màu trung tính cho mọi vị; yêu cầu gọi cả vị lẫn màu. Ghi chú cho bố mẹ: nếu bé hay nhầm màu cụ thể, cân nhắc kiểm tra thị lực màu. Bảng màu đồ ăn nên khác nhau cả về **độ sáng** (dâu sáng, sô-cô-la tối) – hiện đang ổn, giữ như ràng buộc.

### M9. Đồng hồ gợi ý 5s có thể quá nhanh nếu tính từ lúc vào màn
- **Vị trí:** EXPERIENCE › State "Gợi ý", Open Q3.
- **Vì sao:** Câu yêu cầu dài ~2–3s; bé 3 tuổi cần thêm vài giây để xử lý. Nếu tính từ lúc vào màn, vòng sáng hiện khi bé vừa nghe xong – gợi ý thành "làm hộ" và bé không bao giờ tự tìm.
- **Sửa:** Tính từ khi **câu nói kết thúc**; mốc 1 ≈ 6–7s, mốc 2 ≈ +6s; thử với bé rồi chỉnh (gộp với C2).

### M10. Câu cá: chạm vật đang di chuyển là khó
- **Vị trí:** EXPERIENCE › IA (Câu cá FR13–14), State "Thả sai/chạm sai" (cá lặn xuống bơi tiếp).
- **Vì sao:** Mục tiêu di chuyển giảm độ chính xác rõ rệt ở tuổi 3; chạm hụt → cá đúng lặn đi → bé phải chờ.
- **Sửa:** Cá bơi chậm (≤ 60 pt/s), vùng chạm cá ≥ 100 pt, **cá dừng lại khi ngón đến gần**; chạm hụt cá (chạm vào nước) không làm cá lặn – chỉ gợn nước vui. Cá sai thì lặn, cá đúng không bao giờ biến mất khỏi màn.

### M11. Xoay dọc và các iPad không phải 4:3
- **Vị trí:** EXPERIENCE › Responsive ("khoá hướng qua manifest [ASSUMPTION]"); DESIGN › Layout (1024×768, `object-fit: cover`).
- **Vì sao:** Safari iPad không tôn trọng `orientation` của manifest → bé nằm/xoay máy là bố cục vỡ. iPad Air/Pro 11" có tỉ lệ ~1.43 → `cover` cắt ~5–7% hai mép trên/dưới, các điểm chạm tính theo màn hình sẽ lệch khỏi hình.
- **Sửa:** Khi dọc: xoay toàn bộ sân khấu 90° bằng CSS để vẫn chơi được (không hiện màn "xoay máy" bé không hiểu). Toạ độ vùng chạm định nghĩa theo **ảnh** rồi ánh xạ qua phép scale/crop của `cover`; giữ mọi vật tương tác trong vùng an toàn 4:3 trung tâm trừ phần bị cắt.

### M12. Hang "Tìm bóng": bóng tối và hang có thể gây sợ
- **Vị trí:** EXPERIENCE › IA (Tìm bóng – Trạm hang); DESIGN › Do/Don't ("Cảnh tối, đêm").
- **Vì sao:** "Hang" + "bóng (silhouette) đen" là tổ hợp dễ gợi sợ bóng tối ở tuổi 3, đặc biệt chơi buổi tối (Flow 1).
- **Sửa:** Màn Tìm bóng đặt **ngoài cửa hang, trời sáng** hoặc trong hang có đèn lồng ấm, bóng cát-tông màu tím/xanh nhạt thay vì đen đặc; khủng long ba sừng xuất hiện từ từ, không bật ra.

---

## LOW

### L1. Kích thước vùng chạm – ổn, chỉ cần ghi rõ đơn vị và vùng chạm vật kéo
- **Vị trí:** DESIGN › spacing `target-min 80px`, `button-round 88px`; Layout ("1024×768 pt").
- **Nhận xét:** 80 pt ≈ 15 mm, 88 pt ≈ 17 mm – đạt mức khuyến nghị cho trẻ nhỏ (~15–20 mm). Trong render Tiệm kem, kem dâu hiển thị ~64×58 pt và ốc quế rộng ~70 pt – **nhỏ hơn 80**, nên vùng chạm phải lớn hơn hình. Khoảng cách kem–ốc quế–kem ~180 pt: tốt.
- **Sửa:** Ghi rõ "px = CSS px = pt trên iPad"; vùng chạm vật kéo = hình + 24 pt mỗi phía; ưu tiên phóng hình vật lên ≥ 90 pt trong render cuối.

### L2. Nhấp nháy/photosensitivity – an toàn, nên ghi trần cứng
- **Vị trí:** EXPERIENCE › Accessibility Floor (≥ 1.4s/chu kỳ); DESIGN › decoration lấp lánh, speaker "sóng âm nhấp nháy".
- **Nhận xét:** 1.4s/chu kỳ ≈ 0.7 Hz, xa ngưỡng 3 lần/giây. Nhưng "lấp lánh" và "sóng âm nhấp nháy" chưa có thông số.
- **Sửa:** Ghi: mọi nhấp nháy ≤ 1 Hz, không có vùng sáng–tối đảo nhanh > 25% màn hình, lấp lánh dạng sao nhỏ mờ dần chứ không chớp.

### L3. Chặn menu ảnh và double-tap zoom của Safari
- **Vị trí:** EXPERIENCE › Responsive (CSS chặn zoom, chọn chữ).
- **Sửa:** Bổ sung `-webkit-touch-callout: none`, `draggable="false"` cho mọi ảnh/sprite, `touch-action: none` trên sân khấu (không chỉ `manipulation`) để chạm-giữ không bật "Lưu ảnh" và double-tap không phóng to.

### L4. Một vài hình trong render có thể trông "lạ/đáng sợ" với bé
- **Vị trí:** render-con-duong-v2.png (kart giữa dưới), render-tiem-kem-v2.png (cá trắng-đỏ cạnh hồ), núi lửa đỉnh cam.
- **Nhận xét:** Người lái kart đội mũ trắng, mặt tối nhìn từ trên xuống giống **đầu lâu/ma** ở cỡ nhỏ; con cá trắng có vệt đỏ quanh miệng trông như chảy máu; núi lửa đỉnh cam gợi phun trào.
- **Sửa:** Cho "bạn nhỏ" khuôn mặt sáng, mắt to rõ, mũ màu tươi; tô lại cá trắng (bỏ vệt đỏ quanh miệng); núi lửa không bao giờ phun/khói/rung – hoặc đổi đỉnh cam thành tuyết/cây. Cho bé xem render và quan sát phản ứng.

### L4b. Shiba trong Tiệm kem màu nâu-xám bán thực tế
- **Vị trí:** render-tiem-kem-v2.png; DESIGN › creature (chỉ bắt buộc tô lại khủng long & cá).
- **Sửa:** Áp quy tắc "tô lại tươi" cho cả Shiba (cam ấm, mặt trắng) để nhân vật chính thân thiện và nổi trên nền.

### L5. Màn tải lần đầu và nút Play
- **Vị trí:** EXPERIENCE › State "Đang tải", "Âm thanh bị khoá".
- **Nhận xét:** Tốt. Chỉ thêm: nút Play nhún kèm âm "pụp" *sau* khi chạm (không được phát trước); nếu tải lâu > 10s, kart cứ chạy vòng chứ không dừng (bé tưởng xong).

### L6. Chơi cùng bố mẹ
- **Vị trí:** EXPERIENCE › Voice and Tone, Responsive (mẹo bố mẹ).
- **Nhận xét:** Ngoài C1 (chạm của bố mẹ không phá lượt), spine chưa nghĩ tới bố mẹ như người chơi cùng.
- **Sửa (nhẹ):** Nhãn trạm cho bố mẹ đã có; thêm một dòng nhỏ trên màn Mở đầu gợi ý "Hỏi bé: kem dâu màu gì?" là đủ cho hobby. Không cần chế độ riêng.

---

## Tóm tắt việc nên làm trước khi code

1. Viết lại quy tắc đa chạm thành "ngón đầu tiên thắng" + dải mép bỏ qua (C1).
2. Leo thang gợi ý theo số lần sai, vòng sáng không tắt khi chạm vật khác, bậc "lỗi không thể xảy ra" (C2); nhận cả hai thứ tự ở yêu cầu hai bước (C3).
3. Vòng gợi ý hai lớp có viền tối + vật nhún (H1); tách vùng chạm trạm & cho đổi hướng kart (H2).
4. Rà kịch bản lời nói (dâu/đâu, "màu dâu" → "kem dâu màu hồng"), tắt/hạ sâu nhạc khi nói, chuẩn âm lượng LUFS, thay "gầm" (H3, H4).
5. Ghi số cụ thể: bán kính vùng hút, dung sai đường đua, dải mép an toàn, nhịp lặp lời (H5–H7, M3).

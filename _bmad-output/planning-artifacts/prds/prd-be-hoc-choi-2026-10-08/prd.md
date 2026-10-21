---
title: "PRD – Bé Học Chơi"
status: final
created: 2026-10-08
updated: 2026-10-21
---

# PRD – Bé Học Chơi

> **Cập nhật 2026-10-16:** phụ huynh thấy 7 trò hiện có chưa đủ giữ hứng thú của bé. Bản này thêm phần **Trải nghiệm chung** (F0), sửa 7 trò (FR mới trong từng trò), đổi phần thưởng thành đồ bé tự đặt lên đảo (F9) và thêm 5 trò mới (F10–F14). Cơ sở: `research-hap-dan-tre-3-tuoi.md`. FR cũ giữ số; FR mới đánh từ FR29.

> **Thay đổi 2026-10-21 (quyết định của phụ huynh):** bỏ hẳn đồ trang trí (quà trên đảo) vì làm bé 3 tuổi rối. App không còn tặng, cho chọn, bay vào, đặt hay hiển thị quà: bỏ quà sau mỗi lượt (FR22), bỏ bước chọn 1 trong 2 rồi đặt lên đảo (FR52, Story 5.5), bỏ đồ thưởng lưu trên máy và phản ứng khi chạm (FR23, FR53), và bỏ phần quà của Chạm là nói (cứ khoảng 8 vật chạm thì có quà, Story 4.6; FR17 giữ nguyên: chạm tự do, không có kết thúc lượt). Quà đã lưu trên máy bị xóa ở lần mở app kế tiếp; độ khó đã lưu được giữ. Hành trình mục 3 bước 7 không còn. Hình bản đồ vẫn còn khung hình đồ trang trí cho tới lần dựng lại bản đồ. Chơi liên tục (lượt mới bắt đầu ngay, bỏ màn "Chơi nữa?") là thay đổi sau, chưa nằm trong lần này. Spec: `_bmad-output/implementation-artifacts/spec-bo-do-trang-tri.md`.

> **Thay đổi 2026-10-21 (chơi liền mạch, quyết định của phụ huynh):** xong một lượt, nhân vật ăn mừng như cũ rồi lượt mới tự bắt đầu ngay trong cùng trò (độ khó kế tiếp, câu hỏi mới), không về đảo và không còn màn "Chơi nữa?". Bỏ màn hỏi chơi tiếp (FR25 trong epics, Story 2.4) và phần lớp phủ cuối lượt của FR22. Chế độ tự do sau lượt (FR32, FR39, FR42) thực tế không còn: ăn mừng xong, chờ khoảng 0,5 giây và mờ dần ngắn rồi lượt mới bắt đầu. Bé chỉ về đảo bằng nút "Nhà" (về giữa lượt vẫn giữ chỗ chơi dở, FR27). Lời mời phụ huynh lúc đầu lượt vẫn giữ; lời mời trong lúc chơi tự do sau lượt bị bỏ. Phần thân tài liệu bên dưới không viết lại; ghi chú này được ưu tiên. Spec: `_bmad-output/implementation-artifacts/spec-choi-lien-mach.md`.

## 1. Tầm nhìn & vấn đề

Bé Học Chơi là một web app nhỏ chạy trên máy tính bảng, dành cho một bé trai 3 tuổi. Bé chơi thì đồng thời rèn **tư duy**, **vận động tinh** và **ngôn ngữ tiếng Việt**. Mọi trò chơi đều xoay quanh những thứ bé mê: **ô tô, cá, khủng long, kem, pizza**.

Các app tiếng Việt cho bé hiện có phần lớn là dạng thẻ hình, có quảng cáo hoặc mua trong app. Bé Học Chơi thì khác:
- **Chơi mà học**: bé làm, bé chạm, bé kéo, chứ không chỉ xem.
- **Đồ chơi trước, bài tập sau**: mỗi trò là một món đồ chơi bé nghịch được; câu hỏi của giọng đọc chỉ là một cách chơi trong đó, không phải điều kiện để chơi.
- **Nhân vật phản ứng là phần thưởng**: điều bé nhớ là chú chó liếm kem rồi hắt xì, không phải tiếng chuông "đúng rồi".
- **Không có thua**: không có điểm trừ, không có hẹn giờ, không có tiếng "sai". Chọn khác yêu cầu thì có chuyện buồn cười xảy ra.
- **Giọng đọc tiếng Việt** dẫn dắt mọi thứ, vì bé chưa biết đọc.
- **Không quảng cáo**, không tài khoản, không thu thập dữ liệu.

## 2. Người dùng

Một bé trai 3 tuổi:
- Chưa biết đọc.
- Chạm chắc tay; kéo được nhưng hay nhấc tay giữa chừng; vạch theo đường được một đoạn ngắn.
- Chưa làm được chụm hai ngón (pinch), xoay, chạm đúp, giữ lâu.
- Mê ô tô, cá, khủng long, kem, pizza. Thích lặp lại trò quen, thích bất ngờ, thích nhập vai (bán hàng, nấu ăn).
- Thường chơi một mình; đôi khi có bố mẹ ngồi cùng.

Bé tên là **Xoài**. Giọng đọc gọi bé là "Xoài" ở lời chào, lúc mời và lúc khen (FR36). *(Đổi 2026-10-16; thay quyết định 2026-10-08 "không gọi tên riêng".)*

## 3. Hành trình chính

**UJ-1 – Một buổi chơi buổi tối**

1. Buổi tối, bé cầm máy tính bảng và chạm vào biểu tượng app trên màn hình chính.
2. Màn hình hiện một nút **"Chơi"** thật to, nhún nhảy. Bé chạm vào thì nhạc nền bắt đầu. (Lần chạm này cũng để mở khóa âm thanh trên trình duyệt.)
3. Bé vào **màn Con đường**. Đó là một con đường có các trạm: tiệm kem, tiệm pizza, đường đua, hồ cá, phố "Chạm là nói", công viên khủng long, hang bóng và các trạm mới. Bạn Shiba dẫn đường vẫy tay chào bé.
4. Bé chạm vào tiệm kem. Shiba nói: *"Xoài ơi, cho tớ một viên kem màu dâu nào!"*
5. Bé chạm viên kem xanh. Viên kem bay lên ốc quế, Shiba liếm thử, nhăn mặt "ơ, bạc hà mát quá!" rồi cười. Bé cười, chạm tiếp viên hồng; Shiba liếm, rùng mình vì lạnh, hắt xì làm kem dính lên mũi. Bé chạm mũi Shiba để lau.
6. Hết vài câu, giọng đọc im lặng; bé tiếp tục xếp kem thành tháp cao tận khi tháp đổ.
7. *(Đã bỏ 2026-10-21: không còn quà trên đảo.)* ~~Một món quà hiện ra: bé chọn giữa chiếc ô và cây kem khổng lồ, rồi kéo nó đặt cạnh tiệm kem trên đảo. Chạm vào cây kem khổng lồ thì nó lắc lư và kêu "măm".~~
8. Bé chạm nút "Nhà" để quay về Con đường và chọn trạm khác.
9. Bé gập máy hoặc bố mẹ cất máy. Không có màn hình kết thúc bắt buộc.

**UJ-2 – Chơi cùng bố mẹ** *(mới)*

1. Bố ngồi cạnh. Ở Ú òa chuồng thú, giọng đọc nói: *"Hỏi bố xem con gì kêu ụt ịt nào?"*
2. Bố đoán "con lợn"; bé chạm cửa chuồng, con lợn ló ra kêu ụt ịt. Hai bố con cùng bắt chước.
3. Ở Ban nhạc, bố và bé mỗi người chạm một nhạc cụ cùng lúc; cả hai đều kêu.

## 4. Tính năng & yêu cầu chức năng

### F0 – Trải nghiệm chung cho mọi trò *(mới)*
- **FR29 – Chạm-rồi-chạm**: mọi thao tác "đưa vật đến chỗ" làm được bằng hai cách: kéo, hoặc chạm vật rồi chạm chỗ đặt. Kéo mà nhấc tay giữa chừng thì vật nằm yên ở chỗ nhấc tay, không bật về chỗ cũ.
- **FR30 – Chọn khác yêu cầu cũng vui**: khi bé chọn khác yêu cầu, nhân vật có một phản ứng hài riêng cho trò đó (nhăn mặt, té nước, lắc đầu…), rồi giọng đọc nhắc lại yêu cầu bằng một câu ngắn. Không có âm báo "sai".
- **FR31 – Nhân vật phản ứng theo việc bé làm**: mỗi trò có ít nhất 3 phản ứng khác nhau cho kết quả đúng và chọn ngẫu nhiên, để lần chơi lại vẫn có bất ngờ.
- **FR32 – Chơi tự do**: hết các câu hỏi của một lượt, trò chuyển sang chế độ tự do: giọng đọc im, bé nghịch tiếp với cùng đồ vật bao lâu tùy thích. Nút "Nhà" luôn để thoát.
- **FR33 – Chạm gì cũng có phản ứng**: trong mỗi cảnh, mọi vật nhìn thấy (cây, mây; ~~đồ trang trí~~ — đã bỏ 2026-10-21) đều nhún hoặc kêu khi bé chạm, kể cả khi đang có câu hỏi.
- **FR34 – Bạn dẫn đường**: một nhân vật dẫn đường (Shiba) xuất hiện ở màn Con đường và chào bé; các câu hỏi trong trò được nói bằng giọng của nhân vật trong trò đó.
- **FR35 – Câu nhắc cho bố mẹ** **[ASSUMPTION]**: thỉnh thoảng (không quá một lần mỗi lượt) giọng đọc có câu mời bố mẹ cùng chơi ("Hỏi mẹ xem…"). Mặc định bật.
- **FR36 – Gọi tên bé**: các câu chào, mời và khen gọi bé là "Xoài" ("Xoài ơi…", "Xoài giỏi quá!"). Tên nằm sẵn trong lời đọc tạo trước (TTS), không có màn nhập tên.

### F1 – Màn Con đường & điều hướng
- **FR1**: Màn mở đầu có một nút "Chơi" lớn. Lần chạm đầu tiên vào nút này bật âm thanh cho cả phiên chơi.
- **FR2**: Màn Con đường hiển thị các trạm trò chơi, mỗi trạm là một hình minh họa lớn, chạm vào là vào trò. Trạm có nút loa đọc tên khi bé chạm hoặc khi bé ngồi yên vài giây.
- **FR3**: Màn nào trong trò chơi cũng có nút "Nhà" để về Con đường, và nút "Loa" để nghe lại hướng dẫn.
- **FR37**: Mỗi trạm có một dấu hiệu nhận ra từ xa (que kem khổng lồ, ống khói lò pizza, cờ đua…) và cảnh trên đảo có chuyển động nhẹ (mây trôi, sóng, cá nhảy, cá voi phun nước).

### F2 – Tiệm kem
- **FR4**: Giọng nói yêu cầu một màu ("màu dâu", "màu sô-cô-la"…). Bé đưa viên kem đúng màu lên ốc quế.
- **FR5**: Độ khó tăng dần: lúc đầu 1 viên chọn trong 2 màu, sau đó xếp 2–3 viên theo thứ tự được đọc lên.
- **FR6** *(sửa)*: Nếu bé đưa viên khác màu, Shiba vẫn liếm thử và có phản ứng hài theo vị (FR30), rồi viên kem trôi về chỗ cũ và giọng nói nhắc lại yêu cầu.
- **FR38**: Phản ứng khi đúng gồm liếm, rùng mình vì lạnh, hắt xì; đôi khi kem dính lên mũi Shiba và bé chạm để lau.
- **FR39**: Chế độ tự do: bé xếp kem thành tháp cao tùy thích; tháp quá cao thì lắc lư và đổ một cách vui nhộn.

### F3 – Làm pizza
- **FR7**: Giọng nói yêu cầu một số lượng topping ("3 lát xúc xích"). Bé đặt topping lên đế bánh, và app đếm to theo từng lát bé đặt ("một, hai, ba!").
- **FR8**: Bé đặt đủ thì chạm vào lò nướng, xem bánh chín, rồi một nhân vật ăn bánh.
- **FR9**: Số lượng tăng từ 1–3 lên đến 5.
- **FR40**: Đặt nhiều hơn số được yêu cầu vẫn được: bánh rung rinh, cáo tròn mắt, giọng đọc đếm tiếp. Không có trạng thái "sai".
- **FR41**: Cáo ăn bánh với phản ứng theo topping (ví dụ ớt chuông thì "cay quá!" kèm làn khói nhỏ). Bánh nướng, lò và cáo có hoạt hình rõ ràng: bánh phồng lên khi nướng, khói thơm, cáo nhai và liếm mép.
- **FR42**: Chế độ tự do: bé phủ topping lên bánh tùy ý rồi nướng bao nhiêu lần cũng được.

### F4 – Đường đua tô màu
- **FR10**: Bé lấy ngón tay vạch theo một con đường cho ô tô chạy. Ô tô chạy theo ngón tay bé.
- **FR11**: Hình dạng đường tăng dần: thẳng, cong, rồi zíc-zắc và vòng tròn. Đây là bước tập tiền viết.
- **FR12**: Ngón tay lệch khỏi đường trong một khoảng cho phép thì vẫn được tính. Nhấc tay giữa chừng thì ô tô dừng lại chờ, không phải làm lại từ đầu.
- **FR43**: Đường ngắn ở cấp đầu (bé hoàn thành được trong một lần đặt tay). Về đích thì có cảnh rửa xe: bé chạm để phun nước, xà phòng sủi bọt, xe sáng bóng.
- **FR44**: Bé được chọn màu xe trước khi chạy; xe giữ màu đó khi xuất hiện trên đảo.

### F5 – Câu cá
- **FR13**: Cá bơi chậm trong hồ. Giọng nói yêu cầu theo màu hoặc kích thước ("con cá to", "con cá màu vàng"). Bé chạm vào con cá đúng để câu lên.
- **FR14**: Mỗi con cá câu lên đều được đọc tên hoặc mô tả ("cá vàng nhỏ").
- **FR45**: Cá có lúc trốn sau rong hoặc tảng đá rồi ló ra (ú òa). Chạm nhầm cá thì cá quẫy té nước về phía màn hình (FR30).
- **FR46**: Cá câu được thả vào **bể cá của bé** (một bể nhỏ trên đảo); chạm vào bể thì xem các con cá đã câu bơi. Hồ cá, cá, cần câu và dây câu có hoạt hình rõ ràng: cá bơi uốn mình, mặt nước gợn sóng khi cá chạm, dây câu căng và cá giãy khi được kéo lên.

### F6 – Chạm là nói
- **FR15**: Có 3 cảnh: biển, đường phố, nhà bếp. Mỗi cảnh có 8–12 đồ vật.
- **FR16**: Bé chạm vào vật nào thì app đọc tên tiếng Việt của vật đó, và vật đó cử động hoặc phát ra tiếng (ô tô bóp còi, cá quẫy).
- **FR17**: Trò này không có yêu cầu và không có đúng/sai, bé được tự do khám phá.
- **FR47**: Mỗi vật có 2–3 phản ứng khác nhau, lần lượt hoặc ngẫu nhiên. Mỗi cảnh có ít nhất 2 chỗ trốn (bụi cây, thùng, cửa) mà chạm vào thì có con vật hoặc đồ vật nhảy ra.

### F7 – Ghép khủng long
- **FR18**: Xếp hình một con khủng long từ 3 đến 6 mảnh, có bóng mờ gợi ý vị trí từng mảnh.
- **FR19**: Ghép xong thì khủng long "sống dậy": gầm lên, đi lại, và app đọc tên loài ("khủng long ba sừng").
- **FR48**: Mỗi loài có một điệu nhảy và tiếng gầm riêng khi sống dậy.
- **FR49**: Bé đặt mảnh vào chỗ khác thì mảnh vẫn gắn tạm vào đó (ví dụ đầu ở chỗ đuôi), khủng long trông ngộ nghĩnh và kêu "ơ?"; sau vài giây mảnh tự trượt về đúng chỗ.

### F8 – Tìm bóng
- **FR20**: Màn hình có 2–4 cái bóng và một con vật hoặc chiếc xe. Bé đưa nó vào đúng cái bóng của nó.
- **FR21**: Số bóng để chọn tăng dần, và các bóng dần giống nhau hơn.
- **FR50**: Vật để bé cầm đủ lớn để chạm (theo NFR1), không nhỏ hơn cái bóng của nó quá nhiều.
- **FR51**: Đưa vào bóng khác thì con vật lắc đầu "không phải nhà tớ" (FR30). Đúng bóng thì con vật chui vào, bóng hóa màu, rồi con vật ló ra chào.

### F9 – Đồ thưởng trên đảo *(viết lại; thay "Sticker thưởng")* — **đã bỏ 2026-10-21**

> Bỏ toàn bộ F9 (FR22, FR23, FR52, FR53) theo quyết định của phụ huynh ngày 2026-10-21; xem ghi chú đầu tài liệu. Giữ nội dung dưới đây để tra cứu.

- **FR22** *(sửa)*: Chơi xong một lượt trò (khoảng 3–5 câu), một món quà theo chủ đề trò hiện ra. Món quà không giống nhau mỗi lần, và không phải lượt nào cũng có (thưởng bất ngờ).
- **FR23** *(sửa)*: Đồ thưởng được lưu trên máy và không mất khi tắt app; bé xem lại chúng ngay trên đảo.
- **FR52**: Khi có quà, bé chọn 1 trong 2 món, rồi đưa món đó đặt lên đảo ở chỗ bé thích (trong các vùng cho phép gần trạm).
- **FR53**: Đồ đã đặt trên đảo phản ứng khi chạm (lắc, kêu, phát nhạc), biến bản đồ thành một món đồ chơi.

### F10 – Ú òa chuồng thú *(mới)*
- **FR54**: Một dãy cửa chuồng (3–5 cái) rung nhẹ và phát tiếng kêu mờ của con vật bên trong. Bé chạm vào cửa thì con vật ló ra, kêu, và giọng đọc nói tên con vật.
- **FR55**: Trò không có yêu cầu bắt buộc. Thỉnh thoảng giọng đọc hỏi "Con gì kêu ò ó o nhỉ?" và bé chạm thử các cửa để tìm.

### F11 – Bác sĩ thú cưng *(mới)*
- **FR56**: Một bạn thú đến với một vấn đề nhìn thấy được (dính bùn, đói, bị trầy, buồn ngủ). Bé dùng một dụng cụ tương ứng (vòi tắm, bình sữa, miếng dán, chăn) bằng chạm hoặc chạm-rồi-chạm.
- **FR57**: Bạn thú phản ứng ở từng bước (cười khi tắm, ợ khi no, ngáp rồi ngủ) và cảm ơn bé khi khỏe lại.

### F12 – Ban nhạc trên đảo *(mới)*
- **FR58**: Một sân khấu có 4–6 nhạc cụ hoặc con vật biết kêu theo nốt. Chạm vào cái nào thì nó phát một nốt hoặc một đoạn nhạc ngắn và nhún theo; nhiều ngón chạm cùng lúc thì nhiều cái cùng kêu (cho bé và bố mẹ cùng chơi). Các nốt được chọn để chạm bất kỳ tổ hợp nào cũng nghe hài hòa.
- **FR59**: Không dùng bài hát có sẵn. Thỉnh thoảng có một nhịp nền nhẹ (trống, vỗ tay) để bé chạm theo; nhịp nền tự làm, không lấy từ bài hát nào.

### F13 – Thay đồ cho Shiba *(mới)*
- **FR60**: Bé chọn mũ, kính, áo cho Shiba bằng chạm. Shiba soi gương, xoay người và có phản ứng với từng món.
- **FR61**: Bộ đồ được lưu lại; Shiba mặc bộ đồ đó ở màn Con đường và ở Tiệm kem.

### F14 – Giờ đi ngủ *(mới)*
- **FR62**: Bé giúp các bạn thú trên đảo chuẩn bị đi ngủ: đánh răng, tắt đèn, đắp chăn, mỗi bước bằng chạm.
- **FR63**: Trò có nhịp chậm, nhạc ru nhẹ và kết thúc bằng cảnh đảo về đêm yên tĩnh; phù hợp để chơi trước giờ đi ngủ thật.

## 5. Yêu cầu phi chức năng

- **NFR1 – Dễ chạm** *(sửa)*: mọi vùng chạm có kích thước tối thiểu 80px, nhắm tới khoảng 2 cm trên iPad, và cách nhau rộng rãi. Chạm gần đích cũng được tính. Không đặt vùng chạm quan trọng sát mép dưới màn hình (bé tì cổ tay). App bỏ qua các lần chạm vô tình (lòng bàn tay), nhưng ở các trò nhiều người chơi (F12) thì nhiều ngón cùng lúc đều được nhận.
- **NFR2 – Kéo thả "dễ dãi"** *(sửa)*: vật được thả gần đúng chỗ thì tự hút vào. Nhấc tay giữa chừng thì không mất tiến trình và vật không bật về (xem FR29).
- **NFR3 – Giọng nói trước hết**: không có chữ hướng dẫn nào. Mọi yêu cầu đều được đọc bằng tiếng Việt và nghe lại được.
- **NFR10 – Lời ngắn** *(mới)*: mỗi câu yêu cầu là một câu ngắn (khoảng 2–4 giây). Bé chạm thì giọng đọc không bắt bé chờ nghe hết. Không có chuyển cảnh hay hoạt hình thưởng nào bắt bé chờ quá vài giây mà không chạm bỏ qua được.
- **NFR4 – Không có thua**: không điểm, không hẹn giờ, không mạng sống, không tiếng "sai". Nếu bé chưa làm được sau khoảng 5 giây thì app gợi ý (vật đúng nhấp nháy, rồi có bàn tay chỉ).
- **NFR5 – Phản hồi tức thì**: mỗi lần chạm đều có phản hồi bằng hình ảnh hoặc âm thanh trong vòng 100ms.
- **NFR6 – Chống thoát nhầm**: tắt phóng to bằng ngón tay, tắt kéo xuống để tải lại, tắt menu nhấn giữ và chọn chữ. App luôn ở màn hình ngang và toàn màn hình.
- **NFR7 – Chạy offline**: sau lần mở đầu, app chạy được không cần mạng và cài được lên màn hình chính.
- **NFR8 – An toàn**: không quảng cáo, không liên kết ra ngoài, không tài khoản, không gửi dữ liệu đi đâu.
- **NFR9 – Nhìn vui mắt** *(sửa)*: phong cách đồ chơi mềm, bo tròn, bề mặt mịn; nhân vật chibi đầu to mắt to; màu tươi sáng; chuyển động mượt trên iPad. Mọi nhân vật chính có biểu cảm và hoạt hình đủ rõ để bé đọc được cảm xúc (vui, ngạc nhiên, nhăn mặt, buồn ngủ).

## 6. Thước đo thành công

- Bé tự chơi được ít nhất 3 trò mà không cần bố mẹ giúp thao tác.
- Bé tự đòi chơi lại trong tuần đầu tiên.
- Sau vài tuần, bé nói được những từ đã nghe trong app (màu, số đếm, tên con vật, tên loài khủng long).
- *(mới)* Bé ở lại chơi tiếp trong chế độ tự do sau khi hết câu hỏi, ở ít nhất 2 trò.
- *(mới)* Bé cười hoặc bắt chước phản ứng của nhân vật (bố mẹ quan sát).

**Phản thước đo** (dấu hiệu cần sửa):
- Bé cáu hoặc bỏ cuộc vì thao tác khó. Khi đó cần nới vùng chạm hoặc vùng hút.
- Bé dính màn hình quá lâu hoặc khóc khi bị cất máy. Khi đó cần cân nhắc thêm màn "nghỉ thôi" ở phiên bản sau.
- *(Đã bỏ 2026-10-21: không còn quà nên rủi ro này không còn.)* ~~*(mới)* Bé lướt cho nhanh hết câu chỉ để lấy quà, hoặc chỉ chơi để nhận đồ thưởng. Khi đó giảm tần suất quà và tăng phản ứng nhân vật.~~
- *(mới)* Bé cố tình chọn khác yêu cầu mãi chỉ để xem phản ứng hài mà không bao giờ làm theo câu hỏi. Đây là dấu hiệu vui, chỉ cần sửa nếu bé không còn nghe giọng đọc.

## 7. Ngoài phạm vi (bản đầu)

- Tính năng cho phụ huynh: màn cài đặt, giới hạn thời gian, theo dõi tiến bộ.
- Bài hát thiếu nhi có sẵn (vì bản quyền).
- Tài khoản, đồng bộ nhiều máy.
- Ngôn ngữ khác ngoài tiếng Việt.
- Đăng lên App Store hoặc Google Play.
- Nội dung mới theo mùa / cập nhật định kỳ.

## 8. Câu hỏi mở

**Đã chốt**
- **Giọng đọc**: giọng tổng hợp tiếng Việt (TTS), tạo sẵn thành file âm thanh.
- **Thiết bị**: iPad, chạy trên Safari.
- **Phong cách hình ảnh** *(đổi 2026-10-16)*: đồ chơi mềm, bo tròn, nhân vật chibi (xem NFR9).
- **Phạm vi cập nhật 2026-10-16**: sửa cả 7 trò theo F0 và các FR mới, thêm F10–F14.
- **Tên bé**: Xoài (FR36).
- **Âm nhạc**: không dùng bài hát có sẵn (FR59).

**Còn mở**
- **Câu nhắc cho bố mẹ** (FR35): mặc định bật, chưa có cách tắt. Xem lại sau khi bé chơi thử vài tuần; người quyết: phụ huynh.
- **Thứ tự làm**: thứ tự sửa 7 trò và làm 5 trò mới do phụ huynh quyết khi lập kế hoạch (không chặn PRD).
- **Nguồn hình ảnh và âm thanh**: thư viện CC0 (Tiny Treats, KayKit, Kenney, Quaternius) và tự dựng trong Blender; âm thanh nhân vật (tiếng kêu, hắt xì, nhai) cần nguồn mới. Phụ huynh kiểm tra giấy phép trước khi dùng.

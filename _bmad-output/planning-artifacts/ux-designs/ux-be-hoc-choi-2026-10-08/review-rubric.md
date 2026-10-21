# Đánh giá cặp spine — Bé Học Chơi

Người đánh giá: rubric walker (BMad UX). Mức độ nghiêm trọng đã hiệu chỉnh theo quy mô dự án cá nhân (một bố/mẹ, một bé 3 tuổi, PWA iPad). Không sửa spine.

## Nhận định chung

Cặp spine gọn, nhất quán với `.memlog.md` và đủ để dựng khung app (Mở đầu → Con đường → Tiệm kem → Hỏi chơi tiếp). Token màu đủ hex, thứ tự section đúng chuẩn, giọng đọc và triết lý "không có thua" được giữ chặt. Chỗ yếu chính: chỉ Tiệm kem và Đường đua được đặc tả đến mức dev làm được. Năm trò còn lại (Làm pizza, Câu cá, Chạm là nói, Ghép khủng long, Tìm bóng) thiếu component và hành vi riêng. Ngoài ra, vị trí và chuyển cảnh của màn "Hỏi chơi tiếp" đang mâu thuẫn giữa các section. Không có lỗi critical.

Bảng tóm tắt: Critical 0 · High 2 · Medium 7 · Low 9.

## 1. Bao phủ luồng (Flow coverage) — adequate

Đã kiểm tra: PRD chỉ có một hành trình là UJ-1, và Flow 1 phủ được nó với nhân vật chính, các bước đánh số, climax (bước 9) và một đường thất bại. Flow 2 phủ trường hợp thả sai + gợi ý. Flow 3 phủ trường hợp nhấc tay ở Đường đua. Các nhóm FR4–FR21 có tham chiếu trong IA, nhưng phần lớn chưa có luồng hoặc hành vi riêng.

### Phát hiện
- **high** Năm trên bảy trò không có đặc tả hành vi riêng ngoài một dòng IA: Làm pizza (đếm to từng lát, chạm lò nướng, xem bánh chín, cáo ăn — FR7–FR8), Câu cá (cá bơi, chạm đúng cá, "cá lặn xuống" khi sai), Ghép khủng long (bóng mờ gợi ý vị trí mảnh, "sống dậy" — FR18–FR19), Tìm bóng (2–4 bóng, độ giống tăng dần), Chạm là nói (3 cảnh, chuyển cảnh thế nào). Story-dev sẽ phải tự quyết định UX (EXPERIENCE.md › Key Flows, Component Patterns). *Sửa:* thêm cho mỗi trò một bảng ngắn kiểu "Trò | Yêu cầu | Thao tác | Đúng | Sai | Gợi ý | Kết lượt", hoặc một flow 4–6 bước. Không cần flow đầy đủ như Flow 1.
- **medium** Đường đua: State "Gợi ý" nói `hint-ring` "quanh vật đúng", nhưng trò vạch đường không có "vật đúng". Chưa rõ gợi ý là vòng sáng quanh ô tô, `hint-hand` vạch theo đường hay đường phát sáng (State Patterns › Gợi ý; Flow 3). *Sửa:* ghi rõ gợi ý cho Đường đua, ví dụ `hint-hand` vạch một đoạn đường phía trước ô tô.
- **low** Flow 1 chỉ có một đường thất bại (offline lần đầu). Chưa có nhánh bé không chạm gì ở màn Hỏi chơi tiếp (Flow 1 bước 10). *Sửa:* xem phát hiện state tương ứng ở mục 4.

## 2. Đầy đủ token (DESIGN.md) — strong

Đã kiểm tra: mọi token màu đều có hex. App không có chế độ tối, và điều đó hợp lý cho ứng dụng trẻ em có cảnh render sẵn. Mọi tham chiếu `{colors.*}`, `{typography.*}`, `{rounded.*}`, `{spacing.*}` và `{components.button-round}` trong frontmatter và văn bản đều tồn tại. Đã nêu mục tiêu tương phản cho các tổ hợp chính.

### Phát hiện
- **medium** `{colors.hint-glow}` (#FFE45C) gần như trùng với `{colors.road-dash}` (#FFE15A), và rất gần `{colors.button-home}` / `{colors.button-play}` (#FFD23F) cũng như `{colors.sand}`. Vòng gợi ý trên đường hoặc trên bãi cát sẽ chìm, và tín hiệu "gợi ý" lẫn với màu nút (DESIGN.md › Colors, frontmatter). *Sửa:* đẩy `hint-glow` sang tông khác hẳn (trắng ấm có viền vàng đậm, hoặc thêm vòng ngoài tối/bóng). Nếu không, đổi `road-dash` sang trắng. Kiểm lại trên `render-con-duong-v2.png`.
- **low** Viền/bóng tối của `station-label` và màu biểu tượng trên nút chưa có token. Hiện chúng mượn `{colors.ink-parent}`, một token mang tên "chữ cho bố mẹ" (DESIGN.md › Colors đoạn Tương phản; Components › station-label). *Sửa:* thêm `icon-ink` và `label-outline` (hoặc đổi tên `ink-parent` thành `ink`).
- **low** Một số token không ai dùng (`{colors.shadow}`), trong khi một số giá trị bị viết cứng thay vì tham chiếu token: khoảng cách giữa hai nút cuối lượt ghi "≥ 48px" thay vì `{spacing.5}`, và hệ số phóng 1.1× khi nhấc vật (Components › button-back-to-map, draggable-item). *Sửa:* tham chiếu `{spacing.5}`, thêm `lift-scale` vào `components.draggable-item`, xoá `shadow` nếu không dùng.

## 3. Bao phủ component — thin

Đã kiểm tra: liệt kê mọi component xuất hiện trong cả hai file và đối chiếu từng cái với DESIGN.md › Components (hình thức) và EXPERIENCE.md › Component Patterns (hành vi). Mười bốn component có trong bảng đều có ở cả hai bên. Bảng dưới liệt kê những chỗ thiếu.

### Phát hiện
- **high** Có nhiều component được nhắc đến hoặc bắt buộc theo FR nhưng không có dòng nào ở cả hai spine: lò nướng (FR8), đế bánh/topping, cá bơi (đối tượng chạm của Câu cá), ô khung bóng mờ để ghép mảnh khủng long (FR18), ô bóng đích của Tìm bóng (FR20), đường đua/vệt đường để vạch (FR10–FR11), ô tô của Đường đua, dải tải "kart chạy trên đường" (State › Đang tải), và sóng âm của loa khi đang phát. *Sửa:* thêm mỗi component một dòng ở cả hai bảng. Gộp được thì gộp, ví dụ `drop-target` dùng chung cho ốc quế, đế bánh, ô bóng mờ và bóng đích; `trace-path` cho Đường đua; `fish`.
- **medium** Danh sách `character` trong DESIGN.md chỉ có Shiba, khủng long và cá. Thiếu **cáo** (Làm pizza) và **bạn nhỏ trong kart** (Đường đua), dù cả hai đã được chốt trong memlog dòng 40 và trong EXPERIENCE.md › Open Questions (DESIGN.md › Components › character). *Sửa:* thêm cáo và bạn nhỏ, kèm tư thế vui của từng nhân vật. Lưu ý gói Quaternius có cáo hay không. Shiba được chọn chính vì gói này không có gấu.
- **low** `kart`, `draggable-item`, `character`, `button-replay`/`button-back-to-map` có trong bảng prose nhưng `kart`, `draggable-item` và `character` không có khối trong frontmatter `components` (DESIGN.md frontmatter). *Sửa:* thêm khối tối thiểu (`min-size`, `lift-scale`) để code đọc được token.

## 4. Bao phủ trạng thái — adequate

Đã kiểm tra từng màn trong IA với các trạng thái: tải lần đầu, khoá âm thanh, rảnh, gợi ý, đúng, sai, gián đoạn, offline, ẩn app, đảo trống, đảo đầy.

### Phát hiện
- **medium** Màn Hỏi chơi tiếp không có trạng thái rảnh và không có lời đọc. Hai nút hiện lên mà không có câu nói nào (ví dụ "Bé chơi tiếp hay đi chỗ khác nào?"). Bé 3 tuổi không đọc được nên cần giọng nói (State Patterns; Voice and Tone). Spine cũng chưa nói chuyện gì xảy ra khi bé không chạm. *Sửa:* thêm lời mời khi hai nút xuất hiện, `hint-ring` luân phiên giữa hai nút sau ~5s, và quy định có tự về bản đồ hay không.
- **medium** Chạm là nói: phần thưởng "bay ra đảo" trong khi bé vẫn ở trong cảnh chơi. Nhưng `decoration-item` chỉ được định nghĩa ở Con đường và "khi xong lượt" (Component Patterns › decoration-item; State › Tự do). *Sửa:* mô tả cảnh này. Ví dụ món trang trí xuất hiện ngay trong cảnh rồi bay ra khỏi khung, và lần về bản đồ sau nó đang lấp lánh ở trạm phố.
- **medium** Quay lại từ nền khi âm thanh bị khoá đang mâu thuẫn. IA nói đến màn Mở đầu khi "quay lại app khi âm thanh bị khoá", còn State › Ứng dụng bị ẩn nói "giữ nguyên màn" (EXPERIENCE.md › IA dòng Mở đầu; State Patterns). *Sửa:* chốt một hướng. Đề xuất: hiện `button-play` dạng lớp phủ trên màn hiện tại, chạm vào thì tiếp tục đúng chỗ.
- **low** Đảo đầy chỗ: đã chốt thay món cũ, nhưng chưa có hình thức thể hiện (món cũ bay đi? biến mất?) (State Patterns). *Sửa:* thêm một dòng state "Đảo đầy chỗ".
- **low** Chưa có state cho lần tải đầu thất bại hoặc bị dừng giữa chừng (Flow 1 › Thất bại). Hiện chỉ ghi "không tải được". *Sửa:* cho kart dừng trên dải đường và tự thử lại khi có mạng; không hiện chữ lỗi.

## 5. Bao phủ tham chiếu hình ảnh — adequate

Đã kiểm tra: không có `mockups/` hoặc `wireframes/`. `imports/` có `prd.md` và `addendum.md`. `.working/` có 12 tệp. Cả hai spine đã link `direction-C-lowpoly.html`, và DESIGN.md link thêm hai ảnh render v2, mỗi link đều nêu rõ minh hoạ gì.

### Phát hiện
- **low** "Spine thắng khi mâu thuẫn" được nêu ở cả hai spine; quy tắc là chỉ nêu một lần (DESIGN.md › Brand & Style; EXPERIENCE.md › Foundation). *Sửa:* giữ lại ở một chỗ.
- **low** Mock đã duyệt nằm trong `.working/` thay vì `mockups/`. `imports/prd.md` và `imports/addendum.md` không được tham chiếu (frontmatter trỏ thẳng tới `../../prds/`). Các bản cũ (`directions-1.html`, `direction-C-3d.html`, render v1, `preview-assets.png`) mồ côi. *Sửa:* chuyển bản đã duyệt sang `mockups/`, và ghi một dòng rằng các bản cũ đã bị thay.

## 6. Thừa & đặc tả quá mức — strong

Văn bản ngắn, phần lớn dùng bảng. Phần prose trong DESIGN.md có giọng biên tập, và điều đó chấp nhận được. Đường dẫn file Blender và nguồn tài nguyên trong Brand & Style hữu ích cho người dựng hình. Không có phát hiện đáng kể.

## 7. Kỷ luật kế thừa — adequate

Đã kiểm tra: `sources` tồn tại. Tên UJ-1 lấy nguyên văn. Tên component thống nhất giữa hai file. Tham chiếu token từ EXPERIENCE.md (`{spacing.target-min}`, `{spacing.target-gap}`, `{typography.station-label}`) đều trỏ đúng tới token có thật.

### Phát hiện
- **medium** Màn Hỏi chơi tiếp chưa có vị trí rõ ràng, và chuyển cảnh mâu thuẫn. IA coi đây là một màn riêng ("Cuối mỗi lượt trò"). Flow 1 bước 8 lùi camera về cảnh đảo trước rồi mới hiện hai nút, tức hai nút đã nằm trên bản đồ. Thế nhưng `button-back-to-map` vẫn "về Con đường, camera lùi ra", và `button-replay` phải quay lại trò từ cảnh đảo (EXPERIENCE.md › IA; Component Patterns; Flow 1 bước 8–10). *Sửa:* chốt một trong hai. (a) Hỏi chơi tiếp là lớp phủ trên cảnh đảo thu nhỏ quanh trạm vừa chơi; khi đó "về bản đồ" chỉ đóng lớp phủ và "chơi tiếp" chạy lại hiệu ứng phóng vào. (b) Hỏi chơi tiếp nằm trong màn trò, đồ trang trí bay vào chỉ khi về bản đồ. Sửa ba chỗ trên cho khớp. *(Mức high theo tác động tới dev; để medium vì phạm vi hobby và sửa nhanh.)*
- **medium** Độ khó "tiếp nối" (FR5, FR9, FR11, FR21) chưa nói có được lưu qua các lần mở app hay không. Hiện chỉ trang trí được ghi là lưu (Component Patterns › button-replay). *Sửa:* ghi rõ mức độ khó của từng trò được lưu trên máy cùng chỗ với trang trí, hay reset mỗi phiên.
- **low** Phạm vi của `button-speaker` lệch nhau: DESIGN ghi "Mọi màn (cả Con đường)", EXPERIENCE ghi "Con đường + mọi trò". Mở đầu và Hỏi chơi tiếp có loa không? *Sửa:* thống nhất. Đề xuất: có loa ở Hỏi chơi tiếp, không có ở Mở đầu.
- **low** Đường đua gọi xe là "ô tô" (Flow 3, Interaction Primitives), còn IA gọi là "bạn nhỏ trong kart". `kart` cũng là tên component của xe trên bản đồ. *Sửa:* dùng một tên (`race-car` hoặc dùng lại `kart`).
- **low** PRD đã cũ ở các mục FR22–FR23, gấu và đất sét. Đã ghi nhận ở Open Questions #1, không tính là phát hiện mới. State › Xong lượt vẫn trích "(FR22)" cho mốc 3–5 câu, nên sửa cùng lúc khi cập nhật PRD.

## 8. Độ khớp khuôn mẫu — strong

DESIGN.md đúng thứ tự: Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts. EXPERIENCE.md có đủ các section bắt buộc. Có Inspiration (memlog có sản phẩm tham chiếu và các lựa chọn bị từ chối) và Responsive & Platform. Open Questions là section thêm và xứng đáng giữ lại.

### Phát hiện
- **low** Responsive & Platform: khoá hướng màn hình qua manifest không hoạt động với PWA trên Safari iPad. Nhãn [ASSUMPTION] đã đúng. Chưa có phương án dự phòng khi iPad ở chiều dọc *(Sửa:* hiện hình minh hoạ "xoay ngang iPad" không có chữ, hoặc xoay cảnh bằng CSS). Đây là ghi chú dự phòng, không phải lỗi khuôn mẫu.

## Ghi chú cơ học

- Frontmatter của cả hai spine đầy đủ (`title`, `status`, `created`, `updated`, `sources`). `sources` trỏ đúng tệp.
- Mọi tham chiếu `{…}` trong DESIGN.md và EXPERIENCE.md đều trỏ tới token có thật. Không có Mermaid.
- Có sự lệch tên nhẹ: "ô tô" / "kart"; "Hỏi chơi tiếp" là màn hay lớp phủ; `ink-parent` được dùng cho biểu tượng nút.
- Sprite kart "nhìn từ trên" trong khi camera bản đồ nhìn chéo. Cần render kart theo góc camera để không lệch phối cảnh (DESIGN.md › Components › kart).

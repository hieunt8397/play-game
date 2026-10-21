# Phụ lục – Bé Học Chơi

Phần này ghi lại kết quả tìm hiểu ngày 2026-10-08 (tìm trên web, chưa kiểm chứng sâu) để dùng khi thiết kế giao diện và kiến trúc.

## Các app tương tự
- **Khan Academy Kids**: miễn phí, cho bé 2–8 tuổi. Nhân vật con vật dẫn dắt các hoạt động phân loại, ghép cặp, tô chữ.
- **Endless Alphabet**: kéo các chữ cái biết nói vào đúng chỗ, rồi xem hoạt hình giải nghĩa từ.
- **Sago Mini World / Toca Boca**: chơi tự do, không có thua. Đây là hình mẫu cho trò "Chạm là nói".
- **Lingokids**: học từ vựng qua bài hát và nhân vật.
- **App tiếng Việt (Vkids, VkidsIQ, Học Nói Tiếng Việt)**: chủ yếu là dạng thẻ hình, có quảng cáo hoặc mua trong app. Đây là khoảng trống mà Bé Học Chơi nhắm tới.

## Hướng dẫn thao tác cho bé 3 tuổi
- **Bé làm tốt**: chạm và vuốt đơn giản. Kéo thả thì làm được, nhưng hay nhấc tay giữa chừng.
- **Bé chưa làm được**: chụm hai ngón (pinch), xoay, thao tác nhiều ngón. Những động tác này khoảng 4 tuổi mới ổn định.
- **Nét vạch**: bé tô theo đường dẫn được, nhưng vạch tự do thì phần lớn chỉ là nguệch ngoạc.
- **Nguồn**: uxpa.org, init.cise.ufl.edu, các bài nghiên cứu của Lisa Anthony.

## Thời gian dùng màn hình
- **AAP**: trẻ 2–5 tuổi nên dùng tối đa khoảng 1 giờ mỗi ngày, ưu tiên nội dung chất lượng và có bố mẹ chơi cùng.
- **WHO**: trẻ 3–4 tuổi nên ngồi trước màn hình tối đa khoảng 1 giờ mỗi ngày.

## Ghi chú kỹ thuật (cho kiến trúc)
- **Âm thanh tự phát**: trình duyệt trên điện thoại và máy tính bảng chặn âm thanh cho đến khi người dùng chạm lần đầu. Vì vậy cần nút "Chơi" để khởi động hoặc tiếp tục AudioContext (xem FR1). Nên tải sẵn các đoạn âm thanh ngắn.
- **Toàn màn hình**: `requestFullscreen()` chạy được trên iPad và Android, nhưng không chạy trên Safari của iPhone. Nên làm PWA với manifest `display: fullscreen/standalone` để cài lên màn hình chính.
- **Khóa bé trong app**: mã web không chặn được nút Home hay cử chỉ thoát. Bố mẹ nên bật Guided Access (iOS) hoặc Screen Pinning (Android).
- **Offline**: dùng service worker để lưu sẵn hình ảnh và âm thanh. Lưu ý iOS có thể xóa dữ liệu của PWA nếu lâu ngày không mở.
- **CSS**: `touch-action`, `user-select: none`, `overscroll-behavior: none`, tắt zoom trong viewport.
- **Lưu sticker**: dùng localStorage hoặc IndexedDB.
- **Hình ảnh 3D mềm mại**: không nhất thiết phải dùng 3D thời gian thực (WebGL). Có thể dùng ảnh hoặc sprite 3D render sẵn (do AI tạo hoặc render từ Blender), rồi tạo chuyển động 2D (nhún, lắc, co giãn). Cách này nhẹ cho iPad và dễ chạy offline. Kiến trúc sẽ quyết định.
- **TTS**: tạo sẵn file âm thanh (mp3/m4a) cho mọi câu nói, không gọi TTS lúc đang chạy, để app chạy được offline.

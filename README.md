# SAOV Photobooth

Bản phát triển được tách từ `ptb.txt`. File gốc trong Downloads vẫn được giữ nguyên.

## Cấu trúc

```text
ptbsystem/
├── index.html
├── css/
│   └── booth.css
├── js/
│   ├── app.js
│   ├── gesture-control.js
│   ├── system-frames.js
│   └── ready-frames.js
├── mediapipe/
│   ├── models/
│   ├── wasm/
│   └── vision_bundle.mjs
├── frames/
│   ├── 1-photo/
│   ├── 3-photo/
│   ├── 4-photo/
│   └── 6-photo/
├── assets/
│   ├── images/
│   └── sounds/
├── vendor/
│   └── html2canvas.min.js
└── server.mjs
```

## Chạy local

Mở terminal tại thư mục này và chạy:

```powershell
node server.mjs
```

Sau đó mở `http://127.0.0.1:4174` trong trình duyệt. Dùng localhost giúp quyền camera hoạt động ổn định hơn so với mở trực tiếp file HTML.

## Trạng thái hiện tại

Giai đoạn 2 đã bổ sung:

- Chọn 1, 3, 4 hoặc 6 khung ảnh.
- Camera hiển thị và chụp đúng tỷ lệ ô ảnh: 2:3 cho 1 ảnh, 4:3 cho 3/4/6 ảnh.
- Chọn khoảng cách tự động 3, 5 hoặc 7 giây.
- Mở camera rồi thử và xác nhận filter.
- Tự nhận danh sách camera để chọn webcam phù hợp.
- Có tùy chọn lật preview và ảnh lưu giống hình trong gương.
- Sau khi xác nhận filter, giơ một ngón tay trong vùng giữa camera và giữ 3 giây để bắt đầu chụp.
- AI tự khóa khi lượt chụp bắt đầu; nút bắt đầu thủ công luôn được giữ làm phương án dự phòng.
- Nút xác nhận đổi thành nút bắt đầu chụp.
- Camera ở bên trái, ảnh vừa chụp tự lấp vào lưới bên phải.
- Tự động chụp đủ cả lượt mà không có nút hủy giữa chừng.
- Bản 6 khung dùng tỷ lệ dọc 2:3 với lưới 2 cột × 3 hàng.
- Có 2 mẫu khung thành phẩm: CLB SAOV và Computer Science.
- Mẫu Computer Science hỗ trợ cả 4/6 ảnh; tiêu đề, tên sự kiện, mô tả, tên ngành và năm đều chỉnh sửa được.
- Mỗi lượt chụp tự tạo một folder trong `captures`, lưu từng ảnh `photo-01.jpg`... và ảnh ghép `final.png`.
- Màn hình kết quả xác nhận trạng thái lưu, cho phép thử lưu `final.png` lại và mở thẳng folder của lượt chụp.
- Nút **Tải PNG** vẫn được giữ để lưu thêm ảnh final vào vị trí khác do người dùng chọn.

Ví dụ kết quả của một lượt chụp:

```text
captures/
└── 2026-09-01_22-30-15/
    ├── photo-01.jpg
    ├── photo-02.jpg
    ├── photo-03.jpg
    ├── photo-04.jpg
    └── final.png
```

Thư viện `html2canvas` đã được lưu trong `vendor/`, font dùng bộ font hệ thống và ảnh minh họa nằm trong project. Luồng chụp, ghép và lưu ảnh vì vậy không phụ thuộc Internet.

MediaPipe Tasks Vision, WASM và model Gesture Recognizer cũng được lưu trong `mediapipe/`. Nhận diện cử chỉ chạy trực tiếp trong trình duyệt trên máy người dùng; khung hình camera không được gửi lên dịch vụ bên ngoài.

## Thêm frame PNG có sẵn

Chỉ cần chép một file PNG vào đúng thư mục theo số ảnh, ví dụ frame 6 ảnh đặt tại `frames/6-photo/ten-frame.png`, sau đó bấm **Quét lại** ở màn hình chọn frame.

Tên file được dùng làm tên hiển thị. PNG phải có đúng số ô ảnh trong suốt tương ứng và không có vùng trong suốt lớn khác. Hai frame hệ thống CLB SAOV và Computer Science vẫn nằm riêng trong code và tiếp tục chỉnh sửa được chữ.

# SAOV Photobooth

I built this web photobooth for my club's booth at our school's Mid-Autumn event. About 100 visitors used it during the event. A guest chooses the number of photos and the delay, confirms a filter, then holds up one finger for three seconds to start the session. The app takes the photos automatically and combines them with the selected frame.

## What it does

- Supports layouts of 1, 3, 4 or 6 photos. The camera preview follows the aspect ratio of each photo slot.
- Provides delays of 3, 5 or 7 seconds between shots.
- Lets the guest preview and confirm a filter before the session begins.
- Starts through a three-second raised-finger gesture, with a manual start button available as a backup.
- Fills the photo grid during the session and saves every captured image with a combined `final.png`.
- Includes editable SAOV Club and Computer Science frame templates, along with support for custom PNG frames.

## How it works

1. The browser opens the selected webcam.
2. MediaPipe Gesture Recognizer detects the `Pointing_Up` gesture in the camera feed.
3. Holding the gesture in the centre guide for three seconds starts the countdown. Gesture detection then stops for the rest of the session.
4. The app captures each photo at the selected interval until the layout is full.
5. html2canvas combines the photos and frame into `final.png`.
6. The local Node.js server saves the individual photos and final image in a session folder.

Gesture recognition runs in the browser on the user's machine. Camera frames are not sent to an external service. MediaPipe, its WASM files and the gesture model are stored in `mediapipe/`, while html2canvas is stored in `vendor/`. Once the project is downloaded, the photobooth can run without an internet connection.

## Tech stack

- HTML and CSS
- Vanilla JavaScript
- Node.js local server
- MediaPipe Tasks Vision Gesture Recognizer
- html2canvas

## Run locally

You need Node.js, a webcam and a modern browser (Chrome or Edge recommended).

**1. Download the project**

```bash
git clone https://github.com/giakhanh-106394068/PTB-GKHANH-SAOV.git
cd PTB-GKHANH-SAOV
```

**2. Start the photobooth**

- Windows: double-click `START-PHOTOBOOTH.cmd`. It starts the local server on an available port and opens the photobooth in your browser.
- Any system: run the server manually.

```bash
node server.mjs
```

Then open `http://127.0.0.1:4174` in your browser. The `.cmd` file only works on Windows. On macOS or Linux, use `node server.mjs`.

**3. Allow camera access**

Allow camera access when the browser asks. Running on localhost lets the browser request camera permission reliably.

**4. Stop the server**

Press `Ctrl+C` in the terminal window where the server is running.

Each session is saved in its own folder:

```text
captures/
└── 2026-09-01_22-30-15/
    ├── photo-01.jpg
    ├── photo-02.jpg
    ├── photo-03.jpg
    ├── photo-04.jpg
    └── final.png
```

The `captures/` folder is excluded from Git so personal photos are not uploaded to the repository.

## Add a custom frame

Place a PNG in the folder that matches its number of photo slots. For example, put a six-photo frame in `frames/6-photo/my-frame.png`, then press **Quét lại** (Rescan) on the frame selection screen.

The PNG needs one transparent area for each photo slot and no other large transparent regions. Its file name becomes the frame name shown in the app.

## Project structure

```text
index.html                    page structure and interface
css/booth.css                 visual design and responsive layout
js/app.js                     camera, capture, frame and save flow
js/gesture-control.js         gesture detection and three-second hold
js/system-frames.js           built-in frame definitions
js/ready-frames.js            custom PNG frame loading
mediapipe/                    MediaPipe library, WASM and gesture model
frames/                       ready-made PNG frames
assets/                       project images and branding
vendor/                       local html2canvas build
server.mjs                    local server and capture storage
START-PHOTOBOOTH.cmd          Windows launcher
```

## Credits

This project includes MediaPipe Tasks Vision under the Apache License 2.0 and html2canvas under the MIT License. See `THIRD_PARTY_NOTICES.md` for details.

## Tiếng Việt

Đây là photobooth chạy trên trình duyệt mà mình tự làm cho booth của CLB trong sự kiện Trung thu ở trường. Khoảng 100 người đã sử dụng trong sự kiện. Người dùng chọn số ảnh, thời gian giữa các lần chụp và filter, sau đó giơ một ngón tay trong vùng hướng dẫn khoảng ba giây để bắt đầu. Hệ thống tự chụp, ghép khung và lưu từng ảnh cùng file `final.png` vào một thư mục riêng.

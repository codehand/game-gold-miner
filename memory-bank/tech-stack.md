# Recommended Tech Stack — Cat Mine Idle

Stack phù hợp nhất cho game này là **TypeScript + Phaser 4 + Vite**, xây dựng web-first để chạy ngay trong trình duyệt và Telegram Mini App.

## 1. Stack đề xuất

| Thành phần | Công nghệ |
|---|---|
| Game engine | **Phaser 4.2.1**, pinned for reproducible builds |
| Ngôn ngữ | **TypeScript** |
| Build/dev server | **Vite** |
| Game UI | Phaser UI; dùng **Preact** cho modal/menu phức tạp nếu cần |
| State | Event-driven store đơn giản; chưa cần Redux |
| Số cực lớn | `break_infinity.js` hoặc abstraction `GameNumber` |
| Local save | **IndexedDB + Dexie** |
| Telegram | Telegram Mini Apps JavaScript API |
| Mobile native | **Capacitor 8** nếu cần App Store/Google Play |
| Unit test | **Vitest** |
| E2E test | **Playwright** |
| Asset | Sprite atlas WebP/PNG + JSON |
| Deployment MVP | Cloudflare Pages hoặc Vercel |
| Backend production | Node.js + Fastify + PostgreSQL |
| Leaderboard/cache | Redis, chỉ bổ sung khi thật sự cần |

Phaser chuyên cho game HTML5 2D, hỗ trợ WebGL và fallback Canvas, rất phù hợp với cảnh mỏ nhiều tầng và animation sprite đồng thời. Phaser 4.2.1 hiện là bản stable mới nhất được liệt kê trên trang release chính thức. Xem [Phaser documentation](https://docs.phaser.io/) và [Phaser releases](https://github.com/phaserjs/phaser/releases).

Telegram Mini Apps chạy giao diện HTML5/JavaScript trực tiếp trong Telegram, nên web stack sẽ tránh phải duy trì một phiên bản game riêng. Dữ liệu `initData` phải được xác minh ở server nếu dùng tài khoản, leaderboard hoặc giao dịch. Xem [Telegram Mini Apps documentation](https://core.telegram.org/bots/webapps).

Vite hỗ trợ TypeScript và development HMR nhanh. Lưu ý Vite chỉ transpile TypeScript, vì vậy pipeline build cần chạy thêm `tsc --noEmit`. Xem [Vite documentation](https://vite.dev/guide/).

## 2. Kiến trúc khuyến nghị

```text
src/
├── core/                 # Logic idle thuần TypeScript
│   ├── economy/
│   ├── simulation/
│   ├── progression/
│   └── offline-income/
├── game/                 # Phaser
│   ├── scenes/
│   ├── entities/
│   ├── animations/
│   └── effects/
├── ui/                   # HUD, popup, shop, manager
├── persistence/          # IndexedDB và cloud save
├── platform/
│   ├── web/
│   ├── telegram/
│   └── capacitor/
└── config/               # Balance tables
```

Điểm quan trọng nhất là tách `core` khỏi Phaser. Economy, offline income và upgrade formula phải chạy được mà không cần renderer. Nhờ vậy có thể:

- Unit-test balance nhanh.
- Tính offline income chính xác.
- Chạy cùng logic ở backend để chống gian lận.
- Thay renderer hoặc nền tảng mà không viết lại gameplay.

## 3. Những lựa chọn nên tránh ở MVP

- Không dùng Unity: build WebGL nặng hơn và khởi động chậm hơn trong Telegram WebView.
- Không dùng React để render toàn bộ gameplay: animation và game objects nên nằm trong Phaser canvas.
- Không xây backend trước khi core loop đủ vui.
- Không thêm blockchain/NFT/Play-to-Earn vào prototype.
- Không dùng physics engine; chuyển động miner và xe goòng chỉ cần tween/state machine.

## 4. Kết luận

Nếu mục tiêu chỉ là App Store/Google Play và không cần Telegram/web, Godot là lựa chọn thứ hai. Nhưng với game tham chiếu hiện tại, **Phaser + TypeScript là lựa chọn tối ưu nhất**.

Capacitor có thể đóng gói cùng codebase thành ứng dụng iOS/Android sau này. Xem [Capacitor documentation](https://capacitorjs.com/docs).

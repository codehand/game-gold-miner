# Game Design Document — Cat Mine Idle (Prototype)

## 1. Tổng quan

| Hạng mục | Mô tả |
|---|---|
| Thể loại | Idle / Incremental / Mine Management |
| Nền tảng | Mobile, màn hình dọc 9:16 |
| Phiên chơi | 30 giây–5 phút, quay lại nhiều lần trong ngày |
| Đối tượng | Người chơi casual, thích tăng trưởng số liệu và tự động hóa |
| Mục tiêu prototype | Tái tạo sát cảm giác gameplay trong video: nhiều tầng mỏ chạy đồng thời, mèo thợ mỏ tự đào, xe goòng vận chuyển vàng, nâng cấp bằng vàng và nhận thu nhập offline |

> **Phạm vi tham chiếu:** Video chỉ dài khoảng 8,56 giây nên không thể xác nhận 100% mọi luật, công thức và màn hình. Tài liệu này tách phần quan sát trực tiếp khỏi phần suy luận cần kiểm chứng. Khi phát triển sản phẩm thật, nên dùng tên, hình ảnh, âm thanh và UI nguyên bản để tránh sao chép tài sản sở hữu trí tuệ.

> **Quyết định cho base game:** UI dùng tiếng Anh; mỏ tự động chạy không cần Manager; mỗi tầng khai thác vào hàng chờ riêng, một elevator dùng chung thu vàng theo round-robin và một warehouse dùng chung chuyển vàng thành số dư. Mine shaft, elevator và warehouse được nâng cấp độc lập. Manager, boost, gift drop và bottom navigation được triển khai sau base-game milestone.

## 2. Trải nghiệm cốt lõi

Người chơi điều hành một mỏ vàng nhiều tầng do các mèo vận hành. Mỗi tầng tạo vàng theo chu kỳ. Thợ mỏ đào quặng, mang vàng tới xe goòng; hệ thống vận chuyển đưa vàng lên kho và cộng vào tổng tiền. Người chơi dùng số vàng đó để nâng cấp tầng mỏ, tốc độ vận chuyển và sức chứa, từ đó tạo ra nhiều vàng hơn kể cả khi không mở game.

### Trụ cột thiết kế

1. **Tự động hóa dễ hiểu:** các mèo và xe goòng luôn hoạt động, tạo cảm giác mỏ đang sống.
2. **Tăng trưởng nhìn thấy được:** số vàng, cấp độ, tốc độ và lượng quặng tăng rõ sau mỗi lần nâng cấp.
3. **Quyết định nâng cấp ngắn:** người chơi liên tục chọn tầng nào đem lại hiệu suất tốt nhất.
4. **Phần thưởng quay lại:** vàng offline và quà rơi tạo lý do mở game thường xuyên.

## 3. Những gì quan sát được từ video

- Giao diện dọc, một màn hình hiển thị khoảng bốn tầng mỏ cùng lúc.
- Mỗi tầng có mèo quản lý/thợ mỏ, nhóm công nhân, đống vàng, xe goòng, thanh tiến độ và nhãn cấp độ.
- Các tầng hoạt động đồng thời; nhân vật đào và vận chuyển theo vòng lặp tự động.
- Cột bên trái hiển thị số thứ tự tầng; có nút cuộn lên/xuống.
- Thanh trên cùng hiển thị thu nhập idle, tổng vàng và một loại tiền/tài nguyên phụ.
- Khu vực mặt đất phía trên có kho/xe vận chuyển và hai nhân vật phụ trách luồng hàng.
- Một hộp quà xuất hiện ở khu vực mặt đất trong clip, gợi ý cơ chế quà rơi ngẫu nhiên.
- Thanh điều hướng dưới gồm các mục gần tương đương: Daily/Treasure, Shop, Task, Boost, chế độ tự động, Manager, Land và News.
- Nút `x4` và biểu tượng vô cực cho thấy có tăng tốc và tự động hóa/boost theo thời gian.

## 4. Vòng lặp gameplay

```text
Mỏ đào quặng
    ↓
Thợ mỏ gom vàng
    ↓
Xe goòng vận chuyển lên kho
    ↓
Vàng được cộng vào số dư
    ↓
Người chơi nâng cấp tầng / vận chuyển / kho / quản lý
    ↓
Sản lượng và tốc độ tăng → mở tầng mới → lặp lại
```

### Phiên chơi điển hình

1. Nhận vàng offline khi mở game.
2. Thu quà hoặc phần thưởng đang chờ.
3. Kiểm tra tầng đang gây nghẽn: đào, xe goòng hay kho.
4. Nâng cấp hạng mục có hiệu suất tốt nhất.
5. Mở tầng mới hoặc gắn Manager khi đủ điều kiện.
6. Kích hoạt boost ngắn hạn rồi rời game.

## 5. Hệ thống chính

### 5.1 Tầng mỏ

Mỗi tầng có các thuộc tính:

| Thuộc tính | Ý nghĩa |
|---|---|
| `level` | Cấp hiện tại của tầng |
| `baseYield` | Vàng tạo ra trong một chu kỳ |
| `cycleTime` | Thời gian hoàn thành một lượt đào |
| `carryCapacity` | Lượng vàng thợ có thể mang |
| `unlockCost` | Giá mở tầng |
| `upgradeCost` | Giá nâng cấp tiếp theo |
| `managerId` | Manager được gắn, nếu có |

Tầng mới sâu hơn có chi phí cao hơn nhưng sản lượng cơ bản lớn hơn. Mốc cấp độ có thể tăng số thợ, đổi hình ảnh đống vàng hoặc mở multiplier.

### 5.2 Chuỗi sản xuất

Ba công đoạn phải cân bằng:

- **Khai thác:** tạo quặng/vàng tại từng tầng.
- **Vận chuyển:** xe goòng lấy vàng từ tầng và chuyển tới trục nâng.
- **Kho mặt đất:** nhận hàng và quy đổi thành vàng có thể chi tiêu.

Nếu một công đoạn chậm, vàng chờ sẽ chất đống tại điểm giao. Đây là tín hiệu hình ảnh giúp người chơi biết nên nâng cấp đâu.

### 5.3 Nâng cấp

- Chạm nút cấp độ của tầng để nâng một cấp.
- Có tùy chọn mua nhanh `x1`, `x10`, `x50` hoặc `MAX`.
- Chi phí tăng theo cấp:

```text
upgradeCost(level) = baseCost × growthRate ^ level
```

- Prototype đề xuất `growthRate = 1.12–1.18` và tinh chỉnh bằng playtest.
- Các mốc 10/25/50/100 cấp trao multiplier lớn để tạo khoảnh khắc bứt phá.

### 5.4 Manager và tự động hóa

- Mỗi tầng có một ô Manager.
- Manager tự kích hoạt quy trình của tầng và cung cấp bonus như tăng tốc, tăng sản lượng hoặc tăng sức chứa.
- Manager có cấp/độ hiếm; có thể nâng cấp bằng tài nguyên phụ.
- Khi chưa có Manager, prototype có thể yêu cầu chạm để khởi động chu kỳ; khi đã có, tầng chạy tự động.

### 5.5 Thu nhập offline

```text
offlineGold = min(offlineSeconds, offlineCap)
              × effectiveGoldPerSecond
              × offlineEfficiency
```

- MVP đề xuất giới hạn 2 giờ và hiệu suất 50%.
- Màn hình quay lại hiển thị thời gian vắng mặt, vàng nhận được và nút nhận.
- Có thể mở rộng giới hạn bằng nâng cấp, không cần hệ thống tiền thật trong prototype.

### 5.6 Boost và quà rơi

- **Boost x4:** nhân sản lượng trong một khoảng thời gian ngắn.
- **Auto/Infinity:** biểu thị tự động hóa đang hoạt động hoặc một boost không giới hạn thời gian.
- **Quà rơi:** hộp quà xuất hiện ngẫu nhiên ở mặt đất; chạm để nhận vàng tức thời hoặc boost.
- Quà phải nổi bật nhưng không che luồng vận chuyển.

### 5.7 Tiến trình

- Mở tầng mới khi có đủ vàng và đạt mốc tầng trước.
- Mỗi tầng mới thay đổi loại tài nguyên hoặc trang trí: vàng, than, ruby, đá quý.
- Mục tiêu dài hạn: mở toàn bộ mỏ, tối ưu sản lượng mỗi giây và sưu tập Manager.

## 6. Kinh tế MVP

| Tài nguyên | Nguồn | Cách dùng |
|---|---|---|
| Gold | Sản xuất tại mỏ, offline, quà rơi | Nâng cấp và mở tầng |
| Manager Token | Nhiệm vụ/mốc tiến trình | Tuyển hoặc nâng Manager |
| Boost Ticket | Quà, nhiệm vụ | Kích hoạt x2/x4 tạm thời |

MVP chỉ dùng tiền ảo nội bộ, không blockchain, NFT, quy đổi tiền thật hoặc Play-to-Earn. Các hệ thống đó không cần thiết để kiểm chứng vòng lặp idle cốt lõi.

## 7. Điều khiển và giao diện

### Điều khiển

- Chạm nút cấp độ: nâng cấp tầng.
- Chạm Manager: mở bảng Manager của tầng.
- Vuốt dọc: xem các tầng sâu hơn.
- Chạm quà: nhận phần thưởng.
- Chạm thanh điều hướng dưới: mở Shop, Task, Boost hoặc Manager.

### Bố cục màn hình mỏ

```text
┌──────────────────────────────┐
│ Idle/s      Gold      Premium│
├──────────────────────────────┤
│ Manager   Kho + xe   Manager │
├───┬──────────────────────────┤
│ 1 │ Miner → Gold → Cart [Lv] │
├───┼──────────────────────────┤
│ 2 │ Miner → Gold → Cart [Lv] │
├───┼──────────────────────────┤
│ 3 │ Miner → Gold → Cart [Lv] │
├───┼──────────────────────────┤
│ 4 │ Miner → Gold → Cart [Lv] │
├───┴──────────────────────────┤
│ Daily Shop Task Boost Manager│
└──────────────────────────────┘
```

### Phản hồi người chơi

- Số vàng bay về thanh tiền khi hoàn thành giao hàng.
- Thanh tiến độ trên đầu miner/xe goòng.
- Nút nâng cấp đổi màu khi đủ tiền.
- Rung nhẹ, âm thanh đồng xu và hiệu ứng bụi khi đào.
- Ký hiệu số lớn rút gọn: `14.6aa`, `7.2ab`, v.v.

## 8. Phong cách hình ảnh và âm thanh

- 2D cartoon, màu sáng, hình khối tròn và dễ đọc trên màn hình nhỏ.
- Nhân vật mèo đầu lớn, chuyển động ngắn và lặp mượt.
- Mỗi tầng gồm nền đất cắt lớp, đường hầm tối, đống vàng và xe goòng.
- Animation tối thiểu: đào, chạy/mang hàng, xe chạy, vàng rơi, tăng cấp và mở quà.
- Nhạc nền vui nhẹ; SFX riêng cho cuốc, xe goòng, đồng xu, nâng cấp và quà.

## 9. MVP khả thi

### Bắt buộc

- Một màn hình mỏ dọc với 4 tầng.
- Chuỗi đào → vận chuyển → cộng vàng chạy liên tục.
- Nâng cấp từng tầng và hiển thị cấp độ.
- Mở khóa tầng theo thứ tự.
- Một loại Manager tự động hóa.
- Lưu game cục bộ và tính vàng offline.
- Một boost x4 và quà rơi ngẫu nhiên.
- Hoạt ảnh/SFX cơ bản và UI số lớn.

### Chưa làm trong MVP

- Tài khoản, máy chủ, leaderboard và social/referral.
- Shop tiền thật, quảng cáo, token, NFT hoặc blockchain.
- Land, News, Daily Morse và hệ thống thẻ phức tạp.
- Hơn 4 tầng và nhiều loại mỏ.

## 10. Tiêu chí nghiệm thu prototype

- Người chơi hiểu cách kiếm và dùng vàng trong 30 giây đầu mà không cần hướng dẫn dài.
- Tất cả 4 tầng có thể chạy đồng thời ở 60 FPS trên thiết bị mục tiêu.
- Số dư và tiến trình được khôi phục chính xác sau khi đóng/mở game.
- Offline reward không vượt quá giới hạn cấu hình.
- Sau 10 phút chơi, người chơi đã mở ít nhất 3 tầng và trải nghiệm ít nhất một mốc multiplier.
- Không có trạng thái kẹt tiến trình do chi phí tăng nhanh hơn khả năng tạo vàng.

## 11. Điểm cần xác minh thêm để đạt độ trung thực cao

- Công thức chính xác của sản lượng, chi phí và các mốc multiplier.
- Vai trò riêng của miner, xe goòng, elevator và warehouse.
- Điều kiện mở tầng, giới hạn offline và cách hoạt động của nút vô cực.
- Tác dụng/chỉ số của từng Manager và tài nguyên phụ.
- Xác suất, thời gian tồn tại và bảng phần thưởng của hộp quà.
- Nội dung thực tế của từng tab ở thanh điều hướng dưới.

## 12. Nguồn tham khảo

- [Video Shorts được cung cấp](https://www.youtube.com/shorts/xjOICCm_VVk) — nguồn quan sát trực tiếp về UI và animation.
- [Tài liệu chính thức Cat Gold Miner](https://docs.catgoldminer.ai/) — mô tả idle mining, Manager, nâng cấp và tiến trình.
- [Cat Gold Miner trên Google Play](https://play.google.com/store/apps/details?id=com.cgstudio.catgoldminer) — mô tả automation, offline income, tài nguyên và hơn 20 mỏ.

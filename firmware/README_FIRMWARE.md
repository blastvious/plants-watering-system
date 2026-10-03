# Hướng Dẫn Cài Đặt & Nạp Firmware Cho Vietduino ESP32

## 1. Sơ Đồ Đấu Nối Phần Cứng (Pinout)

> [!CAUTION]
> **Động cơ bơm R385 hoạt động ở điện áp 9V - 12V DC** với dòng tải tức thời từ 1A - 2A. **TUYỆT ĐỐI KHÔNG** cấp nguồn máy bơm trực tiếp từ chân 3.3V hoặc 5V của Vietduino ESP32 vì sẽ gây sụt áp hoặc cháy board mạch. Hãy dùng nguồn adapter rời (12V 2A) và đóng/ngắt qua tiếp điểm COM - NO của Relay.

| Thiết bị | Chân thiết bị | Chân Vietduino ESP32 | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Cảm biến độ ẩm đất** | VCC | 3.3V / 5V | Nguồn cảm biến |
| | GND | GND | Nối mass chung |
| | A0 (Analog Out) | **GPIO 35** | Đọc ADC độ ẩm |
| **Cảm biến mực nước** | VCC | 3.3V / 5V | Nguồn cảm biến mực nước bể |
| | GND | GND | Nối mass chung |
| | Signal | **GPIO 34** | Đọc ADC mực nước |
| **Cảm biến nhiệt độ (DHT11/22)** | VCC | 3.3V / 5V | Nguồn cảm biến |
| | GND | GND | Nối mass chung |
| | DATA | **GPIO 4** | Chân tín hiệu nhiệt độ |
| **Module Relay** | VCC | 5V (VIN) | Nguồn cuộn hút Relay |
| | GND | GND | Nối mass chung |
| | IN | **GPIO 26** | Tín hiệu kích đóng/ngắt |
| | COM | Cực dương (+) Nguồn 12V | Tiếp điểm máy bơm |
| | NO | Cực dương (+) Bơm R385 | Tiếp điểm thường mở |
| **Máy bơm R385** | Cực âm (-) | Cực âm (-) Nguồn 12V | Nối mass nguồn 12V |
| **Đèn LED báo trạng thái** | - | **GPIO 2** | LED Onboard trên ESP32 |

---

## 2. Cài Đặt Môi Trường Arduino IDE

1. **Cài đặt ESP32 Board package**:
   - Mở Arduino IDE -> `File` -> `Preferences`.
   - Tại mục *Additional Board Manager URLs*, dán URL:
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Vào `Tools` -> `Board` -> `Boards Manager...`, tìm **ESP32** (bởi Espressif Systems) và bấm **Install**.

2. **Cài đặt các thư viện cần thiết**:
   - Vào `Sketch` -> `Include Library` -> `Manage Libraries...`:
     - Tìm và cài đặt **Firebase ESP32 Client** (bởi Mobizt)
     - Tìm và cài đặt **DHT sensor library** (bởi Adafruit)
     - Tìm và cài đặt **Adafruit Unified Sensor** (bởi Adafruit)

3. **Cấu hình thông tin trong file code `.ino`**:
   - Mở file `firmware/esp32_irrigation/esp32_irrigation.ino`
   - Thay đổi các thông số:
     ```cpp
     #define WIFI_SSID       "Tên_WiFi_Của_Bạn"
     #define WIFI_PASSWORD   "Mật_Khẩu_WiFi"
     #define FIREBASE_HOST   "https://du-an-cua-ban-default-rtdb.firebaseio.com"
     #define FIREBASE_AUTH   "Database_Secret_Hoặc_Web_API_Key"
     ```
4. **Nạp code vào Vietduino ESP32**:
   - Cắm cáp Micro-USB/Type-C nối máy tính và Vietduino ESP32.
   - Chọn Board: `ESP32 Dev Module` (hoặc `NodeMCU-32S`).
   - Chọn đúng Port COM của thiết bị.
   - Bấm nút **Upload**. Mở Serial Monitor (tốc độ `115200 baud`) để theo dõi nhật ký kết nối.


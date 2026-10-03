/*
 * HỆ THỐNG TƯỚI NƯỚC TỰ ĐỘNG THÔNG MINH IOT QUA FIREBASE REALTIME DATABASE
 * Đồ án môn học: NT131
 * Vi điều khiển: Vietduino ESP32
 * 
 * Thiết bị ngoại vi:
 * 1. Cảm biến độ ẩm đất (Soil Moisture Sensor) -> Chân Analog GPIO 35
 * 2. Cảm biến mực nước (Water Level Sensor)    -> Chân Analog GPIO 34
 * 3. Cảm biến nhiệt độ DHT11 / DHT22           -> Chân Digital GPIO 4
 * 4. Module Relay điều khiển máy bơm R385      -> Chân Digital GPIO 26
 * 5. Đèn LED báo trạng thái hệ thống          -> Chân GPIO 2 (LED onboard)
 * 
 * Thư viện cần cài đặt trong Arduino IDE:
 * - Firebase ESP32 ClienLOOt (by Mobizt)
 * - DHT sensor library (by Adafruit)
 * - Adafruit Unified Sensor
 */

#include <WiFi.h>
#include <FirebaseESP32.h>
#include <DHT.h>

// ======================= CẤU HÌNH WIFI & FIREBASE =======================
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// URL Database Firebase (ví dụ: "https://your-project-id-default-rtdb.firebaseio.com")
#define FIREBASE_HOST   "https://your-project-id-default-rtdb.firebaseio.com"
// Firebase Database Secret hoặc Web API Key
#define FIREBASE_AUTH   "YOUR_FIREBASE_DATABASE_SECRET_OR_API_KEY"

// =========================== CẤU HÌNH CHÂN PIN ==========================
#define PIN_SOIL_MOISTURE   35    // ADC1_CH7
#define PIN_WATER_LEVEL     34    // ADC1_CH6
#define PIN_DHT             4     // Chân data của DHT
#define PIN_RELAY_PUMP      26    // Chân kích Relay điều khiển bơm R385
#define PIN_STATUS_LED      2     // Đèn LED báo kết nối

// Chọn loại cảm biến nhiệt độ: DHT11 hoặc DHT22
#define DHTTYPE             DHT11 
DHT dht(PIN_DHT, DHTTYPE);

// Cấu hình Relay (Hầu hết module relay 5V kích mức LOW: LOW = BẬT, HIGH = TẮT)
#define RELAY_ACTIVE_LEVEL  LOW
#define RELAY_INACTIVE_LEVEL HIGH

// ======================== BIẾN TRẠNG THÁI HỆ THỐNG ======================
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Giá trị cảm biến
float soilMoisturePercent = 0.0;
float waterLevelPercent   = 0.0;
float temperatureValue    = 0.0;
bool  pumpState           = false;

// Thông số điều khiển nhận từ Firebase
String systemMode         = "auto";    // "auto" hoặc "manual"
bool   manualPumpCmd      = false;     // Lệnh bật bơm thủ công
float  soilThreshold      = 40.0;      // Ngưỡng độ ẩm đất để kích hoạt bơm (< 40%)
float  waterMinSafety     = 15.0;      // Ngưỡng mực nước tối thiểu cho phép bơm (> 15%)
int    maxPumpSeconds     = 60;        // Giới hạn thời gian bơm liên tục (giây)

// Bộ định thời không chặn (Non-blocking Timers)
unsigned long lastSensorReadTime = 0;
const unsigned long SENSOR_INTERVAL = 3000; // Đọc cảm biến mỗi 3 giây

unsigned long lastFirebaseSyncTime = 0;
const unsigned long SYNC_INTERVAL   = 3000; // Đẩy dữ liệu lên Firebase mỗi 3 giây

unsigned long pumpStartTime = 0; // Đếm thời gian máy bơm chạy liên tục

// ========================== CÁC HÀM XỬ LÝ ===============================

// Bật / Tắt máy bơm và điều khiển Relay
void setPump(bool enable, const char* reason) {
  if (enable) {
    // KHÓA AN TOÀN PHẦN CỨNG: Kiểm tra mực nước bể trước khi bơm
    if (waterLevelPercent < waterMinSafety) {
      Serial.printf("[CẢNH BÁO] Không thể bật bơm! Mực nước bể (%.1f%%) < ngưỡng an toàn (%.1f%%)\n", 
                    waterLevelPercent, waterMinSafety);
      enable = false;
    }
  }

  if (enable != pumpState) {
    pumpState = enable;
    if (pumpState) {
      digitalWrite(PIN_RELAY_PUMP, RELAY_ACTIVE_LEVEL);
      pumpStartTime = millis();
      Serial.printf("[RELAY] BẬT BƠM R385! Lý do: %s\n", reason);
    } else {
      digitalWrite(PIN_RELAY_PUMP, RELAY_INACTIVE_LEVEL);
      pumpStartTime = 0;
      Serial.printf("[RELAY] TẮT BƠM R385! Lý do: %s\n", reason);
    }

    // Cập nhật trạng thái bơm ngay lên Firebase
    Firebase.setBool(fbdo, "/irrigation_system/telemetry/pump_state", pumpState);
  }
}

// Đọc giá trị từ các cảm biến vật lý
void readSensors() {
  // 1. Đọc độ ẩm đất (ADC 12-bit: 0 - 4095)
  // Cảm biến điện trở/dung: Khô ~ 4095, Ướt trong nước ~ 1500
  int rawSoil = analogRead(PIN_SOIL_MOISTURE);
  // Quy đổi tỉ lệ % (đảo ngược vì khô giá trị cao, ướt giá trị thấp)
  int soilPercent = map(rawSoil, 4095, 1500, 0, 100);
  soilMoisturePercent = constrain(soilPercent, 0, 100);

  // 2. Đọc mực nước bể chứa (ADC 12-bit: 0 - 4095)
  int rawWater = analogRead(PIN_WATER_LEVEL);
  // Quy đổi sang tỉ lệ 0 - 100%
  int waterPercent = map(rawWater, 200, 3200, 0, 100);
  waterLevelPercent = constrain(waterPercent, 0, 100);

  // 3. Đọc nhiệt độ từ DHT
  float t = dht.readTemperature();
  if (!isnan(t)) {
    temperatureValue = t;
  }

  Serial.printf("[Sensors] Độ ẩm đất: %.1f%% | Mực nước: %.1f%% | Nhiệt độ: %.1f°C | Bơm: %s\n",
                soilMoisturePercent, waterLevelPercent, temperatureValue, pumpState ? "BẬT" : "TẮT");
}

// Đồng bộ trạng thái cảm biến lên Firebase Realtime Database
void pushTelemetryToFirebase() {
  FirebaseJson json;
  json.set("soil_moisture", soilMoisturePercent);
  json.set("water_level", waterLevelPercent);
  json.set("temperature", temperatureValue);
  json.set("pump_state", pumpState);
  json.set("last_updated", (double)(millis() / 1000));

  if (Firebase.updateNode(fbdo, "/irrigation_system/telemetry", json)) {
    // Nháy LED báo gửi thành công
    digitalWrite(PIN_STATUS_LED, HIGH);
    delay(50);
    digitalWrite(PIN_STATUS_LED, LOW);
  } else {
    Serial.printf("[Firebase Error] %s\n", fbdo.errorReason().c_str());
  }
}

// Đọc lệnh điều khiển và cài đặt từ Firebase
void fetchControlFromFirebase() {
  if (Firebase.getJSON(fbdo, "/irrigation_system/control")) {
    FirebaseJsonData jsonData;
    FirebaseJson &json = fbdo.jsonObject();

    // Đọc mode
    if (json.get(jsonData, "mode")) {
      systemMode = jsonData.stringValue;
    }
    // Đọc lệnh thủ công
    if (json.get(jsonData, "pump_manual_command")) {
      manualPumpCmd = jsonData.boolValue;
    }
    // Đọc ngưỡng độ ẩm
    if (json.get(jsonData, "soil_threshold")) {
      soilThreshold = jsonData.floatValue;
    }
    // Đọc ngưỡng nước tối thiểu
    if (json.get(jsonData, "water_min_safety")) {
      waterMinSafety = jsonData.floatValue;
    }
    // Đọc thời gian tối đa
    if (json.get(jsonData, "max_pump_duration_seconds")) {
      maxPumpSeconds = jsonData.intValue;
    }
  }
}

// Logic kiểm soát tưới nước tự động và bảo vệ phần cứng
void evaluateIrrigationLogic() {
  // 1. Kiểm tra an toàn khẩn cấp: nếu bể cạn nước -> ngắt ngay lập tức!
  if (pumpState && (waterLevelPercent < waterMinSafety)) {
    setPump(false, "CẢNH BÁO AN TOÀN: Bể cạn nước!");
    return;
  }

  // 2. Bảo vệ quá thời gian (Timeout): Bơm chạy liên tục quá maxPumpSeconds
  if (pumpState && pumpStartTime > 0) {
    if ((millis() - pumpStartTime) > (unsigned long)(maxPumpSeconds * 1000)) {
      setPump(false, "Đạt giới hạn thời gian tưới tối đa!");
      return;
    }
  }

  // 3. Xử lý theo chế độ
  if (systemMode == "auto") {
    // TỰ ĐỘNG:
    // Nếu độ ẩm < ngưỡng và bể đủ nước an toàn -> Kích hoạt bơm
    if (soilMoisturePercent < soilThreshold && waterLevelPercent >= waterMinSafety) {
      if (!pumpState) {
        setPump(true, "Chế độ Auto: Độ ẩm đất dưới ngưỡng");
      }
    } 
    // Nếu độ ẩm đã đạt yêu cầu (ngưỡng + 5% trễ hysteresis) -> Tắt bơm
    else if (soilMoisturePercent >= (soilThreshold + 5.0)) {
      if (pumpState) {
        setPump(false, "Chế độ Auto: Đất đã đủ ẩm");
      }
    }
  } else {
    // THỦ CÔNG: Làm theo lệnh manualPumpCmd
    if (manualPumpCmd != pumpState) {
      setPump(manualPumpCmd, "Lệnh điều khiển thủ công từ người dùng");
    }
  }
}

// ============================== SETUP ===================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- KHỞI ĐỘNG HỆ THỐNG TƯỚI NƯỚC VIETDUINO ESP32 ---");

  // Thiết lập chân I/O
  pinMode(PIN_RELAY_PUMP, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP, RELAY_INACTIVE_LEVEL); // Đảm bảo bơm TẮT ban đầu

  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  pinMode(PIN_SOIL_MOISTURE, INPUT);
  pinMode(PIN_WATER_LEVEL, INPUT);

  // Khởi động cảm biến DHT
  dht.begin();

  // Kết nối WiFi
  Serial.printf("Đang kết nối vào WiFi: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
  }
  digitalWrite(PIN_STATUS_LED, HIGH);
  Serial.println("\n[WiFi] Đã kết nối thành công!");
  Serial.printf("[WiFi] Địa chỉ IP ESP32: %s\n", WiFi.localIP().toString().c_str());

  // Cấu hình Firebase
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  Serial.println("[Firebase] Đã khởi tạo kết nối RTDB!");
}

// ============================== LOOP ====================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Định kỳ đọc cảm biến
  if (currentMillis - lastSensorReadTime >= SENSOR_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensors();
  }

  // 2. Định kỳ đọc lệnh & đồng bộ Firebase
  if (currentMillis - lastFirebaseSyncTime >= SYNC_INTERVAL) {
    lastFirebaseSyncTime = currentMillis;
    fetchControlFromFirebase();
    evaluateIrrigationLogic();
    pushTelemetryToFirebase();
  }

  delay(20);
}


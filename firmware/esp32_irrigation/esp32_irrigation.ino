#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <FirebaseClient.h>

// ================= CẤU HÌNH WIFI & FIREBASE =================
#define WIFI_SSID       "KEYBOX KAFE"
#define WIFI_PASSWORD   ""

#define FIREBASE_HOST   "https://plants-watering-8cb40-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH   "7l2FfHmkQmiYYJ2K8r8xoi6g1oPK7kLk3RbvACXx"

#define LED_PIN         2  // LED onboard của ESP32

// ================= KHAI BÁO ĐỐI TƯỢNG FIREBASECLIENT =================
DefaultNetwork network;
LegacyToken user_auth(FIREBASE_AUTH);
FirebaseApp app;
WiFiClientSecure ssl_client;
using AsyncClient = AsyncClientClass;
AsyncClient aClient(ssl_client, getNetwork(network));
RealtimeDatabase Database;

// Biến lưu trạng thái LED và bộ định thời
bool ledStatus = false;
unsigned long lastSendTime = 0;

// Prototype hàm callback xử lý dữ liệu bất đồng bộ
void asyncResultCallback(AsyncResult &aResult);

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // 1. Kết nối WiFi
  Serial.printf("\nĐang kết nối WiFi: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Đã kết nối thành công!");
  Serial.printf("[WiFi] IP ESP32: %s\n", WiFi.localIP().toString().c_str());

  // 2. Cấu hình SSL Client
  ssl_client.setInsecure();

  // 3. Khởi tạo Firebase App & Realtime Database
  initializeApp(aClient, app, getAuth(user_auth), asyncResultCallback, "🔐 authTask");
  app.getApp<RealtimeDatabase>(Database);
  Database.url(FIREBASE_HOST);
  Serial.println("[Firebase] Đã khởi tạo kết nối!");
}

// ================= LOOP =================
void loop() {
  // Duy trì tiến trình background của Firebase (bắt buộc)
  app.loop();

  if (app.ready()) {
    // ----------------- 1. NHẬN DỮ LIỆU TỪ FIREBASE (ĐIỀU KHIỂN LED) -----------------
    // Đọc liên tục giá trị bool từ đường dẫn "/test/led"
    Database.get(aClient, "/test/led", asyncResultCallback, false, "RTDB_GetLed");

    // ----------------- 2. GỬI DỮ LIỆU LÊN FIREBASE (BÁO TRẠNG THÁI) -----------------
    // Định kỳ mỗi 5 giây gửi thời gian hoạt động (uptime) lên Firebase
    if (millis() - lastSendTime > 5000) {
      lastSendTime = millis();
      
      int uptimeSeconds = millis() / 1000;
      Database.set<int>(aClient, "/test/uptime_seconds", uptimeSeconds, asyncResultCallback, "RTDB_SetUptime");
    }
  }

  delay(100);
}

// ================= HÀM CALLBACK XỬ LÝ KẾT QUẢ FIREBASE =================
void asyncResultCallback(AsyncResult &aResult) {
  if (!aResult.isResult())
    return;

  // Xử lý báo lỗi nếu có
  if (aResult.isError()) {
    Serial.printf("[LỖI FIREBASE] Task: %s, Code: %d, Msg: %s\n", 
                  aResult.uid().c_str(), 
                  aResult.error().code(), 
                  aResult.error().message().c_str());
  }

  // Xử lý khi có dữ liệu phản hồi từ Firebase
  if (aResult.available()) {
    // 1. Phản hồi của lệnh ĐỌC LED (/test/led)
    if (aResult.uid() == "RTDB_GetLed") {
      String payload = aResult.c_str();
      bool firebaseLedCmd = (payload == "true" || payload == "1");

      if (firebaseLedCmd != ledStatus) {
        ledStatus = firebaseLedCmd;
        digitalWrite(LED_PIN, ledStatus ? HIGH : LOW);
        Serial.printf("[FIREBASE -> ESP32] Đã nhận lệnh: Đèn LED %s\n", ledStatus ? "BẬT" : "TẮT");
      }
    }
    // 2. Phản hồi của lệnh GỬI UPTIME (/test/uptime_seconds)
    else if (aResult.uid() == "RTDB_SetUptime") {
      Serial.printf("[ESP32 -> FIREBASE] Đã gửi uptime thành công: %s giây\n", aResult.c_str());
    }
  }
}
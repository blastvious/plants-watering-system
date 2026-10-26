#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <FirebaseClient.h>
#include "DHT.h"

// ================= Wifi Configuration =================
#define WIFI_SSID       "iPhone"
#define WIFI_PASSWORD   "23521717"

#define DATABASE_URL    "https://your_url-project-rtdb.firebaseio.com"
#define DATABASE_SECRET "7l2FfHmkQmiYYJ2K8r8xyoursecret"

// ================= Configuration (PINS) =================
#define DHTPIN          15     // PIN DATA DHT11/DHT22
#define DHTTYPE         DHT11  
#define SOIL_PIN        34     // PIN SOIL SENSOR (ADC1)
#define WATER_LEVEL_PIN 35     // PIN WATER SENSOR (ADC1)
#define RELAY_PIN       26     // PIN Relay controll water pump

// ================= Initial - Object =================
DefaultNetwork network;
LegacyToken user_auth(DATABASE_SECRET);
FirebaseApp app;
WiFiClientSecure ssl_client;
using AsyncClient = AsyncClientClass;
AsyncClient aClient(ssl_client, getNetwork(network));
RealtimeDatabase Database;

DHT dht(DHTPIN, DHTTYPE);

// ================= GLOBAL PARAMETERS =================
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 5000; // Fetch data every 5s

bool relayState = false;

// Prototype callback
void processData(AsyncResult &aResult);

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(500);

  // 1. Configuration I/O & ADC
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Turn off as a default

  analogReadResolution(12);
  analogSetPinAttenuation(WATER_LEVEL_PIN, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  // 2. DHT sensor
  dht.begin();

  // 3. Connecting Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println("\nConnected with IP: ");
  Serial.println(WiFi.localIP());

  // 4. Firebase setup
  ssl_client.setInsecure();
  initializeApp(aClient, app, getAuth(user_auth), processData, " authTask");
  app.getApp<RealtimeDatabase>(Database);
  Database.url(DATABASE_URL);
}

// ================= LOOP =================
void loop() {
  app.loop();

  if (app.ready()) {
    unsigned long currentTime = millis();
    
    if (currentTime - lastSendTime >= sendInterval) {
      lastSendTime = currentTime;

      // A. Read controll signal from PATH of BACKEND
      Database.get(aClient, "/irrigation_system/control/pump_manual_command", processData, false, "RTDB_GetPumpCmd");

      // B. Read data sensor
      float h = dht.readHumidity();
      float t = dht.readTemperature();
      int soilRaw = analogRead(SOIL_PIN);
      int waterRaw = analogRead(WATER_LEVEL_PIN);

      // Convert soil sensor %
      int soilPercent = map(soilRaw, 4095, 0, 0, 100);
      soilPercent = constrain(soilPercent, 0, 100);

      // C. Push data sensor (JSON)
      String jsonPayload = "{";
      if (!isnan(h) && !isnan(t)) {
        jsonPayload += "\"temperature\":" + String(t, 1) + ",";
        jsonPayload += "\"humidity\":" + String(h, 1) + ",";
        Serial.printf("[ESP32] Temp: %.1f°C | Hum: %.1f%% | Soil: %d%% | Water: %d\n", t, h, soilPercent, waterRaw);
      } else {
        Serial.printf("[ESP32] (DHT Error) Soil: %d%% | Water: %d\n", soilPercent, waterRaw);
      }
      jsonPayload += "\"soil_moisture\":" + String(soilPercent) + ",";
      jsonPayload += "\"water_level\":" + String(waterRaw);
      jsonPayload += "}";

      // Convert jsonPayload to object_t in order to Firebase understand this is a JSON Object
      Database.set(aClient, "/sensor", object_t(jsonPayload), processData, "RTDB_SetSensorData");
    }
  }
}

// ================= Proceed Result function =================
void processData(AsyncResult &aResult) {
  if (!aResult.isResult())
    return;

  if (aResult.isError()) {
    Firebase.printf("[Error] Task: %s, Msg: %s\n", aResult.uid().c_str(), aResult.error().message().c_str());
  }

  if (aResult.available()) {
    String payload = aResult.c_str();

    // Get controll signal (on/off) water pump from Backend
    if (aResult.uid() == "RTDB_GetPumpCmd") {
      bool newPumpCmd = (payload == "true" || payload == "1");
      
      if (newPumpCmd != relayState) {
        relayState = newPumpCmd;
        
        //  (Active HIGH or Active LOW)
        digitalWrite(RELAY_PIN, relayState ? HIGH : LOW); 
        
        Serial.printf("\n==========================================\n");
        Serial.printf("-> [BACKEND -> ESP32] MÁY BƠM: %s\n", relayState ? "BẬT (ON) " : "TẮT (OFF) ");
        Serial.printf("==========================================\n\n");
      }
    }
  }
}

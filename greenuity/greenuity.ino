/*
 * SmartFarm IoT - ESP32 Code (Final Version)
 * 
 * Fitur:
 * ✅ Auto provisioning via WiFiManager + Firebase
 * ✅ DHT22 (Temp & Humidity)
 * ✅ BH1750 (Light Intensity)
 * ✅ Soil Sensor (Moisture)
 * ✅ Perintah serial 'd' untuk hapus WiFi (disconnect)
 */

#include <WiFi.h>
#include <WiFiManager.h>
#include <FirebaseESP32.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <BH1750.h>
#include <DHT.h>

// Device ID - UNIK PER DEVICE
#define DEVICE_ID "SF8266-0012"

// Firebase Config
#define FIREBASE_HOST "greenuity-id-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH "e96B1cvAmCpZVwJ6dx64eZAu3t89rNRH5O2jmuil"

// Pin
#define SOIL_SENSOR_PIN 34
#define RELAY_PIN 5
#define DHT_PIN 4
#define DHT_TYPE DHT22

// Firebase
FirebaseData firebaseData;
FirebaseData streamData;
FirebaseAuth firebaseAuth;
FirebaseConfig firebaseConfig;

// Preferences
Preferences preferences;

// WiFi Manager
WiFiManager wifiManager;

// Sensor Objects
BH1750 lightMeter;
DHT dht(DHT_PIN, DHT_TYPE);

// Variables
int soilMoisture = 0;
int soilRaw = 0;
float suhu = 0;
float kelembapanUdara = 0;
float intensitasCahaya = 0;
bool isProvisioned = false;
bool isConnected = false;
String currentSSID = "";
String ownerID = "";

// Kalibrasi soil moisture
const int SOIL_WET = 1200;
const int SOIL_DRY = 3000;

// Timing
unsigned long lastSendTime = 0;
const long SEND_INTERVAL = 10000; // 10 detik

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║   SmartFarm IoT - Cloud Ready        ║");
  Serial.println("║   Device: " + String(DEVICE_ID) + "           ║");
  Serial.println("╚══════════════════════════════════════╝\n");

  pinMode(SOIL_SENSOR_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  Wire.begin(21, 22);
  lightMeter.begin();
  dht.begin();

  preferences.begin("smartfarm", false);
  isProvisioned = preferences.getBool("provisioned", false);

  if (isProvisioned) {
    Serial.println("✅ Device sudah di-provision");
    currentSSID = preferences.getString("wifi_ssid", "");
    ownerID = preferences.getString("owner_id", "");
    Serial.println("   Owner: " + ownerID);
    Serial.println("   WiFi: " + currentSSID);
  } else {
    Serial.println("⚠️  Device belum di-provision");
  }

  setupWiFi();
  setupFirebase();

  if (!isProvisioned) {
    registerUnclaimedDevice();
    Serial.println("⏳ Menunggu konfigurasi dari user...");
  }

  setupConfigListener();
  Serial.println("\n✅ Setup Complete!\n");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi terputus! Reconnecting...");
    isConnected = false;
    WiFi.reconnect();
    delay(5000);
    return;
  } else if (!isConnected) {
    Serial.println("✅ WiFi connected!");
    isConnected = true;
  }

  readSensors();

  if (isProvisioned && millis() - lastSendTime >= SEND_INTERVAL) {
    sendToFirebase();
    lastSendTime = millis();
  }

  delay(1000);
}

// ═══════════════════════════════════════
// WIFI SETUP
// ═══════════════════════════════════════
void setupWiFi() {
  Serial.println("📡 Setting up WiFi...");
  WiFi.setHostname(DEVICE_ID);

  String apName = "SmartFarm-" + String(DEVICE_ID);
  String apPassword = "smartfarm123";

  wifiManager.setAPCallback([](WiFiManager *myWiFiManager) {
    Serial.println("\n╔══════════════════════════════════════╗");
    Serial.println("║     MODE KONFIGURASI AKTIF           ║");
    Serial.println("╚══════════════════════════════════════╝");
    Serial.println("📱 Sambungkan HP ke:");
    Serial.println("   SSID: " + String(myWiFiManager->getConfigPortalSSID()));
    Serial.println("   Password: smartfarm123");
    Serial.println("   URL: http://192.168.4.1");
  });

  wifiManager.setConfigPortalTimeout(300);

  if (!wifiManager.autoConnect(apName.c_str(), apPassword.c_str())) {
    Serial.println("❌ Timeout! Restarting...");
    delay(3000);
    ESP.restart();
  }

  Serial.println("\n✅ WiFi Connected!");
  Serial.println("   SSID: " + WiFi.SSID());
  Serial.println("   IP: " + WiFi.localIP().toString());
  Serial.println("   Signal: " + String(WiFi.RSSI()) + " dBm\n");

  isConnected = true;
  currentSSID = WiFi.SSID();
}

// ═══════════════════════════════════════
// FIREBASE SETUP
// ═══════════════════════════════════════
void setupFirebase() {
  Serial.println("🔥 Setting up Firebase...");

  firebaseConfig.host = FIREBASE_HOST;
  firebaseConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
  firebaseConfig.timeout.serverResponse = 10 * 1000;

  Firebase.begin(&firebaseConfig, &firebaseAuth);
  Firebase.reconnectWiFi(true);

  firebaseData.setBSSLBufferSize(1024, 1024);
  streamData.setBSSLBufferSize(512, 512);

  Serial.println("✅ Firebase initialized!\n");
}

void registerUnclaimedDevice() {
  Serial.println("📝 Registering as unclaimed device...");
  String path = "/unclaimed_devices/" + String(DEVICE_ID);

  FirebaseJson json;
  json.set("status", "ready_to_claim");
  json.set("first_boot/.sv", "timestamp");
  json.set("last_seen/.sv", "timestamp");
  json.set("wifi_ssid", WiFi.SSID());
  json.set("ip_address", WiFi.localIP().toString());
  json.set("rssi", WiFi.RSSI());

  if (Firebase.updateNode(firebaseData, path, json)) {
    Serial.println("✅ Device registered!");
  } else {
    Serial.println("❌ Failed to register!");
    Serial.println("   Error: " + firebaseData.errorReason());
  }
}

// ═══════════════════════════════════════
// CONFIG LISTENER
// ═══════════════════════════════════════
void setupConfigListener() {
  String path = "/pending_config/" + String(DEVICE_ID);
  Serial.println("👂 Listening for config changes...");
  if (!Firebase.beginStream(streamData, path)) {
    Serial.println("❌ Failed to start stream!");
    return;
  }
  Firebase.setStreamCallback(streamData, onConfigChange, onStreamTimeout);
  Serial.println("✅ Config listener active!\n");
}

void onConfigChange(StreamData data) {
  if (data.dataType() == "json") {
    FirebaseJson *json = data.jsonObjectPtr();
    FirebaseJsonData result;
    String newSSID = "", newPassword = "", newOwnerID = "", status = "";

    if (json->get(result, "wifi_ssid")) newSSID = result.stringValue;
    if (json->get(result, "wifi_password")) newPassword = result.stringValue;
    if (json->get(result, "owner_id")) newOwnerID = result.stringValue;
    if (json->get(result, "status")) status = result.stringValue;

    if (status == "pending" && newSSID.length() > 0) {
      applyNewConfig(newSSID, newPassword, newOwnerID);
    }
  }
}

void onStreamTimeout(bool timeout) {
  if (timeout) {
    Serial.println("⚠️ Stream timeout! Reconnecting...");
    setupConfigListener();
  }
}

// ═══════════════════════════════════════
// APPLY CONFIG
// ═══════════════════════════════════════
void applyNewConfig(String ssid, String password, String owner) {
  String configPath = "/pending_config/" + String(DEVICE_ID) + "/status";
  Firebase.setString(firebaseData, configPath, "applying");

  preferences.putString("wifi_ssid", ssid);
  preferences.putString("wifi_password", password);
  preferences.putString("owner_id", owner);
  preferences.putBool("provisioned", true);

  WiFi.disconnect();
  delay(1000);
  WiFi.begin(ssid.c_str(), password.c_str());

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Firebase.setString(firebaseData, configPath, "connected");
    claimDevice(owner);
    isProvisioned = true;
    currentSSID = ssid;
    ownerID = owner;
    Serial.println("\n🎉 Provisioning Complete!");
  } else {
    Firebase.setString(firebaseData, configPath, "connection_failed");
    ESP.restart();
  }
}

void claimDevice(String owner) {
  String devicePath = "/devices/" + String(DEVICE_ID) + "/info";
  FirebaseJson json;
  json.set("owner_id", owner);
  json.set("device_id", DEVICE_ID);
  json.set("status", "online");
  json.set("wifi_ssid", WiFi.SSID());
  json.set("ip_address", WiFi.localIP().toString());
  json.set("rssi", WiFi.RSSI());
  json.set("claimed_at/.sv", "timestamp");

  if (Firebase.updateNode(firebaseData, devicePath, json)) {
    Firebase.deleteNode(firebaseData, "/unclaimed_devices/" + String(DEVICE_ID));
    Firebase.deleteNode(firebaseData, "/pending_config/" + String(DEVICE_ID));
  }
}

// ═══════════════════════════════════════
// SENSOR & DATA
// ═══════════════════════════════════════
void readSensors() {
  soilRaw = analogRead(SOIL_SENSOR_PIN);
  soilMoisture = map(soilRaw, SOIL_DRY, SOIL_WET, 0, 100);
  soilMoisture = constrain(soilMoisture, 0, 100);

  suhu = dht.readTemperature();
  kelembapanUdara = dht.readHumidity();
  intensitasCahaya = lightMeter.readLightLevel();

  Serial.printf("📊 Soil: %d%% | Raw: %d | Suhu: %.1f°C | RH: %.1f%% | Cahaya: %.1f lx\n",
                soilMoisture, soilRaw, suhu, kelembapanUdara, intensitasCahaya);
}

void sendToFirebase() {
  if (!isProvisioned) return;

  String path = "/devices/" + String(DEVICE_ID) + "/current";

  FirebaseJson json;
  json.set("kelembapan_tanah", soilMoisture);
  json.set("raw_value", soilRaw);
  json.set("suhu", suhu);
  json.set("kelembapan_udara", kelembapanUdara);
  json.set("cahaya", intensitasCahaya);
  json.set("status_pompa", "OFF");
  json.set("timestamp/.sv", "timestamp");

  if (Firebase.updateNode(firebaseData, path, json)) {
    Firebase.setString(firebaseData, "/devices/" + String(DEVICE_ID) + "/info/status", "online");
    Firebase.setInt(firebaseData, "/devices/" + String(DEVICE_ID) + "/info/rssi", WiFi.RSSI());
    Serial.println("✅ Data sent!");
  } else {
    Serial.println("❌ Failed to send data!");
  }
}

// ═══════════════════════════════════════
// SERIAL COMMANDS
// ═══════════════════════════════════════
void serialEvent() {
  if (Serial.available()) {
    char cmd = Serial.read();

    switch (cmd) {
      case 'r':
        Serial.println("🔄 Resetting device...");
        preferences.clear();
        wifiManager.resetSettings();
        ESP.restart();
        break;

      case 'i':
        Serial.println("\n═══ DEVICE INFO ═══");
        Serial.println("Device ID: " + String(DEVICE_ID));
        Serial.println("Owner: " + ownerID);
        Serial.println("WiFi SSID: " + currentSSID);
        Serial.println("IP: " + WiFi.localIP().toString());
        Serial.println("RSSI: " + String(WiFi.RSSI()));
        break;

      case 's':
        readSensors();
        break;

      case 't':
        sendToFirebase();
        break;

      case 'd':
        Serial.println("📴 Forgetting WiFi & entering config mode...");
        preferences.clear();
        wifiManager.resetSettings();
        WiFi.disconnect(true, true);
        delay(2000);
        ESP.restart();
        break;
    }
  }
}

/*
 * SmartFarm IoT - ESP32 Code (Updated for Latest Libraries)
 * 
 * Fitur Lengkap:
 * ✅ Auto provisioning via WiFiManager + Firebase
 * ✅ DHT22 (Temp & Humidity)
 * ✅ BH1750 (Light Intensity)
 * ✅ Soil Sensor (Moisture)
 * ✅ Pump Auto Control (threshold-based)
 * ✅ Pump Manual Control (from web)
 * ✅ Settings loader from Firebase
 * ✅ Activity logging
 * ✅ Serial commands for debugging
 */

#include <WiFi.h>
#include <WiFiManager.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <BH1750.h>
#include <DHT.h>

// ═══════════════════════════════════════
// DEVICE CONFIGURATION
// ═══════════════════════════════════════
#define DEVICE_ID "SF8266-0001"

// Firebase Config
#define FIREBASE_HOST "greenuity-id-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH "e96B1cvAmCpZVwJ6dx64eZAu3t89rNRH5O2jmuil"

// Pin Configuration
#define SOIL_SENSOR_PIN 34
#define RELAY_PIN 5
#define DHT_PIN 4
#define DHT_TYPE DHT22

// Kalibrasi Soil Sensor
const int SOIL_WET = 1000;
const int SOIL_DRY = 3200;

// Timing
const long SEND_INTERVAL = 10000;  // 10 detik
const long CHECK_INTERVAL = 5000;  // 5 detik untuk cek pompa

// ═══════════════════════════════════════
// GLOBAL OBJECTS & VARIABLES
// ═══════════════════════════════════════
FirebaseData fbdo;
FirebaseData configStream;
FirebaseData pumpStream;
FirebaseAuth auth;
FirebaseConfig config;

Preferences preferences;
WiFiManager wifiManager;
BH1750 lightMeter;
DHT dht(DHT_PIN, DHT_TYPE);

// Sensor Data
int soilMoisture = 0;
int soilRaw = 0;
float suhu = 0;
float kelembapanUdara = 0;
float intensitasCahaya = 0;

// Device Status
bool isProvisioned = false;
bool isConnected = false;
String currentSSID = "";
String ownerID = "";

// Pump Control
bool pompaMenyala = false;
bool modeOtomatis = true;
int thresholdMin = 35;
int thresholdMax = 75;
int durasiPompa = 200;
unsigned long pompStartTime = 0;

// Timing Variables
unsigned long lastSendTime = 0;
unsigned long lastCheckTime = 0;

// ═══════════════════════════════════════
// SETUP
// ═══════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(1000);

  printHeader();

  // Pin Setup
  pinMode(SOIL_SENSOR_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);  // Pompa OFF saat boot

  // Sensor Setup
  Wire.begin(21, 22);
  lightMeter.begin();
  dht.begin();

  // Load Preferences
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

  // Connect WiFi
  WiFi.mode(WIFI_STA);
  setupWiFi();

  // Setup Firebase
  setupFirebase();

  // 🔍 Tambahkan di sini (langkah penting)
  checkProvisionStatus();

  // Register atau Load Config
  if (!isProvisioned) {
    registerUnclaimedDevice();
    Serial.println("⏳ Menunggu konfigurasi dari user...");
  } else {
    Serial.println("✅ Device sudah di-provision sebelumnya!");
    loadSettings();
  }

  // Setup Listeners
  setupConfigListener();

  if (isProvisioned) {
    setupPumpListener();
  }

  Serial.println("\n✅ Setup Complete!\n");
}


// ═══════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════
void loop() {
  // Check WiFi Connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi terputus! Reconnecting...");
    isConnected = false;
    WiFi.reconnect();
    delay(5000);
    return;
  } else if (!isConnected) {
    Serial.println("✅ WiFi reconnected!");
    isConnected = true;
  }

  if (!Firebase.ready()) {
    Serial.println("♻️ Reinitializing Firebase...");
    setupFirebase();
    if (isProvisioned) setupPumpListener();
  }

  // Read Sensors
  readSensors();

  // Auto Irrigation Check (every 5 seconds)
  if (isProvisioned && millis() - lastCheckTime >= CHECK_INTERVAL) {
    checkAutoIrrigation();
    checkPumpTimer();
    lastCheckTime = millis();
  }

  // Kirim data ke Firebase tiap 10 detik
  if (millis() - lastSendTime >= SEND_INTERVAL) {
    Serial.println("📤 Sending data to Firebase...");
    sendToFirebase();
    lastSendTime = millis();
  }

  // Check Serial Commands
  checkSerialCommands();

  delay(500);
  yield();
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

  // Konfigurasi koneksi database
  config.database_url = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;  // pakai secret key dari RTDB
  config.timeout.serverResponse = 10 * 1000;

  // Aktifkan koneksi ulang otomatis
  Firebase.reconnectWiFi(true);

  // Inisialisasi Firebase
  Firebase.begin(&config, &auth);

  // Set buffer response (biar gak error kecil)
  fbdo.setResponseSize(4096);

  // Cek koneksi Firebase
  if (Firebase.ready()) {
    Serial.println("✅ Firebase initialized!\n");
  } else {
    Serial.println("❌ Firebase init failed!");
    Serial.println(config.signer.tokens.status);
  }
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

  if (Firebase.RTDB.updateNode(&fbdo, path.c_str(), &json)) {
    Serial.println("✅ Device registered!");
  } else {
    Serial.println("❌ Failed to register!");
    Serial.println("   Error: " + fbdo.errorReason());
  }
}

// ═══════════════════════════════════════
// CONFIG LISTENER
// ═══════════════════════════════════════
void setupConfigListener() {
  String path = "/pending_config/" + String(DEVICE_ID);
  Serial.println("👂 Listening for config changes...");

  if (!Firebase.RTDB.beginStream(&configStream, path.c_str())) {
    Serial.println("❌ Failed to start config stream!");
    return;
  }

  Firebase.RTDB.setStreamCallback(&configStream, onConfigChange, onStreamTimeout);
  Serial.println("✅ Config listener active!");
}

void onConfigChange(FirebaseStream data) {
  if (data.dataType() == "json") {
    FirebaseJson json;
    json.setJsonData(data.jsonString());

    FirebaseJsonData result;
    String newSSID = "", newPassword = "", newOwnerID = "", status = "";

    if (json.get(result, "wifi_ssid")) newSSID = result.to<String>();
    if (json.get(result, "wifi_password")) newPassword = result.to<String>();
    if (json.get(result, "owner_id")) newOwnerID = result.to<String>();
    if (json.get(result, "status")) status = result.to<String>();

    if (status == "pending" && newSSID.length() > 0) {
      Serial.println("\n🎯 New config received!");
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
// APPLY NEW CONFIG
// ═══════════════════════════════════════
void applyNewConfig(String ssid, String password, String owner) {
  Serial.println("🔧 Applying new configuration...");

  String configPath = "/pending_config/" + String(DEVICE_ID) + "/status";
  Firebase.RTDB.setString(&fbdo, configPath.c_str(), "applying");

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
    Serial.println("\n✅ Connected to new WiFi!");
    Firebase.RTDB.setString(&fbdo, configPath.c_str(), "connected");
    claimDevice(owner);
    isProvisioned = true;
    currentSSID = ssid;
    ownerID = owner;

    // Load settings after provisioning
    loadSettings();
    setupPumpListener();

    Serial.println("🎉 Provisioning Complete!");
  } else {
    Serial.println("\n❌ Failed to connect!");
    Firebase.RTDB.setString(&fbdo, configPath.c_str(), "connection_failed");
    delay(5000);
    ESP.restart();
  }
}

void claimDevice(String owner) {
  Serial.println("📝 Claiming device...");

  String devicePath = "/devices/" + String(DEVICE_ID) + "/info";
  FirebaseJson json;
  json.set("owner_id", owner);
  json.set("device_id", DEVICE_ID);
  json.set("status", "online");
  json.set("wifi_ssid", WiFi.SSID());
  json.set("ip_address", WiFi.localIP().toString());
  json.set("rssi", WiFi.RSSI());
  json.set("claimed_at/.sv", "timestamp");

  if (Firebase.RTDB.updateNode(&fbdo, devicePath.c_str(), &json)) {
    Firebase.RTDB.deleteNode(&fbdo, ("/unclaimed_devices/" + String(DEVICE_ID)).c_str());
    Firebase.RTDB.deleteNode(&fbdo, ("/pending_config/" + String(DEVICE_ID)).c_str());
    Serial.println("✅ Device claimed successfully!");
  }
}

void checkProvisionStatus() {
  String devicePath = "/devices/" + String(DEVICE_ID) + "/info";

  Serial.println("🔍 Checking provisioning status...");

  if (Firebase.RTDB.pathExisted(&fbdo, devicePath.c_str())) {
    Serial.println("✅ Device sudah terdaftar di /devices!");
    isProvisioned = true;
  } else {
    Serial.println("⚠️ Device belum terdaftar di /devices, masih unclaimed.");
    isProvisioned = false;
  }
}

// ═══════════════════════════════════════
// LOAD SETTINGS FROM FIREBASE
// ═══════════════════════════════════════
void loadSettings() {
  Serial.println("⚙️ Loading settings from Firebase...");

  String settingsPath = "/devices/" + String(DEVICE_ID) + "/settings";

  if (Firebase.RTDB.getJSON(&fbdo, settingsPath.c_str())) {
    FirebaseJson json;
    json.setJsonData(fbdo.payload());

    FirebaseJsonData result;

    if (json.get(result, "threshold_min")) {
      thresholdMin = result.to<int>();
    }
    if (json.get(result, "threshold_max")) {
      thresholdMax = result.to<int>();
    }
    if (json.get(result, "mode_otomatis")) {
      modeOtomatis = result.to<bool>();
    }
    if (json.get(result, "durasi_pompa")) {
      durasiPompa = result.to<int>();
    }

    Serial.println("✅ Settings loaded!");
    Serial.println("   Threshold: " + String(thresholdMin) + "% - " + String(thresholdMax) + "%");
    Serial.println("   Mode Auto: " + String(modeOtomatis ? "ON" : "OFF"));
    Serial.println("   Durasi Pompa: " + String(durasiPompa) + "s");
  } else {
    Serial.println("⚠️ Failed to load settings, using defaults");
  }
}

// ═══════════════════════════════════════
// PUMP LISTENER (Manual Control from Web)
// ═══════════════════════════════════════
void setupPumpListener() {
  String path = "/devices/" + String(DEVICE_ID) + "/control/pump_command";
  Serial.println("👂 Listening for pump control...");

  if (!Firebase.RTDB.beginStream(&pumpStream, path.c_str())) {
    Serial.println("❌ Failed to start pump listener!");
    return;
  }

  Firebase.RTDB.setStreamCallback(&pumpStream, onPumpControl, onStreamTimeout);
  Serial.println("✅ Pump listener active!");
}

void onPumpControl(FirebaseStream data) {
  if (data.dataType() == "string") {
    String command = data.to<String>();
    Serial.println("🎮 Manual command received: " + command);

    if (command == "ON") {
      turnPumpOn("manual");
    } else if (command == "OFF") {
      turnPumpOff("manual");
    }

    Firebase.RTDB.deleteNode(&fbdo, ("/devices/" + String(DEVICE_ID) + "/control/pump_command").c_str());
  }
}

// ═══════════════════════════════════════
// PUMP CONTROL FUNCTIONS
// ═══════════════════════════════════════
void turnPumpOn(String trigger) {
  if (pompaMenyala) {
    Serial.println("⚠️ Pompa sudah menyala!");
    return;
  }

  digitalWrite(RELAY_PIN, HIGH);
  pompaMenyala = true;
  pompStartTime = millis();

  Serial.println("💧 POMPA ON (" + trigger + ") - Soil: " + String(soilMoisture) + "%");

  // Update Firebase
  Firebase.RTDB.setString(&fbdo, ("/devices/" + String(DEVICE_ID) + "/current/status_pompa").c_str(), "ON");

  // Log activity
  logPumpActivity("pump_on", trigger);
}

void turnPumpOff(String trigger) {
  if (!pompaMenyala) {
    Serial.println("⚠️ Pompa sudah mati!");
    return;
  }

  digitalWrite(RELAY_PIN, LOW);
  pompaMenyala = false;

  unsigned long duration = (millis() - pompStartTime) / 1000;  // in seconds
  Serial.println("🛑 POMPA OFF (" + trigger + ") - Duration: " + String(duration) + "s");

  // Update Firebase
  Firebase.RTDB.setString(&fbdo, ("/devices/" + String(DEVICE_ID) + "/current/status_pompa").c_str(), "OFF");

  // Log activity
  logPumpActivity("pump_off", trigger);
}

void logPumpActivity(String action, String trigger) {
  String logPath = "/devices/" + String(DEVICE_ID) + "/logs";
  FirebaseJson logJson;

  logJson.set("action", action);
  logJson.set("trigger", trigger);
  logJson.set("soil_moisture", soilMoisture);
  logJson.set("timestamp/.sv", "timestamp");

  if (pompaMenyala && action == "pump_off") {
    unsigned long duration = (millis() - pompStartTime) / 1000;
    logJson.set("duration", (int)duration);
  }

  Firebase.RTDB.pushJSON(&fbdo, logPath.c_str(), &logJson);
}

// ═══════════════════════════════════════
// AUTO IRRIGATION
// ═══════════════════════════════════════
void checkAutoIrrigation() {
  if (!modeOtomatis || !isProvisioned) return;

  // Turn ON if soil is dry
  if (soilMoisture < thresholdMin && !pompaMenyala) {
    turnPumpOn("auto");
  }

  // Turn OFF if soil is wet enough
  else if (soilMoisture > thresholdMax && pompaMenyala) {
    turnPumpOff("auto");
  }
}

// Check pump timer (auto-off after duration)
void checkPumpTimer() {
  if (!pompaMenyala) return;

  unsigned long elapsedTime = (millis() - pompStartTime) / 1000;

  if (elapsedTime >= durasiPompa) {
    Serial.println("⏰ Pump timer reached: " + String(durasiPompa) + "s");
    turnPumpOff("timer");
  }
}

// ═══════════════════════════════════════
// SENSOR READING
// ═══════════════════════════════════════
void readSensors() {
  // Baca kelembapan tanah
  soilRaw = analogRead(SOIL_SENSOR_PIN);
  soilMoisture = map(soilRaw, 4095, 1500, 0, 100);
  soilMoisture = constrain(soilMoisture, 0, 100);

  // Baca suhu dan kelembapan udara
  suhu = dht.readTemperature();
  kelembapanUdara = dht.readHumidity();

  if (isnan(suhu) || isnan(kelembapanUdara)) {
    suhu = 0;
    kelembapanUdara = 0;
  }

  // Baca intensitas cahaya
  intensitasCahaya = lightMeter.readLightLevel();
  if (intensitasCahaya < 0) intensitasCahaya = 0;

  // Debug monitor
  Serial.printf("📊 Soil: %d%% | Suhu: %.1f°C | RH: %.1f%% | Light: %.0f lx | Pompa: %s\n",
                soilMoisture, suhu, kelembapanUdara, intensitasCahaya,
                pompaMenyala ? "ON" : "OFF");
}

// ═══════════════════════════════════════
// SEND DATA TO FIREBASE
// ═══════════════════════════════════════
void sendToFirebase() {
  Serial.println("🚀 sendToFirebase dipanggil...");

  if (!isProvisioned) {
    Serial.println("⚠️ Device belum di-provision, kirim dibatalkan.");
    return;
  }

  if (!Firebase.ready()) {
    Serial.println("⚠️ Firebase belum siap, skip pengiriman.");
    return;
  }

  String path = "/devices/" + String(DEVICE_ID) + "/current";
  FirebaseJson json;

  json.set("kelembapan_tanah", soilMoisture);
  json.set("raw_value", soilRaw);
  json.set("suhu", suhu);
  json.set("kelembapan_udara", kelembapanUdara);
  json.set("intensitas_cahaya", intensitasCahaya);
  json.set("status_pompa", pompaMenyala ? "ON" : "OFF");
  json.set("timestamp/.sv", "timestamp");

  Serial.println("📡 Mengirim data ke Firebase...");

  // Proses update data
  if (Firebase.RTDB.updateNode(&fbdo, path.c_str(), &json)) {
    Serial.println("✅ Data sent to Firebase!");
  } else {
    Serial.println("❌ Failed to send data!");
    Serial.print("🧩 Error: ");
    Serial.println(fbdo.errorReason());
  }

  // Update info device
  if (Firebase.ready()) {
    Firebase.RTDB.setString(&fbdo, ("/devices/" + String(DEVICE_ID) + "/info/status").c_str(), "online");
    Firebase.RTDB.setInt(&fbdo, ("/devices/" + String(DEVICE_ID) + "/info/rssi").c_str(), WiFi.RSSI());
    Firebase.RTDB.setString(&fbdo, ("/devices/" + String(DEVICE_ID) + "/info/ip_address").c_str(), WiFi.localIP().toString());
  }
}



// ═══════════════════════════════════════
// SERIAL COMMANDS
// ═══════════════════════════════════════
void checkSerialCommands() {
  if (!Serial.available()) return;

  char cmd = Serial.read();

  switch (cmd) {
    case 'r':  // Reset device
      Serial.println("🔄 Resetting device...");
      preferences.clear();
      wifiManager.resetSettings();
      ESP.restart();
      break;

    case 'i':  // Device info
      printDeviceInfo();
      break;

    case 's':  // Read sensors
      readSensors();
      break;

    case 't':  // Test send
      sendToFirebase();
      break;

    case 'p':  // Toggle pump manually
      if (pompaMenyala) {
        turnPumpOff("manual_serial");
      } else {
        turnPumpOn("manual_serial");
      }
      break;

    case 'd':  // Disconnect WiFi
      Serial.println("📴 Forgetting WiFi & restarting...");
      preferences.clear();
      preferences.end();
      wifiManager.resetSettings();
      WiFi.disconnect(true, true);
      delay(2000);
      ESP.restart();
      break;

    case 'l':  // Reload settings
      loadSettings();
      break;

    case 'h':  // Help
      printHelp();
      break;

    case 'c':  // Calibrate soil sensor
      Serial.println("🌱 Kalibrasi Soil Sensor");
      Serial.println("1️⃣ Basahi sensor di tanah lembab, lalu ketik 'w' dan tekan Enter...");
      while (Serial.read() != 'w') delay(100);
      Serial.println("   Nilai basah (wet): " + String(analogRead(SOIL_SENSOR_PIN)));

      Serial.println("2️⃣ Sekarang keringkan sensor (biarkan di udara), lalu ketik 'd' dan tekan Enter...");
      while (Serial.read() != 'd') delay(100);
      Serial.println("   Nilai kering (dry): " + String(analogRead(SOIL_SENSOR_PIN)));

      Serial.println("✅ Catat dua nilai itu dan masukkan ke dalam variabel SOIL_WET dan SOIL_DRY di atas kode!");
      break;
  }
}

// ═══════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════
void printHeader() {
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║   SmartFarm IoT - Cloud Ready        ║");
  Serial.println("║   Device: " + String(DEVICE_ID) + "           ║");
  Serial.println("║   Firmware: v2.1 (Updated)           ║");
  Serial.println("╚══════════════════════════════════════╝\n");
}

void printDeviceInfo() {
  Serial.println("\n═══════ DEVICE INFO ═══════");
  Serial.println("Device ID: " + String(DEVICE_ID));
  Serial.println("Owner ID: " + ownerID);
  Serial.println("Provisioned: " + String(isProvisioned ? "YES" : "NO"));
  Serial.println("WiFi SSID: " + currentSSID);
  Serial.println("IP Address: " + WiFi.localIP().toString());
  Serial.println("RSSI: " + String(WiFi.RSSI()) + " dBm");
  Serial.println("Pump Status: " + String(pompaMenyala ? "ON" : "OFF"));
  Serial.println("Auto Mode: " + String(modeOtomatis ? "ON" : "OFF"));
  Serial.println("Threshold: " + String(thresholdMin) + "% - " + String(thresholdMax) + "%");
  Serial.println("═══════════════════════════\n");
}

void printHelp() {
  Serial.println("\n═══════ SERIAL COMMANDS ═══════");
  Serial.println("r - Reset device (clear all settings)");
  Serial.println("i - Show device info");
  Serial.println("s - Read sensors manually");
  Serial.println("t - Test send data to Firebase");
  Serial.println("p - Toggle pump ON/OFF");
  Serial.println("d - Disconnect WiFi & restart");
  Serial.println("l - Reload settings from Firebase");
  Serial.println("c - Calibrate soil sensor");
  Serial.println("h - Show this help");
  Serial.println("═══════════════════════════════\n");
}
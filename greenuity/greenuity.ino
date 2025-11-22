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
#define DEVICE_ID "Greenuity-001"

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
const long SEND_INTERVAL = 15000;  // 15 detik
const long CHECK_INTERVAL = 5000;  // 5 detik untuk cek pompa

// ═══════════════════════════════════════
// GLOBAL OBJECTS & VARIABLES
// ═══════════════════════════════════════
FirebaseData fbdo;
FirebaseData configStream;
FirebaseData pumpStream;
FirebaseAuth auth;
FirebaseConfig config;
FirebaseData streamPumpCommand;
FirebaseData streamMode;
FirebaseData streamManual;

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

// control pompa lewat web
String controlMode = "sensor";
String controlManual = "OFF";


// Timing Variables
unsigned long lastSendTime = 0;
unsigned long lastCheckTime = 0;

// Jadwal penyiraman dari Firebase
struct ScheduleItem {
  int hour;
  int minute;
  int duration;
};
std::vector<ScheduleItem> schedules;

bool hasRunThisMinute = false;



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

  configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");

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
    loadSchedule();  // 🔥 STEP 4 — LOAD JADWAL DI SINI
  }


  // Setup Listeners
  setupConfigListener();

  if (isProvisioned) {
    setupPumpListener();
  }

  setupControlListener();

  Serial.println("\n✅ Setup Complete!\n");
}


// ═══════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════

void loop() {
  // 🔹 1) Cek koneksi WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi terputus! Menandai status offline di Firebase...");

    // Coba update status offline jika Firebase masih ready (kadang belum karena koneksi putus)
    if (Firebase.ready()) {
      if (Firebase.RTDB.setString(
            &fbdo,
            ("/devices/" + String(DEVICE_ID) + "/info/status").c_str(),
            "offline")) {
        Serial.println("   ✔️ Status set to OFFLINE in Firebase");
      } else {
        Serial.println("   ❌ Gagal set OFFLINE: " + fbdo.errorReason());
      }
      // Simpan last_seen (opsional)
      Firebase.RTDB.setInt(
        &fbdo,
        ("/devices/" + String(DEVICE_ID) + "/info/last_seen").c_str(),
        millis());
    } else {
      Serial.println("   ℹ️ Firebase not ready — skip writing OFFLINE (will rely on last_seen heartbeat)");
    }

    // Tandai koneksi terputus & coba reconnect WiFi
    isConnected = false;
    Serial.println("🔄 Mencoba reconnect WiFi...");
    WiFi.reconnect();
    delay(5000);
    return;
  }
  // Jika wifi connected tapi sebelumnya isConnected==false -> reconnect event
  else if (!isConnected) {
    Serial.println("✅ WiFi reconnected!");
    isConnected = true;

    // set ONLINE only jika Firebase siap
    if (Firebase.ready()) {
      if (Firebase.RTDB.setString(
            &fbdo,
            ("/devices/" + String(DEVICE_ID) + "/info/status").c_str(),
            "online")) {
        Serial.println("   ✔️ Status set to ONLINE in Firebase");
      } else {
        Serial.println("   ❌ Gagal set ONLINE: " + fbdo.errorReason());
      }
      Firebase.RTDB.setInt(
        &fbdo,
        ("/devices/" + String(DEVICE_ID) + "/info/last_seen").c_str(),
        millis());
    } else {
      Serial.println("   ℹ️ Firebase not ready right after reconnect. setupFirebase() will run next.");
    }
  }

  // 🔹 2) Pastikan Firebase siap (jika tidak, coba re-init)
  if (!Firebase.ready()) {
    Serial.println("♻️ Firebase not ready, reinitializing...");
    setupFirebase();
    if (isProvisioned) setupPumpListener();
    delay(1000);  // waktu singkat agar koneksi stabil
  }

  // 🔹 3) Baca sensor
  readSensors();

  // 🔹 4) Auto-irigasi & schedule tiap CHECK_INTERVAL
  if (isProvisioned && millis() - lastCheckTime >= CHECK_INTERVAL) {

    checkSchedule();        // 🔥 NEW — CEK JADWAL
    checkAutoIrrigation();  // Auto berdasarkan sensor tanah
    checkPumpTimer();       // Timer auto-off sesuai durasi

    lastCheckTime = millis();
  }

  // 🔹 5) Kirim data ke Firebase tiap SEND_INTERVAL
  if (millis() - lastSendTime >= SEND_INTERVAL) {
    Serial.println("📤 Sending data to Firebase...");
    sendToFirebase();  // di dalam sendToFirebase() sudah mengupdate last_seen & status=online
    lastSendTime = millis();
  }

  // 🔹 6) Cek perintah serial
  checkSerialCommands();

  delay(500);
  yield();  // biar WiFi internal tetap jalan
}


// ═══════════════════════════════════════
// WIFI SETUP
// ═══════════════════════════════════════

void setupWiFi() {
  Serial.println("📡 Setting up WiFi...");
  WiFi.setHostname(DEVICE_ID);

  String apName = "SmartFarm-" + String(DEVICE_ID);
  String apPassword = "greenuity123";

  wifiManager.setAPCallback([](WiFiManager *myWiFiManager) {
    Serial.println("\n╔══════════════════════════════════════╗");
    Serial.println("║     MODE KONFIGURASI AKTIF           ║");
    Serial.println("╚══════════════════════════════════════╝");
    Serial.println("📱 Sambungkan HP ke:");
    Serial.println("   SSID: " + String(myWiFiManager->getConfigPortalSSID()));
    Serial.println("   Password: greenuity123");
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

  // 🔧 Konfigurasi Firebase
  config.database_url = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;  // pakai secret key RTDB
  config.timeout.serverResponse = 20 * 1000;          // timeout 20 detik
  Firebase.reconnectWiFi(true);

  // 🚀 Inisialisasi Firebase
  Firebase.begin(&config, &auth);
  fbdo.setResponseSize(4096);  // buffer besar biar gak error JSON

  // 📂 Path data
  String statusPath = "/devices/" + String(DEVICE_ID) + "/info/status";
  String lastSeenPath = "/devices/" + String(DEVICE_ID) + "/info/last_seen";

  if (Firebase.ready()) {
    Serial.println("✅ Firebase initialized!");

    // ✅ 1. Tandai status awal ONLINE
    if (Firebase.RTDB.setString(&fbdo, statusPath.c_str(), "online")) {
      Serial.println("📡 Device status set to ONLINE!");
    } else {
      Serial.println("⚠️ Gagal set status online:");
      Serial.println(fbdo.errorReason());
    }

    // ✅ 2. Simpan timestamp server (waktu aktif terakhir)
    FirebaseJson ts;
    ts.set(".sv", "timestamp");
    if (Firebase.RTDB.setJSON(&fbdo, lastSeenPath.c_str(), &ts)) {
      Serial.println("🕒 Last seen updated (server time).");
    } else {
      Serial.println("⚠️ Gagal update timestamp:");
      Serial.println(fbdo.errorReason());
    }

    // 3. onDisconnect feature removed in latest Firebase library
    Serial.println("ℹ️ onDisconnect() not supported in current Firebase library, skipping...");



    Serial.println("✨ Firebase connection ready!\n");
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

void loadSchedule() {
  Serial.println("📅 Loading schedule...");

  String path = "/devices/" + String(DEVICE_ID) + "/control/schedule/times";

  if (!Firebase.RTDB.getJSON(&fbdo, path)) {
    Serial.println("⚠️ No schedule found or failed to load.");
    return;
  }

  FirebaseJson json;
  json.setJsonData(fbdo.payload());

  schedules.clear();

  size_t count = json.iteratorBegin();
  FirebaseJson::IteratorValue item;

  for (size_t i = 0; i < count; i++) {
    item = json.valueAt(i);

    FirebaseJson sub;
    sub.setJsonData(item.value);

    FirebaseJsonData rHour, rMinute, rDuration;

    if (sub.get(rHour, "hour") && sub.get(rMinute, "minute") && sub.get(rDuration, "duration")) {
      ScheduleItem s;
      s.hour = rHour.to<int>();
      s.minute = rMinute.to<int>();
      s.duration = rDuration.to<int>();
      schedules.push_back(s);

      Serial.printf("🕒 Added schedule → %02d:%02d - %ds\n",
                    s.hour, s.minute, s.duration);
    }
  }

  json.iteratorEnd();
  Serial.printf("📌 Total schedules loaded: %d\n", schedules.size());
}


// ═══════════════════════════════════════
// PUMP LISTENER (Manual Control from Web)
// ═══════════════════════════════════════

void setupPumpListener() {
  String path = "/devices/" + String(DEVICE_ID) + "/control/pump_command";

  Serial.println("👂 Listening pump_command...");

  if (!Firebase.RTDB.beginStream(&streamPumpCommand, path.c_str())) {
    Serial.println("❌ Failed pump_command listener!");
    return;
  }

  Firebase.RTDB.setStreamCallback(&streamPumpCommand, onPumpControl, onStreamTimeout);
}


void setupControlListener() {
  String modePath = "/devices/" + String(DEVICE_ID) + "/control/mode";
  String manualPath = "/devices/" + String(DEVICE_ID) + "/control/manual";

  // MODE LISTENER
  if (Firebase.RTDB.beginStream(&streamMode, modePath.c_str())) {
    Firebase.RTDB.setStreamCallback(&streamMode, onModeChange, onStreamTimeout);
    Serial.println("👂 Listening mode...");
  } else {
    Serial.println("❌ Failed mode listener");
  }

  // MANUAL LISTENER
  if (Firebase.RTDB.beginStream(&streamManual, manualPath.c_str())) {
    Firebase.RTDB.setStreamCallback(&streamManual, onManualChange, onStreamTimeout);
    Serial.println("👂 Listening manual...");
  } else {
    Serial.println("❌ Failed manual listener");
  }
}


void onModeChange(FirebaseStream data) {
  if (data.dataType() == "string") {
    controlMode = data.to<String>();
    Serial.println("🎛 Mode changed to: " + controlMode);
  }
}

void onManualChange(FirebaseStream data) {
  if (data.dataType() == "string") {
    controlManual = data.to<String>();
    Serial.println("🖐 Manual pump command: " + controlManual);

    if (controlMode == "manual") {
      if (controlManual == "ON") turnPumpOn("manual");
      else turnPumpOff("manual");
    }
  }
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
  // 🔥 Jangan auto kalau mode manual
  if (controlMode == "manual") return;

  if (!modeOtomatis || !isProvisioned) return;

  if (soilMoisture < thresholdMin && !pompaMenyala) {
    turnPumpOn("auto");
  } else if (soilMoisture > thresholdMax && pompaMenyala) {
    turnPumpOff("auto");
  }
}

void checkSchedule() {
  if (controlMode == "manual") return;  // Manual block schedule

  if (!isProvisioned || schedules.empty()) return;

  // Ambil waktu sekarang
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return;

  int hour = timeinfo.tm_hour;
  int minute = timeinfo.tm_min;

  // Cegah double-trigger
  if (hasRunThisMinute) {
    if (timeinfo.tm_sec == 0) hasRunThisMinute = false;
    return;
  }

  // Cek setiap jadwal
  for (auto &s : schedules) {
    if (s.hour == hour && s.minute == minute) {
      Serial.printf("🚿 Running schedule: %02d:%02d for %ds\n",
                    s.hour, s.minute, s.duration);

      turnPumpOn("schedule");
      durasiPompa = s.duration;

      hasRunThisMinute = true;
      return;
    }
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

  // 🔸 Cegah pengiriman jika device belum di-provision
  if (!isProvisioned) {
    Serial.println("⚠️ Device belum di-provision, kirim dibatalkan.");
    return;
  }

  // 🔸 Pastikan Firebase siap
  if (!Firebase.ready()) {
    Serial.println("⚠️ Firebase belum siap, skip pengiriman.");
    return;
  }

  // 🔸 Path utama untuk data sensor
  String path = "/devices/" + String(DEVICE_ID) + "/current";
  FirebaseJson json;

  json.set("kelembapan_tanah", soilMoisture);
  json.set("raw_value", soilRaw);
  json.set("suhu", suhu);
  json.set("kelembapan_udara", kelembapanUdara);
  json.set("intensitas_cahaya", intensitasCahaya);
  json.set("status_pompa", pompaMenyala ? "ON" : "OFF");

  // Gunakan timestamp dari server Firebase, bukan dari board
  json.set("timestamp/.sv", "timestamp");

  Serial.println("📡 Mengirim data sensor ke Firebase...");

  // 🔹 Proses kirim data sensor
  if (Firebase.RTDB.updateNode(&fbdo, path.c_str(), &json)) {
    Serial.println("✅ Data sent to Firebase!");

    // ✅ Update last_seen dengan timestamp server
    String lastSeenPath = "/devices/" + String(DEVICE_ID) + "/info/last_seen";
    FirebaseJson ts;
    ts.set(".sv", "timestamp");

    if (Firebase.RTDB.setJSON(&fbdo, lastSeenPath.c_str(), &ts)) {
      Serial.println("🕒 last_seen diperbarui (server timestamp).");
    } else {
      Serial.println("⚠️ Gagal update last_seen:");
      Serial.println(fbdo.errorReason());
    }
  } else {
    Serial.println("❌ Failed to send data!");
    Serial.print("🧩 Error: ");
    Serial.println(fbdo.errorReason());

    // Jika gagal kirim data sensor, jangan lanjut
    return;
  }

  // 🔹 Update status perangkat (status online + info jaringan)
  if (Firebase.ready()) {
    FirebaseJson infoJson;
    infoJson.set("status", "online");
    infoJson.set("rssi", WiFi.RSSI());
    infoJson.set("ip_address", WiFi.localIP().toString());
    infoJson.set("last_seen/.sv", "timestamp");  // server timestamp

    String infoPath = "/devices/" + String(DEVICE_ID) + "/info";
    if (Firebase.RTDB.updateNode(&fbdo, infoPath.c_str(), &infoJson)) {
      Serial.println("📡 Device info updated (status + last_seen).");
    } else {
      Serial.println("⚠️ Gagal update info: " + fbdo.errorReason());
    }
  }

  // 🔹 Debug tambahan untuk verifikasi data sensor
  Serial.printf(
    "📊 [DEBUG] Suhu: %.1f°C | Kelembapan Udara: %.1f%% | Tanah: %d%% | Cahaya: %.0f lx | Pompa: %s\n",
    suhu, kelembapanUdara, soilMoisture, intensitasCahaya,
    pompaMenyala ? "ON" : "OFF");
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
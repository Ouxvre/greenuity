/*
  SmartFarm IoT - ESP32 Firmware v2.3 (no mode toggle)
  - Cleaned, removed mode/manual logic
  - Manual override supported via pump_command
  - Stable control listener + schedule + sensor auto
*/

#include <Arduino.h>
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
#include <vector>
#include <algorithm>

// ---------------- DEVICE CONFIG ----------------
#define DEVICE_ID "Greenuity-001"
#define FIREBASE_HOST "greenuity-id-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH "e96B1cvAmCpZVwJ6dx64eZAu3t89rNRH5O2jmuil"

#define SOIL_SENSOR_PIN 34
#define RELAY_PIN 5
#define DHT_PIN 4
#define DHT_TYPE DHT22

// Soil calibration - gunakan nilai nyata hasil kalibrasi
constexpr int SOIL_WET = 1000;
constexpr int SOIL_DRY = 3200;

// Timings
constexpr unsigned long SEND_INTERVAL = 15000UL;  // 15s
constexpr unsigned long CHECK_INTERVAL = 5000UL;  // 5s

// ---------------- GLOBAL OBJECTS ----------------
FirebaseData fbdo;           // main write/read
FirebaseData streamConfig;   // listener for pending_config
FirebaseData streamControl;  // combined listener for control

FirebaseAuth auth;
FirebaseConfig config;

Preferences preferences;
WiFiManager wifiManager;
BH1750 lightMeter;
DHT dht(DHT_PIN, DHT_TYPE);

// Sensor & status
int soilMoisture = 0;
int soilRaw = 0;
float suhu = 0.0f;
float kelembapanUdara = 0.0f;
float intensitasCahaya = 0.0f;

bool isProvisioned = false;
bool isConnected = false;
String currentSSID = "";
String ownerID = "";

// Pump control state
bool pompaMenyala = false;
int thresholdMin = 35;
int thresholdMax = 75;
int durasiPompa = 200;  // default seconds
unsigned long pompStartTime = 0;

// Manual override flag (set when web manual command used)
bool manualOverride = false;

// schedule structure
struct ScheduleItem {
  int hour;
  int minute;
  int duration;
};
std::vector<ScheduleItem> schedules;

// timing variables
unsigned long lastSendTime = 0;
unsigned long lastCheckTime = 0;

// prevent double trigger for same minute
int lastCheckedMinute = -1;

// flags
bool debugVerbose = false;

bool configListenerActive = false;
bool controlListenerActive = false;

bool scheduleRunning = false;

unsigned long lastFirebaseInit = 0;

// forward declarations
void setupWiFi();
void setupFirebase();
void setupConfigListener();
void setupControlListener();
void loadSettings();
void loadSchedule();
void readSensors();
void sendToFirebase();
void checkAutoIrrigation();
void checkSchedule();
void checkPumpTimer();
void turnPumpOn(const String &trigger);
void turnPumpOff(const String &trigger);
void logPumpActivity(const String &action, const String &trigger);
void onConfigChange(FirebaseStream data);
void onControlChange(FirebaseStream data);
void onStreamTimeout(bool timeout);
void printHeader();
void printHelp();
void printDeviceInfo();
void checkSerialCommands();

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);
  delay(200);
  printHeader();

  pinMode(SOIL_SENSOR_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);  // off at boot

  Wire.begin(21, 22);
  lightMeter.begin();
  dht.begin();

  preferences.begin("smartfarm", false);
  isProvisioned = preferences.getBool("provisioned", false);

  if (isProvisioned) {
    currentSSID = preferences.getString("wifi_ssid", "");
    ownerID = preferences.getString("owner_id", "");
    Serial.println("✅ Provisioned (stored)");
    Serial.println("   Owner: " + ownerID);
    Serial.println("   SSID: " + currentSSID);
  } else {
    Serial.println("⚠ Device not provisioned");
  }

  WiFi.mode(WIFI_STA);
  setupWiFi();

  // NTP
  configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");

  setupFirebase();

  // check whether device registered
  {
    String devicePath = "/devices/" + String(DEVICE_ID) + "/info";
    if (Firebase.ready() && Firebase.RTDB.pathExisted(&fbdo, devicePath.c_str())) {
      Serial.println("🔍 Device already in /devices -> provisioned");
      isProvisioned = true;
      preferences.putBool("provisioned", true);
    } else {
      Serial.println("🔍 Device not registered in /devices");
      // keep isProvisioned as stored
    }
  }

  if (!isProvisioned) {
    // register unclaimed
    String path = "/unclaimed_devices/" + String(DEVICE_ID);
    FirebaseJson json;
    json.set("status", "ready_to_claim");
    json.set("first_boot/.sv", "timestamp");
    json.set("last_seen/.sv", "timestamp");
    json.set("wifi_ssid", WiFi.SSID());
    json.set("ip_address", WiFi.localIP().toString());
    json.set("rssi", WiFi.RSSI());
    if (Firebase.RTDB.updateNode(&fbdo, path.c_str(), &json)) {
      Serial.println("✅ Registered as unclaimed device");
    } else {
      Serial.println("⚠ Failed to register unclaimed: " + fbdo.errorReason());
    }
  } else {
    // Load settings and schedule if already provisioned
    loadSettings();
    loadSchedule();
  }

  // listeners
  setupConfigListener();   // pending_config listener
  setupControlListener();  // combined control listener

  Serial.println("\n✅ Setup complete v2.3 (no mode toggle)\n");
}

// ---------------- LOOP ----------------
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠ WiFi disconnected, trying reconnect...");
    isConnected = false;
    WiFi.reconnect();
    delay(3000);
    return;
  } else if (!isConnected) {
    isConnected = true;
    Serial.println("✅ WiFi connected: " + WiFi.SSID());
    // update online status in firebase if ready
    if (Firebase.ready()) {
      String statusPath = "/devices/" + String(DEVICE_ID) + "/info/status";
      Firebase.RTDB.setString(&fbdo, statusPath.c_str(), "online");
      String lastSeenPath = "/devices/" + String(DEVICE_ID) + "/info/last_seen";
      FirebaseJson ts;
      ts.set(".sv", "timestamp");
      Firebase.RTDB.setJSON(&fbdo, lastSeenPath.c_str(), &ts);
    }
  }

  // --- Prevent frequent Firebase re-init ---
  if (!Firebase.ready() && millis() - lastFirebaseInit > 10000UL) {
    Serial.println("♻ Firebase not ready, reinitializing...");
    setupFirebase();
    lastFirebaseInit = millis();
  }

  readSensors();

  if (millis() - lastCheckTime >= CHECK_INTERVAL) {
    checkSchedule();
    checkAutoIrrigation();
    if (!Firebase.ready() && pompaMenyala) {
      Serial.println("🚨 Firebase offline while pump ON → forcing pump OFF");
      turnPumpOff("failsafe");
    }
    checkPumpTimer();
    lastCheckTime = millis();
  }

  if (millis() - lastSendTime >= SEND_INTERVAL) {
    sendToFirebase();
    lastSendTime = millis();
  }

  checkSerialCommands();

  delay(200);
  yield();
}

// ---------------- WIFI ----------------
void setupWiFi() {
  Serial.println("📡 Setting up WiFi...");
  WiFi.setHostname(DEVICE_ID);

  String apName = "SmartFarm-" + String(DEVICE_ID);
  String apPassword = "greenuity123";

  wifiManager.setAPCallback([](WiFiManager *myWiFiManager) {
    Serial.println("\n╔══════════════════════════════════════╗");
    Serial.println("║         MODE KONFIGURASI AKTIF       ║");
    Serial.println("╚══════════════════════════════════════╝");
    Serial.println("📱 Sambungkan HP Anda ke hotspot:");
    Serial.println("   SSID     : " + String(myWiFiManager->getConfigPortalSSID()));
    Serial.println("   Password : greenuity123");
    Serial.println("🌐 Akses pengaturan di:");
    Serial.println("   http://192.168.4.1");
    Serial.println("════════════════════════════════════════");
  });

  wifiManager.setConfigPortalTimeout(300);  // 5 menit

  if (!wifiManager.autoConnect(apName.c_str(), apPassword.c_str())) {
    Serial.println("❌ Timeout konfigurasi! Restarting...");
    delay(3000);
    ESP.restart();
  }

  Serial.println("\n✅ WiFi Connected!");
  Serial.println("   SSID   : " + WiFi.SSID());
  Serial.println("   IP     : " + WiFi.localIP().toString());
  Serial.println("   Signal : " + String(WiFi.RSSI()) + " dBm\n");

  isConnected = true;
  currentSSID = WiFi.SSID();
}

// ---------------- FIREBASE ----------------
void setupFirebase() {
  Serial.println("🔥 Setup Firebase...");
  config.database_url = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  config.timeout.serverResponse = 20 * 1000;
  Firebase.reconnectWiFi(true);
  Firebase.begin(&config, &auth);
  fbdo.setResponseSize(8192);

  if (Firebase.ready()) {
    Serial.println("✅ Firebase initialized");
    String statusPath = "/devices/" + String(DEVICE_ID) + "/info/status";
    Firebase.RTDB.setString(&fbdo, statusPath.c_str(), "online");
    String lastSeenPath = "/devices/" + String(DEVICE_ID) + "/info/last_seen";
    FirebaseJson ts;
    ts.set(".sv", "timestamp");
    Firebase.RTDB.setJSON(&fbdo, lastSeenPath.c_str(), &ts);
  } else {
    Serial.println("❌ Firebase init failed: " + config.signer.tokens.status);
  }
}

// ---------------- CONFIG LISTENER ----------------
void setupConfigListener() {
  if (configListenerActive) return;
  configListenerActive = true;

  String path = "/pending_config/" + String(DEVICE_ID);
  Serial.println("👂 Starting pending_config listener...");

  if (Firebase.RTDB.beginStream(&streamConfig, path.c_str())) {
    Firebase.RTDB.setStreamCallback(&streamConfig, onConfigChange, onStreamTimeout);
    Serial.println("✅ pending_config listener active");
  } else {
    Serial.println("❌ Failed pending_config stream: " + streamConfig.errorReason());
  }
}

void onConfigChange(FirebaseStream data) {
  Serial.println("🔔 pending_config stream event");
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
      Serial.println("🎯 New config received -> apply");
      String configPath = "/pending_config/" + String(DEVICE_ID) + "/status";
      Firebase.RTDB.setString(&fbdo, configPath.c_str(), "applying");

      preferences.putString("wifi_ssid", newSSID);
      preferences.putString("wifi_password", newPassword);
      preferences.putString("owner_id", newOwnerID);
      preferences.putBool("provisioned", true);

      WiFi.disconnect();
      delay(500);
      WiFi.begin(newSSID.c_str(), newPassword.c_str());
      int attempts = 0;
      while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
      }
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✅ Connected to new WiFi");
        Firebase.RTDB.setString(&fbdo, configPath.c_str(), "connected");

        // claim device
        String devicePath = "/devices/" + String(DEVICE_ID) + "/info";
        FirebaseJson json2;
        json2.set("owner_id", newOwnerID);
        json2.set("device_id", DEVICE_ID);
        json2.set("status", "online");
        json2.set("wifi_ssid", WiFi.SSID());
        json2.set("ip_address", WiFi.localIP().toString());
        json2.set("rssi", WiFi.RSSI());
        json2.set("claimed_at/.sv", "timestamp");
        if (Firebase.RTDB.updateNode(&fbdo, devicePath.c_str(), &json2)) {
          Firebase.RTDB.deleteNode(&fbdo, ("/unclaimed_devices/" + String(DEVICE_ID)).c_str());
          Firebase.RTDB.deleteNode(&fbdo, ("/pending_config/" + String(DEVICE_ID)).c_str());
          Serial.println("✅ Device claimed");
        }
        isProvisioned = true;
        ownerID = newOwnerID;
        loadSettings();
        loadSchedule();
      } else {
        Serial.println("\n❌ Failed to join new WiFi -> restart");
        Firebase.RTDB.setString(&fbdo, configPath.c_str(), "connection_failed");
        delay(2000);
        ESP.restart();
      }
    }
  }
}

// ---------------- CONTROL LISTENER (combined) ----------------
void setupControlListener() {
  if (controlListenerActive) return;
  controlListenerActive = true;

  String path = "/devices/" + String(DEVICE_ID) + "/control";
  Serial.println("👂 Starting control listener...");

  if (Firebase.RTDB.beginStream(&streamControl, path.c_str())) {
    Firebase.RTDB.setStreamCallback(&streamControl, onControlChange, onStreamTimeout);
    Serial.println("✅ control listener active");
  } else {
    Serial.println("❌ Failed control stream: " + streamControl.errorReason());
  }
}

void onControlChange(FirebaseStream data) {
  Serial.println("🔔 control stream event -> path: " + data.dataPath());

  // ignore null event so pump doesn't turn off immediately
  if (data.dataType() == "null") {
    Serial.println("⚪ pump_command null ignored");
    return;
  }

  if (data.dataType() == "json") {
    String p = data.dataPath();
    if (p.indexOf("schedule") >= 0 || p == "/") {
      Serial.println("🔄 Schedule or control JSON changed -> reload schedule");
      loadSchedule();
    }
    return;
  }

  if (data.dataType() == "string") {
    String dpath = data.dataPath();
    String value = data.stringData();
    Serial.println("   string event: " + dpath + " = " + value);

    // only handle pump_command string events here
    if (dpath.endsWith("/pump_command") || dpath == "/pump_command") {
      Serial.println("🎮 pump_command: " + value);

      if (value == "ON") {
        // Manual override: set flag so auto won't immediately turn it off
        manualOverride = true;
        turnPumpOn("manual_command");
      } else if (value == "OFF") {
        turnPumpOff("manual_command");
        manualOverride = false;
      }

      // stabilizer: write back IDLE to avoid null event when client deletes node
      String cmdPath = "/devices/" + String(DEVICE_ID) + "/control/pump_command";
      Firebase.RTDB.setString(&fbdo, cmdPath.c_str(), "IDLE");

      return;  // handled
    }
  }

  Serial.println("ℹ Unhandled data type/path: " + data.dataType() + " -> " + data.dataPath());
}

void onStreamTimeout(bool timeout) {
  if (timeout) {
    Serial.println("⚠ Stream timeout detected, waiting for Firebase to recover...");
  }
}

// ---------------- LOADING SETTINGS ----------------
void loadSettings() {
  Serial.println("⚙ Loading settings...");
  String settingsPath = "/devices/" + String(DEVICE_ID) + "/settings";
  if (Firebase.RTDB.getJSON(&fbdo, settingsPath.c_str())) {
    FirebaseJson json;
    json.setJsonData(fbdo.payload());
    FirebaseJsonData r;
    if (json.get(r, "threshold_min")) thresholdMin = r.to<int>();
    if (json.get(r, "threshold_max")) thresholdMax = r.to<int>();
    if (json.get(r, "durasi_pompa")) durasiPompa = r.to<int>();
    Serial.printf("Loaded settings: thr %d-%d, dur %ds\n", thresholdMin, thresholdMax, durasiPompa);
  } else {
    Serial.println("⚠ Failed to fetch settings - using defaults");
  }
}

// ---------------- LOAD SCHEDULE (robust) ----------------
void loadSchedule() {
  Serial.println("📅 Loading schedule from Firebase...");
  String path = "/devices/" + String(DEVICE_ID) + "/control/schedule/times";
  if (!Firebase.RTDB.getJSON(&fbdo, path.c_str())) {
    Serial.println("⚠ No schedule or failed to load: " + fbdo.errorReason());
    schedules.clear();
    return;
  }

  String payload = fbdo.payload();
  if (payload.length() == 0) {
    schedules.clear();
    Serial.println("ℹ Schedule payload empty");
    return;
  }

  FirebaseJson json;
  json.setJsonData(payload);

  // Cek tipe JSON manual (kompatibel semua versi FirebaseJson)
  bool isArray = payload.startsWith("[");
  bool isObject = payload.startsWith("{");

  // Jika bukan object dan bukan array → error
  if (!isArray && !isObject) {
    Serial.println("⚠ Invalid schedule JSON format");
    schedules.clear();
    return;
  }

  schedules.clear();

  // Mulai iterator (versi lama: tanpa parameter)
  size_t count = json.iteratorBegin();
  if (count == 0) {
    Serial.println("ℹ No schedule entries found");
    json.iteratorEnd();
    return;
  }

  for (size_t i = 0; i < count; i++) {
    FirebaseJson::IteratorValue it = json.valueAt(i);
    FirebaseJson entry;
    entry.setJsonData(it.value);

    FirebaseJsonData rh, rm, rd;
    if (entry.get(rh, "hour") && entry.get(rm, "minute") && entry.get(rd, "duration")) {
      ScheduleItem s;
      s.hour = rh.to<int>();
      s.minute = rm.to<int>();
      s.duration = rd.to<int>();
      // validation
      if (s.hour >= 0 && s.hour <= 23 && s.minute >= 0 && s.minute <= 59 && s.duration > 0) {
        schedules.push_back(s);
        Serial.printf("  + schedule: %02d:%02d dur %ds\n", s.hour, s.minute, s.duration);
      } else {
        Serial.println("  ! Skipping invalid schedule entry");
      }
    } else {
      Serial.println("  ! Invalid schedule entry - missing fields");
    }
  }
  json.iteratorEnd();

  // sort by time
  std::sort(schedules.begin(), schedules.end(), [](const ScheduleItem &a, const ScheduleItem &b) {
    if (a.hour != b.hour) return a.hour < b.hour;
    return a.minute < b.minute;
  });

  Serial.printf("📌 Total schedules loaded: %d\n", (int)schedules.size());
}

// ---------------- PUMP CONTROL ----------------
void turnPumpOn(const String &trigger) {
  if (pompaMenyala) {
    Serial.println("⚠ Pump already ON");
    return;
  }
  digitalWrite(RELAY_PIN, HIGH);
  pompaMenyala = true;
  pompStartTime = millis();
  Serial.println("💧 PUMP ON (" + trigger + ") soil:" + String(soilMoisture) + "%");
  Firebase.RTDB.setString(&fbdo, ("/devices/" + String(DEVICE_ID) + "/current/status_pompa").c_str(), "ON");
  logPumpActivity("pump_on", trigger);
}

void turnPumpOff(const String &trigger) {
  if (!pompaMenyala) {
    Serial.println("⚠ Pump already OFF");
    return;
  }
  digitalWrite(RELAY_PIN, LOW);
  pompaMenyala = false;
  unsigned long duration = (millis() - pompStartTime) / 1000UL;
  Serial.println("🛑 PUMP OFF (" + trigger + ") duration: " + String(duration) + "s");
  Firebase.RTDB.setString(&fbdo, ("/devices/" + String(DEVICE_ID) + "/current/status_pompa").c_str(), "OFF");
  logPumpActivity("pump_off", trigger);
}

// Push log entry
void logPumpActivity(const String &action, const String &trigger) {
  String logPath = "/devices/" + String(DEVICE_ID) + "/logs";
  FirebaseJson json;
  json.set("action", action);
  json.set("trigger", trigger);
  json.set("soil_moisture", soilMoisture);
  json.set("timestamp/.sv", "timestamp");
  if (!pompaMenyala && action == "pump_off") {
    unsigned long duration = (millis() - pompStartTime) / 1000UL;
    json.set("duration", (int)duration);
  }
  Firebase.RTDB.pushJSON(&fbdo, logPath.c_str(), &json);
}

// ---------------- AUTO IRRIGATION ----------------
void checkAutoIrrigation() {
  if (scheduleRunning) return;     // schedule has priority when running
  if (!isProvisioned) return;

  // If manual override active, do not let auto turn the pump OFF or ON
  if (manualOverride) {
    if (debugVerbose) Serial.println("ℹ manualOverride active -> skipping auto irrigation");
    return;
  }

  if (!pompaMenyala && soilMoisture < thresholdMin) {
    Serial.println("Auto irrigation -> soil below threshold");
    turnPumpOn("auto");
  } else if (pompaMenyala && soilMoisture > thresholdMax) {
    Serial.println("Auto irrigation -> soil above max -> turning off");
    turnPumpOff("auto");
  }
}

// ---------------- SCHEDULE CHECK ----------------
void checkSchedule() {
  if (!isProvisioned || schedules.empty()) return;

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return;

  int hour = timeinfo.tm_hour;
  int minute = timeinfo.tm_min;

  // prevent double trigger
  if (lastCheckedMinute == minute) return;
  lastCheckedMinute = minute;

  for (auto &s : schedules) {
    if (s.hour == hour && s.minute == minute) {
      if (pompaMenyala) {
        Serial.println("Schedule match but pump already ON -> skip");
        return;
      }

      Serial.printf("🚿 Running schedule %02d:%02d for %ds\n", s.hour, s.minute, s.duration);

      scheduleRunning = true;
      durasiPompa = s.duration;

      // schedule run should not set manualOverride (it is separate)
      turnPumpOn("schedule");
      return;
    }
  }
}

// ---------------- PUMP TIMER ----------------
void checkPumpTimer() {
  if (!pompaMenyala) return;
  unsigned long elapsed = (millis() - pompStartTime) / 1000UL;
  if (elapsed >= (unsigned long)durasiPompa) {
    Serial.println("⏰ Pump timer reached, turning off");
    scheduleRunning = false;
    // When timer turns off after schedule, ensure manualOverride is not left on incorrectly
    manualOverride = false;
    turnPumpOff("timer");
  }
}

// ---------------- SENSORS ----------------
void readSensors() {
  soilRaw = analogRead(SOIL_SENSOR_PIN);
  // map using calibration constants (SOIL_DRY -> SOIL_WET)
  soilMoisture = map(soilRaw, SOIL_DRY, SOIL_WET, 0, 100);
  soilMoisture = constrain(soilMoisture, 0, 100);

  suhu = dht.readTemperature();
  kelembapanUdara = dht.readHumidity();
  if (isnan(suhu) || isnan(kelembapanUdara)) {
    suhu = 0.0f;
    kelembapanUdara = 0.0f;
  }

  float lx = lightMeter.readLightLevel();
  intensitasCahaya = (lx < 0.0f) ? 0.0f : lx;

  Serial.printf("📊 Soil:%d%% raw:%d | Temp:%.1fC RH:%.1f%% | Light:%.0f lx | Pump:%s\n",
                soilMoisture, soilRaw, suhu, kelembapanUdara, intensitasCahaya, pompaMenyala ? "ON" : "OFF");
}

// ---------------- SEND TO FIREBASE ----------------
void sendToFirebase() {
  if (!isProvisioned) {
    if (debugVerbose) Serial.println("⚠ Device not provisioned -> skip send");
    return;
  }
  if (!Firebase.ready()) {
    if (debugVerbose) Serial.println("⚠ Firebase not ready -> skip");
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

  if (Firebase.RTDB.updateNode(&fbdo, path.c_str(), &json)) {
    if (debugVerbose) Serial.println("✅ sensor data updated");
    // update info block
    String infoPath = "/devices/" + String(DEVICE_ID) + "/info";
    FirebaseJson info;
    info.set("status", "online");
    info.set("rssi", WiFi.RSSI());
    info.set("ip_address", WiFi.localIP().toString());
    info.set("last_seen/.sv", "timestamp");
    Firebase.RTDB.updateNode(&fbdo, infoPath.c_str(), &info);
  } else {
    Serial.println("❌ Failed update sensor: " + fbdo.errorReason());
  }
}

// ---------------- SERIAL COMMANDS ----------------
void checkSerialCommands() {
  if (!Serial.available()) return;
  char cmd = Serial.read();
  switch (cmd) {
    case 'r':
      Serial.println("🔄 Resetting and clearing prefs");
      preferences.clear();
      wifiManager.resetSettings();
      delay(500);
      ESP.restart();
      break;
    case 'i':
      printDeviceInfo();
      break;
    case 's':
      readSensors();
      break;
    case 't':
      sendToFirebase();
      break;
    case 'p':
      if (pompaMenyala) {
        turnPumpOff("serial");
        manualOverride = false;
      } else {
        turnPumpOn("serial");
        manualOverride = true;
      }
      break;
    case 'd':
      Serial.println("📴 Forget WiFi & restart");
      preferences.clear();
      preferences.end();
      wifiManager.resetSettings();
      WiFi.disconnect(true, true);
      delay(500);
      ESP.restart();
      break;
    case 'l':
      loadSettings();
      break;
    case 'h':
      printHelp();
      break;
    default:
      // ignore unknown
      break;
  }
}

// ---------------- UTILITIES ----------------
void printHeader() {
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║   SmartFarm IoT - Cloud Ready        ║");
  Serial.println("║   Device: " + String(DEVICE_ID) + "           ║");
  Serial.println("║   Firmware: v2.3 (No mode toggle)    ║");
  Serial.println("╚══════════════════════════════════════╝\n");
}

void printDeviceInfo() {
  Serial.println("\n═══════ DEVICE INFO ═══════");
  Serial.println("DeviceID: " + String(DEVICE_ID));
  Serial.println("Owner: " + ownerID);
  Serial.println("Provisioned: " + String(isProvisioned ? "YES" : "NO"));
  Serial.println("SSID: " + currentSSID);
  Serial.println("IP: " + WiFi.localIP().toString());
  Serial.println("RSSI: " + String(WiFi.RSSI()));
  Serial.println("Pump: " + String(pompaMenyala ? "ON" : "OFF"));
  Serial.println("Threshold: " + String(thresholdMin) + "-" + String(thresholdMax));
  Serial.println("═══════════════════════════\n");
}

void printHelp() {
  Serial.println("\n═══════ SERIAL COMMANDS ═══════");
  Serial.println("r - Reset device (clear all settings)");
  Serial.println("i - Show device info");
  Serial.println("s - Read sensors manually");
  Serial.println("t - Test send data to Firebase");
  Serial.println("p - Toggle pump ON/OFF (serial)");
  Serial.println("d - Disconnect WiFi & restart");
  Serial.println("l - Reload settings from Firebase");
  Serial.println("h - Show this help");
  Serial.println("═══════════════════════════════\n");
}
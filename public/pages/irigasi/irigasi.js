// ==== Konfigurasi Firebase ====
const firebaseConfig = {
  apiKey: "AIzaSyC3-greenuity-key",
  authDomain: "greenuity-id.firebaseapp.com",
  databaseURL: "https://greenuity-id-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "greenuity-id",
  storageBucket: "greenuity-id.appspot.com",
  messagingSenderId: "401314491030",
  appId: "1:401314491030:web:abc123greenuity"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const deviceID = "SF8266-0001"; // ganti sesuai device kamu

// ==== Elemen DOM ====
const modeSwitch = document.getElementById("modeSwitch");
const autoSettings = document.getElementById("autoSettings");
const manualControls = document.getElementById("manualControls");
const thresholdMin = document.getElementById("thresholdMin");
const thresholdMax = document.getElementById("thresholdMax");
const minLabel = document.getElementById("minLabel");
const maxLabel = document.getElementById("maxLabel");
const btnOn = document.getElementById("btnPompaOn");
const btnOff = document.getElementById("btnPompaOff");
const statusPompa = document.getElementById("statusPompa");
const soilMoisture = document.getElementById("soilMoisture");

// ==== Realtime Listener ====
db.ref(`/devices/${deviceID}/current`).on("value", (snap) => {
  const data = snap.val();
  if (!data) return;
  soilMoisture.textContent = data.kelembapan_tanah + "%";
  statusPompa.textContent = `Pompa: ${data.status_pompa}`;
  statusPompa.className = data.status_pompa === "ON"
    ? "text-green-600 font-semibold"
    : "text-gray-500 font-semibold";
});

// ==== Load Settings ====
db.ref(`/devices/${deviceID}/settings`).on("value", (snap) => {
  const s = snap.val();
  if (!s) return;
  modeSwitch.checked = s.mode_otomatis;
  thresholdMin.value = s.threshold_min;
  thresholdMax.value = s.threshold_max;
  minLabel.textContent = `${s.threshold_min}%`;
  maxLabel.textContent = `${s.threshold_max}%`;

  updateModeUI();
});

// ==== Event Listeners ====
modeSwitch.addEventListener("change", () => {
  const mode = modeSwitch.checked;
  db.ref(`/devices/${deviceID}/settings/mode_otomatis`).set(mode);
  updateModeUI();
});

thresholdMin.addEventListener("input", () => {
  minLabel.textContent = thresholdMin.value + "%";
  db.ref(`/devices/${deviceID}/settings/threshold_min`).set(parseInt(thresholdMin.value));
});

thresholdMax.addEventListener("input", () => {
  maxLabel.textContent = thresholdMax.value + "%";
  db.ref(`/devices/${deviceID}/settings/threshold_max`).set(parseInt(thresholdMax.value));
});

btnOn.addEventListener("click", () => {
  db.ref(`/devices/${deviceID}/control/pump_command`).set("ON");
});

btnOff.addEventListener("click", () => {
  db.ref(`/devices/${deviceID}/control/pump_command`).set("OFF");
});

// ==== Helper ====
function updateModeUI() {
  const isAuto = modeSwitch.checked;
  if (isAuto) {
    autoSettings.classList.remove("hidden");
    manualControls.classList.add("hidden");
  } else {
    autoSettings.classList.add("hidden");
    manualControls.classList.remove("hidden");
  }
}

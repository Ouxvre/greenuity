// --- GLOBAL STATE ---
let currentUser = null;
let selectedDevice = null;
let schedules = [];
let isAuto = true;
let pumpActive = false;

// --- DOM ELEMENTS ---
let deviceSelect;
let toggleDot;
let btnPump;
let pumpLogContainer;

// --- Threshold inputs (modal-based) ---
let thresholdMinInput = { input: null };
let thresholdMaxInput = { input: null };

// --- Schedule Elements ---
let scheduleContainer;
let btnAddSchedule;
let btnSaveSchedule;

// --- PAGE INIT ---
window.addEventListener("DOMContentLoaded", () => {
  firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "/pages/auth/login.html";
      return;
    }

    currentUser = user;
    initElements();
    loadDevices();
  });
});

// --- INITIALIZE DOM ELEMENTS ---
function initElements() {
  deviceSelect = document.querySelector("#deviceSelect");
  toggleDot = document.getElementById("toggle-dot");
  btnPump = document.getElementById("btnPump");
  pumpLogContainer = document.getElementById("pumpLogContainer");

  // Bind modal inputs
  thresholdMinInput.input = document.getElementById("modalMin");
  thresholdMaxInput.input = document.getElementById("modalMax");

  // Create schedule UI
  scheduleContainer = createScheduleContainer();

  btnAddSchedule = scheduleContainer.querySelector("#btnAddSchedule");
  btnSaveSchedule = scheduleContainer.querySelector("#btnSaveSchedule");

  // Append schedule container
  const mainContent = document.getElementById("dynamicIrrigation");
  mainContent.appendChild(scheduleContainer);

  // Event listeners
  btnAddSchedule.addEventListener("click", addSchedule);
  btnSaveSchedule.addEventListener("click", saveSchedules);
  deviceSelect.addEventListener("change", handleDeviceChange);
}

// --- HANDLE DEVICE CHANGE ---
function handleDeviceChange() {
  selectedDevice = deviceSelect.value;
  if (selectedDevice) loadRealtimeStatus(selectedDevice);
}

// --- CREATE SCHEDULE UI ---
function createScheduleContainer() {
  const div = document.createElement("div");
  div.className = "bg-white rounded-2xl p-5 shadow-sm mt-4";
  div.innerHTML = `
    <h2 class="text-base font-semibold text-gray-800 mb-3">Jadwal Penyiraman</h2>
    <div id="scheduleList" class="space-y-2 mb-3"></div>
    <div class="flex gap-2">
      <button id="btnAddSchedule" class="flex-1 bg-blue-500 text-white py-2 rounded-xl text-sm hover:bg-blue-600">Tambah Jadwal</button>
      <button id="btnSaveSchedule" class="flex-1 bg-green-500 text-white py-2 rounded-xl text-sm hover:bg-green-600">Simpan</button>
    </div>
  `;
  return div;
}

// --- LOAD DEVICES ---
function loadDevices() {
  const userDevicesRef = database.ref(`users/${currentUser.uid}/devices`);

  userDevicesRef.once("value").then((snapshot) => {
    deviceSelect.innerHTML = "";

    if (!snapshot.exists()) {
      const opt = document.createElement("option");
      opt.textContent = "Belum ada perangkat terdaftar";
      deviceSelect.appendChild(opt);
      return;
    }

    Object.keys(snapshot.val()).forEach((deviceId) => {
      const opt = document.createElement("option");
      opt.value = deviceId;
      opt.textContent = deviceId;
      deviceSelect.appendChild(opt);
    });

    selectedDevice = deviceSelect.value;
    if (selectedDevice) loadRealtimeStatus(selectedDevice);
  });
}

// --- LOAD REALTIME DEVICE STATUS ---
function loadRealtimeStatus(deviceId) {
  const deviceRef = database.ref(`devices/${deviceId}`);

  // Pump state
  deviceRef.child("current/status_pompa").on("value", (snap) => {
    pumpActive = snap.val() === "ON";
    updatePumpButton();
  });

  // Log reason
  deviceRef.child("logs/last_reason").on("value", (snap) => {
    const reason = snap.exists() ? snap.val() : "Belum ada aktivitas pompa.";
    renderLog(reason);
  });

  // Threshold listener
  deviceRef.child("settings").on("value", (snap) => {
    const s = snap.val() || {};
    thresholdMinInput.input.value = s.threshold_min ?? "";
    thresholdMaxInput.input.value = s.threshold_max ?? "";
  });

  // Schedule listener
  deviceRef.child("control/schedule/times").on("value", (snap) => {
    schedules = snap.val() ? Object.values(snap.val()) : [];
    renderSchedules();
  });

  // Auto/manual mode listener
  deviceRef.child("control/mode").on("value", (snap) => {
    const mode = snap.val();
    isAuto = mode === "sensor";

    // Gerakin dot
    toggleDot.style.transform = isAuto ? "translateX(1.5rem)" : "translateX(0)";

    // Ubah warna
    const toggleBtn = toggleDot.parentElement;
    toggleBtn.classList.toggle("bg-primary", isAuto);
    toggleBtn.classList.toggle("bg-gray-300", !isAuto);
  });
}

// --- UPDATE BUTTON STATE ---
function updatePumpButton() {
  btnPump.textContent = pumpActive ? "Matikan Pompa" : "Nyalakan Pompa";
  btnPump.classList.toggle("bg-dark", !pumpActive);
  btnPump.classList.toggle("bg-red-500", pumpActive);
}

// --- MANUAL PUMP CONTROL ---
function controlPump() {
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu");

  const newStatus = pumpActive ? "OFF" : "ON";
  pumpActive = !pumpActive;
  updatePumpButton();

  database.ref(`devices/${selectedDevice}/control`).update({
    mode: "manual",
    manual: newStatus,
  });

  database.ref(`devices/${selectedDevice}/logs`).update({
    last_reason: `Pompa ${
      newStatus === "ON" ? "dinyalakan" : "dimatikan"
    } oleh pengguna`,
    last_time: Date.now(),
  });
}

// --- AUTO MODE TOGGLE ---
function toggleAuto() {
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu");

  isAuto = !isAuto;

  // Gerakin dot
  toggleDot.style.transform = isAuto ? "translateX(1.5rem)" : "translateX(0)";

  // Ubah warna
  const toggleBtn = toggleDot.parentElement;
  toggleBtn.classList.toggle("bg-primary", isAuto); // Hijau
  toggleBtn.classList.toggle("bg-gray-300", !isAuto); // Abu-abu

  // Simpan ke Firebase
  database
    .ref(`devices/${selectedDevice}/control/mode`)
    .set(isAuto ? "sensor" : "manual");
}

// --- ADD SCHEDULE ---
function addSchedule() {
  const hour = prompt("Masukkan jam (0-23):");
  const minute = prompt("Masukkan menit (0-59):");
  const duration = prompt("Durasi penyiraman (detik):");

  if (hour === null || minute === null || duration === null) return;

  const h = parseInt(hour);
  const m = parseInt(minute);
  const d = parseInt(duration);

  if (
    isNaN(h) ||
    isNaN(m) ||
    isNaN(d) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59 ||
    d <= 0
  ) {
    return alert("Input tidak valid");
  }

  schedules.push({ hour: h, minute: m, duration: d });
  renderSchedules();
}

// --- RENDER SCHEDULE LIST ---
function renderSchedules() {
  const container = document.getElementById("scheduleList");
  container.innerHTML = "";

  if (schedules.length === 0) {
    container.innerHTML = `<p class="text-gray-400 text-sm text-center">Belum ada jadwal</p>`;
    return;
  }

  schedules.forEach((s, i) => {
    const div = document.createElement("div");
    div.className =
      "flex justify-between items-center bg-gray-100 p-2 rounded-lg text-sm";
    div.innerHTML = `
      <span>🕐 ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(
      2,
      "0"
    )} - ${s.duration}s</span>
      <button onclick="deleteSchedule(${i})" class="text-red-500 hover:text-red-700">✖</button>
    `;
    container.appendChild(div);
  });
}

function deleteSchedule(i) {
  schedules.splice(i, 1);
  renderSchedules();
}

// --- SAVE SCHEDULE ---
function saveSchedules() {
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu");

  database.ref(`devices/${selectedDevice}/control/schedule`).set({
    active: true,
    times: schedules,
  });

  database.ref(`devices/${selectedDevice}/logs`).update({
    last_reason: "Jadwal penyiraman diperbarui",
    last_time: Date.now(),
  });

  alert("✅ Jadwal disimpan!");
}

// --- RENDER LOG UI ---
function renderLog(reason) {
  pumpLogContainer.innerHTML = `
    <div class="border-l-4 border-${pumpActive ? "green" : "red"}-500 
                bg-${pumpActive ? "green" : "red"}-50 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-semibold text-gray-800">
          ${pumpActive ? "Pompa Nyala" : "Pompa Mati"}
        </span>
        <span class="text-xs text-gray-500">${new Date().toLocaleTimeString()}</span>
      </div>
      <p class="text-gray-600 text-xs">${reason}</p>
    </div>
  `;
}

// --- SETTINGS MODAL ---
function openSettings() {
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu");

  document.getElementById("modalMin").value = thresholdMinInput.input.value;
  document.getElementById("modalMax").value = thresholdMaxInput.input.value;

  document.getElementById("settingsModal").classList.remove("hidden");
}

function closeSettings() {
  document.getElementById("settingsModal").classList.add("hidden");
}

function saveThresholdFromModal() {
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu");

  const min = parseInt(document.getElementById("modalMin").value);
  const max = parseInt(document.getElementById("modalMax").value);

  if (isNaN(min) || isNaN(max)) return alert("Masukkan nilai valid");
  if (min >= max) return alert("Min harus lebih kecil dari Max");

  // Save to Firebase
  database.ref(`devices/${selectedDevice}/settings`).update({
    threshold_min: min,
    threshold_max: max,
  });

  alert("Threshold berhasil disimpan!");

  closeSettings();
}

// --- PAGE NAVIGATION ---
function goToHome() {
  window.location.href = "/pages/dashboard/dashboard.html";
}
function goToMonitoring() {
  window.location.href = "/pages/monitoring/monitoring.html";
}
function goToIrrigation() {
  window.location.href = "/pages/irrigation/irrigation.html";
}
function goToEducation() {
  window.location.href = "/pages/edukasi/edukasi.html";
}
function goToProfile() {
  window.location.href = "/pages/profile/profile.html";
}

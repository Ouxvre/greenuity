// ======================================================
//  GREENUITY - IRRIGATION SYSTEM (FINAL FIXED VERSION v3.2)
//  - single save flow (modal saves directly to Firebase)
//  - pump duration setting in settings modal
//  - single delete confirmation modal (showDeleteConfirm)
//  - removed unused duplicate functions and variables
// ======================================================

// ---------- GLOBAL STATE ----------
let currentUser = null;
let selectedDevice = null;
let schedules = [];
let pumpActive = false;

// ---------- DOM ELEMENTS ----------
let toggleDot;
let btnPump;
let pumpLogContainer;
let thresholdMinInput;
let thresholdMaxInput;

let scheduleContainer;
let btnAddSchedule;

let deviceSelectBtn;
let deviceDropdown;
let deviceSelectLabel;

let pumpDurationInput;

// schedule editing index
let editingScheduleIndex = -1;

// ======================================================
//               PAGE INIT (FIXED VERSION)
// ======================================================
window.addEventListener("load", () => {
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

// ======================================================
//                 INIT DOM ELEMENTS
// ======================================================
function initElements() {
  toggleDot = document.getElementById("toggle-dot");
  btnPump = document.getElementById("btnPump");
  pumpLogContainer = document.getElementById("pumpLogContainer");

  thresholdMinInput = document.getElementById("modalMin");
  thresholdMaxInput = document.getElementById("modalMax");

  deviceSelectBtn = document.getElementById("deviceSelectBtn");
  deviceDropdown = document.getElementById("deviceDropdown");
  deviceSelectLabel = document.getElementById("deviceSelectLabel");

  // Schedule container generation
  scheduleContainer = createScheduleContainer();
  btnAddSchedule = scheduleContainer.querySelector("#btnAddSchedule");

  pumpDurationInput = document.getElementById("modalDuration");

  document.getElementById("dynamicIrrigation").appendChild(scheduleContainer);

  // Bind schedule buttons
  btnAddSchedule.addEventListener("click", addSchedule);

  // ---- Save button inside modal (Simpan in modal) ----
  const saveBtn = document.getElementById("saveScheduleModalBtn");
  if (!saveBtn) {
    console.error("❌ saveScheduleModalBtn NOT FOUND IN DOM");
  } else {
    saveBtn.addEventListener("click", saveScheduleFromModal);
  }

  setupDropdown();
}

// ======================================================
//                 CUSTOM DROPDOWN
// ======================================================
let isDropdownOpen = false;

function setupDropdown() {
  deviceSelectBtn.addEventListener("click", () => {
    isDropdownOpen = !isDropdownOpen;
    deviceDropdown.classList.toggle("hidden", !isDropdownOpen);
  });

  document.addEventListener("click", (e) => {
    if (
      !deviceSelectBtn.contains(e.target) &&
      !deviceDropdown.contains(e.target)
    ) {
      deviceDropdown.classList.add("hidden");
      isDropdownOpen = false;
    }
  });
}

function renderDeviceList(devices) {
  deviceDropdown.innerHTML = "";

  if (devices.length === 0) {
    deviceDropdown.innerHTML = `
      <p class="p-3 text-sm text-gray-400 text-center">Belum ada perangkat</p>`;
    return;
  }

  devices.forEach((devId) => {
    const opt = document.createElement("div");
    opt.className =
      "px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer";
    opt.textContent = devId;

    opt.addEventListener("click", () => {
      selectedDevice = devId;
      deviceSelectLabel.textContent = devId;

      deviceDropdown.classList.add("hidden");
      isDropdownOpen = false;

      handleDeviceChange();
    });

    deviceDropdown.appendChild(opt);
  });
}

// ======================================================
//                    LOAD DEVICES
// ======================================================
function loadDevices() {
  const userDevicesRef = database.ref(`users/${currentUser.uid}/devices`);

  userDevicesRef.once("value").then((snapshot) => {
    let deviceList = [];

    if (!snapshot.exists()) {
      renderDeviceList([]);
      deviceSelectLabel.textContent = "Belum ada perangkat";
      return;
    }

    Object.keys(snapshot.val()).forEach((deviceId) =>
      deviceList.push(deviceId)
    );

    renderDeviceList(deviceList);

    selectedDevice = deviceList[0];
    deviceSelectLabel.textContent = selectedDevice;

    loadRealtimeStatus(selectedDevice);
  });
}

function handleDeviceChange() {
  if (!selectedDevice) return;

  schedules = [];
  editingScheduleIndex = -1;

  loadRealtimeStatus(selectedDevice);
}

// ======================================================
//                   REALTIME STATUS
// ======================================================
function loadRealtimeStatus(deviceId) {
  const ref = database.ref(`devices/${deviceId}`);

  ref.child("current/status_pompa").on("value", (snap) => {
    pumpActive = snap.val() === "ON";
    updatePumpButton();
  });

  ref.child("logs/last_reason").on("value", (snap) => {
    const reason = snap.exists() ? snap.val() : "Belum ada aktivitas pompa.";
    renderLog(reason);
  });

  ref.child("settings").on("value", (snap) => {
    const s = snap.val() || {};
    thresholdMinInput.value = s.threshold_min ?? "";
    thresholdMaxInput.value = s.threshold_max ?? "";
    // ensure pumpDurationInput exists before setting
    if (pumpDurationInput) pumpDurationInput.value = s.durasi_pompa ?? "";
  });

  ref.child("control/schedule/times").on("value", (snap) => {
    schedules = snap.val() ? Object.values(snap.val()) : [];
    schedules.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
    renderSchedules();
  });
}

// ======================================================
//                      PUMP UI
// ======================================================
function updatePumpButton() {
  btnPump.textContent = pumpActive ? "Matikan Pompa" : "Nyalakan Pompa";
  btnPump.classList.toggle("bg-dark", !pumpActive);
  btnPump.classList.toggle("bg-red-500", pumpActive);
}

// ======================================================
//                  MANUAL PUMP CONTROL
// ======================================================
function controlPump() {
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu!");

  const newCmd = pumpActive ? "OFF" : "ON";

  // UI responsif
  pumpActive = !pumpActive;
  updatePumpButton();

  database.ref(`devices/${selectedDevice}/control/pump_command`).set(newCmd);

  database.ref(`devices/${selectedDevice}/logs`).update({
    last_reason: `Pompa ${
      newCmd === "ON" ? "dinyalakan" : "dimatikan"
    } oleh pengguna`,
    last_time: Date.now(),
  });
}

// ======================================================
//             SCHEDULE UI (MODAL SYSTEM)
// ======================================================
function createScheduleContainer() {
  const div = document.createElement("div");
  div.className = "bg-white rounded-2xl p-5 shadow-sm mt-4";
  div.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-base font-semibold text-gray-800">Jadwal Penyiraman</h2>
      <div class="flex items-center gap-2">
        <button id="btnAddSchedule" class="px-3 py-1 rounded-lg bg-primary text-white text-sm">Tambah Jadwal</button>
      </div>
    </div>
    <div id="scheduleList" class="space-y-3"></div>
  `;
  return div;
}

function addSchedule() {
  editingScheduleIndex = -1;
  openScheduleModal();
}

// ---------- OPEN MODAL ----------
function openScheduleModal(index = -1) {
  const modal = document.getElementById("scheduleModal");
  const card = document.getElementById("scheduleModalCard");
  const err = document.getElementById("scheduleError");

  err.classList.add("hidden");
  err.textContent = "";

  const hour = document.getElementById("scheduleHour");
  const minute = document.getElementById("scheduleMinute");
  const dur = document.getElementById("scheduleDuration");
  const saveBtn = document.getElementById("saveScheduleModalBtn");

  if (index >= 0) {
    const s = schedules[index];
    hour.value = s.hour;
    minute.value = s.minute;
    dur.value = s.duration;
    editingScheduleIndex = index;
    saveBtn.textContent = "Perbarui";
  } else {
    hour.value = "";
    minute.value = "";
    dur.value = "";
    editingScheduleIndex = -1;
    saveBtn.textContent = "Simpan";
  }

  modal.classList.remove("hidden");

  setTimeout(() => {
    card.classList.remove("scale-95", "opacity-0");
    card.classList.add("scale-100", "opacity-100");
  }, 10);
}

function closeScheduleModal() {
  const modal = document.getElementById("scheduleModal");
  const card = document.getElementById("scheduleModalCard");

  card.classList.add("scale-95", "opacity-0");
  card.classList.remove("scale-100", "opacity-100");

  setTimeout(() => modal.classList.add("hidden"), 150);
}

// ---------- SAVE SCHEDULE (modal saves directly to Firebase) ----------
function saveScheduleFromModal() {
  const err = document.getElementById("scheduleError");

  const hour = parseInt(document.getElementById("scheduleHour").value);
  const minute = parseInt(document.getElementById("scheduleMinute").value);
  const duration = parseInt(document.getElementById("scheduleDuration").value);

  if (isNaN(hour) || isNaN(minute) || isNaN(duration)) {
    err.textContent = "Isi semua kolom!";
    err.classList.remove("hidden");
    return;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || duration <= 0) {
    err.textContent = "Rentang nilai tidak valid.";
    err.classList.remove("hidden");
    return;
  }

  const duplicate = schedules.findIndex(
    (s, i) =>
      s.hour === hour && s.minute === minute && i !== editingScheduleIndex
  );

  if (duplicate !== -1) {
    err.textContent = "Jadwal pada waktu ini sudah ada.";
    err.classList.remove("hidden");
    return;
  }

  const newEntry = { hour, minute, duration };

  if (editingScheduleIndex >= 0) {
    schedules[editingScheduleIndex] = newEntry;
  } else {
    schedules.push(newEntry);
    schedules.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  }

  // Update Firebase immediately
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu");

  database
    .ref(`devices/${selectedDevice}/control/schedule`)
    .set({
      active: true,
      times: schedules,
    })
    .then(() => {
      // update logs
      return database.ref(`devices/${selectedDevice}/logs`).update({
        last_reason: "Jadwal penyiraman diperbarui",
        last_time: Date.now(),
      });
    })
    .catch((err) => {
      console.error("Gagal menyimpan jadwal:", err);
      alert("Gagal menyimpan jadwal ke server.");
    });

  renderSchedules();
  closeScheduleModal();
}

// ======================================================
//  Delete confirmation modal (single implementation)
// ======================================================
function showDeleteConfirm(index, cardElement) {
  const modal = document.createElement("div");
  modal.className =
    "fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex justify-center items-center z-[9999]";

  modal.innerHTML = `
    <div id="deleteCard"
      class="bg-white rounded-xl p-5 w-80 shadow-lg transition-all scale-95 opacity-0">

      <h3 class="text-lg font-semibold text-gray-800 mb-2">Hapus Jadwal?</h3>

      <p class="text-sm text-gray-600 mb-4">
        Jadwal penyiraman ini akan dihapus secara permanen dan tidak akan berjalan lagi.
      </p>

      <div class="flex justify-end gap-2">
        <button id="cancelDelete"
          class="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm hover:bg-gray-300">
          Batal
        </button>

        <button id="confirmDelete"
          class="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600">
          Hapus
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Smooth animation
  setTimeout(() => {
    const card = document.getElementById("deleteCard");
    card.classList.remove("scale-95", "opacity-0");
    card.classList.add("scale-100", "opacity-100");
  }, 20);

  // Cancel button
  document.getElementById("cancelDelete").onclick = () => modal.remove();

  // Confirm delete
  document.getElementById("confirmDelete").onclick = () => {
    modal.remove();

    // ---- ANIMASI CARD HILANG ----
    if (cardElement) {
      cardElement.style.transition = "150ms";
      cardElement.style.opacity = "0";
      cardElement.style.transform = "scale(0.97)";
    }

    setTimeout(() => {
      schedules.splice(index, 1);
      renderSchedules();

      // Update Firebase
      if (selectedDevice) {
        database
          .ref(`devices/${selectedDevice}/control/schedule`)
          .set({
            active: schedules.length > 0,
            times: schedules,
          })
          .then(() => {
            return database.ref(`devices/${selectedDevice}/logs`).update({
              last_reason: "Jadwal penyiraman dihapus",
              last_time: Date.now(),
            });
          })
          .then(() => {
            showToast("Jadwal berhasil dihapus");
          })
          .catch((err) => {
            console.error("Gagal menghapus jadwal:", err);
            alert("Gagal menghapus jadwal di server.");
          });
      } else {
        showToast("Jadwal berhasil dihapus");
      }
    }, 150);
  };
}

// ---------- RENDER LIST ----------
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
      "flex items-center justify-between bg-gray-50 p-3 rounded-xl shadow-sm";

    div.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-white border">
          <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12A9 9 0 1112 3a9 9 0 019 9z"/>
          </svg>
        </div>
        <div>
          <div class="text-sm font-semibold text-gray-800">${String(
            s.hour
          ).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}</div>
          <div class="text-xs text-gray-500">${s.duration}s</div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button data-edit="${i}" class="edit-schedule px-3 py-1 rounded-lg bg-blue-100 text-blue-600 text-sm hover:bg-blue-200">Edit</button>
        <button data-delete="${i}" class="delete-schedule px-3 py-1 rounded-lg bg-red-100 text-red-600 text-sm hover:bg-red-200">Hapus</button>
      </div>
    `;

    container.appendChild(div);

    div
      .querySelector(".edit-schedule")
      .addEventListener("click", () => openScheduleModal(i));

    div
      .querySelector(".delete-schedule")
      .addEventListener("click", () => showDeleteConfirm(i, div));
  });
}

// ======================================================
//                     LOG UI
// ======================================================
function renderLog(reason) {
  const color = pumpActive ? "green" : "red";

  pumpLogContainer.innerHTML = `
    <div class="rounded-lg p-4 border-l-4 ${
      color === "green"
        ? "border-green-500 bg-green-50"
        : "border-red-500 bg-red-50"
    }">
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

// ======================================================
//                  THRESHOLD SETTINGS
// ======================================================
function openSettings() {
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu");

  document.getElementById("modalMin").value = thresholdMinInput.value;
  document.getElementById("modalMax").value = thresholdMaxInput.value;
  // ensure duration field gets the latest value
  document.getElementById("modalDuration").value = pumpDurationInput
    ? pumpDurationInput.value
    : "";

  document.getElementById("settingsModal").classList.remove("hidden");
}

function closeSettings() {
  document.getElementById("settingsModal").classList.add("hidden");
}

function saveThresholdFromModal() {
  if (!selectedDevice) return alert("Pilih perangkat terlebih dahulu");

  const min = parseInt(document.getElementById("modalMin").value);
  const max = parseInt(document.getElementById("modalMax").value);
  const duration = parseInt(document.getElementById("modalDuration").value);

  if (isNaN(min) || isNaN(max) || isNaN(duration)) {
    return alert("Masukkan nilai valid");
  }

  if (min >= max) return alert("Min harus lebih kecil dari Max");
  if (duration <= 0) return alert("Durasi harus lebih besar dari 0");

  database
    .ref(`devices/${selectedDevice}/settings`)
    .update({
      threshold_min: min,
      threshold_max: max,
      durasi_pompa: duration,
    })
    .then(() => {
      alert("Pengaturan berhasil disimpan!");
      // also update local pumpDurationInput so UI reflects saved value next time
      if (pumpDurationInput) pumpDurationInput.value = duration;
      closeSettings();
    })
    .catch((err) => {
      console.error("Gagal menyimpan pengaturan:", err);
      alert("Gagal menyimpan pengaturan ke server.");
    });
}

function showToast(msg) {
  const t = document.createElement("div");
  t.className =
    "fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-lg opacity-0 transition-all z-[9999]";
  t.textContent = msg;

  document.body.appendChild(t);

  setTimeout(() => (t.style.opacity = "1"), 20);

  setTimeout(() => {
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 500);
  }, 1800);
}

// ======================================================
//                  PAGE NAVIGATION
// ======================================================
function goToHome() {
  window.location.href = "/pages/dashboard/dashboard.html";
}
function goToMonitoring() {
  window.location.href = "/pages/monitoring/monitoring.html";
}
function goToAnalysis() {
  window.location.href = "/pages/analysis/analysis.html";
}
function goToProfile() {
  window.location.href = "/pages/profile/profile.html";
}

let currentUser = null;
let deviceId = null;

// Get device ID from URL parameter
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  deviceId = urlParams.get("deviceId");

  if (!deviceId) {
    alert("Device ID tidak ditemukan!");
    window.location.href = "add-device.html";
    return;
  }

  document.getElementById("displayDeviceId").textContent = deviceId;

  // Check auth
  firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
      alert("Anda harus login terlebih dahulu!");
      window.location.href = "/auth/login.html";
    } else {
      currentUser = user;
      console.log("✅ User loaded:", user.email);
    }
  });
});

// Toggle WiFi password visibility
function toggleWiFiPassword() {
  const passwordInput = document.getElementById("wifiPassword");
  const eyeIcon = document.getElementById("wifiEyeIcon");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    eyeIcon.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
          `;
  } else {
    passwordInput.type = "password";
    eyeIcon.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          `;
  }
}

// Save device to Firebase
async function saveDevice() {
  if (!currentUser) {
    alert("User tidak ditemukan! Silakan login ulang.");
    window.location.href = "/auth/login.html";
    return;
  }

  const fieldName = document.getElementById("fieldName").value.trim();
  const plantType = document.getElementById("plantType").value;
  const fieldArea = document.getElementById("fieldArea").value;
  const location = document.getElementById("location").value.trim();
  const thresholdMin = parseInt(document.getElementById("thresholdMin").value);
  const thresholdMax = parseInt(document.getElementById("thresholdMax").value);
  const wifiSSID = document.getElementById("wifiSSID").value.trim();
  const wifiPassword = document.getElementById("wifiPassword").value;

  // Validation
  if (!fieldName) {
    alert("❌ Nama lahan harus diisi!");
    return;
  }

  if (!plantType) {
    alert("❌ Jenis tanaman harus dipilih!");
    return;
  }

  if (thresholdMin >= thresholdMax) {
    alert("❌ Threshold minimal harus lebih kecil dari threshold maksimal!");
    return;
  }

  if (!wifiSSID || !wifiPassword) {
    alert("❌ WiFi SSID dan Password harus diisi!");
    return;
  }

  // Show loading
  document.getElementById("loadingOverlay").classList.remove("hidden");
  document.getElementById("loadingOverlay").classList.add("flex");

  try {
    const database = firebase.database();

    // Check if device already exists
    const deviceRef = database.ref("devices/" + deviceId);
    const snapshot = await deviceRef.once("value");

    if (snapshot.exists()) {
      const existingDevice = snapshot.val();
      if (
        existingDevice.info &&
        existingDevice.info.owner_id &&
        existingDevice.info.owner_id !== currentUser.uid
      ) {
        throw new Error("Device sudah terdaftar oleh user lain!");
      }
    }

    // Save device data
    await deviceRef.set({
      info: {
        owner_id: currentUser.uid,
        owner_email: currentUser.email,
        nama_lahan: fieldName,
        jenis_tanaman: plantType,
        luas_lahan: fieldArea ? parseFloat(fieldArea) : 0,
        lokasi: location || "",
        created_at: firebase.database.ServerValue.TIMESTAMP,
        updated_at: firebase.database.ServerValue.TIMESTAMP,
      },
      current: {
        kelembapan_tanah: 0,
        suhu: 0,
        kelembapan_udara: 0,
        intensitas_cahaya: 0,
        status_pompa: "OFF",
        timestamp: firebase.database.ServerValue.TIMESTAMP,
      },
      settings: {
        mode_otomatis: true,
        threshold_min: thresholdMin,
        threshold_max: thresholdMax,
        durasi_pompa: 300,
        wifi_ssid: wifiSSID,
        wifi_password: btoa(wifiPassword),
      },
      status: "offline",
    });

    // Add device to user's device list
    await database
      .ref("users/" + currentUser.uid + "/devices/" + deviceId)
      .set(true);

    console.log("✅ Device saved successfully");

    // Hide loading
    document.getElementById("loadingOverlay").classList.add("hidden");
    document.getElementById("loadingOverlay").classList.remove("flex");

    // Show success modal
    document.getElementById("successModal").classList.remove("hidden");
    document.getElementById("successModal").classList.add("flex");
  } catch (error) {
    console.error("❌ Error saving device:", error);

    // Hide loading
    document.getElementById("loadingOverlay").classList.add("hidden");
    document.getElementById("loadingOverlay").classList.remove("flex");

    let errorMessage = "Gagal menyimpan perangkat!";

    if (error.message.includes("sudah terdaftar")) {
      errorMessage = error.message;
    } else if (error.code === "PERMISSION_DENIED") {
      errorMessage =
        "Tidak memiliki izin untuk menambahkan perangkat. Periksa Firebase Database Rules.";
    }

    alert(errorMessage + "\n\nDetail: " + error.message);
  }
}

// Navigation
function goBack() {
  if (confirm("Data yang belum disimpan akan hilang. Yakin ingin kembali?")) {
    window.location.href = "add-device.html";
  }
}

function goToDashboard() {
  window.location.href = "monitoring.html";
}

function addAnotherDevice() {
  window.location.href = "add-device.html";
}

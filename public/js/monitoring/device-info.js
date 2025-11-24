let currentUser = null;
let deviceId = null;

// --------------------- INIT ---------------------
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  deviceId = urlParams.get("deviceId");

  if (!deviceId) {
    alert("Device ID tidak ditemukan!");
    window.location.href = "add-device.html";
    return;
  }

  document.getElementById("displayDeviceId").textContent = deviceId;

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

// --------------------- SAVE DEVICE ---------------------
async function saveDevice() {
  if (!currentUser) {
    alert("User tidak ditemukan! Silakan login ulang.");
    window.location.href = "/auth/login.html";
    return;
  }

  const pairingToken = document.getElementById("pairingToken").value.trim();
  const fieldName = document.getElementById("fieldName").value.trim();
  const plantType = document.getElementById("plantType").value;
  const fieldArea = document.getElementById("fieldArea").value;
  const location = document.getElementById("location").value.trim();
  const thresholdMin = parseInt(document.getElementById("thresholdMin").value);
  const thresholdMax = parseInt(document.getElementById("thresholdMax").value);

  // --- VALIDATION ---
  if (!pairingToken) return alert("❌ Pairing token harus diisi!");
  if (!fieldName) return alert("❌ Nama lahan harus diisi!");
  if (!plantType) return alert("❌ Jenis tanaman harus dipilih!");
  if (thresholdMin >= thresholdMax)
    return alert("❌ Threshold minimal harus lebih kecil dari maksimal!");

  showLoading();

  try {
    const database = firebase.database();

    // --- 1. CEK DI /unclaimed_devices/<deviceId> ---
    const unclaimedRef = database.ref("unclaimed_devices/" + deviceId);
    const unclaimed = await unclaimedRef.once("value");

    if (!unclaimed.exists()) {
      hideLoading();
      return alert("❌ Device belum dalam mode konfigurasi atau tidak ditemukan!");
    }

    const tokenFromDB = unclaimed.val().pairing_token;

    if (pairingToken !== tokenFromDB) {
      hideLoading();
      return alert("❌ Pairing Token salah!");
    }

    // --- 2. CEK APAKAH DEVICE SUDAH DIMILIKI USER LAIN ---
    const deviceRef = database.ref("devices/" + deviceId);
    const deviceSnap = await deviceRef.once("value");

    if (deviceSnap.exists()) {
      const dev = deviceSnap.val();
      if (dev.info && dev.info.owner_id && dev.info.owner_id !== currentUser.uid) {
        hideLoading();
        throw new Error("Device sudah terdaftar oleh user lain!");
      }
    }

    // --- 3. SIMPAN DATA DEVICE ---
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
        status: "online"
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
        threshold_min: thresholdMin,
        threshold_max: thresholdMax,
        durasi_pompa: 300,
      }
    });

    // --- 4. Tambah device ke list user ---
    await database
      .ref("users/" + currentUser.uid + "/devices/" + deviceId)
      .set(true);

    // --- 5. Hapus unclaimed ---
    await unclaimedRef.remove();

    hideLoading();
    showSuccess();

    console.log("✅ Device paired successfully!");
  } catch (err) {
    hideLoading();
    console.error(err);

    let msg = "Gagal menyimpan perangkat!";

    if (err.message.includes("sudah terdaftar")) msg = err.message;
    if (err.code === "PERMISSION_DENIED") msg = "Permission denied! Periksa rules Firebase.";

    alert(msg + "\n\nDetail: " + err.message);
  }
}

// --------------------- UI HELPERS ---------------------
function showLoading() {
  document.getElementById("loadingOverlay").classList.remove("hidden");
  document.getElementById("loadingOverlay").classList.add("flex");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("hidden");
  document.getElementById("loadingOverlay").classList.remove("flex");
}

function showSuccess() {
  document.getElementById("successModal").classList.remove("hidden");
  document.getElementById("successModal").classList.add("flex");
}

// --------------------- NAVIGATION ---------------------
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

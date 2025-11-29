let currentUser = null;

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "/auth/login.html";
    } else {
      currentUser = user;
      loadUserDevices();
    }
  });
});

// Load devices
async function loadUserDevices() {
  try {
    const database = firebase.database();
    const userDevicesRef = database.ref(
      "users/" + currentUser.uid + "/devices"
    );

    userDevicesRef.on("value", async (snapshot) => {
      const deviceList = document.getElementById("deviceList");
      const loadingDevices = document.getElementById("loadingDevices");
      const emptyState = document.getElementById("emptyState");

      deviceList.innerHTML = "";

      if (!snapshot.exists()) {
        loadingDevices.classList.add("hidden");
        emptyState.classList.remove("hidden");
        deviceList.classList.add("hidden");
        return;
      }

      const deviceIds = Object.keys(snapshot.val());

      for (const deviceId of deviceIds) {
        const deviceSnapshot = await database
          .ref("devices/" + deviceId)
          .once("value");
        if (deviceSnapshot.exists()) {
          createDeviceCard(deviceId, deviceSnapshot.val());
        }
      }

      loadingDevices.classList.add("hidden");
      emptyState.classList.add("hidden");
      deviceList.classList.remove("hidden");

      // Real-time updates
      deviceIds.forEach((deviceId) => {
        database.ref("devices/" + deviceId).on("value", (snap) => {
          if (snap.exists()) {
            updateDeviceCard(deviceId, snap.val());
          }
        });
      });
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

// Create device card (Simple Design)
function createDeviceCard(deviceId, deviceData) {
  const deviceList = document.getElementById("deviceList");
  const info = deviceData.info || {};
  const current = deviceData.current || {};
  const status = info.status || "offline";

  let statusColor = "bg-red-500";
  if (status === "online") statusColor = "bg-green-500";
  else if (status === "configuring") statusColor = "bg-yellow-400";

  const plantEmojis = {
    cabai: "🌶️",
    tomat: "🍅",
    terong: "🍆",
    sawi: "🥬",
    kangkung: "🥬",
    bayam: "🥬",
    selada: "🥗",
    timun: "🥒",
    jagung: "🌽",
    padi: "🌾",
    lainnya: "🌱",
  };
  const plantName = info.jenis_tanaman
    ? info.jenis_tanaman.charAt(0).toUpperCase() + info.jenis_tanaman.slice(1)
    : "Lahan";

  const card = document.createElement("button");
  card.id = "device-" + deviceId;
  card.className =
    "w-full bg-white rounded-2xl shadow-sm hover:shadow-md transition-all p-4 text-left";
  card.onclick = () => goToDeviceDetail(deviceId);

  card.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="text-2xl">${plantEmojis[info.jenis_tanaman] || "🌱"
    }</div>
              <div>
                <h4 class="font-semibold text-gray-900 text-sm">${info.nama_lahan || "Kebun " + plantName
    }</h4>
                <p class="text-xs text-gray-500">Ketuk untuk melihat detail</p>
              </div>
            </div>
            <span class="${statusColor} w-3 h-3 rounded-full" id="status-${deviceId}"></span>
          </div>
        `;
  deviceList.appendChild(card);
}

// Update device card (Realtime dari Firebase)
function updateDeviceCard(deviceId, deviceData) {
  const statusDot = document.getElementById("status-" + deviceId);
  if (!statusDot) return;

  const info = deviceData.info || {};
  const status = info.status || "offline";
  const lastSeen = info.last_seen || 0;
  const now = Date.now();
  const diffMinutes = Math.floor((now - lastSeen) / 30000);

  // Tentukan warna status
  let statusColor = "bg-red-500";
  if (status === "online" && diffMinutes <= 2) {
    statusColor = "bg-green-500";
  } else if (status === "online" && diffMinutes > 2) {
    // Device gak update last_seen padahal status masih online
    statusColor = "bg-yellow-400";
  }

  statusDot.className = `${statusColor} w-3 h-3 rounded-full`;
}

// Navigation
function goToHome() {
  window.location.href = "/pages/dashboard/dashboard.html";
}

function goToIrrigation() {
  window.location.href = "../irrigation/irrigation.html";
}

function goToEducation() {
  window.location.href = "../education/education.html";
}

function goToProfile() {
  window.location.href = "../profile/profile.html";
}

function goToAddDevice() {
  window.location.href = "scan-device.html";
}

function goToDeviceDetail(deviceId) {
  window.location.href = `info-sensor.html?deviceId=${deviceId}`;
}

const urlParams = new URLSearchParams(window.location.search);
const deviceId = urlParams.get("deviceId");
document.getElementById("deviceIdDisplay").textContent = deviceId || "-";

// Validasi device ID
if (!deviceId) {
  document.getElementById("deviceName").textContent = "Device tidak ditemukan";
  console.warn("❌ Device ID tidak ditemukan di URL!");
} else {
  // Referensi Realtime Database
  const dbRef = database.ref("devices/" + deviceId + "/current");
  const infoRef = database.ref("devices/" + deviceId + "/info");

  // Setup Chart.js
  const ctx = document.getElementById("sensorChart").getContext("2d");
  const chartData = {
    labels: [],
    datasets: [
      {
        label: "Kelembapan Tanah (%)",
        borderColor: "#1B4D57",
        backgroundColor: "rgba(27,77,87,0.1)",
        data: [],
        tension: 0.4,
      },
      {
        label: "Suhu (°C)",
        borderColor: "#E67E22",
        backgroundColor: "rgba(230,126,34,0.1)",
        data: [],
        tension: 0.4,
      },
      {
        label: "Kelembapan Udara (%)",
        borderColor: "#2ECC71",
        backgroundColor: "rgba(46,204,113,0.1)",
        data: [],
        tension: 0.4,
      },
    ],
  };

  const sensorChart = new Chart(ctx, {
    type: "line",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#555", font: { size: 12 } } },
      },
      scales: {
        x: {
          ticks: { color: "#555" },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#555" },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
      },
    },
  });

  // 🔄 Listener realtime data sensor
  dbRef.on("value", (snapshot) => {
    const current = snapshot.val();
    if (!current) {
      console.warn(
        "⚠️ Tidak ada data untuk:",
        "devices/" + deviceId + "/current"
      );
      return;
    }

    console.log("✅ Data sensor diterima:", current);

    // Ambil nama lahan dari info
    infoRef.once("value").then((snap) => {
      const info = snap.val() || {};
      document.getElementById("deviceName").textContent =
        info.nama_lahan || "Lahan Tanaman";
    });

    // Update nilai sensor di UI
    document.getElementById("suhu").textContent = `${current.suhu ?? "--"} °C`;
    document.getElementById("kelembapan_udara").textContent = `${
      current.kelembapan_udara ?? "--"
    } %`;
    document.getElementById("kelembapan_tanah").textContent = `${
      current.kelembapan_tanah ?? "--"
    } %`;
    document.getElementById("cahaya").textContent = `${
      current.intensitas_cahaya ?? "--"
    } lux`;

    const now = new Date();
    const timeLabel = now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });

    document.getElementById("updateTime").textContent =
      "Diperbarui: " + timeLabel;
    document.getElementById("lastActive").textContent =
      "Terakhir aktif: " + timeLabel;

    // Update grafik realtime
    if (chartData.labels.length >= 20) {
      chartData.labels.shift();
      chartData.datasets.forEach((d) => d.data.shift());
    }

    chartData.labels.push(timeLabel);
    chartData.datasets[0].data.push(current.kelembapan_tanah || 0);
    chartData.datasets[1].data.push(current.suhu || 0);
    chartData.datasets[2].data.push(current.kelembapan_udara || 0);
    sensorChart.update();

    updateAIInsight(current);
  });

  // 💡 AI Insight Generator
  function updateAIInsight(current) {
    const aiText = document.getElementById("aiText");
    let text = "";

    if (current.kelembapan_tanah < 35) {
      text += "Tanah kering — perlu penyiraman segera. ";
    } else if (current.kelembapan_tanah > 70) {
      text += "Tanah terlalu lembap, hentikan pompa sementara. ";
    } else {
      text += "Kelembapan tanah ideal untuk tanaman. ";
    }

    if (current.suhu > 32) {
      text += "Suhu tinggi, hindari penyiraman di siang hari. ";
    } else if (current.suhu < 20) {
      text += "Suhu rendah, kurangi intensitas penyiraman. ";
    }

    if (current.intensitas_cahaya < 200) {
      text += "Cahaya rendah, pastikan tanaman mendapat sinar matahari cukup.";
    }

    aiText.textContent = text.trim();
  }
}

let html5QrcodeScanner = null;

function switchTab(tab) {
  const scanTab = document.getElementById("tabScan");
  const manualTab = document.getElementById("tabManual");
  const scanContent = document.getElementById("scanContent");
  const manualContent = document.getElementById("manualContent");

  if (tab === "scan") {
    scanTab.className =
      "flex-1 py-3 px-4 rounded-xl font-medium text-sm transition bg-white text-primary shadow-sm";
    manualTab.className =
      "flex-1 py-3 px-4 rounded-xl font-medium text-sm transition text-gray-600";
    scanContent.classList.remove("hidden");
    manualContent.classList.add("hidden");
  } else {
    manualTab.className =
      "flex-1 py-3 px-4 rounded-xl font-medium text-sm transition bg-white text-primary shadow-sm";
    scanTab.className =
      "flex-1 py-3 px-4 rounded-xl font-medium text-sm transition text-gray-600";
    manualContent.classList.remove("hidden");
    scanContent.classList.add("hidden");
    stopScanning();
  }
}

function startScanning() {
  const startBtn = document.getElementById("startScanBtn");
  const stopBtn = document.getElementById("stopScanBtn");
  const placeholder = document.getElementById("scanPlaceholder");

  startBtn.classList.add("hidden");
  stopBtn.classList.remove("hidden");
  placeholder.classList.add("hidden");

  html5QrcodeScanner = new Html5Qrcode("qrReader");

  html5QrcodeScanner
    .start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {} // Ignore errors
    )
    .catch((err) => {
      alert(
        "Tidak dapat mengakses kamera. Pastikan Anda memberikan izin akses kamera."
      );
      stopScanning();
    });
}

function stopScanning() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      html5QrcodeScanner = null;
      document.getElementById("startScanBtn").classList.remove("hidden");
      document.getElementById("stopScanBtn").classList.add("hidden");
      document.getElementById("scanPlaceholder").classList.remove("hidden");
    });
  }
}

function onScanSuccess(decodedText) {
  const deviceIdPattern = /^Greenuity-\d{3}$/;
  if (!deviceIdPattern.test(decodedText)) {
    alert("QR Code tidak valid! Format harus: Gre######-###");
    return;
  }

  stopScanning();

  // Redirect ke halaman device-info dengan device ID
  window.location.href = `device-info.html?deviceId=${decodedText}`;
}

function handleManualSubmit(event) {
  event.preventDefault();
  const deviceId = document
    .getElementById("manualDeviceId")
    .value.toUpperCase();

  // Redirect ke halaman device-info dengan device ID
  window.location.href = `device-info.html?deviceId=${deviceId}`;
}

function goBack() {
  window.location.href = "monitoring.html";
}

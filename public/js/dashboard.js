// Navigation functions
function goToHome() {
  window.location.href = `../dashboard/dashboard.html`;
}
function goToMonitoring() {
  window.location.href = "../monitoring/monitoring.html";
}
function goToEducation() {
  window.location.href = "../edukasi/edukasi.html";
}
function goToIrrigation() {
  window.location.href = "irrigation.html";
}
function goToProfile() {
  window.location.href = "../profile/profile.html";
}

// Update DateTime
function updateDateTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const date = now.getDate();
  const month = months[now.getMonth()];

  document.getElementById(
    "currentDate"
  ).textContent = `${hours}:${minutes} | ${month} ${date}`;
}
updateDateTime();
setInterval(updateDateTime, 60000);

// Firebase Auth
firebase.auth().onAuthStateChanged((user) => {
  const nameEl = document.getElementById("userName");
  const profileImg = document.getElementById("profileImage");
  const DEFAULT_PHOTO_URL = "../../assets/foto-default.jpeg";

  if (user) {
    nameEl.textContent = user.displayName || user.email.split("@")[0];
    profileImg.src = user.photoURL || DEFAULT_PHOTO_URL;
  } else {
    window.location.href = "../auth/login.html";
  }
});

// Geolocation & Weather
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(async (position) => {
    const { latitude, longitude } = position.coords;

    // Get location name
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
      );
      const geoData = await geoRes.json();
      const city =
        geoData.address.city ||
        geoData.address.town ||
        geoData.address.village ||
        "Unknown";
      const country = geoData.address.country || "";
      document.getElementById(
        "userLocation"
      ).textContent = `${city}, ${country}`;
    } catch (err) {
      console.error("Location error:", err);
    }

    // Get weather
    const apiKey = "7a3921ca85a13c3a24d7abeaeaf29dc4";
    try {
      const weatherRes = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${apiKey}`
      );
      const weatherData = await weatherRes.json();

      document.getElementById("temperature").textContent =
        Math.round(weatherData.main.temp) + "°C";
      document.getElementById("humidity").textContent =
        weatherData.main.humidity + "%";
      document.getElementById("windSpeed").textContent =
        weatherData.wind.speed + " km/jam";

      const desc = weatherData.weather[0].description;
      document.getElementById("weatherDesc").textContent =
        desc.charAt(0).toUpperCase() + desc.slice(1);
    } catch (err) {
      console.error("Weather error:", err);
    }
  });
}

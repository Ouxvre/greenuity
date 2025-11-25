const params = new URLSearchParams(window.location.search);
const oobCode = params.get("oobCode");

const card = document.getElementById("card");
const title = document.getElementById("title");
const description = document.getElementById("description");
const successIcon = document.getElementById("successIcon");
const errorIcon = document.getElementById("errorIcon");
const loginButton = document.getElementById("loginButton");

// Tampilkan card
card.classList.remove("hidden");

(async () => {
  try {
    await auth.applyActionCode(oobCode);

    // SUCCESS UI
    successIcon.classList.remove("hidden");
    title.textContent = "Email Berhasil Diverifikasi!";
    description.textContent =
      "Akun kamu sudah aktif dan dapat digunakan untuk login.";

    loginButton.classList.remove("hidden");
  } catch (error) {
    // ERROR UI
    errorIcon.classList.remove("hidden");
    title.textContent = "Verifikasi Gagal";
    description.textContent =
      "Tautan ini sudah tidak valid atau sudah pernah digunakan.";

    loginButton.classList.remove("hidden");
  }
})();

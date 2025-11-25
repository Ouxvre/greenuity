const form = document.getElementById("forgotForm");
const emailInput = document.getElementById("forgotEmail");
const submitBtn = document.getElementById("submitBtn");
const alertDiv = document.getElementById("alertMessage");
const successModal = document.getElementById("successModal");

// ==============================
// Realtime Email Validation
// ==============================
emailInput.addEventListener("input", () => {
  const email = emailInput.value.trim();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  submitBtn.disabled = !isValid;
  submitBtn.classList.toggle("opacity-50", !isValid);
});

// ==============================
// Submit Form
// ==============================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();

  // Disable button + show loading
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <span class="inline-block animate-spin border-2 border-white border-t-transparent rounded-full w-5 h-5 mr-2"></span>
    Mengirim...
  `;

  alertDiv.classList.add("hidden");

  try {
    // Kirim reset email
    await auth.sendPasswordResetEmail(email);

    // Tampilkan modal sukses
    successModal.classList.remove("hidden");
    successModal.classList.add("flex");

    // Auto redirect ke login
    setTimeout(() => {
      window.location.href = "login.html";
    }, 3000);

  } catch (error) {
    let message = "Terjadi kesalahan.";

    if (error.code === "auth/user-not-found") {
      message = "Email tidak terdaftar.";
    } else if (error.code === "auth/invalid-email") {
      message = "Format email tidak valid.";
    }

    // Vibrasi untuk mobile error feedback
    if (navigator.vibrate) navigator.vibrate(100);

    alertDiv.textContent = message;
    alertDiv.className =
      "mb-4 p-4 rounded-xl text-sm bg-red-100 text-red-700 border border-red-300 animate-fadeIn";
    alertDiv.classList.remove("hidden");
  }

  // Reset button
  submitBtn.disabled = false;
  submitBtn.innerHTML = "Kirim";
});

// ==============================
// Close Success Modal
// ==============================
function closeSuccessModal() {
  successModal.classList.add("hidden");
  successModal.classList.remove("flex");
}

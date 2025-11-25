// Ambil parameter kode reset dari URL
const params = new URLSearchParams(window.location.search);
const oobCode = params.get("oobCode");

// Elemen
const form = document.getElementById("resetPasswordForm");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const successModal = document.getElementById("successModal");

if (!oobCode) {
  alert("Tautan reset password tidak valid atau tidak lengkap.");
}

// === FORM SUBMIT ===
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const newPass = newPasswordInput.value.trim();
  const confirmPass = confirmPasswordInput.value.trim();

  // Validasi cocok
  if (newPass !== confirmPass) {
    alert("Kata sandi dan konfirmasi tidak sama!");
    return;
  }

  // Validasi panjang minimal
  if (newPass.length < 6) {
    alert("Kata sandi minimal 6 karakter.");
    return;
  }

  // Disable button supaya tidak double submit
  const submitBtn = form.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Memproses...";

  try {
    // Firebase: Reset Password
    await auth.confirmPasswordReset(oobCode, newPass);

    // Tampilkan modal sukses
    successModal.classList.remove("hidden");
    successModal.classList.add("flex");

  } catch (err) {
    console.error("Reset password error:", err);

    let message = "Gagal menyetel kata sandi baru.";

    if (err.code === "auth/expired-action-code") {
      message = "Tautan reset password sudah kadaluarsa.";
    } else if (err.code === "auth/invalid-action-code") {
      message = "Tautan reset password tidak valid.";
    }

    alert(message);
    submitBtn.disabled = false;
    submitBtn.textContent = "lanjutkan";
  }
});

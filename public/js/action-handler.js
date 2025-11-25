const container = document.getElementById("container");
const title = document.getElementById("title");
const description = document.getElementById("description");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const loginButton = document.getElementById("loginButton");

// Ambil parameter dari URL
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");
const oobCode = params.get("oobCode");

// Tampilkan container
container.classList.remove("hidden");

// ===============================
// MODE HANDLER
// ===============================

switch (mode) {
  case "verifyEmail":
    window.location.href = "/pages/auth/verify-email.html?oobCode=" + oobCode;
    break;

  case "resetPassword":
    window.location.href = "/pages/auth/reset-password.html?oobCode=" + oobCode;
    break;

  case "recoverEmail":
    window.location.href = "/pages/auth/recover-email.html?oobCode=" + oobCode;
    break;

  default:
    showError("Tautan tidak valid", "Tautan ini tidak dikenali.");
}

// ===============================
// 1. VERIFY EMAIL
// ===============================
async function handleVerifyEmail() {
  try {
    await auth.applyActionCode(oobCode);

    title.textContent = "Email Berhasil Diverifikasi!";
    description.textContent =
      "Akun kamu sekarang aktif dan dapat digunakan untuk login.";

    loginButton.classList.remove("hidden");
  } catch (error) {
    showError(
      "Verifikasi gagal",
      "Tautan ini mungkin sudah pernah digunakan atau sudah kadaluarsa."
    );
  }
}

// ===============================
// 2. RESET PASSWORD
// ===============================
function showResetPasswordForm() {
  title.textContent = "Reset Password";
  description.textContent = "Masukkan password baru kamu.";

  resetPasswordForm.classList.remove("hidden");

  resetPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById("newPassword").value;

    try {
      await auth.confirmPasswordReset(oobCode, newPassword);

      title.textContent = "Password Berhasil Diubah!";
      description.textContent = "Silakan login menggunakan password baru kamu.";
      resetPasswordForm.classList.add("hidden");

      loginButton.classList.remove("hidden");
    } catch (error) {
      showError(
        "Gagal menyetel password",
        "Tautan reset password kadaluarsa atau tidak valid."
      );
    }
  });
}

// ===============================
// 3. RECOVER EMAIL
// ===============================
async function handleRecoverEmail() {
  try {
    const info = await auth.checkActionCode(oobCode);
    const restoredEmail = info.data.email;

    await auth.applyActionCode(oobCode);

    title.textContent = "Email Dipulihkan!";
    description.textContent = `Email akun kamu telah dikembalikan ke: ${restoredEmail}`;

    loginButton.classList.remove("hidden");
  } catch (error) {
    showError("Gagal memulihkan email", "Tautan tidak valid.");
  }
}

// ===============================
// ERROR VIEW
// ===============================
function showError(titleText, descText) {
  title.textContent = titleText;
  description.textContent = descText;

  resetPasswordForm.classList.add("hidden");
  loginButton.classList.remove("hidden");
}

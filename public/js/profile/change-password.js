let currentUser = null;

// Load user when page loads
window.addEventListener("DOMContentLoaded", () => {
  const checkAuthGuard = setInterval(() => {
    if (typeof authGuard === "function") {
      clearInterval(checkAuthGuard);

      authGuard()
        .then((user) => {
          currentUser = user;
          console.log("✅ User loaded:", user.email);
        })
        .catch((err) => {
          console.error("❌ Auth error:", err);
        });
    }
  }, 100);

  setTimeout(() => clearInterval(checkAuthGuard), 5000);
});

// Toggle password visibility
function togglePassword(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);

  if (input.type === "password") {
    input.type = "text";
    icon.innerHTML =
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>';
  } else {
    input.type = "password";
    icon.innerHTML =
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>';
  }
}

// Check password strength
document.getElementById("newPassword")?.addEventListener("input", (e) => {
  const password = e.target.value;
  checkPasswordStrength(password);
  checkPasswordMatch();
});

document.getElementById("confirmPassword")?.addEventListener("input", () => {
  checkPasswordMatch();
});

function checkPasswordStrength(password) {
  let strength = 0;
  const requirements = {
    length: password.length >= 6,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  // Update requirements UI
  updateRequirement("req-length", requirements.length);
  updateRequirement("req-uppercase", requirements.uppercase);
  updateRequirement("req-lowercase", requirements.lowercase);
  updateRequirement("req-number", requirements.number);

  // Calculate strength
  Object.values(requirements).forEach((met) => {
    if (met) strength++;
  });

  // Update strength bar
  const strengthBar = document.getElementById("strengthBar");
  const strengthText = document.getElementById("strengthText");
  const percentage = (strength / 4) * 100;

  strengthBar.style.width = percentage + "%";

  if (strength === 0) {
    strengthBar.className = "h-full bg-gray-300 transition-all duration-300";
    strengthText.textContent = "Minimal 6 karakter";
    strengthText.className = "text-xs text-gray-500";
  } else if (strength <= 2) {
    strengthBar.className = "h-full bg-red-500 transition-all duration-300";
    strengthText.textContent = "Password lemah";
    strengthText.className = "text-xs text-red-600";
  } else if (strength === 3) {
    strengthBar.className = "h-full bg-yellow-500 transition-all duration-300";
    strengthText.textContent = "Password sedang";
    strengthText.className = "text-xs text-yellow-600";
  } else {
    strengthBar.className = "h-full bg-green-500 transition-all duration-300";
    strengthText.textContent = "Password kuat";
    strengthText.className = "text-xs text-green-600";
  }
}

function updateRequirement(id, met) {
  const element = document.getElementById(id);
  const svg = element.querySelector("svg");
  const span = element.querySelector("span");

  if (met) {
    element.className = "flex items-center text-sm text-green-600";
    svg.innerHTML =
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
    svg.className = "w-4 h-4 mr-2 text-green-500";
  } else {
    element.className = "flex items-center text-sm text-gray-600";
    svg.innerHTML =
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
    svg.className = "w-4 h-4 mr-2 text-gray-400";
  }
}

function checkPasswordMatch() {
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const matchError = document.getElementById("matchError");

  if (confirmPassword && newPassword !== confirmPassword) {
    matchError.classList.remove("hidden");
  } else {
    matchError.classList.add("hidden");
  }
}

// Handle form submit
document
  .getElementById("changePasswordForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser) {
      alert("User tidak ditemukan! Silakan login ulang.");
      window.location.href = "/auth/login.html";
      return;
    }

    const oldPassword = document.getElementById("oldPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // Validation
    if (newPassword !== confirmPassword) {
      alert("Password baru dan konfirmasi password tidak cocok!");
      return;
    }

    if (newPassword.length < 6) {
      alert("Password minimal 6 karakter!");
      return;
    }

    if (oldPassword === newPassword) {
      alert("Password baru tidak boleh sama dengan password lama!");
      return;
    }

    // Show loading
    document.getElementById("loadingOverlay").classList.remove("hidden");
    document.getElementById("loadingOverlay").classList.add("flex");

    try {
      // Re-authenticate user with old password
      const credential = firebase.auth.EmailAuthProvider.credential(
        currentUser.email,
        oldPassword
      );

      await currentUser.reauthenticateWithCredential(credential);
      console.log("✅ Re-authentication successful");

      // Update password
      await currentUser.updatePassword(newPassword);
      console.log("✅ Password updated successfully");

      // Hide loading
      document.getElementById("loadingOverlay").classList.add("hidden");
      document.getElementById("loadingOverlay").classList.remove("flex");

      // Show success modal
      document.getElementById("successModal").classList.remove("hidden");
      document.getElementById("successModal").classList.add("flex");
    } catch (error) {
      console.error("❌ Error changing password:", error);

      // Hide loading
      document.getElementById("loadingOverlay").classList.add("hidden");
      document.getElementById("loadingOverlay").classList.remove("flex");

      let errorMessage = "Gagal mengubah password!";

      switch (error.code) {
        case "auth/wrong-password":
          errorMessage = "Password lama yang Anda masukkan salah!";
          break;
        case "auth/weak-password":
          errorMessage =
            "Password baru terlalu lemah! Gunakan kombinasi huruf, angka, dan simbol.";
          break;
        case "auth/requires-recent-login":
          errorMessage =
            "Sesi Anda telah berakhir. Silakan login ulang untuk mengubah password.";
          setTimeout(() => {
            window.location.href = "/auth/login.html";
          }, 2000);
          break;
      }

      alert(errorMessage);
    }
  });

// Close success modal
function closeSuccessModal() {
  document.getElementById("successModal").classList.add("hidden");
  document.getElementById("successModal").classList.remove("flex");
  goBack();
}

// Navigation
function goBack() {
  window.location.href = "profile.html";
}

function goToForgotPassword() {
  if (confirm("Anda akan diarahkan ke halaman reset password. Lanjutkan?")) {
    window.location.href = "/auth/forgot-password.html";
  }
}

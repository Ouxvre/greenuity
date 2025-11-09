    // TUNGGU SAMPAI SEMUA READY
    window.addEventListener("DOMContentLoaded", () => {
      console.log("🔄 Page loaded, checking auth...");

      // Tunggu authGuard available
      const checkAuthGuard = setInterval(() => {
        if (typeof authGuard === "function") {
          clearInterval(checkAuthGuard);

          // Jalankan auth guard SEKALI SAJA
          authGuard()
            .then((user) => {
              console.log("✅ User authenticated:", user);

              // Update UI dengan data user
              const userName = document.getElementById("userName");
              const profileEmail = document.getElementById("profileEmail");
              const profileImage = document.getElementById("profileImage");

              if (userName) {
                userName.textContent = user.displayName || "User";
              }

              if (profileEmail) {
                profileEmail.textContent = user.email || "-";
              }

              if (profileImage && user.photoURL) {
                profileImage.src = user.photoURL;
              }

              console.log("✅ Profile updated:", {
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
              });
            })
            .catch((err) => {
              console.error("❌ AuthGuard error:", err);
            });
        }
      }, 100);

      // Timeout jika authGuard tidak load dalam 5 detik
      setTimeout(() => {
        clearInterval(checkAuthGuard);
        console.error("❌ AuthGuard timeout - tidak terload!");
      }, 5000);
    });

    // Navigation functions
    function goToHome() {
      window.location.href = "/pages/dashboard/dashboard.html";
    }

    function goToMonitoring() {
      window.location.href = "/pages/monitoring/monitoring.html";
    }

    function goToIrrigation() {
      window.location.href = "/pages/irrigation/irrigation.html";
    }

    function goToEducation() {
      window.location.href = "/pages/edukasi/edukasi.html";
    }

    function goToEditProfile() {
      window.location.href = "edit-profile.html";
    }

    function goToChangePassword() {
      window.location.href = "change-password.html";
    }

    function goToTerms() {
      window.location.href = "terms&conditions.html";
    }

    function goToHelp() {
      const message = encodeURIComponent(
        "Halo, saya butuh bantuan terkait aplikasi Greenuity"
      );
      window.open("https://wa.me/6289668034206?text=" + message, "_blank");
    }

    // Toggle notification
    function toggleNotification() {
      const toggle = document.getElementById("notificationToggle");
      if (toggle.checked) {
        console.log("✅ Notifikasi diaktifkan");
      } else {
        console.log("❌ Notifikasi dinonaktifkan");
      }
    }

    // Logout
    async function handleLogout() {
      if (confirm("Apakah Anda yakin ingin keluar?")) {
        try {
          await auth.signOut();
          console.log("✅ Logout berhasil");
          window.location.href = "/index.html";
        } catch (error) {
          console.error("❌ Gagal logout:", error);
          alert("Gagal logout: " + error.message);
        }
      }
    }
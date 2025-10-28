// Handle Login
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const userCredential = await auth.signInWithEmailAndPassword(
      email,
      password
    );
    const user = userCredential.user;

    // Refresh status user dari server
    await user.reload();

    if (!user.emailVerified) {
      showAlert(
        "Email kamu belum diverifikasi. Silakan cek inbox kamu.",
        "error"
      );
      await auth.signOut();
      return;
    }

    showAlert("Login berhasil! Selamat datang " + user.email, "success");

    // Redirect ke dashboard setelah 1.5 detik
    setTimeout(() => {
      window.location.href = "../dashboard/dashboard.html";
    }, 1500);
  } catch (error) {
    console.error("Login error:", error);

    let errorMessage = "Terjadi kesalahan saat login";
    switch (error.code) {
      case "auth/user-not-found":
        errorMessage = "Email tidak terdaftar";
        break;
      case "auth/wrong-password":
        errorMessage = "Password salah";
        break;
      case "auth/invalid-email":
        errorMessage = "Format email tidak valid";
        break;
      case "auth/user-disabled":
        errorMessage = "Akun ini telah dinonaktifkan";
        break;
    }

    showAlert(errorMessage, "error");
  }
}

// Handle Register
async function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById("registerName").value;
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;

  if (password.length < 6) {
    showAlert("Password harus minimal 6 karakter", "error");
    return;
  }

  try {
    // Buat user baru
    const userCredential = await auth.createUserWithEmailAndPassword(
      email,
      password
    );
    const user = userCredential.user;

    // Update profile dengan nama
    await user.updateProfile({ displayName: name });

    // Simpan ke Firestore (optional)
    if (typeof db !== "undefined") {
      await db.collection("users").doc(user.uid).set({
        name,
        email,
        role: "user",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Kirim email verifikasi
    await user.sendEmailVerification({
      url: "https://greenuity-id.web.app/pages/auth/verify-email.html",
    });

    showAlert(
      "Pendaftaran berhasil! Silakan cek email kamu untuk verifikasi akun.",
      "success"
    );

    // Ganti ke tab login
    setTimeout(() => {
      switchTab("masuk");
      document.getElementById("loginEmail").value = email;
      document.getElementById("formDaftar").reset();
    }, 2000);
  } catch (error) {
    console.error("Register error:", error);

    let errorMessage = "Terjadi kesalahan saat pendaftaran";
    switch (error.code) {
      case "auth/email-already-in-use":
        errorMessage = "Email sudah terdaftar, silakan login";
        break;
      case "auth/invalid-email":
        errorMessage = "Format email tidak valid";
        break;
      case "auth/weak-password":
        errorMessage = "Password terlalu lemah, minimal 6 karakter";
        break;
    }

    showAlert(errorMessage, "error");
  }
}

// Handle Logout
async function handleLogout() {
  try {
    await auth.signOut();
    showAlert("Logout berhasil!", "success");
    setTimeout(() => {
      window.location.href = "../pages/login.html";
    }, 1000);
  } catch (error) {
    console.error("Logout error:", error);
    showAlert("Gagal logout: " + error.message, "error");
  }
}

// Kirim ulang email verifikasi
async function resendVerification() {
  const user = auth.currentUser;
  if (user && !user.emailVerified) {
    await user.sendEmailVerification({
      url: "https://greenuity-id.web.app/pages/auth/verify-email.html",
    });
    showAlert("Email verifikasi telah dikirim ulang!", "success");
  } else {
    showAlert("Kamu sudah verifikasi atau belum login.", "info");
  }
}

// Pantau perubahan status user
auth.onAuthStateChanged((user) => {
  const currentPage = window.location.pathname.split("/").pop();
  const protectedPages = ["dashboard.html", "profile.html"];

  if (user) {
    console.log("User aktif:", user.email);

    // Cegah akses ke login jika sudah login
    if (currentPage === "login.html" && user.emailVerified) {
      window.location.href = "../dashboard/dashboard.html";
    }

    // Jika belum verifikasi, arahkan ke verify-email.html
    if (!user.emailVerified && protectedPages.includes(currentPage)) {
      window.location.href = "../auth/verify-email.html";
    }
  } else {
    console.log("Tidak ada user login");
    if (protectedPages.includes(currentPage)) {
      window.location.href = "../auth/login.html";
    }
  }
});

// Ambil data user dari Firestore
async function getCurrentUserData() {
  const user = auth.currentUser;
  if (user && typeof db !== "undefined") {
    try {
      const doc = await db.collection("users").doc(user.uid).get();
      if (doc.exists) return doc.data();
    } catch (error) {
      console.error("Error getting user data:", error);
    }
  }
  return null;
}

// ==============================
//  UI: Alert System (Tailwind Modern Toast)
// ==============================
function showAlert(message, type = "info") {
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
  };

  // Buat container toast jika belum ada
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "fixed top-5 right-5 z-50 flex flex-col space-y-2";
    document.body.appendChild(container);
  }

  // Elemen toast
  const toast = document.createElement("div");
  toast.className = `${
    colors[type] || colors.info
  } text-white px-5 py-3 rounded-xl shadow-lg animate-slideIn`;
  toast.innerText = message;
  container.appendChild(toast);

  // Hilangkan setelah 3 detik
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// Animasi sederhana via CSS (bisa dimasukkan di style.css)
const style = document.createElement("style");
style.innerHTML = `
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slideIn {
  animation: slideIn 0.3s ease-out;
}
`;
document.head.appendChild(style);

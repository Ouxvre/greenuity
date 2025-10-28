document.addEventListener("DOMContentLoaded", () => {
  // Pantau status user login
  auth.onAuthStateChanged((user) => {
    const currentPage = window.location.pathname.split("/").pop();

    // Daftar halaman yang bisa diakses tanpa login
    const publicPages = ["login.html", "register.html", "verify-email.html", "forgot-password.html"];

    if (!user) {
      // Jika belum login dan halaman ini bukan public, redirect ke login
      if (!publicPages.includes(currentPage)) {
        window.location.href = "../auth/login.html";
      }
    } else {
      // Kalau user login tapi belum verifikasi email → arahkan ke halaman verifikasi
      if (!user.emailVerified && !publicPages.includes(currentPage)) {
        window.location.href = "../auth/verify-email.html";
      }
    }
  });
});

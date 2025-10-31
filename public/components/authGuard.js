// Auth Guard - Proteksi halaman
document.addEventListener("DOMContentLoaded", () => {
  console.log('🔐 AuthGuard loaded');
  
  window.authGuard = function () {
    return new Promise((resolve, reject) => {
      // Cek apakah Firebase Auth sudah tersedia
      if (typeof auth === 'undefined') {
        console.error('❌ Firebase Auth belum diinisialisasi!');
        reject('Firebase Auth not initialized');
        return;
      }

      console.log('🔍 Checking auth state...');

      auth.onAuthStateChanged((user) => {
        const currentPage = window.location.pathname.split("/").pop();
        const publicPages = [
          "index.html",
          "login.html", 
          "register.html",
          "verify-email.html",
          "forgot-password.html"
        ];

        console.log('👤 User:', user ? user.email : 'Not logged in');
        console.log('📄 Current page:', currentPage);

        if (!user) {
          // User belum login
          if (!publicPages.includes(currentPage)) {
            console.log('⚠️ Redirecting to login - user not authenticated');
            window.location.href = "/pages/auth/login.html";
          }
          reject("Belum login");
        } else if (!user.emailVerified && !publicPages.includes(currentPage)) {
          // Email belum diverifikasi
          console.log('⚠️ Redirecting to verify - email not verified');
          window.location.href = "/auth/verify-email.html";
          reject("Email belum diverifikasi");
        } else {
          // User sudah login dan verified
          console.log('✅ User authenticated and verified');
          resolve(user);
        }
      });
    });
  };
});
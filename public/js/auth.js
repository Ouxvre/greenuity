// Authentication Functions

// Handle Login
async function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    showAlert('Login berhasil! Selamat datang ' + userCredential.user.email, 'success');
    
    // Redirect ke dashboard setelah 1.5 detik
    setTimeout(() => {
      window.location.href = '../pages/dashboard.html';
    }, 1500);
  } catch (error) {
    console.error('Login error:', error);
    
    // Tampilkan pesan error yang user-friendly
    let errorMessage = 'Terjadi kesalahan saat login';
    
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage = 'Email tidak terdaftar';
        break;
      case 'auth/wrong-password':
        errorMessage = 'Password salah';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Format email tidak valid';
        break;
      case 'auth/user-disabled':
        errorMessage = 'Akun ini telah dinonaktifkan';
        break;
      default:
        errorMessage = error.message;
    }
    
    showAlert(errorMessage, 'error');
  }
}

// Handle Register
async function handleRegister(event) {
  event.preventDefault();
  
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  // Validasi password
  if (password.length < 6) {
    showAlert('Password harus minimal 6 karakter', 'error');
    return;
  }

  try {
    // Buat user baru
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    
    // Update profile dengan nama
    await userCredential.user.updateProfile({
      displayName: name
    });

    // Simpan data tambahan ke Firestore (opsional)
    if (typeof db !== 'undefined') {
      await db.collection('users').doc(userCredential.user.uid).set({
        name: name,
        email: email,
        role: 'user',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    showAlert('Pendaftaran berhasil! Akun Anda telah dibuat.', 'success');
    
    // Auto switch ke tab login setelah berhasil daftar
    setTimeout(() => {
      switchTab('masuk');
      document.getElementById('loginEmail').value = email;
      // Clear form register
      document.getElementById('formDaftar').reset();
    }, 2000);
    
  } catch (error) {
    console.error('Register error:', error);
    
    // Tampilkan pesan error yang user-friendly
    let errorMessage = 'Terjadi kesalahan saat pendaftaran';
    
    switch (error.code) {
      case 'auth/email-already-in-use':
        errorMessage = 'Email sudah terdaftar, silakan login';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Format email tidak valid';
        break;
      case 'auth/weak-password':
        errorMessage = 'Password terlalu lemah, minimal 6 karakter';
        break;
      default:
        errorMessage = error.message;
    }
    
    showAlert(errorMessage, 'error');
  }
}

// Handle Logout
async function handleLogout() {
  try {
    await auth.signOut();
    console.log('User logged out');
    window.location.href = '../pages/login.html';
  } catch (error) {
    console.error('Logout error:', error);
    showAlert('Gagal logout: ' + error.message, 'error');
  }
}

// Monitor auth state
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('User is signed in:', user.email);
    // Jika di halaman login, redirect ke dashboard
    if (window.location.pathname.includes('login.html')) {
      // window.location.href = '../pages/dashboard.html';
    }
  } else {
    console.log('No user signed in');
    // Jika di halaman yang memerlukan auth, redirect ke login
    const protectedPages = ['dashboard.html', 'profile.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (protectedPages.includes(currentPage)) {
      window.location.href = '../pages/login.html';
    }
  }
});

// Get current user data
async function getCurrentUserData() {
  const user = auth.currentUser;
  if (user && typeof db !== 'undefined') {
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists) {
        return doc.data();
      }
    } catch (error) {
      console.error('Error getting user data:', error);
    }
  }
  return null;
}
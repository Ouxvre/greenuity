let currentUser = null;
let photoFile = null;

// Load user data when page loads
window.addEventListener("DOMContentLoaded", () => {
  const checkAuthGuard = setInterval(() => {
    if (typeof authGuard === "function") {
      clearInterval(checkAuthGuard);

      authGuard()
        .then((user) => {
          currentUser = user;
          console.log("✅ User loaded:", user.email);
          loadUserData(user);
        })
        .catch((err) => {
          console.error("❌ Auth error:", err);
        });
    }
  }, 100);

  setTimeout(() => clearInterval(checkAuthGuard), 5000);
});

// Load user data to form
async function loadUserData(user) {
  try {
    // Set basic info
    document.getElementById("fullName").value = user.displayName || "";
    document.getElementById("email").value = user.email || "";

    // Load photo if exists
    if (user.photoURL) {
      document.getElementById("avatarPreview").src = user.photoURL;
      document.getElementById("avatarPreview").classList.remove("hidden");
      document.getElementById("defaultAvatar").classList.add("hidden");
    }

    // Load additional data from Firestore
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();

      if (userData.phone) {
        const raw = userData.phone.replace(/\D/g, ""); // pastikan hanya digit
        let formatted = raw;

        // Format menjadi: +62 xxxx-xxxx-xxxx
        if (raw.length >= 6) {
          formatted = `+${raw.slice(0, 2)} ${raw.slice(2, 6)}-${raw.slice(6)}`;
        } else if (raw.startsWith("62")) {
          formatted = `+${raw}`;
        }

        document.getElementById("phone").value = formatted;
      }
    }

    console.log("✅ User data loaded to form");
  } catch (error) {
    console.error("❌ Error loading user data:", error);
  }
}

// Preview photo before upload
function previewPhoto(event) {
  const file = event.target.files[0];
  if (file) {
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert("Ukuran foto maksimal 2MB!");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("File harus berupa gambar!");
      return;
    }

    photoFile = file;

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById("avatarPreview").src = e.target.result;
      document.getElementById("avatarPreview").classList.remove("hidden");
      document.getElementById("defaultAvatar").classList.add("hidden");
    };
    reader.readAsDataURL(file);

    console.log("✅ Photo selected:", file.name);
  }
}

// Upload photo to ImgBB (FREE!)
async function uploadPhotoToImgBB(file) {
  const apiKey = "42d364a3bba2c5f2cdafe80f86512326";

  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  return data.data.url; // Return URL foto
}

// Update uploadPhoto function
async function uploadPhoto(userId) {
  if (!photoFile) return null;

  try {
    console.log("📤 Uploading photo to ImgBB...");
    const photoURL = await uploadPhotoToImgBB(photoFile);
    console.log("✅ Photo uploaded:", photoURL);
    return photoURL;
  } catch (error) {
    console.error("❌ Error uploading photo:", error);
    throw error;
  }
}

// Handle form submit
document
  .getElementById("editProfileForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser) {
      alert("User tidak ditemukan!");
      return;
    }

    const fullName = document.getElementById("fullName").value.trim();
    
    // Ambil nomor dan buang semua simbol
    let phone = document.getElementById("phone").value.replace(/\D/g, "");

    // Jika user memasukkan 0 di depan, ubah ke 62
    if (phone.startsWith("0")) {
      phone = "62" + phone.substring(1);
    }

    // Wajib diawali 62
    if (!phone.startsWith("62")) {
      alert("Nomor telepon harus diawali 62");
      return;
    }

    // Show loading
    document.getElementById("loadingOverlay").classList.remove("hidden");
    document.getElementById("loadingOverlay").classList.add("flex");

    try {
      let photoURL = currentUser.photoURL;

      // Upload photo if changed
      if (photoFile) {
        photoURL = await uploadPhoto(currentUser.uid);
      }

      // Update Firebase Auth profile
      await currentUser.updateProfile({
        displayName: fullName,
        photoURL: photoURL,
      });

      // Update Firestore
      await db.collection("users").doc(currentUser.uid).set(
        {
          fullName: fullName,
          email: currentUser.email,
          phone: phone,
          photoURL: photoURL,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log("✅ Profile updated successfully");

      // Hide loading
      document.getElementById("loadingOverlay").classList.add("hidden");
      document.getElementById("loadingOverlay").classList.remove("flex");

      // Show success modal
      document.getElementById("successModal").classList.remove("hidden");
      document.getElementById("successModal").classList.add("flex");
    } catch (error) {
      console.error("❌ Error updating profile:", error);

      // Hide loading
      document.getElementById("loadingOverlay").classList.add("hidden");
      document.getElementById("loadingOverlay").classList.remove("flex");

      let errorMessage = "Gagal memperbarui profil!";

      if (error.code === "storage/unauthorized") {
        errorMessage =
          "Tidak memiliki izin untuk upload foto. Periksa Firebase Storage Rules.";
      } else if (error.code === "permission-denied") {
        errorMessage =
          "Tidak memiliki izin untuk mengubah data. Periksa Firestore Rules.";
      }

      alert(errorMessage + "\n\nDetail: " + error.message);
    }
  });

// Close success modal and go back
function closeSuccessModal() {
  document.getElementById("successModal").classList.add("hidden");
  document.getElementById("successModal").classList.remove("flex");
  goBack();
}

// Go back to profile page
function goBack() {
  window.location.href = "profile.html";
}

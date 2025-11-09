// Set year
document.getElementById("year").textContent = new Date().getFullYear();

// Referensi tombol
const acceptBtn = document.getElementById("acceptBtn");

// Cek status login + status persetujuan
firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) return; // belum login, biarkan normal

  try {
    const doc = await firebase
      .firestore()
      .collection("users")
      .doc(user.uid)
      .get();

    if (doc.exists && doc.data().termsAccepted) {
      // ✅ Sudah pernah setuju
      acceptBtn.disabled = true;
      acceptBtn.classList.add("opacity-60", "cursor-not-allowed");
      acceptBtn.textContent = "Sudah Disetujui ✅";

      Swal.fire({
        icon: "info",
        title: "Sudah Disetujui",
        text: "Kamu telah menyetujui Syarat & Ketentuan sebelumnya.",
        confirmButtonColor: "#173D45",
        width: "320px",
      });
    }
  } catch (err) {
    console.error("Error checking terms:", err);
  }
});

// Klik tombol setuju
document.getElementById("acceptBtn").addEventListener("click", async () => {
  const result = await Swal.fire({
    title: "Setujui Syarat & Ketentuan?",
    text: "Dengan ini Anda menyatakan telah membaca dan menyetujui syarat penggunaan aplikasi GreenUnity.",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, Setuju",
    cancelButtonText: "Batal",
    confirmButtonColor: "#173D45",
    cancelButtonColor: "#d33",
    width: "320px",
    padding: "1.2em",
  });

  if (result.isConfirmed) {
    const user = firebase.auth().currentUser;
    if (!user) return Swal.fire("Oops!", "Anda belum login.", "warning");

    try {
      await firebase.firestore().collection("users").doc(user.uid).set(
        {
          termsAccepted: true,
          acceptedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      Swal.fire({
        icon: "success",
        title: "Berhasil Disetujui ✅",
        text: "Terima kasih! Anda dapat melanjutkan ke halaman profil.",
        confirmButtonColor: "#173D45",
        width: "320px",
      }).then(() => {
        window.location.href = "profile.html";
      });
    } catch (err) {
      console.error("Firestore error:", err);
      Swal.fire("Error", "Gagal menyimpan ke Firestore.", "error");
    }
  }
});

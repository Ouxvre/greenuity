// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA5mXAa75PSalxvZLwoF-pCUMTWQIW1-5s",
  authDomain: "greenuity-id.firebaseapp.com",
  projectId: "greenuity-id",
  storageBucket: "greenuity-id.firebasestorage.app",
  messagingSenderId: "162448298083",
  appId: "1:162448298083:web:4d3e40be12bffa1c546856",
  measurementId: "G-GDXYRXDR5T",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firebase services
const auth = firebase.auth();
const db = firebase.firestore(); // Jika pakai Firestore

// Optional: Enable persistence untuk offline support
if (typeof firebase.firestore !== "undefined") {
  db.enablePersistence().catch((err) => {
    if (err.code == "failed-precondition") {
      console.log(
        "Multiple tabs open, persistence can only be enabled in one tab at a time."
      );
    } else if (err.code == "unimplemented") {
      console.log("The current browser does not support persistence.");
    }
  });
}

console.log("Firebase initialized successfully");

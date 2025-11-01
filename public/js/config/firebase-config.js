// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA5mXAa75PSalxvZLwoF-pCUMTWQIW1-5s",
  authDomain: "greenuity-id.firebaseapp.com",
  projectId: "greenuity-id",
  databaseURL: "https://greenuity-id-default-rtdb.asia-southeast1.firebasedatabase.app",
  messagingSenderId: "162448298083",
  appId: "1:162448298083:web:4d3e40be12bffa1c546856",
  measurementId: "G-GDXYRXDR5T",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const database = firebase.database();

// Enable offline persistence (optional, safe version)
try {
  db.enablePersistence().catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn(
        "⚠️ Multiple tabs open, persistence can only be enabled in one tab at a time."
      );
    } else if (err.code === "unimplemented") {
      console.warn("⚠️ The current browser does not support persistence.");
    }
  });
} catch (e) {
  console.error("❌ Error enabling persistence:", e);
}

console.log("✅ Firebase initialized successfully");

// Make available globally (optional)
window.auth = auth;
window.db = db;
window.database = database;

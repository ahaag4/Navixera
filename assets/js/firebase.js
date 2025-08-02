import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCn9YSO4-ksWl6JBqIcEEuLx2EJN8jMj4M",
  authDomain: "svms-c0232.firebaseapp.com",
  databaseURL: "https://svms-c0232-default-rtdb.firebaseio.com",
  projectId: "svms-c0232",
  storageBucket: "svms-c0232.firebasestorage.app",
  messagingSenderId: "359201898609",
  appId: "1:359201898609:web:893ef076207abb06471bd0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Set session persistence to local
setPersistence(auth, browserLocalPersistence).then(() => {
  console.log("Session persistence set to local.");
}).catch((error) => {
  console.error("Error setting persistence:", error);
});

export { auth, db };

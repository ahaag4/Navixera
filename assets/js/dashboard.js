import { auth, db } from "./firebase.js"; import { doc, getDoc, } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Initialize Dashboard export async function initializeDashboard() { auth.onAuthStateChanged(async (user) => { if (!user) { alert("Not signed in. Redirecting to sign-in page."); window.location.href = "login.html"; return; }

try {
  const userDoc = await getDoc(doc(db, "users", user.uid));

  if (!userDoc.exists()) {
    alert("User data not found!");
    auth.signOut();
    window.location.href = "login.html";
    return;
  }

  const userData = userDoc.data();
  const role = userData.role;
  const approved = userData.approved ?? false;

  // 🔒 Check if user is approved
  if (!approved) {
    alert("⛔ Your account is not approved yet. Please wait for admin approval.");
    auth.signOut();
    return;
  }

  // ✅ Role-based redirection
  switch (role) {
    case "customer":
      window.location.href = 'sms.html';
      break;
    case "company":
      window.location.href = 'comadmin.html';
      break;
    case "super-admin":
      window.location.href = 'superadmin.html';
      break;
    default:
      alert("Role not recognized. Redirecting to sign-in.");
      auth.signOut();
      window.location.href = "login.html";
  }
} catch (error) {
  console.error("Error fetching user data:", error);
  alert("An error occurred. Please try again.");
  auth.signOut();
  window.location.href = "login.html";
}

}); }


// dashboard.js (Realtime DB version)
import { auth, db } from "./firebase.js";
import {
  ref,
  get,
  child
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// Initialize Dashboard
export async function initializeDashboard() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      alert("⚠️ Not signed in. Redirecting...");
      window.location.href = "login.html";
      return;
    }

    try {
      const userRef = ref(db);
      const snapshot = await get(child(userRef, `users/${user.uid}`));

      if (!snapshot.exists()) {
        alert("❌ User record not found.");
        await auth.signOut();
        window.location.href = "login.html";
        return;
      }

      const userData = snapshot.val();

      // ✅ Approval Check
      if (!userData.approved) {
        alert("⏳ Your account is pending approval by the admin.");
        await auth.signOut();
        window.location.href = "login.html";
        return;
      }

      // ✅ Role Routing
      const role = userData.role;
      switch (role) {
        case "customer":
          window.location.href = "sms.html";
          break;
        case "company":
          window.location.href = "comadmin.html";
          break;
        case "super-admin":
          window.location.href = "superadmin.html";
          break;
        default:
          alert("⚠️ Unknown role. Access denied.");
          await auth.signOut();
          window.location.href = "login.html";
      }

    } catch (error) {
      console.error("Dashboard error:", error);
      alert("❌ Something went wrong.");
      await auth.signOut();
      window.location.href = "login.html";
    }
  });
}

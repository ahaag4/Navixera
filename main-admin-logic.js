// ✅ Add company approval, full profile view, edit, delete, individual vehicle tracking, and alarm trigger

// === Company Table Update ===
function loadCompanyTable() {
  const tbody = document.getElementById("companyTable");
  tbody.innerHTML = "";
  db.ref("users").once("value", (snap) => {
    const users = snap.val();
    for (const uid in users) {
      const user = users[uid];
      const companies = user.vehicle?.companies || {};
      for (const name in companies) {
        const vehicles = companies[name].vehicle || {};
        let deliveryCount = 0;
        for (const v in vehicles) {
          deliveryCount += Object.keys(vehicles[v].deliveries || {}).length;
        }
        const approved = user.approved === true;
        const statusLabel = approved ? "✅ Approved" : "❌ Pending";
        const actions = `
          <button class='btn btn-sm btn-info me-1' onclick="viewProfile('${uid}')">View</button>
          <button class='btn btn-sm btn-warning me-1' onclick="editProfile('${uid}')">Edit</button>
          <button class='btn btn-sm btn-danger me-1' onclick="deleteCompany('${uid}')">Delete</button>
          ${!approved ? `<button class='btn btn-success btn-sm' onclick="approveCompany('${uid}')">Approve</button>` : ""}
        `;
        const row = `<tr><td>${name}</td><td>${Object.keys(vehicles).length}</td><td>${deliveryCount}</td><td>${statusLabel}</td><td>${actions}</td></tr>`;
        tbody.innerHTML += row;
      }
    }
  });
}

function approveCompany(uid) {
  db.ref(`users/${uid}`).update({ approved: true });
  alert("✅ Company Approved");
  loadCompanyTable();
}

function deleteCompany(uid) {
  if (confirm("Are you sure to delete this company?")) {
    db.ref(`users/${uid}`).remove();
    alert("❌ Company Deleted");
    loadCompanyTable();
  }
}

function viewProfile(uid) {
  db.ref(`users/${uid}`).once("value", (snap) => {
    const data = snap.val();
    alert(`📋 Profile Info:\nName: ${data.name || "-"}\nEmail: ${data.email || "-"}\nPhone: ${data.phone || "-"}`);
  });
}

function editProfile(uid) {
  const name = prompt("Enter new name:");
  const email = prompt("Enter new email:");
  const phone = prompt("Enter phone:");
  if (name || email || phone) {
    db.ref(`users/${uid}`).update({
      ...(name && { name }),
      ...(email && { email }),
      ...(phone && { phone }),
    });
    alert("✅ Profile updated");
  }
}

// ✅ Track Vehicle by ID (input box + map)
document.addEventListener("DOMContentLoaded", () => {
  const input = document.createElement("input");
  input.className = "form-control my-3";
  input.placeholder = "Enter Vehicle ID to track";
  input.addEventListener("input", (e) => {
    const vid = e.target.value.trim();
    if (vid.length < 3) return;
    db.ref("users").once("value", (snap) => {
      const users = snap.val();
      for (const uid in users) {
        const companies = users[uid].vehicle?.companies || {};
        for (const cname in companies) {
          const vehicles = companies[cname].vehicle || {};
          if (vehicles[vid]) {
            const [lat, lng] = (vehicles[vid].gps || "0,0").split(",").map(Number);
            alert(`📍 ${vid} Location: ${lat}, ${lng}`);
            return;
          }
        }
      }
      alert("Vehicle not found.");
    });
  });
  document.querySelector("#map").parentNode.insertBefore(input, document.querySelector("#map"));
});

// ✅ Trigger Alarm for any company manually
function triggerAlarm(uid) {
  db.ref(`users/${uid}/vehicle/last_trigger`).set({
    status: "alert",
    time: new Date().toLocaleString(),
    location: "Manual Trigger from Admin",
  });
  alert("🚨 Alarm triggered for this company!");
}

// ✅ Add a button in company table to manually trigger alarm
// Inside loadCompanyTable actions block, add:
// <button class='btn btn-danger btn-sm' onclick="triggerAlarm('${uid}')">Alarm</button>

// 🔐 Logout
function logout() {
  auth.signOut().then(() => window.location.href = "login.html");
}

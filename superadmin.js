// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCn9YSO4-ksWl6JBqIcEEuLx2EJN8jMj4M",
  authDomain: "svms-c0232.firebaseapp.com",
  databaseURL: "https://svms-c0232-default-rtdb.firebaseio.com",
  projectId: "svms-c0232",
  storageBucket: "svms-c0232.appspot.com",
  messagingSenderId: "359201898609",
  appId: "1:359201898609:web:893ef076207abb06471bd0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// Auth Check
auth.onAuthStateChanged(user => {
  if (!user) return location.href = "login.html";
  db.ref(`users/${user.uid}`).once("value", snap => {
    const data = snap.val();
    if (data?.role !== "super-admin") return location.href = "dashboard.html";
    initializeDashboard();
  });
});

function logout() {
  auth.signOut().then(() => location.href = "login.html");
}

function initializeDashboard() {
  loadStats();
  loadPendingApprovals();
  loadApprovedCompanies();
  setupMap();
}

function loadStats() {
  db.ref("users").once("value", snap => {
    let totalCompanies = 0, totalVehicles = 0, totalDeliveries = 0, alertsToday = 0;
    const users = snap.val() || {};

    for (const uid in users) {
      const u = users[uid];
      const companies = u.vehicle?.companies || {};
      for (const cname in companies) {
        totalCompanies++;
        const vehicles = companies[cname].vehicle || {};
        totalVehicles += Object.keys(vehicles).length;
        for (const vid in vehicles) {
          totalDeliveries += Object.keys(vehicles[vid].deliveries || {}).length;
        }
      }
      if (u.vehicle?.last_trigger?.status === "alert") alertsToday++;
    }

    document.getElementById("totalCompanies").innerText = totalCompanies;
    document.getElementById("totalVehicles").innerText = totalVehicles;
    document.getElementById("totalDeliveries").innerText = totalDeliveries;
    document.getElementById("alertsToday").innerText = alertsToday;
  });
}

function loadPendingApprovals() {
  const list = document.getElementById("pendingUsersList");
  list.innerHTML = "";

  db.ref("users").once("value", snap => {
    const users = snap.val() || {};
    for (const uid in users) {
      const u = users[uid];
      if ((u.role === "company" || u.role === "customer") && u.approved !== true) {
        const displayName = u.companyName || u.email || uid;
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        li.innerHTML = `
          ${displayName} (${u.role})
          <div>
            <button class="btn btn-success btn-sm me-2" onclick="approveUser('${uid}')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="rejectUser('${uid}')">Reject</button>
          </div>
        `;
        list.appendChild(li);
      }
    }
  });
}

function approveUser(uid) {
  db.ref(`users/${uid}`).update({ approved: true })
    .then(() => {
      alert("✅ Approved");
      loadPendingApprovals();
      loadApprovedCompanies();
    });
}

function rejectUser(uid) {
  if (confirm("Delete this user?")) {
    db.ref(`users/${uid}`).remove()
      .then(() => {
        alert("❌ Rejected and removed");
        loadPendingApprovals();
      });
  }
}

function loadApprovedCompanies() {
  const table = document.getElementById("companyTable");
  table.innerHTML = "";

  db.ref("users").once("value", snap => {
    const users = snap.val() || {};
    for (const uid in users) {
      const u = users[uid];
      if (u.role === "company" && u.approved === true) {
        const companies = u.vehicle?.companies || {};
        for (const cname in companies) {
          const vehicles = companies[cname].vehicle || {};
          let deliveries = 0;
          for (const vid in vehicles) {
            deliveries += Object.keys(vehicles[vid].deliveries || {}).length;
          }
          const row = `
            <tr>
              <td>${cname}</td>
              <td>${Object.keys(vehicles).length}</td>
              <td>${deliveries}</td>
              <td>
                <button class='btn btn-primary btn-sm' onclick="editCompany('${uid}', '${cname}')">Edit</button>
                <button class='btn btn-danger btn-sm' onclick="deleteCompany('${uid}')">Delete</button>
              </td>
            </tr>
          `;
          table.innerHTML += row;
        }
      }
    }
  });
}

function editCompany(uid, oldName) {
  const name = prompt("Enter new company name:", oldName);
  if (!name || name === oldName) return;

  db.ref(`users/${uid}/vehicle/companies/${oldName}`).once("value", snap => {
    const data = snap.val();
    if (!data) return alert("Company not found");
    const updates = {};
    updates[`users/${uid}/vehicle/companies/${name}`] = data;
    updates[`users/${uid}/vehicle/companies/${oldName}`] = null;
    db.ref().update(updates).then(() => {
      alert("✅ Company name updated");
      loadApprovedCompanies();
    });
  });
}

function deleteCompany(uid) {
  if (confirm("Are you sure to delete this company?")) {
    db.ref(`users/${uid}/vehicle/companies`).remove()
      .then(() => {
        alert("❌ Company deleted");
        loadApprovedCompanies();
      });
  }
}

function setupMap() {
  const map = L.map("map").setView([19.2183, 72.9781], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  const markers = {};

  db.ref("users").on("value", snap => {
    const users = snap.val() || {};
    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        for (const vid in vehicles) {
          const gps = vehicles[vid].gps || "0,0";
          const [lat, lng] = gps.split(",").map(Number);
          if (!markers[vid]) {
            markers[vid] = L.marker([lat, lng]).addTo(map).bindPopup(vid);
          } else {
            markers[vid].setLatLng([lat, lng]);
          }
        }
      }
    }
  });
}

document.getElementById("trackVehicleId").addEventListener("input", (e) => {
  const id = e.target.value.trim();
  const result = document.getElementById("vehicleTrackerResult");
  if (!id) return result.innerHTML = "";

  db.ref("users").once("value", snap => {
    const users = snap.val() || {};
    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        if (vehicles[id]) {
          const v = vehicles[id];
          result.innerHTML = `<div class='alert alert-info'>🚚 ${id} at ${v.gps || "Unknown"}, Battery: ${v.battery || "N/A"}%</div>`;
          return;
        }
      }
    }
    result.innerHTML = `<div class='alert alert-warning'>Vehicle not found</div>`;
  });
});

function triggerManualAlarm() {
  const id = document.getElementById("alarmVehicleId").value.trim();
  const statusBox = document.getElementById("alarmStatus");
  if (!id) return;

  db.ref("users").once("value", snap => {
    const users = snap.val() || {};
    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        if (vehicles[id]) {
          db.ref(`users/${uid}/vehicle/last_trigger`).set({
            status: "alert",
            vehicleId: id,
            time: new Date().toISOString(),
            location: vehicles[id].gps || "Unknown"
          });
          statusBox.innerHTML = `<div class='alert alert-danger'>🚨 Alarm Triggered for ${id}</div>`;
          return;
        }
      }
    }
    statusBox.innerHTML = `<div class='alert alert-warning'>Vehicle ID not found</div>`;
  });
}

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
    for (const uid in snap.val()) {
      const u = snap.val()[uid];
      const companies = u.vehicle?.companies || {};
      for (const cname in companies) {
        totalCompanies++;
        const v = companies[cname].vehicle || {};
        totalVehicles += Object.keys(v).length;
        for (const vid in v) {
          totalDeliveries += Object.keys(v[vid].deliveries || {}).length;
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
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        li.innerHTML = `
          ${u.companyName || u.email} (${u.role})
          <div>
            <button class="btn btn-success btn-sm me-2" onclick="approveUser('${uid}')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="rejectUser('${uid}')">Reject</button>
          </div>`;
        list.appendChild(li);
      }
    }
  });
}

function approveUser(uid) {
  db.ref(`users/${uid}`).update({ approved: true });
  alert("✅ Approved");
  loadPendingApprovals();
  loadApprovedCompanies();
}

function rejectUser(uid) {
  if (confirm("Delete this user?")) {
    db.ref(`users/${uid}`).remove();
    alert("❌ Rejected and removed");
    loadPendingApprovals();
  }
}

function loadApprovedCompanies() {
  const table = document.getElementById("companyTable");
  table.innerHTML = "";
  db.ref("users").once("value", snap => {
    for (const uid in snap.val()) {
      const u = snap.val()[uid];
      if (u.role === "company" && u.approved === true) {
        const companies = u.vehicle?.companies || {};
        for (const cname in companies) {
          const veh = companies[cname].vehicle || {};
          let deliveries = 0;
          for (const vid in veh) {
            deliveries += Object.keys(veh[vid].deliveries || {}).length;
          }
          const row = `<tr>
            <td>${cname}</td>
            <td>${Object.keys(veh).length}</td>
            <td>${deliveries}</td>
            <td>
              <button class='btn btn-primary btn-sm' onclick="editCompany('${uid}', '${cname}')">Edit</button>
              <button class='btn btn-danger btn-sm' onclick="deleteCompany('${uid}', '${cname}')">Delete</button>
            </td>
          </tr>`;
          table.innerHTML += row;
        }
      }
    }
  });
}

function editCompany(uid, oldName) {
  const name = prompt("Enter new company name:", oldName);
  if (!name || name === oldName) return;
  db.ref(`users/${uid}/vehicle/companies`).once("value", snap => {
    const oldData = snap.val()[oldName];
    const updates = {};
    updates[`users/${uid}/vehicle/companies/${name}`] = oldData;
    updates[`users/${uid}/vehicle/companies/${oldName}`] = null;
    db.ref().update(updates);
    alert("✅ Company updated");
    loadApprovedCompanies();
  });
}

function deleteCompany(uid, name) {
  if (confirm("Are you sure to delete this company?")) {
    db.ref(`users/${uid}/vehicle/companies/${name}`).remove();
    alert("❌ Company deleted");
    loadApprovedCompanies();
  }
}

function setupMap() {
  const map = L.map("map").setView([19.2183, 72.9781], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  const markers = {};
  db.ref("users").on("value", snap => {
    for (const uid in snap.val()) {
      const companies = snap.val()[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        for (const vid in vehicles) {
          const [lat, lng] = (vehicles[vid].gps || "0,0").split(",").map(Number);
          if (!markers[vid]) {
            markers[vid] = L.marker([lat, lng]).addTo(map).bindPopup(`${vid}`);
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
  if (!id) return;
  db.ref("users").once("value", snap => {
    for (const uid in snap.val()) {
      const comps = snap.val()[uid].vehicle?.companies || {};
      for (const c in comps) {
        const vehicles = comps[c].vehicle || {};
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
    for (const uid in snap.val()) {
      const ref = snap.val()[uid].vehicle?.companies;
      for (const c in ref) {
        const veh = ref[c].vehicle;
        if (veh && veh[id]) {
          db.ref(`users/${uid}/vehicle/last_trigger`).set({
            status: "alert",
            vehicleId: id,
            time: new Date().toISOString(),
            location: veh[id].gps || "Unknown"
          });
          statusBox.innerHTML = `<div class='alert alert-danger'>🚨 Alarm Triggered for ${id}</div>`;
          return;
        }
      }
    }
    statusBox.innerHTML = `<div class='alert alert-warning'>Vehicle ID not found</div>`;
  });
}

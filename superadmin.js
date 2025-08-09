// Firebase Initialization
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

let map, historyMap, markers = {}, historyMarkers = [];

// Auth Check
auth.onAuthStateChanged(user => {
  if (!user) return location.href = "login.html";
  db.ref(`users/${user.uid}`).once("value", snap => {
    const data = snap.val();
    if (data?.role !== "super-admin") return location.href = "dashboard.html";
    initializeDashboard();
  });
});

// Dashboard Init
function initializeDashboard() {
  loadStats();
  loadPendingApprovals();
  loadApprovedCompanies();
  setupMap();
  setupHistoryMap();

  // User/vehicle dropdown population for movement & alarm sections
  loadAllUsersForSelect();

  // Vehicle Tracker input
  document.getElementById("trackVehicleId").addEventListener("input", vehicleTracker);

  // Optional: "Enter" key for history search
  if (document.getElementById("historyVehicleSelect")) {
    document.getElementById("historyVehicleSelect").addEventListener("keyup", function(e) {
      if (e.key === "Enter") loadMovementHistory();
    });
  }
}

// Populate all user dropdowns for history/alarm
function loadAllUsersForSelect() {
  db.ref("users").once("value").then(snap => {
    const users = snap.val() || {};
    const historySelect = document.getElementById("historyUserSelect");
    const alarmSelect = document.getElementById("alarmUserSelect");

    historySelect.innerHTML = "<option value=''>Select User</option>";
    alarmSelect.innerHTML = "<option value=''>Select User</option>";

    for (const uid in users) {
      if (users[uid].role === "company" || users[uid].role === "customer") {
        const name = users[uid].companyName || users[uid].email || uid;
        historySelect.innerHTML += `<option value="${uid}">${name}</option>`;
        alarmSelect.innerHTML += `<option value="${uid}">${name}</option>`;
      }
    }
  });
}

// Load vehicles for the selected user into provided dropdown
function loadUserVehicles(type) {
  const userId = document.getElementById(type + "UserSelect").value;
  const vehicleSelect = document.getElementById(type + "VehicleSelect");
  vehicleSelect.innerHTML = "<option value=''>Select Vehicle</option>";
  if (!userId) return;

  db.ref(`users/${userId}/vehicle/companies`).once("value").then(snap => {
    const companies = snap.val() || {};
    for (const cname in companies) {
      const vehicles = companies[cname].vehicle || {};
      for (const vid in vehicles) {
        vehicleSelect.innerHTML += `<option value="${vid}">${vid} (${cname})</option>`;
      }
    }
  });
}

// Dashboard Stats
function loadStats() {
  db.ref("users").once("value", snap => {
    let totalCompanies = 0, totalVehicles = 0, totalDeliveries = 0, alertsToday = 0;
    const users = snap.val() || {};
    for (const uid in users) {
      const u = users[uid];
      const companies = u.vehicle?.companies || {};
      totalCompanies += Object.keys(companies).length;
      for (const cname in companies) {
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

// Load Pending Approvals
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
          </div>`;
        list.appendChild(li);
      }
    }
  });
}

function approveUser(uid) {
  db.ref(`users/${uid}`).update({ approved: true }).then(() => {
    alert("✅ Approved");
    loadPendingApprovals();
    loadApprovedCompanies();
  });
}

function rejectUser(uid) {
  if (confirm("Delete this user?")) {
    db.ref(`users/${uid}`).remove().then(() => {
      alert("❌ Rejected and removed");
      loadPendingApprovals();
      loadApprovedCompanies();
    });
  }
}

// Companies Table
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
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${cname}</td>
            <td>${Object.keys(vehicles).length}</td>
            <td>${deliveries}</td>
            <td>
              <button class='btn btn-primary btn-sm me-1' onclick="editCompany('${uid}', '${cname}')">Edit</button>
              <button class='btn btn-danger btn-sm' onclick="deleteCompany('${uid}', '${cname}')">Delete</button>
            </td>
          `;
          table.appendChild(row);
        }
      }
    }
  });
}

function editCompany(uid, oldName) {
  const name = prompt("Enter new company name:", oldName);
  if (!name || name.trim() === "" || name === oldName) return;
  db.ref(`users/${uid}/vehicle/companies/${oldName}`).once("value").then(snap => {
    const data = snap.val();
    if (!data) {
      alert("Company data not found.");
      return;
    }
    const updates = {};
    updates[`users/${uid}/vehicle/companies/${name}`] = data;
    updates[`users/${uid}/vehicle/companies/${oldName}`] = null;
    db.ref().update(updates).then(() => {
      alert("✅ Company name updated");
      loadApprovedCompanies();
    });
  });
}

function deleteCompany(uid, companyName) {
  if (confirm(`Are you sure you want to delete the company "${companyName}"?`)) {
    db.ref(`users/${uid}/vehicle/companies/${companyName}`).remove().then(() => {
      alert("❌ Company deleted");
      loadApprovedCompanies();
    });
  }
}

// Live Map
function setupMap() {
  map = L.map("map").setView([19.2183, 72.9781], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  markers = {};

  db.ref("users").on("value", snap => {
    const users = snap.val() || {};
    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        for (const vid in vehicles) {
          const gps = vehicles[vid].gps || "0,0";
          const [lat, lng] = gps.split(",").map(Number);
          if (lat === 0 && lng === 0) continue;
          if (!markers[vid]) {
            markers[vid] = L.marker([lat, lng]).addTo(map).bindPopup(`Vehicle ID: ${vid}<br>Company: ${cname}`);
          } else {
            markers[vid].setLatLng([lat, lng]);
          }
        }
      }
    }
  });
}

// For movement history map, one user/vehicle at a time
function setupHistoryMap() {
  historyMap = L.map("historyMap").setView([19.2183, 72.9781], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(historyMap);
}

// Load movement history for a selected user/vehicle
function loadMovementHistory() {
  const userId = document.getElementById("historyUserSelect").value;
  const vehicleId = document.getElementById("historyVehicleSelect").value;
  const deleteBtn = document.getElementById("deleteHistoryBtn");

  clearHistoryMap();

  if (!userId || !vehicleId) {
    alert("Please select both User and Vehicle.");
    deleteBtn.style.display = "none";
    return;
  }

  db.ref(`users/${userId}/vehicle/companies`).once("value").then(snap => {
    let movementData = [];
    const companies = snap.val() || {};

    for (const cname in companies) {
      const vehicle = companies[cname].vehicle?.[vehicleId];
      if (vehicle) {
        const deliveries = vehicle.deliveries || {};
        for (const delId in deliveries) {
          const delivery = deliveries[delId];
          if (delivery.route && Array.isArray(delivery.route)) {
            movementData = movementData.concat(delivery.route);
          } else if (delivery.location) {
            movementData.push(delivery.location);
          }
        }
      }
    }

    if (movementData.length === 0) {
      alert("No movement history found for this vehicle.");
      deleteBtn.style.display = "none";
      return;
    }

    const latLngs = movementData.map(locStr => locStr.split(",").map(Number))
      .filter(coords => !isNaN(coords[0]) && !isNaN(coords[1]));

    historyMarkers = latLngs.map(coords =>
      L.circleMarker(coords, {
        radius: 5,
        color: "#0d6efd",
        fillColor: "#0d6efd",
        fillOpacity: 0.6
      }).addTo(historyMap)
    );

    const polyline = L.polyline(latLngs, { color: "blue" }).addTo(historyMap);
    historyMap.fitBounds(polyline.getBounds(), {padding:[30, 30]});

    deleteBtn.style.display = "inline-block";
    deleteBtn.onclick = function() { deleteMovementHistory(userId, vehicleId); };
  });
}

function clearHistoryMap() {
  if (!historyMap) return;
  historyMarkers.forEach(m => historyMap.removeLayer(m));
  historyMarkers = [];
  historyMap.eachLayer(layer => {
    if (layer instanceof L.Polyline) historyMap.removeLayer(layer);
  });
}

// Remove a vehicle's movement data for a user
function deleteMovementHistory(userId, vehicleId) {
  if (!confirm("Are you sure you want to delete this vehicle's movement history?")) return;

  db.ref(`users/${userId}/vehicle/companies`).once("value").then(snap => {
    const companies = snap.val() || {};
    let found = false;
    for (const cname in companies) {
      if (companies[cname].vehicle?.[vehicleId]) {
        db.ref(`users/${userId}/vehicle/companies/${cname}/vehicle/${vehicleId}/deliveries`)
          .remove()
          .then(() => {
            alert("✅ Movement history deleted.");
            clearHistoryMap();
            document.getElementById("deleteHistoryBtn").style.display = "none";
          });
        found = true;
        break;
      }
    }
    if (!found) {
      alert("Vehicle not found for this user.");
    }
  });
}

// ---- Vehicle Tracker by ID (standalone, unchanged) ----
function vehicleTracker(e) {
  const id = e.target.value.trim();
  const result = document.getElementById("vehicleTrackerResult");
  if (!id) return result.innerHTML = "";

  db.ref("users").once("value", snap => {
    let found = false;
    for (const uid in snap.val()) {
      const companies = snap.val()[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        if (vehicles[id]) {
          const v = vehicles[id];
          result.innerHTML = `<div class='alert alert-info'>🚚 ${id} at ${v.gps || "Unknown"}, Battery: ${v.battery || "N/A"}%</div>`;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) result.innerHTML = `<div class='alert alert-warning'>Vehicle not found</div>`;
  });
}

// Manual Alarm Trigger, scoped per user/vehicle
function triggerManualAlarm() {
  const userId = document.getElementById("alarmUserSelect").value;
  const vehicleId = document.getElementById("alarmVehicleSelect").value;
  const statusBox = document.getElementById("alarmStatus");

  statusBox.innerHTML = "";

  if (!userId || !vehicleId) {
    statusBox.innerHTML = `<div class='alert alert-warning'>Please select both User and Vehicle.</div>`;
    return;
  }

  db.ref(`users/${userId}/vehicle/companies`).once("value").then(snap => {
    let found = false;
    const companies = snap.val() || {};

    for (const cname in companies) {
      const v = companies[cname].vehicle?.[vehicleId];
      if (v) {
        found = true;
        db.ref(`users/${userId}/vehicle/last_trigger`).set({
          status: "alert",
          vehicleId: vehicleId,
          time: new Date().toISOString(),
          location: v.gps || "Unknown"
        }).then(() => {
          statusBox.innerHTML = `<div class='alert alert-danger'>🚨 Alarm Triggered for ${vehicleId}</div>`;
        });
        break;
      }
    }

    if (!found) {
      statusBox.innerHTML = `<div class='alert alert-warning'>Vehicle not found for this user.</div>`;
    }
  });
}

// Logout
function logout() {
  auth.signOut().then(() => location.href = "login.html");
}

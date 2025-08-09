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

// Initialize Dashboard
function initializeDashboard() {
  loadStats();
  loadPendingApprovals();
  loadApprovedCompanies();
  setupMap();
  setupHistoryMap();
  setupEventListeners();
}

// Logout
function logout() {
  auth.signOut().then(() => location.href = "login.html");
}

// Load Dashboard Stats
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

// Load Pending Approvals List
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

// Approve User
function approveUser(uid) {
  db.ref(`users/${uid}`).update({ approved: true }).then(() => {
    alert("✅ Approved");
    loadPendingApprovals();
    loadApprovedCompanies();
  });
}

// Reject User
function rejectUser(uid) {
  if (confirm("Delete this user?")) {
    db.ref(`users/${uid}`).remove().then(() => {
      alert("❌ Rejected and removed");
      loadPendingApprovals();
      loadApprovedCompanies();
    });
  }
}

// Load Approved Companies Table
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

// Edit Company Name
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

// Delete Company
function deleteCompany(uid, companyName) {
  if (confirm(`Are you sure you want to delete the company "${companyName}"?`)) {
    db.ref(`users/${uid}/vehicle/companies/${companyName}`).remove().then(() => {
      alert("❌ Company deleted");
      loadApprovedCompanies();
    });
  }
}


// Setup Leaflet Map for Live Locations
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

// Setup Leaflet Map for Movement History
function setupHistoryMap() {
  historyMap = L.map("historyMap").setView([19.2183, 72.9781], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(historyMap);
}

// Load Movement History for Vehicle and show on map
function loadMovementHistory() {
  const vehicleId = document.getElementById("historyVehicleId").value.trim();
  const deleteBtn = document.getElementById("deleteHistoryBtn");
  clearHistoryMap();

  if (!vehicleId) {
    alert("Please enter a Vehicle ID.");
    return;
  }

  // Find movement history in DB (assuming it's stored under deliveries inside each vehicle)
  db.ref("users").once("value").then(snap => {
    const users = snap.val() || {};
    let movementData = [];

    outer: for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        if (vehicles[vehicleId]) {
          const deliveries = vehicles[vehicleId].deliveries || {};
          for (const delId in deliveries) {
            const delivery = deliveries[delId];
            if (delivery.route && Array.isArray(delivery.route)) {
              movementData = movementData.concat(delivery.route);
            } else if (delivery.location) {
              movementData.push(delivery.location);
            }
          }
          break outer;
        }
      }
    }

    if (movementData.length === 0) {
      alert("No movement history found for this vehicle.");
      deleteBtn.style.display = "none";
      return;
    }

    // Show history markers and polyline
    const latLngs = movementData.map(locStr => {
      const [lat, lng] = locStr.split(",").map(Number);
      return [lat, lng];
    }).filter(coords => !isNaN(coords[0]) && !isNaN(coords[1]));

    if (latLngs.length === 0) {
      alert("Invalid movement history data.");
      deleteBtn.style.display = "none";
      return;
    }

    historyMarkers = latLngs.map(coords => L.circleMarker(coords, {
      radius: 5,
      color: "#0d6efd",
      fillColor: "#0d6efd",
      fillOpacity: 0.6
    }).addTo(historyMap));

    const polyline = L.polyline(latLngs, { color: "blue" }).addTo(historyMap);

    historyMap.fitBounds(polyline.getBounds());

    // Show delete button and bind event
    deleteBtn.style.display = "inline-block";
    deleteBtn.onclick = () => deleteMovementHistory(vehicleId);
  });
}

// Clear movement history map markers and layers
function clearHistoryMap() {
  historyMarkers.forEach(m => historyMap.removeLayer(m));
  historyMarkers = [];
  // Remove polylines (all except tile layer)
  historyMap.eachLayer(layer => {
    if (layer instanceof L.Polyline) {
      historyMap.removeLayer(layer);
    }
  });
}

// Delete Movement History for Vehicle
function deleteMovementHistory(vehicleId) {
  if (!confirm(`Are you sure you want to delete movement history for vehicle "${vehicleId}"? This action is irreversible.`)) {
    return;
  }
  db.ref("users").once("value").then(snap => {
    const users = snap.val() || {};
    let found = false;

    const updates = {};

    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        if (vehicles[vehicleId]) {
          updates[`users/${uid}/vehicle/companies/${cname}/vehicle/${vehicleId}/deliveries`] = null;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      alert("Vehicle not found.");
      return;
    }

    db.ref().update(updates).then(() => {
      alert("✅ Movement history deleted successfully.");
      clearHistoryMap();
      document.getElementById("historyVehicleId").value = "";
      document.getElementById("deleteHistoryBtn").style.display = "none";
    });
  });
}

// Setup event listeners
function setupEventListeners() {
  // Optional: handle enter press for History Vehicle ID input
  document.getElementById("historyVehicleId").addEventListener("keyup", e => {
    if (e.key === "Enter") loadMovementHistory();
  });
}

// Vehicle Tracker - Optional: keep from your original and integrate if needed

// Manual Alarm Trigger - Fixed
function triggerManualAlarm() {
  const id = document.getElementById("alarmVehicleId").value.trim();
  const statusBox = document.getElementById("alarmStatus");
  statusBox.innerHTML = "";
  if (!id) {
    statusBox.innerHTML = `<div class='alert alert-warning'>Please enter a Vehicle ID.</div>`;
    return;
  }

  db.ref("users").once("value").then(snap => {
    let found = false;
    const users = snap.val() || {};

    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        if (vehicles[id]) {
          found = true;
          db.ref(`users/${uid}/vehicle/last_trigger`).set({
            status: "alert",
            vehicleId: id,
            time: new Date().toISOString(),
            location: vehicles[id].gps || "Unknown"
          }).then(() => {
            statusBox.innerHTML = `<div class='alert alert-danger'>🚨 Alarm Triggered for vehicle ID: ${id}</div>`;
          }).catch(() => {
            statusBox.innerHTML = `<div class='alert alert-danger'>Failed to trigger alarm. Try again.</div>`;
          });
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      statusBox.innerHTML = `<div class='alert alert-warning'>Vehicle ID not found.</div>`;
    }
  });
}

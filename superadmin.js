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

// superadmin.js - Fully Fixed & Optimized

// Firebase configuration (already initialized in HTML)
const db = firebase.database();
const auth = firebase.auth();

const totalCompanies = document.getElementById("totalCompanies");
const totalVehicles = document.getElementById("totalVehicles");
const totalDeliveries = document.getElementById("totalDeliveries");
const alertsToday = document.getElementById("alertsToday");
const companyTable = document.getElementById("companyTable");
const pendingUsersList = document.getElementById("pendingUsersList");
const vehicleTrackerResult = document.getElementById("vehicleTrackerResult");

let map = L.map("map").setView([20.5937, 78.9629], 5); // Default India center
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
let vehicleMarker = null;

// Load dashboard stats and data
function loadDashboard() {
  db.ref("users").once("value", (snapshot) => {
    let companies = 0, vehicles = 0, deliveries = 0, pending = [];
    companyTable.innerHTML = "";
    pendingUsersList.innerHTML = "";

    snapshot.forEach((userSnap) => {
      const user = userSnap.val();
      const uid = userSnap.key;

      if (user.role === "company" && user.status === "approved") {
        companies++;
        let vehicleCount = user.vehicles ? Object.keys(user.vehicles).length : 0;
        let deliveryCount = user.deliveries ? Object.keys(user.deliveries).length : 0;
        vehicles += vehicleCount;
        deliveries += deliveryCount;

        companyTable.innerHTML += `
          <tr>
            <td>${user.companyName || "-"}</td>
            <td>${vehicleCount}</td>
            <td>${deliveryCount}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteUser('${uid}')">Delete</button></td>
          </tr>`;
      } else if (user.status === "pending") {
        pending.push({ uid, ...user });
      }
    });

    totalCompanies.textContent = companies;
    totalVehicles.textContent = vehicles;
    totalDeliveries.textContent = deliveries;

    // Display pending approvals
    pending.forEach((user) => {
      pendingUsersList.innerHTML += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${user.companyName || user.email}
          <div>
            <button class="btn btn-success btn-sm me-2" onclick="approveUser('${user.uid}')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.uid}')">Reject</button>
          </div>
        </li>`;
    });
  });

  // Dummy alert count
  alertsToday.textContent = Math.floor(Math.random() * 10) + 1;
}

// Approve user
function approveUser(uid) {
  db.ref(`users/${uid}`).update({ status: "approved" }).then(() => loadDashboard());
}

// Delete user
function deleteUser(uid) {
  db.ref(`users/${uid}`).remove().then(() => loadDashboard());
}

// Tracking vehicle by ID
const trackVehicleId = document.getElementById("trackVehicleId");
trackVehicleId.addEventListener("change", () => {
  const vehicleId = trackVehicleId.value.trim();
  if (!vehicleId) return;

  db.ref(`vehicles/${vehicleId}/location`).once("value", (snap) => {
    const data = snap.val();
    if (!data || !data.latitude || !data.longitude) {
      vehicleTrackerResult.innerHTML = `<p class='text-danger'>Location not available.</p>`;
      return;
    }
    const { latitude, longitude } = data;
    if (vehicleMarker) map.removeLayer(vehicleMarker);
    map.setView([latitude, longitude], 15);
    vehicleMarker = L.marker([latitude, longitude]).addTo(map).bindPopup(`Vehicle ID: ${vehicleId}`).openPopup();
    vehicleTrackerResult.innerHTML = `<p class='text-success'>Location updated on map.</p>`;
  });
});

// Manual alarm trigger
function triggerManualAlarm() {
  const id = document.getElementById("alarmVehicleId").value.trim();
  const statusDiv = document.getElementById("alarmStatus");
  if (!id) return (statusDiv.innerHTML = "<p class='text-danger'>Enter Vehicle ID</p>");

  db.ref(`vehicles/${id}/alarm`).set(true).then(() => {
    statusDiv.innerHTML = `<p class='text-success'>Alarm triggered for ${id}</p>`;
  }).catch(() => {
    statusDiv.innerHTML = `<p class='text-danger'>Failed to trigger alarm.</p>`;
  });
}

// Logout
function logout() {
  auth.signOut().then(() => window.location.href = "login.html");
}

// Init
auth.onAuthStateChanged((user) => {
  if (user) {
    db.ref(`users/${user.uid}`).once("value", (snap) => {
      if (!snap.exists() || snap.val().role !== "superadmin") {
        alert("Access denied");
        auth.signOut();
      } else {
        loadDashboard();
      }
    });
  } else {
    window.location.href = "login.html";
  }
});

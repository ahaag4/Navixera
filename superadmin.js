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

// Logout function
function logout() {
  auth.signOut().then(() => window.location.href = "index.html");
}

// Stat Counts
function loadStats() {
  db.ref("users").once("value", snapshot => {
    const data = snapshot.val();
    const companies = Object.values(data || {}).filter(u => u.role === "company" && u.approved);
    document.getElementById("totalCompanies").textContent = companies.length;
  });

  db.ref("vehicles").once("value", snapshot => {
    const vehicles = snapshot.val();
    document.getElementById("totalVehicles").textContent = vehicles ? Object.keys(vehicles).length : 0;
  });

  db.ref("deliveries").once("value", snapshot => {
    const deliveries = snapshot.val();
    document.getElementById("totalDeliveries").textContent = deliveries ? Object.keys(deliveries).length : 0;
  });

  db.ref("alarms").orderByChild("date").once("value", snapshot => {
    const today = new Date().toISOString().split('T')[0];
    let count = 0;
    snapshot.forEach(child => {
      if (child.val().date === today) count++;
    });
    document.getElementById("alertsToday").textContent = count;
  });
}

// Pending users
function loadPendingUsers() {
  const list = document.getElementById("pendingUsersList");
  list.innerHTML = "";
  db.ref("users").once("value", snap => {
    snap.forEach(child => {
      const user = child.val();
      if (user.role === "company" && !user.approved) {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        li.innerHTML = `
          ${user.name} (${user.email})
          <button class="btn btn-success btn-sm" onclick="approveUser('${child.key}')">Approve</button>`;
        list.appendChild(li);
      }
    });
  });
}

function approveUser(uid) {
  db.ref(`users/${uid}`).update({ approved: true })
    .then(() => {
      alert("User approved successfully.");
      loadPendingUsers();
      loadApprovedCompanies();
    });
}

// Approved company table
function loadApprovedCompanies() {
  const table = document.getElementById("companyTable");
  table.innerHTML = "";
  db.ref("users").once("value", snap => {
    snap.forEach(child => {
      const user = child.val();
      if (user.role === "company" && user.approved) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${user.name}</td>
          <td>${user.totalVehicles || 0}</td>
          <td>${user.totalDeliveries || 0}</td>
          <td><button class='btn btn-info btn-sm' onclick="alert('More features coming soon')">View</button></td>
        `;
        table.appendChild(tr);
      }
    });
  });
}

// Map Setup
const map = L.map("map").setView([20.5937, 78.9629], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
let markers = {};

function updateMap() {
  db.ref("vehicles").once("value", snap => {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};
    snap.forEach(child => {
      const v = child.val();
      if (v.lat && v.lng) {
        const marker = L.marker([v.lat, v.lng]).addTo(map).bindPopup(`${v.name || child.key}`);
        markers[child.key] = marker;
      }
    });
  });
}

// Track vehicle by ID
const trackerResult = document.getElementById("vehicleTrackerResult");

function trackVehicle() {
  const id = document.getElementById("trackVehicleId").value.trim();
  if (!id) return;
  db.ref(`vehicles/${id}`).once("value", snap => {
    const v = snap.val();
    if (v && v.lat && v.lng) {
      map.setView([v.lat, v.lng], 15);
      if (markers[id]) markers[id].openPopup();
      else markers[id] = L.marker([v.lat, v.lng]).addTo(map).bindPopup(id).openPopup();
      trackerResult.innerHTML = `<div class='alert alert-info'>Vehicle ${id} located on map.</div>`;
    } else {
      trackerResult.innerHTML = `<div class='alert alert-warning'>Location not found for Vehicle ID: ${id}</div>`;
    }
  });
}

document.getElementById("trackVehicleId").addEventListener("keypress", e => {
  if (e.key === "Enter") trackVehicle();
});

// Manual alarm
function triggerManualAlarm() {
  const id = document.getElementById("alarmVehicleId").value.trim();
  const status = document.getElementById("alarmStatus");
  if (!id) return alert("Enter a vehicle ID.");
  const now = new Date();
  const alarmData = {
    vehicleId: id,
    date: now.toISOString().split("T")[0],
    time: now.toTimeString().split(" ")[0],
    reason: "Manual trigger"
  };
  db.ref("alarms").push(alarmData).then(() => {
    status.innerHTML = `<div class='alert alert-success'>Alarm triggered for ${id}</div>`;
  });
}

// Initial Load
auth.onAuthStateChanged(user => {
  if (!user) window.location.href = "index.html";
  else {
    loadStats();
    loadPendingUsers();
    loadApprovedCompanies();
    updateMap();
  }
});

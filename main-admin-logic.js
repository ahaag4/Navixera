// main-admin-logic.js

// === Firebase Config ===
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

// ✅ Admin Dashboard Initialization
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    alert("Not signed in. Redirecting...");
    window.location.href = "signin.html";
    return;
  }

    // ✅ Check if user is an admin
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    alert("User data not found. Redirecting...");
    window.location.href = "login.html";
    return;
  }

  const userData = userSnap.data();
  if (userData.role !== "super-admin") {
    alert("Unauthorized access! Redirecting to dashboard...");
    window.location.href = "dashboard.html"; // Redirect non-admin users
    return;
  }

function initializeDashboard() {
  loadStats();
  loadCompanyTable();
  loadAllVehiclesMap();
  loadDeliveryTracking();
  loadAlertsPanel();
  loadVehicleLogs();
}

function loadStats() {
  let totalCompanies = 0, totalVehicles = 0, totalDeliveries = 0, alertsToday = 0;
  db.ref("users").once("value", snap => {
    const users = snap.val();
    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const comp in companies) {
        totalCompanies++;
        const veh = companies[comp].vehicle || {};
        totalVehicles += Object.keys(veh).length;
        for (const v in veh) {
          const del = veh[v].deliveries || {};
          totalDeliveries += Object.keys(del).length;
        }
      }
      if (users[uid].vehicle?.last_trigger?.status === "alert") alertsToday++;
    }
    document.getElementById("totalCompanies").innerText = totalCompanies;
    document.getElementById("totalVehicles").innerText = totalVehicles;
    document.getElementById("totalDeliveries").innerText = totalDeliveries;
    document.getElementById("alertsToday").innerText = alertsToday;
  });
}

function loadCompanyTable() {
  const tbody = document.getElementById("companyTable");
  tbody.innerHTML = "";
  db.ref("users").once("value", snap => {
    const users = snap.val();
    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const name in companies) {
        const vehicles = companies[name].vehicle || {};
        let deliveryCount = 0;
        for (const v in vehicles) {
          deliveryCount += Object.keys(vehicles[v].deliveries || {}).length;
        }
        const row = `<tr><td>${name}</td><td>${Object.keys(vehicles).length}</td><td>${deliveryCount}</td><td><button class='btn btn-danger btn-sm'>Block</button></td></tr>`;
        tbody.innerHTML += row;
      }
    }
  });
}

function loadAllVehiclesMap() {
  const map = L.map("map").setView([19.2183, 72.9781], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  const markers = {};
  db.ref("users").on("value", snap => {
    const users = snap.val();
    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const comp in companies) {
        const vehicles = companies[comp].vehicle || {};
        for (const id in vehicles) {
          const gps = vehicles[id].gps || "0,0";
          const [lat, lng] = gps.split(",").map(Number);
          if (!markers[id]) {
            markers[id] = L.marker([lat, lng]).addTo(map).bindPopup(`${id}`);
          } else {
            markers[id].setLatLng([lat, lng]);
          }
        }
      }
    }
  });
}

function loadDeliveryTracking() {
  document.getElementById("searchTrackId").addEventListener("input", e => {
    const id = e.target.value.trim();
    const result = document.getElementById("deliveryResult");
    if (id.length < 4) return;
    db.ref("users").once("value", snap => {
      const users = snap.val();
      let found = false;
      for (const uid in users) {
        const companies = users[uid].vehicle?.companies || {};
        for (const comp in companies) {
          const vehicles = companies[comp].vehicle || {};
          for (const vid in vehicles) {
            const deliveries = vehicles[vid].deliveries || {};
            if (deliveries[id]) {
              result.innerHTML = `<div class='alert alert-success'>📦 ${id} - Status: ${deliveries[id].status} - 🚚 ${vid}</div>`;
              found = true;
              break;
            }
          }
        }
      }
      if (!found) result.innerHTML = `<div class='alert alert-warning'>Tracking ID not found.</div>`;
    });
  });
}

function loadAlertsPanel() {
  const alertsContainer = document.getElementById("alertsList");
  if (!alertsContainer) return;
  db.ref("users").on("value", snap => {
    const users = snap.val();
    alertsContainer.innerHTML = "";
    for (const uid in users) {
      const trigger = users[uid].vehicle?.last_trigger;
      if (trigger?.status === "alert") {
        const item = `<div class='alert alert-danger'>🚨 Alert from ${trigger.location} at ${trigger.time}</div>`;
        alertsContainer.innerHTML += item;
      }
    }
  });
}

function loadVehicleLogs() {
  const logsContainer = document.getElementById("logsList");
  if (!logsContainer) return;
  db.ref("users").once("value", snap => {
    const users = snap.val();
    logsContainer.innerHTML = "";
    for (const uid in users) {
      const hist = users[uid].vehicle?.history || {};
      for (const logId in hist) {
        const log = hist[logId];
        const item = `<div class='border p-2 mb-2'>📍 ${log.location} | 🕒 ${log.time}</div>`;
        logsContainer.innerHTML += item;
      }
    }
  });
}

function exportLogsAsCSV() {
  db.ref("users").once("value", snap => {
    const users = snap.val();
    let csv = "UserID,Location,Time\n";
    for (const uid in users) {
      const logs = users[uid].vehicle?.history || {};
      for (const id in logs) {
        const l = logs[id];
        csv += `${uid},${l.location},${l.time}\n`;
      }
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "vehicle_logs.csv";
    link.click();
  });
}

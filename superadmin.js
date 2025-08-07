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

// Logout function
function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = "login.html";
  });
}

// Load Super Admin Stats and Info
window.onload = () => {
  loadStats();
  loadPendingUsers();
  loadApprovedCompanies();
  initMap();
};

function loadStats() {
  db.ref("companies").once("value", (snapshot) => {
    const companies = snapshot.val() || {};
    let totalVehicles = 0;
    let totalDeliveries = 0;

    Object.values(companies).forEach((company) => {
      if (company.vehicles) totalVehicles += Object.keys(company.vehicles).length;
      if (company.deliveries) totalDeliveries += Object.keys(company.deliveries).length;
    });

    document.getElementById("totalCompanies").textContent = Object.keys(companies).length;
    document.getElementById("totalVehicles").textContent = totalVehicles;
    document.getElementById("totalDeliveries").textContent = totalDeliveries;
  });

  const today = new Date().toISOString().split("T")[0];
  db.ref("alerts").orderByChild("date").equalTo(today).once("value", (snapshot) => {
    document.getElementById("alertsToday").textContent = snapshot.numChildren();
  });
}

function loadPendingUsers() {
  db.ref("pendingApprovals").once("value", (snapshot) => {
    const list = document.getElementById("pendingUsersList");
    list.innerHTML = "";
    snapshot.forEach((userSnap) => {
      const user = userSnap.val();
      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center";
      li.innerHTML = `
        ${user.name} (${user.email})
        <button class="btn btn-success btn-sm" onclick="approveUser('${userSnap.key}')">Approve</button>
      `;
      list.appendChild(li);
    });
  });
}

function approveUser(userId) {
  db.ref("pendingApprovals/" + userId).once("value", (snap) => {
    const user = snap.val();
    db.ref("companies/" + userId).set(user).then(() => {
      db.ref("pendingApprovals/" + userId).remove();
      loadPendingUsers();
      loadApprovedCompanies();
    });
  });
}

function loadApprovedCompanies() {
  db.ref("companies").once("value", (snapshot) => {
    const table = document.getElementById("companyTable");
    table.innerHTML = "";
    snapshot.forEach((snap) => {
      const data = snap.val();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${data.name || "N/A"}</td>
        <td>${data.vehicles ? Object.keys(data.vehicles).length : 0}</td>
        <td>${data.deliveries ? Object.keys(data.deliveries).length : 0}</td>
        <td><button class='btn btn-danger btn-sm' onclick="removeCompany('${snap.key}')">Remove</button></td>
      `;
      table.appendChild(row);
    });
  });
}

function removeCompany(id) {
  if (confirm("Are you sure you want to remove this company?")) {
    db.ref("companies/" + id).remove();
    loadApprovedCompanies();
    loadStats();
  }
}

function triggerManualAlarm() {
  const vehicleId = document.getElementById("alarmVehicleId").value.trim();
  if (vehicleId === "") return;
  db.ref("alerts").push({
    vehicleId,
    date: new Date().toISOString().split("T")[0],
    triggeredBy: "admin",
  }).then(() => {
    document.getElementById("alarmStatus").innerHTML = `<span class='text-success'>Alarm triggered for ${vehicleId}</span>`;
  });
}

function initMap() {
  const map = L.map("map").setView([20.5937, 78.9629], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  db.ref("liveLocations").on("value", (snapshot) => {
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    snapshot.forEach((snap) => {
      const loc = snap.val();
      if (loc.lat && loc.lng) {
        L.marker([loc.lat, loc.lng])
          .addTo(map)
          .bindPopup(`<b>${snap.key}</b>`);
      }
    });
  });

  const trackerInput = document.getElementById("trackVehicleId");
  trackerInput.addEventListener("change", () => {
    const id = trackerInput.value.trim();
    if (id !== "") {
      db.ref("liveLocations/" + id).once("value", (snap) => {
        const loc = snap.val();
        if (loc && loc.lat && loc.lng) {
          map.setView([loc.lat, loc.lng], 15);
          L.marker([loc.lat, loc.lng])
            .addTo(map)
            .bindPopup(`<b>Tracking: ${id}</b>`) 
            .openPopup();
          document.getElementById("vehicleTrackerResult").innerHTML = `<span class='text-success'>Located vehicle at [${loc.lat}, ${loc.lng}]</span>`;
        } else {
          document.getElementById("vehicleTrackerResult").innerHTML = `<span class='text-danger'>Vehicle not found</span>`;
        }
      });
    }
  });
}

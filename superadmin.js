// ---- Firebase configuration ----
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

// UI references
const totalCompaniesEl = document.getElementById("totalCompanies");
const totalVehiclesEl = document.getElementById("totalVehicles");
const totalDeliveriesEl = document.getElementById("totalDeliveries");
const alertsTodayEl = document.getElementById("alertsToday");
const pendingUsersList = document.getElementById("pendingUsersList");
const companyTable = document.getElementById("companyTable");
const vehicleTrackerResult = document.getElementById("vehicleTrackerResult");
const trackVehicleIdInput = document.getElementById("trackVehicleId");
const alarmVehicleIdInput = document.getElementById("alarmVehicleId");
const alarmStatusEl = document.getElementById("alarmStatus");
const logoutBtn = document.getElementById("logoutBtn");
const triggerAlarmBtn = document.getElementById("triggerAlarmBtn");

let map, markers = {}, markerGroup;

// Auth check
auth.onAuthStateChanged(async (user) => {
  if (!user) return location.href = "login.html";
  const snap = await db.ref(`users/${user.uid}`).once("value");
  const data = snap.val() || {};
  if (data.role !== "super-admin") return location.href = "dashboard.html";
  initializeDashboard();
});

logoutBtn.addEventListener("click", () => auth.signOut().then(() => location.href = "login.html"));

function initializeDashboard() {
  loadStats();
  loadPendingApprovals();
  loadApprovedCompanies();
  setupMap();
  setupTrackerInput();
}

// ---------- Stats ----------
async function loadStats() {
  const snap = await db.ref("users").once("value");
  const users = snap.val() || {};
  let totalCompanies = 0, totalVehicles = 0, totalDeliveries = 0, alertsToday = 0;
  const today = new Date().toDateString();

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
    const lastTrigger = u.vehicle?.last_trigger;
    if (lastTrigger?.status === "alert" && new Date(lastTrigger.time).toDateString() === today) {
      alertsToday++;
    }
  }
  totalCompaniesEl.innerText = totalCompanies;
  totalVehiclesEl.innerText = totalVehicles;
  totalDeliveriesEl.innerText = totalDeliveries;
  alertsTodayEl.innerText = alertsToday;
}

// ---------- Pending Approvals ----------
async function loadPendingApprovals() {
  pendingUsersList.innerHTML = "";
  const snap = await db.ref("users").once("value");
  const users = snap.val() || {};
  let hasPending = false;

  for (const uid in users) {
    const u = users[uid];
    if ((u.role === "company" || u.role === "customer") && !u.approved) {
      hasPending = true;
      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between";
      li.innerHTML = `<span>${u.companyName || u.email} (${u.role})</span>
        <div>
          <button class="btn btn-success btn-sm me-2">Approve</button>
          <button class="btn btn-danger btn-sm">Reject</button>
        </div>`;
      li.querySelector(".btn-success").onclick = async () => {
        await db.ref(`users/${uid}`).update({ approved: true });
        loadPendingApprovals(); loadApprovedCompanies(); loadStats();
      };
      li.querySelector(".btn-danger").onclick = async () => {
        if (confirm("Delete this user?")) {
          await db.ref(`users/${uid}`).remove();
          loadPendingApprovals(); loadStats(); loadApprovedCompanies();
        }
      };
      pendingUsersList.appendChild(li);
    }
  }
  if (!hasPending) pendingUsersList.innerHTML = "<li class='list-group-item text-muted'>No pending approvals</li>";
}

// ---------- Approved Companies ----------
async function loadApprovedCompanies() {
  companyTable.innerHTML = "";
  const snap = await db.ref("users").once("value");
  const users = snap.val() || {};
  let hasCompanies = false;

  for (const uid in users) {
    const u = users[uid];
    if (u.role === "company" && u.approved) {
      const companies = u.vehicle?.companies || {};
      for (const cname in companies) {
        hasCompanies = true;
        const vehicles = companies[cname].vehicle || {};
        const deliveries = Object.values(vehicles).reduce((sum, v) => sum + Object.keys(v.deliveries || {}).length, 0);
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${cname}</td>
                        <td>${Object.keys(vehicles).length}</td>
                        <td>${deliveries}</td>
                        <td>
                          <button class="btn btn-primary btn-sm me-2">Edit</button>
                          <button class="btn btn-danger btn-sm">Delete</button>
                        </td>`;
        tr.querySelector(".btn-primary").onclick = () => editCompany(uid, cname);
        tr.querySelector(".btn-danger").onclick = () => deleteCompany(uid, cname);
        companyTable.appendChild(tr);
      }
    }
  }
  if (!hasCompanies) companyTable.innerHTML = "<tr><td colspan='4' class='text-muted'>No approved companies</td></tr>";
}

// ---------- Edit/Delete Company ----------
async function editCompany(uid, oldName) {
  const newName = prompt("Enter new company name:", oldName);
  if (!newName || newName === oldName) return;
  const data = (await db.ref(`users/${uid}/vehicle/companies/${oldName}`).once("value")).val();
  if (!data) return alert("Company not found");
  await db.ref(`users/${uid}/vehicle/companies/${newName}`).set(data);
  await db.ref(`users/${uid}/vehicle/companies/${oldName}`).remove();
  loadApprovedCompanies();
}
async function deleteCompany(uid, cname) {
  if (confirm(`Delete ${cname}?`)) {
    await db.ref(`users/${uid}/vehicle/companies/${cname}`).remove();
    loadApprovedCompanies(); loadStats();
  }
}

// ---------- Map ----------
function setupMap() {
  map = L.map("map").setView([19.2183, 72.9781], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
  markerGroup = L.featureGroup().addTo(map);
  db.ref("users").on("value", snap => {
    const data = snap.val() || {};
    const bounds = [];
    const currentIds = new Set();

    for (const uid in data) {
      const companies = data[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        for (const vid in vehicles) {
          currentIds.add(vid);
          const gps = (vehicles[vid].gps || "0,0").split(",").map(Number);
          if (gps[0] && gps[1]) {
            if (!markers[vid]) {
              markers[vid] = L.marker(gps).addTo(markerGroup).bindPopup(`<b>${vid}</b><br>${cname}`);
            } else {
              markers[vid].setLatLng(gps);
            }
            bounds.push(gps);
          }
        }
      }
    }
    for (const id in markers) {
      if (!currentIds.has(id)) {
        markerGroup.removeLayer(markers[id]);
        delete markers[id];
      }
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
  });
}

// ---------- Vehicle Tracker Search ----------
function setupTrackerInput() {
  trackVehicleIdInput.addEventListener("input", async () => {
    const id = trackVehicleIdInput.value.trim().toLowerCase();
    if (!id) return vehicleTrackerResult.innerHTML = "";
    vehicleTrackerResult.innerHTML = "Searching...";
    const snap = await db.ref("users").once("value");
    const users = snap.val() || {};
    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        for (const vid in vehicles) {
          if (vid.toLowerCase() === id) {
            const v = vehicles[vid];
            vehicleTrackerResult.innerHTML = `<div class="alert alert-info">
              🚚 <b>${vid}</b><br>Location: ${v.gps || "Unknown"}<br>Battery: ${v.battery ?? "N/A"}%</div>`;
            return;
          }
        }
      }
    }
    vehicleTrackerResult.innerHTML = `<div class="alert alert-warning">Vehicle not found</div>`;
  });
}

// ---------- Manual Alarm Trigger ----------
triggerAlarmBtn.onclick = async () => {
  const id = alarmVehicleIdInput.value.trim();
  if (!id) return alarmStatusEl.innerHTML = `<div class="alert alert-warning">Enter a vehicle ID</div>`;
  const snap = await db.ref("users").once("value");
  const users = snap.val() || {};
  let triggered = false;

  for (const uid in users) {
    const companies = users[uid].vehicle?.companies || {};
    for (const cname in companies) {
      const vehicles = companies[cname].vehicle || {};
      if (vehicles[id]) {
        const triggerData = {
          status: "alert",
          vehicleId: id,
          time: new Date().toISOString(),
          location: vehicles[id].gps || "Unknown"
        };
        const updates = {};
        updates[`users/${uid}/vehicle/last_trigger`] = triggerData;
        const newKey = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
        updates[`users/${uid}/vehicle/triggersHistory/${newKey}`] = triggerData;
        await db.ref().update(updates);
        triggered = true;
      }
    }
  }
  alarmStatusEl.innerHTML = triggered
    ? `<div class="alert alert-danger">🚨 Alarm Triggered for <b>${id}</b></div>`
    : `<div class="alert alert-warning">Vehicle not found</div>`;
  if (triggered) loadStats();
};

// Refresh data every minute
setInterval(() => { loadStats(); loadApprovedCompanies(); loadPendingApprovals(); }, 60000);

// ---- Firebase configuration (fixed databaseURL string) ----
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

// Auth check and role enforcement
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    return location.href = "login.html";
  }

  try {
    const userSnap = await db.ref(`users/${user.uid}`).once("value");
    const data = userSnap.val() || {};
    if (data.role !== "super-admin") {
      // safe redirect for non-admins
      return location.href = "dashboard.html";
    }
    initializeDashboard();
  } catch (err) {
    console.error("Auth check failed:", err);
    // fallback: sign out to be safe
    await auth.signOut();
    location.href = "login.html";
  }
});

logoutBtn.addEventListener("click", () => {
  auth.signOut().then(() => location.href = "login.html");
});

// Initialize everything
function initializeDashboard() {
  loadStats();
  loadPendingApprovals();
  loadApprovedCompanies();
  setupMap();
  setupTrackerInput();
}

// ---------- Stats ----------
async function loadStats() {
  try {
    const snap = await db.ref("users").once("value");
    const users = snap.val() || {};

    let totalCompanies = 0;
    let totalVehicles = 0;
    let totalDeliveries = 0;
    let alertsToday = 0;

    // iterate users
    for (const uid in users) {
      const u = users[uid];
      const companies = u.vehicle?.companies || {};
      // count companies & vehicles & deliveries per company
      for (const cname in companies) {
        totalCompanies++;
        const vehicles = companies[cname].vehicle || {};
        const vehicleIds = Object.keys(vehicles);
        totalVehicles += vehicleIds.length;

        for (const vid of vehicleIds) {
          const v = vehicles[vid] || {};
          const deliveries = v.deliveries || {};
          totalDeliveries += Object.keys(deliveries).length;
        }
      }

      // alertsToday: check last_trigger timestamp and status
      const lastTrigger = u.vehicle?.last_trigger;
      if (lastTrigger?.status === "alert" && lastTrigger?.time) {
        // ensure alert happened today (compare dates)
        const t = new Date(lastTrigger.time);
        const now = new Date();
        if (t.toDateString() === now.toDateString()) alertsToday++;
      }
    }

    totalCompaniesEl.innerText = totalCompanies;
    totalVehiclesEl.innerText = totalVehicles;
    totalDeliveriesEl.innerText = totalDeliveries;
    alertsTodayEl.innerText = alertsToday;
  } catch (err) {
    console.error("loadStats error:", err);
  }
}

// ---------- Pending Approvals ----------
async function loadPendingApprovals() {
  pendingUsersList.innerHTML = "";
  try {
    const snap = await db.ref("users").once("value");
    const users = snap.val() || {};

    for (const uid in users) {
      const u = users[uid];
      if ((u.role === "company" || u.role === "customer") && u.approved !== true) {
        const displayName = u.companyName || u.email || uid;
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";

        const left = document.createElement("div");
        left.innerText = `${displayName} (${u.role})`;
        li.appendChild(left);

        const actions = document.createElement("div");

        const approveBtn = document.createElement("button");
        approveBtn.className = "btn btn-success btn-sm me-2";
        approveBtn.innerText = "Approve";
        approveBtn.addEventListener("click", async () => {
          try {
            await db.ref(`users/${uid}`).update({ approved: true });
            // small UX: immediate feedback then reload lists/stats
            alert("✅ Approved");
            await Promise.all([loadPendingApprovals(), loadApprovedCompanies(), loadStats()]);
          } catch (e) {
            console.error("approve error:", e);
            alert("Approval failed");
          }
        });

        const rejectBtn = document.createElement("button");
        rejectBtn.className = "btn btn-danger btn-sm";
        rejectBtn.innerText = "Reject";
        rejectBtn.addEventListener("click", async () => {
          if (!confirm("Delete this user?")) return;
          try {
            await db.ref(`users/${uid}`).remove();
            alert("❌ Rejected and removed");
            await loadPendingApprovals();
            await loadStats();
            await loadApprovedCompanies();
          } catch (e) {
            console.error("reject error:", e);
            alert("Reject failed");
          }
        });

        actions.appendChild(approveBtn);
        actions.appendChild(rejectBtn);
        li.appendChild(actions);
        pendingUsersList.appendChild(li);
      }
    }

    if (!pendingUsersList.firstChild) {
      const li = document.createElement("li");
      li.className = "list-group-item text-muted";
      li.innerText = "No pending approvals";
      pendingUsersList.appendChild(li);
    }
  } catch (err) {
    console.error("loadPendingApprovals error:", err);
  }
}

// ---------- Approved Companies Table ----------
async function loadApprovedCompanies() {
  companyTable.innerHTML = "";
  try {
    const snap = await db.ref("users").once("value");
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

          const tr = document.createElement("tr");

          const tdName = document.createElement("td");
          tdName.innerText = cname;
          tr.appendChild(tdName);

          const tdVehicles = document.createElement("td");
          tdVehicles.innerText = Object.keys(vehicles).length;
          tr.appendChild(tdVehicles);

          const tdDeliveries = document.createElement("td");
          tdDeliveries.innerText = deliveries;
          tr.appendChild(tdDeliveries);

          const tdActions = document.createElement("td");

          const editBtn = document.createElement("button");
          editBtn.className = "btn btn-primary btn-sm me-2";
          editBtn.innerText = "Edit";
          editBtn.addEventListener("click", () => editCompany(uid, cname));

          const deleteBtn = document.createElement("button");
          deleteBtn.className = "btn btn-danger btn-sm";
          deleteBtn.innerText = "Delete";
          deleteBtn.addEventListener("click", () => deleteCompany(uid, cname));

          tdActions.appendChild(editBtn);
          tdActions.appendChild(deleteBtn);
          tr.appendChild(tdActions);

          companyTable.appendChild(tr);
        }
      }
    }

    // show placeholder if empty
    if (!companyTable.firstChild) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.className = "text-muted";
      td.innerText = "No approved companies";
      tr.appendChild(td);
      companyTable.appendChild(tr);
    }
  } catch (err) {
    console.error("loadApprovedCompanies error:", err);
  }
}

// ---------- Edit Company (rename single company) ----------
async function editCompany(uid, oldName) {
  const newName = prompt("Enter new company name:", oldName);
  if (!newName || newName.trim() === "" || newName === oldName) return;
  if (newName.includes("/")) return alert("Company name cannot contain '/' character.");

  try {
    // check duplicate
    const companiesSnap = await db.ref(`users/${uid}/vehicle/companies`).once("value");
    const companiesObj = companiesSnap.val() || {};
    if (companiesObj[newName]) {
      return alert("A company with that name already exists for this user.");
    }

    const sourceSnap = await db.ref(`users/${uid}/vehicle/companies/${oldName}`).once("value");
    const data = sourceSnap.val();
    if (!data) return alert("Source company data not found.");

    const updates = {};
    updates[`users/${uid}/vehicle/companies/${newName}`] = data;
    updates[`users/${uid}/vehicle/companies/${oldName}`] = null;

    await db.ref().update(updates);
    alert("✅ Company name updated");
    await loadApprovedCompanies();
  } catch (err) {
    console.error("editCompany error:", err);
    alert("Failed to update company name");
  }
}

// ---------- Delete Company (single company) ----------
async function deleteCompany(uid, companyName) {
  if (!confirm(`Are you sure you want to delete company "${companyName}" for this user?`)) return;
  try {
    await db.ref(`users/${uid}/vehicle/companies/${companyName}`).remove();
    alert("❌ Company deleted");
    await loadApprovedCompanies();
    await loadStats();
  } catch (err) {
    console.error("deleteCompany error:", err);
    alert("Failed to delete company");
  }
}

// ---------- Map & live vehicle markers ----------
function setupMap() {
  // fixed tile URL (no markdown artifacts)
  const tileURL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const map = L.map("map").setView([19.2183, 72.9781], 11);
  L.tileLayer(tileURL, { maxZoom: 19 }).addTo(map);

  const markers = {};
  const markerGroup = L.featureGroup().addTo(map);

  // listen to user changes in real-time
  db.ref("users").on("value", (snap) => {
    const data = snap.val() || {};
    const bounds = [];

    // update markers set
    for (const uid in data) {
      const companies = data[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        for (const vid in vehicles) {
          const v = vehicles[vid] || {};
          const gpsRaw = (v.gps || "0,0").toString();
          const parts = gpsRaw.split(",").map(s => s.trim());
          let lat = Number(parts[0] || 0);
          let lng = Number(parts[1] || 0);

          // validate lat/lng
          if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
            // skip invalid/0,0 coordinates
            continue;
          }

          if (!markers[vid]) {
            const m = L.marker([lat, lng]).addTo(markerGroup).bindPopup(`<b>${vid}</b><br/>${cname}`);
            markers[vid] = m;
          } else {
            markers[vid].setLatLng([lat, lng]);
            // update popup content if needed
            markers[vid].bindPopup(`<b>${vid}</b><br/>${cname}`);
          }
          bounds.push([lat, lng]);
        }
      }
    }

    // remove markers that no longer exist
    const currentIds = new Set();
    for (const uid in data) {
      const companies = data[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        for (const vid in vehicles) currentIds.add(vid);
      }
    }
    for (const mid in markers) {
      if (!currentIds.has(mid)) {
        markerGroup.removeLayer(markers[mid]);
        delete markers[mid];
      }
    }

    if (bounds.length) {
      try {
        map.fitBounds(bounds, { padding: [50, 50] });
      } catch (e) {
        // fallback to center
        // console.warn("fitBounds failed", e);
      }
    }
  });
}

// ---------- Vehicle Tracker (search input) ----------
function setupTrackerInput() {
  trackVehicleIdInput.addEventListener("input", async (e) => {
    const idRaw = e.target.value.trim();
    if (!idRaw) {
      vehicleTrackerResult.innerHTML = "";
      return;
    }
    const id = idRaw.toLowerCase();
    vehicleTrackerResult.innerHTML = "<div class='text-muted'>Searching...</div>";

    try {
      const snap = await db.ref("users").once("value");
      const users = snap.val() || {};
      let found = false;

      for (const uid in users) {
        const companies = users[uid].vehicle?.companies || {};
        for (const cname in companies) {
          const vehicles = companies[cname].vehicle || {};
          for (const vid in vehicles) {
            if (vid.toLowerCase() === id) {
              const v = vehicles[vid] || {};
              const gps = v.gps || "Unknown";
              const battery = v.battery ?? "N/A";
              vehicleTrackerResult.innerHTML = `<div class='alert alert-info'>🚚 <strong>${vid}</strong><br/>Location: ${gps}<br/>Battery: ${battery}%</div>`;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }

      if (!found) {
        vehicleTrackerResult.innerHTML = `<div class='alert alert-warning'>Vehicle not found</div>`;
      }
    } catch (err) {
      console.error("Vehicle tracker error:", err);
      vehicleTrackerResult.innerHTML = `<div class='alert alert-danger'>Error searching vehicle</div>`;
    }
  });
}

// ---------- Manual Alarm Trigger ----------
triggerAlarmBtn.addEventListener("click", async () => {
  const idRaw = alarmVehicleIdInput.value.trim();
  if (!idRaw) return alarmStatusEl.innerHTML = `<div class='alert alert-warning'>Enter a vehicle ID</div>`;
  const id = idRaw;

  alarmStatusEl.innerHTML = `<div class='text-muted'>Searching vehicle...</div>`;

  try {
    const snap = await db.ref("users").once("value");
    const users = snap.val() || {};
    let found = false;

    for (const uid in users) {
      const companies = users[uid].vehicle?.companies || {};
      for (const cname in companies) {
        const vehicles = companies[cname].vehicle || {};
        if (vehicles[id]) {
          // update both last_trigger and push to trigger history
          const triggerData = {
            status: "alert",
            vehicleId: id,
            time: new Date().toISOString(),
            location: vehicles[id].gps || "Unknown"
          };

          const updates = {};
          updates[`users/${uid}/vehicle/last_trigger`] = triggerData;
          // also push to triggersHistory (array-like under user)
          const newKey = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
          updates[`users/${uid}/vehicle/triggersHistory/${newKey}`] = triggerData;

          await db.ref().update(updates);

          alarmStatusEl.innerHTML = `<div class='alert alert-danger'>🚨 Alarm Triggered for <strong>${id}</strong></div>`;
          found = true;
          // refresh stats so Alerts Today updates
          await loadStats();
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      alarmStatusEl.innerHTML = `<div class='alert alert-warning'>Vehicle ID not found</div>`;
    }
  } catch (err) {
    console.error("triggerManualAlarm error:", err);
    alarmStatusEl.innerHTML = `<div class='alert alert-danger'>Failed to trigger alarm</div>`;
  }
});

// Optional: refresh some data periodically (every 60s)
setInterval(() => {
  loadStats();
  loadApprovedCompanies();
  loadPendingApprovals();
}, 60000);

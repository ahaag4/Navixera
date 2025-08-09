/* dashboard.js
   SVMS Super Admin Dashboard (client-side)
   - Firebase compat v8 usage
   - Live vehicle markers on Leaflet map
   - Vehicle search that centers map on found vehicle
   - Manual alarm: select company/customer OR enter vehicle ID (searches across all users -> companies -> vehicles)
   - Approved companies table + pending approvals
   - Uses multi-path updates for alarm writes
*/

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

/* ========= DOM elements ========= */
const totalCompaniesEl = document.getElementById("totalCompanies");
const totalVehiclesEl = document.getElementById("totalVehicles");
const totalDeliveriesEl = document.getElementById("totalDeliveries");
const alertsTodayEl = document.getElementById("alertsToday");
const pendingUsersList = document.getElementById("pendingUsersList");
const companyTable = document.getElementById("companyTable");
const vehicleTrackerResult = document.getElementById("vehicleTrackerResult");
const trackVehicleIdInput = document.getElementById("trackVehicleId");
const centerOnVehicleBtn = document.getElementById("centerOnVehicleBtn");
const alarmVehicleIdInput = document.getElementById("alarmVehicleId");
const companySelect = document.getElementById("companySelect");
const customerSelect = document.getElementById("customerSelect");
const alarmStatusEl = document.getElementById("alarmStatus");
const logoutBtn = document.getElementById("logoutBtn");
const triggerAlarmBtn = document.getElementById("triggerAlarmBtn");
const currentUserEl = document.getElementById("currentUser");

/* ========= Map & markers ========= */
let map;
let markerGroup;
const markers = {};            // keyed by vehicle id => L.Marker
let liveUsersSnapshotUnsub = null;

/* ========= Helpers ========= */
function safeText(v) { return (v === undefined || v === null) ? "" : String(v); }
function debounce(fn, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; }
function parseGps(gps) {
  if (!gps) return null;
  const p = String(gps).split(",").map(s => s.trim());
  if (p.length < 2) return null;
  const lat = Number(p[0]), lng = Number(p[1]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

/* ========= Auth & init ========= */
auth.onAuthStateChanged(async (user) => {
  if (!user) { location.href = "login.html"; return; }
  try {
    const snap = await db.ref(`users/${user.uid}`).once('value');
    const me = snap.val() || {};
    currentUserEl.innerText = `${me.email || user.email || ""} (${me.role || "user"})`;
    if (me.role !== "super-admin") { location.href = "dashboard.html"; return; }
    initializeDashboard();
  } catch (err) {
    console.error("Auth/init error:", err);
    await auth.signOut();
    location.href = "login.html";
  }
});
logoutBtn.addEventListener("click", () => auth.signOut().then(() => location.href = "login.html"));

function initializeDashboard() {
  loadStats();
  loadPendingApprovals();
  loadApprovedCompanies();
  setupMap();
  setupTrackerInput();
  populateCompanyCustomerDropdowns();
  setupAlarmHandler();
  setInterval(() => { loadStats(); loadApprovedCompanies(); loadPendingApprovals(); populateCompanyCustomerDropdowns(); }, 60_000);
}

/* ========= Stats ========= */
async function loadStats() {
  try {
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    let totalCompanies = 0, totalVehicles = 0, totalDeliveries = 0, alertsToday = 0;
    const today = new Date().toDateString();

    Object.keys(users).forEach(uid => {
      const u = users[uid];
      const companies = u.vehicle?.companies || {};
      Object.keys(companies).forEach(cname => {
        totalCompanies++;
        const vehicles = companies[cname].vehicle || {};
        const vids = Object.keys(vehicles);
        totalVehicles += vids.length;
        vids.forEach(vid => {
          const deliveries = vehicles[vid].deliveries || {};
          totalDeliveries += Object.keys(deliveries).length;
        });
      });
      const lastTrigger = u.vehicle?.last_trigger;
      if (lastTrigger?.status === "alert" && lastTrigger?.time && new Date(lastTrigger.time).toDateString() === today) {
        alertsToday++;
      }
    });

    totalCompaniesEl.innerText = totalCompanies;
    totalVehiclesEl.innerText = totalVehicles;
    totalDeliveriesEl.innerText = totalDeliveries;
    alertsTodayEl.innerText = alertsToday;
  } catch (err) {
    console.error("loadStats failed:", err);
  }
}

/* ========= Pending approvals ========= */
async function loadPendingApprovals() {
  pendingUsersList.innerHTML = '';
  try {
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    const pending = [];
    Object.entries(users).forEach(([uid, u]) => {
      if ((u.role === 'company' || u.role === 'customer') && u.approved !== true) {
        pending.push({ uid, ...u });
      }
    });
    if (!pending.length) { pendingUsersList.innerHTML = `<li class="list-group-item text-muted">No pending approvals</li>`; return; }

    pending.forEach(u => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      const left = document.createElement('div');
      left.innerHTML = `<strong>${safeText(u.companyName || u.email || u.name || u.uid)}</strong><div class="small text-muted">${safeText(u.role)}</div>`;
      const actions = document.createElement('div');

      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn btn-success btn-sm me-2';
      approveBtn.innerText = 'Approve';
      approveBtn.onclick = async () => {
        approveBtn.disabled = true;
        try {
          await db.ref(`users/${u.uid}`).update({ approved: true });
          await loadPendingApprovals(); await loadApprovedCompanies(); await loadStats();
        } catch (e) { console.error("approve error", e); alert("Approval failed"); } finally { approveBtn.disabled = false; }
      };

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn btn-danger btn-sm';
      rejectBtn.innerText = 'Reject';
      rejectBtn.onclick = async () => {
        if (!confirm("Delete this user?")) return;
        try { await db.ref(`users/${u.uid}`).remove(); await loadPendingApprovals(); await loadStats(); } catch (e) { console.error("reject error", e); alert("Reject failed"); }
      };

      actions.appendChild(approveBtn); actions.appendChild(rejectBtn);
      li.appendChild(left); li.appendChild(actions);
      pendingUsersList.appendChild(li);
    });
  } catch (err) {
    console.error("loadPendingApprovals error:", err);
    pendingUsersList.innerHTML = `<li class="list-group-item text-danger">Failed to load pending approvals</li>`;
  }
}

/* ========= Approved companies ========= */
async function loadApprovedCompanies() {
  companyTable.innerHTML = '';
  try {
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    let found = false;

    Object.entries(users).forEach(([uid, u]) => {
      if (u.role === 'company' && u.approved === true) {
        const companies = u.vehicle?.companies || {};
        Object.entries(companies).forEach(([cname, cdata]) => {
          found = true;
          const vehicles = cdata.vehicle || {};
          const deliveries = Object.values(vehicles).reduce((acc, v) => acc + (v.deliveries ? Object.keys(v.deliveries).length : 0), 0);
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${safeText(cname)}</td>
            <td>${Object.keys(vehicles).length}</td>
            <td>${deliveries}</td>
            <td>
              <button class="btn btn-sm btn-primary me-2">Edit</button>
              <button class="btn btn-sm btn-danger">Delete</button>
            </td>
          `;
          tr.querySelector('.btn-primary').onclick = () => editCompany(uid, cname);
          tr.querySelector('.btn-danger').onclick = () => deleteCompany(uid, cname);
          companyTable.appendChild(tr);
        });
      }
    });

    if (!found) companyTable.innerHTML = `<tr><td colspan="4" class="text-muted">No approved companies</td></tr>`;
  } catch (err) {
    console.error("loadApprovedCompanies error:", err);
    companyTable.innerHTML = `<tr><td colspan="4" class="text-danger">Failed to load companies</td></tr>`;
  }
}

async function editCompany(uid, oldName) {
  try {
    const newName = prompt("Enter new company name:", oldName);
    if (!newName || newName === oldName) return;
    if (newName.includes('/')) return alert("Company name cannot contain '/'");
    const srcSnap = await db.ref(`users/${uid}/vehicle/companies/${oldName}`).once('value');
    const data = srcSnap.val();
    if (!data) return alert("Source company data missing");
    const updates = {};
    updates[`users/${uid}/vehicle/companies/${newName}`] = data;
    updates[`users/${uid}/vehicle/companies/${oldName}`] = null;
    await db.ref().update(updates);
    await loadApprovedCompanies();
  } catch (err) {
    console.error("editCompany error", err);
    alert("Failed to edit company");
  }
}

async function deleteCompany(uid, cname) {
  if (!confirm(`Are you sure you want to delete "${cname}"?`)) return;
  try {
    await db.ref(`users/${uid}/vehicle/companies/${cname}`).remove();
    await loadApprovedCompanies(); await loadStats();
  } catch (err) {
    console.error("deleteCompany error", err);
    alert("Failed to delete company");
  }
}

/* ========= Map + live markers ========= */
function setupMap() {
  map = L.map('map', { preferCanvas: true }).setView([19.2183, 72.9781], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  markerGroup = L.featureGroup().addTo(map);

  if (liveUsersSnapshotUnsub) liveUsersSnapshotUnsub();

  const usersRef = db.ref('users');
  usersRef.on('value', snap => {
    const data = snap.val() || {};
    const bounds = [];
    const presentIds = new Set();

    Object.entries(data).forEach(([uid, u]) => {
      const companies = u.vehicle?.companies || {};
      Object.entries(companies).forEach(([cname, cdata]) => {
        const vehicles = cdata.vehicle || {};
        Object.entries(vehicles).forEach(([vid, v]) => {
          presentIds.add(vid);
          const pos = parseGps(v.gps);
          if (!pos) return;
          if (!markers[vid]) {
            const m = L.marker(pos).addTo(markerGroup);
            m.bindPopup(`<strong>${vid}</strong><div class="small text-muted">${safeText(cname)}</div>`);
            markers[vid] = m;
          } else {
            markers[vid].setLatLng(pos);
            markers[vid].getPopup().setContent(`<strong>${vid}</strong><div class="small text-muted">${safeText(cname)}</div>`);
          }
          bounds.push(pos);
        });
      });
    });

    Object.keys(markers).forEach(id => {
      if (!presentIds.has(id)) {
        markerGroup.removeLayer(markers[id]);
        delete markers[id];
      }
    });

    if (bounds.length) {
      try { map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 }); } catch (e) { console.warn("fitBounds failed", e); }
    }
  });

  liveUsersSnapshotUnsub = () => db.ref('users').off('value');
}

/* ========= Vehicle Tracker (debounced) ========= */
function setupTrackerInput() {
  const doSearch = async () => {
    const raw = trackVehicleIdInput.value.trim();
    if (!raw) { vehicleTrackerResult.innerHTML = ""; return null; }
    const idLower = raw.toLowerCase();
    vehicleTrackerResult.innerHTML = "<div class='text-muted'>Searching...</div>";

    try {
      const snap = await db.ref('users').once('value');
      const users = snap.val() || {};
      for (const [uid, u] of Object.entries(users)) {
        const companies = u.vehicle?.companies || {};
        for (const [cname, cdata] of Object.entries(companies)) {
          const vehicles = cdata.vehicle || {};
          for (const [vid, v] of Object.entries(vehicles)) {
            if (vid.toLowerCase() === idLower) {
              const gps = v.gps || 'Unknown';
              const battery = v.battery ?? 'N/A';
              vehicleTrackerResult.innerHTML = `
                <div class="alert alert-info mb-0">
                  🚚 <strong>${vid}</strong><br/>
                  Company: ${safeText(cname)}<br/>
                  Location: ${safeText(gps)}<br/>
                  Battery: ${safeText(battery)}%
                </div>
              `;
              return parseGps(v.gps);
            }
          }
        }
      }
      vehicleTrackerResult.innerHTML = `<div class="alert alert-warning mb-0">Vehicle not found</div>`;
      return null;
    } catch (err) {
      console.error("tracker search error", err);
      vehicleTrackerResult.innerHTML = `<div class="alert alert-danger mb-0">Search error</div>`;
      return null;
    }
  };

  const debounced = debounce(doSearch, 400);
  trackVehicleIdInput.addEventListener('input', debounced);

  centerOnVehicleBtn.addEventListener('click', async () => {
    const coords = await doSearch();
    if (coords && coords.length === 2) {
      map.setView(coords, 15);
      const rawId = trackVehicleIdInput.value.trim();
      if (markers[rawId]) markers[rawId].openPopup();
      const exactMarker = Object.keys(markers).find(k => k.toLowerCase() === rawId.toLowerCase());
      if (exactMarker && markers[exactMarker]) markers[exactMarker].openPopup();
    } else {
      const search = trackVehicleIdInput.value.trim().toLowerCase();
      const foundKey = Object.keys(markers).find(k => k.toLowerCase() === search);
      if (foundKey) { const m = markers[foundKey]; map.setView(m.getLatLng(), 15); m.openPopup(); }
      else alert('Vehicle coordinates not available to center on.');
    }
  });
}

/* ========= Dropdown population ========= */
async function populateCompanyCustomerDropdowns() {
  companySelect.innerHTML = '<option value="">— Select company (optional) —</option>';
  customerSelect.innerHTML = '<option value="">— Select customer (optional) —</option>';
  try {
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};
    const companySet = new Set();
    const companyList = [];
    const customers = [];

    Object.entries(users).forEach(([uid, u]) => {
      const companies = u.vehicle?.companies || {};
      Object.keys(companies).forEach(cname => {
        if (!companySet.has(cname)) { companySet.add(cname); companyList.push(cname); }
      });
      if (u.role === 'customer' && u.approved === true) customers.push({ uid, name: u.name || u.email || uid });
    });

    companyList.sort((a,b) => a.localeCompare(b)).forEach(name => {
      const opt = document.createElement('option'); opt.value = name; opt.textContent = name; companySelect.appendChild(opt);
    });
    customers.sort((a,b) => (a.name||'').localeCompare(b.name||'')).forEach(c => {
      const opt = document.createElement('option'); opt.value = c.uid; opt.textContent = c.name; customerSelect.appendChild(opt);
    });
  } catch (err) { console.error("populateCompanyCustomerDropdowns error:", err); }
}

/* ========= Manual Alarm (fixed multi-path updates) ========= */
function setupAlarmHandler() {
  triggerAlarmBtn.addEventListener('click', async () => {
    alarmStatusEl.innerHTML = '';
    const selectedCompany = companySelect.value || null;
    const selectedCustomerUid = customerSelect.value || null;
    const vehicleIdRaw = alarmVehicleIdInput.value.trim() || null;

    if (!selectedCompany && !selectedCustomerUid && !vehicleIdRaw) {
      alarmStatusEl.innerHTML = `<div class="alert alert-warning">Select a company/customer or enter a vehicle ID</div>`;
      return;
    }

    alarmStatusEl.innerHTML = `<div class="text-muted">Searching and triggering alarm...</div>`;

    try {
      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.val() || {};
      const updates = {}; // multi-path updates
      let triggeredCount = 0;

      // 1) If vehicle ID provided -> search across users -> update each matching vehicle's last_trigger under that user's path
      if (vehicleIdRaw) {
        const vid = vehicleIdRaw;
        for (const [uid, u] of Object.entries(users)) {
          const companies = u.vehicle?.companies || {};
          for (const [cname, cdata] of Object.entries(companies)) {
            const vehicles = cdata.vehicle || {};
            if (vehicles && vehicles[vid]) {
              const triggerData = {
                status: "manual",
                vehicleId: vid,
                time: new Date().toISOString(),
                location: vehicles[vid].gps || "Unknown",
                by: "super-admin"
              };
              // write under user's vehicle last_trigger and push to triggersHistory
              const newKey = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
              updates[`users/${uid}/vehicle/last_trigger`] = triggerData;
              updates[`users/${uid}/vehicle/triggersHistory/${newKey}`] = triggerData;
              triggeredCount++;
            }
          }
        }
      }

      // 2) If company selected -> trigger all vehicles under that company across users
      if (selectedCompany) {
        const cname = selectedCompany;
        for (const [uid, u] of Object.entries(users)) {
          const companyNode = (u.vehicle?.companies || {})[cname];
          if (companyNode) {
            const vehicles = companyNode.vehicle || {};
            for (const vid of Object.keys(vehicles)) {
              const triggerData = {
                status: "manual",
                vehicleId: vid,
                time: new Date().toISOString(),
                location: vehicles[vid].gps || "Unknown",
                by: "super-admin"
              };
              const newKey = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
              updates[`users/${uid}/vehicle/last_trigger`] = triggerData;
              updates[`users/${uid}/vehicle/triggersHistory/${newKey}`] = triggerData;
              triggeredCount++;
            }
          }
        }
      }

      // 3) If a specific customer user selected -> set last_trigger on that user's vehicle node (if any)
      if (selectedCustomerUid) {
        const uid = selectedCustomerUid;
        const userNode = users[uid];
        if (userNode) {
          // trigger a generic entry for the user (vehicleId may be provided or not)
          const triggerData = {
            status: "manual",
            vehicleId: vehicleIdRaw || "N/A",
            time: new Date().toISOString(),
            location: "Unknown",
            by: "super-admin"
          };
          const newKey = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
          updates[`users/${uid}/vehicle/last_trigger`] = triggerData;
          updates[`users/${uid}/vehicle/triggersHistory/${newKey}`] = triggerData;
          triggeredCount++;
        }
      }

      if (Object.keys(updates).length === 0) {
        alarmStatusEl.innerHTML = `<div class="alert alert-warning">No matching targets found to trigger</div>`;
        return;
      }

      // commit multi-path update once
      await db.ref().update(updates);

      alarmStatusEl.innerHTML = `<div class="alert alert-danger">🚨 Alarm triggered for ${triggeredCount} target(s)</div>`;
      await loadStats(); // refresh counts
    } catch (err) {
      console.error("triggerAlarm error", err);
      alarmStatusEl.innerHTML = `<div class="alert alert-danger">Failed to trigger alarm</div>`;
    }
  });
}

/* ========= Periodic refresh ========= */
setInterval(() => { loadStats(); loadApprovedCompanies(); loadPendingApprovals(); populateCompanyCustomerDropdowns(); }, 120000);

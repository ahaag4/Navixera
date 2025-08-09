/* dashboard.js
   SVMS Super Admin Dashboard (client-side)
   - Firebase compat v8 usage
   - Live vehicle markers on Leaflet map
   - Vehicle search that centers map on found vehicle
   - Manual alarm: select company/customer OR enter vehicle ID (searches across all companies)
   - Approved companies table + pending approvals
   - Notes: secure your Realtime DB rules for production
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
let liveUsersSnapshotUnsub = null; // for cleanup if needed

/* ========= Utility helpers ========= */
const delay = ms => new Promise(res => setTimeout(res, ms));

function safeText(str) {
  if (str === undefined || str === null) return "";
  return String(str);
}

/* Debounce helper */
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* Convert "lat,lng" string to [lat, lng] or null */
function parseGps(gps) {
  if (!gps) return null;
  const parts = String(gps).split(",").map(s => s.trim());
  if (parts.length < 2) return null;
  const lat = Number(parts[0]), lng = Number(parts[1]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  // reject obvious invalid points
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

/* Format ISO-time for UI */
function formatTime(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return safeText(iso); }
}

/* ========= Auth & initialization ========= */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }

  try {
    const snap = await db.ref(`users/${user.uid}`).once('value');
    const me = snap.val() || {};
    currentUserEl.innerText = `${me.email || user.email || ""} (${me.role || "user"})`;
    if (me.role !== "super-admin") {
      // non-admins redirected
      location.href = "dashboard.html";
      return;
    }

    // Initialize all UI and listeners
    initializeDashboard();
  } catch (err) {
    console.error("Auth/init error:", err);
    await auth.signOut();
    location.href = "login.html";
  }
});

/* Logout */
logoutBtn.addEventListener("click", () => auth.signOut().then(() => location.href = "login.html"));

/* ========= Initialize dashboard ========= */
function initializeDashboard() {
  loadStats();                // one-time + periodic
  loadPendingApprovals();
  loadApprovedCompanies();
  setupMap();                 // creates map + starts real-time user listener
  setupTrackerInput();        // setup debounced search
  populateCompanyCustomerDropdowns(); // populate selects
  setupAlarmHandler();
  // periodic refresh for counts/stats
  setInterval(() => { loadStats(); loadApprovedCompanies(); loadPendingApprovals(); }, 60_000);
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

    if (!pending.length) {
      pendingUsersList.innerHTML = `<li class="list-group-item text-muted">No pending approvals</li>`;
      return;
    }

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
          await loadPendingApprovals();
          await loadApprovedCompanies();
          await loadStats();
        } catch (e) {
          console.error("approve error", e);
          alert("Approval failed");
        } finally { approveBtn.disabled = false; }
      };

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn btn-danger btn-sm';
      rejectBtn.innerText = 'Reject';
      rejectBtn.onclick = async () => {
        if (!confirm("Delete this user?")) return;
        try {
          await db.ref(`users/${u.uid}`).remove();
          await loadPendingApprovals();
          await loadStats();
        } catch (e) {
          console.error("reject error", e);
          alert("Reject failed");
        }
      };

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      li.appendChild(left);
      li.appendChild(actions);
      pendingUsersList.appendChild(li);
    });

  } catch (err) {
    console.error("loadPendingApprovals error:", err);
    pendingUsersList.innerHTML = `<li class="list-group-item text-danger">Failed to load pending approvals</li>`;
  }
}

/* ========= Approved companies table ========= */
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

    if (!found) {
      companyTable.innerHTML = `<tr><td colspan="4" class="text-muted">No approved companies</td></tr>`;
    }
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
    await loadApprovedCompanies();
    await loadStats();
  } catch (err) {
    console.error("deleteCompany error", err);
    alert("Failed to delete company");
  }
}

/* ========= Map + live markers ========= */
function setupMap() {
  // Initialize map
  map = L.map('map', { preferCanvas: true }).setView([19.2183, 72.9781], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  markerGroup = L.featureGroup().addTo(map);

  // Real-time users listener: update markers whenever users node changes
  if (liveUsersSnapshotUnsub) liveUsersSnapshotUnsub(); // cleanup if existing

  const usersRef = db.ref('users');
  usersRef.on('value', snap => {
    const data = snap.val() || {};
    const bounds = [];
    const presentIds = new Set();

    // iterate users -> companies -> vehicles
    Object.entries(data).forEach(([uid, u]) => {
      const companies = u.vehicle?.companies || {};
      Object.entries(companies).forEach(([cname, cdata]) => {
        const vehicles = cdata.vehicle || {};
        Object.entries(vehicles).forEach(([vid, v]) => {
          presentIds.add(vid);
          const pos = parseGps(v.gps);
          if (!pos) return; // skip invalid coordinates
          // create or update marker
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

    // remove markers for vehicles no longer present
    Object.keys(markers).forEach(id => {
      if (!presentIds.has(id)) {
        markerGroup.removeLayer(markers[id]);
        delete markers[id];
      }
    });

    if (bounds.length) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch (err) {
        console.warn("fitBounds failed:", err);
      }
    }
  });

  // store unsub function (not native but for symmetry; we can call off('value') if needed)
  liveUsersSnapshotUnsub = () => db.ref('users').off('value');
}

/* ========= Vehicle Tracker input (debounced search) ========= */
function setupTrackerInput() {
  const doSearch = async () => {
    const raw = trackVehicleIdInput.value.trim();
    if (!raw) {
      vehicleTrackerResult.innerHTML = "";
      return null;
    }
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
              // return coordinates to optionally center the map
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

  // center on vehicle button: runs a fresh search and centers map if coords returned
  centerOnVehicleBtn.addEventListener('click', async () => {
    const coords = await doSearch();
    if (coords && coords.length === 2) {
      map.setView(coords, 15);
      // open popup if marker exists
      const rawId = trackVehicleIdInput.value.trim();
      if (markers[rawId]) markers[rawId].openPopup();
      // also open a solver if case mismatch
      const exactMarker = Object.keys(markers).find(k => k.toLowerCase() === rawId.toLowerCase());
      if (exactMarker && markers[exactMarker]) markers[exactMarker].openPopup();
    } else {
      // try case-insensitive find in markers
      const search = trackVehicleIdInput.value.trim().toLowerCase();
      const foundKey = Object.keys(markers).find(k => k.toLowerCase() === search);
      if (foundKey) {
        const m = markers[foundKey];
        map.setView(m.getLatLng(), 15);
        m.openPopup();
      } else {
        alert('Vehicle coordinates not available to center on.');
      }
    }
  });
}

/* ========= Manual Alarm UI (company/customer selects) ========= */
async function populateCompanyCustomerDropdowns() {
  // companySelect: show all companies across users
  companySelect.innerHTML = '<option value="">— Select company (optional) —</option>';
  customerSelect.innerHTML = '<option value="">— Select customer (optional) —</option>';

  try {
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};

    // collect companies (unique)
    const companyEntries = []; // { uid, companyName, label }
    const companySet = new Set();
    const customers = [];

    Object.entries(users).forEach(([uid, u]) => {
      // companies as stored in user's vehicle.companies
      const companies = u.vehicle?.companies || {};
      Object.keys(companies).forEach(cname => {
        if (!companySet.has(cname)) {
          companySet.add(cname);
          companyEntries.push({ uid, companyName: cname });
        }
      });

      // customers are users with role 'customer' and approved
      if (u.role === 'customer' && u.approved === true) {
        customers.push({ uid, name: u.name || u.email || uid });
      }
    });

    // populate companies
    companyEntries.sort((a,b) => a.companyName.localeCompare(b.companyName));
    companyEntries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.companyName;
      opt.textContent = c.companyName;
      companySelect.appendChild(opt);
    });

    // populate customers
    customers.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    customers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.uid;
      opt.textContent = c.name;
      customerSelect.appendChild(opt);
    });

  } catch (err) {
    console.error("populateCompanyCustomerDropdowns error:", err);
  }
}

/* ========= Manual Alarm trigger logic ========= */
function setupAlarmHandler() {
  triggerAlarmBtn.addEventListener('click', async () => {
    alarmStatusEl.innerHTML = ''; // reset status
    const selectedCompany = companySelect.value || null;
    const selectedCustomerUid = customerSelect.value || null;
    const vehicleIdRaw = alarmVehicleIdInput.value.trim() || null;

    // validate: at least one of company/customer/vehicle must be provided
    if (!selectedCompany && !selectedCustomerUid && !vehicleIdRaw) {
      alarmStatusEl.innerHTML = `<div class="alert alert-warning">Select a company/customer or enter a vehicle ID</div>`;
      return;
    }

    alarmStatusEl.innerHTML = `<div class="text-muted">Searching and triggering alarm...</div>`;

    try {
      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.val() || {};
      let triggeredCount = 0;

      // If vehicle ID provided -> search across all users -> trigger wherever found
      if (vehicleIdRaw) {
        const vid = vehicleIdRaw;
        for (const [uid, u] of Object.entries(users)) {
          const companies = u.vehicle?.companies || {};
          for (const [cname, cdata] of Object.entries(companies)) {
            const vehicles = cdata.vehicle || {};
            if (vehicles && vehicles[vid]) {
              // trigger for this user
              const triggerData = {
                status: "alert",
                vehicleId: vid,
                time: new Date().toISOString(),
                location: vehicles[vid].gps || "Unknown",
                by: "super-admin"
              };

              const newKey = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
              const updates = {};
              updates[`users/${uid}/vehicle/last_trigger`] = triggerData;
              updates[`users/${uid}/vehicle/triggersHistory/${newKey}`] = triggerData;
              await db.ref().update(updates);
              triggeredCount++;
            }
          }
        }
      }

      // If company selected -> trigger for all vehicles under that company (across users)
      if (selectedCompany) {
        const cname = selectedCompany;
        for (const [uid, u] of Object.entries(users)) {
          const companyNode = (u.vehicle?.companies || {})[cname];
          if (companyNode) {
            const vehicles = companyNode.vehicle || {};
            for (const vid of Object.keys(vehicles)) {
              const triggerData = {
                status: "alert",
                vehicleId: vid,
                time: new Date().toISOString(),
                location: vehicles[vid].gps || "Unknown",
                by: "super-admin"
              };
              const newKey = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
              const updates = {};
              updates[`users/${uid}/vehicle/last_trigger`] = triggerData;
              updates[`users/${uid}/vehicle/triggersHistory/${newKey}`] = triggerData;
              await db.ref().update(updates);
              triggeredCount++;
            }
          }
        }
      }

      // If customer selected -> trigger on that customer's user object (if they have vehicle node)
      if (selectedCustomerUid) {
        const uid = selectedCustomerUid;
        const userNode = users[uid];
        if (userNode) {
          // if they have vehicles under their account - trigger last_trigger
          const anyVehicle = Object.values(userNode.vehicle?.companies || {})?.[0];
          const triggerData = {
            status: "alert",
            vehicleId: vehicleIdRaw || "N/A",
            time: new Date().toISOString(),
            location: "N/A",
            by: "super-admin"
          };
          // write last_trigger + triggersHistory
          const newKey = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
          const updates = {};
          updates[`users/${uid}/vehicle/last_trigger`] = triggerData;
          updates[`users/${uid}/vehicle/triggersHistory/${newKey}`] = triggerData;
          await db.ref().update(updates);
          triggeredCount++;
        }
      }

      if (triggeredCount > 0) {
        alarmStatusEl.innerHTML = `<div class="alert alert-danger">🚨 Alarm triggered for ${triggeredCount} target(s)</div>`;
        // update stats
        await loadStats();
      } else {
        alarmStatusEl.innerHTML = `<div class="alert alert-warning">No matching targets found to trigger</div>`;
      }

    } catch (err) {
      console.error("triggerAlarm error", err);
      alarmStatusEl.innerHTML = `<div class="alert alert-danger">Failed to trigger alarm</div>`;
    }
  });
}

/* ========= Misc: populate dropdowns periodically ========= */
setInterval(() => populateCompanyCustomerDropdowns(), 2 * 60_000); // refresh every 2 minutes
// initial populate call already happens from initializeDashboard()

/* ========= End of file ========= */

/* superadmin.js
   SVMS Super Admin dashboard client
   - Firebase compat (v9 compat scripts used in HTML)
   - Real-time vehicle markers, tracker (center & follow), manual alarm (multi-path update)
   - Movement history plotting + deletion
   - Responsive, accessible UI interactions
*/

/* ====== CONFIG ======
   Replace firebaseConfig values if different environment is used.
   Keep this on client only if rules + custom claims are secure.
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

/* ====== DOM refs ====== */
const totalCompaniesEl = document.getElementById("totalCompanies");
const totalVehiclesEl = document.getElementById("totalVehicles");
const totalDeliveriesEl = document.getElementById("totalDeliveries");
const alertsTodayEl = document.getElementById("alertsToday");

const pendingUsersList = document.getElementById("pendingUsersList");
const approvedUsersTable = document.getElementById("approvedUsersTable");

const trackVehicleIdInput = document.getElementById("trackVehicleId");
const centerOnVehicleBtn = document.getElementById("centerOnVehicleBtn");
const followToggleBtn = document.getElementById("followToggleBtn");
const vehicleTrackerResult = document.getElementById("vehicleTrackerResult");

const alarmCompanySelect = document.getElementById("alarmCompanySelect");
const alarmCustomerSelect = document.getElementById("alarmCustomerSelect");
const alarmVehicleIdInput = document.getElementById("alarmVehicleId");
const triggerAlarmBtn = document.getElementById("triggerAlarmBtn");
const alarmStatusEl = document.getElementById("alarmStatus");

const historyUserSelect = document.getElementById("historyUserSelect");
const loadHistoryBtn = document.getElementById("loadHistoryBtn");
const deleteHistoryBtn = document.getElementById("deleteHistoryBtn");

const logoutBtn = document.getElementById("logoutBtn");
const currentUserEl = document.getElementById("currentUser");

/* ====== Map state ====== */
let map, historyMap;
let markerGroup;
const markers = {};           // { vehicleId: L.Marker }
let followVehicleId = null;
let followInterval = null;

/* ====== Helpers ====== */
const safe = v => (v === undefined || v === null) ? "" : String(v);
const debounce = (fn, ms=350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };
function parseGps(gps) {
  if (!gps) return null;
  const p = String(gps).split(",").map(s => s.trim());
  if (p.length < 2) return null;
  const lat = Number(p[0]), lng = Number(p[1]);
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return [lat, lng];
}

/* ====== Auth ====== */
auth.onAuthStateChanged(async user => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  try {
    const snap = await db.ref(`users/${user.uid}`).once('value');
    const me = snap.val() || {};
    currentUserEl.innerText = `${me.email || user.email || ""} (${me.role || "user"})`;
    if (me.role !== "super-admin") {
      // not permitted here
      location.href = "dashboard.html";
      return;
    }
    initDashboard();
  } catch (err) {
    console.error("Auth init error:", err);
    await auth.signOut();
    location.href = "login.html";
  }
});

logoutBtn.addEventListener("click", () => auth.signOut().then(()=> location.href = "login.html"));

/* ====== Initialization ====== */
function initDashboard(){
  initMaps();
  setupRealtimeUsersListener();  // markers + automatic updates
  loadStats();
  loadPendingApprovals();
  loadApprovedUsers();           // table + company list
  populateAlarmDropdowns();
  setupTracker();
  setupAlarmHandler();
  setupHistoryControls();

  // periodic refresh
  setInterval(() => {
    loadStats();
    loadApprovedUsers();
    populateAlarmDropdowns();
  }, 60000);
}

/* ====== Maps ====== */
function initMaps() {
  map = L.map('map', { preferCanvas: true }).setView([19.2183,72.9781], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19 }).addTo(map);
  markerGroup = L.featureGroup().addTo(map);

  historyMap = L.map('historyMap', { preferCanvas: true, attributionControl:false }).setView([19.2183,72.9781], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19 }).addTo(historyMap);
}

/* ====== Real-time users -> markers ====== */
function setupRealtimeUsersListener() {
  const usersRef = db.ref('users');
  usersRef.on('value', snap => {
    const users = snap.val() || {};
    const bounds = [];
    const presentIds = new Set();

    Object.entries(users).forEach(([uid, user]) => {
      const companies = user.vehicle?.companies || {};
      Object.entries(companies).forEach(([companyName, cnode]) => {
        const vehicles = cnode.vehicle || {};
        Object.entries(vehicles).forEach(([vid, v]) => {
          presentIds.add(vid);
          const coords = parseGps(v.gps);
          if (!coords) return;
          if (!markers[vid]) {
            const m = L.marker(coords, { title: vid }).addTo(markerGroup);
            m.bindPopup(`<strong>${vid}</strong><div class="small text-muted">${safe(companyName)}</div>`);
            markers[vid] = m;
          } else {
            markers[vid].setLatLng(coords);
            const popup = markers[vid].getPopup();
            if (popup) popup.setContent(`<strong>${vid}</strong><div class="small text-muted">${safe(companyName)}</div>`);
          }
          bounds.push(coords);
        });
      });
    });

    // remove obsolete markers
    Object.keys(markers).forEach(id => {
      if (!presentIds.has(id)) {
        try { markerGroup.removeLayer(markers[id]); } catch(e) {}
        delete markers[id];
      }
    });

    if (bounds.length) {
      try { map.fitBounds(bounds, { padding:[50,50], maxZoom: 15 }); } catch(e){ /*ignore*/ }
    }
  });
}

/* ====== Stats ====== */
async function loadStats(){
  try{
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    let totalCompanies=0, totalVehicles=0, totalDeliveries=0, alertsToday=0;
    const todayStr = new Date().toDateString();

    Object.values(users).forEach(u=>{
      const companies = u.vehicle?.companies || {};
      Object.keys(companies).forEach(cn=>{
        totalCompanies++;
        const vehicles = companies[cn].vehicle || {};
        const vkeys = Object.keys(vehicles);
        totalVehicles += vkeys.length;
        vkeys.forEach(vk=>{
          totalDeliveries += Object.keys(vehicles[vk].deliveries || {}).length;
        });
      });
      const last = u.vehicle?.last_trigger;
      if (last?.status === 'alert' && last?.time && new Date(last.time).toDateString() === todayStr) alertsToday++;
    });

    totalCompaniesEl.innerText = totalCompanies;
    totalVehiclesEl.innerText = totalVehicles;
    totalDeliveriesEl.innerText = totalDeliveries;
    alertsTodayEl.innerText = alertsToday;
  }catch(err){
    console.error("loadStats", err);
  }
}

/* ====== Pending approvals ====== */
async function loadPendingApprovals(){
  pendingUsersList.innerHTML = '';
  try{
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    const pending = [];

    Object.entries(users).forEach(([uid,u])=>{
      if ((u.role === 'company' || u.role === 'customer') && u.approved !== true) pending.push({ uid, ...u });
    });

    if (!pending.length) {
      pendingUsersList.innerHTML = '<li class="list-group-item text-muted">No pending approvals</li>';
      return;
    }

    pending.forEach(u=>{
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.innerHTML = `<div><strong>${safe(u.companyName || u.name || u.email || u.uid)}</strong><div class="small text-muted">${safe(u.role)}</div></div>`;
      const actions = document.createElement('div');
      const approveBtn = document.createElement('button'); approveBtn.className='btn btn-success btn-sm me-2'; approveBtn.innerText='Approve';
      const rejectBtn = document.createElement('button'); rejectBtn.className='btn btn-danger btn-sm'; rejectBtn.innerText='Reject';

      approveBtn.onclick = async () => {
        approveBtn.disabled = true;
        try { await db.ref(`users/${u.uid}`).update({ approved: true }); await loadPendingApprovals(); await loadApprovedUsers(); await loadStats(); }
        catch(e){ console.error(e); alert('Approval failed'); } finally { approveBtn.disabled = false; }
      };
      rejectBtn.onclick = async () => {
        if (!confirm('Delete this user?')) return;
        try { await db.ref(`users/${u.uid}`).remove(); await loadPendingApprovals(); await loadStats(); }
        catch(e){ console.error(e); alert('Reject failed'); }
      };

      actions.appendChild(approveBtn); actions.appendChild(rejectBtn);
      li.appendChild(actions); pendingUsersList.appendChild(li);
    });

  }catch(err){ console.error("loadPendingApprovals", err); pendingUsersList.innerHTML = '<li class="list-group-item text-danger">Failed to load</li>'; }
}

/* ====== Approved users / companies table ====== */
async function loadApprovedUsers(){
  approvedUsersTable.innerHTML = '';
  try{
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    let found=false;

    Object.entries(users).forEach(([uid,u])=>{
      if (u.role === 'company' && u.approved === true) {
        const companies = u.vehicle?.companies || {};
        Object.entries(companies).forEach(([cname,cdata])=>{
          found = true;
          const vehicles = cdata.vehicle || {};
          const deliveries = Object.values(vehicles).reduce((acc,v)=> acc + (v.deliveries ? Object.keys(v.deliveries).length : 0), 0);
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${safe(cname)}</td><td>${Object.keys(vehicles).length}</td><td>${deliveries}</td>
                          <td><button class="btn btn-sm btn-outline-danger">Remove</button></td>`;
          approvedUsersTable.appendChild(tr);
        });
      }
    });

    if (!found) approvedUsersTable.innerHTML = '<tr><td colspan="4" class="text-muted">No approved companies</td></tr>';
  }catch(err){ console.error("loadApprovedUsers", err); approvedUsersTable.innerHTML = '<tr><td colspan="4" class="text-danger">Failed to load</td></tr>'; }
}

/* ====== Alarm dropdowns population ====== */
async function populateAlarmDropdowns(){
  alarmCompanySelect.innerHTML = '<option value="">— Select company (optional) —</option>';
  alarmCustomerSelect.innerHTML = '<option value="">— Select customer (optional) —</option>';
  historyUserSelect.innerHTML = '<option value="">— Select user —</option>';
  try{
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    const companySet = new Set();
    const customers = [];

    Object.entries(users).forEach(([uid,u])=>{
      const companies = u.vehicle?.companies || {};
      Object.keys(companies).forEach(cn => { if (!companySet.has(cn)) { companySet.add(cn); }});
      if (u.role === 'customer' && u.approved === true) customers.push({ uid, name: u.name || u.email || uid });
    });

    [...companySet].sort().forEach(cn => {
      const opt = document.createElement('option'); opt.value = cn; opt.textContent = cn; alarmCompanySelect.appendChild(opt);
    });

    customers.sort((a,b)=> (a.name||'').localeCompare(b.name||'')).forEach(c=>{
      const opt = document.createElement('option'); opt.value = c.uid; opt.textContent = c.name; alarmCustomerSelect.appendChild(opt);
    });

    // history users: list all approved users
    Object.entries(users).forEach(([uid,u])=>{
      const label = u.companyName || u.name || u.email || uid;
      const opt = document.createElement('option'); opt.value = uid; opt.textContent = label;
      historyUserSelect.appendChild(opt);
    });

  }catch(err){ console.error('populateAlarmDropdowns', err); }
}

/* ====== Vehicle tracker (search, center, follow) ====== */
function setupTracker(){
  const doSearch = async () => {
    const q = trackVehicleIdInput.value.trim();
    if (!q) { vehicleTrackerResult.innerHTML = ''; return null; }
    vehicleTrackerResult.innerHTML = '<div class="small-muted">Searching...</div>';
    try {
      const snap = await db.ref('users').once('value');
      const users = snap.val() || {};
      const ql = q.toLowerCase();
      for (const [uid,u] of Object.entries(users)) {
        const companies = u.vehicle?.companies || {};
        for (const [cname, cdata] of Object.entries(companies)) {
          const vehicles = cdata.vehicle || {};
          for (const [vid, v] of Object.entries(vehicles)) {
            if (vid.toLowerCase() === ql) {
              vehicleTrackerResult.innerHTML = `<div class="alert alert-info">🚚 <strong>${vid}</strong><br/>Company: ${safe(cname)}<br/>Location: ${safe(v.gps || 'Unknown')}<br/>Battery: ${safe(v.battery || 'N/A')}%</div>`;
              return {vid, coords: parseGps(v.gps)};
            }
          }
        }
      }
      vehicleTrackerResult.innerHTML = '<div class="alert alert-warning">Vehicle not found</div>';
      return null;
    } catch (err) {
      console.error('tracker search', err);
      vehicleTrackerResult.innerHTML = '<div class="alert alert-danger">Search error</div>';
      return null;
    }
  };

  const deb = debounce(doSearch, 300);
  trackVehicleIdInput.addEventListener('input', deb);

  centerOnVehicleBtn.addEventListener('click', async ()=>{
    const res = await doSearch();
    if (res && res.coords) {
      map.setView(res.coords, 15);
      if (markers[res.vid]) markers[res.vid].openPopup();
    } else {
      // try case-insensitive marker find
      const key = Object.keys(markers).find(k => k.toLowerCase() === trackVehicleIdInput.value.trim().toLowerCase());
      if (key && markers[key]) { map.setView(markers[key].getLatLng(), 15); markers[key].openPopup(); }
      else alert('Vehicle coordinates not available to center on.');
    }
  });

  followToggleBtn.addEventListener('click', () => {
    const val = trackVehicleIdInput.value.trim();
    if (!val) return alert('Enter vehicle id to follow');
    if (followVehicleId === val) {
      // stop following
      followVehicleId = null;
      followToggleBtn.innerText = 'Follow: off';
      if (followInterval) { clearInterval(followInterval); followInterval = null; }
    } else {
      followVehicleId = val;
      followToggleBtn.innerText = 'Follow: on';
      // poll marker position every 1s and center map
      followInterval = setInterval(() => {
        const key = Object.keys(markers).find(k => k.toLowerCase() === followVehicleId.toLowerCase());
        if (key && markers[key]) {
          map.setView(markers[key].getLatLng(), map.getZoom());
        }
      }, 1000);
    }
  });
}

/* ====== Manual Alarm (multi-path updates) ====== */
function setupAlarmHandler(){
  triggerAlarmBtn.addEventListener('click', async ()=>{
    alarmStatusEl.innerHTML = '';
    const company = alarmCompanySelect.value || null;
    const customerUid = alarmCustomerSelect.value || null;
    const vehicleId = alarmVehicleIdInput.value.trim() || null;

    if (!company && !customerUid && !vehicleId) {
      alarmStatusEl.innerHTML = '<div class="alert alert-warning">Select a company/customer or enter a vehicle ID</div>';
      return;
    }

    alarmStatusEl.innerHTML = '<div class="small-muted">Searching & triggering...</div>';

    try {
      const snap = await db.ref('users').once('value');
      const users = snap.val() || {};
      const updates = {};
      let triggered = 0;

      // vehicleId search across all users
      if (vehicleId) {
        for (const [uid,u] of Object.entries(users)) {
          const companies = u.vehicle?.companies || {};
          for (const [cname, cdata] of Object.entries(companies)) {
            const vehicles = cdata.vehicle || {};
            if (vehicles && vehicles[vehicleId]) {
              const td = { status:'manual', vehicleId, time: new Date().toISOString(), location: vehicles[vehicleId].gps || 'Unknown', by: 'super-admin' };
              const key = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
              updates[`users/${uid}/vehicle/last_trigger`] = td;
              updates[`users/${uid}/vehicle/triggersHistory/${key}`] = td;
              triggered++;
            }
          }
        }
      }

      // company -> all vehicles for that company across users
      if (company) {
        for (const [uid,u] of Object.entries(users)) {
          const companyNode = (u.vehicle?.companies || {})[company];
          if (companyNode) {
            const vehicles = companyNode.vehicle || {};
            for (const vid of Object.keys(vehicles)) {
              const td = { status:'manual', vehicleId: vid, time: new Date().toISOString(), location: vehicles[vid].gps || 'Unknown', by: 'super-admin' };
              const key = db.ref().child(`users/${uid}/vehicle/triggersHistory`).push().key;
              updates[`users/${uid}/vehicle/last_trigger`] = td;
              updates[`users/${uid}/vehicle/triggersHistory/${key}`] = td;
              triggered++;
            }
          }
        }
      }

      // customer selected -> write to that user's vehicle/last_trigger
      if (customerUid) {
        const u = users[customerUid];
        if (u) {
          const td = { status:'manual', vehicleId: vehicleId || 'N/A', time: new Date().toISOString(), location: 'Unknown', by: 'super-admin' };
          const key = db.ref().child(`users/${customerUid}/vehicle/triggersHistory`).push().key;
          updates[`users/${customerUid}/vehicle/last_trigger`] = td;
          updates[`users/${customerUid}/vehicle/triggersHistory/${key}`] = td;
          triggered++;
        }
      }

      if (Object.keys(updates).length === 0) {
        alarmStatusEl.innerHTML = '<div class="alert alert-warning">No targets found</div>';
        return;
      }

      await db.ref().update(updates);
      alarmStatusEl.innerHTML = `<div class="alert alert-danger">🚨 Alarm triggered for ${triggered} target(s)</div>`;
      await loadStats();
    } catch (err) {
      console.error('triggerAlarm', err);
      alarmStatusEl.innerHTML = '<div class="alert alert-danger">Failed to trigger alarm — check console for details</div>';
    }
  });
}

/* ====== Movement history functions ====== */
function setupHistoryControls(){
  loadHistoryBtn.addEventListener('click', loadHistoryByUser);
  deleteHistoryBtn.addEventListener('click', deleteHistoryForSelectedUser);
}

async function loadHistoryByUser(){
  const uid = historyUserSelect.value;
  if (!uid) return alert('Select user first');
  try {
    const snap = await db.ref(`users/${uid}/vehicle/triggersHistory`).once('value');
    const history = snap.val() || {};
    // Expect history entries that may include location as gps (or store path in a separate node)
    // We'll attempt to collect gps points stored under e.g., location or gps field joined by semicolons
    const points = [];
    Object.values(history).forEach(entry => {
      // try different fields
      if (entry.location && typeof entry.location === 'string') {
        const coords = parseGps(entry.location);
        if (coords) points.push(coords);
      } else if (entry.path && Array.isArray(entry.path)) {
        entry.path.forEach(p=> { const c = parseGps(p); if (c) points.push(c); });
      }
    });

    if (!points.length) {
      alert('No location history found for this user.');
      deleteHistoryBtn.style.display = 'none';
      return;
    }

    // remove existing layers
    historyMap.eachLayer(layer => { if (layer instanceof L.Polyline || layer instanceof L.Marker) historyMap.removeLayer(layer); });

    // draw polyline
    const poly = L.polyline(points, { color: 'red', weight: 4, opacity: 0.8 }).addTo(historyMap);
    historyMap.fitBounds(poly.getBounds(), { padding:[40,40], maxZoom:16 });

    // show delete option
    deleteHistoryBtn.style.display = 'inline-block';
    deleteHistoryBtn.dataset.uid = uid;
  } catch (err) {
    console.error('loadHistoryByUser', err);
    alert('Failed to load history');
  }
}

async function deleteHistoryForSelectedUser(){
  const uid = deleteHistoryBtn.dataset.uid;
  if (!uid) return;
  if (!confirm('Delete all history for this user? This cannot be undone.')) return;
  try {
    await db.ref(`users/${uid}/vehicle/triggersHistory`).remove();
    deleteHistoryBtn.style.display = 'none';
    alert('Deleted history');
    // clear historyMap layers
    historyMap.eachLayer(layer => { if (layer instanceof L.Polyline || layer instanceof L.Marker) historyMap.removeLayer(layer); });
  } catch (err) {
    console.error('deleteHistoryForSelectedUser', err);
    alert('Delete failed — check console for details');
  }
      }

// Firebase config
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

let liveMap, historyMap, liveMarkers = {}, historyMarkers = [];

// -------- Authentication --------
auth.onAuthStateChanged(user => {
  if (!user) return location.href = "login.html";
  db.ref(`users/${user.uid}`).once("value", snap => {
    if (snap.val()?.role !== "super-admin") return location.href = "dashboard.html";
    initDashboard();
  });
});

function logout(){
  auth.signOut().then(() => location.href="login.html");
}

// -------- Dashboard Init and Core Loaders --------
function initDashboard(){
  loadStats();
  loadPendingApprovals();
  loadApprovedUsers();
  loadUserDropdowns();
  setupLiveMap();
  setupHistoryMap();
  document.getElementById("trackVehicleId").addEventListener("input",trackVehicle);
}

// -------- Stats --------
function loadStats(){
  db.ref("users").once("value", snap=>{
    const users=snap.val()||{};
    let tc=0,tv=0,td=0,alerts=0,companiesSet=new Set();
    for(const uid in users){
      const u = users[uid];
      if(u.vehicle?.companies) {
        for(const cname in u.vehicle.companies){
          companiesSet.add(cname);
          const vehSet = u.vehicle.companies[cname].vehicle||{};
          tv += Object.keys(vehSet).length;
          for(const vid in vehSet){
            const deliveries = vehSet[vid].deliveries;
            if(deliveries && typeof deliveries === "object") td += Object.keys(deliveries).length;
            else if(Array.isArray(deliveries)) td += deliveries.length;
          }
        }
      }
      else if(u.vehicles){
        tv += Object.keys(u.vehicles).length;
        for(const vid in u.vehicles){
          const deliveries = u.vehicles[vid].deliveries;
          if(deliveries && typeof deliveries === "object") td += Object.keys(deliveries).length;
          else if(Array.isArray(deliveries)) td += deliveries.length;
        }
      }
      if(u.vehicle?.last_trigger?.status === "alert") alerts++;
    }
    tc = companiesSet.size;
    document.getElementById("totalCompanies").innerText=tc;
    document.getElementById("totalVehicles").innerText=tv;
    document.getElementById("totalDeliveries").innerText=td;
    document.getElementById("alertsToday").innerText=alerts;
  });
}

// -------- Pending Approvals --------
function loadPendingApprovals(){
  const list=document.getElementById("pendingUsersList");
  list.innerHTML="";
  db.ref("users").once("value", snap=>{
    const users=snap.val()||{};
    let found = false;
    for(const uid in users){
      const u=users[uid];
      if((u.role==="company"||u.role==="customer"||u.role==="parent") && u.approved!==true){
        found = true;
        const name = u.companyName||u.email||uid;
        list.innerHTML += `<li class="list-group-item d-flex justify-content-between">
          ${name} (${u.role})
          <span>
            <button class="btn btn-success btn-sm me-1" onclick="approve('${uid}')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="reject('${uid}')">Reject</button>
          </span>
        </li>`;
      }
    }
    if(!found) list.innerHTML = '<li class="list-group-item text-muted">No pending approvals.</li>';
  });
}

function approve(uid){
  db.ref(`users/${uid}`).update({ approved: true })
    .then(() => {
      alert("✅ Approved");
      loadPendingApprovals();
      loadApprovedUsers();
    })
    .catch((err) => {
      alert("Error approving: " + err.message);
      console.error("Approve error:", err);
    });
}

function reject(uid){
  if(confirm("Delete user?")) {
    db.ref(`users/${uid}`).remove()
      .then(() => {
        alert("❌ Rejected and removed");
        loadPendingApprovals();
        loadApprovedUsers();
      })
      .catch((err) => {
        alert("Error rejecting: " + err.message);
        console.error("Reject error:", err);
      });
  }
}

// -------- Approved Users Table --------
function loadApprovedUsers(){
  const tbl=document.getElementById("approvedUsersTable");
  tbl.innerHTML="";
  db.ref("users").once("value",snap=>{
    const users=snap.val()||{};
    let rows = "";
    for(const uid in users){
      const u=users[uid];
      if(u.approved===true && (u.role==="company"||u.role==="customer")){
        let compsCount=0, vehCount=0, delCount=0;
        if(u.vehicle?.companies){
          compsCount=Object.keys(u.vehicle.companies).length;
          for(const cname in u.vehicle.companies){
            const vehs=u.vehicle.companies[cname].vehicle||{};
            vehCount+=Object.keys(vehs).length;
            for(const vid in vehs){
              const dels=vehs[vid].deliveries;
              if(typeof dels==="object") delCount+=Object.keys(dels).length;
              else if(Array.isArray(dels)) delCount+=dels.length;
            }
          }
        }
        else if(u.vehicles){
          vehCount = Object.keys(u.vehicles).length;
          for(const vid in u.vehicles){
            const dels=u.vehicles[vid].deliveries;
            if(typeof dels==="object") delCount+=Object.keys(dels).length;
            else if(Array.isArray(dels)) delCount+=dels.length;
          }
        }
        rows += `<tr>
          <td>${u.companyName||u.email||uid}</td>
          <td>${u.role}</td>
          <td>${compsCount}</td>
          <td>${vehCount}</td>
          <td>${delCount}</td>
        </tr>`;
      }
    }
    tbl.innerHTML=rows || `<tr><td colspan=5 class="text-muted">No approved users found.</td></tr>`;
  });
}

// -------- Dropdowns --------
function loadUserDropdowns(){
  db.ref("users").once("value",snap=>{
    const users=snap.val()||{};
    ["alarmUserSelect","historyUserSelect"].forEach(id=>{
      const sel=document.getElementById(id);
      sel.innerHTML='<option value="">Select User</option>';
      for(const uid in users){
        if(users[uid].role==="company"||users[uid].role==="customer"){
          sel.innerHTML+=`<option value="${uid}">${users[uid].companyName||users[uid].email||uid}</option>`;
        }
      }
    });
  });
}

// -------- Live Map --------
function setupLiveMap(){
  liveMap=L.map("map").setView([20,78],5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(liveMap);

  db.ref("users").on("value", snap=>{
    const users = snap.val()||{};
    liveMarkers = liveMarkers || {};
    for(const uid in users){
      const u=users[uid];
      if(u.vehicle?.companies){
        for(const cname in u.vehicle.companies){
          const vehs = u.vehicle.companies[cname].vehicle||{};
          for(const vid in vehs){
            const gps = vehs[vid].gps||"0,0";
            const [lat,lng]=gps.split(",").map(Number);
            if(!lat && !lng) continue;
            if(!liveMarkers[vid])
              liveMarkers[vid]=L.marker([lat,lng]).addTo(liveMap).bindPopup(`${vid} (${cname})`);
            else
              liveMarkers[vid].setLatLng([lat,lng]);
          }
        }
      }
    }
  });
}

// -------- Vehicle Tracker --------
function trackVehicle(e){
  const vid=e.target.value.trim();
  const res=document.getElementById("vehicleTrackerResult");
  if(!vid){ res.innerHTML=""; return; }
  db.ref("users").once("value",snap=>{
    let found=false;
    let foundLatLng = null;
    let companies = "";
    for(const uid in snap.val()||{}){
      const u=snap.val()[uid];
      if(u.vehicle?.companies){
        for(const cname in u.vehicle.companies){
          const vehs=u.vehicle.companies[cname].vehicle||{};
          if(vehs[vid]){
            const gps=vehs[vid].gps||"0,0";
            const [lat,lng]=gps.split(",").map(Number);
            foundLatLng = [lat,lng];
            companies = cname||"";
            found = true;
            res.innerHTML=
              `<div class="alert alert-info">🚚 ${vid} at ${gps}${vehs[vid].battery?", Battery: "+vehs[vid].battery+"%":""}</div>`;
          }
        }
      }
    }
    if(found && foundLatLng){
      liveMap.setView(foundLatLng,14);
      if(!liveMarkers[vid])
        liveMarkers[vid]=L.marker(foundLatLng).addTo(liveMap).bindPopup(`${vid} (${companies})`);
      else
        liveMarkers[vid].setLatLng(foundLatLng).openPopup();
    }
    if(!found) res.innerHTML=`<div class='alert alert-warning'>Vehicle not found</div>`;
  });
}

// -------- Manual Alarm Trigger --------
function triggerAlarmByUser(){
  const uid = document.getElementById("alarmUserSelect").value;
  const status = document.getElementById("alarmStatus");
  if(!uid){ status.innerHTML=`<div class='alert alert-warning'>Select user</div>`; return; }
  db.ref(`users/${uid}/vehicle/companies`).once("value",snap=>{
    const comps=snap.val()||{};
    let triggered = 0, errorCount = 0;
    let hasVehicle = false;
    const promises = [];
    for(const cname in comps){
      const vehs = comps[cname].vehicle||{};
      for(const vid in vehs){
        hasVehicle = true;
        const triggerRef = db.ref(`users/${uid}/vehicle/last_trigger`);
        promises.push(
          triggerRef.set({
            status: "alert",
            vehicleId: vid,
            time: new Date().toISOString(),
            location: vehs[vid].gps || "Unknown"
          })
          .then(() => { triggered++; })
          .catch(err => {
            errorCount++;
            status.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
            console.error("Alarm error:", err);
          })
        );
      }
    }
    if(!hasVehicle) {
      status.innerHTML = `<div class='alert alert-warning'>No vehicles found for user.</div>`;
      return;
    }
    Promise.all(promises).then(() => {
      if(errorCount === 0)
        status.innerHTML = `<div class='alert alert-danger'>🚨 Alarm triggered for all vehicles of this user.</div>`;
      else
        status.innerHTML = `<div class='alert alert-warning'>Some alarms failed: ${errorCount} errors.</div>`;
    });
  });
}

// -------- Movement History --------
function setupHistoryMap(){
  historyMap = L.map("historyMap").setView([20,78],5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(historyMap);
}
function clearHistoryMap(){
  if(!historyMap) return;
  historyMarkers.forEach(m=>historyMap.removeLayer(m));
  historyMarkers=[];
  historyMap.eachLayer(l=>{ if(l instanceof L.Polyline) historyMap.removeLayer(l); });
}
function loadHistoryByUser(){
  const uid=document.getElementById("historyUserSelect").value;
  const btn=document.getElementById("deleteHistoryBtn");
  clearHistoryMap();
  if(!uid){ alert("Select user"); btn.style.display="none"; return; }
  db.ref(`users/${uid}/vehicle/history`).once("value",snap=>{
    const history=snap.val()||{};
    let points=[];
    for(const hid in history){
      if(typeof history[hid] === "string" && history[hid].includes(",")) points.push(history[hid]);
      else if(history[hid].location) points.push(history[hid].location);
      else if(Array.isArray(history[hid])) points=points.concat(history[hid]);
    }
    if(points.length===0){ alert("No movement history for this user."); btn.style.display="none"; return; }
    const coords=points.map(p=>p.split(",").map(Number)).filter(c=>!isNaN(c[0])&&!isNaN(c[1]));
    if(coords.length===0){ alert("No valid coordinates."); btn.style.display="none"; return; }
    const poly=L.polyline(coords,{color:"blue"}).addTo(historyMap);
    coords.forEach(c=>historyMarkers.push(L.circleMarker(c,{radius:4,color:"red"}).addTo(historyMap)));
    historyMap.fitBounds(poly.getBounds());
    btn.style.display="inline-block";
    btn.onclick=()=>deleteHistoryByUser(uid);
  });
}
function deleteHistoryByUser(uid){
  if(!confirm("Delete all movement history for this user?")) return;
  db.ref(`users/${uid}/vehicle/history`).set(null)
    .then(() => {
      clearHistoryMap();
      document.getElementById("deleteHistoryBtn").style.display="none";
      alert("History deleted.");
    })
    .catch((err) => {
      alert("Error deleting: " + err.message);
      console.error("History delete error:", err);
    });
}

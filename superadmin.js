// Firebase init
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

auth.onAuthStateChanged(user => {
  if (!user) return location.href = "login.html";
  db.ref(`users/${user.uid}`).once("value", snap => {
    if (snap.val()?.role !== "super-admin") return location.href = "dashboard.html";
    initDashboard();
  });
});

function logout(){ auth.signOut().then(()=>location.href="login.html"); }

function initDashboard(){
  loadStats();
  loadPendingApprovals();
  loadApprovedUsers();
  loadUserDropdowns();
  setupLiveMap();
  setupHistoryMap();
  document.getElementById("trackVehicleId").addEventListener("input",trackVehicle);
}

// --- Defensive deep fetch: handle both company/Vehicle layouts or flat lists
function forEachUserVehicle(users, callback){
  for(const uid in users){
    const u = users[uid];
    const companies = u.vehicle?.companies;
    if(companies && typeof companies === "object"){
      for(const cname in companies){
        const vehSet = companies[cname].vehicle;
        if(vehSet && typeof vehSet==="object"){
          for(const vid in vehSet){
            callback({uid,u, cname, vid, v:vehSet[vid]});
          }
        }
      }
    } else if(u.vehicles && typeof u.vehicles==="object"){
      for(const vid in u.vehicles){
        callback({uid,u, cname:null, vid, v:u.vehicles[vid]});
      }
    }
  }
}

// -- Dashboard Stats
function loadStats(){
  db.ref("users").once("value", snap=>{
    const users = snap.val()||{};
    let tc=0,tv=0,td=0,alerts=0,companiesSet=new Set();
    forEachUserVehicle(users, ({u, cname, v}) => {
      if(cname) companiesSet.add(cname);
      tv++;
      if(Array.isArray(v.deliveries)){
        td+=v.deliveries.length;
      } else if(typeof v.deliveries==="object" && v.deliveries!==null){
        td+=Object.keys(v.deliveries).length;
      }
    });
    for(const uid in users){ if(users[uid].vehicle?.last_trigger?.status==="alert") alerts++; }
    tc=companiesSet.size;
    document.getElementById("totalCompanies").innerText=tc;
    document.getElementById("totalVehicles").innerText=tv;
    document.getElementById("totalDeliveries").innerText=td;
    document.getElementById("alertsToday").innerText=alerts;
  });
}

// Pending Approvals
function loadPendingApprovals(){
  const list=document.getElementById("pendingUsersList");
  list.innerHTML="";
  db.ref("users").once("value", snap=>{
    const users=snap.val()||{};
    let found = false;
    for(const uid in users){
      const u=users[uid];
      if((u.role==="company"||u.role==="customer") && u.approved!==true){
        found = true;
        const name=u.companyName||u.email||uid;
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
function approve(uid){ db.ref(`users/${uid}`).update({approved:true}); loadPendingApprovals(); loadApprovedUsers(); }
function reject(uid){ if(confirm("Delete user?")) db.ref(`users/${uid}`).remove().then(()=>{loadPendingApprovals();loadApprovedUsers();}); }

// -- Approved users (company/customer)
function loadApprovedUsers(){
  const tbl=document.getElementById("approvedUsersTable");
  tbl.innerHTML="";
  db.ref("users").once("value",snap=>{
    const users=snap.val()||{};
    let rows = "";
    for(const uid in users){
      const u=users[uid];
      if(u.approved===true && (u.role==="company"||u.role==="customer")){
        // Defensive company/vehicle count code
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
        // Flat vehicles fallback
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

// Populate dropdowns (user id select)
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

// ----------- LIVE MAP ------------
function setupLiveMap(){
  liveMap=L.map("map").setView([20,78],5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(liveMap);

  function updateMarkers(users){
    liveMarkers = liveMarkers || {};
    forEachUserVehicle(users, ({vid,cname,v}) => {
      const gps = v.gps||"0,0";
      const [lat,lng] = gps.split(",").map(Number);
      if(!lat && !lng) return;
      if(!liveMarkers[vid]){
        liveMarkers[vid]=L.marker([lat,lng]).addTo(liveMap).bindPopup(`${vid}${cname?" ("+cname+")":""}`);
      }else{
        liveMarkers[vid].setLatLng([lat,lng]);
      }
    });
  }

  db.ref("users").on("value", snap=>{
    const users=snap.val()||{};
    updateMarkers(users);
  });
}

// ----------- VEHICLE TRACKING (center+show marker) -----------
function trackVehicle(e){
  const vid=e.target.value.trim();
  const res=document.getElementById("vehicleTrackerResult");
  if(!vid){ res.innerHTML=""; return; }
  db.ref("users").once("value",snap=>{
    let found=false;
    let foundLatLng = null;
    let companies = "";
    forEachUserVehicle(snap.val()||{}, ({vid:currVid,cname,v})=>{
      if(currVid===vid){
        const gps = v.gps||"0,0";
        const [lat,lng]=gps.split(",").map(Number);
        foundLatLng = [lat,lng];
        companies = cname||"";
        found = true;
        res.innerHTML=
          `<div class="alert alert-info">🚚 ${vid} at ${gps}${v.battery?", Battery: "+v.battery+"%":""}</div>`;
      }
    });
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

// --- ALARM TRIGGER by USER ID (all vehicles)
function triggerAlarmByUser(){
  const uid = document.getElementById("alarmUserSelect").value;
  const status = document.getElementById("alarmStatus");
  if(!uid){ status.innerHTML=`<div class='alert alert-warning'>Select user</div>`; return; }
  db.ref(`users/${uid}/vehicle/companies`).once("value",snap=>{
    const comps=snap.val()||{};
    let triggered = 0;
    for(const cname in comps){
      const vehs=comps[cname].vehicle||{};
      for(const vid in vehs){
        db.ref(`users/${uid}/vehicle/last_trigger`).set({
          status:"alert", vehicleId:vid,
          time:new Date().toISOString(), location:vehs[vid].gps||"Unknown"
        });
        triggered++;
      }
    }
    status.innerHTML = triggered>0 ?
      `<div class='alert alert-danger'>🚨 Alarm triggered for all vehicles of this user.</div>`
      : `<div class='alert alert-warning'>No vehicles found for user.</div>`;
  });
}

// --------------- MOVEMENT HISTORY (user, all vehicles) ---------------
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
  db.ref(`users/${uid}/vehicle/companies`).once("value",snap=>{
    const comps = snap.val()||{};
    let points=[];
    for(const cname in comps){
      const vehs=comps[cname].vehicle||{};
      for(const vid in vehs){
        const dels=vehs[vid].deliveries||{};
        for(const did in dels){
          if(Array.isArray(dels[did].route)) points=points.concat(dels[did].route);
          else if(dels[did].location) points.push(dels[did].location);
        }
      }
    }
    if(points.length===0){ alert("No history"); btn.style.display="none"; return; }
    const coords=points.map(p=>p.split(",").map(Number)).filter(c=>!isNaN(c[0])&&!isNaN(c[1]));
    if(coords.length===0){ alert("No valid coords"); btn.style.display="none"; return; }
    const poly=L.polyline(coords,{color:"blue"}).addTo(historyMap);
    coords.forEach(c=>historyMarkers.push(L.circleMarker(c,{radius:4,color:"red"}).addTo(historyMap)));
    historyMap.fitBounds(poly.getBounds());
    btn.style.display="inline-block";
    btn.onclick=()=>deleteHistoryByUser(uid);
  });
}
function deleteHistoryByUser(uid){
  if(!confirm("Delete all movement history for this user?")) return;
  db.ref(`users/${uid}/vehicle/companies`).once("value",snap=>{
    const comps=snap.val()||{};
    for(const cname in comps){
      const vehs=comps[cname].vehicle||{};
      for(const vid in vehs){
        db.ref(`users/${uid}/vehicle/companies/${cname}/vehicle/${vid}/deliveries`).remove();
      }
    }
    clearHistoryMap();
    document.getElementById("deleteHistoryBtn").style.display="none";
    alert("History deleted.");
  });
}

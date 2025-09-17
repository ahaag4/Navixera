// stop.js
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

function qs(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function parseGps(gps) {
  if (!gps) return null;
  const parts = String(gps).split(',').map(s=>s.trim());
  if (parts.length<2) return null;
  const lat = Number(parts[0]), lng = Number(parts[1]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return [lat, lng];
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function minutesFromDistanceKm(km, speedKmh=25) {
  if (!isFinite(km) || km<0) return Infinity;
  return Math.max(1, Math.round((km / speedKmh) * 60));
}

async function showStop(stopId) {
  const stopSnap = await db.ref(`public_transport/stops/${stopId}`).once('value');
  const stop = stopSnap.val();
  const stopNameEl = document.getElementById('stopName');
  const stopGpsEl = document.getElementById('stopGps');
  const vehiclesListEl = document.getElementById('stopVehiclesList');
  const arrivalsArea = document.getElementById('arrivalsArea');

  if (!stop) {
    stopNameEl.textContent = 'Stop not found';
    stopGpsEl.textContent = '';
    arrivalsArea.innerHTML = '<div class="text-muted">No data for this stop.</div>';
    return;
  }

  stopNameEl.textContent = `${stop.name} (${stopId})`;
  stopGpsEl.textContent = stop.gps || '';
  // show vehicles at stop (as configured by admin)
  vehiclesListEl.innerHTML = '';
  const vehicles = stop.vehicles || [];
  if (vehicles.length === 0) {
    vehiclesListEl.innerHTML = '<div class="text-muted">No vehicles configured for this stop.</div>';
  } else {
    const ul = document.createElement('ul');
    ul.className = 'list-group';
    vehicles.forEach(v=>{
      const li = document.createElement('li');
      li.className = 'list-group-item';
      li.textContent = `${v.vehicleId} — ${v.routeName || ''} ${v.timings ? `(${v.timings})` : ''}`;
      ul.appendChild(li);
    });
    vehiclesListEl.appendChild(ul);
  }

  // Now compute ETA for each vehicle by reading its current gps
  arrivalsArea.innerHTML = '<div class="text-muted">Calculating arrivals...</div>';

  // read vehicles snapshot
  const allVehiclesSnap = await db.ref('public_transport/vehicles').once('value');
  const allVehicles = allVehiclesSnap.val() || {};

  const stopCoords = parseGps(stop.gps);
  if (!stopCoords) {
    arrivalsArea.innerHTML = '<div class="text-danger">Stop has no valid coordinates.</div>';
    return;
  }

  const arrivalRows = [];
  // If stop.vehicles has vehicleId entries, prefer them; otherwise check all vehicles whose stops list includes matching names
  for (const vdef of vehicles) {
    const vid = vdef.vehicleId;
    const veh = allVehicles[vid];
    if (veh) {
      const coords = parseGps(veh.gps);
      if (!coords) continue;
      const km = distanceKm(coords[0], coords[1], stopCoords[0], stopCoords[1]);
      const minutes = minutesFromDistanceKm(km, 25); // assume 25 km/h average
      arrivalRows.push({ vid, route: veh.routeName || vdef.routeName || '', etaMin: minutes, km: km.toFixed(3) });
    } else {
      // vehicle not found currently -- still include as unknown
      arrivalRows.push({ vid, route: vdef.routeName || '', etaMin: null, km: null });
    }
  }

  // For additional helpfulness: also check any vehicles that have this stop name in their stops array (best-effort)
  Object.entries(allVehicles).forEach(([vid, veh])=>{
    if (!veh.stops || veh.stops.length===0) return;
    const found = veh.stops.some(s => {
      if (!s || !s.name) return false;
      return s.name.trim().toLowerCase() === (stop.name || '').trim().toLowerCase();
    });
    if (found && !arrivalRows.some(r => r.vid === vid)) {
      const coords = parseGps(veh.gps);
      if (!coords) return;
      const km = distanceKm(coords[0], coords[1], stopCoords[0], stopCoords[1]);
      const minutes = minutesFromDistanceKm(km, 25);
      arrivalRows.push({ vid, route: veh.routeName || '', etaMin: minutes, km: km.toFixed(3) });
    }
  });

  // sort by ETA ascending (nulls to end)
  arrivalRows.sort((a,b) => {
    if (a.etaMin == null) return 1;
    if (b.etaMin == null) return -1;
    return a.etaMin - b.etaMin;
  });

  if (arrivalRows.length === 0) {
    arrivalsArea.innerHTML = '<div class="text-muted">No vehicles found for this stop right now.</div>';
    return;
  }

  arrivalsArea.innerHTML = '';
  arrivalRows.forEach(r => {
    const div = document.createElement('div');
    div.className = 'd-flex justify-content-between align-items-center mb-2 p-2 bg-white rounded';
    const left = document.createElement('div');
    left.innerHTML = `<strong>${r.vid}</strong><br><small class="text-muted">${r.route || ''}</small>`;
    const right = document.createElement('div');
    if (r.etaMin == null) right.innerHTML = `<span class="badge bg-secondary">No data</span>`;
    else right.innerHTML = `<span class="eta-badge">${r.etaMin} min</span><br><small class="text-muted">${r.km} km</small>`;
    div.appendChild(left); div.appendChild(right);
    arrivalsArea.appendChild(div);
  });

  // for live updates, listen to vehicles path and refresh ETA on changes
  db.ref('public_transport/vehicles').on('value', snap=>{
    const all = snap.val() || {};
    // recompute for the same vehicles
    const refreshed = arrivalRows.map(rr=>{
      const veh = all[rr.vid];
      if (!veh || !veh.gps) return Object.assign({}, rr, { etaMin: null, km: null });
      const coords = parseGps(veh.gps);
      if (!coords) return Object.assign({}, rr, { etaMin: null, km: null });
      const km = distanceKm(coords[0], coords[1], stopCoords[0], stopCoords[1]);
      const minutes = minutesFromDistanceKm(km, 25);
      return Object.assign({}, rr, { etaMin: minutes, km: km.toFixed(3) });
    });
    // update DOM similarly
    refreshed.sort((a,b) => {
      if (a.etaMin == null) return 1;
      if (b.etaMin == null) return -1;
      return a.etaMin - b.etaMin;
    });
    arrivalsArea.innerHTML = '';
    refreshed.forEach(r => {
      const div = document.createElement('div');
      div.className = 'd-flex justify-content-between align-items-center mb-2 p-2 bg-white rounded';
      const left = document.createElement('div');
      left.innerHTML = `<strong>${r.vid}</strong><br><small class="text-muted">${r.route || ''}</small>`;
      const right = document.createElement('div');
      if (r.etaMin == null) right.innerHTML = `<span class="badge bg-secondary">No data</span>`;
      else right.innerHTML = `<span class="eta-badge">${r.etaMin} min</span><br><small class="text-muted">${r.km} km</small>`;
      div.appendChild(left); div.appendChild(right);
      arrivalsArea.appendChild(div);
    });
  });
}

document.addEventListener('DOMContentLoaded', ()=> {
  const id = qs('id');
  if (!id) {
    document.getElementById('stopName').textContent = 'Missing stop id';
    return;
  }
  showStop(id).catch(err => {
    console.error(err);
    document.getElementById('stopName').textContent = 'Error loading stop';
  });
});

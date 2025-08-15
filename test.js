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
const auth = firebase.auth();
const db = firebase.database();
const stripe = Stripe('pk_test_51J3fG2I8k3z9e4rX0q0s6xX8'); // Replace with your Stripe publishable key

const userEmailEl = document.getElementById('userEmail');
const planPill = document.getElementById('planPill');
const planPillHeader = document.getElementById('planPillHeader');
const adArea = document.getElementById('adArea');
const locationEl = document.getElementById("location");
const lastActiveEl = document.getElementById("lastActive");
const statusEl = document.getElementById("status");
const batteryHealthEl = document.getElementById("batteryHealth");
const historyTbody = document.getElementById("history");
const exportCSVBtn = document.getElementById("exportCSVBtn");
const alarmToggle = document.getElementById("alarmToggle");
const alarmStatusText = document.getElementById("alarmStatusText");
const alarmTriggerEl = document.getElementById("alarmTrigger");
const onlineStatusEl = document.getElementById("onlineStatus");
const lastSeenEl = document.getElementById("lastSeen");
const componentsListEl = document.getElementById("componentsList");
const currentPlanEl = document.getElementById('currentPlan');
const planExpiryEl = document.getElementById('planExpiry');
const vehicleLimitEl = document.getElementById('vehicleLimit');
const upgradeBtns = document.getElementById('upgradeBtns');
const upgradeToSilverBtn = document.getElementById('upgradeToSilver');
const upgradeToGoldBtn = document.getElementById('upgradeToGold');
const buyExportBtn = document.getElementById('buyExportBtn');
const buyAnalyticsBtn = document.getElementById('buyAnalyticsBtn');
const buyFleetBtn = document.getElementById('buyFleetBtn');
const requestStatusArea = document.getElementById('requestStatusArea');
const adminPanel = document.getElementById('adminPanel');
const adminList = document.getElementById('adminList');
const adminLogs = document.getElementById('adminLogs');
const adminPanelPayments = document.getElementById('adminPanelPayments');
const paymentList = document.getElementById('paymentList');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const modalPayUPI = document.getElementById('modalPayUPI');
const modalPayStripe = document.getElementById('modalPayStripe');
const dateFilterSection = document.getElementById('dateFilterSection');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const applyFilterBtn = document.getElementById('applyFilterBtn');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const mapTypeBlock = document.getElementById('mapTypeBlock');
const mapTypeSelect = document.getElementById('mapType');
const heatToggleBlock = document.getElementById('heatToggleBlock');
const heatToggle = document.getElementById('heatToggle');
const customIconBlock = document.getElementById('customIconBlock');
const iconUploader = document.getElementById('iconUploader');
const geofenceControls = document.getElementById('geofenceControls');
const gfEnableDrawBtn = document.getElementById('gfEnableDraw');
const gfSaveBtn = document.getElementById('gfSave');
const gfClearBtn = document.getElementById('gfClear');
const gfHint = document.getElementById('gfHint');
const kpiDistanceEl = document.getElementById('kpiDistance');
const kpiStopsEl = document.getElementById('kpiStops');
const kpiRefreshEl = document.getElementById('kpiRefresh');
const analyticsSection = document.getElementById('analyticsSection');
const analyticsMessage = document.getElementById('analyticsMessage');
const analyticsChart = document.getElementById('analyticsChart');
const fleetSection = document.getElementById('fleetSection');
const fleetMessage = document.getElementById('fleetMessage');
const addVehicleBtn = document.getElementById('addVehicleBtn');
const fleetList = document.getElementById('fleetList');
const currencyLoading = document.getElementById('currencyLoading');
const silverPriceEl = document.getElementById('silverPrice');
const goldPriceEl = document.getElementById('goldPrice');
const exportPriceEl = document.getElementById('exportPrice');
const analyticsPriceEl = document.getElementById('analyticsPrice');
const fleetPriceEl = document.getElementById('fleetPrice');

let uidGlobal = null;
let isAdmin = false;
let currentFeature = null;
let currentAmount = null;
let localPlan = { plan:'basic', plan_expiry:null, vehicle_limit:1, exportCSV:false, analytics:false, fleet:false };
let userCurrency = 'USD';
let currencySymbol = '$';
let exchangeRates = {};
let lastExchangeRateFetch = null;

const PLAN_POLICIES = {
  basic:  { historyDays:1, ads:'banner+interstitial', vehicle_limit:1, exportCSV:false, refreshMs:30000, heatmap:false, mapSwitch:false, notify:false, geofences:0, analytics:false, fleet:false },
  silver: { historyDays:7, ads:'banner-limited', vehicle_limit:3, exportCSV:true, refreshMs:20000, heatmap:false, mapSwitch:true, notify:true, geofences:1, analytics:false, fleet:false },
  gold:   { historyDays:90, ads:'no-ads', vehicle_limit:3, exportCSV:true, refreshMs:10000, heatmap:true, mapSwitch:true, notify:true, geofences:999, analytics:true, fleet:true }
};

const BASE_PRICES = {
  silver: 149,
  gold: 249,
  export: 2,
  analytics: 5,
  fleet: 30
};

const CURRENCY_MAP = {
  'US': { currency: 'USD', symbol: '$' },
  'IN': { currency: 'INR', symbol: '₹' },
  'GB': { currency: 'GBP', symbol: '£' },
  'EU': { currency: 'EUR', symbol: '€' },
  'AU': { currency: 'AUD', symbol: 'A$' },
  // Add more country-to-currency mappings as needed
  'default': { currency: 'USD', symbol: '$' }
};

// Function to detect user's country
async function detectUserCountry() {
  try {
    currencyLoading.style.display = 'block';
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    return data.country_code || 'default';
  } catch (error) {
    console.error('Failed to detect country:', error);
    return 'default';
  } finally {
    currencyLoading.style.display = 'none';
  }
}

// Function to fetch exchange rates
async function fetchExchangeRates() {
  const now = Date.now();
  if (lastExchangeRateFetch && (now - lastExchangeRateFetch < 24 * 60 * 60 * 1000)) {
    return exchangeRates; // Use cached rates if less than 24 hours old
  }
  try {
    const apiKey = 'YOUR_EXCHANGERATE_API_KEY'; // Replace with your API key
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
    const data = await response.json();
    if (data.result === 'success') {
      exchangeRates = data.conversion_rates;
      lastExchangeRateFetch = now;
      return exchangeRates;
    } else {
      console.error('Exchange rate API error:', data);
      return {};
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);
    return {};
  }
}

// Function to convert price to user's currency
function convertPrice(amount, currency) {
  if (currency === 'USD' || !exchangeRates[currency]) return amount;
  return (amount * exchangeRates[currency]).toFixed(2);
}

// Function to update UI with converted prices
function updatePricesUI() {
  silverPriceEl.textContent = `${currencySymbol}${convertPrice(BASE_PRICES.silver, userCurrency)}`;
  goldPriceEl.textContent = `${currencySymbol}${convertPrice(BASE_PRICES.gold, userCurrency)}`;
  exportPriceEl.textContent = `${currencySymbol}${convertPrice(BASE_PRICES.export, userCurrency)}`;
  analyticsPriceEl.textContent = `${currencySymbol}${convertPrice(BASE_PRICES.analytics, userCurrency)}`;
  fleetPriceEl.textContent = `${currencySymbol}${convertPrice(BASE_PRICES.fleet, userCurrency)}`;
}

async function initializeCurrency() {
  const country = await detectUserCountry();
  const currencyInfo = CURRENCY_MAP[country] || CURRENCY_MAP['default'];
  userCurrency = currencyInfo.currency;
  currencySymbol = currencyInfo.symbol;
  await fetchExchangeRates();
  updatePricesUI();
}

function showAd(ad) {
  adArea.innerHTML = 'Loading...';
  if (ad.type === 'banner') {
    const img = new Image(); img.src = ad.url;
    img.onload = () => { adArea.innerHTML = ''; adArea.appendChild(img); };
  } else if (ad.type === 'video') {
    const v = document.createElement('video'); v.src = ad.url; v.controls = true; v.autoplay = true; v.muted = true;
    adArea.innerHTML = ''; adArea.appendChild(v);
  }
}

function loadAdsForPlan(plan) {
  if (adTimerInt) clearInterval(adTimerInt);
  const policy = PLAN_POLICIES[plan] || PLAN_POLICIES.basic;
  if (policy.ads === 'no-ads') { adArea.style.display='none'; adArea.innerHTML=''; return; }
  adArea.style.display = 'flex';
  db.ref('admin/ads').once('value').then(snapshot => {
    const adsObj = snapshot.val() || {};
    adsList = Object.values(adsObj).filter(ad =>
      ad && ad.active && ad.url &&
      (ad.placement === 'dashboard_top' || ad.placement === 'dashboard_footer')
    );
    if (policy.ads==='banner-limited' && adsList.length > 1) { adsList = adsList.slice(0,1); }
    if (adsList.length) {
      showAd(adsList[currentAdIndex=0]);
      adTimerInt = setInterval(() => {
        currentAdIndex = (currentAdIndex + 1) % adsList.length;
        showAd(adsList[currentAdIndex]);
      }, 15000);
    } else {
      adArea.innerHTML = 'No active ad';
    }
  }).catch(()=> { adArea.innerHTML = 'Ad load error'; });
}

function renderAdsForPlan(plan) { loadAdsForPlan(plan); }

function prettyTS(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

function isPurchaseValid(purchase) {
  if (!purchase || !purchase.expiry) return false;
  return Date.now() < Date.parse(purchase.expiry);
}

function renderRequestUI(upgradeRequest, currentPlan) {
  upgradeToSilverBtn.style.display = 'none';
  upgradeToGoldBtn.style.display = 'none';
  let statusMsg = '';
  if (currentPlan === 'gold') {
    upgradeBtns.style.display = 'none';
    statusMsg = `<span class="approved-pill">You are on GOLD, the highest plan.</span>`;
  } else if (!upgradeRequest || !upgradeRequest.status) {
    upgradeBtns.style.display = 'block';
    upgradeToSilverBtn.style.display = 'inline-block';
    upgradeToGoldBtn.style.display = 'inline-block';
    statusMsg = '';
  } else if (upgradeRequest.status === 'pending') {
    upgradeBtns.style.display = 'none';
    statusMsg = `<span class="pending-pill">Upgrade to ${upgradeRequest.requestedPlan?.toUpperCase() || ''} — PENDING APPROVAL</span>`;
  } else if (upgradeRequest.status === 'approved') {
    upgradeBtns.style.display = 'none';
    statusMsg = `<span class="approved-pill">Upgrade approved — Enjoy your ${upgradeRequest.requestedPlan?.toUpperCase() || ''} plan</span>`;
  } else if (upgradeRequest.status === 'rejected') {
    upgradeBtns.style.display = 'block';
    upgradeToSilverBtn.style.display = 'inline-block';
    upgradeToGoldBtn.style.display = 'inline-block';
    statusMsg = `<span class="rejected-pill">Upgrade request rejected — you may try again</span>`;
  } else if (upgradeRequest.status === 'cancelled') {
    upgradeBtns.style.display = 'block';
    upgradeToSilverBtn.style.display = 'inline-block';
    upgradeToGoldBtn.style.display = 'inline-block';
    statusMsg = `<span class="small-muted">Upgrade request cancelled</span>`;
  }
  requestStatusArea.innerHTML = statusMsg;
}

function applyPlanToUI(udata) {
  const plan = udata.plan || 'basic';
  const plan_expiry = udata.plan_expiry || null;
  const vehicle_limit = (udata.vehicle_limit || PLAN_POLICIES[plan].vehicle_limit);
  const exportCSV = (typeof udata.exportCSV === 'boolean') ? udata.exportCSV : !!PLAN_POLICIES[plan].exportCSV;
  const analytics = PLAN_POLICIES[plan].analytics || (udata.purchases?.analytics && isPurchaseValid(udata.purchases.analytics));
  const fleet = PLAN_POLICIES[plan].fleet || (udata.purchases?.fleet && isPurchaseValid(udata.purchases.fleet));
  localPlan = { plan, plan_expiry, vehicle_limit, exportCSV, analytics, fleet };

  planPill.textContent = plan.toUpperCase();
  currentPlanEl.textContent = plan.toUpperCase();
  planPillHeader.textContent = plan.toUpperCase();
  planExpiryEl.textContent = prettyTS(plan_expiry);
  vehicleLimitEl.textContent = vehicle_limit;
  exportCSVBtn.style.display = exportCSV || (udata.purchases?.export && isPurchaseValid(udata.purchases.export)) ? 'inline-block' : 'none';
  buyExportBtn.style.display = (!exportCSV && !(udata.purchases?.export && isPurchaseValid(udata.purchases.export))) ? 'inline-block' : 'none';
  renderAdsForPlan(plan);

  const policy = PLAN_POLICIES[plan] || PLAN_POLICIES.basic;
  dateFilterSection.style.display = ['silver', 'gold'].includes(plan) ? 'flex' : 'none';
  mapTypeBlock.style.display = policy.mapSwitch ? 'flex' : 'none';
  heatToggleBlock.style.display = (plan === 'gold') ? 'flex' : 'none';
  customIconBlock.style.display = plan !== 'basic' ? 'flex' : 'none';
  geofenceControls.style.display = policy.geofences > 0 ? 'flex' : 'none';
  gfHint.textContent = plan === 'silver' ? 'Max 1 zone' : (plan === 'gold' ? 'Multiple zones allowed' : '');

  analyticsSection.style.display = analytics ? 'block' : 'none';
  buyAnalyticsBtn.style.display = (!analytics && plan !== 'gold') ? 'inline-block' : 'none';
  analyticsMessage.textContent = analytics ? 'Speed trend analytics' : 'Analytics unavailable';
  if (analytics && fullHistory) renderAnalyticsChart(fullHistory);

  fleetSection.style.display = fleet ? 'block' : 'none';
  addVehicleBtn.style.display = fleet ? 'inline-block' : 'none';
  buyFleetBtn.style.display = (!fleet && plan !== 'gold') ? 'inline-block' : 'none';
  fleetMessage.textContent = fleet ? 'Manage your vehicles' : 'Fleet management unavailable';

  kpiRefreshEl.textContent = (policy.refreshMs / 1000) + 's';
  setRefreshIntervals(policy.refreshMs);

  if (policy.notify && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }

  renderRequestUI(udata.upgrade_request || null, plan);
  if (isAdmin) renderPendingPayments();
  updatePricesUI(); // Update prices after plan is applied
}

function createUpgradeRequest(uid, desiredPlan) {
  const now = new Date().toISOString();
  const req = { status: 'pending', requestedPlan: desiredPlan, request_time: now };
  const updates = {};
  updates[`users/${uid}/upgrade_request`] = req;
  const adminKey = `req_${uid}_${Date.now()}`;
  updates[`admin/upgrade_requests/${adminKey}`] = { uid, requestedPlan: desiredPlan, status: 'pending', request_time: now };
  return db.ref().update(updates);
}

async function adminApproveRequest(adminUid, adminName, adminReqKey, adminReqObj) {
  const targetUid = adminReqObj.uid;
  const plan = adminReqObj.requestedPlan || 'silver';
  const now = new Date();
  const expiry = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
  const updates = {};
  updates[`users/${targetUid}/plan`] = plan;
  updates[`users/${targetUid}/plan_expiry`] = expiry.toISOString();
  updates[`users/${targetUid}/vehicle_limit`] = PLAN_POLICIES[plan].vehicle_limit;
  updates[`users/${targetUid}/exportCSV`] = true;
  updates[`users/${targetUid}/upgrade_request/status`] = 'approved';
  updates[`admin/upgrade_requests/${adminReqKey}/status`] = 'approved';
  updates[`admin/approvals/${adminReqKey}`] = { adminUid, adminName, uid: targetUid, plan, approvedAt: new Date().toISOString(), adminNameDisplay: adminName || adminUid };
  await db.ref().update(updates);
  alert('User upgraded to ' + plan.toUpperCase());
}

async function adminRejectRequest(adminUid, adminName, adminReqKey, adminReqObj) {
  const targetUid = adminReqObj.uid;
  const updates = {};
  updates[`users/${targetUid}/upgrade_request/status`] = 'rejected';
  updates[`admin/upgrade_requests/${adminReqKey}/status`] = 'rejected';
  updates[`admin/approvals/${adminReqKey}`] = { adminUid, adminName, uid: targetUid, status: 'rejected', processedAt: new Date().toISOString() };
  await db.ref().update(updates);
  alert('Request rejected.');
}

async function adminApprovePayment(paymentId, paymentObj) {
  const updates = {};
  updates[`users/${paymentObj.uid}/purchases_pending/${paymentId}/status`] = 'approved';
  updates[`admin/payments/${paymentId}/status`] = 'approved';
  updates[`users/${paymentObj.uid}/purchases/${paymentObj.feature}`] = {
    feature: paymentObj.feature,
    amount: paymentObj.amount,
    expiry: paymentObj.expiry,
    purchase_time: paymentObj.created
  };
  await db.ref().update(updates);
  alert(`Payment for ${paymentObj.feature} approved`);
  renderPendingPayments();
}

async function adminRejectPayment(paymentId, paymentObj) {
  const updates = {};
  updates[`users/${paymentObj.uid}/purchases_pending/${paymentId}/status`] = 'rejected';
  updates[`admin/payments/${paymentId}/status`] = 'rejected';
  await db.ref().update(updates);
  alert(`Payment for ${paymentObj.feature} rejected`);
  renderPendingPayments();
}

function checkAndAutoDowngrade(uid, udata) {
  if (!udata || !udata.plan || !udata.plan_expiry) return;
  const expiryMs = Date.parse(udata.plan_expiry);
  if (isNaN(expiryMs)) return;
  if (Date.now() >= expiryMs && udata.plan !== 'basic') {
    const updates = {
      [`users/${uid}/plan`]: 'basic',
      [`users/${uid}/plan_expiry`]: null,
      [`users/${uid}/vehicle_limit`]: PLAN_POLICIES.basic.vehicle_limit,
      [`users/${uid}/exportCSV`]: false,
      [`users/${uid}/upgrade_request/status`]: 'cancelled'
    };
    db.ref().update(updates).then(() => {
      const k = `downgrade_${uid}_${Date.now()}`;
      db.ref(`admin/downgrades/${k}`).set({ uid, old_plan: udata.plan, new_plan: 'basic', time: new Date().toISOString(), reason: 'expired_auto_downgrade' });
    });
  }
}

let map, liveMarker, baseLayer, baseLayers = {};
let routeLayer = null, startMarker = null, endMarker = null, heatLayer = null;
let customMarkerIcon = null;

function createBaseLayers() {
  baseLayers.street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20 });
  baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20 });
  baseLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 });
}

function updateBaseLayer(type) {
  if (!map) return;
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = baseLayers[type] || baseLayers.street;
  baseLayer.addTo(map);
}

function updateMap(lat, lng, popupText=null) {
  if (!(typeof lat==='number' && typeof lng==='number' && !isNaN(lat) && !isNaN(lng))) return;
  if (!map) {
    map = L.map('map').setView([lat, lng], 14);
    createBaseLayers();
    updateBaseLayer('street');
    liveMarker = L.marker([lat, lng], customMarkerIcon ? {icon: customMarkerIcon} : undefined).addTo(map);
    setupDrawTools();
  } else {
    if (!liveMarker) liveMarker = L.marker([lat, lng], customMarkerIcon ? {icon: customMarkerIcon} : undefined).addTo(map);
    liveMarker.setLatLng([lat, lng]);
  }
  if (popupText) liveMarker.bindPopup(popupText).openPopup();
}

window.focusOnMap = function(lat, lng) {
  lat = parseFloat(lat); lng = parseFloat(lng);
  if (!isNaN(lat) && !isNaN(lng)) {
    updateMap(lat, lng, `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    map.setView([lat, lng], 15);
  }
};

let fullHistory = null;
let filteredHistory = null;

function parseEntry(entry) {
  const loc = entry.location || '';
  const [lat, lng] = (loc.split(',') || []).map(s=>parseFloat(s.trim()));
  const tms = Date.parse(entry.time || '');
  return { lat, lng, time: entry.time || '', ts: isNaN(tms) ? null : tms, speed: typeof entry.speed==='number'?entry.speed:null };
}

function renderHistoryTable(list) {
  historyTbody.innerHTML = '';
  if (!list || !list.length) {
    historyTbody.innerHTML = '<tr><td colspan="3">No history found.</td></tr>';
    return;
  }
  list.forEach(entry => {
    const canFocus = !(isNaN(entry.lat) || isNaN(entry.lng));
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${entry.time || ''}</td><td>${(isFinite(entry.lat)&&isFinite(entry.lng))? (entry.lat+','+entry.lng) : ''}</td>
      <td><button class="view-btn"${canFocus?` onclick="focusOnMap(${entry.lat},${entry.lng})"`:' disabled style="opacity:.65;"'}>View</button></td>`;
    historyTbody.appendChild(tr);
  });
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => d*Math.PI/180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

function computeKPIs(list) {
  if (!list || list.length < 2) { kpiDistanceEl.textContent = '0.00 km'; kpiStopsEl.textContent='0'; return; }
  let dist = 0;
  for (let i=1;i<list.length;i++) {
    const p = list[i-1], q = list[i];
    if (isFinite(p.lat)&&isFinite(p.lng)&&isFinite(q.lat)&&isFinite(q.lng)) {
      dist += haversineKm(p,q);
    }
  }
  let stops = 0;
  const SPEED_KMH_THRESHOLD = 2;
  const STOP_MS = 5*60*1000;
  let blockStart = null, lastPoint = null;
  for (let i=0;i<list.length;i++) {
    const p = list[i];
    const slowOrStatic = (p.speed !== null && p.speed <= SPEED_KMH_THRESHOLD) ||
                         (lastPoint && p.ts && lastPoint.ts && haversineKm(p,lastPoint) < 0.015);
    if (slowOrStatic) {
      if (!blockStart) blockStart = p;
    } else {
      if (blockStart && p.ts && blockStart.ts && (p.ts - blockStart.ts >= STOP_MS)) stops++;
      blockStart = null;
    }
    lastPoint = p;
  }
  if (blockStart && lastPoint && lastPoint.ts && blockStart.ts && (lastPoint.ts - blockStart.ts >= STOP_MS)) stops++;
  kpiDistanceEl.textContent = dist.toFixed(2) + ' km';
  kpiStopsEl.textContent = String(stops);
}

function clearRouteLayers() {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
  if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
}

function plotRoute(list) {
  if (!map || !list || !list.length) return;
  clearRouteLayers();
  const coords = list.filter(p => isFinite(p.lat) && isFinite(p.lng)).map(p => [p.lat, p.lng]);
  if (!coords.length) return;
  routeLayer = L.polyline(coords, { weight: 4 }).addTo(map);
  const startIcon = L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png', iconSize: [25, 41], iconAnchor: [12, 41] });
  const endIcon = L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png', iconSize: [25, 41], iconAnchor: [12, 41] });
  startMarker = L.marker(coords[0], { icon: startIcon }).addTo(map).bindPopup('Start');
  endMarker = L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(map).bindPopup('End');
  map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
}

function updateHeatmap(list) {
  if (!map) return;
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
  if (!list || !list.length || !heatToggle.checked) return;
  const heatData = list.filter(p => isFinite(p.lat) && isFinite(p.lng)).map(p => [p.lat, p.lng, 0.5]);
  if (heatData.length) heatLayer = L.heatLayer(heatData, { radius: 25 }).addTo(map);
}

function applyDateFilter(list) {
  const plan = localPlan.plan;
  const policy = PLAN_POLICIES[plan] || PLAN_POLICIES.basic;
  const cutoffMs = Date.now() - policy.historyDays * 86400000;
  const hasDate = startDateInput.value || endDateInput.value;
  let s = startDateInput.value ? Date.parse(startDateInput.value + 'T00:00:00') : null;
  let e = endDateInput.value ? Date.parse(endDateInput.value + 'T23:59:59') : null;
  return (list || []).filter(p => {
    if (!p.ts) return false;
    if (p.ts < cutoffMs) return false;
    if (!hasDate) return true;
    if (s && p.ts < s) return false;
    if (e && p.ts > e) return false;
    return true;
  });
}

function buyFeatureWithUPI(feature, amount) {
  if (!uidGlobal) return alert('Not logged in');
  try {
    const convertedAmount = convertPrice(amount, userCurrency);
    const upiLink = `upi://pay?pa=hydrahunter93@postbank&pn=Asitech&am=${convertedAmount}&cu=${userCurrency}`;
    window.open(upiLink);
    const paymentId = `upi_${uidGlobal}_${Date.now()}`;
    const expiry = new Date(Date.now() + (feature === 'export' ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000)).toISOString();
    const paymentData = { feature, amount: convertedAmount, currency: userCurrency, status: 'pending', created: new Date().toISOString(), expiry, payment_method: 'upi' };
    db.ref(`users/${uidGlobal}/purchases_pending/${paymentId}`).set(paymentData);
    db.ref(`admin/payments/${paymentId}`).set({ uid: uidGlobal, ...paymentData });
    alert(`UPI payment initiated for ${feature}. Awaiting admin approval.`);
    modal.style.display = 'none';
  } catch (error) {
    console.error(`Failed to initiate UPI payment for ${feature}:`, error);
    alert(`Failed to initiate UPI payment. Please try again.`);
  }
}

async function buyFeatureWithStripe(feature, amount) {
  if (!uidGlobal) return alert('Not logged in');
  try {
    const convertedAmount = convertPrice(amount, userCurrency);
    const response = await fetch('http://localhost:3000/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(convertedAmount * 100), currency: userCurrency.toLowerCase(), feature, uid: uidGlobal })
    });
    const { clientSecret } = await response.json();
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: { token: 'tok_visa' } }
    });
    if (error) {
      alert(error.message);
    } else if (paymentIntent.status === 'requires_confirmation') {
      const paymentId = paymentIntent.id;
      const expiry = new Date(Date.now() + (feature === 'export' ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 1000)).toISOString();
      const paymentData = { feature, amount: convertedAmount, currency: userCurrency, status: 'pending', created: new Date().toISOString(), expiry, payment_method: 'stripe', payment_intent_id: paymentId };
      await db.ref(`users/${uidGlobal}/purchases_pending/${paymentId}`).set(paymentData);
      await db.ref(`admin/payments/${paymentId}`).set({ uid: uidGlobal, ...paymentData });
      alert(`Payment initiated for ${feature}. Awaiting admin approval.`);
      modal.style.display = 'none';
    }
  } catch (error) {
    console.error(`Failed to process Stripe payment for ${feature}:`, error);
    alert(`Error processing payment: ${error.message}`);
  }
}

function showPurchaseModal(feature, amount) {
  currentFeature = feature;
  currentAmount = amount;
  const convertedAmount = convertPrice(amount, userCurrency);
  modalContent.innerHTML = `<h2>Purchase ${feature.charAt(0).toUpperCase() + feature.slice(1)} Access</h2><p>Price: ${currencySymbol}${convertedAmount}</p><p>Choose payment method:</p>`;
  modalPayUPI.style.display = userCurrency === 'INR' ? 'inline-block' : 'none'; // Show UPI only for INR
  modalPayStripe.style.display = 'inline-block';
  modal.style.display = 'flex';
}

const ONLINE_TTL_MS = 90000;

function parseTimestampToMs(ts) {
  if (!ts) return null;
  const parts = ts.split(' ');
  if (parts.length < 2) return null;
  const [y, m, d] = parts[0].split('-').map(n => parseInt(n));
  const [hh, mm, ss] = parts[1].split(':').map(n => parseInt(n));
  return new Date(y, m - 1, d, hh, mm, ss).getTime();
}

function computeOnlineDisplay(flag, lastActiveStr) {
  const lastActiveMs = parseTimestampToMs(lastActiveStr);
  if (!lastActiveMs) return !!flag;
  return (Date.now() - lastActiveMs <= ONLINE_TTL_MS) && !!flag;
}

function renderOnlineAndLastActive(flag, lastActiveStr) {
  const isOn = computeOnlineDisplay(flag, lastActiveStr);
  onlineStatusEl.innerHTML = isOn ? '<span class="badge online">ONLINE</span>' : '<span class="badge offline">OFFLINE</span>';
  lastActiveEl.textContent = lastActiveStr || "Unknown";
  maybeNotifyStatus(isOn);
}

let lastActivePoller = null;
function setRefreshIntervals(ms) {
  if (lastActivePoller) clearInterval(lastActivePoller);
  lastActivePoller = setInterval(() => {
    if (!uidGlobal) return;
    const ref = db.ref(`users/${uidGlobal}/vehicle`);
    ref.child("current/last_active").once('value').then(lastSnap => {
      const lastActive = lastSnap.val();
      ref.child("online").once('value').then(flagSnap => renderOnlineAndLastActive(flagSnap.val(), lastActive));
    });
  }, ms);
}

let lastOnlineState = null;
function maybeNotifyStatus(isOnline) {
  const policy = PLAN_POLICIES[localPlan.plan] || PLAN_POLICIES.basic;
  if (!policy.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (lastOnlineState === null) { lastOnlineState = isOnline; return; }
  if (isOnline !== lastOnlineState) {
    new Notification("Vehicle Status", { body: isOnline ? "Vehicle is ONLINE" : "Vehicle is OFFLINE" });
    lastOnlineState = isOnline;
  }
}

function maybeNotifyBattery(battPercent) {
  const policy = PLAN_POLICIES[localPlan.plan] || PLAN_POLICIES.basic;
  if (!policy.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (typeof battPercent === 'number' && battPercent <= 20) {
    new Notification("Low Battery", { body: `Vehicle battery low (${battPercent}%)` });
  }
}

let drawControl, drawnItems;
let geofenceState = { lastInsideAny: null };

function setupDrawTools() {
  if (!map) return;
  if (drawnItems) return;
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);
  drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
      rectangle: true,
      polygon: true,
      circle: true,
      circlemarker: false,
      marker: false,
      polyline: false
    },
    edit: { featureGroup: drawnItems }
  });
}

function enableDrawing() {
  if (!map || !drawControl) return;
  map.addControl(drawControl);
}

function disableDrawing() {
  if (!map || !drawControl) return;
  map.removeControl(drawControl);
}

function geofenceToJSON(layer) {
  if (layer instanceof L.Circle) {
    const c = layer.getLatLng();
    return { type: 'circle', center: [c.lat, c.lng], radius: layer.getRadius() };
  } else if (layer instanceof L.Polygon) {
    const latlngs = layer.getLatLngs()[0].map(p => [p.lat, p.lng]);
    return { type: 'polygon', points: latlngs };
  } else if (layer instanceof L.Rectangle) {
    const latlngs = layer.getLatLngs()[0].map(p => [p.lat, p.lng]);
    return { type: 'polygon', points: latlngs };
  }
  return null;
}

function layerFromJSON(obj) {
  if (!obj) return null;
  if (obj.type === 'circle') {
    return L.circle(obj.center, { radius: obj.radius });
  }
  if (obj.type === 'polygon' && Array.isArray(obj.points)) {
    return L.polygon(obj.points);
  }
  return null;
}

async function saveGeofences() {
  if (!uidGlobal) return;
  const plan = localPlan.plan;
  const policy = PLAN_POLICIES[plan] || PLAN_POLICIES.basic;
  const layers = [];
  drawnItems.eachLayer(l => {
    const j = geofenceToJSON(l);
    if (j) layers.push(j);
  });
  if (plan === 'silver' && layers.length > policy.geofences) {
    alert('Silver plan allows only 1 geofence');
    return;
  }
  await db.ref(`users/${uidGlobal}/geofences`).set(layers);
  alert('Geofences saved');
}

async function loadGeofences() {
  if (!uidGlobal || !map) return;
  const snap = await db.ref(`users/${uidGlobal}/geofences`).once('value');
  const arr = snap.val() || [];
  drawnItems.clearLayers();
  arr.forEach(obj => {
    const layer = layerFromJSON(obj);
    if (layer) { drawnItems.addLayer(layer); }
  });
}

function pointInsideGeofences(lat, lng) {
  if (!drawnItems) return false;
  let inside = false;
  drawnItems.eachLayer(layer => {
    if (inside) return;
    if (layer instanceof L.Circle) {
      const c = layer.getLatLng();
      inside = map.distance([lat, lng], c) <= layer.getRadius();
    } else if (layer instanceof L.Polygon) {
      inside = leafletPip.pointInLayer([lng, lat], layer, true).length > 0;
    }
  });
  return inside;
}

function exportHistoryCSV(histArray) {
  if (!localPlan.exportCSV && !(udata && udata.purchases?.export && isPurchaseValid(udata.purchases.export))) {
    showPurchaseModal('export', BASE_PRICES.export);
    return;
  }
  if (!histArray || !Array.isArray(histArray) || histArray.length === 0) {
    alert('No history data available to export.');
    return;
  }
  try {
    const rows = [['time', 'location', 'speed']];
    histArray.forEach(entry => {
      const location = (isFinite(entry.lat) && isFinite(entry.lng)) ? `${entry.lat},${entry.lng}` : '';
      rows.push([entry.time || '', location, entry.speed !== null ? String(entry.speed) : '']);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('CSV export failed:', error);
    alert('Failed to export history. Please try again.');
  }
}

function renderComponents(obj) {
  componentsListEl.innerHTML = "";
  if (!obj || !Object.keys(obj).length) {
    componentsListEl.innerHTML = '<li class="comp-unknown">No components</li>';
    return;
  }
  for (let k in obj) {
    const v = obj[k];
    let cls = "comp-unknown";
    if (v === "ok" || v === "activity") cls = "comp-ok";
    else if (v === "no_fix" || v === "idle") cls = "comp-warn";
    else if (v === "down") cls = "comp-bad";
    componentsListEl.innerHTML += `<li class="${cls}"><strong>${k}:</strong> ${v}</li>`;
  }
}

let chartInstance = null;
function renderAnalyticsChart(history) {
  if (!history || !analyticsChart) return;
  const ctx = analyticsChart.getContext('2d');
  const labels = history.map(h => h.time || '');
  const speeds = history.map(h => h.speed !== null ? h.speed : 0);

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Speed (km/h)',
        data: speeds,
        borderColor: '#2670ff',
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { display: true, title: { display: true, text: 'Time' } },
        y: { display: true, title: { display: true, text: 'Speed (km/h)' } }
      }
    }
  });
}

async function addVehicle() {
  const vehicleId = prompt('Enter Vehicle ID:');
  if (!vehicleId || !uidGlobal) return;
  const policy = PLAN_POLICIES[localPlan.plan] || PLAN_POLICIES.basic;
  const currentVehicles = await db.ref(`users/${uidGlobal}/vehicles`).once('value').then(snap => snap.val() || {});
  if (Object.keys(currentVehicles).length >= policy.vehicle_limit) {
    alert(`Vehicle limit reached (${policy.vehicle_limit})`);
    return;
  }
  await db.ref(`users/${uidGlobal}/vehicles/${vehicleId}`).set({ added: new Date().toISOString() });
  renderFleetList();
}

async function renderFleetList() {
  if (!localPlan.fleet && !(udata && udata.purchases?.fleet && isPurchaseValid(udata.purchases.fleet))) {
    fleetList.innerHTML = '<li>Fleet management not available</li>';
    return;
  }
  const snap = await db.ref(`users/${uidGlobal}/vehicles`).once('value');
  const vehicles = snap.val() || {};
  fleetList.innerHTML = '';
  if (!Object.keys(vehicles).length) {
    fleetList.innerHTML = '<li>No vehicles added</li>';
    return;
  }
  for (const [id, data] of Object.entries(vehicles)) {
    const li = document.createElement('li');
    li.innerHTML = `${id} (Added: ${prettyTS(data.added)})`;
    fleetList.appendChild(li);
  }
}

async function renderPendingPayments() {
  if (!isAdmin) return;
  const snap = await db.ref('admin/payments').once('value');
  const payments = snap.val() || {};
  paymentList.innerHTML = '<table style="width:100%"><thead><tr><th>User</th><th>Feature</th><th>Amount</th><th>Currency</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody></table>';
  const tbody = paymentList.querySelector('tbody');
  tbody.innerHTML = '';
  Object.entries(payments).reverse().forEach(([key, val]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${val.uid}</td><td>${val.feature}</td><td>${val.currency} ${val.amount}</td><td>${val.currency}</td><td>${val.status}</td><td></td>`;
    const actionsTd = tr.querySelector('td:last-child');
    if (val.status === 'pending') {
      const aBtn = document.createElement('button');
      aBtn.textContent = 'Approve';
      aBtn.className = 'btn btn-primary';
      aBtn.onclick = () => adminApprovePayment(key, val);
      const rBtn = document.createElement('button');
      rBtn.textContent = 'Reject';
      rBtn.className = 'btn btn-danger';
      rBtn.style.marginLeft = '8px';
      rBtn.onclick = () => {
        if (!confirm('Reject this payment?')) return;
        adminRejectPayment(key, val);
      };
      actionsTd.appendChild(aBtn);
      actionsTd.appendChild(rBtn);
    } else {
      actionsTd.textContent = 'Processed';
    }
    tbody.appendChild(tr);
  });
}

modalClose.onclick = () => modal.style.display = 'none';
modalPayUPI.onclick = () => buyFeatureWithUPI(currentFeature, currentAmount);
modalPayStripe.onclick = () => buyFeatureWithStripe(currentFeature, currentAmount);

let udata = null;
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  uidGlobal = user.uid;
  userEmailEl.textContent = user.email || user.uid;

  // Initialize currency detection and conversion
  await initializeCurrency();

  db.ref(`users/${uidGlobal}`).on('value', snap => {
    udata = snap.val() || {};
    applyPlanToUI(udata);
    checkAndAutoDowngrade(uidGlobal, udata);
    if (udata.custom_marker_icon) {
      customMarkerIcon = L.icon({ iconUrl: udata.custom_marker_icon, iconSize: [32, 32], iconAnchor: [16, 30] });
      if (liveMarker) liveMarker.setIcon(customMarkerIcon);
    }
    if (udata.admin === true) { isAdmin = true; adminPanel.style.display = 'block'; adminPanelPayments.style.display = 'block'; }
    else { isAdmin = false; adminPanel.style.display = 'none'; adminPanelPayments.style.display = 'none'; }
    if (udata.purchases?.fleet || localPlan.fleet) renderFleetList();
  });

  const ref = db.ref(`users/${uidGlobal}/vehicle`);
  ref.child("current").on("value", snap => {
    const d = snap.val();
    if (!d) return;
    locationEl.textContent = d.latitude && d.longitude ? `${d.latitude}, ${d.longitude}` : "No location";
    if (d.latitude && d.longitude) {
      updateMap(parseFloat(d.latitude), parseFloat(d.longitude));
      const inside = pointInsideGeofences(parseFloat(d.latitude), parseFloat(d.longitude));
      if (geofenceState.lastInsideAny === null) geofenceState.lastInsideAny = inside;
      if (geofenceState.lastInsideAny && !inside) {
        modalContent.innerHTML = '<b>Geofence Alert:</b> Vehicle left the zone.';
        modalPayUPI.style.display = 'none';
        modalPayStripe.style.display = 'none';
        modal.style.display = 'flex';
        const policy = PLAN_POLICIES[localPlan.plan] || PLAN_POLICIES.basic;
        if (policy.notify && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Geofence Alert', { body: 'Vehicle left the zone' });
        }
      }
      geofenceState.lastInsideAny = inside;
    }
    lastActiveEl.textContent = d.last_active || "Unknown";
    statusEl.textContent = d.status || "Unknown";
    const batt = (typeof d.battery !== 'undefined') ? Number(d.battery) : null;
    batteryHealthEl.textContent = (batt !== null && !isNaN(batt)) ? `${batt}%` : "N/A";
    if (batt !== null) maybeNotifyBattery(batt);
    ref.child("online").once('value').then(s => renderOnlineAndLastActive(s.val(), d.last_active));
  });

  ref.child("history").on("value", snap => {
    const raw = snap.val() || null;
    fullHistory = raw ? Object.values(raw).slice().reverse().map(parseEntry) : [];
    applyHistoryPipeline();
    if (localPlan.analytics) renderAnalyticsChart(fullHistory);
  });

  ref.child("components").on("value", snap => renderComponents(snap.val()));
  ref.child("online").on("value", snap => {
    ref.child("current/last_active").once("value").then(s2 => renderOnlineAndLastActive(snap.val(), s2.val()));
  });
  ref.child("last_seen").on("value", s => lastSeenEl.textContent = s.val() || "N/A");
  ref.child("alarm").on("value", s => {
    const st = s.val() || "off";
    alarmToggle.checked = st === "on";
    alarmStatusText.textContent = `Alarm is ${st.toUpperCase()}`;
  });
  ref.child("last_trigger").on("value", s => {
    const t = s.val();
    if (t && t.time && t.status === "alert") {
      alarmTriggerEl.innerHTML = `<span style="color:red;">⚠️ ${t.time} at ${t.location}</span>`;
    } else alarmTriggerEl.textContent = "No triggers";
  });
  alarmToggle.addEventListener("change", () => {
    ref.child("alarm").set(alarmToggle.checked ? "on" : "off");
  });

  db.ref('admin/upgrade_requests').on('value', snap => {
    if (!isAdmin) return;
    const reqs = snap.val() || {};
    adminList.innerHTML = '<table style="width:100%"><thead><tr><th>User</th><th>Plan</th><th>When</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody></table>';
    const tbody = adminList.querySelector('tbody');
    tbody.innerHTML = '';
    Object.entries(reqs).reverse().forEach(([key, val]) => {
      const tr = document.createElement('tr');
      const when = val.request_time || '-';
      const status = val.status || '-';
      tr.innerHTML = `<td>${val.uid}</td><td>${val.requestedPlan || ''}</td><td>${when}</td><td>${status}</td><td></td>`;
      const actionsTd = tr.querySelector('td:last-child');
      if (status === 'pending') {
        const aBtn = document.createElement('button');
        aBtn.textContent = 'Approve';
        aBtn.className = 'btn btn-primary';
        aBtn.onclick = () => {
          adminApproveRequest(uidGlobal, user.email || uidGlobal, key, val);
        };
        const rBtn = document.createElement('button');
        rBtn.textContent = 'Reject';
        rBtn.className = 'btn btn-danger';
        rBtn.style.marginLeft = '8px';
        rBtn.onclick = () => {
          if (!confirm('Reject this upgrade request?')) return;
          adminRejectRequest(uidGlobal, user.email || uidGlobal, key, val);
        };
        actionsTd.appendChild(aBtn);
        actionsTd.appendChild(rBtn);
      } else {
        actionsTd.textContent = 'Processed';
      }
      tbody.appendChild(tr);
    });
  });

  db.ref('admin/approvals').limitToLast(50).on('value', snap => {
    if (!isAdmin) return;
    const logs = snap.val() || {};
    adminLogs.innerHTML = '<ul style="padding-left:16px;margin:0;">' +
      Object.entries(logs).reverse().map(([k, v]) =>
        `<li style="margin-bottom:6px;"><b>${v.adminName || v.adminUid || 'admin'}</b> → ${v.uid} : ${v.plan || v.status} (${v.approvedAt || v.processedAt || v.time || ''})</li>`
      ).join('') + '</ul>';
  });

  await loadGeofences();
  await renderFleetList();
});

function applyHistoryPipeline(plotPolyline = false) {
  if (!fullHistory) {
    historyTbody.innerHTML = '<tr><td colspan="3">No history</td></tr>';
    return;
  }
  filteredHistory = applyDateFilter(fullHistory);
  renderHistoryTable(filteredHistory);
  computeKPIs(filteredHistory);
  if (plotPolyline) plotRoute(filteredHistory);
  updateHeatmap(filteredHistory);
  if (localPlan.analytics) renderAnalyticsChart(filteredHistory);
}

applyFilterBtn.addEventListener('click', () => applyHistoryPipeline(true));
clearFilterBtn.addEventListener('click', () => {
  startDateInput.value = '';
  endDateInput.value = '';
  applyHistoryPipeline();
});

exportCSVBtn.addEventListener('click', () => exportHistoryCSV(filteredHistory));
buyExportBtn.addEventListener('click', () => showPurchaseModal('export', 2));
buyAnalyticsBtn.addEventListener('click', () => showPurchaseModal('analytics', 5));
buyFleetBtn.addEventListener('click', () => showPurchaseModal('fleet', 30));
addVehicleBtn.addEventListener('click', addVehicle);

mapTypeSelect.addEventListener('change', (e) => {
  updateBaseLayer(e.target.value);
});

heatToggle.addEventListener('change', () => updateHeatmap(filteredHistory));

iconUploader.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file || !uidGlobal) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    await db.ref(`users/${uidGlobal}/custom_marker_icon`).set(dataUrl);
    customMarkerIcon = L.icon({ iconUrl: dataUrl, iconSize: [32, 32], iconAnchor: [16, 30] });
    if (liveMarker) liveMarker.setIcon(customMarkerIcon);
    alert('Custom marker icon saved.');
  };
  reader.readAsDataURL(file);
});

gfEnableDrawBtn.addEventListener('click', () => {
  enableDrawing();
});
gfSaveBtn.addEventListener('click', () => { saveGeofences(); disableDrawing(); });
gfClearBtn.addEventListener('click', async () => {
  if (!uidGlobal) return;
  drawnItems.clearLayers();
  await db.ref(`users/${uidGlobal}/geofences`).set([]);
  alert('Geofences cleared');
});

upgradeToSilverBtn.addEventListener('click', () => {
  if (!uidGlobal) return alert('Not logged in');
  createUpgradeRequest(uidGlobal, 'silver').then(() => {
    upgradeToSilverBtn.style.display = 'none';
    upgradeToGoldBtn.style.display = 'none';
    requestStatusArea.innerHTML = '<span class="pending-pill">Upgrade request SENT (pending admin approval)</span>';
  }).catch(() => { alert('Failed to send request'); });
});
upgradeToGoldBtn.addEventListener('click', () => {
  if (!uidGlobal) return alert('Not logged in');
  createUpgradeRequest(uidGlobal, 'gold').then(() => {
    upgradeToSilverBtn.style.display = 'none';
    upgradeToGoldBtn.style.display = 'none';
    requestStatusArea.innerHTML = '<span class="pending-pill">Upgrade request SENT (pending admin approval)</span>';
  }).catch(() => { alert('Failed to send request'); });
});

logoutBtn.addEventListener('click', () => {
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  }).catch(error => {
    console.error('Logout failed:', error);
    alert('Failed to logout. Please try again.');
  });
});

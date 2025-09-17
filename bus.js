(function () {
  'use strict';

  // Firebase Configuration
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
  const functions = firebase.functions();

  // DOM Element Caching
  const dom = {
    loader: document.getElementById('loader'),
    locateBtn: document.getElementById('locateBtn'),
    showBusStopsBtn: document.getElementById('showBusStopsBtn'),
    searchVehicleInput: document.getElementById('searchVehicle'),
    searchVehicleBtn: document.getElementById('searchVehicleBtn'),
    searchRouteFrom: document.getElementById('searchRouteFrom'),
    searchRouteTo: document.getElementById('searchRouteTo'),
    searchRouteBtn: document.getElementById('searchRouteBtn'),
    searchResults: document.getElementById('searchResults'),
    vehicleDetails: document.getElementById('vehicleDetails'),
    vehicleTitle: document.getElementById('vehicleTitle'),
    vehicleInfo: document.getElementById('vehicleInfo'),
    stopList: document.getElementById('stopList'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    busStopPanel: document.getElementById('busStopPanel'),
    busStopContent: document.getElementById('busStopContent'),
    closeBusStopPanelBtn: document.getElementById('closeBusStopPanelBtn'),
    toastContainer: document.querySelector('.toast-container')
  };

  // State & Map Variables
  let map;
  const markers = {};
  let stopMarkers = {};
  let markerGroup = L.featureGroup();
  let routeLayer = L.featureGroup();
  let userLocationMarker = null;
  let userLocation = null;
  let vehiclesData = {};
  let busStops = [];

  // Custom Bus Icon
  const createBusIcon = (color = '#2563eb') => {
    return L.divIcon({
      className: 'bus-marker',
      html: `<div class="bus-icon" style="background-color: ${color}">
              <i class="bi bi-bus-front"></i>
            </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });
  };

  const stopIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  const userLocationIcon = L.divIcon({
    className: 'user-location-icon',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12]
  });

  // Helper Functions
  const showLoader = () => dom.loader.classList.remove('hidden');
  const hideLoader = () => dom.loader.classList.add('hidden');

  const showToast = (message, type = 'info', ttl = 3500) => {
    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-bg-${type} border-0 show`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center">
          <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : type === 'warning' ? 'bi-exclamation-triangle-fill' : type === 'danger' ? 'bi-x-circle-fill' : 'bi-info-circle-fill'} me-2"></i>
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>`;
    dom.toastContainer.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl, { delay: ttl });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  };

  const parseGps = (gps) => {
    if (!gps) return null;
    if (typeof gps === 'object' && gps.latitude && gps.longitude) {
      return [gps.latitude, gps.longitude];
    }
    const parts = String(gps).split(',').map(s => parseFloat(s.trim()));
    if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1]) || (parts[0] === 0 && parts[1] === 0)) {
      return null;
    }
    return [parts[0], parts[1]];
  };

  const formatDistance = (distance) => {
    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    }
    return `${distance.toFixed(2)} km`;
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Backend ETA Caller
  const getETA = async (vehicle, previousCoords, previousTime) => {
    try {
      const calculateETA = functions.httpsCallable('calculateETA');
      const result = await calculateETA({ vehicle, previousCoords, previousTime });
      return result.data;
    } catch (err) {
      console.error('ETA calculation error:', err);
      showToast('Failed to calculate ETA. Using default.', 'warning');
      return { eta: 'N/A', nextStop: 'N/A', speed: 0 };
    }
  };

  // Map Functions
  const initMap = () => {
    map = L.map('map').setView([19.0760, 72.8777], 12); // Centered on Mumbai
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    markerGroup.addTo(map);
    routeLayer.addTo(map);
  };

  const locateUser = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser.", "warning");
      return Promise.reject("Geolocation not supported");
    }
    showToast("Locating you...", "info");
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          userLocation = [latitude, longitude];
          if (userLocationMarker) {
            userLocationMarker.setLatLng(userLocation);
          } else {
            userLocationMarker = L.marker(userLocation, { icon: userLocationIcon }).addTo(map);
            userLocationMarker.bindPopup("<b>You are here</b>");
          }
          map.flyTo(userLocation, 16);
          setTimeout(() => userLocationMarker.openPopup(), 1000);
          findNearestBusStops();
          resolve();
        },
        (err) => {
          showToast("Unable to retrieve your location. Please check permissions.", "danger");
          reject(err);
        }
      );
    });
  };

  const findNearestBusStops = () => {
    if (!userLocation || busStops.length === 0) {
      showToast("Location or bus stops data not available.", "warning");
      return;
    }
    busStops.forEach(stop => {
      const coords = parseGps(stop.gps);
      if (coords) {
        stop.distance = calculateDistance(userLocation[0], userLocation[1], coords[0], coords[1]);
      } else {
        stop.distance = Infinity;
      }
    });
    busStops.sort((a, b) => a.distance - b.distance);
    if (busStops[0].distance !== Infinity) {
      showBusStopPanel(busStops[0]);
    } else {
      showToast("No valid bus stops found.", "warning");
    }
  };

  const showBusStopPanel = (stop) => {
    dom.busStopContent.innerHTML = `
      <div class="bus-stop-header">
        <h6 class="bus-stop-title">${stop.name}</h6>
        <a href="#" class="see-all-link" id="seeAllStops">
          See all stops <i class="bi bi-arrow-right"></i>
        </a>
      </div>
      <div class="bus-stop-item">
        <div class="bus-stop-name">${stop.name}</div>
        <div class="bus-stop-distance">
          <i class="bi bi-geo-alt"></i> ${formatDistance(stop.distance)} away
        </div>
      </div>
      ${(stop.vehicles || []).map(v => `
        <div class="bus-route">
          <h6 class="bus-route-title">${v.type || 'Unknown'}</h6>
          <div class="bus-route-item">
            <div class="bus-number">
              <i class="bi bi-bus-front"></i> ${v.vehicleId}
            </div>
            <div class="bus-destination">${v.routeName || 'N/A'}</div>
            <div class="bus-timings">${v.timings || 'Timings not available'}</div>
          </div>
        </div>
      `).join('') || '<div class="text-muted p-3 text-center"><i class="bi bi-info-circle"></i> No vehicles available at this stop.</div>'}
    `;
    dom.busStopPanel.classList.add('is-visible');

    // Handle "See all stops" click
    const seeAllLink = dom.busStopContent.querySelector('#seeAllStops');
    seeAllLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAllStops();
    });
  };

  const showAllStops = () => {
    dom.busStopContent.innerHTML = `
      <div class="bus-stop-header">
        <h6 class="bus-stop-title">All Bus Stops</h6>
      </div>
      <ul class="list-group list-group-flush">
        ${busStops.map(stop => `
          <li class="list-group-item" data-stop-id="${stop.id}">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>${stop.name}</strong><br>
                <small class="text-success"><i class="bi bi-geo-alt"></i> ${formatDistance(stop.distance)}</small>
              </div>
              <button class="btn btn-sm btn-outline-primary view-stop-btn">
                <i class="bi bi-geo-alt"></i> View
              </button>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
    dom.busStopPanel.classList.add('is-visible');

    // Add event listeners for view buttons
    dom.busStopContent.querySelectorAll('.view-stop-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stopId = btn.closest('.list-group-item').dataset.stopId;
        const stop = busStops.find(s => s.id == stopId);
        if (stop) {
          const coords = parseGps(stop.gps);
          if (coords) {
            map.flyTo(coords, 16);
            if (stopMarkers[stop.id]) {
              setTimeout(() => stopMarkers[stop.id].openPopup(), 1000);
            }
          }
        }
      });
    });
  };

  const drawVehicleRoute = (vehicle) => {
    routeLayer.clearLayers();
    Object.values(stopMarkers).forEach(marker => map.removeLayer(marker));
    stopMarkers = {};
    const routePath = (vehicle.fullRoutePath || []).map(parseGps).filter(Boolean);
    if (routePath.length > 1) {
      L.polyline(routePath, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(routeLayer);
    }
    const stops = vehicle.stops || [];
    stops.forEach((stop, index) => {
      const coords = parseGps(stop.gps);
      if (coords) {
        const marker = L.marker(coords, { icon: stopIcon }).addTo(routeLayer);
        marker.bindPopup(`
          <strong>Stop ${index + 1}:</strong> ${stop.name || 'Unnamed Stop'}<br>
          <small>Click to view on map</small>
        `);
        stopMarkers[`stop-${index}`] = marker;
        L.circleMarker(coords, {
          radius: 6,
          color: '#10b981',
          fillColor: '#fff',
          fillOpacity: 1,
          weight: 2
        }).addTo(routeLayer);
      }
    });
  };

  // UI Update Functions
  const showVehicleDetails = async (vid, vehicle) => {
    dom.vehicleTitle.textContent = `Vehicle: ${vid}`;
    
    // Calculate ETA for the detailed view
    const vehicleHistory = markers[vid];
    let etaInfoForDetails = { eta: 'Calculating...', nextStop: 'N/A', speed: 0 };
    if (vehicleHistory) {
        etaInfoForDetails = await getETA(vehicle, vehicleHistory.prevCoords, vehicleHistory.prevTime);
    }
    
    // Create battery indicator
    const batteryLevel = vehicle.battery ?? 0;
    let batteryColor = 'success';
    let batteryIcon = 'bi-battery-full';
    
    if (batteryLevel < 20) {
      batteryColor = 'danger';
      batteryIcon = 'bi-battery';
    } else if (batteryLevel < 50) {
      batteryColor = 'warning';
      batteryIcon = 'bi-battery-half';
    }
    
    dom.vehicleInfo.innerHTML = `
      <div class="d-flex flex-wrap gap-3 mb-3">
        <div class="d-flex align-items-center">
          <i class="bi bi-bus-front text-primary me-2"></i>
          <span>${vehicle.vehicleType || 'Unknown'}</span>
        </div>
        <div class="d-flex align-items-center">
          <i class="bi bi-signpost text-primary me-2"></i>
          <span>${vehicle.routeName || 'N/A'}</span>
        </div>
        <div class="d-flex align-items-center">
          <i class="bi ${batteryIcon} text-${batteryColor} me-2"></i>
          <span>${batteryLevel}%</span>
        </div>
      </div>
      <div class="d-flex flex-wrap gap-3">
        <div class="d-flex align-items-center">
          <i class="bi bi-building text-primary me-2"></i>
          <span>${vehicle.companyName || 'N/A'}</span>
        </div>
        <div class="d-flex align-items-center">
          <i class="bi bi-speedometer2 text-primary me-2"></i>
          <span>${etaInfoForDetails.speed || 'N/A'} km/h</span>
        </div>
      </div>
      <div class="eta-info-panel mt-3">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>Next Stop:</strong> ${etaInfoForDetails.nextStop}<br>
            <small>AI-Powered Prediction</small>
          </div>
          <span class="eta-badge">${etaInfoForDetails.eta}</span>
        </div>
      </div>
    `;
    
    dom.stopList.innerHTML = '';
    const stops = vehicle.stops || [];
    if (stops.length > 0) {
      stops.forEach((stop, index) => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = `
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>Stop ${index + 1}:</strong> ${stop.name || 'Unnamed Stop'}
            </div>
            <button class="btn btn-sm btn-outline-primary view-stop-btn" data-index="${index}">
              <i class="bi bi-geo-alt"></i> View
            </button>
          </div>
        `;
        dom.stopList.appendChild(li);
        li.querySelector('.view-stop-btn').addEventListener('click', () => {
          const coords = parseGps(stop.gps);
          if (coords) {
            map.flyTo(coords, 16);
            if (stopMarkers[`stop-${index}`]) {
              setTimeout(() => stopMarkers[`stop-${index}`].openPopup(), 1000);
            }
          }
        });
      });
    } else {
      dom.stopList.innerHTML = '<li class="list-group-item text-muted text-center py-3"><i class="bi bi-info-circle"></i> No stops available.</li>';
    }
    drawVehicleRoute(vehicle);
    dom.vehicleDetails.classList.add('is-visible');
  };

  const hideVehicleDetails = () => {
    dom.vehicleDetails.classList.remove('is-visible');
    routeLayer.clearLayers();
    Object.values(stopMarkers).forEach(marker => map.removeLayer(marker));
    stopMarkers = {};
  };

  const hideBusStopPanel = () => dom.busStopPanel.classList.remove('is-visible');

  // Data & Business Logic
  const loadPublicVehicles = () => {
    const vehiclesRef = db.ref('public_transport/vehicles');
    vehiclesRef.on('value', async snap => {
      hideLoader();
      vehiclesData = snap.val() || {};
      const presentVehicleIds = new Set();
      const bounds = [];

      Object.entries(vehiclesData).forEach(([vid, v]) => {
        presentVehicleIds.add(vid);
        const newCoords = parseGps(v.gps);
        if (newCoords) {
          bounds.push(newCoords);
          if (!markers[vid]) {
            const marker = L.marker(newCoords, { icon: createBusIcon(), title: vid }).addTo(markerGroup);
            marker.bindPopup(`
              <strong>${vid}</strong><br>
              ${v.vehicleType || 'Unknown'}<br>
              ${v.routeName ? `Route: ${v.routeName}` : ''}<br>
              <span class="text-success"><i class="bi bi-clock"></i> ETA: Calculating...</span>
            `);
            marker.on('click', () => showVehicleDetails(vid, v));
            markers[vid] = { 
              marker, 
              prevCoords: newCoords, 
              prevTime: v.lastUpdated || Date.now() 
            };
          } else {
            const { marker, prevCoords, prevTime } = markers[vid];
            marker.setLatLng(newCoords);
            marker.setPopupContent(`
              <strong>${vid}</strong><br>
              ${v.vehicleType || 'Unknown'}<br>
              ${v.routeName ? `Route: ${v.routeName}` : ''}<br>
              <span class="text-success"><i class="bi bi-clock"></i> ETA: Calculating...</span>
            `);
            markers[vid].prevCoords = newCoords;
            markers[vid].prevTime = v.lastUpdated || Date.now();
          }
        }
      });

      Object.keys(markers).forEach(vid => {
        if (!presentVehicleIds.has(vid)) {
          markerGroup.removeLayer(markers[vid].marker);
          delete markers[vid];
        }
      });

      if (bounds.length && map.getZoom() <= 12) {
        try {
          map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        } catch (e) {
          console.error("Error fitting bounds:", e);
        }
      }

      // Update ETAs asynchronously
      for (const vid of presentVehicleIds) {
        const { marker, prevCoords, prevTime } = markers[vid];
        const v = vehiclesData[vid];
        const etaInfo = await getETA(v, prevCoords, prevTime);
        marker.setPopupContent(`
          <strong>${vid}</strong><br>
          ${v.vehicleType || 'Unknown'}<br>
          ${v.routeName ? `Route: ${v.routeName}` : ''}<br>
          <span class="text-success"><i class="bi bi-clock"></i> ETA: ${etaInfo.eta}</span>
        `);
      }
    }, err => {
      console.error('Vehicles listener error:', err);
      showToast('Failed to load vehicles.', 'danger');
      hideLoader();
    });
  };

  const loadBusStops = () => {
    const stopsRef = db.ref('public_transport/stops');
    stopsRef.once('value', snap => {
      const stops = snap.val() || {};
      busStops = Object.entries(stops).map(([id, stop]) => ({
        id,
        name: stop.name,
        gps: stop.gps,
        vehicles: stop.vehicles || []
      }));
      busStops.forEach(stop => {
        const coords = parseGps(stop.gps);
        if (coords) {
          const marker = L.marker(coords, { icon: stopIcon }).addTo(map);
          marker.bindPopup(`
            <strong>${stop.name}</strong><br>
            <small>Click for more info</small>
          `);
          marker.on('click', () => showBusStopPanel(stop));
          stopMarkers[stop.id] = marker;
        }
      });
      if (userLocation) {
        findNearestBusStops();
      }
    }, err => {
      console.error('Bus stops listener error:', err);
      showToast('Failed to load bus stops.', 'danger');
    });
  };

  const searchByVehicleNumber = () => {
    const query = dom.searchVehicleInput.value.trim().toUpperCase();
    if (!query) {
      showToast('Please enter a vehicle number.', 'warning');
      return;
    }
    const foundVid = Object.keys(vehiclesData).find(vid => vid.toUpperCase().includes(query));
    if (foundVid && markers[foundVid]) {
      const { marker } = markers[foundVid];
      map.flyTo(marker.getLatLng(), 16);
      marker.openPopup();
      showVehicleDetails(foundVid, vehiclesData[foundVid]);
    } else {
      db.ref(`public_transport/vehicles/${foundVid}`).once('value', snap => {
        if (snap.exists()) {
          const vehicleData = snap.val();
          const coords = parseGps(vehicleData.gps);
          if (coords) {
            map.flyTo(coords, 16);
            showVehicleDetails(foundVid, vehicleData);
          } else {
            showToast('Vehicle has no valid location.', 'warning');
          }
        } else {
          showToast('Vehicle not found.', 'warning');
        }
      }).catch(err => {
        console.error('Error fetching vehicle:', err);
        showToast('Error fetching vehicle data.', 'danger');
      });
    }
  };

  const searchByRoute = async () => {
    const from = dom.searchRouteFrom.value.trim().toLowerCase();
    const to = dom.searchRouteTo.value.trim().toLowerCase();
    if (!from || !to) {
      showToast('Enter both "From" and "To" locations.', 'warning');
      return;
    }
    dom.searchResults.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Searching...</div>';
    const results = [];
    Object.entries(vehiclesData).forEach(([vid, v]) => {
      const stops = (v.stops || []).map(s => s.name ? s.name.toLowerCase() : '');
      const hasFrom = stops.some(s => s.includes(from));
      const hasTo = stops.some(s => s.includes(to));
      if (hasFrom && hasTo) {
        results.push({ vid, vehicle: v });
      }
    });
    dom.searchResults.innerHTML = '';
    if (results.length > 0) {
      for (const { vid, vehicle } of results) {
        let etaInfo = { eta: 'Calculating...', nextStop: 'N/A' };
        if (markers[vid]) {
          const { prevCoords, prevTime } = markers[vid];
          etaInfo = await getETA(vehicle, prevCoords, prevTime);
        }
        
        const div = document.createElement('div');
        div.className = 'vehicle-item p-3 border-bottom';
        div.innerHTML = `
          <div class="d-flex justify-content-between align-items-start">
            <div class="d-flex align-items-center">
              <i class="bi bi-bus-front text-primary me-2"></i>
              <div>
                <strong>${vid}</strong> - ${vehicle.routeName || 'N/A'}<br>
                <small class="text-muted">${vehicle.vehicleType || 'Unknown'}</small>
              </div>
            </div>
            <span class="eta-badge">${etaInfo.eta}</span>
          </div>
        `;
        div.addEventListener('click', () => {
          if (markers[vid]) {
            const { marker } = markers[vid];
            map.flyTo(marker.getLatLng(), 16);
            marker.openPopup();
            showVehicleDetails(vid, vehicle);
          } else {
            const coords = parseGps(vehicle.gps);
            if (coords) {
              map.flyTo(coords, 16);
              showVehicleDetails(vid, vehicle);
            } else {
              showToast('Vehicle location not available.', 'warning');
            }
          }
        });
        dom.searchResults.appendChild(div);
      }
    } else {
      dom.searchResults.innerHTML = '<div class="text-muted p-3 text-center"><i class="bi bi-exclamation-circle"></i> No routes found.</div>';
    }
  };

  // Event Listeners
  const addEventListeners = () => {
    dom.locateBtn.addEventListener('click', locateUser);
    dom.showBusStopsBtn.addEventListener('click', () => {
      if (userLocation) {
        findNearestBusStops();
      } else {
        showToast("Please enable location services first.", "warning");
        locateUser();
      }
    });
    dom.searchVehicleBtn.addEventListener('click', searchByVehicleNumber);
    dom.searchRouteBtn.addEventListener('click', searchByRoute);
    dom.closeSidebarBtn.addEventListener('click', hideVehicleDetails);
    dom.closeBusStopPanelBtn.addEventListener('click', hideBusStopPanel);
    dom.searchVehicleInput.addEventListener('keypress', e => { if (e.key === 'Enter') searchByVehicleNumber(); });
    dom.searchRouteFrom.addEventListener('keypress', e => { if (e.key === 'Enter') searchByRoute(); });
    dom.searchRouteTo.addEventListener('keypress', e => { if (e.key === 'Enter') searchByRoute(); });
  };

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    showLoader();
    initMap();
    loadPublicVehicles();
    loadBusStops();
    addEventListeners();
    locateUser().catch(() => {
      console.log("Initial geolocation attempt failed; user can manually trigger location.");
      hideLoader();
    });
  });
})();

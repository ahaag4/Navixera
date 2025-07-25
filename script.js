
// Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCn9YSO4-ksWl6JBqIcEEuLx2EJN8jMj4M",
  authDomain: "svms-c0232.firebaseapp.com",
  databaseURL: "https://svms-c0232-default-rtdb.firebaseio.com",
  projectId: "svms-c0232",
  storageBucket: "svms-c0232.firebasestorage.app",
  messagingSenderId: "359201898609",
  appId: "1:359201898609:web:893ef076207abb06471bd0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const locationEl = document.getElementById("location");
const lastActiveEl = document.getElementById("lastActive");
const statusEl = document.getElementById("status");
const historyEl = document.getElementById("history");

let map, marker;

function updateMap(lat, lng) {
  if (!map) {
    map = L.map('map').setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([lat, lng]).addTo(map);
  } else {
    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], 15);
  }
}

function loadLiveData() {
  db.ref("vehicle/current").on("value", snapshot => {
    const data = snapshot.val();
    if (!data) return;

    const { latitude, longitude, status, last_active } = data;

    locationEl.textContent = `${latitude}, ${longitude}`;
    lastActiveEl.textContent = last_active || "Unknown";
    statusEl.textContent = status || "Unknown";

    updateMap(latitude, longitude);
  });

  db.ref("vehicle/history").on("value", snapshot => {
    const history = snapshot.val();
    historyEl.innerHTML = "";

    if (history) {
      Object.values(history).reverse().forEach(entry => {
        const row = `<tr><td>${entry.time}</td><td>${entry.location}</td></tr>`;
        historyEl.innerHTML += row;
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", loadLiveData);

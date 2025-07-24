const locationEl = document.getElementById("location");
const lastActiveEl = document.getElementById("last-active");
const statusTextEl = document.getElementById("status-text");
const historyList = document.getElementById("history-list");

const LAT_LNG_HISTORY = [];  // for plotting history

async function fetchData() {
  try {
    const res = await fetch('https://your-domain.com/data.json'); // Replace with Cloudflare GitHub raw file URL
    const data = await res.json();

    const { latitude, longitude, last_active } = data;
    const now = new Date();
    const lastActiveDate = new Date(last_active);
    const daysInactive = Math.floor((now - lastActiveDate) / (1000 * 60 * 60 * 24));

    locationEl.textContent = `${latitude}, ${longitude}`;
    lastActiveEl.textContent = last_active;
    statusTextEl.textContent = daysInactive >= 3 ? "🛑 Inactive for 3+ days!" : "✅ Active";

    LAT_LNG_HISTORY.push([latitude, longitude]);
    updateMap(latitude, longitude);
    updateHistory(LAT_LNG_HISTORY);

  } catch (error) {
    console.error("Error fetching data:", error);
    statusTextEl.textContent = "❌ Error loading data";
  }
}

function updateMap(lat, lng) {
  const mapDiv = document.getElementById("map");
  mapDiv.innerHTML = `<iframe width="100%" height="300" src="https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed"></iframe>`;
}

function updateHistory(history) {
  historyList.innerHTML = "";
  history.slice(-5).forEach(([lat, lng], index) => {
    const li = document.createElement("li");
    li.textContent = `#

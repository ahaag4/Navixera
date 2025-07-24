document.addEventListener("DOMContentLoaded", () => {
  const location = document.getElementById("location");
  const lastActive = document.getElementById("lastActive");
  const status = document.getElementById("status");
  const history = document.getElementById("history");

  // Example: Fetch from GitHub Pages or Realtime URL
  fetch("data.json")
    .then(res => res.json())
    .then(data => {
      location.textContent = data.current_location || "Unavailable";
      lastActive.textContent = data.last_active || "Unavailable";
      status.textContent = data.status || "Unknown";

      history.innerHTML = "";
      data.history.forEach(entry => {
        const row = `<tr><td>${entry.time}</td><td>${entry.location}</td></tr>`;
        history.innerHTML += row;
      });
    })
    .catch(err => {
      location.textContent = "Error";
      lastActive.textContent = "Error";
      status.textContent = "Error loading data";
    });
});

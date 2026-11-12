/**
 * TRAVELMATE — MAIN WORKSPACE & ITINERARY LOGIC (PAGE 4)
 * Wanderlog-inspired two-column synchronized itinerary and interactive map.
 * The map itself (Google Maps, or Leaflet/OpenStreetMap as fallback) lives in map-provider.js (window.TMMap).
 */

let activeDayNumber = 1;

document.addEventListener("DOMContentLoaded", () => {
  // Load active trip from store
  renderTripHeader();
  renderDayTabs();
  renderTimelineForDay(activeDayNumber);
  initWorkspaceMap();

  // Mobile switcher
  setupMobileSwitcher();

  // Re-render once the latest data has been loaded from the server
  document.addEventListener("tm:synced", () => {
    const trip = window.TravelMateStore.getActiveTrip();
    if (!trip.days.some(d => d.dayNumber === activeDayNumber)) activeDayNumber = 1;
    renderTripHeader();
    renderDayTabs();
    renderTimelineForDay(activeDayNumber);
    window.TMMap.setView(tripCenter(), 13);
    syncMapToCurrentDay();
  });
});

// Map centre for the active trip: its destination from the catalog, else its first stop, else Mysuru
function tripCenter() {
  const trip = window.TravelMateStore.getActiveTrip();
  const dest = findDestination(trip.destination);
  if (dest) return dest.coordinates;
  const firstStop = trip.days.flatMap(d => d.stops).find(s => s.lat && s.lng);
  return firstStop ? [firstStop.lat, firstStop.lng] : [12.3051, 76.6551];
}

// Render trip header info
function renderTripHeader() {
  const trip = window.TravelMateStore.getActiveTrip();
  if (!trip) return;

  const dayCount = trip.days.length;
  document.getElementById("ws-trip-title").textContent = trip.title;
  document.getElementById("ws-trip-destination").textContent = trip.destination;
  document.getElementById("ws-trip-dates").textContent = trip.startDate
    ? `${formatDate(trip.startDate)} – ${formatDate(trip.endDate || trip.startDate)} (${dayCount} ${dayCount === 1 ? "Day" : "Days"})`
    : `Flexible dates (${dayCount} ${dayCount === 1 ? "Day" : "Days"})`;
  document.getElementById("ws-trip-travelers").textContent = `${trip.travelers} ${trip.travelers == 1 ? "Traveler" : "Travelers"}`;
  document.getElementById("ws-trip-budget").textContent = `₹${Number(trip.budgetTotal || 0).toLocaleString()}`;

  // The rain advisory only concerns the demo trip's Brindavan Gardens stop on Day 2
  const weatherNotice = document.getElementById("ws-weather-banner");
  const day2 = trip.days.find(d => d.dayNumber === 2);
  const hasWeatherStop = day2 && day2.stops.some(s => s.id === "stop-203" || s.id === "stop-alt-weather");
  if (weatherNotice && !hasWeatherStop) {
    weatherNotice.className = "d-none";
  } else if (weatherNotice) {
    const isAltAccepted = window.TravelMateStore.isWeatherAltAccepted();
    if (isAltAccepted) {
      weatherNotice.className = "alert alert-success py-2 px-3 mb-3 d-flex justify-content-between align-items-center";
      weatherNotice.innerHTML = `
        <div class="d-flex align-items-center gap-2 small">
          <i class="bi bi-shield-check text-success fs-5"></i>
          <div><strong>Smart Weather Alternative Applied:</strong> Indoor Heritage scheduled for Day 2 afternoon.</div>
        </div>
        <a href="weather.html" class="tm-btn tm-btn-sm tm-btn-outline">View Weather</a>
      `;
    } else {
      weatherNotice.className = "alert alert-warning py-2 px-3 mb-3 d-flex justify-content-between align-items-center";
      weatherNotice.innerHTML = `
        <div class="d-flex align-items-center gap-2 small">
          <i class="bi bi-cloud-lightning-rain-fill text-warning fs-5"></i>
          <div><strong>Weather Advisory:</strong> Rain forecast on Day 2 afternoon affects Brindavan Gardens.</div>
        </div>
        <button class="tm-btn tm-btn-sm tm-btn-accent" onclick="openWeatherAltModal()">Review Alternative</button>
      `;
    }
  }
}

// Render Day Tabs
function renderDayTabs() {
  const trip = window.TravelMateStore.getActiveTrip();
  const tabsContainer = document.getElementById("ws-day-tabs");
  if (!tabsContainer || !trip.days) return;

  tabsContainer.innerHTML = trip.days.map(d => `
    <button class="tm-day-tab ${d.dayNumber === activeDayNumber ? 'active' : ''}" 
            onclick="switchActiveDay(${d.dayNumber})">
      <i class="bi bi-calendar-event"></i> Day ${d.dayNumber}
    </button>
  `).join("") + `
    <button class="tm-day-tab" onclick="handleAddDay()">
      <i class="bi bi-plus-lg"></i> Add Day
    </button>
  `;
}

// Switch Active Day
function switchActiveDay(dayNumber) {
  activeDayNumber = Number(dayNumber);
  renderDayTabs();
  renderTimelineForDay(activeDayNumber);
  syncMapToCurrentDay();
}

// Render Stops Timeline for Selected Day
function renderTimelineForDay(dayNumber) {
  const trip = window.TravelMateStore.getActiveTrip();
  const targetDay = trip.days.find(d => d.dayNumber === dayNumber) || trip.days[0];
  if (!targetDay) return;

  // Update Day Header and Summary
  const dayTitleEl = document.getElementById("ws-day-title");
  const daySummaryEl = document.getElementById("ws-day-summary");
  if (dayTitleEl) dayTitleEl.textContent = `Day ${targetDay.dayNumber}: ${targetDay.title || "Exploration"}`;
  if (daySummaryEl) daySummaryEl.textContent = targetDay.summary;

  // Render Day Weather Card (Phase 7 Integration)
  renderDayWeatherCard(targetDay);

  const timelineContainer = document.getElementById("ws-timeline-container");
  if (!timelineContainer) return;

  if (!targetDay.stops || targetDay.stops.length === 0) {
    timelineContainer.innerHTML = `
      <div class="p-4 text-center bg-white rounded-3 border">
        <i class="bi bi-geo text-muted fs-1 mb-2"></i>
        <h6 class="fw-bold">No stops scheduled for this day</h6>
        <p class="small text-muted mb-3">Add attractions, restaurants, or cultural landmarks to begin planning.</p>
        <button class="tm-btn tm-btn-primary tm-btn-sm" onclick="openAddStopModal()">
          <i class="bi bi-plus-circle"></i> Add First Stop
        </button>
      </div>
    `;
    return;
  }

  timelineContainer.innerHTML = targetDay.stops.map((stop, index) => {
    const transitHtml = stop.transitToNext ? `
      <div class="tm-travel-connector">
        <i class="bi ${escapeHtml(stop.transitToNext.icon || 'bi-car-front')} text-dark"></i>
        <span><strong>${escapeHtml(stop.transitToNext.mode)}:</strong> ${escapeHtml(stop.transitToNext.duration)} (${escapeHtml(stop.transitToNext.distance)}) • Est. ₹${stop.transitToNext.cost}</span>
      </div>
    ` : '';

    const weatherAlertBadge = stop.isWeatherImpacted ? `
      <span class="badge bg-warning-subtle text-warning-emphasis border border-warning" onclick="openWeatherAltModal(); event.stopPropagation();">
        <i class="bi bi-cloud-rain"></i> Rain Risk — Alternative Proposed
      </span>
    ` : '';

    const weatherReplacedBadge = stop.isWeatherReplaced ? `
      <span class="badge bg-success-subtle text-success-emphasis border border-success">
        <i class="bi bi-shield-check"></i> Weather-Optimized Indoor Alternative
      </span>
    ` : '';

    return `
      <div class="tm-stop-card" id="card-${escapeHtml(stop.id)}" onclick="handleStopCardClick('${escapeHtml(stop.id)}', ${Number(stop.lat) || 0}, ${Number(stop.lng) || 0})">
        <div class="tm-stop-node">${index + 1}</div>

        <div class="d-flex justify-content-between align-items-start gap-3">
          <div class="d-flex gap-3 flex-grow-1">
            <img src="${escapeHtml(stop.image || 'https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=300&q=80')}" 
                 alt="${escapeHtml(stop.name)}" 
                 class="rounded-3 object-fit-cover shadow-sm" 
                 style="width: 80px; height: 80px;"
                 onerror="this.src='https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=300&q=80'">

            <div>
              <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                <span class="badge bg-secondary-subtle text-dark"><i class="bi bi-clock"></i> ${escapeHtml(stop.time)}</span>
                <span class="tm-badge tm-badge-primary"><i class="bi ${escapeHtml(stop.categoryIcon || 'bi-geo-alt')}"></i> ${escapeHtml(stop.category)}</span>
                ${weatherAlertBadge}
                ${weatherReplacedBadge}
              </div>

              <h6 class="fw-bold mb-1 text-dark">${escapeHtml(stop.name)}</h6>
              <div class="small text-muted mb-2">
                <i class="bi bi-hourglass-split"></i> Duration: ${escapeHtml(stop.duration)} &bull; 
                <i class="bi bi-cash"></i> Est. Cost: ₹${Number(stop.cost || 0).toLocaleString()}
              </div>
              <p class="small text-secondary m-0" style="line-height:1.4">${escapeHtml(stop.notes)}</p>
              ${placeDetailsHtml(stop)}
            </div>
          </div>

          <div class="dropdown" onclick="event.stopPropagation()">
            <button class="btn btn-sm btn-light border-0" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
              <li><button class="dropdown-item small" onclick="openEditStopModal('${escapeHtml(stop.id)}')"><i class="bi bi-pencil me-2"></i> Edit Stop</button></li>
              <li><button class="dropdown-item small text-danger" onclick="confirmDeleteStop('${escapeHtml(stop.id)}')"><i class="bi bi-trash3 me-2"></i> Remove Stop</button></li>
            </ul>
          </div>
        </div>
      </div>
      ${transitHtml}
    `;
  }).join("");
}

/**
 * Render Day-Level Meteorological Summary & Severe Warnings
 */
function renderDayWeatherCard(targetDay) {
  const container = document.getElementById("ws-day-weather-card");
  if (!container) return;

  const w = targetDay.weather;
  if (!w) {
    const dateLabel = targetDay.date ? escapeHtml(formatDate(targetDay.date)) : `Day ${targetDay.dayNumber}`;
    container.innerHTML = `
      <div class="p-3 bg-white rounded-3 border d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-3">
        <div class="small text-muted d-flex align-items-start gap-2 flex-grow-1" style="min-width:0">
          <i class="bi bi-cloud-sun text-primary fs-5 flex-shrink-0"></i>
          <span>Forecast data is not available for ${dateLabel}. The provider offers forecasts up to 16 days ahead; dates beyond its available window are shown as unavailable.</span>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary text-nowrap flex-shrink-0" onclick="fetchDayWeather(${targetDay.dayNumber})">
          <i class="bi bi-cloud-arrow-down"></i> Check Forecast
        </button>
      </div>
    `;
    return;
  }

  const isAlert = !!w.alert;
  const maxTemp = w.tempMax != null ? `${Math.round(w.tempMax)}°C` : "--";
  const minTemp = w.tempMin != null ? `${Math.round(w.tempMin)}°C` : "--";
  const rainProb = w.precipitationProbability != null ? `${w.precipitationProbability}%` : "0%";
  const precipSum = w.precipitationSum != null && w.precipitationSum > 0 ? `${w.precipitationSum.toFixed(1)} mm` : "";

  container.innerHTML = `
    <div class="card tm-card border-0 shadow-sm p-3 mb-3 bg-white">
      <div class="ws-weather-summary">
        <div class="ws-weather-main">
          <div class="fs-2 flex-shrink-0 ${isAlert ? 'text-warning' : 'text-primary'}">
            <i class="bi ${escapeHtml(w.icon || 'bi-cloud-sun')}"></i>
          </div>
          <div class="ws-weather-copy">
            <div class="ws-weather-badges">
              <strong class="text-dark">${escapeHtml(w.condition || 'Clear')}</strong>
              <span class="badge ${isAlert ? 'bg-warning text-dark' : 'bg-light text-secondary border'} small">
                <i class="bi bi-droplet"></i> Rain: ${escapeHtml(rainProb)}
              </span>
              ${precipSum ? `<span class="badge bg-light text-primary border small">${escapeHtml(precipSum)}</span>` : ''}
              ${isAlert ? '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle-fill"></i> Weather Impacted</span>' : ''}
            </div>
            <small class="text-muted d-block mt-1">
              High: ${maxTemp} · Low: ${minTemp}${w.windSpeedMax != null ? ` · Wind: ${w.windSpeedMax.toFixed(0)} km/h` : ''}${w.uvIndexMax != null ? ` · UV: ${w.uvIndexMax.toFixed(1)}` : ''}
            </small>
          </div>
        </div>
        <a href="weather.html" class="tm-btn tm-btn-sm tm-btn-outline ws-weather-action">
          <i class="bi bi-cloud-sun"></i> Weather Advisory
        </a>
      </div>
      ${isAlert ? `
        <div class="alert alert-warning py-2 px-3 mt-2 mb-0 small d-flex align-items-center gap-2 border-warning">
          <i class="bi bi-cloud-lightning-rain-fill text-warning fs-5"></i>
          <div><strong>Rain & Inclement Weather Expected on Day ${targetDay.dayNumber}:</strong> Outdoor stops are flagged with caution badges below. Consider scheduling indoor museums or galleries.</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Fetch and attach weather to an itinerary day on demand
 */
async function fetchDayWeather(dayNumber) {
  const trip = window.TravelMateStore.getActiveTrip();
  const targetDay = trip.days.find(d => d.dayNumber === dayNumber);
  if (!targetDay) return;

  const [lat, lng] = tripCenter();
  if (typeof showToast === "function") {
    showToast(`Fetching live weather for Day ${dayNumber}...`, "primary", "bi-cloud-arrow-down");
  }

  try {
    const data = await window.TravelMateStore.getWeatherForecast(lat, lng, 16);
    if (data && data.daily && data.daily.length > 0) {
      // Match by exact calendar date string if present
      let matched = null;
      if (targetDay.date) {
        matched = data.daily.find(d => d.date === targetDay.date);
      }
      // Index-based fallback permitted ONLY if itinerary day has no calendar date (undated demo)
      if (!matched && !targetDay.date) {
        const idx = Math.min(dayNumber - 1, data.daily.length - 1);
        matched = data.daily[idx];
      }

      if (matched) {
        targetDay.weather = matched;
        // If rainy, flag outdoor stops
        if (matched.alert || (matched.precipitationProbability != null && matched.precipitationProbability >= 60)) {
          const outdoorKeywords = ["outdoor", "garden", "nature", "park", "beach", "walking", "fountain"];
          targetDay.stops.forEach(s => {
            const cat = (s.category || "").toLowerCase();
            const name = (s.name || "").toLowerCase();
            if (outdoorKeywords.some(k => cat.includes(k) || name.includes(k))) {
              s.isWeatherImpacted = true;
            }
          });
        }
        window.TravelMateStore.saveActiveTrip(trip);
        renderTimelineForDay(dayNumber);
        if (typeof showToast === "function") {
          showToast(`Weather updated for Day ${dayNumber}: ${matched.condition}`, "success", "bi-check-circle");
        }
      } else {
        // Clear any stale weather association for dated days outside the forecast window
        targetDay.weather = null;
        targetDay.stops.forEach(s => {
          if (!s.isWeatherReplaced) {
            delete s.isWeatherImpacted;
          }
        });
        window.TravelMateStore.saveActiveTrip(trip);
        renderTimelineForDay(dayNumber);
        if (typeof showToast === "function") {
          const dateLabel = targetDay.date ? formatDate(targetDay.date) : `Day ${dayNumber}`;
          showToast(`Forecast unavailable for ${dateLabel} (outside the provider's available 16-day forecast window)`, "info", "bi-calendar-x");
        }
      }
    }
  } catch (err) {
    if (typeof showToast === "function") {
      showToast(`Weather check failed: ${err.message}`, "warning", "bi-cloud-slash");
    }
  }
}

// Map initialization: Google Maps when the server has a key, else Leaflet + OpenStreetMap
function initWorkspaceMap() {
  if (!document.getElementById("ws-map-container")) return;
  document.addEventListener("tm:map-ready", () => {
    const google = window.TMMap.getProvider() === "google";
    const credit = document.getElementById("ws-map-credit");
    if (credit) credit.textContent = google ? "Places and map by Google Maps." : "Data © OpenStreetMap contributors.";
    // Keep the legend clear of the Google logo in the map's bottom-left corner
    const legend = document.getElementById("ws-map-legend");
    if (legend) legend.style.marginBottom = google ? "34px" : "";
    syncMapToCurrentDay();
  });
  window.TMMap.init("ws-map-container", tripCenter(), 13);
}

// Synchronize Map Markers & Route Line for Active Day
function syncMapToCurrentDay() {
  if (!window.TMMap.isReady()) return;

  const trip = window.TravelMateStore.getActiveTrip();
  const targetDay = trip.days.find(d => d.dayNumber === activeDayNumber) || trip.days[0];
  const stops = (targetDay && targetDay.stops) || [];

  const items = stops.map((stop, index) => ({
    id: stop.id,
    lat: stop.lat,
    lng: stop.lng,
    label: index + 1,
    html: `
      <div style="min-width: 180px;">
        <h6 style="margin: 0 0 4px; font-weight: bold; font-size: 14px;">${escapeHtml(stop.name)}</h6>
        <div style="font-size: 12px; color: #64748B; margin-bottom: 6px;">
          <i class="bi bi-clock"></i> ${escapeHtml(stop.time)} &bull; ${escapeHtml(stop.category)}
        </div>
        <p style="font-size: 11px; margin: 0 0 6px; line-height: 1.3;">${escapeHtml(stop.notes)}</p>
        <div style="font-size: 12px; display: flex; gap: 10px; flex-wrap: wrap;">
          <a href="${escapeHtml(googleMapsPlaceUrl(stop, trip.destination))}" target="_blank" rel="noopener"><i class="bi bi-google"></i> Open in Google Maps</a>
          <a href="${escapeHtml(googleMapsDirectionsUrl(stop, trip.destination))}" target="_blank" rel="noopener"><i class="bi bi-sign-turn-right"></i> Directions</a>
        </div>
      </div>`
  }));

  // Pin click -> highlight the timeline card
  window.TMMap.showStops(items, highlightStopCard);
}

// Open the active day's whole route in Google Maps (the Google Maps app, on a phone)
function openDayInGoogleMaps() {
  const trip = window.TravelMateStore.getActiveTrip();
  const targetDay = trip.days.find(d => d.dayNumber === activeDayNumber) || trip.days[0];
  const url = googleMapsRouteUrl(targetDay ? targetDay.stops : [], trip.destination);
  if (!url) {
    showToast("Add a stop to this day first", "warning", "bi-geo");
    return;
  }
  window.open(url, "_blank", "noopener");
}

// Timeline Card Click -> Pan Map & Highlight
function handleStopCardClick(stopId, lat, lng) {
  highlightStopCard(stopId);

  if (window.TMMap.isReady() && lat && lng) {
    window.TMMap.flyTo([lat, lng], 15);
    window.TMMap.openStopPopup(stopId);
  }
}

function highlightStopCard(stopId) {
  document.querySelectorAll(".tm-stop-card").forEach(c => c.classList.remove("highlighted"));
  const card = document.getElementById(`card-${stopId}`);
  if (card) {
    card.classList.add("highlighted");
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Add / Edit Stop Modal Handlers (one modal serves both; #edit-stop-id is set when editing)
const CATEGORY_ICONS = { Food: "bi-cup-hot", Heritage: "bi-bank", Nature: "bi-tree", Shopping: "bi-bag", Culture: "bi-palette" };

function showStopModal(mode) {
  const editing = mode === "edit";
  document.getElementById("stop-modal-title").innerHTML = editing
    ? '<i class="bi bi-pencil-square text-primary"></i> Edit Stop'
    : '<i class="bi bi-geo-alt-fill text-primary"></i> Add Stop to Itinerary';
  document.getElementById("stop-modal-submit").textContent = editing ? "Save Changes" : "Add Stop to Timeline";
  bootstrap.Modal.getOrCreateInstance(document.getElementById("addStopModal")).show();
}

function openAddStopModal() {
  if (!document.getElementById("addStopModal")) return;
  document.getElementById("add-stop-form").reset();
  document.getElementById("edit-stop-id").value = "";
  showStopModal("add");
}

function openEditStopModal(stopId) {
  const trip = window.TravelMateStore.getActiveTrip();
  const day = trip.days.find(d => d.dayNumber === activeDayNumber);
  const stop = day && day.stops.find(s => s.id === stopId);
  if (!stop) return;

  document.getElementById("edit-stop-id").value = stop.id;
  document.getElementById("new-stop-name").value = stop.name || "";
  const categorySelect = document.getElementById("new-stop-category");
  if (![...categorySelect.options].some(o => o.value === stop.category)) {
    categorySelect.add(new Option(stop.category, stop.category));
  }
  categorySelect.value = stop.category;
  document.getElementById("new-stop-time").value = stop.time || "";
  document.getElementById("new-stop-duration").value = stop.duration || "";
  document.getElementById("new-stop-cost").value = stop.cost || 0;
  document.getElementById("new-stop-notes").value = stop.notes || "";
  showStopModal("edit");
}

function handleSaveNewStop(event) {
  event.preventDefault();
  const editId = document.getElementById("edit-stop-id").value;
  const name = document.getElementById("new-stop-name").value.trim();
  const category = document.getElementById("new-stop-category").value;
  const fields = {
    name: name,
    category: category,
    categoryIcon: CATEGORY_ICONS[category] || "bi-geo-alt",
    time: document.getElementById("new-stop-time").value.trim(),
    duration: document.getElementById("new-stop-duration").value.trim(),
    cost: Number(document.getElementById("new-stop-cost").value || 0),
    notes: document.getElementById("new-stop-notes").value.trim()
  };

  if (editId) {
    const original = window.TravelMateStore.getActiveTrip().days
      .find(d => d.dayNumber === activeDayNumber).stops.find(s => s.id === editId);
    // Keep the original icon for categories outside the dropdown (e.g. "Gardens")
    if (original && original.category === category) fields.categoryIcon = original.categoryIcon;
    window.TravelMateStore.updateStop(activeDayNumber, { id: editId, ...fields });
  } else {
    // Place the new pin near the trip's destination
    const [lat, lng] = tripCenter();
    window.TravelMateStore.addStopToDay(activeDayNumber, {
      id: "stop-" + Date.now(),
      ...fields,
      lat: lat + (Math.random() - 0.5) * 0.04,
      lng: lng + (Math.random() - 0.5) * 0.04,
      image: (findDestination(window.TravelMateStore.getActiveTrip().destination) || {}).image ||
        "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=600&q=80"
    });
  }

  renderTimelineForDay(activeDayNumber);
  syncMapToCurrentDay();

  bootstrap.Modal.getInstance(document.getElementById("addStopModal")).hide();
  document.getElementById("add-stop-form").reset();
  document.getElementById("edit-stop-id").value = "";
  showToast(editId ? `Updated "${name}"` : `Added "${name}" to Day ${activeDayNumber}`, "success", "bi-check-circle-fill");
}

// Delete Stop with Confirmation
function confirmDeleteStop(stopId) {
  if (confirm("Are you sure you want to remove this stop from your itinerary?")) {
    window.TravelMateStore.deleteStop(activeDayNumber, stopId);
    renderTimelineForDay(activeDayNumber);
    syncMapToCurrentDay();
    showToast("Stop removed from itinerary", "warning", "bi-trash3");
  }
}

// Route Optimization Simulation
function handleOptimizeRoute() {
  showToast("Optimizing geographical routing for minimum travel time...", "accent", "bi-lightning-charge-fill");
  setTimeout(() => {
    window.TravelMateStore.optimizeDayRoute(activeDayNumber);
    renderTimelineForDay(activeDayNumber);
    syncMapToCurrentDay();
    showToast(`Day ${activeDayNumber} stops reordered by shortest path between them.`, "success", "bi-check-all");
  }, 600);
}

// Add Day
function handleAddDay() {
  const trip = window.TravelMateStore.getActiveTrip();
  const nextDayNum = trip.days.length + 1;
  trip.days.push({
    dayNumber: nextDayNum,
    title: `Day ${nextDayNum} Exploration`,
    summary: "0 stops • Plan open",
    stops: []
  });
  trip.daysCount = trip.days.length;
  if (trip.startDate) {
    const end = new Date(trip.startDate + "T00:00:00");
    end.setDate(end.getDate() + trip.daysCount - 1);
    trip.endDate = toIsoDate(end);
  }
  window.TravelMateStore.saveActiveTrip(trip);
  renderTripHeader();
  switchActiveDay(nextDayNum);
  showToast(`Day ${nextDayNum} added to your trip!`, "primary", "bi-plus-circle");
}

// Weather Alternative Modal Handlers
function openWeatherAltModal() {
  const modalEl = document.getElementById("weatherAltModal");
  if (!modalEl) return;
  const isAccepted = window.TravelMateStore.isWeatherAltAccepted();

  const altData = TRAVELMATE_DATA.weather.alternativeProposal;
  document.getElementById("alt-original-name").textContent = altData.originalStop.name;
  document.getElementById("alt-original-cat").textContent = altData.originalStop.category;
  document.getElementById("alt-recommended-name").textContent = altData.recommendedStop.name;
  document.getElementById("alt-recommended-cat").textContent = altData.recommendedStop.category;
  document.getElementById("alt-reason").textContent = altData.reason;
  document.getElementById("alt-impact").textContent = `${altData.scheduleImpact} • ${altData.costImpact}`;

  const acceptBtn = document.getElementById("alt-accept-btn");
  if (isAccepted) {
    acceptBtn.textContent = "Revert to Outdoor Original";
    acceptBtn.className = "tm-btn tm-btn-outline";
  } else {
    acceptBtn.textContent = "Accept Smart Alternative";
    acceptBtn.className = "tm-btn tm-btn-accent";
  }

  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();
}

function handleToggleWeatherAlt() {
  const isAccepted = window.TravelMateStore.isWeatherAltAccepted();
  window.TravelMateStore.applyWeatherAlternative(!isAccepted);
  renderTripHeader();
  renderTimelineForDay(activeDayNumber);
  syncMapToCurrentDay();

  bootstrap.Modal.getInstance(document.getElementById("weatherAltModal")).hide();
  if (!isAccepted) {
    showToast("Smart Alternative Accepted: Indoor Rail Museum added!", "success", "bi-check-circle-fill");
  } else {
    showToast("Reverted to outdoor Brindavan Gardens", "primary", "bi-arrow-counterclockwise");
  }
}

// Mobile Switcher Setup
function setupMobileSwitcher() {
  const btnItinerary = document.getElementById("mob-switch-itinerary");
  const btnMap = document.getElementById("mob-switch-map");

  if (btnItinerary && btnMap) {
    btnItinerary.addEventListener("click", () => {
      btnItinerary.classList.add("active");
      btnMap.classList.remove("active");
      document.body.classList.remove("view-map-active");
    });

    btnMap.addEventListener("click", () => {
      btnMap.classList.add("active");
      btnItinerary.classList.remove("active");
      document.body.classList.add("view-map-active");
      setTimeout(() => window.TMMap.resize(), 200);
    });
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  // Parse as local midnight; new Date("YYYY-MM-DD") is UTC and can show the previous day
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Shared links (Share & Export) look like workspace.html?tripId=...: open that trip, which lives in the
 * common database. places.js waits for this before it starts the automatic AI plan.
 */
window.workspaceTripReady = (async () => {
  const store = window.TravelMateStore;
  const wanted = new URLSearchParams(location.search).get("tripId");
  await store.ready;
  if (!wanted || !store.isOnline() || wanted === store.getActiveTripId()) return;
  try {
    await store.setActiveTrip(wanted);
    activeDayNumber = 1;
    renderTripHeader();
    renderDayTabs();
    renderTimelineForDay(activeDayNumber);
    window.TMMap.setView(tripCenter(), 13);
    syncMapToCurrentDay();
  } catch (err) {
    showToast(`Could not open that trip: ${err.message}`, "danger", "bi-exclamation-octagon");
  }
})();

window.switchActiveDay = switchActiveDay;
window.handleStopCardClick = handleStopCardClick;
window.openAddStopModal = openAddStopModal;
window.openEditStopModal = openEditStopModal;
window.handleSaveNewStop = handleSaveNewStop;
window.confirmDeleteStop = confirmDeleteStop;
window.handleOptimizeRoute = handleOptimizeRoute;
window.openDayInGoogleMaps = openDayInGoogleMaps;
window.handleAddDay = handleAddDay;
window.openWeatherAltModal = openWeatherAltModal;
window.handleToggleWeatherAlt = handleToggleWeatherAlt;
window.fetchDayWeather = fetchDayWeather;

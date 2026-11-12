/**
 * TRAVELMATE — REAL PLACES FROM THE MAP + AI TOUR PLAN (workspace.html)
 *
 * - Search places or click the map: details come from Google Maps (OpenStreetMap when the server has
 *   no Google key) via /api/places/*
 * - "Add to Day N" saves the place (name, coordinates, address, hours, website) as a stop in the database
 * - The AI tour plan runs automatically when a trip is opened (new or already saved): the trip's stops are
 *   sent to /api/ai/tour-plan and the timed plan it returns is saved. Once saved the trip is marked
 *   aiPlanned, so it is not re-planned (and the person's edits are not overwritten) on every visit.
 *
 * Uses window.TMMap (map-provider.js) and globals from workspace.js: activeDayNumber, tripCenter(),
 * renderTimelineForDay(), syncMapToCurrentDay(), renderDayTabs().
 */

let lastPlaceResults = [];

window.TMMap.onClick((point) => handleMapClick(point));

/** Which map a stop's place link came from: a Google place id or an OpenStreetMap object. */
function mapSourceName(placeRef) {
  return String(placeRef || "").startsWith("google:") ? "Google Maps" : "OpenStreetMap";
}

/** Small details line under a stop card: address, opening hours, website. */
function placeDetailsHtml(stop) {
  const bits = [];
  if (stop.address) bits.push(`<span title="Address"><i class="bi bi-geo-alt"></i> ${escapeHtml(stop.address)}</span>`);
  if (stop.openingHours) bits.push(`<span title="Opening hours"><i class="bi bi-clock-history"></i> ${escapeHtml(stop.openingHours)}</span>`);
  if (stop.website && /^https?:\/\//i.test(stop.website)) {
    bits.push(`<a href="${escapeHtml(stop.website)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="bi bi-box-arrow-up-right"></i> Website</a>`);
  }
  if (stop.placeRef) bits.push(`<span class="text-success" title="Matched to a real ${mapSourceName(stop.placeRef)} place"><i class="bi bi-patch-check"></i> Verified on ${mapSourceName(stop.placeRef)}</span>`);
  if (stop.name) {
    const destination = window.TravelMateStore.getActiveTrip().destination;
    bits.push(`<a href="${escapeHtml(googleMapsPlaceUrl(stop, destination))}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Opens the Google Maps app on a phone"><i class="bi bi-google"></i> Open in Google Maps</a>`);
    bits.push(`<a href="${escapeHtml(googleMapsDirectionsUrl(stop, destination))}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Navigate here from your current location"><i class="bi bi-sign-turn-right"></i> Directions</a>`);
  }
  return bits.length ? `<div class="d-flex flex-wrap gap-2 mt-2 text-muted" style="font-size:0.75rem">${bits.join("")}</div>` : "";
}

// ------------------------------------------------------------------ search & click

async function handleMapSearch(event) {
  event.preventDefault();
  const q = document.getElementById("ws-place-search").value.trim();
  const box = document.getElementById("ws-place-results");
  if (!q) return;
  if (!window.TravelMateStore.isOnline()) {
    showToast("Place search needs the TravelMate server to be running", "warning", "bi-cloud-slash");
    return;
  }
  box.classList.remove("d-none");
  box.innerHTML = `<div class="p-2 text-muted"><span class="spinner-border spinner-border-sm"></span> Searching ${window.TMMap.providerName()}…</div>`;
  const [lat, lng] = tripCenter();
  try {
    const { places } = await window.TravelMateStore.request("GET",
      `/places/search?q=${encodeURIComponent(q)}&lat=${lat}&lng=${lng}`);
    lastPlaceResults = places;
    box.innerHTML = places.length
      ? places.map((p, i) => `
          <button type="button" class="list-group-item list-group-item-action border-0 border-bottom px-2 py-2 w-100 text-start bg-white" onclick="previewPlace(lastPlaceResults[${i}])">
            <div class="fw-semibold text-dark"><i class="bi ${escapeHtml(p.categoryIcon)}"></i> ${escapeHtml(p.name)}</div>
            <div class="text-muted text-truncate" style="font-size:0.75rem">${escapeHtml(p.category)} · ${escapeHtml(p.address)}</div>
          </button>`).join("")
      : `<div class="p-2 text-muted">No places found for "${escapeHtml(q)}".</div>`;
  } catch (err) {
    box.innerHTML = `<div class="p-2 text-danger">${escapeHtml(err.message)}</div>`;
  }
}

async function handleMapClick(latlng) {
  if (!window.TravelMateStore.isOnline()) return;
  showPlacePopup(latlng, `<div class="small text-muted"><span class="spinner-border spinner-border-sm"></span> Looking up this spot…</div>`);
  try {
    const placeId = latlng.placeId ? `&placeId=${encodeURIComponent(latlng.placeId)}` : "";
    const place = await window.TravelMateStore.request("GET", `/places/reverse?lat=${latlng.lat}&lng=${latlng.lng}${placeId}`);
    previewPlace(place, false);
  } catch (err) {
    showPlacePopup(latlng, `<div class="small text-danger">${escapeHtml(err.message)}</div>`);
  }
}

/** Show a place on the map with its details and an "Add to Day" button. */
function previewPlace(place, fly = true) {
  window._previewPlace = place;
  const trip = window.TravelMateStore.getActiveTrip();
  const dayOptions = trip.days.map(d =>
    `<option value="${d.dayNumber}" ${d.dayNumber === activeDayNumber ? "selected" : ""}>Day ${d.dayNumber}</option>`).join("");
  const website = place.website && /^https?:\/\//i.test(place.website)
    ? `<div><i class="bi bi-globe"></i> <a href="${escapeHtml(place.website)}" target="_blank" rel="noopener">${escapeHtml(place.website.replace(/^https?:\/\//, "").slice(0, 40))}</a></div>` : "";
  const mapsUrl = place.mapsUrl && /^https:\/\//i.test(place.mapsUrl)
    ? place.mapsUrl : googleMapsPlaceUrl(place, trip.destination);
  const html = `
    <div style="min-width: 220px; max-width: 260px;">
      <div class="fw-bold" style="font-size:14px">${escapeHtml(place.name)}</div>
      <div class="text-muted mb-1" style="font-size:12px"><i class="bi ${escapeHtml(place.categoryIcon)}"></i> ${escapeHtml(place.category)} <span class="opacity-75">(${escapeHtml(place.osmType)})</span></div>
      <div style="font-size:12px" class="mb-1"><i class="bi bi-geo-alt"></i> ${escapeHtml(place.address || "No address on record")}</div>
      ${place.openingHours ? `<div style="font-size:12px"><i class="bi bi-clock-history"></i> ${escapeHtml(place.openingHours)}</div>` : ""}
      ${place.phone ? `<div style="font-size:12px"><i class="bi bi-telephone"></i> ${escapeHtml(place.phone)}</div>` : ""}
      <div style="font-size:12px">${website}</div>
      <div style="font-size:12px"><i class="bi bi-google"></i> <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener">Open in Google Maps</a></div>
      <div class="d-flex gap-1 mt-2">
        <select class="form-select form-select-sm" id="place-add-day" style="width:auto">${dayOptions}</select>
        <button type="button" class="btn btn-sm btn-primary flex-grow-1" onclick="addPreviewedPlace()"><i class="bi bi-plus-lg"></i> Add to trip</button>
      </div>
    </div>`;
  showPlacePopup({ lat: place.lat, lng: place.lng }, html);
  if (fly) window.TMMap.flyTo([place.lat, place.lng], 15);
}

function showPlacePopup(latlng, html) {
  window.TMMap.showPreview(latlng, html);
}

/** Save the previewed map place as a stop on the chosen day (stored in the database). */
function addPreviewedPlace() {
  const place = window._previewPlace;
  if (!place) return;
  const dayNumber = Number(document.getElementById("place-add-day").value);
  const trip = window.TravelMateStore.getActiveTrip();
  const day = trip.days.find(d => d.dayNumber === dayNumber);
  const stop = {
    id: "stop-" + Date.now(),
    name: place.name,
    category: place.category,
    categoryIcon: place.categoryIcon,
    time: nextTimeSlot(day ? day.stops : []),
    duration: place.category === "Food" ? "1.0 hr" : "1.5 hrs",
    cost: 0,
    lat: place.lat,
    lng: place.lng,
    address: place.address,
    placeRef: place.placeRef,
    openingHours: place.openingHours,
    website: place.website,
    phone: place.phone,
    notes: "",
    image: (findDestination(trip.destination) || {}).image ||
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&q=80"
  };
  window.TravelMateStore.addStopToDay(dayNumber, stop);
  window.TMMap.clearPreview();
  document.getElementById("ws-place-results").classList.add("d-none");
  if (dayNumber !== activeDayNumber) switchActiveDay(dayNumber);
  else {
    renderTimelineForDay(activeDayNumber);
    syncMapToCurrentDay();
  }
  showToast(`Added "${place.name}" to Day ${dayNumber}`, "success", "bi-pin-map-fill");
}

/** One hour after the day's last stop, as "hh:mm AM/PM" (10:00 AM for an empty day). */
function nextTimeSlot(stops) {
  const last = stops.length ? stops[stops.length - 1].time : null;
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(last || "");
  if (!m) return stops.length ? "" : "10:00 AM";
  let h = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  h = Math.min(h + Math.ceil(parseFloat(stops[stops.length - 1].duration) || 1), 22);
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

// ------------------------------------------------------------------ AI tour plan (automatic)

let aiPlanRunning = false;

document.addEventListener("DOMContentLoaded", async () => {
  await window.TravelMateStore.ready;
  // A shared link (?tripId=...) switches the active trip first; plan that trip, not the previous one
  if (window.workspaceTripReady) await window.workspaceTripReady;
  autoPlanWithAi();
});

/** Show the AI plan status above the day tabs. state: "running" | "done" | "error". */
function setAiBanner(state, text, onRetry) {
  const box = document.getElementById("ws-ai-banner");
  if (!box) return;
  if (state === "running") {
    box.className = "alert alert-info d-flex align-items-center gap-2 py-2 px-3 mb-3 small";
    box.innerHTML = `<span class="spinner-border spinner-border-sm flex-shrink-0"></span><div>${escapeHtml(text)}</div>`;
  } else if (state === "done") {
    box.className = "alert alert-success d-flex align-items-center gap-2 py-2 px-3 mb-3 small";
    box.innerHTML = `<i class="bi bi-robot fs-5"></i><div>${escapeHtml(text)}</div>`;
    setTimeout(() => { if (!aiPlanRunning) box.className = "d-none"; }, 9000);
  } else {
    box.className = "alert alert-warning d-flex align-items-center gap-2 py-2 px-3 mb-3 small";
    box.innerHTML = `<i class="bi bi-exclamation-triangle-fill fs-5"></i><div class="flex-grow-1">${escapeHtml(text)}</div>
      <button type="button" class="btn btn-sm btn-outline-dark" id="ws-ai-retry">Try again</button>`;
    document.getElementById("ws-ai-retry").addEventListener("click", onRetry);
  }
}

/** Stops can't be edited while the AI is writing the plan (its result replaces the days). */
function setWorkspaceBusy(busy) {
  ["ws-timeline-container", "ws-day-toolbar"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("tm-ai-busy", busy);
  });
}

/**
 * Ask the AI model to plan the whole active trip: it orders the stops, adds times, durations,
 * tips and transit, and suggests extra places and meals. Runs by itself for every trip that has
 * not been AI-planned yet (new trips and trips saved earlier). Does nothing when AI is not set up.
 */
async function autoPlanWithAi() {
  const store = window.TravelMateStore;
  if (aiPlanRunning || !store.isOnline()) return;
  const trip = store.getActiveTrip();
  if (!trip || trip.aiPlanned || !trip.days || trip.days.length === 0) return;

  let status;
  try {
    status = await store.request("GET", "/ai/status");
  } catch (err) {
    return;
  }
  if (!status.enabled) return;

  aiPlanRunning = true;
  setWorkspaceBusy(true);
  setAiBanner("running", `AI (${status.model}) is planning your trip: ordering stops, adding times and tips, ` +
    `and suggesting places. This can take up to a minute…`);

  const catalog = findDestination(trip.destination);
  const firstStop = trip.days.flatMap(d => d.stops).find(s => s.lat && s.lng);
  try {
    const result = await store.request("POST", "/ai/tour-plan", {
      destination: trip.destination,
      startDate: trip.startDate,
      travelers: trip.travelers,
      budget: trip.budgetTotal,
      interests: trip.interests,
      pace: "Balanced",
      mode: "fill",
      center: catalog ? catalog.coordinates : (firstStop ? [firstStop.lat, firstStop.lng] : null),
      plan: trip.days.slice(0, 14) // the server plans up to 14 days at a time
    });

    // Replace the planned days with the AI's version and save to the database
    const fresh = store.getActiveTrip();
    if (fresh.id !== trip.id) {
      document.getElementById("ws-ai-banner").className = "d-none";
      return;
    }
    result.days.forEach(day => {
      const idx = fresh.days.findIndex(d => d.dayNumber === day.dayNumber);
      if (idx !== -1) fresh.days[idx] = { ...fresh.days[idx], title: day.title, summary: day.summary, stops: day.stops };
    });
    fresh.aiPlanned = true;
    store.saveActiveTrip(fresh);
    await store.flush();

    renderTripHeader();
    renderDayTabs();
    renderTimelineForDay(activeDayNumber);
    syncMapToCurrentDay();
    const stops = result.days.reduce((n, d) => n + d.stops.length, 0);
    aiPlanRunning = false;
    setAiBanner("done", `AI plan ready: ${stops} stops (${result.added} suggested, ${result.placesVerified} verified on the map) ` +
      `in ${(result.elapsedMs / 1000).toFixed(0)}s.`);
  } catch (err) {
    aiPlanRunning = false;
    setAiBanner("error", `The AI plan could not be created: ${err.message}`, autoPlanWithAi);
  } finally {
    aiPlanRunning = false;
    setWorkspaceBusy(false);
  }
}

window.handleMapSearch = handleMapSearch;
window.previewPlace = previewPlace;
window.addPreviewedPlace = addPreviewedPlace;
window.autoPlanWithAi = autoPlanWithAi;
window.placeDetailsHtml = placeDetailsHtml;

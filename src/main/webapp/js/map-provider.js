/**
 * TRAVELMATE — MAP PROVIDER (workspace.html)
 *
 * One small API (window.TMMap) over two maps:
 *   - Google Maps, when the server has TM_GOOGLE_MAPS_KEY configured (GET /api/places/config)
 *   - Leaflet + OpenStreetMap otherwise, or when Google Maps fails to load / rejects the key
 *
 * Also builds the "Open in Google Maps" links. Those are Google's universal Maps URLs: on a phone
 * they open the Google Maps app (with turn-by-turn navigation), on a computer the website.
 */
(function () {
  const ROUTE_COLOR = "#E76F51";
  let provider = null;        // "google" | "leaflet"
  let map = null;
  let containerId = null;
  let clickHandler = null;
  let lastView = null;        // { center:[lat,lng], zoom }
  let lastStops = { items: [], onClick: null };
  let stopMarkers = [];       // [{ id, marker, html }]
  let routeLine = null;
  let previewMarker = null;
  let stopInfo = null;        // Google InfoWindow shared by the stop markers
  let previewInfo = null;     // Google InfoWindow of the previewed place
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });

  const primaryColor = () =>
    getComputedStyle(document.documentElement).getPropertyValue("--tm-primary").trim() || "#0F766E";

  // ------------------------------------------------------------------ setup

  async function init(id, center, zoom) {
    if (map && containerId === id) {
      setView(center, zoom);
      return;
    }
    if (map) {
      teardown();
    }
    containerId = id;
    lastView = { center, zoom };
    const el = document.getElementById(id);
    if (!el) return;
    if (el._leaflet_id) {
      try { delete el._leaflet_id; } catch (e) { el._leaflet_id = undefined; }
      el.innerHTML = "";
    }

    let key = null;
    try {
      const store = window.TravelMateStore;
      await store.ready;
      if (store.isOnline()) {
        const cfg = await store.request("GET", "/places/config");
        if (cfg.provider === "google" && cfg.mapsKey) key = cfg.mapsKey;
      }
    } catch (err) {
      key = null;
    }

    if (key) {
      try {
        await loadGoogleScript(key);
        startGoogle();
      } catch (err) {
        console.warn("[TravelMate] Google Maps could not be loaded — using OpenStreetMap.", err.message);
        startLeaflet();
      }
    } else {
      startLeaflet();
    }
    resolveReady(provider);
    document.dispatchEvent(new CustomEvent("tm:map-ready", { detail: { provider } }));
  }

  function loadGoogleScript(key) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.Map) return resolve();
      const timer = setTimeout(() => reject(new Error("timed out")), 12000);
      window.__tmGoogleMapsReady = () => { clearTimeout(timer); resolve(); };
      // Google calls this when the key is invalid, not enabled for Maps JavaScript API, or blocked
      window.gm_authFailure = () => {
        console.warn("[TravelMate] Google Maps rejected the API key — using OpenStreetMap.");
        if (provider === "google") {
          teardown();
          startLeaflet();
          showStops(lastStops.items, lastStops.onClick);
          document.dispatchEvent(new CustomEvent("tm:map-ready", { detail: { provider } }));
        }
      };
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) +
        "&v=weekly&loading=async&callback=__tmGoogleMapsReady";
      s.async = true;
      s.onerror = () => { clearTimeout(timer); reject(new Error("script blocked or offline")); };
      document.head.appendChild(s);
    });
  }

  function startGoogle() {
    provider = "google";
    map = new google.maps.Map(document.getElementById(containerId), {
      center: { lat: lastView.center[0], lng: lastView.center[1] },
      zoom: lastView.zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy",
      clickableIcons: true
    });
    stopInfo = new google.maps.InfoWindow({ maxWidth: 280 });
    previewInfo = new google.maps.InfoWindow({ maxWidth: 300 });
    map.addListener("click", (e) => {
      if (e.placeId) e.stop(); // we show our own card instead of Google's default one
      if (clickHandler) clickHandler({ lat: e.latLng.lat(), lng: e.latLng.lng(), placeId: e.placeId || null });
    });
  }

  function startLeaflet() {
    const el = document.getElementById(containerId);
    if (typeof L === "undefined") {
      provider = null;
      el.innerHTML = `
        <div class="p-4 text-center h-100 d-flex flex-column align-items-center justify-content-center bg-light">
          <i class="bi bi-map text-primary fs-1 mb-2"></i>
          <h5 class="fw-bold">Map unavailable</h5>
          <p class="text-muted small">The map could not be loaded. Check your internet connection and reload.</p>
        </div>`;
      return;
    }
    provider = "leaflet";
    map = L.map(containerId, { zoomControl: true, scrollWheelZoom: true }).setView(lastView.center, lastView.zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.on("click", (e) => {
      if (clickHandler) clickHandler({ lat: e.latlng.lat, lng: e.latlng.lng, placeId: null });
    });
  }

  function teardown() {
    stopMarkers = [];
    routeLine = null;
    previewMarker = null;
    stopInfo = null;
    previewInfo = null;
    if (map) {
      if (provider === "leaflet" && typeof map.remove === "function") {
        try { map.remove(); } catch (e) {}
      }
      map = null;
    }
    provider = null;
    const el = document.getElementById(containerId);
    if (el) {
      if (el._leaflet_id) {
        try { delete el._leaflet_id; } catch (e) { el._leaflet_id = undefined; }
      }
      el.innerHTML = "";
    }
  }

  // ------------------------------------------------------------------ view

  function setView(center, zoom) {
    lastView = { center, zoom };
    if (!map) return;
    if (provider === "google") {
      map.setCenter({ lat: center[0], lng: center[1] });
      map.setZoom(zoom);
    } else {
      map.setView(center, zoom);
    }
  }

  /** Pan to a point, zooming in to at least minZoom. */
  function flyTo(center, minZoom) {
    if (!map) return;
    if (provider === "google") {
      map.panTo({ lat: center[0], lng: center[1] });
      if (map.getZoom() < minZoom) map.setZoom(minZoom);
    } else {
      map.flyTo(center, Math.max(map.getZoom(), minZoom), { duration: 0.7 });
    }
  }

  function resize() {
    if (!map) return;
    if (provider === "google") google.maps.event.trigger(map, "resize");
    else map.invalidateSize();
  }

  // ------------------------------------------------------------------ itinerary stops

  /**
   * Draw the day's stops as numbered pins joined by a dashed line, and fit the map to them.
   * items: [{ id, lat, lng, label, html }]; onClick(id) runs when a pin is clicked.
   */
  function showStops(items, onClick) {
    lastStops = { items: items || [], onClick };
    if (!map) return;

    stopMarkers.forEach(m => provider === "google" ? m.marker.setMap(null) : map.removeLayer(m.marker));
    stopMarkers = [];
    if (routeLine) {
      if (provider === "google") routeLine.setMap(null); else map.removeLayer(routeLine);
      routeLine = null;
    }
    if (stopInfo) stopInfo.close();

    const points = lastStops.items.filter(s => s.lat && s.lng);
    if (!points.length) return;
    const color = primaryColor();

    if (provider === "google") {
      const bounds = new google.maps.LatLngBounds();
      points.forEach(s => {
        const position = { lat: Number(s.lat), lng: Number(s.lng) };
        bounds.extend(position);
        const marker = new google.maps.Marker({
          position, map,
          label: { text: String(s.label), color: "#fff", fontWeight: "700", fontSize: "13px" },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 }
        });
        marker.addListener("click", () => {
          stopInfo.setContent(s.html);
          stopInfo.open({ map, anchor: marker });
          if (onClick) onClick(s.id);
        });
        stopMarkers.push({ id: s.id, marker, html: s.html });
      });
      if (points.length > 1) {
        routeLine = new google.maps.Polyline({
          map,
          path: points.map(s => ({ lat: Number(s.lat), lng: Number(s.lng) })),
          strokeOpacity: 0,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeColor: ROUTE_COLOR, scale: 3 }, offset: "0", repeat: "14px" }]
        });
        map.fitBounds(bounds, 60);
      } else {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
      }
      return;
    }

    const latLngs = [];
    points.forEach(s => {
      const pos = [Number(s.lat), Number(s.lng)];
      latLngs.push(pos);
      const icon = L.divIcon({
        className: "tm-custom-marker",
        html: `<div style="background-color:${color};color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${s.label}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const marker = L.marker(pos, { icon }).addTo(map);
      marker.bindPopup(s.html);
      marker.on("click", () => { if (onClick) onClick(s.id); });
      stopMarkers.push({ id: s.id, marker, html: s.html });
    });
    if (latLngs.length > 1) {
      routeLine = L.polyline(latLngs, { color: ROUTE_COLOR, weight: 4, opacity: 0.85, dashArray: "6, 8" }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    } else {
      map.setView(latLngs[0], 14);
    }
  }

  function openStopPopup(stopId) {
    const m = stopMarkers.find(x => x.id === stopId);
    if (!m || !map) return;
    if (provider === "google") {
      stopInfo.setContent(m.html);
      stopInfo.open({ map, anchor: m.marker });
    } else {
      m.marker.openPopup();
    }
  }

  // ------------------------------------------------------------------ place preview

  /** Show a highlighted point with an info card (search result or clicked spot). */
  function showPreview(point, html) {
    if (!map) return;
    if (provider === "google") {
      const position = { lat: Number(point.lat), lng: Number(point.lng) };
      if (!previewMarker) {
        previewMarker = new google.maps.Marker({
          map, position, zIndex: 999,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#fff", fillOpacity: 1, strokeColor: ROUTE_COLOR, strokeWeight: 3 }
        });
        previewMarker.addListener("click", () => previewInfo.open({ map, anchor: previewMarker }));
      }
      previewMarker.setPosition(position);
      previewInfo.setContent(html);
      previewInfo.open({ map, anchor: previewMarker });
    } else {
      const latlng = L.latLng(point.lat, point.lng);
      if (!previewMarker) {
        previewMarker = L.circleMarker(latlng, { radius: 9, color: ROUTE_COLOR, weight: 3, fillColor: "#fff", fillOpacity: 1, bubblingMouseEvents: false }).addTo(map);
      }
      previewMarker.setLatLng(latlng).bindPopup(html, { maxWidth: 280 }).openPopup();
    }
  }

  function clearPreview() {
    if (!previewMarker || !map) return;
    if (provider === "google") {
      previewInfo.close();
      previewMarker.setMap(null);
    } else {
      map.removeLayer(previewMarker);
    }
    previewMarker = null;
  }

  window.TMMap = {
    init, ready, setView, flyTo, resize, showStops, openStopPopup, showPreview, clearPreview,
    /** cb({ lat, lng, placeId }) — placeId is set when a Google place icon was clicked. */
    onClick: (cb) => { clickHandler = cb; },
    isReady: () => !!map,
    getProvider: () => provider,
    /** "Google Maps" or "OpenStreetMap", for labels. */
    providerName: () => provider === "google" ? "Google Maps" : "OpenStreetMap"
  };

  // ------------------------------------------------------------------ Google Maps links

  const googlePlaceId = (stop) =>
    stop && typeof stop.placeRef === "string" && stop.placeRef.startsWith("google:") ? stop.placeRef.slice(7) : null;

  const placeText = (stop, destination) =>
    [stop.name, destination].filter(Boolean).join(", ").replace(/\|/g, " ");

  /** Link that opens one stop in Google Maps (the app, on a phone). */
  function googleMapsPlaceUrl(stop, destination) {
    const params = new URLSearchParams({ api: "1", query: placeText(stop, destination) });
    const id = googlePlaceId(stop);
    if (id) params.set("query_place_id", id);
    else if (!stop.name && stop.lat && stop.lng) params.set("query", `${stop.lat},${stop.lng}`);
    return "https://www.google.com/maps/search/?" + params.toString();
  }

  /** A stop as a directions endpoint: exact place when known, else verified coordinates, else its name. */
  function routePoint(stop, destination) {
    const id = googlePlaceId(stop);
    if (id) return { text: placeText(stop, destination), id };
    if (stop.placeRef && stop.lat && stop.lng) return { text: `${stop.lat},${stop.lng}`, id: null };
    return { text: placeText(stop, destination), id: null };
  }

  /** Link that starts navigation from the phone's current location to one stop. */
  function googleMapsDirectionsUrl(stop, destination) {
    const p = routePoint(stop, destination);
    const params = new URLSearchParams({ api: "1", destination: p.text, travelmode: "driving" });
    if (p.id) params.set("destination_place_id", p.id);
    return "https://www.google.com/maps/dir/?" + params.toString();
  }

  /** Link that opens a whole day (first stop -> … -> last stop) as one route in Google Maps. */
  function googleMapsRouteUrl(stops, destination) {
    const list = (stops || []).filter(s => s && (s.name || (s.lat && s.lng)));
    if (!list.length) return null;
    if (list.length === 1) return googleMapsDirectionsUrl(list[0], destination);
    const points = list.map(s => routePoint(s, destination));
    const origin = points[0];
    const last = points[points.length - 1];
    const via = points.slice(1, -1).slice(0, 9); // Google Maps accepts up to 9 waypoints
    const params = new URLSearchParams({ api: "1", origin: origin.text, destination: last.text, travelmode: "driving" });
    if (origin.id) params.set("origin_place_id", origin.id);
    if (last.id) params.set("destination_place_id", last.id);
    if (via.length) {
      params.set("waypoints", via.map(p => p.text).join("|"));
      if (via.every(p => p.id)) params.set("waypoint_place_ids", via.map(p => p.id).join("|"));
    }
    return "https://www.google.com/maps/dir/?" + params.toString();
  }

  window.googleMapsPlaceUrl = googleMapsPlaceUrl;
  window.googleMapsDirectionsUrl = googleMapsDirectionsUrl;
  window.googleMapsRouteUrl = googleMapsRouteUrl;
})();

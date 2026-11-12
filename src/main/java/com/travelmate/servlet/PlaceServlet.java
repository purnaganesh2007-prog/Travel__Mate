package com.travelmate.servlet;

import com.travelmate.geo.GeoService;
import com.travelmate.geo.GoogleMapsClient;
import com.travelmate.model.Place;
import com.travelmate.util.JsonUtil;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Real place search, geocoding and reverse geocoding from Google Maps
 * (OpenStreetMap when TM_GOOGLE_MAPS_KEY is not configured).
 *
 * Supported endpoints:
 *   GET /api/places/config
 *   GET /api/places/reverse?placeId=ChIJ..&lat=..&lng=..   (Google place clicked on the map)
 *   GET /api/places/search?q=Mysore+Palace[&lat=..&lng=..][&category=..][&limit=..]
 *   GET /api/places/reverse?lat=..&lng=..
 *   GET /api/places/geocode?q=Chamundi+Hill[&destination=..][&lat=..&lng=..]
 */
@WebServlet("/api/places/*")
public class PlaceServlet extends HttpServlet {

    private final GeoService geoService;

    public PlaceServlet() {
        this(GeoService.getDefault());
    }

    public PlaceServlet(GeoService geoService) {
        this.geoService = geoService != null ? geoService : GeoService.getDefault();
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String[] parts = JsonUtil.pathParts(req);
        String action = parts.length == 1 ? parts[0] : "";
        try {
            switch (action) {
                case "search" -> handleSearch(req, resp);
                case "reverse" -> handleReverse(req, resp);
                case "geocode" -> handleGeocode(req, resp);
                case "config" -> handleConfig(resp);
                default -> JsonUtil.error(resp, 404, "Unknown endpoint");
            }
        } catch (IllegalArgumentException e) {
            JsonUtil.error(resp, 400, e.getMessage());
        } catch (IOException e) {
            String msg = e.getMessage() == null ? "Map search failed" : e.getMessage();
            int status = msg.toLowerCase().contains("rate limit") || msg.toLowerCase().contains("busy") ? 429 : 502;
            JsonUtil.error(resp, status, msg);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        JsonUtil.error(resp, HttpServletResponse.SC_METHOD_NOT_ALLOWED, "Method Not Allowed");
    }

    @Override
    protected void doPut(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        JsonUtil.error(resp, HttpServletResponse.SC_METHOD_NOT_ALLOWED, "Method Not Allowed");
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        JsonUtil.error(resp, HttpServletResponse.SC_METHOD_NOT_ALLOWED, "Method Not Allowed");
    }

    // ---------------------------------------------------------------- handlers

    private void handleSearch(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String q = req.getParameter("q");
        if (q == null || q.isBlank()) {
            JsonUtil.error(resp, 400, "Enter a place to search for");
            return;
        }
        if (q.trim().length() > 200) {
            JsonUtil.error(resp, 400, "Search query too long (maximum 200 characters)");
            return;
        }

        double[] center = parsePoint(req, false);
        String category = req.getParameter("category");
        int limit = parseLimit(req.getParameter("limit"), 8);

        List<Place> places = geoService.search(q.trim(), center, 0.4, false, limit, category);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("places", places);
        body.put("count", places.size());
        JsonUtil.ok(resp, body);
    }

    /** Which map the pages should show, and the browser key to load Google Maps with. */
    private void handleConfig(HttpServletResponse resp) throws IOException {
        boolean google = geoService.isGoogleEnabled();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("provider", google ? "google" : "osm");
        body.put("mapsKey", google ? GoogleMapsClient.browserKey() : null);
        JsonUtil.ok(resp, body);
    }

    private void handleReverse(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        // A click on a Google map POI carries its place id: return that exact place
        String placeId = req.getParameter("placeId");
        if (placeId != null && !placeId.isBlank() && geoService.isGoogleEnabled()) {
            try {
                Place exact = geoService.placeDetails(placeId.trim());
                if (exact != null && GeoService.isValidCoordinate(exact.lat, exact.lng)) {
                    JsonUtil.ok(resp, exact);
                    return;
                }
            } catch (IOException e) {
                // fall through to the coordinates
            }
        }
        double[] p = parsePoint(req, true);
        if (p == null) {
            JsonUtil.error(resp, 400, "lat and lng are required");
            return;
        }
        Place place = geoService.reverse(p[0], p[1]);
        if (place == null) {
            JsonUtil.error(resp, 404, "No place found at this point");
        } else {
            JsonUtil.ok(resp, place);
        }
    }

    private void handleGeocode(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String q = req.getParameter("q");
        if (q == null || q.isBlank()) {
            JsonUtil.error(resp, 400, "Enter a location or place name to geocode");
            return;
        }
        if (q.trim().length() > 200) {
            JsonUtil.error(resp, 400, "Query too long (maximum 200 characters)");
            return;
        }

        String destination = req.getParameter("destination");
        double[] center = parsePoint(req, false);

        Place place = geoService.geocode(q.trim(), destination, center);
        if (place == null) {
            JsonUtil.error(resp, 404, "Location not found for: " + q.trim());
        } else {
            JsonUtil.ok(resp, place);
        }
    }

    // ---------------------------------------------------------------- helpers

    private static double[] parsePoint(HttpServletRequest req, boolean required) {
        String latStr = req.getParameter("lat");
        String lngStr = req.getParameter("lng");
        if (latStr == null && lngStr == null) {
            if (required) return null;
            return null;
        }
        if (latStr == null || lngStr == null || latStr.isBlank() || lngStr.isBlank()) {
            throw new IllegalArgumentException("Both lat and lng parameters are required when specifying coordinates");
        }
        double lat;
        double lng;
        try {
            lat = Double.parseDouble(latStr.trim());
            lng = Double.parseDouble(lngStr.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Coordinates must be valid numeric values");
        }
        if (!GeoService.isValidCoordinate(lat, lng)) {
            throw new IllegalArgumentException("Invalid coordinate values: lat must be between -90 and 90, lng between -180 and 180");
        }
        return new double[]{lat, lng};
    }

    private static int parseLimit(String param, int fallback) {
        if (param == null || param.isBlank()) return fallback;
        try {
            int val = Integer.parseInt(param.trim());
            return Math.max(1, Math.min(val, 20));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}

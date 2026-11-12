package com.travelmate.geo;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import com.travelmate.model.Place;
import com.travelmate.util.EnvLoader;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Place search, geocoding and reverse geocoding.
 *
 * When TM_GOOGLE_MAPS_KEY is configured the default instance uses Google Maps Platform
 * (see {@link GoogleMapsClient}); otherwise, or when a Google call fails, it uses
 * OpenStreetMap Nominatim as described below.
 *
 * Nominatim's usage policy requires at most 1 request per second, an
 * identifying
 * User-Agent and caching. All requests are routed through a thread-safe,
 * rate-limited,
 * bounded-cache client.
 * Point tm.geo.url (system property) or TM_GEO_URL (environment variable) at
 * your own
 * Nominatim instance to lift or configure limits.
 */
public class GeoService {

    public static final String PUBLIC_NOMINATIM_HOST = "nominatim.openstreetmap.org";
    public static final String DEFAULT_BASE_URL = firstNonBlank(
            System.getProperty("tm.geo.url"),
            EnvLoader.get("TM_GEO_URL"),
            "https://" + PUBLIC_NOMINATIM_HOST);
    public static final String USER_AGENT = "TravelMate/1.0 (student travel planner; Java HttpClient)";
    public static final long DEFAULT_MIN_INTERVAL_MS = 1100;
    public static final long CACHE_TTL_MS = 24 * 3600 * 1000L; // 24 hours
    public static final int MAX_CACHE_ENTRIES = 1000;

    private static final GeoService DEFAULT_INSTANCE = new GeoService().withGoogle(GoogleMapsClient.fromEnvironment());

    public static GeoService getDefault() {
        return DEFAULT_INSTANCE;
    }

    /** Google Maps Platform client; when set it is used first and OpenStreetMap is the fallback. */
    private volatile GoogleMapsClient google;

    public GeoService withGoogle(GoogleMapsClient client) {
        this.google = client;
        return this;
    }

    /** True when searches and geocoding go to Google Maps rather than OpenStreetMap. */
    public boolean isGoogleEnabled() {
        return google != null;
    }

    private static void logGoogleFailure(String what, Exception e) {
        System.err.println("[TravelMate] Google Maps " + what + " failed, using OpenStreetMap instead: "
                + e.getMessage());
    }

    private static final Object PUBLIC_NOMINATIM_LOCK = new Object();
    private static long publicNominatimLastRequestNanos = 0L;

    public static void resetPublicLimiterForTest() {
        synchronized (PUBLIC_NOMINATIM_LOCK) {
            publicNominatimLastRequestNanos = 0L;
        }
    }

    private static final Map<String, CacheEntry> PUBLIC_NOMINATIM_CACHE = Collections.synchronizedMap(
            new LinkedHashMap<String, CacheEntry>(256, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
                    return size() > MAX_CACHE_ENTRIES;
                }
            });

    private final HttpClient http;
    private final String baseUrl;
    private final long minIntervalMs;
    private final Object rateLock = new Object();
    private long lastRequestNanos = 0L;

    public static boolean isPublicNominatimHost(String url) {
        if (url == null || url.isBlank())
            return false;
        try {
            URI uri = URI.create(url.trim());
            String host = uri.getHost();
            return host != null && host.equalsIgnoreCase(PUBLIC_NOMINATIM_HOST);
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isPublicNominatim() {
        return isPublicNominatimHost(this.baseUrl);
    }

    public long getEffectiveMinIntervalMs() {
        if (isPublicNominatim()) {
            return Math.max(DEFAULT_MIN_INTERVAL_MS, this.minIntervalMs);
        }
        return Math.max(0, this.minIntervalMs);
    }

    private Map<String, CacheEntry> activeCache() {
        return isPublicNominatim() ? PUBLIC_NOMINATIM_CACHE : cache;
    }

    private static class CacheEntry {
        final String body;
        final long createdAt;

        CacheEntry(String body) {
            this.body = body;
            this.createdAt = System.currentTimeMillis();
        }

        boolean isExpired(long ttlMs) {
            return (System.currentTimeMillis() - createdAt) > ttlMs;
        }
    }

    private final Map<String, CacheEntry> cache;

    public GeoService() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
                DEFAULT_BASE_URL, DEFAULT_MIN_INTERVAL_MS);
    }

    public GeoService(HttpClient http) {
        this(http, DEFAULT_BASE_URL, 0); // 0ms delay for fast unit tests when mock HTTP is provided
    }

    public GeoService(HttpClient http, String baseUrl, long minIntervalMs) {
        this.http = http != null ? http : HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        this.baseUrl = (baseUrl != null && !baseUrl.isBlank()) ? baseUrl.replaceAll("/+$", "") : DEFAULT_BASE_URL;
        this.minIntervalMs = Math.max(0, minIntervalMs);
        this.cache = Collections.synchronizedMap(new LinkedHashMap<String, CacheEntry>(256, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
                return size() > MAX_CACHE_ENTRIES;
            }
        });
    }

    // ---------------------------------------------------------------- validation

    /**
     * Checks if coordinates fall within valid geographic bounds.
     * Latitude: -90.0 to +90.0. Longitude: -180.0 to +180.0.
     * Rejects NaN and infinite values.
     */
    public static boolean isValidCoordinate(double lat, double lng) {
        return !Double.isNaN(lat) && !Double.isInfinite(lat) &&
                !Double.isNaN(lng) && !Double.isInfinite(lng) &&
                lat >= -90.0 && lat <= 90.0 &&
                lng >= -180.0 && lng <= 180.0;
    }

    public static boolean isValidCoordinate(Double lat, Double lng) {
        return lat != null && lng != null && isValidCoordinate(lat.doubleValue(), lng.doubleValue());
    }

    /**
     * Safely parses a coordinate string into a Double.
     * Returns null for missing, blank, non-numeric, NaN or infinite values.
     * Does NOT silently convert malformed values to 0.0.
     */
    public static Double parseCoordinate(String s) {
        if (s == null || s.isBlank())
            return null;
        try {
            double d = Double.parseDouble(s.trim());
            if (Double.isNaN(d) || Double.isInfinite(d))
                return null;
            return d;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ---------------------------------------------------------------- search

    /** Search places by text with optional center, bounding and limit. */
    public List<Place> search(String query, double[] center, double radiusDeg, boolean bounded, int limit)
            throws IOException {
        return search(query, center, radiusDeg, bounded, limit, null);
    }

    /**
     * Search places by text with optional center, bounding, limit and category
     * filter.
     */
    public List<Place> search(String query, double[] center, double radiusDeg, boolean bounded, int limit,
            String category)
            throws IOException {
        if (query == null || query.isBlank()) {
            return Collections.emptyList();
        }
        String cleanQuery = query.trim();
        if (cleanQuery.length() > 200) {
            cleanQuery = cleanQuery.substring(0, 200).trim();
        }

        GoogleMapsClient g = google;
        if (g != null) {
            try {
                List<Place> hits = g.search(cleanQuery, center, radiusDeg, bounded, limit);
                if (category != null && !category.isBlank()) {
                    hits.removeIf(p -> p.category == null || !p.category.equalsIgnoreCase(category.trim()));
                }
                return hits;
            } catch (IOException | RuntimeException e) {
                logGoogleFailure("place search", e);
            }
        }

        int clampedLimit = Math.max(1, Math.min(limit, 20));
        StringBuilder url = new StringBuilder(baseUrl)
                .append("/search?format=jsonv2&addressdetails=1&extratags=1&namedetails=0&accept-language=en&limit=")
                .append(clampedLimit)
                .append("&q=")
                .append(URLEncoder.encode(cleanQuery, StandardCharsets.UTF_8));

        if (center != null && center.length == 2 && isValidCoordinate(center[0], center[1])) {
            double r = Math.max(0.001, Math.min(radiusDeg, 10.0));
            double minLon = Math.max(-180.0, center[1] - r);
            double maxLat = Math.min(90.0, center[0] + r);
            double maxLon = Math.min(180.0, center[1] + r);
            double minLat = Math.max(-90.0, center[0] - r);
            url.append("&viewbox=").append(minLon).append(',').append(maxLat).append(',')
                    .append(maxLon).append(',').append(minLat);
            if (bounded) {
                url.append("&bounded=1");
            }
        }

        String rawJson = get(url.toString());
        JsonElement json = JsonParser.parseString(rawJson);
        List<Place> places = new ArrayList<>();
        if (json.isJsonArray()) {
            for (JsonElement el : json.getAsJsonArray()) {
                if (el.isJsonObject()) {
                    Place p = toPlace(el.getAsJsonObject());
                    if (p != null && isValidCoordinate(p.lat, p.lng)) {
                        if (category == null || category.isBlank() ||
                                (p.category != null && p.category.equalsIgnoreCase(category.trim()))) {
                            places.add(p);
                        }
                    }
                }
            }
        }
        return deduplicate(places);
    }

    // ---------------------------------------------------------------- reverse
    // geocoding

    /**
     * The place at (or nearest to) a map point, or null when there is nothing
     * there.
     */
    public Place reverse(double lat, double lng) throws IOException {
        if (!isValidCoordinate(lat, lng)) {
            throw new IllegalArgumentException("Invalid coordinate values: lat=" + lat + ", lng=" + lng);
        }
        GoogleMapsClient g = google;
        if (g != null) {
            try {
                return g.reverse(lat, lng);
            } catch (IOException | RuntimeException e) {
                logGoogleFailure("reverse geocoding", e);
            }
        }
        String url = baseUrl + "/reverse?format=jsonv2&addressdetails=1&extratags=1&zoom=18&accept-language=en&lat="
                + lat + "&lon=" + lng;
        String rawJson = get(url);
        JsonElement json = JsonParser.parseString(rawJson);
        if (!json.isJsonObject() || json.getAsJsonObject().has("error")) {
            return null;
        }
        Place p = toPlace(json.getAsJsonObject());
        if (p == null) {
            return null;
        }
        // Retain the clicked/snapped point requested by caller
        p.lat = lat;
        p.lng = lng;
        return p;
    }

    /** Full details for a Google place id (a click on a Google map POI). Null without Google. */
    public Place placeDetails(String placeId) throws IOException {
        GoogleMapsClient g = google;
        return g == null ? null : g.details(placeId);
    }

    // ---------------------------------------------------------------- geocoding

    /** Best single match for a query. */
    public Place geocode(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        try {
            List<Place> hits = search(query, null, 0, false, 1);
            return hits.isEmpty() ? null : hits.get(0);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** Best single match for a place name around a destination centre, or null. */
    public Place geocode(String name, String destination, double[] center) {
        if (name == null || name.isBlank()) {
            return null;
        }
        boolean hasCenter = center != null && center.length == 2 && isValidCoordinate(center[0], center[1]);
        GoogleMapsClient g = google;
        if (g != null) {
            try {
                // With a centre the search is biased to the destination, so the name alone finds the right
                // branch there; adding the city would drag a place of another city ("Bengaluru City
                // Railway Station") onto a similar one in the destination.
                boolean addCity = !hasCenter && destination != null && !destination.isBlank()
                        && !name.toLowerCase(Locale.ROOT).contains(destination.trim().toLowerCase(Locale.ROOT));
                String q = addCity ? name.trim() + ", " + destination.trim() : name.trim();
                for (Place p : g.search(q, center, 0.45, false, 3)) {
                    // A match far from the destination is a namesake elsewhere, not this stop (< 0.25 deg ~27 km)
                    if (!hasCenter || (Math.abs(p.lat - center[0]) <= 0.25 && Math.abs(p.lng - center[1]) <= 0.25))
                        return p;
                }
                // If query included destination name, allow up to 0.35 deg (~38 km) for outer suburban sights
                if (hasCenter && destination != null && !destination.isBlank()
                        && !name.toLowerCase(Locale.ROOT).contains(destination.trim().toLowerCase(Locale.ROOT))) {
                    for (Place p : g.search(name.trim() + ", " + destination.trim(), center, 0.45, false, 1)) {
                        if (Math.abs(p.lat - center[0]) <= 0.35 && Math.abs(p.lng - center[1]) <= 0.35)
                            return p;
                    }
                }
                return null;
            } catch (IOException | RuntimeException e) {
                logGoogleFailure("geocoding", e);
            }
        }
        try {
            List<Place> hits = (center != null && center.length == 2 && isValidCoordinate(center[0], center[1]))
                    ? search(name, center, 0.5, true, 1)
                    : Collections.emptyList();
            if (hits.isEmpty() && destination != null && !destination.isBlank()) {
                hits = search(name + ", " + destination, center, 0.5,
                        (center != null && center.length == 2 && isValidCoordinate(center[0], center[1])), 1);
            }
            if (hits.isEmpty()) {
                hits = search(name, null, 0, false, 1);
            }
            return hits.isEmpty() ? null : hits.get(0);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    // ---------------------------------------------------------------- HTTP &
    // Caching

    public void clearCache() {
        cache.clear();
        if (isPublicNominatim()) {
            PUBLIC_NOMINATIM_CACHE.clear();
        }
    }

    public int cacheSize() {
        return activeCache().size();
    }

    public static String normalizeCacheKey(String url) {
        if (url == null)
            return "";
        try {
            URI uri = URI.create(url.trim());
            String query = uri.getRawQuery();
            if (query == null)
                return uri.toString().toLowerCase(Locale.ROOT);
            String[] pairs = query.split("&");
            Arrays.sort(pairs);
            return uri.getScheme().toLowerCase(Locale.ROOT) + "://" +
                    uri.getHost().toLowerCase(Locale.ROOT) +
                    (uri.getPort() == -1 ? "" : ":" + uri.getPort()) +
                    uri.getPath() + "?" + String.join("&", pairs);
        } catch (Exception e) {
            return url.trim().toLowerCase(Locale.ROOT);
        }
    }

    private String getCached(String key) {
        Map<String, CacheEntry> m = activeCache();
        CacheEntry entry = m.get(key);
        if (entry != null) {
            if (entry.isExpired(CACHE_TTL_MS)) {
                m.remove(key);
                return null;
            }
            return entry.body;
        }
        return null;
    }

    private String get(String url) throws IOException {
        String cacheKey = normalizeCacheKey(url);
        String cached = getCached(cacheKey);
        if (cached != null) {
            return cached;
        }

        Object lock = isPublicNominatim() ? PUBLIC_NOMINATIM_LOCK : rateLock;
        long intervalNanos = TimeUnit.MILLISECONDS.toNanos(getEffectiveMinIntervalMs());
        HttpResponse<String> resp;

        synchronized (lock) {
            if (Thread.currentThread().isInterrupted()) {
                throw new IOException("Geocoding request was interrupted before execution");
            }
            long now = System.nanoTime();
            long lastNanos = isPublicNominatim() ? publicNominatimLastRequestNanos : lastRequestNanos;
            if (lastNanos != 0L && intervalNanos > 0L) {
                long elapsed = now - lastNanos;
                long waitNanos = intervalNanos - elapsed;
                if (waitNanos > 0L) {
                    try {
                        long waitMs = waitNanos / 1_000_000L;
                        int waitNsRemainder = (int) (waitNanos % 1_000_000L);
                        Thread.sleep(waitMs, waitNsRemainder);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new IOException("Geocoding request was interrupted", e);
                    }
                }
            }

            try {
                resp = http.send(HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(15))
                        .header("User-Agent", USER_AGENT)
                        .header("Accept", "application/json")
                        .GET().build(), HttpResponse.BodyHandlers.ofString());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("Map search interrupted", e);
            } finally {
                long completedNanos = System.nanoTime();
                if (isPublicNominatim()) {
                    publicNominatimLastRequestNanos = completedNanos;
                } else {
                    lastRequestNanos = completedNanos;
                }
            }
        }

        int status = resp.statusCode();
        if (status == 400) {
            throw new IOException("Bad request to map service: HTTP 400");
        }
        if (status == 403) {
            throw new IOException("Access forbidden by map service: HTTP 403");
        }
        if (status == 429) {
            throw new IOException("Map search is busy (rate limited) — try again in a moment");
        }
        if (status == 500 || status == 502 || status == 503) {
            throw new IOException("Map service is temporarily unavailable: HTTP " + status);
        }
        if (status / 100 != 2) {
            throw new IOException("Map search failed: HTTP " + status);
        }

        String body = resp.body();
        if (body == null || body.isBlank()) {
            throw new IOException("Empty response received from map service");
        }

        try {
            // Verify JSON validity before caching
            JsonParser.parseString(body);
        } catch (JsonSyntaxException e) {
            throw new IOException("Malformed JSON received from map service: " + e.getMessage(), e);
        }

        activeCache().put(cacheKey, new CacheEntry(body));
        return body;
    }

    // ---------------------------------------------------------------- parser

    public static Place toPlace(JsonObject o) {
        if (o == null)
            return null;
        Place p = new Place();
        String cls = str(o, "category", str(o, "class", ""));
        String type = str(o, "type", "");
        String display = str(o, "display_name", "");
        p.displayName = display;
        p.name = str(o, "name", "");
        if (p.name.isEmpty()) {
            p.name = display.contains(",") ? display.substring(0, display.indexOf(',')).trim() : display.trim();
        }
        p.osmType = cls + "/" + type;
        p.address = shortAddress(display, p.name);

        Double lat = parseCoordinate(str(o, "lat", null));
        Double lng = parseCoordinate(str(o, "lon", null));
        if (lat != null && lng != null && isValidCoordinate(lat, lng)) {
            p.lat = lat;
            p.lng = lng;
        } else {
            p.lat = null;
            p.lng = null;
        }

        String osmKind = str(o, "osm_type", "");
        String osmId = str(o, "osm_id", "");
        p.osmKind = osmKind.isEmpty() ? null : osmKind;
        p.osmId = osmId.isEmpty() ? null : osmId;
        p.placeRef = (osmKind.isEmpty() || osmId.isEmpty()) ? null : "osm:" + osmKind + "/" + osmId;

        // Bounding box [minLat, maxLat, minLng, maxLng]
        if (o.has("boundingbox") && o.get("boundingbox").isJsonArray()) {
            JsonArray bb = o.getAsJsonArray("boundingbox");
            if (bb.size() == 4) {
                Double minLat = parseCoordinate(bb.get(0).getAsString());
                Double maxLat = parseCoordinate(bb.get(1).getAsString());
                Double minLng = parseCoordinate(bb.get(2).getAsString());
                Double maxLng = parseCoordinate(bb.get(3).getAsString());
                if (minLat != null && maxLat != null && minLng != null && maxLng != null
                        && isValidCoordinate(minLat, minLng) && isValidCoordinate(maxLat, maxLng)) {
                    p.boundingBox = new double[] { minLat, maxLat, minLng, maxLng };
                }
            }
        }

        if (o.has("extratags") && o.get("extratags").isJsonObject()) {
            JsonObject tags = o.getAsJsonObject("extratags");
            p.openingHours = str(tags, "opening_hours", null);
            p.website = firstNonBlank(str(tags, "website", null), str(tags, "contact:website", null), null);
            p.phone = firstNonBlank(str(tags, "phone", null), str(tags, "contact:phone", null), null);
        }

        String[] cat = categorize(cls, type);
        p.category = cat[0];
        p.categoryIcon = cat[1];
        return p;
    }

    /** OpenStreetMap class/type -> TravelMate category and Bootstrap icon. */
    public static String[] categorize(String cls, String type) {
        String c = cls != null ? cls.toLowerCase(Locale.ROOT) : "";
        String t = type != null ? type.toLowerCase(Locale.ROOT) : "";
        if (c.equals("amenity")
                && List.of("restaurant", "cafe", "fast_food", "food_court", "ice_cream", "bar", "pub").contains(t))
            return new String[] { "Food", "bi-cup-hot" };
        if (c.equals("amenity") && (t.equals("place_of_worship") || t.equals("monastery")))
            return new String[] { "Religious", "bi-brightness-high" };
        if (c.equals("historic") || t.equals("castle") || t.equals("monument") || t.equals("fort") || t.equals("ruins"))
            return new String[] { "Heritage", "bi-bank" };
        if (t.equals("museum") || t.equals("gallery") || t.equals("arts_centre") || t.equals("theatre"))
            return new String[] { "Culture", "bi-palette" };
        if (c.equals("shop") || t.equals("marketplace") || t.equals("mall") || t.equals("supermarket"))
            return new String[] { "Shopping", "bi-bag" };
        if (c.equals("natural") || c.equals("leisure") || c.equals("waterway") || t.equals("park")
                || t.equals("garden") || t.equals("nature_reserve"))
            return new String[] { "Nature", "bi-tree" };
        if (t.equals("hotel") || t.equals("guest_house") || t.equals("hostel") || t.equals("motel"))
            return new String[] { "Stay", "bi-building" };
        if (c.equals("highway") || c.equals("railway") || t.equals("bus_stop") || t.equals("station")
                || t.equals("aerodrome"))
            return new String[] { "Transport", "bi-train-front" };
        if (c.equals("tourism"))
            return new String[] { "Sightseeing", "bi-camera" };
        return new String[] { "Sightseeing", "bi-geo-alt" };
    }

    public static String shortAddress(String display, String name) {
        if (display == null || display.isBlank())
            return "";
        List<String> parts = new ArrayList<>(List.of(display.split(",\\s*")));
        if (!parts.isEmpty() && name != null && parts.get(0).equalsIgnoreCase(name.trim())) {
            parts.remove(0);
        }
        parts.removeIf(s -> s.equalsIgnoreCase("India") || s.endsWith(" taluk") || s.endsWith(" District"));
        return String.join(", ", parts);
    }

    private static List<Place> deduplicate(List<Place> places) {
        List<Place> result = new ArrayList<>();
        Set<String> seenRefs = new HashSet<>();
        for (Place p : places) {
            if (p.placeRef != null && !seenRefs.add(p.placeRef)) {
                continue;
            }
            boolean duplicate = false;
            for (Place existing : result) {
                if (isSamePlace(p, existing)) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                result.add(p);
            }
        }
        return result;
    }

    private static boolean isSamePlace(Place a, Place b) {
        if (a.name != null && b.name != null && a.name.equalsIgnoreCase(b.name)) {
            if (a.lat != null && b.lat != null && a.lng != null && b.lng != null) {
                double dLat = Math.abs(a.lat - b.lat);
                double dLng = Math.abs(a.lng - b.lng);
                if (dLat < 0.001 && dLng < 0.001)
                    return true; // ~100 meters
            }
        }
        return false;
    }

    private static double parseDouble(String s) {
        try {
            return s == null ? 0.0 : Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }

    private static String str(JsonObject o, String key, String fallback) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() || !el.isJsonPrimitive() ? fallback : el.getAsString();
    }

    private static String firstNonBlank(String a, String b, String fallback) {
        if (a != null && !a.isBlank())
            return a;
        if (b != null && !b.isBlank())
            return b;
        return fallback;
    }
}

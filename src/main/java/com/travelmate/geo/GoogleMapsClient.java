package com.travelmate.geo;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
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
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Place search, place details and reverse geocoding with Google Maps Platform.
 *
 * Uses the Places API (New) for text search and place details, and the Geocoding API for
 * map clicks that are not on a Google place. Enabled when TM_GOOGLE_MAPS_KEY is set
 * (environment variable, system property or .env); {@link GeoService} falls back to
 * OpenStreetMap when it is not.
 */
public class GoogleMapsClient {

    public static final String PLACES_URL = "https://places.googleapis.com/v1";
    public static final String GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
    public static final long CACHE_TTL_MS = 24 * 3600 * 1000L;
    public static final int MAX_CACHE_ENTRIES = 1000;

    private static final String PLACE_FIELDS = "id,displayName,formattedAddress,shortFormattedAddress,location,"
            + "viewport,types,primaryType,regularOpeningHours.weekdayDescriptions,websiteUri,"
            + "nationalPhoneNumber,googleMapsUri";
    private static final String SEARCH_FIELDS;
    static {
        StringBuilder sb = new StringBuilder();
        for (String f : PLACE_FIELDS.split(",")) {
            if (sb.length() > 0)
                sb.append(',');
            sb.append("places.").append(f);
        }
        SEARCH_FIELDS = sb.toString();
    }

    private final HttpClient http;
    private final String apiKey;
    private final String placesUrl;
    private final String geocodeUrl;
    private final Map<String, CacheEntry> cache = Collections.synchronizedMap(
            new LinkedHashMap<String, CacheEntry>(256, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
                    return size() > MAX_CACHE_ENTRIES;
                }
            });

    private record CacheEntry(String body, long createdAt) {
    }

    /**
     * The server-side key: read strictly from environment variable TM_GOOGLE_MAPS_KEY or .env.
     * Returns null when no key is set, so GeoService safely falls back to OpenStreetMap.
     */
    public static String configuredKey() {
        String key = EnvLoader.get("TM_GOOGLE_MAPS_KEY");
        return key != null && !key.isBlank() ? key.trim() : null;
    }

    /**
     * The key the web page loads the map with: TM_GOOGLE_MAPS_BROWSER_KEY when set (so it can
     * be restricted to your site), else the server key. Returns null when unset.
     */
    public static String browserKey() {
        String key = EnvLoader.get("TM_GOOGLE_MAPS_BROWSER_KEY");
        if (key != null && !key.isBlank()) return key.trim();
        return configuredKey();
    }

    /** A client for the configured key, or null when no key is set. */
    public static GoogleMapsClient fromEnvironment() {
        String key = configuredKey();
        return key == null ? null : new GoogleMapsClient(null, key);
    }

    public GoogleMapsClient(HttpClient http, String apiKey) {
        this(http, apiKey, PLACES_URL, GEOCODE_URL);
    }

    public GoogleMapsClient(HttpClient http, String apiKey, String placesUrl, String geocodeUrl) {
        this.http = http != null ? http : HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        this.apiKey = apiKey;
        this.placesUrl = placesUrl.replaceAll("/+$", "");
        this.geocodeUrl = geocodeUrl;
    }

    // ---------------------------------------------------------------- search

    /**
     * Text search ("Mysore Palace", "best dosa near Lalbagh"). With a centre, results are
     * biased to (or, when bounded, restricted to) the area around it.
     */
    public List<Place> search(String query, double[] center, double radiusDeg, boolean bounded, int limit)
            throws IOException {
        if (query == null || query.isBlank())
            return Collections.emptyList();
        JsonObject body = new JsonObject();
        body.addProperty("textQuery", query.trim());
        body.addProperty("pageSize", Math.max(1, Math.min(limit, 20)));
        body.addProperty("languageCode", "en");

        if (center != null && center.length == 2 && GeoService.isValidCoordinate(center[0], center[1])) {
            double r = Math.max(0.001, Math.min(radiusDeg, 10.0));
            if (bounded) {
                JsonObject rect = new JsonObject();
                rect.add("low", latLng(Math.max(-90, center[0] - r), Math.max(-180, center[1] - r)));
                rect.add("high", latLng(Math.min(90, center[0] + r), Math.min(180, center[1] + r)));
                JsonObject restriction = new JsonObject();
                restriction.add("rectangle", rect);
                body.add("locationRestriction", restriction);
            } else {
                JsonObject circle = new JsonObject();
                circle.add("center", latLng(center[0], center[1]));
                // One degree is about 111 km; the API allows a radius of up to 50 km
                circle.addProperty("radius", Math.min(50_000.0, r * 111_000.0));
                JsonObject bias = new JsonObject();
                bias.add("circle", circle);
                body.add("locationBias", bias);
            }
        }

        String payload = body.toString();
        String raw = send("search:" + payload, HttpRequest.newBuilder(URI.create(placesUrl + "/places:searchText"))
                .header("Content-Type", "application/json")
                .header("X-Goog-FieldMask", SEARCH_FIELDS)
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8)));

        List<Place> places = new ArrayList<>();
        JsonObject json = JsonParser.parseString(raw).getAsJsonObject();
        if (json.has("places") && json.get("places").isJsonArray()) {
            for (JsonElement el : json.getAsJsonArray("places")) {
                if (!el.isJsonObject())
                    continue;
                Place p = toPlace(el.getAsJsonObject());
                if (p != null && GeoService.isValidCoordinate(p.lat, p.lng))
                    places.add(p);
            }
        }
        return places;
    }

    // ---------------------------------------------------------------- details

    /** Full details of one Google place (the id a map click on a Google POI gives). */
    public Place details(String placeId) throws IOException {
        if (placeId == null || !placeId.matches("[A-Za-z0-9_-]{5,300}")) {
            throw new IllegalArgumentException("Invalid place id");
        }
        String raw = send("details:" + placeId,
                HttpRequest.newBuilder(URI.create(placesUrl + "/places/" + placeId + "?languageCode=en"))
                        .header("X-Goog-FieldMask", PLACE_FIELDS)
                        .GET());
        return toPlace(JsonParser.parseString(raw).getAsJsonObject());
    }

    // ---------------------------------------------------------------- reverse geocoding

    /** The address at a map point, or null when Google has nothing there. */
    public Place reverse(double lat, double lng) throws IOException {
        String url = geocodeUrl + "?language=en&latlng=" + lat + "," + lng
                + "&key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);
        String raw = send("reverse:" + lat + "," + lng, HttpRequest.newBuilder(URI.create(url)).GET());
        JsonObject json = JsonParser.parseString(raw).getAsJsonObject();
        String status = str(json, "status", "");
        if ("ZERO_RESULTS".equals(status))
            return null;
        if (!"OK".equals(status)) {
            throw new IOException("Google Geocoding API: " + status
                    + (json.has("error_message") ? " — " + str(json, "error_message", "") : ""));
        }
        JsonArray results = json.getAsJsonArray("results");
        if (results == null || results.isEmpty())
            return null;
        JsonObject first = results.get(0).getAsJsonObject();

        Place p = new Place();
        p.source = "google";
        String formatted = str(first, "formatted_address", "");
        p.displayName = formatted;
        p.name = formatted.contains(",") ? formatted.substring(0, formatted.indexOf(',')).trim() : formatted;
        p.address = GeoService.shortAddress(formatted, p.name);
        p.lat = lat;
        p.lng = lng;
        String placeId = str(first, "place_id", null);
        p.placeRef = placeId == null ? null : "google:" + placeId;
        List<String> types = strings(first, "types");
        p.osmType = types.isEmpty() ? "address" : types.get(0);
        String[] cat = categorize(null, types);
        p.category = cat[0];
        p.categoryIcon = cat[1];
        if (placeId != null) {
            p.mapsUrl = "https://www.google.com/maps/search/?api=1&query=" + lat + "%2C" + lng
                    + "&query_place_id=" + placeId;
        }
        return p;
    }

    // ---------------------------------------------------------------- HTTP

    private String send(String cacheKey, HttpRequest.Builder request) throws IOException {
        CacheEntry hit = cache.get(cacheKey);
        if (hit != null && System.currentTimeMillis() - hit.createdAt() < CACHE_TTL_MS)
            return hit.body();

        HttpResponse<String> resp;
        try {
            resp = http.send(request.timeout(Duration.ofSeconds(15))
                    .header("X-Goog-Api-Key", apiKey)
                    .header("Accept", "application/json")
                    .build(), HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Google Maps request interrupted", e);
        }
        String body = resp.body() == null ? "" : resp.body();
        if (resp.statusCode() / 100 != 2) {
            throw new IOException("Google Maps request failed: HTTP " + resp.statusCode() + errorMessage(body));
        }
        try {
            if (!JsonParser.parseString(body).isJsonObject())
                throw new IOException("Unexpected response from Google Maps");
        } catch (RuntimeException e) {
            throw new IOException("Malformed JSON received from Google Maps", e);
        }
        cache.put(cacheKey, new CacheEntry(body, System.currentTimeMillis()));
        return body;
    }

    /** " — API key not valid…" from a Google error body, or "" when there is none. */
    private static String errorMessage(String body) {
        try {
            JsonObject o = JsonParser.parseString(body).getAsJsonObject();
            if (o.has("error") && o.get("error").isJsonObject()) {
                String msg = str(o.getAsJsonObject("error"), "message", null);
                return msg == null ? "" : " — " + msg;
            }
            String msg = str(o, "error_message", null);
            return msg == null ? "" : " — " + msg;
        } catch (RuntimeException e) {
            return "";
        }
    }

    // ---------------------------------------------------------------- parser

    /** A Places API (New) place object -> TravelMate place. */
    public static Place toPlace(JsonObject o) {
        if (o == null)
            return null;
        Place p = new Place();
        p.source = "google";
        JsonObject displayName = obj(o, "displayName");
        p.name = displayName == null ? "" : str(displayName, "text", "");
        String formatted = str(o, "formattedAddress", "");
        p.displayName = p.name.isEmpty() ? formatted : p.name + ", " + formatted;
        if (p.name.isEmpty()) {
            p.name = formatted.contains(",") ? formatted.substring(0, formatted.indexOf(',')).trim() : formatted;
        }
        p.address = str(o, "shortFormattedAddress", GeoService.shortAddress(formatted, p.name));

        JsonObject loc = obj(o, "location");
        if (loc != null) {
            Double lat = GeoService.parseCoordinate(str(loc, "latitude", null));
            Double lng = GeoService.parseCoordinate(str(loc, "longitude", null));
            if (GeoService.isValidCoordinate(lat, lng)) {
                p.lat = lat;
                p.lng = lng;
            }
        }
        JsonObject viewport = obj(o, "viewport");
        if (viewport != null && obj(viewport, "low") != null && obj(viewport, "high") != null) {
            Double minLat = GeoService.parseCoordinate(str(obj(viewport, "low"), "latitude", null));
            Double minLng = GeoService.parseCoordinate(str(obj(viewport, "low"), "longitude", null));
            Double maxLat = GeoService.parseCoordinate(str(obj(viewport, "high"), "latitude", null));
            Double maxLng = GeoService.parseCoordinate(str(obj(viewport, "high"), "longitude", null));
            if (GeoService.isValidCoordinate(minLat, minLng) && GeoService.isValidCoordinate(maxLat, maxLng)) {
                p.boundingBox = new double[] { minLat, maxLat, minLng, maxLng };
            }
        }

        String id = str(o, "id", null);
        p.placeRef = id == null ? null : "google:" + id;
        p.mapsUrl = str(o, "googleMapsUri", null);
        p.website = str(o, "websiteUri", null);
        p.phone = str(o, "nationalPhoneNumber", null);

        JsonObject hours = obj(o, "regularOpeningHours");
        if (hours != null) {
            List<String> days = strings(hours, "weekdayDescriptions");
            if (!days.isEmpty())
                p.openingHours = compactHours(days);
        }

        String primary = str(o, "primaryType", null);
        List<String> types = strings(o, "types");
        p.osmType = primary != null ? primary : (types.isEmpty() ? "place" : types.get(0));
        String[] cat = categorize(primary, types);
        p.category = cat[0];
        p.categoryIcon = cat[1];
        return p;
    }

    /**
     * "Monday: 9:00 AM – 5:00 PM", … -> "Daily 9:00 AM – 5:00 PM" when every day is the same,
     * else "Mon 9:00 AM – 5:00 PM; Tue Closed; …".
     */
    public static String compactHours(List<String> weekdayDescriptions) {
        List<String> times = new ArrayList<>();
        List<String> parts = new ArrayList<>();
        for (String d : weekdayDescriptions) {
            String clean = d.replace(' ', ' ').replace(' ', ' ').trim();
            int colon = clean.indexOf(':');
            if (colon <= 0) {
                parts.add(clean);
                times.add(clean);
                continue;
            }
            String day = clean.substring(0, colon).trim();
            String time = clean.substring(colon + 1).trim();
            times.add(time);
            parts.add((day.length() > 3 ? day.substring(0, 3) : day) + " " + time);
        }
        if (times.size() == 7 && Set.copyOf(times).size() == 1)
            return "Daily " + times.get(0);
        return String.join("; ", parts);
    }

    /** Google place types -> TravelMate category and Bootstrap icon. */
    public static String[] categorize(String primaryType, List<String> types) {
        List<String> all = new ArrayList<>();
        if (primaryType != null)
            all.add(primaryType.toLowerCase(Locale.ROOT));
        for (String t : types)
            all.add(t.toLowerCase(Locale.ROOT));

        for (String t : all) {
            if (t.equals("hindu_temple") || t.equals("church") || t.equals("mosque") || t.equals("synagogue")
                    || t.equals("place_of_worship") || t.endsWith("_temple") || t.equals("gurudwara"))
                return new String[] { "Religious", "bi-brightness-high" };
            if (t.contains("historical") || t.equals("monument") || t.equals("castle") || t.equals("fort")
                    || t.equals("cultural_landmark") || t.equals("archaeological_site"))
                return new String[] { "Heritage", "bi-bank" };
            if (t.equals("museum") || t.equals("art_gallery") || t.equals("performing_arts_theater")
                    || t.equals("cultural_center") || t.equals("art_museum") || t.equals("history_museum"))
                return new String[] { "Culture", "bi-palette" };
            if (t.equals("beach"))
                return new String[] { "Beach", "bi-water" };
            if (t.equals("park") || t.equals("national_park") || t.contains("garden") || t.equals("zoo")
                    || t.equals("hiking_area") || t.equals("natural_feature") || t.equals("wildlife_park")
                    || t.equals("wildlife_refuge") || t.equals("state_park") || t.equals("scenic_spot"))
                return new String[] { "Nature", "bi-tree" };
            if (t.endsWith("restaurant") || t.equals("cafe") || t.equals("bakery") || t.equals("bar")
                    || t.equals("food") || t.equals("coffee_shop") || t.equals("meal_takeaway")
                    || t.equals("ice_cream_shop") || t.equals("food_court") || t.equals("pub")
                    || t.equals("dessert_shop") || t.equals("sweet_shop") || t.equals("tea_house"))
                return new String[] { "Food", "bi-cup-hot" };
            if (t.equals("shopping_mall") || t.equals("market") || t.endsWith("_store") || t.equals("store")
                    || t.equals("supermarket"))
                return new String[] { "Shopping", "bi-bag" };
            if (t.equals("lodging") || t.contains("hotel") || t.equals("guest_house") || t.equals("hostel")
                    || t.equals("resort_hotel") || t.equals("bed_and_breakfast"))
                return new String[] { "Stay", "bi-building" };
            if (t.endsWith("_station") || t.equals("airport") || t.equals("bus_stop") || t.equals("route")
                    || t.equals("transit_station") || t.equals("ferry_terminal"))
                return new String[] { "Transport", "bi-train-front" };
            if (t.equals("tourist_attraction") || t.equals("amusement_park") || t.equals("observation_deck"))
                return new String[] { "Sightseeing", "bi-camera" };
        }
        return new String[] { "Sightseeing", "bi-geo-alt" };
    }

    // ---------------------------------------------------------------- JSON helpers

    private static JsonObject latLng(double lat, double lng) {
        JsonObject o = new JsonObject();
        o.addProperty("latitude", lat);
        o.addProperty("longitude", lng);
        return o;
    }

    private static JsonObject obj(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el != null && el.isJsonObject() ? el.getAsJsonObject() : null;
    }

    private static List<String> strings(JsonObject o, String key) {
        List<String> list = new ArrayList<>();
        JsonElement el = o.get(key);
        if (el != null && el.isJsonArray()) {
            for (JsonElement item : el.getAsJsonArray()) {
                if (item.isJsonPrimitive())
                    list.add(item.getAsString());
            }
        }
        return list;
    }

    private static String str(JsonObject o, String key, String fallback) {
        JsonElement el = o.get(key);
        if (el == null || el.isJsonNull() || !el.isJsonPrimitive())
            return fallback;
        String s = el.getAsString();
        return s.isBlank() ? fallback : s;
    }
}

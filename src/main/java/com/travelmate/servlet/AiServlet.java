package com.travelmate.servlet;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.travelmate.ai.AiClient;
import com.travelmate.ai.ItineraryGenerator;
import com.travelmate.dao.AiSettingsDAO;
import com.travelmate.geo.GeoService;
import com.travelmate.model.AiSettings;
import com.travelmate.model.User;
import com.travelmate.util.AiAccess;
import com.travelmate.util.JsonUtil;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.net.URI;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * AI model configuration and itinerary generation.
 * GET /api/ai/status is AI enabled? which model? (public)
 * POST /api/ai/itinerary generate days for the planner (public)
 * POST /api/ai/tour-plan schedule an existing trip's stops, optionally adding
 * suggestions (public)
 * GET /api/ai/settings current settings, API key masked (owners only)
 * PUT /api/ai/settings save settings (owners only)
 * DELETE /api/ai/settings back to ai.properties defaults (owners only)
 * POST /api/ai/test send a test prompt (body: unsaved settings, optional)
 * (owners only)
 * POST /api/ai/models list the provider's model ids (body: unsaved settings)
 * (owners only)
 * "Owners" are the sign-in emails listed in ai.allowedEmails /
 * TM_AI_ALLOWED_EMAILS (see AiAccess).
 * The settings live in the shared database, so everyone using that database
 * gets the same model.
 */
@WebServlet("/api/ai/*")
public class AiServlet extends ApiServlet {

    private final AiSettingsDAO dao;
    private final java.net.http.HttpClient httpClient;
    private final GeoService geoService;

    public AiServlet() {
        this(new AiSettingsDAO(), null, null);
    }

    public AiServlet(AiSettingsDAO dao) {
        this(dao, null, null);
    }

    public AiServlet(AiSettingsDAO dao, java.net.http.HttpClient httpClient) {
        this(dao, httpClient, null);
    }

    public AiServlet(AiSettingsDAO dao, java.net.http.HttpClient httpClient, GeoService geoService) {
        this.dao = dao;
        this.httpClient = httpClient;
        this.geoService = geoService != null ? geoService : GeoService.getDefault();
    }

    /** Settings as sent by the page; apiKey blank = keep the saved key. */
    private static class SettingsInput extends AiSettings {
        Boolean clearApiKey;
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String action = action(req);
        try {
            AiSettings s = dao.load();
            if ("status".equals(action)) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("enabled", s.isUsable());
                body.put("model", s.isUsable() ? s.model : null);
                body.put("provider", s.isUsable() ? host(s.baseUrl) : null);
                JsonUtil.ok(resp, body);
            } else if ("settings".equals(action)) {
                if (requireOwner(req, resp))
                    JsonUtil.ok(resp, publicView(s));
            } else if ("models".equals(action)) {
                if (requireOwner(req, resp))
                    models(s, resp);
            } else {
                JsonUtil.error(resp, 404, "Unknown endpoint");
            }
        } catch (SQLException e) {
            throw db(e);
        }
    }

    @Override
    protected void doPut(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!"settings".equals(action(req))) {
            JsonUtil.error(resp, 404, "Unknown endpoint");
            return;
        }
        if (!requireOwner(req, resp))
            return;
        SettingsInput in = JsonUtil.read(req, SettingsInput.class);
        if (in == null) {
            JsonUtil.error(resp, 400, "Request body must be a settings JSON object");
            return;
        }
        try {
            AiSettings stored = dao.load();
            String oldTarget = serverTarget(stored.baseUrl);
            AiSettings merged = merge(stored, in);
            String problem = validate(merged);
            if (problem != null) {
                JsonUtil.error(resp, 400, problem);
                return;
            }
            // Never send a saved key to a different server/scheme/port/path without the user re-entering it
            boolean keyDropped = false;
            String newTarget = serverTarget(merged.baseUrl);
            if (!Objects.equals(oldTarget, newTarget) && isUnchangedOrEmptyKey(in.apiKey, stored.apiKey) && !isBlank(merged.apiKey)) {
                merged.apiKey = "";
                keyDropped = true;
            }
            dao.save(merged);
            Map<String, Object> body = publicView(merged);
            body.put("keyDropped", keyDropped);
            JsonUtil.ok(resp, body);
        } catch (SQLException e) {
            throw db(e);
        }
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!"settings".equals(action(req))) {
            JsonUtil.error(resp, 404, "Unknown endpoint");
            return;
        }
        if (!requireOwner(req, resp))
            return;
        try {
            dao.reset();
            JsonUtil.ok(resp, publicView(dao.load()));
        } catch (SQLException e) {
            throw db(e);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String action = action(req);
        try {
            switch (action) {
                case "itinerary" -> generate(req, resp);
                case "tour-plan" -> tourPlan(req, resp);
                case "place-recommendations" -> placeRecommendations(req, resp);
                case "settings" -> doPut(req, resp);
                case "test", "models" -> {
                    if (!requireOwner(req, resp))
                        return;
                    SettingsInput in = JsonUtil.read(req, SettingsInput.class);
                    AiSettings stored = dao.load();
                    AiSettings s = in == null ? stored : merge(stored, in);
                    // The saved key is only used with the saved server
                    if (in != null && isUnchangedOrEmptyKey(in.apiKey, stored.apiKey)
                            && !Objects.equals(serverTarget(stored.baseUrl), serverTarget(s.baseUrl)))
                        s.apiKey = "";
                    if (action.equals("test"))
                        test(s, resp);
                    else
                        models(s, resp);
                }
                default -> JsonUtil.error(resp, 404, "Unknown endpoint");
            }
        } catch (SQLException e) {
            throw db(e);
        }
    }

    /** AI-assisted destination-specific hotel and restaurant discovery. */
    private void placeRecommendations(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        AiSettings settings = dao.load();
        if (!settings.isUsable()) {
            JsonUtil.error(resp, 503, "AI recommendations are unavailable: configure an AI model in TravelMate settings.");
            return;
        }
        JsonObject input = JsonUtil.read(req, JsonObject.class);
        String destination = input != null && input.has("destination") ? input.get("destination").getAsString().trim() : "";
        String category = input != null && input.has("category") ? input.get("category").getAsString().trim().toLowerCase() : "";
        if (destination.isBlank() || !(category.equals("hotels") || category.equals("restaurants"))) {
            JsonUtil.error(resp, 400, "Provide a destination and category (hotels or restaurants).");
            return;
        }
        String schema = category.equals("hotels")
                ? "{\"items\":[{\"name\":\"real hotel name\",\"type\":\"Hotel\",\"area\":\"neighbourhood\",\"description\":\"short factual description\",\"amenities\":[\"amenity\"]}]}"
                : "{\"items\":[{\"name\":\"real restaurant name\",\"cuisine\":\"cuisine\",\"specialty\":\"known dish or Not verified\",\"area\":\"neighbourhood\",\"mealType\":\"All Meals\"}]}";
        String prompt = "Find up to 8 real, established " + category + " in " + destination + ". "
                + "Return ONLY valid JSON matching this schema: " + schema + ". "
                + "Do not invent ratings, review counts, prices, phone numbers, addresses, coordinates, URLs, or availability. "
                + "If unsure a place exists in this destination, omit it. Keep descriptions concise. Destination must be exactly " + destination + ".";
        try {
            String raw = new AiClient(settings, httpClient).chat("You are a careful travel research assistant. Never fabricate factual business details.", prompt);
            String cleaned = raw.trim().replaceAll("(?s)^```(?:json)?\\s*", "").replaceAll("\\s*```$", "");
            JsonObject parsed = JsonParser.parseString(cleaned).getAsJsonObject();
            JsonArray items = parsed.has("items") && parsed.get("items").isJsonArray() ? parsed.getAsJsonArray("items") : new JsonArray();
            if (items.size() > 8) {
                JsonArray limited = new JsonArray();
                for (int i = 0; i < 8; i++) limited.add(items.get(i));
                parsed.add("items", limited);
            }
            parsed.addProperty("destination", destination);
            parsed.addProperty("source", "AI suggestions — verify details and availability with the provider");
            JsonUtil.ok(resp, parsed);
        } catch (AiClient.AiException | IllegalStateException | com.google.gson.JsonParseException e) {
            log("AI place recommendations failed: " + e.getMessage());
            JsonUtil.error(resp, 502, "Could not fetch AI recommendations right now. Please retry or check AI settings.");
        }
    }

    private void generate(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        AiSettings s = dao.load();
        if (!s.isUsable()) {
            JsonUtil.error(resp, 503, "AI is not set up yet. Ask a TravelMate owner to add the AI model.");
            return;
        }
        ItineraryGenerator.Request in = JsonUtil.read(req, ItineraryGenerator.Request.class);
        if (in == null || isBlank(in.destination) || in.days < 1) {
            JsonUtil.error(resp, 400, "Need at least a destination and a number of days");
            return;
        }
        try {
            JsonUtil.ok(resp, new ItineraryGenerator(s, httpClient, geoService).generate(in));
        } catch (AiClient.AiException e) {
            log("AI itinerary failed: " + e.getMessage());
            JsonUtil.error(resp, 502, e.getMessage());
        }
    }

    private void tourPlan(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        AiSettings s = dao.load();
        if (!s.isUsable()) {
            JsonUtil.error(resp, 503, "AI is not set up yet. Ask a TravelMate owner to add the AI model.");
            return;
        }
        ItineraryGenerator.TourRequest in = JsonUtil.read(req, ItineraryGenerator.TourRequest.class);
        if (in == null || in.plan == null || in.plan.isEmpty() || in.plan.size() > 14) {
            JsonUtil.error(resp, 400, "Send the days to plan (1 to 14)");
            return;
        }
        try {
            JsonUtil.ok(resp, new ItineraryGenerator(s, httpClient, geoService).planTour(in));
        } catch (AiClient.AiException e) {
            log("AI tour plan failed: " + e.getMessage());
            JsonUtil.error(resp, 502, e.getMessage());
        }
    }

    private void test(AiSettings s, HttpServletResponse resp) throws IOException {
        String problem = validate(s);
        if (problem != null) {
            JsonUtil.error(resp, 400, problem);
            return;
        }
        long start = System.currentTimeMillis();
        try {
            String reply = new AiClient(s, httpClient).chat("You are a connectivity check. Answer in one short sentence.",
                    "Say hello to TravelMate and name the model you are.");
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", true);
            body.put("model", s.model);
            body.put("reply", reply.length() > 500 ? reply.substring(0, 500) + "…" : reply);
            body.put("elapsedMs", System.currentTimeMillis() - start);
            JsonUtil.ok(resp, body);
        } catch (AiClient.AiException e) {
            JsonUtil.error(resp, 502, e.getMessage());
        }
    }

    private void models(AiSettings s, HttpServletResponse resp) throws IOException {
        try {
            List<String> ids = new AiClient(s, httpClient).listModels();
            JsonUtil.ok(resp, Map.of("models", ids));
        } catch (AiClient.AiException e) {
            JsonUtil.error(resp, 502, e.getMessage());
        }
    }

    // ---------------------------------------------------------------- helpers

    private static AiSettings merge(AiSettings stored, SettingsInput in) {
        AiSettings s = new AiSettings();
        s.enabled = in.enabled;
        s.baseUrl = in.baseUrl == null ? stored.baseUrl : in.baseUrl.trim();
        s.model = in.model == null ? stored.model : in.model.trim();
        s.temperature = in.temperature;
        s.maxTokens = in.maxTokens;
        s.timeoutSeconds = in.timeoutSeconds;
        s.jsonMode = in.jsonMode;
        s.reasoningEffort = in.reasoningEffort == null || in.reasoningEffort.isBlank() ? stored.reasoningEffort
                : in.reasoningEffort.trim().toLowerCase();
        s.extraHeaders = in.extraHeaders == null ? stored.extraHeaders : in.extraHeaders;
        if (Boolean.TRUE.equals(in.clearApiKey)) {
            s.apiKey = "";
        } else if (isUnchangedOrEmptyKey(in.apiKey, stored.apiKey)) {
            s.apiKey = stored.apiKey;
        } else {
            s.apiKey = in.apiKey.trim();
        }
        return s;
    }

    private static String validate(AiSettings s) {
        if (isBlank(s.baseUrl) || !(s.baseUrl.startsWith("http://") || s.baseUrl.startsWith("https://"))) {
            return "Base URL must start with http:// or https://";
        }
        if (host(s.baseUrl) == null)
            return "Base URL is not a valid URL";
        if (s.enabled && isBlank(s.model))
            return "Enter a model id before enabling AI";
        if (s.temperature < 0 || s.temperature > 2)
            return "Temperature must be between 0 and 2";
        if (s.maxTokens < 1 || s.maxTokens > 1_000_000)
            return "Max tokens must be between 1 and 1,000,000";
        if (s.timeoutSeconds < 1 || s.timeoutSeconds > 600)
            return "Timeout must be between 1 and 600 seconds";
        if (s.reasoningEffort != null && !s.reasoningEffort.equals("default")
                && !AiClient.REASONING_EFFORTS.contains(s.reasoningEffort))
            return "Reasoning effort must be one of none, minimal, low, medium, high or default";
        return null;
    }

    /** Settings for the page: everything except the key itself. */
    private static Map<String, Object> publicView(AiSettings s) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", s.enabled);
        body.put("baseUrl", s.baseUrl);
        body.put("model", s.model);
        body.put("temperature", s.temperature);
        body.put("maxTokens", s.maxTokens);
        body.put("timeoutSeconds", s.timeoutSeconds);
        body.put("jsonMode", s.jsonMode);
        body.put("reasoningEffort", s.reasoningEffort);
        body.put("extraHeaders", s.extraHeaders);
        boolean hasKey = !isBlank(s.apiKey);
        body.put("apiKeySet", hasKey);
        body.put("apiKeyPreview", hasKey ? maskKey(s.apiKey) : "");
        body.put("usable", s.isUsable());
        return body;
    }

    private static String maskKey(String key) {
        if (key == null)
            return "";
        String k = key.trim();
        if (k.length() <= 8)
            return "••••";
        return k.substring(0, Math.min(5, k.length() - 4)) + "••••" + k.substring(k.length() - 4);
    }

    private static boolean isUnchangedOrEmptyKey(String apiKey, String storedKey) {
        return isBlank(apiKey) || apiKey.contains("••••") || apiKey.equals(maskKey(storedKey));
    }

    private static String serverTarget(String url) {
        if (url == null || url.isBlank()) {
            return "";
        }
        try {
            URI u = URI.create(url.trim());
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase();
            int port = u.getPort();
            if (port == -1) {
                if ("http".equals(scheme)) port = 80;
                else if ("https".equals(scheme)) port = 443;
            }
            String path = u.getPath() == null ? "" : u.getPath();
            while (path.endsWith("/") && path.length() > 1) {
                path = path.substring(0, path.length() - 1);
            }
            return scheme + "://" + host + ":" + port + path;
        } catch (IllegalArgumentException e) {
            return url.trim();
        }
    }

    private static String host(String url) {
        try {
            return url == null ? null : URI.create(url.trim()).getHost();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * Only signed-in people on the owners' list may see or change the AI settings
     * (they hold the API key).
     */
    private static boolean requireOwner(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        User user = AuthServlet.currentUser(req);
        if (user == null) {
            JsonUtil.error(resp, 401, "Sign in to view or change AI settings");
            return false;
        }
        if (!AiAccess.isAllowed(user)) {
            JsonUtil.error(resp, 403, "AI settings are only available to the TravelMate owners");
            return false;
        }
        return true;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String action(HttpServletRequest req) {
        String[] parts = JsonUtil.pathParts(req);
        return parts.length == 1 ? parts[0] : "";
    }
}

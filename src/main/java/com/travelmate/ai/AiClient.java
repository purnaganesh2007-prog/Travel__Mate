package com.travelmate.ai;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.travelmate.model.AiSettings;
import com.travelmate.util.JsonUtil;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Minimal client for OpenAI-compatible APIs (POST {baseUrl}/chat/completions,
 * GET {baseUrl}/models). Works with OpenRouter, OpenAI, Groq, Gemini's OpenAI
 * endpoint, Ollama, LM Studio and most lab/experimental endpoints.
 */
public class AiClient {

    /** Raised for any failure talking to the model, with a message fit to show the user. */
    public static class AiException extends Exception {
        public AiException(String message) {
            super(message);
        }
    }

    /** A non-2xx reply from the AI server. */
    private static class AiHttpException extends AiException {
        final int status;
        final String detail;

        AiHttpException(String message, int status, String detail) {
            super(message);
            this.status = status;
            this.detail = detail == null ? "" : detail;
        }
    }

    /** The reply stopped at the output limit (finish_reason "length"). */
    private static class CutOffException extends AiException {
        CutOffException(String message) {
            super(message);
        }
    }

    /** Which optional request parameters a provider/model accepts, learned from its HTTP 400 replies. */
    private static class Quirks {
        volatile String effort;
        volatile boolean noTemperature;
        volatile boolean noResponseFormat;
        volatile boolean maxCompletionTokens;

        Quirks(String effort) {
            this.effort = effort;
        }

        /** Changes the request to avoid the parameter the error names; false when there is nothing left to change. */
        synchronized boolean adaptTo(String error) {
            String e = error.toLowerCase(Locale.ROOT);
            if (e.contains("reasoning") && effort != null) {
                // Some models cannot switch reasoning off: fall back to the lightest setting, then to the default
                effort = effort.equals("none") || effort.equals("minimal") ? "low" : null;
                return true;
            }
            if (e.contains("max_completion_tokens") && !maxCompletionTokens) {
                maxCompletionTokens = true;
                return true;
            }
            if (e.contains("temperature") && !noTemperature) {
                noTemperature = true;
                return true;
            }
            if (e.contains("response_format") && !noResponseFormat) {
                noResponseFormat = true;
                return true;
            }
            return false;
        }
    }

    private static final Map<String, Quirks> QUIRKS = new ConcurrentHashMap<>();

    /** Reasoning efforts that can be sent; anything else (blank, "default") sends no reasoning_effort. */
    public static final Set<String> REASONING_EFFORTS = Set.of("none", "minimal", "low", "medium", "high");

    private static String normalizeEffort(String effort) {
        String e = effort == null ? "" : effort.trim().toLowerCase(Locale.ROOT);
        return REASONING_EFFORTS.contains(e) ? e : null;
    }

    private final AiSettings settings;
    private final HttpClient http;

    public AiClient(AiSettings settings) {
        this(settings, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build());
    }

    public AiClient(AiSettings settings, HttpClient http) {
        this.settings = settings;
        this.http = http != null ? http : HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /** Sends a system + user message and returns the assistant's text. */
    public String chat(String system, String user) throws AiException {
        return chat(system, user, 0);
    }

    /**
     * Sends a system + user message and returns the assistant's text.
     *
     * minOutputTokens is the caller's estimate of how long the reply will be; the output limit
     * sent to the provider is the larger of that and the "Max tokens" setting, so a long trip
     * is not cut off by a limit meant for a short one.
     *
     * Providers and models differ in which optional parameters they accept. A request refused
     * because of one of them (reasoning effort, temperature, JSON mode, the name of the output
     * limit) is retried without it, and what worked is remembered for that model. A reply cut
     * off at the output limit is retried once with a larger limit.
     */
    public String chat(String system, String user, int minOutputTokens) throws AiException {
        String effort = normalizeEffort(settings.reasoningEffort);
        String quirksKey = (settings.baseUrl == null ? "" : settings.baseUrl.trim()) + "|" + settings.model
                + "|" + effort;
        Quirks q = QUIRKS.computeIfAbsent(quirksKey, k -> new Quirks(effort));
        int maxTokens = settings.maxTokens > 0 ? Math.max(settings.maxTokens, minOutputTokens) : 0;
        boolean retriedForLength = false;

        for (int attempt = 0;; attempt++) {
            JsonObject response;
            try {
                response = send(request("/chat/completions")
                        .POST(HttpRequest.BodyPublishers.ofString(JsonUtil.GSON.toJson(
                                chatBody(system, user, maxTokens, q)))));
            } catch (AiHttpException e) {
                if (e.status == 400 && attempt < 6 && q.adaptTo(e.detail)) continue;
                throw e;
            }
            try {
                return replyText(response);
            } catch (CutOffException e) {
                if (retriedForLength || maxTokens <= 0) throw e;
                // Hidden reasoning tokens count against the limit too: give the model room and try once more
                retriedForLength = true;
                maxTokens = Math.min(Math.max(maxTokens * 3, 12_000), 64_000);
            }
        }
    }

    private JsonObject chatBody(String system, String user, int maxTokens, Quirks q) {
        JsonObject body = new JsonObject();
        body.addProperty("model", settings.model);
        JsonArray messages = new JsonArray();
        messages.add(message("system", system));
        messages.add(message("user", user));
        body.add("messages", messages);
        if (!q.noTemperature) body.addProperty("temperature", settings.temperature);
        if (maxTokens > 0) body.addProperty(q.maxCompletionTokens ? "max_completion_tokens" : "max_tokens", maxTokens);
        if (q.effort != null) body.addProperty("reasoning_effort", q.effort);
        if (settings.jsonMode && !q.noResponseFormat) {
            JsonObject format = new JsonObject();
            format.addProperty("type", "json_object");
            body.add("response_format", format);
        }
        return body;
    }

    private String replyText(JsonObject response) throws AiException {
        JsonArray choices = response.has("choices") && response.get("choices").isJsonArray()
                ? response.getAsJsonArray("choices") : null;
        if (choices == null || choices.isEmpty() || !choices.get(0).isJsonObject()) {
            throw new AiException("The model returned no choices: " + sanitize(snippet(response.toString())));
        }
        JsonObject first = choices.get(0).getAsJsonObject();
        String finishReason = first.has("finish_reason") && !first.get("finish_reason").isJsonNull()
                ? first.get("finish_reason").getAsString() : "unknown";
        JsonObject msg = first.has("message") && first.get("message").isJsonObject()
                ? first.getAsJsonObject("message") : null;
        String text = msg == null ? null : contentText(msg.get("content"));
        if ("length".equalsIgnoreCase(finishReason)) {
            throw new CutOffException("The AI provider cut off the itinerary because its output limit was reached. "
                    + "Choose a model with a larger output limit or reduce the trip length.");
        }
        if (text == null || text.isBlank()) {
            throw new AiException("The model returned an empty reply (finish_reason " + finishReason
                    + "). Check the selected model and its provider limits.");
        }
        return text;
    }

    /** Model ids offered by the provider (empty when it has no /models endpoint). */
    public List<String> listModels() throws AiException {
        JsonObject response = send(request("/models").GET());
        List<String> ids = new ArrayList<>();
        JsonElement data = response.get("data");
        if (data != null && data.isJsonArray()) {
            for (JsonElement el : data.getAsJsonArray()) {
                if (el.isJsonObject() && el.getAsJsonObject().has("id")) {
                    JsonElement idEl = el.getAsJsonObject().get("id");
                    if (idEl != null && idEl.isJsonPrimitive()) {
                        ids.add(idEl.getAsString());
                    }
                }
            }
        }
        ids.sort(String::compareToIgnoreCase);
        return ids;
    }

    private HttpRequest.Builder request(String path) throws AiException {
        String base = settings.baseUrl == null ? "" : settings.baseUrl.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            throw new AiException("Base URL must start with http:// or https://");
        }
        HttpRequest.Builder b;
        try {
            b = HttpRequest.newBuilder(URI.create(base + path));
        } catch (IllegalArgumentException e) {
            throw new AiException("Invalid base URL: " + e.getMessage());
        }
        b.timeout(Duration.ofSeconds(Math.max(settings.timeoutSeconds, 1)))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json");
        if (settings.apiKey != null && !settings.apiKey.isBlank()) {
            b.header("Authorization", "Bearer " + settings.apiKey.trim());
        }
        if (settings.extraHeaders != null) {
            for (String line : settings.extraHeaders.split("\\R")) {
                int colon = line.indexOf(':');
                if (colon <= 0) continue;
                String name = line.substring(0, colon).trim();
                String value = line.substring(colon + 1).trim();
                if (name.isEmpty() || name.equalsIgnoreCase("Authorization") || name.equalsIgnoreCase("Content-Type")) continue;
                try {
                    b.header(name, value);
                } catch (IllegalArgumentException e) {
                    throw new AiException("Invalid extra header \"" + name + "\": " + e.getMessage());
                }
            }
        }
        return b;
    }

    private JsonObject send(HttpRequest.Builder builder) throws AiException {
        HttpResponse<String> resp;
        try {
            resp = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (java.net.http.HttpTimeoutException e) {
            throw new AiException("The AI server did not answer within " + settings.timeoutSeconds + " seconds.");
        } catch (java.net.ConnectException e) {
            throw new AiException("Could not connect to " + settings.baseUrl + " (is the server running / URL correct?)");
        } catch (IOException e) {
            throw new AiException("Network error talking to the AI server: " + sanitize(e.getMessage()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiException("Request interrupted");
        }
        String text = resp.body() == null ? "" : resp.body();
        JsonObject json = null;
        try {
            JsonElement parsed = JsonParser.parseString(text);
            if (parsed.isJsonObject()) json = parsed.getAsJsonObject();
        } catch (RuntimeException ignored) {
            // handled below
        }
        if (resp.statusCode() / 100 != 2) {
            String detail = json != null ? errorMessage(json) : snippet(text);
            String hint = switch (resp.statusCode()) {
                case 401, 403 -> " — check the API key.";
                case 404 -> " — check the base URL and the model id.";
                case 429 -> " — rate limit or no credits left on this key.";
                default -> "";
            };
            throw new AiHttpException(sanitize("AI server returned HTTP " + resp.statusCode() + ": " + detail + hint),
                    resp.statusCode(), detail);
        }
        if (json == null) throw new AiException(sanitize("AI server reply was not JSON: " + snippet(text)));
        if (json.has("error")) throw new AiException(sanitize("AI server error: " + errorMessage(json)));
        return json;
    }

    private String sanitize(String text) {
        if (text == null) return "";
        if (settings.apiKey != null && !settings.apiKey.isBlank()) {
            return text.replace(settings.apiKey.trim(), "••••");
        }
        return text;
    }

    private static JsonObject message(String role, String content) {
        JsonObject m = new JsonObject();
        m.addProperty("role", role);
        m.addProperty("content", content);
        return m;
    }

    /** Content may be a plain string or a list of {type:"text", text:"..."} parts. */
    private static String contentText(JsonElement content) {
        if (content == null || content.isJsonNull()) return null;
        if (content.isJsonPrimitive()) return content.getAsString();
        if (content.isJsonArray()) {
            StringBuilder sb = new StringBuilder();
            for (JsonElement part : content.getAsJsonArray()) {
                if (part.isJsonObject() && part.getAsJsonObject().has("text")) sb.append(part.getAsJsonObject().get("text").getAsString());
            }
            return sb.toString();
        }
        return null;
    }

    private static String errorMessage(JsonObject json) {
        JsonElement err = json.get("error");
        if (err != null && err.isJsonObject() && err.getAsJsonObject().has("message")) {
            return err.getAsJsonObject().get("message").getAsString();
        }
        if (err != null && err.isJsonPrimitive()) return err.getAsString();
        if (json.has("message")) return json.get("message").getAsString();
        return snippet(json.toString());
    }

    private static String snippet(String s) {
        s = s.replaceAll("\\s+", " ").trim();
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }
}

package com.travelmate.model;

/** Connection settings for an OpenAI-compatible chat completions API. */
public class AiSettings {
    public boolean enabled;
    public String baseUrl;
    public String apiKey;
    public String model;
    public double temperature = 0.7;
    public int maxTokens = 4000;
    public int timeoutSeconds = 90;
    public boolean jsonMode;
    /**
     * How much hidden "thinking" a reasoning model does before answering: none, minimal, low,
     * medium, high, or "default" to leave it to the provider. Thinking is slow and uses up the
     * output limit, so itineraries are generated with "none" unless changed.
     */
    public String reasoningEffort = "none";
    /** "Name: value" pairs, one per line. */
    public String extraHeaders;

    /** True when enough is configured to attempt a request. */
    public boolean isUsable() {
        return enabled && baseUrl != null && !baseUrl.isBlank() && model != null && !model.isBlank();
    }
}

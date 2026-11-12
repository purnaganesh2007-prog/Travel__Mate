package com.travelmate.dao;

import com.travelmate.db.DBConnection;
import com.travelmate.model.AiSettings;
import com.travelmate.util.EnvLoader;

import java.io.InputStream;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;

/**
 * AI settings. Priority: values saved in the ai_settings table (AI Settings page),
 * then environment variables TM_AI_*, then ai.properties on the classpath.
 */
public class AiSettingsDAO {

    public AiSettings load() throws SQLException {
        Map<String, String> values = defaults();
        try (Connection con = DBConnection.getConnection();
             Statement st = con.createStatement();
             ResultSet rs = st.executeQuery("SELECT setting_key, setting_value FROM ai_settings")) {
            while (rs.next()) values.put(rs.getString(1), rs.getString(2));
        }
        return fromMap(values);
    }

    public void save(AiSettings s) throws SQLException {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("enabled", String.valueOf(s.enabled));
        values.put("baseUrl", s.baseUrl);
        values.put("apiKey", s.apiKey);
        values.put("model", s.model);
        values.put("temperature", String.valueOf(s.temperature));
        values.put("maxTokens", String.valueOf(s.maxTokens));
        values.put("timeoutSeconds", String.valueOf(s.timeoutSeconds));
        values.put("jsonMode", String.valueOf(s.jsonMode));
        values.put("reasoningEffort", s.reasoningEffort == null ? "none" : s.reasoningEffort);
        values.put("extraHeaders", s.extraHeaders);
        try (Connection con = DBConnection.getConnection()) {
            con.setAutoCommit(false);
            try (PreparedStatement del = con.prepareStatement("DELETE FROM ai_settings WHERE setting_key = ?");
                 PreparedStatement ins = con.prepareStatement(
                         "INSERT INTO ai_settings (setting_key, setting_value) VALUES (?, ?)")) {
                for (Map.Entry<String, String> e : values.entrySet()) {
                    del.setString(1, e.getKey());
                    del.executeUpdate();
                    ins.setString(1, e.getKey());
                    ins.setString(2, e.getValue() == null ? "" : e.getValue());
                    ins.executeUpdate();
                }
                con.commit();
            } catch (SQLException e) {
                con.rollback();
                throw e;
            }
        }
    }

    /** Forget the values saved from the page, going back to ai.properties / environment. */
    public void reset() throws SQLException {
        try (Connection con = DBConnection.getConnection(); Statement st = con.createStatement()) {
            st.executeUpdate("DELETE FROM ai_settings");
        }
    }

    private static Map<String, String> defaults() {
        Properties props = new Properties();
        try (InputStream in = AiSettingsDAO.class.getClassLoader().getResourceAsStream("ai.properties")) {
            if (in != null) props.load(in);
        } catch (Exception ignored) {
            // fall back to built-in defaults
        }
        Map<String, String> values = new HashMap<>();
        for (String name : props.stringPropertyNames()) {
            if (name.startsWith("ai.")) values.put(name.substring(3), props.getProperty(name));
        }
        env(values, "TM_AI_BASE_URL", "baseUrl");
        env(values, "TM_AI_API_KEY", "apiKey");
        env(values, "TM_AI_MODEL", "model");
        env(values, "TM_AI_TEMPERATURE", "temperature");
        env(values, "TM_AI_MAX_TOKENS", "maxTokens");
        env(values, "TM_AI_TIMEOUT_SECONDS", "timeoutSeconds");
        env(values, "TM_AI_JSON_MODE", "jsonMode");
        env(values, "TM_AI_REASONING_EFFORT", "reasoningEffort");
        // Setting a key and model through the environment implies "enabled"
        String key = values.get("apiKey");
        String mod = values.get("model");
        if (key != null && !key.isBlank() && mod != null && !mod.isBlank()) values.put("enabled", "true");
        return values;
    }

    private static void env(Map<String, String> values, String var, String key) {
        String v = System.getenv(var);
        if (v == null || v.isBlank()) v = EnvLoader.get(var);
        if (v != null && !v.isBlank()) values.put(key, v);
    }

    private static AiSettings fromMap(Map<String, String> v) {
        AiSettings s = new AiSettings();
        s.enabled = Boolean.parseBoolean(v.getOrDefault("enabled", "false"));
        s.baseUrl = v.getOrDefault("baseUrl", "");
        s.apiKey = v.getOrDefault("apiKey", "");
        s.model = v.getOrDefault("model", "");
        s.temperature = parseDouble(v.get("temperature"), 0.7);
        s.maxTokens = (int) parseDouble(v.get("maxTokens"), 4000);
        s.timeoutSeconds = (int) parseDouble(v.get("timeoutSeconds"), 90);
        s.jsonMode = Boolean.parseBoolean(v.getOrDefault("jsonMode", "false"));
        String effort = v.get("reasoningEffort");
        s.reasoningEffort = effort == null || effort.isBlank() ? "none" : effort.trim().toLowerCase();
        // \n written literally in ai.properties means a new header line
        s.extraHeaders = v.getOrDefault("extraHeaders", "").replace("\\n", "\n");
        return s;
    }

    private static double parseDouble(String s, double fallback) {
        try {
            return s == null || s.isBlank() ? fallback : Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}

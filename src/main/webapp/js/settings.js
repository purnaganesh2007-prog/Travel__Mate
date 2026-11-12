/**
 * TRAVELMATE — AI SETTINGS PAGE
 * Edit the OpenAI-compatible model connection (base URL, key, model...) used by the planner.
 */

const store = window.TravelMateStore;
const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  $("ai-provider").addEventListener("change", (e) => {
    if (e.target.value !== "custom") $("ai-base-url").value = e.target.value;
    updateKeyHint();
  });
  $("ai-base-url").addEventListener("input", syncProviderPreset);

  await store.ready;
  if (!store.isOnline()) {
    $("ai-offline").classList.remove("d-none");
    setBadge("Server offline", "tm-badge-warning");
    return;
  }
  try {
    fillForm(await store.request("GET", "/ai/settings"));
    $("ai-settings-body").classList.remove("d-none");
  } catch (err) {
    if (err.status === 401) {
      $("ai-signin-required").classList.remove("d-none");
      setBadge("Sign in required", "tm-badge-warning");
    } else if (err.status === 403) {
      $("ai-forbidden").classList.remove("d-none");
      setBadge("Owners only", "tm-badge-warning");
    } else {
      showResult(false, err.message);
    }
  }
});

function fillForm(s) {
  $("ai-enabled").checked = s.enabled;
  $("ai-base-url").value = s.baseUrl || "";
  $("ai-model").value = s.model || "";
  $("ai-temperature").value = s.temperature;
  $("ai-max-tokens").value = s.maxTokens;
  $("ai-timeout").value = s.timeoutSeconds;
  $("ai-json-mode").checked = s.jsonMode;
  $("ai-reasoning-effort").value = s.reasoningEffort || "none";
  if (!$("ai-reasoning-effort").value) $("ai-reasoning-effort").value = "none";
  $("ai-extra-headers").value = s.extraHeaders || "";
  $("ai-api-key").value = "";
  $("ai-api-key").placeholder = s.apiKeySet ? `Saved key: ${s.apiKeyPreview} (leave empty to keep it)` : "Paste your key";
  $("ai-clear-key").checked = false;
  $("ai-clear-key-wrap").classList.toggle("d-none", !s.apiKeySet);
  syncProviderPreset();
  setBadge(s.usable ? `AI on · ${s.model}` : (s.enabled ? "Incomplete settings" : "AI off (template planner)"),
    s.usable ? "tm-badge-success" : "tm-badge-warning");
}

/** Current form values; apiKey empty means "keep the saved key". */
function readForm() {
  return {
    enabled: $("ai-enabled").checked,
    baseUrl: $("ai-base-url").value.trim(),
    apiKey: $("ai-api-key").value.trim(),
    clearApiKey: $("ai-clear-key").checked,
    model: $("ai-model").value.trim(),
    temperature: Number($("ai-temperature").value || 0.7),
    maxTokens: Number($("ai-max-tokens").value || 4000),
    timeoutSeconds: Number($("ai-timeout").value || 90),
    jsonMode: $("ai-json-mode").checked,
    reasoningEffort: $("ai-reasoning-effort").value,
    extraHeaders: $("ai-extra-headers").value
  };
}

function syncProviderPreset() {
  const url = $("ai-base-url").value.trim().replace(/\/+$/, "");
  const match = [...$("ai-provider").options].find(o => o.value === url);
  $("ai-provider").value = match ? match.value : "custom";
  updateKeyHint();
}

function updateKeyHint() {
  const local = /localhost|127\.0\.0\.1/.test($("ai-base-url").value);
  $("ai-key-help").textContent = local
    ? "Local servers (Ollama, LM Studio) usually need no key — leave it empty."
    : "Stored on the server only; it is never sent back to the browser.";
}

async function handleSaveAiSettings(event) {
  event.preventDefault();
  try {
    const saved = await store.request("PUT", "/ai/settings", readForm());
    fillForm(saved);
    showToast(saved.keyDropped
      ? "Saved. The old API key was removed because the base URL changed — enter a key for the new server."
      : "AI settings saved", saved.keyDropped ? "warning" : "success", "bi-check-circle-fill", 6000);
  } catch (err) {
    showToast(err.message, "danger", "bi-exclamation-octagon", 6000);
  }
}

async function handleTestAi() {
  const btn = $("ai-test-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Testing…';
  try {
    const r = await store.request("POST", "/ai/test", readForm());
    showResult(true, `<strong>Connected</strong> to <code>${escapeHtml(r.model)}</code> in ${(r.elapsedMs / 1000).toFixed(1)}s.<br>Reply: “${escapeHtml(r.reply)}”`);
  } catch (err) {
    showResult(false, escapeHtml(err.message));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plug"></i> Test Connection';
  }
}

async function handleLoadModels() {
  const btn = $("ai-load-models-btn");
  btn.disabled = true;
  try {
    const { models } = await store.request("POST", "/ai/models", readForm());
    $("ai-model-list").innerHTML = models.map(m => `<option value="${escapeHtml(m)}">`).join("");
    $("ai-models-help").textContent = models.length
      ? `${models.length} models available — start typing in the Model id box to search them.`
      : "This provider did not list any models; type the model id yourself.";
    $("ai-model").focus();
  } catch (err) {
    $("ai-models-help").textContent = `Could not load models: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

async function handleResetAiSettings() {
  if (!confirm("Forget the settings saved here and go back to the defaults in ai.properties?")) return;
  try {
    fillForm(await store.request("DELETE", "/ai/settings"));
    showToast("AI settings reset to file defaults", "primary", "bi-arrow-counterclockwise");
  } catch (err) {
    showToast(err.message, "danger", "bi-exclamation-octagon");
  }
}

function toggleKeyVisibility() {
  const input = $("ai-api-key");
  input.type = input.type === "password" ? "text" : "password";
}

function showResult(ok, html) {
  const box = $("ai-test-result");
  box.className = `alert ${ok ? "alert-success" : "alert-danger"} small mb-0`;
  box.innerHTML = `<i class="bi ${ok ? "bi-check-circle-fill" : "bi-x-octagon-fill"}"></i> ${html}`;
}

function setBadge(text, cls) {
  const badge = $("ai-status-badge");
  badge.className = `tm-badge ${cls}`;
  badge.textContent = text;
}

window.handleSaveAiSettings = handleSaveAiSettings;
window.handleTestAi = handleTestAi;
window.handleLoadModels = handleLoadModels;
window.handleResetAiSettings = handleResetAiSettings;
window.toggleKeyVisibility = toggleKeyVisibility;

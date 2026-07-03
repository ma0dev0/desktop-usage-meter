const DEFAULT_TIMEOUT_MS = 8000;

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function explicitBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function finiteTimeout(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1000 && number <= 30000
    ? Math.round(number)
    : DEFAULT_TIMEOUT_MS;
}

function normalizeWearSyncConfig(raw = {}) {
  const endpointUrl = trimmed(raw.endpointUrl || raw.url || raw.apiUrl);
  const apiKey = trimmed(raw.apiKey || raw.key);
  return {
    enabled: explicitBoolean(raw.enabled, Boolean(endpointUrl && apiKey)),
    endpointUrl,
    apiKey,
    timeoutMs: finiteTimeout(raw.timeoutMs)
  };
}

function envWearSyncConfig(env = {}) {
  return normalizeWearSyncConfig({
    enabled: env.USAGE_METER_WEAR_SYNC,
    endpointUrl: env.USAGE_METER_WEAR_API_URL,
    apiKey: env.USAGE_METER_WEAR_API_KEY,
    timeoutMs: env.USAGE_METER_WEAR_TIMEOUT_MS
  });
}

async function postWearPayload(payload, config, fetchImpl = globalThis.fetch) {
  const normalized = normalizeWearSyncConfig(config);
  if (!normalized.enabled) return { ok: false, skipped: true, error: 'WEAR_SYNC_DISABLED' };
  if (!normalized.endpointUrl || !normalized.apiKey) {
    return { ok: false, skipped: true, error: 'WEAR_SYNC_NOT_CONFIGURED' };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, skipped: false, error: 'FETCH_UNAVAILABLE' };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), normalized.timeoutMs)
    : null;

  try {
    const response = await fetchImpl(normalized.endpointUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${normalized.apiKey}`,
        'x-api-key': normalized.apiKey
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    });

    if (!response || !response.ok) {
      return {
        ok: false,
        skipped: false,
        error: `HTTP_${response && response.status ? response.status : 'UNKNOWN'}`
      };
    }
    return { ok: true, skipped: false, status: response.status };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error && error.name === 'AbortError' ? 'TIMEOUT' : (error && error.message) || 'REQUEST_FAILED'
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  envWearSyncConfig,
  normalizeWearSyncConfig,
  postWearPayload
};

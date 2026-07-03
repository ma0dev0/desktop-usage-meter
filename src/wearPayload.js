function finitePercent(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : null;
}

function normalizedIso(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function providerById(status, id) {
  const providers = status && Array.isArray(status.providers) ? status.providers : [];
  return providers.find(provider => provider && provider.id === id) || null;
}

function limitByKey(provider, key) {
  const limits = provider && Array.isArray(provider.limits) ? provider.limits : [];
  return limits.find(limit => limit && limit.key === key) || null;
}

function limitPayload(limit) {
  return {
    percent: finitePercent(limit && limit.percentUsed),
    resetAt: normalizedIso(limit && limit.resetAt),
    resetLabel: limit && limit.resetLabel ? String(limit.resetLabel) : null
  };
}

function latestCapturedAt(providers) {
  const latest = providers.reduce((max, provider) => {
    const time = Date.parse(provider && provider.capturedAt);
    return Number.isFinite(time) && time > max ? time : max;
  }, 0);
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function providerPayload(provider, sessionLabel) {
  const session = limitPayload(limitByKey(provider, 'fivehour'));
  const weekly = limitPayload(limitByKey(provider, 'weekly'));

  return {
    name: provider ? provider.name : '',
    color: provider ? provider.color : '',
    visible: Boolean(provider && provider.visible),
    loggedIn: provider ? provider.loggedIn : null,
    capturedAt: normalizedIso(provider && provider.capturedAt),
    sessionLabel,
    sessionPercent: session.percent,
    weeklyPercent: weekly.percent,
    sessionResetAt: session.resetAt,
    weeklyResetAt: weekly.resetAt,
    sessionResetLabel: session.resetLabel,
    weeklyResetLabel: weekly.resetLabel,
    refreshError: provider && provider.refreshError ? provider.refreshError.note : null
  };
}

function buildWearPayload(status = {}) {
  const providers = status && Array.isArray(status.providers) ? status.providers : [];
  const updatedAt = latestCapturedAt(providers) || normalizedIso(status.updatedAt) || new Date().toISOString();

  return {
    schemaVersion: 1,
    codex: providerPayload(providerById(status, 'codex'), '5時間'),
    claude: providerPayload(providerById(status, 'claude'), 'セッション'),
    updatedAt,
    generatedAt: normalizedIso(status.updatedAt) || new Date().toISOString()
  };
}

module.exports = {
  buildWearPayload
};

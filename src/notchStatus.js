const { shouldDisplayProvider } = require('./providerVisibility');
const { refreshErrorLabel, refreshErrorNote } = require('./refreshStatus');
const UsagePace = require('../renderer/usagePace');

const LIMIT_DEFS = [
  {
    key: 'fivehour',
    label: '5時間',
    sectionKeys: ['session', 'fivehour'],
    period: 'session'
  },
  {
    key: 'weekly',
    label: '週間',
    sectionKeys: ['weekly'],
    period: 'weekly'
  }
];

function normalizePercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toTimeMs(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIso(value) {
  const timeMs = toTimeMs(value);
  return timeMs == null ? null : new Date(timeMs).toISOString();
}

function percentUsed(section) {
  if (!section) return null;
  if (section.percentUsed != null) return normalizePercent(section.percentUsed);
  if (section.percentRemaining != null) return normalizePercent(100 - section.percentRemaining);
  return null;
}

function percentRemaining(section) {
  if (!section) return null;
  if (section.percentRemaining != null) return normalizePercent(section.percentRemaining);
  if (section.percentUsed != null) return normalizePercent(100 - section.percentUsed);
  return null;
}

function findSection(sections, keys) {
  return sections.find(section => section && keys.includes(section.key)) || null;
}

function buildPaceInfo({ section, period, capturedAt, nowMs, weeklyPaceMode }) {
  if (!section) return null;
  const capturedAtMs = toTimeMs(capturedAt);
  if (capturedAtMs == null) return null;

  const info = period === 'weekly'
    ? UsagePace.getWeeklyInfo(section, capturedAtMs, nowMs, weeklyPaceMode)
    : UsagePace.getSessionInfo(section, capturedAtMs, nowMs);

  return {
    resetAt: toIso(info.resetAt),
    resetLabel: info.resetLabel || null,
    expectedUsed: normalizePercent(info.expectedUsed),
    pace: info.pace ? {
      kind: info.pace.kind || 'unknown',
      label: info.pace.label || '',
      projected: Number.isFinite(info.pace.projected) ? Math.round(info.pace.projected) : null
    } : null
  };
}

function buildLimits(result, prefs, nowMs) {
  const sections = result && Array.isArray(result.sections) ? result.sections : [];
  return LIMIT_DEFS.map(def => {
    const section = findSection(sections, def.sectionKeys);
    const paceInfo = buildPaceInfo({
      section,
      period: def.period,
      capturedAt: result && result.capturedAt,
      nowMs,
      weeklyPaceMode: prefs.weeklyPaceMode === 'weekdays' ? 'weekdays' : 'calendar'
    });

    return {
      key: def.key,
      sourceKey: section ? section.key : null,
      label: def.label,
      percentUsed: percentUsed(section),
      percentRemaining: percentRemaining(section),
      resetText: section && section.resetText ? section.resetText : '',
      resetAt: paceInfo ? paceInfo.resetAt : null,
      resetLabel: paceInfo ? paceInfo.resetLabel : null,
      expectedUsed: paceInfo ? paceInfo.expectedUsed : null,
      pace: paceInfo ? paceInfo.pace : null
    };
  });
}

function getResultPercentRemaining(result) {
  if (!result || result.loggedIn === false) return null;
  if (result.percentRemaining != null) return normalizePercent(result.percentRemaining);

  const values = buildLimits(result, { weeklyPaceMode: 'calendar' }, Date.now())
    .map(limit => limit.percentRemaining)
    .filter(Number.isFinite);
  if (values.length === 0) return null;
  return Math.min.apply(null, values);
}

function refreshErrorStatus(error, result) {
  const label = refreshErrorLabel(error);
  if (!label) return null;
  return {
    code: typeof error === 'string' ? error : error.error || 'UNKNOWN',
    label,
    note: refreshErrorNote(error, Boolean(result)),
    hasPreviousValue: Boolean(result)
  };
}

function buildProviderStatus({ id, meta, result, prefs, nowMs, refreshError, refreshing, refreshingProviders }) {
  const percentRemainingValue = getResultPercentRemaining(result);
  const enabled = Boolean(prefs.providers && prefs.providers[id]);
  const visible = shouldDisplayProvider({ id, enabled }, result);
  const hasRefreshingProviderMap = refreshingProviders && typeof refreshingProviders === 'object';

  return {
    id,
    name: meta.name,
    color: meta.color,
    enabled,
    visible,
    loggedIn: result ? result.loggedIn !== false : null,
    percentRemaining: percentRemainingValue,
    percentUsed: percentRemainingValue == null ? null : 100 - percentRemainingValue,
    capturedAt: result && result.capturedAt ? toIso(result.capturedAt) : null,
    refreshing: hasRefreshingProviderMap
      ? Boolean(refreshingProviders[id] && enabled)
      : Boolean(refreshing && enabled),
    refreshError: refreshErrorStatus(refreshError, result),
    limits: buildLimits(result, prefs, nowMs)
  };
}

function buildNotchStatus({
  providers = {},
  results = {},
  prefs = {},
  nowMs = Date.now(),
  refreshErrors = {},
  refreshing = false,
  refreshingProviders = null
} = {}) {
  return {
    schemaVersion: 4,
    updatedAt: new Date(nowMs).toISOString(),
    refreshing: Boolean(refreshing),
    weeklyPaceMode: prefs.weeklyPaceMode === 'weekdays' ? 'weekdays' : 'calendar',
    providers: Object.keys(providers).map(id => buildProviderStatus({
      id,
      meta: providers[id],
      result: results[id],
      prefs,
      nowMs,
      refreshError: refreshErrors[id],
      refreshing,
      refreshingProviders
    }))
  };
}

module.exports = {
  LIMIT_DEFS,
  buildLimits,
  buildNotchStatus,
  getResultPercentRemaining,
  refreshErrorStatus
};

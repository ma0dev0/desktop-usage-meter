const { STALE_AFTER_MS } = require('./freshness');

const MINUTE_MS = 60 * 1000;
const USAGE_THRESHOLDS = [80, 90, 95];
const RESET_THRESHOLDS_MIN = [30, 10];
const USAGE_RECOVERY_THRESHOLD = 75;

function cloneStateBranch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.assign({}, value);
}

function cloneState(state) {
  return {
    usage: cloneStateBranch(state && state.usage),
    resets: cloneStateBranch(state && state.resets)
  };
}

function toTimeMs(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function limitUsed(limit) {
  const used = normalizePercent(limit && limit.percentUsed);
  if (used != null) return used;
  const remaining = normalizePercent(limit && limit.percentRemaining);
  return remaining == null ? null : 100 - remaining;
}

function limitRemaining(limit) {
  const remaining = normalizePercent(limit && limit.percentRemaining);
  if (remaining != null) return remaining;
  const used = normalizePercent(limit && limit.percentUsed);
  return used == null ? null : 100 - used;
}

function highestCrossedThreshold(value, thresholds) {
  return thresholds.reduce((highest, threshold) => (
    value >= threshold ? threshold : highest
  ), null);
}

function resetThresholdFor(minutesRemaining) {
  if (!Number.isFinite(minutesRemaining) || minutesRemaining <= 0) return null;
  if (minutesRemaining <= 10) return 10;
  if (minutesRemaining <= 30) return 30;
  return null;
}

function providerIsFresh(provider, nowMs) {
  const capturedAt = toTimeMs(provider && provider.capturedAt);
  if (capturedAt == null) return false;
  return nowMs - capturedAt < STALE_AFTER_MS;
}

function shouldEvaluateProvider(provider) {
  return Boolean(
    provider &&
    provider.enabled !== false &&
    provider.visible !== false &&
    provider.loggedIn !== false &&
    !provider.refreshError
  );
}

function limitLabel(limit) {
  if (limit && limit.label) return limit.label;
  return limit && limit.key === 'weekly' ? '週間' : '5時間';
}

function usageCycleID(limit) {
  const resetAt = toTimeMs(limit && limit.resetAt);
  return resetAt == null ? 'unknown' : String(resetAt);
}

function usageEvent({ provider, limit, threshold, used }) {
  const remaining = limitRemaining(limit);
  const label = limitLabel(limit);
  const pace = limit && limit.pace && limit.pace.label ? ` / ${limit.pace.label}` : '';
  const reset = limit && limit.resetLabel ? ` / ${limit.resetLabel}` : '';
  return {
    kind: 'usage',
    level: threshold >= 95 ? 'critical' : (threshold >= 90 ? 'warning' : 'notice'),
    rank: threshold >= 95 ? 50 : (threshold >= 90 ? 40 : 30),
    title: `${provider.name} ${label} ${threshold}%到達`,
    body: `使用 ${used}%${remaining == null ? '' : ` / 残り ${remaining}%`}${pace}${reset}`,
    summary: `${provider.name} ${label}: 使用 ${used}%${remaining == null ? '' : ` / 残り ${remaining}%`}`
  };
}

function resetEvent({ provider, limit, threshold, minutesRemaining }) {
  const label = limitLabel(limit);
  const reset = limit && limit.resetLabel ? ` / ${limit.resetLabel}` : '';
  return {
    kind: 'reset',
    level: threshold <= 10 ? 'critical' : 'warning',
    rank: threshold <= 10 ? 45 : 35,
    title: `${provider.name} ${label} リセットまで${minutesRemaining}分`,
    body: `5時間制限のリセットが近づいています${reset}`,
    summary: `${provider.name} ${label}: リセットまで${minutesRemaining}分`
  };
}

function evaluateUsageLimit({ provider, limit, key, state, events }) {
  const used = limitUsed(limit);
  if (used == null) {
    delete state.usage[key];
    return;
  }

  const cycleID = usageCycleID(limit);
  const previous = state.usage[key] || {};
  const entry = previous.cycleID === cycleID
    ? Object.assign({}, previous)
    : { cycleID, threshold: null };

  if (used < USAGE_RECOVERY_THRESHOLD) {
    entry.threshold = null;
  }

  const threshold = highestCrossedThreshold(used, USAGE_THRESHOLDS);
  if (threshold != null && (!entry.threshold || threshold > entry.threshold)) {
    events.push(usageEvent({ provider, limit, threshold, used }));
    entry.threshold = threshold;
  }

  state.usage[key] = entry;
}

function evaluateResetLimit({ provider, limit, key, state, events, nowMs }) {
  if (!limit || limit.key !== 'fivehour') {
    delete state.resets[key];
    return;
  }

  const resetAt = toTimeMs(limit.resetAt);
  if (resetAt == null) {
    delete state.resets[key];
    return;
  }

  const remainingMs = resetAt - nowMs;
  if (remainingMs <= 0) {
    delete state.resets[key];
    return;
  }

  const minutesRemaining = Math.max(1, Math.ceil(remainingMs / MINUTE_MS));
  const threshold = resetThresholdFor(minutesRemaining);
  const previous = state.resets[key] || {};
  const resetID = String(resetAt);
  const entry = previous.resetID === resetID
    ? Object.assign({}, previous)
    : { resetID, threshold: null };

  if (threshold == null) {
    entry.threshold = null;
    state.resets[key] = entry;
    return;
  }

  if (!entry.threshold || threshold < entry.threshold) {
    events.push(resetEvent({ provider, limit, threshold, minutesRemaining }));
    entry.threshold = threshold;
  }

  state.resets[key] = entry;
}

function pruneStateBranch(branch, activeKeys) {
  for (const key of Object.keys(branch)) {
    if (!activeKeys.has(key)) delete branch[key];
  }
}

function evaluateThresholdNotifications({
  status,
  state = {},
  nowMs = Date.now()
} = {}) {
  const nextState = cloneState(state);
  const events = [];
  const activeUsageKeys = new Set();
  const activeResetKeys = new Set();
  const providers = status && Array.isArray(status.providers) ? status.providers : [];

  for (const provider of providers) {
    if (!shouldEvaluateProvider(provider)) continue;
    const fresh = providerIsFresh(provider, nowMs);
    const limits = Array.isArray(provider.limits) ? provider.limits : [];

    for (const limit of limits) {
      if (!limit || !limit.key) continue;
      const key = `${provider.id}:${limit.key}`;
      activeUsageKeys.add(key);
      if (fresh) {
        evaluateUsageLimit({ provider, limit, key, state: nextState, events });
      }

      if (limit.key === 'fivehour') {
        activeResetKeys.add(key);
        evaluateResetLimit({ provider, limit, key, state: nextState, events, nowMs });
      }
    }
  }

  pruneStateBranch(nextState.usage, activeUsageKeys);
  pruneStateBranch(nextState.resets, activeResetKeys);

  events.sort((a, b) => b.rank - a.rank);
  return { events, state: nextState };
}

function notificationStateChanged(a, b) {
  return JSON.stringify(cloneState(a)) !== JSON.stringify(cloneState(b));
}

module.exports = {
  RESET_THRESHOLDS_MIN,
  USAGE_THRESHOLDS,
  evaluateThresholdNotifications,
  notificationStateChanged
};

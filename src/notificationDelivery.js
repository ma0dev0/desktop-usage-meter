const NOTIFICATION_RETRY_DELAY_MS = 5 * 60 * 1000;

function canAttemptNotification(state = {}, nowMs = Date.now()) {
  return !Number.isFinite(state.retryAfterMs) || nowMs >= state.retryAfterMs;
}

function nextNotificationDeliveryState({
  delivered,
  nowMs = Date.now(),
  retryDelayMs = NOTIFICATION_RETRY_DELAY_MS
} = {}) {
  if (delivered) return {};
  return {
    retryAfterMs: nowMs + retryDelayMs
  };
}

module.exports = {
  NOTIFICATION_RETRY_DELAY_MS,
  canAttemptNotification,
  nextNotificationDeliveryState
};

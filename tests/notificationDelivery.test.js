const assert = require('assert').strict;
const {
  NOTIFICATION_RETRY_DELAY_MS,
  canAttemptNotification,
  nextNotificationDeliveryState
} = require('../src/notificationDelivery');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok   -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const nowMs = new Date('2026-07-02T12:00:00+09:00').getTime();

test('未失敗なら通知を試行できる', () => {
  assert.equal(canAttemptNotification({}, nowMs), true);
});

test('通知失敗後はリトライ時刻まで試行しない', () => {
  const state = nextNotificationDeliveryState({
    delivered: false,
    nowMs
  });

  assert.equal(state.retryAfterMs, nowMs + NOTIFICATION_RETRY_DELAY_MS);
  assert.equal(canAttemptNotification(state, state.retryAfterMs - 1), false);
  assert.equal(canAttemptNotification(state, state.retryAfterMs), true);
});

test('通知成功時は配送失敗状態をクリアする', () => {
  assert.deepEqual(nextNotificationDeliveryState({ delivered: true, nowMs }), {});
});

console.log(`\n${passed} passed`);

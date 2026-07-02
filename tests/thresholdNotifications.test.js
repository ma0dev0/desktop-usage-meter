const assert = require('assert').strict;
const {
  evaluateThresholdNotifications,
  notificationStateChanged
} = require('../src/thresholdNotifications');

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

const MINUTE_MS = 60 * 1000;
const baseNow = new Date('2026-07-02T12:00:00+09:00').getTime();

function iso(ms) {
  return new Date(ms).toISOString();
}

function status({
  nowMs = baseNow,
  used = 40,
  resetInMin = 180,
  weeklyUsed = null,
  refreshError = null,
  capturedAt = nowMs - MINUTE_MS
} = {}) {
  const limits = [
    {
      key: 'fivehour',
      label: '5時間',
      percentUsed: used,
      percentRemaining: 100 - used,
      resetAt: iso(nowMs + resetInMin * MINUTE_MS),
      resetLabel: '15:00にリセット',
      pace: { label: '速い' }
    }
  ];
  if (weeklyUsed != null) {
    limits.push({
      key: 'weekly',
      label: '週間',
      percentUsed: weeklyUsed,
      percentRemaining: 100 - weeklyUsed,
      resetAt: iso(nowMs + 2 * 24 * 60 * MINUTE_MS),
      pace: { label: '非常に速い' }
    });
  }

  return {
    providers: [
      {
        id: 'claude',
        name: 'Claude',
        enabled: true,
        visible: true,
        loggedIn: true,
        capturedAt: iso(capturedAt),
        refreshError,
        limits
      }
    ]
  };
}

test('使用量は80/90/95%の最高到達しきい値だけ通知する', () => {
  let state = {};
  let result = evaluateThresholdNotifications({
    status: status({ used: 82 }),
    state,
    nowMs: baseNow
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude 5時間 80%到達');
  state = result.state;

  result = evaluateThresholdNotifications({
    status: status({ used: 88 }),
    state,
    nowMs: baseNow + MINUTE_MS
  });
  assert.equal(result.events.length, 0);

  result = evaluateThresholdNotifications({
    status: status({ nowMs: baseNow + 2 * MINUTE_MS, used: 92 }),
    state: result.state,
    nowMs: baseNow + 2 * MINUTE_MS
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude 5時間 90%到達');

  result = evaluateThresholdNotifications({
    status: status({ nowMs: baseNow + 3 * MINUTE_MS, used: 96 }),
    state: result.state,
    nowMs: baseNow + 3 * MINUTE_MS
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude 5時間 95%到達');
});

test('週間制限も同じ使用量しきい値で通知する', () => {
  const result = evaluateThresholdNotifications({
    status: status({ used: 20, weeklyUsed: 91 }),
    state: {},
    nowMs: baseNow
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude 週間 90%到達');
});

test('5時間リセットは30分と10分で一度ずつ通知する', () => {
  let result = evaluateThresholdNotifications({
    status: status({ resetInMin: 30 }),
    state: {},
    nowMs: baseNow
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude 5時間 リセットまで30分');

  result = evaluateThresholdNotifications({
    status: status({
      nowMs: baseNow + MINUTE_MS,
      resetInMin: 29
    }),
    state: result.state,
    nowMs: baseNow + MINUTE_MS
  });
  assert.equal(result.events.length, 0);

  result = evaluateThresholdNotifications({
    status: status({
      nowMs: baseNow + 20 * MINUTE_MS,
      resetInMin: 10,
      capturedAt: baseNow - MINUTE_MS
    }),
    state: result.state,
    nowMs: baseNow + 20 * MINUTE_MS
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude 5時間 リセットまで10分');
});

test('取得エラー中のプロバイダーは通知しない', () => {
  const result = evaluateThresholdNotifications({
    status: status({ used: 98, resetInMin: 10, refreshError: { code: 'LOAD_FAILED' } }),
    state: {},
    nowMs: baseNow
  });

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.state, { usage: {}, resets: {} });
});

test('通知状態の変更を検出できる', () => {
  assert.equal(notificationStateChanged({}, { usage: {}, resets: {} }), false);
  assert.equal(notificationStateChanged({}, { usage: { 'claude:fivehour': { threshold: 80 } }, resets: {} }), true);
});

console.log(`\n${passed} passed`);

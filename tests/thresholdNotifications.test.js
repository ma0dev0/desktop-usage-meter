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

  const provider = {
    id: 'claude',
    name: 'Claude',
    enabled: true,
    visible: true,
    loggedIn: true,
    refreshError,
    limits
  };
  if (capturedAt !== null) provider.capturedAt = iso(capturedAt);

  return {
    providers: [
      provider
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
  assert.deepEqual(result.state, { usage: {}, resets: {}, health: {} });
});

test('取得失敗が古い前回値まで続いたら一度だけ通知する', () => {
  let result = evaluateThresholdNotifications({
    status: status({
      refreshError: {
        code: 'LOAD_FAILED',
        label: '読み込み失敗',
        note: '読み込み失敗 · 前回値を表示'
      },
      capturedAt: baseNow - 16 * MINUTE_MS
    }),
    state: {},
    nowMs: baseNow
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude の取得に失敗しています');
  assert.equal(result.events[0].body, '読み込み失敗 · 前回値を表示');

  result = evaluateThresholdNotifications({
    status: status({
      nowMs: baseNow + MINUTE_MS,
      refreshError: {
        code: 'LOAD_FAILED',
        label: '読み込み失敗',
        note: '読み込み失敗 · 前回値を表示'
      },
      capturedAt: baseNow - 16 * MINUTE_MS
    }),
    state: result.state,
    nowMs: baseNow + MINUTE_MS
  });

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.state.health, {
    'claude:health': {
      issueID: 'refresh-error:LOAD_FAILED',
      firstSeenAt: baseNow,
      notified: true
    }
  });
});

test('前回値がない取得失敗は15分続いてから通知する', () => {
  let result = evaluateThresholdNotifications({
    status: status({
      refreshError: {
        code: 'LOAD_FAILED',
        label: '読み込み失敗',
        note: '読み込み失敗'
      },
      capturedAt: null
    }),
    state: {},
    nowMs: baseNow
  });

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.state.health, {
    'claude:health': {
      issueID: 'refresh-error:LOAD_FAILED',
      firstSeenAt: baseNow,
      notified: false
    }
  });

  result = evaluateThresholdNotifications({
    status: status({
      refreshError: {
        code: 'LOAD_FAILED',
        label: '読み込み失敗',
        note: '読み込み失敗'
      },
      capturedAt: null
    }),
    state: result.state,
    nowMs: baseNow + 15 * MINUTE_MS
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude の取得に失敗しています');
  assert.deepEqual(result.state.health, {
    'claude:health': {
      issueID: 'refresh-error:LOAD_FAILED',
      firstSeenAt: baseNow,
      notified: true
    }
  });
});

test('取得が復旧したらヘルス通知状態をリセットする', () => {
  const result = evaluateThresholdNotifications({
    status: status({ used: 40 }),
    state: {
      usage: {},
      resets: {},
      health: {
        'claude:health': {
          issueID: 'refresh-error:LOAD_FAILED',
          firstSeenAt: baseNow - 15 * MINUTE_MS,
          notified: true
        }
      }
    },
    nowMs: baseNow
  });

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.state.health, {});
});

test('古い使用量では使用率通知を出さず通知済み状態を保持する', () => {
  const existingState = {
    usage: {
      'claude:fivehour': {
        cycleID: String(baseNow + 180 * MINUTE_MS),
        threshold: 90
      }
    },
    resets: {}
  };
  const result = evaluateThresholdNotifications({
    status: status({
      used: 96,
      capturedAt: baseNow - 20 * MINUTE_MS
    }),
    state: existingState,
    nowMs: baseNow
  });

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.state.usage, existingState.usage);
});

test('30分以上古いデータは一度だけ通知する', () => {
  let result = evaluateThresholdNotifications({
    status: status({
      capturedAt: baseNow - 30 * MINUTE_MS
    }),
    state: {},
    nowMs: baseNow
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude のデータが古くなっています');
  assert.equal(result.events[0].body, '前回更新から30分経過しています');

  result = evaluateThresholdNotifications({
    status: status({
      nowMs: baseNow + 30 * MINUTE_MS,
      capturedAt: baseNow - 30 * MINUTE_MS
    }),
    state: result.state,
    nowMs: baseNow + 30 * MINUTE_MS
  });

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.state.health, {
    'claude:health': {
      issueID: 'stale',
      firstSeenAt: baseNow,
      notified: true
    }
  });
});

test('古いデータでも確定済みの5時間リセット時刻が近ければ通知する', () => {
  const result = evaluateThresholdNotifications({
    status: status({
      used: 40,
      resetInMin: 10,
      capturedAt: baseNow - 20 * MINUTE_MS
    }),
    state: {},
    nowMs: baseNow
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Claude 5時間 リセットまで10分');
});

test('通知状態の変更を検出できる', () => {
  assert.equal(notificationStateChanged({}, { usage: {}, resets: {} }), false);
  assert.equal(notificationStateChanged({}, { usage: { 'claude:fivehour': { threshold: 80 } }, resets: {} }), true);
  assert.equal(notificationStateChanged({}, { usage: {}, resets: {}, health: { 'claude:health': { issueID: 'stale' } } }), true);
});

test('壊れた通知状態は空状態として扱う', () => {
  const result = evaluateThresholdNotifications({
    status: status({ used: 40 }),
    state: {
      usage: 'broken',
      resets: ['broken']
    },
    nowMs: baseNow
  });

  assert.equal(result.events.length, 0);
  assert.deepEqual(result.state.usage, { 'claude:fivehour': { cycleID: String(baseNow + 180 * MINUTE_MS), threshold: null } });
});

console.log(`\n${passed} passed`);

const assert = require('assert').strict;
const { buildWearPayload } = require('../src/wearPayload');

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

test('Notch status をWear向けの小さいJSONへ変換する', () => {
  const payload = buildWearPayload({
    updatedAt: '2026-07-04T08:20:00.000Z',
    providers: [
      {
        id: 'claude',
        name: 'Claude',
        color: '#d97757',
        visible: true,
        loggedIn: true,
        capturedAt: '2026-07-04T08:18:00.000Z',
        limits: [
          {
            key: 'fivehour',
            percentUsed: 68,
            resetAt: '2026-07-04T10:30:00.000Z',
            resetLabel: '19:30にリセット（あと2時間10分）'
          },
          {
            key: 'weekly',
            percentUsed: 31,
            resetAt: '2026-07-08T00:00:00.000Z'
          }
        ]
      },
      {
        id: 'codex',
        name: 'Codex',
        color: '#10a37f',
        visible: true,
        loggedIn: true,
        capturedAt: '2026-07-04T08:30:00.000Z',
        limits: [
          {
            key: 'fivehour',
            percentUsed: 42,
            resetAt: '2026-07-04T11:00:00.000Z'
          },
          {
            key: 'weekly',
            percentUsed: 25,
            resetAt: '2026-07-10T00:00:00.000Z'
          }
        ]
      }
    ]
  });

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.updatedAt, '2026-07-04T08:30:00.000Z');
  assert.equal(payload.codex.sessionLabel, '5時間');
  assert.equal(payload.codex.sessionPercent, 42);
  assert.equal(payload.codex.weeklyPercent, 25);
  assert.equal(payload.codex.sessionResetAt, '2026-07-04T11:00:00.000Z');
  assert.equal(payload.claude.sessionLabel, 'セッション');
  assert.equal(payload.claude.sessionPercent, 68);
  assert.equal(payload.claude.weeklyPercent, 31);
  assert.equal(payload.claude.sessionResetLabel, '19:30にリセット（あと2時間10分）');
});

test('未取得の値はnullとして残す', () => {
  const payload = buildWearPayload({
    updatedAt: '2026-07-04T08:20:00.000Z',
    providers: [
      {
        id: 'codex',
        name: 'Codex',
        color: '#10a37f',
        visible: false,
        loggedIn: null,
        limits: []
      }
    ]
  });

  assert.equal(payload.codex.sessionPercent, null);
  assert.equal(payload.codex.weeklyResetAt, null);
  assert.equal(payload.claude.sessionPercent, null);
});

console.log(`\n${passed} passed`);

const assert = require('assert').strict;
const { buildNotchStatus, getResultPercentRemaining } = require('../src/notchStatus');

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

const providers = {
  claude: { name: 'Claude', color: '#d97757' },
  codex: { name: 'Codex', color: '#10a37f' }
};

const capturedAt = new Date('2026-06-19T17:48:00+09:00').getTime();

test('NotchMeter JSON に5時間/週間と目安線を出力する', () => {
  const status = buildNotchStatus({
    providers,
    prefs: {
      providers: { claude: true, codex: true },
      weeklyPaceMode: 'calendar'
    },
    results: {
      claude: {
        loggedIn: true,
        capturedAt,
        sections: [
          {
            key: 'session',
            percentUsed: 31,
            percentRemaining: 69,
            resetText: '4時間19分後にリセット'
          },
          {
            key: 'weekly',
            percentUsed: 50,
            percentRemaining: 50,
            resetText: 'リセット：2026/06/26 11:19'
          }
        ]
      },
      codex: {
        loggedIn: true,
        capturedAt,
        sections: [
          {
            key: 'fivehour',
            percentRemaining: 87,
            resetText: 'リセット：22:07'
          }
        ]
      }
    },
    nowMs: capturedAt
  });

  assert.equal(status.schemaVersion, 4);
  assert.equal(status.weeklyPaceMode, 'calendar');
  assert.equal(status.refreshing, false);

  const claude = status.providers.find(provider => provider.id === 'claude');
  assert.equal(claude.percentRemaining, 50);
  assert.equal(claude.limits.length, 2);

  const fiveHour = claude.limits.find(limit => limit.key === 'fivehour');
  assert.equal(fiveHour.sourceKey, 'session');
  assert.equal(fiveHour.percentUsed, 31);
  assert.equal(fiveHour.expectedUsed, 14);
  assert.equal(fiveHour.pace.kind, 'very-fast');
  assert.equal(fiveHour.resetLabel, '22:07にリセット（あと4時間19分）');

  const weekly = claude.limits.find(limit => limit.key === 'weekly');
  assert.equal(weekly.percentUsed, 50);
  assert.equal(weekly.expectedUsed, 4);

  const codex = status.providers.find(provider => provider.id === 'codex');
  assert.equal(codex.limits[0].sourceKey, 'fivehour');
  assert.equal(codex.limits[0].percentUsed, 13);
  assert.equal(codex.limits[1].percentUsed, null);
});

test('代表値は5時間/週間のうち残量が少ない枠にする', () => {
  assert.equal(getResultPercentRemaining({
    loggedIn: true,
    sections: [
      { key: 'fivehour', percentRemaining: 72 },
      { key: 'weekly', percentRemaining: 18 }
    ]
  }), 18);
});

test('取得失敗はNotchMeter用JSONにも前回値付きで出力する', () => {
  const status = buildNotchStatus({
    providers,
    prefs: {
      providers: { claude: true, codex: true },
      weeklyPaceMode: 'calendar'
    },
    refreshErrors: {
      codex: 'LOAD_FAILED'
    },
    results: {
      codex: {
        loggedIn: true,
        capturedAt,
        sections: [
          {
            key: 'fivehour',
            percentRemaining: 24,
            resetText: 'あと1時間後にリセット'
          }
        ]
      }
    },
    nowMs: capturedAt
  });

  const codex = status.providers.find(provider => provider.id === 'codex');
  assert.deepEqual(codex.refreshError, {
    code: 'LOAD_FAILED',
    label: '読み込み失敗',
    note: '読み込み失敗 · 前回値を表示',
    hasPreviousValue: true
  });

  const claude = status.providers.find(provider => provider.id === 'claude');
  assert.equal(claude.refreshError, null);
});

test('再取得中はNotchMeter用JSONに全体と対象サービスの状態を出力する', () => {
  const status = buildNotchStatus({
    providers,
    prefs: {
      providers: { claude: true, codex: false },
      weeklyPaceMode: 'calendar'
    },
    results: {
      claude: {
        loggedIn: true,
        capturedAt,
        sections: [
          { key: 'session', percentRemaining: 70 }
        ]
      },
      codex: {
        loggedIn: true,
        capturedAt,
        sections: [
          { key: 'fivehour', percentRemaining: 24 }
        ]
      }
    },
    refreshing: true,
    nowMs: capturedAt
  });

  assert.equal(status.refreshing, true);
  assert.equal(status.providers.find(provider => provider.id === 'claude').refreshing, true);
  assert.equal(status.providers.find(provider => provider.id === 'codex').refreshing, false);
});

test('再取得中サービスが指定されている場合はそのサービスだけ取得中にする', () => {
  const status = buildNotchStatus({
    providers,
    prefs: {
      providers: { claude: true, codex: true },
      weeklyPaceMode: 'calendar'
    },
    results: {
      claude: {
        loggedIn: true,
        capturedAt,
        sections: [
          { key: 'session', percentRemaining: 70 }
        ]
      },
      codex: {
        loggedIn: true,
        capturedAt,
        sections: [
          { key: 'fivehour', percentRemaining: 24 }
        ]
      }
    },
    refreshing: true,
    refreshingProviders: { codex: true },
    nowMs: capturedAt
  });

  assert.equal(status.refreshing, true);
  assert.equal(status.providers.find(provider => provider.id === 'claude').refreshing, false);
  assert.equal(status.providers.find(provider => provider.id === 'codex').refreshing, true);
});

console.log(`\n${passed} passed`);

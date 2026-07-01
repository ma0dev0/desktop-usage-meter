const assert = require('assert').strict;
const { buildStatusSummary } = require('../src/statusSummary');

function test(name, fn) {
  try {
    fn();
    console.log('ok   -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const providers = [
  { id: 'claude', name: 'Claude', enabled: true },
  { id: 'codex', name: 'Codex', enabled: true }
];

test('表示中の状態をそのままコピー用テキストにする', () => {
  const text = buildStatusSummary({
    providers,
    results: {
      claude: {
        loggedIn: true,
        capturedAt: new Date('2026-06-28T17:48:00+09:00').getTime(),
        sections: [
          {
            key: 'session',
            percentRemaining: 62,
            resetText: '4時間19分後にリセット'
          },
          {
            key: 'weekly',
            percentRemaining: 88,
            resetText: '月曜 11:19にリセット'
          }
        ]
      },
      codex: {
        loggedIn: false
      }
    }
  });

  assert.equal(
    text,
    [
      'Usage Meter',
      '更新: 17:48',
      'Claude',
      '  - 5時間: 残り 62% / 4時間19分後にリセット',
      '  - 週間: 残り 88% / 月曜 11:19にリセット',
      'Codex: 未ログイン',
    ].join('\n')
  );
});

test('Claude が未ログインなら表示中の一覧から外れる', () => {
  const text = buildStatusSummary({
    providers,
    results: {
      claude: { loggedIn: false },
      codex: {
        loggedIn: true,
        capturedAt: new Date('2026-06-28T17:48:00+09:00').getTime(),
        sections: [
          {
            key: 'session',
            percentRemaining: 40,
            resetText: 'あと2時間後にリセット'
          }
        ]
      }
    }
  });

  assert.equal(
    text,
    [
      'Usage Meter',
      '更新: 17:48',
      'Codex',
      '  - 5時間: 残り 40% / あと2時間後にリセット'
    ].join('\n')
  );
});

test('空状態でも理由をコピー用テキストに含める', () => {
  const text = buildStatusSummary({
    providers: [
      { id: 'claude', name: 'Claude', enabled: true },
      { id: 'codex', name: 'Codex', enabled: false }
    ],
    results: {
      claude: { loggedIn: false }
    }
  });

  assert.equal(
    text,
    [
      'Usage Meter',
      'ログインが必要です',
      'Claude: 未ログイン'
    ].join('\n')
  );
});

test('取得失敗時は前回値を残しつつコピー用テキストにも明示する', () => {
  const text = buildStatusSummary({
    providers: [
      { id: 'codex', name: 'Codex', enabled: true }
    ],
    refreshErrors: {
      codex: 'LOAD_FAILED'
    },
    results: {
      codex: {
        loggedIn: true,
        capturedAt: new Date('2026-06-28T17:48:00+09:00').getTime(),
        sections: [
          {
            key: 'fivehour',
            percentRemaining: 24,
            resetText: 'あと1時間後にリセット'
          }
        ]
      }
    }
  });

  assert.equal(
    text,
    [
      'Usage Meter',
      '更新: 17:48',
      'Codex: 読み込み失敗 · 前回値を表示',
      '  - 5時間: 残り 24% / あと1時間後にリセット'
    ].join('\n')
  );
});

test('更新からの経過と古いデータをコピー用テキストに含める', () => {
  const capturedAt = new Date('2026-06-28T17:48:00+09:00').getTime();
  const text = buildStatusSummary({
    nowMs: capturedAt + 20 * 60 * 1000,
    providers: [
      { id: 'claude', name: 'Claude', enabled: true }
    ],
    results: {
      claude: {
        loggedIn: true,
        capturedAt,
        sections: [
          {
            key: 'session',
            percentRemaining: 62,
            resetText: '4時間19分後にリセット'
          }
        ]
      }
    }
  });

  assert.equal(
    text,
    [
      'Usage Meter',
      '更新: 17:48（20分前）',
      '古いデータ: Claude 20分前',
      'Claude',
      '  - 5時間: 残り 62% / 4時間19分後にリセット'
    ].join('\n')
  );
});

test('再取得中はコピー用テキストにも取得中を含める', () => {
  const text = buildStatusSummary({
    refreshing: true,
    providers: [
      { id: 'codex', name: 'Codex', enabled: true }
    ],
    results: {
      codex: {
        loggedIn: true,
        capturedAt: new Date('2026-06-28T17:48:00+09:00').getTime(),
        sections: [
          {
            key: 'fivehour',
            percentRemaining: 24,
            resetText: 'あと1時間後にリセット'
          }
        ]
      }
    }
  });

  assert.equal(
    text,
    [
      'Usage Meter',
      '取得中...',
      '更新: 17:48',
      'Codex',
      '  - 5時間: 残り 24% / あと1時間後にリセット'
    ].join('\n')
  );
});

test('再取得中サービスが分かる場合はサービス名をコピー用テキストに含める', () => {
  const text = buildStatusSummary({
    refreshing: true,
    refreshingProviders: { codex: true },
    providers: [
      { id: 'claude', name: 'Claude', enabled: true },
      { id: 'codex', name: 'Codex', enabled: true }
    ],
    results: {
      claude: {
        loggedIn: true,
        capturedAt: new Date('2026-06-28T17:48:00+09:00').getTime(),
        sections: [
          { key: 'session', percentRemaining: 70 }
        ]
      },
      codex: {
        loggedIn: true,
        capturedAt: new Date('2026-06-28T17:49:00+09:00').getTime(),
        sections: [
          { key: 'fivehour', percentRemaining: 24 }
        ]
      }
    }
  });

  assert.equal(
    text.split('\n')[1],
    '取得中: Codex'
  );
});

const assert = require('assert').strict;
const {
  envWearSyncConfig,
  normalizeWearSyncConfig,
  postWearPayload
} = require('../src/wearSync');

let passed = 0;
function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.then(() => {
        passed++;
        console.log('ok   -', name);
      }).catch(err => {
        console.error('FAIL -', name);
        console.error(err);
        process.exitCode = 1;
      });
      return;
    }
    passed++;
    console.log('ok   -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

test('環境変数から同期設定を作る', () => {
  const config = envWearSyncConfig({
    USAGE_METER_WEAR_API_URL: ' https://example.com/usage ',
    USAGE_METER_WEAR_API_KEY: ' secret ',
    USAGE_METER_WEAR_TIMEOUT_MS: '12000'
  });

  assert.deepEqual(config, {
    enabled: true,
    endpointUrl: 'https://example.com/usage',
    apiKey: 'secret',
    timeoutMs: 12000
  });
});

test('明示的に無効化できる', () => {
  assert.equal(normalizeWearSyncConfig({
    enabled: false,
    endpointUrl: 'https://example.com',
    apiKey: 'secret'
  }).enabled, false);
});

test('POST時にBearerとx-api-keyを付ける', async () => {
  let request = null;
  const result = await postWearPayload({ ok: true }, {
    endpointUrl: 'https://example.com/usage',
    apiKey: 'secret'
  }, async (url, options) => {
    request = { url, options };
    return { ok: true, status: 204 };
  });

  assert.equal(result.ok, true);
  assert.equal(request.url, 'https://example.com/usage');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'Bearer secret');
  assert.equal(request.options.headers['x-api-key'], 'secret');
  assert.equal(request.options.body, '{"ok":true}');
});

test('未設定なら通信せずskipする', async () => {
  let called = false;
  const result = await postWearPayload({}, {}, async () => {
    called = true;
    return { ok: true };
  });

  assert.equal(result.skipped, true);
  assert.equal(called, false);
});

process.on('beforeExit', () => {
  console.log(`\n${passed} passed`);
});

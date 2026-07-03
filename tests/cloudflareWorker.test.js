const assert = require('assert').strict;
const path = require('path');

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

function fakeEnv() {
  const store = new Map();
  return {
    USAGE_METER_API_KEY: 'secret',
    USAGE_METER_KV: {
      get: async key => store.get(key) || null,
      put: async (key, value) => { store.set(key, value); }
    }
  };
}

async function worker() {
  return import(path.join('..', 'api', 'cloudflare-worker', 'src', 'index.mjs'));
}

test('POSTしたJSONをGETで返す', async () => {
  const { handleRequest } = await worker();
  const env = fakeEnv();
  const post = await handleRequest(new Request('https://example.com/usage', {
    method: 'POST',
    headers: { 'x-api-key': 'secret' },
    body: '{"updatedAt":"2026-07-04T08:30:00.000Z"}'
  }), env);
  assert.equal(post.status, 204);

  const get = await handleRequest(new Request('https://example.com/usage', {
    headers: { authorization: 'Bearer secret' }
  }), env);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), {
    updatedAt: '2026-07-04T08:30:00.000Z'
  });
});

test('APIキーが違う場合は拒否する', async () => {
  const { handleRequest } = await worker();
  const response = await handleRequest(new Request('https://example.com/usage', {
    headers: { 'x-api-key': 'wrong' }
  }), fakeEnv());
  assert.equal(response.status, 401);
});

test('初回データがない場合は404を返す', async () => {
  const { handleRequest } = await worker();
  const response = await handleRequest(new Request('https://example.com/usage', {
    headers: { 'x-api-key': 'secret' }
  }), fakeEnv());
  assert.equal(response.status, 404);
});

process.on('beforeExit', () => {
  console.log(`\n${passed} passed`);
});

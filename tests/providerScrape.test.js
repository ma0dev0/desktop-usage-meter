const assert = require('assert').strict;
const {
  PARSE_FAILED,
  SCRAPE_FAILED,
  parseProviderUsage,
  scrapeProviderSafely
} = require('../src/providerScrape');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('プロバイダーの解析結果をそのまま返す', () => {
  const provider = {
    parse(text) {
      assert.equal(text, 'usage text');
      return {
        relatedFound: true,
        percentRemaining: 42
      };
    }
  };

  assert.deepEqual(parseProviderUsage(provider, 'usage text'), {
    relatedFound: true,
    percentRemaining: 42
  });
});

test('解析例外は取得処理を落とさず解析失敗にする', () => {
  const provider = {
    parse() {
      throw new Error('unexpected page shape');
    }
  };

  assert.deepEqual(parseProviderUsage(provider, 'broken'), {
    error: PARSE_FAILED
  });
});

test('解析結果がオブジェクトでなければ解析失敗にする', () => {
  assert.deepEqual(parseProviderUsage({ parse: () => null }, 'empty'), {
    error: PARSE_FAILED
  });
  assert.deepEqual(parseProviderUsage({ parse: () => 'bad' }, 'empty'), {
    error: PARSE_FAILED
  });
});

test('parse関数がないプロバイダーも解析失敗にする', () => {
  assert.deepEqual(parseProviderUsage({}, 'usage text'), {
    error: PARSE_FAILED
  });
});

test('スクレイプ成功結果をそのまま返す', async () => {
  const provider = { id: 'codex' };
  const result = await scrapeProviderSafely(async inputProvider => {
    assert.equal(inputProvider, provider);
    return {
      relatedFound: true,
      percentRemaining: 51
    };
  }, provider);

  assert.deepEqual(result, {
    relatedFound: true,
    percentRemaining: 51
  });
});

test('スクレイプ例外は取得失敗にする', async () => {
  const result = await scrapeProviderSafely(async () => {
    throw new Error('webContents destroyed');
  }, { id: 'claude' });

  assert.deepEqual(result, {
    error: SCRAPE_FAILED
  });
});

test('スクレイプ結果がオブジェクトでなければ取得失敗にする', async () => {
  assert.deepEqual(await scrapeProviderSafely(async () => null, { id: 'codex' }), {
    error: SCRAPE_FAILED
  });
  assert.deepEqual(await scrapeProviderSafely(async () => 'bad', { id: 'codex' }), {
    error: SCRAPE_FAILED
  });
});

test('スクレイプ関数がなければ取得失敗にする', async () => {
  assert.deepEqual(await scrapeProviderSafely(null, { id: 'codex' }), {
    error: SCRAPE_FAILED
  });
});

async function run() {
  let passed = 0;
  for (const entry of tests) {
    try {
      await entry.fn();
      passed++;
      console.log('ok   -', entry.name);
    } catch (err) {
      console.error('FAIL -', entry.name);
      console.error(err);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed} passed`);
}

run();

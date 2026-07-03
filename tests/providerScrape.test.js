const assert = require('assert').strict;
const { PARSE_FAILED, parseProviderUsage } = require('../src/providerScrape');

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

console.log(`\n${passed} passed`);

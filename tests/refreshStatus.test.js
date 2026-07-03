const assert = require('assert').strict;
const { refreshErrorLabel, refreshErrorNote } = require('../src/refreshStatus');

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

test('既知の取得失敗コードを短い日本語へ変換する', () => {
  assert.equal(refreshErrorLabel('LOAD_FAILED'), '読み込み失敗');
  assert.equal(refreshErrorLabel({ error: 'LOAD_FAILED' }), '読み込み失敗');
  assert.equal(refreshErrorLabel('PARSE_FAILED'), '解析失敗');
  assert.equal(refreshErrorLabel('SCRAPE_FAILED'), '取得失敗');
});

test('未知の取得失敗コードは汎用表示へフォールバックする', () => {
  assert.equal(refreshErrorLabel('SOMETHING_ELSE'), '取得失敗');
});

test('前回値が残る場合はそれを明示する', () => {
  assert.equal(refreshErrorNote('LOAD_FAILED', true), '読み込み失敗 · 前回値を表示');
  assert.equal(refreshErrorNote('LOAD_FAILED', false), '読み込み失敗');
  assert.equal(refreshErrorNote(null, true), '');
});

console.log(`\n${passed} passed`);

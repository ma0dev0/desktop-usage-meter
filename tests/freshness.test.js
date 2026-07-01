const assert = require('assert').strict;
const { STALE_AFTER_MS, elapsedLabel, staleInfo } = require('../src/freshness');

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

const now = new Date('2026-06-30T12:00:00Z').getTime();

test('15分未満のデータは新しい扱いにする', () => {
  assert.equal(staleInfo({ capturedAt: now - STALE_AFTER_MS + 1 }, now), null);
});

test('15分以上古いデータはラベルと経過時間を返す', () => {
  const info = staleInfo({ capturedAt: now - STALE_AFTER_MS }, now);
  assert.equal(info.label, '古いデータ · 15分前');
  assert.equal(info.ageMs, STALE_AFTER_MS);
});

test('未来時刻や欠損値は古い扱いにしない', () => {
  assert.equal(staleInfo({ capturedAt: now + 60 * 1000 }, now), null);
  assert.equal(staleInfo({}, now), null);
});

test('経過時間ラベルを短く表示する', () => {
  assert.equal(elapsedLabel(now - 30 * 1000, now), '30秒前');
  assert.equal(elapsedLabel(now - 2 * 60 * 60 * 1000, now), '2時間前');
  assert.equal(elapsedLabel(now - 3 * 24 * 60 * 60 * 1000, now), '3日前');
});

console.log(`\n${passed} passed`);

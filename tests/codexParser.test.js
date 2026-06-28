const assert = require('assert').strict;
const { parseUsage, parseUsageSections, parseStats, formatBadge } = require('../src/codexParser');

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

const CODEX_TEXT = [
  'Codex アナリティクス',
  '残高',
  '5時間の使用制限',
  '87%',
  '残り',
  'リセット：16:20',
  '週間利用上限',
  '98%',
  '残り',
  'リセット：2026/06/26 11:20',
  '残りのクレジット',
  '0',
  'ターン数',
  '344',
  'Plugins calls',
  '0',
  'Skills used',
  '0'
].join('\n');

test('Codex: 5時間/週間を残り%で抽出', () => {
  const sections = parseUsageSections(CODEX_TEXT);
  const byKey = Object.fromEntries(sections.map(s => [s.key, s]));
  assert.equal(byKey.fivehour.percentRemaining, 87);
  assert.equal(byKey.fivehour.resetText, 'リセット：16:20');
  assert.equal(byKey.weekly.percentRemaining, 98);
  assert.equal(byKey.weekly.resetText, 'リセット：2026/06/26 11:20');
});

test('Codex: 合計値(ターン数等)を抽出', () => {
  const stats = parseStats(CODEX_TEXT);
  const byKey = Object.fromEntries(stats.map(s => [s.key, s.value]));
  assert.equal(byKey.turns, '344');
  assert.equal(byKey.credit, '0');
  assert.equal(byKey.plugins, '0');
  assert.equal(byKey.skills, '0');
});

test('Codex: 代表値は残量が最も少ない枠', () => {
  const r = parseUsage({ fullText: CODEX_TEXT });
  assert.equal(r.determined, true);
  assert.equal(r.percentRemaining, 87);
  assert.equal(r.basis, 'section:fivehour');
  assert.equal(r.stats.length, 4);
});

test('Codex: バッジ', () => {
  assert.equal(formatBadge({ determined: true, percentRemaining: 87, relatedFound: true }), '87%');
  assert.equal(formatBadge({ determined: false, relatedFound: true, percentRemaining: null }), '?');
});

console.log(`\n${passed} passed`);

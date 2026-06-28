const assert = require('assert').strict;
const { parseUsage, parseUsageSections, formatBadge, badgeColor } = require('../src/claudeParser');

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

const CLAUDE_TEXT = [
  'プラン使用制限 Pro',
  '現在のセッション',
  '6分後にリセット',
  '38% 使用済み',
  '週間制限',
  '使用制限について詳しく見る',
  'すべてのモデル',
  '18:59 (木)にリセット',
  '4% 使用済み',
  '利用クレジット',
  '$5.69使用',
  'Jul 1にリセット',
  '57%使用'
].join('\n');

test('Claude: セッション/週間を使用済み%から残量へ', () => {
  const sections = parseUsageSections(CLAUDE_TEXT);
  const byKey = Object.fromEntries(sections.map(s => [s.key, s]));
  assert.equal(byKey.session.percentRemaining, 62);
  assert.equal(byKey.session.resetText, '6分後にリセット');
  assert.equal(byKey.weekly.percentRemaining, 96);
  assert.equal(byKey.weekly.resetText, '18:59 (木)にリセット');
});

test('Claude: 代表値は残量が最も少ない枠', () => {
  const r = parseUsage({ fullText: CLAUDE_TEXT });
  assert.equal(r.determined, true);
  assert.equal(r.percentRemaining, 62);
  assert.equal(r.basis, 'section:session');
});

test('Claude: バッジと色', () => {
  assert.equal(formatBadge({ determined: true, percentRemaining: 62, relatedFound: true }), '62%');
  assert.equal(badgeColor({ determined: true, percentRemaining: 62 }), '#188038');
  assert.equal(formatBadge(null), '');
});

console.log(`\n${passed} passed`);

const assert = require('assert').strict;
const {
  DEFAULT_PREFS,
  normalizeMeterBounds,
  normalizePrefs
} = require('../src/preferences');

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

test('設定がなければ既定値を返す', () => {
  assert.deepEqual(normalizePrefs(), DEFAULT_PREFS);
});

test('有効な保存設定を維持する', () => {
  const prefs = normalizePrefs({
    theme: 'dark',
    opacity: 0.8,
    alwaysOnTop: false,
    intervalMin: 15,
    weeklyPaceMode: 'weekdays',
    providers: { claude: false, codex: true },
    thresholdNotifications: false,
    autoLaunch: true,
    notchMeterAutoStart: true,
    meterBounds: { x: 10, y: 20, width: 360, height: 200 },
    meterVisible: false
  });

  assert.deepEqual(prefs, {
    theme: 'dark',
    opacity: 0.8,
    alwaysOnTop: false,
    intervalMin: 15,
    weeklyPaceMode: 'weekdays',
    providers: { claude: false, codex: true },
    thresholdNotifications: false,
    autoLaunch: true,
    notchMeterAutoStart: true,
    meterBounds: { x: 10, y: 20, width: 360, height: 200 },
    meterVisible: false
  });
});

test('壊れた保存設定を安全な既定値へ戻す', () => {
  const prefs = normalizePrefs({
    theme: 'neon',
    opacity: 'very clear',
    alwaysOnTop: 'yes',
    intervalMin: 999,
    weeklyPaceMode: 'fast',
    providers: { claude: 'false', codex: 0 },
    thresholdNotifications: 'false',
    autoLaunch: 1,
    notchMeterAutoStart: null,
    meterBounds: { x: NaN, y: 0, width: 320, height: 180 },
    meterVisible: 'no'
  });

  assert.deepEqual(prefs, DEFAULT_PREFS);
});

test('opacity は表示可能な範囲へ丸める', () => {
  assert.equal(normalizePrefs({ opacity: 2 }).opacity, 1);
  assert.equal(normalizePrefs({ opacity: 0.1 }).opacity, 0.5);
  assert.equal(normalizePrefs({ opacity: '0.654' }).opacity, 0.65);
});

test('intervalMin はメニューで選べる値だけ受け付ける', () => {
  assert.equal(normalizePrefs({ intervalMin: '30' }).intervalMin, 30);
  assert.equal(normalizePrefs({ intervalMin: 10 }).intervalMin, DEFAULT_PREFS.intervalMin);
  assert.equal(normalizePrefs({ intervalMin: 0 }).intervalMin, DEFAULT_PREFS.intervalMin);
});

test('provider 無効化は明示的な false だけを保存する', () => {
  assert.deepEqual(normalizePrefs({ providers: { claude: false } }).providers, {
    claude: false,
    codex: true
  });
  assert.deepEqual(normalizePrefs({ providers: { claude: 'false', codex: false } }).providers, {
    claude: true,
    codex: false
  });
});

test('meterBounds は有限の正サイズだけ保存する', () => {
  assert.deepEqual(normalizeMeterBounds({ x: '10.4', y: 20.6, width: 320.2, height: 180.8 }), {
    x: 10,
    y: 21,
    width: 320,
    height: 181
  });
  assert.equal(normalizeMeterBounds({ x: 0, y: 0, width: 0, height: 180 }), null);
  assert.equal(normalizeMeterBounds({ x: 0, y: Infinity, width: 320, height: 180 }), null);
});

console.log(`\n${passed} passed`);

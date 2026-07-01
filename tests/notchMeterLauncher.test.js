const assert = require('assert').strict;
const {
  appendLogText,
  buildLogHeader,
  buildNotchMeterCommand,
  getNotchMeterAvailability,
  statusLabel
} = require('../src/notchMeterLauncher');

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

function existsOnly(paths) {
  const existing = new Set(paths);
  return file => existing.has(file);
}

test('配布版では同梱済みNotchMeterを優先する', () => {
  const existsSync = existsOnly([
    '/App/Contents/Resources/NotchMeter/NotchMeter',
    '/repo/NotchMeter/Package.swift'
  ]);

  const availability = getNotchMeterAvailability({
    platform: 'darwin',
    appRoot: '/repo',
    resourcesPath: '/App/Contents/Resources',
    existsSync
  });
  assert.equal(availability.available, true);
  assert.equal(availability.modeLabel, '同梱版');

  const command = buildNotchMeterCommand({
    platform: 'darwin',
    appRoot: '/repo',
    resourcesPath: '/App/Contents/Resources',
    existsSync
  });
  assert.equal(command.command, '/App/Contents/Resources/NotchMeter/NotchMeter');
  assert.deepEqual(command.args, []);
  assert.equal(command.cwd, '/App/Contents/Resources/NotchMeter');
});

test('開発中はSwift Package起動へフォールバックする', () => {
  const command = buildNotchMeterCommand({
    platform: 'darwin',
    appRoot: '/repo',
    resourcesPath: '/App/Contents/Resources',
    existsSync: existsOnly(['/repo/NotchMeter/Package.swift'])
  });

  assert.equal(command.command, 'swift');
  assert.deepEqual(command.args, ['run', '--package-path', '/repo/NotchMeter', 'NotchMeter']);
  assert.equal(command.cwd, '/repo');
});

test('macOS以外ではNotchMeterを利用不可として扱う', () => {
  const availability = getNotchMeterAvailability({
    platform: 'win32',
    appRoot: '/repo',
    resourcesPath: '/App/Contents/Resources',
    existsSync: existsOnly(['/App/Contents/Resources/NotchMeter/NotchMeter'])
  });

  assert.equal(availability.available, false);
  assert.equal(availability.modeLabel, 'macOSのみ');
});

test('トレイ用ステータスラベルは起動中と失敗を短く表す', () => {
  assert.equal(statusLabel({ available: false }), '利用できません');
  assert.equal(statusLabel({ available: true, launching: true, running: false }), '起動中...');
  assert.equal(statusLabel({ available: true, launching: false, running: true }), '起動中');
  assert.equal(statusLabel({ available: true, launching: false, running: false, lastError: '終了コード 1' }), '終了コード 1');
  assert.equal(statusLabel({ available: true, launching: false, running: false }), '停止中');
});

test('起動ログはコマンド行を含み、長すぎる内容は末尾だけ保持する', () => {
  const header = buildLogHeader(
    { command: 'swift', args: ['run', 'NotchMeter'] },
    new Date('2026-06-30T12:00:00Z')
  );
  assert.equal(header, '[2026-06-30T12:00:00.000Z] NotchMeter start\n$ swift run NotchMeter\n');

  const longLog = appendLogText('start:', 'x'.repeat(20), 10);
  assert.equal(longLog, 'xxxxxxxxxx');
});

console.log(`\n${passed} passed`);

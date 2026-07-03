const assert = require('assert').strict;
const pkg = require('../package.json');

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

test('配布用appIdはexample名前空間を使わない', () => {
  assert.equal(pkg.build.appId, 'com.ma0dev0.usagemeter');
  assert.doesNotMatch(pkg.build.appId, /(^|\.)example(\.|$)/);
});

test('配布名とリポジトリ情報を持つ', () => {
  assert.equal(pkg.build.productName, 'Usage Meter');
  assert.equal(pkg.author, 'ma0dev0');
  assert.match(pkg.repository.url, /^https:\/\/github\.com\/ma0dev0\/desktop-usage-meter\.git$/);
});

test('macOS配布設定がユーティリティアプリとして整っている', () => {
  assert.equal(pkg.build.mac.category, 'public.app-category.utilities');
  assert.equal(pkg.build.mac.target, 'dmg');
  assert.equal(pkg.build.mac.icon, 'icons/icon1024.png');
});

test('配布版にNotchMeter実行ファイルを同梱する', () => {
  assert.deepEqual(pkg.build.mac.extraResources, [
    {
      from: 'NotchMeter/.build/release/NotchMeter',
      to: 'NotchMeter/NotchMeter'
    }
  ]);
});

console.log(`\n${passed} passed`);

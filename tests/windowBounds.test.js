const assert = require('assert').strict;
const {
  defaultMeterBounds,
  normalizeMeterBounds
} = require('../src/windowBounds');

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

const workArea = {
  x: 0,
  y: 25,
  width: 1440,
  height: 875
};

test('デフォルト位置は画面右上の余白内に置く', () => {
  assert.deepEqual(defaultMeterBounds(workArea), {
    width: 320,
    height: 180,
    x: 1104,
    y: 41
  });
});

test('画面内の保存位置はそのまま復元する', () => {
  assert.deepEqual(normalizeMeterBounds({
    x: 240,
    y: 90,
    width: 360,
    height: 210
  }, workArea), {
    x: 240,
    y: 90,
    width: 360,
    height: 210
  });
});

test('右下へ外れた保存位置を表示領域内へ戻す', () => {
  assert.deepEqual(normalizeMeterBounds({
    x: 2000,
    y: 1200,
    width: 360,
    height: 210
  }, workArea), {
    x: 1064,
    y: 674,
    width: 360,
    height: 210
  });
});

test('左上へ外れた保存位置を表示領域内へ戻す', () => {
  assert.deepEqual(normalizeMeterBounds({
    x: -500,
    y: -300,
    width: 360,
    height: 210
  }, workArea), {
    x: 16,
    y: 41,
    width: 360,
    height: 210
  });
});

test('保存値が壊れていたらデフォルト位置へフォールバックする', () => {
  assert.deepEqual(normalizeMeterBounds({
    x: NaN,
    y: 'top',
    width: Infinity,
    height: null
  }, workArea), {
    width: 320,
    height: 180,
    x: 1104,
    y: 41
  });
});

test('大きすぎる保存サイズは表示領域に収める', () => {
  assert.deepEqual(normalizeMeterBounds({
    x: 10,
    y: 10,
    width: 3000,
    height: 2000
  }, workArea), {
    x: 16,
    y: 41,
    width: 1408,
    height: 843
  });
});

console.log(`\n${passed} passed`);

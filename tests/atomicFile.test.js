const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonAtomic, writeTextAtomic } = require('../src/atomicFile');

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

test('親ディレクトリを作り、JSONを一時ファイル経由で置き換える', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-meter-atomic-'));
  const target = path.join(dir, 'nested', 'notch-status.json');
  const tmpPath = path.join(dir, 'nested', '.notch-status.tmp');

  writeJsonAtomic(target, { ok: true }, { tmpPath });

  assert.equal(fs.readFileSync(target, 'utf8'), '{\n  "ok": true\n}\n');
  assert.equal(fs.existsSync(tmpPath), false);
});

test('renameに失敗したら既存ファイルを残し、一時ファイルだけ片付ける', () => {
  const files = new Map([
    ['/state.json', 'old']
  ]);
  const calls = [];
  const fsImpl = {
    mkdirSync(dir, options) {
      calls.push(['mkdir', dir, options.recursive]);
    },
    writeFileSync(filePath, text) {
      calls.push(['write', filePath, text]);
      files.set(filePath, text);
    },
    renameSync(from, to) {
      calls.push(['rename', from, to]);
      throw new Error('rename failed');
    },
    existsSync(filePath) {
      return files.has(filePath);
    },
    unlinkSync(filePath) {
      calls.push(['unlink', filePath]);
      files.delete(filePath);
    }
  };

  assert.throws(() => {
    writeTextAtomic('/state.json', 'new', {
      fs: fsImpl,
      tmpPath: '/.state.json.tmp'
    });
  }, /rename failed/);

  assert.equal(files.get('/state.json'), 'old');
  assert.equal(files.has('/.state.json.tmp'), false);
  assert.deepEqual(calls.map(call => call[0]), ['mkdir', 'write', 'rename', 'unlink']);
});

console.log(`\n${passed} passed`);

const fs = require('fs');
const path = require('path');

function uniqueTempPath(filePath) {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath);
  const suffix = [
    process.pid,
    Date.now(),
    Math.random().toString(16).slice(2)
  ].join('.');
  return path.join(dir, `.${name}.${suffix}.tmp`);
}

function writeTextAtomic(filePath, text, options = {}) {
  const fsImpl = options.fs || fs;
  const tmpPath = options.tmpPath || uniqueTempPath(filePath);

  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fsImpl.writeFileSync(tmpPath, String(text));
    fsImpl.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      if (fsImpl.existsSync(tmpPath)) fsImpl.unlinkSync(tmpPath);
    } catch (cleanupError) {
      /* 元の書き込み失敗を優先する */
    }
    throw error;
  }
}

function writeJsonAtomic(filePath, value, options = {}) {
  writeTextAtomic(filePath, JSON.stringify(value, null, 2) + '\n', options);
}

module.exports = {
  writeJsonAtomic,
  writeTextAtomic
};

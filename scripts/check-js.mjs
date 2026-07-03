import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_ENTRIES = [
  'main.js',
  'preload.js',
  'src',
  'renderer',
  'scripts',
  'tests',
  'api'
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.agents',
  '.swiftpm',
  '.build'
]);

function collectFiles(entry, out = []) {
  if (!existsSync(entry)) return out;
  const stat = statSync(entry);
  if (stat.isDirectory()) {
    const name = entry.split(/[\\/]/).pop();
    if (SKIP_DIRS.has(name)) return out;
    for (const child of readdirSync(entry).sort()) {
      collectFiles(join(entry, child), out);
    }
    return out;
  }

  if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
    out.push(entry);
  }
  return out;
}

const files = ROOT_ENTRIES.flatMap(entry => collectFiles(join(process.cwd(), entry)));

if (files.length === 0) {
  console.error('No JavaScript files found.');
  process.exit(1);
}

console.log(`Checking ${files.length} JavaScript files...`);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

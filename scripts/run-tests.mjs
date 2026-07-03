import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const testsDir = join(process.cwd(), 'tests');
const testFiles = readdirSync(testsDir)
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .map(file => join(testsDir, file));

if (testFiles.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

for (const file of testFiles) {
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

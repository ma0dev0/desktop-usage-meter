import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const productName = pkg.build.productName;
const appDir = path.join(root, 'dist', 'mac-arm64', `${productName}.app`);
const plistPath = path.join(appDir, 'Contents', 'Info.plist');
const resourcesDir = path.join(appDir, 'Contents', 'Resources');
const dmgPath = path.join(root, 'dist', `${productName}-${pkg.version}-arm64.dmg`);

function fail(message) {
  throw new Error(message);
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} missing: ${filePath}`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) fail(`${label} is not a file: ${filePath}`);
  if (stat.size <= 0) fail(`${label} is empty: ${filePath}`);
  return stat;
}

function plistValue(key) {
  return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath], {
    encoding: 'utf8'
  }).trim();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
}

assertFile(plistPath, 'Info.plist');
assertEqual(plistValue('CFBundleIdentifier'), pkg.build.appId, 'CFBundleIdentifier');
assertEqual(plistValue('CFBundleName'), productName, 'CFBundleName');
assertEqual(plistValue('CFBundleDisplayName'), productName, 'CFBundleDisplayName');
assertEqual(plistValue('LSApplicationCategoryType'), pkg.build.mac.category, 'LSApplicationCategoryType');

assertFile(path.join(resourcesDir, 'app.asar'), 'app.asar');
const notchMeterPath = path.join(resourcesDir, 'NotchMeter', 'NotchMeter');
assertFile(notchMeterPath, 'NotchMeter binary');
try {
  fs.accessSync(notchMeterPath, fs.constants.X_OK);
} catch (error) {
  fail(`NotchMeter binary is not executable: ${notchMeterPath}`);
}

const dmgStat = assertFile(dmgPath, 'macOS DMG');
if (dmgStat.size < 10 * 1024 * 1024) {
  fail(`macOS DMG is unexpectedly small: ${dmgStat.size} bytes`);
}

console.log(`ok   - ${productName}.app metadata and bundled resources`);
console.log(`ok   - ${path.relative(root, dmgPath)} ${Math.round(dmgStat.size / 1024 / 1024)}MB`);

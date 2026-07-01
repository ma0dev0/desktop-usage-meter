const path = require('path');

const LOG_LIMIT = 12000;

function bundledNotchMeterPath(resourcesPath) {
  if (!resourcesPath) return null;
  return path.join(resourcesPath, 'NotchMeter', 'NotchMeter');
}

function notchMeterPackagePath(appRoot) {
  return path.join(appRoot, 'NotchMeter');
}

function getNotchMeterAvailability({
  platform = process.platform,
  appRoot = process.cwd(),
  resourcesPath = process.resourcesPath,
  existsSync
} = {}) {
  const exists = existsSync || (() => false);
  if (platform !== 'darwin') {
    return {
      available: false,
      modeLabel: 'macOSのみ',
      bundledPath: bundledNotchMeterPath(resourcesPath),
      packagePath: notchMeterPackagePath(appRoot)
    };
  }

  const bundledPath = bundledNotchMeterPath(resourcesPath);
  const packagePath = notchMeterPackagePath(appRoot);
  if (bundledPath && exists(bundledPath)) {
    return { available: true, modeLabel: '同梱版', bundledPath, packagePath };
  }
  if (exists(path.join(packagePath, 'Package.swift'))) {
    return { available: true, modeLabel: '開発版', bundledPath, packagePath };
  }
  return { available: false, modeLabel: '未同梱', bundledPath, packagePath };
}

function buildNotchMeterCommand(options = {}) {
  const availability = getNotchMeterAvailability(options);
  if (availability.bundledPath && options.existsSync && options.existsSync(availability.bundledPath)) {
    return {
      command: availability.bundledPath,
      args: [],
      cwd: path.dirname(availability.bundledPath)
    };
  }

  return {
    command: 'swift',
    args: ['run', '--package-path', availability.packagePath, 'NotchMeter'],
    cwd: options.appRoot || process.cwd()
  };
}

function commandLine({ command, args = [] }) {
  return [command].concat(args).join(' ');
}

function buildLogHeader(command, now = new Date()) {
  return [
    '[' + now.toISOString() + '] NotchMeter start',
    '$ ' + commandLine(command),
    ''
  ].join('\n');
}

function appendLogText(currentLog, chunk, limit = LOG_LIMIT) {
  const text = String(chunk || '');
  if (!text) return currentLog || '';
  return ((currentLog || '') + text).slice(-limit);
}

function statusLabel({ available, launching, running, lastError }) {
  if (!available) return '利用できません';
  if (launching) return '起動中...';
  if (running) return '起動中';
  return lastError || '停止中';
}

module.exports = {
  LOG_LIMIT,
  appendLogText,
  buildLogHeader,
  buildNotchMeterCommand,
  bundledNotchMeterPath,
  commandLine,
  getNotchMeterAvailability,
  notchMeterPackagePath,
  statusLabel
};

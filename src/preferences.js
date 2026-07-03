const AUTO_UPDATE_INTERVALS = [1, 5, 15, 30, 60];
const THEMES = ['auto', 'light', 'dark'];
const WEEKLY_PACE_MODES = ['calendar', 'weekdays'];

const DEFAULT_PREFS = {
  theme: 'auto',
  opacity: 0.96,
  alwaysOnTop: true,
  intervalMin: 5,
  weeklyPaceMode: 'calendar',
  providers: { claude: true, codex: true },
  thresholdNotifications: true,
  autoLaunch: false,
  notchMeterAutoStart: false,
  meterBounds: null,
  meterVisible: true
};

function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function choice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function explicitBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeOpacity(value) {
  const number = finiteNumber(value);
  if (number == null) return DEFAULT_PREFS.opacity;
  return Math.round(clamp(number, 0.5, 1) * 100) / 100;
}

function normalizeIntervalMin(value) {
  const number = finiteNumber(value);
  if (number == null) return DEFAULT_PREFS.intervalMin;
  const rounded = Math.round(number);
  return AUTO_UPDATE_INTERVALS.includes(rounded) ? rounded : DEFAULT_PREFS.intervalMin;
}

function normalizeProviders(value) {
  const providers = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    claude: explicitBoolean(providers.claude, DEFAULT_PREFS.providers.claude),
    codex: explicitBoolean(providers.codex, DEFAULT_PREFS.providers.codex)
  };
}

function normalizeMeterBounds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  if (x == null || y == null || width == null || height == null || width <= 0 || height <= 0) {
    return null;
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function normalizePrefs(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    theme: choice(raw.theme, THEMES, DEFAULT_PREFS.theme),
    opacity: normalizeOpacity(raw.opacity),
    alwaysOnTop: explicitBoolean(raw.alwaysOnTop, DEFAULT_PREFS.alwaysOnTop),
    intervalMin: normalizeIntervalMin(raw.intervalMin),
    weeklyPaceMode: choice(raw.weeklyPaceMode, WEEKLY_PACE_MODES, DEFAULT_PREFS.weeklyPaceMode),
    providers: normalizeProviders(raw.providers),
    thresholdNotifications: explicitBoolean(raw.thresholdNotifications, DEFAULT_PREFS.thresholdNotifications),
    autoLaunch: explicitBoolean(raw.autoLaunch, DEFAULT_PREFS.autoLaunch),
    notchMeterAutoStart: explicitBoolean(raw.notchMeterAutoStart, DEFAULT_PREFS.notchMeterAutoStart),
    meterBounds: normalizeMeterBounds(raw.meterBounds),
    meterVisible: explicitBoolean(raw.meterVisible, DEFAULT_PREFS.meterVisible)
  };
}

module.exports = {
  AUTO_UPDATE_INTERVALS,
  DEFAULT_PREFS,
  normalizeMeterBounds,
  normalizePrefs
};

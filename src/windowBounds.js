const DEFAULT_METER_WIDTH = 320;
const DEFAULT_METER_HEIGHT = 180;
const MIN_METER_WIDTH = 280;
const MIN_METER_HEIGHT = 100;
const SCREEN_MARGIN = 16;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundNumber(value) {
  return Math.round(value);
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function workAreaValue(workArea, key, fallback) {
  return isFiniteNumber(workArea && workArea[key]) ? workArea[key] : fallback;
}

function normalizedWorkArea(workArea) {
  return {
    x: workAreaValue(workArea, 'x', 0),
    y: workAreaValue(workArea, 'y', 0),
    width: Math.max(1, workAreaValue(workArea, 'width', DEFAULT_METER_WIDTH + SCREEN_MARGIN * 2)),
    height: Math.max(1, workAreaValue(workArea, 'height', DEFAULT_METER_HEIGHT + SCREEN_MARGIN * 2))
  };
}

function dimension(value, fallback, min, max) {
  const raw = isFiniteNumber(value) ? roundNumber(value) : fallback;
  return clamp(raw, Math.min(min, max), max);
}

function position(value, fallback, size, start, areaSize, margin) {
  const raw = isFiniteNumber(value) ? roundNumber(value) : fallback;
  if (size + margin * 2 <= areaSize) {
    return clamp(raw, start + margin, start + areaSize - size - margin);
  }
  if (size <= areaSize) {
    return clamp(raw, start, start + areaSize - size);
  }
  return start;
}

function defaultMeterBounds(workArea, options = {}) {
  const area = normalizedWorkArea(workArea);
  const margin = isFiniteNumber(options.margin) ? options.margin : SCREEN_MARGIN;
  const maxWidth = Math.max(1, area.width - margin * 2);
  const maxHeight = Math.max(1, area.height - margin * 2);
  const width = dimension(
    options.defaultWidth,
    DEFAULT_METER_WIDTH,
    Math.min(MIN_METER_WIDTH, maxWidth),
    maxWidth
  );
  const height = dimension(
    options.defaultHeight,
    DEFAULT_METER_HEIGHT,
    Math.min(MIN_METER_HEIGHT, maxHeight),
    maxHeight
  );

  return {
    width,
    height,
    x: position(null, area.x + area.width - width - margin, width, area.x, area.width, margin),
    y: position(null, area.y + margin, height, area.y, area.height, margin)
  };
}

function normalizeMeterBounds(bounds, workArea, options = {}) {
  const area = normalizedWorkArea(workArea);
  const margin = isFiniteNumber(options.margin) ? options.margin : SCREEN_MARGIN;
  const fallback = defaultMeterBounds(area, options);
  const maxWidth = Math.max(1, area.width - margin * 2);
  const maxHeight = Math.max(1, area.height - margin * 2);
  const width = dimension(
    bounds && bounds.width,
    fallback.width,
    Math.min(MIN_METER_WIDTH, maxWidth),
    maxWidth
  );
  const height = dimension(
    bounds && bounds.height,
    fallback.height,
    Math.min(MIN_METER_HEIGHT, maxHeight),
    maxHeight
  );

  return {
    width,
    height,
    x: position(bounds && bounds.x, fallback.x, width, area.x, area.width, margin),
    y: position(bounds && bounds.y, fallback.y, height, area.y, area.height, margin)
  };
}

module.exports = {
  defaultMeterBounds,
  normalizeMeterBounds
};

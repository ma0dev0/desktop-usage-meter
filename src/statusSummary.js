const { shouldDisplayProvider, emptyStateInfo } = require('./providerVisibility');
const { refreshErrorNote } = require('./refreshStatus');
const { elapsedLabel, staleInfo } = require('./freshness');

const SECTION_LABELS = {
  session: '5時間',
  fivehour: '5時間',
  weekly: '週間'
};

function normalizeText(label) {
  return String(label || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function sectionDetail(section) {
  const bits = [];
  if (section.percentRemaining != null) {
    bits.push(`残り ${Math.round(section.percentRemaining)}%`);
  } else if (section.percentUsed != null) {
    bits.push(`使用 ${Math.round(section.percentUsed)}%`);
  }
  if (section.resetText) bits.push(normalizeText(section.resetText));
  return bits;
}

function providerLine(provider, result, refreshError) {
  const errorNote = refreshErrorNote(refreshError, Boolean(result));
  if (errorNote) return `${provider.name}: ${errorNote}`;
  if (!result) return `${provider.name}: 未取得`;
  if (result.loggedIn === false) return `${provider.name}: 未ログイン`;
  if (result.empty) return `${provider.name}: 取得できません`;
  return provider.name;
}

function refreshingProviderNames(providers, refreshingProviders) {
  if (!refreshingProviders || typeof refreshingProviders !== 'object') return [];
  return providers
    .filter(provider => provider && refreshingProviders[provider.id])
    .map(provider => provider.name || provider.id)
    .filter(Boolean);
}

function staleProviderLabels(providers, results, nowMs) {
  if (!Number.isFinite(nowMs)) return [];
  return providers
    .map(provider => {
      const result = results[provider.id];
      const info = staleInfo(result, nowMs);
      if (!info || !Number.isFinite(result.capturedAt)) return null;
      return `${provider.name} ${elapsedLabel(result.capturedAt, nowMs)}`;
    })
    .filter(Boolean);
}

function buildStatusSummary({
  providers = [],
  results = {},
  refreshErrors = {},
  refreshing = false,
  refreshingProviders = {},
  nowMs = null
} = {}) {
  const visibleProviders = providers.filter(provider =>
    shouldDisplayProvider(provider, results[provider.id])
  );
  const lines = ['Usage Meter'];
  if (refreshing) {
    const names = refreshingProviderNames(providers, refreshingProviders);
    lines.push(names.length > 0 ? `取得中: ${names.join(' / ')}` : '取得中...');
  }

  const latestCapturedAt = visibleProviders.reduce((latest, provider) => {
    const capturedAt = results[provider.id] && results[provider.id].capturedAt;
    return Number.isFinite(capturedAt) && capturedAt > latest ? capturedAt : latest;
  }, 0);
  const formattedTime = latestCapturedAt > 0 ? formatTime(latestCapturedAt) : null;
  if (formattedTime) {
    const relative = Number.isFinite(nowMs) ? `（${elapsedLabel(latestCapturedAt, nowMs)}）` : '';
    lines.push(`更新: ${formattedTime}${relative}`);
    const staleLabels = staleProviderLabels(visibleProviders, results, nowMs);
    if (staleLabels.length > 0) {
      lines.push(`古いデータ: ${staleLabels.join(' / ')}`);
    }
  }

  if (visibleProviders.length === 0) {
    const emptyState = emptyStateInfo(providers, results);
    lines.push(emptyState.label);
    if (emptyState.detail) lines.push(emptyState.detail);
    return lines.join('\n');
  }

  for (const provider of visibleProviders) {
    const result = results[provider.id];
    lines.push(providerLine(provider, result, refreshErrors[provider.id]));

    const sections = (result && Array.isArray(result.sections) ? result.sections : [])
      .filter(section => section && SECTION_LABELS[section.key]);

    for (const section of sections) {
      const details = sectionDetail(section);
      if (details.length === 0) continue;
      lines.push(`  - ${SECTION_LABELS[section.key]}: ${details.join(' / ')}`);
    }
  }

  return lines.join('\n');
}

module.exports = { buildStatusSummary };

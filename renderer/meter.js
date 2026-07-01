const appEl = document.getElementById('app');
const providersEl = document.getElementById('providers');
const refreshBtn = document.getElementById('refreshBtn');
const closeBtn = document.getElementById('closeBtn');
const RELATIVE_REFRESH_MS = 60 * 1000;

let latestRenderData = null;
let relativeRefreshTimer = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function percentUsed(section) {
  if (!section) return null;
  if (section.percentUsed != null) return clampPercent(section.percentUsed);
  if (section.percentRemaining != null) return clampPercent(100 - section.percentRemaining);
  return null;
}

function usageColor(used, providerColor) {
  if (used == null) return 'var(--muted)';
  if (used >= 90) return 'var(--error)';
  if (used >= 70) return 'var(--warn)';
  return providerColor || 'var(--accent)';
}

function findSection(sections, keys) {
  return sections.find(section => keys.includes(section.key)) || null;
}

function compactResetLabel(label) {
  return String(label || '')
    .replace('にリセット（あと', ' · あと')
    .replace(/）$/, '')
    .replace('にリセット済み', ' · リセット済み')
    .replace('にリセット', ' · リセット');
}

function capturedStatusLabel(result, stale, nowMs) {
  if (stale) return stale.label;
  if (!result || !Number.isFinite(result.capturedAt) || !window.Freshness) return null;
  const prefix = result.loggedIn === false ? '確認' : '更新';
  return `${prefix} · ${window.Freshness.elapsedLabel(result.capturedAt, nowMs)}`;
}

function buildUsageRow(label, section, options) {
  const used = percentUsed(section);
  let paceInfo = null;
  if (options.period === 'session' && window.UsagePace) {
    paceInfo = window.UsagePace.getSessionInfo(section, options.capturedAt, Date.now());
  } else if (options.period === 'weekly' && window.UsagePace) {
    paceInfo = window.UsagePace.getWeeklyInfo(
      section,
      options.capturedAt,
      Date.now(),
      options.weeklyPaceMode
    );
  }
  const row = el('section', 'usage-row');

  const head = el('div', 'usage-head');
  head.append(
    el('span', 'usage-label', label),
    el('span', 'usage-value', used == null ? '—' : used + '%')
  );

  const bar = el('div', 'usage-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', label + 'の使用量');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  if (used != null) bar.setAttribute('aria-valuenow', String(used));

  const fill = el('div', 'usage-fill');
  fill.style.width = (used == null ? 0 : used) + '%';
  const fillColor = usageColor(used, options.color);
  fill.style.background = fillColor;
  fill.style.setProperty('--fill-color', fillColor);
  bar.appendChild(fill);

  if (paceInfo && paceInfo.expectedUsed != null) {
    const marker = el('span', 'pace-marker');
    marker.style.left = paceInfo.expectedUsed + '%';
    marker.title = `現在時刻までの使用目安 ${paceInfo.expectedUsed}%`;
    marker.setAttribute('aria-label', marker.title);
    bar.appendChild(marker);
  }

  row.append(head, bar);
  if (paceInfo) {
    const meta = el('div', 'session-meta');
    if (options.showResetText) {
      const reset = el('span', 'reset-time', compactResetLabel(paceInfo.resetLabel));
      reset.title = paceInfo.resetLabel;
      meta.appendChild(reset);
    } else {
      meta.classList.add('pace-only');
    }
    if (paceInfo.expectedUsed != null) {
      const target = el('span', 'pace-target', `目安${paceInfo.expectedUsed}%`);
      target.title = `現在時刻までの使用目安 ${paceInfo.expectedUsed}%`;
      meta.appendChild(target);
    }
    if (paceInfo.pace.kind !== 'unknown') {
      const pace = el('span', 'pace-label', paceInfo.pace.label);
      pace.dataset.kind = paceInfo.pace.kind;
      if (paceInfo.pace.projected != null) {
        pace.title =
          `現在の目安 ${paceInfo.expectedUsed}% / 使用 ${used}% / ` +
          `終了時 約${paceInfo.pace.projected}%見込み`;
      }
      meta.appendChild(pace);
    }
    row.appendChild(meta);
  } else if (!section) {
    row.appendChild(el('div', 'usage-missing', '取得できません'));
  }
  return row;
}

function buildProvider(meta, result, weeklyPaceMode, nowMs, refreshError, isRefreshingProvider) {
  const stale = window.Freshness && window.Freshness.staleInfo(result, nowMs);
  const refreshErrorNote = window.RefreshStatus && window.RefreshStatus.refreshErrorNote(
    refreshError,
    Boolean(result)
  );
  const provider = el('article', 'provider');
  const capturedLabel = capturedStatusLabel(result, stale, nowMs);
  if (isRefreshingProvider) {
    provider.classList.add('refreshing-provider');
    provider.title = '取得中...';
  }
  if (refreshErrorNote) {
    provider.classList.add('refresh-error');
    provider.title = [provider.title, refreshErrorNote].filter(Boolean).join('\n');
  }
  if (stale) {
    provider.classList.add('stale');
    provider.title = [provider.title, stale.label].filter(Boolean).join('\n');
  }
  provider.dataset.providerId = meta.id;
  provider.style.setProperty('--provider-color', meta.color || 'var(--accent)');
  if (provider.title) {
    provider.setAttribute('aria-label', `${meta.name} ${provider.title.replace(/\n/g, '。 ')}`);
  }

  const head = el('header', 'provider-head');
  if (capturedLabel) head.classList.add('with-substatus');
  const icon = el('span', `provider-icon provider-icon-${meta.id}`);
  icon.setAttribute('aria-hidden', 'true');
  head.append(icon, el('span', 'provider-name', meta.name));
  if (isRefreshingProvider) {
    const spinner = el('span', 'provider-refreshing-icon');
    spinner.title = '取得中...';
    spinner.setAttribute('aria-label', '取得中...');
    head.appendChild(spinner);
  }
  if (stale) {
    const staleClock = el('span', 'stale-clock');
    staleClock.title = stale.label;
    staleClock.setAttribute('aria-label', stale.label);
    head.appendChild(staleClock);
  }
  provider.appendChild(head);

  if (capturedLabel) {
    provider.appendChild(el('div', 'provider-substatus', capturedLabel));
  }

  if (refreshErrorNote) {
    provider.appendChild(el('div', 'provider-note provider-error-note', refreshErrorNote));
  }

  if (result && result.loggedIn === false) {
    provider.appendChild(el('div', 'provider-note', 'ログインが必要です'));
    const button = el('button', 'login-btn', meta.name + ' にログイン');
    button.type = 'button';
    button.addEventListener('click', () => window.api && window.api.openLogin(meta.id));
    provider.appendChild(button);
    return provider;
  }

  const sections = (result && result.sections) || [];
  const session = findSection(sections, ['session', 'fivehour']);
  const weekly = findSection(sections, ['weekly']);
  const rows = el('div', 'usage-rows');
  rows.append(
    buildUsageRow('5時間', session, {
      color: meta.color,
      period: 'session',
      showResetText: true,
      capturedAt: result && result.capturedAt
    }),
    buildUsageRow('週間', weekly, {
      color: meta.color,
      period: 'weekly',
      showResetText: true,
      weeklyPaceMode,
      capturedAt: result && result.capturedAt
    })
  );
  provider.appendChild(rows);
  return provider;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'auto';
}

function resizeToContent() {
  if (!window.api || !window.api.resizeMeter) return;
  requestAnimationFrame(() => window.api.resizeMeter(Math.ceil(appEl.getBoundingClientRect().height)));
}

function scheduleRelativeRefresh() {
  if (relativeRefreshTimer || typeof setInterval !== 'function') return;
  relativeRefreshTimer = setInterval(() => {
    if (latestRenderData) render(latestRenderData);
  }, RELATIVE_REFRESH_MS);
}

function refreshingLabel(data) {
  const names = ((data && data.providers) || [])
    .filter(provider => data.refreshingProviders && data.refreshingProviders[provider.id])
    .map(provider => provider.name || provider.id)
    .filter(Boolean);
  return names.length > 0 ? `取得中: ${names.join(' / ')}` : '取得中...';
}

function setRefreshing(isRefreshing, data) {
  const canRefresh = !data || data.canRefresh !== false;
  appEl.classList.toggle('refreshing', isRefreshing);
  refreshBtn.classList.toggle('spin', isRefreshing);
  refreshBtn.disabled = isRefreshing || !canRefresh;
  refreshBtn.title = !canRefresh
    ? '対象サービスがOFFです'
    : (isRefreshing ? refreshingLabel(data) : '更新');
  refreshBtn.setAttribute('aria-label', refreshBtn.title);
}

function render(data) {
  if (!data) return;
  latestRenderData = data;
  scheduleRelativeRefresh();
  applyTheme(data.prefs && data.prefs.theme);
  setRefreshing(Boolean(data.refreshing), data);
  const nowMs = Date.now();

  const weeklyPaceMode = data.prefs && data.prefs.weeklyPaceMode === 'weekdays'
    ? 'weekdays'
    : 'calendar';
  providersEl.textContent = '';
  const enabled = (data.providers || []).filter(provider =>
    window.ProviderVisibility.shouldDisplayProvider(
      provider,
      data.results && data.results[provider.id]
    )
  );
  if (enabled.length === 0) {
    const emptyState = window.ProviderVisibility.emptyStateInfo(
      data.providers || [],
      data.results || {}
    );
    const note = el('div', 'empty-note');
    note.appendChild(el('strong', 'empty-title', emptyState.label));
    if (emptyState.detail) {
      note.appendChild(el('span', 'empty-detail', emptyState.detail));
    }
    providersEl.appendChild(note);
    resizeToContent();
    return;
  }

  for (const meta of enabled) {
    providersEl.appendChild(buildProvider(
      meta,
      data.results && data.results[meta.id],
      weeklyPaceMode,
      nowMs,
      data.refreshErrors && data.refreshErrors[meta.id],
      Boolean(data.refreshingProviders && data.refreshingProviders[meta.id])
    ));
  }
  resizeToContent();
}

if (window.api) {
  window.api.onUpdate(render);
  window.api.getState().then(render);

  refreshBtn.addEventListener('click', () => {
    if (refreshBtn.disabled) return;
    setRefreshing(true, null);
    Promise.resolve(window.api.refresh()).catch(() => setRefreshing(false));
  });
  closeBtn.addEventListener('click', () => window.api.hide());
}

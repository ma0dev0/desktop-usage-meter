const appEl = document.getElementById('app');
const providersEl = document.getElementById('providers');
const refreshBtn = document.getElementById('refreshBtn');
const closeBtn = document.getElementById('closeBtn');

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

function buildProvider(meta, result, weeklyPaceMode) {
  const provider = el('article', 'provider');
  const head = el('header', 'provider-head');
  const dot = el('span', 'provider-dot');
  dot.style.background = meta.color;
  dot.style.color = meta.color;
  head.append(dot, el('span', 'provider-name', meta.name));
  provider.appendChild(head);

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

function render(data) {
  if (!data) return;
  applyTheme(data.prefs && data.prefs.theme);

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
    providersEl.appendChild(el('div', 'empty-note', '表示するサービスがありません'));
    resizeToContent();
    return;
  }

  for (const meta of enabled) {
    providersEl.appendChild(buildProvider(
      meta,
      data.results && data.results[meta.id],
      weeklyPaceMode
    ));
  }
  resizeToContent();
}

if (window.api) {
  window.api.onUpdate(render);
  window.api.getState().then(render);

  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spin');
    Promise.resolve(window.api.refresh()).finally(() => refreshBtn.classList.remove('spin'));
  });
  closeBtn.addEventListener('click', () => window.api.hide());
}

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok   -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }

  add(...names) {
    const classes = this.classes();
    for (const name of names) classes.add(name);
    this.write(classes);
  }

  remove(...names) {
    const classes = this.classes();
    for (const name of names) classes.delete(name);
    this.write(classes);
  }

  toggle(name, force) {
    const classes = this.classes();
    const shouldAdd = force == null ? !classes.has(name) : Boolean(force);
    if (shouldAdd) classes.add(name);
    else classes.delete(name);
    this.write(classes);
    return shouldAdd;
  }

  contains(name) {
    return this.classes().has(name);
  }

  classes() {
    return new Set(String(this.owner.className || '').split(/\s+/).filter(Boolean));
  }

  write(classes) {
    this.owner.className = Array.from(classes).join(' ');
  }
}

class FakeStyle {
  constructor() {
    this.values = {};
  }

  setProperty(name, value) {
    this.values[name] = String(value);
  }

  getPropertyValue(name) {
    return this.values[name] || '';
  }
}

class FakeElement {
  constructor(tagName, className = '') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = new FakeStyle();
    this.className = className;
    this.classList = new FakeClassList(this);
    this._textContent = '';
    this.title = '';
    this.disabled = false;
    this.type = '';
    this.listeners = {};
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    if (typeof node !== 'string') node.parentNode = this;
    this.children.push(node);
    return node;
  }

  set textContent(value) {
    this._textContent = String(value || '');
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map(child =>
      typeof child === 'string' ? child : child.textContent
    ).join('');
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  getBoundingClientRect() {
    return { height: this.id === 'app' ? 220 : 0 };
  }
}

function makeDocument() {
  const ids = {
    app: new FakeElement('div', 'app'),
    providers: new FakeElement('main', 'providers'),
    refreshBtn: new FakeElement('button', 'iconbtn'),
    closeBtn: new FakeElement('button', 'iconbtn')
  };
  for (const [id, element] of Object.entries(ids)) {
    element.id = id;
  }

  return {
    documentElement: new FakeElement('html'),
    createElement: tag => new FakeElement(tag),
    getElementById: id => ids[id] || null,
    ids
  };
}

function makeFixedDate(nowRef) {
  return class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [nowRef.value]));
    }

    static now() {
      return nowRef.value;
    }

    static parse(value) {
      return Date.parse(value);
    }

    static UTC(...args) {
      return Date.UTC(...args);
    }
  };
}

function createRendererContext(nowMs) {
  const document = makeDocument();
  const nowRef = { value: nowMs };
  const timers = new Map();
  let nextTimerId = 1;
  const context = {
    assert,
    console,
    document,
    Intl,
    Math,
    Number,
    String,
    Promise,
    Date: makeFixedDate(nowRef),
    requestAnimationFrame: callback => callback(),
    setInterval: (callback, ms) => {
      const id = nextTimerId++;
      timers.set(id, { callback, ms });
      return id;
    },
    clearInterval: id => timers.delete(id)
  };
  context.__setNowMs = value => { nowRef.value = value; };
  context.__runIntervals = () => {
    for (const timer of Array.from(timers.values())) timer.callback();
  };
  context.__timerCount = () => timers.size;
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  for (const file of [
    'src/providerVisibility.js',
    'src/freshness.js',
    'src/refreshStatus.js',
    'renderer/usagePace.js',
    'renderer/meter.js'
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, {
      filename: file
    });
  }
  return context;
}

function findAll(root, predicate, acc = []) {
  if (predicate(root)) acc.push(root);
  for (const child of root.children || []) {
    if (typeof child !== 'string') findAll(child, predicate, acc);
  }
  return acc;
}

function byClass(root, className) {
  return findAll(root, node => node.classList && node.classList.contains(className));
}

function sampleData(nowMs, overrides = {}) {
  const result = {
    loggedIn: true,
    capturedAt: nowMs,
    sections: [
      {
        key: 'session',
        percentUsed: 38,
        percentRemaining: 62,
        resetText: '4時間後にリセット'
      },
      {
        key: 'weekly',
        percentUsed: 41,
        percentRemaining: 59,
        resetText: 'リセット：2026/07/03 11:00'
      }
    ]
  };

  return Object.assign({
    refreshing: false,
    prefs: {
      theme: 'auto',
      weeklyPaceMode: 'calendar'
    },
    providers: [
      { id: 'claude', name: 'Claude', color: '#d97757', enabled: true },
      { id: 'codex', name: 'Codex', color: '#3ecf8e', enabled: true }
    ],
    results: {
      claude: result,
      codex: result
    },
    refreshErrors: {}
  }, overrides);
}

const nowMs = new Date('2026-06-30T12:00:00+09:00').getTime();

test('HUDにサービスアイコンと目安値を描画する', () => {
  const context = createRendererContext(nowMs);
  context.render(sampleData(nowMs));
  const root = context.document.getElementById('providers');

  assert.equal(byClass(root, 'provider').length, 2);
  assert.equal(byClass(root, 'provider-icon-claude').length, 1);
  assert.equal(byClass(root, 'provider-icon-codex').length, 1);
  assert.equal(byClass(root, 'provider-dot').length, 0);
  assert.equal(byClass(root, 'pace-marker').length, 4);

  const targets = byClass(root, 'pace-target');
  assert.equal(targets.length, 4);
  assert.ok(targets.every(target => /^目安\d+%$/.test(target.textContent)));

  const substatuses = byClass(root, 'provider-substatus');
  assert.equal(substatuses.length, 2);
  assert.ok(substatuses.every(status => /^更新 · \d+秒前$/.test(status.textContent)));
});

test('HUDは古いデータの経過時間をカード内にも表示する', () => {
  const context = createRendererContext(nowMs);
  const oldMs = nowMs - 20 * 60 * 1000;
  context.render(sampleData(nowMs, {
    results: {
      claude: {
        loggedIn: true,
        capturedAt: oldMs,
        sections: [
          { key: 'session', percentUsed: 38, percentRemaining: 62 }
        ]
      }
    },
    providers: [
      { id: 'claude', name: 'Claude', color: '#d97757', enabled: true }
    ]
  }));
  const root = context.document.getElementById('providers');
  const provider = byClass(root, 'provider')[0];

  assert.equal(provider.classList.contains('stale'), true);
  assert.equal(byClass(root, 'provider-substatus')[0].textContent, '古いデータ · 20分前');
});

test('HUDは時間経過で相対時刻と古いデータ表示を自動更新する', () => {
  const context = createRendererContext(nowMs);
  context.render(sampleData(nowMs));

  assert.equal(context.__timerCount(), 1);
  context.__setNowMs(nowMs + 16 * 60 * 1000);
  context.__runIntervals();

  const root = context.document.getElementById('providers');
  assert.equal(byClass(root, 'provider').length, 2);
  assert.ok(byClass(root, 'provider').every(provider => provider.classList.contains('stale')));
  assert.ok(byClass(root, 'provider-substatus').every(status =>
    status.textContent === '古いデータ · 16分前'
  ));
  assert.equal(context.__timerCount(), 1);
});

test('更新中はHUD操作ボタンの状態にも反映する', () => {
  const context = createRendererContext(nowMs);
  context.render(sampleData(nowMs, { refreshing: true }));
  const app = context.document.getElementById('app');
  const refreshBtn = context.document.getElementById('refreshBtn');

  assert.equal(refreshBtn.disabled, true);
  assert.equal(refreshBtn.title, '取得中...');
  assert.equal(refreshBtn.getAttribute('aria-label'), '取得中...');
  assert.equal(app.classList.contains('refreshing'), true);
  assert.equal(refreshBtn.classList.contains('spin'), true);
});

test('HUDは取得中サービスだけにリングを表示する', () => {
  const context = createRendererContext(nowMs);
  context.render(sampleData(nowMs, {
    refreshing: true,
    refreshingProviders: { codex: true }
  }));
  const root = context.document.getElementById('providers');
  const refreshBtn = context.document.getElementById('refreshBtn');
  const providers = byClass(root, 'provider');
  const claude = providers.find(provider => provider.dataset.providerId === 'claude');
  const codex = providers.find(provider => provider.dataset.providerId === 'codex');

  assert.equal(refreshBtn.title, '取得中: Codex');
  assert.equal(refreshBtn.getAttribute('aria-label'), '取得中: Codex');
  assert.equal(byClass(root, 'provider-refreshing-icon').length, 1);
  assert.equal(claude.classList.contains('refreshing-provider'), false);
  assert.equal(codex.classList.contains('refreshing-provider'), true);
  assert.equal(codex.getAttribute('aria-label').includes('取得中'), true);
});

test('対象サービスOFFならHUDの更新ボタンを無効にする', () => {
  const context = createRendererContext(nowMs);
  context.render(sampleData(nowMs, {
    canRefresh: false,
    providers: [
      { id: 'claude', name: 'Claude', color: '#d97757', enabled: false },
      { id: 'codex', name: 'Codex', color: '#3ecf8e', enabled: false }
    ],
    results: {}
  }));
  const refreshBtn = context.document.getElementById('refreshBtn');

  assert.equal(refreshBtn.disabled, true);
  assert.equal(refreshBtn.title, '対象サービスがOFFです');
  assert.equal(refreshBtn.getAttribute('aria-label'), '対象サービスがOFFです');
});

test('HUDの空状態に理由を表示する', () => {
  const context = createRendererContext(nowMs);
  context.render(sampleData(nowMs, {
    providers: [
      { id: 'claude', name: 'Claude', color: '#d97757', enabled: true },
      { id: 'codex', name: 'Codex', color: '#3ecf8e', enabled: false }
    ],
    results: {
      claude: { loggedIn: false }
    }
  }));
  const root = context.document.getElementById('providers');

  assert.equal(byClass(root, 'provider').length, 0);
  assert.equal(byClass(root, 'empty-title')[0].textContent, 'ログインが必要です');
  assert.equal(byClass(root, 'empty-detail')[0].textContent, 'Claude: 未ログイン');
});

test('HUD CSSはアイコン表示と文字詰めの回帰を防ぐ', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'meter.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'meter.js'), 'utf8');

  assert.match(css, /\.provider-icon-claude/);
  assert.match(css, /\.provider-icon-codex/);
  assert.match(css, /\.provider-refreshing-icon/);
  assert.match(css, /\.provider-substatus/);
  assert.match(css, /\.pace-target/);
  assert.match(css, /\.empty-title/);
  assert.match(css, /\.empty-detail/);
  assert.doesNotMatch(css + js, /provider-dot/);
  assert.doesNotMatch(css, /letter-spacing\s*:\s*-/);
});

console.log(`\n${passed} passed`);

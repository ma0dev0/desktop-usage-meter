// Electron メインプロセス。
// - 隠しウィンドウで Claude/Codex の使用量ページを読み、innerText を解析する
// - トレイ常駐＋常時最前面・透過のメーター窓に表示する
// - ログインはアプリ内（persist パーティション）で1回だけ

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  nativeImage,
  screen,
  globalShortcut,
  clipboard
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { writeJsonAtomic } = require('./src/atomicFile');
const { providers, isLoginUrl } = require('./src/providers');
const { buildStatusSummary } = require('./src/statusSummary');
const { buildNotchStatus } = require('./src/notchStatus');
const {
  evaluateThresholdNotifications,
  notificationStateChanged
} = require('./src/thresholdNotifications');
const {
  canAttemptNotification,
  nextNotificationDeliveryState
} = require('./src/notificationDelivery');
const {
  appendLogText,
  buildLogHeader,
  buildNotchMeterCommand,
  getNotchMeterAvailability,
  statusLabel: notchMeterStatusLabel
} = require('./src/notchMeterLauncher');

const PARTITION = 'persist:usage';
const DISPLAY_REFRESH_MS = 60 * 1000;
const EXTRACT_JS =
  "(() => ({ url: location.href, title: document.title, bodyText: (document.body && document.body.innerText) || '' }))()";

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

let prefs = Object.assign({}, DEFAULT_PREFS);
let results = { claude: null, codex: null };
let refreshErrors = {};
let refreshingProviders = {};
let notificationState = {};
let notificationDeliveryState = {};

let tray = null;
let meterWin = null;
const scrapeWins = {};
let refreshTimer = null;
let displayRefreshTimer = null;
let refreshing = false;
let notchMeterProc = null;
let notchMeterLastError = null;
let notchMeterLaunching = false;
let notchMeterLastLog = '';

function stateFile() {
  return path.join(app.getPath('userData'), 'state.json');
}

function notchStatusFile() {
  return path.join(app.getPath('userData'), 'notch-status.json');
}

function notchMeterLogFile() {
  return path.join(app.getPath('userData'), 'notchmeter.log');
}

function currentNotchStatus(nowMs = Date.now()) {
  return buildNotchStatus({
    providers,
    results,
    prefs,
    nowMs,
    refreshErrors,
    refreshing,
    refreshingProviders
  });
}

function writeNotchStatus() {
  try {
    writeJsonAtomic(notchStatusFile(), currentNotchStatus());
  } catch (e) {
    /* 表示用JSONの出力失敗は本体動作を止めない */
  }
}

function loadState() {
  try {
    const data = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (data.prefs) prefs = Object.assign({}, DEFAULT_PREFS, data.prefs);
    if (data.prefs && data.prefs.providers) prefs.providers = Object.assign({ claude: true, codex: true }, data.prefs.providers);
    if (data.results) results = Object.assign({ claude: null, codex: null }, data.results);
    if (data.notificationState && typeof data.notificationState === 'object') {
      notificationState = data.notificationState;
    }
  } catch (e) {
    /* 初回起動 */
  }
  writeNotchStatus();
}

function saveState() {
  try {
    writeJsonAtomic(stateFile(), { prefs, results, notificationState });
    writeNotchStatus();
  } catch (e) {
    /* 失敗は無視 */
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function iconPath(size) {
  return path.join(__dirname, 'icons', 'icon' + size + '.png');
}

function notificationIcon() {
  const img = nativeImage.createFromPath(iconPath(32));
  return img.isEmpty() ? undefined : img;
}

function showNativeNotification(options) {
  if (!Notification || !Notification.isSupported()) return false;
  try {
    const notification = new Notification(Object.assign({
      silent: false,
      icon: notificationIcon()
    }, options));
    notification.on('click', () => {
      if (!meterWin || meterWin.isDestroyed()) {
        createMeter();
      } else {
        meterWin.show();
      }
      prefs.meterVisible = true;
      saveState();
      updateTray();
    });
    notification.show();
    return true;
  } catch (e) {
    return false;
  }
}

function showThresholdNotifications(events) {
  if (!events.length) return true;
  if (events.length === 1) {
    return showNativeNotification({
      title: events[0].title,
      body: events[0].body
    });
  }

  const visibleEvents = events.slice(0, 4);
  const extraCount = events.length - visibleEvents.length;
  const lines = visibleEvents.map(event => event.summary);
  if (extraCount > 0) lines.push(`ほか ${extraCount} 件`);
  return showNativeNotification({
    title: `Usage Meter: 注意が ${events.length} 件あります`,
    body: lines.join('\n')
  });
}

function syncThresholdNotifications({ notify = true, forceSave = false } = {}) {
  if (prefs.thresholdNotifications === false) {
    if (forceSave) saveState();
    return;
  }
  const nowMs = Date.now();
  const previousState = notificationState;
  const result = evaluateThresholdNotifications({
    status: currentNotchStatus(nowMs),
    state: previousState,
    nowMs
  });

  if (notify && result.events.length > 0 && !canAttemptNotification(notificationDeliveryState, nowMs)) {
    return;
  }

  const delivered = !notify || showThresholdNotifications(result.events);
  notificationDeliveryState = nextNotificationDeliveryState({
    delivered,
    nowMs
  });
  if (!delivered) return;

  notificationState = result.state;
  if (forceSave || notificationStateChanged(previousState, notificationState)) {
    saveState();
  }
}

function runThresholdNotifications() {
  syncThresholdNotifications({ notify: true });
}

// --- スクレイピング ---

function getScrapeWin(id) {
  if (scrapeWins[id] && !scrapeWins[id].isDestroyed()) return scrapeWins[id];
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition: PARTITION, backgroundThrottling: false, sandbox: true }
  });
  scrapeWins[id] = win;
  return win;
}

async function scrapeOne(provider) {
  const win = getScrapeWin(provider.id);
  try {
    await win.loadURL(provider.usageUrl);
  } catch (e) {
    return { error: 'LOAD_FAILED' };
  }

  for (let i = 0; i < 8; i++) {
    await delay(1500);
    let data = null;
    try {
      data = await win.webContents.executeJavaScript(EXTRACT_JS, true);
    } catch (e) {
      continue;
    }
    const curUrl = win.webContents.getURL();
    if (isLoginUrl(curUrl)) return { loggedIn: false, url: curUrl, capturedAt: Date.now() };

    const parsed = provider.parse((data && data.bodyText) || '');
    if (parsed.relatedFound) {
      return Object.assign({}, parsed, {
        loggedIn: true,
        url: (data && data.url) || curUrl,
        capturedAt: Date.now()
      });
    }
  }

  const finalUrl = win.webContents.getURL();
  return { loggedIn: !isLoginUrl(finalUrl), empty: true, url: finalUrl, capturedAt: Date.now() };
}

async function refreshAll(reason) {
  if (refreshing) return;
  const ids = enabledProviderIds();
  if (ids.length === 0) {
    refreshingProviders = {};
    writeNotchStatus();
    pushUpdate();
    updateTray();
    return;
  }
  for (const id of ids) {
    delete refreshErrors[id];
  }
  refreshing = true;
  refreshingProviders = {};
  writeNotchStatus();
  pushUpdate();
  updateTray();
  try {
    for (const id of ids) {
      refreshingProviders = { [id]: true };
      writeNotchStatus();
      pushUpdate();
      updateTray();

      const res = await scrapeOne(providers[id]);
      if (res && res.error) {
        refreshErrors[id] = res.error;
      } else if (res) {
        results[id] = res;
        delete refreshErrors[id];
      }
      refreshingProviders = {};
      writeNotchStatus();
      pushUpdate();
      updateTray();
    }
    refreshing = false;
    refreshingProviders = {};
    saveState();
    runThresholdNotifications();
  } finally {
    refreshing = false;
    refreshingProviders = {};
    writeNotchStatus();
    pushUpdate();
    updateTray();
  }
}

// --- 表示・トレイ ---

function providerMeta() {
  return Object.keys(providers).map(id => ({
    id,
    name: providers[id].name,
    color: providers[id].color,
    enabled: Boolean(prefs.providers[id])
  }));
}

function enabledProviderIds() {
  return Object.keys(providers).filter(id => prefs.providers[id]);
}

function canRefreshProviders() {
  return enabledProviderIds().length > 0;
}

function pushUpdate() {
  if (meterWin && !meterWin.isDestroyed()) {
    meterWin.webContents.send('update', appStatePayload());
  }
}

function appStatePayload() {
  return {
    results,
    prefs,
    providers: providerMeta(),
    refreshing,
    refreshingProviders,
    refreshErrors,
    canRefresh: canRefreshProviders()
  };
}

function refreshingStatusLabel(prefix = '取得中') {
  const names = Object.keys(refreshingProviders || {})
    .filter(id => refreshingProviders[id])
    .map(id => providers[id] && providers[id].name)
    .filter(Boolean);
  return names.length > 0 ? `${prefix}: ${names.join(' / ')}` : `${prefix}...`;
}

function statusSummaryText(nowMs = Date.now()) {
  return buildStatusSummary({
    providers: providerMeta(),
    results,
    refreshErrors,
    refreshing,
    refreshingProviders,
    nowMs
  });
}

function updateTrayTooltip() {
  if (!tray) return;
  tray.setToolTip(statusSummaryText());
}

function updateTray() {
  if (!tray) return;
  updateTrayTooltip();
  tray.setContextMenu(buildTrayMenu());
}

function copyVisibleStatus() {
  clipboard.writeText(statusSummaryText());
}

function canRunNotchMeter() {
  return notchMeterAvailability().available;
}

function notchMeterModeLabel() {
  return notchMeterAvailability().modeLabel;
}

function isNotchMeterRunning() {
  return Boolean(notchMeterProc && !notchMeterProc.killed);
}

function notchMeterAvailability() {
  return getNotchMeterAvailability({
    platform: process.platform,
    appRoot: __dirname,
    resourcesPath: process.resourcesPath,
    existsSync: fs.existsSync
  });
}

function notchMeterCommand() {
  return buildNotchMeterCommand({
    platform: process.platform,
    appRoot: __dirname,
    resourcesPath: process.resourcesPath,
    existsSync: fs.existsSync
  });
}

function resetNotchMeterLog(command) {
  const header = buildLogHeader(command);
  notchMeterLastLog = header;
  try {
    fs.writeFileSync(notchMeterLogFile(), header);
  } catch (e) {
    /* ログ出力失敗は起動を止めない */
  }
}

function appendNotchMeterLog(chunk) {
  const nextLog = appendLogText(notchMeterLastLog, chunk);
  if (nextLog === notchMeterLastLog) return;
  notchMeterLastLog = nextLog;
  try {
    fs.appendFileSync(notchMeterLogFile(), String(chunk || ''));
  } catch (e) {
    /* ログ出力失敗は起動を止めない */
  }
}

function startNotchMeter() {
  if (!canRunNotchMeter() || isNotchMeterRunning() || notchMeterLaunching) return;

  writeNotchStatus();
  notchMeterLastError = null;
  notchMeterLaunching = true;

  const executable = notchMeterCommand();
  resetNotchMeterLog(executable);
  const child = spawn(executable.command, executable.args, {
    cwd: executable.cwd,
    detached: true,
    env: Object.assign({}, process.env, {
      USAGE_METER_STATUS_PATH: notchStatusFile()
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  notchMeterProc = child;
  child.stdout.on('data', appendNotchMeterLog);
  child.stderr.on('data', appendNotchMeterLog);

  child.once('error', error => {
    notchMeterLaunching = false;
    if (notchMeterProc === child) {
      notchMeterProc = null;
    }
    notchMeterLastError = '起動失敗: ' + error.message;
    appendNotchMeterLog('\n[' + new Date().toISOString() + '] spawn error: ' + error.message + '\n');
    updateTray();
  });

  child.once('exit', (code, signal) => {
    notchMeterLaunching = false;
    if (notchMeterProc === child) {
      notchMeterProc = null;
      if (code && signal !== 'SIGTERM') {
        notchMeterLastError = '終了コード ' + code;
        appendNotchMeterLog('\n[' + new Date().toISOString() + '] exit code ' + code + '\n');
      } else if (signal && signal !== 'SIGTERM') {
        notchMeterLastError = '終了シグナル ' + signal;
        appendNotchMeterLog('\n[' + new Date().toISOString() + '] exit signal ' + signal + '\n');
      }
      updateTray();
    }
  });

  setTimeout(() => {
    if (notchMeterProc === child) {
      notchMeterLaunching = false;
      updateTray();
    }
  }, 1500);

  updateTray();
}

function stopNotchMeter() {
  if (!notchMeterProc) return;
  const child = notchMeterProc;
  notchMeterProc = null;
  notchMeterLaunching = false;
  try {
    if (process.platform === 'win32') {
      child.kill();
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch (error) {
    try {
      child.kill();
    } catch (killError) {
      notchMeterLastError = '停止失敗: ' + killError.message;
    }
  }
  updateTray();
}

function copyNotchStatusPath() {
  clipboard.writeText(notchStatusFile());
}

function copyNotchMeterLog() {
  let log = notchMeterLastLog;
  if (!log) {
    try {
      log = fs.readFileSync(notchMeterLogFile(), 'utf8');
    } catch (e) {
      log = '';
    }
  }
  clipboard.writeText(log || 'NotchMeter の起動ログはまだありません。');
}

function buildTrayMenu() {
  const opacities = [1, 0.9, 0.8, 0.65, 0.5];
  const intervals = [1, 5, 15, 30, 60];
  return Menu.buildFromTemplate([
    {
      label: meterWin && meterWin.isVisible() ? 'メーターを隠す' : 'メーターを表示',
      accelerator: 'CommandOrControl+Shift+U',
      click: toggleMeter
    },
    notchMeterMenuItem(),
    {
      label: !canRefreshProviders()
        ? '対象サービスなし'
        : (refreshing ? refreshingStatusLabel('再取得中') : '再取得'),
      enabled: canRefreshProviders() && !refreshing,
      click: () => refreshAll('manual')
    },
    { label: '現在の状態をコピー', click: copyVisibleStatus },
    { type: 'separator' },
    {
      label: '透明度',
      submenu: opacities.map(o => ({
        label: Math.round(o * 100) + '%',
        type: 'radio',
        checked: Math.abs((prefs.opacity || 1) - o) < 0.001,
        click: () => { prefs.opacity = o; applyMeterPrefs(); saveState(); }
      }))
    },
    {
      label: '常に最前面',
      type: 'checkbox',
      checked: Boolean(prefs.alwaysOnTop),
      click: m => { prefs.alwaysOnTop = m.checked; applyMeterPrefs(); saveState(); }
    },
    {
      label: 'テーマ',
      submenu: [
        themeItem('自動', 'auto'),
        themeItem('ライト', 'light'),
        themeItem('ダーク', 'dark')
      ]
    },
    {
      label: '自動更新間隔',
      submenu: intervals.map(min => ({
        label: min + '分',
        type: 'radio',
        checked: prefs.intervalMin === min,
        click: () => { prefs.intervalMin = min; startTimer(); saveState(); }
      }))
    },
    {
      label: 'しきい値通知',
      type: 'checkbox',
      checked: prefs.thresholdNotifications !== false,
      click: menuItem => {
        prefs.thresholdNotifications = menuItem.checked;
        if (menuItem.checked) {
          syncThresholdNotifications({ notify: false, forceSave: true });
        } else {
          notificationState = {};
          saveState();
        }
      }
    },
    {
      label: '週間ペースの計算',
      submenu: [
        weeklyPaceItem('7日間（土日を含む）', 'calendar'),
        weeklyPaceItem('平日5日', 'weekdays')
      ]
    },
    { type: 'separator' },
    {
      label: '対象サービス',
      submenu: Object.keys(providers).map(id => ({
        label: providers[id].name,
        type: 'checkbox',
        checked: Boolean(prefs.providers[id]),
        click: m => { prefs.providers[id] = m.checked; saveState(); refreshAll('toggle'); }
      }))
    },
    { label: 'Claude にログイン', click: () => openLogin('claude') },
    { label: 'Codex にログイン', click: () => openLogin('codex') },
    { type: 'separator' },
    {
      label: '起動時に自動起動',
      type: 'checkbox',
      checked: Boolean(prefs.autoLaunch),
      click: m => { prefs.autoLaunch = m.checked; applyAutoLaunch(); saveState(); }
    },
    { label: '終了', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
}

function notchMeterMenuItem() {
  const available = canRunNotchMeter();
  const running = isNotchMeterRunning();
  const statusLabel = notchMeterStatusLabel({
    available,
    launching: notchMeterLaunching,
    running,
    lastError: notchMeterLastError
  });
  const modeLabel = available ? notchMeterModeLabel() : 'macOSのみ';

  return {
    label: 'NotchMeter（ノッチ表示）',
    enabled: process.platform === 'darwin',
    submenu: [
      { label: statusLabel, enabled: false },
      { label: modeLabel, enabled: false },
      { type: 'separator' },
      {
        label: '起動',
        enabled: available && !running && !notchMeterLaunching,
        click: startNotchMeter
      },
      {
        label: '停止',
        enabled: running || notchMeterLaunching,
        click: stopNotchMeter
      },
      {
        label: '本体起動時に開く',
        type: 'checkbox',
        checked: Boolean(prefs.notchMeterAutoStart),
        enabled: available,
        click: menuItem => {
          prefs.notchMeterAutoStart = menuItem.checked;
          saveState();
          if (menuItem.checked) startNotchMeter();
        }
      },
      { type: 'separator' },
      { label: 'JSONパスをコピー', click: copyNotchStatusPath },
      {
        label: '起動ログをコピー',
        enabled: Boolean(notchMeterLastLog || notchMeterLastError || fs.existsSync(notchMeterLogFile())),
        click: copyNotchMeterLog
      }
    ]
  };
}

function themeItem(label, value) {
  return {
    label,
    type: 'radio',
    checked: (prefs.theme || 'auto') === value,
    click: () => { prefs.theme = value; pushUpdate(); saveState(); }
  };
}

function weeklyPaceItem(label, value) {
  return {
    label,
    type: 'radio',
    checked: (prefs.weeklyPaceMode || 'calendar') === value,
    click: () => {
      prefs.weeklyPaceMode = value;
      pushUpdate();
      saveState();
    }
  };
}

// --- メーター窓 ---

function defaultMeterBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const width = 320;
  const height = 180;
  return { width, height, x: wa.x + wa.width - width - 16, y: wa.y + 16 };
}

function createMeter() {
  if (meterWin && !meterWin.isDestroyed()) {
    meterWin.show();
    return;
  }
  const b = prefs.meterBounds || defaultMeterBounds();
  meterWin = new BrowserWindow({
    width: b.width,
    height: b.height,
    x: b.x,
    y: b.y,
    minWidth: 280,
    minHeight: 100,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: prefs.alwaysOnTop,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true }
  });

  meterWin.loadFile(path.join(__dirname, 'renderer', 'meter.html'));
  meterWin.webContents.on('did-finish-load', () => pushUpdate());
  applyMeterPrefs();

  meterWin.once('ready-to-show', () => {
    if (prefs.meterVisible !== false) meterWin.show();
  });

  meterWin.on('close', e => {
    try { prefs.meterBounds = meterWin.getBounds(); } catch (err) {}
    if (!app.isQuitting) {
      e.preventDefault();
      meterWin.hide();
      prefs.meterVisible = false;
      saveState();
      updateTray();
    }
  });
}

function toggleMeter() {
  if (!meterWin || meterWin.isDestroyed()) {
    prefs.meterVisible = true;
    createMeter();
  } else if (meterWin.isVisible()) {
    meterWin.hide();
    prefs.meterVisible = false;
  } else {
    meterWin.show();
    prefs.meterVisible = true;
  }
  saveState();
  updateTray();
}

function applyMeterPrefs() {
  if (!meterWin || meterWin.isDestroyed()) return;
  meterWin.setOpacity(typeof prefs.opacity === 'number' ? prefs.opacity : 1);
  meterWin.setAlwaysOnTop(Boolean(prefs.alwaysOnTop), 'screen-saver');
  pushUpdate();
}

// --- ログイン ---

function openLogin(id) {
  const provider = providers[id];
  if (!provider) return;
  const win = new BrowserWindow({
    width: 1000,
    height: 820,
    title: provider.name + ' にログイン',
    webPreferences: { partition: PARTITION, sandbox: true }
  });
  win.loadURL(provider.usageUrl);
  win.on('closed', () => { refreshAll('login-closed'); });
}

// --- その他 ---

function startTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  const min = prefs.intervalMin > 0 ? prefs.intervalMin : 5;
  refreshTimer = setInterval(() => refreshAll('timer'), min * 60 * 1000);
}

function startDisplayRefreshTimer() {
  if (displayRefreshTimer) clearInterval(displayRefreshTimer);
  displayRefreshTimer = setInterval(refreshDisplayState, DISPLAY_REFRESH_MS);
}

function stopDisplayRefreshTimer() {
  if (!displayRefreshTimer) return;
  clearInterval(displayRefreshTimer);
  displayRefreshTimer = null;
}

function refreshDisplayState() {
  updateTrayTooltip();
  runThresholdNotifications();
}

function applyAutoLaunch() {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(prefs.autoLaunch) });
  } catch (e) {
    /* 一部環境では未対応 */
  }
}

function createTray() {
  let img = nativeImage.createFromPath(iconPath(32));
  if (img.isEmpty()) img = nativeImage.createFromPath(iconPath(16));
  tray = new Tray(img);
  tray.setToolTip('Usage Meter');
  tray.on('click', toggleMeter);
  updateTray();
}

function registerShortcuts() {
  try {
    const ok = globalShortcut.register('CommandOrControl+Shift+U', toggleMeter);
    if (!ok) {
      console.warn('global shortcut registration failed: CommandOrControl+Shift+U');
    }
  } catch (error) {
    console.warn('global shortcut registration failed', error);
  }
}

// --- IPC ---

ipcMain.handle('getState', () => appStatePayload());
ipcMain.handle('refresh', () => refreshAll('renderer'));
ipcMain.on('openLogin', (e, id) => openLogin(id));
ipcMain.on('hideMeter', () => { if (meterWin) { meterWin.hide(); prefs.meterVisible = false; saveState(); updateTray(); } });
ipcMain.on('resizeMeter', (e, height) => {
  if (!meterWin || meterWin.isDestroyed() || e.sender !== meterWin.webContents) return;
  const bounds = meterWin.getBounds();
  const nextHeight = Math.max(100, Math.min(440, Math.ceil(Number(height) || 0)));
  if (Math.abs(bounds.height - nextHeight) > 1) {
    meterWin.setBounds(Object.assign({}, bounds, { height: nextHeight }), false);
  }
});
ipcMain.on('setTheme', (e, theme) => { prefs.theme = theme; saveState(); pushUpdate(); updateTray(); });
ipcMain.on('setWeeklyPaceMode', (e, mode) => {
  prefs.weeklyPaceMode = mode === 'weekdays' ? 'weekdays' : 'calendar';
  saveState();
  pushUpdate();
});

// --- アプリ起動 ---

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => toggleMeter());
  app.on('will-quit', () => {
    stopDisplayRefreshTimer();
    stopNotchMeter();
    globalShortcut.unregisterAll();
  });

  app.whenReady().then(() => {
    loadState();
    applyAutoLaunch();
    createTray();
    if (prefs.notchMeterAutoStart) startNotchMeter();
    registerShortcuts();
    createMeter();
    startTimer();
    startDisplayRefreshTimer();
    refreshAll('startup');
  });

  // トレイ常駐アプリなので、全ウィンドウを閉じても終了しない。
  app.on('window-all-closed', e => {});
}

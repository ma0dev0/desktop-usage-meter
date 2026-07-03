// 直近の取得失敗を、HUD/トレイで短く一貫して表示する。
(function exposeRefreshStatus(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RefreshStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const ERROR_LABELS = {
    LOAD_FAILED: '読み込み失敗',
    PARSE_FAILED: '解析失敗'
  };

  function refreshErrorLabel(error) {
    if (!error) return '';
    const code = typeof error === 'string' ? error : error.error;
    return ERROR_LABELS[code] || '取得失敗';
  }

  function refreshErrorNote(error, hasPreviousValue) {
    const label = refreshErrorLabel(error);
    if (!label) return '';
    return hasPreviousValue ? `${label} · 前回値を表示` : label;
  }

  return {
    refreshErrorLabel,
    refreshErrorNote
  };
});

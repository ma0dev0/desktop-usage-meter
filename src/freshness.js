// 表示データが古いかどうかを、HUD/NotchMeter用ロジックで共有する。
(function exposeFreshness(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Freshness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const STALE_AFTER_MS = 15 * 60 * 1000;

  function elapsedLabel(sinceMs, nowMs) {
    const seconds = Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
    if (seconds < 60) return `${Math.max(1, seconds)}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  }

  function staleInfo(result, nowMs = Date.now()) {
    if (!result || !Number.isFinite(result.capturedAt)) return null;
    const ageMs = nowMs - result.capturedAt;
    if (ageMs < STALE_AFTER_MS) return null;
    return {
      label: `古いデータ · ${elapsedLabel(result.capturedAt, nowMs)}`,
      ageMs
    };
  }

  return {
    STALE_AFTER_MS,
    elapsedLabel,
    staleInfo
  };
});

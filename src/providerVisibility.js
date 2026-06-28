// プロバイダーをメーターやトレイに表示するかを判定する。
(function exposeProviderVisibility(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProviderVisibility = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function shouldDisplayProvider(provider, result) {
    if (!provider || !provider.enabled) return false;

    // Claude は未ログインならカードを隠し、Codex だけを表示する。
    return provider.id !== 'claude' || !result || result.loggedIn !== false;
  }

  return { shouldDisplayProvider };
});

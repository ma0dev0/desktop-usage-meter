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

  function hiddenProviderReason(provider, result) {
    if (!provider || !provider.enabled) return '';
    if (provider.id === 'claude' && result && result.loggedIn === false) {
      return `${provider.name || 'Claude'}: 未ログイン`;
    }
    return '';
  }

  function emptyStateInfo(providers = [], results = {}) {
    const enabledProviders = providers.filter(provider => provider && provider.enabled);
    if (enabledProviders.length === 0) {
      return {
        label: '対象サービスがOFFです',
        detail: 'トレイメニューでClaudeまたはCodexを有効にできます'
      };
    }

    const hiddenReasons = enabledProviders
      .map(provider => hiddenProviderReason(provider, results[provider.id]))
      .filter(Boolean);
    if (hiddenReasons.length === enabledProviders.length && hiddenReasons.length > 0) {
      return {
        label: 'ログインが必要です',
        detail: hiddenReasons.join(' / ')
      };
    }

    return {
      label: '表示するサービスがありません',
      detail: ''
    };
  }

  return {
    shouldDisplayProvider,
    hiddenProviderReason,
    emptyStateInfo
  };
});

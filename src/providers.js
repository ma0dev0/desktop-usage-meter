// 取得対象サービスの定義。main プロセスから使う。

const claude = require('./claudeParser');
const codex = require('./codexParser');

// ログイン画面に飛ばされたかの判定。
function isLoginUrl(url) {
  return /\/(login|log-in|signin|sign-in|auth)\b|auth0\.com|accounts\.google|auth\.openai\.com|openai\.com\/auth/i.test(
    url || ''
  );
}

const providers = {
  claude: {
    id: 'claude',
    name: 'Claude',
    color: '#d97757',
    usageUrl: 'https://claude.ai/settings/usage',
    parse: bodyText => claude.parseUsage({ fullText: bodyText }),
    formatBadge: claude.formatBadge,
    badgeColor: claude.badgeColor
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    color: '#10a37f',
    usageUrl: 'https://chatgpt.com/codex/cloud/settings/analytics',
    parse: bodyText => codex.parseUsage({ fullText: bodyText }),
    formatBadge: codex.formatBadge,
    badgeColor: codex.badgeColor
  }
};

module.exports = { providers, isLoginUrl };

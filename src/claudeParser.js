// Claude の Usage ページ innerText を解析する純粋ロジック（CommonJS）。
// Chrome拡張 ClaudeUsageMeter の usageParser.js を Electron(main)で require できるよう移植。

const USAGE_KEYWORDS = [
  'usage', 'used', 'remaining', 'left', 'limit', 'limits', 'quota',
  'message', 'messages', 'prompt', 'prompts', 'request', 'requests',
  'reset', 'resets', 'session', 'weekly', 'daily', 'allowance',
  'out of', 'plan', 'pro', 'max',
  '使用', '使用量', '利用', '残り', '残量', '上限', '制限',
  'リセット', 'メッセージ', 'プロンプト', 'リクエスト', 'プラン', '今週', '本日'
];

const SECTION_DEFS = [
  { key: 'session', label: '現在のセッション', re: /現在のセッション|current\s*session/i },
  { key: 'weekly', label: '週間制限', re: /週間|すべてのモデル|weekly|all\s*models/i },
  { key: 'credit', label: '利用クレジット', re: /利用クレジット|クレジット|\bcredit/i }
];

const RESET_RE = /(リセット|resets?\b)/i;
const COUNT_KEYWORD_RE =
  /(message|messages|prompt|prompts|request|requests|token|tokens|メッセージ|プロンプト|リクエスト|out of)/i;
const REMAINING_RE = /(remaining|left|残り|残量)/i;
const USED_RE = /(used|consumed|使用|使った|利用済)/i;
const PERCENT_RE = /(\d{1,3})(?:\.\d+)?\s*%/;
const FRACTION_RE = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/;

function toInt(s) {
  return parseInt(String(s).replace(/,/g, ''), 10);
}

function clampPercent(n) {
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function containsUsageKeyword(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  const lower = text.toLowerCase();
  return USAGE_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

function parsePercentFromLine(line) {
  if (typeof line !== 'string' || line.length === 0) return null;
  const snippet = line.trim();

  const frac = line.match(FRACTION_RE);
  if (frac) {
    const used = toInt(frac[1]);
    const total = toInt(frac[2]);
    const plausible = total >= 2 && total <= 1000000 && used >= 0 && used <= total;
    if (plausible && (COUNT_KEYWORD_RE.test(line) || containsUsageKeyword(line))) {
      return {
        basis: 'fraction',
        percentRemaining: clampPercent(((total - used) / total) * 100),
        percentUsed: clampPercent((used / total) * 100),
        used,
        total,
        snippet
      };
    }
  }

  const pctMatch = line.match(PERCENT_RE);
  if (pctMatch) {
    const pct = clampPercent(Number(pctMatch[1]));
    if (pct !== null) {
      if (REMAINING_RE.test(line)) {
        return { basis: 'percent-remaining', percentRemaining: pct, percentUsed: clampPercent(100 - pct), snippet };
      }
      if (USED_RE.test(line)) {
        return { basis: 'percent-used', percentRemaining: clampPercent(100 - pct), percentUsed: pct, snippet };
      }
      return { basis: 'percent-ambiguous', percentRemaining: null, percentRaw: pct, snippet };
    }
  }
  return null;
}

function usedOrRemainingPercentInBlock(block) {
  for (const line of block) {
    const pm = line.match(PERCENT_RE);
    if (pm) return clampPercent(Number(pm[1]));
  }
  return null;
}

function parseUsageSections(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    const def = SECTION_DEFS.find(d => d.re.test(lines[i]));
    if (def) marks.push({ index: i, def });
  }
  if (marks.length === 0) return [];

  const out = [];
  for (let m = 0; m < marks.length; m++) {
    const start = marks[m].index;
    const end = m + 1 < marks.length ? marks[m + 1].index : lines.length;
    const block = lines.slice(start, end);

    const percent = usedOrRemainingPercentInBlock(block);
    if (percent == null) continue;

    const blockText = block.join(' ');
    let percentUsed;
    if (USED_RE.test(blockText) && !REMAINING_RE.test(blockText)) {
      percentUsed = percent;
    } else if (REMAINING_RE.test(blockText)) {
      percentUsed = clampPercent(100 - percent);
    } else {
      percentUsed = percent; // Claude は「使用済み」表記が既定
    }

    let resetText = '';
    for (const line of block) {
      if (RESET_RE.test(line)) { resetText = line; break; }
    }

    out.push({
      key: marks[m].def.key,
      label: marks[m].def.label,
      percentUsed,
      percentRemaining: clampPercent(100 - percentUsed),
      resetText
    });
  }

  const seen = new Set();
  return out.filter(s => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });
}

function pickConstraining(sections) {
  const relevant = sections.filter(s => s.key === 'session' || s.key === 'weekly');
  if (relevant.length === 0) return null;
  return relevant.reduce((min, s) => (s.percentRemaining < min.percentRemaining ? s : min));
}

function parseUsage(input) {
  input = input || {};
  const textCandidates = Array.isArray(input.textCandidates) ? input.textCandidates : [];
  const fullText =
    typeof input.fullText === 'string' && input.fullText ? input.fullText : textCandidates.join('\n');

  const sections = parseUsageSections(fullText);

  const candidates = [];
  for (const line of textCandidates) {
    const r = parsePercentFromLine(line);
    if (r) candidates.push(r);
  }

  const constraining = pickConstraining(sections);
  const fallback = candidates.filter(c => c.percentRemaining != null)[0] || null;

  let representative = null;
  if (constraining) {
    representative = {
      basis: 'section:' + constraining.key,
      percentRemaining: constraining.percentRemaining,
      percentUsed: constraining.percentUsed
    };
  } else if (fallback) {
    representative = fallback;
  }

  const relatedFound = sections.length > 0 || candidates.length > 0 || textCandidates.length > 0;

  return {
    determined: Boolean(representative),
    percentRemaining: representative ? representative.percentRemaining : null,
    percentUsed: representative && representative.percentUsed != null ? representative.percentUsed : null,
    basis: representative ? representative.basis : null,
    sections,
    stats: [],
    relatedFound
  };
}

function formatBadge(result) {
  if (!result) return '';
  if (result.determined && result.percentRemaining != null) return `${result.percentRemaining}%`;
  if (result.relatedFound) return '?';
  return '';
}

function badgeColor(result) {
  if (result && result.determined && result.percentRemaining != null) {
    const r = result.percentRemaining;
    if (r <= 10) return '#d93025';
    if (r <= 30) return '#f29900';
    return '#188038';
  }
  return '#5f6368';
}

module.exports = {
  USAGE_KEYWORDS,
  containsUsageKeyword,
  parsePercentFromLine,
  parseUsageSections,
  parseUsage,
  formatBadge,
  badgeColor
};

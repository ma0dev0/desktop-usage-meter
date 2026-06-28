// Codex アナリティクスの innerText を解析する純粋ロジック（CommonJS）。
// Chrome拡張 CodexUsageMeter の usageParser.js を Electron(main)で require できるよう移植。
// Codex は「残り%」表示。パーセントと「残り」が別要素のためブロック単位で解析する。

const USAGE_KEYWORDS = [
  '使用制限', '利用上限', '上限', '制限', '残り', '残量', 'リセット',
  'クレジット', '使用状況', 'ターン', 'アナリティクス', '週間', '5時間',
  'codex', 'usage', 'limit', 'remaining', 'reset', 'credit', 'plugins', 'skills',
  'used', 'turn'
];

const SECTION_DEFS = [
  { key: 'fivehour', label: '5時間の使用制限', re: /5\s*時間|5[-\s]?hour|five[-\s]?hour/i },
  { key: 'weekly', label: '週間利用上限', re: /週間|weekly/i }
];

const STAT_DEFS = [
  { key: 'turns', label: 'ターン数', re: /^ターン数$|^turns?$/i },
  { key: 'credit', label: '残りのクレジット', re: /^残りのクレジット$|^remaining\s*credits?$/i },
  { key: 'plugins', label: 'Plugins calls', re: /^plugins?\s*calls?$/i },
  { key: 'skills', label: 'Skills used', re: /^skills?\s*used$/i }
];

const STAT_SCAN_LINES = 3;
const SECTION_SCAN_LINES = 8;

const PERCENT_RE = /(\d{1,3})(?:\.\d+)?\s*%/;
const NUMERIC_RE = /^[\d][\d,]*(?:\.\d+)?[KkMm]?$/;
const RESET_RE = /(リセット|resets?\b)/i;
const REMAINING_RE = /(残り|remaining|left)/i;
const USED_RE = /(使用済み|used|消費)/i;

function clampPercent(n) {
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function containsUsageKeyword(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  const lower = text.toLowerCase();
  return USAGE_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
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
    const hardEnd = m + 1 < marks.length ? marks[m + 1].index : lines.length;
    const end = Math.min(hardEnd, start + SECTION_SCAN_LINES);
    const block = lines.slice(start, end);

    let percent = null;
    for (const line of block) {
      const pm = line.match(PERCENT_RE);
      if (pm) { percent = clampPercent(Number(pm[1])); break; }
    }
    if (percent == null) continue;

    const blockText = block.join(' ');
    let percentRemaining;
    if (REMAINING_RE.test(blockText)) {
      percentRemaining = percent;
    } else if (USED_RE.test(blockText)) {
      percentRemaining = clampPercent(100 - percent);
    } else {
      percentRemaining = percent;
    }

    let resetText = '';
    for (const line of block) {
      if (RESET_RE.test(line)) { resetText = line; break; }
    }

    out.push({
      key: marks[m].def.key,
      label: marks[m].def.label,
      percentRemaining,
      percentUsed: clampPercent(100 - percentRemaining),
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

function parseStats(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const found = {};
  for (let i = 0; i < lines.length; i++) {
    const def = STAT_DEFS.find(d => d.re.test(lines[i]));
    if (!def || found[def.key]) continue;
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + STAT_SCAN_LINES); j++) {
      if (NUMERIC_RE.test(lines[j])) {
        found[def.key] = { key: def.key, label: def.label, value: lines[j] };
        break;
      }
    }
  }
  return STAT_DEFS.map(d => found[d.key]).filter(Boolean);
}

function pickConstraining(sections) {
  const relevant = sections.filter(s => s.key === 'fivehour' || s.key === 'weekly');
  if (relevant.length === 0) return null;
  return relevant.reduce((min, s) => (s.percentRemaining < min.percentRemaining ? s : min));
}

function parseUsage(input) {
  input = input || {};
  const textCandidates = Array.isArray(input.textCandidates) ? input.textCandidates : [];
  const fullText =
    typeof input.fullText === 'string' && input.fullText ? input.fullText : textCandidates.join('\n');

  const sections = parseUsageSections(fullText);
  const stats = parseStats(fullText);

  const constraining = pickConstraining(sections);
  let representative = null;
  if (constraining) {
    representative = {
      basis: 'section:' + constraining.key,
      percentRemaining: constraining.percentRemaining,
      percentUsed: constraining.percentUsed
    };
  }

  const relatedFound = sections.length > 0 || stats.length > 0 || textCandidates.length > 0;

  return {
    determined: Boolean(representative),
    percentRemaining: representative ? representative.percentRemaining : null,
    percentUsed: representative && representative.percentUsed != null ? representative.percentUsed : null,
    basis: representative ? representative.basis : null,
    sections,
    stats,
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
  parseUsageSections,
  parseStats,
  parseUsage,
  formatBadge,
  badgeColor
};

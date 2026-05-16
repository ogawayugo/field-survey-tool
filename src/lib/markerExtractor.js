// src/lib/markerExtractor.js
// 表III-2・23 基準のマーカーtextbox→括弧内表記の抽出ロジック
// 対応する Python 実装: marker_extractor.py

let rulesCache = null;

/**
 * 抽出ルールをロード（初回のみfetch、以降はキャッシュ）
 */
export async function loadExtractionRules(url = '/extraction_rules.json') {
  if (rulesCache) return rulesCache;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    rulesCache = data.rules || {};
    return rulesCache;
  } catch (e) {
    console.error('extraction_rules.json の読み込みに失敗:', e);
    rulesCache = {};
    return rulesCache;
  }
}

/**
 * キャッシュ済みルールを同期取得（ロード前は空）
 */
export function getCachedRules() {
  return rulesCache || {};
}

/**
 * テスト用：ルールキャッシュをリセット
 */
export function resetRulesCache() {
  rulesCache = null;
}

/**
 * 括弧内（()または（））の中身を返す
 */
function extractParensContent(text) {
  const m = text.match(/[（(]([^（）()]+)[）)]/);
  return m ? m[1].trim() : '';
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 先頭のチップ名を削除（括弧は食べない）
 */
function stripChipName(text, item) {
  if (!text || !item) return text;
  const escaped = escapeRegex(item);
  const pattern = new RegExp('^' + escaped + '[\\s　、。：:]?');
  return text.replace(pattern, '').trim();
}

function applyPatternFormat(text, rule) {
  const fields = rule.fields || [];
  const fmt = rule.format || '';
  const extracted = {};
  let anyMatch = false;

  for (const f of fields) {
    const re = new RegExp(f.regex);
    const m = text.match(re);
    extracted[f.name] = m ? m[0].trim() : '';
    if (extracted[f.name]) anyMatch = true;
  }

  if (!anyMatch) return '';

  let result = fmt;
  for (const [k, v] of Object.entries(extracted)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return result.replace(/\s+/g, ' ').trim();
}

function applyFirstMatch(text, rule) {
  const patterns = rule.patterns || [];
  const mode = rule.mode || 'position';

  if (mode === 'priority') {
    for (const p of patterns) {
      const m = text.match(new RegExp(p.regex));
      if (m) return m[0].trim();
    }
    return '';
  }

  // position mode (先勝ち)
  let bestPos = null;
  let bestMatch = null;
  for (const p of patterns) {
    const re = new RegExp(p.regex);
    const m = text.match(re);
    if (m && (bestPos === null || m.index < bestPos)) {
      bestPos = m.index;
      bestMatch = m[0].trim();
    }
  }
  return bestMatch || '';
}

function applyStyle(text, rule) {
  const style = rule.style;
  if (style === 'pattern_format') return applyPatternFormat(text, rule);
  if (style === 'parens_or_fulltext') {
    const p = extractParensContent(text);
    return p || text.trim();
  }
  if (style === 'first_match') return applyFirstMatch(text, rule);
  if (style === 'single_regex') {
    const m = text.match(new RegExp(rule.regex));
    return m ? m[0].trim() : '';
  }
  return '';
}

/**
 * マーカーから括弧内テキストを抽出する
 * @param {string} text - マーカーの textbox 内容
 * @param {string} item - 診断項目名
 * @param {object} rules - 抽出ルール辞書
 * @param {string} part - 部位（建築限界越え用、option）
 * @returns {string} 括弧内テキスト
 */
export function extractSummary(text, item, rules, part = null) {
  if (!text || !rules) return '';
  // 項目名の正規化（半角括弧→全角）
  const itemNormalized = item.replace(/\(/g, '（').replace(/\)/g, '）');
  const rule = rules[itemNormalized];
  if (!rule) return '';

  const stripped = stripChipName(text, itemNormalized);

  if (rule.style === 'part_dependent') {
    const sub = (rule.by_part || {})[part];
    if (!sub) return '';
    return applyStyle(stripped, sub);
  }

  return applyStyle(stripped, rule);
}

/**
 * キャッシュ済みルールを使う同期版（コンポーネントから呼びやすい）
 */
export function extractSummaryWithCache(text, item, part = null) {
  return extractSummary(text, item, getCachedRules(), part);
}

/**
 * 複数マーカーの summary を集約（Pattern II）
 * @param {string[]} summaries - 各マーカーの summary
 * @param {string} item - 項目名
 * @param {object} rules - 抽出ルール辞書
 * @returns {string} 集約結果
 */
export function aggregateSummaries(summaries, item, rules) {
  const items = summaries.filter(s => s);
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];

  const first = items[0];
  const n = items.length;
  const itemNormalized = item.replace(/\(/g, '（').replace(/\)/g, '）');
  const rule = (rules && rules[itemNormalized]) || {};
  const agg = rule.aggregation || 'default';

  if (agg === 'count_x') {
    return `${first} ×${n}`;
  }
  return `${first} 他${n - 1}箇所`;
}

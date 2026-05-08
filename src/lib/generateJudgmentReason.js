// src/lib/generateJudgmentReason.js

// ==================== 活力判定 ====================

/**
 * 活力関連キーワード辞書
 * - match: メモから検出する単語（複数表記対応）
 * - phrase: 文章中で使う形（名詞句）
 */
const VITALITY_KEYWORDS = [
  { match: ['葉量少', '葉少', '少葉'], phrase: '葉量の減少' },
  { match: ['葉量中', '葉量中程度'], phrase: '中程度の葉量' },
  { match: ['葉量多', '葉多'], phrase: '十分な葉量' },
  { match: ['枯れ枝少', '枯枝少'], phrase: '軽微な枯れ枝' },
  { match: ['枯れ枝多', '枯枝多', '枯れ枝多数'], phrase: '多数の枯れ枝' },
  { match: ['新梢伸長不良', '新梢伸長不高', '新梢不良'], phrase: '新梢伸長の不良' },
  { match: ['黄化'], phrase: '葉の黄化' },
  { match: ['褐色'], phrase: '葉の褐色変' },
  { match: ['葉わずらい', '葉煩い'], phrase: '葉のわずらい' },
  { match: ['梢枝枯れ', '枝先枯れ', '梢枝先枯'], phrase: '梢枝および枝先の枯死' },
  { match: ['スカシライト', '透け見え', 'すかし'], phrase: '樹冠のスカシライト（透け見え）' },
  { match: ['葉象不良', '葉しわ', '葉のしわ'], phrase: '葉象の不良' },
  { match: ['枯れ上がり', '枯上がり'], phrase: '下枝の枯れ上がり' },
];

/**
 * 樹勢・樹形の数値（1〜5）に対応する評価語
 */
const VIGOR_LABEL = {
  1: '良好',
  2: 'やや不良',
  3: '不良',
  4: '不良（重度）',
  5: '枯死寸前',
};

/**
 * メモから活力関連キーワードのフレーズを抽出
 */
function extractVitalityPhrases(memo) {
  if (!memo) return [];
  const found = [];
  const seen = new Set();
  for (const entry of VITALITY_KEYWORDS) {
    for (const m of entry.match) {
      if (memo.includes(m) && !seen.has(entry.phrase)) {
        found.push(entry.phrase);
        seen.add(entry.phrase);
        break;
      }
    }
  }
  return found;
}

/**
 * フレーズ配列を「A、BおよびC」形式で結合
 */
function joinPhrases(phrases) {
  if (phrases.length === 0) return '';
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]}および${phrases[1]}`;
  const head = phrases.slice(0, -1).join('、');
  const tail = phrases[phrases.length - 1];
  return `${head}および${tail}`;
}

/**
 * 樹勢・樹形の総合評価文を生成
 */
function buildVigorVerdict(sei, kei) {
  const seiLabel = (sei != null && sei in VIGOR_LABEL) ? VIGOR_LABEL[sei] : null;
  const keiLabel = (kei != null && kei in VIGOR_LABEL) ? VIGOR_LABEL[kei] : null;

  if (seiLabel && keiLabel) {
    if (seiLabel === keiLabel) {
      return `樹勢・樹形ともに${seiLabel}と判断した`;
    } else {
      return `樹勢は${seiLabel}、樹形は${keiLabel}と判断した`;
    }
  }
  if (seiLabel) return `樹勢は${seiLabel}と判断した`;
  if (keiLabel) return `樹形は${keiLabel}と判断した`;
  return '';
}

/**
 * 活力判定理由（文章版）を生成
 */
export function generateVitalityReason(tree) {
  const sei = tree.vitalitySei;
  const kei = tree.vitalityKei;

  const sentences = [];

  // 1. 数値部分
  const numParts = [];
  if (sei != null && sei !== '') numParts.push(`樹勢${sei}`);
  if (kei != null && kei !== '') numParts.push(`樹形${kei}`);
  if (numParts.length > 0) {
    sentences.push(`${numParts.join('、')}。`);
  }

  // 2. 観察事実
  const phrases = extractVitalityPhrases(tree.memo || '');
  if (phrases.length > 0) {
    sentences.push(`${joinPhrases(phrases)}が認められる。`);
  }

  // 3. 総合評価
  const verdict = buildVigorVerdict(sei, kei);
  if (verdict) {
    if (phrases.length > 0) {
      sentences.push(`これらの所見から、${verdict}。`);
    } else {
      sentences.push(`${verdict}。`);
    }
  }

  return sentences.join('');
}


// ==================== 外観診断 ====================

/**
 * キノコ類の名称リスト
 */
const FUNGUS_NAMES = [
  'ベッコウタケ',
  'コフキタケ',
  'カワラタケ',
  'サルノコシカケ',
  'ヒラタケ',
  'マツオウジ',
  'ナラタケ',
  'カイガラタケ',
  'ヒトクチタケ',
  'マンネンタケ',
  'チャアナタケモドキ',
  'コフキサルノコシカケ',
];

const FUNGUS_GENERIC = ['キノコ（子実体）', 'キノコ', '子実体'];

/**
 * 単一の項目テキストをカルテ調に変換
 */
function transformItem(item) {
  const trimmed = item.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('子実体')) return trimmed;

  for (const name of FUNGUS_NAMES) {
    if (trimmed === name || trimmed.includes(name)) {
      return `子実体（${name}）`;
    }
  }

  for (const g of FUNGUS_GENERIC) {
    if (trimmed === g) return '子実体';
  }

  return trimmed;
}

/**
 * 部位別の項目配列から1文を生成
 */
function buildPartSentence(partKey, items) {
  if (items.length === 0) return '';
  const partLabel = partKey === '大枝' ? '大枝' : `${partKey}部`;
  const joined = joinPhrases(items);

  const hasFungus = items.some(it => it.startsWith('子実体'));
  const tail = hasFungus ? 'の発生を認める' : 'が認められる';

  return `${partLabel}に${joined}${tail}。`;
}

/**
 * 外観診断判定（A/B1/B2/C）の評価語
 */
const APPEARANCE_LABEL = {
  A: '良好',
  B1: '軽度の損傷',
  B2: '中程度の損傷',
  C: '重度の損傷（要処置）',
};

/**
 * 外観診断判定理由（文章版）を生成
 */
export function generateAppearanceReason(tree) {
  const memo = tree.memo || '';
  const PART_LABELS = ['根元', '幹', '大枝'];
  const partItems = { 根元: [], 幹: [], 大枝: [] };

  const lines = memo.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(根元|幹|大枝)[:：](.+)$/);
    if (!m) continue;
    const part = m[1];
    const rawItems = m[2].split(/[、,]/).map(s => s.trim()).filter(Boolean);
    const transformed = rawItems.map(transformItem).filter(Boolean);
    partItems[part].push(...transformed);
  }

  const sentences = [];
  for (const part of PART_LABELS) {
    const uniqueItems = [...new Set(partItems[part])];
    const sentence = buildPartSentence(part, uniqueItems);
    if (sentence) sentences.push(sentence);
  }

  const judgment = tree.appearanceJudgment;
  if (judgment && judgment in APPEARANCE_LABEL) {
    const label = APPEARANCE_LABEL[judgment];
    if (sentences.length > 0) {
      sentences.push(`以上のことから、外観診断判定は${judgment}（${label}）と判断した。`);
    } else {
      sentences.push(`外観診断判定は${judgment}（${label}）と判断した。`);
    }
  }

  return sentences.join('');
}

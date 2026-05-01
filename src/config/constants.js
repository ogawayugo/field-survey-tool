export const STORAGE = {
  index: 'survey_tree_index',
  meta: 'survey_meta',
  treeData: (id) => `tree:${id}:data`,
  treePhoto: (id, pid) => `tree:${id}:photo:${pid}`,
  treeOld: (id) => `tree:${id}`,
};

export const WINDOW_SIZE = 1;
export const SAVE_DEBOUNCE_MS = 800;
export const PHOTO_MAX_DIM = 960;
export const PHOTO_QUALITY = 0.6;
export const PHOTO_MAX_PER_TREE = 4;

export const PLANTING_FORMS = ['単独桝', '植栽帯', '緑地内', 'その他'];
export const STAKE_STATES = ['良好', 'なし', '破損'];
export const PHOTO_LABELS = ['樹木全体', 'クローズアップ1', 'クローズアップ2', 'クローズアップ3'];

// 判定値
export const JUDGMENT_LEVELS = ['A', 'B1', 'B2', 'C'];

// 判定値の説明（UI表示用）
export const JUDGMENT_LABELS = {
  A: '健全か健全に近い',
  B1: '注意すべき被害',
  B2: '著しい被害',
  C: '不健全',
};

// 判定値の色（バッジ表示用）
export const JUDGMENT_COLORS = {
  A: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-700' },
  B1: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-700' },
  B2: { bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-700' },
  C: { bg: 'bg-red-50', text: 'text-red-900', border: 'border-red-700' },
};

// 部位
export const TREE_PARTS = ['根元', '幹', '大枝'];

// 部位ごとの診断項目（メモ挿入チップ用）
export const DIAGNOSIS_ITEMS = {
  根元: [
    '樹皮枯死・欠損・腐朽',
    '開口空洞（芯に達しない）',
    '開口空洞（芯に達する）',
    'キノコ（子実体）',
    '木槌打診異常',
    '分岐部・付根の異常',
    '胴枯れなどの病害',
    '虫穴・虫フン・ヤニ',
    '根元の揺らぎ',
    '鋼棒貫入異常',
    '巻き根',
    'ルートカラー見えない',
    '露出根被害',
    '不自然な傾斜',
  ],
  幹: [
    '樹皮枯死・欠損・腐朽',
    '開口空洞（芯に達しない）',
    '開口空洞（芯に達する）',
    'キノコ（子実体）',
    '木槌打診異常',
    '分岐部・付根の異常',
    '胴枯れなどの病害',
    '虫穴・虫フン・ヤニ',
  ],
  大枝: [
    '樹皮枯死・欠損・腐朽',
    '開口空洞（芯に達しない）',
    '開口空洞（芯に達する）',
    '枯枝',
    'スタブカット',
    'キノコ（子実体）',
    '木槌打診異常',
    '分岐部・付根の異常',
    '胴枯れなどの病害',
    '虫穴・虫フン・ヤニ',
  ],
};

// 部位の表示順（チップグループの並び順）
export const DIAGNOSIS_PARTS_ORDER = ['根元', '幹', '大枝'];

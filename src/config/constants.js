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

// 診断項目（メモ挿入チップ用）- 共通と部位専用に分離
export const DIAGNOSIS_COMMON_ITEMS = [
  '樹皮枯死・欠損・腐朽',
  '開口空洞',
  '開口空洞（芯達）',
  'キノコ（子実体）',
  '木槌打診異常',
  '分岐部・付根の異常',
  '胴枯れなどの病害',
  '虫穴・虫フン・ヤニ',
];

export const DIAGNOSIS_PART_ITEMS = {
  根元: [
    '根元の揺らぎ',
    '鋼棒貫入異常',
    '巻き根',
    'ルートカラー見えない',
    '露出根被害',
    '不自然な傾斜',
  ],
  大枝: [
    '枯枝',
    'スタブカット',
  ],
};

// 後方互換: 既存コードが DIAGNOSIS_ITEMS を参照している場合のため
export const DIAGNOSIS_ITEMS = {
  根元: [...DIAGNOSIS_COMMON_ITEMS, ...DIAGNOSIS_PART_ITEMS['根元']],
  幹: [...DIAGNOSIS_COMMON_ITEMS],
  大枝: [...DIAGNOSIS_COMMON_ITEMS, ...DIAGNOSIS_PART_ITEMS['大枝']],
};

// 部位の表示順
export const DIAGNOSIS_PARTS_ORDER = ['根元', '幹', '大枝'];

// 3択項目（なし / 1/3未満 / 1/3以上）
export const THREE_CHOICE_ITEMS = [
  { key: 'barkDeath', label: '樹皮枯死・欠損・腐朽' },
  { key: 'cavityShallow', label: '開口空洞' },
  { key: 'cavityDeep', label: '開口空洞（芯達）' },
];

// 3択の選択肢
export const THREE_CHOICE_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: 'less_third', label: '1/3未満' },
  { value: 'more_third', label: '1/3以上' },
];

// 部位キー（既存と整合させる）
export const THREE_CHOICE_PARTS = [
  { key: 'root', label: '根元' },
  { key: 'trunk', label: '幹' },
  { key: 'branch', label: '大枝' },
];

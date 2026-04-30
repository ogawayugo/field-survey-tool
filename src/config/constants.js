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

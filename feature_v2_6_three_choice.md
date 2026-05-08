# 機能追加 v2.6：3択項目の選択UI

## 背景

PWA「街路樹現場調査」とPC側のカルテ生成スクリプトを連携した運用で、街路樹診断カルテのうち**3択項目（なし/1/3未満/1/3以上）**は、メモから自動判定できないため未対応のままでした。

このv2.6では、PWA側に専用の選択UIを追加し、PC側の generate.py がそれを処理してカルテに反映させます。

対象の3択項目：
1. **樹皮枯死・欠損・腐朽**（根元・幹・大枝の3部位それぞれ）
2. **開口空洞（芯に達しない）**（同上）
3. **開口空洞（芯に達する）**（同上）

合計 **3項目 × 3部位 = 9個** の3択セレクター。

---

# 第1部：PWA側の修正

## 前提

- v2 / v2.5 / v3 が実装済みのプロジェクト
- 部位ごとの診断チップ（根元・幹・大枝）が既存

## ステップ1：定数の追加

`src/config/constants.js` に以下を追加：

```js
// 3択項目（なし / 1/3未満 / 1/3以上）
export const THREE_CHOICE_ITEMS = [
  { key: 'barkDeath', label: '樹皮枯死・欠損・腐朽' },
  { key: 'cavityShallow', label: '開口空洞（芯に達しない）' },
  { key: 'cavityDeep', label: '開口空洞（芯に達する）' },
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
```

## ステップ2：データモデルの拡張

`emptyMeta` 関数（`src/config/constants.js` 内）に新フィールドを追加：

```js
export const emptyMeta = (id) => ({
  // ... 既存フィールド ...
  threeChoiceJudgments: {
    root:   { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    trunk:  { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    branch: { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
  },
  // ... 既存フィールド続き ...
});
```

`loadOrMigrateMeta` 関数で旧データ補完：

```js
// 3択項目のデフォルト補完
if (!meta.threeChoiceJudgments) {
  meta.threeChoiceJudgments = {
    root:   { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    trunk:  { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    branch: { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
  };
} else {
  // 部分的に欠けているケースも補完
  for (const partKey of ['root', 'trunk', 'branch']) {
    if (!meta.threeChoiceJudgments[partKey]) {
      meta.threeChoiceJudgments[partKey] = { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' };
    } else {
      for (const itemKey of ['barkDeath', 'cavityShallow', 'cavityDeep']) {
        if (!meta.threeChoiceJudgments[partKey][itemKey]) {
          meta.threeChoiceJudgments[partKey][itemKey] = 'none';
        }
      }
    }
  }
}
```

## ステップ3：ThreeChoicePanel コンポーネントの新規作成

`src/components/ThreeChoicePanel.jsx` を新規作成：

```jsx
import React, { memo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { THREE_CHOICE_ITEMS, THREE_CHOICE_OPTIONS, THREE_CHOICE_PARTS } from '../config/constants.js';

const ChoiceButton = memo(function ChoiceButton({ value, current, onChange }) {
  const isActive = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`px-2 py-1 text-[11px] border transition-colors ${
        isActive
          ? 'bg-emerald-50 text-emerald-900 border-emerald-700 border-2 font-medium'
          : 'bg-white text-stone-700 border-stone-300 hover:border-emerald-700'
      }`}
    >
      {THREE_CHOICE_OPTIONS.find(o => o.value === value)?.label || value}
    </button>
  );
});

const PartSection = memo(function PartSection({ partKey, partLabel, judgments, onChange }) {
  return (
    <div className="space-y-2 py-2 border-t border-stone-200">
      <p className="text-[11px] text-stone-600">{partLabel}</p>
      <div className="space-y-1.5">
        {THREE_CHOICE_ITEMS.map(item => (
          <div key={item.key} className="flex items-center gap-2">
            <span className="text-[11px] text-stone-700 flex-1 min-w-0 truncate">{item.label}</span>
            <div className="flex gap-1 flex-shrink-0">
              {THREE_CHOICE_OPTIONS.map(opt => (
                <ChoiceButton
                  key={opt.value}
                  value={opt.value}
                  current={judgments[item.key] || 'none'}
                  onChange={v => onChange(item.key, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

const ThreeChoicePanel = memo(function ThreeChoicePanel({ meta, onChange }) {
  const [open, setOpen] = useState(false);

  const judgments = meta.threeChoiceJudgments || {
    root:   { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    trunk:  { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    branch: { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
  };

  const updateJudgment = (partKey, itemKey, value) => {
    const updated = {
      ...judgments,
      [partKey]: {
        ...judgments[partKey],
        [itemKey]: value,
      },
    };
    onChange({ threeChoiceJudgments: updated });
  };

  // 「なし」以外がいくつあるかを表示（バッジ用）
  let nonNoneCount = 0;
  for (const partKey of ['root', 'trunk', 'branch']) {
    for (const itemKey of ['barkDeath', 'cavityShallow', 'cavityDeep']) {
      if (judgments[partKey]?.[itemKey] && judgments[partKey][itemKey] !== 'none') {
        nonNoneCount++;
      }
    }
  }

  return (
    <div className="border border-stone-300 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-stone-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-stone-600 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-stone-600 flex-shrink-0" />
        )}
        <span className="text-xs text-stone-700 flex-1">
          3択項目（樹皮枯死・開口空洞）
        </span>
        {nonNoneCount > 0 && (
          <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
            被害{nonNoneCount}件
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3">
          {THREE_CHOICE_PARTS.map(part => (
            <PartSection
              key={part.key}
              partKey={part.key}
              partLabel={part.label}
              judgments={judgments[part.key] || {}}
              onChange={(itemKey, value) => updateJudgment(part.key, itemKey, value)}
            />
          ))}
          <p className="text-[10px] text-stone-500 mt-2">
            ※ 初期状態は「なし」。被害がある場合だけ変更してください。
          </p>
        </div>
      )}
    </div>
  );
});

export default ThreeChoicePanel;
```

## ステップ4：App.jsx に組み込み

「現場メモ」セクションの上、診断チップ（DiagnosisChips）の下に配置：

```jsx
import ThreeChoicePanel from './components/ThreeChoicePanel.jsx';

// ...

<Section title="現場メモ">
  <DiagnosisChips onInsert={handleInsertDiagnosis} />
  
  {/* ▼ 新規追加 */}
  <div className="mt-2 mb-3">
    <ThreeChoicePanel meta={currentMeta} onChange={updateCurrent} />
  </div>
  {/* ▲ */}

  <textarea
    value={currentMeta.memo}
    ...
  />
</Section>
```

## ステップ5：JSONエクスポートの確認

既存のJSONエクスポートで、`meta.threeChoiceJudgments` が自動的に出力されるはず。
特別な対応は不要だが、念のためエクスポートされたJSONの中身に `threeChoiceJudgments` フィールドが含まれているか確認すること。

## ステップ6：動作確認

```bash
npm run dev
```

確認ポイント：

- [ ] 「現場メモ」の上、診断チップの下に「3択項目（樹皮枯死・開口空洞）」のセクションが現れる
- [ ] タップすると展開する（▼ ↔ ▶）
- [ ] 展開すると、根元・幹・大枝の3部位ごとに3項目×3択ボタンが現れる
- [ ] 初期状態は全部「なし」が選択済み（緑のボーダー）
- [ ] 「1/3未満」「1/3以上」を選ぶと該当ボタンが緑のボーダーに変わる
- [ ] 「なし」以外を選んでいる項目があると、見出しに「被害X件」のバッジが出る
- [ ] 折りたたんでもデータは保持される
- [ ] リロードしても状態が維持される
- [ ] JSONエクスポートで `threeChoiceJudgments` フィールドが含まれている
- [ ] 旧データを開いた時、`threeChoiceJudgments` がない場合は全部「なし」として読み込まれる

## ステップ7：GitHubへpush

```bash
git add .
git commit -m "Add 3-choice judgment selector for bark death and cavity items"
git push
```

Vercel が自動デプロイ。

---

# 第2部：PC側スクリプトの修正

## 前提

- `karte-generator/` フォルダに `generate.py`、`templates/shibuya.json`、`templates/shibuya.xlsx` が配置済み

## ステップ1：templates/shibuya.json の更新

`templates/shibuya.json` に以下のセクションを追加（末尾の `}` の前に挿入）：

```json
"three_choice_cells": {
  "barkDeath": {
    "row": 13,
    "_comment": "樹皮枯死・欠損・腐朽"
  },
  "cavityShallow": {
    "row": 14,
    "_comment": "開口空洞（芯に達しない）"
  },
  "cavityDeep": {
    "row": 15,
    "_comment": "開口空洞（芯に達する）"
  }
},
"three_choice_columns": {
  "root": "M",
  "trunk": "X",
  "branch": "AI"
},
"three_choice_options": {
  "none": "なし",
  "less_third": "1/3未満",
  "more_third": "1/3以上"
}
```

注意：JSON形式なので、最後のセクション末尾のカンマ忘れに注意。

## ステップ2：generate.py の修正

`generate.py` に新しい関数を追加：

```python
def write_three_choice_judgments(sheet: Worksheet, tree: dict, config: dict):
    """3択項目（なし/1/3未満/1/3以上）の書き込み"""
    judgments = tree.get('threeChoiceJudgments', {})
    if not judgments:
        return
    
    cells_config = config.get('three_choice_cells', {})
    columns = config.get('three_choice_columns', {})
    options = config.get('three_choice_options', {})
    
    if not cells_config or not columns or not options:
        return
    
    # 各部位×各項目について処理
    for part_key, items in judgments.items():
        col = columns.get(part_key)
        if not col or not items:
            continue
        
        for item_key, value in items.items():
            if not value:
                continue
            
            cell_def = cells_config.get(item_key)
            if not cell_def:
                continue
            
            row = cell_def.get('row')
            if not row:
                continue
            
            # 選択肢のラベル（「なし」「1/3未満」「1/3以上」）を取得
            selected_label = options.get(value)
            if not selected_label:
                continue
            
            cell_addr = f"{col}{row}"
            original = sheet[cell_addr].value
            if original is None:
                continue
            
            # 該当する選択肢の □ を ■ に置換
            text = str(original)
            new_text = update_cell_checkbox(text, list(options.values()), selected_label)
            
            if new_text != text:
                sheet[cell_addr] = new_text
```

そして `generate_karte` 関数内の樹データ処理部分で、この関数を呼び出す：

```python
# データ書き込み
try:
    write_basic_info(new_sheet, tree, survey_meta, config)
    write_cell_checkboxes(new_sheet, tree, config)
    write_part_judgments(new_sheet, tree, config)
    write_diagnosis_checkboxes(new_sheet, tree, config)
    write_three_choice_judgments(new_sheet, tree, config)  # ← 追加
    write_shoken(new_sheet, tree, config)
    
    # 写真埋め込み
    photos = tree.get('photos', [])
    if photos:
        embed_photos(new_sheet, photos, config)
except Exception as e:
    err(f"樹木 #{tree_no} の処理中にエラー: {e}")
    import traceback
    traceback.print_exc()
```

## ステップ3：動作確認

PWAで簡単なテストデータを作成し、JSONエクスポート → 生成スクリプト実行：

```powershell
cd "C:\Users\81804\OneDrive\デスクトップ\field-survey-tool\karte-generator"
python generate.py "C:\Users\81804\Downloads\survey_2026-XX-XX.json"
```

生成されたカルテExcelで以下を確認：

- [ ] M13（根元×樹皮枯死）が「■なし」になっている（デフォルト「なし」の場合）
- [ ] PWAで「1/3未満」を選んだセルは「□なし■1/3未満□1/3以上」になっている
- [ ] PWAで「1/3以上」を選んだセルは「□なし□1/3未満■1/3以上」になっている
- [ ] 全9セル（M13/X13/AI13、M14/X14/AI14、M15/X15/AI15）が反映されている

---

# 完了確認

- [ ] PWA側：3択UIが現れ、入力でき、保存される、JSONに出力される
- [ ] PC側：generate.py が3択項目を処理し、カルテに反映される
- [ ] 旧データを使っても問題なく動く（全部「なし」として処理される）
- [ ] PWAをVercelに push 済み

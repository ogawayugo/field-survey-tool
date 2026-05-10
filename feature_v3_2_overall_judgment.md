# v3.2：総合判定の追加（PWA + PC）

## 概要

既存の「活力判定」「部位判定」「外観診断判定」に加えて、**総合判定**を新設する。
カルテExcelの「総合判定」セクション（A/B1/B2/C ＋ 判定理由欄）に対応する。

仕様：
- A/B1/B2/C は**完全手動選択**（推奨ロジックなし）
- 判定理由は **「✨ 診断文生成」ボタン押下で自動生成**
- 文体は **パターンB（根拠込み詳細型）**：樹勢樹形 + 活力判定 + 外観所見 + 外観判定を統合
- 手動編集可

修正対象は **PWA側 + PC側の両方**。

---

## 生成イメージ

入力例：
- 樹勢2、樹形2
- 活力判定：B1
- メモ：「葉量少、枯れ枝多、根元：不自然な傾斜、ベッコウタケ、幹：開口空洞」
- 外観診断判定：B2

期待される出力：

> 樹勢2、樹形2と活力低下が見られ、活力判定はB1（注意すべき被害が見られる）。外観面では根元部に不自然な傾斜および子実体（ベッコウタケ）、幹部に開口空洞を認め、外観診断判定はB2（中程度の損傷）。これらを踏まえ、総合判定はB2（著しい被害が見られる）と判断した。

---

## ステップ1：PWA側 データ構造拡張

### 1-1. 樹データに2フィールド追加

各樹のデータ構造に以下を追加：

```javascript
{
  // ... 既存フィールド ...
  
  // ▼ v3.2 新規追加 ▼
  overallJudgment: '',   // 'A' | 'B1' | 'B2' | 'C' | ''
  overallReason: '',     // 判定理由テキスト
}
```

### 1-2. マイグレーション

`migrateTree` 関数（または既存の同等処理）に以下を追加：

```javascript
function migrateTree(tree) {
  return {
    ...tree,
    overallJudgment: tree.overallJudgment ?? '',
    overallReason: tree.overallReason ?? '',
  };
}
```

---

## ステップ2：PWA側 生成ロジック

`src/lib/generateJudgmentReason.js` に新しい関数を追加。既存の `generateVitalityReason`、`generateAppearanceReason` の隣に。

```javascript
import { 
  VITALITY_KEYWORDS, FUNGUS_NAMES, APPEARANCE_LABEL, VIGOR_LABEL,
  // ↑ refactor v3.0.1 後の状態を想定。まだ未実施なら従来通りインポート無しで関数内に持たせる
} from '../data/dictionaries';

// 既存の generateVitalityReason / generateAppearanceReason ...

// ============================================================
// 総合判定理由（v3.2）
// ============================================================

/**
 * 活力判定（A/B1/B2/C）の長文ラベル
 * VITALITY_LABEL = 健全か健全に近い / 注意すべき被害が見られる / 著しい被害が見られる / 不健全
 */
const VITALITY_LABEL_LOCAL = {
  A: '健全か健全に近い',
  B1: '注意すべき被害が見られる',
  B2: '著しい被害が見られる',
  C: '不健全',
};
// ※ refactor v3.0.1 が完了していれば、これは dictionaries.js の VITALITY_LABEL を使うこと。
// 暫定的に重複定義しておく（リファクタリング時に統合）。

/**
 * 樹勢・樹形の数値（1-5）から活力概況のテキストを作る
 *  例：樹勢2、樹形2 → "樹勢2、樹形2と活力低下が見られ"
 *  例：樹勢1、樹形1 → "樹勢1、樹形1と活力は良好で"
 */
function buildVigorContext(sei, kei) {
  const parts = [];
  if (sei != null) parts.push(`樹勢${sei}`);
  if (kei != null) parts.push(`樹形${kei}`);
  if (parts.length === 0) return '';
  
  const numText = parts.join('、');
  
  // 平均が高い（3以上）かどうかで活力低下/良好を判断
  const values = [sei, kei].filter(v => v != null);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  
  if (avg >= 3) {
    return `${numText}と活力低下が見られ`;
  } else if (avg >= 2) {
    return `${numText}とやや活力の低下が見られ`;
  } else {
    return `${numText}と活力は良好で`;
  }
}

/**
 * 外観の所見部分（generateAppearanceReason の所見部分のみ抽出）
 * メモから根元・幹・大枝の項目をグルーピングして、所見の自然な文を返す
 *  例："根元部に不自然な傾斜および子実体（ベッコウタケ）、幹部に開口空洞を認め"
 */
function buildAppearanceObservations(memo) {
  if (!memo) return '';
  
  const PART_LABELS = ['根元', '幹', '大枝'];
  const partItems = { 根元: [], 幹: [], 大枝: [] };
  
  const lines = memo.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(根元|幹|大枝)[:：](.+)$/);
    if (!m) continue;
    const part = m[1];
    const rawItems = m[2].split(/[、,]/).map(s => s.trim()).filter(Boolean);
    // キノコ表記変換
    const transformed = rawItems.map(item => {
      for (const name of FUNGUS_NAMES) {
        if (item.includes(name)) return `子実体(${name})`;
      }
      return item;
    });
    partItems[part].push(...transformed);
  }
  
  const fragments = [];
  for (const part of PART_LABELS) {
    const items = [...new Set(partItems[part])];
    if (items.length === 0) continue;
    
    // 「A、BおよびC」形式
    let joined;
    if (items.length === 1) joined = items[0];
    else if (items.length === 2) joined = `${items[0]}および${items[1]}`;
    else joined = `${items.slice(0, -1).join('、')}および${items[items.length - 1]}`;
    
    const partLabel = part === '大枝' ? '大枝' : `${part}部`;
    fragments.push(`${partLabel}に${joined}`);
  }
  
  if (fragments.length === 0) return '';
  return fragments.join('、') + 'を認め';
}

/**
 * 総合判定理由を生成（パターンB：根拠込み詳細型）
 * 
 * 構成：
 *   1. 活力面の根拠：「樹勢X、樹形Yと活力低下が見られ、活力判定はB1（〜）」
 *   2. 外観面の根拠：「外観面では〜を認め、外観診断判定はB2（〜）」
 *   3. 総合判定：「これらを踏まえ、総合判定はB2（〜）と判断した」
 *
 * @param {object} tree
 * @returns {string}
 */
export function generateOverallReason(tree) {
  const sentences = [];
  
  // ---- 活力面 ----
  const sei = tree.vitalitySei ?? tree.jusei;
  const kei = tree.vitalityKei ?? tree.jukei;
  const vitalityContext = buildVigorContext(sei, kei);
  
  const vitalityJudgment = tree.vitalityJudgment;
  if (vitalityContext && vitalityJudgment && VITALITY_LABEL_LOCAL[vitalityJudgment]) {
    sentences.push(
      `${vitalityContext}、活力判定は${vitalityJudgment}(${VITALITY_LABEL_LOCAL[vitalityJudgment]})。`
    );
  } else if (vitalityJudgment && VITALITY_LABEL_LOCAL[vitalityJudgment]) {
    sentences.push(
      `活力判定は${vitalityJudgment}(${VITALITY_LABEL_LOCAL[vitalityJudgment]})。`
    );
  }
  
  // ---- 外観面 ----
  const appearanceObs = buildAppearanceObservations(tree.memo || '');
  const appearanceJudgment = tree.appearanceJudgment ?? tree.gaikanJudgment;
  
  if (appearanceObs && appearanceJudgment && APPEARANCE_LABEL[appearanceJudgment]) {
    sentences.push(
      `外観面では${appearanceObs}、外観診断判定は${appearanceJudgment}(${APPEARANCE_LABEL[appearanceJudgment]})。`
    );
  } else if (appearanceJudgment && APPEARANCE_LABEL[appearanceJudgment]) {
    sentences.push(
      `外観診断判定は${appearanceJudgment}(${APPEARANCE_LABEL[appearanceJudgment]})。`
    );
  }
  
  // ---- 総合判定 ----
  const overall = tree.overallJudgment;
  if (overall && VITALITY_LABEL_LOCAL[overall]) {
    if (sentences.length > 0) {
      sentences.push(
        `これらを踏まえ、総合判定は${overall}(${VITALITY_LABEL_LOCAL[overall]})と判断した。`
      );
    } else {
      sentences.push(
        `総合判定は${overall}(${VITALITY_LABEL_LOCAL[overall]})と判断した。`
      );
    }
  }
  
  return sentences.join('');
}
```

### 注意点

- `vitalityJudgment` `appearanceJudgment` のキー名は実プロジェクトに合わせて調整
- `VITALITY_LABEL_LOCAL` は本来 dictionaries.js から import すべき（refactor v3.0.1 後に統合）
- 文末の括弧は半角 `(...)` に統一（カルテ慣例に合わせ、必要なら全角に変更）

---

## ステップ3：PWA側 UI追加

### 3-1. JudgmentPanel.jsx に総合判定セクション追加

外観診断判定セクションの**直下**に、新しく総合判定セクションを追加。
**特記事項メモの上**に置く。

```jsx
import { generateOverallReason } from '../lib/generateJudgmentReason';

{/* 既存の活力判定 / 部位判定 / 外観診断判定 ... */}

{/* ▼ v3.2 新規追加：総合判定 ▼ */}
<div className="judgment-panel overall mt-4 pt-4 border-t">
  <h3 className="font-semibold text-base mb-2">総合判定</h3>
  
  {/* A/B1/B2/C ボタン */}
  <div className="grid grid-cols-4 gap-2 mb-3">
    {['A', 'B1', 'B2', 'C'].map((rank) => (
      <button
        key={rank}
        type="button"
        onClick={() => updateTree(tree.id, { overallJudgment: rank })}
        className={`py-2 rounded border ${
          tree.overallJudgment === rank
            ? 'bg-yellow-100 border-yellow-500 font-bold'
            : 'bg-white hover:bg-gray-50'
        }`}
      >
        {rank}
      </button>
    ))}
  </div>
  
  {/* 判定理由欄 */}
  <div className="reason-field">
    <div className="flex items-center justify-between mb-1">
      <label className="text-sm font-medium text-gray-700">
        判定理由
      </label>
      <button
        type="button"
        onClick={() => {
          updateTree(tree.id, {
            overallReason: generateOverallReason(tree),
          });
        }}
        className="text-xs px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
      >
        ✨ 診断文生成
      </button>
    </div>
    <textarea
      value={tree.overallReason}
      onChange={(e) => updateTree(tree.id, { overallReason: e.target.value })}
      placeholder="「✨ 診断文生成」ボタンで自動入力、または直接記述"
      rows={4}
      className="w-full p-2 border rounded text-sm"
    />
  </div>
</div>

{/* 既存の特記事項セクション ... */}
```

**色分け**：活力 = green系 / 部位 = orange系 / 外観 = beige系 / **総合 = yellow系** にすると見分けやすい（既存の色使いに合わせて適宜調整）。

---

## ステップ4：PWA側 JSONエクスポート確認

`src/lib/exportHelpers.js` を確認し、樹データに `overallJudgment` `overallReason` が含まれているか確認。
ホワイトリスト指定があれば追加：

```javascript
{
  // ... 既存フィールド ...
  overallJudgment: tree.overallJudgment,
  overallReason: tree.overallReason,
}
```

---

## ステップ5：PC側 テンプレート分析

### 5-1. テンプレートExcelで該当セルを特定

`karte-generator/templates/shibuya.xlsx` を openpyxl で開いて、「総合判定」「判定理由」のセル位置を特定する一時スクリプト：

```python
# karte-generator/find_overall_cells.py（一時スクリプト、後で削除可）
from openpyxl import load_workbook

wb = load_workbook("templates/shibuya.xlsx")
ws = wb.active

targets = ["総合判定", "判定理由"]

for row in ws.iter_rows():
    for cell in row:
        if cell.value:
            for t in targets:
                if t in str(cell.value):
                    print(f"'{t}' found at {cell.coordinate}: {repr(cell.value)}")
                    # 周囲のセルも調査
                    print(f"  Right neighbor: {ws.cell(row=cell.row, column=cell.column+1).coordinate}")
                    print(f"  Below: {ws.cell(row=cell.row+1, column=cell.column).coordinate}")
                    # 結合範囲チェック
                    for merged in ws.merged_cells.ranges:
                        rh = ws.cell(row=cell.row, column=cell.column+1)
                        if rh.coordinate in merged:
                            print(f"  Right is part of merged: {merged}")
                        below = ws.cell(row=cell.row+1, column=cell.column)
                        if below.coordinate in merged:
                            print(f"  Below is part of merged: {merged}")
```

実行して、以下を特定：
- 「総合判定」のラベルセル → 値（A/B1/B2/C のチェックが入る）はどこか？
- 「判定理由」のラベルセル → 値（テキスト）が入るセルはどこか？

### 5-2. 総合判定の表現方法を確認

スクショ3枚目を見ると、「総合判定」は4つのチェックボックス：
```
□A:健全か健全に近い  □B1:注意すべき被害が見られる  □B2:著しい被害が見られる  □C:不健全
```

**ユーザー確認事項**：これは別々のセルにそれぞれ「□」と「■」が入る形式か、1つのセルにまとめてテキストで「■A □B1 □B2 □C」と入る形式か、テンプレートの実装次第。
v2.6 三択UIと同じパターンで、既存の generate.py で「■/□」を切り替える既存ロジックがあるはず。それを流用する。

---

## ステップ6：PC側 shibuya.json 更新

ステップ5で特定したセル位置を `templates/shibuya.json` に追加：

```json
{
  "meta": {
    "route_name": "...",
    "arborist_name": "...",
    "survey_date": "..."
  },
  
  "overall": {
    "judgment_a": "...",
    "judgment_b1": "...",
    "judgment_b2": "...",
    "judgment_c": "...",
    "reason": "..."
  },
  
  "tree_number": "...",
  ...
}
```

`reason` は1セル、`judgment_a/b1/b2/c` はそれぞれ ■/□ を入れるセル。

**もし既存の活力判定や外観診断判定のマッピング構造に倣った形になっているなら、それと同じパターンで書く**こと。

---

## ステップ7：PC側 generate.py 反映

既存の活力判定・外観診断判定の処理に並べて、総合判定の処理を追加：

```python
# generate.py 内、樹ごとのカルテ生成処理

# 既存の活力判定処理 ...
# 既存の外観診断判定処理 ...

# ▼ v3.2 新規追加：総合判定 ▼
overall_config = template_config.get("overall", {})

# 判定（A/B1/B2/C）
overall_judgment = tree.get("overallJudgment", "")
if overall_judgment:
    for rank in ["A", "B1", "B2", "C"]:
        cell_key = f"judgment_{rank.lower()}"
        if cell_key in overall_config:
            ws[overall_config[cell_key]] = "■" if rank == overall_judgment else "□"
else:
    # 未選択時は全部 □
    for rank in ["A", "B1", "B2", "C"]:
        cell_key = f"judgment_{rank.lower()}"
        if cell_key in overall_config:
            ws[overall_config[cell_key]] = "□"

# 判定理由
if "reason" in overall_config:
    ws[overall_config["reason"]] = tree.get("overallReason", "")
```

**重要**：既存の活力判定や外観診断判定で「■/□」をどう書き込んでいるかを確認し、**同じパターン**で実装すること。プロジェクト独自の定数や関数があれば再利用。

---

## ステップ8：動作確認チェックリスト

### PWA側

- [ ] 既存樹を開いてもエラーなし（マイグレーション動作OK）
- [ ] 外観診断判定の下に「総合判定」セクションが表示される
- [ ] A/B1/B2/Cボタンをタップで選択できる、選択状態が表示される
- [ ] 「✨ 診断文生成」ボタンで判定理由が自動生成される
- [ ] 判定理由を手動編集できる、もう一度ボタン押すと上書きされる
- [ ] 樹を切り替えても保持される
- [ ] アプリ再起動しても保持される
- [ ] JSONエクスポートに `overallJudgment` `overallReason` が含まれる

### PC側

- [ ] テンプレートのセル位置を正確に特定
- [ ] shibuya.json にマッピング追加
- [ ] PWAから出したJSON → カルテExcel生成 → 総合判定セルに■、判定理由セルにテキストが入る
- [ ] 未選択時は全部□
- [ ] 旧JSONでもエラーにならない

### 文章確認

実際のテストデータで以下のパターンを試して、出力が自然か確認：

- [ ] フル入力（樹勢樹形あり、活力判定あり、メモあり、外観判定あり、総合判定あり）
- [ ] 樹勢樹形のみ
- [ ] 活力判定のみ
- [ ] 総合判定のみ（他空）
- [ ] 全部空（→ 空文字が返る）

---

## トラブルシューティング想定

### Q1：「樹勢undefined、樹形undefined」が出る

→ `tree.vitalitySei` `tree.vitalityKei` のキー名が違う可能性。実プロジェクトに合わせて調整。

### Q2：活力判定が文章に入らない

→ `tree.vitalityJudgment` のキー名違い。JudgmentPanel.jsx の保存先キーを確認。

### Q3：外観の所見が部位別に出ない

→ メモのフォーマット `^(根元|幹|大枝)[:：]` にマッチしているか確認。半角・全角コロン両対応。

### Q4：「これらを踏まえ、」が冗長

→ `sentences.length > 0` の分岐ロジックを調整。1要素しかない場合は「これらを踏まえ」を省く等。

### Q5：PC側で総合判定セルの結合範囲がわからない

→ `find_overall_cells.py` で結合範囲を表示させる。結合範囲の左上セルにのみ書き込み可能。

### Q6：「総合判定」テンプレートのチェック表現が「■/□」じゃない

→ プロジェクト独自の表現（「☑/☐」「○/×」など）かもしれない。既存の活力判定処理を見て流用。

---

## 完了報告フォーマット

実装後、以下を報告：

1. PWA側動作確認チェックリスト結果
2. PC側でテンプレートのセル位置を特定した結果（出力をテキストで）
3. shibuya.json の overall セクション
4. 実際のカルテExcel生成スクショ（総合判定部分が見える形）
5. 生成された判定理由のサンプル文（2〜3パターン）
6. 想定外の挙動・実装で迷った箇所があれば

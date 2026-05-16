# Phase C: 部位診断ノート（括弧内）の自動抽出 + 編集UI 実装指示書

## 1. 概要

マーカーの textbox 内容から「東京都様式 表III-2・23」のルールに従って括弧内記述を自動生成し、所見欄でユーザーが編集できるようにする。

**Phase A/B は完了済み**：
- 抽出ルール JSON（`extraction_rules.json`）作成済み
- `generate.py` 側で `marker.summary` を読んで Excel カルテに書き込む処理は実装済み

**Phase C で実装するのは PWA 側のみ**：
- マーカーのデータ構造に `text` / `summary` / `summaryEdited` フィールドを追加
- 同じ抽出ロジックを JS で実装
- 所見欄に「textbox + 編集可能な括弧内表示」UI を追加
- JSON エクスポートに含める

---

## 2. ファイル変更一覧

### 新規作成
1. `public/extraction_rules.json` — ルール定義（添付の JSON ファイルをそのままコピー）
2. `src/lib/markerExtractor.js` — JS版の抽出エンジン

### 修正
3. `src/App.jsx` — マーカーのマイグレーション、初期化時にルール読み込み
4. `src/components/MarkerSheet.jsx` — マーカー作成時に text/summary を初期化
5. `src/components/MarkerOverlay.jsx` — textbox 編集時に summary を自動更新
6. `src/components/ShokenPanel.jsx`（または所見欄相当のコンポーネント） — 括弧内編集UIを追加
7. `src/lib/exportHelpers.js` — エクスポート時に新フィールドを含む

---

## 3. 新規ファイル：`public/extraction_rules.json`

別途お渡しした `extraction_rules.json` をそのまま `public/extraction_rules.json` として配置すること。

このファイルは `/extraction_rules.json` で fetch アクセスできる位置に置く（Vite の public フォルダ）。

---

## 4. 新規ファイル：`src/lib/markerExtractor.js`

**完全なコードをそのまま使用すること**（Python版 marker_extractor.py を JS に移植したもの）：

```javascript
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
  const pattern = new RegExp('^' + escaped + '[\\s\u3000、。：:]?');
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
```

### 単体テスト（手動でブラウザコンソールで確認推奨）

```javascript
import { loadExtractionRules, extractSummary, aggregateSummaries } from './lib/markerExtractor';

const rules = await loadExtractionRules();

console.log(extractSummary('大 GL1.5m〜2.5m 反響強い', '木槌打診異常', rules));
// → "大 GL1.5m〜2.5m"

console.log(extractSummary('子実体(ベッコウタケ)', 'キノコ（子実体）', rules));
// → "ベッコウタケ"

console.log(extractSummary('北へ大 倒れそう', '不自然な傾斜', rules));
// → "北へ大"

console.log(aggregateSummaries(['φ5cm L0.8m', 'φ3cm L0.5m', 'φ8cm L1m'], '枯枝', rules));
// → "φ5cm L0.8m ×3"

console.log(aggregateSummaries(['大 GL1.5m〜2m', '中 GL3m〜4m'], '木槌打診異常', rules));
// → "大 GL1.5m〜2m 他1箇所"
```

---

## 5. データ構造の変更

### マーカーの構造

```typescript
// 既存
type Marker = {
  id: string;
  type: 'point' | 'range';
  x: number;
  y: number;
  part: '根元' | '幹' | '大枝';
  item: string;
  collapsed?: boolean;
  // 範囲マーカー用
  rangeStart?: { x: number; y: number };
  rangeEnd?: { x: number; y: number };
};

// 追加するフィールド
type Marker = {
  // ... 既存
  text?: string;          // textbox 自由記述（マーカー作成時は item と同じ）
  summary?: string;       // 自動抽出 or 手動編集された括弧内表記
  summaryEdited?: boolean; // true なら手動編集済み（自動更新しない）
};
```

### マイグレーション処理

`App.jsx` のデータ読み込み（IndexedDB / インポートJSON）時：

```javascript
import { loadExtractionRules, extractSummary } from './lib/markerExtractor';

async function migrateMarker(marker, rules) {
  // text フィールド未定義なら item で初期化
  if (typeof marker.text !== 'string') {
    marker.text = marker.item || '';
  }
  // summary フィールド未定義なら抽出して初期化
  if (typeof marker.summary !== 'string') {
    marker.summary = extractSummary(marker.text, marker.item, rules, marker.part);
  }
  // summaryEdited 未定義なら false
  if (typeof marker.summaryEdited !== 'boolean') {
    marker.summaryEdited = false;
  }
  return marker;
}

// アプリ起動時 or データロード時
async function migrateAllTrees(trees) {
  const rules = await loadExtractionRules();
  return trees.map(tree => ({
    ...tree,
    markers: (tree.markers || []).map(m => migrateMarker(m, rules))
  }));
}
```

---

## 6. UI 仕様：所見欄での編集UI

### レイアウトイメージ

所見欄の各部位（根元/幹/大枝）の下にマーカーリスト。各マーカーは次のレイアウト：

```
┌─────────────────────────────────────────────────────┐
│ ▼ 幹                                                │
│   ┌──────────────────────────────┐ ┌──────────┐ ↻   │
│   │ 木槌打診異常 大 GL1.5m〜2.5m │ │ 大 GL1.5… │     │ ← マーカー1
│   │ 反響強く、深い損傷の可能性   │ └──────────┘     │
│   └──────────────────────────────┘                  │
│            ↑ textbox                ↑ summary      │
│                                     (編集可)       │
│                                                     │
│   ┌──────────────────────────────┐ ┌──────────┐ ↻   │
│   │ 木槌打診異常 中 GL3m〜4m     │ │ 中 GL3m… │     │ ← マーカー2
│   └──────────────────────────────┘ └──────────┘     │
└─────────────────────────────────────────────────────┘
```

### 各 UI 要素の挙動

1. **textbox（マーカー本体）**
   - 既存のまま自由記述（Batch1 で実装済み想定）
   - 内容変更時：`onChange` で `marker.text` を更新
   - **副作用**：`summaryEdited === false` のとき、`extractSummary()` を呼んで `summary` を自動更新

2. **summary 入力欄（括弧内）**
   - 短めの `<input type="text">`、placeholder は空欄
   - 表示幅：マーカー1行で見やすいサイズ（200px 程度）
   - 内容変更時：
     - `marker.summary` を更新
     - `marker.summaryEdited = true` にセット（これ以降は自動更新されない）

3. **↻（再抽出）ボタン**
   - `summary` の右側に小さく配置
   - クリックで：
     - `marker.summaryEdited = false`
     - `extractSummary()` で再抽出して `summary` 更新
   - 「自動抽出に戻す」のツールチップ
   - `summaryEdited === true` のときだけ active 表示推奨

4. **視覚的ヒント**
   - `summaryEdited === true` のとき、summary 入力欄を「手動編集中」とわかる色（例：薄い黄色背景）にすると親切

### React 実装ガイド

既存の所見欄コンポーネント（Batch1 で復活させた `ShokenPanel.jsx` 相当）にマーカー行ごとの UI を追加：

```jsx
import { extractSummary } from '../lib/markerExtractor';

function MarkerRow({ marker, rules, onChange }) {
  const handleTextChange = (e) => {
    const newText = e.target.value;
    const updates = { ...marker, text: newText };
    // 手動編集されてなければ summary も自動更新
    if (!marker.summaryEdited) {
      updates.summary = extractSummary(newText, marker.item, rules, marker.part);
    }
    onChange(updates);
  };

  const handleSummaryChange = (e) => {
    onChange({
      ...marker,
      summary: e.target.value,
      summaryEdited: true,
    });
  };

  const handleReset = () => {
    const auto = extractSummary(marker.text, marker.item, rules, marker.part);
    onChange({
      ...marker,
      summary: auto,
      summaryEdited: false,
    });
  };

  return (
    <div className="marker-row">
      <textarea
        value={marker.text || ''}
        onChange={handleTextChange}
        className="marker-textbox"
      />
      <div className="summary-wrap">
        <span>（</span>
        <input
          type="text"
          value={marker.summary || ''}
          onChange={handleSummaryChange}
          className={`marker-summary ${marker.summaryEdited ? 'edited' : ''}`}
        />
        <span>）</span>
        {marker.summaryEdited && (
          <button onClick={handleReset} title="自動抽出に戻す" className="reset-btn">
            ↻
          </button>
        )}
      </div>
    </div>
  );
}
```

CSS（参考）：

```css
.marker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.marker-textbox {
  flex: 1;
  min-height: 40px;
}
.summary-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
}
.marker-summary {
  width: 180px;
}
.marker-summary.edited {
  background-color: #fff9d6; /* 黄色っぽい背景で手動編集を視覚化 */
}
.reset-btn {
  font-size: 0.8em;
  padding: 2px 6px;
  cursor: pointer;
}
```

---

## 7. MarkerSheet.jsx の修正

マーカー作成時（チップから項目選択時）に `text` / `summary` / `summaryEdited` を初期化：

```javascript
function createNewMarker(part, item, x, y) {
  return {
    id: generateId(),
    type: 'point',
    x, y,
    part,
    item,
    text: item,              // textbox 初期値はチップ名
    summary: '',             // 初期は空欄（textbox編集時に自動抽出される）
    summaryEdited: false,
    collapsed: false,
  };
}
```

---

## 8. MarkerOverlay.jsx の修正

写真上のマーカー表示は既存のまま（`text` フィールドを使うように調整）：

- マーカーのテキストボックスに表示するのは `marker.text`
- ユーザーがマーカー本体のテキストを編集したら `marker.text` を更新
- **同時に所見欄のマーカー行と双方向ハイライト**（既存実装あり想定）

ここで重要な接続点：写真上のマーカー編集 → `marker.text` 更新 → 所見欄の対応マーカー行 → summary 自動更新（summaryEdited=false なら）

これは「すべてのマーカー更新が同じ store/state を通る」前提なら、所見欄側の MarkerRow に書いた自動更新ロジックが効くはず。

---

## 9. JSON エクスポート（exportHelpers.js）

マーカーの新フィールドが含まれるか確認：

```javascript
// markers をエクスポート対象に含める処理で、
// text/summary/summaryEdited も漏れなく含まれていることを確認
// （単純な spread コピーなら自動で含まれる）
```

`text`, `summary`, `summaryEdited` の3つが JSON 出力に含まれていることを実機で確認すること（テスト樹を1本作って Export → JSON を目視）。

---

## 10. テストチェックリスト

実装完了後、以下を実機で確認：

### A. 基本動作
- [ ] アプリ起動時にエラーなく `extraction_rules.json` が読み込まれる（DevTools の Network タブで200確認）
- [ ] 既存データを開いてマーカーが正常表示される（マイグレーション動作）
- [ ] マーカー作成時に textbox がチップ名で初期化される
- [ ] textbox を編集すると右の summary が自動更新される
- [ ] summary を直接編集すると、textbox 編集しても上書きされない
- [ ] ↻ ボタンで summary が再抽出される

### B. 抽出ルール動作確認
各項目で textbox に以下を入力 → summary が期待値になることを確認：

| 項目 | textbox入力 | 期待される summary |
|---|---|---|
| キノコ（子実体） | `子実体(ベッコウタケ)` | `ベッコウタケ` |
| 木槌打診異常 | `大 GL1.5m〜2.5m 反響強い` | `大 GL1.5m〜2.5m` |
| 鋼棒貫入異常 | `15cm 一部芯達` | `芯達` |
| ルートカラー見えない | `深植え5cm 盛土3cm` | `深植え5cm` |
| ルートカラー見えない | `盛土10cm 深植え5cm` | `盛土10cm` |
| 露出根被害 | `15cm×2cm 切断あり` | `15cm×2cm` |
| 不自然な傾斜 | `北へ大 倒れそう` | `北へ大` |
| 枯枝 | `φ5cm L0.8m 古い` | `φ5cm L0.8m` |
| 巻き根 | `切除可 注意点あり` | `切除可` |

### C. JSON エクスポート
- [ ] テスト樹を作って Export
- [ ] 出力 JSON にマーカーの `text` / `summary` / `summaryEdited` が含まれる
- [ ] そのJSONをPC版 `generate.py` に食わせて Excel 出力
- [ ] Excel の部位診断グリッドの括弧内に正しく書き込まれる
  - 例：3つの枯枝マーカー → `AP16` セルに `φ5cm L0.8m ×3` 風の文字列

### D. UI 細部
- [ ] summaryEdited=true のとき視覚的にわかる（背景色など）
- [ ] ↻ ボタンが summaryEdited=true のときだけ目立つ
- [ ] モバイル幅でレイアウト崩れない（特に summary 入力欄が長すぎず）

---

## 11. 既知の制約・注意点

1. **`extraction_rules.json` は public/ に置く必要がある**
   - Viteの public/ に置けば `/extraction_rules.json` で fetch 可能
   - src/ に置くと bundle されてしまうので注意

2. **抽出ロジックの将来の変更**
   - 表III-2・23 のルール変更時は `extraction_rules.json` だけ書き換えれば PWA・Python 両方に反映される
   - JS/Python のコードは変更不要

3. **regex の互換性**
   - JS の `RegExp` と Python の `re` は基本互換だが、Unicode 文字（〜など）の扱いに微妙な差がある場合あり
   - 違和感あれば Python 版と JS 版で同じ入力に対して同じ出力か確認

4. **既存マーカーのマイグレーション**
   - text/summary フィールドが未定義のマーカーが大量にある場合、起動時の `migrateAllTrees` で全件処理するため初回起動が少し重くなる可能性
   - 一度マイグレートすれば IndexedDB に保存されるので2回目以降は速い

5. **建築限界越え対応**
   - 現状の `diagnosis_rows` には「建築限界越え」項目が含まれていない（行 23/24 の幹/大枝特殊レイアウト）
   - PWA でこの項目をマーカー扱いするのは別途検討（Phase D 以降）
   - 抽出ルール JSON には rule 定義済みなので、データが入れば抽出は動く

---

## 12. 完了後の動作確認シナリオ

完了報告と一緒に以下を実機で実行して結果を報告：

1. 新規樹を作成
2. 全景写真にマーカーを5つ配置：
   - 幹に「木槌打診異常」2つ（textbox に `大 GL1.5m〜2.5m`、`中 GL3m〜4m`）
   - 大枝に「枯枝」3つ（textbox に `φ5cm L0.8m`、`φ3cm L0.5m`、`φ8cm L1.2m`）
3. 所見欄で各マーカーの summary が期待通り表示されることをスクショ
4. 1つの summary を手動編集して `summaryEdited` フラグが立つこと（背景色変化）を確認
5. ↻ ボタンで戻すこと確認
6. JSON Export → PC で generate.py 実行 → Excel の AB19 と AP16 に集約結果が入ること確認

---

以上。実装完了したら動作確認結果をスクショ付きで報告してください。

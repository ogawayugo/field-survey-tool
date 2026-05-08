# v2.7：判定理由欄と特記事項メモの追加

## 概要

街路樹現場調査ツール（PWA）に以下の3機能を追加する：

1. **活力判定パネルに「判定理由」欄**（手動編集可、ボタン押下で自動生成）
2. **外観診断判定パネルに「判定理由」欄**（手動編集可、ボタン押下で自動生成）
3. **診断判定パネル最下部に「特記事項」メモ欄**（自由記述）

カルテExcel生成ツール（PC側）への反映は今回のスコープ外。ただし**JSONエクスポートには新フィールドを含める**こと（後でPC側に対応させるため）。

---

## 設計方針：「診断文生成ボタン」式

判定理由は**ユーザーが「診断文生成」ボタンを押したときだけ自動生成**される。

理由：自動生成にすると、ユーザーが気に入らないときに消す手間が増えるため。完全にユーザーがコントロールする方式にする。

挙動：
- **デフォルト**：空欄
- **「✨ 診断文生成」ボタン押下**：チップ・数値・メモから自動生成して欄に入れる（既存内容は上書き）
- **手動編集**：いつでも自由に編集可能
- **ボタンを再度押す**：強制的に上書き（編集内容は消える）

ロックフラグは不要（自動再生成が走らないため）。シンプルなテキストフィールド + 生成ボタンの構成。

---

## ステップ1：データ構造の拡張

各樹木のデータ構造に以下のフィールドを追加：

```js
{
  // 既存フィールド ...
  
  // ▼ 新規追加 ▼
  vitalityReason: '',     // 活力判定理由
  appearanceReason: '',   // 外観診断判定理由
  specialNotes: ''        // 特記事項メモ
}
```

**ロックフラグは作らない**（ボタン押下時のみ生成だから不要）。

### 既存データへのマイグレーション

IndexedDB に保存済みの既存樹木データには上記フィールドがない。読み込み時に存在しなければ空文字で初期化：

```js
function migrateTree(tree) {
  return {
    ...tree,
    vitalityReason: tree.vitalityReason ?? '',
    appearanceReason: tree.appearanceReason ?? '',
    specialNotes: tree.specialNotes ?? '',
  };
}
```

データ読込関数（`loadTrees` 的なもの）の中で、各樹木に対して `migrateTree` を通すこと。

---

## ステップ2：活力判定理由の生成ロジック

### 関数を新規作成

`src/utils/` に `generateJudgmentReason.js` を作成（既に類似ファイルがあればそこに追記）。

```js
// src/utils/generateJudgmentReason.js

/**
 * 活力関連キーワード辞書
 * メモ文字列に含まれていたら検出される
 */
const VITALITY_KEYWORDS = [
  // 葉量系
  { match: ['葉量少', '葉少', '少葉'], label: '葉量少' },
  { match: ['葉量中', '葉量中程度'], label: '葉量中程度' },
  { match: ['葉量多', '葉多'], label: '葉量多' },
  
  // 枯れ枝系
  { match: ['枯れ枝少', '枯枝少'], label: '枯れ枝少' },
  { match: ['枯れ枝多', '枯枝多', '枯れ枝多数'], label: '枯れ枝多' },
  
  // 新梢系
  { match: ['新梢伸長不良', '新梢伸長不高', '新梢不良'], label: '新梢伸長不良' },
  
  // 葉色系
  { match: ['黄化'], label: '黄化' },
  { match: ['褐色'], label: '褐色変' },
  { match: ['葉わずらい', '葉煩い'], label: '葉わずらい' },
  
  // 梢枝枯れ
  { match: ['梢枝枯れ', '枝先枯れ', '梢枝先枯'], label: '梢枝・枝先枯れ' },
  
  // スカシライト
  { match: ['スカシライト', '透け見え', 'すかし'], label: 'スカシライト（透け見え）' },
  
  // 葉象
  { match: ['葉象不良', '葉しわ', '葉のしわ'], label: '葉象不良' },
  
  // 枯れ上がり
  { match: ['枯れ上がり', '枯上がり'], label: '枯れ上がり' },
];

/**
 * メモから活力関連キーワードを抽出
 */
function extractVitalityKeywords(memo) {
  if (!memo) return [];
  const found = new Set();
  for (const entry of VITALITY_KEYWORDS) {
    for (const m of entry.match) {
      if (memo.includes(m)) {
        found.add(entry.label);
        break;
      }
    }
  }
  return [...found];
}

/**
 * 樹勢・樹形の数値からテキスト化
 */
function vigorVitalityText(jusei, jukei) {
  const parts = [];
  if (jusei != null) parts.push(`樹勢${jusei}`);
  if (jukei != null) parts.push(`樹形${jukei}`);
  return parts.join('、');
}

/**
 * 活力判定理由を生成
 * @param {object} tree - 樹木データ
 * @returns {string}
 */
export function generateVitalityReason(tree) {
  const numText = vigorVitalityText(tree.jusei, tree.jukei);
  const keywords = extractVitalityKeywords(tree.memo || '');
  
  const segments = [];
  if (numText) segments.push(numText);
  if (keywords.length > 0) segments.push(keywords.join('、'));
  
  return segments.join('。') + (segments.length > 0 ? '。' : '');
}
```

### 注意点

- 既存のデータ構造で「樹勢」「樹形」のキー名が `jusei`/`jukei` ではなく `vigor`/`shape` などになっている場合は適宜置き換える
- メモのキー名も `memo` でなければ調整（例：`fieldMemo`）

---

## ステップ3：外観診断判定理由の生成ロジック

メモに既に「根元：傾斜、ベッコウタケ／幹：開口空洞」のように部位ラベルでチップ挿入されている前提（v2.5仕様）。これをそのまま整形して使う。

`src/utils/generateJudgmentReason.js` に追加：

```js
/**
 * メモから部位別の所見を抽出して外観診断判定理由を生成
 * 
 * メモの想定フォーマット（v2.5チップ挿入結果）：
 *   根元：不自然な傾斜、ベッコウタケ
 *   幹：開口空洞
 *   大枝：枯れ枝、キノコ
 * 
 * @param {object} tree - 樹木データ
 * @returns {string}
 */
export function generateAppearanceReason(tree) {
  const memo = tree.memo || '';
  if (!memo) return '';
  
  const PART_LABELS = ['根元', '幹', '大枝'];
  const partItems = { 根元: [], 幹: [], 大枝: [] };
  
  // 改行で行ごとに処理
  const lines = memo.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(根元|幹|大枝)[:：](.+)$/);
    if (!m) continue;
    const part = m[1];
    const items = m[2].split(/[、,]/).map(s => s.trim()).filter(Boolean);
    partItems[part].push(...items);
  }
  
  // 重複削除しつつ部位順に整形
  const segments = [];
  for (const part of PART_LABELS) {
    const items = [...new Set(partItems[part])];
    if (items.length > 0) {
      segments.push(`${part}:${items.join('、')}`);
    }
  }
  
  return segments.join(' / ');
}
```

### 注意点

- v2.5 の `formatShokenForKarte` 関数がもう存在する場合は、それを流用してOK
- メモにチップ以外の自由記述が混ざっていてもエラーにならないこと（`^(根元|幹|大枝)[:：]` でマッチしない行は単純に無視）

---

## ステップ4：UIコンポーネント

### 4.1 活力判定パネルに「判定理由」欄追加

活力判定パネル（樹勢・樹形のスライダー or ボタン群、A/B1/B2/C 判定があるパネル）の**直下**に追加。

```jsx
import { generateVitalityReason, generateAppearanceReason } from './utils/generateJudgmentReason';

{/* 活力判定パネル既存部分 */}
<div className="judgment-panel vitality">
  {/* ... 既存の樹勢・樹形入力、A/B1/B2/C判定 ... */}
  
  {/* ▼ 新規追加 ▼ */}
  <div className="reason-field">
    <div className="flex items-center justify-between mb-1">
      <label className="text-sm font-medium text-gray-700">
        判定理由
      </label>
      <button
        type="button"
        onClick={() => {
          updateTree(tree.id, {
            vitalityReason: generateVitalityReason(tree),
          });
        }}
        className="text-xs px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
      >
        ✨ 診断文生成
      </button>
    </div>
    <textarea
      value={tree.vitalityReason}
      onChange={(e) => {
        updateTree(tree.id, { vitalityReason: e.target.value });
      }}
      placeholder="「✨ 診断文生成」ボタンで自動入力、または直接記述"
      rows={3}
      className="w-full p-2 border rounded text-sm"
    />
  </div>
</div>
```

### 4.2 外観診断判定パネルに「判定理由」欄追加

部位判定マトリクス（根元・幹・大枝 × A/B1/B2/C）と外観診断判定（A/B1/B2/C）がある場所の**直下**に追加。

```jsx
{/* 外観診断判定パネル既存部分 */}
<div className="judgment-panel appearance">
  {/* ... 既存の部位判定マトリクス、外観診断判定 ... */}
  
  {/* ▼ 新規追加 ▼ */}
  <div className="reason-field">
    <div className="flex items-center justify-between mb-1">
      <label className="text-sm font-medium text-gray-700">
        判定理由
      </label>
      <button
        type="button"
        onClick={() => {
          updateTree(tree.id, {
            appearanceReason: generateAppearanceReason(tree),
          });
        }}
        className="text-xs px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
      >
        ✨ 診断文生成
      </button>
    </div>
    <textarea
      value={tree.appearanceReason}
      onChange={(e) => {
        updateTree(tree.id, { appearanceReason: e.target.value });
      }}
      placeholder="「✨ 診断文生成」ボタンで自動入力、または直接記述"
      rows={3}
      className="w-full p-2 border rounded text-sm"
    />
  </div>
</div>
```

### 4.3 特記事項メモ欄

診断判定パネル全体の**最下部**に追加。判定パネル群全体を囲むコンテナの末尾に置く。

```jsx
{/* 診断判定パネル群（活力・部位・外観）の末尾 */}

<div className="special-notes-field mt-4 pt-4 border-t">
  <label className="text-sm font-medium text-gray-700 block mb-1">
    特記事項
  </label>
  <textarea
    value={tree.specialNotes}
    onChange={(e) => updateTree(tree.id, { specialNotes: e.target.value })}
    placeholder="現場では書ききれなかった所感、次回フォローアップ事項、管理者への申し送りなど"
    rows={4}
    className="w-full p-2 border rounded text-sm"
  />
</div>
```

---

## ステップ5：上書き確認（オプション）

「✨ 診断文生成」ボタンを押したときに既存内容がある場合、誤って消してしまわないよう確認ダイアログを出すと親切：

```jsx
onClick={() => {
  const newReason = generateVitalityReason(tree);
  if (tree.vitalityReason && tree.vitalityReason !== newReason) {
    if (!window.confirm('既存の判定理由を上書きしますか？')) return;
  }
  updateTree(tree.id, { vitalityReason: newReason });
}}
```

ただしこれは**任意**。ちっこいおっさんが「いちいち聞かないでサクサク上書きしてほしい」場合は省略してOK。**初期実装では入れず、必要なら後で追加**で進める。

---

## ステップ6：JSONエクスポートに新フィールドを含める

JSONエクスポート関数（`exportJSON` 的なもの）が既存のデータをそのまま出力していれば、自動的に新フィールドも含まれる。**特別な修正は不要なはず**。

ただし、もしフィールドを明示的にホワイトリスト指定して出力している実装になっている場合は、下記を追加：

```js
{
  // ... 既存フィールド ...
  vitalityReason: tree.vitalityReason,
  appearanceReason: tree.appearanceReason,
  specialNotes: tree.specialNotes,
}
```

**確認方法**：1本入力した樹木をJSONエクスポートして、上記3フィールドが入っているかチェック。

---

## ステップ7：動作確認チェックリスト

実装後、下記を順に確認：

- [ ] 既存の樹木データを開いてもエラーにならない（マイグレーション動作OK）
- [ ] 新規に樹を追加 → 樹勢・樹形・チップを入れた段階では、判定理由欄は**空のまま**
- [ ] 活力の「✨ 診断文生成」を押すと、樹勢・樹形・活力キーワードから文章が生成される
- [ ] 外観の「✨ 診断文生成」を押すと、メモから部位別にグルーピングされた文章が生成される
- [ ] 判定理由欄を手動で編集しても、勝手に上書きされない
- [ ] もう一度「✨ 診断文生成」を押すと、編集内容が消えて新しい自動生成内容に置き換わる
- [ ] 特記事項欄に文字を入れて、樹を切り替えて戻ってきても保持されている
- [ ] JSONエクスポートに `vitalityReason`、`appearanceReason`、`specialNotes` の3フィールドが含まれている
- [ ] iPhone Safari でも崩れず表示される

---

## トラブルシューティング想定

### Q1：診断文生成ボタンを押しても何も起きない

→ クリックハンドラ内で `updateTree` を呼んでいるか確認。また `generateVitalityReason(tree)` 関数のインポートが正しく行われているか。

### Q2：チップで挿入したのに外観判定理由が空のまま生成される

→ メモのフォーマットが `^(根元|幹|大枝)[:：]` の正規表現にマッチしているか console.log で確認。コロンが半角の場合と全角の場合の両方をハンドリングしている。

### Q3：既存データを開いたら「Cannot read property of undefined」

→ ステップ1のマイグレーションが効いていない。データ読込関数で `migrateTree` を通すこと。

### Q4：活力判定理由が「樹勢undefined、樹形undefined。」になる

→ `tree.jusei`/`tree.jukei` のキー名が違う可能性。実際のデータ構造に合わせて `generateVitalityReason` 内のキー名を変更。

---

## 完了報告フォーマット

実装が終わったら、以下を報告してください：

1. 動作確認チェックリスト全項目の結果
2. JSONエクスポートしたサンプル（1本ぶん、テキストでOK）
3. 想定外の挙動・実装で迷った箇所があれば

問題があればJSONサンプルとスクショをアップロードしてください。

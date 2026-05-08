# v2.7.1：判定理由の文章化アップデート

## 概要

v2.7 で実装された「✨ 診断文生成」ボタンの出力が単語の羅列だったのを、**樹木医のカルテ調の自然な文章**に変える。

修正対象は以下のファイルのみ：
- `src/lib/generateJudgmentReason.js`

UI・データ構造・ボタン挙動は変更なし。**生成関数の中身だけ書き換える**。

---

## ビフォー / アフター

### Before（v2.7）

```
活力：樹勢2、樹形3。葉量少、枯れ枝多。
外観：根元: 不自然な傾斜、ベッコウタケ / 幹: 開口空洞 / 大枝: 枯れ枝
```

### After（v2.7.1）

```
活力：樹勢2、樹形3。葉量の減少および多数の枯れ枝が認められる。これらの所見から、樹勢はやや不良、樹形は不良と判断した。

外観：根元部に不自然な傾斜および子実体（ベッコウタケ）の発生を認める。幹部には開口空洞、大枝には枯れ枝が認められる。以上のことから、外観診断判定はB2（中程度の損傷）と判断した。
```

---

## ステップ1：`generateJudgmentReason.js` を全面書き換え

`src/lib/generateJudgmentReason.js` の内容を以下に**完全に置き換え**る。

```js
// src/lib/generateJudgmentReason.js

// ==================== 活力判定 ====================

/**
 * 活力関連キーワード辞書
 * - match: メモから検出する単語（複数表記対応）
 * - phrase: 文章中で使う形（名詞句）
 */
const VITALITY_KEYWORDS = [
  // 葉量系（不良側）
  { match: ['葉量少', '葉少', '少葉'], phrase: '葉量の減少' },
  
  // 葉量系（良好側） - 検出はするが文章には出さない設計も可能。今は出す。
  { match: ['葉量中', '葉量中程度'], phrase: '中程度の葉量' },
  { match: ['葉量多', '葉多'], phrase: '十分な葉量' },
  
  // 枯れ枝系
  { match: ['枯れ枝少', '枯枝少'], phrase: '軽微な枯れ枝' },
  { match: ['枯れ枝多', '枯枝多', '枯れ枝多数'], phrase: '多数の枯れ枝' },
  
  // 新梢系
  { match: ['新梢伸長不良', '新梢伸長不高', '新梢不良'], phrase: '新梢伸長の不良' },
  
  // 葉色系
  { match: ['黄化'], phrase: '葉の黄化' },
  { match: ['褐色'], phrase: '葉の褐色変' },
  { match: ['葉わずらい', '葉煩い'], phrase: '葉のわずらい' },
  
  // 梢枝枯れ
  { match: ['梢枝枯れ', '枝先枯れ', '梢枝先枯'], phrase: '梢枝および枝先の枯死' },
  
  // スカシライト
  { match: ['スカシライト', '透け見え', 'すかし'], phrase: '樹冠のスカシライト（透け見え）' },
  
  // 葉象
  { match: ['葉象不良', '葉しわ', '葉のしわ'], phrase: '葉象の不良' },
  
  // 枯れ上がり
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
 * フレーズ配列を「A、Bおよびc」形式で結合
 *  ['葉量の減少', '多数の枯れ枝'] → '葉量の減少および多数の枯れ枝'
 *  ['A', 'B', 'C'] → 'A、BおよびC'
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
 * - 樹勢と樹形の評価が同じ → 「樹勢・樹形ともに〜」
 * - 違う → 「樹勢は〜、樹形は〜」
 * - どちらか欠けている → 入力された方だけ
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
 * 
 * 構成：
 *   1. 「樹勢{N}、樹形{M}。」
 *   2. 「{観察事実}が認められる。」
 *   3. 「これらの所見から、{総合評価}。」
 *
 * @param {object} tree - 樹木データ
 * @returns {string}
 */
export function generateVitalityReason(tree) {
  // 樹勢・樹形のキー名は実プロジェクトに合わせる（現状: vitalitySei / vitalityKei）
  const sei = tree.vitalitySei ?? tree.jusei;
  const kei = tree.vitalityKei ?? tree.jukei;
  
  const sentences = [];
  
  // 1. 数値部分
  const numParts = [];
  if (sei != null) numParts.push(`樹勢${sei}`);
  if (kei != null) numParts.push(`樹形${kei}`);
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
      // 観察事実がない場合は「以上のことから」ではなく直接判定
      sentences.push(`${verdict}。`);
    }
  }
  
  return sentences.join('');
}


// ==================== 外観診断 ====================

/**
 * キノコ類の名称リスト
 * メモにこれらが含まれていたら「子実体（{名称}）」に自動変換
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

/**
 * 「キノコ（子実体）」「キノコ」のような汎用語の置換
 */
const FUNGUS_GENERIC = ['キノコ（子実体）', 'キノコ', '子実体'];

/**
 * 単一の項目テキストをカルテ調に変換
 *  - キノコ名 → 「子実体（キノコ名）」
 *  - 既に「子実体」で始まっていれば触らない
 *  - その他はそのまま
 */
function transformItem(item) {
  const trimmed = item.trim();
  if (!trimmed) return '';
  
  // 既に子実体表記済みならそのまま
  if (trimmed.startsWith('子実体')) return trimmed;
  
  // キノコ類の名前を含んでいれば子実体表記に
  for (const name of FUNGUS_NAMES) {
    if (trimmed === name || trimmed.includes(name)) {
      return `子実体（${name}）`;
    }
  }
  
  // 汎用「キノコ」表記の正規化
  for (const g of FUNGUS_GENERIC) {
    if (trimmed === g) return '子実体';
  }
  
  return trimmed;
}

/**
 * 部位別の項目配列から1文を生成
 *  ('根元', ['不自然な傾斜', '子実体（ベッコウタケ）']) 
 *    → '根元部に不自然な傾斜および子実体（ベッコウタケ）の発生を認める。'
 */
function buildPartSentence(partKey, items) {
  if (items.length === 0) return '';
  const partLabel = partKey === '大枝' ? '大枝' : `${partKey}部`;
  const joined = joinPhrases(items);
  
  // 子実体が含まれていれば「〜の発生を認める」、それ以外は「〜が認められる」
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
 *
 * 構成：
 *   1. 部位別観察事実（根元 → 幹 → 大枝の順）
 *   2. 外観診断判定があれば「以上のことから、外観診断判定は〇〇と判断した。」
 *
 * @param {object} tree - 樹木データ
 * @returns {string}
 */
export function generateAppearanceReason(tree) {
  const memo = tree.memo || '';
  const PART_LABELS = ['根元', '幹', '大枝'];
  const partItems = { 根元: [], 幹: [], 大枝: [] };
  
  // メモから部位ラベル付き項目を抽出
  const lines = memo.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(根元|幹|大枝)[:：](.+)$/);
    if (!m) continue;
    const part = m[1];
    const rawItems = m[2].split(/[、,]/).map(s => s.trim()).filter(Boolean);
    // キノコ等の変換
    const transformed = rawItems.map(transformItem).filter(Boolean);
    partItems[part].push(...transformed);
  }
  
  // 部位ごとに重複削除しつつ文を生成
  const sentences = [];
  for (const part of PART_LABELS) {
    const uniqueItems = [...new Set(partItems[part])];
    const sentence = buildPartSentence(part, uniqueItems);
    if (sentence) sentences.push(sentence);
  }
  
  // 外観診断判定（A/B1/B2/C）の総合評価
  // キー名はプロジェクトに合わせて適宜調整（appearanceJudgment / gaikanJudgment 等）
  const judgment = tree.appearanceJudgment ?? tree.gaikanJudgment ?? tree.appearanceRank;
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
```

---

## ステップ2：キー名の確認と調整

実装後、以下のキー名がプロジェクトの実態と合っているか確認：

### 樹勢・樹形

`generateVitalityReason` 内で以下のフォールバック式を使用：

```js
const sei = tree.vitalitySei ?? tree.jusei;
const kei = tree.vitalityKei ?? tree.jukei;
```

v2.7 実装時点で `vitalitySei`/`vitalityKei` だったので、おそらくこのままでOK。

### 外観診断判定

```js
const judgment = tree.appearanceJudgment ?? tree.gaikanJudgment ?? tree.appearanceRank;
```

実プロジェクトでのキー名が異なる場合は適宜置き換える。**JudgmentPanel.jsx を見て、外観診断判定の値を保存しているフィールド名**を確認してから合わせること。

確認したらコメントアウトされているフォールバックは削除して、実際のキー名だけ残してOK。

---

## ステップ3：動作確認

ローカル起動後、下記をテスト：

### テストケース1：フル入力

入力：
- 樹勢: 2、樹形: 3
- メモ: 
  ```
  葉量少、枯れ枝多
  根元：不自然な傾斜、ベッコウタケ
  幹：開口空洞
  大枝：枯れ枝
  ```
- 外観診断判定: B2

期待される出力：

**活力**：
> 樹勢2、樹形3。葉量の減少および多数の枯れ枝が認められる。これらの所見から、樹勢はやや不良、樹形は不良と判断した。

**外観**：
> 根元部に不自然な傾斜および子実体（ベッコウタケ）の発生を認める。幹部に開口空洞が認められる。大枝に枯れ枝が認められる。以上のことから、外観診断判定はB2（中程度の損傷）と判断した。

### テストケース2：樹勢・樹形が同じ値

- 樹勢: 2、樹形: 2

期待される文末：
> ...これらの所見から、樹勢・樹形ともにやや不良と判断した。

### テストケース3：樹勢のみ入力

- 樹勢: 3、樹形: 未入力

期待される文末：
> ...樹勢は不良と判断した。

### テストケース4：観察事実なし

- 樹勢: 1、樹形: 1
- メモ: 空 or 「特記事項なし」など

期待される出力：
> 樹勢1、樹形1。樹勢・樹形ともに良好と判断した。

### テストケース5：複数のキノコ

- メモ: `根元：ベッコウタケ、コフキタケ`

期待される出力：
> 根元部に子実体（ベッコウタケ）および子実体（コフキタケ）の発生を認める。

---

## トラブルシューティング想定

### Q1：「樹勢undefined、樹形undefined。」が出る

→ `tree.vitalitySei` のキー名が違う。JudgmentPanel.jsx での保存先キー名を確認して、`generateVitalityReason` 冒頭の参照式を調整。

### Q2：外観の総合評価が出ない

→ `tree.appearanceJudgment` のキー名が違う可能性。JudgmentPanel.jsx を確認して合わせる。

### Q3：キノコが「子実体（〜）」にならない

→ `FUNGUS_NAMES` 配列に該当キノコ名が入っているか、メモ内の表記と完全一致しているか確認。半角・全角の違いやスペースに注意。

### Q4：「〜および〜および〜」と「および」が連続する

→ `joinPhrases` 関数のロジックを確認。3つ以上のときは「A、BおよびC」になるはず。

---

## 完了報告フォーマット

実装後、以下のサンプル出力を1〜2件貼り付けてください：

1. テストケース1（フル入力）の活力・外観の出力
2. テストケース3（樹勢のみ）の出力

文章として違和感があれば、フレーズ単位で調整します（例：「葉量の減少」→「著しい葉量低下」みたいに）。

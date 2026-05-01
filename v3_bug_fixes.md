# v3 バグ修正指示書

`field-survey-tool` プロジェクトの v3 カルテ自動生成機能で確認されたバグを修正する。

実物のカルテExcelを分析した結果、4つのバグが見つかった。それぞれ別箇所の修正で対応する。

---

## バグ1：チップボタン挿入時に「、、」が連続することがある

### 症状

PWA で部位診断チップボタンを押したとき、メモに以下のような出力が発生：

```
根元:開口空洞（芯に達する）、キノコ（子実体）、樹皮枯死・欠損・腐朽、、木槌打診異常
                                              ↑↑
                                        読点が2つ連続
```

### 原因

`src/lib/memoInsert.js` の `insertDiagnosisItem` 関数で、メモ末尾が既に読点 `、` で終わっている場合に、さらに `、` を追加してしまっている可能性。または、項目名そのものに `（` や `）` が含まれているケースで処理がズレている。

### 修正内容

`src/lib/memoInsert.js` を修正：

```js
export function insertDiagnosisItem(currentMemo, part, item) {
  let memo = currentMemo || '';

  // メモ末尾の余分な読点・空白を除去（「、 」「 、」「、、」など）
  memo = memo.replace(/[、\s]+$/, '');

  // メモが完全に空 → 部位ラベル付きで開始
  if (memo.length === 0) {
    return `${part}:${item}`;
  }

  // 最終行を取得
  const lines = memo.split('\n');
  const lastLine = lines[lines.length - 1];

  // 最終行が空（メモが改行のみで終わっている）
  if (lastLine.trim().length === 0) {
    return memo + `${part}:${item}`;
  }

  // 最終行の先頭が「部位:」または「部位：」で始まっているかチェック
  const partsPattern = /^(根元|幹|大枝)[:：]/;
  const match = lastLine.match(partsPattern);

  if (match) {
    const lastLinePart = match[1];
    if (lastLinePart === part) {
      // 同じ部位 → 読点で続ける
      return memo + `、${item}`;
    } else {
      // 違う部位 → 改行して新しい部位ラベルから
      return memo + `\n${part}:${item}`;
    }
  }

  // 最終行が部位ラベルを持たない（自由記述で終わっている）
  return memo + `\n${part}:${item}`;
}
```

**ポイント**：処理の最初に `memo.replace(/[、\s]+$/, '')` で末尾の読点・空白をクリーンアップする。これで二重読点を完全に防ぐ。

---

## バグ2：メモにない項目を勝手に「なし」にしてしまう

### 症状

生成されたカルテで、本来テンプレートのまま `□なし□あり` だった行のうち、**項目がメモに出てこないものまで `■なし` になっている**。

例：M14 セル（「芯に達していない開口空洞」根元列）が `■なし□1/3未満□1/3以上` になっている。これは「現場で観察した結果、被害なし」を意味するが、自動判定ではこれを断定できない（観察し忘れただけかもしれない）。

### 原因

`src/lib/karteGenerator.js`（または該当する書込みロジック）で、「メモに項目が出てこない場合は『なし』にチェックする」推測ロジックが入っている。これは危険なので撤去する。

### 修正内容

カルテ書込みロジックを以下のルールに変更：

**新ルール**：
- メモに項目が出現する → そのセルの `□あり` を `■あり` に置換
- メモに項目が出現しない → **何もしない**（テンプレートの `□なし□あり` のまま残す）
- 「なし」を ■ にする処理は完全に削除する

`src/lib/karteGenerator.js` の該当箇所を以下のように修正：

```js
// 部位診断のチェックボックス処理
// メモから「部位：項目1、項目2」を解析して、該当セルの □あり を ■あり に置換する
function applyDiagnosisChecks(sheet, tree, template) {
  const memo = tree.memo || '';
  if (!memo) return;

  // 部位ごとに項目を抽出
  const partItems = parseDiagnosisFromMemo(memo);
  // partItems = { '根元': ['樹皮枯死...', '開口空洞...'], '幹': [...], '大枝': [...] }

  // 各部位の各項目について、対応するセルの □あり を ■あり に置換
  for (const [part, items] of Object.entries(partItems)) {
    for (const item of items) {
      const cellAddr = findDiagnosisCell(template, part, item);
      if (!cellAddr) continue;

      const cell = sheet.getCell(cellAddr);
      const original = String(cell.value || '');

      // 「あり」だけを ■ に置換、それ以外は触らない
      // 注意：「なし」は絶対に ■ にしない
      const updated = original.replace(/□あり/, '■あり');

      // ルートカラーだけ特殊：「見えない」を ■ に
      if (item === 'ルートカラー見えない') {
        cell.value = original.replace(/□見えない/, '■見えない');
      } else if (updated !== original) {
        cell.value = updated;
      }
    }
  }
}

// メモから部位ごとの項目リストを抽出
function parseDiagnosisFromMemo(memo) {
  const result = { '根元': [], '幹': [], '大枝': [] };
  const lines = memo.split('\n');

  let currentPart = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 「部位:」で始まる行をパース
    const match = trimmed.match(/^(根元|幹|大枝)[:：](.*)/);
    if (match) {
      currentPart = match[1];
      const rest = match[2];
      // 読点で分割して項目を取り出す
      const items = rest.split(/[、,]/).map(s => s.trim()).filter(s => s);
      // 寸法部分を除去（数字や ×、cm を含むセグメントは項目名から外す可能性も考慮）
      // ただし「樹皮枯死5×20cm」のようにくっついてる場合は項目名を抽出
      const cleanItems = items.map(s => extractItemName(s));
      result[currentPart].push(...cleanItems.filter(s => s));
    }
  }
  return result;
}

// 項目名と寸法が混ざった文字列から、項目名部分だけを取り出す
// 例: "樹皮枯死・欠損・腐朽5×20cm" → "樹皮枯死・欠損・腐朽"
// 例: "開口空洞（芯に達しない）4×5cm深5cm" → "開口空洞（芯に達しない）"
function extractItemName(s) {
  // 標準的な項目名のリストに照合
  const KNOWN_ITEMS = [
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
    '枯枝',
    'スタブカット',
  ];

  // 完全一致を優先
  for (const item of KNOWN_ITEMS) {
    if (s === item) return item;
  }
  // 前方一致で項目名を抽出
  for (const item of KNOWN_ITEMS) {
    if (s.startsWith(item)) return item;
  }
  // 該当なし
  return '';
}

// テンプレートのセルマップから、部位×項目の該当セル番地を返す
function findDiagnosisCell(template, part, item) {
  // テンプレートに以下のマップを定義しておく：
  // partColumns = { '根元': 'M', '幹': 'X', '大枝': 'AI' }
  // diagnosisRows = { '樹皮枯死...': 13, '開口空洞（芯に達しない）': 14, ... }
  const partColumns = { '根元': 'M', '幹': 'X', '大枝': 'AI' };
  const diagnosisRows = {
    '樹皮枯死・欠損・腐朽': 13,  // ※ ただし行13は3択なので別扱い（後述のバグ4参照）
    '開口空洞（芯に達しない）': 14,
    '開口空洞（芯に達する）': 15,
    'キノコ（子実体）': 18,
    '木槌打診異常': 19,
    '分岐部・付根の異常': 20,
    '胴枯れなどの病害': 21,
    '虫穴・虫フン・ヤニ': 22,
    '根元の揺らぎ': 23,        // 根元のみ
    '鋼棒貫入異常': 24,        // 根元のみ
    '巻き根': 25,              // 根元のみ
    'ルートカラー見えない': 26, // 根元のみ
    '露出根被害': 27,          // 根元のみ
    '不自然な傾斜': 28,        // 根元のみ
    '枯枝': 16,                // 大枝のみ、列は AL
    'スタブカット': 17,        // 大枝のみ、列は AL
  };

  // 大枝のみの特殊ケース
  if (item === '枯枝' || item === 'スタブカット') {
    if (part !== '大枝') return null;
    return `AL${diagnosisRows[item]}`;
  }

  // 根元のみの特殊ケース
  const onlyOnRoot = ['根元の揺らぎ', '鋼棒貫入異常', '巻き根', 'ルートカラー見えない', '露出根被害', '不自然な傾斜'];
  if (onlyOnRoot.includes(item) && part !== '根元') {
    return null;
  }

  const row = diagnosisRows[item];
  const col = partColumns[part];
  if (!row || !col) return null;
  return `${col}${row}`;
}
```

---

## バグ3：所見欄が部位ごとに整理されず、メモがそのまま入る

### 症状

セル G29（所見欄）の中身がメモの丸ごとコピーになっている：

```
幹:胴枯れなどの病害
根元:開口空洞（芯に達する）、キノコ（子実体）、樹皮枯死・欠損・腐朽...
幹:樹皮枯死・欠損・腐朽、開口空洞（芯に達しない）...
大枝:樹皮枯死・欠損・腐朽...
```

本来は **部位ごとに統合され、所見欄として整形された形**で入るべき。

### 原因

`parseShokenLines` 関数（または相当するロジック）が機能していない、もしくは呼ばれていない。

### 修正内容

メモを部位別に整理して所見欄に書き込む `formatShokenForKarte` 関数を新設する。動作：

1. メモを行ごとに分解
2. 各行の先頭の `部位：` を見て、部位ごとにグループ化（同じ部位が複数行ある場合は1つにマージ）
3. 部位の順番は **根元 → 幹 → 大枝（または枝）**
4. 各部位の内容を所見欄の各行に配置

```js
function formatShokenForKarte(memo) {
  if (!memo) return [];

  const buckets = { '根元': [], '幹': [], '大枝': [] };
  const lines = memo.split('\n').map(l => l.trim()).filter(l => l);

  for (const line of lines) {
    const match = line.match(/^(根元|幹|大枝|枝)[:：](.*)/);
    if (match) {
      let part = match[1];
      // 「枝」を「大枝」に統合（カルテの所見欄表記に合わせる場合は調整）
      if (part === '枝') part = '大枝';
      const content = match[2].trim();
      if (content) {
        buckets[part].push(content);
      }
    } else {
      // 部位ラベルなしの行は最後にまとめて追加
      buckets._free = buckets._free || [];
      buckets._free.push(line);
    }
  }

  // 各バケツを統合（同じ部位が複数あれば読点でつなぐ）
  // ただし所見欄の各行は別の被害カテゴリを表現するので、
  // 「根元：項目1、項目2」「幹：項目1、項目2」のように1部位1行に集約

  const result = [];
  if (buckets['根元'].length) {
    result.push(`根元：${buckets['根元'].join('、')}`);
  }
  if (buckets['幹'].length) {
    result.push(`幹：${buckets['幹'].join('、')}`);
  }
  if (buckets['大枝'].length) {
    // ※ 所見欄では「枝」と表記する慣習があるなら "枝：" にする
    result.push(`枝：${buckets['大枝'].join('、')}`);
  }
  if (buckets._free && buckets._free.length) {
    result.push(...buckets._free);
  }

  return result;
}
```

そして所見欄書込み処理：

```js
// 所見欄（G29:G35）に書き込む
function writeShoken(sheet, tree, template) {
  const lines = formatShokenForKarte(tree.memo);
  const targetCells = template.shoken.cellRange; // ['G29', 'G30', ...]

  // 所見欄は7行あるが、行ごとに別セルに割り当てる方法ではなく、
  // 1つのセル（G29）に改行付きで全部入れる方が一般的かもしれない。
  // テンプレートを見て、G29:G35が結合セルなら G29 に改行で入れる。
  // 結合されていなければ各セルに1行ずつ。

  // ここでは結合セル想定で G29 に改行込みで入れる
  const text = lines.join('\n');
  sheet.getCell(targetCells[0]).value = text;

  // セル内改行を有効化
  sheet.getCell(targetCells[0]).alignment = {
    ...(sheet.getCell(targetCells[0]).alignment || {}),
    wrapText: true,
    vertical: 'top',
  };
}
```

**注意**：テンプレートで G29:G35 が結合セルかどうか確認する必要がある。結合されていれば G29 に改行付きで全部入れる。結合されていなければ各セルに1行ずつ振り分ける。事前に `template_shibuya.xlsx` を `xlsx` または ExcelJS で開いて確認すること。

---

## バグ4：行13・14・15（3択項目）への自動チェック

### 症状

行13（樹皮枯死・欠損・腐朽）、行14（芯に達していない開口空洞）、行15（芯に達した開口空洞）の選択肢は **「なし」「1/3未満」「1/3以上」の3択**。

メモから「なし」を勝手に ■ にしてしまうと誤情報になる。本来、メモには程度（1/3未満/以上）が記述されないので、これらの行は **自動チェック対象外** とすべき。

### 修正内容

`findDiagnosisCell` 関数で、行13・14・15 については `null` を返すようにする：

```js
function findDiagnosisCell(template, part, item) {
  // 行13・14・15（3択項目）は自動チェック対象外
  // ユーザーが手動でカルテ上で選択する想定
  const SKIP_ITEMS = ['樹皮枯死・欠損・腐朽', '開口空洞（芯に達しない）', '開口空洞（芯に達する）'];
  if (SKIP_ITEMS.includes(item)) return null;

  // ... 以下は前述のロジック
}
```

これで該当行はテンプレートのまま `□なし□1/3未満□1/3以上` で残る。ユーザーがExcel上で手動で選ぶ。

**メモへの転記は維持**：所見欄には項目名と寸法が入るので、樹木医がそれを見て手動で適切な選択肢を選べる。

---

## ステップ：動作確認

修正後、`npm run dev` で起動し、以下のテストケースで確認：

### テストケース1：チップボタン連打

PWA で「根元」グループの全項目を順番にタップ。生成されるメモが：

```
根元:樹皮枯死・欠損・腐朽、開口空洞（芯に達しない）、開口空洞（芯に達する）、キノコ（子実体）、木槌打診異常、分岐部・付根の異常、胴枯れなどの病害、虫穴・虫フン・ヤニ、根元の揺らぎ、鋼棒貫入異常、巻き根、ルートカラー見えない、露出根被害、不自然な傾斜
```

になり、**「、、」が混入しないこと**。

### テストケース2：メモなし項目への影響

メモに「根元:キノコ（子実体）」だけ入れて、カルテ生成を実行。

期待される結果：
- M18（キノコ・根元）のセル → `□なし■あり（` になる
- M14（芯に達していない開口空洞・根元）のセル → `□なし□1/3未満□1/3以上` のまま（変更なし）
- 他の行も、メモに出てこない項目は触らない

### テストケース3：所見欄の整形

メモが：
```
根元:キノコ（子実体）、露出根被害5×20cm
幹:樹皮欠損2×3cm
```

所見欄（G29）に入る内容：
```
根元：キノコ（子実体）、露出根被害5×20cm
幹：樹皮欠損2×3cm
```

部位ごとに整理されていればOK。

### テストケース4：3択項目はそのまま

メモに「根元:樹皮枯死・欠損・腐朽」と書いても、M13セルは `□なし□1/3未満□1/3以上` のまま（自動チェックされない）。

---

## ステップ：GitHub にpush

すべてのテストが通ったら：

```bash
git add .
git commit -m "Fix karte generator bugs: comma duplication, false 'nashi' inference, shoken formatting, 3-choice items"
git push
```

Vercel が自動デプロイ。

---

## 補足：将来の改善（このスコープ外）

行13・14・15の3択項目について、将来「PWA側でユーザーに尋ねる UI」を追加する場合の参考メモ：

- 各項目について「観察結果：なし / 1/3未満 / 1/3以上 / 未確認」をラジオボタンで選択
- 「未確認」の場合のみ自動チェックしない
- これは v3.5 として別途検討

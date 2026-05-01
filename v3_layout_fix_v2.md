# レイアウト修正指示書 v2

前回の修正で4列のうち2列（CM, CN）は直ったが、**BP列とBR列の幅が依然として抜けている**。

## 現状

実物のテンプレート vs 生成後の比較結果：

| 列 | テンプレート幅 | 生成後 | 状態 |
|---|---|---|---|
| BP | 2.25 | デフォルト | **未修正** |
| BR | 2.25 | デフォルト | **未修正** |
| CM | 0.75 | 0.75 | ✅修正済 |
| CN | 2.25 | 2.25 | ✅修正済 |

**幅以外は完璧**：
- ワードラップ、フォント、配置、結合セル、行高、ページ設定はすべてテンプレートと一致
- 「樹皮枯死...」「芯に達していない開口空洞」「最大被害部の周囲長比率」「次回診断」のセル設定もテンプレートと完全に同じ

つまり、**残っているレイアウト崩れは BP/BR の列幅2つだけが原因**。これらが2.25の細い列であるべきなのにデフォルト幅（広い）になっているため、その周辺のレイアウトがズレて見える。

## 原因

ExcelJS の `src.getColumn(N).width` は、**値のセルが含まれない列だと `undefined` を返す**ことがある。BP/BR列は値セルが少ないため、ExcelJS の API では幅情報が取得できていない。

## 修正方針

`copyWorksheet` 関数の列幅コピー部分を、**ハードコードでテンプレートの全列幅を保証する**形に変更する。

`src/lib/karteGenerator.js` の `copyWorksheet` 関数の **列幅処理部分**を以下のように差し替え：

```js
// テンプレート（shibuya.xlsx）の全定義列幅をハードコード
// この値は openpyxl で template_shibuya.xlsx を解析して取得した実値
const SHIBUYA_TEMPLATE_COLUMN_WIDTHS = {
  'A': 1.25,
  'B': 2.25,
  'S': 2.08203125,
  'T': 2.25,
  'AT': 0.75,
  'AU': 1.0,
  'AV': 2.25,
  'BN': 2.25,
  'BP': 2.25,
  'BR': 2.25,
  'CL': 1.83203125,
  'CM': 0.75,
  'CN': 2.25,
};

function copyWorksheet(src, dst) {
  // 1) 列幅 - ハードコード値を最優先
  for (const [colLetter, width] of Object.entries(SHIBUYA_TEMPLATE_COLUMN_WIDTHS)) {
    dst.getColumn(colLetter).width = width;
  }
  // 加えて、ExcelJSのcolumnsも走査（万が一テンプレートが変更されても対応）
  const lastCol = src.actualColumnCount || src.columnCount || 100;
  for (let i = 1; i <= lastCol; i++) {
    const srcCol = src.getColumn(i);
    if (srcCol && srcCol.width !== undefined && srcCol.width !== null) {
      dst.getColumn(i).width = srcCol.width;
    }
    if (srcCol && srcCol.hidden) {
      dst.getColumn(i).hidden = srcCol.hidden;
    }
  }

  // 2) 行高 + セル
  src.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const dstRow = dst.getRow(rowNumber);
    if (row.height) dstRow.height = row.height;
    
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const dstCell = dstRow.getCell(colNumber);
      dstCell.value = cell.value;
      if (cell.style) {
        dstCell.style = JSON.parse(JSON.stringify(cell.style));
      }
    });
    dstRow.commit();
  });
  
  // 3) 結合セル
  if (src.model && src.model.merges) {
    src.model.merges.forEach(merge => {
      try { dst.mergeCells(merge); } catch (e) { /* skip */ }
    });
  }
  
  // 4) 印刷設定
  if (src.pageSetup) {
    dst.pageSetup = { ...src.pageSetup };
  }
  if (src.pageMargins) {
    dst.pageMargins = { ...src.pageMargins };
  }
}
```

## 重要なポイント

1. **ハードコード値を最優先で適用**：これにより ExcelJS の取得漏れを補える
2. **その後でExcelJSの値も走査**：ハードコード値で上書き可能だが、漏れがあれば補完
3. **将来テンプレートを変更する場合**：新しいテンプレートの列幅も `SHIBUYA_TEMPLATE_COLUMN_WIDTHS` に追加すればOK

## テンプレート列幅の設計値（参考）

`template_shibuya.xlsx` の全定義列：

```
A:  1.25         （左マージン）
B:  2.25         （No.列）
S:  2.08203125   （区切り）
T:  2.25         （区切り）
AT: 0.75         （区切り）
AU: 1.0          （区切り）
AV: 2.25         （右側ブロック開始）
BN: 2.25         （区切り）
BP: 2.25  ★抜けている
BR: 2.25  ★抜けている
CL: 1.83203125   （区切り）
CM: 0.75         （区切り）
CN: 2.25         （右マージン）
```

## 動作確認

修正後、PWAで1樹のカルテExcelを生成し、以下を確認：

1. ダウンロードしたExcelを開く
2. 列番号で BP, BR 付近の幅が細い（2.25）になっているか
3. 「枯枝 □なし■あり（」のカッコ表示
4. 「最大被害部の周囲長比率」エリアの表示
5. 「次回診断」「次回再診断時期」エリアの表示

すべて元のテンプレートと同じレイアウトになっていればOK。

## GitHubへpush

確認OKなら：

```bash
git add .
git commit -m "Fix column widths: hardcode missing BP/BR widths from shibuya template"
git push
```

Vercel が自動デプロイして本番反映。

## 補足：将来のテンプレート追加について

もし将来、別のテンプレート（東京都様式など）を追加する場合は、各テンプレートごとに列幅マップを定義する：

```js
const TEMPLATE_COLUMN_WIDTHS = {
  shibuya: { /* 上記 */ },
  tokyo_metro: {
    'A': 1.5,
    'B': 2.5,
    // ...
  },
};
```

そして templateId に応じて適用するマップを切り替える。

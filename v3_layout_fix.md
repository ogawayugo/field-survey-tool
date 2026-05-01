# レイアウト修正指示書（v3 後続）

`field-survey-tool` プロジェクトの v3 カルテ自動生成機能で、生成されたExcelの**列幅が一部失われ、レイアウトが崩れる**問題を修正する。

## 原因（特定済み）

実物のテンプレート Excel と生成された Excel を比較した結果：

- テンプレート定義列：**13列**（A, AT, AU, AV, B, BN, BP, BR, CL, CM, CN, S, T）
- 生成後の定義列：**9列**

→ 4つの列の幅が抜けている：

| 列 | テンプレート幅 | 生成後 |
|---|---|---|
| BP | 2.25 | デフォルト |
| BR | 2.25 | デフォルト |
| CM | 0.75 | デフォルト |
| CN | 2.25 | デフォルト |

これらは細い区切り列（カッコや矢印、罫線の補助）として設定されていたが、ExcelJS 経由のシート複製時に脱落している。これがスクショで見えた「左カッコが欠ける」「文字が枠と重なる」原因。

ちなみに：
- 結合セル246個は完全コピーされている（OK）
- 行高は全部コピーされている（OK）
- フォント・配置はコピーされている（OK）
- ページ設定（印刷スケール76%、用紙A4縦）もコピーされている（OK）

問題は **列幅コピーロジックだけ**。

## 修正対象ファイル

`src/lib/karteGenerator.js` の `copyWorksheet` 関数。

## 現状のコード（推定）

おそらくこんな感じ：

```js
function copyWorksheet(src, dst) {
  // 列幅
  src.columns.forEach((col, i) => {
    if (col && col.width) {
      dst.getColumn(i + 1).width = col.width;
    }
  });
  // ...
}
```

`src.columns` は **値が入っている列の配列だけ**を返すため、空のセルしかない列は含まれない場合がある。BP・BR・CM・CN は値が無い「区切り用の細い列」のため、`src.columns` で参照すると抜け落ちる。

## 修正内容

`copyWorksheet` 関数の列幅処理を、**ExcelJS の `eachColumn` または列番号を直接走査**する形に変更：

```js
function copyWorksheet(src, dst) {
  // 列幅 - srcの全列を走査して幅をコピー
  // src.columnCount は最終列番号を返すので、それを使う
  const lastCol = src.columnCount || src.actualColumnCount || 100;
  for (let i = 1; i <= lastCol; i++) {
    const srcCol = src.getColumn(i);
    if (srcCol && srcCol.width !== undefined && srcCol.width !== null) {
      dst.getColumn(i).width = srcCol.width;
    }
    // 列の hidden 状態もコピー
    if (srcCol && srcCol.hidden) {
      dst.getColumn(i).hidden = srcCol.hidden;
    }
    // outlineLevel もコピー
    if (srcCol && srcCol.outlineLevel) {
      dst.getColumn(i).outlineLevel = srcCol.outlineLevel;
    }
  }

  // 行高 + セル
  src.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const dstRow = dst.getRow(rowNumber);
    if (row.height) dstRow.height = row.height;
    
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const dstCell = dstRow.getCell(colNumber);
      // 値
      dstCell.value = cell.value;
      // スタイル
      if (cell.style) {
        dstCell.style = JSON.parse(JSON.stringify(cell.style));
      }
    });
    dstRow.commit();
  });
  
  // 結合セル
  if (src.model && src.model.merges) {
    src.model.merges.forEach(merge => {
      try { dst.mergeCells(merge); } catch (e) { /* skip */ }
    });
  }
  
  // 印刷設定
  if (src.pageSetup) {
    dst.pageSetup = { ...src.pageSetup };
  }

  // ▼ 追加：ページマージンもコピー
  if (src.pageMargins) {
    dst.pageMargins = { ...src.pageMargins };
  }
  // ▼ 追加：印刷範囲もコピー
  if (src.model && src.model.properties) {
    Object.assign(dst.properties, src.model.properties);
  }
}
```

**ポイント**：
1. `src.columns` は値の配列なので、空列を読み飛ばす。代わりに `src.getColumn(i)` で番号で個別アクセスする。
2. テンプレートの最終列を取得するために `src.columnCount` または安全側で 100 などの上限を使う。実際の列数は `actualColumnCount` でも取れる。
3. ページマージン・ページ設定もシート複製時に落ちるので合わせてコピー。

## 動作確認

修正後、`npm run dev` で起動し、PWA で1樹分のカルテ Excel を生成。

確認手順：

1. ダウンロードした Excel を開く
2. **印刷プレビュー**を見る（ページ設定タブ → 印刷プレビュー）
   - テンプレートと同じ印刷範囲・スケールで表示されるか
3. 行16の「枯枝 □なし■あり（  ）」のカッコの間に空白があるか確認
4. 行18-22の各部位の `□なし■あり（   ）` も同様に確認
5. 文字が枠線と重なっていないか確認

それでもダメな場合：
- 開発者ツールのコンソールでエラーが出ていないか
- `src.columnCount` の値が0になっていないか（その場合は別の取得方法が必要）

## デバッグ用：問題を切り分けるログ追加

修正効果が確認できない場合、`copyWorksheet` の冒頭にログを追加してデバッグ：

```js
function copyWorksheet(src, dst) {
  console.log('Source columnCount:', src.columnCount);
  console.log('Source actualColumnCount:', src.actualColumnCount);
  console.log('Source column BP width:', src.getColumn('BP')?.width);
  console.log('Source column BR width:', src.getColumn('BR')?.width);
  // ...
}
```

ブラウザの開発者ツール（F12 → Console）で値を確認できる。

## GitHubへpush

確認OKだったら：

```bash
git add .
git commit -m "Fix karte layout: preserve all column widths during sheet copy"
git push
```

## 補足

将来、別のテンプレート様式を使う場合に備えて、**列幅コピーは「定義された全列を全部コピー」する方が安全**。値の有無に依存しない実装にすることで、どんなテンプレートでも崩れなくなる。

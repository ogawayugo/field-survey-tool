# レイアウト修正指示書 v4：styles.xml 置換

## 問題の真の原因（特定済み）

これまでのレイアウト崩れの**真の原因**が判明した。

`<cols>` セクションをテンプレートから移植するだけでは不十分で、**`xl/styles.xml`（スタイルテーブル全体）もテンプレートのものに置き換える必要がある**。

### 根拠

XML レベルで両ファイルを比較した結果：

| 項目 | テンプレート | 生成後 |
|---|---|---|
| styles.xml サイズ | 210,091文字 | 52,390文字 |
| `<col>` の `style="3"` 指定 | あり | あり ✅ |
| スタイル3の `fontId` | **2** | **1** ❌ |
| スタイル3の `fillId` | **0**（無色） | **2**（塗りつぶし）❌ |
| スタイル3の vertical alignment | center | なし ❌ |

つまり「列にスタイル3を適用」という指定は同じでも、**「スタイル3」の中身がテンプレートと全く違うものになっている**。これでフォント・色・配置が崩れていた。

ExcelJS でシートを複製すると、関連するスタイルだけは新ワークブックにコピーされるが、**テンプレート側で定義されている全スタイル（210KB分）の大部分**は無視されてしまっている。

## 修正方針

v3 で実装した `<cols>` 置換に加えて、**`xl/styles.xml` をテンプレートのものに丸ごと置換する**。

これにより：
- スタイル番号と内容の対応がテンプレートと完全一致
- フォント、配色、配置、罫線、書式すべてがテンプレート通り
- セル内の `style="3"` といった参照が正しく解釈される

## 修正対象ファイル

`src/lib/karteGenerator.js` の `fixWorksheetCols` 関数（v3で追加した関数）。

## 修正コード

`fixWorksheetCols` 関数を以下のように拡張：

```js
async function fixWorksheetCols(generatedBuffer, templateId) {
  // テンプレートをfetch
  const tplResponse = await fetch(TEMPLATES[templateId].file);
  const tplArrayBuffer = await tplResponse.arrayBuffer();

  // テンプレートを zip として開く
  const tplZip = await JSZip.loadAsync(tplArrayBuffer);

  // 生成されたxlsxを zip として開く
  const genZip = await JSZip.loadAsync(generatedBuffer);

  // ▼ 1) styles.xml をテンプレートのもので完全置換 ▼
  const tplStylesXml = await tplZip.file('xl/styles.xml').async('string');
  genZip.file('xl/styles.xml', tplStylesXml);

  // ▼ 2) <cols> セクションをテンプレートのもので置換（v3 で実装済み） ▼
  const tplSheetXml = await tplZip.file('xl/worksheets/sheet1.xml').async('string');
  const colsMatch = tplSheetXml.match(/<cols[\s\S]*?<\/cols>/);
  if (colsMatch) {
    const tplCols = colsMatch[0];

    // 全シートの cols を置換
    const sheetFiles = Object.keys(genZip.files).filter(
      name => name.match(/^xl\/worksheets\/sheet\d+\.xml$/)
    );

    for (const sheetFile of sheetFiles) {
      let sheetXml = await genZip.file(sheetFile).async('string');

      if (sheetXml.match(/<cols[\s\S]*?<\/cols>/)) {
        sheetXml = sheetXml.replace(/<cols[\s\S]*?<\/cols>/, tplCols);
      } else {
        sheetXml = sheetXml.replace('<sheetData', tplCols + '<sheetData');
      }

      genZip.file(sheetFile, sheetXml);
    }
  }

  // ▼ 3) theme1.xml もテンプレートのものに置換（フォントテーマ統一のため） ▼
  try {
    const tplTheme = await tplZip.file('xl/theme/theme1.xml').async('string');
    if (tplTheme) {
      genZip.file('xl/theme/theme1.xml', tplTheme);
    }
  } catch (e) {
    console.warn('Could not replace theme1.xml:', e);
  }

  // zip を buffer として書き出す
  const fixedBuffer = await genZip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return fixedBuffer;
}
```

### 追加した処理（要点）

1. **`xl/styles.xml` を完全置換**（最重要）
   - これでスタイル番号と中身の対応がテンプレートと完璧に一致
   - フォント、塗りつぶし、罫線、配置、書式が全部正しくなる

2. **`xl/theme/theme1.xml` も置換**
   - Excel のテーマフォント（既定フォント）を統一
   - 「明朝体・ゴシック体」の選択がテンプレートと一致

3. **既存の `<cols>` 置換は維持**
   - 列幅・列スタイル指定をテンプレート通りに

## ステップ：動作確認

```bash
npm run dev
```

PWA で1樹分のカルテ Excel を生成 → ダウンロード → Excel で開く。

確認ポイント：

- [ ] **フォントがテンプレートと同じ**になっている（明朝・ゴシックなど）
- [ ] **罫線が崩れていない**
- [ ] **塗りつぶし**（背景色）が正しい（不要な色が付いていない）
- [ ] **左カッコ・右カッコ**が見える
- [ ] **文字と枠線が重なっていない**
- [ ] **印刷プレビュー**でテンプレートと同じレイアウト
- [ ] **Excelファイルサイズ**が大きくなっている（200KB以上が目安、テンプレートのスタイル情報が乗ったため）

## ステップ：複数樹のテスト

樹を3〜5本入れてカルテ生成し、**全シートが同じレイアウト**で出力されるか確認。

`fixWorksheetCols` は全シートに同じ `<cols>` を適用し、`styles.xml` は workbook 全体で1つなので、自動的に全シートに反映される。

## ステップ：エラーハンドリング

万が一 styles.xml の置換でエラーが起きても、ダウンロード自体は失敗しないように try/catch で保護：

```js
let fixedBuffer = generatedBuffer;
try {
  fixedBuffer = await fixWorksheetCols(generatedBuffer, templateId);
} catch (e) {
  console.warn('Layout fix failed, using ExcelJS output as-is:', e);
}
```

## ステップ：GitHubへpush

確認OKなら：

```bash
git add .
git commit -m "Fix karte layout: replace styles.xml and theme from template"
git push
```

Vercel が自動デプロイ。

## 補足：なぜこれで直るのか

xlsx ファイルは zip に以下のファイルが含まれる：

```
xl/
├── styles.xml      ← フォント、罫線、配置、塗りつぶし定義（最重要）
├── theme/
│   └── theme1.xml  ← テーマカラー、テーマフォント
├── worksheets/
│   └── sheet1.xml  ← セル値とスタイル参照（style="3"など）
└── workbook.xml    ← シート一覧、設定
```

セル値が `style="3"` を指定しても、その「スタイル3」の定義が `styles.xml` にあるので、`styles.xml` が違うと見た目が変わる。

テンプレートの `styles.xml` は元のExcelファイル制作者が職人技で構築したもので、複雑な書式（フォントサイズ、罫線パターン、配置、文字色、背景色など）を200種類以上定義している。ExcelJS はシート複製時に「使われているスタイル」だけコピーしようとするが、不完全。

→ **テンプレートの styles.xml を丸ごと持ってくる**のが最も確実で簡単。これでセル参照（`style="3"`）の意味も完璧に維持される。

## 期待される結果

修正後のカルテ Excel は、レイアウトもフォントもテンプレートと**ほぼ完全に一致**する。視覚的に「元のテンプレートと違う」と分かるレベルの崩れはなくなるはず。

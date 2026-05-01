# レイアウト修正指示書 v3：XMLレベル直接処理

## 問題のおさらい

`field-survey-tool` の v3 カルテ自動生成で、テンプレート Excel のレイアウトが ExcelJS 経由で複製されると一部崩れる。

XML レベルで分析した結果、以下が判明：

| 項目 | テンプレート | 生成後 |
|---|---|---|
| col の `style` 属性 | あり（`style="3"` など） | **欠落** |
| 列88〜89の定義 | あり | **欠落** |
| 末尾の範囲 | min="92" max="16384" | max="92" のみ |

ExcelJS 標準 API ではこれらの XML 属性を維持できないため、**ファイル生成後に XML を直接書き換える**アプローチで対応する。

## アプローチ

`generateKarteExcel` 関数の最後に、以下の処理を追加：

1. ExcelJS で生成した workbook を一旦 buffer として取得
2. その buffer を JSZip で開く（.xlsx は実態は zip ファイル）
3. テンプレート Excel から `<cols>` セクションを取り出す
4. 生成 Excel の各シートの `<cols>` セクションをテンプレートのものに差し替える
5. zip を書き出してダウンロード

これにより、ExcelJS の不完全なシート複製でも、最終的な XML はテンプレートと完全に同じ列定義になる。

## ステップ1：依存ライブラリの確認

`jszip` は v2 で既にインストール済み（ZIP エクスポート用）。新規インストール不要。

## ステップ2：karteGenerator.js の修正

`src/lib/karteGenerator.js` の `generateKarteExcel` 関数の末尾を修正。

### 現状のコード（推定）

```js
export async function generateKarteExcel(trees, surveyMeta, templateId = 'shibuya') {
  // ... テンプレートロード、シート複製、データ書き込み ...

  // ダウンロード
  const buffer = await outputWb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: '...' });
  // ... ダウンロード処理 ...
}
```

### 修正後のコード

```js
import JSZip from 'jszip';

export async function generateKarteExcel(trees, surveyMeta, templateId = 'shibuya') {
  // ... テンプレートロード、シート複製、データ書き込み（既存コード）...

  // ExcelJS で buffer を生成
  const buffer = await outputWb.xlsx.writeBuffer();

  // ▼ ここから追加：XML 直接編集 ▼
  const fixedBuffer = await fixWorksheetCols(buffer, templateId);
  // ▲ ここまで追加 ▲

  // ダウンロード
  const blob = new Blob([fixedBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = (surveyMeta.date || new Date().toISOString().split('T')[0]).replace(/[/:]/g, '-');
  a.download = `karte_${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 生成された xlsx (buffer) の各シートの <cols> セクションを、
 * テンプレートの <cols> セクションで置換する。
 * これにより列スタイル・min/max範囲がテンプレートと同じになる。
 */
async function fixWorksheetCols(generatedBuffer, templateId) {
  // テンプレートをfetch
  const tplResponse = await fetch(TEMPLATES[templateId].file);
  const tplArrayBuffer = await tplResponse.arrayBuffer();

  // テンプレートをzipとして開く
  const tplZip = await JSZip.loadAsync(tplArrayBuffer);

  // テンプレートの sheet1.xml を取得（テンプレートはシート1枚なので sheet1）
  const tplSheetXml = await tplZip.file('xl/worksheets/sheet1.xml').async('string');

  // テンプレートの <cols>...</cols> セクションを抽出
  const colsMatch = tplSheetXml.match(/<cols[\s\S]*?<\/cols>/);
  if (!colsMatch) {
    console.warn('Template <cols> section not found, skip fix');
    return generatedBuffer;
  }
  const tplCols = colsMatch[0];

  // 生成された xlsx を zip として開く
  const genZip = await JSZip.loadAsync(generatedBuffer);

  // 各シートの sheet*.xml を順番に処理
  const sheetFiles = Object.keys(genZip.files).filter(
    name => name.match(/^xl\/worksheets\/sheet\d+\.xml$/)
  );

  for (const sheetFile of sheetFiles) {
    let sheetXml = await genZip.file(sheetFile).async('string');

    // 既存の <cols>...</cols> セクションをテンプレートのもので置換
    if (sheetXml.match(/<cols[\s\S]*?<\/cols>/)) {
      sheetXml = sheetXml.replace(/<cols[\s\S]*?<\/cols>/, tplCols);
    } else {
      // <cols> がない場合は <sheetData> の前に挿入
      sheetXml = sheetXml.replace('<sheetData', tplCols + '<sheetData');
    }

    // zip に書き戻す
    genZip.file(sheetFile, sheetXml);
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

## ステップ3：TEMPLATES のインポート確認

`fixWorksheetCols` 関数が `TEMPLATES` を参照するため、karteGenerator.js の先頭で TEMPLATES がインポートされていることを確認：

```js
import { TEMPLATES } from '../config/templates.js';
```

すでに使われているので追加不要のはず。

## ステップ4：動作確認

```bash
npm run dev
```

PWA で1樹分のカルテ Excel を生成 → ダウンロード → Excel で開く。

確認ポイント：

- [ ] 「枯枝」「スタブカット」の左カッコが見える
- [ ] 各部位の `□なし■あり（  ）` の表示が崩れていない
- [ ] 「最大被害部の周囲長比率」エリアが正常表示
- [ ] 「次回診断」「次回再診断時期」エリアが正常表示
- [ ] 文字と枠線が重なっていない
- [ ] 元のテンプレートとほぼ同じ見た目

## ステップ5：複数樹のテスト

樹を2〜3本入れてカルテ生成し、**全シートが同じレイアウト**で出力されるか確認。

`fixWorksheetCols` 関数は全シート（sheet1.xml, sheet2.xml, sheet3.xml...）に対してループ処理するので、複数シートでも同じ修正が適用されるはず。

## ステップ6：エラーハンドリング

万が一 `fixWorksheetCols` でエラーが出ても、修正前の buffer でダウンロードを継続するように try/catch を入れる：

```js
let fixedBuffer = buffer;
try {
  fixedBuffer = await fixWorksheetCols(buffer, templateId);
} catch (e) {
  console.warn('Failed to fix worksheet cols, using original buffer:', e);
}
```

これで、もし XML 処理に問題があってもカルテダウンロード自体は失敗しない。

## ステップ7：GitHubへpush

確認OKなら：

```bash
git add .
git commit -m "Fix karte layout: replace cols XML with template's to preserve column styles"
git push
```

Vercel が自動デプロイ。

## 補足：このアプローチの安全性

- ExcelJS が出力する xlsx ファイルの構造は標準的で、`<cols>` セクションの形は決まっている
- テンプレートの `<cols>` をそのまま転載するだけなので、新しい問題を起こしにくい
- もし将来テンプレートが変わっても、テンプレートの `<cols>` から動的に取り出すので追従できる

## 補足：他のXML属性も同じ手法で直せる

将来「行の高さも一部おかしい」「印刷範囲が変」といった問題が出た場合も、同じパターンで `<rows>` や `<printOptions>` を抽出して置換すれば対応可能。

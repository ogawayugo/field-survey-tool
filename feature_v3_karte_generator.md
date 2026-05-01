# 機能追加 v3：カルテ自動生成

このドキュメントは、`field-survey-tool` プロジェクトに「カルテExcel自動生成」機能を追加するための作業指示書です。

PWAで入力したデータを、街路樹診断カルテのテンプレートExcelに直接書き込み、樹の数だけシートが入った完成カルテをダウンロードできるようにします。

---

## 前提

- v2（診断判定欄 + Excel/ZIPエクスポート）が実装済み
- Vite + React + Tailwind 構成、Vercelにデプロイ済み
- `xlsx`、`jszip` ライブラリが既にインストール済み

---

## ステップ1：依存ライブラリの追加

```bash
npm install exceljs
```

`exceljs` は既存の `xlsx` よりも書式維持・画像配置に強く、テンプレート流用に必要。

---

## ステップ2：テンプレートファイルの配置

このディレクトリに含まれる `template_shibuya.xlsx` を、プロジェクトの `public/templates/` 配下に配置：

```
public/
└── templates/
    └── shibuya.xlsx          ← 街路樹診断カルテ様式の白紙テンプレート
```

将来、別自治体・別依頼主のテンプレートを追加できるように、`public/templates/` 配下に複数置ける構造にする。

---

## ステップ3：テンプレート定義の作成

`src/config/templates.js` を新規作成。テンプレートの名前と、データ書込みマップ（PWAの入力フィールド → Excel のセル）を定義する。

```js
// テンプレート定義
// 将来、別の様式を追加する場合はこのリストに追加するだけで対応可能

export const TEMPLATES = {
  shibuya: {
    id: 'shibuya',
    name: '街路樹診断カルテ（渋谷氷川の杜様式）',
    file: '/templates/shibuya.xlsx',
    sheetName: '街路樹診断カルテ様式',
    
    // 基本情報マッピング（PWAキー → セル番地）
    basicInfo: {
      treeNumber: 'G4',
      species: 'E5',
      height: 'Y4',
      girth: 'AF4',
      spread: 'AN4',
      route: 'G3',
      diagnostician: 'X3',
      date: 'AL3',
    },
    
    // セル内チェックボックス（複数選択肢から1つを ■ にする）
    // セル内の文字列の中の `□XXX` を `■XXX` に置換する
    cellCheckboxes: {
      plantingForm: { cell: 'Q5', options: ['単独桝', '植栽帯', '緑地内', 'その他'] },
      stake: { cell: 'AK5', options: ['良好', 'なし', '破損'] },
      vitalitySei: { cell: 'AF7', options: ['１', '２', '３', '４', '５'] },
      vitalityKei: { cell: 'AF8', options: ['１', '２', '３', '４', '５'] },
      vitalityJudgment: { cell: 'H11', options: ['健全か健全に近い', '注意すべき被害が見られる', '著しい被害が見られる', '不健全'] },
      appearanceJudgment: { cell: 'G46', options: ['Ａ', 'Ｂ１', 'Ｂ２', 'Ｃ'] },
    },
    
    // 部位判定マトリクス
    // 行=判定、列=部位
    partJudgmentCells: {
      根元: { A: 'P40', B1: 'P41', B2: 'P42', C: 'P43' },
      幹:   { A: 'Z40', B1: 'Z41', B2: 'Z42', C: 'Z43' },
      大枝: { A: 'AJ40', B1: 'AJ41', B2: 'AJ42', C: 'AJ43' },
    },
    
    // 所見欄
    shoken: {
      cellRange: ['G29', 'G30', 'G31', 'G32', 'G33', 'G34', 'G35'],
      // 現場メモを部位別にパースして各セルに振り分ける
      // パース失敗時は G29 に全部書く
    },
    
    // 判定理由
    judgmentReason: {
      cell: 'F48',
    },
    
    // 特記事項
    specialNotes: {
      cell: 'AW56',
    },
    
    // 写真の配置
    // 樹木全体 = 上枠1つ、クローズアップ = 下3枠
    photoSlots: {
      樹木全体: {
        anchorCell: 'BM13',
        offsetX: 0, offsetY: 0,
        width: 348, height: 358,
        keepAspectRatio: true,
      },
      'クローズアップ1': {
        anchorCell: 'AW37',
        offsetX: 29, offsetY: 18.25,
        width: 167, height: 222.67,
        keepAspectRatio: false,
      },
      'クローズアップ2': {
        anchorCell: 'BK37',
        offsetX: 29, offsetY: 18.25,
        width: 167, height: 222.67,
        keepAspectRatio: false,
      },
      'クローズアップ3': {
        anchorCell: 'BY37',
        offsetX: 29, offsetY: 18.25,
        width: 167, height: 222.67,
        keepAspectRatio: false,
      },
    },
  },
  
  // 将来、別の様式を追加する例：
  // tokyo_metro: {
  //   id: 'tokyo_metro',
  //   name: '東京都建設局様式',
  //   file: '/templates/tokyo_metro.xlsx',
  //   ...
  // },
};

// デフォルトテンプレートID
export const DEFAULT_TEMPLATE_ID = 'shibuya';
```

---

## ステップ4：カルテ生成ロジックの実装

`src/lib/karteGenerator.js` を新規作成：

```js
import ExcelJS from 'exceljs';
import { TEMPLATES } from '../config/templates.js';

// テンプレートを fetch で取得
async function loadTemplate(templateId) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) throw new Error(`Unknown template: ${templateId}`);
  
  const response = await fetch(tpl.file);
  if (!response.ok) throw new Error(`Failed to load template: ${tpl.file}`);
  const buffer = await response.arrayBuffer();
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return { workbook, template: tpl };
}

// 1樹分のシートを作成（テンプレートのシートをコピーしてデータを埋め込む）
async function fillTreeSheet(workbook, templateSheetName, tree, photos, surveyMeta, template) {
  // テンプレートシートをコピー
  const templateSheet = workbook.getWorksheet(templateSheetName);
  if (!templateSheet) throw new Error(`Template sheet not found: ${templateSheetName}`);
  
  // 新しいシート名は樹木番号
  const newSheetName = `${tree.treeNumber || tree.id || '無番号'}`.slice(0, 31); // Excel sheet name max 31 chars
  
  // ExcelJS にはシート複製APIがないため、ワークブックのコピーアプローチを取る
  // 実装方針：
  //   1. テンプレートを毎回ロードしなおす（軽量なので許容）
  //   2. シート名をリネームしてからデータを書き込む
  //   3. 全樹分終わったら、それぞれを1つのworkbookに統合
  
  // ここでは「new sheet を作って中身をテンプレートからコピー」する方法を取る
  // ExcelJS のシート複製: workbook.addWorksheet(name, { properties }) して、
  // テンプレートシートのcells/merges/styleをループでコピー
  
  const newSheet = workbook.addWorksheet(newSheetName);
  
  // ▼ シート複製ロジック ▼
  copyWorksheet(templateSheet, newSheet);
  
  // ▼ データ書き込み ▼
  
  // 基本情報
  for (const [key, cell] of Object.entries(template.basicInfo)) {
    let value = '';
    if (key === 'route') value = surveyMeta.route || '';
    else if (key === 'diagnostician') value = surveyMeta.diagnostician || '';
    else if (key === 'date') value = formatDate(surveyMeta.date);
    else value = tree[key] || '';
    
    if (value !== '') {
      newSheet.getCell(cell).value = value;
    }
  }
  
  // セル内チェックボックス
  for (const [key, def] of Object.entries(template.cellCheckboxes)) {
    let selectedValue = '';
    if (key === 'plantingForm') selectedValue = tree.plantingForm;
    else if (key === 'stake') selectedValue = tree.stake;
    else if (key === 'vitalitySei') selectedValue = mapToFullWidth(tree.vitalitySei);
    else if (key === 'vitalityKei') selectedValue = mapToFullWidth(tree.vitalityKei);
    else if (key === 'vitalityJudgment') selectedValue = mapJudgmentToLabel(tree.vitalityJudgment);
    else if (key === 'appearanceJudgment') selectedValue = mapJudgmentToFullWidth(tree.appearanceJudgment);
    
    if (selectedValue) {
      const cell = newSheet.getCell(def.cell);
      const original = cell.value || '';
      const updated = updateCellCheckbox(String(original), def.options, selectedValue);
      cell.value = updated;
    }
  }
  
  // 部位判定
  if (tree.partJudgments) {
    for (const [part, judgment] of Object.entries(tree.partJudgments)) {
      if (!judgment) continue;
      const partMap = template.partJudgmentCells[part];
      if (!partMap) continue;
      const cellAddr = partMap[judgment];
      if (!cellAddr) continue;
      const cell = newSheet.getCell(cellAddr);
      const original = String(cell.value || '');
      cell.value = original.replace('□', '■');
    }
  }
  
  // 所見欄（現場メモを部位別パース）
  const shokenLines = parseShokenLines(tree.memo);
  template.shoken.cellRange.forEach((cellAddr, i) => {
    if (i < shokenLines.length) {
      newSheet.getCell(cellAddr).value = shokenLines[i];
    }
  });
  
  // 写真配置
  await embedPhotos(workbook, newSheet, photos, template.photoSlots);
  
  return newSheet;
}

// 半角→全角変換
function mapToFullWidth(s) {
  if (!s) return '';
  return String(s).replace(/[1-5]/g, ch => '１２３４５'[parseInt(ch, 10) - 1]);
}

// A/B1/B2/C を全角に
function mapJudgmentToFullWidth(j) {
  const map = { 'A': 'Ａ', 'B1': 'Ｂ１', 'B2': 'Ｂ２', 'C': 'Ｃ' };
  return map[j] || '';
}

// A/B1/B2/C を活力判定の長文ラベルに
function mapJudgmentToLabel(j) {
  const map = {
    'A': '健全か健全に近い',
    'B1': '注意すべき被害が見られる',
    'B2': '著しい被害が見られる',
    'C': '不健全',
  };
  return map[j] || '';
}

// セル内文字列の中の □XXX を ■XXX に置換
function updateCellCheckbox(text, options, selected) {
  if (!options.includes(selected)) return text;
  // まず全部 □ にリセット（誤って ■ になっていないか）
  let result = text;
  // 該当オプションだけ ■ にする
  // 例: "□単独桝　□植栽帯　□緑地内　□その他" → "□単独桝　□植栽帯　■緑地内　□その他"
  const regex = new RegExp(`□(\\s*)${escapeRegex(selected)}`);
  if (regex.test(result)) {
    result = result.replace(regex, `■$1${selected}`);
  } else {
    // 見つからない場合のフォールバック：単純な置換
    result = result.replace(`□${selected}`, `■${selected}`);
  }
  return result;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 現場メモを「根元：」「幹：」「枝：」で改行・並べ替え
function parseShokenLines(memo) {
  if (!memo) return [];
  const lines = memo.split('\n').map(l => l.trim()).filter(l => l);
  
  // 既に「部位：」形式ならそのまま使う
  const hasPrefix = lines.some(l => /^(根元|幹|枝)[：:]/.test(l));
  if (hasPrefix) {
    return lines;
  }
  
  // 部位を推定して並べ替え
  const buckets = { 根元: [], 幹: [], 枝: [], その他: [] };
  for (const line of lines) {
    if (/(根元|地際|根の|根が|露出根|踏圧|深植|盛土|堅密|巻き根|ルートカラー)/.test(line)) {
      buckets.根元.push(line);
    } else if (/(幹|主幹|樹皮|傾斜|打診|H\/D|HD比|カミキリ|ベッコウタケ|空洞)/.test(line)) {
      buckets.幹.push(line);
    } else if (/(枝|大枝|小枝|葉|被圧|入皮|かかり枝|スタブ|枯枝)/.test(line)) {
      buckets.枝.push(line);
    } else {
      buckets.その他.push(line);
    }
  }
  
  const result = [];
  if (buckets.根元.length) result.push('根元：' + buckets.根元.join('、'));
  if (buckets.幹.length) result.push('幹：' + buckets.幹.join('、'));
  if (buckets.枝.length) result.push('枝：' + buckets.枝.join('、'));
  if (buckets.その他.length) result.push(...buckets.その他);
  return result;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // "2025-10-02" → "  2025年  10月  2日"
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `　　${m[1]}年　${parseInt(m[2], 10)}月　${parseInt(m[3], 10)}日`;
}

// シート全体をコピー（cells, merges, columns, rows, images）
function copyWorksheet(src, dst) {
  // 列幅
  src.columns.forEach((col, i) => {
    if (col && col.width) {
      dst.getColumn(i + 1).width = col.width;
    }
  });
  
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
}

// 写真の埋め込み
async function embedPhotos(workbook, sheet, photos, slotConfig) {
  for (const photo of photos) {
    const slotName = photo.label;
    if (!slotName) continue; // ラベルがない写真はスキップ
    const slot = slotConfig[slotName];
    if (!slot) continue;
    
    // dataUrl から base64 を取り出し
    const match = photo.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) continue;
    const ext = match[1] === 'jpeg' ? 'jpeg' : match[1];
    const base64 = match[2];
    
    // ExcelJS に画像を追加
    const imageId = workbook.addImage({
      base64,
      extension: ext,
    });
    
    // アンカーセルを E1 など (col, row) に変換
    const anchorRef = sheet.getCell(slot.anchorCell);
    
    sheet.addImage(imageId, {
      tl: {
        col: anchorRef.col - 1,  // 0-indexed
        row: anchorRef.row - 1,
        nativeColOff: ptToEMU(slot.offsetX),
        nativeRowOff: ptToEMU(slot.offsetY),
      },
      ext: {
        width: ptToEMU(slot.width),
        height: ptToEMU(slot.height),
      },
      editAs: 'oneCell',
    });
  }
}

// pt → EMU (English Metric Unit)
function ptToEMU(pt) {
  return Math.round(pt * 12700);
}

// メイン関数：全樹のカルテExcelを生成
export async function generateKarteExcel(trees, surveyMeta, templateId = 'shibuya') {
  const { workbook: tplWb, template } = await loadTemplate(templateId);
  
  // 出力用ワークブックを作る
  const outputWb = new ExcelJS.Workbook();
  outputWb.creator = '街路樹現場調査ツール';
  outputWb.created = new Date();
  
  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    
    // テンプレートを毎回ロードしなおす（シート複製のため）
    const { workbook: freshTpl } = await loadTemplate(templateId);
    const tplSheet = freshTpl.getWorksheet(template.sheetName);
    if (!tplSheet) continue;
    
    // 出力ワークブックに新シートを追加
    const sheetName = `${tree.treeNumber || (i + 1)}`.slice(0, 31);
    const newSheet = outputWb.addWorksheet(sheetName);
    
    // テンプレートシートをコピー
    copyWorksheet(tplSheet, newSheet);
    
    // データ書き込み（fillTreeSheet と同じロジックだが、newSheet にダイレクト）
    
    // 基本情報
    for (const [key, cell] of Object.entries(template.basicInfo)) {
      let value = '';
      if (key === 'route') value = surveyMeta.route || '';
      else if (key === 'diagnostician') value = surveyMeta.diagnostician || '';
      else if (key === 'date') value = formatDate(surveyMeta.date);
      else value = tree[key] || '';
      if (value !== '') newSheet.getCell(cell).value = value;
    }
    
    // セル内チェックボックス
    for (const [key, def] of Object.entries(template.cellCheckboxes)) {
      let selectedValue = '';
      if (key === 'plantingForm') selectedValue = tree.plantingForm;
      else if (key === 'stake') selectedValue = tree.stake;
      else if (key === 'vitalitySei') selectedValue = mapToFullWidth(tree.vitalitySei);
      else if (key === 'vitalityKei') selectedValue = mapToFullWidth(tree.vitalityKei);
      else if (key === 'vitalityJudgment') selectedValue = mapJudgmentToLabel(tree.vitalityJudgment);
      else if (key === 'appearanceJudgment') selectedValue = mapJudgmentToFullWidth(tree.appearanceJudgment);
      
      if (selectedValue) {
        const cell = newSheet.getCell(def.cell);
        const original = cell.value || '';
        cell.value = updateCellCheckbox(String(original), def.options, selectedValue);
      }
    }
    
    // 部位判定
    if (tree.partJudgments) {
      for (const [part, judgment] of Object.entries(tree.partJudgments)) {
        if (!judgment) continue;
        const partMap = template.partJudgmentCells[part];
        if (!partMap) continue;
        const cellAddr = partMap[judgment];
        if (!cellAddr) continue;
        const cell = newSheet.getCell(cellAddr);
        const original = String(cell.value || '');
        cell.value = original.replace('□', '■');
      }
    }
    
    // 所見欄
    const shokenLines = parseShokenLines(tree.memo);
    template.shoken.cellRange.forEach((cellAddr, i) => {
      if (i < shokenLines.length) {
        newSheet.getCell(cellAddr).value = shokenLines[i];
      }
    });
    
    // 写真配置
    await embedPhotos(outputWb, newSheet, tree.photos || [], template.photoSlots);
  }
  
  // ダウンロード
  const buffer = await outputWb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
```

---

## ステップ5：エクスポートモーダルへの追加

`src/components/ExportModal.jsx`（または `App.jsx` 内のモーダル部分）に新しいオプションを追加：

```jsx
import { TreeDeciduous } from 'lucide-react'; // 適当な木のアイコン

// ...

<button onClick={onExportKarte} className="...">
  <TreeDeciduous className="..." />
  <div>
    <div className="font-medium text-sm">カルテ Excel（完成形）</div>
    <div className="text-[11px] text-stone-500 mt-0.5">
      各樹を1シートとして街路樹診断カルテに展開。チェックボックス・所見・写真まで自動配置。重め（数MB〜数十MB）。
    </div>
  </div>
</button>
```

順序は：
1. **カルテ Excel（完成形）** ← 新規・最上位（業務メイン）
2. Excel ファイル（.xlsx）
3. ZIP ファイル（写真込み）
4. JSON ファイル
5. 現在の樹コピー
6. 全部の樹コピー

App.jsx 側でハンドラ追加：

```jsx
import { generateKarteExcel } from './lib/karteGenerator.js';

const handleExportKarte = useCallback(async () => {
  flushAllSaves();
  const fullTrees = await loadAllTreesWithPhotos();
  try {
    await generateKarteExcel(fullTrees, surveyMeta, 'shibuya');
    setShowExport(false);
  } catch (e) {
    alert('カルテ生成に失敗しました: ' + e.message);
    console.error(e);
  }
}, [flushAllSaves, surveyMeta]);
```

---

## ステップ6：（将来用）テンプレート選択UI

今は `'shibuya'` 固定でOKだが、将来増やす場合は：

- 設定モーダルに「使用するテンプレート」のセレクトボックスを追加
- `surveyMeta` に `templateId` を追加
- `generateKarteExcel` 呼び出し時に `surveyMeta.templateId` を渡す

これは v3 のスコープ外、将来追加するメモとして記載。

---

## ステップ7：動作確認

```bash
npm run dev
```

確認ポイント：

- [ ] エクスポートモーダルに「カルテ Excel（完成形）」が一番上に表示される
- [ ] 1本だけ樹を入れた状態で実行 → ダウンロードされる Excel を Excel で開いて確認
- [ ] 樹木番号がシート名になっている
- [ ] 基本情報（樹種、寸法、診断日、樹木医、路線名）が該当セルに入っている
- [ ] チェックボックス（植栽形態、支柱、樹勢、樹形、活力判定、外観診断判定）が ■ に変わっている
- [ ] 部位判定（根元・幹・大枝の3行）も該当箇所が ■
- [ ] 所見欄に部位プレフィックス付きで現場メモが入っている
- [ ] 写真がラベル（樹木全体・クローズアップ1〜3）に従って所定の枠に配置されている
- [ ] 罫線・フォント・列幅が崩れていない
- [ ] 樹を3本くらい入れて実行 → 3シート出力される
- [ ] 写真が多くてもサイズエラーにならない

---

## ステップ8：トラブルシューティング想定

**シート複製でセルスタイルが崩れる**
→ ExcelJS の `style` 引き渡しは deep copy が必要。`JSON.parse(JSON.stringify(cell.style))` で対応済み。

**結合セルが反映されない**
→ `src.model.merges` ループで `dst.mergeCells(...)` を呼ぶが、まれにエラーが出るので try/catch。

**写真の位置がずれる**
→ オフセット pt → EMU の変換係数が `12700` で正しい（1pt = 12700 EMU）。テンプレートのアンカーセルが結合セルの場合、`getCell(addr)` の col/row は左上を返すので正しい位置になるはず。

**ファイルが重すぎてダウンロード失敗**
→ 50樹×4枚＝200枚の写真、約 20-50MB 程度になる想定。ブラウザのメモリ次第ではクラッシュするので、その場合は ZIP圧縮 や 写真画質の追加圧縮で対応。

**所見欄の改行**
→ ExcelJS でセル内改行を出すには `\n` を入れて、セルのスタイルに `wrapText: true` を設定。テンプレートで既に折り返しされているなら不要。

---

## ステップ9：GitHubへpush

```bash
git add .
git commit -m "Add karte Excel auto-generation (v3)"
git push
```

Vercelが自動デプロイ。

---

## 添付ファイル

- `template_shibuya.xlsx`：渋谷氷川の杜の調査票から、街路樹診断カルテ様式シートだけを抜き出した白紙テンプレート
  - これを `public/templates/shibuya.xlsx` に配置すること

---

## 既存コードへの影響

- 既存のExcelエクスポート、ZIPエクスポート、JSONエクスポートは**そのまま残す**。「カルテExcel」は追加機能。
- 判定欄のデータ構造は v2 で確定したものをそのまま使う。

---

## 完了条件

- [ ] `npm run dev` で動作する
- [ ] 「カルテExcel」ボタンを押すと、テンプレート様式の Excel がダウンロードされる
- [ ] 樹の数だけシートが生成される
- [ ] 基本情報・チェックボックス・部位判定・所見・写真がすべて反映されている
- [ ] テンプレートの罫線・フォント・列幅が維持されている
- [ ] GitHub に push、Vercel に自動デプロイ済み

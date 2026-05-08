import ExcelJS from 'exceljs';
import JSZip from 'jszip';
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
  let result = text;
  const regex = new RegExp(`□(\\s*)${escapeRegex(selected)}`);
  if (regex.test(result)) {
    result = result.replace(regex, `■$1${selected}`);
  } else {
    result = result.replace(`□${selected}`, `■${selected}`);
  }
  return result;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 標準的な診断項目名のリスト
const KNOWN_ITEMS = [
  '樹皮枯死・欠損・腐朽',
  '開口空洞',
  '開口空洞（芯達）',
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

// メモから部位ごとの診断項目リストを抽出
function parseDiagnosisFromMemo(memo) {
  const result = { 根元: [], 幹: [], 大枝: [] };
  if (!memo) return result;
  const lines = memo.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(根元|幹|大枝)[:：](.*)/);
    if (match) {
      const part = match[1];
      const rest = match[2];
      const items = rest.split(/[、,]/).map(s => s.trim()).filter(s => s);
      const cleanItems = items.map(s => extractItemName(s)).filter(s => s);
      result[part].push(...cleanItems);
    }
  }
  return result;
}

// 項目名と寸法が混ざった文字列から項目名部分だけを取り出す
function extractItemName(s) {
  for (const item of KNOWN_ITEMS) {
    if (s === item) return item;
  }
  for (const item of KNOWN_ITEMS) {
    if (s.startsWith(item)) return item;
  }
  return '';
}

// 部位×項目の該当セル番地を返す
function findDiagnosisCell(part, item) {
  // 行13-15（3択: なし/1/3未満/1/3以上）は自動チェック対象外
  const SKIP_ITEMS = ['樹皮枯死・欠損・腐朽', '開口空洞', '開口空洞（芯達）'];
  if (SKIP_ITEMS.includes(item)) return null;

  const partColumns = { 根元: 'M', 幹: 'X', 大枝: 'AI' };
  const diagnosisRows = {
    'キノコ（子実体）': 18,
    '木槌打診異常': 19,
    '分岐部・付根の異常': 20,
    '胴枯れなどの病害': 21,
    '虫穴・虫フン・ヤニ': 22,
    '根元の揺らぎ': 23,
    '鋼棒貫入異常': 24,
    '巻き根': 25,
    'ルートカラー見えない': 26,
    '露出根被害': 27,
    '不自然な傾斜': 28,
    '枯枝': 16,
    'スタブカット': 17,
  };

  // 枯枝・スタブカットは大枝のみ、チェックボックスは AL列
  if (item === '枯枝' || item === 'スタブカット') {
    if (part !== '大枝') return null;
    return `AL${diagnosisRows[item]}`;
  }

  // 根元のみの項目
  const rootOnly = ['根元の揺らぎ', '鋼棒貫入異常', '巻き根', 'ルートカラー見えない', '露出根被害', '不自然な傾斜'];
  if (rootOnly.includes(item) && part !== '根元') return null;

  const row = diagnosisRows[item];
  const col = partColumns[part];
  if (!row || !col) return null;
  return `${col}${row}`;
}

// 部位診断チェックボックスを書き込む
// メモに出現した項目のみ □あり → ■あり に。出現しない項目は一切触らない。
function applyDiagnosisChecks(sheet, tree) {
  const memo = tree.memo || '';
  if (!memo) return;

  const partItems = parseDiagnosisFromMemo(memo);

  for (const [part, items] of Object.entries(partItems)) {
    for (const item of items) {
      const cellAddr = findDiagnosisCell(part, item);
      if (!cellAddr) continue;

      const cell = sheet.getCell(cellAddr);
      const original = String(cell.value || '');

      if (item === 'ルートカラー見えない') {
        cell.value = original.replace(/□見えない/, '■見えない');
      } else {
        const updated = original.replace(/□あり/, '■あり');
        if (updated !== original) cell.value = updated;
      }
    }
  }
}

// メモを部位別に整理して所見欄テキストを組み立てる
function formatShokenForKarte(memo) {
  if (!memo) return '';
  const buckets = { 根元: [], 幹: [], 大枝: [] };
  const free = [];
  const lines = memo.split('\n').map(l => l.trim()).filter(l => l);

  for (const line of lines) {
    const match = line.match(/^(根元|幹|大枝|枝)[:：](.*)/);
    if (match) {
      let part = match[1];
      if (part === '枝') part = '大枝';
      const content = match[2].trim();
      if (content) buckets[part].push(content);
    } else {
      free.push(line);
    }
  }

  const result = [];
  if (buckets.根元.length) result.push(`根元：${buckets.根元.join('、')}`);
  if (buckets.幹.length) result.push(`幹：${buckets.幹.join('、')}`);
  if (buckets.大枝.length) result.push(`枝：${buckets.大枝.join('、')}`);
  if (free.length) result.push(...free);
  return result.join('\n');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `　　${m[1]}年　${parseInt(m[2], 10)}月　${parseInt(m[3], 10)}日`;
}

// テンプレート（shibuya.xlsx）の全定義列幅をハードコード
// openpyxl で template_shibuya.xlsx を解析して取得した実値
// ExcelJS では値のない列の width が undefined になるため、ここで保証する
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

// シート全体をコピー（cells, merges, columns, rows）
function copyWorksheet(src, dst) {
  // 1) 列幅 — まず ExcelJS の走査でコピー
  const lastCol = src.actualColumnCount || src.columnCount || 100;
  for (let i = 1; i <= lastCol; i++) {
    const srcCol = src.getColumn(i);
    if (srcCol && srcCol.width !== undefined && srcCol.width !== null && srcCol.width > 0) {
      dst.getColumn(i).width = srcCol.width;
    }
    if (srcCol && srcCol.hidden) {
      dst.getColumn(i).hidden = srcCol.hidden;
    }
  }
  // 2) ハードコード値を最終適用（ExcelJS で取得漏れする列を確実に上書き）
  for (const [colLetter, width] of Object.entries(SHIBUYA_TEMPLATE_COLUMN_WIDTHS)) {
    dst.getColumn(colLetter).width = width;
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

// 写真の埋め込み
async function embedPhotos(workbook, sheet, photos, slotConfig) {
  for (const photo of photos) {
    const slotName = photo.label;
    if (!slotName) continue;
    const slot = slotConfig[slotName];
    if (!slot) continue;

    if (!photo.dataUrl) continue;
    const match = photo.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (!match) continue;
    const ext = match[1] === 'jpeg' ? 'jpeg' : match[1];
    const base64 = match[2];

    const imageId = workbook.addImage({
      base64,
      extension: ext,
    });

    const anchorRef = sheet.getCell(slot.anchorCell);

    sheet.addImage(imageId, {
      tl: { col: anchorRef.col - 1, row: anchorRef.row - 1 },
      ext: { width: slot.width, height: slot.height },
    });
  }
}

// メイン関数：全樹のカルテExcelを生成
export async function generateKarteExcel(trees, surveyMeta, templateId = 'shibuya') {
  const { template } = await loadTemplate(templateId);

  const outputWb = new ExcelJS.Workbook();
  outputWb.creator = '街路樹現場調査ツール';
  outputWb.created = new Date();

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];

    // テンプレートを毎回ロードしなおす（シート複製のため）
    const { workbook: freshTpl } = await loadTemplate(templateId);
    const tplSheet = freshTpl.getWorksheet(template.sheetName);
    if (!tplSheet) continue;

    const sheetName = `${tree.treeNumber || (i + 1)}`.slice(0, 31);
    const newSheet = outputWb.addWorksheet(sheetName);

    // テンプレートシートをコピー
    copyWorksheet(tplSheet, newSheet);

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

    // 診断項目チェックボックス — メモに出現する項目のみ ■あり に、それ以外は触らない
    applyDiagnosisChecks(newSheet, tree);

    // 所見欄（G29:AS38 は1つの結合セル → 部位別に整形して書き込む）
    const shokenText = formatShokenForKarte(tree.memo);
    if (shokenText) {
      const shokenCell = newSheet.getCell(template.shoken.cell);
      shokenCell.value = shokenText;
      shokenCell.alignment = { ...shokenCell.alignment, wrapText: true, vertical: 'top' };
    }

    // 写真配置
    await embedPhotos(outputWb, newSheet, tree.photos || [], template.photoSlots);
  }

  // ExcelJS で buffer を生成
  const buffer = await outputWb.xlsx.writeBuffer();

  // XML 直接編集で列定義をテンプレートと同一にする
  let fixedBuffer = buffer;
  try {
    fixedBuffer = await fixWorksheetCols(buffer, templateId);
  } catch (e) {
    console.warn('Failed to fix worksheet cols, using original buffer:', e);
  }

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
 * 生成された xlsx の XML をテンプレートのもので置換する。
 * 1) xl/styles.xml — スタイル定義を完全置換（フォント・罫線・配置・塗りつぶし）
 * 2) xl/theme/theme1.xml — テーマフォント・テーマカラーを統一
 * 3) 各シートの <cols> セクション — 列幅・列スタイルをテンプレート通りに
 */
async function fixWorksheetCols(generatedBuffer, templateId) {
  console.log('[fixWorksheetCols] START');
  try {
    console.log('[fixWorksheetCols] Loading template:', TEMPLATES[templateId].file);
    const tplResponse = await fetch(TEMPLATES[templateId].file);
    console.log('[fixWorksheetCols] Template response status:', tplResponse.status);

    const tplArrayBuffer = await tplResponse.arrayBuffer();
    console.log('[fixWorksheetCols] Template buffer size:', tplArrayBuffer.byteLength);

    const tplZip = await JSZip.loadAsync(tplArrayBuffer);
    const genZip = await JSZip.loadAsync(generatedBuffer);
    console.log('[fixWorksheetCols] Both zips loaded');

    // 1) styles.xml の置換
    const tplStylesFile = tplZip.file('xl/styles.xml');
    if (!tplStylesFile) {
      console.warn('[fixWorksheetCols] Template styles.xml NOT FOUND');
    } else {
      const tplStylesXml = await tplStylesFile.async('string');
      console.log('[fixWorksheetCols] Template styles.xml size:', tplStylesXml.length);
      genZip.file('xl/styles.xml', tplStylesXml);
      console.log('[fixWorksheetCols] styles.xml REPLACED');
    }

    // 2) <cols> セクションの置換
    const tplSheetFile = tplZip.file('xl/worksheets/sheet1.xml');
    if (!tplSheetFile) {
      console.warn('[fixWorksheetCols] Template sheet1.xml NOT FOUND');
    } else {
      const tplSheetXml = await tplSheetFile.async('string');
      console.log('[fixWorksheetCols] Template sheet1.xml size:', tplSheetXml.length);
      const colsMatch = tplSheetXml.match(/<cols[\s\S]*?<\/cols>/);
      if (!colsMatch) {
        console.warn('[fixWorksheetCols] Template <cols> section NOT FOUND');
      } else {
        const tplCols = colsMatch[0];
        console.log('[fixWorksheetCols] Template <cols> size:', tplCols.length);

        const sheetFiles = Object.keys(genZip.files).filter(
          name => name.match(/^xl\/worksheets\/sheet\d+\.xml$/)
        );
        console.log('[fixWorksheetCols] Generated sheet files:', sheetFiles);

        for (const sheetFile of sheetFiles) {
          let sheetXml = await genZip.file(sheetFile).async('string');
          const hadCols = !!sheetXml.match(/<cols[\s\S]*?<\/cols>/);

          if (hadCols) {
            sheetXml = sheetXml.replace(/<cols[\s\S]*?<\/cols>/, tplCols);
          } else {
            sheetXml = sheetXml.replace('<sheetData', tplCols + '<sheetData');
          }

          genZip.file(sheetFile, sheetXml);
          console.log(`[fixWorksheetCols] ${sheetFile}: cols ${hadCols ? 'REPLACED' : 'INSERTED'}`);
        }
      }
    }

    // 3) theme1.xml の置換
    const tplThemeFile = tplZip.file('xl/theme/theme1.xml');
    if (!tplThemeFile) {
      console.warn('[fixWorksheetCols] Template theme1.xml NOT FOUND');
    } else {
      const tplTheme = await tplThemeFile.async('string');
      console.log('[fixWorksheetCols] Template theme1.xml size:', tplTheme.length);
      genZip.file('xl/theme/theme1.xml', tplTheme);
      console.log('[fixWorksheetCols] theme1.xml REPLACED');
    }

    // ZIP 書き出し
    console.log('[fixWorksheetCols] Generating new zip...');
    const fixedBuffer = await genZip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    console.log('[fixWorksheetCols] New zip size:', fixedBuffer.byteLength);
    console.log('[fixWorksheetCols] DONE');
    return fixedBuffer;
  } catch (e) {
    console.error('[fixWorksheetCols] ERROR:', e);
    throw e;
  }
}

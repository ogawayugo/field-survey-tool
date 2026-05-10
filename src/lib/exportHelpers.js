import { storage } from './storage';
import { STORAGE } from '../config/constants';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export const formatTreeText = (meta, photos, surveyMeta) => {
  const lines = [
    `=== 樹木番号 ${meta.treeNumber || '(未記入)'} ===`,
    `路線: ${surveyMeta.route || ''}`,
    `事務所: ${surveyMeta.office || ''}`,
    `診断日: ${surveyMeta.date || ''}`,
    `樹木医: ${surveyMeta.diagnostician || ''}`,
    ``,
    `樹種: ${meta.species}`,
    `樹高: ${meta.height}m / 幹周: ${meta.girth}㎝ / 枝張: ${meta.spread}m`,
    `植栽形態: ${meta.plantingForm} / 支柱: ${meta.stake}`,
    `樹勢: ${meta.vitalitySei} / 樹形: ${meta.vitalityKei}`,
    `活力判定: ${meta.vitalityJudgment || ''} / 外観診断判定: ${meta.appearanceJudgment || ''} / 総合判定: ${meta.overallJudgment || ''}`,
    `部位判定: 根元=${meta.partJudgments?.根元 || ''} 幹=${meta.partJudgments?.幹 || ''} 大枝=${meta.partJudgments?.大枝 || ''}`,
    `活力判定理由: ${meta.vitalityReason || ''}`,
    `外観診断判定理由: ${meta.appearanceReason || ''}`,
    `総合判定理由: ${meta.overallReason || ''}`,
    `特記事項: ${meta.specialNotes || ''}`,
    ``,
    `【現場メモ】`,
    meta.memo || '',
    ``,
    `写真: ${(meta.photoIds || []).length}枚`,
  ];
  if (photos && photos.length) {
    photos.forEach((p, i) => {
      const parts = [];
      if (p.caption) parts.push(p.caption);
      if (p.label) parts.push(`[${p.label}]`);
      lines.push(`  ${i + 1}. ${parts.join(' ') || '(無題)'}`);
    });
  }
  return lines.join('\n');
};

export async function loadAllTreesWithPhotos(treeIds, allMeta, loadedPhotos) {
  const fullTrees = [];
  for (const id of treeIds) {
    const meta = allMeta[id];
    if (!meta) continue;
    let photos = loadedPhotos[id];
    if (!photos) {
      photos = [];
      for (const pid of (meta.photoIds || [])) {
        try {
          const r = await storage.get(STORAGE.treePhoto(id, pid));
          if (r) photos.push(JSON.parse(r.value));
        } catch {}
      }
    }
    fullTrees.push({ ...meta, photos });
  }
  return fullTrees;
}

export const exportJSON = async (treeIds, allMeta, loadedPhotos, surveyMeta) => {
  const fullTrees = await loadAllTreesWithPhotos(treeIds, allMeta, loadedPhotos);
  const data = { surveyMeta, trees: fullTrees, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = (surveyMeta.date || new Date().toISOString().split('T')[0]).replace(/[/:]/g, '-');
  a.download = `survey_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ---- Excel / ZIP エクスポート ----

function treeToRow(meta, photos, surveyMeta) {
  return {
    '路線名': surveyMeta.route || '',
    '事務所': surveyMeta.office || '',
    '診断日': surveyMeta.date || '',
    '樹木医': surveyMeta.diagnostician || '',
    '樹木番号': meta.treeNumber || '',
    '樹種': meta.species || '',
    '樹高(m)': meta.height || '',
    '幹周(㎝)': meta.girth || '',
    '枝張(m)': meta.spread || '',
    '植栽形態': meta.plantingForm || '',
    '支柱': meta.stake || '',
    '樹勢': meta.vitalitySei || '',
    '樹形': meta.vitalityKei || '',
    '活力判定': meta.vitalityJudgment || '',
    '部位判定_根元': meta.partJudgments?.根元 || '',
    '部位判定_幹': meta.partJudgments?.幹 || '',
    '部位判定_大枝': meta.partJudgments?.大枝 || '',
    '外観診断判定': meta.appearanceJudgment || '',
    '総合判定': meta.overallJudgment || '',
    '活力判定理由': meta.vitalityReason || '',
    '外観診断判定理由': meta.appearanceReason || '',
    '総合判定理由': meta.overallReason || '',
    '特記事項': meta.specialNotes || '',
    '現場メモ': meta.memo || '',
    '写真枚数': (photos || []).length,
    '写真情報': (photos || []).map((p, i) => {
      const parts = [];
      if (p.caption) parts.push(p.caption);
      if (p.label) parts.push(`[${p.label}]`);
      return `${i + 1}. ${parts.join(' ') || '(無題)'}`;
    }).join(' / '),
  };
}

function makePhotoFileName(tree, index, photo) {
  const num = tree.treeNumber || 'unknown';
  const sp = (tree.species || '').slice(0, 10);
  const folder = `${num}_${sp}`;
  const cap = photo.caption ? `_${photo.caption.slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}` : '';
  return `${folder}/${String(index + 1).padStart(2, '0')}${cap}.jpg`;
}

function photoSheetRows(trees) {
  const rows = [];
  for (const t of trees) {
    const photos = t.photos || [];
    photos.forEach((p, i) => {
      rows.push({
        '樹木番号': t.treeNumber || '',
        '樹種': t.species || '',
        '写真番号': i + 1,
        'ファイル名（ZIP内）': makePhotoFileName(t, i, p),
        'キャプション': p.caption || '',
        'カルテ枠': p.label || '',
      });
    });
  }
  return rows;
}

function buildWorkbook(trees, surveyMeta) {
  const wb = XLSX.utils.book_new();

  const mainRows = trees.map(t => treeToRow(t, t.photos || [], surveyMeta));
  const mainSheet = XLSX.utils.json_to_sheet(mainRows);

  const colWidths = Object.keys(mainRows[0] || {}).map(key => ({
    wch: Math.max(key.length * 2, 12)
  }));
  mainSheet['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, mainSheet, '調査結果');

  const photoRows = photoSheetRows(trees);
  if (photoRows.length > 0) {
    const photoSheet = XLSX.utils.json_to_sheet(photoRows);
    photoSheet['!cols'] = [
      { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 50 }, { wch: 30 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, photoSheet, '写真情報');
  }

  return wb;
}

export async function exportXLSX(trees, surveyMeta) {
  const wb = buildWorkbook(trees, surveyMeta);
  const dateStr = (surveyMeta.date || new Date().toISOString().split('T')[0]).replace(/[/:]/g, '-');
  XLSX.writeFile(wb, `survey_${dateStr}.xlsx`);
}

export async function exportZIP(trees, surveyMeta) {
  const zip = new JSZip();

  const wb = buildWorkbook(trees, surveyMeta);
  const wbBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  zip.file('survey.xlsx', wbBuffer);

  const photosFolder = zip.folder('photos');
  for (const t of trees) {
    const photos = t.photos || [];
    photos.forEach((p, i) => {
      if (!p.dataUrl) return;
      const match = p.dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (!match) return;
      const base64 = match[1];
      const fileName = makePhotoFileName(t, i, p);
      photosFolder.file(fileName, base64, { base64: true });
    });
  }

  const readme = [
    '街路樹現場調査 エクスポートデータ',
    '',
    `エクスポート日時: ${new Date().toLocaleString('ja-JP')}`,
    `路線: ${surveyMeta.route || ''}`,
    `診断日: ${surveyMeta.date || ''}`,
    `樹木医: ${surveyMeta.diagnostician || ''}`,
    `樹木数: ${trees.length}本`,
    `写真総数: ${trees.reduce((s, t) => s + (t.photos?.length || 0), 0)}枚`,
    '',
    '【ファイル構成】',
    '- survey.xlsx ... 調査結果のExcelファイル（メインシート + 写真情報シート）',
    '- photos/ ... 樹木ごとの写真フォルダ',
    '',
    '【使い方】',
    'survey.xlsx をExcelで開いてください。',
    'Claude in Excel で診断カルテに展開する場合、',
    'survey.xlsx と photos/ フォルダを Claude in Excel にアップロードして、',
    '「カルテに展開して」と指示してください。',
  ].join('\n');
  zip.file('README.txt', readme);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = (surveyMeta.date || new Date().toISOString().split('T')[0]).replace(/[/:]/g, '-');
  a.download = `survey_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

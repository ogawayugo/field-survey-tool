import { storage } from './storage';
import { STORAGE } from '../config/constants';

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

export const exportJSON = async (treeIds, allMeta, loadedPhotos, surveyMeta) => {
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

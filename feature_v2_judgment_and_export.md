# 機能追加 v2：診断判定欄 + Excel/ZIPエクスポート

このドキュメントは、既存の `field-survey-tool` プロジェクトに以下の2つの機能を追加するための指示書です。

1. 活力判定・部位判定・外観診断判定の入力欄
2. Excel（.xlsx）と ZIP（Excel + 写真フォルダ）でのエクスポート

---

## 前提

- すでに Vite + React + Tailwind の構成で動作している
- `src/App.jsx` がメインコンポーネント
- `src/config/constants.js`、`src/lib/storage.js`、`src/lib/exportHelpers.js`、`src/components/` に分割済み
- `idb-keyval` でデータ永続化済み

---

## ステップ1：依存ライブラリの追加

```bash
npm install xlsx jszip
```

---

## ステップ2：定数の追加

`src/config/constants.js` に以下を追加：

```js
// 判定値
export const JUDGMENT_LEVELS = ['A', 'B1', 'B2', 'C'];

// 判定値の説明（UI表示用）
export const JUDGMENT_LABELS = {
  A: '健全か健全に近い',
  B1: '注意すべき被害',
  B2: '著しい被害',
  C: '不健全',
};

// 判定値の色（バッジ表示用）
export const JUDGMENT_COLORS = {
  A: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-700' },
  B1: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-700' },
  B2: { bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-700' },
  C: { bg: 'bg-red-50', text: 'text-red-900', border: 'border-red-700' },
};

// 部位
export const TREE_PARTS = ['根元', '幹', '大枝'];
```

---

## ステップ3：データモデルの拡張

`src/config/constants.js`（または該当箇所）の `emptyMeta` 関数を拡張：

```js
export const emptyMeta = (id) => ({
  id,
  treeNumber: '',
  species: '',
  height: '',
  girth: '',
  spread: '',
  plantingForm: '',
  stake: '',
  vitalitySei: '',
  vitalityKei: '',
  memo: '',
  photoIds: [],
  // ▼ 新規追加
  vitalityJudgment: '',         // A / B1 / B2 / C
  partJudgments: {              // 部位ごとの判定
    根元: '',
    幹: '',
    大枝: '',
  },
  appearanceJudgment: '',       // 外観診断判定 A / B1 / B2 / C
  // ▲
  createdAt: new Date().toISOString(),
});
```

**重要**：旧データとの互換性のため、データ読込時に新フィールドが存在しない場合のデフォルト値補完を入れる。`loadOrMigrateMeta` 関数の最後（return直前）に：

```js
// 新フィールドのデフォルト補完
if (meta.vitalityJudgment === undefined) meta.vitalityJudgment = '';
if (!meta.partJudgments) meta.partJudgments = { 根元: '', 幹: '', 大枝: '' };
if (meta.appearanceJudgment === undefined) meta.appearanceJudgment = '';
```

---

## ステップ4：JudgmentPanel コンポーネント新規作成

`src/components/JudgmentPanel.jsx` を新規作成：

```jsx
import React, { memo } from 'react';
import { JUDGMENT_LEVELS, JUDGMENT_LABELS, JUDGMENT_COLORS, TREE_PARTS } from '../config/constants.js';

const JudgmentButton = memo(function JudgmentButton({ value, current, onChange, compact }) {
  const isActive = value === current;
  const colors = JUDGMENT_COLORS[value];
  return (
    <button
      onClick={() => onChange(isActive ? '' : value)}
      className={`${compact ? 'py-1.5 px-2' : 'py-2 px-3'} text-xs border transition-colors ${
        isActive
          ? `${colors.bg} ${colors.text} ${colors.border} border-2 font-medium`
          : 'bg-white text-stone-700 border-stone-300 hover:border-emerald-700'
      }`}
      title={JUDGMENT_LABELS[value]}
    >
      {value}
    </button>
  );
});

const JudgmentRow = memo(function JudgmentRow({ label, value, onChange, compact }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-stone-600 w-12 flex-shrink-0">{label}</span>
      <div className="grid grid-cols-4 gap-1 flex-1">
        {JUDGMENT_LEVELS.map(level => (
          <JudgmentButton key={level} value={level} current={value} onChange={onChange} compact={compact} />
        ))}
      </div>
    </div>
  );
});

const JudgmentPanel = memo(function JudgmentPanel({ meta, onChange }) {
  const updatePart = (part, value) => {
    onChange({
      partJudgments: { ...meta.partJudgments, [part]: value }
    });
  };

  return (
    <div className="space-y-4">
      {/* 活力判定 */}
      <div>
        <p className="text-[11px] text-stone-600 mb-2">活力判定</p>
        <div className="grid grid-cols-4 gap-1">
          {JUDGMENT_LEVELS.map(level => (
            <JudgmentButton
              key={level}
              value={level}
              current={meta.vitalityJudgment}
              onChange={v => onChange({ vitalityJudgment: v })}
            />
          ))}
        </div>
      </div>

      {/* 部位判定 */}
      <div>
        <p className="text-[11px] text-stone-600 mb-2">部位判定</p>
        <div className="space-y-2">
          {TREE_PARTS.map(part => (
            <JudgmentRow
              key={part}
              label={part}
              value={meta.partJudgments?.[part] || ''}
              onChange={v => updatePart(part, v)}
              compact
            />
          ))}
        </div>
      </div>

      {/* 外観診断判定 */}
      <div>
        <p className="text-[11px] text-stone-600 mb-2">外観診断判定</p>
        <div className="grid grid-cols-4 gap-1">
          {JUDGMENT_LEVELS.map(level => (
            <JudgmentButton
              key={level}
              value={level}
              current={meta.appearanceJudgment}
              onChange={v => onChange({ appearanceJudgment: v })}
            />
          ))}
        </div>
      </div>

      {/* 凡例 */}
      <div className="text-[10px] text-stone-500 leading-relaxed pt-2 border-t border-stone-200">
        A：健全か健全に近い／B1：注意すべき被害／B2：著しい被害／C：不健全
      </div>
    </div>
  );
});

export default JudgmentPanel;
```

---

## ステップ5：App.jsx に診断パネルを組み込む

`src/App.jsx` の「現場メモ」セクションの下、「写真」セクションの上に新規セクションを挿入：

```jsx
import JudgmentPanel from './components/JudgmentPanel.jsx';

// ... 既存のコード ...

<Section title="診断判定">
  <JudgmentPanel meta={currentMeta} onChange={updateCurrent} />
</Section>
```

「写真」セクションより前に置くことで、現場での記入順（観察→判定→写真記録）に沿った流れになる。

---

## ステップ6：Excel エクスポートの実装

`src/lib/exportHelpers.js` に以下の関数を追加：

```js
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

// 樹データを Excel 用の行データに変換
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

// 写真情報シート用のデータ
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

function makePhotoFileName(tree, index, photo) {
  const num = tree.treeNumber || 'unknown';
  const sp = (tree.species || '').slice(0, 10);
  const folder = `${num}_${sp}`;
  const cap = photo.caption ? `_${photo.caption.slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}` : '';
  return `${folder}/${String(index + 1).padStart(2, '0')}${cap}.jpg`;
}

// 樹データの配列から workbook を作成
function buildWorkbook(trees, surveyMeta) {
  const wb = XLSX.utils.book_new();
  
  // メインシート
  const mainRows = trees.map(t => treeToRow(t, t.photos || [], surveyMeta));
  const mainSheet = XLSX.utils.json_to_sheet(mainRows);
  
  // 列幅の自動調整
  const colWidths = Object.keys(mainRows[0] || {}).map(key => ({
    wch: Math.max(key.length * 2, 12)
  }));
  mainSheet['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, mainSheet, '調査結果');
  
  // 写真情報シート
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

// Excel単体ダウンロード
export async function exportXLSX(trees, surveyMeta) {
  const wb = buildWorkbook(trees, surveyMeta);
  const dateStr = (surveyMeta.date || new Date().toISOString().split('T')[0]).replace(/[/:]/g, '-');
  XLSX.writeFile(wb, `survey_${dateStr}.xlsx`);
}

// ZIP（Excel + 写真フォルダ）ダウンロード
export async function exportZIP(trees, surveyMeta) {
  const zip = new JSZip();
  
  // Excelをbufferとして生成
  const wb = buildWorkbook(trees, surveyMeta);
  const wbBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  zip.file('survey.xlsx', wbBuffer);
  
  // 写真フォルダ
  const photosFolder = zip.folder('photos');
  for (const t of trees) {
    const photos = t.photos || [];
    photos.forEach((p, i) => {
      if (!p.dataUrl) return;
      // dataUrl から base64 部分を取り出し
      const match = p.dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (!match) return;
      const base64 = match[1];
      const fileName = makePhotoFileName(t, i, p);
      photosFolder.file(fileName, base64, { base64: true });
    });
  }
  
  // README.txt を ZIP 内に同梱（使い方の説明）
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
  
  // ZIP生成
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
```

---

## ステップ7：エクスポートモーダルの拡張

`src/components/ExportModal.jsx`（または `App.jsx` 内のモーダル部分）に、新しい選択肢を2つ追加。既存のモーダル構造に倣って：

```jsx
{/* Excel 単体（推奨・最初に表示） */}
<button onClick={onExportXLSX} className="...">
  <FileSpreadsheet className="..." />  {/* lucide-react から import */}
  <div>
    <div>Excel ファイル（.xlsx）</div>
    <div>調査結果を Excel で。Claude in Excel に直接渡せる。写真は別添付になります。</div>
  </div>
</button>

{/* ZIP（Excel + 写真パッケージ） */}
<button onClick={onExportZIP} className="...">
  <Package className="..." />  {/* lucide-react から import */}
  <div>
    <div>ZIP ファイル（写真込み）</div>
    <div>Excel + 写真フォルダの一式パッケージ。PCで解凍するとそのままClaude in Excelに渡せます。</div>
  </div>
</button>

{/* JSON（既存） */}
{/* 現在の樹コピー（既存） */}
{/* 全樹コピー（既存） */}
```

並び順は **Excel → ZIP → JSON → 現在コピー → 全コピー** にする。Excel と ZIP が業務メイン用途、JSON 以下は補助。

App.jsx 側でハンドラを追加：

```jsx
import { exportXLSX, exportZIP } from './lib/exportHelpers.js';

const handleExportXLSX = useCallback(async () => {
  flushAllSaves();
  const fullTrees = await loadAllTreesWithPhotos();
  await exportXLSX(fullTrees, surveyMeta);
  setShowExport(false);
}, [flushAllSaves, surveyMeta]);

const handleExportZIP = useCallback(async () => {
  flushAllSaves();
  const fullTrees = await loadAllTreesWithPhotos();
  await exportZIP(fullTrees, surveyMeta);
  setShowExport(false);
}, [flushAllSaves, surveyMeta]);

// 全樹データを写真込みで読み込むヘルパー（既存の exportJSON のロジックから流用）
async function loadAllTreesWithPhotos() {
  const fullTrees = [];
  for (const id of treeIdsRef.current) {
    const meta = allMetaRef.current[id];
    if (!meta) continue;
    let photos = loadedPhotosRef.current[id];
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
```

`exportJSON` も同じ `loadAllTreesWithPhotos` を使うようリファクタリングして DRY に。

---

## ステップ8：動作確認

```bash
npm run dev
```

確認ポイント：

- [ ] 診断判定欄が「現場メモ」と「写真」の間に表示される
- [ ] 活力判定 A/B1/B2/C が選択でき、選択すると色付き
- [ ] 部位判定（根元・幹・大枝）が3行×4列のマトリクスで動く
- [ ] 外観診断判定 A/B1/B2/C が選択できる
- [ ] 入力後リロードしても保持される
- [ ] エクスポートモーダルに「Excel ファイル」「ZIP ファイル」が追加されている
- [ ] Excelダウンロードして開くと、メインシート+写真情報シートが入っている
- [ ] ZIPダウンロードして解凍すると `survey.xlsx`、`photos/`、`README.txt` がある
- [ ] 旧データ（判定欄なし時代のデータ）が新バージョンでもエラーなく開ける

---

## ステップ9：GitHubにプッシュ

```bash
git add .
git commit -m "Add judgment panels (vitality/part/appearance) and Excel/ZIP export"
git push
```

Vercel が自動でデプロイ。1〜2分で本番反映。

---

## 想定される改善（将来）

- 部位判定マトリクスの色分けをもう少し視覚的に（A=緑のセル、C=赤のセル等）
- Excel テンプレートを使った直接書き込み（街路樹診断カルテ.xlsx の様式に合わせる）
- 写真への直接貼付（OneDrive/Google Drive 連携）

---

## 添付ファイルの扱い

このプロジェクトの既存コードを尊重して、最小限の変更で追加すること。既存のデザイントーン（紙のクリーム背景、明朝体見出し、深緑アクセント）は維持。

import { memo } from 'react';
import { X, FileJson, FileSpreadsheet, Package, Copy, Check } from 'lucide-react';
import KarteExportButton from './KarteExportButton';

export default memo(function ExportModal({ treeCount, totalPhotos, copiedFlash, getTreesForKarte, surveyMeta, onExportXLSX, onExportZIP, onExportJSON, onCopyText, onClose }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(40, 30, 20, 0.5)' }}>
      <div className="bg-white border border-stone-300 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b border-stone-200 px-5 py-4 flex items-center justify-between sticky top-0" style={{ background: '#f4ede0' }}>
          <div>
            <h3 className="serif text-lg font-medium">エクスポート</h3>
            <p className="text-[11px] text-stone-500">{treeCount}本 / 写真{totalPhotos}枚</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <KarteExportButton
            getTrees={getTreesForKarte}
            surveyMeta={surveyMeta}
            disabled={treeCount === 0}
            onDone={onClose}
          />

          <button onClick={onExportXLSX} className="w-full p-4 border border-stone-300 hover:border-emerald-700 hover:bg-emerald-50 transition-colors text-left flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">Excel ファイル（.xlsx）</div>
              <div className="text-[11px] text-stone-500 mt-0.5">調査結果を Excel で。Claude in Excel に直接渡せる。写真は別添付になります。</div>
            </div>
          </button>
          <button onClick={onExportZIP} className="w-full p-4 border border-stone-300 hover:border-emerald-700 hover:bg-emerald-50 transition-colors text-left flex items-start gap-3">
            <Package className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">ZIP ファイル（写真込み）</div>
              <div className="text-[11px] text-stone-500 mt-0.5">Excel + 写真フォルダの一式パッケージ。PCで解凍するとそのままClaude in Excelに渡せます。</div>
            </div>
          </button>
          <button onClick={onExportJSON} className="w-full p-4 border border-stone-300 hover:border-emerald-700 hover:bg-emerald-50 transition-colors text-left flex items-start gap-3">
            <FileJson className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">JSON ファイルでダウンロード</div>
              <div className="text-[11px] text-stone-500 mt-0.5">全データ（写真含む）。Claude in Excel に渡してカルテ化する用。</div>
            </div>
          </button>
          <button onClick={() => onCopyText('current')} className="w-full p-4 border border-stone-300 hover:border-emerald-700 hover:bg-emerald-50 transition-colors text-left flex items-start gap-3">
            {copiedFlash === 'current' ? <Check className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" /> : <Copy className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" />}
            <div className="flex-1">
              <div className="font-medium text-sm">{copiedFlash === 'current' ? 'コピーしました' : '今の樹をテキストでコピー'}</div>
              <div className="text-[11px] text-stone-500 mt-0.5">写真を除いた本文のみ。</div>
            </div>
          </button>
          <button onClick={() => onCopyText('all')} className="w-full p-4 border border-stone-300 hover:border-emerald-700 hover:bg-emerald-50 transition-colors text-left flex items-start gap-3">
            {copiedFlash === 'all' ? <Check className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" /> : <Copy className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" />}
            <div className="flex-1">
              <div className="font-medium text-sm">{copiedFlash === 'all' ? 'コピーしました' : '全部の樹をテキストでコピー'}</div>
              <div className="text-[11px] text-stone-500 mt-0.5">{treeCount}本分まとめて。</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
});

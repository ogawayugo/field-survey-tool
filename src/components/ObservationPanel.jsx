import { memo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { extractSummaryWithCache } from '../lib/markerExtractor';

const PART_ORDER = ['根元', '幹', '大枝'];

const PART_COLORS = {
  '根元': '#2563eb',
  '幹': '#16a34a',
  '大枝': '#dc2626',
};

/**
 * 所見欄: マーカー連動リスト + フリーテキスト
 *
 * - 部位ごとにグルーピング表示（根元→幹→大枝）
 * - 各マーカー行に textbox（自由記述）と summary（括弧内）を並べる
 * - textbox 編集時、summaryEdited=false なら summary を自動再抽出
 * - summary 編集時は summaryEdited=true をセット
 * - ↻ ボタンで summary を再抽出して summaryEdited=false に戻す
 * - フリーテキストは memoSupplement に独立保存
 */
function MarkerRow({ marker, onEditMarker }) {
  const color = PART_COLORS[marker.part] || '#6b7280';

  const handleTextChange = useCallback((e) => {
    // 高さ自動調整（最大 ~8行）
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;

    const newText = e.target.value;
    const changes = { text: newText };
    if (!marker.summaryEdited) {
      changes.summary = extractSummaryWithCache(newText, marker.item, marker.part);
    }
    onEditMarker(marker.id, changes);
  }, [marker.id, marker.item, marker.part, marker.summaryEdited, onEditMarker]);

  const handleSummaryChange = useCallback((e) => {
    onEditMarker(marker.id, {
      summary: e.target.value,
      summaryEdited: true,
    });
  }, [marker.id, onEditMarker]);

  const handleReset = useCallback(() => {
    const text = marker.text ?? marker.item ?? '';
    const auto = extractSummaryWithCache(text, marker.item, marker.part);
    onEditMarker(marker.id, {
      summary: auto,
      summaryEdited: false,
    });
  }, [marker.id, marker.item, marker.part, marker.text, onEditMarker]);

  return (
    <div className="flex items-start gap-2 py-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full flex-shrink-0 mt-2"
        style={{ backgroundColor: color }}
      />
      <span
        className="text-[10px] text-stone-500 flex-shrink-0 mt-1.5 px-1.5 py-0.5 rounded border"
        style={{ borderColor: color, color }}
        title="チップ名（部位/項目）"
      >
        {marker.item}
      </span>
      <textarea
        value={marker.text ?? ''}
        onChange={handleTextChange}
        rows={1}
        placeholder="textbox 自由記述"
        ref={(el) => {
          if (el) {
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }
        }}
        className="flex-1 min-w-0 px-2 py-1 border border-stone-300 rounded text-xs focus:outline-none focus:border-emerald-700"
        style={{
          minHeight: 28,
          maxHeight: 160,
          resize: 'none',
          overflowY: 'auto',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.4',
        }}
      />
      <div className="flex items-center flex-shrink-0">
        <span className="text-[11px] text-stone-500 mr-0.5">（</span>
        <input
          type="text"
          value={marker.summary ?? ''}
          onChange={handleSummaryChange}
          placeholder=""
          className="px-1.5 py-1 border rounded text-xs focus:outline-none"
          style={{
            width: 140,
            borderColor: marker.summaryEdited ? '#d97706' : '#d6d3d1',
            backgroundColor: marker.summaryEdited ? '#fff9d6' : 'white',
          }}
          title="括弧内表記（カルテ出力用）"
        />
        <span className="text-[11px] text-stone-500 ml-0.5 mr-1">）</span>
        {marker.summaryEdited && (
          <button
            type="button"
            onClick={handleReset}
            className="px-1 py-1 text-[11px] rounded hover:bg-stone-100 text-amber-700"
            title="自動抽出に戻す"
          >
            <RotateCcw className="w-3 h-3" strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

const ObservationPanel = memo(function ObservationPanel({
  markers = [],
  memoSupplement = '',
  onEditMarker,
  onChangeSupplement,
}) {
  const [isOpen, setIsOpen] = useState(true);

  // 部位ごとにグルーピング（部位内は追加順保持）
  const grouped = {};
  for (const part of PART_ORDER) grouped[part] = [];
  for (const m of markers) {
    if (grouped[m.part]) grouped[m.part].push(m);
  }

  return (
    <div className="border border-stone-300 rounded">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-stone-50 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-stone-600" strokeWidth={2} />
        ) : (
          <ChevronRight className="w-4 h-4 text-stone-600" strokeWidth={2} />
        )}
        <span className="text-sm font-medium text-stone-800">所見</span>
        <span className="text-[11px] text-stone-500">({markers.length}件)</span>
      </button>

      {isOpen && (
        <div className="border-t border-stone-200 p-3 space-y-3">
          {markers.length === 0 ? (
            <p className="text-[11px] text-stone-500 italic">
              写真にマーカーを追加すると、ここに自動で表示されます
            </p>
          ) : (
            PART_ORDER.map(part => {
              const items = grouped[part];
              if (items.length === 0) return null;
              const color = PART_COLORS[part];
              return (
                <div key={part}>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs font-medium text-stone-700">{part}</span>
                    <span className="text-[10px] text-stone-400">({items.length})</span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {items.map(m => (
                      <MarkerRow
                        key={m.id}
                        marker={m}
                        onEditMarker={onEditMarker}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {/* 補足メモ */}
          <div className="pt-2 border-t border-stone-200">
            <p className="text-[11px] text-stone-600 mb-1">補足メモ</p>
            <textarea
              value={memoSupplement}
              onChange={e => onChangeSupplement?.(e.target.value)}
              placeholder="マーカーで表現しきれない補足情報を記述"
              rows={2}
              className="w-full p-2 border border-stone-300 rounded text-xs resize-y focus:outline-none focus:border-emerald-700"
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default ObservationPanel;

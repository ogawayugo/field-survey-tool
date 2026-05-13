import { memo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const PART_ORDER = ['根元', '幹', '大枝'];

const PART_COLORS = {
  '根元': '#2563eb',
  '幹': '#16a34a',
  '大枝': '#dc2626',
};

/**
 * 所見欄: マーカー連動リスト + フリーテキスト
 *
 * - リストはマーカーから生成（順序：根元→幹→大枝、各部位内は追加順）
 * - リスト項目をタップすると編集モード、「反映」ボタンで対応マーカーに反映
 * - フリーテキストは memoSupplement に独立保存
 * - ヘッダータップで開閉
 */
const ObservationPanel = memo(function ObservationPanel({
  markers = [],
  memoSupplement = '',
  onEditMarker,
  onChangeSupplement,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  // 部位順にソート（部位内は追加順保持）
  const orderedMarkers = [];
  for (const part of PART_ORDER) {
    for (const m of markers) {
      if (m.part === part) orderedMarkers.push(m);
    }
  }

  const startEdit = useCallback((m) => {
    setEditingId(m.id);
    setEditingText(m.item);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
  }, []);

  const applyEdit = useCallback((markerId) => {
    const trimmed = editingText.trim();
    if (trimmed && onEditMarker) {
      onEditMarker(markerId, { item: trimmed });
    }
    setEditingId(null);
    setEditingText('');
  }, [editingText, onEditMarker]);

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
          {/* マーカー由来リスト */}
          {orderedMarkers.length === 0 ? (
            <p className="text-[11px] text-stone-500 italic">
              写真にマーカーを追加すると、ここに自動で表示されます
            </p>
          ) : (
            <ul className="space-y-1">
              {orderedMarkers.map(m => {
                const isEditing = editingId === m.id;
                const color = PART_COLORS[m.part] || '#6b7280';
                return (
                  <li key={m.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-stone-600 flex-shrink-0" style={{ minWidth: 32 }}>
                      {m.part}：
                    </span>
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') applyEdit(m.id);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          maxLength={50}
                          className="flex-1 px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:border-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => applyEdit(m.id)}
                          className="px-2 py-1 text-[11px] rounded bg-blue-600 text-white hover:bg-blue-700 flex-shrink-0"
                        >
                          反映
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-2 py-1 text-[11px] rounded border border-stone-300 text-stone-600 hover:bg-stone-50 flex-shrink-0"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="flex-1 text-left px-2 py-1 rounded hover:bg-stone-100 text-stone-800 truncate"
                        title="タップして編集"
                      >
                        {m.item}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
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

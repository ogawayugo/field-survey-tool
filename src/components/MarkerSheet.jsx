import { memo, useState } from 'react';
import { DIAGNOSIS_COMMON_ITEMS, DIAGNOSIS_PART_ITEMS, DIAGNOSIS_PARTS_ORDER } from '../config/constants.js';

const PART_COLORS = {
  '根元': { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-600' },
  '幹': { bg: 'bg-green-600', text: 'text-white', border: 'border-green-600' },
  '大枝': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-600' },
};

/**
 * チップシート: 写真タップ後に下からせり出す
 * 部位 → 診断項目の2ステップ選択
 */
const MarkerSheet = memo(function MarkerSheet({ isOpen, onConfirm, onCancel, editingMarker }) {
  const [selectedPart, setSelectedPart] = useState(editingMarker?.part || null);
  const [selectedItem, setSelectedItem] = useState(editingMarker?.item || null);

  // editingMarker が変わったら初期値をリセット
  const [prevEditId, setPrevEditId] = useState(editingMarker?.id);
  if (editingMarker?.id !== prevEditId) {
    setPrevEditId(editingMarker?.id);
    setSelectedPart(editingMarker?.part || null);
    setSelectedItem(editingMarker?.item || null);
  }

  if (!isOpen) return null;

  const partItems = selectedPart
    ? [...DIAGNOSIS_COMMON_ITEMS, ...(DIAGNOSIS_PART_ITEMS[selectedPart] || [])]
    : [];

  const handleConfirm = () => {
    if (selectedPart && selectedItem) {
      onConfirm(selectedPart, selectedItem);
      setSelectedPart(null);
      setSelectedItem(null);
    }
  };

  const handleCancel = () => {
    setSelectedPart(null);
    setSelectedItem(null);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={handleCancel}>
      {/* 背景オーバーレイ */}
      <div className="absolute inset-0 bg-black/30" />

      {/* シート本体 */}
      <div
        className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl p-4 pb-8 animate-slide-up max-h-[70vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-stone-300 rounded-full mx-auto mb-4" />

        <h3 className="text-sm font-medium text-stone-900 mb-3">
          {editingMarker ? 'マーカーを編集' : 'マーカーを追加'}
        </h3>

        {/* 部位選択 */}
        <p className="text-[11px] text-stone-600 mb-2">部位を選択</p>
        <div className="flex gap-2 mb-4">
          {DIAGNOSIS_PARTS_ORDER.map(part => {
            const colors = PART_COLORS[part];
            const isActive = selectedPart === part;
            return (
              <button
                key={part}
                onClick={() => { setSelectedPart(part); setSelectedItem(null); }}
                className={`flex-1 py-2.5 text-sm border-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? `${colors.bg} ${colors.text} ${colors.border}`
                    : 'bg-white text-stone-700 border-stone-300 hover:border-stone-400'
                }`}
              >
                {part}
              </button>
            );
          })}
        </div>

        {/* 診断項目 */}
        {selectedPart && (
          <>
            <p className="text-[11px] text-stone-600 mb-2">診断項目を選択</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {partItems.map(item => {
                const isActive = selectedItem === item;
                const partColor = PART_COLORS[selectedPart];
                return (
                  <button
                    key={item}
                    onClick={() => setSelectedItem(item)}
                    className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${
                      isActive
                        ? `${partColor.bg} ${partColor.text} ${partColor.border}`
                        : 'bg-white text-stone-700 border-stone-300 hover:border-stone-400'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* アクションボタン */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 text-sm border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedPart || !selectedItem}
            className="flex-1 py-2.5 text-sm rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-900 text-white hover:bg-emerald-800"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
});

export default MarkerSheet;

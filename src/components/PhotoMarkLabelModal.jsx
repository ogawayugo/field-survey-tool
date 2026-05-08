import { useState, useEffect } from 'react';
import { DIAGNOSIS_COMMON_ITEMS, DIAGNOSIS_PART_ITEMS } from '../config/constants';

const ALL_MARK_CHIPS = (() => {
  const items = new Set(DIAGNOSIS_COMMON_ITEMS);
  for (const part of Object.values(DIAGNOSIS_PART_ITEMS)) {
    for (const item of part) items.add(item);
  }
  return [...items];
})();

export default function PhotoMarkLabelModal({ isOpen, initialText = '', onConfirm, onCancel, onDelete }) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (isOpen) setText(initialText);
  }, [isOpen, initialText]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onCancel}>
      <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-md p-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-base mb-3">病害名を選択</h3>

        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="または手入力"
          className="w-full p-2 border border-stone-300 rounded text-sm mb-3"
          autoFocus
        />

        <div className="flex flex-wrap gap-1.5 mb-4">
          {ALL_MARK_CHIPS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setText(c)}
              className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                text === c
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white border-stone-300 hover:border-emerald-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          {onDelete && (
            <button type="button" onClick={onDelete} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded text-sm">
              削除
            </button>
          )}
          <button type="button" onClick={onCancel} className="px-3 py-2 hover:bg-stone-100 rounded text-sm">
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => text.trim() && onConfirm(text.trim())}
            disabled={!text.trim()}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-sm disabled:opacity-50"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
}

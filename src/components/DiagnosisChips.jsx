import { memo } from 'react';
import { DIAGNOSIS_ITEMS, DIAGNOSIS_PARTS_ORDER } from '../config/constants.js';

const ChipGroup = memo(function ChipGroup({ part, items, onInsert }) {
  return (
    <div>
      <p className="text-[11px] text-stone-600 mb-1.5 tracking-wide">{part}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <button
            key={item}
            type="button"
            onClick={() => onInsert(part, item)}
            className="px-2.5 py-1 text-[11px] border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 transition-colors whitespace-nowrap"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
});

const DiagnosisChips = memo(function DiagnosisChips({ onInsert }) {
  return (
    <div className="space-y-3 mb-3">
      {DIAGNOSIS_PARTS_ORDER.map(part => (
        <ChipGroup
          key={part}
          part={part}
          items={DIAGNOSIS_ITEMS[part]}
          onInsert={onInsert}
        />
      ))}
      <p className="text-[10px] text-stone-500 leading-relaxed">
        タップすると現場メモに挿入されます。同じ部位は読点で続けて、別の部位は新しい行になります。
      </p>
    </div>
  );
});

export default DiagnosisChips;

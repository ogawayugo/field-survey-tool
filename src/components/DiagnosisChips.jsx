import { memo, useState } from 'react';
import { DIAGNOSIS_COMMON_ITEMS, DIAGNOSIS_PART_ITEMS, DIAGNOSIS_PARTS_ORDER } from '../config/constants.js';

const Chip = memo(function Chip({ label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] border transition-colors whitespace-nowrap ${
        active
          ? 'border-emerald-700 bg-emerald-50 text-emerald-800 font-medium'
          : 'border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800'
      }`}
    >
      {label}
    </button>
  );
});

const DiagnosisChips = memo(function DiagnosisChips({ onInsert }) {
  const [activePart, setActivePart] = useState('根元');

  const handlePartClick = (part) => {
    setActivePart(part);
  };

  const handleItemClick = (item) => {
    onInsert(activePart, item);
  };

  const partSpecific = DIAGNOSIS_PART_ITEMS[activePart];

  return (
    <div className="space-y-3 mb-3">
      {/* 部位選択ボタン */}
      <div>
        <p className="text-[11px] text-stone-600 mb-1.5 tracking-wide">部位</p>
        <div className="flex gap-1.5">
          {DIAGNOSIS_PARTS_ORDER.map(part => (
            <Chip
              key={part}
              label={part}
              active={activePart === part}
              onClick={() => handlePartClick(part)}
            />
          ))}
        </div>
      </div>

      {/* 共通診断項目 */}
      <div>
        <p className="text-[11px] text-stone-600 mb-1.5 tracking-wide">診断項目</p>
        <div className="flex flex-wrap gap-1.5">
          {DIAGNOSIS_COMMON_ITEMS.map(item => (
            <Chip
              key={item}
              label={item}
              onClick={() => handleItemClick(item)}
            />
          ))}
        </div>
      </div>

      {/* 部位専用項目 */}
      {partSpecific && partSpecific.length > 0 && (
        <div>
          <p className="text-[11px] text-stone-600 mb-1.5 tracking-wide">{activePart}の項目</p>
          <div className="flex flex-wrap gap-1.5">
            {partSpecific.map(item => (
              <Chip
                key={item}
                label={item}
                onClick={() => handleItemClick(item)}
              />
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-stone-500 leading-relaxed">
        部位を選んでから項目をタップすると現場メモに挿入されます。
      </p>
    </div>
  );
});

export default DiagnosisChips;

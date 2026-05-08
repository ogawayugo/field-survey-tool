import React, { memo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { THREE_CHOICE_ITEMS, THREE_CHOICE_OPTIONS, THREE_CHOICE_PARTS } from '../config/constants.js';

const ChoiceButton = memo(function ChoiceButton({ value, current, onChange }) {
  const isActive = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`px-2 py-1 text-[11px] border transition-colors ${
        isActive
          ? 'bg-emerald-50 text-emerald-900 border-emerald-700 border-2 font-medium'
          : 'bg-white text-stone-700 border-stone-300 hover:border-emerald-700'
      }`}
    >
      {THREE_CHOICE_OPTIONS.find(o => o.value === value)?.label || value}
    </button>
  );
});

const PartSection = memo(function PartSection({ partKey, partLabel, judgments, onChange }) {
  return (
    <div className="space-y-2 py-2 border-t border-stone-200">
      <p className="text-[11px] text-stone-600">{partLabel}</p>
      <div className="space-y-1.5">
        {THREE_CHOICE_ITEMS.map(item => (
          <div key={item.key} className="flex items-center gap-2">
            <span className="text-[11px] text-stone-700 flex-1 min-w-0 truncate">{item.label}</span>
            <div className="flex gap-1 flex-shrink-0">
              {THREE_CHOICE_OPTIONS.map(opt => (
                <ChoiceButton
                  key={opt.value}
                  value={opt.value}
                  current={judgments[item.key] || 'none'}
                  onChange={v => onChange(item.key, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

const ThreeChoicePanel = memo(function ThreeChoicePanel({ meta, onChange }) {
  const [open, setOpen] = useState(false);

  const judgments = meta.threeChoiceJudgments || {
    root:   { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    trunk:  { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    branch: { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
  };

  const updateJudgment = (partKey, itemKey, value) => {
    const updated = {
      ...judgments,
      [partKey]: {
        ...judgments[partKey],
        [itemKey]: value,
      },
    };
    onChange({ threeChoiceJudgments: updated });
  };

  // 「なし」以外がいくつあるかを表示（バッジ用）
  let nonNoneCount = 0;
  for (const partKey of ['root', 'trunk', 'branch']) {
    for (const itemKey of ['barkDeath', 'cavityShallow', 'cavityDeep']) {
      if (judgments[partKey]?.[itemKey] && judgments[partKey][itemKey] !== 'none') {
        nonNoneCount++;
      }
    }
  }

  return (
    <div className="border border-stone-300 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-stone-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-stone-600 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-stone-600 flex-shrink-0" />
        )}
        <span className="text-xs text-stone-700 flex-1">
          3択項目（樹皮枯死・開口空洞）
        </span>
        {nonNoneCount > 0 && (
          <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
            被害{nonNoneCount}件
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3">
          {THREE_CHOICE_PARTS.map(part => (
            <PartSection
              key={part.key}
              partKey={part.key}
              partLabel={part.label}
              judgments={judgments[part.key] || {}}
              onChange={(itemKey, value) => updateJudgment(part.key, itemKey, value)}
            />
          ))}
          <p className="text-[10px] text-stone-500 mt-2">
            ※ 初期状態は「なし」。被害がある場合だけ変更してください。
          </p>
        </div>
      )}
    </div>
  );
});

export default ThreeChoicePanel;

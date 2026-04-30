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

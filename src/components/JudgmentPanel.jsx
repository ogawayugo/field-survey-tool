import React, { memo } from 'react';
import { JUDGMENT_LEVELS, JUDGMENT_LABELS, JUDGMENT_COLORS, TREE_PARTS } from '../config/constants.js';
import { generateVitalityReason, generateAppearanceReason, generateOverallReason } from '../lib/generateJudgmentReason.js';

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
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-stone-600">判定理由</span>
            <button
              type="button"
              onClick={() => onChange({ vitalityReason: generateVitalityReason(meta) })}
              className="text-[11px] px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
            >
              ✨ 診断文生成
            </button>
          </div>
          <textarea
            value={meta.vitalityReason || ''}
            onChange={e => onChange({ vitalityReason: e.target.value })}
            placeholder="「✨ 診断文生成」ボタンで自動入力、または直接記述"
            rows={2}
            className="w-full p-2 border border-stone-300 rounded text-xs resize-y"
          />
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
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-stone-600">判定理由</span>
            <button
              type="button"
              onClick={() => onChange({ appearanceReason: generateAppearanceReason(meta) })}
              className="text-[11px] px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
            >
              ✨ 診断文生成
            </button>
          </div>
          <textarea
            value={meta.appearanceReason || ''}
            onChange={e => onChange({ appearanceReason: e.target.value })}
            placeholder="「✨ 診断文生成」ボタンで自動入力、または直接記述"
            rows={2}
            className="w-full p-2 border border-stone-300 rounded text-xs resize-y"
          />
        </div>
      </div>

      {/* 総合判定（v3.2） */}
      <div>
        <p className="text-[11px] text-stone-600 mb-2">総合判定</p>
        <div className="grid grid-cols-4 gap-1">
          {JUDGMENT_LEVELS.map(level => (
            <JudgmentButton
              key={level}
              value={level}
              current={meta.overallJudgment}
              onChange={v => onChange({ overallJudgment: v })}
            />
          ))}
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-stone-600">判定理由</span>
            <button
              type="button"
              onClick={() => onChange({ overallReason: generateOverallReason(meta) })}
              className="text-[11px] px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
            >
              ✨ 診断文生成
            </button>
          </div>
          <textarea
            value={meta.overallReason || ''}
            onChange={e => onChange({ overallReason: e.target.value })}
            placeholder="「✨ 診断文生成」ボタンで自動入力、または直接記述"
            rows={4}
            className="w-full p-2 border border-stone-300 rounded text-xs resize-y"
          />
        </div>
      </div>

      {/* 凡例 */}
      <div className="text-[10px] text-stone-500 leading-relaxed pt-2 border-t border-stone-200">
        A：健全か健全に近い／B1：注意すべき被害／B2：著しい被害／C：不健全
      </div>

      {/* 特記事項 */}
      <div className="pt-3 border-t border-stone-200">
        <p className="text-[11px] text-stone-600 mb-1">特記事項</p>
        <textarea
          value={meta.specialNotes || ''}
          onChange={e => onChange({ specialNotes: e.target.value })}
          placeholder="現場では書ききれなかった所感、次回フォローアップ事項、管理者への申し送りなど"
          rows={3}
          className="w-full p-2 border border-stone-300 rounded text-xs resize-y"
        />
      </div>
    </div>
  );
});

export default JudgmentPanel;

import { memo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const DEFAULT_TREATMENT = {
  necessity: '',
  urgency: '',
  observation: '',
  pruning: [],
  pressureReduction: false,
  stubCut: false,
  rootCircling: false,
  individual: {
    treeProtection:          { checked: false, note: '' },
    plantingBaseImprovement: { checked: false, note: '' },
    rootUplift:              { checked: false, note: '' },
    pestControl:             { checked: false, note: '' },
    renewal:                 { checked: false, note: '' },
    other:                   { checked: false, note: '' },
  },
  summary: '',
};

const INDIVIDUAL_ITEMS = [
  { key: 'treeProtection',          label: '樹体保護' },
  { key: 'plantingBaseImprovement', label: '植栽基盤の改善' },
  { key: 'rootUplift',              label: '根上がり' },
  { key: 'pestControl',             label: '病虫害防除' },
  { key: 'renewal',                 label: '更新' },
  { key: 'other',                   label: 'その他' },
];

const PRUNING_OPTIONS = ['枯枝', '腐朽枝等', '支障枝'];

function countTreatment(t) {
  if (!t) return 0;
  let n = 0;
  if (t.necessity) n++;
  if (t.urgency) n++;
  if (t.observation) n++;
  if (Array.isArray(t.pruning)) n += t.pruning.length;
  if (t.pressureReduction) n++;
  if (t.stubCut) n++;
  if (t.rootCircling) n++;
  for (const { key } of INDIVIDUAL_ITEMS) {
    if (t.individual?.[key]?.checked) n++;
  }
  if (t.summary && t.summary.trim()) n++;
  return n;
}

const ToggleButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-xs border rounded transition-colors ${
      active
        ? 'bg-emerald-900 text-white border-emerald-900'
        : 'bg-white text-stone-700 border-stone-300 hover:border-emerald-700'
    }`}
  >
    {children}
  </button>
);

const TreatmentPanel = memo(function TreatmentPanel({ treatment, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const t = treatment ?? DEFAULT_TREATMENT;
  const count = countTreatment(treatment);

  const update = useCallback((changes) => {
    onChange({ ...DEFAULT_TREATMENT, ...t, ...changes });
  }, [t, onChange]);

  const updateIndividual = useCallback((key, changes) => {
    onChange({
      ...DEFAULT_TREATMENT,
      ...t,
      individual: {
        ...DEFAULT_TREATMENT.individual,
        ...t.individual,
        [key]: { ...DEFAULT_TREATMENT.individual[key], ...(t.individual?.[key] || {}), ...changes },
      },
    });
  }, [t, onChange]);

  const togglePruning = useCallback((opt) => {
    const cur = Array.isArray(t.pruning) ? t.pruning : [];
    const next = cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt];
    update({ pruning: next });
  }, [t.pruning, update]);

  return (
    <div className="border border-stone-300 rounded">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-stone-50 transition-colors"
      >
        {isOpen
          ? <ChevronDown className="w-4 h-4 text-stone-600" strokeWidth={2} />
          : <ChevronRight className="w-4 h-4 text-stone-600" strokeWidth={2} />}
        <span className="text-sm font-medium text-stone-800">処置内容</span>
        <span className="text-[11px] text-stone-500">({count}件選択)</span>
      </button>

      {isOpen && (
        <div className="border-t border-stone-200 p-3 space-y-4">
          {/* 必要性 */}
          <div>
            <p className="text-[11px] text-stone-600 mb-1.5">必要性</p>
            <div className="flex gap-2">
              {['なし', 'あり'].map(v => (
                <ToggleButton key={v} active={t.necessity === v} onClick={() => update({ necessity: t.necessity === v ? '' : v })}>
                  {v}
                </ToggleButton>
              ))}
            </div>
          </div>

          {/* 緊急性 */}
          <div>
            <p className="text-[11px] text-stone-600 mb-1.5">緊急性</p>
            <div className="flex gap-2">
              {['なし', 'あり'].map(v => (
                <ToggleButton key={v} active={t.urgency === v} onClick={() => update({ urgency: t.urgency === v ? '' : v })}>
                  {v}
                </ToggleButton>
              ))}
            </div>
          </div>

          {/* 要観察 */}
          <div>
            <p className="text-[11px] text-stone-600 mb-1.5">要観察</p>
            <div className="flex gap-2 flex-wrap">
              {['長期周期', '短期周期', 'なし'].map(v => (
                <ToggleButton key={v} active={t.observation === v} onClick={() => update({ observation: t.observation === v ? '' : v })}>
                  {v}
                </ToggleButton>
              ))}
            </div>
          </div>

          {/* 剪定（複数選択可） */}
          <div>
            <p className="text-[11px] text-stone-600 mb-1.5">剪定（複数選択可）</p>
            <div className="flex gap-2 flex-wrap">
              {PRUNING_OPTIONS.map(opt => {
                const active = Array.isArray(t.pruning) && t.pruning.includes(opt);
                return (
                  <ToggleButton key={opt} active={active} onClick={() => togglePruning(opt)}>
                    {opt}
                  </ToggleButton>
                );
              })}
              <ToggleButton active={!!t.pressureReduction} onClick={() => update({ pressureReduction: !t.pressureReduction })}>
                風圧軽減
              </ToggleButton>
              <ToggleButton active={!!t.stubCut} onClick={() => update({ stubCut: !t.stubCut })}>
                スタブカット
              </ToggleButton>
              <ToggleButton active={!!t.rootCircling} onClick={() => update({ rootCircling: !t.rootCircling })}>
                巻き根
              </ToggleButton>
            </div>
          </div>

          {/* 個別処置 */}
          <div>
            <p className="text-[11px] text-stone-600 mb-1.5">個別処置（チェックすると補足欄が出現）</p>
            <div className="space-y-1.5">
              {INDIVIDUAL_ITEMS.map(({ key, label }) => {
                const item = t.individual?.[key] || { checked: false, note: '' };
                return (
                  <div key={key} className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-stone-800 min-w-[120px]">
                      <input
                        type="checkbox"
                        checked={!!item.checked}
                        onChange={(e) => updateIndividual(key, { checked: e.target.checked })}
                        className="accent-emerald-700"
                      />
                      {label}
                    </label>
                    {item.checked && (
                      <input
                        type="text"
                        value={item.note || ''}
                        onChange={(e) => updateIndividual(key, { note: e.target.value })}
                        placeholder="補足記入"
                        className="flex-1 px-2 py-1 border border-stone-300 rounded text-xs focus:outline-none focus:border-emerald-700"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 摘要 */}
          <div>
            <p className="text-[11px] text-stone-600 mb-1.5">摘要</p>
            <textarea
              value={t.summary || ''}
              onChange={(e) => update({ summary: e.target.value })}
              placeholder="現状は経過観察、来年度に再点検 など"
              rows={2}
              className="w-full p-2 border border-stone-300 rounded text-xs resize-y focus:outline-none focus:border-emerald-700"
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default TreatmentPanel;

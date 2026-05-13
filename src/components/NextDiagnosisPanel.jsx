import { memo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const DEFAULT_NEXT_DIAGNOSIS = {
  followUp: false,
  instrumental: { checked: false, site: '' },
  appearance: false,
};

const DEFAULT_TIMING = {
  years: 0,        // 0 = 未選択, 1, 2, 3
  fiscalYear: null,
};

function countNext(nd, timing) {
  let n = 0;
  if (nd?.followUp) n++;
  if (nd?.instrumental?.checked) n++;
  if (nd?.appearance) n++;
  if (timing?.years) n++;
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

const NextDiagnosisPanel = memo(function NextDiagnosisPanel({
  nextDiagnosis,
  nextDiagnosisTiming,
  onChangeDiagnosis,
  onChangeTiming,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const nd = nextDiagnosis ?? DEFAULT_NEXT_DIAGNOSIS;
  const tm = nextDiagnosisTiming ?? DEFAULT_TIMING;
  const count = countNext(nextDiagnosis, nextDiagnosisTiming);

  const updateDiagnosis = useCallback((changes) => {
    onChangeDiagnosis({
      ...DEFAULT_NEXT_DIAGNOSIS,
      ...nd,
      ...changes,
      instrumental: { ...DEFAULT_NEXT_DIAGNOSIS.instrumental, ...nd.instrumental, ...(changes.instrumental || {}) },
    });
  }, [nd, onChangeDiagnosis]);

  const updateTiming = useCallback((changes) => {
    onChangeTiming({ ...DEFAULT_TIMING, ...tm, ...changes });
  }, [tm, onChangeTiming]);

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
        <span className="text-sm font-medium text-stone-800">次回診断</span>
        <span className="text-[11px] text-stone-500">({count}件選択)</span>
      </button>

      {isOpen && (
        <div className="border-t border-stone-200 p-3 space-y-4">
          {/* 次回診断種別 */}
          <div>
            <p className="text-[11px] text-stone-600 mb-1.5">次回診断（複数選択可）</p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-stone-800">
                <input
                  type="checkbox"
                  checked={!!nd.followUp}
                  onChange={(e) => updateDiagnosis({ followUp: e.target.checked })}
                  className="accent-emerald-700"
                />
                フォローアップ診断
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs text-stone-800">
                  <input
                    type="checkbox"
                    checked={!!nd.instrumental?.checked}
                    onChange={(e) => updateDiagnosis({ instrumental: { checked: e.target.checked, site: nd.instrumental?.site || '' } })}
                    className="accent-emerald-700"
                  />
                  要機器診断
                </label>
                {nd.instrumental?.checked && (
                  <>
                    <span className="text-[11px] text-stone-600">測定部位:</span>
                    <input
                      type="text"
                      value={nd.instrumental?.site || ''}
                      onChange={(e) => updateDiagnosis({ instrumental: { checked: true, site: e.target.value } })}
                      placeholder="根元 / 幹 / 大枝 など"
                      className="flex-1 min-w-[120px] px-2 py-1 border border-stone-300 rounded text-xs focus:outline-none focus:border-emerald-700"
                    />
                  </>
                )}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-stone-800">
                <input
                  type="checkbox"
                  checked={!!nd.appearance}
                  onChange={(e) => updateDiagnosis({ appearance: e.target.checked })}
                  className="accent-emerald-700"
                />
                外観診断
              </label>
            </div>
          </div>

          {/* 再診断時期 */}
          <div>
            <p className="text-[11px] text-stone-600 mb-1.5">次回再診断時期</p>
            <div className="flex gap-2 flex-wrap items-center">
              {[1, 2, 3].map(y => (
                <ToggleButton
                  key={y}
                  active={tm.years === y}
                  onClick={() => {
                    if (tm.years === y) {
                      updateTiming({ years: 0, fiscalYear: null });
                    } else {
                      const currentYear = new Date().getFullYear();
                      updateTiming({ years: y, fiscalYear: String(currentYear + y) });
                    }
                  }}
                >
                  {y}年後
                </ToggleButton>
              ))}
              {tm.years > 0 && (
                <>
                  <span className="text-[11px] text-stone-600">年度:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={tm.fiscalYear ?? ''}
                    onChange={(e) => updateTiming({ fiscalYear: e.target.value.replace(/[^0-9]/g, '') || null })}
                    placeholder={String(new Date().getFullYear() + tm.years)}
                    maxLength={4}
                    className="w-24 px-2 py-1 border border-stone-300 rounded text-xs focus:outline-none focus:border-emerald-700"
                  />
                  <span className="text-[11px] text-stone-500">年</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default NextDiagnosisPanel;

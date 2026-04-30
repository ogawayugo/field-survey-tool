import { memo } from 'react';

export default memo(function SegmentedControl({ options, value, onChange, compact }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`${compact ? 'py-2' : 'py-2 px-1'} text-xs border transition-colors ${
            value === opt ? 'bg-emerald-900 text-white border-emerald-900' : 'bg-white text-stone-700 border-stone-300 hover:border-emerald-700'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
});

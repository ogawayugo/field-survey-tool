import { memo } from 'react';

export default memo(function TreePill({ treeNumber, species, index, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors border ${
        isActive
          ? 'bg-emerald-900 text-white border-emerald-900'
          : 'bg-white text-stone-700 border-stone-300 hover:border-emerald-700'
      }`}
    >
      {treeNumber || `#${index + 1}`}
      {species ? <span className={`ml-1.5 ${isActive ? 'opacity-80' : 'opacity-60'}`}>{species.slice(0, 4)}</span> : null}
    </button>
  );
});

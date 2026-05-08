import { memo } from 'react';
import { Trash2 } from 'lucide-react';
import { PHOTO_LABELS } from '../config/constants';

export default memo(function PhotoCard({ photo, onView, onChange, onRemove }) {
  return (
    <div className="border border-stone-300 bg-white">
      <button onClick={onView} className="block w-full aspect-square overflow-hidden bg-stone-100 relative">
        <img src={photo.dataUrl} alt={photo.caption || photo.label || photo.name} className="w-full h-full object-cover" />
        {photo.caption && (
          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-white text-left leading-tight" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}>
            {photo.caption}
          </div>
        )}
        {photo.annotations && photo.annotations.length > 0 && (
          <div className="absolute top-1 right-1 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-medium">
            {photo.annotations.length}マーク
          </div>
        )}
      </button>
      <div className="p-2 space-y-1.5">
        <input
          type="text"
          value={photo.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          placeholder="名前・説明（例：根元の露出根）"
          className="w-full px-1.5 py-1 border border-stone-300 text-[11px] focus:outline-none focus:border-emerald-700"
        />
        <select
          value={photo.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full px-1.5 py-1 border border-stone-300 text-[11px] focus:outline-none focus:border-emerald-700"
        >
          <option value="">カルテ枠を選択</option>
          {PHOTO_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button
          onClick={onRemove}
          className="w-full text-[11px] text-red-700 hover:text-red-900 flex items-center justify-center gap-1 py-1"
        >
          <Trash2 className="w-3 h-3" /> 削除
        </button>
      </div>
    </div>
  );
});

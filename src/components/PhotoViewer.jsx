import { memo } from 'react';
import { X } from 'lucide-react';
import PhotoAnnotator from './PhotoAnnotator';

export default memo(function PhotoViewer({ photo, onClose, onChangeAnnotations }) {
  if (!photo) return null;

  const isFullView = photo.label === '樹木全体';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(20, 15, 10, 0.92)' }} onClick={onClose}>
      <button className="absolute top-4 right-4 p-2 text-white/80 hover:text-white z-50">
        <X className="w-6 h-6" />
      </button>
      <div className="flex flex-col items-center max-w-full max-h-full w-full sm:max-w-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        {isFullView && onChangeAnnotations ? (
          <PhotoAnnotator
            imageUrl={photo.dataUrl}
            annotations={photo.annotations || []}
            onChange={onChangeAnnotations}
          />
        ) : (
          <img src={photo.dataUrl} alt="" className="max-w-full max-h-[80vh] object-contain" />
        )}
        {(photo.caption || photo.label) && (
          <div className="mt-3 text-center text-white/90 text-sm">
            {photo.caption && <div className="serif text-base">{photo.caption}</div>}
            {photo.label && <div className="text-xs text-white/60 mt-0.5">{photo.label}</div>}
          </div>
        )}
      </div>
    </div>
  );
});

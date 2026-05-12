import { memo, useState, useRef, useCallback } from 'react';
import { Camera, X, GripVertical } from 'lucide-react';

const ROLE_LABELS = {
  main: '全景（メイン）',
  closeup1: 'クローズアップ1',
  closeup2: 'クローズアップ2',
  closeup3: 'クローズアップ3',
};

const ROLE_ORDER = ['main', 'closeup1', 'closeup2', 'closeup3'];

/** 写真左上のオーバーレイバッジ */
const PhotoBadge = ({ label }) => (
  <div
    className="absolute top-2 left-2 px-2 py-1 text-[11px] text-white rounded pointer-events-none"
    style={{
      background: 'rgba(0, 0, 0, 0.6)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      zIndex: 5,
    }}
  >
    {label}
  </div>
);

const PhotoFrameGrid = memo(function PhotoFrameGrid({
  photos,
  onTakePhoto,
  onPickPhoto,
  onViewPhoto,
  onRemovePhoto,
  onSwapRole,
  onTapMainPhoto,
  markers,
  children,
  markerOverlay,
}) {
  const [dragSourceId, setDragSourceId] = useState(null);
  const [dragOverRole, setDragOverRole] = useState(null);
  const longPressTimer = useRef(null);
  const touchDragId = useRef(null);

  const mainPhoto = photos.find(p => p.role === 'main');
  const closeups = ROLE_ORDER.slice(1).map(role => ({
    role,
    photo: photos.find(p => p.role === role),
  }));
  const sparePhotos = photos.filter(p => p.role === 'spare');

  const handleDragStart = useCallback((e, photoId) => {
    setDragSourceId(photoId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, role) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRole(role);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverRole(null);
  }, []);

  const handleDrop = useCallback((e, targetRole) => {
    e.preventDefault();
    setDragOverRole(null);
    if (dragSourceId) {
      onSwapRole(dragSourceId, targetRole);
    }
    setDragSourceId(null);
  }, [dragSourceId, onSwapRole]);

  const handleDragEnd = useCallback(() => {
    setDragSourceId(null);
    setDragOverRole(null);
  }, []);

  const handleTouchStart = useCallback((e, photoId) => {
    longPressTimer.current = setTimeout(() => {
      touchDragId.current = photoId;
      setDragSourceId(photoId);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (touchDragId.current) {
      touchDragId.current = null;
      setDragSourceId(null);
      setDragOverRole(null);
    }
  }, []);

  const handleTouchMoveOnFrame = useCallback((e, role) => {
    if (touchDragId.current) {
      e.preventDefault();
      setDragOverRole(role);
    }
  }, []);

  const handleTouchEndOnFrame = useCallback((role) => {
    if (touchDragId.current) {
      onSwapRole(touchDragId.current, role);
      touchDragId.current = null;
      setDragSourceId(null);
      setDragOverRole(null);
    }
  }, [onSwapRole]);

  const PART_COLORS = { '根元': '#2563eb', '幹': '#16a34a', '大枝': '#dc2626' };

  const renderFrame = (role, photo, label, isMain = false) => {
    const isDragOver = dragOverRole === role;
    return (
      <div
        key={role}
        className={`relative border-2 transition-colors ${
          isDragOver ? 'border-emerald-500 bg-emerald-50' : 'border-stone-300 bg-stone-100'
        } ${isMain ? 'aspect-[4/3]' : 'aspect-square'}`}
        onDragOver={(e) => handleDragOver(e, role)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, role)}
        onTouchMove={(e) => handleTouchMoveOnFrame(e, role)}
        onTouchEnd={() => handleTouchEndOnFrame(role)}
      >
        {photo ? (
          <>
            <button
              className="block w-full h-full overflow-hidden"
              onClick={() => isMain && onTapMainPhoto ? onTapMainPhoto() : onViewPhoto(photo)}
            >
              <img
                src={photo.dataUrl}
                alt={label}
                className="w-full h-full object-cover"
                draggable={false}
              />
              {isMain && markers && markers.length > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  {markers.map(m => (
                    <div
                      key={m.id}
                      className="absolute w-3 h-3 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${m.x * 100}%`,
                        top: `${m.y * 100}%`,
                        backgroundColor: PART_COLORS[m.part] || '#6b7280',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                      }}
                    />
                  ))}
                </div>
              )}
            </button>
            <PhotoBadge label={label} />
            <button
              onClick={() => onRemovePhoto(photo.id)}
              className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white flex items-center justify-center rounded-full hover:bg-black/70"
              style={{ zIndex: 6 }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Camera className="w-6 h-6 text-stone-400" />
            <span className="text-[10px] text-stone-500">{label}</span>
            <div className="flex gap-1">
              <button
                onClick={() => onTakePhoto(role)}
                className="px-2 py-1 text-[10px] border border-stone-300 bg-white text-stone-700 hover:border-emerald-700"
              >
                撮影
              </button>
              <button
                onClick={() => onPickPhoto(role)}
                className="px-2 py-1 text-[10px] border border-stone-300 bg-white text-stone-700 hover:border-emerald-700"
              >
                選択
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* メイン全景: markerOverlayがある場合はそちらを使う */}
      {markerOverlay && mainPhoto ? (
        <div className="relative">
          {markerOverlay}
          <PhotoBadge label={ROLE_LABELS.main} />
          <button
            onClick={() => onRemovePhoto(mainPhoto.id)}
            className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white flex items-center justify-center rounded-full hover:bg-black/70"
            style={{ zIndex: 25 }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        renderFrame('main', mainPhoto, ROLE_LABELS.main, true)
      )}

      {/* children */}
      {children}

      {/* クローズアップ 1-3 */}
      <div className="grid grid-cols-3 gap-2">
        {closeups.map(({ role, photo }) =>
          renderFrame(role, photo, ROLE_LABELS[role])
        )}
      </div>

      {/* 予備写真 */}
      {sparePhotos.length > 0 && (
        <details className="group">
          <summary className="text-xs text-stone-600 cursor-pointer hover:text-emerald-800 py-1">
            ▶ 予備写真（{sparePhotos.length}枚）
          </summary>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {sparePhotos.map(photo => (
              <div
                key={photo.id}
                className="relative aspect-square border border-stone-300 bg-stone-100 overflow-hidden"
                draggable
                onDragStart={(e) => handleDragStart(e, photo.id)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, photo.id)}
                onTouchEnd={handleTouchEnd}
              >
                <button
                  className="block w-full h-full"
                  onClick={() => onViewPhoto(photo)}
                >
                  <img
                    src={photo.dataUrl}
                    alt="予備"
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </button>
                <div
                  className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[9px] text-white rounded pointer-events-none"
                  style={{ background: 'rgba(0, 0, 0, 0.5)' }}
                >
                  予備
                </div>
                <button
                  onClick={() => onRemovePhoto(photo.id)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white flex items-center justify-center rounded-full"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute top-1 left-1 text-white cursor-grab">
                  <GripVertical className="w-4 h-4 drop-shadow" />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
});

export default PhotoFrameGrid;

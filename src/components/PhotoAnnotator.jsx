import { useState, useRef, useCallback } from 'react';
import PhotoMarkLabelModal from './PhotoMarkLabelModal';

export default function PhotoAnnotator({ imageUrl, annotations = [], onChange }) {
  const [editMode, setEditMode] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const dragState = useRef(null); // { id, moved }
  const imgRef = useRef(null);

  const toNormalized = useCallback((clientX, clientY) => {
    const rect = imgRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, []);

  const handleImageClick = useCallback((e) => {
    if (!editMode) return;
    if (dragState.current?.moved) return;
    const { x, y } = toNormalized(e.clientX, e.clientY);
    setPendingAnchor({ x, y });
  }, [editMode, toNormalized]);

  const handleConfirmNew = useCallback((text) => {
    if (!pendingAnchor) return;
    const ann = {
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      anchorX: pendingAnchor.x,
      anchorY: pendingAnchor.y,
      labelX: Math.min(0.85, pendingAnchor.x + 0.08),
      labelY: Math.max(0, pendingAnchor.y - 0.10),
      text,
    };
    onChange([...annotations, ann]);
    setPendingAnchor(null);
  }, [pendingAnchor, annotations, onChange]);

  const handleConfirmEdit = useCallback((text) => {
    if (!editingId) return;
    onChange(annotations.map(a => a.id === editingId ? { ...a, text } : a));
    setEditingId(null);
  }, [editingId, annotations, onChange]);

  const handleDelete = useCallback(() => {
    if (!editingId) return;
    onChange(annotations.filter(a => a.id !== editingId));
    setEditingId(null);
  }, [editingId, annotations, onChange]);

  const handleLabelPointerDown = useCallback((e, id) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    dragState.current = { id, moved: false };

    const handleMove = (ev) => {
      ev.preventDefault();
      dragState.current.moved = true;
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { x, y } = toNormalized(cx, cy);
      onChange(annotations.map(a => a.id === id ? { ...a, labelX: x, labelY: y } : a));
    };

    const handleUp = () => {
      // If not moved, treat as click → open edit modal
      if (dragState.current && !dragState.current.moved) {
        setEditingId(id);
      }
      dragState.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [editMode, annotations, onChange, toNormalized]);

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setEditMode(!editMode)}
          className={`px-3 py-1 rounded text-xs border transition-colors ${
            editMode
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white border-stone-300 hover:border-emerald-700 text-stone-700'
          }`}
        >
          {editMode ? '✓ 完了' : '✏ マーク追加'}
        </button>
        {editMode && (
          <span className="text-[10px] text-stone-500">
            写真タップで追加／ラベルをドラッグで移動／タップで編集
          </span>
        )}
      </div>

      <div className="relative" onClick={handleImageClick}>
        <img
          ref={imgRef}
          src={imageUrl}
          className="w-full h-auto block"
          draggable={false}
        />

        {/* SVG overlay: lines + anchor dots */}
        {annotations.length > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
          >
            {annotations.map(a => {
              const ax = a.anchorX * 1000;
              const ay = a.anchorY * 1000;
              const lx = a.labelX * 1000;
              const ly = a.labelY * 1000;
              return (
                <g key={a.id}>
                  <line
                    x1={lx} y1={ly} x2={ax} y2={ay}
                    stroke="red" strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={ax} cy={ay} r="5" fill="red" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>
        )}

        {/* Text labels as HTML (draggable) */}
        {annotations.map(a => (
          <div
            key={a.id}
            onPointerDown={e => handleLabelPointerDown(e, a.id)}
            className={`absolute bg-white/95 border-2 border-red-600 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap select-none ${
              editMode ? 'cursor-move' : ''
            }`}
            style={{
              left: `${a.labelX * 100}%`,
              top: `${a.labelY * 100}%`,
              touchAction: 'none',
              pointerEvents: editMode ? 'auto' : 'none',
            }}
          >
            {a.text}
          </div>
        ))}
      </div>

      <PhotoMarkLabelModal
        isOpen={!!pendingAnchor}
        onConfirm={handleConfirmNew}
        onCancel={() => setPendingAnchor(null)}
      />

      <PhotoMarkLabelModal
        isOpen={!!editingId}
        initialText={annotations.find(a => a.id === editingId)?.text || ''}
        onConfirm={handleConfirmEdit}
        onCancel={() => setEditingId(null)}
        onDelete={handleDelete}
      />
    </div>
  );
}

import { memo, useState, useRef, useCallback } from 'react';
import MarkerSheet from './MarkerSheet';
import { extractSummaryWithCache } from '../lib/markerExtractor';

const PART_COLORS = {
  '根元': '#2563eb',
  '幹': '#16a34a',
  '大枝': '#dc2626',
};

// 部位色の薄い背景色（ハイライト用）
const PART_LIGHT_COLORS = {
  '根元': '#dbeafe', // blue-100
  '幹': '#dcfce7',   // green-100
  '大枝': '#fee2e2', // red-100
};

const DEFAULT_LABEL_OFFSET_Y = 0.12;

const MarkerOverlay = memo(function MarkerOverlay({
  imageUrl,
  markers = [],
  onAddMarker,
  onEditMarker,
  onDeleteMarker,
  selectedMarkerId = null,
  onSelectMarker,
  onPushHistory,
}) {
  const pushHistory = useCallback(() => {
    if (onPushHistory) onPushHistory();
  }, [onPushHistory]);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [pendingPos, setPendingPos] = useState(null);
  const [chipEditingMarker, setChipEditingMarker] = useState(null);
  const [showEditMenu, setShowEditMenu] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const dragState = useRef(null);
  const longPressTimers = useRef({});
  const rangeDragState = useRef(null);

  const toNormalized = useCallback((clientX, clientY) => {
    const rect = imgRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, []);

  // 選択トグル
  const toggleSelect = useCallback((markerId) => {
    if (!onSelectMarker) return;
    onSelectMarker(prev => prev === markerId ? null : markerId);
  }, [onSelectMarker]);

  const handleImageTap = useCallback((e) => {
    if (editingTextId) return;
    if (dragState.current?.moved) return;

    const { x, y } = toNormalized(e.clientX, e.clientY);

    const threshold = 0.05;
    const hitMarker = markers.find(m =>
      Math.abs(m.x - x) < threshold && Math.abs(m.y - y) < threshold
    );

    if (hitMarker) {
      if (hitMarker.collapsed) {
        pushHistory();
        onEditMarker(hitMarker.id, { collapsed: false });
      } else {
        setShowEditMenu(hitMarker);
      }
    } else {
      // 何もない場所タップ → 選択解除
      if (onSelectMarker) onSelectMarker(null);
      setPendingPos({ x, y });
    }
  }, [markers, editingTextId, onEditMarker, toNormalized, onSelectMarker, pushHistory]);

  const handleSheetConfirm = useCallback((part, item) => {
    if (pendingPos) {
      const labelY = Math.max(0.02, pendingPos.y - DEFAULT_LABEL_OFFSET_Y);
      const isRange = item === '木槌打診異常';
      const halfLen = 0.08;
      const newMarker = {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: isRange ? 'range' : 'point',
        x: pendingPos.x,
        y: pendingPos.y,
        labelX: pendingPos.x,
        labelY,
        part,
        item,
        text: item,                // textbox 初期値はチップ名
        summary: '',               // 初期は空欄（textbox編集時に自動抽出される）
        summaryEdited: false,
        collapsed: false,
        createdAt: new Date().toISOString(),
      };
      if (isRange) {
        // 縦方向（木と平行）にデフォルト配置
        newMarker.rangeStart = { x: pendingPos.x, y: Math.max(0, pendingPos.y - halfLen) };
        newMarker.rangeEnd = { x: pendingPos.x, y: Math.min(1, pendingPos.y + halfLen) };
      }
      pushHistory();
      onAddMarker(newMarker);
      setPendingPos(null);
    }
    if (chipEditingMarker) {
      pushHistory();
      // チップ（part/item）が変わったので summary を再抽出
      // ただし手動編集済みなら summary は維持
      const changes = { part, item };
      if (!chipEditingMarker.summaryEdited) {
        const textForExtract = chipEditingMarker.text || item;
        changes.summary = extractSummaryWithCache(textForExtract, item, part);
      }
      onEditMarker(chipEditingMarker.id, changes);
      setChipEditingMarker(null);
    }
  }, [pendingPos, chipEditingMarker, onAddMarker, onEditMarker, pushHistory]);

  const handleSheetCancel = useCallback(() => {
    setPendingPos(null);
    setChipEditingMarker(null);
  }, []);

  const handleEditFromMenu = useCallback(() => {
    setChipEditingMarker(showEditMenu);
    setShowEditMenu(null);
  }, [showEditMenu]);

  const handleDeleteFromMenu = useCallback(() => {
    if (showEditMenu && window.confirm(`「${showEditMenu.part}: ${showEditMenu.item}」を削除しますか？`)) {
      pushHistory();
      onDeleteMarker(showEditMenu.id);
    }
    setShowEditMenu(null);
  }, [showEditMenu, onDeleteMarker, pushHistory]);

  const commitTextEdit = useCallback(() => {
    if (editingTextId && editingText.trim()) {
      const marker = markers.find(m => m.id === editingTextId);
      const newText = editingText.trim();
      const oldText = marker?.text ?? marker?.item ?? '';
      if (marker && newText !== oldText) {
        pushHistory();
        const changes = { text: newText };
        // 手動編集されていなければ summary を自動更新
        if (!marker.summaryEdited) {
          changes.summary = extractSummaryWithCache(newText, marker.item, marker.part);
        }
        onEditMarker(editingTextId, changes);
      }
    }
    setEditingTextId(null);
    setEditingText('');
  }, [editingTextId, editingText, onEditMarker, markers, pushHistory]);

  // テキストボックスのドラッグ / タップ / 長押し
  const handleBoxPointerDown = useCallback((e, markerId) => {
    if (editingTextId) return;
    e.stopPropagation();
    e.preventDefault();
    dragState.current = { id: markerId, moved: false };

    longPressTimers.current[markerId] = setTimeout(() => {
      if (dragState.current && !dragState.current.moved) {
        pushHistory();
        onEditMarker(markerId, { collapsed: true });
        dragState.current = null;
      }
      delete longPressTimers.current[markerId];
    }, 500);

    const handleMove = (ev) => {
      ev.preventDefault();
      if (longPressTimers.current[markerId]) {
        clearTimeout(longPressTimers.current[markerId]);
        delete longPressTimers.current[markerId];
      }
      if (!dragState.current.moved) {
        // 最初の移動でのみ履歴を積む（一連のドラッグを1操作として扱う）
        pushHistory();
      }
      dragState.current.moved = true;
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { x, y } = toNormalized(cx, cy);
      onEditMarker(markerId, { labelX: x, labelY: y });
    };

    const handleUp = () => {
      if (longPressTimers.current[markerId]) {
        clearTimeout(longPressTimers.current[markerId]);
        delete longPressTimers.current[markerId];
      }

      if (dragState.current && !dragState.current.moved) {
        // タップ → テキスト編集 & 選択
        const marker = markers.find(m => m.id === markerId);
        if (marker) {
          setEditingTextId(markerId);
          setEditingText(marker.text ?? marker.item ?? '');
          toggleSelect(markerId);
        }
      }
      dragState.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
  }, [editingTextId, markers, onEditMarker, toNormalized, toggleSelect, pushHistory]);

  // 点マーカーの対象点を個別にドラッグ（選択中のみ）
  const pointDragState = useRef(null);
  const handlePointTargetPointerDown = useCallback((e, markerId) => {
    e.stopPropagation();
    e.preventDefault();
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;
    // ドラッグ開始時の対象点位置とテキストボックス位置を記録（delta追従用）
    pointDragState.current = {
      markerId,
      origX: marker.x,
      origY: marker.y,
      origLabelX: marker.labelX != null ? marker.labelX : marker.x,
      origLabelY: marker.labelY != null ? marker.labelY : Math.max(0.02, marker.y - DEFAULT_LABEL_OFFSET_Y),
      moved: false,
    };

    const handleMove = (ev) => {
      ev.preventDefault();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { x, y } = toNormalized(cx, cy);
      const s = pointDragState.current;
      if (!s) return;
      if (!s.moved) {
        pushHistory();
      }
      s.moved = true;
      const dx = x - s.origX;
      const dy = y - s.origY;
      const newLabelX = Math.max(0, Math.min(1, s.origLabelX + dx));
      const newLabelY = Math.max(0, Math.min(1, s.origLabelY + dy));
      onEditMarker(markerId, {
        x, y,
        labelX: newLabelX,
        labelY: newLabelY,
      });
    };

    const handleUp = () => {
      pointDragState.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
  }, [markers, onEditMarker, toNormalized, pushHistory]);

  // 範囲マーカーの端点を個別にドラッグ（自由角度）
  const handleRangeHandlePointerDown = useCallback((e, markerId, endpoint) => {
    e.stopPropagation();
    e.preventDefault();
    rangeDragState.current = { markerId, endpoint, moved: false };

    const handleMove = (ev) => {
      ev.preventDefault();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { x, y } = toNormalized(cx, cy);
      const marker = markers.find(m => m.id === markerId);
      if (!marker) return;
      if (rangeDragState.current && !rangeDragState.current.moved) {
        pushHistory();
        rangeDragState.current.moved = true;
      }

      if (endpoint === 'start') {
        onEditMarker(markerId, {
          rangeStart: { x, y },
          x: (x + marker.rangeEnd.x) / 2,
          y: (y + marker.rangeEnd.y) / 2,
        });
      } else {
        onEditMarker(markerId, {
          rangeEnd: { x, y },
          x: (marker.rangeStart.x + x) / 2,
          y: (marker.rangeStart.y + y) / 2,
        });
      }
    };

    const handleUp = () => {
      rangeDragState.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
  }, [markers, onEditMarker, toNormalized, pushHistory]);

  const getLabelPos = (m) => {
    const lx = m.labelX != null ? m.labelX : m.x;
    const ly = m.labelY != null ? m.labelY : Math.max(0.02, m.y - DEFAULT_LABEL_OFFSET_Y);
    return { lx, ly };
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* 写真 */}
      <div className="relative cursor-crosshair" onClick={handleImageTap}>
        <img
          ref={imgRef}
          src={imageUrl}
          className="w-full h-auto block"
          draggable={false}
          alt="全景写真"
        />

        {/* SVG矢印レイヤー */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{ zIndex: 11 }}
        >
          {markers.filter(m => !m.collapsed).map(m => {
            const { lx, ly } = getLabelPos(m);
            const ax = m.x * 1000;
            const ay = m.y * 1000;
            const bx = lx * 1000;
            const by = ly * 1000;
            const color = PART_COLORS[m.part] || '#6b7280';
            const isSelected = selectedMarkerId === m.id;

            const dx = ax - bx;
            const dy = ay - by;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) return null;
            const nx = dx / dist;
            const ny = dy / dist;
            const tipX = ax - nx * 8;
            const tipY = ay - ny * 8;
            const headSize = 12;
            const p1x = tipX - headSize * nx + headSize * 0.4 * ny;
            const p1y = tipY - headSize * ny - headSize * 0.4 * nx;
            const p2x = tipX - headSize * nx - headSize * 0.4 * ny;
            const p2y = tipY - headSize * ny + headSize * 0.4 * nx;

            // 範囲マーカーの場合は線分描画（端線は軸に垂直）
            const isRange = m.type === 'range' && m.rangeStart && m.rangeEnd;
            const sx = isRange ? m.rangeStart.x * 1000 : 0;
            const sy = isRange ? m.rangeStart.y * 1000 : 0;
            const ex = isRange ? m.rangeEnd.x * 1000 : 0;
            const ey = isRange ? m.rangeEnd.y * 1000 : 0;

            // 軸に垂直な端線を計算
            let perpSx1 = 0, perpSy1 = 0, perpSx2 = 0, perpSy2 = 0;
            let perpEx1 = 0, perpEy1 = 0, perpEx2 = 0, perpEy2 = 0;
            if (isRange) {
              const rdx = ex - sx;
              const rdy = ey - sy;
              const rLen = Math.sqrt(rdx * rdx + rdy * rdy);
              if (rLen > 0) {
                // 軸に垂直な単位ベクトル
                const px = -rdy / rLen;
                const py = rdx / rLen;
                const tickH = Math.max(12, Math.min(30, rLen * 0.15));
                perpSx1 = sx + px * tickH; perpSy1 = sy + py * tickH;
                perpSx2 = sx - px * tickH; perpSy2 = sy - py * tickH;
                perpEx1 = ex + px * tickH; perpEy1 = ey + py * tickH;
                perpEx2 = ex - px * tickH; perpEy2 = ey - py * tickH;
              }
            }

            return (
              <g key={m.id} opacity={isSelected ? 1 : 0.85}>
                {/* 矢印線（テキストボックス→対象点中心） */}
                <line
                  x1={bx} y1={by} x2={tipX} y2={tipY}
                  stroke={color} strokeWidth={isSelected ? '3.5' : '2.5'}
                  vectorEffect="non-scaling-stroke"
                />
                <polygon
                  points={`${ax},${ay} ${p1x},${p1y} ${p2x},${p2y}`}
                  fill={color}
                />

                {isRange ? (
                  <>
                    {/* 範囲: 軸線 */}
                    <line
                      x1={sx} y1={sy} x2={ex} y2={ey}
                      stroke={color} strokeWidth={isSelected ? '3' : '2'}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* 範囲: 始点の端線（軸に垂直） */}
                    <line
                      x1={perpSx1} y1={perpSy1} x2={perpSx2} y2={perpSy2}
                      stroke={color} strokeWidth={isSelected ? '3' : '2'}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* 範囲: 終点の端線（軸に垂直） */}
                    <line
                      x1={perpEx1} y1={perpEy1} x2={perpEx2} y2={perpEy2}
                      stroke={color} strokeWidth={isSelected ? '3' : '2'}
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                ) : (
                  /* 通常: 対象点 */
                  <circle
                    cx={ax} cy={ay} r={isSelected ? '7' : '5'}
                    fill={color} stroke="white" strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* マーカー: テキストボックス or 折り畳み点 */}
        {markers.map(m => {
          const color = PART_COLORS[m.part] || '#6b7280';
          const isEditingThis = editingTextId === m.id;
          const isSelected = selectedMarkerId === m.id;

          // 折り畳み状態
          if (m.collapsed) {
            return (
              <div
                key={m.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={{
                  left: `${m.x * 100}%`,
                  top: `${m.y * 100}%`,
                  zIndex: isSelected ? 25 : 15,
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  pushHistory();
                  onEditMarker(m.id, { collapsed: false });
                }}
              >
                <div
                  className="rounded-full border-2 border-white"
                  style={{
                    width: isSelected ? 20 : 16,
                    height: isSelected ? 20 : 16,
                    backgroundColor: color,
                    boxShadow: isSelected
                      ? '0 0 0 3px rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.5)'
                      : '0 1px 4px rgba(0,0,0,0.5)',
                    transition: 'all 0.2s ease',
                  }}
                />
              </div>
            );
          }

          // 展開状態
          const { lx, ly } = getLabelPos(m);

          return (
            <div
              key={m.id}
              className="absolute"
              style={{
                left: `${lx * 100}%`,
                top: `${ly * 100}%`,
                transform: `translate(-50%, -50%) scale(${isSelected && !isEditingThis ? 1.05 : 1.0})`,
                zIndex: isSelected ? 30 : 20,
                touchAction: 'none',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onPointerDown={(e) => handleBoxPointerDown(e, m.id)}
            >
              <div
                style={{
                  background: 'white',
                  border: `${isSelected ? 3 : 2}px solid ${color}`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 12,
                  color: '#000',
                  boxShadow: isSelected
                    ? '0 4px 12px rgba(0,0,0,0.4)'
                    : '0 2px 6px rgba(0,0,0,0.25)',
                  minWidth: 80,
                  maxWidth: 240,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  cursor: isEditingThis ? 'text' : 'grab',
                  userSelect: isEditingThis ? 'text' : 'none',
                  transition: 'border-width 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                {isEditingThis ? (
                  <textarea
                    value={editingText}
                    onChange={(e) => {
                      // 高さ自動調整（max-height 内）
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      setEditingText(e.target.value);
                    }}
                    onBlur={commitTextEdit}
                    onKeyDown={(e) => {
                      // Enter は改行を許可（commit は blur で行う）
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingTextId(null);
                        setEditingText('');
                      }
                    }}
                    autoFocus
                    rows={1}
                    ref={(el) => {
                      if (el) {
                        el.style.height = 'auto';
                        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                      }
                    }}
                    className="w-full border-none outline-none bg-transparent text-black"
                    style={{
                      fontSize: 'inherit',
                      padding: 0,
                      margin: 0,
                      resize: 'none',
                      overflowY: 'auto',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.35',
                      minHeight: 18,
                      maxHeight: 120,
                      width: '100%',
                      display: 'block',
                      fontFamily: 'inherit',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="select-none">{m.text ?? m.item}</span>
                )}
              </div>
            </div>
          );
        })}

        {/* 点マーカーの対象点ドラッグハンドル（選択中のみ） */}
        {markers
          .filter(m => (m.type ?? 'point') === 'point' && !m.collapsed && selectedMarkerId === m.id)
          .map(m => {
            const color = PART_COLORS[m.part] || '#6b7280';
            return (
              <div
                key={`point-handle-${m.id}`}
                className="absolute rounded-full"
                style={{
                  left: `${m.x * 100}%`,
                  top: `${m.y * 100}%`,
                  width: 22, height: 22,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: color,
                  border: '3px solid white',
                  boxShadow: '0 0 0 2px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.4)',
                  cursor: 'grab',
                  zIndex: 35,
                  touchAction: 'none',
                }}
                onPointerDown={(e) => handlePointTargetPointerDown(e, m.id)}
                title="ドラッグして対象点を移動"
              />
            );
          })}

        {/* 範囲マーカーの両端ドラッグハンドル */}
        {markers.filter(m => m.type === 'range' && !m.collapsed && m.rangeStart && m.rangeEnd).map(m => {
          const color = PART_COLORS[m.part] || '#6b7280';
          return (
            <div key={`range-handles-${m.id}`}>
              {/* 始点ハンドル */}
              <div
                className="absolute rounded-full cursor-grab"
                style={{
                  left: `${m.rangeStart.x * 100}%`,
                  top: `${m.rangeStart.y * 100}%`,
                  width: 18, height: 18,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'white',
                  border: `3px solid ${color}`,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  zIndex: 35,
                  touchAction: 'none',
                }}
                onPointerDown={(e) => handleRangeHandlePointerDown(e, m.id, 'start')}
              />
              {/* 終点ハンドル */}
              <div
                className="absolute rounded-full cursor-grab"
                style={{
                  left: `${m.rangeEnd.x * 100}%`,
                  top: `${m.rangeEnd.y * 100}%`,
                  width: 18, height: 18,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'white',
                  border: `3px solid ${color}`,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  zIndex: 35,
                  touchAction: 'none',
                }}
                onPointerDown={(e) => handleRangeHandlePointerDown(e, m.id, 'end')}
              />
            </div>
          );
        })}

        {/* 仮マーカー */}
        {pendingPos && (
          <div
            className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${pendingPos.x * 100}%`,
              top: `${pendingPos.y * 100}%`,
            }}
          >
            <div className="w-5 h-5 rounded-full border-2 border-white bg-stone-400 opacity-60 animate-pulse" />
          </div>
        )}
      </div>

      {/* マーカーラベル一覧（写真下）: 双方向ハイライト + アクション */}
      {markers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {markers.map(m => {
            const color = PART_COLORS[m.part];
            const lightColor = PART_LIGHT_COLORS[m.part] || '#f5f5f5';
            const isSelected = selectedMarkerId === m.id;
            return (
              <div key={m.id} className="relative inline-flex flex-col items-center">
                <button
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border cursor-pointer"
                  style={{
                    borderColor: color,
                    color: isSelected ? '#000' : color,
                    backgroundColor: isSelected ? lightColor : 'transparent',
                    transform: isSelected ? 'translateY(-3px)' : 'translateY(0)',
                    boxShadow: isSelected ? '0 4px 8px rgba(0,0,0,0.15)' : 'none',
                    opacity: m.collapsed ? 0.5 : 1,
                    transition: 'all 0.2s ease',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(m.id);
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {m.item}
                </button>
                {/* 選択中のアクションボタン */}
                {isSelected && (
                  <div className="flex gap-1 mt-1" style={{ transition: 'all 0.2s ease' }}>
                    <button
                      className="px-2 py-0.5 text-[10px] rounded border border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        pushHistory();
                        onEditMarker(m.id, { collapsed: !m.collapsed });
                        if (onSelectMarker) onSelectMarker(null);
                      }}
                    >
                      {m.collapsed ? '展開' : '収納'}
                    </button>
                    <button
                      className="px-2 py-0.5 text-[10px] rounded border border-red-300 bg-white text-red-600 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`「${m.item}」を削除しますか？`)) {
                          pushHistory();
                          onDeleteMarker(m.id);
                          if (onSelectMarker) onSelectMarker(null);
                        }
                      }}
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 編集メニュー */}
      {showEditMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowEditMenu(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative bg-white rounded-xl shadow-xl p-4 min-w-[240px]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: PART_COLORS[showEditMenu.part] }}
              />
              <span className="text-sm font-medium">{showEditMenu.part}</span>
            </div>
            <p className="text-sm text-stone-700 mb-4">{showEditMenu.item}</p>
            <div className="flex gap-2">
              <button
                onClick={handleEditFromMenu}
                className="flex-1 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                部位/項目変更
              </button>
              <button
                onClick={handleDeleteFromMenu}
                className="flex-1 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* チップシート */}
      <MarkerSheet
        isOpen={!!pendingPos || !!chipEditingMarker}
        editingMarker={chipEditingMarker}
        onConfirm={handleSheetConfirm}
        onCancel={handleSheetCancel}
      />
    </div>
  );
});

export default MarkerOverlay;

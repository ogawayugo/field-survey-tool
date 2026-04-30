import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Leaf, Plus, Trash2, Camera, Download, ChevronLeft, ChevronRight, Save, Check, Settings, Image as ImageIcon } from 'lucide-react';

import { storage } from './lib/storage';
import { compressImage } from './lib/imageCompress';
import { formatTreeText, exportJSON } from './lib/exportHelpers';
import { STORAGE, WINDOW_SIZE, SAVE_DEBOUNCE_MS, PLANTING_FORMS, STAKE_STATES } from './config/constants';

import Section from './components/Section';
import Field from './components/Field';
import SegmentedControl from './components/SegmentedControl';
import TreePill from './components/TreePill';
import PhotoCard from './components/PhotoCard';
import PhotoViewer from './components/PhotoViewer';
import ExportModal from './components/ExportModal';
import SurveyMetaPanel from './components/SurveyMetaPanel';

const emptyMeta = (id) => ({
  id,
  treeNumber: '',
  species: '',
  height: '',
  girth: '',
  spread: '',
  plantingForm: '',
  stake: '',
  vitalitySei: '',
  vitalityKei: '',
  memo: '',
  photoIds: [],
  createdAt: new Date().toISOString(),
});

const runIdle = (fn) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 1500 });
  } else {
    setTimeout(fn, 0);
  }
};

export default function App() {
  const [treeIds, setTreeIds] = useState([]);
  const [allMeta, setAllMeta] = useState({});
  const [loadedPhotos, setLoadedPhotos] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [surveyMeta, setSurveyMeta] = useState({ route: '', office: '', date: '', diagnostician: '' });

  const [loading, setLoading] = useState(true);
  const [showMeta, setShowMeta] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);

  const allMetaRef = useRef(allMeta);
  const loadedPhotosRef = useRef(loadedPhotos);
  const treeIdsRef = useRef(treeIds);
  useEffect(() => { allMetaRef.current = allMeta; }, [allMeta]);
  useEffect(() => { loadedPhotosRef.current = loadedPhotos; }, [loadedPhotos]);
  useEffect(() => { treeIdsRef.current = treeIds; }, [treeIds]);

  const saveTimers = useRef({});
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    loadAll();
    return () => { flushAllSaves(); };
    // eslint-disable-next-line
  }, []);

  const loadAll = async () => {
    try {
      try {
        const r = await storage.get(STORAGE.meta);
        if (r) setSurveyMeta(JSON.parse(r.value));
      } catch {}

      let ids = [];
      try {
        const r = await storage.get(STORAGE.index);
        if (r) ids = JSON.parse(r.value);
      } catch {}

      const metas = {};
      for (const id of ids) {
        const meta = await loadOrMigrateMeta(id);
        if (meta) metas[id] = meta;
      }

      if (ids.length === 0) {
        const newId = 't' + Date.now();
        const m = emptyMeta(newId);
        ids = [newId];
        metas[newId] = m;
        await storage.set(STORAGE.index, JSON.stringify(ids));
        await storage.set(STORAGE.treeData(newId), JSON.stringify(m));
      }

      setTreeIds(ids);
      setAllMeta(metas);
      treeIdsRef.current = ids;
      allMetaRef.current = metas;

      await loadPhotosForWindow(0, ids);
    } catch (e) {
      console.error('loadAll error:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadOrMigrateMeta = async (id) => {
    try {
      const r = await storage.get(STORAGE.treeData(id));
      if (r) return JSON.parse(r.value);
    } catch {}
    try {
      const r = await storage.get(STORAGE.treeOld(id));
      if (r) {
        const old = JSON.parse(r.value);
        const photos = old.photos || [];
        for (const photo of photos) {
          try {
            await storage.set(STORAGE.treePhoto(id, photo.id), JSON.stringify(photo));
          } catch (e) { console.error('Migrate photo error', e); }
        }
        const { photos: _, ...rest } = old;
        const meta = { ...rest, photoIds: photos.map(p => p.id) };
        await storage.set(STORAGE.treeData(id), JSON.stringify(meta));
        try { await storage.delete(STORAGE.treeOld(id)); } catch {}
        return meta;
      }
    } catch {}
    return null;
  };

  const loadPhotosForTree = async (id) => {
    const meta = allMetaRef.current[id];
    if (!meta) return;
    const photoIds = meta.photoIds || [];
    const photos = [];
    for (const pid of photoIds) {
      try {
        const r = await storage.get(STORAGE.treePhoto(id, pid));
        if (r) photos.push(JSON.parse(r.value));
      } catch {}
    }
    setLoadedPhotos(prev => ({ ...prev, [id]: photos }));
  };

  const loadPhotosForWindow = async (idx, ids = treeIdsRef.current) => {
    const wantIds = new Set();
    for (let i = Math.max(0, idx - WINDOW_SIZE); i <= Math.min(ids.length - 1, idx + WINDOW_SIZE); i++) {
      wantIds.add(ids[i]);
    }
    setLoadedPhotos(prev => {
      const next = {};
      for (const k of Object.keys(prev)) {
        if (wantIds.has(k)) next[k] = prev[k];
      }
      return next;
    });
    for (const id of wantIds) {
      if (!loadedPhotosRef.current[id]) {
        await loadPhotosForTree(id);
      }
    }
  };

  const scheduleSaveMeta = useCallback((id) => {
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      delete saveTimers.current[id];
      const meta = allMetaRef.current[id];
      if (!meta) return;
      runIdle(async () => {
        try {
          await storage.set(STORAGE.treeData(id), JSON.stringify(meta));
        } catch (e) { console.error('save meta error', e); }
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const flushAllSaves = useCallback(() => {
    for (const key of Object.keys(saveTimers.current)) {
      clearTimeout(saveTimers.current[key]);
      if (key.startsWith('photo:')) {
        const [, id, pid] = key.split(':');
        const arr = loadedPhotosRef.current[id] || [];
        const ph = arr.find(p => p.id === pid);
        if (ph) {
          storage.set(STORAGE.treePhoto(id, pid), JSON.stringify(ph)).catch(console.error);
        }
      } else {
        const meta = allMetaRef.current[key];
        if (meta) storage.set(STORAGE.treeData(key), JSON.stringify(meta)).catch(console.error);
      }
    }
    saveTimers.current = {};
  }, []);

  const saveSurveyMeta = useCallback((next) => {
    setSurveyMeta(next);
    runIdle(async () => {
      try { await storage.set(STORAGE.meta, JSON.stringify(next)); } catch (e) { console.error(e); }
    });
  }, []);

  const updateMeta = useCallback((id, changes) => {
    setAllMeta(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...changes } };
      allMetaRef.current = next;
      return next;
    });
    scheduleSaveMeta(id);
  }, [scheduleSaveMeta]);

  const currentId = treeIds[currentIdx];
  const currentMeta = allMeta[currentId];
  const currentPhotos = loadedPhotos[currentId] || [];

  const updateCurrent = useCallback((changes) => {
    if (!currentId) return;
    updateMeta(currentId, changes);
  }, [currentId, updateMeta]);

  const switchTree = useCallback(async (idx) => {
    if (idx === currentIdx) return;
    setCurrentIdx(idx);
    await loadPhotosForWindow(idx);
  }, [currentIdx]);

  const addTree = useCallback(async () => {
    flushAllSaves();
    const newId = 't' + Date.now();
    const newMeta = emptyMeta(newId);
    const newIds = [...treeIdsRef.current, newId];

    setTreeIds(newIds);
    setAllMeta(prev => ({ ...prev, [newId]: newMeta }));
    treeIdsRef.current = newIds;
    allMetaRef.current = { ...allMetaRef.current, [newId]: newMeta };

    setCurrentIdx(newIds.length - 1);

    runIdle(async () => {
      try {
        await storage.set(STORAGE.index, JSON.stringify(newIds));
        await storage.set(STORAGE.treeData(newId), JSON.stringify(newMeta));
      } catch (e) { console.error(e); }
    });

    await loadPhotosForWindow(newIds.length - 1, newIds);
  }, [flushAllSaves]);

  const deleteCurrent = useCallback(async () => {
    if (treeIds.length <= 1) {
      alert('最低1本は必要です');
      return;
    }
    const cm = allMetaRef.current[currentId];
    if (!cm) return;
    if (!window.confirm(`樹木 #${cm.treeNumber || (currentIdx + 1)} を削除しますか？`)) return;

    if (saveTimers.current[currentId]) {
      clearTimeout(saveTimers.current[currentId]);
      delete saveTimers.current[currentId];
    }

    const photoIds = cm.photoIds || [];
    runIdle(async () => {
      try { await storage.delete(STORAGE.treeData(currentId)); } catch {}
      for (const pid of photoIds) {
        try { await storage.delete(STORAGE.treePhoto(currentId, pid)); } catch {}
      }
    });

    const newIds = treeIds.filter(id => id !== currentId);
    const newMetaMap = { ...allMeta };
    delete newMetaMap[currentId];
    const newPhotos = { ...loadedPhotos };
    delete newPhotos[currentId];

    setTreeIds(newIds);
    setAllMeta(newMetaMap);
    setLoadedPhotos(newPhotos);
    treeIdsRef.current = newIds;
    allMetaRef.current = newMetaMap;

    const newIdx = Math.max(0, currentIdx - 1);
    setCurrentIdx(newIdx);

    runIdle(async () => {
      try { await storage.set(STORAGE.index, JSON.stringify(newIds)); } catch (e) { console.error(e); }
    });

    await loadPhotosForWindow(newIdx, newIds);
  }, [treeIds, allMeta, loadedPhotos, currentId, currentIdx]);

  const addPhotos = useCallback(async (e) => {
    const files = e.target.files;
    if (!files || !currentId) return;
    const id = currentId;

    for (const file of Array.from(files)) {
      try {
        const dataUrl = await compressImage(file);
        const pid = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
        const photo = { id: pid, dataUrl, label: '', caption: '', name: file.name };

        runIdle(async () => {
          try {
            await storage.set(STORAGE.treePhoto(id, pid), JSON.stringify(photo));
          } catch (err) { console.error('save photo error', err); }
        });

        setLoadedPhotos(prev => {
          const next = { ...prev, [id]: [...(prev[id] || []), photo] };
          loadedPhotosRef.current = next;
          return next;
        });
        setAllMeta(prev => {
          const meta = prev[id];
          if (!meta) return prev;
          const next = { ...prev, [id]: { ...meta, photoIds: [...(meta.photoIds || []), pid] } };
          allMetaRef.current = next;
          return next;
        });
        scheduleSaveMeta(id);
      } catch (err) {
        alert('画像処理失敗: ' + err.message);
      }
    }
    e.target.value = '';
  }, [currentId, scheduleSaveMeta]);

  const removePhoto = useCallback((pid) => {
    if (!currentId) return;
    const id = currentId;

    runIdle(async () => {
      try { await storage.delete(STORAGE.treePhoto(id, pid)); } catch {}
    });

    setLoadedPhotos(prev => {
      const arr = (prev[id] || []).filter(p => p.id !== pid);
      const next = { ...prev, [id]: arr };
      loadedPhotosRef.current = next;
      return next;
    });
    setAllMeta(prev => {
      const meta = prev[id];
      if (!meta) return prev;
      const next = { ...prev, [id]: { ...meta, photoIds: (meta.photoIds || []).filter(x => x !== pid) } };
      allMetaRef.current = next;
      return next;
    });
    scheduleSaveMeta(id);
  }, [currentId, scheduleSaveMeta]);

  const updatePhoto = useCallback((pid, changes) => {
    if (!currentId) return;
    const id = currentId;

    setLoadedPhotos(prev => {
      const arr = (prev[id] || []).map(p => p.id === pid ? { ...p, ...changes } : p);
      const next = { ...prev, [id]: arr };
      loadedPhotosRef.current = next;
      return next;
    });

    const tk = `photo:${id}:${pid}`;
    if (saveTimers.current[tk]) clearTimeout(saveTimers.current[tk]);
    saveTimers.current[tk] = setTimeout(() => {
      delete saveTimers.current[tk];
      const arr = loadedPhotosRef.current[id] || [];
      const ph = arr.find(p => p.id === pid);
      if (!ph) return;
      runIdle(async () => {
        try {
          await storage.set(STORAGE.treePhoto(id, pid), JSON.stringify(ph));
        } catch (err) { console.error(err); }
      });
    }, SAVE_DEBOUNCE_MS);
  }, [currentId]);

  const manualSave = useCallback(() => {
    flushAllSaves();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }, [flushAllSaves]);

  const handleExportJSON = useCallback(async () => {
    flushAllSaves();
    await exportJSON(treeIdsRef.current, allMetaRef.current, loadedPhotosRef.current, surveyMeta);
    setShowExport(false);
  }, [flushAllSaves, surveyMeta]);

  const copyText = useCallback(async (which) => {
    flushAllSaves();
    let text = '';
    if (which === 'current') {
      text = formatTreeText(currentMeta, currentPhotos, surveyMeta);
    } else {
      const parts = [];
      for (const id of treeIdsRef.current) {
        const m = allMetaRef.current[id];
        if (!m) continue;
        let photos = loadedPhotosRef.current[id];
        if (!photos) {
          photos = [];
          for (const pid of (m.photoIds || [])) {
            try {
              const r = await storage.get(STORAGE.treePhoto(id, pid));
              if (r) photos.push(JSON.parse(r.value));
            } catch {}
          }
        }
        parts.push(formatTreeText(m, photos, surveyMeta));
      }
      text = parts.join('\n\n');
    }
    navigator.clipboard.writeText(text);
    setCopiedFlash(which);
    setTimeout(() => setCopiedFlash(null), 1500);
    setShowExport(false);
  }, [flushAllSaves, surveyMeta, currentMeta, currentPhotos]);

  const totalPhotos = treeIds.reduce((s, id) => s + ((allMeta[id]?.photoIds || []).length), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f1' }}>
        <div className="text-stone-500">読み込み中...</div>
      </div>
    );
  }

  if (!currentMeta) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f1' }}>
        <div className="text-stone-500">データの読み込みに失敗しました</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: '#faf7f1' }}>
      <header className="sticky top-0 z-20 border-b border-stone-300" style={{ background: 'rgba(250, 247, 241, 0.95)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Leaf className="w-5 h-5 text-emerald-900 flex-shrink-0" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <h1 className="serif text-base sm:text-lg font-medium text-stone-900 leading-tight">街路樹現場調査</h1>
            <p className="text-[10px] text-stone-500 tracking-wider uppercase">Field Survey · {treeIds.length}本 / 写真{totalPhotos}枚</p>
          </div>
          <button onClick={() => setShowMeta(!showMeta)} className="p-2 hover:bg-stone-200/60 transition-colors" title="調査全体の情報">
            <Settings className="w-4 h-4 text-stone-700" strokeWidth={1.5} />
          </button>
          <button onClick={() => setShowExport(true)} className="px-3 py-2 bg-emerald-900 hover:bg-emerald-800 text-white text-xs flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" strokeWidth={2} />
            エクスポート
          </button>
        </div>

        {showMeta && <SurveyMetaPanel surveyMeta={surveyMeta} onUpdate={saveSurveyMeta} />}

        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
          <button onClick={() => currentIdx > 0 && switchTree(currentIdx - 1)} disabled={currentIdx === 0} className="p-1.5 disabled:opacity-30 hover:bg-stone-200/60">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-1.5 min-w-min">
              {treeIds.map((id, i) => (
                <TreePill
                  key={id}
                  treeNumber={allMeta[id]?.treeNumber || ''}
                  species={allMeta[id]?.species || ''}
                  index={i}
                  isActive={i === currentIdx}
                  onClick={() => switchTree(i)}
                />
              ))}
              <button onClick={addTree} className="px-3 py-1.5 text-xs whitespace-nowrap border border-dashed border-stone-400 text-stone-600 hover:border-emerald-700 hover:text-emerald-800 flex items-center gap-1">
                <Plus className="w-3 h-3" />
                追加
              </button>
            </div>
          </div>
          <button onClick={() => currentIdx < treeIds.length - 1 && switchTree(currentIdx + 1)} disabled={currentIdx >= treeIds.length - 1} className="p-1.5 disabled:opacity-30 hover:bg-stone-200/60">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="serif text-2xl font-medium text-stone-900">
            樹木 {currentMeta.treeNumber || `#${currentIdx + 1}`}
            {currentMeta.species && <span className="text-base text-stone-500 ml-3">{currentMeta.species}</span>}
          </h2>
          <span className="text-[10px] text-stone-500 tracking-widest">{currentIdx + 1} / {treeIds.length}</span>
        </div>
        <div className="ink-line mb-6" />

        <Section title="基本情報">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="樹木番号">
              <input type="text" value={currentMeta.treeNumber} onChange={e => updateCurrent({ treeNumber: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" />
            </Field>
            <Field label="樹種">
              <input type="text" value={currentMeta.species} onChange={e => updateCurrent({ species: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" placeholder="アカガシ" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Field label="樹高 (m)">
              <input type="text" inputMode="decimal" value={currentMeta.height} onChange={e => updateCurrent({ height: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" />
            </Field>
            <Field label="幹周 (㎝)">
              <input type="text" inputMode="decimal" value={currentMeta.girth} onChange={e => updateCurrent({ girth: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" />
            </Field>
            <Field label="枝張 (m)">
              <input type="text" inputMode="decimal" value={currentMeta.spread} onChange={e => updateCurrent({ spread: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="植栽形態">
              <SegmentedControl options={PLANTING_FORMS} value={currentMeta.plantingForm} onChange={v => updateCurrent({ plantingForm: v })} />
            </Field>
            <Field label="支柱">
              <SegmentedControl options={STAKE_STATES} value={currentMeta.stake} onChange={v => updateCurrent({ stake: v })} />
            </Field>
          </div>
        </Section>

        <Section title="活力度">
          <div className="grid grid-cols-2 gap-3">
            <Field label="樹勢 (1-5)">
              <SegmentedControl options={['1', '2', '3', '4', '5']} value={currentMeta.vitalitySei} onChange={v => updateCurrent({ vitalitySei: v })} compact />
            </Field>
            <Field label="樹形 (1-5)">
              <SegmentedControl options={['1', '2', '3', '4', '5']} value={currentMeta.vitalityKei} onChange={v => updateCurrent({ vitalityKei: v })} compact />
            </Field>
          </div>
        </Section>

        <Section title="現場メモ">
          <textarea
            value={currentMeta.memo}
            onChange={e => updateCurrent({ memo: e.target.value })}
            rows={8}
            className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700 leading-relaxed"
            placeholder={"例：\n根元に露出根被害5×20cm、踏圧強い\n幹は南方向に小さく傾斜\n枝は被圧を受けて葉が少なめ"}
          />
          <p className="text-[11px] text-stone-500 mt-2">
            部位（根元・幹・枝）・寸法・方向・程度を含めると、後でカルテへ落とし込みやすくなります
          </p>
        </Section>

        <Section title={`写真 (${currentPhotos.length}枚)`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            {currentPhotos.map((p) => (
              <PhotoCard
                key={p.id}
                photo={p}
                onView={() => setViewingPhoto(p)}
                onChange={(changes) => updatePhoto(p.id, changes)}
                onRemove={() => removePhoto(p.id)}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => cameraInputRef.current?.click()} className="py-3 border border-stone-300 bg-white text-sm hover:border-emerald-700 hover:text-emerald-800 flex items-center justify-center gap-2 transition-colors">
              <Camera className="w-4 h-4" />
              カメラで撮影
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="py-3 border border-stone-300 bg-white text-sm hover:border-emerald-700 hover:text-emerald-800 flex items-center justify-center gap-2 transition-colors">
              <ImageIcon className="w-4 h-4" />
              ライブラリから
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={addPhotos} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
        </Section>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-stone-300 z-20" style={{ background: 'rgba(250, 247, 241, 0.96)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex gap-2">
          <button onClick={deleteCurrent} className="px-3 py-2.5 border border-stone-300 text-red-800 hover:border-red-700 hover:bg-red-50 transition-colors flex items-center justify-center" title="この樹を削除">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={manualSave} className="flex-1 py-2.5 border border-emerald-900 text-emerald-900 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2 text-sm">
            {savedFlash ? <><Check className="w-4 h-4" />保存しました</> : <><Save className="w-4 h-4" />保存</>}
          </button>
          <button onClick={addTree} className="flex-1 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white transition-colors flex items-center justify-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            次の樹
          </button>
        </div>
      </footer>

      {showExport && (
        <ExportModal
          treeCount={treeIds.length}
          totalPhotos={totalPhotos}
          copiedFlash={copiedFlash}
          onExportJSON={handleExportJSON}
          onCopyText={copyText}
          onClose={() => setShowExport(false)}
        />
      )}

      <PhotoViewer photo={viewingPhoto} onClose={() => setViewingPhoto(null)} />
    </div>
  );
}

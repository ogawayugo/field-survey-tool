import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Leaf, Plus, Trash2, Camera, Download, ChevronLeft, ChevronRight, Save, Check, Settings, Image as ImageIcon, Undo2, Redo2, X } from 'lucide-react';

import { storage } from './lib/storage';
import { compressImage } from './lib/imageCompress';
import { formatTreeText, exportJSON, exportXLSX, exportZIP, loadAllTreesWithPhotos } from './lib/exportHelpers';
import { STORAGE, WINDOW_SIZE, SAVE_DEBOUNCE_MS, PLANTING_FORMS, STAKE_STATES } from './config/constants';

import Section from './components/Section';
import Field from './components/Field';
import SegmentedControl from './components/SegmentedControl';
import TreePill from './components/TreePill';
import PhotoCard from './components/PhotoCard';
import PhotoViewer from './components/PhotoViewer';
import PhotoFrameGrid from './components/PhotoFrameGrid';
import MarkerOverlay from './components/MarkerOverlay';
import ExportModal from './components/ExportModal';
import SettingsModal from './components/SettingsModal';
import JudgmentPanel, { JudgmentButton } from './components/JudgmentPanel';
import ThreeChoicePanel from './components/ThreeChoicePanel.jsx';
import ObservationPanel from './components/ObservationPanel';
import TreatmentPanel from './components/TreatmentPanel';
import NextDiagnosisPanel from './components/NextDiagnosisPanel';
import LocationPanel from './components/LocationPanel';
import { generateMemoFromMarkers, generateVitalityReason } from './lib/generateJudgmentReason.js';
import { loadExtractionRules, extractSummaryWithCache } from './lib/markerExtractor.js';
import { JUDGMENT_LEVELS } from './config/constants.js';

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
  memoSupplement: '',
  photoIds: [],
  markers: [],
  vitalityJudgment: '',
  partJudgments: { 根元: '', 幹: '', 大枝: '' },
  appearanceJudgment: '',
  threeChoiceJudgments: {
    root:   { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    trunk:  { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
    branch: { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
  },
  vitalityReason: '',
  appearanceReason: '',
  overallJudgment: '',
  overallReason: '',
  specialNotes: '',
  treatment: null,
  nextDiagnosis: null,
  nextDiagnosisTiming: null,
  location: null,
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [markerHistory, setMarkerHistory] = useState([]);
  const [markerRedoStack, setMarkerRedoStack] = useState([]);
  const [isUndoBarOpen, setIsUndoBarOpen] = useState(true);

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
      // 抽出ルールを最優先で読み込み（以降の extractSummary 呼び出しで使う）
      await loadExtractionRules();

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
    let meta = null;
    try {
      const r = await storage.get(STORAGE.treeData(id));
      if (r) meta = JSON.parse(r.value);
    } catch {}
    if (!meta) {
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
          meta = { ...rest, photoIds: photos.map(p => p.id) };
          await storage.set(STORAGE.treeData(id), JSON.stringify(meta));
          try { await storage.delete(STORAGE.treeOld(id)); } catch {}
        }
      } catch {}
    }
    if (!meta) return null;
    // 新フィールドのデフォルト補完
    if (meta.vitalityJudgment === undefined) meta.vitalityJudgment = '';
    if (!meta.partJudgments) meta.partJudgments = { 根元: '', 幹: '', 大枝: '' };
    if (meta.appearanceJudgment === undefined) meta.appearanceJudgment = '';
    // 3択項目のデフォルト補完
    if (!meta.threeChoiceJudgments) {
      meta.threeChoiceJudgments = {
        root:   { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
        trunk:  { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
        branch: { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' },
      };
    } else {
      for (const partKey of ['root', 'trunk', 'branch']) {
        if (!meta.threeChoiceJudgments[partKey]) {
          meta.threeChoiceJudgments[partKey] = { barkDeath: 'none', cavityShallow: 'none', cavityDeep: 'none' };
        } else {
          for (const itemKey of ['barkDeath', 'cavityShallow', 'cavityDeep']) {
            if (!meta.threeChoiceJudgments[partKey][itemKey]) {
              meta.threeChoiceJudgments[partKey][itemKey] = 'none';
            }
          }
        }
      }
    }
    // v2.5: 分割メモを統合メモに移行
    if (meta.memoNemoto || meta.memoMiki || meta.memoOoeda || meta.memoGeneral) {
      if (!meta.memo) {
        const parts = [];
        if (meta.memoNemoto) parts.push('根元:' + meta.memoNemoto.replace(/\n/g, '、'));
        if (meta.memoMiki) parts.push('幹:' + meta.memoMiki.replace(/\n/g, '、'));
        if (meta.memoOoeda) parts.push('大枝:' + meta.memoOoeda.replace(/\n/g, '、'));
        if (meta.memoGeneral) parts.push(meta.memoGeneral);
        meta.memo = parts.join('\n');
      }
      delete meta.memoNemoto;
      delete meta.memoMiki;
      delete meta.memoOoeda;
      delete meta.memoGeneral;
    }
    if (meta.vitalityReason === undefined) meta.vitalityReason = '';
    if (meta.appearanceReason === undefined) meta.appearanceReason = '';
    if (meta.overallJudgment === undefined) meta.overallJudgment = '';
    if (meta.overallReason === undefined) meta.overallReason = '';
    if (meta.specialNotes === undefined) meta.specialNotes = '';
    if (meta.memoSupplement === undefined) meta.memoSupplement = '';
    if (meta.treatment === undefined) meta.treatment = null;
    if (meta.nextDiagnosis === undefined) meta.nextDiagnosis = null;
    if (meta.nextDiagnosisTiming === undefined) meta.nextDiagnosisTiming = null;
    if (meta.location === undefined) meta.location = null;
    // 写真ファーストフロー: markersフィールド補完
    if (!meta.markers) {
      meta.markers = [];
      // 旧形式メモが存在する場合は _legacyMemo を保持（変換促進バナー用）
      if (meta.memo && meta.memo.trim()) {
        meta._legacyMemo = meta.memo;
      }
    } else {
      // 既存マーカーに collapsed / labelX / labelY / type / text / summary / summaryEdited を補完
      meta.markers = meta.markers.map(m => {
        const next = {
          ...m,
          type: m.type ?? 'point',
          collapsed: m.collapsed ?? false,
          labelX: m.labelX ?? m.x,
          labelY: m.labelY ?? Math.max(0.02, m.y - 0.12),
        };
        if (typeof next.text !== 'string') next.text = next.item || '';
        if (typeof next.summaryEdited !== 'boolean') next.summaryEdited = false;
        if (typeof next.summary !== 'string') {
          next.summary = extractSummaryWithCache(next.text, next.item, next.part);
        }
        return next;
      });
    }
    delete meta.diagnostics;
    return meta;
  };

  const inferRoleFromIndex = (index) => {
    if (index === 0) return 'main';
    if (index === 1) return 'closeup1';
    if (index === 2) return 'closeup2';
    if (index === 3) return 'closeup3';
    return 'spare';
  };

  const loadPhotosForTree = async (id) => {
    const meta = allMetaRef.current[id];
    if (!meta) return;
    const photoIds = meta.photoIds || [];
    const photos = [];
    for (let i = 0; i < photoIds.length; i++) {
      const pid = photoIds[i];
      try {
        const r = await storage.get(STORAGE.treePhoto(id, pid));
        if (r) {
          const photo = JSON.parse(r.value);
          if (!photo.annotations) photo.annotations = [];
          // 写真ファーストフロー: roleがなければインデックスから推定
          if (!photo.role) {
            photo.role = inferRoleFromIndex(i);
          }
          photos.push(photo);
        }
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
    setMarkerHistory([]);
    setMarkerRedoStack([]);
    setSelectedMarkerId(null);
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
    setMarkerHistory([]);
    setMarkerRedoStack([]);
    setSelectedMarkerId(null);

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
    setMarkerHistory([]);
    setMarkerRedoStack([]);
    setSelectedMarkerId(null);

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
        // 写真ファーストフロー: 次の空き role を自動割当
        const existingPhotos = loadedPhotosRef.current[id] || [];
        const usedRoles = new Set(existingPhotos.map(p => p.role));
        let role = 'spare';
        for (const r of ['main', 'closeup1', 'closeup2', 'closeup3']) {
          if (!usedRoles.has(r)) { role = r; break; }
        }
        const photo = { id: pid, dataUrl, label: '', caption: '', name: file.name, role };

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

  // 写真ファーストフロー: 特定roleに写真を割り当てる
  const pendingRoleRef = useRef('spare');
  const cameraRoleInputRef = useRef(null);
  const fileRoleInputRef = useRef(null);

  const handleTakePhotoForRole = useCallback((role) => {
    pendingRoleRef.current = role;
    cameraRoleInputRef.current?.click();
  }, []);

  const handlePickPhotoForRole = useCallback((role) => {
    pendingRoleRef.current = role;
    fileRoleInputRef.current?.click();
  }, []);

  const addPhotosWithRole = useCallback(async (e) => {
    const files = e.target.files;
    if (!files || !currentId) return;
    const id = currentId;
    const role = pendingRoleRef.current;

    for (const file of Array.from(files)) {
      try {
        const dataUrl = await compressImage(file);
        const pid = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
        const photo = { id: pid, dataUrl, label: '', caption: '', name: file.name, role };

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
    pendingRoleRef.current = 'spare';
  }, [currentId, scheduleSaveMeta]);

  // 写真のroleスワップ
  const handleSwapRole = useCallback((sourcePhotoId, targetRole) => {
    if (!currentId) return;
    const id = currentId;
    const photos = loadedPhotosRef.current[id] || [];

    const sourcePhoto = photos.find(p => p.id === sourcePhotoId);
    if (!sourcePhoto) return;

    const targetPhoto = photos.find(p => p.role === targetRole);
    const sourceRole = sourcePhoto.role;

    const updated = photos.map(p => {
      if (p.id === sourcePhotoId) return { ...p, role: targetRole };
      if (targetPhoto && p.id === targetPhoto.id) return { ...p, role: sourceRole };
      return p;
    });

    setLoadedPhotos(prev => {
      const next = { ...prev, [id]: updated };
      loadedPhotosRef.current = next;
      return next;
    });

    // 両方のphotoをsave
    const toSave = [sourcePhotoId];
    if (targetPhoto) toSave.push(targetPhoto.id);
    for (const pid of toSave) {
      const ph = updated.find(p => p.id === pid);
      if (ph) {
        const tk = `photo:${id}:${pid}`;
        if (saveTimers.current[tk]) clearTimeout(saveTimers.current[tk]);
        saveTimers.current[tk] = setTimeout(() => {
          delete saveTimers.current[tk];
          runIdle(async () => {
            try {
              await storage.set(STORAGE.treePhoto(id, pid), JSON.stringify(ph));
            } catch (err) { console.error(err); }
          });
        }, SAVE_DEBOUNCE_MS);
      }
    }
  }, [currentId]);

  // マーカー履歴: 現在の樹のマーカー配列のスナップショットを履歴に積む（最大20件）
  // 新規操作なので redo スタックはクリア
  const pushMarkerHistory = useCallback(() => {
    if (!currentId) return;
    const cur = allMetaRef.current[currentId];
    if (!cur) return;
    const snapshot = cur.markers || [];
    setMarkerHistory(prev => {
      const next = [...prev, snapshot];
      return next.length > 20 ? next.slice(-20) : next;
    });
    setMarkerRedoStack([]);
  }, [currentId]);

  // マーカー操作ハンドラー
  const handleAddMarker = useCallback((marker) => {
    const markers = [...(currentMeta?.markers || []), marker];
    const memo = generateMemoFromMarkers(markers);
    updateCurrent({ markers, memo });
  }, [currentMeta?.markers, updateCurrent]);

  const handleEditMarker = useCallback((markerId, changes) => {
    const markers = (currentMeta?.markers || []).map(m =>
      m.id === markerId ? { ...m, ...changes } : m
    );
    const memo = generateMemoFromMarkers(markers);
    updateCurrent({ markers, memo });
  }, [currentMeta?.markers, updateCurrent]);

  const handleDeleteMarker = useCallback((markerId) => {
    const markers = (currentMeta?.markers || []).filter(m => m.id !== markerId);
    const memo = generateMemoFromMarkers(markers);
    updateCurrent({ markers, memo });
  }, [currentMeta?.markers, updateCurrent]);

  const handleUndoMarker = useCallback(() => {
    if (!currentId) return;
    if (markerHistory.length === 0) return;
    const cur = allMetaRef.current[currentId];
    const currentMarkers = cur?.markers || [];
    const last = markerHistory[markerHistory.length - 1];
    const memo = generateMemoFromMarkers(last);
    updateMeta(currentId, { markers: last, memo });
    setMarkerHistory(prev => prev.slice(0, -1));
    setMarkerRedoStack(prev => {
      const next = [...prev, currentMarkers];
      return next.length > 20 ? next.slice(-20) : next;
    });
    setSelectedMarkerId(null);
  }, [currentId, markerHistory, updateMeta]);

  const handleRedoMarker = useCallback(() => {
    if (!currentId) return;
    if (markerRedoStack.length === 0) return;
    const cur = allMetaRef.current[currentId];
    const currentMarkers = cur?.markers || [];
    const next = markerRedoStack[markerRedoStack.length - 1];
    const memo = generateMemoFromMarkers(next);
    updateMeta(currentId, { markers: next, memo });
    setMarkerRedoStack(prev => prev.slice(0, -1));
    setMarkerHistory(prev => {
      const nextHist = [...prev, currentMarkers];
      return nextHist.length > 20 ? nextHist.slice(-20) : nextHist;
    });
    setSelectedMarkerId(null);
  }, [currentId, markerRedoStack, updateMeta]);

  const manualSave = useCallback(() => {
    flushAllSaves();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }, [flushAllSaves]);

  const getTreesForKarte = useCallback(async () => {
    flushAllSaves();
    return await loadAllTreesWithPhotos(treeIdsRef.current, allMetaRef.current, loadedPhotosRef.current);
  }, [flushAllSaves]);

  const handleExportJSON = useCallback(async () => {
    flushAllSaves();
    await exportJSON(treeIdsRef.current, allMetaRef.current, loadedPhotosRef.current, surveyMeta);
    setShowExport(false);
  }, [flushAllSaves, surveyMeta]);

  const handleExportXLSX = useCallback(async () => {
    flushAllSaves();
    const fullTrees = await loadAllTreesWithPhotos(treeIdsRef.current, allMetaRef.current, loadedPhotosRef.current);
    await exportXLSX(fullTrees, surveyMeta);
    setShowExport(false);
  }, [flushAllSaves, surveyMeta]);

  const handleExportZIP = useCallback(async () => {
    flushAllSaves();
    const fullTrees = await loadAllTreesWithPhotos(treeIdsRef.current, allMetaRef.current, loadedPhotosRef.current);
    await exportZIP(fullTrees, surveyMeta);
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
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-stone-200/60 transition-colors" title="調査全体の情報">
            <Settings className="w-4 h-4 text-stone-700" strokeWidth={1.5} />
          </button>
          <button onClick={() => setShowExport(true)} className="px-3 py-2 bg-emerald-900 hover:bg-emerald-800 text-white text-xs flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" strokeWidth={2} />
            エクスポート
          </button>
        </div>

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
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="樹勢 (1-5)">
              <SegmentedControl options={['1', '2', '3', '4', '5']} value={currentMeta.vitalitySei} onChange={v => updateCurrent({ vitalitySei: v })} compact />
            </Field>
            <Field label="樹形 (1-5)">
              <SegmentedControl options={['1', '2', '3', '4', '5']} value={currentMeta.vitalityKei} onChange={v => updateCurrent({ vitalityKei: v })} compact />
            </Field>
          </div>

          {/* 活力判定 */}
          <div>
            <p className="text-[11px] text-stone-600 mb-2">活力判定</p>
            <div className="grid grid-cols-4 gap-1">
              {JUDGMENT_LEVELS.map(level => (
                <JudgmentButton
                  key={level}
                  value={level}
                  current={currentMeta.vitalityJudgment}
                  onChange={v => updateCurrent({ vitalityJudgment: v })}
                />
              ))}
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-stone-600">判定理由</span>
                <button
                  type="button"
                  onClick={() => updateCurrent({ vitalityReason: generateVitalityReason(currentMeta) })}
                  className="text-[11px] px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                >
                  ✨ 診断文生成
                </button>
              </div>
              <textarea
                value={currentMeta.vitalityReason || ''}
                onChange={e => updateCurrent({ vitalityReason: e.target.value })}
                placeholder="「✨ 診断文生成」ボタンで自動入力、または直接記述"
                rows={2}
                className="w-full p-2 border border-stone-300 rounded text-xs resize-y"
              />
            </div>
          </div>
        </Section>

        <Section title={`写真 (${currentPhotos.length}枚)`}>
          {/* 旧形式データの変換促進バナー */}
          {currentMeta._legacyMemo && (!currentMeta.markers || currentMeta.markers.length === 0) && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
              <p className="text-xs text-amber-900 mb-2">
                この樹は旧形式です。現場メモを写真マーカーに変換しますか？
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // メモからマーカーを自動生成（デフォルト位置に配置）
                    const lines = (currentMeta._legacyMemo || '').split(/\r?\n/);
                    const newMarkers = [];
                    const partYPositions = { '根元': 0.85, '幹': 0.55, '大枝': 0.25 };
                    for (const line of lines) {
                      const m = line.match(/^(根元|幹|大枝)[:：](.+)$/);
                      if (!m) continue;
                      const part = m[1];
                      const items = m[2].split(/[、,]/).map(s => s.trim()).filter(Boolean);
                      items.forEach((item, idx) => {
                        const mx = 0.3 + idx * 0.15;
                        const my = partYPositions[part] || 0.5;
                        newMarkers.push({
                          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                          x: mx,
                          y: my,
                          labelX: mx,
                          labelY: Math.max(0.02, my - 0.12),
                          part,
                          item,
                          collapsed: false,
                          createdAt: new Date().toISOString(),
                        });
                      });
                    }
                    const memo = generateMemoFromMarkers(newMarkers);
                    updateCurrent({ markers: newMarkers, memo, _legacyMemo: undefined });
                  }}
                  className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
                >
                  変換する
                </button>
                <button
                  onClick={() => updateCurrent({ _legacyMemo: undefined })}
                  className="px-3 py-1.5 text-xs border border-stone-300 text-stone-700 rounded hover:bg-stone-50"
                >
                  そのまま使う
                </button>
              </div>
            </div>
          )}

          <PhotoFrameGrid
            photos={currentPhotos}
            markers={currentMeta.markers || []}
            onTakePhoto={handleTakePhotoForRole}
            onPickPhoto={handlePickPhotoForRole}
            onViewPhoto={(photo) => setViewingPhoto(photo)}
            onRemovePhoto={removePhoto}
            onSwapRole={handleSwapRole}
            markerOverlay={
              currentPhotos.find(p => p.role === 'main') ? (
                <MarkerOverlay
                  imageUrl={currentPhotos.find(p => p.role === 'main').dataUrl}
                  markers={currentMeta.markers || []}
                  onAddMarker={handleAddMarker}
                  onEditMarker={handleEditMarker}
                  onDeleteMarker={handleDeleteMarker}
                  selectedMarkerId={selectedMarkerId}
                  onSelectMarker={setSelectedMarkerId}
                  onPushHistory={pushMarkerHistory}
                />
              ) : null
            }
          />

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={() => { pendingRoleRef.current = 'spare'; cameraInputRef.current?.click(); }} className="py-3 border border-stone-300 bg-white text-sm hover:border-emerald-700 hover:text-emerald-800 flex items-center justify-center gap-2 transition-colors">
              <Camera className="w-4 h-4" />
              予備写真を撮影
            </button>
            <button onClick={() => { pendingRoleRef.current = 'spare'; fileInputRef.current?.click(); }} className="py-3 border border-stone-300 bg-white text-sm hover:border-emerald-700 hover:text-emerald-800 flex items-center justify-center gap-2 transition-colors">
              <ImageIcon className="w-4 h-4" />
              予備写真を選択
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={addPhotos} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
          <input ref={cameraRoleInputRef} type="file" accept="image/*" capture="environment" onChange={addPhotosWithRole} className="hidden" />
          <input ref={fileRoleInputRef} type="file" accept="image/*" multiple onChange={addPhotosWithRole} className="hidden" />
        </Section>

        <Section title="3択項目">
          <ThreeChoicePanel meta={currentMeta} onChange={updateCurrent} />
        </Section>

        <Section title="所見">
          <ObservationPanel
            key={currentId}
            markers={currentMeta.markers || []}
            memoSupplement={currentMeta.memoSupplement || ''}
            onEditMarker={handleEditMarker}
            onChangeSupplement={(v) => updateCurrent({ memoSupplement: v })}
          />
        </Section>

        <Section title="診断判定">
          <JudgmentPanel meta={currentMeta} onChange={updateCurrent} />
        </Section>

        <Section title="処置内容">
          <TreatmentPanel
            treatment={currentMeta.treatment}
            onChange={(v) => updateCurrent({ treatment: v })}
          />
        </Section>

        <Section title="次回診断">
          <NextDiagnosisPanel
            nextDiagnosis={currentMeta.nextDiagnosis}
            nextDiagnosisTiming={currentMeta.nextDiagnosisTiming}
            onChangeDiagnosis={(v) => updateCurrent({ nextDiagnosis: v })}
            onChangeTiming={(v) => updateCurrent({ nextDiagnosisTiming: v })}
          />
        </Section>

        <Section title="位置座標">
          <LocationPanel
            location={currentMeta.location}
            onChange={(v) => updateCurrent({ location: v })}
          />
        </Section>

        <Section title="特記事項">
          <textarea
            value={currentMeta.specialNotes || ''}
            onChange={e => updateCurrent({ specialNotes: e.target.value })}
            placeholder="現場では書ききれなかった所感、次回フォローアップ事項、管理者への申し送りなど"
            rows={3}
            className="w-full p-2 border border-stone-300 rounded text-xs resize-y focus:outline-none focus:border-emerald-700"
          />
        </Section>
      </main>

      {/* マーカー操作の浮動バー（どこからでも undo/redo） */}
      <div
        className="fixed z-30"
        style={{ left: 12, bottom: 84 }}
      >
        {isUndoBarOpen ? (
          <div
            className="flex items-center gap-0.5 border border-stone-300 rounded-full shadow-lg px-1.5 py-1"
            style={{ background: 'rgba(255, 255, 255, 0.97)', backdropFilter: 'blur(6px)' }}
          >
            <button
              type="button"
              onClick={handleUndoMarker}
              disabled={markerHistory.length === 0}
              className="px-2 py-1.5 rounded-full text-stone-700 flex items-center gap-1 text-xs disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-stone-100 transition-colors"
              title="直前のマーカー操作を取り消す"
            >
              <Undo2 className="w-3.5 h-3.5" strokeWidth={2} />
              {markerHistory.length > 0 && (
                <span className="text-[10px] text-stone-500 leading-none">{markerHistory.length}</span>
              )}
            </button>
            <div className="w-px h-4 bg-stone-300" />
            <button
              type="button"
              onClick={handleRedoMarker}
              disabled={markerRedoStack.length === 0}
              className="px-2 py-1.5 rounded-full text-stone-700 flex items-center gap-1 text-xs disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-stone-100 transition-colors"
              title="取り消した操作をやり直す"
            >
              <Redo2 className="w-3.5 h-3.5" strokeWidth={2} />
              {markerRedoStack.length > 0 && (
                <span className="text-[10px] text-stone-500 leading-none">{markerRedoStack.length}</span>
              )}
            </button>
            <div className="w-px h-4 bg-stone-300" />
            <button
              type="button"
              onClick={() => setIsUndoBarOpen(false)}
              className="px-1.5 py-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              title="バーを隠す"
            >
              <X className="w-3 h-3" strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsUndoBarOpen(true)}
            className="p-2 border border-stone-300 rounded-full shadow-lg text-stone-600 hover:bg-stone-100 transition-colors"
            style={{ background: 'rgba(255, 255, 255, 0.97)', backdropFilter: 'blur(6px)' }}
            title="操作バーを表示"
          >
            <Undo2 className="w-4 h-4" strokeWidth={2} />
          </button>
        )}
      </div>

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
          getTreesForKarte={getTreesForKarte}
          surveyMeta={surveyMeta}
          onExportXLSX={handleExportXLSX}
          onExportZIP={handleExportZIP}
          onExportJSON={handleExportJSON}
          onCopyText={copyText}
          onClose={() => setShowExport(false)}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        surveyMeta={surveyMeta}
        onSave={(values) => saveSurveyMeta(values)}
        onClose={() => setIsSettingsOpen(false)}
      />

      <PhotoViewer
        photo={viewingPhoto}
        onClose={() => setViewingPhoto(null)}
        onChangeAnnotations={(newAnnotations) => {
          if (!viewingPhoto) return;
          updatePhoto(viewingPhoto.id, { annotations: newAnnotations });
          setViewingPhoto(prev => prev ? { ...prev, annotations: newAnnotations } : null);
        }}
      />
    </div>
  );
}

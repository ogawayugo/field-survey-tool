// src/lib/karteGenerator.js
// Pyodide を使ったブラウザ内カルテ Excel 生成

let pyodide = null;
let initializing = null;

/**
 * Pyodide とパッケージ・スクリプト・テンプレートを初期化
 * 並行呼び出しでも1度しか初期化されない
 *
 * @param {function} onProgress - 進捗コールバック (step: string, elapsed: number) => void
 * @returns {Promise<object>} - 初期化済みの pyodide インスタンス
 */
export async function initKarteGenerator(onProgress = () => {}) {
  if (pyodide) return pyodide;
  if (initializing) return initializing;

  initializing = (async () => {
    const t0 = performance.now();

    // 1. Pyodide ランタイム読み込み（CDN）
    onProgress('runtime', 0);
    if (!window.loadPyodide) {
      await loadPyodideScript();
    }
    pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
    });
    onProgress('runtime', (performance.now() - t0) / 1000);

    // 2. パッケージインストール
    onProgress('packages', (performance.now() - t0) / 1000);
    await pyodide.loadPackage(['Pillow', 'micropip']);
    await pyodide.runPythonAsync(`
import micropip
await micropip.install('openpyxl')
`);
    onProgress('packages', (performance.now() - t0) / 1000);

    // 3. テンプレート・スクリプト・フォント配置
    onProgress('assets', (performance.now() - t0) / 1000);
    const base = '/karte';
    const [genPy, photoPy, extractorPy, tplXlsx, tplJson, rulesJson, fontTtf] = await Promise.all([
      fetch(`${base}/generate.py`).then(r => r.text()),
      fetch(`${base}/photo_annotator.py`).then(r => r.text()),
      fetch(`${base}/marker_extractor.py`).then(r => r.text()),
      fetch(`${base}/templates/shibuya.xlsx`).then(r => r.arrayBuffer()),
      fetch(`${base}/templates/shibuya.json`).then(r => r.text()),
      fetch(`${base}/templates/extraction_rules.json`).then(r => r.text()),
      fetch(`${base}/fonts/ipag.ttf`).then(r => r.arrayBuffer()),
    ]);

    pyodide.FS.mkdirTree('/work/templates');
    pyodide.FS.mkdirTree('/work/fonts');
    pyodide.FS.writeFile('/work/generate.py', genPy);
    pyodide.FS.writeFile('/work/photo_annotator.py', photoPy);
    pyodide.FS.writeFile('/work/marker_extractor.py', extractorPy);
    pyodide.FS.writeFile('/work/templates/shibuya.xlsx', new Uint8Array(tplXlsx));
    pyodide.FS.writeFile('/work/templates/shibuya.json', tplJson);
    pyodide.FS.writeFile('/work/templates/extraction_rules.json', rulesJson);
    pyodide.FS.writeFile('/work/fonts/ipag.ttf', new Uint8Array(fontTtf));
    onProgress('assets', (performance.now() - t0) / 1000);

    // 4. generate モジュール import
    onProgress('import', (performance.now() - t0) / 1000);
    await pyodide.runPythonAsync(`
import sys, os
sys.path.insert(0, '/work')
os.chdir('/work')
import generate
`);
    onProgress('import', (performance.now() - t0) / 1000);
    onProgress('ready', (performance.now() - t0) / 1000);

    return pyodide;
  })();

  return initializing;
}

/**
 * Pyodide CDN スクリプトを動的に読み込む
 */
function loadPyodideScript() {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * 樹データから Excel カルテを生成し Blob で返す
 *
 * @param {object|array} trees - 単一の tree オブジェクトまたは複数の trees 配列
 *                               (現状の JSON エクスポート形式に合わせる)
 * @param {object} surveyMeta - 路線名・樹木医名・診断日
 * @returns {Promise<Blob>} - Excel ファイルの Blob
 */
export async function generateKarte(trees, surveyMeta) {
  if (!pyodide) {
    throw new Error('initKarteGenerator() を先に呼んでください');
  }

  // 入力JSON を構築（既存の generate.py が期待する形式）
  const inputJson = {
    surveyMeta: surveyMeta || {},
    trees: Array.isArray(trees) ? trees : [trees],
  };

  pyodide.FS.writeFile('/work/input.json', JSON.stringify(inputJson));
  // 既存出力があれば削除
  try { pyodide.FS.unlink('/work/output.xlsx'); } catch (_) {}

  await pyodide.runPythonAsync(`
import importlib, generate
importlib.reload(generate)
from pathlib import Path
generate.generate_karte(Path('/work/input.json'), Path('/work/output.xlsx'), 'shibuya')
`);

  const bytes = pyodide.FS.readFile('/work/output.xlsx');
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Excel ファイルをブラウザでダウンロードさせる
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 初期化済みかどうか確認
 */
export function isReady() {
  return pyodide !== null;
}

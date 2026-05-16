# Phase D-PWA: PWA に Pyodide を統合してブラウザ完結カルテ生成

## 1. 概要

現状：PWA で調査 → JSON エクスポート → 別の Pyodide デモ or PC `.exe` で Excel カルテ生成、という2段階フロー。

ゴール：**PWA に「Excel カルテ出力」ボタンを追加し、ボタン1つで Excel が自動ダウンロードされる**ようにする。同業者は PWA URL を開くだけで全工程完結できる。

技術的には Pyodide（ブラウザ内 Python ランタイム）+ openpyxl + Pillow で、既存の `generate.py` をそのまま動かす。

---

## 2. 配置するファイル

PWA リポジトリ `field-survey-tool` の `public/` に以下を配置：

```
public/
  karte/
    generate.py
    photo_annotator.py
    marker_extractor.py
    templates/
      shibuya.xlsx
      shibuya.json
      extraction_rules.json
    fonts/
      ipag.ttf
```

これらのファイルは `karte-generator/` リポジトリの最新版を `public/karte/` 配下にコピーすればOK。Vite の public は静的ファイルとして `/karte/...` でアクセス可能になる。

**ファイルサイズ目安**：
- `ipag.ttf`: 6.2MB
- `shibuya.xlsx`: 30KB
- 各 Python スクリプト: 50KB 程度
- 合計約 6.5MB

これらは初回アクセス時にダウンロードされてブラウザにキャッシュされる。Service Worker でキャッシュ対象に加えるかは後述。

---

## 3. 新規ファイル：`src/lib/karteGenerator.js`

Pyodide のロード、generate.py の実行、Excel ダウンロードを担う中核モジュール。

```javascript
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
 * @param {object|array} treeOrTrees - 単一の tree オブジェクトまたは複数の trees 配列
 *                                     (現状の JSON エクスポート形式に合わせる)
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
```

---

## 4. UI コンポーネント：`src/components/KarteExportButton.jsx`

「Excel カルテ出力」ボタン。既存のエクスポートエリア（JSON / ZIP エクスポートボタンの近く）に並べる。

```jsx
// src/components/KarteExportButton.jsx
import { useState } from 'react';
import { initKarteGenerator, generateKarte, downloadBlob, isReady } from '../lib/karteGenerator';

/**
 * Excel カルテ出力ボタン
 *
 * Props:
 *   tree: 現在編集中の樹オブジェクト
 *   surveyMeta: { route, diagnostician, date }
 *   disabled: ボタン無効化フラグ
 */
export default function KarteExportButton({ tree, surveyMeta, disabled }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'generating' | 'done' | 'error'
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setStatus('loading');
    setError(null);
    try {
      // 初回のみ Pyodide ロード（2回目以降は瞬時に通過）
      if (!isReady()) {
        await initKarteGenerator((step, elapsed) => {
          const labels = {
            runtime: 'Python ランタイムを準備中...',
            packages: 'ライブラリをインストール中...',
            assets: 'テンプレートを配置中...',
            import: 'スクリプトを読み込み中...',
            ready: '準備完了',
          };
          setProgress(`${labels[step] || step} (${elapsed.toFixed(1)}秒)`);
        });
      }

      setStatus('generating');
      setProgress('Excel を生成中...');

      const blob = await generateKarte(tree, surveyMeta);

      const today = new Date().toISOString().slice(0, 10);
      const treeNo = tree.treeNumber ? `_${tree.treeNumber}` : '';
      const species = tree.species ? `_${tree.species}` : '';
      const filename = `karte${treeNo}${species}_${today}.xlsx`;
      downloadBlob(blob, filename);

      setStatus('done');
      setProgress('完了');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      console.error('カルテ生成エラー:', e);
      setError(e.message || String(e));
      setStatus('error');
    }
  };

  const isDisabled = disabled || status === 'loading' || status === 'generating';

  return (
    <div className="karte-export">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={`karte-export-btn status-${status}`}
      >
        {status === 'idle' && '📄 Excel カルテを出力'}
        {status === 'loading' && '初期化中...'}
        {status === 'generating' && '生成中...'}
        {status === 'done' && '✓ ダウンロード完了'}
        {status === 'error' && '✗ エラー（再試行）'}
      </button>
      {(status === 'loading' || status === 'generating') && progress && (
        <div className="karte-export-progress">{progress}</div>
      )}
      {status === 'error' && error && (
        <div className="karte-export-error">エラー: {error}</div>
      )}
    </div>
  );
}
```

CSS（参考、既存スタイルガイドに合わせて調整）：

```css
.karte-export {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.karte-export-btn {
  background: #1f3d2f;
  color: white;
  border: none;
  padding: 10px 20px;
  font-size: 1rem;
  border-radius: 4px;
  cursor: pointer;
}
.karte-export-btn:disabled {
  background: #888;
  cursor: not-allowed;
}
.karte-export-btn.status-done {
  background: #2d8f5a;
}
.karte-export-btn.status-error {
  background: #c0392b;
}
.karte-export-progress {
  font-size: 0.85em;
  color: #555;
}
.karte-export-error {
  font-size: 0.85em;
  color: #c0392b;
}
```

---

## 5. 既存コンポーネントへの統合

ボタンを配置する場所：**既存のエクスポートエリア**（JSON/ZIP ボタンの近く）。

App.jsx か ExportPanel.jsx のような既存ファイルに：

```jsx
import KarteExportButton from './components/KarteExportButton';

// ... 既存のエクスポート UI 内
<KarteExportButton
  tree={currentTree}
  surveyMeta={surveyMeta}
  disabled={!currentTree}
/>
```

**注意**：今のところ「単一樹のカルテ出力」のみ実装する。複数樹の一括出力は別途検討（generate.py 自体は配列対応なので、UI で複数選択ができれば対応可能）。

---

## 6. 任意：早期初期化（速さを優先する場合）

「ボタンを押してからロードが始まる」と初回 8〜10秒待つ。これを解消したいなら、**ページ表示直後にバックグラウンドで初期化**を始める：

```jsx
// App.jsx の useEffect
import { initKarteGenerator } from './lib/karteGenerator';

useEffect(() => {
  // 5秒遅延で起動（初期表示のパフォーマンス影響を最小化）
  const timer = setTimeout(() => {
    initKarteGenerator((step, elapsed) => {
      console.log(`Pyodide ${step}: ${elapsed.toFixed(1)}s`);
    }).catch(e => console.warn('Pyodide pre-init failed:', e));
  }, 5000);
  return () => clearTimeout(timer);
}, []);
```

メリット：ユーザーがエクスポートボタンを押した時には既にロード完了している可能性が高い。
デメリット：使わない人でも 6.5MB ダウンロードする。

**推奨**：最初は早期初期化なしでリリース、必要なら後から追加。

---

## 7. 動作確認チェックリスト

実装完了後、`npm run dev` で以下を確認：

### A. ファイル配置
- [ ] `public/karte/` 配下に全ファイル配置済み
- [ ] `http://localhost:5173/karte/generate.py` でファイルにアクセスできる（200 OK）
- [ ] 同様に他のファイルも全部アクセス可能

### B. ボタン UI
- [ ] エクスポートエリアに「Excel カルテを出力」ボタンが追加されている
- [ ] tree が選択されていないときは無効化
- [ ] tree が選択されているとクリック可能

### C. 初回ロード
- [ ] クリック → 「初期化中...」表示
- [ ] プログレス表示が進む（runtime → packages → assets → import → ready）
- [ ] 合計 6〜12秒で完了
- [ ] DevTools の Network タブで Pyodide 関連ファイルがダウンロードされている

### D. Excel 生成
- [ ] 「生成中...」表示
- [ ] 1〜3秒で Excel が自動ダウンロード
- [ ] ファイル名が `karte_{treeNumber}_{species}_YYYY-MM-DD.xlsx` 形式

### E. Excel 内容
- [ ] テスト樹で生成 → 開く
- [ ] 基本情報・部位判定・判定根拠・部位診断ノート・所見欄・F48 判定理由・写真マーカー全部入っている
- [ ] PC 版 generate.py の出力とバイト単位で同一（厳密確認は時間取れれば）

### F. 2回目以降
- [ ] 1回目のあと、別の樹で再エクスポート → 初期化スキップで瞬時に Excel ダウンロード

### G. エラーハンドリング
- [ ] ネットワーク切ったまま試す → エラー表示
- [ ] tree に必須項目が欠落してる状態で試す → 適切なエラーメッセージ

### H. モバイル動作（重要）
- [ ] スマホ Chrome で `http://<PCのIP>:5173/` を開く
- [ ] 初回ロード時間を計測（30〜60秒が許容範囲、それ以上だと現場運用厳しい）
- [ ] 生成時間も計測（5秒以内が望ましい）

---

## 8. 既知の制約・注意点

1. **CDN 依存**：Pyodide ランタイム本体は jsdelivr CDN から読み込む。CDN 障害時は動かない。
   - 本格運用するなら Pyodide のセルフホストも検討（追加 20MB）

2. **初回ダウンロードサイズ**：合計約 25MB（Pyodide + 各種ファイル）
   - Service Worker でキャッシュすれば 2回目以降は不要
   - モバイル回線で初回ロードする人には注意喚起したい

3. **ブラウザ互換性**：Chrome / Safari / Edge の最新版は OK。古いブラウザ（IE 等）は NG（Pyodide が WebAssembly 必須）

4. **メモリ使用量**：Pyodide ロード後はブラウザが 200〜300MB 使う。スマホでは他のタブが落ちる可能性。

5. **写真サイズの上限**：写真が大量に重い場合、メモリ不足で失敗する可能性。1樹あたり写真4枚程度なら問題ないはず。

---

## 9. 段階的リリース戦略（推奨）

いきなり main にマージせず、feature ブランチで Vercel プレビュー URL を作って様子見：

1. **feature/pyodide-integration** ブランチで作業
2. git push → Vercel プレビュー URL 自動生成
3. プレビュー URL を自分で2〜3日試用
4. 同業者試用版（main）はまだ古いままで OK
5. 問題なければ main にマージ

---

## 10. 完了報告に含めてほしいこと

1. 変更したファイル・追加したファイルの一覧
2. `npm run dev` での動作スクショ（ボタン押す前 → ロード中 → 生成完了）
3. ダウンロードされた Excel ファイル（生成された実物）
4. モバイルでの動作確認結果（できれば）
5. 早期初期化（セクション6）を入れたかどうか

---

以上。指示書に沿って実装してください。

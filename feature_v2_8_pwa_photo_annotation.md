# v2.8：全景写真への病害マーク機能（PWA側）

## 概要

全景写真上に**病害の位置を指す矢印＋病害名のテキストボックス**を配置できる機能を追加する。データはJSONに座標と病害名で保存し、PC側のカルテExcel生成時に焼き込み描画する（PC側の実装は v2.8.1 で別途）。

今回の指示書は**PWA側だけ**の実装。

---

## ユーザー体験フロー

1. 全景写真を表示
2. **マークモード**ボタンを押すと写真の上にオーバーレイが出る
3. 写真上の患部をタップ → 病害名選択モーダルが開く
4. チップから病害名を選ぶ or 手入力 → 確定
5. 患部位置に赤い丸印（矢印先端）、その右上に白背景のテキストボックスが表示される
6. テキストボックスをドラッグして位置を調整可能
7. テキストボックスをタップすると編集メニュー（病害名変更・削除）
8. もう一度マークモードを抜けると、表示モードでも矢印・テキストが見える状態

---

## ステップ1：データ構造の拡張

### 各樹木の全景写真に annotations 配列を持たせる

既存のデータ構造を確認すると、写真は `photoFull`（または同等のキー）に `blob`、`label` 等を持っているはず。ここに `annotations` を追加：

```js
photoFull: {
  blob: ...,           // 既存
  label: '全景',        // 既存
  
  // ▼ 新規追加 ▼
  annotations: [
    {
      id: 'ann_1234567890',  // 一意ID（Date.now() + ランダム）
      anchorX: 0.45,         // 患部位置（画像幅に対する0-1の正規化座標）
      anchorY: 0.30,         // 患部位置（画像高さに対する0-1の正規化座標）
      labelX: 0.55,          // テキストボックス左上の正規化座標
      labelY: 0.18,          // テキストボックス左上の正規化座標
      text: 'ベッコウタケ',    // 表示する病害名
    },
    // ...
  ]
}
```

正規化座標（0-1）で持つことで、写真サイズが変わっても破綻しない。

### マイグレーション

既存データに `annotations` がない場合、空配列で初期化：

```js
function migratePhoto(photo) {
  if (!photo) return photo;
  return {
    ...photo,
    annotations: photo.annotations ?? [],
  };
}
```

樹木データ読込関数（`loadOrMigrateMeta` 系）の中で、`photoFull` がある場合に `migratePhoto` を通す。

---

## ステップ2：病害名選択モーダル

### 既存の診断チップリストを再利用

v2.5 でチップ機能を実装したときに `DIAGNOSIS_CHIPS` 的なデータ構造があるはず（部位ごとに項目が定義されている）。これを**部位を取り払って病害名だけのフラットなリスト**として再利用する。

```js
// src/data/photoMarkChips.js（新規）
import { DIAGNOSIS_CHIPS } from './diagnosisChips';  // 既存ファイル名に合わせる

/**
 * 写真マーク用の病害名リストを既存の診断チップから生成
 * 部位の区別を取り払って、項目名のみを重複なく並べる
 */
export function getPhotoMarkChips() {
  const items = new Set();
  // DIAGNOSIS_CHIPS の構造に合わせて取り出す（root, trunk, branch 等のキーから）
  for (const partKey of Object.keys(DIAGNOSIS_CHIPS)) {
    for (const item of DIAGNOSIS_CHIPS[partKey]) {
      // item の構造に応じて: 文字列なら item, オブジェクトなら item.label 等
      const label = typeof item === 'string' ? item : item.label;
      items.add(label);
    }
  }
  return [...items];
}
```

### モーダルUI

```jsx
// src/components/PhotoMarkLabelModal.jsx（新規）
import { useState } from 'react';
import { getPhotoMarkChips } from '../data/photoMarkChips';

export function PhotoMarkLabelModal({ isOpen, initialText = '', onConfirm, onCancel, onDelete }) {
  const [text, setText] = useState(initialText);
  const chips = getPhotoMarkChips();
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-md p-4 max-h-[80vh] overflow-y-auto">
        <h3 className="font-bold text-lg mb-3">病害名を選択</h3>
        
        {/* 手入力欄 */}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="または手入力"
          className="w-full p-2 border rounded mb-3"
          autoFocus
        />
        
        {/* チップ */}
        <div className="flex flex-wrap gap-2 mb-4">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setText(c)}
              className={`px-3 py-1 rounded-full text-sm border ${
                text === c ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        
        {/* ボタン群 */}
        <div className="flex gap-2 justify-end">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded"
            >
              削除
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 hover:bg-gray-100 rounded"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => text.trim() && onConfirm(text.trim())}
            disabled={!text.trim()}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## ステップ3：写真アノテーションコンポーネント

メインのコンポーネントを新規作成。SVGオーバーレイで矢印とテキストボックスを描画する。

```jsx
// src/components/PhotoAnnotator.jsx（新規）
import { useState, useRef, useEffect } from 'react';
import { PhotoMarkLabelModal } from './PhotoMarkLabelModal';

export function PhotoAnnotator({ imageUrl, annotations, onChange }) {
  const [editMode, setEditMode] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState(null); // {x, y} 患部位置（モーダル開いた時）
  const [editingId, setEditingId] = useState(null);         // 既存マーク編集
  const [draggingId, setDraggingId] = useState(null);
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  
  // 表示エリア内のピクセル座標 → 正規化座標
  const toNormalized = (clientX, clientY) => {
    const rect = imgRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };
  
  // 写真をタップ → 患部位置決定 → モーダル
  const handleImageClick = (e) => {
    if (!editMode) return;
    if (draggingId) return; // ドラッグ中は無視
    const { x, y } = toNormalized(e.clientX, e.clientY);
    setPendingAnchor({ x, y });
  };
  
  // モーダル：新規確定
  const handleConfirmNew = (text) => {
    if (!pendingAnchor) return;
    const newAnn = {
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      anchorX: pendingAnchor.x,
      anchorY: pendingAnchor.y,
      // テキストボックスは患部の右上に自動配置（画像サイズの 10%/15% ずれた位置）
      labelX: Math.max(0, Math.min(0.85, pendingAnchor.x + 0.1)),
      labelY: Math.max(0, pendingAnchor.y - 0.12),
      text,
    };
    onChange([...annotations, newAnn]);
    setPendingAnchor(null);
  };
  
  // モーダル：既存編集確定
  const handleConfirmEdit = (text) => {
    if (!editingId) return;
    onChange(annotations.map(a => a.id === editingId ? { ...a, text } : a));
    setEditingId(null);
  };
  
  // モーダル：削除
  const handleDelete = () => {
    if (!editingId) return;
    onChange(annotations.filter(a => a.id !== editingId));
    setEditingId(null);
  };
  
  // ドラッグ：テキストボックスを動かす
  const handleLabelPointerDown = (e, id) => {
    if (!editMode) return;
    e.stopPropagation();
    setDraggingId(id);
    
    const handleMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { x, y } = toNormalized(cx, cy);
      onChange(annotations.map(a => a.id === id ? { ...a, labelX: x, labelY: y } : a));
    };
    
    const handleUp = () => {
      setDraggingId(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };
  
  // テキストボックスタップ → 編集モーダル（ドラッグ後でなければ）
  const handleLabelClick = (e, id) => {
    if (!editMode) return;
    e.stopPropagation();
    if (draggingId) return;
    setEditingId(id);
  };
  
  return (
    <div className="relative inline-block w-full">
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setEditMode(!editMode)}
          className={`px-3 py-1 rounded text-sm ${
            editMode ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
          }`}
        >
          {editMode ? '✓ 完了' : '✏ マーク追加'}
        </button>
        {editMode && (
          <span className="text-xs text-gray-500">
            写真をタップで追加 / テキストをドラッグで移動 / タップで編集
          </span>
        )}
      </div>
      
      <div ref={containerRef} className="relative" onClick={handleImageClick}>
        <img
          ref={imgRef}
          src={imageUrl}
          className="w-full h-auto block"
          draggable={false}
        />
        
        {/* SVGオーバーレイ */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {annotations.map((a) => {
            const ax = a.anchorX * 100;
            const ay = a.anchorY * 100;
            const lx = a.labelX * 100;
            const ly = a.labelY * 100;
            // テキストボックス中心
            const lcx = lx + 6;  // ボックス幅の半分（仮）
            const lcy = ly + 2;  // ボックス高さの半分（仮）
            
            return (
              <g key={a.id}>
                {/* 矢印の線（テキスト中心 → 患部） */}
                <line
                  x1={lcx} y1={lcy}
                  x2={ax} y2={ay}
                  stroke="red"
                  strokeWidth="0.5"
                  vectorEffect="non-scaling-stroke"
                />
                {/* 患部の丸印 */}
                <circle cx={ax} cy={ay} r="1" fill="red" />
              </g>
            );
          })}
        </svg>
        
        {/* テキストボックス（HTML要素として配置：ドラッグ可能にするため） */}
        {annotations.map((a) => {
          const isDragging = draggingId === a.id;
          return (
            <div
              key={a.id}
              onPointerDown={(e) => handleLabelPointerDown(e, a.id)}
              onClick={(e) => handleLabelClick(e, a.id)}
              className={`absolute bg-white border-2 border-red-600 px-2 py-0.5 text-xs sm:text-sm font-medium whitespace-nowrap select-none ${
                editMode ? 'cursor-move' : ''
              } ${isDragging ? 'opacity-70' : ''}`}
              style={{
                left: `${a.labelX * 100}%`,
                top: `${a.labelY * 100}%`,
                transform: 'translate(0, 0)',
                touchAction: 'none',
              }}
            >
              {a.text}
            </div>
          );
        })}
      </div>
      
      {/* 新規追加モーダル */}
      <PhotoMarkLabelModal
        isOpen={!!pendingAnchor}
        onConfirm={handleConfirmNew}
        onCancel={() => setPendingAnchor(null)}
      />
      
      {/* 編集モーダル */}
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
```

---

## ステップ4：既存の写真表示UIに組み込む

樹木編集画面で、全景写真を表示している部分を `PhotoAnnotator` に置き換える。

**現状の写真表示部分**を探して、以下のように差し替え：

```jsx
// 既存の <img src={photoFullUrl} /> や同等の写真表示を…

import { PhotoAnnotator } from './components/PhotoAnnotator';

// 全景写真の表示部分のみ：
{tree.photoFull && (
  <PhotoAnnotator
    imageUrl={photoFullUrl}  // blob から作った objectURL
    annotations={tree.photoFull.annotations || []}
    onChange={(newAnnotations) => {
      updateTree(tree.id, {
        photoFull: { ...tree.photoFull, annotations: newAnnotations }
      });
    }}
  />
)}
```

クローズアップ写真は今回スコープ外なので、既存のまま。

---

## ステップ5：JSON エクスポートに含める

`exportHelpers.js` 等で JSON 出力時、`photoFull.annotations` がそのまま含まれていればOK。明示的なホワイトリスト指定がある場合は追加：

```js
photoFull: {
  // ... 既存フィールド ...
  annotations: tree.photoFull?.annotations || [],
}
```

写真の blob 自体は JSON に含めなくてよい（既存の挙動踏襲）。**annotations だけ確実に含まれるよう確認**。

---

## ステップ6：動作確認チェックリスト

- [ ] 既存の樹木データを開いてもエラーなし（マイグレーション動作OK）
- [ ] 全景写真が表示される
- [ ] 「✏ マーク追加」ボタンを押すとマークモードに入る
- [ ] 写真をタップするとモーダルが出る
- [ ] チップから病害名を選んで確定すると、患部に赤丸＋テキストボックスが表示される
- [ ] 手入力でも病害名を確定できる
- [ ] 既に追加されたテキストボックスをドラッグすると位置が動く
- [ ] テキストボックスをタップすると編集モーダルが出る
- [ ] 編集モーダルで病害名を変えて確定すると反映される
- [ ] 編集モーダルで「削除」を押すとマークが消える
- [ ] 「✓ 完了」を押すとマークモードを抜ける（マークは表示されたまま）
- [ ] 樹を切り替えて戻ってきてもマークが保持されている
- [ ] アプリを閉じて再起動してもマークが保持されている（IndexedDB保存OK）
- [ ] JSONエクスポートに annotations 配列が含まれている
- [ ] iPhone Safari でも正常動作する（タップ・ドラッグ）

---

## トラブルシューティング想定

### Q1：写真をタップしてもモーダルが出ない

→ `editMode` が true になっているか確認。`onClick` が `<img>` ではなく親 div に付いているか（imgには pointer-events を考慮）。

### Q2：ドラッグでテキストが動かない

→ `pointermove`/`pointerup` のリスナーが window に登録されているか。`touchAction: 'none'` がスタイルに付いているか（iOSでスクロールに食われるのを防ぐ）。

### Q3：座標がずれる（タップした位置と違うところに丸がつく）

→ `getBoundingClientRect()` の結果が画像の表示エリアと一致しているか確認。`<img>` が `block` 表示で余白がないこと。

### Q4：iPhoneでドラッグするとブラウザがスクロールしてしまう

→ テキストボックスのスタイルに `touch-action: none;` を追加。CSSでは `touchAction: 'none'` でもOK。

### Q5：既存写真の座標が「正規化」じゃない値で保存されていた

→ migratePhoto で annotations が無ければ空配列にする。座標が範囲外（>1 や <0）の値が紛れていれば clamp する。

---

## 完了報告フォーマット

実装後、以下を報告してください：

1. 動作確認チェックリスト全項目の結果
2. 全景写真にマークを2〜3個入れた状態のスクショ（iPhoneがあれば iPhone のも）
3. その状態で JSON エクスポートしたサンプル（`annotations` 配列の中身が見えればOK）

問題があればスクショとJSONサンプルをアップロードしてください。

---

## 次のステップ（v2.8.1）

PWA側が動いてJSONが取れたら、そのJSONを元にPC側（karte-generator）で写真にPILで矢印・テキストを焼き込んでExcelに貼る処理を実装します。これは別指示書で出します。

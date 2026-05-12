# 修正指示書：範囲マーカー（木槌打診異常用）

## 概要

「木槌打診異常」は腐朽範囲を示す診断項目のため、**点ではなく範囲**で表現する必要がある。
通常の点マーカーに加えて、**範囲マーカー**機能を追加する。

ブランチ：`feature/photo-first-flow`（既存のまま継続）

---

## 仕様

### 適用対象

**「木槌打診異常」** という診断項目を選んだときのみ、範囲マーカーとして動作する。
それ以外（不自然な傾斜、子実体、開口空洞など）は従来どおり点マーカー。

### 見た目（D案：両端線分）

```
┌─────────────┐
│ 木槌打診異常 │ ← テキストボックス（既存）、緑枠（幹）
└─────┐──────┘
      ↓ 矢印（既存）
   │━━━━━━━━│ ← 範囲：両端に短い縦線＋線分（線で繋ぐ）
```

- 両端の縦線：高さ 10px、太さ 2px、部位色
- 中央の横線：両端を結ぶ線、太さ 2px、部位色
- 編集モード（後述）では両端にドラッグハンドル（◯）が出る

### 操作

#### 作成時

1. 写真をタップ → チップシート開く
2. 部位（幹など）を選ぶ
3. 「木槌打診異常」チップを選ぶ
4. 確定 → タップ位置を**中心**に、**デフォルト長さ 80px**の範囲が水平に作成される
5. テキストボックスと矢印は通常マーカーと同じく上方向に配置

#### 範囲の調整

- 範囲マーカーをタップ → **範囲調整モード**に入る
- 両端に **ドラッグハンドル** （◯印、半径 8px）が表示される
- ハンドルをドラッグして両端の位置を変更
- 別の場所をタップ or 完了ボタンで調整モード解除

#### 範囲の編集（病害名）

通常マーカーと同じく、テキストボックスをタップ → テキスト編集モード。

#### 削除

通常マーカーと同じく、編集メニューから削除可能。

---

## データ構造

### 既存マーカー（点）

```json
{
  "id": "m1",
  "x": 0.42,
  "y": 0.78,
  "part": "幹",
  "item": "子実体",
  "collapsed": false
}
```

### 範囲マーカー（新規）

```json
{
  "id": "m2",
  "type": "range",            // ← 新規フィールド（'point' or 'range'、デフォルト 'point'）
  "x": 0.5,                   // テキストボックスの位置の基準（範囲の中心）
  "y": 0.6,                   // 同上
  "rangeStart": { "x": 0.4, "y": 0.6 },  // ← 範囲の始点
  "rangeEnd":   { "x": 0.6, "y": 0.6 },  // ← 範囲の終点
  "part": "幹",
  "item": "木槌打診異常",
  "collapsed": false
}
```

### フィールド詳細

- **`type`**：`'point'` or `'range'`。デフォルト `'point'`（既存マーカーは型なしでも 'point' とみなす）
- **`rangeStart`** / **`rangeEnd`**：範囲マーカーの両端座標（正規化座標 0.0〜1.0）
- **`x`** / **`y`**：テキストボックス側の参照位置（範囲の中点 = `(rangeStart + rangeEnd) / 2`）

### マイグレーション

既存マーカーには `type` フィールドがないので、読み込み時に自動補完：

```javascript
function migrateMarker(marker) {
  return {
    ...marker,
    type: marker.type ?? 'point',
  };
}
```

---

## 実装ガイド

### 1. マーカー作成時の分岐

`MarkerSheet.jsx`（チップシート）の確定処理：

```jsx
function handleConfirm(selectedItem) {
  const isRange = selectedItem === '木槌打診異常';
  
  const newMarker = {
    id: generateId(),
    part: selectedPart,
    item: selectedItem,
    collapsed: false,
    type: isRange ? 'range' : 'point',
  };
  
  if (isRange) {
    // タップ位置を中心に、デフォルト長 0.1（写真幅の10%）の水平範囲を作る
    const halfLen = 0.05;
    newMarker.x = tapX;
    newMarker.y = tapY;
    newMarker.rangeStart = { x: tapX - halfLen, y: tapY };
    newMarker.rangeEnd   = { x: tapX + halfLen, y: tapY };
  } else {
    newMarker.x = tapX;
    newMarker.y = tapY;
  }
  
  onAddMarker(newMarker);
}
```

### 2. 範囲マーカーの描画（MarkerOverlay.jsx）

```jsx
function MarkerOverlay({ marker, ...props }) {
  if (marker.type === 'range') {
    return <RangeMarker marker={marker} {...props} />;
  }
  return <PointMarker marker={marker} {...props} />;
}

function RangeMarker({ marker, isAdjusting, setIsAdjusting, onUpdate }) {
  const partColor = PART_COLORS[marker.part];
  const { rangeStart, rangeEnd } = marker;
  
  // SVGの座標は親要素を100%として正規化
  return (
    <>
      {/* テキストボックス、矢印は通常マーカーと同じく中央 (marker.x, marker.y) から */}
      <TextBoxAndArrow marker={marker} ... />
      
      {/* 範囲の線分（SVG）*/}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {/* 中央の横線 */}
        <line
          x1={`${rangeStart.x * 100}%`}
          y1={`${rangeStart.y * 100}%`}
          x2={`${rangeEnd.x * 100}%`}
          y2={`${rangeEnd.y * 100}%`}
          stroke={partColor}
          strokeWidth={2}
        />
        {/* 始点の縦線 */}
        <line
          x1={`${rangeStart.x * 100}%`}
          y1={`calc(${rangeStart.y * 100}% - 5px)`}
          x2={`${rangeStart.x * 100}%`}
          y2={`calc(${rangeStart.y * 100}% + 5px)`}
          stroke={partColor}
          strokeWidth={2}
        />
        {/* 終点の縦線 */}
        <line
          x1={`${rangeEnd.x * 100}%`}
          y1={`calc(${rangeEnd.y * 100}% - 5px)`}
          x2={`${rangeEnd.x * 100}%`}
          y2={`calc(${rangeEnd.y * 100}% + 5px)`}
          stroke={partColor}
          strokeWidth={2}
        />
      </svg>
      
      {/* 範囲調整モードのときだけドラッグハンドル */}
      {isAdjusting && (
        <>
          <DragHandle
            x={rangeStart.x}
            y={rangeStart.y}
            color={partColor}
            onDrag={(newX, newY) => onUpdate({
              ...marker,
              rangeStart: { x: newX, y: newY },
              x: (newX + marker.rangeEnd.x) / 2,
              y: (newY + marker.rangeEnd.y) / 2,
            })}
          />
          <DragHandle
            x={rangeEnd.x}
            y={rangeEnd.y}
            color={partColor}
            onDrag={(newX, newY) => onUpdate({
              ...marker,
              rangeEnd: { x: newX, y: newY },
              x: (marker.rangeStart.x + newX) / 2,
              y: (marker.rangeStart.y + newY) / 2,
            })}
          />
        </>
      )}
    </>
  );
}
```

### 3. ドラッグハンドル

```jsx
function DragHandle({ x, y, color, onDrag }) {
  const handleMove = (e) => {
    // タップ位置を写真の正規化座標に変換
    const photoEl = e.target.closest('[data-photo-container]');
    const rect = photoEl.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    const newX = (touch.clientX - rect.left) / rect.width;
    const newY = (touch.clientY - rect.top) / rect.height;
    
    // 0.0〜1.0でクランプ
    onDrag(
      Math.max(0, Math.min(1, newX)),
      Math.max(0, Math.min(1, newY))
    );
  };
  
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: 16,
        height: 16,
        borderRadius: '50%',
        backgroundColor: 'white',
        border: `2px solid ${color}`,
        transform: 'translate(-50%, -50%)',
        cursor: 'grab',
        touchAction: 'none',  // スマホでスクロールを防ぐ
        zIndex: 30,
      }}
      onMouseMove={handleMove}
      onTouchMove={handleMove}
    />
  );
}
```

### 4. 範囲調整モードの切替

範囲マーカーのテキストボックス以外（線分部分）をタップ → 調整モードに入る。
別の場所タップで解除。

`isAdjusting` を `selectedMarkerId` と類似の state として上位コンポーネントで管理。

---

## PC側（カルテExcel焼き込み）

`karte-generator/photo_annotator.py` でも範囲マーカーを描画する。

```python
def draw_marker(draw, marker, img_width, img_height):
    color = PART_COLOR_MAP[marker['part']]
    
    if marker.get('type') == 'range':
        # 範囲マーカー：両端の縦線＋中央の横線
        x1 = int(marker['rangeStart']['x'] * img_width)
        y1 = int(marker['rangeStart']['y'] * img_height)
        x2 = int(marker['rangeEnd']['x'] * img_width)
        y2 = int(marker['rangeEnd']['y'] * img_height)
        
        # 中央の横線
        draw.line([(x1, y1), (x2, y2)], fill=color, width=2)
        # 始点の縦線（高さ10px）
        draw.line([(x1, y1 - 5), (x1, y1 + 5)], fill=color, width=2)
        # 終点の縦線
        draw.line([(x2, y2 - 5), (x2, y2 + 5)], fill=color, width=2)
        
        # テキストボックスは中点から（既存ロジック流用）
        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        draw_textbox_with_arrow(draw, cx, cy, marker['item'], color)
    else:
        # 通常の点マーカー（既存ロジック）
        draw_point_marker(draw, marker, img_width, img_height)
```

ただしカルテ焼き込み時は色を**黒**に統一（既存ルール）。

---

## 動作確認チェックリスト

### 範囲マーカー作成

- [ ] 写真をタップ → チップシート開く
- [ ] 部位選択 → 「木槌打診異常」を選ぶ → 確定
- [ ] タップ位置を中心に、デフォルト長さの水平範囲が作成される
- [ ] テキストボックスと矢印は通常マーカーと同じく上に配置
- [ ] 両端に縦線、中央に横線が部位色で描画される

### 範囲の調整

- [ ] 範囲マーカーをタップ → 調整モードに入る（ハンドルが表示される）
- [ ] 左ハンドルをドラッグ → 始点が動く（写真の端でclampされる）
- [ ] 右ハンドルをドラッグ → 終点が動く
- [ ] 別の場所をタップ → 調整モード解除（ハンドル消える）

### テキスト編集（既存機能の確認）

- [ ] テキストボックスをタップ → 編集モード
- [ ] 「木槌打診異常」を「木槌打診異常（北側）」など編集可能
- [ ] 編集確定 → 保存される

### データ保存

- [ ] 範囲マーカーがJSONエクスポートに含まれる（type, rangeStart, rangeEnd など）
- [ ] 再起動して読み込み直しても範囲が保持される
- [ ] 旧形式マーカー（type なし）も問題なく読み込める

### 折り畳み・選択ハイライト

- [ ] 範囲マーカーも長押しで折り畳める（点表示になる）
- [ ] 折り畳み時の点位置は中点 `(x, y)` で良い
- [ ] 双方向ハイライト（下部リスト連動）も範囲マーカーで動く

### カルテExcel

- [ ] 範囲マーカーがExcelに焼き込まれる
- [ ] 両端縦線＋中央横線が黒で描画される
- [ ] テキストボックスは範囲の中央上に配置

---

## やってはいけないこと

- 既存の点マーカーの挙動を変えない
- データ構造の `type` フィールド以外を勝手に追加しない
- main ブランチに直接 push しない

## やっていいこと

- デフォルト長さの調整（実機で見て「短すぎ／長すぎ」を判断）
- ドラッグハンドルのサイズ調整（押しやすさ重視）
- 縦線の長さ（現在10px）の微調整

---

## 完了報告

実装後、以下を送ってください：

1. 範囲マーカー作成のスクショ
2. 両端をドラッグして調整中のスクショ
3. テキストを編集したスクショ
4. カルテExcelに焼き込まれた状態のスクショ
5. 想定外の挙動・実装で迷った箇所があれば

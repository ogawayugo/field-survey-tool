# 修正指示書：範囲マーカーの自由角度化＋長さ表示削除

## 概要

範囲マーカー（木槌打診異常用）の挙動を改善する。

ブランチ：`feature/photo-first-flow`（既存のまま継続）

---

## 修正点

### 1. デフォルトの向きを「縦方向（木と平行）」に変更

現状：作成時は**水平方向**に配置される。

修正後：作成時は**垂直方向（木と平行）**に配置される。
樹皮腐朽は木の繊維に沿って縦方向に広がりやすいので、業務的に自然。

### 2. 両端を自由に動かせる（角度自由）

現状：両端ドラッグハンドルで動かせるが、結果的に水平のままが多い。

修正後：両端を完全に自由な位置にドラッグできる。**斜め線にも対応**。

### 3. 両端の「短い縦線」を「軸線に垂直」になるよう描画

現状：両端の縦線が常に画面の「垂直方向」を向いている。
だから軸線が斜めだと、両端線と軸線が重なる/離れすぎる現象が出る。

修正後：両端の短い線は**軸線に対して垂直**に描く。
これで軸線が水平でも垂直でも斜めでも、見た目が常にキレイ。

```
水平のとき：
  │━━━━━━━│   ← 軸が水平、端線が垂直、直角でT字

垂直のとき：
  ─
  ┃           ← 軸が垂直、端線が水平、直角でT字
  ┃
  ─

斜めのとき：
   ╲          ← 軸線に対して端線が垂直に描かれる
    ╲
     ╲
      ╲
```

### 4. 長さ表示「109.6m」を削除

現状：範囲線の中央に「109.6m」のような数値が表示されている。
これは**ピクセル距離をそのまま「m」として表示しているバグ**。
実寸換算には基準スケールが必要で、写真からは推定不可能。

修正後：**長さ表示は完全に削除**。
樹木医が現場で実測した値はテキストボックス内に手動で書き込む形にする（例：「木槌打診異常、30cm」）。

---

## 実装ガイド

### デフォルト姿（縦方向）

`MarkerSheet.jsx` で範囲マーカー作成時：

```jsx
if (isRange) {
  // タップ位置を中心に、縦方向のデフォルト範囲を作る
  const halfLen = 0.05;  // 写真高さの10%相当
  newMarker.x = tapX;
  newMarker.y = tapY;
  newMarker.rangeStart = { x: tapX, y: tapY - halfLen };  // 上端
  newMarker.rangeEnd   = { x: tapX, y: tapY + halfLen };  // 下端
}
```

### 両端の縦線を軸線に垂直に描画

`RangeMarker` コンポーネント（MarkerOverlay.jsx）：

軸線の方向ベクトルを計算 → それに垂直な単位ベクトルを取得 → 両端から垂直に短い線を描画。

```jsx
function RangeMarker({ marker, partColor, ...props }) {
  const { rangeStart, rangeEnd } = marker;
  
  // 軸線ベクトル（正規化座標で扱う）
  const dx = rangeEnd.x - rangeStart.x;
  const dy = rangeEnd.y - rangeStart.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  // ゼロ除算ガード（始点と終点が一致しているケース）
  if (length === 0) {
    return null;  // 何も描かない、または点として扱う
  }
  
  // 軸線に垂直な単位ベクトル
  // ※座標系：x右、y下（画面座標）。直交ベクトルは (-dy, dx) / length
  const perpX = -dy / length;
  const perpY = dx / length;
  
  // 端線の長さ（正規化座標ではなく、画面ピクセルで指定したいので、
  //   ここでは便宜的に「軸線の長さの15%、ただし最大0.04、最小0.015」程度に）
  // よりキレイにするには SVG の vector-effect="non-scaling-stroke" を使い、
  // 端線の長さを写真要素のサイズから計算する方法もある。
  const endLineHalf = Math.max(0.015, Math.min(0.04, length * 0.15));
  
  // 始点の端線（軸線に垂直）
  const startEndLine = {
    x1: rangeStart.x - perpX * endLineHalf,
    y1: rangeStart.y - perpY * endLineHalf,
    x2: rangeStart.x + perpX * endLineHalf,
    y2: rangeStart.y + perpY * endLineHalf,
  };
  
  // 終点の端線
  const endEndLine = {
    x1: rangeEnd.x - perpX * endLineHalf,
    y1: rangeEnd.y - perpY * endLineHalf,
    x2: rangeEnd.x + perpX * endLineHalf,
    y2: rangeEnd.y + perpY * endLineHalf,
  };
  
  return (
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
      {/* 軸線 */}
      <line
        x1={`${rangeStart.x * 100}%`}
        y1={`${rangeStart.y * 100}%`}
        x2={`${rangeEnd.x * 100}%`}
        y2={`${rangeEnd.y * 100}%`}
        stroke={partColor}
        strokeWidth={2}
      />
      {/* 始点の端線（軸線に垂直） */}
      <line
        x1={`${startEndLine.x1 * 100}%`}
        y1={`${startEndLine.y1 * 100}%`}
        x2={`${startEndLine.x2 * 100}%`}
        y2={`${startEndLine.y2 * 100}%`}
        stroke={partColor}
        strokeWidth={2}
      />
      {/* 終点の端線（軸線に垂直） */}
      <line
        x1={`${endEndLine.x1 * 100}%`}
        y1={`${endEndLine.y1 * 100}%`}
        x2={`${endEndLine.x2 * 100}%`}
        y2={`${endEndLine.y2 * 100}%`}
        stroke={partColor}
        strokeWidth={2}
      />
    </svg>
  );
}
```

### ドラッグハンドルの完全自由化

両端ハンドルは既に存在するはずだが、X座標もY座標も独立に動くようにする：

```jsx
// 左端（始点）ハンドル
<DragHandle
  x={rangeStart.x}
  y={rangeStart.y}
  color={partColor}
  onDrag={(newX, newY) => {
    onUpdate({
      ...marker,
      rangeStart: { x: newX, y: newY },
      // テキストボックスの基準位置も中点として更新
      x: (newX + marker.rangeEnd.x) / 2,
      y: (newY + marker.rangeEnd.y) / 2,
    });
  }}
/>

// 右端（終点）ハンドルも同様
```

**注意**：以前 `y: tapY` のような形でy座標を固定していた箇所があれば、削除して自由に動かせるようにする。

### テキストボックス位置の更新

範囲線の中点を基準にテキストボックスを配置する既存ロジックは維持。
ただし、軸線が斜めや垂直になったとき、テキストボックスの位置がズレないように：

- テキストボックスは中点 `(marker.x, marker.y)` の**上方向**に固定（軸線の角度に追従しない）
- 矢印は中点に向かう
- これは既存の通常マーカーと同じロジック

### 「109.6m」の長さ表示を削除

`MarkerOverlay.jsx`（または範囲マーカー描画部分）で、長さ計算結果をテキストとしてSVGに描画している `<text>` 要素を**完全削除**する。

検索キーワード：
- `109` （ハードコードされている可能性は低いが念のため）
- `Math.sqrt` （距離計算）
- `<text>` （SVGテキスト要素）
- `'m'` または `"m"` （単位表示）
- `length.toFixed` のような小数点フォーマット

該当のテキスト描画ロジックを削除すればOK。

### PC側（photo_annotator.py）も同様の修正

同じく：
- デフォルトの作成方向（縦方向）
- 両端の端線を軸線に垂直に描画
- 「109.6m」のような長さ表示があれば削除

```python
import math

def draw_range_marker(draw, marker, img_width, img_height, color):
    rs = marker['rangeStart']
    re = marker['rangeEnd']
    
    x1 = int(rs['x'] * img_width)
    y1 = int(rs['y'] * img_height)
    x2 = int(re['x'] * img_width)
    y2 = int(re['y'] * img_height)
    
    # 軸線
    draw.line([(x1, y1), (x2, y2)], fill=color, width=2)
    
    # 軸線ベクトル
    dx = x2 - x1
    dy = y2 - y1
    length = math.sqrt(dx * dx + dy * dy)
    if length == 0:
        return
    
    # 軸に垂直な単位ベクトル
    perp_x = -dy / length
    perp_y = dx / length
    
    # 端線の長さ（軸線長の15%、最小・最大あり）
    end_half = max(8, min(20, length * 0.15))
    
    # 始点の端線
    draw.line([
        (x1 - perp_x * end_half, y1 - perp_y * end_half),
        (x1 + perp_x * end_half, y1 + perp_y * end_half),
    ], fill=color, width=2)
    
    # 終点の端線
    draw.line([
        (x2 - perp_x * end_half, y2 - perp_y * end_half),
        (x2 + perp_x * end_half, y2 + perp_y * end_half),
    ], fill=color, width=2)
    
    # ※ 長さテキスト描画は削除！
```

---

## 動作確認チェックリスト

### デフォルト姿

- [ ] 「木槌打診異常」を選んで確定 → タップ位置を中心に**縦方向**の範囲線が作成される
- [ ] 範囲線は写真の上下方向（木の幹に沿う方向）

### 自由角度

- [ ] 両端のハンドルをドラッグ → 自由な角度に変更できる
- [ ] 水平・垂直・斜めいずれの角度でも、端線が軸線に対して垂直に描かれる
- [ ] 端線と軸線が重ならない（T字を維持）

### 長さ表示なし

- [ ] 範囲線上に「109.6m」のような数字が**表示されない**
- [ ] テキストボックスには「木槌打診異常」のテキストのみ（長さは含まない）
- [ ] 樹木医がテキストボックスを編集して「木槌打診異常、30cm」のように手動入力できる

### カルテExcel

- [ ] PWAで作った範囲マーカー → カルテ生成 → Excel上の写真にも縦方向（または編集後の角度）で焼き込まれる
- [ ] Excel上でも長さ表示「109.6m」は焼き込まれない
- [ ] 端線が軸線に垂直に描かれる

---

## やってはいけないこと

- 通常の点マーカーの挙動を変えない
- 範囲マーカーの基本データ構造（type, rangeStart, rangeEnd）を変えない
- main ブランチに直接 push しない

## やっていいこと

- 端線の長さの調整（実機で見て自然な見た目に）
- ドラッグハンドルのサイズ調整
- 範囲線の太さ調整（現在 2px）

---

## 完了報告

実装後、以下を送ってください：

1. 範囲マーカーを縦方向で作成したスクショ
2. 両端をドラッグして**斜め**に変形したスクショ
3. 同じく**水平**に変形したスクショ
4. テキストボックスに「木槌打診異常、30cm」のような手動入力をしたスクショ
5. カルテExcelに焼き込まれた状態のスクショ

特に**両端の端線が軸線に対して垂直に描画されていること**を確認してください。

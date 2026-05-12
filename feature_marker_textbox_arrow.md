# 修正指示書：マーカーUI改善（テキストボックス＋矢印＋編集機能）

## 概要

写真ファースト・フロー（Phase 1〜5）の実装後フィードバック。
現状の「点マーカー」を、より情報量が多く編集可能な「**矢印付きテキストボックス**」形式に進化させる。

ブランチ：`feature/photo-first-flow`（既存のまま継続）

---

## 現状の問題

1. **マーカーが点だけ**で、写真上で見ても何の病害かわからない（タップしないと内容が見えない）
2. **病害名の編集ができない**（チップで選んだものから変更不可、現場の補足情報を書き込めない）

---

## 改善内容

### 1. マーカーの形を「矢印付きテキストボックス」に変更

**現状（点マーカー）：**
```
   📍 ← 写真上に色付きの点
```

**改善後（テキストボックス＋矢印）：**
```
┌─────────────┐
│ 不自然な傾斜 │ ← 黒テキスト、白背景、青枠（根元）
└─────┐──────┘
      ↓
      🎯 ← 対象箇所
```

#### 詳細仕様

- **テキストボックス**
  - 背景：白 (`#ffffff`)
  - テキスト色：黒 (`#000000`)
  - 枠線：部位別色（下記参照）、太さ 2px、角丸 4px
  - パディング：縦 4px、横 8px
  - フォントサイズ：12px（スマホで読める最小サイズ）
  - 影：軽めの drop-shadow（写真上での視認性確保）

- **矢印**
  - 色：枠線と同じ（部位別色）
  - テキストボックス下辺の中央 → 対象箇所
  - 矢じり付き
  - 太さ 2px
  - 長さは可変（テキストボックスと対象箇所の距離で決まる）

- **対象箇所**
  - 矢印の先端＝マーカーの座標 `(x, y)`
  - 小さな丸（◯）や十字（✕）など、視認できる印を1つ
  - 色：部位色

#### 部位別色（信号スタイル、既存決定通り）

| 部位 | 色 | カラーコード | Tailwind |
|---|---|---|---|
| 根元 | 青 | `#2563eb` | `blue-600` |
| 幹 | 緑 | `#16a34a` | `green-600` |
| 大枝 | 赤 | `#dc2626` | `red-600` |

### 2. テキストボックスの内容を編集可能に

#### 動作仕様

1. チップ選択でマーカー作成 → テキストボックスにチップ名が自動入力
2. **テキストボックスをタップ** → 編集モードに入る（カーソルが現れる）
3. キーボードで自由に編集（追記・修正・全消し）
4. テキストボックス外をタップ or キーボードのEnter → 編集確定、編集モード解除

#### 編集内容の例

```
チップ選択直後: "不自然な傾斜"
              ↓ 編集
編集後:        "不自然な傾斜（北方向に約15度）"
```

#### 注意

- 編集してもデータ構造上の `item` フィールドは更新する（メモ自動生成にも反映）
- 元のチップ選択にロールバックする機能は不要
- 文字数制限は緩く（50文字程度まで、それ以上は折り返し表示）

### 3. 長押しで折り畳み（点マーカー化）

写真がマーカーで埋まって見づらいとき用。

#### 動作仕様

- **テキストボックスを長押し**（500ms以上）→ 折り畳みアニメーション → **部位色の点**になる
- **折り畳み状態の点をタップ** → 展開アニメーション → テキストボックスが復活
- 折り畳み状態でも矢印と対象箇所は維持？それともマーカー（点）だけ表示？
  → **シンプルに点だけ表示**（折り畳み時は矢印も非表示）

```
展開状態:
┌─────────────┐
│ 不自然な傾斜 │
└─────┐──────┘
      ↓
      🎯

長押し →

折り畳み状態:
      🟦 ← 部位色の点（タップで再展開）
```

#### データ構造

各マーカーに `collapsed` フィールドを追加（boolean）：

```json
{
  "id": "m1",
  "x": 0.42,
  "y": 0.78,
  "part": "根元",
  "item": "不自然な傾斜（北方向に約15度）",
  "collapsed": false  // ← 追加
}
```

折り畳み状態もJSONエクスポート時に保存。

### 4. テキストボックスの位置決め

テキストボックスは「対象箇所（座標）」とは別の場所に表示する必要がある。

#### 初期配置ルール

- マーカー作成時、テキストボックスは**対象箇所から上方向に40〜60px離れた位置**にデフォルト配置
- ただし写真の端で見切れる場合は、自動的に下/左/右に配置をずらす（端制約のclamp）

#### ユーザーによる位置調整

**今回は不要**。シンプルさを優先。
（将来的に「テキストボックスをドラッグして位置移動」が欲しくなったら別タスク化）

---

## 触るファイル

### 主に修正

- `src/components/MarkerOverlay.jsx`
  - マーカーの描画ロジック全面書き換え
  - 点 → テキストボックス＋矢印＋対象点
  - 編集モードの実装
  - 折り畳み状態の切替

### 影響あり

- `src/components/MarkerSheet.jsx`
  - チップ選択後、即座に編集モードに入る挙動を追加？
  - もしくは、チップ選択 → 確定 → そのままで、編集はテキストボックスタップから
  - シンプルさ重視で**後者**を推奨

- `src/App.jsx` または同等の state 管理
  - `collapsed` フィールドのマイグレーション（既存マーカーには `collapsed: false` をデフォルト追加）

- `karte-generator/photo_annotator.py`（PC側）
  - Excel焼き込みも同じスタイルに変更
  - 黒テキスト+白背景+部位色枠+矢印で焼き込み

---

## 実装ガイド

### MarkerOverlay.jsx 構造の参考

```jsx
function MarkerOverlay({ marker, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(marker.item);
  
  const partColor = PART_COLORS[marker.part];
  // PART_COLORS = { 根元: '#2563eb', 幹: '#16a34a', 大枝: '#dc2626' }
  
  // 長押し検出
  const handleLongPress = useLongPress(() => {
    onUpdate({ ...marker, collapsed: !marker.collapsed });
  }, 500);
  
  if (marker.collapsed) {
    // 折り畳み状態：点だけ表示
    return (
      <div
        onClick={() => onUpdate({ ...marker, collapsed: false })}
        style={{ 
          position: 'absolute',
          left: `${marker.x * 100}%`,
          top: `${marker.y * 100}%`,
          backgroundColor: partColor,
          width: 14,
          height: 14,
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          cursor: 'pointer',
        }}
      />
    );
  }
  
  // 展開状態：テキストボックス＋矢印＋対象点
  return (
    <>
      {/* テキストボックス（対象箇所の上方向に配置） */}
      <div
        {...handleLongPress}
        style={{
          position: 'absolute',
          left: `${marker.x * 100}%`,
          top: `calc(${marker.y * 100}% - 60px)`,  // 上に60pxずらす
          transform: 'translate(-50%, -100%)',
          background: 'white',
          color: 'black',
          border: `2px solid ${partColor}`,
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 12,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          minWidth: 80,
          maxWidth: 200,
        }}
      >
        {isEditing ? (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              onUpdate({ ...marker, item: text });
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onUpdate({ ...marker, item: text });
                setIsEditing(false);
              }
            }}
            autoFocus
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: 'inherit',
              color: 'inherit',
            }}
          />
        ) : (
          <span onClick={() => setIsEditing(true)}>
            {marker.item}
          </span>
        )}
      </div>
      
      {/* 矢印（SVG） */}
      <svg
        style={{
          position: 'absolute',
          left: `${marker.x * 100}%`,
          top: `calc(${marker.y * 100}% - 60px)`,
          transform: 'translate(-50%, 0)',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        width="2"
        height="60"
      >
        <line
          x1="1" y1="0"
          x2="1" y2="55"
          stroke={partColor}
          strokeWidth="2"
        />
        {/* 矢じり */}
        <polygon
          points="1,60 -3,52 5,52"
          fill={partColor}
        />
      </svg>
      
      {/* 対象点（マーカー位置の◯） */}
      <div
        style={{
          position: 'absolute',
          left: `${marker.x * 100}%`,
          top: `${marker.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: partColor,
        }}
      />
    </>
  );
}
```

上記は参考実装。実際は既存の `MarkerOverlay.jsx` の構造に合わせて書き換えてください。

### 長押し検出（useLongPress）

`react-use` などのライブラリにあれば使う。無ければシンプルに自前実装：

```jsx
function useLongPress(callback, ms = 500) {
  const timerRef = useRef();
  
  const start = () => {
    timerRef.current = setTimeout(callback, ms);
  };
  
  const cancel = () => {
    clearTimeout(timerRef.current);
  };
  
  return {
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: cancel,
  };
}
```

### photo_annotator.py の更新（PC側）

Excel焼き込み時も同じスタイルに：

```python
def draw_marker(draw, marker, img_width, img_height):
    x = int(marker['x'] * img_width)
    y = int(marker['y'] * img_height)
    
    # テキストボックスの位置（対象点の上）
    text = marker['item']
    box_x = x
    box_y = y - 60
    
    # テキストサイズ計測
    bbox = draw.textbbox((0, 0), text, font=FONT)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    # 部位色（PILは(R,G,B)タプル）
    part_color_map = {
        '根元': (37, 99, 235),    # blue-600
        '幹':   (22, 163, 74),    # green-600
        '大枝': (220, 38, 38),    # red-600
    }
    color = part_color_map.get(marker['part'], (0, 0, 0))
    
    # テキストボックス描画
    pad = 6
    box_left = box_x - text_w // 2 - pad
    box_right = box_x + text_w // 2 + pad
    box_top = box_y - text_h // 2 - pad
    box_bottom = box_y + text_h // 2 + pad
    
    # 白背景
    draw.rectangle([box_left, box_top, box_right, box_bottom], fill=(255, 255, 255))
    # 部位色の枠
    draw.rectangle([box_left, box_top, box_right, box_bottom], outline=color, width=2)
    # 黒テキスト
    draw.text((box_x - text_w // 2, box_y - text_h // 2), text, fill=(0, 0, 0), font=FONT)
    
    # 矢印（線）
    draw.line([(box_x, box_bottom), (x, y - 5)], fill=color, width=2)
    # 矢じり（三角形）
    draw.polygon([
        (x, y),
        (x - 4, y - 8),
        (x + 4, y - 8),
    ], fill=color)
    
    # 対象点
    draw.ellipse([x - 4, y - 4, x + 4, y + 4], fill=color)
```

折り畳み状態（`collapsed: true`）のマーカーはExcel焼き込み**しない**？するなら点だけ。
→ **しない**（カルテにはすべて展開して焼き込む方が正式文書としてふさわしい）

折り畳みは画面上の表示制御のみ、として実装する。

---

## 動作確認チェックリスト

### マーカー作成

- [ ] 写真をタップ → チップシート開く → 部位選択 → チップ選択 → 確定
- [ ] テキストボックス＋矢印＋対象点が表示される
- [ ] 部位別色（青/緑/赤）が枠と矢印に正しく反映される

### 編集

- [ ] テキストボックスをタップ → 編集モードに入る
- [ ] キーボードで自由に編集できる
- [ ] テキストボックス外タップ or Enter で確定
- [ ] 編集内容がデータに保存される（保存→再起動で残る）
- [ ] 編集内容がメモ自動生成（generated memo）に反映される

### 折り畳み

- [ ] テキストボックス長押し → 折り畳まれて点になる
- [ ] 点タップ → 展開する
- [ ] 折り畳み状態もデータに保存される

### 削除

- [ ] 既存仕様どおりマーカー編集メニューから削除可能
- [ ] 編集モード中は削除メニューは出ない（誤操作防止）

### カルテExcel

- [ ] PWAから出したJSON → カルテ生成 → 写真にテキストボックス＋矢印が焼き込まれる
- [ ] テキストボックス：白背景+黒文字+部位色枠
- [ ] 矢印と対象点：部位色
- [ ] 折り畳み状態でも、Excel焼き込み時は展開して描画される

---

## やってはいけないこと

- 既存の `collapsed` 以外のマーカーフィールド（id, x, y, part, item）を変更しない
- チップシートの動作を変えない（既存の選択フロー維持）
- main ブランチに直接 push しない（feature/photo-first-flow で作業）

## やっていいこと

- テキストボックスのサイズ調整（実機で見て、ピクセル単位の微調整）
- 矢印の見た目調整（矢じりの形、線の太さなど）
- 編集モードのキーボード挙動の細かい改善（Escでキャンセルなど）

---

## 完了報告

実装後、以下を送ってください：

1. PWA画面のスクショ：マーカー1個作成→編集→折り畳み の状態を3パターン
2. カルテExcel生成のスクショ：写真部分にテキストボックスが焼き込まれている状態
3. 想定外の挙動・実装で迷った箇所があれば

---

## ロールバック方法

もし大きく壊れたら、git で前の状態に戻せます：

```
git reset --hard HEAD
```

または、ファイル単位で戻すなら：

```
git checkout HEAD -- src/components/MarkerOverlay.jsx
```

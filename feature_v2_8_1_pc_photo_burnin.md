# v2.8.1：カルテExcel生成時の写真アノテーション焼き込み（PC側）

## 概要

PWA（v2.8）でつけた annotations（病害名と座標）を、カルテExcel生成時に**全景写真にPILで赤矢印＋白背景テキストボックスを焼き込んで**から貼り付ける機能を追加する。

修正対象は `karte-generator/` 内の Python コード。

---

## 前提：JSONの構造

PWA から出力される JSON の中身：

```json
{
  "trees": [
    {
      "treeNumber": "1",
      "species": "アカガシ",
      "photoFull": {
        "annotations": [
          {
            "id": "ann_xxx",
            "anchorX": 0.45,    // 患部位置（0-1正規化）
            "anchorY": 0.30,
            "labelX": 0.55,     // テキストボックス左上
            "labelY": 0.18,
            "text": "ベッコウタケ"
          }
        ]
      }
    }
  ]
}
```

座標は写真サイズに対する 0〜1 の正規化座標。**写真の実ピクセルサイズに掛けて使う**。

---

## ステップ1：依存ライブラリ確認

`karte-generator/` で以下のコマンドを実行（既にインストール済みのはず）：

```bash
python -m pip install pillow
```

`Pillow` が既に入っている前提で進める。

---

## ステップ2：写真アノテーション描画モジュールを新規作成

`karte-generator/photo_annotator.py` を新規作成：

```python
# karte-generator/photo_annotator.py
"""
写真にannotations（病害名マーク）を焼き込むモジュール。
PWA(v2.8)で記録した正規化座標をピクセル座標に変換し、
赤矢印 + 白背景テキストボックスをPILで描画する。
"""

import io
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


# ==================== フォント設定 ====================

def get_japanese_font(size: int):
    """
    日本語が使えるTrueTypeフォントを返す。
    Windows優先、見つからなければデフォルト。
    """
    candidates = [
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        "C:/Windows/Fonts/YuGothM.ttc",
        "C:/Windows/Fonts/YuGothic.ttf",
        # 念のためLinux/Mac用
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except (OSError, IOError):
                continue
    # 最終フォールバック（日本語表示できないかも）
    return ImageFont.load_default()


# ==================== 矢印描画 ====================

def draw_arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple,
    end: tuple,
    color="red",
    width: int = 4,
    head_size: int = 18,
):
    """
    start から end へ向かう矢印を描画。
    end が矢じりの先端（患部位置）。
    """
    # 矢印本体
    draw.line([start, end], fill=color, width=width)
    
    # 矢じり（先端を頂点とする三角形）
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    arrow_angle = math.radians(25)  # 矢じりの開き角
    
    p1 = (
        end[0] - head_size * math.cos(angle - arrow_angle),
        end[1] - head_size * math.sin(angle - arrow_angle),
    )
    p2 = (
        end[0] - head_size * math.cos(angle + arrow_angle),
        end[1] - head_size * math.sin(angle + arrow_angle),
    )
    draw.polygon([end, p1, p2], fill=color)


# ==================== テキストボックス境界点計算 ====================

def get_box_boundary_point(
    box: tuple,  # (left, top, right, bottom)
    target: tuple  # 目標点
) -> tuple:
    """
    ボックスの中心から目標点に向かう線が、ボックスのどの辺と交わるか計算。
    その交点（矢印の根元）を返す。
    """
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2
    tx, ty = target
    dx = tx - cx
    dy = ty - cy
    
    if dx == 0 and dy == 0:
        return (cx, cy)
    
    half_w = (box[2] - box[0]) / 2
    half_h = (box[3] - box[1]) / 2
    
    # ボックスの境界に当たるまでの倍率を計算
    # |dx*t| <= half_w  かつ  |dy*t| <= half_h
    t_x = half_w / abs(dx) if dx != 0 else float('inf')
    t_y = half_h / abs(dy) if dy != 0 else float('inf')
    t = min(t_x, t_y)
    
    return (cx + dx * t, cy + dy * t)


# ==================== メイン関数 ====================

def annotate_photo(
    photo_input,            # ファイルパス(str/Path) または bytes/BytesIO
    annotations: list,
    output_format: str = "JPEG",
    output_quality: int = 92,
) -> io.BytesIO:
    """
    写真に annotations を焼き込んで BytesIO で返す。
    
    Args:
        photo_input: 画像ファイルパス または バイト列
        annotations: PWAから出力されたannotations配列
            [{anchorX, anchorY, labelX, labelY, text}, ...]
        output_format: "JPEG" or "PNG"
        output_quality: JPEG画質（1-100）
    
    Returns:
        BytesIO: 焼き込み後の画像バイナリ。openpyxl の Image() に渡せる。
    """
    # 画像読み込み
    img = Image.open(photo_input).convert("RGB")
    width, height = img.size
    
    # annotationsが空なら元画像をそのまま返す
    if not annotations:
        output = io.BytesIO()
        img.save(output, format=output_format, quality=output_quality)
        output.seek(0)
        return output
    
    draw = ImageDraw.Draw(img)
    
    # 写真サイズに応じたパラメータ調整
    # 文字サイズは写真幅の約3%、最小16px
    font_size = max(16, int(width * 0.030))
    font = get_japanese_font(font_size)
    
    # 線の太さ・矢じりサイズも写真サイズに連動
    arrow_width = max(2, int(width * 0.004))
    arrow_head_size = max(10, int(width * 0.015))
    box_padding = max(4, int(width * 0.008))
    box_border_width = max(2, int(width * 0.004))
    anchor_radius = max(3, int(width * 0.005))
    
    for ann in annotations:
        try:
            # 正規化座標 → ピクセル座標
            ax = ann["anchorX"] * width
            ay = ann["anchorY"] * height
            lx = ann["labelX"] * width
            ly = ann["labelY"] * height
            text = str(ann.get("text", "")).strip()
        except (KeyError, TypeError):
            continue
        
        if not text:
            continue
        
        # テキストサイズ計測
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        
        # テキストボックス矩形（左上 lx, ly）
        box_left = lx
        box_top = ly
        box_right = lx + text_w + box_padding * 2
        box_bottom = ly + text_h + box_padding * 2
        box = (box_left, box_top, box_right, box_bottom)
        
        # 矢印起点：テキストボックスの境界（患部に向かう側）
        arrow_start = get_box_boundary_point(box, (ax, ay))
        
        # ① 矢印を先に描く（テキストボックスの下に隠れる部分は問題なし）
        draw_arrow(
            draw,
            start=arrow_start,
            end=(ax, ay),
            color="red",
            width=arrow_width,
            head_size=arrow_head_size,
        )
        
        # ② 患部の丸印
        draw.ellipse(
            (ax - anchor_radius, ay - anchor_radius,
             ax + anchor_radius, ay + anchor_radius),
            fill="red",
        )
        
        # ③ テキストボックス（白背景＋赤枠）
        draw.rectangle(
            box,
            fill="white",
            outline="red",
            width=box_border_width,
        )
        
        # ④ テキスト（黒）
        draw.text(
            (box_left + box_padding, box_top + box_padding - bbox[1]),
            text,
            fill="black",
            font=font,
        )
    
    # BytesIO に書き出し
    output = io.BytesIO()
    img.save(output, format=output_format, quality=output_quality)
    output.seek(0)
    return output


# ==================== スタンドアロンテスト ====================

if __name__ == "__main__":
    # python photo_annotator.py <input_image> <output_image>
    # 簡単なテスト用
    if len(sys.argv) < 3:
        print("Usage: python photo_annotator.py <input> <output>")
        sys.exit(1)
    
    sample_annotations = [
        {"anchorX": 0.45, "anchorY": 0.30, "labelX": 0.60, "labelY": 0.15, "text": "ベッコウタケ"},
        {"anchorX": 0.30, "anchorY": 0.65, "labelX": 0.05, "labelY": 0.80, "text": "開口空洞"},
    ]
    
    result = annotate_photo(sys.argv[1], sample_annotations)
    with open(sys.argv[2], "wb") as f:
        f.write(result.read())
    print(f"OK: {sys.argv[2]}")
```

---

## ステップ3：generate.py に組み込む

`karte-generator/generate.py` の中で、**全景写真を Excel に貼り付けている処理**を見つける。

その処理は概ね以下のような形になっているはず：

```python
from openpyxl.drawing.image import Image as XLImage

# 写真パスを受け取って Image オブジェクトを作成
img = XLImage(photo_path)
img.width = ...
img.height = ...
ws.add_image(img, "A1")
```

これを以下のように改修する：

```python
from photo_annotator import annotate_photo  # ← 新規追加

# 全景写真を貼り付ける部分
photo_full = tree.get("photoFull") or {}
photo_path = ...  # 既存の写真パス取得ロジックそのまま

annotations = photo_full.get("annotations", [])

if annotations:
    # アノテーション焼き込み
    annotated_bytes = annotate_photo(photo_path, annotations)
    img = XLImage(annotated_bytes)
else:
    # アノテーションなしなら元画像のまま
    img = XLImage(photo_path)

img.width = ...  # 既存通り
img.height = ...
ws.add_image(img, "A1")
```

**重要**：
- `XLImage` は `BytesIO` も受け取れる（openpyxl 3.0+）
- 全景写真にだけ適用、クローズアップ写真は触らない
- 既存の貼付け先セル・サイズ調整ロジックは変更不要

### 写真パスの取得方法

引き継ぎサマリーによると、karte-generator は JSON をドラッグ&ドロップで受け取る方式。**現状の写真パス取得ロジックがどうなっているか**は実コードを見て確認すること。よくあるパターン：

- JSON と同じディレクトリの `photos/{treeNumber}_full.jpg`
- ZIP展開時の相対パス
- JSON内の `photoFull.path` フィールド

既存のロジックをそのまま再利用すること。**写真パス取得ロジック自体は今回のスコープ外**。

---

## ステップ4：generate_gui.py 側は基本的に修正不要

`generate_gui.py` は generate.py を呼び出しているだけのはずなので、**通常は修正不要**。

ただし、もし「アノテーション焼き込み中…」というプログレス表示を追加したいなら、後述。

---

## ステップ5：単体テスト

実装後、まず`photo_annotator.py` 単体でテスト：

```bash
cd karte-generator
python photo_annotator.py test_photo.jpg test_output.jpg
```

`test_output.jpg` を開いて、サンプルの2つのマーク（ベッコウタケ・開口空洞）が描画されているか確認。

期待される見た目：
- 患部位置に小さな赤丸
- そこから赤い矢印（矢じり付き）
- テキストボックスの境界（白背景＋赤枠）から矢印が出ている
- テキストは黒、可読性◎

---

## ステップ6：統合テスト

PWA から annotations 付きでエクスポートしたJSONを使って、カルテExcelを生成：

```bash
python generate.py path/to/exported.json
```

または GUI 経由で実行。生成されたExcelを開いて、**全景写真にアノテーションが焼き込まれている**ことを確認。

---

## ステップ7：動作確認チェックリスト

- [ ] `photo_annotator.py` の単体テストが通る（テスト画像にマーク2個が綺麗に描画される）
- [ ] 日本語（ベッコウタケなど）が文字化けせず表示される
- [ ] 矢印の先端が患部位置を正確に指している
- [ ] テキストボックスが白背景・赤枠で見やすい
- [ ] 矢印がテキストボックスの**境界**から出ている（中心からはみ出していない）
- [ ] annotations が空の樹は元の写真のまま貼られる（エラーにならない）
- [ ] 1本の樹に複数マーク（2〜3個）でも全部描画される
- [ ] generate.py 経由でカルテExcelを作って、全景写真に焼き込みされた写真が貼られている
- [ ] アノテーションなしの旧JSONでも引き続き動作する（後方互換）
- [ ] クローズアップ写真は触られていない（既存通り）

---

## トラブルシューティング想定

### Q1：日本語が「□□□」になる

→ フォントが見つかっていない。`get_japanese_font()` の candidates にWindowsのフォントパスが正しく書かれているか確認。Windows 11なら `C:/Windows/Fonts/meiryo.ttc` が存在するはず。

### Q2：矢印が斜めに歪む / 太さがおかしい

→ 写真サイズが極端に小さい or 大きい可能性。`arrow_width = max(2, int(width * 0.004))` の係数を調整。

### Q3：テキストボックスが写真外にはみ出す

→ PWA側で labelX/labelY が範囲外（>1）になっている可能性。`annotate_photo` 関数の冒頭で clamp する処理を追加：
```python
ann_x = max(0, min(0.95, ann["labelX"]))  # 完全に外に出ないように
```

### Q4：openpyxl が BytesIO を受け取らない

→ openpyxl のバージョンが古い可能性。`pip install -U openpyxl` で更新。

### Q5：実行時に「ModuleNotFoundError: photo_annotator」

→ generate.py と photo_annotator.py が同じディレクトリにあるか確認。`from photo_annotator import annotate_photo` の前に `import sys; sys.path.insert(0, str(Path(__file__).parent))` を入れると安全。

### Q6：複数マークが重なってテキストが読めない

→ これはPWA側の問題（labelX/labelY の自動配置ロジック）。今回のスコープ外。複数マーク時にユーザーがドラッグで位置調整する前提。

---

## .exe化への影響

PyInstaller で .exe 化する場合、`photo_annotator.py` も自動で含まれる（`from photo_annotator import ...` をコード内で書いていれば）。

ただし、**フォントファイル（meiryo.ttc 等）はexe内に含まれない**。ユーザーのWindowsシステムフォントを参照する形なので、配布先のPCにも日本語フォントが入っている前提。Windows 7 以降ならまず問題なし。

---

## 完了報告フォーマット

実装後、以下を報告してください：

1. 動作確認チェックリスト全項目の結果
2. `photo_annotator.py` 単体テストの出力画像（または生成されたExcel）のスクショ
3. 実機統合テストで生成したカルテExcelの該当ページ（全景写真部分）のスクショ

問題があればスクショと、可能なら入力JSONサンプル（annotations 部分）をアップロード。

---

## 次のステップ案

ここまでで「フェーズ1：方式A（焼き込み）」が完成します。実物を見て：

- **十分**ならこのまま運用、改善は実運用フィードバック待ち
- **微調整したい場面が多い**なら方式B（Excel図形）へフェーズ2移行
- **見栄え改善**なら矢印スタイル・色のバリエーション追加

実際に使ってみてからの判断でOK。

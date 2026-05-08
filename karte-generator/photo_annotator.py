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
    """日本語が使えるTrueTypeフォントを返す。"""
    candidates = [
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        "C:/Windows/Fonts/YuGothM.ttc",
        "C:/Windows/Fonts/YuGothic.ttf",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except (OSError, IOError):
                continue
    return ImageFont.load_default()


# ==================== 矢印描画 ====================

def draw_arrow(draw, start, end, color="red", width=4, head_size=18):
    """start から end へ向かう矢印を描画。end が矢じりの先端。"""
    draw.line([start, end], fill=color, width=width)

    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    arrow_angle = math.radians(25)

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

def get_box_boundary_point(box, target):
    """ボックスの中心から目標点へ向かう線がボックス辺と交わる点を返す。"""
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2
    tx, ty = target
    dx = tx - cx
    dy = ty - cy

    if dx == 0 and dy == 0:
        return (cx, cy)

    half_w = (box[2] - box[0]) / 2
    half_h = (box[3] - box[1]) / 2

    t_x = half_w / abs(dx) if dx != 0 else float('inf')
    t_y = half_h / abs(dy) if dy != 0 else float('inf')
    t = min(t_x, t_y)

    return (cx + dx * t, cy + dy * t)


# ==================== メイン関数 ====================

def annotate_photo(photo_input, annotations, output_format="JPEG", output_quality=92):
    """
    写真に annotations を焼き込んで BytesIO で返す。

    Args:
        photo_input: 画像ファイルパス, bytes, または BytesIO
        annotations: [{anchorX, anchorY, labelX, labelY, text}, ...]
        output_format: "JPEG" or "PNG"
        output_quality: JPEG画質
    Returns:
        BytesIO
    """
    img = Image.open(photo_input).convert("RGB")
    width, height = img.size

    if not annotations:
        output = io.BytesIO()
        img.save(output, format=output_format, quality=output_quality)
        output.seek(0)
        return output

    draw = ImageDraw.Draw(img)

    font_size = max(16, int(width * 0.030))
    font = get_japanese_font(font_size)

    arrow_width = max(2, int(width * 0.004))
    arrow_head_size = max(10, int(width * 0.015))
    box_padding = max(4, int(width * 0.008))
    box_border_width = max(2, int(width * 0.004))
    anchor_radius = max(3, int(width * 0.005))

    for ann in annotations:
        try:
            ax = max(0.0, min(1.0, ann["anchorX"])) * width
            ay = max(0.0, min(1.0, ann["anchorY"])) * height
            lx = max(0.0, min(0.95, ann["labelX"])) * width
            ly = max(0.0, min(0.95, ann["labelY"])) * height
            text = str(ann.get("text", "")).strip()
        except (KeyError, TypeError):
            continue

        if not text:
            continue

        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

        box_left = lx
        box_top = ly
        box_right = lx + text_w + box_padding * 2
        box_bottom = ly + text_h + box_padding * 2
        box = (box_left, box_top, box_right, box_bottom)

        arrow_start = get_box_boundary_point(box, (ax, ay))

        # 矢印
        draw_arrow(draw, start=arrow_start, end=(ax, ay),
                   color="red", width=arrow_width, head_size=arrow_head_size)

        # 患部の丸印
        draw.ellipse(
            (ax - anchor_radius, ay - anchor_radius,
             ax + anchor_radius, ay + anchor_radius),
            fill="red",
        )

        # テキストボックス（白背景＋赤枠）
        draw.rectangle(box, fill="white", outline="red", width=box_border_width)

        # テキスト
        draw.text(
            (box_left + box_padding, box_top + box_padding - bbox[1]),
            text, fill="black", font=font,
        )

    output = io.BytesIO()
    img.save(output, format=output_format, quality=output_quality)
    output.seek(0)
    return output


# ==================== スタンドアロンテスト ====================

if __name__ == "__main__":
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

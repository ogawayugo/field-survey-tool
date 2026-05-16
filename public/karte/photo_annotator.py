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
        # Pyodide環境（同梱フォント、優先）
        "/work/fonts/ipag.ttf",
        "/work/fonts/NotoSansCJK-Regular.ttc",
        # Windows
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        "C:/Windows/Fonts/YuGothM.ttc",
        "C:/Windows/Fonts/YuGothic.ttf",
        # macOS
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
        # Linux
        "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
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


# ==================== マーカー焼き込み（写真ファーストフロー） ====================

def draw_text_with_outline(draw, x, y, text, font, text_color=(0, 0, 0),
                           outline_color=(255, 255, 255), outline_width=2):
    """白フチ付き黒テキストを描画する。"""
    for dx in range(-outline_width, outline_width + 1):
        for dy in range(-outline_width, outline_width + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((x + dx, y + dy), text, fill=outline_color, font=font)
    draw.text((x, y), text, fill=text_color, font=font)


def annotate_photo_with_markers(photo_input, markers, output_format="JPEG", output_quality=92):
    """
    写真ファーストフローのマーカーを焼き込む。
    テキストボックス（白背景+黒文字+部位色枠）+ 矢印 + 対象点。
    折り畳み状態（collapsed）のマーカーも展開して描画する。

    Args:
        photo_input: 画像ファイルパス, bytes, または BytesIO
        markers: [{"x": 0.42, "y": 0.78, "part": "根元", "item": "不自然な傾斜"}, ...]
        output_format: "JPEG" or "PNG"
        output_quality: JPEG画質
    Returns:
        BytesIO
    """
    img = Image.open(photo_input).convert("RGB")
    width, height = img.size

    if not markers:
        output = io.BytesIO()
        img.save(output, format=output_format, quality=output_quality)
        output.seek(0)
        return output

    draw = ImageDraw.Draw(img)

    font_size = max(16, int(width * 0.028))
    font = get_japanese_font(font_size)
    box_padding = max(4, int(width * 0.006))
    box_border = max(2, int(width * 0.003))
    arrow_width = max(2, int(width * 0.003))
    target_radius = max(4, int(width * 0.005))
    box_offset_y = max(40, int(height * 0.06))

    # 部位色 (R, G, B)
    PART_COLOR_MAP = {
        '根元': (37, 99, 235),    # blue-600
        '幹':   (22, 163, 74),    # green-600
        '大枝': (220, 38, 38),    # red-600
    }

    # ============================================================
    # 描画順を 2 パスに分ける（範囲マーカーがテキストボックスを横切る
    # 問題を回避）
    #   Pass 1: 範囲マーカーの軸線・端線（背景レイヤー）
    #   Pass 2: テキストボックス・テキスト・矢印・対象点（前面レイヤー）
    # ============================================================

    # ---- Pass 1: range markers の軸線と端線を先に描く ----
    for marker in markers:
        if marker.get("type") != "range":
            continue
        if "rangeStart" not in marker or "rangeEnd" not in marker:
            continue
        try:
            part = str(marker.get("part", ""))
            color = PART_COLOR_MAP.get(part, (0, 0, 0))
            rs = marker["rangeStart"]
            re_ = marker["rangeEnd"]
            rx1 = int(max(0.0, min(1.0, rs["x"])) * width)
            ry1 = int(max(0.0, min(1.0, rs["y"])) * height)
            rx2 = int(max(0.0, min(1.0, re_["x"])) * width)
            ry2 = int(max(0.0, min(1.0, re_["y"])) * height)
        except (KeyError, TypeError):
            continue

        range_line_w = max(2, int(width * 0.003))
        draw.line([(rx1, ry1), (rx2, ry2)], fill=color, width=range_line_w)
        rdx = rx2 - rx1
        rdy = ry2 - ry1
        r_len = math.sqrt(rdx * rdx + rdy * rdy)
        if r_len > 0:
            perp_x = -rdy / r_len
            perp_y = rdx / r_len
            end_half = max(8, min(20, r_len * 0.15))
            draw.line([
                (int(rx1 + perp_x * end_half), int(ry1 + perp_y * end_half)),
                (int(rx1 - perp_x * end_half), int(ry1 - perp_y * end_half)),
            ], fill=color, width=range_line_w)
            draw.line([
                (int(rx2 + perp_x * end_half), int(ry2 + perp_y * end_half)),
                (int(rx2 - perp_x * end_half), int(ry2 - perp_y * end_half)),
            ], fill=color, width=range_line_w)

    # ---- Pass 2: テキストボックス・矢印・対象点 ----
    for marker in markers:
        try:
            mx = max(0.0, min(1.0, marker["x"])) * width
            my = max(0.0, min(1.0, marker["y"])) * height
            part = str(marker.get("part", ""))
            item = str(marker.get("item", ""))
            marker_text = str(marker.get("text", "")).strip()
        except (KeyError, TypeError):
            continue

        # text (textbox 内容) を優先、なければ item、最後に part
        text = marker_text if marker_text else (item if item else part)
        if not text.strip():
            continue

        color = PART_COLOR_MAP.get(part, (0, 0, 0))

        # テキストサイズ計測
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

        # テキストボックス位置: labelX/labelY があればそれを使用、なければデフォルト
        if "labelX" in marker and "labelY" in marker:
            box_cx = max(0.0, min(1.0, marker["labelX"])) * width
            box_cy = max(0.0, min(1.0, marker["labelY"])) * height
        else:
            box_cx = mx
            box_cy = my - box_offset_y

        box_left = int(box_cx - text_w / 2 - box_padding)
        box_right = int(box_cx + text_w / 2 + box_padding)
        box_top = int(box_cy - text_h / 2 - box_padding)
        box_bottom = int(box_cy + text_h / 2 + box_padding)

        # 画面外はみ出し補正
        if box_left < 4:
            shift = 4 - box_left
            box_left += shift
            box_right += shift
            box_cx += shift
        if box_right > width - 4:
            shift = box_right - (width - 4)
            box_left -= shift
            box_right -= shift
            box_cx -= shift
        if box_top < 4:
            box_top = 4
            box_bottom = box_top + text_h + box_padding * 2
            box_cy = (box_top + box_bottom) / 2
        if box_bottom > height - 4:
            box_bottom = height - 4
            box_top = box_bottom - text_h - box_padding * 2
            box_cy = (box_top + box_bottom) / 2

        # 白背景テキストボックス
        draw.rectangle(
            [box_left, box_top, box_right, box_bottom],
            fill=(255, 255, 255),
        )
        # 部位色の枠線
        draw.rectangle(
            [box_left, box_top, box_right, box_bottom],
            outline=color, width=box_border,
        )
        # 黒テキスト
        text_x = int(box_cx - text_w / 2)
        text_y = int(box_cy - text_h / 2) - bbox[1]
        draw.text((text_x, text_y), text, fill=(0, 0, 0), font=font)

        # 矢印: ボックスの境界点から対象点まで（角度を正しく計算）
        box_rect = (box_left, box_top, box_right, box_bottom)
        target_point = (mx, my)
        arrow_start = get_box_boundary_point(box_rect, target_point)

        # 矢じり先端は対象点の手前 target_radius だけ手前で止める
        dx = mx - arrow_start[0]
        dy = my - arrow_start[1]
        dist = math.sqrt(dx * dx + dy * dy)
        if dist > target_radius:
            arrow_end_x = mx - (dx / dist) * target_radius
            arrow_end_y = my - (dy / dist) * target_radius
        else:
            arrow_end_x = mx
            arrow_end_y = my

        # 矢印本体 + 矢じり
        head_size = max(6, int(width * 0.012))
        draw_arrow(
            draw,
            start=arrow_start,
            end=(arrow_end_x, arrow_end_y),
            color=color,
            width=arrow_width,
            head_size=head_size,
        )

        # 対象点 (point マーカーのみ。range は Pass 1 で軸線描画済み)
        if marker.get("type") != "range":
            draw.ellipse(
                (int(mx) - target_radius, int(my) - target_radius,
                 int(mx) + target_radius, int(my) + target_radius),
                fill=color, outline=(255, 255, 255), width=1,
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

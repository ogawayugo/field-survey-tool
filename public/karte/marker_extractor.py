"""
マーカーtextboxから括弧内表記を抽出するモジュール
extraction_rules.json のルールに従って動作
"""
import re
import json
from pathlib import Path


def _extract_parens_content(text: str) -> str:
    """text 内の (...)/（...）の中身を返す。なければ空文字。"""
    m = re.search(r'[（(]([^（）()]+)[）)]', text)
    if m:
        return m.group(1).strip()
    return ""


def _strip_chip_name(text: str, item: str) -> str:
    """先頭のチップ名を削除（あれば）。"""
    # 例: "木槌打診異常 大 GL1.5m〜2.5m" → "大 GL1.5m〜2.5m"
    # 例: "キノコ（子実体）(ベッコウタケ)" → "（子実体）(ベッコウタケ)" のような場合もケア
    if not text or not item:
        return text
    # 完全一致＋区切り(空白/全角空白/句読点/改行) ※括弧は食べない
    pattern = r'^' + re.escape(item) + r'[\s\u3000、。：:]?'
    return re.sub(pattern, '', text, count=1).strip()


def extract_summary(text: str, item: str, rules: dict, part: str = None) -> str:
    """
    1つのマーカーから括弧内に書く文字列を抽出する。
    
    Args:
        text: マーカーの textbox 内容
        item: マーカーの item（診断項目名）
        rules: extraction_rules.json の rules 部分
        part: マーカーの part（建築限界越え用）
    
    Returns:
        括弧内に書く文字列（マッチしなければ空文字）
    """
    if not text:
        return ""

    rule = rules.get(item)
    if not rule:
        return ""

    # チップ名が先頭にあれば削る
    stripped = _strip_chip_name(text, item)

    style = rule.get('style')

    # ─── 部位依存（建築限界越え） ───
    if style == 'part_dependent':
        by_part = rule.get('by_part', {})
        sub_rule = by_part.get(part)
        if not sub_rule:
            return ""
        # サブルールの style に従って処理
        return _apply_style(stripped, sub_rule)

    return _apply_style(stripped, rule)


def _apply_style(text: str, rule: dict) -> str:
    """ルール1つを適用して抽出結果を返す。"""
    style = rule.get('style')

    if style == 'pattern_format':
        return _apply_pattern_format(text, rule)
    elif style == 'parens_or_fulltext':
        parens = _extract_parens_content(text)
        if parens:
            return parens
        return text.strip()
    elif style == 'first_match':
        return _apply_first_match(text, rule)
    elif style == 'single_regex':
        regex = rule.get('regex', '')
        m = re.search(regex, text)
        return m.group(0).strip() if m else ""
    return ""


def _apply_pattern_format(text: str, rule: dict) -> str:
    """fields の regex で抽出 → format に当てはめる。"""
    fields = rule.get('fields', [])
    fmt = rule.get('format', '')
    extracted = {}
    for f in fields:
        name = f['name']
        regex = f['regex']
        m = re.search(regex, text)
        extracted[name] = m.group(0).strip() if m else ""

    # フィールドが全部空ならフォールバック空欄
    if not any(extracted.values()):
        return ""

    # format に当てはめる。空欄フィールドは空白扱い。
    try:
        result = fmt.format(**extracted)
    except KeyError:
        return ""
    # 連続空白整理
    result = re.sub(r'\s+', ' ', result).strip()
    # 空のセパレータ「{}」が残らないように
    return result


def _apply_first_match(text: str, rule: dict) -> str:
    """
    patterns を試して採用する。
    mode='position'（既定）: textの中で最も早い位置でマッチしたものを採用（先勝ち）
    mode='priority': patterns の並び順で最初にマッチしたものを採用（優先順）
    """
    patterns = rule.get('patterns', [])
    mode = rule.get('mode', 'position')

    if mode == 'priority':
        for p in patterns:
            m = re.search(p['regex'], text)
            if m:
                return m.group(0).strip()
        return ""

    # mode == 'position'
    best_pos = None
    best_match = None
    for p in patterns:
        m = re.search(p['regex'], text)
        if m:
            if best_pos is None or m.start() < best_pos:
                best_pos = m.start()
                best_match = m.group(0).strip()
    return best_match or ""


def aggregate_summaries(summaries: list, item: str, rules: dict) -> str:
    """
    複数マーカーの summary を集約する（Pattern II）。
    
    Args:
        summaries: マーカーごとの抽出結果リスト（空文字含む）
        item: 項目名
        rules: rules dict
    
    Returns:
        集約後の文字列
    """
    items = [s for s in summaries if s]
    if not items:
        return ""
    first = items[0]
    n = len(items)
    if n == 1:
        return first

    rule = rules.get(item, {})
    agg = rule.get('aggregation', 'default')

    if agg == 'count_x':
        return f"{first} ×{n}"
    else:  # default
        return f"{first} 他{n - 1}箇所"


def load_rules(path: Path) -> dict:
    """extraction_rules.json をロード。"""
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('rules', {})


# ─── 単体テスト ───
if __name__ == '__main__':
    rules_path = Path(__file__).parent / 'templates' / 'extraction_rules.json'
    rules = load_rules(rules_path)

    test_cases = [
        # (item, text, part, 期待出力)
        ("キノコ（子実体）",  "子実体(ベッコウタケ)",            None,   "ベッコウタケ"),
        ("キノコ（子実体）",  "キノコ（子実体）（カワラタケ）",   None,   "カワラタケ"),
        ("木槌打診異常",      "大 GL1.5m〜2.5m 反響強く深い",    None,   "大 GL1.5m〜2.5m"),
        ("木槌打診異常",      "木槌打診異常 小 GL+0.5m〜+1.5m",  None,   "小 GL+0.5m〜+1.5m"),
        ("分岐部・付根の異常","分岐部(腐朽 亀裂)",                None,   "腐朽 亀裂"),
        ("胴枯れなどの病害",  "(さび病)",                         None,   "さび病"),
        ("虫穴・虫フン・ヤニ","(カミキリムシ)",                   None,   "カミキリムシ"),
        ("根元の揺らぎ",      "大 北側に動く",                    None,   "大"),
        ("鋼棒貫入異常",      "15cm 一部芯達",                    None,   "芯達"),
        ("鋼棒貫入異常",      "15cm 浅い",                        None,   "15cm"),
        ("巻き根",            "切除可 注意点あり",                None,   "切除可"),
        ("巻き根",            "切除不可",                         None,   "切除不可"),
        ("ルートカラー見えない", "深植え5cm 盛土3cm",             None,   "深植え5cm"),
        ("ルートカラー見えない", "盛土10cm",                       None,   "盛土10cm"),
        ("ルートカラー見えない", "盛土10cm 深植え5cm",             None,   "盛土10cm"),
        ("露出根被害",        "15cm×2cm 切断あり",                None,   "15cm×2cm"),
        ("不自然な傾斜",      "北へ大 倒れそう",                  None,   "北へ大"),
        ("不自然な傾斜",      "南東へ中",                         None,   "南東へ中"),
        ("枯枝",              "φ5cm L0.8m 古い",                  None,   "φ5cm L0.8m"),
        ("スタブカット",      "切除可",                           None,   "切除可"),
        ("建築限界越え",      "25cm GL2.5m",                      "幹",   "25cm GL2.5m"),
        ("建築限界越え",      "L1.2m GL3m",                       "大枝", "L1.2m GL3m"),
    ]

    print(f"{'項目':<25} {'入力':<35} → {'出力':<25} ({'判定'})")
    print("─" * 100)
    ok = 0
    ng = 0
    for item, text, part, expected in test_cases:
        actual = extract_summary(text, item, rules, part)
        mark = "✓" if actual == expected else "✗"
        if actual == expected:
            ok += 1
        else:
            ng += 1
        print(f"{item:<22} {text:<35} → {actual:<22} {mark}{(' (期待: '+expected+')') if actual != expected else ''}")

    print("─" * 100)
    print(f"OK: {ok} / NG: {ng}")

    # 集約テスト
    print("\n=== 集約テスト ===")
    print("枯枝3つ:",       aggregate_summaries(["φ5cm L0.8m", "φ3cm L0.5m", "φ8cm L1m"], "枯枝", rules))
    print("スタブカット2つ:", aggregate_summaries(["切除可", "切除可"], "スタブカット", rules))
    print("木槌打診3つ:",   aggregate_summaries(["大 GL1.5m〜2m", "中 GL3m〜4m", "小 GL5m〜5.5m"], "木槌打診異常", rules))
    print("不自然な傾斜2つ:", aggregate_summaries(["北へ大", "東へ小"], "不自然な傾斜", rules))
    print("単一マーカー:",   aggregate_summaries(["大 GL1.5m〜2m"], "木槌打診異常", rules))

# fix v3.3.2：generate_gui.py に v3.2/v3.3 の関数呼び出しを追加

## 経緯と原因

v3.2（総合判定）と v3.3（三択 Excel 反映）の機能を `generate.py` に実装したが、**`generate_gui.py` への反映が漏れていた**。

ちっこいおっさんは GUI 経由（`カルテ生成.bat` → `generate_gui.py`）でカルテを生成しているため、`generate.py` に書いた処理が呼ばれていない。

## 修正対象

ファイル：`karte-generator/generate_gui.py`

修正箇所は2か所：
1. `from generate import (...)` の import リスト
2. `generate_karte_from_multiple_jsons` 関数内の処理ループ

---

## 修正1：import 文に2関数を追加

`karte-generator/generate_gui.py` の **39〜49行目あたり**にある以下のような import 文：

```python
    from generate import (
        ...
        write_basic_info,
        write_cell_checkboxes,
        write_part_judgments,
        write_diagnosis_checkboxes,
        write_shoken,
    )
```

これに **2行追加**：

```python
    from generate import (
        ...
        write_basic_info,
        write_cell_checkboxes,
        write_part_judgments,
        write_diagnosis_checkboxes,
        write_three_choice_circumference,   # ← 追加（v3.3）
        write_shoken,
        write_overall_judgment,             # ← 追加（v3.2）
    )
```

---

## 修正2：処理ループに2関数呼び出しを追加

`generate_karte_from_multiple_jsons` 関数内、**156〜160行目あたり**にある以下の処理：

```python
            write_basic_info(new_sheet, tree, survey_meta, config)
            write_cell_checkboxes(new_sheet, tree, config)
            write_part_judgments(new_sheet, tree, config)
            write_diagnosis_checkboxes(new_sheet, tree, config)
            write_shoken(new_sheet, tree, config)
```

これに **2行追加**して、以下の順序にする：

```python
            write_basic_info(new_sheet, tree, survey_meta, config)
            write_cell_checkboxes(new_sheet, tree, config)
            write_part_judgments(new_sheet, tree, config)
            write_diagnosis_checkboxes(new_sheet, tree, config)
            write_three_choice_circumference(new_sheet, tree, config)   # ← 追加（v3.3）
            write_shoken(new_sheet, tree, config)
            write_overall_judgment(new_sheet, tree, config)             # ← 追加（v3.2）
```

**順序が重要**：
- `write_three_choice_circumference` は `write_diagnosis_checkboxes` の **後**（後者が広範囲のセルを触るかもしれないため）
- `write_overall_judgment` は `write_shoken` の **後**（メモを使った所見書き込みが終わってから判定処理）

これは generate.py のメインループの順序と一致させる。

---

## 動作確認

修正後、もう一度 GUI からカルテ生成して以下を確認：

### v3.3（三択）

PWAで一部の項目だけ「1/3未満」を選んだ樹を生成 →

- [ ] 選択した項目の該当セル（M13/M14/M15/X.../AI...）に「**■1/3未満**」
- [ ] 選択していない項目は「**■なし** □1/3未満 □1/3以上」（デフォルト）

### v3.2（総合判定）

PWAで総合判定 B2 を選んで判定理由を生成した樹を生成 →

- [ ] G60 セルで **■Ｂ２** が選択されている
- [ ] F62 セルに判定理由のテキストが入っている

---

## 完了報告

修正後、生成されたカルテ Excel をアップロードしてください。中身を確認します。

# v3.3：三択UI（周囲長比率）のラベル変更とExcel反映

## 概要

v2.6 で実装された3択UI（樹皮枯死・開口空洞×2 × 部位3 = 9マス）の問題を解決：

1. **UI表示の不一致**：PWAは「なし／あり／重度」、Excelは「なし／1/3未満／1/3以上」で表記がズレている
2. **Excel反映が動いていない**：PWAで選択しても、カルテExcelの「周囲長比率」欄に反映されない（デフォルトで「なし」に■のまま）

修正対象：
- **PWA**：UIラベルのみ変更（内部キーは触らない）
- **PC**：カルテExcel生成時の反映処理を追加

---

## 仕様

### ラベル変更（PWA）

| 内部キー（変更なし） | 旧ラベル | 新ラベル |
|---------------------|----------|----------|
| `none`              | なし     | なし     |
| `present`           | あり     | **1/3未満** |
| `severe`            | 重度     | **1/3以上** |

データキーは変更しない → **既存データのマイグレーション不要**。

### Excel反映（PC）

カルテExcelの周囲長比率欄に対応する選択肢に「■」を、それ以外には「□」を入れる：

- `threeChoiceJudgments.root.barkDeath = 'present'` → 「樹皮枯死・欠損・腐朽」の根元セル「1/3未満」に■、他に□

---

## ステップ1：PWA側 - UIラベル変更

### 1-1. ThreeChoicePanel.jsx を編集

`src/components/ThreeChoicePanel.jsx` を view し、選択肢ラベルが定義されている箇所を見つける。

**おそらく以下のような定義があるはず**：

```jsx
const THREE_CHOICE_OPTIONS = [
  { value: 'none',    label: 'なし' },
  { value: 'present', label: 'あり' },
  { value: 'severe',  label: '重度' },
];
```

これを以下に変更：

```jsx
const THREE_CHOICE_OPTIONS = [
  { value: 'none',    label: 'なし' },
  { value: 'present', label: '1/3未満' },
  { value: 'severe',  label: '1/3以上' },
];
```

**重要**：`value` は変更しない（内部データキーは温存）。`label` のみ変更。

### 1-2. 念のため他のファイルも確認

PowerShell で：

```
findstr /s /n "あり" src\components\*.jsx
findstr /s /n "重度" src\components\*.jsx
```

別の場所に「あり」「重度」のハードコードがあれば、それもラベルだけ変更する。

---

## ステップ2：PC側 - テンプレート分析

### 2-1. テンプレートExcelで周囲長比率セルを特定

`karte-generator/templates/shibuya.xlsx` を開いて、「周囲長比率」の3項目×3部位のセル位置を特定する。

一時スクリプトを作って実行：

```python
# karte-generator/find_three_choice_cells.py（一時、後で削除可）
from openpyxl import load_workbook

wb = load_workbook("templates/shibuya.xlsx")
ws = wb.active

# 検索対象のキーワード
targets = [
    "樹皮枯死",
    "周囲長比率",
    "芯に達していない",
    "芯に達した",
    "なし",
    "1/3未満",
    "1/3以上",
]

# 各キーワードがあるセルを表示
for row in ws.iter_rows():
    for cell in row:
        if cell.value:
            cv = str(cell.value)
            for t in targets:
                if t in cv:
                    print(f"'{t}' found at {cell.coordinate}: {repr(cv)[:80]}")

# 結合セル一覧
print("\n=== Merged Cells ===")
for merged in ws.merged_cells.ranges:
    print(f"  {merged}")
```

実行：

```
python find_three_choice_cells.py
```

出力から判断する。スクショから推測される構造：

```
                       根元                  幹                  骨格となる大枝
樹皮枯死・欠損・腐朽   □なし □1/3未満 □1/3以上 | □なし □1/3未満 □1/3以上 | □なし □1/3未満 □1/3以上
（周囲長比率）        
芯に達していない開口空洞  ...
芯に達した開口空洞      ...
```

**3項目 × 3部位 × 3選択肢 = 27個のセル**または、**3項目 × 3部位 = 9セル（各セルに「□なし □1/3未満 □1/3以上」がまとめて入る）**のどちらか。

### 2-2. 既存実装の調査

generate.py で既に「現状デフォルトでなしに■がつく」処理があるはず。それを探す：

```
findstr /n "周囲長比率" karte-generator\generate.py
findstr /n "barkDeath" karte-generator\generate.py
findstr /n "1/3" karte-generator\generate.py
findstr /n "■" karte-generator\generate.py
```

または、generate.py で「樹皮枯死」を含む行を探す：

```
findstr /n "樹皮枯死" karte-generator\generate.py
```

**ヒットした処理が、現状「デフォルトなし」を入れている箇所**。これを修正対象にする。

---

## ステップ3：PC側 - shibuya.json 更新

ステップ2で特定したセル構造に応じて2パターンに分岐：

### パターンA：1セルに「□なし □1/3未満 □1/3以上」がまとめて入っている場合

shibuya.json に以下のマッピングを追加：

```json
{
  "...既存...": "...",
  
  "three_choice_circumference": {
    "barkDeath": {
      "root":   "X1",
      "trunk":  "Y1",
      "branch": "Z1"
    },
    "cavityShallow": {
      "root":   "X2",
      "trunk":  "Y2",
      "branch": "Z2"
    },
    "cavityDeep": {
      "root":   "X3",
      "trunk":  "Y3",
      "branch": "Z3"
    }
  }
}
```

XYZの数字は実セル位置に置き換える。各セルには「□なし □1/3未満 □1/3以上」というテキストが入っている前提。

### パターンB：選択肢ごとに別セルになっている場合

```json
{
  "three_choice_circumference": {
    "barkDeath": {
      "root":   { "none": "X1", "present": "Y1", "severe": "Z1" },
      "trunk":  { "none": "X2", "present": "Y2", "severe": "Z2" },
      "branch": { "none": "X3", "present": "Y3", "severe": "Z3" }
    },
    "cavityShallow": { ... },
    "cavityDeep": { ... }
  }
}
```

実際の構造に合わせる。

---

## ステップ4：PC側 - generate.py の処理追加

### 4-1. 既存ロジックの確認

「現状デフォルトで『なし』に■がつく」処理がすでに generate.py にある（ステップ2-2で確認）。
それを **「データに応じて該当の選択肢に■、他は□」** に書き換える。

### 4-2. パターンA（1セル方式）の実装例

```python
# 周囲長比率（v3.3）
three_choice_config = template_config.get("three_choice_circumference", {})
three_choice_data = tree.get("threeChoiceJudgments", {})

# キー対応マップ
KEY_TO_LABEL = {
    'none':    'なし',
    'present': '1/3未満',
    'severe':  '1/3以上',
}

for item_key in ['barkDeath', 'cavityShallow', 'cavityDeep']:
    if item_key not in three_choice_config:
        continue
    
    for part_key in ['root', 'trunk', 'branch']:
        cell_addr = three_choice_config[item_key].get(part_key)
        if not cell_addr:
            continue
        
        # データ取得（未入力なら 'none' をデフォルト）
        selected = three_choice_data.get(part_key, {}).get(item_key, 'none')
        
        # セルテキストを生成：選択された値だけ■、他は□
        parts = []
        for k in ['none', 'present', 'severe']:
            mark = '■' if k == selected else '□'
            parts.append(f"{mark}{KEY_TO_LABEL[k]}")
        
        # スペース区切り or 改行区切りはテンプレートに合わせる
        ws[cell_addr] = ' '.join(parts)
```

### 4-3. パターンB（選択肢ごとに別セル）の実装例

```python
for item_key in ['barkDeath', 'cavityShallow', 'cavityDeep']:
    if item_key not in three_choice_config:
        continue
    
    for part_key in ['root', 'trunk', 'branch']:
        part_cells = three_choice_config[item_key].get(part_key, {})
        if not part_cells:
            continue
        
        selected = three_choice_data.get(part_key, {}).get(item_key, 'none')
        
        for choice_key in ['none', 'present', 'severe']:
            cell_addr = part_cells.get(choice_key)
            if cell_addr:
                ws[cell_addr] = '■' if choice_key == selected else '□'
```

### 4-4. 既存の「デフォルトなし」処理を削除

既存にある **「強制的に『なし』に■を入れる」処理を削除** する。新しい動的処理に置き換える。

---

## ステップ5：動作確認

### PWA側

- [ ] 三択UIのラベルが「なし／1/3未満／1/3以上」になっている
- [ ] 既存樹のデータを開いてもエラーなし（内部キー変わらないので大丈夫なはず）
- [ ] 「あり」相当のものを選ぶと「1/3未満」がハイライトされる
- [ ] JSONエクスポートでは内部キー（present/severe）のままで出力される

### PC側

#### テストケース1：何も選択していない樹

期待値：すべての周囲長比率セルで「なし」に■、他は□

#### テストケース2：root.barkDeath = 'present' のみ

期待値：
- 樹皮枯死・周囲長比率の**根元**セルが「□なし ■1/3未満 □1/3以上」
- 他のセルは「■なし □1/3未満 □1/3以上」（デフォルト）

#### テストケース3：複数項目入力

例：
- root.barkDeath = 'severe'
- trunk.cavityShallow = 'present'
- branch.cavityDeep = 'present'

期待値：それぞれ正しい選択肢に■

各テストでカルテExcelを生成し、該当セルが意図通りになっているか確認。

---

## ステップ6：コミット

```
git add .
git commit -m "v3.3: Sync three-choice UI labels with Excel and reflect in karte"
git push
```

---

## トラブルシューティング想定

### Q1：PWAのUI変更が反映されない

→ 開発サーバー再起動（前回と同じ手順）：
```
Ctrl+C
Remove-Item -Recurse -Force node_modules\.vite
npm run dev
```

### Q2：テンプレートのセル特定がうまくいかない

→ `find_three_choice_cells.py` の出力をもとに、実際の値が入るセルを目視確認。openpyxl を使って実際にテストセルに「テスト」と書き込んでみて、Excelで開いて場所を確認するのも有効。

### Q3：generate.py の既存ロジックが見つからない

→ 「□なし」「■なし」「barkDeath」「樹皮枯死」「three_choice」「circumference」など複数のキーワードでgrep。それでも見つからない場合、generate.py 全体を view する。

### Q4：チェックの記号が ■ じゃなくて ✓ や ☑ のテンプレート

→ `find_three_choice_cells.py` の出力で実際のセル値を確認し、テンプレートで使われている記号に合わせる。

### Q5：内部データキーが空（未入力）の場合の挙動

→ `three_choice_data.get(part_key, {}).get(item_key, 'none')` でデフォルト 'none' になるよう実装。これで未入力時は「なし」に■。

---

## 完了報告フォーマット

実装後、以下を報告：

1. PWA側：UIラベル変更後のスクショ
2. PC側：テンプレートのセル位置特定結果（出力テキスト）
3. shibuya.json の該当部分
4. テストケース2または3の生成カルテのスクショ（周囲長比率部分が見える形）
5. 想定外の挙動・実装で迷った箇所があれば

---

## 注意事項

### やってはいけないこと

- 内部データキー（`'none'/'present'/'severe'`）を変更しない
- 既存データのマイグレーションをしない（内部キー変えないので不要）
- 三択UI以外の場所の「なし／あり／重度」を確認なしに変えない

### やっていいこと

- ラベル文字列の半角・全角の調整（テンプレートに合わせる）
- 「1/3」を「⅓」（fraction symbol）に変えるかは、テンプレートの表記に合わせて
- find_three_choice_cells.py は確認後に削除

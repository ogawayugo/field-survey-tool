# 修正指示書：処置内容・次回診断・位置座標セクションの追加

## 概要

カルテに既に存在する以下3セクションについて、PWA側で入力できる機能を追加し、Excel生成にも反映させる。

ブランチ：`feature/photo-first-flow`

1. **処置内容セクション**（必要性、緊急性、要観察、剪定、補足記入項目、摘要）
2. **次回診断セクション**（フォローアップ、要機器診断、外観診断、再診断時期）
3. **位置座標セクション**（緯度、経度、GPSハイブリッド方式）

---

## 1. 処置内容セクション

### Excelテンプレート側のセル位置

`karte-generator/templates/shibuya.xlsx` で確認済み：

| 項目 | セル位置 | 種類 |
|---|---|---|
| 必要性 | `BD3` | 「□なし □あり」テキスト |
| 緊急性 | `BY3` | 「□なし □あり」テキスト |
| 要観察 | `AX4` | 「□要観察（長期周期） □要観察（短期周期）」テキスト |
| 剪定とその他チェック | `AX5` | 「□剪定（□枯枝 □腐朽枝等 □支障枝 □風圧軽減 □スタブカット □巻き根 ）」テキスト（全部このセルに入っている） |
| 樹体保護 | `AX6` | チェックボックス＋補足記入（カッコ内） |
| 植栽基盤の改善 | `BR6` | 同上 |
| 根上がり | `AX7` | 同上 |
| 病虫害防除 | `BR7` | 同上 |
| 更新 | `AX8` | 同上 |
| その他 | `BR8` | 同上 |
| 摘要 | `AX9` 以降 | フリーテキスト |

### PWA側のUI仕様

#### 配置

判定欄と写真欄の間に、**折りたたみセクション**として追加。
ヘッダー：「▶ 処置内容 (0件選択)」← デフォルト閉じている

```
┌─────────────────────────────────┐
│ ▶ 処置内容 (3件選択)                      │ ← タップで開閉
└─────────────────────────────────┘

開いた状態：

┌─────────────────────────────────┐
│ ▼ 処置内容                              │
├─────────────────────────────────┤
│ ◉ 必要性                                  │
│   [○なし] [●あり]   ← 2択ボタン         │
│                                           │
│ ◉ 緊急性                                  │
│   [●なし] [○あり]                         │
│                                           │
│ ◉ 要観察                                  │
│   [○長期周期] [○短期周期] [●なし]        │
│                                           │
│ ◉ 剪定（複数選択可）                       │
│   [✓枯枝] [ ]腐朽枝等 [✓支障枝]           │
│   [ ]風圧軽減 [ ]スタブカット [ ]巻き根   │
│                                           │
│ ◉ 個別処置（チェックすると補足欄が出現）   │
│   [✓] 樹体保護 [幹周りに保護テープ巻き...] │ ← チェック時のみ補足欄出現
│   [ ] 植栽基盤の改善                       │
│   [ ] 根上がり                             │
│   [ ] 病虫害防除                           │
│   [ ] 更新                                 │
│   [ ] その他                               │
│                                           │
│ ◉ 摘要（任意）                             │
│   [textarea]                              │
└─────────────────────────────────┘
```

#### データ構造

```json
{
  ...
  "treatment": {
    "necessity": "あり",          // "なし" or "あり"
    "urgency": "なし",            // "なし" or "あり"
    "observation": "長期周期",     // "なし" or "長期周期" or "短期周期"
    "pruning": ["枯枝", "支障枝"], // 複数選択。空配列 = 剪定なし
    "pressureReduction": false,   // 風圧軽減
    "stubCut": false,             // スタブカット
    "rootCircling": false,        // 巻き根
    "individual": {                // 個別処置（チェック＋補足）
      "treeProtection": { "checked": true, "note": "幹周りに保護テープ" },
      "plantingBaseImprovement": { "checked": false, "note": "" },
      "rootUplift": { "checked": false, "note": "" },
      "pestControl": { "checked": false, "note": "" },
      "renewal": { "checked": false, "note": "" },
      "other": { "checked": false, "note": "" }
    },
    "summary": "現状は経過観察、来年度に再点検"  // 摘要
  }
}
```

### Excel書き込みロジック（PC側）

`generate.py` に処置内容書き込み関数を新規追加：

```python
def write_treatment(ws, tree, config):
    treatment = tree.get('treatment')
    if not treatment:
        return  # 何も書かない
    
    # 必要性（BD3：□なし □あり）
    necessity = treatment.get('necessity', '')
    if necessity in ('なし', 'あり'):
        ws['BD3'] = replace_checkbox(ws['BD3'].value, necessity)
    
    # 緊急性（BY3）
    urgency = treatment.get('urgency', '')
    if urgency in ('なし', 'あり'):
        ws['BY3'] = replace_checkbox(ws['BY3'].value, urgency)
    
    # 要観察（AX4）
    obs = treatment.get('observation', '')
    if obs in ('長期周期', '短期周期'):
        target = f'要観察（{obs}）'
        ws['AX4'] = replace_checkbox(ws['AX4'].value, target)
    
    # 剪定＋その他チェック（AX5は1つのテキストセル）
    ax5_options = []
    if treatment.get('pruning'):
        ax5_options.append('剪定')
        ax5_options.extend(treatment['pruning'])  # 枯枝、腐朽枝等、支障枝
    if treatment.get('pressureReduction'):
        ax5_options.append('風圧軽減')
    if treatment.get('stubCut'):
        ax5_options.append('スタブカット')
    if treatment.get('rootCircling'):
        ax5_options.append('巻き根')
    
    # AX5の全選択肢に対して、選ばれたもの→■、それ以外→□
    ax5_text = ws['AX5'].value
    for opt in ['剪定', '枯枝', '腐朽枝等', '支障枝', '風圧軽減', 'スタブカット', '巻き根']:
        if opt in ax5_options:
            ax5_text = ax5_text.replace(f'□{opt}', f'■{opt}')
    ws['AX5'] = ax5_text
    
    # 個別処置（AX6, BR6, AX7, BR7, AX8, BR8）
    individual_cells = {
        'treeProtection':           ('AX6', '樹体保護'),
        'plantingBaseImprovement':  ('BR6', '植栽基盤の改善'),
        'rootUplift':               ('AX7', '根上がり'),
        'pestControl':              ('BR7', '病虫害防除'),
        'renewal':                  ('AX8', '更新'),
        'other':                    ('BR8', 'その他'),
    }
    
    for key, (cell, label) in individual_cells.items():
        item = treatment.get('individual', {}).get(key, {})
        if not item.get('checked'):
            continue
        # チェック反映：「□樹体保護（」→「■樹体保護（補足テキスト」
        original = ws[cell].value or f'□{label}（'
        note = item.get('note', '')
        new_text = original.replace(f'□{label}（', f'■{label}（{note}')
        ws[cell] = new_text
    
    # 摘要（AX9）
    summary = treatment.get('summary', '')
    if summary:
        # 「摘要」のラベルセルではなく、結合セル内のデータエリアに書く
        # ws['AX9'].value はラベルなので、データ書き込みは別セル
        # ※ 実際のセル位置は要確認、暫定でAY9または下の行
        # ここはテンプレートのデータ書き込み位置を実機で確認しながら調整
        pass  # TODO: 摘要セルの位置を実機確認
```

**注意**：摘要欄の具体的なデータ書き込みセル位置は、テンプレートに「摘要」ラベル（AX9）はあるが、データを書く先のセル位置はマージセルの設計を見ないと正確に分からない。**実装後に実機で書き込まれた位置を確認し、必要なら調整**してください。

### generate_gui.py の更新

`write_treatment` 関数を呼び出すよう追加（前回の v3.2/v3.3 と同じパターン）：

```python
# import文に追加
from generate import (
    ...,
    write_treatment,  # 追加
    ...
)

# 処理ループに追加
write_treatment(new_sheet, tree, config)
```

---

## 2. 次回診断セクション

### Excelテンプレート側のセル位置

| 項目 | セル位置 |
|---|---|
| 次回診断 | `BD62` 「□フォローアップ診断（」 |
| 要機器診断＋部位 | `BL62` 「□要機器診断 測定部位：」 |
| 外観診断 | （BD62〜CA62 範囲内のどこかに「□外観診断」） |
| 次回再診断時期 | `BD63` 「□1年後 □2年後 3年後（年度）」 |

### PWA側のUI仕様

```
┌─────────────────────────────────┐
│ ▼ 次回診断                              │
├─────────────────────────────────┤
│ ◉ 次回診断（複数選択可）                  │
│   [✓] フォローアップ診断                  │
│   [ ] 要機器診断  測定部位:[___________]  │ ← チェック時に部位入力欄
│   [ ] 外観診断                            │
│                                           │
│ ◉ 次回再診断時期                          │
│   [●1年後] [○2年後] [○3年後]              │
│   3年後の場合: 年度[2029]                  │
└─────────────────────────────────┘
```

### データ構造

```json
{
  "nextDiagnosis": {
    "followUp": true,
    "instrumental": { "checked": false, "site": "" },
    "appearance": false
  },
  "nextDiagnosisTiming": {
    "years": 1,           // 1, 2, 3
    "fiscalYear": null    // 3年後の場合のみ年度入力
  }
}
```

---

## 3. 位置座標セクション（GPSハイブリッド）

### Excelテンプレート側のセル位置

| 項目 | セル位置 |
|---|---|
| 緯度 | `BG64` 「緯度」ラベル → データは結合セル内 |
| 経度 | `BX64` 「経度」ラベル → データは結合セル内 |

### PWA側のUI仕様

```
┌─────────────────────────────────┐
│ ▼ 位置座標（WGS84）                      │
├─────────────────────────────────┤
│ 緯度: [35.6580]  経度: [139.7016]         │
│                                           │
│ [📍 GPSで現在地を取得]   ← ボタン         │
│ ※取得後も手で修正可能                    │
└─────────────────────────────────┘
```

### GPS取得ロジック

```javascript
async function fetchCurrentLocation() {
  if (!navigator.geolocation) {
    alert('この端末は位置情報に対応していません');
    return;
  }
  
  // 取得中の表示
  setIsLoading(true);
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(7);
      const lon = position.coords.longitude.toFixed(7);
      setLatitude(lat);
      setLongitude(lon);
      setIsLoading(false);
    },
    (error) => {
      console.error(error);
      let msg = '位置情報の取得に失敗しました';
      if (error.code === 1) msg = '位置情報のアクセスが拒否されています。設定で許可してください';
      if (error.code === 2) msg = 'GPS信号が取得できません（屋内/地下など）';
      if (error.code === 3) msg = 'タイムアウトしました';
      alert(msg);
      setIsLoading(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}
```

### データ構造

```json
{
  "location": {
    "latitude": "35.6580230",
    "longitude": "139.7016500"
  }
}
```

---

## 4. 全体的なUI構成

3セクションすべて「折りたたみ式」で、判定欄と写真欄の間に並べる：

```
┌──────────────────────────┐
│ 樹編集画面の構成（上から順）          │
├──────────────────────────┤
│ ・基本情報（既存）                    │
│ ・全景写真＋マーカー（既存）          │
│ ・クローズアップ写真（既存）          │
│ ・予備写真（既存）                    │
│ ・樹勢/活力判定（既存）               │
│ ・部位判定/外観判定/総合判定（既存）  │
│ ・所見欄（既存、復活したもの）        │
│ ・▶ 処置内容（新規、折りたたみ）      │
│ ・▶ 次回診断（新規、折りたたみ）      │
│ ・▶ 位置座標（新規、折りたたみ）      │
│ ・特記事項（既存）                    │
└──────────────────────────┘
```

各セクションのヘッダー：
- タップで開閉
- 入力済みの件数を表示（「▶ 処置内容 (3件選択)」など）
- デフォルトは閉じている

---

## 5. shibuya.json の更新

`karte-generator/templates/shibuya.json` に新マッピングを追加：

```json
{
  ...
  
  "_comment_treatment": "処置内容セクション",
  "treatment": {
    "necessity_cell": "BD3",
    "urgency_cell": "BY3",
    "observation_cell": "AX4",
    "pruning_combined_cell": "AX5",
    "individual": {
      "treeProtection":          { "cell": "AX6", "label": "樹体保護" },
      "plantingBaseImprovement": { "cell": "BR6", "label": "植栽基盤の改善" },
      "rootUplift":              { "cell": "AX7", "label": "根上がり" },
      "pestControl":             { "cell": "BR7", "label": "病虫害防除" },
      "renewal":                 { "cell": "AX8", "label": "更新" },
      "other":                   { "cell": "BR8", "label": "その他" }
    },
    "summary_cell": "AX9"
  },
  
  "_comment_next_diagnosis": "次回診断セクション",
  "next_diagnosis": {
    "main_cell": "BD62",
    "instrumental_site_cell": "BL62",
    "timing_cell": "BD63"
  },
  
  "_comment_location": "位置座標（WGS84）",
  "location": {
    "latitude_cell": "BG64",
    "longitude_cell": "BX64"
  }
}
```

---

## 6. マイグレーション

既存データに新フィールドを追加する処理：

```javascript
function migrateTreatmentFields(tree) {
  return {
    ...tree,
    treatment: tree.treatment ?? null,
    nextDiagnosis: tree.nextDiagnosis ?? null,
    nextDiagnosisTiming: tree.nextDiagnosisTiming ?? null,
    location: tree.location ?? null,
  };
}
```

null の場合、Excel書き込み時にはスキップ（書き換えない）。

---

## 動作確認チェックリスト

### 処置内容

- [ ] 折りたたみ開閉が動作
- [ ] 必要性「あり」を選ぶ → BD3 が「■あり」になる
- [ ] 緊急性「なし」を選ぶ → BY3 が「■なし」になる
- [ ] 要観察「長期周期」を選ぶ → AX4 が「■要観察（長期周期）」になる
- [ ] 剪定で枯枝・支障枝・風圧軽減を選ぶ → AX5 の該当 □ がそれぞれ ■ に
- [ ] 樹体保護 ON + 補足「幹周りテープ」→ AX6 が「■樹体保護（幹周りテープ）」になる
- [ ] チェック OFF の項目は □ のまま

### 次回診断

- [ ] フォローアップ ON → BD62 が「■フォローアップ診断（」になる
- [ ] 要機器診断 ON + 部位「根元」→ BL62 が「■要機器診断 測定部位：根元」になる
- [ ] 1年後選択 → BD63 が「■1年後 □2年後 □3年後」になる
- [ ] 3年後 + 年度2029 → BD63 が「□1年後 □2年後 ■3年後（2029年度）」になる

### 位置座標

- [ ] GPSボタン押す → 緯度・経度欄が自動入力される
- [ ] 数値は編集可能（手動修正できる）
- [ ] GPSアクセス拒否時にエラーメッセージが出る
- [ ] BG64 と BX64 に数値が書き込まれる

### 既存データ

- [ ] 旧データを開いてもエラーなし
- [ ] 旧データの処置内容欄は何も書き込まれない（既存セルがそのまま残る）

---

## やってはいけないこと

- 既存のマーカー・写真・判定・所見の機能を壊さない
- generate.py の既存関数を変更しない（追加のみ）
- main ブランチに直接 push しない

## やっていいこと

- 摘要欄のセル位置の調整（実機確認後）
- UI の細かいスタイル調整
- GPS取得時のローディング表示の追加

---

## 完了報告

実装後、以下を送ってください：

1. 処置内容セクションを開いた状態のスクショ
2. GPS取得ボタンを押した後の緯度・経度欄のスクショ
3. 実際に入力したデータでカルテExcelを生成し、各セルに正しく反映されているかのスクショ（特に BD3、AX4、AX5、AX6、BD62、BG64 など）
4. 想定外の挙動・実装で迷った箇所があれば

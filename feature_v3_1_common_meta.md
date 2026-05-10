# v3.1：調査基本情報の共通化（路線名・樹木医名・診断日）

## 概要

現状、調査全体に共通する以下の項目が樹ごとに入力できない or 樹を切り替えると消える：

- **路線名**
- **樹木医名**
- **診断日**

これらは1日の調査で全樹共通の値なので、**「設定モーダルで一度入力すれば全樹のカルテに反映される」仕組み**を実装する。

修正対象は **PWA側 + PC側の両方**。

---

## ユーザー体験フロー

1. ヘッダーの ⚙ アイコンをタップ → 設定モーダルが開く
2. モーダルで路線名・樹木医名・診断日を入力 → 「保存」
3. 値はIndexedDBの `meta` に保存される
4. JSONエクスポート時に `meta.routeName` 等として出力される
5. PC側のカルテ生成時、各樹のカルテの該当セルに自動反映される

---

## ステップ1：PWA側のデータ構造拡張

### 1-1. meta オブジェクトに3フィールド追加

`src/App.jsx` 内の `emptyMeta` 定義に以下を追加：

```javascript
const emptyMeta = {
  // ... 既存フィールド ...
  
  // ▼ v3.1 新規追加 ▼
  routeName: '',
  arboristName: '',
  surveyDate: '',  // ISO 8601 形式 'YYYY-MM-DD'
};
```

### 1-2. マイグレーション

`loadOrMigrateMeta` 関数で、既存の保存データに上記フィールドがない場合に空文字で初期化：

```javascript
function loadOrMigrateMeta(stored) {
  return {
    ...emptyMeta,         // デフォルト値
    ...stored,            // 保存値で上書き
    // 新規フィールドは ?? でフォールバック
    routeName: stored?.routeName ?? '',
    arboristName: stored?.arboristName ?? '',
    surveyDate: stored?.surveyDate ?? '',
  };
}
```

---

## ステップ2：設定モーダルコンポーネント

### 2-1. 新規ファイル作成

`src/components/SettingsModal.jsx` を新規作成：

```jsx
import { useState, useEffect } from 'react';

/**
 * 調査基本情報を編集するモーダル
 */
export function SettingsModal({ isOpen, meta, onSave, onClose }) {
  const [routeName, setRouteName] = useState('');
  const [arboristName, setArboristName] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  
  // モーダルが開くたびに最新の meta を反映
  useEffect(() => {
    if (isOpen) {
      setRouteName(meta?.routeName || '');
      setArboristName(meta?.arboristName || '');
      setSurveyDate(meta?.surveyDate || '');
    }
  }, [isOpen, meta]);
  
  if (!isOpen) return null;
  
  const handleSave = () => {
    onSave({
      routeName: routeName.trim(),
      arboristName: arboristName.trim(),
      surveyDate: surveyDate,
    });
    onClose();
  };
  
  // 「今日の日付」を入れるショートカット
  const handleSetToday = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setSurveyDate(`${yyyy}-${mm}-${dd}`);
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-md p-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-lg mb-4">調査基本情報</h2>
        <p className="text-xs text-gray-500 mb-4">
          ここで入力した内容は、すべての樹のカルテに自動反映されます。
        </p>
        
        {/* 路線名 */}
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 block mb-1">
            路線名
          </label>
          <input
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="例：渋谷氷川の杜"
            className="w-full p-2 border rounded text-sm"
          />
        </div>
        
        {/* 樹木医名 */}
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 block mb-1">
            樹木医名
          </label>
          <input
            type="text"
            value={arboristName}
            onChange={(e) => setArboristName(e.target.value)}
            placeholder="例：小川 ○○"
            className="w-full p-2 border rounded text-sm"
          />
        </div>
        
        {/* 診断日 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              診断日
            </label>
            <button
              type="button"
              onClick={handleSetToday}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
            >
              今日
            </button>
          </div>
          <input
            type="date"
            value={surveyDate}
            onChange={(e) => setSurveyDate(e.target.value)}
            className="w-full p-2 border rounded text-sm"
          />
        </div>
        
        {/* ボタン */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 hover:bg-gray-100 rounded"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 2-2. ヘッダーに設定アイコンを追加

`src/App.jsx`（または該当ヘッダー部分）に設定ボタンを追加。

**まず確認**：既存のヘッダーに設定アイコン⚙が既にある場合、その onClick で新しいモーダルを開く形に変更。なければ新規追加。

ヘッダーに既に lucide-react のアイコンが使われている場合：

```jsx
import { Settings } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';

// App コンポーネント内
const [isSettingsOpen, setIsSettingsOpen] = useState(false);

// ヘッダー部分に追加
<button
  type="button"
  onClick={() => setIsSettingsOpen(true)}
  className="p-2 hover:bg-gray-100 rounded"
  aria-label="設定"
>
  <Settings className="w-5 h-5" />
</button>

// 既存のエクスポートボタンの隣あたりに配置

// モーダルをレンダー（コンポーネントツリーの末尾あたり）
<SettingsModal
  isOpen={isSettingsOpen}
  meta={meta}
  onSave={(values) => {
    setMeta(prevMeta => ({ ...prevMeta, ...values }));
  }}
  onClose={() => setIsSettingsOpen(false)}
/>
```

lucide-react が無い、または絵文字で済ませたい場合：

```jsx
<button
  type="button"
  onClick={() => setIsSettingsOpen(true)}
  className="p-2 hover:bg-gray-100 rounded text-xl"
>
  ⚙
</button>
```

### 2-3. meta の保存

既存の meta 保存ロジック（IndexedDBへの永続化）が既にあるはず。`setMeta` を呼べば自動的に保存される設計になっている前提。

もし「`setMeta` 後に明示的に save 関数を呼ぶ」設計なら、`onSave` 内でその関数も呼ぶこと。

---

## ステップ3：JSONエクスポート確認

### 3-1. meta フィールドが出力されるか確認

`src/lib/exportHelpers.js` を view し、JSONエクスポートで `meta` がそのまま含まれていることを確認：

```javascript
// 期待される出力
{
  exportedAt: "2026-05-11T12:00:00Z",
  trees: [...],
  meta: {
    // ... 既存フィールド ...
    routeName: "渋谷氷川の杜",
    arboristName: "小川 ○○",
    surveyDate: "2026-05-11",
  }
}
```

ホワイトリスト指定があれば、上記3フィールドを追加。なければ自動的に含まれるはず。

---

## ステップ4：PC側 - テンプレート分析

### 4-1. テンプレートExcelを開いてセル位置を特定

`karte-generator/templates/shibuya.xlsx` を openpyxl で開いて、以下の文字列が含まれるセルとその右隣（値が入るセル）を探す：

```python
# karte-generator/find_meta_cells.py（一時的なスクリプト、後で削除可）
from openpyxl import load_workbook
from pathlib import Path

wb = load_workbook("templates/shibuya.xlsx")
ws = wb.active

targets = ["路線名", "樹木医", "診断日", "事務所名", "No."]

for row in ws.iter_rows():
    for cell in row:
        if cell.value:
            for t in targets:
                if t in str(cell.value):
                    print(f"'{t}' found at {cell.coordinate}: '{cell.value}'")
                    # 右隣のセル
                    next_col = cell.column + 1
                    next_cell = ws.cell(row=cell.row, column=next_col)
                    print(f"  Right neighbor: {next_cell.coordinate}")
                    # 結合セルがある場合の対応
                    for merged in ws.merged_cells.ranges:
                        if next_cell.coordinate in merged:
                            print(f"  (Part of merged range: {merged})")
```

これを実行して出力をメモする。例えば：

```
'路線名' found at A2: '路線名'
  Right neighbor: B2
'樹木医' found at E2: '樹木医'
  Right neighbor: F2
'診断日' found at I2: '診断日'
  Right neighbor: J2
```

実行結果を `karte-generator/templates/shibuya.json` に反映する。

### 4-2. shibuya.json にマッピング追加

`karte-generator/templates/shibuya.json` を view し、現在のマッピング構造を確認する。たとえば：

```json
{
  "tree_number": "B5",
  "species": "C5",
  ...
}
```

のような形で書かれているはず。これに meta セクションを追加：

```json
{
  "meta": {
    "route_name": "B2",
    "arborist_name": "F2",
    "survey_date": "J2"
  },
  
  "tree_number": "B5",
  "species": "C5",
  ...
}
```

セルアドレスは前述のスクリプトで特定した実際の値に置き換える。

---

## ステップ5：PC側 - generate.py の改修

### 5-1. meta の値をカルテに反映

`generate.py` で各樹のシートを生成する関数（おそらく `fill_karte` のような名前）の中で、テンプレート設定の `meta` セクションを読んで該当セルに値を入れる。

既存ロジックの流れに合わせて、以下を追加：

```python
# generate.py 内、樹ごとのカルテ生成部分

# meta（調査全体の情報）を取得
meta = data.get("meta", {})

# テンプレート設定の meta セクションを取得
template_meta = template_config.get("meta", {})

# 各セルに値を反映
if "route_name" in template_meta:
    ws[template_meta["route_name"]] = meta.get("routeName", "")

if "arborist_name" in template_meta:
    ws[template_meta["arborist_name"]] = meta.get("arboristName", "")

if "survey_date" in template_meta:
    survey_date_str = meta.get("surveyDate", "")
    if survey_date_str:
        # 'YYYY-MM-DD' を 'YYYY/MM/DD' or 'YYYY年MM月DD日' に変換
        # カルテの慣例に合わせる（とりあえずそのまま入れる、後で調整）
        formatted = survey_date_str.replace("-", "/")
        ws[template_meta["survey_date"]] = formatted
```

### 5-2. 日付フォーマットの確認

カルテで「2026/05/11」「2026年5月11日」「令和6年5月11日」のどの表記が望ましいか実際のテンプレートを見て判断。**まずは `YYYY/MM/DD` 形式で実装**して、ユーザー確認後に必要なら変更。

---

## ステップ6：動作確認チェックリスト

### PWA側

- [ ] ヘッダーに ⚙ アイコンが表示される
- [ ] ⚙ をタップすると設定モーダルが開く
- [ ] 路線名・樹木医名・診断日を入力できる
- [ ] 「今日」ボタンで診断日に当日が入る
- [ ] 「保存」を押すとモーダルが閉じる
- [ ] 再度 ⚙ を開くと、保存した値が表示される
- [ ] アプリを閉じて再起動しても値が保持されている
- [ ] 樹を切り替えても値が消えない（meta は樹ごとではなく全体）
- [ ] JSONエクスポート時、meta に routeName・arboristName・surveyDate が含まれる

### PC側

- [ ] テンプレートExcelの該当セルを正確に特定できた
- [ ] shibuya.json にマッピングを追加した
- [ ] PWAから出力したJSONでカルテ生成すると、各樹のカルテに路線名・樹木医名・診断日が入る
- [ ] 1本目も2本目も、すべての樹のカルテに同じ値が入る
- [ ] meta が空の場合（旧JSONなど）でもエラーにならない

---

## トラブルシューティング想定

### Q1：モーダルが開かない

→ `isOpen` の state 管理を確認。`onClick` で `setIsSettingsOpen(true)` が呼ばれているか。

### Q2：保存しても再度開いたら空欄

→ `setMeta` 後に IndexedDB への永続化が走っているか確認。既存の meta 保存ロジックを把握する。

### Q3：「今日」ボタンを押してもカレンダーが「2026/01/01」のまま

→ ブラウザの日付ピッカーは入力欄が `<input type="date">` でないと動かない。

### Q4：PC側でテンプレートのセルが結合セルだった

→ 結合セルは左上のセルにのみ書き込みができる。`find_meta_cells.py` で結合範囲を確認し、左上セルのアドレスを使う。

### Q5：診断日が「2026-05-11」のまま表示される

→ ステップ5-2の通り `YYYY/MM/DD` 形式に変換。さらに「令和」表記が必要なら別途実装。

### Q6：JSONに meta が出ない

→ `exportHelpers.js` でホワイトリスト指定があれば、3フィールドを追加。

---

## 完了報告フォーマット

実装後、以下を報告：

1. PWA側の動作確認チェックリスト結果
2. PC側でテンプレートのセル位置を特定した結果（出力をテキストで）
3. shibuya.json の該当部分
4. 実際にカルテExcelを生成したスクショ（路線名等が入っていること）
5. JSONエクスポートのサンプル（meta 部分を抜粋）
6. 想定外の挙動・実装で迷った箇所があれば

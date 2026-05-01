# 機能改修 v2.5：部位診断UIをチップボタン式に変更

このドキュメントは、`field-survey-tool` プロジェクトで現在「現場メモ」欄の上に配置されているチェックボックス式の部位診断UIを、**メモ挿入専用のチップボタン**に置き換えるための作業指示書です。

---

## 背景

現在のUI：
- メモ欄の上に「根元・幹・大枝」の3部位ごとに、診断項目のチェックボックスが並んでいる
- チェックを入れると部位診断と連動する

これを以下のように改修：
- チェックボックスを全部撤去
- 代わりに**メモ挿入専用のチップボタン**を配置
- ボタンには印が付かない（タップ＝メモへ挿入のみ）
- 何度でも押せる
- メモの末尾の文脈を見て、読点 or 改行＋部位ラベル を自動判定して挿入

---

## ステップ1：診断項目の定数化

`src/config/constants.js`（または該当する設定ファイル）に、部位ごとの診断項目を定数として追加：

```js
// 部位ごとの診断項目
// メモ欄に挿入されるテキスト（部位ラベル抜き）として使う
export const DIAGNOSIS_ITEMS = {
  根元: [
    '樹皮枯死・欠損・腐朽',
    '開口空洞（芯に達しない）',
    '開口空洞（芯に達する）',
    'キノコ（子実体）',
    '木槌打診異常',
    '分岐部・付根の異常',
    '胴枯れなどの病害',
    '虫穴・虫フン・ヤニ',
    '根元の揺らぎ',
    '鋼棒貫入異常',
    '巻き根',
    'ルートカラー見えない',
    '露出根被害',
    '不自然な傾斜',
  ],
  幹: [
    '樹皮枯死・欠損・腐朽',
    '開口空洞（芯に達しない）',
    '開口空洞(芯に達する）',
    'キノコ（子実体）',
    '木槌打診異常',
    '分岐部・付根の異常',
    '胴枯れなどの病害',
    '虫穴・虫フン・ヤニ',
  ],
  大枝: [
    '樹皮枯死・欠損・腐朽',
    '開口空洞（芯に達しない）',
    '開口空洞（芯に達する）',
    '枯枝',
    'スタブカット',
    'キノコ（子実体）',
    '木槌打診異常',
    '分岐部・付根の異常',
    '胴枯れなどの病害',
    '虫穴・虫フン・ヤニ',
  ],
};

// 部位の表示順（チップグループの並び順）
export const DIAGNOSIS_PARTS_ORDER = ['根元', '幹', '大枝'];
```

**注意**：「幹」の3番目の項目は、入力ミス防止のため上記コピー時に括弧記号が混在しているか確認すること。基本的に全角の `（）` で統一する。

---

## ステップ2：メモ挿入ロジックの実装

`src/lib/memoInsert.js` を新規作成：

```js
/**
 * 現場メモに部位診断項目を挿入する。
 * 
 * ロジック：
 * - メモが空、または末尾が改行で終わっている場合
 *   → 新しい行で `部位：項目名` を追加
 * - メモの最終行が同じ部位の続き（先頭が `部位：` で始まっている）
 *   → 既存テキストの末尾に `、項目名` を追加（読点 + 項目名）
 * - メモの最終行が違う部位の続き
 *   → 改行 + `部位：項目名` を追加
 * 
 * @param {string} currentMemo 現在のメモテキスト
 * @param {string} part 部位名（'根元'/'幹'/'大枝'）
 * @param {string} item 診断項目名
 * @returns {string} 更新後のメモテキスト
 */
export function insertDiagnosisItem(currentMemo, part, item) {
  const memo = currentMemo || '';

  // メモが完全に空 → 部位ラベル付きで開始
  if (memo.length === 0) {
    return `${part}:${item}`;
  }

  // 最終行を取得
  const lines = memo.split('\n');
  const lastLine = lines[lines.length - 1];

  // 最終行が空（メモが改行で終わっている）
  if (lastLine.trim().length === 0) {
    // 改行を保ったまま、最後に新しい行で追加
    return memo + `${part}:${item}`;
  }

  // 最終行の先頭が「部位:」または「部位：」で始まっているかチェック
  // 全角・半角コロン両対応
  const partsPattern = /^(根元|幹|大枝)[:：]/;
  const match = lastLine.match(partsPattern);

  if (match) {
    const lastLinePart = match[1];
    if (lastLinePart === part) {
      // 同じ部位 → 読点で続ける
      return memo + `、${item}`;
    } else {
      // 違う部位 → 改行して新しい部位ラベルから
      return memo + `\n${part}:${item}`;
    }
  }

  // 最終行が部位ラベルを持たない（自由記述で終わっている）
  // → 改行して新しい部位ラベルから
  return memo + `\n${part}:${item}`;
}
```

**注意点**：
- 部位ラベルのコロンは半角 `:` を使う（実例の渋谷調査票も `:` 半角）。ただし `：` 全角でも認識する寛容なパターンマッチにする。
- 末尾の改行有無で分岐するのが重要。ユーザーが Enter を押した直後に挿入した場合は、改行は維持しつつ新しい部位ラベルから始める。

---

## ステップ3：DiagnosisChips コンポーネントの新規作成

`src/components/DiagnosisChips.jsx` を新規作成：

```jsx
import React, { memo } from 'react';
import { DIAGNOSIS_ITEMS, DIAGNOSIS_PARTS_ORDER } from '../config/constants.js';

const ChipGroup = memo(function ChipGroup({ part, items, onInsert }) {
  return (
    <div>
      <p className="text-[11px] text-stone-600 mb-1.5 tracking-wide">{part}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <button
            key={item}
            type="button"
            onClick={() => onInsert(part, item)}
            className="px-2.5 py-1 text-[11px] border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 transition-colors whitespace-nowrap"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
});

const DiagnosisChips = memo(function DiagnosisChips({ onInsert }) {
  return (
    <div className="space-y-3 mb-3">
      {DIAGNOSIS_PARTS_ORDER.map(part => (
        <ChipGroup
          key={part}
          part={part}
          items={DIAGNOSIS_ITEMS[part]}
          onInsert={onInsert}
        />
      ))}
      <p className="text-[10px] text-stone-500 leading-relaxed">
        タップすると現場メモに挿入されます。同じ部位は読点で続けて、別の部位は新しい行になります。
      </p>
    </div>
  );
});

export default DiagnosisChips;
```

**デザイン方針**：
- 既存のSegmentedControlやJudgmentPanelと同じ視覚言語（白背景、stone-300ボーダー、emerald-700ホバー）
- 印は付かないので「ボタンらしさ」を維持
- 部位ラベルは小さく上に配置、その下にチップが flex-wrap で並ぶ
- 説明文をグループ末尾に小さく追加

---

## ステップ4：App.jsx での組み込み

App.jsx の現場メモセクション部分を改修：

**Before（現状の該当箇所）**：
```jsx
<Section title="現場メモ">
  {/* ↓ ここに既存のチェックボックス群がある（部位ごとにチェックボックスが並ぶUIブロック） */}
  {/* ※ 現状のコードのこのチェックボックス部分を全部削除 */}
  
  <textarea
    value={currentMeta.memo}
    onChange={e => updateCurrent({ memo: e.target.value })}
    rows={8}
    ...
  />
  ...
</Section>
```

**After（改修後）**：
```jsx
import DiagnosisChips from './components/DiagnosisChips.jsx';
import { insertDiagnosisItem } from './lib/memoInsert.js';

// ...

const handleInsertDiagnosis = useCallback((part, item) => {
  const newMemo = insertDiagnosisItem(currentMeta.memo, part, item);
  updateCurrent({ memo: newMemo });
}, [currentMeta?.memo, updateCurrent]);

// セクション内：
<Section title="現場メモ">
  <DiagnosisChips onInsert={handleInsertDiagnosis} />
  
  <textarea
    value={currentMeta.memo}
    onChange={e => updateCurrent({ memo: e.target.value })}
    rows={8}
    className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700 leading-relaxed"
    placeholder="例：&#10;根元：露出根被害5×20cm、踏圧&#10;幹：傾斜・小（南方向）&#10;枝：被圧により葉が少なめ"
  />
  <p className="text-[11px] text-stone-500 mt-2">
    部位（根元・幹・枝）・寸法・方向・程度を含めると、後でカルテへ落とし込みやすくなります
  </p>
</Section>
```

**重要**：
- 既存のチェックボックス連動UI（あったら）はすべて削除する
- 「部位診断」のチェック状態を保持していたデータフィールド（あったら）はそのまま残してOK（後方互換のため）。ただし参照しているUIコンポーネントは削除。
- データの保存先（IndexedDB）に古いチェック状態が残っていてもエラーにならないようにする

---

## ステップ5：placeholder の更新

`<textarea>` の placeholder を、新しい入力スタイルが分かるサンプルに更新：

```
例：
根元：露出根被害5×20cm、踏圧
幹：傾斜・小（南方向）
枝：被圧により葉が少なめ
```

これは現場メモのフォーマット例として親切。

---

## ステップ6：データモデルの整理（任意）

現状のチェックボックス状態を保持しているフィールド（仮に `partDiagnosis` や `checkedItems` があるなら）について：

- **削除する場合**：データ移行で古いフィールドを無視するロジックだけ追加（loadOrMigrateMeta関数）
- **残す場合**：データは残るが UI から参照されないだけ

シンプルさ優先なら削除、後方互換重視なら残す。**今回はシンプルさ優先で削除**を推奨。

例（loadOrMigrateMeta内に追加）：
```js
// 旧チェックボックス状態フィールドを削除
delete meta.partDiagnosis;
delete meta.checkedItems;
```

---

## ステップ7：動作確認

```bash
npm run dev
```

確認ポイント：

- [ ] 既存のチェックボックスが消えている
- [ ] 代わりに「根元・幹・大枝」の3グループのチップボタンが並んでいる
- [ ] 各チップは押せる
- [ ] 押した時の挙動：
  - [ ] メモが空 → 「根元:樹皮枯死・欠損・腐朽」が入力される
  - [ ] 続けて同じ部位の別項目 → 「根元:樹皮枯死・欠損・腐朽、開口空洞（芯に達しない）」になる
  - [ ] さらに違う部位 → 改行されて「幹:樹皮枯死・欠損・腐朽」が新しい行で始まる
  - [ ] 寸法を手で入れた状態で同じ部位 → 寸法のあとに読点が付く（例：「根元:樹皮枯死...5×20cm、開口空洞...」）
- [ ] 旧データ（前バージョンで作った樹）が問題なく開ける
- [ ] リロードしてもメモ内容が保持される
- [ ] スマホ（http://192.168.x.x:5173/）でもチップがちゃんと並ぶ

---

## ステップ8：GitHubへpush

```bash
git add .
git commit -m "Replace diagnosis checkboxes with insertion-only chip buttons"
git push
```

Vercel が自動デプロイ。1〜2分後に本番反映、iPhone PWA も次回起動時に更新。

---

## 補足：将来の拡張

- 寸法のクイック挿入（よく使う「5×20cm」「φ10cm」みたいなチップを追加するのもアリ）
- 部位ラベルを変更する設定（「枝」と「大枝」の表記揺れに対応）
- チップの並び順を頻度で自動ソート

これらは v2.5 のスコープ外、将来追加用メモ。

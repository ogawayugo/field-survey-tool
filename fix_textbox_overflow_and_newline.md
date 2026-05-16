# 緊急修正：マーカーtextbox 幅オーバーフロー + 改行不可

## 概要

Phase C 実装後、マーカーtextbox に2つの問題が発生：

1. **問題1**：textbox の幅制限がなく、長文が写真領域の外まで伸びてしまう
2. **問題2**：textbox 内で改行できない（Enter キーが効かない）

両方とも写真上のマーカーと所見欄の両方で同様の修正が必要。

---

## 修正対象ファイル

1. `src/components/MarkerOverlay.jsx` — 写真上のマーカー textbox
2. `src/components/ObservationPanel.jsx` — 所見欄の textbox / summary input

CSSが別ファイルにある場合はそちらも調整。

---

## 問題1の修正：幅制限 + 自動折り返し

### 仕様

**写真上のマーカー textbox：**
- **最大幅**：240px（写真の長辺の約25%程度を想定）
- **最小幅**：80px（短文時に縮みすぎない）
- **改行**：自動折り返し（`word-break: break-word` + `white-space: pre-wrap`）
- **高さ**：内容に応じて自動拡大（`height: auto`、行が増えると縦に伸びる）
- **最大高さ**：6行程度で頭打ち、超えたら縦スクロール（`max-height` + `overflow-y: auto`）

**所見欄の textbox（メインの textarea）：**
- **幅**：親要素の利用可能幅をフル活用（既存のレイアウトを維持）
- **高さ**：内容に応じて自動拡大
- **最大高さ**：8行程度
- **改行**：当然OK（textarea なので）

**所見欄の summary input（括弧内）：**
- 短い表記専用なので、幅制限のみで改行は不要（既存のままでOK）

### 実装ガイド

写真上のマーカー textbox は、現状 `<input type="text">` か、もしくは contentEditable div の可能性が高い。**`<textarea>` に変更**することで改行 + 自動折り返しが一気に解決する：

```jsx
// MarkerOverlay.jsx 内のマーカーtextbox（変更前イメージ）
<input
  type="text"
  value={marker.text}
  onChange={handleTextChange}
  className="marker-text-input"
/>

// ↓ 変更後

<textarea
  value={marker.text}
  onChange={handleTextChange}
  rows={1}                  // 初期は1行
  className="marker-text-input"
  style={{
    minWidth: '80px',
    maxWidth: '240px',
    minHeight: '24px',
    maxHeight: '120px',
    resize: 'none',         // ユーザーリサイズ不可
    overflowY: 'auto',      // 超えたらスクロール
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    fontSize: '13px',       // 必要に応じて
    padding: '4px 6px',
    boxSizing: 'border-box',
  }}
/>
```

### 高さの自動拡大（オプション）

`textarea` は標準だと改行しても高さが自動で増えない（`rows` で固定）。**自動拡大したい場合**は、`onChange` で `scrollHeight` を測って高さを設定：

```jsx
const handleTextChange = (e) => {
  // 高さ自動調整
  e.target.style.height = 'auto';
  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; // max 120px

  // 既存の onChange ロジック
  const newText = e.target.value;
  const updates = { ...marker, text: newText };
  if (!marker.summaryEdited) {
    updates.summary = extractSummary(newText, marker.item, rules, marker.part);
  }
  onChange(updates);
};
```

あるいは `react-textarea-autosize` パッケージを使うのも可。プロジェクトで既に使ってないか確認、なければ自前実装で十分。

---

## 問題2の修正：改行不可

### 原因の可能性

以下のいずれか：

1. **`<input>` 要素を使っている** → Enter で改行できない仕様
2. **`onKeyDown` で Enter を `preventDefault()` している** → カスタム実装で改行を潰してる
3. **IME 変換中の Enter** → これは仕様（IME 確定）

### 修正

問題1 で `<textarea>` に変更すれば改行は自然に効く。それでも改行できない場合：

```jsx
const handleKeyDown = (e) => {
  // Enter を握りつぶす onKeyDown があれば修正
  if (e.key === 'Enter') {
    // preventDefault しない（デフォルト動作で改行させる）
    return;
  }
  // 他のキー操作（Escape など）は維持
};
```

### 注意

「Enter で確定、Shift+Enter で改行」のフォーム的挙動になっていないか確認。**樹木医は所見を自由記述するので、Enter = 改行のほうが自然**。確定動作（フォーカス外し）が必要ならフォーカス外クリックや別ボタンで対応。

---

## 検証手順

1. `npm run dev` で開発サーバー起動
2. テスト樹を1本作成
3. 写真にマーカーを1つ配置（任意の項目）
4. **マーカー textbox に長文を入力**：「木槌打診異常 大 GL1.5m〜2.5m 反響強く深い損傷の可能性あり」
   - 期待：240px 幅で自動折り返し、複数行表示
   - 期待：写真領域の外に出ない
5. **Enter キーで改行**：上記文字列の途中で Enter
   - 期待：新しい行が挿入される
6. **所見欄でも同様にテスト**：所見欄の textarea にも長文+Enter で改行確認

すべて OK なら修正完了。

---

## 範囲外（別途対応）

以下は本指示書の対象外：

- **問題3：マーカーが他要素より上に重なる問題**（z-index と boundary clamp）
  → 別の指示書で対応予定。今回触らないこと。

- **summary 入力欄の改行**
  → 短い表記専用なので改行不要。修正不要。

---

## 完了報告に含めてほしいこと

1. 修正したファイル名一覧
2. `<textarea>` への変更 or `<input>` のまま CSS だけで対応したか
3. `react-textarea-autosize` などのパッケージを追加したかどうか
4. 検証手順を実行した結果（特にスクショ1枚）

以上。

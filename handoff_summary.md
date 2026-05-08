# 街路樹現場調査ツール開発 引き継ぎサマリー

## ユーザー情報

**ちっこいおっさん**：日本の樹木医（街路樹診断士）。ブログ「街の木コレクション」を運営。川越エリアでパチンコホールのデータ分析も行う。文体は親しみやすい一人称エッセイ調、自虐ユーモアあり、植物学的に正確。

**業務**：街路樹診断（街路樹診断カルテ作成）。1日40〜50本の調査が標準。

**作業環境**：
- Windows PC（パス：`C:\Users\81804\OneDrive\デスクトップ\`）
- Python 3.14.4 インストール済み
- Node.js / npm 利用可能
- Claude Code を winget でインストール済み
- GitHub ユーザー：ogawayugo
- iPhone（iOS Safari でPWA利用）

---

## プロジェクト全体像

街路樹診断業務を効率化する2層ツール：

```
[現場：iPhone PWA] → JSON エクスポート → [PC：GUIツール] → カルテExcel完成
```

### コンポーネント1：PWA（街路樹現場調査）

- **構成**：Vite + React + Tailwind v3 + IndexedDB（idb-keyval）+ PWA
- **GitHub**：ogawayugo/field-survey-tool
- **デプロイ**：Vercel（無料Hobbyプラン）
- **ローカル開発**：`localhost:5173` または `5174`
- **プロジェクトパス**：`C:\Users\81804\OneDrive\デスクトップ\field-survey-tool`

**実装済み機能**：
- 樹の追加・切替・削除
- 基本情報入力（樹木番号、樹種、樹高、幹周、枝張、植栽形態、支柱）
- 活力度（樹勢/樹形 1-5）
- 写真アップロード（4枠：樹木全体、クローズアップ1〜3）、ラベル付け、960px JPEG 60%圧縮
- 現場メモ
- **診断チップボタン**（v2.5）：根元・幹・大枝の各部位ごとの診断項目をタップで「部位:項目」形式でメモに挿入。同じ部位は読点で連続、別の部位は改行＋部位ラベル。挿入時に末尾の余分な読点・空白をクリーンアップ
- **診断判定パネル**（v2）：活力判定（A/B1/B2/C）、部位判定マトリクス（根元・幹・大枝 × A/B1/B2/C）、外観診断判定
- **エクスポート機能**：JSON、Excelシンプル、ZIP（写真込み）、テキストコピー、「カルテExcel」（後述、v3で実装したが結局使わない方向）

### コンポーネント2：PC側カルテ生成ツール

- **配置**：`C:\Users\81804\OneDrive\デスクトップ\field-survey-tool\karte-generator\`
- **言語**：Python 3.14.4 + openpyxl + Pillow + tkinter（GUI）+ tkinterdnd2（オプション）
- **配布形態**：PyInstaller で .exe 化して配布

**ファイル構成**：
```
karte-generator/
├── generate.py           ← コアロジック（CUI でも実行可能）
├── generate_gui.py       ← GUIアプリ（ファイル追加・複数ファイル統合・進捗バー）
├── カルテ生成.bat        ← ダブルクリック起動用
├── build.bat             ← .exe ビルド用
├── karte_generator.spec  ← PyInstaller 設定
├── README.md
├── templates/
│   ├── shibuya.xlsx      ← 渋谷氷川の杜様式テンプレート（30,980 bytes）
│   └── shibuya.json      ← セルマッピング設定
└── dist/配布パッケージ/   ← ビルド成果物（.exe + templates）
```

**特徴**：
- テンプレート Excel を openpyxl の `copy_worksheet` で複製 → スタイル・列幅・結合セル・印刷設定を完璧に保持
- 複数 JSON 統合機能（事務所メンバー分担運用に対応）
- テンプレートは外部 JSON で定義、`templates/` フォルダに追加するだけで新様式対応可
- GUI でドラッグ&ドロップ、進捗表示、完了後フォルダを開く

---

## 重要な技術的決定と背景

### ExcelJS から openpyxl への移行（重要な失敗体験）

最初は PWA 内でブラウザ JavaScript（ExcelJS + JSZip）でカルテ Excel を直接生成しようとした。**しかし致命的な問題が発覚**：

- ExcelJS でテンプレートシートを複製すると、**styles.xml が 210KB → 52KB に縮む**（75%のスタイル定義が失われる）
- 列の `style="3"` 属性が落ち、スタイル番号と中身の対応がズレる
- 列定義の min/max 範囲が一部欠落（特に BP, BR 列）
- これらすべてを ExcelJS / JSZip / XML直接編集で何度も修正試みたが解決せず

**最終的に Python + openpyxl に切り替えて根本解決**。openpyxl の `copy_worksheet` は同じワークブック内なら完璧にコピーできる。

教訓：**「PWAで全部完結」は理想だが、ExcelJSのスタイルテーブル問題で現実的でなかった**。PCスクリプト併用の2層構成が結果的に正解。

### バグ修正履歴（karteGenerator）

- **「、、」読点重複**：チップ挿入時に末尾の読点・空白をクリーンアップして対応
- **メモにない項目を勝手に「なし」にする問題**：「あれば■、なければ何もしない」ロジックに変更
- **所見欄が部位別整形されない**：`formatShokenForKarte`/`parseShokenLines` で部位別グルーピング
- **3択項目（樹皮枯死、開口空洞×2）の自動チェック対象外**：`SKIP_ITEMS` で明示的にスキップ。手動入力前提
- **「不自然な傾斜」など、only_part 制約を緩めた**：ユーザーが「幹に傾斜」と書いても根元の正式列にチェック

### キーワードマッチング

メモから項目を抽出する際の柔軟性のため、`extract_diagnosis_item_name` 関数で部分一致・キーワード辞書を実装：
- 「傾斜」→「不自然な傾斜」
- 「ベッコウタケ」「子実体」→「キノコ（子実体）」
- 「カミキリ」「虫穴」→「虫穴・虫フン・ヤニ」
- など

---

## 残作業・進行中の課題

### 進行中：exe 化のテンプレートパス問題

**最後にやっていた作業**：PyInstaller で .exe 化したところ、`dist/配布パッケージ/街路樹カルテ生成.exe` を起動しても「テンプレートが見つかりません」エラーが出る。

**原因**：PyInstaller で .exe 化すると `__file__` が一時展開フォルダを指すため、相対パスでの templates フォルダ検索が失敗する。

**解決策（指示書作成済み）**：`exe_template_path_fix.md` を Claude Code に渡して `generate_gui.py` を修正。具体的には：

```python
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = Path(sys.executable).parent
else:
    SCRIPT_DIR = Path(__file__).parent
```

修正後、`build.bat` でリビルド予定。**この作業の途中**。

### 未実装：v2.6 の3択項目選択UI

3択項目（樹皮枯死、開口空洞×2 × 根元・幹・大枝の9マス）をPWAで入力できるUI。指示書 `feature_v2_6_three_choice.md` 作成済み、未実装。

仕様：
- 折りたたみ可能セクション、根元・幹・大枝ごとに3項目×3択
- デフォルト「なし」、被害件数バッジ表示
- データ構造：`threeChoiceJudgments: { root: {barkDeath, cavityShallow, cavityDeep}, trunk:{...}, branch:{...} }`
- PCスクリプト側にも対応必要

### 検討中：データ共有機能（保留中）

事務所2-3人で「現場分担型」運用したいニーズあり。同時編集はたまにある程度。

**今のところ実装しない方針で合意**：
- まずは「JSONエクスポート → Dropbox 等で共有 → リーダーが PC スクリプトで一括処理」運用で十分
- generate_gui.py が複数 JSON 統合に対応済み
- 必要になったら段階的に実装（クラウドバックアップ → チーム同期）

### 検討中：Vercel 無料枠の商用利用問題

Vercel Hobby プランは商用利用禁止。同業者数人で使うなら規約違反リスク。

**移行先候補**：Cloudflare Pages（無料・商用OK・帯域無制限）。本格的に同業者に広めるタイミングで移行予定。Workersで$5/月、R2は10GB無料。**まだ移行していない**。

---

## 差別化戦略の方向性（同業者向け）

街路樹note（既存サービス）との差別化検討で出た方向性：

**ポジショニング**：「ひとり樹木医のための、爆速カルテ作成ツール」

**強み**：
1. 現場での入力スピード（チップタップ）
2. オフライン完結（PWA）
3. 写真の軽快な扱い
4. 軽量・モダンUI
5. 無料運用可能（Cloudflare Pages）
6. **樹木医自身が作っている**（最大の差別化）
7. 改善サイクルが速い（Claude Code で即対応）
8. データはユーザーのもの（ベンダーロックインなし）

**段階的展開**：
1. 自分用 → 完成度UP
2. 仲間2-3人に試してもらう（exe配布）
3. フィードバック反映
4. 必要なら GitHub 公開・広範囲配布

---

## ワークフロー・コミュニケーションスタイル

ちっこいおっさんとの作業は以下のパターン：

1. **要望提示** → 私が選択肢を提示（ask_user_input_v0 ツール使用）
2. **方向性決定** → 私が Claude Code 用の作業指示書（.md）を作成
3. **実装** → ちっこいおっさんが Claude Code に投げる
4. **動作確認** → スクショで報告
5. **問題があれば** → 私が分析（生成ファイルのアップロードを依頼）→ 修正指示書

**指示書のパターン**：
- ファイル名：`feature_vX_X_xxx.md` または `xxx_fix.md`
- ステップ番号付きで明確に分けて書く
- コード例を豊富に
- トラブルシューティング想定も入れる
- 完了確認チェックリスト

---

## 現在の状況スナップショット

- **PWA**：本番稼働中（Vercel）。v2.5 までの機能完成。iPhone PWA インストール済み
- **PCツール（GUI版）**：実装完了、テスト済み（`karte_test_survey.json` で検証）
- **PCツール（exe版）**：ビルド完了したが、テンプレート認識エラーで修正待ち
- **指示書ライブラリ**（過去に作成・渡したもの）：
  - `pwa_conversion_guide.md`（PWA化）
  - `feature_v2_judgment_and_export.md`（判定欄+Excel/ZIP）
  - `feature_v2_5_diagnosis_chips.md`（チップUI）
  - `feature_v3_karte_generator.md`（カルテ自動生成・ExcelJS版・断念）
  - `v3_bug_fixes.md` / `v3_layout_fix.md` / `v3_layout_fix_v2.md` / `v3_layout_fix_v3_xml.md` / `v3_layout_fix_v4_styles.md`（ExcelJS時代のレイアウト修正試行）
  - `feature_v2_6_three_choice.md`（3択UI、PWA+PC両方）
  - `build_exe_guide.md`（PyInstaller設定）
  - `exe_template_path_fix.md`（exe化時のパス問題、最新）

---

## 引き継ぎ後の最初のアクション

新しいチャットでまず確認すべき：

1. **exe のテンプレート問題が解決したか**
2. **配布パッケージが他のPC（Pythonなしの環境）で動くか確認したか**
3. **v2.6 の3択UI実装に進むか、別の方向に進むか**
4. **何か新しい要望や問題が発生していないか**

ちっこいおっさんの希望を聞いて、選択肢を出して進める。

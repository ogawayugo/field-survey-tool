# exe 化時のテンプレートパス問題の修正

## 問題

`generate_gui.py` を PyInstaller で .exe 化した際、テンプレートフォルダが見つからない問題が発生。

エラーの状況：
- `dist/配布パッケージ/街路樹カルテ生成.exe` を起動
- `templates/` フォルダは exe と同じ階層にちゃんと存在
- にもかかわらず「テンプレートが見つかりません」と表示される

## 原因

PyInstaller で exe 化すると、Python の `__file__` が指す場所が**実行時の一時展開フォルダ**になってしまう。

つまり：
- 通常のスクリプト実行：`__file__` = `generate_gui.py` のあるフォルダ
- exe 実行：`__file__` = `C:\Users\xxx\AppData\Local\Temp\_MEIxxxx\generate_gui.py` のような一時フォルダ

そのため `Path(__file__).parent / 'templates'` が一時フォルダ内を探してしまい、見つからない。

## 修正対象ファイル

`generate_gui.py`

## 修正内容

ファイル冒頭の `SCRIPT_DIR` を取得する部分を修正する。

### 修正前（おそらく現状のコード）

```python
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))
```

### 修正後

```python
# exe化されたかどうかで取得方法を分岐
if getattr(sys, 'frozen', False):
    # PyInstaller でexe化された場合：exeファイルのある場所
    SCRIPT_DIR = Path(sys.executable).parent
else:
    # 通常のPythonスクリプトとして実行された場合
    SCRIPT_DIR = Path(__file__).parent

sys.path.insert(0, str(SCRIPT_DIR))
```

`sys.frozen` は PyInstaller が exe 化時に自動でセットする属性。
これがあれば「exeとして実行されている」と判定できる。

## 同じ修正を `TEMPLATES_DIR` にも適用

`generate_gui.py` の中盤に以下のような行があるはず：

```python
TEMPLATES_DIR = SCRIPT_DIR / 'templates'
```

これは `SCRIPT_DIR` を使っているだけなので、上記の修正で自動的に正しい場所を指すようになる。
追加修正は不要。

## 念のため `generate.py` も確認

`generate.py` 内にも `SCRIPT_DIR` や `TEMPLATES_DIR` の定義があるかもしれない。
あれば同じ修正を適用：

```python
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = Path(sys.executable).parent
else:
    SCRIPT_DIR = Path(__file__).parent
```

## 修正後の手順

1. `generate_gui.py`（と必要なら `generate.py`）を上記のように修正
2. 既存の `dist/` と `build/` フォルダを削除
3. `build.bat` を再実行してリビルド：
   ```
   .\build.bat
   ```
4. 新しい `dist/配布パッケージ/街路樹カルテ生成.exe` を起動
5. テンプレートが認識されることを確認

## 動作確認

- [ ] GUI起動時、テンプレート選択ドロップダウンに「街路樹診断カルテ（渋谷氷川の杜様式）」が表示される
- [ ] JSON ファイルを追加してカルテ生成ができる
- [ ] 別のフォルダにコピーしても動作する（フォルダごと移動 → 起動 → 動く）

## 補足：将来の拡張時の注意

新しいテンプレートを追加する場合：
1. `templates/` フォルダに `xxx.xlsx` と `xxx.json` を配置
2. exe を再ビルドする必要は**なし**（外部 templates フォルダを参照しているため）
3. 配布パッケージの `templates/` に新ファイルを追加すれば、ユーザー側で再起動するだけで反映される

これは exe 化したけど **templates だけは外部ファイル**として保持する設計の利点。

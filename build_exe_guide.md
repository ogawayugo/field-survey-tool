# 配布用 .exe ビルド指示書

## 目的

`karte-generator/` の Python スクリプトを **PyInstaller で .exe 化**し、
Python が入っていない PC でもダブルクリックで動く配布パッケージを作成する。

最終的な配布物：
```
街路樹カルテ生成ツール_v1.0.zip
├── 街路樹カルテ生成.exe   ← ダブルクリックで起動
├── 使い方.txt              ← 操作説明
└── templates/
    ├── shibuya.xlsx
    └── shibuya.json
```

## 前提

- `karte-generator/` 配下に既に `generate.py`、`generate_gui.py`、`templates/` がある
- Python 3.x が動作している
- pip が使える

---

## ステップ1：PyInstaller のインストール

```powershell
pip install pyinstaller
```

念のため tkinterdnd2（オプションのドラッグ&ドロップ機能）もインストール：

```powershell
pip install tkinterdnd2
```

---

## ステップ2：ビルド設定ファイル（spec）の作成

`karte-generator/` フォルダ内に `karte_generator.spec` を新規作成：

```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['generate_gui.py'],
    pathex=[],
    binaries=[],
    datas=[
        # generate.py を data として含める（generate_gui.py が import するため）
        ('generate.py', '.'),
    ],
    hiddenimports=[
        'openpyxl',
        'PIL',
        'PIL.Image',
        'tkinter',
        'tkinter.ttk',
        'tkinter.filedialog',
        'tkinter.messagebox',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# tkinterdnd2 が利用可能なら追加
try:
    import tkinterdnd2
    import os
    tkdnd_path = os.path.dirname(tkinterdnd2.__file__)
    a.datas += [
        (os.path.join('tkinterdnd2', 'tkdnd'),
         os.path.join(tkdnd_path, 'tkdnd'),
         'DATA'),
    ]
    a.hiddenimports.append('tkinterdnd2')
except ImportError:
    pass

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='街路樹カルテ生成',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # GUIアプリなのでコンソールは非表示
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon='icon.ico',  # アイコンを使う場合はコメント解除
)
```

---

## ステップ3：ビルド用バッチファイルの作成

`build.bat` を新規作成（ちっこいおっさんがビルド時に使う）：

```bat
@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo  街路樹カルテ生成ツール - ビルド
echo ========================================
echo.

REM 既存のビルド成果物を削除
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

REM PyInstallerでビルド
echo PyInstaller でビルド中...
python -m PyInstaller karte_generator.spec --clean

if errorlevel 1 (
    echo.
    echo ビルドエラーが発生しました。
    pause
    exit /b 1
)

echo.
echo ビルド成功！
echo.

REM 配布パッケージを組み立てる
echo 配布パッケージを作成中...

set DIST_DIR=dist\配布パッケージ
mkdir "%DIST_DIR%"
copy "dist\街路樹カルテ生成.exe" "%DIST_DIR%\"
xcopy /E /I templates "%DIST_DIR%\templates"

REM 使い方ファイルを作成
(
echo 街路樹カルテ生成ツール 使い方
echo ====================================
echo.
echo 【インストール】
echo このフォルダをデスクトップなど好きな場所に置いてください。
echo.
echo 【起動】
echo 「街路樹カルテ生成.exe」をダブルクリックしてください。
echo.
echo 【使い方】
echo 1. 「ファイルを追加」ボタンで JSON ファイルを選択
echo    （複数選択可）
echo.
echo 2. テンプレートを確認（通常はそのままで OK）
echo.
echo 3. 出力ファイル名を確認・変更
echo.
echo 4. 「カルテを生成」ボタンを押す
echo.
echo 5. しばらく待つと「保存先を開きますか？」と聞かれます
echo    「はい」を押すとフォルダが開いて、生成されたカルテが見えます
echo.
echo 【トラブル時】
echo Windows Defender などのセキュリティソフトが警告を出すことがあります。
echo その場合は「詳細情報」→「実行」で起動してください。
echo.
echo 【お問い合わせ】
echo [連絡先を記入]
) > "%DIST_DIR%\使い方.txt"

echo.
echo ========================================
echo  完了！
echo ========================================
echo.
echo 配布パッケージ: %DIST_DIR%
echo.
echo このフォルダ全体を ZIP 圧縮して配布してください。
echo.
pause
```

---

## ステップ4：ビルド実行

```powershell
cd "C:\Users\81804\OneDrive\デスクトップ\field-survey-tool\karte-generator"
.\build.bat
```

または `build.bat` をダブルクリック。

ビルドには 1〜3分かかる。完了すると：

```
karte-generator/
├── build/                       ← ビルドキャッシュ
├── dist/
│   ├── 街路樹カルテ生成.exe    ← 単体実行ファイル
│   └── 配布パッケージ/          ← 配布用フォルダ
│       ├── 街路樹カルテ生成.exe
│       ├── 使い方.txt
│       └── templates/
└── ...
```

---

## ステップ5：動作確認

1. `dist/配布パッケージ/` フォルダ全体を、別の場所（デスクトップなど）にコピー
2. その中の `街路樹カルテ生成.exe` をダブルクリック
3. GUI が起動するか確認
4. JSON ファイル（PWAからエクスポートしたもの）を「ファイルを追加」で読み込み
5. 「カルテを生成」が動作するか確認

---

## ステップ6：配布パッケージの ZIP 化

`dist/配布パッケージ/` フォルダを右クリック → 「ZIP 形式で圧縮」

または PowerShell で：

```powershell
cd "dist"
Compress-Archive -Path "配布パッケージ\*" -DestinationPath "街路樹カルテ生成ツール_v1.0.zip"
```

これで `dist/街路樹カルテ生成ツール_v1.0.zip` が出来上がる。
このZIPを仲間にメール添付・USB・クラウドストレージで渡せば配布完了。

---

## トラブルシューティング想定

### 「ImportError: No module named 'xxx'」エラー

`karte_generator.spec` の `hiddenimports` に該当モジュール名を追加して再ビルド：

```python
hiddenimports=[
    'openpyxl',
    'PIL',
    'xxx',  # ← 追加
],
```

### ビルドは成功するが .exe が起動しない

`console=False` を `console=True` に一時的に変更してビルドし、
コンソールウィンドウが表示されるようにする。
そこに出るエラーメッセージで原因を特定できる。

### .exe のサイズが大きすぎる（100MB以上）

`upx=True` のままで OK（圧縮されている）。
さらに小さくしたい場合は `--exclude-module` で不要なモジュールを除外可能。

### Windows Defender が誤検知

これは PyInstaller 製 .exe ではよくあること。
- 「詳細情報」→「実行」で起動できる
- 配布先に伝える
- 解決には「コード署名証明書」が必要（年間数万円〜）が、個人配布なら不要

### tkinterdnd2 のドラッグ&ドロップが動かない

tkinterdnd2 は exe 化すると配置に注意が必要。
spec ファイルの `datas` に正しく追加されていることを確認。
それでもダメなら、ドラッグ&ドロップは諦めて「ファイルを追加」ボタンだけで運用する選択肢も。

---

## 完了確認

- [ ] `pip install pyinstaller tkinterdnd2` 完了
- [ ] `karte_generator.spec` 作成
- [ ] `build.bat` 作成
- [ ] `build.bat` 実行 → `dist/街路樹カルテ生成.exe` 生成
- [ ] `dist/配布パッケージ/` フォルダが作成され、必要ファイルが揃っている
- [ ] 別の場所にコピーして起動できる（Pythonインストールなしのテストが理想）
- [ ] ZIP 化して配布できる状態

## 補足：将来のアップデート時

- スクリプト修正後、`build.bat` を再実行すれば新しい .exe が生成される
- 配布パッケージのバージョン番号は `build.bat` 内のZIP命名やフォルダ名で管理
- 仲間に「v1.1 が出ました、ZIPを差し替えてください」と連絡

## 補足：Mac 版が必要な場合

Windows でビルドした .exe は Mac では動かない。
Mac 用が必要なら、Mac PC で同じ手順を実行（出力は .app になる）。

ただし、樹木医はだいたい Windows ユーザーなので、Windows .exe だけで足りる場合が多い。

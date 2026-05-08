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

@echo off
chcp 65001 > nul
echo.
echo ========================================
echo  街路樹診断カルテ生成
echo ========================================
echo.

if "%~1"=="" (
    echo 使い方: このバッチファイルにJSONファイルをドラッグ＆ドロップしてください。
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"
python generate.py "%~1"

echo.
pause

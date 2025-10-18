@echo off
setlocal enabledelayedexpansion

REM パスワードリセットファイル作成バッチ（Windows用）

set RESET_FILE_NAME=.admin-password-reset

if "%~1"=="" (
    echo パスワードリセットファイル作成ツール
    echo.
    echo 使用方法:
    echo   create-password-reset-file.bat [新しいパスワード]
    echo.
    echo 例:
    echo   create-password-reset-file.bat MyNewSecurePassword123
    echo.
    pause
    exit /b 0
)

set NEW_PASSWORD=%~1

REM パスワード長チェック（簡易版）
set PWD_LEN=0
set "STR=!NEW_PASSWORD!"
:LEN_LOOP
if defined STR (
    set STR=!STR:~1!
    set /a PWD_LEN+=1
    goto :LEN_LOOP
)

if !PWD_LEN! LSS 6 (
    echo ❌ エラー: パスワードは6文字以上である必要があります
    pause
    exit /b 1
)

REM アプリケーション設定ディレクトリ（Tauri v2のデフォルト）
set APP_CONFIG_DIR=%APPDATA%\com.tauri.dev

REM ディレクトリが存在しない場合は作成
if not exist "%APP_CONFIG_DIR%" (
    echo 📁 ディレクトリを作成: %APP_CONFIG_DIR%
    mkdir "%APP_CONFIG_DIR%"
)

set RESET_FILE_PATH=%APP_CONFIG_DIR%\%RESET_FILE_NAME%

REM リセットファイルを作成
echo %NEW_PASSWORD%> "%RESET_FILE_PATH%"

echo ✅ パスワードリセットファイルを作成しました
echo.
echo 📄 ファイルパス: %RESET_FILE_PATH%
echo 🔑 新しいパスワード: %NEW_PASSWORD%
echo.
echo ⚠️  重要:
echo 1. アプリケーションを起動してください
echo 2. 管理者ログイン画面でリセットボタンをクリックしてください
echo 3. リセット成功後、ファイルは自動的に削除されます
echo.
pause

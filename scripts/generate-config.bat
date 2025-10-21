@echo off
setlocal enabledelayedexpansion

echo.
echo ===========================================
echo  AI-SDK ChatUI config.pkg 生成スクリプト
echo ===========================================
echo.

set OUTPUT_PATH=config.pkg
set /p OUTPUT_PATH=出力ファイルパス (default: config.pkg): 
if "%OUTPUT_PATH%"=="" set OUTPUT_PATH=config.pkg

if exist "%OUTPUT_PATH%" (
  echo.
  choice /m "既存の %OUTPUT_PATH% を上書きしますか?"
  if errorlevel 2 (
    echo 処理を中止しました。
    goto :eof
  )
)

echo.
set /p ORG_COUNT=ホワイトリストに登録する組織IDの件数 (0以上の整数、default:0): 
if "%ORG_COUNT%"=="" set ORG_COUNT=0
for /f "tokens=* delims=0123456789" %%A in ("%ORG_COUNT%") do (
  echo 数値で入力してください。
  goto :eof
)

set ADMIN_PASSWORD_HASH=
echo.
set /p ADMIN_PASSWORD=管理者パスワードをハッシュ化して含めますか? (y/N): 
if /i "%ADMIN_PASSWORD%"=="y" (
  set /p ADMIN_PLAIN=新しい管理者パスワードを入力してください: 
  if "%ADMIN_PLAIN%"=="" (
    echo パスワードが入力されなかったためスキップします。
  ) else (
    set "ADMIN_PLAIN_ESC=%ADMIN_PLAIN:"=\""%"
    for /f %%H in ('powershell -NoProfile -Command "$pass = \"%ADMIN_PLAIN_ESC%\"; $bytes = [Text.Encoding]::UTF8.GetBytes($pass); $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes); ($hash | ForEach-Object { $_.ToString(''x2'') }) -join \"\""') do set ADMIN_PASSWORD_HASH=%%H
  )
)

call :PromptToggle allowWebSearch y
call :PromptToggle allowVectorStore y
call :PromptToggle allowFileUpload y
call :PromptToggle allowChatFileAttachment y

set TEMP_FILE=%OUTPUT_PATH%.tmp
if exist "%TEMP_FILE%" del "%TEMP_FILE%"

(
  echo {
  echo   "version": 1,
  echo   "orgWhitelist": [
) >> "%TEMP_FILE%"

if %ORG_COUNT% gtr 0 (
  for /l %%I in (1,1,%ORG_COUNT%) do (
    echo.
    echo --- 組織 %%I ---
    set ORG_ID=
    set /p ORG_ID=Organization ID (org-xxxx): 
    if "!ORG_ID!"=="" (
      echo org-形式で入力してください。処理を中止します。
      del "%TEMP_FILE%"
      goto :eof
    )
    set ORG_NAME=
    set /p ORG_NAME=Organization Name: 
    set ORG_NOTES=
    set /p ORG_NOTES=Notes (任意): 
    for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-ddTHH:mm:ss\""') do set CURRENT_TIMESTAMP=%%T

    >> "%TEMP_FILE%" echo     {
    >> "%TEMP_FILE%" echo       "id": "org-entry-%%I",
    >> "%TEMP_FILE%" echo       "orgId": "!ORG_ID!",
    >> "%TEMP_FILE%" echo       "orgName": "!ORG_NAME!",
    if not "!ORG_NOTES!"=="" (
      >> "%TEMP_FILE%" echo       "notes": "!ORG_NOTES!",
    )
    >> "%TEMP_FILE%" echo       "addedAt": "!CURRENT_TIMESTAMP!"
    >> "%TEMP_FILE%" echo     }
    if not %%I==%ORG_COUNT% (
      >> "%TEMP_FILE%" echo     ,
    )
  )
)

>> "%TEMP_FILE%" echo   ],

if "!ADMIN_PASSWORD_HASH!"=="" (
  >> "%TEMP_FILE%" echo   "adminPasswordHash": null,
) else (
  >> "%TEMP_FILE%" echo   "adminPasswordHash": "!ADMIN_PASSWORD_HASH!",
)

>> "%TEMP_FILE%" echo   "features": {
>> "%TEMP_FILE%" echo     "allowWebSearch": %allowWebSearch%,
>> "%TEMP_FILE%" echo     "allowVectorStore": %allowVectorStore%,
>> "%TEMP_FILE%" echo     "allowFileUpload": %allowFileUpload%,
>> "%TEMP_FILE%" echo     "allowChatFileAttachment": %allowChatFileAttachment%
>> "%TEMP_FILE%" echo   }
>> "%TEMP_FILE%" echo }

move /y "%TEMP_FILE%" "%OUTPUT_PATH%" >nul
if errorlevel 1 (
  echo ファイルの生成に失敗しました。
) else (
  echo.
  echo ✅ %OUTPUT_PATH% を生成しました。
)
goto :eof

:PromptToggle
set "KEY=%~1"
set "DEFAULT=%~2"
set /p "%KEY%=機能 %KEY% を許可しますか? (y/N): "
set "VALUE=!%KEY%!"
if "!VALUE!"=="" set "VALUE=%DEFAULT%"
if /i "!VALUE!"=="y" (
  set "%KEY%=true"
) else (
  set "%KEY%=false"
)
goto :eof

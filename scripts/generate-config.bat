@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
set NEED_PAUSE=1
if /i "%1"=="/nopause" set NEED_PAUSE=0

echo.
echo ===========================================
echo  AI-SDK ChatUI config.pkg 生成ツール
echo ===========================================
echo.

set OUTPUT_PATH=config.pkg
set /p OUTPUT_PATH=保存先ファイルパス (default: config.pkg): 
if "%OUTPUT_PATH%"=="" set OUTPUT_PATH=config.pkg

if exist "%OUTPUT_PATH%" (
  echo.
  choice /m "%OUTPUT_PATH% を上書きしますか?"
  if errorlevel 2 (
    echo 処理を中止しました。
    call :Finish
  )
)

echo.
set ADMIN_PASSWORD_HASH=
echo.
set /p ADMIN_PASSWORD=管理者パスワードのハッシュ値を含めますか? (Y/n): 
if "%ADMIN_PASSWORD%"=="" set ADMIN_PASSWORD=y
if /i "%ADMIN_PASSWORD%"=="y" (
  set "ADMIN_PLAIN="
  set /p ADMIN_PLAIN=新しい管理者パスワードを入力してください: 
  if "!ADMIN_PLAIN!"=="" (
    echo パスワードが入力されなかったためスキップします。
  ) else (
    set "ADMIN_PLAIN_ESC=!ADMIN_PLAIN:"=\"!"
    for /f %%H in ('powershell -NoProfile -Command "$pass = \"%ADMIN_PLAIN_ESC%\"; $bytes = [Text.Encoding]::UTF8.GetBytes($pass); $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes); ($hash | ForEach-Object { $_.ToString(''x2'') }) -join \"\""') do set "ADMIN_PASSWORD_HASH=%%H"
  )
)

call :PromptToggle allowWebSearch y
call :PromptToggle allowVectorStore y
call :PromptToggle allowFileUpload y
call :PromptToggle allowChatFileAttachment y

set TEMP_FILE=%OUTPUT_PATH%.tmp
if exist "%TEMP_FILE%" del "%TEMP_FILE%"

set ORG_ENTRIES_FILE=%TEMP_FILE%.orgs
if exist "%ORG_ENTRIES_FILE%" del "%ORG_ENTRIES_FILE%"
set /a ORG_COUNT=0

call :CollectOrgEntries

(
  echo {
  echo   "version": 1,
  echo   "orgWhitelist": [
) >> "%TEMP_FILE%"

if %ORG_COUNT% gtr 0 (
  set entryIndex=0
  for /f "usebackq tokens=1,2,3,4 delims=|" %%A in ("%ORG_ENTRIES_FILE%") do (
    set "ENTRY_ID=%%~A"
    set "ENTRY_NAME=%%~B"
    set "ENTRY_NOTES=%%~C"
    set "ENTRY_ADDED_AT=%%~D"
    if "!ENTRY_ADDED_AT!"=="" (
      for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-ddTHH:mm:ss\""') do set ENTRY_ADDED_AT=%%T
    )
    set /a entryIndex+=1
    >> "%TEMP_FILE%" echo     {
  >> "%TEMP_FILE%" echo       "id": "org-entry-!entryIndex!",
  >> "%TEMP_FILE%" echo       "orgId": "!ENTRY_ID!",
  >> "%TEMP_FILE%" echo       "orgName": "!ENTRY_NAME!",
    if not "!ENTRY_NOTES!"=="" (
      >> "%TEMP_FILE%" echo       "notes": "!ENTRY_NOTES!",
    )
  >> "%TEMP_FILE%" echo       "addedAt": "!ENTRY_ADDED_AT!"
    >> "%TEMP_FILE%" echo     }
    if !entryIndex! lss %ORG_COUNT% (
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

if exist "%ORG_ENTRIES_FILE%" del "%ORG_ENTRIES_FILE%"

move /y "%TEMP_FILE%" "%OUTPUT_PATH%" >nul
if errorlevel 1 (
  echo ファイルの生成に失敗しました。
  call :Finish
) else (
  echo.
  echo %OUTPUT_PATH% を生成しました。
  call :Finish
)

:CollectOrgEntries
echo.
set FETCH_CHOICE=
set /p FETCH_CHOICE=OpenAI API から組織IDを取得しますか? (Y/n): 
if "%FETCH_CHOICE%"=="" set FETCH_CHOICE=y
if /i "%FETCH_CHOICE%"=="y" call :FetchOrgIds

:CollectManualLoop
set ADD_CHOICE=
set /p ADD_CHOICE=組織を手動で追加しますか? (Y/n): 
if "%ADD_CHOICE%"=="" set ADD_CHOICE=y
if /i "%ADD_CHOICE%"=="y" (
  call :AddOrgManual
  goto :CollectManualLoop
)
goto :eof

:FetchOrgIds
set PS_API_KEY=
set /p PS_API_KEY=組織ID取得に使用するAPIキーを入力してください: 
if "%PS_API_KEY%"=="" (
  echo Skipping fetch (no API key provided).
  goto :eof
)
set PS_BASE_URL=https://api.openai.com/v1
set INPUT_BASE_URL=
set /p INPUT_BASE_URL=Base URL (default: https://api.openai.com/v1): 
if not "%INPUT_BASE_URL%"=="" set PS_BASE_URL=%INPUT_BASE_URL%

set "PS_API_KEY_ENV=%PS_API_KEY%"
set "PS_BASE_URL_ENV=%PS_BASE_URL%"
set FETCH_FILE=%TEMP_FILE%.fetch
set "PS_COMMAND=$ErrorActionPreference='Stop';"
set "PS_COMMAND=!PS_COMMAND! $headers=@{Authorization='Bearer ' + $Env:PS_API_KEY_ENV};"
set "PS_COMMAND=!PS_COMMAND! $uri=$Env:PS_BASE_URL_ENV.TrimEnd('/') + '/me';"
set "PS_COMMAND=!PS_COMMAND! $response=Invoke-RestMethod -Method Get -Uri $uri -Headers $headers;"
set "PS_COMMAND=!PS_COMMAND! if(-not $response.orgs -or -not $response.orgs.data){ throw 'No organizations found.' }"
set "PS_COMMAND=!PS_COMMAND! $response.orgs.data | ForEach-Object { ($_.id ?? '') + '|' + ($_.name ?? '') }"
powershell -NoProfile -Command "!PS_COMMAND!" > "%FETCH_FILE%" 2> "%FETCH_FILE%.err"

if errorlevel 1 (
  echo 組織情報の取得に失敗しました。詳細:
  type "%FETCH_FILE%.err"
  del "%FETCH_FILE%" >nul 2>&1
  del "%FETCH_FILE%.err" >nul 2>&1
  goto :eof
)
del "%FETCH_FILE%.err" >nul 2>&1

for /f "usebackq tokens=1,2 delims=|" %%A in ("%FETCH_FILE%") do (
  set "FETCHED_ID=%%~A"
  set "FETCHED_NAME=%%~B"
  if "!FETCHED_ID!"=="" (
    echo 空の行をスキップします。
    goto SkipFetchedEntry
  )
  if not "!FETCHED_ID!"=="" (
    echo 取得: !FETCHED_ID! (!FETCHED_NAME!)
    set ADD_ID_CHOICE=
    set /p ADD_ID_CHOICE=この組織を追加しますか? (y/N): 
    if /i "!ADD_ID_CHOICE!"=="y" (
      set "ENTRY_ID=!FETCHED_ID!"
      set "ENTRY_NAME=!FETCHED_NAME!"
      set "ENTRY_NOTES="
      for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-ddTHH:mm:ss\""') do set ENTRY_ADDED_AT=%%T
      call :AddOrgEntry
    )
  )
  :SkipFetchedEntry
  rem continue loop
)
del "%FETCH_FILE%" >nul 2>&1
set PS_API_KEY=
set PS_API_KEY_ENV=
set PS_BASE_URL_ENV=
goto :eof

:AddOrgManual
echo --- 手動入力 ---
set ORG_ID=
set /p ORG_ID=Organization ID (org-xxxx): 
if "%ORG_ID%"=="" (
  echo IDが空のためスキップします。
  goto :eof
)
set ORG_NAME=
set /p ORG_NAME=Organization Name: 
set ORG_NOTES=
set /p ORG_NOTES=Notes (任意): 
set "ENTRY_ID=%ORG_ID%"
set "ENTRY_NAME=%ORG_NAME%"
set "ENTRY_NOTES=%ORG_NOTES%"
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-ddTHH:mm:ss\""') do set ENTRY_ADDED_AT=%%T
call :AddOrgEntry
goto :eof

:AddOrgEntry
set /a ORG_COUNT+=1
set "ENTRY_ID=%ENTRY_ID:|=/%"
set "ENTRY_NAME=%ENTRY_NAME:|=/%"
set "ENTRY_NOTES=%ENTRY_NOTES:|=/%"
set "ENTRY_ID=%ENTRY_ID:"='%"
set "ENTRY_NAME=%ENTRY_NAME:"='%"
set "ENTRY_NOTES=%ENTRY_NOTES:"='%"
if "%ENTRY_NOTES%"=="" (
  >> "%ORG_ENTRIES_FILE%" echo !ENTRY_ID!|!ENTRY_NAME!| |!ENTRY_ADDED_AT!
) else (
  >> "%ORG_ENTRIES_FILE%" echo !ENTRY_ID!|!ENTRY_NAME!|!ENTRY_NOTES!|!ENTRY_ADDED_AT!
)
goto :eof

:PromptToggle
set "KEY=%~1"
set "DEFAULT=%~2"
set /p "%KEY%=Enable %KEY% ? (Y/n): "
if "!%KEY%!"=="" set "%KEY%=y"
set "VALUE=!%KEY%!"
if "!VALUE!"=="" set "VALUE=%DEFAULT%"
if /i "!VALUE!"=="y" (
  set "%KEY%=true"
) else (
  set "%KEY%=false"
)
goto :eof

:Finish
if "%NEED_PAUSE%"=="1" (
  echo.
  pause
)
exit /b

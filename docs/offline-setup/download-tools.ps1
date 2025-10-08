# オフライン環境用インストーラーダウンロードスクリプト
# 実行方法: PowerShellで .\download-tools.ps1 を実行

# 出力先ディレクトリ
$outputDir = "C:\offline-installers"

# ディレクトリ作成
Write-Host "出力先ディレクトリを作成: $outputDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# ダウンロード進行状況の表示設定
$ProgressPreference = 'Continue'

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "オフライン環境用インストーラーダウンロード開始" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

# 1. Node.js のダウンロード
Write-Host "[1/3] Node.js v20.11.0 をダウンロード中..." -ForegroundColor Yellow
$nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
$nodeOutput = "$outputDir\node-v20.11.0-x64.msi"
try {
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeOutput -ErrorAction Stop
    Write-Host "✓ Node.js ダウンロード完了: $nodeOutput" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js ダウンロード失敗: $_" -ForegroundColor Red
}

# 2. Rustup のダウンロード
Write-Host "`n[2/3] Rustup をダウンロード中..." -ForegroundColor Yellow
$rustUrl = "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"
$rustOutput = "$outputDir\rustup-init.exe"
try {
    Invoke-WebRequest -Uri $rustUrl -OutFile $rustOutput -ErrorAction Stop
    Write-Host "✓ Rustup ダウンロード完了: $rustOutput" -ForegroundColor Green
} catch {
    Write-Host "✗ Rustup ダウンロード失敗: $_" -ForegroundColor Red
}

# 3. Visual Studio Build Tools のダウンロードとオフラインレイアウト作成
Write-Host "`n[3/3] Visual Studio Build Tools をダウンロード中..." -ForegroundColor Yellow
$vsUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
$vsOutput = "$outputDir\vs_BuildTools.exe"
try {
    Invoke-WebRequest -Uri $vsUrl -OutFile $vsOutput -ErrorAction Stop
    Write-Host "✓ VS Build Tools ダウンロード完了: $vsOutput" -ForegroundColor Green

    # オフラインレイアウト作成
    Write-Host "`nVS Build Tools のオフラインレイアウトを作成中..." -ForegroundColor Yellow
    Write-Host "※ この処理は30分〜1時間程度かかります。しばらくお待ちください。" -ForegroundColor Cyan

    $vsLayoutPath = "$outputDir\VSBuildTools"
    $vsArgs = @(
        "--layout", $vsLayoutPath,
        "--add", "Microsoft.VisualStudio.Workload.VCTools",
        "--includeRecommended",
        "--lang", "ja-JP",
        "--quiet"
    )

    Start-Process -FilePath $vsOutput -ArgumentList $vsArgs -Wait -NoNewWindow

    if (Test-Path $vsLayoutPath) {
        Write-Host "✓ VS Build Tools オフラインレイアウト作成完了: $vsLayoutPath" -ForegroundColor Green
    } else {
        Write-Host "✗ VS Build Tools オフラインレイアウト作成失敗" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ VS Build Tools 処理失敗: $_" -ForegroundColor Red
}

# 完了メッセージ
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "ダウンロード完了" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`n出力先: $outputDir" -ForegroundColor Cyan
Write-Host "`nダウンロードされたファイル:" -ForegroundColor Cyan
Get-ChildItem -Path $outputDir -Recurse | Select-Object FullName, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB, 2)}} | Format-Table -AutoSize

Write-Host "`n次のステップ:" -ForegroundColor Yellow
Write-Host "1. $outputDir フォルダ全体をUSBメモリ等にコピー" -ForegroundColor White
Write-Host "2. オフライン環境のWindows PCに転送" -ForegroundColor White
Write-Host "3. docs/offline-setup/README.md の手順に従ってインストール" -ForegroundColor White

Write-Host "`nスクリプト終了" -ForegroundColor Green

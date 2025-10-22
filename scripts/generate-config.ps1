param()

function Read-YesNo {
  param(
    [string]$Prompt,
    [bool]$Default = $true
  )

  $suffix = if ($Default) { "[Y/n]" } else { "[y/N]" }
  while ($true) {
    $response = Read-Host "$Prompt $suffix"
    if ([string]::IsNullOrWhiteSpace($response)) {
      return $Default
    }
    switch ($response.ToLower()) {
      "y" { return $true }
      "yes" { return $true }
      "n" { return $false }
      "no" { return $false }
      default { Write-Host "y または n で入力してください。" }
    }
  }
}

function Convert-SecureStringToPlain {
  param(
    [System.Security.SecureString]$SecureString
  )
  if ($null -eq $SecureString) { return "" }
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Get-CurrentTimeIso8601 {
  return (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
}

Write-Host ""
Write-Host "==========================================="
Write-Host " AI-SDK ChatUI config.pkg 生成ツール"
Write-Host "==========================================="
Write-Host ""

$defaultOutput = "config.pkg"
$outputPath = Read-Host "保存先ファイルパス (default: $defaultOutput)"
if ([string]::IsNullOrWhiteSpace($outputPath)) {
  $outputPath = $defaultOutput
}
$resolvedPath = Resolve-Path -LiteralPath $outputPath -ErrorAction SilentlyContinue
if ($resolvedPath) {
  $outputPath = $resolvedPath.Path
}
else {
  $outputPath = Join-Path (Get-Location) $outputPath
}

if (Test-Path $outputPath) {
  if (-not (Read-YesNo "$outputPath を上書きしますか?" $true)) {
    Write-Host "処理を中止しました。"
    exit
  }
}

$includeAdminPassword = Read-YesNo "管理者パスワードのハッシュ値を含めますか?" $true
$adminPasswordHash = $null
if ($includeAdminPassword) {
  $securePassword = Read-Host "新しい管理者パスワードを入力してください" -AsSecureString
  $plainPassword = Convert-SecureStringToPlain $securePassword
  if ([string]::IsNullOrWhiteSpace($plainPassword)) {
    Write-Host "パスワードが入力されなかったためスキップします。"
    $includeAdminPassword = $false
  }
  else {
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($plainPassword)
    $hashBytes = $hasher.ComputeHash($bytes)
    $adminPasswordHash = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""
  }
}

$allowWebSearch = Read-YesNo "Web検索機能を許可しますか?" $true
$allowVectorStore = Read-YesNo "Vector Store を許可しますか?" $true
$allowFileUpload = Read-YesNo "ファイルアップロードを許可しますか?" $true
$allowChatFileAttachment = Read-YesNo "チャットでのファイル添付を許可しますか?" $true

$orgEntries = New-Object System.Collections.ArrayList

function Add-OrganizationEntry {
  param(
    [System.Collections.ArrayList]$Collection,
    [string]$OrgId,
    [string]$OrgName,
    [string]$Notes
  )

  if ([string]::IsNullOrWhiteSpace($OrgId)) {
    return
  }
  $index = $Collection.Count + 1
  $entry = [ordered]@{
    id      = "org-entry-$index"
    orgId   = $OrgId.Trim()
    orgName = $OrgName.Trim()
    addedAt = Get-CurrentTimeIso8601
  }
  if (-not [string]::IsNullOrWhiteSpace($Notes)) {
    $entry.notes = $Notes.Trim()
  }
  [void]$Collection.Add($entry)
}

$fetchOrgs = Read-YesNo "OpenAI API から組織IDを取得しますか?" $true
if ($fetchOrgs) {
  try {
    $secureKey = Read-Host "組織ID取得に使用するAPIキーを入力してください" -AsSecureString
    $apiKey = Convert-SecureStringToPlain $secureKey
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
      throw "APIキーが入力されませんでした。"
    }
    $baseUrl = Read-Host "Base URL (default: https://api.openai.com/v1)"
    if ([string]::IsNullOrWhiteSpace($baseUrl)) {
      $baseUrl = "https://api.openai.com/v1"
    }

    $headers = @{ Authorization = "Bearer $apiKey" }
    $uri = ($baseUrl.TrimEnd('/')) + "/me"
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -ErrorAction Stop
    if (-not $response.orgs -or -not $response.orgs.data) {
      throw "組織情報が見つかりませんでした。"
    }
    foreach ($org in $response.orgs.data) {
      $id = if ($null -eq $org.id) { "" } else { $org.id }
      $name = if ($null -eq $org.name) { "" } else { $org.name }
      if ([string]::IsNullOrWhiteSpace($id)) { continue }
      Write-Host "取得: $id ($name)"
      if (Read-YesNo "この組織を追加しますか?" $true) {
        Add-OrganizationEntry -Collection $orgEntries -OrgId $id -OrgName $name -Notes $null
      }
    }
  }
  catch {
    Write-Warning "組織情報の取得に失敗しました: $_"
  }
}

while (Read-YesNo "組織を手動で追加しますか?" $true) {
  Write-Host "--- 手動入力 ---"
  $manualId = Read-Host "Organization ID (org-xxxx)"
  if ([string]::IsNullOrWhiteSpace($manualId)) {
    Write-Warning "IDが空のためスキップします。"
    continue
  }
  $manualName = Read-Host "Organization Name"
  $manualNotes = Read-Host "Notes (任意)"
  Add-OrganizationEntry -Collection $orgEntries -OrgId $manualId -OrgName $manualName -Notes $manualNotes
}

$config = [ordered]@{
  version        = 1
  orgWhitelist   = $orgEntries
  adminPasswordHash = $null
  features       = [ordered]@{
    allowWebSearch          = $allowWebSearch
    allowVectorStore        = $allowVectorStore
    allowFileUpload         = $allowFileUpload
    allowChatFileAttachment = $allowChatFileAttachment
  }
}

if ($includeAdminPassword -and $adminPasswordHash) {
  $config.adminPasswordHash = $adminPasswordHash
}

$json = $config | ConvertTo-Json -Depth 5

# UTF-8（BOMなし）で保存
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)

Write-Host ""
Write-Host "$outputPath を生成しました（UTF-8）。"

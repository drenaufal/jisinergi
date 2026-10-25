<#
  One-time recovery when the local MariaDB root password is unknown.

  Run from an ADMINISTRATOR PowerShell, in the finance folder:
      powershell -ExecutionPolicy Bypass -File scripts\recover-local-mariadb.ps1

  What it does (and nothing else):
    1. Reads DATABASE_URL from .env.local (must point at this machine).
    2. Writes a temporary init file that creates the database and the app user from that URL.
    3. Points the MariaDB Windows service at that init file for ONE restart (MariaDB runs it at start-up
       with full privileges, authentication stays ON, the root password is NOT changed or read).
    4. Restores the service's original start command and restarts it normally, then deletes the init file.
  The service is restored even if a step fails. Other databases on the server are not touched.
#>
$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this from an Administrator PowerShell (right-click PowerShell > Run as administrator)."
}

$serviceName = "MariaDB"
$root   = Split-Path -Parent $PSScriptRoot
$envRaw = Get-Content (Join-Path $root ".env.local") -Raw
if ($envRaw -notmatch '(?m)^DATABASE_URL=(.+)$') { throw "DATABASE_URL not found in .env.local" }
$uri = [Uri]($Matches[1].Trim())
if ($uri.Host -notin @("127.0.0.1", "localhost", "::1")) { throw "DATABASE_URL points at $($uri.Host), not this machine." }
$user = [Uri]::UnescapeDataString($uri.UserInfo.Split(":")[0])
$pass = [Uri]::UnescapeDataString($uri.UserInfo.Substring($uri.UserInfo.IndexOf(":") + 1))
$db   = $uri.AbsolutePath.TrimStart("/")
$port = if ($uri.Port -gt 0) { $uri.Port } else { 3306 }
foreach ($v in @($user, $db)) { if ($v -notmatch '^[A-Za-z0-9_]+$') { throw "Only letters, digits and _ are allowed in the user and database names." } }
if ($pass -match "['\\]") { throw "The password in .env.local contains a quote or backslash." }

$svc = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
if (-not $svc) { throw "Service '$serviceName' not found." }
$originalPath = $svc.PathName
$serviceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName"
$binDir = Split-Path -Parent ($originalPath -replace '^"([^"]+)".*$', '$1')
$client = Join-Path $binDir "mariadb.exe"
if ($originalPath -notmatch '--defaults-file="?([^"]+my\.ini)"?') { throw "Could not find my.ini in the service command: $originalPath" }
$dataDir = Split-Path -Parent $Matches[1]
$initFile = Join-Path $dataDir "finance-init.sql"
Write-Host "Service command: $originalPath"
Write-Host "Target: $db on 127.0.0.1:$port as $user`n"

$sql = @"
CREATE DATABASE IF NOT EXISTS ``$db`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
"@
foreach ($h in @("localhost", "127.0.0.1", "::1")) {
  $sql += "`nCREATE USER IF NOT EXISTS '$user'@'$h' IDENTIFIED BY '$pass';"
  $sql += "`nALTER USER '$user'@'$h' IDENTIFIED BY '$pass';"
  $sql += "`nGRANT ALL PRIVILEGES ON ``$db``.* TO '$user'@'$h';"
}
$sql += "`nFLUSH PRIVILEGES;`n"

$changed = $false
try {
  Set-Content -Path $initFile -Value $sql -Encoding ASCII
  $withInit = $originalPath -replace '"MariaDB"\s*$', ('"--init-file=' + $initFile + '" "MariaDB"')
  if ($withInit -eq $originalPath) { throw "Unexpected service command format; not changing it." }

  Write-Host "Stopping $serviceName ..."
  Stop-Service $serviceName -Force
  (Get-Service $serviceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60))

  Set-ItemProperty -Path $serviceKey -Name ImagePath -Value $withInit
  $changed = $true
  Write-Host "Starting $serviceName once with the init file ..."
  Start-Service $serviceName
  (Get-Service $serviceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(120))

  $env:MYSQL_PWD = $pass
  $ok = $false
  for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
    & $client -u $user -h 127.0.0.1 --protocol=tcp -P $port $db -e "SELECT 1" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ok = $true } else { Start-Sleep -Seconds 1 }
  }
  Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
  if (-not $ok) { throw "The app user still cannot log in after the init file ran." }
  Write-Host "App user login verified." -ForegroundColor Green
}
finally {
  if ($changed) {
    Write-Host "Restoring the original service command and restarting normally ..."
    Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
    try { (Get-Service $serviceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60)) } catch {}
    Set-ItemProperty -Path $serviceKey -Name ImagePath -Value $originalPath
  }
  Remove-Item $initFile -Force -ErrorAction SilentlyContinue
  if ((Get-Service $serviceName).Status -ne "Running") { Start-Service $serviceName }
  $now = (Get-ItemProperty $serviceKey).ImagePath
  Write-Host ("Service command restored: " + ($now -eq $originalPath))
  Write-Host ("Service status: " + (Get-Service $serviceName).Status)
}
Write-Host "`nDone. Now, in a normal terminal in the finance folder, run:  npm run db:setup-local" -ForegroundColor Green

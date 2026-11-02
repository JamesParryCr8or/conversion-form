<#
.SYNOPSIS
  Walks you through copying every key Vercel needs, one at a time.
  For each key: copies it to your clipboard, you paste it into Vercel, press Enter for the next.
  Values are never printed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\copy-env-all.ps1
#>
[CmdletBinding()]
param(
  [string[]]$Names = @("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "ENCRYPTION_KEY", "AUTH_SECRET", "BLOB_READ_WRITE_TOKEN")
)
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$copyScript = Join-Path $scriptDir "copy-env.ps1"

Write-Host "`nYou'll copy $($Names.Count) values into Vercel (Settings > Environment Variables)." -ForegroundColor Cyan
Write-Host "For each: paste it into Vercel, tick Production and Preview, and tick Sensitive for secrets.`n" -ForegroundColor DarkGray

$done = @(); $skipped = @()
foreach ($name in $Names) {
  Write-Host "--- $name" -ForegroundColor Yellow
  & $copyScript -Name $name
  if ($LASTEXITCODE -ne 0) {
    $skipped += $name
    Write-Host "Skipped $name (see the message above)." -ForegroundColor Red
  } else {
    $done += $name
  }
  if ($name -ne $Names[-1]) {
    Read-Host "Pasted $name into Vercel? Press Enter for the next one" | Out-Null
  }
}

Write-Host "`nFinished. Copied: $($done -join ', ')" -ForegroundColor Green
if ($skipped.Count) { Write-Host "Not copied: $($skipped -join ', ')" -ForegroundColor Red }
Write-Host "Redeploy the project in Vercel afterwards so the new values take effect."

<#
.SYNOPSIS
  Copies one value from .env.local to your clipboard so you can paste it into Vercel.
  The value is never printed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\copy-env.ps1 -Name ENCRYPTION_KEY
  powershell -ExecutionPolicy Bypass -File .\scripts\copy-env.ps1 -Name AUTH_SECRET
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$EnvFile
)
$ErrorActionPreference = "Stop"
if (-not $EnvFile) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $EnvFile = Join-Path (Split-Path -Parent $scriptDir) ".env.local"
}
if (-not (Test-Path $EnvFile)) { Write-Host "Can't find $EnvFile" -ForegroundColor Red; exit 1 }

$value = $null
foreach ($line in Get-Content $EnvFile) {
  if ($line -match "^\s*$([regex]::Escape($Name))\s*=(.*)$") { $value = $Matches[1]; break }
}
if ($null -eq $value) { Write-Host "$Name isn't in .env.local" -ForegroundColor Red; exit 1 }
$value = ($value -replace '\s+#.*$', '').Trim().Trim('"').Trim("'")
if ($value -eq "") { Write-Host "$Name is empty in .env.local" -ForegroundColor Red; exit 1 }

Set-Clipboard -Value $value
Write-Host "Copied $Name to your clipboard ($($value.Length) characters). Paste it into Vercel now." -ForegroundColor Green
Write-Host "Tip: in Vercel, tick 'Sensitive' for this variable." -ForegroundColor DarkGray

<#
.SYNOPSIS
  Tests your Turso keys without printing the secret token.

.DESCRIPTION
  Reads TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from .env.local (or from -Url / -Token),
  connects to Turso over HTTPS, and reports:
    - whether the values are well formed (no stray spaces/quotes, token looks right)
    - whether the token is accepted
    - which tables exist, and whether the starter form "lead-gen-starter" is published
  The token is never printed.

.EXAMPLE
  # Test what is in .env.local
  powershell -ExecutionPolicy Bypass -File .\scripts\test-turso.ps1

.EXAMPLE
  # Put the exact, cleaned value on the clipboard so you can paste it into Vercel
  powershell -ExecutionPolicy Bypass -File .\scripts\test-turso.ps1 -Copy Url
  powershell -ExecutionPolicy Bypass -File .\scripts\test-turso.ps1 -Copy Token

.EXAMPLE
  # Test a different pair of values (you will be prompted for the token, input is hidden)
  powershell -ExecutionPolicy Bypass -File .\scripts\test-turso.ps1 -Url "libsql://..." -PromptToken
#>
[CmdletBinding()]
param(
  [string]$EnvFile,
  [string]$Url,
  [string]$Token,
  [switch]$PromptToken,
  [ValidateSet("None", "Url", "Token")][string]$Copy = "None"
)

$ErrorActionPreference = "Stop"
if (-not $EnvFile) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $EnvFile = Join-Path (Split-Path -Parent $scriptDir) ".env.local"
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Ok($m)   { Write-Host "  [ OK ] $m" -ForegroundColor Green }
function Write-Bad($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Write-Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }

# ---- 1. Load values -------------------------------------------------------
function Read-EnvValue($path, $name) {
  if (-not (Test-Path $path)) { return $null }
  foreach ($line in Get-Content $path) {
    if ($line -match "^\s*$name\s*=(.*)$") { return $Matches[1] }
  }
  return $null
}

Write-Host "`nTurso key test" -ForegroundColor Cyan
if (-not $Url)   { $Url   = Read-EnvValue $EnvFile "TURSO_DATABASE_URL" }
if ($PromptToken) {
  $sec = Read-Host "Paste TURSO_AUTH_TOKEN (hidden)" -AsSecureString
  $Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $Token) { $Token = Read-EnvValue $EnvFile "TURSO_AUTH_TOKEN" }

if (-not $Url)   { Write-Bad "TURSO_DATABASE_URL not found in $EnvFile"; exit 1 }
if (-not $Token) { Write-Bad "TURSO_AUTH_TOKEN not found in $EnvFile";    exit 1 }

# ---- 2. Check the values are clean ---------------------------------------
Write-Host "`n1. Format" -ForegroundColor Cyan
$rawUrl = $Url; $rawToken = $Token
$Url = $Url.Trim().Trim('"').Trim("'").Trim()
$Token = $Token.Trim().Trim('"').Trim("'").Trim()

if ($rawUrl -ne $Url)     { Write-Warn "URL had spaces or quotes around it. Cleaned for this test. Paste the cleaned one into Vercel (use -Copy Url)." } else { Write-Ok "URL has no stray spaces or quotes" }
if ($rawToken -ne $Token) { Write-Warn "Token had spaces or quotes around it. Cleaned for this test. Use -Copy Token to paste a clean one." } else { Write-Ok "Token has no stray spaces or quotes" }

if ($Url -notmatch '^libsql://([a-z0-9-]+)\.([a-z0-9-]+\.)?turso\.io/?$') {
  Write-Bad "URL should look like libsql://your-db-yourname.aws-eu-west-1.turso.io"
  exit 1
}
$hostName = ($Url -replace '^libsql://', '').TrimEnd('/')
Write-Ok "URL looks right. Database host: $hostName"

$parts = $Token.Split('.')
if ($parts.Count -ne 3 -or -not $Token.StartsWith("eyJ")) {
  Write-Bad "Token does not look like a Turso token (should start with eyJ and have two dots). Length: $($Token.Length)"
  exit 1
}
Write-Ok "Token looks like a Turso token (length $($Token.Length))"
try {
  $p = $parts[1].Replace('-', '+').Replace('_', '/')
  $p = $p.PadRight($p.Length + (4 - $p.Length % 4) % 4, '=')
  $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json
  if ($claims.a)   { Write-Ok "Token access level: $($claims.a)  (rw = read and write)" }
  if ($claims.exp) { Write-Ok ("Token expires: " + [DateTimeOffset]::FromUnixTimeSeconds([long]$claims.exp).LocalDateTime) } else { Write-Ok "Token has no expiry" }
} catch { Write-Warn "Could not read token details (not a problem by itself)" }

# ---- 3. Clipboard helper --------------------------------------------------
if ($Copy -eq "Url")   { Set-Clipboard -Value $Url;   Write-Ok "Clean URL copied to clipboard. Paste it straight into Vercel." }
if ($Copy -eq "Token") { Set-Clipboard -Value $Token; Write-Ok "Clean token copied to clipboard. Paste it straight into Vercel." }

# ---- 4. Connect -----------------------------------------------------------
Write-Host "`n2. Connection" -ForegroundColor Cyan
function Invoke-Turso([string[]]$sqls) {
  $reqs = @($sqls | ForEach-Object { @{ type = "execute"; stmt = @{ sql = $_ } } }) + @(@{ type = "close" })
  $body = @{ requests = $reqs } | ConvertTo-Json -Depth 6
  Invoke-RestMethod -Method Post -Uri "https://$hostName/v2/pipeline" `
    -Headers @{ Authorization = "Bearer $Token" } -ContentType "application/json" -Body $body
}
function Get-Rows($result) {
  # The leading comma stops PowerShell flattening a single-row result into its cells.
  if ($result.type -eq "ok") { return , @($result.response.result.rows) } else { return , @() }
}
function Get-Cell($cell) { if ($cell.type -eq "null") { $null } else { $cell.value } }

try {
  $r = Invoke-Turso @(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '\_%' escape '\' order by name"
  )
} catch {
  $code = $null
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 401 -or $code -eq 403) { Write-Bad "Turso rejected the token for this database (HTTP $code). Token and URL don't belong together, or the token is revoked/expired." }
  elseif ($code -eq 404) { Write-Bad "Database not found (HTTP 404). Check the URL." }
  else { Write-Bad "Could not reach Turso: $($_.Exception.Message)" }
  exit 1
}
Write-Ok "Connected and authenticated"

# ---- 5. What's in the database -------------------------------------------
Write-Host "`n3. Contents" -ForegroundColor Cyan
$tables = @(); foreach ($row in (Get-Rows $r.results[0])) { $tables += (Get-Cell $row[0]) }
if ($tables.Count -eq 0) {
  Write-Bad "The database is reachable but has NO TABLES. This is an empty database, not 'conversion-form'."
  Write-Host "     If this is what Vercel has, that explains 'no such table: forms'." -ForegroundColor Yellow
  exit 2
}
Write-Ok "$($tables.Count) tables: $($tables -join ', ')"

if ($tables -notcontains "forms") { Write-Bad "No 'forms' table. Run: npm run db:migrate"; exit 2 }
$f = Invoke-Turso @("select slug, status from forms order by slug")
$forms = @(); foreach ($row in (Get-Rows $f.results[0])) { $forms += "$(Get-Cell $row[0]) ($(Get-Cell $row[1]))" }
if ($forms.Count -eq 0) { Write-Bad "'forms' table is empty. Run: npm run db:seed"; exit 2 }
Write-Ok "Forms: $($forms -join ', ')"
if ($forms -contains "lead-gen-starter (published)") {
  Write-Host "`nALL GOOD. These keys point at the right database." -ForegroundColor Green
  Write-Host "Use exactly these values in Vercel (see -Copy Url / -Copy Token), then redeploy.`n"
} else {
  Write-Warn "Starter form 'lead-gen-starter' is not published here. Run: npm run db:seed"
}

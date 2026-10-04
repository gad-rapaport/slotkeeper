#Requires -Version 7.2
<#
.SYNOPSIS
  Slotkeeper local operations. Run from any directory.

.EXAMPLE
  ./scripts/ops.ps1 setup        # create .env with random secrets, build, start, seed
  ./scripts/ops.ps1 start        # start the demo stack (http://127.0.0.1:8103)
  ./scripts/ops.ps1 stop         # stop and remove containers; data volumes are kept
  ./scripts/ops.ps1 status       # containers, health and live resource usage
  ./scripts/ops.ps1 logs app     # last 200 log lines of one service
  ./scripts/ops.ps1 seed         # idempotent demo data load
  ./scripts/ops.ps1 backup       # pg_dump into ./backups
  ./scripts/ops.ps1 restore backups/slotkeeper-20261004-120000.dump -Yes
  ./scripts/ops.ps1 reset-demo -Yes
  ./scripts/ops.ps1 test         # lint, types, unit and integration tests (starts the dev database)
  ./scripts/ops.ps1 dev-db       # start only the development database on 127.0.0.1:54103
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0, Mandatory)]
  [ValidateSet('setup', 'start', 'stop', 'status', 'logs', 'seed', 'backup', 'restore', 'reset-demo', 'test', 'dev-db')]
  [string]$Command,
  [Parameter(Position = 1)]
  [string]$Target,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
$Url = 'http://127.0.0.1:8103'

function Invoke-Checked {
  param([string]$File, [string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function New-Secret([int]$Length = 24) {
  $alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  -join (1..$Length | ForEach-Object { $alphabet[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($alphabet.Length)] })
}

function Get-DotEnv {
  $values = @{}
  if (-not (Test-Path -LiteralPath (Join-Path $Root '.env'))) { throw '.env not found. Run: ./scripts/ops.ps1 setup' }
  foreach ($line in Get-Content -LiteralPath (Join-Path $Root '.env')) {
    if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
  }
  $values
}

function Initialize-DotEnv {
  $envPath = Join-Path $Root '.env'
  if (Test-Path -LiteralPath $envPath) { Write-Host '.env already exists; keeping it.'; return }
  $content = Get-Content -LiteralPath (Join-Path $Root '.env.example') -Raw
  $content = [regex]::Replace($content, 'replace-with-random-value', { New-Secret })
  Set-Content -LiteralPath $envPath -Value $content -Encoding utf8NoBOM
  Write-Host 'Created .env with random passwords. Demo credentials are in .env (SEED_*_PASSWORD).'
}

function Wait-Healthy([int]$TimeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "$Url/readyz" -TimeoutSec 3 -SkipHttpErrorCheck
      if ($r.StatusCode -eq 200) { return }
    } catch { }
    Start-Sleep -Seconds 2
  }
  throw "Slotkeeper did not become ready within $TimeoutSeconds s. Check: ./scripts/ops.ps1 logs app"
}

function Get-BackupDir {
  $dir = Join-Path $Root 'backups'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $dir
}

# Runs a throwaway postgres client container on the stack's internal network with ./backups mounted.
function Invoke-PgTool([string[]]$PgArguments) {
  $envValues = Get-DotEnv
  $backupDir = Get-BackupDir
  Invoke-Checked docker (@('run', '--rm', '--network', 'slotkeeper_backend', '-e', "PGPASSWORD=$($envValues.POSTGRES_PASSWORD)",
      '-v', "${backupDir}:/backup", 'postgres:18') + $PgArguments)
}

switch ($Command) {
  'setup' {
    Initialize-DotEnv
    Invoke-Checked docker @('compose', 'build')
    Invoke-Checked docker @('compose', 'up', '-d', '--wait')
    Invoke-Checked docker @('compose', '--profile', 'tools', 'run', '--rm', 'seed')
    Write-Host "Slotkeeper is running at $Url"
  }
  'start' {
    Invoke-Checked docker @('compose', 'up', '-d', '--wait')
    Wait-Healthy
    Write-Host "Slotkeeper is running at $Url"
  }
  'stop' {
    # `down` without -v: containers and network are removed, the db-data volume is kept.
    Invoke-Checked docker @('compose', 'down')
    Write-Host 'Stopped. Data volume slotkeeper_db-data was kept.'
  }
  'status' {
    Invoke-Checked docker @('compose', 'ps', '--format', 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Ports}}')
    $ids = docker compose ps -q
    if ($ids) { Invoke-Checked docker (@('stats', '--no-stream', '--format', 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}') + $ids) }
  }
  'logs' {
    $services = if ($Target) { @($Target) } else { @() }
    Invoke-Checked docker (@('compose', 'logs', '--tail', '200', '--timestamps') + $services)
  }
  'seed' {
    Invoke-Checked docker @('compose', '--profile', 'tools', 'run', '--rm', 'seed')
  }
  'backup' {
    $name = "slotkeeper-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
    Invoke-PgTool @('pg_dump', '-h', 'db', '-U', 'slotkeeper', '-d', 'slotkeeper', '-Fc', '-f', "/backup/$name")
    $file = Get-Item -LiteralPath (Join-Path (Get-BackupDir) $name)
    Write-Host "Backup written: $($file.FullName) ($([math]::Round($file.Length / 1KB)) KB)"
  }
  'restore' {
    if (-not $Target) { throw 'Usage: ops.ps1 restore <backups/file.dump> -Yes' }
    $file = Get-Item -LiteralPath $Target
    $backupDir = (Resolve-Path -LiteralPath (Get-BackupDir)).Path
    if ($file.DirectoryName -ne $backupDir) { throw "Restore only reads files from $backupDir" }
    if (-not $Yes) { Write-Warning "Restore REPLACES all current Slotkeeper data with $($file.Name). Re-run with -Yes."; exit 2 }
    Invoke-Checked docker @('compose', 'stop', 'app')
    Invoke-PgTool @('pg_restore', '-h', 'db', '-U', 'slotkeeper', '-d', 'slotkeeper', '--clean', '--if-exists', '--no-owner', '--single-transaction', "/backup/$($file.Name)")
    Invoke-Checked docker @('compose', 'start', 'app')
    Wait-Healthy
    Write-Host "Restored $($file.Name)."
  }
  'reset-demo' {
    if (-not $Yes) { Write-Warning 'reset-demo DELETES all Slotkeeper data (users, sites, resources, bookings, logs) and re-seeds it. Re-run with -Yes.'; exit 2 }
    Invoke-Checked docker @('compose', '--profile', 'tools', 'run', '--rm', 'seed', 'dist/server/cli.js', 'reset-demo', '--yes')
  }
  'dev-db' {
    Initialize-DotEnv
    Invoke-Checked docker @('compose', '-f', 'compose.dev.yaml', 'up', '-d', '--wait')
    Write-Host 'Development database on 127.0.0.1:54103'
  }
  'test' {
    Initialize-DotEnv
    Invoke-Checked docker @('compose', '-f', 'compose.dev.yaml', 'up', '-d', '--wait')
    $envValues = Get-DotEnv
    $env:TEST_DATABASE_URL = "postgres://slotkeeper:$($envValues.POSTGRES_PASSWORD)@127.0.0.1:54103/postgres"
    Invoke-Checked npm @('run', 'format:check')
    Invoke-Checked npm @('run', 'lint')
    Invoke-Checked npm @('run', 'typecheck')
    Invoke-Checked npm @('run', 'test:unit')
    Invoke-Checked npm @('run', 'test:integration')
    Write-Host 'All checks passed. E2E: npm run test:e2e (requires the demo stack: ops.ps1 start).'
  }
}

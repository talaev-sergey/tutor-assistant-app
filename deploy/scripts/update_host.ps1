# Update the backend on Windows host
# Run as Administrator
# Usage: .\update_host.ps1 [-ServiceName "classroom-backend"]

param(
    [string] $ServiceName = "classroom-backend",
    [string] $InstallDir  = "C:\classroom"
)

$ErrorActionPreference = "Stop"
Write-Host "==> Updating backend ($ServiceName)"

Set-Location $InstallDir

Write-Host "-> Pull latest code"
git fetch origin
git pull origin (git rev-parse --abbrev-ref HEAD)

Write-Host "-> Install dependencies"
Set-Location backend
uv sync --frozen

Write-Host "-> Apply migrations"
uv run alembic upgrade head
Set-Location ..

Write-Host "-> Restart service"
Restart-Service -Name $ServiceName -Force
Start-Sleep 3

Write-Host "-> Health check"
$svc = Get-Service -Name $ServiceName
if ($svc.Status -eq "Running") {
    Write-Host "✓ Update successful — service is running"
} else {
    Write-Error "Service failed to start after update"
}

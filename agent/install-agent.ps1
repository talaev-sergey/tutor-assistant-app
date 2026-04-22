# Run as Administrator
# Usage: .\install-agent.ps1 -Token "your_token" -BackendUrl "ws://192.168.1.100:8082/ws" -PcName "PC-01"

param(
    [Parameter(Mandatory)] [string] $Token,
    [Parameter(Mandatory)] [string] $BackendUrl,
    [string] $PcName = $env:COMPUTERNAME
)

$InstallDir = "C:\ProgramData\ClassroomAgent"
$ExePath    = "$InstallDir\ClassroomAgent.exe"
$ServiceName = "ClassroomAgent"

Write-Host "Installing ClassroomAgent to $InstallDir"

# Copy files
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path "$PSScriptRoot\publish\*" -Destination $InstallDir -Recurse -Force

# Write appsettings with token and backend URL
$settings = @{
    Agent = @{
        BackendUrl = $BackendUrl
        Token      = $Token
        PcName     = $PcName
    }
    Serilog = @{ MinimumLevel = "Information" }
} | ConvertTo-Json -Depth 3

Set-Content -Path "$InstallDir\appsettings.json" -Value $settings -Encoding UTF8

# Install Windows Service
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "Stopping existing service..."
    Stop-Service -Name $ServiceName -Force
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep 2
}

sc.exe create $ServiceName binPath= "`"$ExePath`"" start= auto obj= LocalSystem DisplayName= "Classroom Agent"
sc.exe description $ServiceName "Classroom PC management agent"
sc.exe failure $ServiceName reset= 60 actions= restart/5000/restart/5000/restart/5000

Start-Service -Name $ServiceName
Write-Host "ClassroomAgent installed and started successfully."
Get-Service -Name $ServiceName

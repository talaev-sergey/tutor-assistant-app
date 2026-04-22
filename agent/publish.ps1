# Build all agent components as single-file self-contained win-x64 executables
# Run from the agent/ directory
# Output: release/ directory ready for distribution

$ErrorActionPreference = "Stop"
$ReleaseDir = "release"

function Publish($project, $outName) {
    $projPath = "$project\$project.csproj"
    $outDir = "$ReleaseDir"
    Write-Host "Building $project..."
    dotnet publish $projPath `
        --configuration Release `
        --runtime win-x64 `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        --output $outDir `
        --nologo -v quiet
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $project" }
    Write-Host "  -> $outDir\$outName"
}

Remove-Item -Recurse -Force $ReleaseDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

Publish "ClassroomAgent"   "ClassroomAgent.exe"
Publish "ClassroomUpdater" "ClassroomUpdater.exe"
Publish "ClassroomInstaller" "ClassroomSetup.exe"

Write-Host ""
Write-Host "=== Release build complete ===" -ForegroundColor Green
Write-Host "Files in .\$ReleaseDir\:"
Get-ChildItem $ReleaseDir -Filter "*.exe" | ForEach-Object {
    Write-Host ("  {0,-30} {1,8} KB" -f $_.Name, [math]::Round($_.Length / 1024))
}
Write-Host ""
Write-Host "To install on a school PC: copy release\ to the PC, run ClassroomSetup.exe as Administrator"

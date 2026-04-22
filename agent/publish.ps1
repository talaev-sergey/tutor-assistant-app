# Build and publish ClassroomAgent as single-file self-contained executable
# Run from the agent/ directory

$Project = "ClassroomAgent\ClassroomAgent.csproj"
$OutputDir = "ClassroomAgent\publish"

Write-Host "Building ClassroomAgent..."

dotnet publish $Project `
    --configuration Release `
    --runtime win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    --output $OutputDir

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful: $OutputDir\ClassroomAgent.exe"
} else {
    Write-Error "Build failed"
    exit 1
}

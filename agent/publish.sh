#!/usr/bin/env bash
# Build all agent components from Linux, cross-compile for win-x64.
# Run from the agent/ directory: ./publish.sh
set -euo pipefail

RELEASE_DIR="release"
RUNTIME="win-x64"
FLAGS="--configuration Release --runtime $RUNTIME --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true --output $RELEASE_DIR --nologo -v quiet"

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "Building ClassroomAgent..."
dotnet publish ClassroomAgent/ClassroomAgent.csproj $FLAGS

echo "Building ClassroomUpdater..."
dotnet publish ClassroomUpdater/ClassroomUpdater.csproj $FLAGS

echo "Building ClassroomInstaller..."
dotnet publish ClassroomInstaller/ClassroomInstaller.csproj $FLAGS

# Bundle Bonjour installer if present next to publish.sh
if [ -f "BonjourSetup.exe" ]; then
    cp BonjourSetup.exe "$RELEASE_DIR/"
    echo "Bundled BonjourSetup.exe"
else
    echo "BonjourSetup.exe not found — installer will download it at runtime"
fi

echo ""
echo "=== Release build complete ==="
printf "  %-30s %8s MB\n" "ClassroomAgent.exe"   "$(du -m $RELEASE_DIR/ClassroomAgent.exe  | cut -f1)"
printf "  %-30s %8s MB\n" "ClassroomUpdater.exe"  "$(du -m $RELEASE_DIR/ClassroomUpdater.exe | cut -f1)"
printf "  %-30s %8s MB\n" "ClassroomSetup.exe"    "$(du -m $RELEASE_DIR/ClassroomSetup.exe   | cut -f1)"
echo ""
echo "Copy release/ to a Windows PC and run ClassroomSetup.exe as Administrator"

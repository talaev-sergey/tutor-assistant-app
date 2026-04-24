#!/usr/bin/env bash
# Build all agent components from Linux, cross-compile for win-x64.
# Usage: ./publish.sh <version>   e.g. ./publish.sh 1.2.0
set -euo pipefail

VERSION=${1:-""}
if [ -z "$VERSION" ]; then
    echo "Usage: ./publish.sh <version>  (e.g. ./publish.sh 1.2.0)"
    exit 1
fi

RELEASE_DIR="release"
RUNTIME="win-x64"
VER_FLAGS="-p:Version=$VERSION -p:AssemblyVersion=$VERSION.0 -p:FileVersion=$VERSION.0"
FLAGS="--configuration Release --runtime $RUNTIME --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true --output $RELEASE_DIR --nologo -v quiet $VER_FLAGS"

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "Building ClassroomAgent..."
dotnet publish ClassroomAgent/ClassroomAgent.csproj $FLAGS

echo "Building ClassroomUpdater..."
dotnet publish ClassroomUpdater/ClassroomUpdater.csproj $FLAGS

echo "Building ClassroomInstaller..."
dotnet publish ClassroomInstaller/ClassroomInstaller.csproj $FLAGS

echo ""
echo "=== Release build complete ==="
printf "  %-30s %8s MB\n" "ClassroomAgent.exe"   "$(du -m $RELEASE_DIR/ClassroomAgent.exe  | cut -f1)"
printf "  %-30s %8s MB\n" "ClassroomUpdater.exe"  "$(du -m $RELEASE_DIR/ClassroomUpdater.exe | cut -f1)"
printf "  %-30s %8s MB\n" "ClassroomSetup.exe"    "$(du -m $RELEASE_DIR/ClassroomSetup.exe   | cut -f1)"
echo ""
echo "Copy release/ to a Windows PC and run ClassroomSetup.exe as Administrator"

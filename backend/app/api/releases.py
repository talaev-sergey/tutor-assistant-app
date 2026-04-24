import hashlib
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import select

from ..database import get_session
from ..middleware.auth import get_current_user
from ..models import AgentRelease, User

router = APIRouter()

RELEASES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "releases"


class ReleaseResponse(BaseModel):
    id: int
    version: str
    channel: str
    sha256: str
    file_size: int | None
    released_at: datetime
    is_active: bool
    download_url: str


@router.post("", status_code=201, response_model=ReleaseResponse)
async def upload_release(
    request: Request,
    version: str = Form(...),
    channel: str = Form("stable"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    content = await file.read()
    sha256 = hashlib.sha256(content).hexdigest()

    RELEASES_DIR.mkdir(exist_ok=True)
    filename = f"ClassroomAgent_v{version}.exe"
    (RELEASES_DIR / filename).write_bytes(content)

    with get_session() as session:
        # Deactivate previous releases on this channel
        old = session.exec(
            select(AgentRelease).where(AgentRelease.channel == channel, AgentRelease.is_active == True)
        ).all()
        for r in old:
            r.is_active = False
            session.add(r)

        release = AgentRelease(
            version=version,
            channel=channel,
            download_url="",
            sha256=sha256,
            signature="",
            released_by=current_user.id,
        )
        session.add(release)
        session.commit()
        session.refresh(release)

        base = str(request.base_url).rstrip("/")
        release.download_url = f"{base}/api/releases/{release.id}/download"
        session.add(release)
        session.commit()
        session.refresh(release)

        return ReleaseResponse(
            id=release.id,
            version=release.version,
            channel=release.channel,
            sha256=release.sha256,
            file_size=len(content),
            released_at=release.released_at,
            is_active=release.is_active,
            download_url=release.download_url,
        )


@router.get("", response_model=list[ReleaseResponse])
async def list_releases(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    with get_session() as session:
        releases = session.exec(
            select(AgentRelease).order_by(AgentRelease.released_at.desc())
        ).all()
        result = []
        for r in releases:
            filename = f"ClassroomAgent_v{r.version}.exe"
            path = RELEASES_DIR / filename
            size = path.stat().st_size if path.exists() else None
            result.append(ReleaseResponse(
                id=r.id,
                version=r.version,
                channel=r.channel,
                sha256=r.sha256,
                file_size=size,
                released_at=r.released_at,
                is_active=r.is_active,
                download_url=r.download_url,
            ))
        return result


@router.get("/{release_id}/download")
async def download_release(release_id: int):
    with get_session() as session:
        release = session.get(AgentRelease, release_id)
        if not release:
            raise HTTPException(status_code=404, detail="Not found")
        filename = f"ClassroomAgent_v{release.version}.exe"
        path = RELEASES_DIR / filename
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found on server")
        return FileResponse(str(path), filename=filename, media_type="application/octet-stream")


@router.delete("/{release_id}", status_code=204)
async def deactivate_release(
    release_id: int,
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    with get_session() as session:
        release = session.get(AgentRelease, release_id)
        if not release:
            raise HTTPException(status_code=404, detail="Not found")
        release.is_active = False
        session.add(release)
        session.commit()

import io
import os
import sqlite3
import tempfile
import zipfile
from datetime import date

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from database.connection import DB_PATH, APP_DATA_DIR

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.get("/download")
def backup_download():
    """Vollständiges Backup als ZIP: WAL-sicherer DB-Snapshot + Uploads-Ordner."""
    datum = date.today().strftime("%Y-%m-%d")
    filename = f"RechnungsFee-Backup-{datum}.zip"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # DB: WAL-sicherer Snapshot
        fd, tmp = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            src = sqlite3.connect(str(DB_PATH))
            dst = sqlite3.connect(tmp)
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
            zf.write(tmp, "rechnungsfee.db")
        finally:
            os.unlink(tmp)

        # Uploads: Belege, PDFs, Scans
        uploads_dir = APP_DATA_DIR / "uploads"
        if uploads_dir.exists():
            for f in sorted(uploads_dir.rglob("*")):
                if f.is_file():
                    zf.write(f, f"uploads/{f.relative_to(uploads_dir)}")

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

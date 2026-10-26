import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from app.sftp_manager import sftp_manager

router = APIRouter(prefix="/api/sftp", tags=["sftp"])

@router.get("/list")
def list_directory(host_id: str = Query(...), path: str = Query(".")):
    try:
        return sftp_manager.list_dir(host_id, path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP List failed: {e}")

@router.post("/mkdir")
def make_directory(host_id: str = Form(...), path: str = Form(...)):
    try:
        sftp_manager.create_directory(host_id, path)
        return {"success": True, "message": f"Created directory {path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP mkdir failed: {e}")

@router.post("/delete")
def delete_item(host_id: str = Form(...), path: str = Form(...), is_dir: bool = Form(False)):
    try:
        sftp_manager.remove_file(host_id, path, is_dir=is_dir)
        return {"success": True, "message": f"Deleted {path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP delete failed: {e}")

@router.post("/rename")
def rename_item(host_id: str = Form(...), old_path: str = Form(...), new_path: str = Form(...)):
    try:
        sftp_manager.rename_file(host_id, old_path, new_path)
        return {"success": True, "message": f"Renamed to {new_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP rename failed: {e}")

@router.post("/upload")
async def upload_file(
    host_id: str = Form(...),
    remote_path: str = Form(...),
    file: UploadFile = File(...)
):
    try:
        # Stream file to SFTP
        content = await file.read()
        file_obj = io.BytesIO(content)
        sftp_manager.upload_file(host_id, remote_path, file_obj)
        return {"success": True, "message": f"Uploaded {file.filename} to {remote_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP upload failed: {e}")

@router.get("/download")
def download_file(host_id: str = Query(...), path: str = Query(...)):
    try:
        buf = io.BytesIO()
        sftp_manager.download_file(host_id, path, buf)
        buf.seek(0)
        filename = path.rstrip("/").split("/")[-1] or "download.bin"
        return StreamingResponse(
            buf,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP download failed: {e}")

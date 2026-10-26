import json
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from app.storage import storage

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("")
def get_settings():
    return storage.get_settings()

@router.post("")
def update_settings(settings: dict):
    updated = storage.update_settings(settings)
    return {"success": True, "settings": updated}

@router.get("/export")
def export_vault():
    """Exports raw JSON database for backup/portability."""
    return JSONResponse(
        content=storage.data,
        headers={"Content-Disposition": 'attachment; filename="termius_vault_backup.json"'}
    )

@router.post("/import")
async def import_vault(file: UploadFile = File(...)):
    try:
        content = await file.read()
        loaded = json.loads(content.decode("utf-8"))
        if "hosts" not in loaded and "snippets" not in loaded:
            raise HTTPException(status_code=400, detail="Invalid vault backup JSON format")
        storage.data.update(loaded)
        storage.save()
        return {"success": True, "message": "Vault successfully imported"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to import vault: {e}")

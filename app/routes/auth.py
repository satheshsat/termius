from fastapi import APIRouter, HTTPException
from app.crypto import crypto_vault
from app.storage import storage
from app.models import MasterPasswordSetup, MasterPasswordVerify, MasterPasswordChange

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.get("/status")
def get_auth_status():
    has_pwd = storage.has_master_password()
    return {
        "has_master_password": has_pwd,
        "is_unlocked": crypto_vault.is_unlocked if has_pwd else True,
    }

@router.post("/setup")
def setup_password(data: MasterPasswordSetup):
    if storage.has_master_password():
        raise HTTPException(status_code=400, detail="Master password is already configured")
    if not data.password or len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Master password must be at least 4 characters")
    storage.setup_master_password(data.password)
    return {"success": True, "message": "Master password initialized"}

@router.post("/unlock")
def unlock_vault(data: MasterPasswordVerify):
    if not storage.has_master_password():
        return {"success": True, "message": "No master password set"}
    if storage.verify_and_unlock(data.password):
        return {"success": True, "message": "Vault successfully unlocked"}
    raise HTTPException(status_code=401, detail="Incorrect master password")

@router.post("/lock")
def lock_vault():
    crypto_vault.lock()
    return {"success": True, "message": "Vault locked"}

@router.post("/change-password")
def change_password(data: MasterPasswordChange):
    if not storage.has_master_password():
        raise HTTPException(status_code=400, detail="No master password configured yet")
    if not storage.verify_and_unlock(data.old_password):
        raise HTTPException(status_code=401, detail="Old master password incorrect")
    if not data.new_password or len(data.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")

    # Re-initialize vault crypto
    storage.setup_master_password(data.new_password)
    return {"success": True, "message": "Master password updated"}

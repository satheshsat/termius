from fastapi import APIRouter, HTTPException
from app.storage import storage
from app.models import SSHKeyItem, GenerateKeyRequest
from app.key_generator import generate_ssh_keypair

router = APIRouter(prefix="/api/keys", tags=["keys"])

@router.get("")
def list_keys():
    return storage.get_keys()

@router.post("")
def create_key(key_item: SSHKeyItem):
    created = storage.add_key(key_item)
    return {"success": True, "key": created}

@router.post("/generate")
def generate_key(req: GenerateKeyRequest):
    try:
        public_key, private_pem, fingerprint = generate_ssh_keypair(
            key_type=req.key_type,
            bits=req.bits,
            passphrase=req.passphrase
        )
        item = SSHKeyItem(
            name=req.name,
            key_type=req.key_type,
            public_key=public_key,
            private_key=private_pem,
            passphrase=req.passphrase,
            fingerprint=fingerprint,
        )
        saved = storage.add_key(item)
        return {
            "success": True,
            "key": saved,
            "public_key": public_key,
            "fingerprint": fingerprint
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate key: {e}")

@router.get("/{key_id}/public")
def get_public_key(key_id: str):
    raw = storage.get_raw_key(key_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Key not found")
    return {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "public_key": raw.get("public_key")
    }

@router.delete("/{key_id}")
def delete_key(key_id: str):
    deleted = storage.delete_key(key_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"success": True}

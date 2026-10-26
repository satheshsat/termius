from fastapi import APIRouter, HTTPException
from typing import Optional
from app.storage import storage
from app.models import HostItem
from app.ssh_manager import ssh_manager

router = APIRouter(prefix="/api/hosts", tags=["hosts"])

@router.get("")
def list_hosts(group: Optional[str] = None, tag: Optional[str] = None):
    hosts = storage.get_hosts()
    if group:
        hosts = [h for h in hosts if h.get("group") == group]
    if tag:
        hosts = [h for h in hosts if tag in h.get("tags", [])]
    return hosts

@router.post("")
def create_host(host: HostItem):
    created = storage.add_host(host)
    return {"success": True, "host": created}

@router.get("/{host_id}")
def get_host(host_id: str):
    host = storage.get_raw_host(host_id)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    # Mask password
    sanitized = dict(host)
    sanitized["has_password"] = bool(sanitized.get("password_encrypted"))
    sanitized["has_passphrase"] = bool(sanitized.get("passphrase_encrypted"))
    sanitized.pop("password_encrypted", None)
    sanitized.pop("passphrase_encrypted", None)
    return sanitized

@router.put("/{host_id}")
def update_host(host_id: str, host: HostItem):
    updated = storage.update_host(host_id, host)
    if not updated:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"success": True, "host": updated}

@router.delete("/{host_id}")
def delete_host(host_id: str):
    deleted = storage.delete_host(host_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Host not found")
    return {"success": True}

@router.post("/{host_id}/test")
def test_host_connection(host_id: str):
    result = ssh_manager.test_connection(host_id)
    return result

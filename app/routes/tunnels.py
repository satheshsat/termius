from fastapi import APIRouter, HTTPException
from app.storage import storage
from app.models import TunnelItem
from app.tunnel_manager import tunnel_manager

router = APIRouter(prefix="/api/tunnels", tags=["tunnels"])

@router.get("")
def list_tunnels():
    tunnels = storage.get_tunnels()
    for t in tunnels:
        t["status"] = tunnel_manager.get_status(t["id"])
    return tunnels

@router.post("")
def create_tunnel(tunnel: TunnelItem):
    created = storage.add_tunnel(tunnel)
    return {"success": True, "tunnel": created}

@router.put("/{tunnel_id}")
def update_tunnel(tunnel_id: str, tunnel: TunnelItem):
    # Stop if running before updating
    if tunnel_manager.get_status(tunnel_id) == "running":
        tunnel_manager.stop_tunnel(tunnel_id)
    updated = storage.update_tunnel(tunnel_id, tunnel)
    if not updated:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    return {"success": True, "tunnel": updated}

@router.delete("/{tunnel_id}")
def delete_tunnel(tunnel_id: str):
    tunnel_manager.stop_tunnel(tunnel_id)
    deleted = storage.delete_tunnel(tunnel_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    return {"success": True}

@router.post("/{tunnel_id}/start")
def start_tunnel(tunnel_id: str):
    try:
        res = tunnel_manager.start_tunnel(tunnel_id)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{tunnel_id}/stop")
def stop_tunnel(tunnel_id: str):
    res = tunnel_manager.stop_tunnel(tunnel_id)
    return res

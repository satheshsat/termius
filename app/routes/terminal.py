from fastapi import APIRouter, WebSocket, Query
from app.ssh_manager import ssh_manager

router = APIRouter(tags=["terminal"])

@router.websocket("/ws/terminal/{host_id}")
async def websocket_terminal_endpoint(
    websocket: WebSocket,
    host_id: str,
    cols: int = Query(100),
    rows: int = 30
):
    await ssh_manager.handle_terminal_session(websocket, host_id, cols, rows)

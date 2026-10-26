import os
import sys
import webbrowser
import threading
import argparse
from pathlib import Path
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from app.routes.auth import router as auth_router
from app.routes.hosts import router as hosts_router
from app.routes.keys import router as keys_router
from app.routes.snippets import router as snippets_router
from app.routes.tunnels import router as tunnels_router
from app.routes.sftp import router as sftp_router
from app.routes.terminal import router as terminal_router
from app.routes.settings import router as settings_router

app = FastAPI(
    title="Termius Clone",
    description="Sleek SSH Client, Terminal Manager & Vault persisted in JSON",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router)
app.include_router(hosts_router)
app.include_router(keys_router)
app.include_router(snippets_router)
app.include_router(tunnels_router)
app.include_router(sftp_router)
app.include_router(terminal_router)
app.include_router(settings_router)

# Static files directory
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
(STATIC_DIR / "css").mkdir(exist_ok=True)
(STATIC_DIR / "js").mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.api_route("/", methods=["GET", "HEAD"])
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "Termius Clone Backend is running. Frontend index.html loading..."}

import socket

def is_port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
        except OSError:
            return False

def find_available_port(host: str, start_port: int, max_attempts: int = 50) -> int:
    for port in range(start_port, start_port + max_attempts):
        if is_port_available(host, port):
            return port
    return start_port

def open_browser_delayed(url: str):
    def _open():
        import time
        time.sleep(1.2)
        try:
            webbrowser.open(url)
        except Exception:
            pass
    threading.Thread(target=_open, daemon=True).start()

def main():
    parser = argparse.ArgumentParser(description="Termius Clone - Modern SSH & Terminal Client")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind server (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8888, help="Port to bind server (default: 8888)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload on code changes")
    args = parser.parse_args()

    # Automatically check port availability
    target_port = args.port
    if not is_port_available(args.host, target_port):
        new_port = find_available_port(args.host, target_port + 1)
        print(f"⚠️ Port {target_port} is already in use. Switching to available port: {new_port}")
        target_port = new_port

    url = f"http://{args.host}:{target_port}"
    print("=" * 65)
    print(f"🚀 Termius Clone is launching at: {url}")
    print("📁 Data vault: termius_vault.json")
    print("=" * 65)

    if not args.no_browser:
        open_browser_delayed(url)

    uvicorn.run("main:app", host=args.host, port=target_port, reload=args.reload, log_level="info")

if __name__ == "__main__":
    main()

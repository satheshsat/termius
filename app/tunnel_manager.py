import select
import socket
import socketserver
import threading
from typing import Dict, Any, Optional
from app.ssh_manager import ssh_manager
from app.storage import storage

class ForwardServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True

class ForwardHandler(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            chan = self.ssh_transport.open_channel(
                "direct-tcpip",
                (self.chain_host, self.chain_port),
                self.request.getpeername(),
            )
        except Exception as e:
            print(f"[Tunnel] Incoming request to {self.chain_host}:{self.chain_port} failed: {e}")
            return

        if chan is None:
            return

        while True:
            r, w, x = select.select([self.request, chan], [], [], 2.0)
            if self.request in r:
                data = self.request.recv(1024)
                if len(data) == 0:
                    break
                chan.send(data)
            if chan in r:
                data = chan.recv(1024)
                if len(data) == 0:
                    break
                self.request.send(data)

        chan.close()
        self.request.close()

class TunnelManager:
    def __init__(self):
        # tunnel_id -> {"server": server, "thread": thread, "client": ssh_client}
        self.active_tunnels: Dict[str, Dict[str, Any]] = {}

    def start_tunnel(self, tunnel_id: str) -> Dict[str, Any]:
        if tunnel_id in self.active_tunnels:
            return {"success": True, "message": "Tunnel is already running"}

        # Find tunnel configuration
        tunnels = storage.get_tunnels()
        tunnel_conf = next((t for t in tunnels if t["id"] == tunnel_id), None)
        if not tunnel_conf:
            raise ValueError(f"Tunnel {tunnel_id} not found")

        host_id = tunnel_conf["host_id"]
        local_port = int(tunnel_conf["local_port"])
        remote_host = tunnel_conf["remote_host"]
        remote_port = int(tunnel_conf["remote_port"])

        client, host = ssh_manager.build_ssh_client(host_id)
        transport = client.get_transport()

        class SubHandler(ForwardHandler):
            chain_host = remote_host
            chain_port = remote_port
            ssh_transport = transport

        try:
            server = ForwardServer(("127.0.0.1", local_port), SubHandler)
        except Exception as e:
            client.close()
            raise RuntimeError(f"Could not bind to local port {local_port}: {e}")

        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        self.active_tunnels[tunnel_id] = {
            "server": server,
            "thread": server_thread,
            "client": client,
        }

        # Update status in storage
        tunnel_conf["status"] = "running"
        storage.update_tunnel(tunnel_id, tunnel_conf)

        return {
            "success": True,
            "message": f"Forwarding localhost:{local_port} -> {remote_host}:{remote_port} via {host.get('label', host.get('hostname'))}"
        }

    def stop_tunnel(self, tunnel_id: str) -> Dict[str, Any]:
        info = self.active_tunnels.pop(tunnel_id, None)
        if not info:
            # Update status in storage if needed
            tunnels = storage.get_tunnels()
            tunnel_conf = next((t for t in tunnels if t["id"] == tunnel_id), None)
            if tunnel_conf:
                tunnel_conf["status"] = "stopped"
                storage.update_tunnel(tunnel_id, tunnel_conf)
            return {"success": True, "message": "Tunnel was not running"}

        try:
            info["server"].shutdown()
            info["server"].server_close()
        except Exception:
            pass

        try:
            info["client"].close()
        except Exception:
            pass

        tunnels = storage.get_tunnels()
        tunnel_conf = next((t for t in tunnels if t["id"] == tunnel_id), None)
        if tunnel_conf:
            tunnel_conf["status"] = "stopped"
            storage.update_tunnel(tunnel_id, tunnel_conf)

        return {"success": True, "message": "Tunnel stopped"}

    def get_status(self, tunnel_id: str) -> str:
        return "running" if tunnel_id in self.active_tunnels else "stopped"

tunnel_manager = TunnelManager()

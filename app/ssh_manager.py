import io
import time
import asyncio
import threading
from typing import Optional, Dict, Any, Tuple
import paramiko
from fastapi import WebSocket, WebSocketDisconnect
from app.models import HostItem
from app.storage import storage

class SSHConnectionManager:
    def __init__(self):
        # Active sessions: session_id -> {client, channel, thread, active}
        self.active_sessions: Dict[str, Dict[str, Any]] = {}

    def _parse_private_key(self, key_text: str, passphrase: Optional[str] = None):
        """Try parsing RSA, Ed25519, or ECDSA private key."""
        errors = []
        for key_class in [paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey]:
            try:
                buf = io.StringIO(key_text)
                return key_class.from_private_key(buf, password=passphrase)
            except Exception as e:
                errors.append(str(e))
        raise ValueError(f"Could not load private key: {'; '.join(errors)}")

    def build_ssh_client(self, host_id: str) -> Tuple[paramiko.SSHClient, Dict[str, Any]]:
        raw_host = storage.get_raw_host(host_id)
        if not raw_host:
            raise ValueError(f"Host '{host_id}' not found")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        hostname = raw_host.get("hostname")
        port = int(raw_host.get("port", 22))
        username = raw_host.get("username", "root")
        auth_type = raw_host.get("auth_type", "password")

        creds = storage.get_decrypted_host_credentials(host_id)
        connect_kwargs = {
            "hostname": hostname,
            "port": port,
            "username": username,
            "timeout": 15,
            "banner_timeout": 15,
            "allow_agent": True,
            "look_for_keys": False,
        }

        if auth_type == "password":
            connect_kwargs["password"] = creds.get("password")
        elif auth_type == "key":
            key_id = raw_host.get("key_id")
            if not key_id:
                raise ValueError("No SSH Key selected for this host")
            key_data = storage.get_decrypted_key(key_id)
            if not key_data.get("private_key"):
                raise ValueError("SSH Key has no private key stored")
            
            passphrase = creds.get("passphrase") or key_data.get("passphrase")
            pkey = self._parse_private_key(key_data["private_key"], passphrase)
            connect_kwargs["pkey"] = pkey
        elif auth_type == "agent":
            connect_kwargs["allow_agent"] = True
            connect_kwargs["look_for_keys"] = True

        client.connect(**connect_kwargs)
        # Enable TCP keepalive
        transport = client.get_transport()
        if transport:
            transport.set_keepalive(30)
            
        return client, raw_host

    def test_connection(self, host_id: str) -> Dict[str, Any]:
        """Test SSH connection and measure roundtrip handshake latency."""
        start = time.time()
        client = None
        try:
            client, host = self.build_ssh_client(host_id)
            latency_ms = round((time.time() - start) * 1000, 1)
            # Execute a fast command to ensure session channel works
            stdin, stdout, stderr = client.exec_command("echo OK", timeout=5)
            res = stdout.read().decode("utf-8").strip()
            return {
                "success": True,
                "latency_ms": latency_ms,
                "message": f"Successfully connected to {host.get('hostname')}:{host.get('port')} ({latency_ms}ms)"
            }
        except Exception as e:
            return {
                "success": False,
                "latency_ms": None,
                "message": str(e)
            }
        finally:
            if client:
                try:
                    client.close()
                except Exception:
                    pass

    async def handle_terminal_session(
        self,
        websocket: WebSocket,
        host_id: str,
        cols: int = 80,
        rows: int = 24
    ):
        await websocket.accept()
        client = None
        channel = None
        loop = asyncio.get_running_loop()

        try:
            await websocket.send_json({
                "type": "status",
                "message": "Initiating SSH handshake..."
            })

            # Run blocking connect in threadpool
            client, host = await loop.run_in_executor(None, self.build_ssh_client, host_id)

            await websocket.send_json({
                "type": "status",
                "message": f"Connected to {host.get('label', host.get('hostname'))}. Spawning PTY..."
            })

            channel = client.invoke_shell(
                term="xterm-256color",
                width=cols,
                height=rows
            )
            channel.settimeout(0.0)

            # Update host last_connected timestamp
            updated_host = dict(host)
            updated_host["last_connected"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            storage.update_host(host_id, updated_host)

            is_running = True

            # Task 1: Read from SSH channel and send to WebSocket
            async def ssh_to_ws():
                while is_running:
                    try:
                        # Check if channel has data without blocking the event loop
                        has_data = await loop.run_in_executor(None, lambda: channel.recv_ready())
                        if has_data:
                            data = await loop.run_in_executor(None, lambda: channel.recv(4096))
                            if not data:
                                break
                            await websocket.send_bytes(data)
                        else:
                            # Check if channel closed
                            if channel.exit_status_ready():
                                break
                            await asyncio.sleep(0.01)
                    except Exception:
                        break

            # Task 2: Read from WebSocket and write to SSH channel
            async def ws_to_ssh():
                nonlocal is_running
                while is_running:
                    try:
                        msg = await websocket.receive()
                        if "bytes" in msg and msg["bytes"]:
                            await loop.run_in_executor(None, channel.send, msg["bytes"])
                        elif "text" in msg and msg["text"]:
                            # JSON control messages (e.g. resize, ping)
                            import json
                            try:
                                payload = json.loads(msg["text"])
                                if payload.get("type") == "resize":
                                    new_cols = int(payload.get("cols", 80))
                                    new_rows = int(payload.get("rows", 24))
                                    channel.resize_pty(width=new_cols, height=new_rows)
                                elif payload.get("type") == "ping":
                                    await websocket.send_json({"type": "pong"})
                            except json.JSONDecodeError:
                                # Plain text typed
                                await loop.run_in_executor(None, channel.send, msg["text"].encode("utf-8"))
                    except WebSocketDisconnect:
                        is_running = False
                        break
                    except Exception:
                        is_running = False
                        break

            # Run reader and writer concurrently
            reader_task = asyncio.create_task(ssh_to_ws())
            writer_task = asyncio.create_task(ws_to_ssh())

            done, pending = await asyncio.wait(
                [reader_task, writer_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            is_running = False
            for task in pending:
                task.cancel()

        except WebSocketDisconnect:
            pass
        except Exception as e:
            try:
                await websocket.send_json({
                    "type": "error",
                    "message": f"SSH Connection failed: {str(e)}"
                })
            except Exception:
                pass
        finally:
            if channel:
                try:
                    channel.close()
                except Exception:
                    pass
            if client:
                try:
                    client.close()
                except Exception:
                    pass

ssh_manager = SSHConnectionManager()

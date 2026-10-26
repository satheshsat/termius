import json
import os
import shutil
from typing import Dict, Any, List, Optional
from pathlib import Path
from app.crypto import crypto_vault
from app.models import HostItem, SSHKeyItem, SnippetItem, TunnelItem, SettingsModel

DEFAULT_VAULT_PATH = Path("termius_vault.json")

class JsonStorage:
    def __init__(self, filepath: Path = DEFAULT_VAULT_PATH):
        self.filepath = filepath
        self.data: Dict[str, Any] = {
            "version": "1.0",
            "vault_meta": {
                "has_master_password": False,
                "salt": None,
                "auth_check": None,
            },
            "hosts": [],
            "keys": [],
            "snippets": [],
            "tunnels": [],
            "settings": SettingsModel().model_dump(),
        }
        self.load()

    def load(self):
        if self.filepath.exists():
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    self.data.update(loaded)
                    return
            except Exception as e:
                print(f"[Storage] Error reading {self.filepath}: {e}, using backup if available")
                bak = self.filepath.with_suffix(".bak")
                if bak.exists():
                    try:
                        with open(bak, "r", encoding="utf-8") as f:
                            self.data.update(json.load(f))
                            return
                    except Exception:
                        pass
        # Initialize default seed data if brand new
        self.seed_defaults()
        self.save()

    def seed_defaults(self):
        # Default helpful starter snippets
        starter_snippets = [
            {
                "id": "snip-system-info",
                "name": "System Info & Hardware",
                "command": "uname -a && lsb_release -a && uptime && free -h && df -h",
                "tags": ["system", "diagnostics"],
                "description": "Show kernel version, OS, uptime, memory, and disk space usage."
            },
            {
                "id": "snip-docker-ps",
                "name": "Docker Container Status",
                "command": "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
                "tags": ["docker", "devops"],
                "description": "List all active Docker containers in a neat formatted table."
            },
            {
                "id": "snip-top-processes",
                "name": "Top 10 Memory Processes",
                "command": "ps aux --sort=-%mem | head -n 11",
                "tags": ["system", "monitoring"],
                "description": "Inspect the top 10 memory-consuming processes."
            },
            {
                "id": "snip-network-ports",
                "name": "Listening Network Ports",
                "command": "sudo ss -tulpn | grep LISTEN",
                "tags": ["network", "security"],
                "description": "View all open TCP/UDP listening ports and active sockets."
            }
        ]
        self.data["snippets"] = starter_snippets
        
        # Starter demo host (Localhost SSH)
        starter_hosts = [
            {
                "id": "host-localhost",
                "label": "Local Machine (SSH)",
                "hostname": "127.0.0.1",
                "port": 22,
                "username": os.environ.get("USER", "user"),
                "auth_type": "password",
                "tags": ["local", "development"],
                "group": "Local",
                "color": "#6c5ce7",
                "notes": "Direct local SSH access (requires local sshd running)",
                "created_at": "2026-10-26T12:00:00Z"
            }
        ]
        self.data["hosts"] = starter_hosts

    def save(self):
        temp_path = self.filepath.with_suffix(".tmp")
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
            # Create backup of current file
            if self.filepath.exists():
                shutil.copy2(self.filepath, self.filepath.with_suffix(".bak"))
            # Atomic rename
            temp_path.replace(self.filepath)
        except Exception as e:
            if temp_path.exists():
                temp_path.unlink()
            raise IOError(f"Failed to persist {self.filepath}: {e}")

    # --- Master Password & Security ---
    def has_master_password(self) -> bool:
        return bool(self.data.get("vault_meta", {}).get("has_master_password", False))

    def setup_master_password(self, password: str):
        meta = crypto_vault.initialize_new_vault(password)
        self.data["vault_meta"] = {
            "has_master_password": True,
            "salt": meta["salt"],
            "auth_check": meta["auth_check"],
        }
        self.save()

    def verify_and_unlock(self, password: str) -> bool:
        meta = self.data.get("vault_meta", {})
        salt = meta.get("salt")
        auth_check = meta.get("auth_check")
        if not salt or not auth_check:
            # If no master password was set, unlock without error
            return True
        return crypto_vault.unlock(password, salt, auth_check)

    # --- Hosts CRUD ---
    def get_hosts(self) -> List[Dict[str, Any]]:
        # Return sanitized host list (hide encrypted secrets, return boolean indicator)
        results = []
        for h in self.data.get("hosts", []):
            item = dict(h)
            item["has_password"] = bool(item.get("password_encrypted"))
            item["has_passphrase"] = bool(item.get("passphrase_encrypted"))
            item.pop("password_encrypted", None)
            item.pop("passphrase_encrypted", None)
            results.append(item)
        return results

    def get_raw_host(self, host_id: str) -> Optional[Dict[str, Any]]:
        for h in self.data.get("hosts", []):
            if h.get("id") == host_id:
                return h
        return None

    def add_host(self, host: HostItem) -> Dict[str, Any]:
        item_dict = host.model_dump()
        # Encrypt sensitive credentials if present
        if host.password:
            if crypto_vault.is_unlocked:
                item_dict["password_encrypted"] = crypto_vault.encrypt_string(host.password)
            else:
                item_dict["password_encrypted"] = host.password  # Fallback if no master pwd
        if host.passphrase:
            if crypto_vault.is_unlocked:
                item_dict["passphrase_encrypted"] = crypto_vault.encrypt_string(host.passphrase)
            else:
                item_dict["passphrase_encrypted"] = host.passphrase
                
        # Clean cleartext from persistent dict
        item_dict.pop("password", None)
        item_dict.pop("passphrase", None)
        
        self.data["hosts"].append(item_dict)
        self.save()
        return item_dict

    def update_host(self, host_id: str, host: Any) -> Optional[Dict[str, Any]]:
        for i, existing in enumerate(self.data.get("hosts", [])):
            if existing.get("id") == host_id:
                if hasattr(host, "model_dump"):
                    item_dict = host.model_dump()
                    pwd = host.password
                    passphrase = host.passphrase
                else:
                    item_dict = dict(host)
                    pwd = host.get("password")
                    passphrase = host.get("passphrase")

                item_dict["id"] = host_id
                # Handle password updates
                if pwd is not None:
                    if pwd:
                        if crypto_vault.is_unlocked:
                            item_dict["password_encrypted"] = crypto_vault.encrypt_string(pwd)
                        else:
                            item_dict["password_encrypted"] = pwd
                    else:
                        item_dict["password_encrypted"] = None
                else:
                    # Keep existing
                    item_dict["password_encrypted"] = existing.get("password_encrypted")

                # Handle passphrase updates
                if passphrase is not None:
                    if passphrase:
                        if crypto_vault.is_unlocked:
                            item_dict["passphrase_encrypted"] = crypto_vault.encrypt_string(passphrase)
                        else:
                            item_dict["passphrase_encrypted"] = passphrase
                    else:
                        item_dict["passphrase_encrypted"] = None
                else:
                    item_dict["passphrase_encrypted"] = existing.get("passphrase_encrypted")

                item_dict.pop("password", None)
                item_dict.pop("passphrase", None)
                self.data["hosts"][i] = item_dict
                self.save()
                return item_dict
        return None

    def delete_host(self, host_id: str) -> bool:
        original_len = len(self.data.get("hosts", []))
        self.data["hosts"] = [h for h in self.data.get("hosts", []) if h.get("id") != host_id]
        if len(self.data["hosts"]) != original_len:
            self.save()
            return True
        return False

    def get_decrypted_host_credentials(self, host_id: str) -> Dict[str, Any]:
        raw = self.get_raw_host(host_id)
        if not raw:
            raise ValueError(f"Host {host_id} not found")
        
        creds = {
            "password": None,
            "passphrase": None,
        }
        if raw.get("password_encrypted"):
            try:
                creds["password"] = crypto_vault.decrypt_string(raw["password_encrypted"])
            except Exception:
                creds["password"] = raw["password_encrypted"]
        if raw.get("passphrase_encrypted"):
            try:
                creds["passphrase"] = crypto_vault.decrypt_string(raw["passphrase_encrypted"])
            except Exception:
                creds["passphrase"] = raw["passphrase_encrypted"]
        return creds

    # --- SSH Keys CRUD ---
    def get_keys(self) -> List[Dict[str, Any]]:
        results = []
        for k in self.data.get("keys", []):
            item = dict(k)
            item["has_private_key"] = bool(item.get("private_key_encrypted"))
            item["has_passphrase"] = bool(item.get("passphrase_encrypted"))
            item.pop("private_key_encrypted", None)
            item.pop("passphrase_encrypted", None)
            results.append(item)
        return results

    def get_raw_key(self, key_id: str) -> Optional[Dict[str, Any]]:
        for k in self.data.get("keys", []):
            if k.get("id") == key_id:
                return k
        return None

    def add_key(self, key_item: SSHKeyItem) -> Dict[str, Any]:
        item_dict = key_item.model_dump()
        if key_item.private_key:
            if crypto_vault.is_unlocked:
                item_dict["private_key_encrypted"] = crypto_vault.encrypt_string(key_item.private_key)
            else:
                item_dict["private_key_encrypted"] = key_item.private_key
        if key_item.passphrase:
            if crypto_vault.is_unlocked:
                item_dict["passphrase_encrypted"] = crypto_vault.encrypt_string(key_item.passphrase)
            else:
                item_dict["passphrase_encrypted"] = key_item.passphrase
                
        item_dict.pop("private_key", None)
        item_dict.pop("passphrase", None)
        self.data["keys"].append(item_dict)
        self.save()
        return item_dict

    def delete_key(self, key_id: str) -> bool:
        original_len = len(self.data.get("keys", []))
        self.data["keys"] = [k for k in self.data.get("keys", []) if k.get("id") != key_id]
        if len(self.data["keys"]) != original_len:
            self.save()
            return True
        return False

    def get_decrypted_key(self, key_id: str) -> Dict[str, Any]:
        raw = self.get_raw_key(key_id)
        if not raw:
            raise ValueError(f"SSH Key {key_id} not found")
        private_key = None
        passphrase = None
        if raw.get("private_key_encrypted"):
            try:
                private_key = crypto_vault.decrypt_string(raw["private_key_encrypted"])
            except Exception:
                private_key = raw["private_key_encrypted"]
        if raw.get("passphrase_encrypted"):
            try:
                passphrase = crypto_vault.decrypt_string(raw["passphrase_encrypted"])
            except Exception:
                passphrase = raw["passphrase_encrypted"]
        return {
            "id": raw.get("id"),
            "name": raw.get("name"),
            "key_type": raw.get("key_type"),
            "public_key": raw.get("public_key"),
            "private_key": private_key,
            "passphrase": passphrase,
        }

    # --- Snippets CRUD ---
    def get_snippets(self) -> List[Dict[str, Any]]:
        return self.data.get("snippets", [])

    def add_snippet(self, snippet: SnippetItem) -> Dict[str, Any]:
        item_dict = snippet.model_dump()
        self.data["snippets"].append(item_dict)
        self.save()
        return item_dict

    def update_snippet(self, snippet_id: str, snippet: Any) -> Optional[Dict[str, Any]]:
        for i, existing in enumerate(self.data.get("snippets", [])):
            if existing.get("id") == snippet_id:
                item_dict = snippet.model_dump() if hasattr(snippet, "model_dump") else dict(snippet)
                item_dict["id"] = snippet_id
                self.data["snippets"][i] = item_dict
                self.save()
                return item_dict
        return None

    def delete_snippet(self, snippet_id: str) -> bool:
        original_len = len(self.data.get("snippets", []))
        self.data["snippets"] = [s for s in self.data.get("snippets", []) if s.get("id") != snippet_id]
        if len(self.data["snippets"]) != original_len:
            self.save()
            return True
        return False

    # --- Port Forwarding Tunnels CRUD ---
    def get_tunnels(self) -> List[Dict[str, Any]]:
        return self.data.get("tunnels", [])

    def add_tunnel(self, tunnel: TunnelItem) -> Dict[str, Any]:
        item_dict = tunnel.model_dump()
        self.data["tunnels"].append(item_dict)
        self.save()
        return item_dict

    def update_tunnel(self, tunnel_id: str, tunnel: Any) -> Optional[Dict[str, Any]]:
        for i, existing in enumerate(self.data.get("tunnels", [])):
            if existing.get("id") == tunnel_id:
                item_dict = tunnel.model_dump() if hasattr(tunnel, "model_dump") else dict(tunnel)
                item_dict["id"] = tunnel_id
                self.data["tunnels"][i] = item_dict
                self.save()
                return item_dict
        return None

    def delete_tunnel(self, tunnel_id: str) -> bool:
        original_len = len(self.data.get("tunnels", []))
        self.data["tunnels"] = [t for t in self.data.get("tunnels", []) if t.get("id") != tunnel_id]
        if len(self.data["tunnels"]) != original_len:
            self.save()
            return True
        return False

    # --- Settings ---
    def get_settings(self) -> Dict[str, Any]:
        return self.data.get("settings", SettingsModel().model_dump())

    def update_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        self.data["settings"].update(settings)
        self.save()
        return self.data["settings"]

storage = JsonStorage()

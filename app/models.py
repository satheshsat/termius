from typing import List, Optional
from pydantic import BaseModel, Field
import uuid
import datetime

def generate_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

class HostItem(BaseModel):
    id: str = Field(default_factory=generate_id)
    label: str
    hostname: str
    port: int = 22
    username: str = "root"
    auth_type: str = "password"  # password | key | agent
    # When receiving from frontend:
    password: Optional[str] = None
    key_id: Optional[str] = None
    passphrase: Optional[str] = None
    # Storage fields (in JSON):
    password_encrypted: Optional[str] = None
    passphrase_encrypted: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    group: str = "Default"
    color: str = "#6c5ce7"
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)
    last_connected: Optional[str] = None

class SSHKeyItem(BaseModel):
    id: str = Field(default_factory=generate_id)
    name: str
    key_type: str = "rsa"  # rsa | ed25519
    public_key: str
    # When receiving or exporting:
    private_key: Optional[str] = None
    passphrase: Optional[str] = None
    # Storage fields:
    private_key_encrypted: Optional[str] = None
    passphrase_encrypted: Optional[str] = None
    fingerprint: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)

class SnippetItem(BaseModel):
    id: str = Field(default_factory=generate_id)
    name: str
    command: str
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class TunnelItem(BaseModel):
    id: str = Field(default_factory=generate_id)
    name: str
    host_id: str
    tunnel_type: str = "local"  # local | remote | dynamic
    local_port: int = 8080
    remote_host: str = "127.0.0.1"
    remote_port: int = 80
    auto_start: bool = False
    status: str = "stopped"
    created_at: str = Field(default_factory=now_iso)

class SettingsModel(BaseModel):
    terminal_font_size: int = 14
    terminal_theme: str = "termius-dark"
    cursor_blink: bool = True
    terminal_scrollback: int = 5000
    default_username: str = "root"

class MasterPasswordSetup(BaseModel):
    password: str

class MasterPasswordVerify(BaseModel):
    password: str

class MasterPasswordChange(BaseModel):
    old_password: str
    new_password: str

class GenerateKeyRequest(BaseModel):
    name: str
    key_type: str = "rsa"  # rsa or ed25519
    passphrase: Optional[str] = None
    bits: int = 2048

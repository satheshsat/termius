# ⚡ Termius Clone (Python + Modern Web UI)

A full-featured, sleek Termius clone built in **Python (FastAPI, Paramiko, Cryptography)** with a modern **xterm.js & WebSockets** interface. All configurations, hosts, snippets, port forwardings, and keys are stored in a local, encrypted **JSON** file (`termius_vault.json`).

---

## ✨ Features

- **💻 Host Manager**:
  - Add, edit, group, and tag SSH hosts with custom accent colors.
  - One-click terminal connection or SFTP connection.
  - SSH ping & handshake latency test (`● 24 ms`).
  - Supports Password, SSH Private Key, and SSH Agent authentication.
- **⚡ Multi-Tab Interactive Terminal**:
  - Powered by **xterm.js** with full VT100 / ANSI color and curses support (`vim`, `htop`, `tmux`, `nano`).
  - Dynamic PTY window resize on the fly (`SIGWINCH` synchronization via WebSocket).
  - Multiple simultaneous active SSH sessions across tabs.
  - Customizable terminal themes: *Termius Dark*, *Dracula*, *Nord*, and *Monokai Pro*.
  - Font size controls (`A+` / `A-`), clear screen, and instant session reconnect.
- **📁 SFTP Remote File Explorer**:
  - Browse remote directories with breadcrumbs.
  - Upload and download files.
  - Create new directories and delete files/folders.
  - File permissions (`chmod`), file sizes, and modification timestamps.
- **📋 Command Snippets**:
  - Predefined or custom shell scripts organized by tags.
  - **Quick Execution Drawer**: Run any snippet directly into your active SSH terminal tab with one tap.
  - One-click copy to clipboard.
- **🔀 Port Forwarding (Tunnels)**:
  - Configure Local Port Forwarding rules (e.g. `localhost:5432 -> remote-db:5432` through an SSH bastion).
  - Real-time tunnel diagram and toggle switch (ON/OFF) backed by background forwarding threads.
- **🔑 SSH Keychain & Key Generator**:
  - Generate brand new **Ed25519** and **RSA** (2048/4096-bit) SSH key pairs directly in the app.
  - OpenSSH format public keys with SHA256 fingerprints.
  - Copy public keys to paste into remote `authorized_keys`.
- **🔒 Master Password & AES-256-GCM Vault**:
  - Stored in clean JSON format in `termius_vault.json`.
  - Sensitive credentials (passwords, private keys, passphrases) are encrypted using **AES-256-GCM** with a **PBKDF2-HMAC-SHA256** (100,000 iterations) derived key.
  - One-click lock / unlock mechanism in the sidebar footer.
  - Atomic writing with automatic `.bak` backup creation to protect against power loss or file corruption.
  - One-click JSON data export and import for easy backups.

---

## 🚀 Quick Start

### 1. Prerequisites & Installation

Activate the virtual environment and install the required dependencies:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Launch the Application

```bash
python3 main.py
```

The application will start on `http://127.0.0.1:8888` and automatically open your default browser.

#### Optional CLI Flags:
```bash
python3 main.py --port 9000           # Change port
python3 main.py --host 0.0.0.0         # Listen on network
python3 main.py --no-browser          # Do not open browser automatically
```

---

## 📁 JSON Vault Storage (`termius_vault.json`)

All application state is persisted in `termius_vault.json`:

```json
{
  "version": "1.0",
  "vault_meta": {
    "has_master_password": true,
    "salt": "<base64>",
    "auth_check": "<base64>"
  },
  "hosts": [
    {
      "id": "uuid",
      "label": "Production Server",
      "hostname": "192.168.1.100",
      "port": 22,
      "username": "ubuntu",
      "auth_type": "password",
      "password_encrypted": "<AES-GCM ciphertext>",
      "tags": ["prod", "web"],
      "group": "Cloud",
      "color": "#6c5ce7",
      "created_at": "2026-10-26T12:00:00Z"
    }
  ],
  "keys": [ ... ],
  "snippets": [ ... ],
  "tunnels": [ ... ],
  "settings": { ... }
}
```

---

## 🧪 Running the Automated Test Suite

```bash
source .venv/bin/activate
python3 test_app.py
```
Validates the cryptographic vault, key generation, API endpoints, and JSON file persistence.

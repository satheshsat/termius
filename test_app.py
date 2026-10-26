import os
import json
from pathlib import Path
from fastapi.testclient import TestClient

from main import app
from app.crypto import crypto_vault
from app.storage import storage
from app.key_generator import generate_ssh_keypair

def test_key_generator():
    print("[1/5] Testing SSH Key generator (RSA and Ed25519)...")
    pub, priv, fp = generate_ssh_keypair("ed25519")
    assert "ssh-ed25519" in pub, "Ed25519 public key format mismatch"
    assert "OPENSSH PRIVATE KEY" in priv, "Ed25519 private key format mismatch"
    assert fp.startswith("SHA256:"), "Fingerprint format mismatch"

    pub_rsa, priv_rsa, fp_rsa = generate_ssh_keypair("rsa", bits=2048)
    assert "ssh-rsa" in pub_rsa, "RSA public key mismatch"
    print("  ✔ Key generation passed.")

def test_crypto_vault():
    print("[2/5] Testing AES-256-GCM Vault encryption & master password...")
    pwd = "MySecretMasterPassword123!"
    meta = crypto_vault.initialize_new_vault(pwd)
    assert crypto_vault.is_unlocked is True
    
    # Encrypt
    secret_text = "super_secret_ssh_root_password"
    enc = crypto_vault.encrypt_string(secret_text)
    assert enc != secret_text
    
    # Decrypt
    dec = crypto_vault.decrypt_string(enc)
    assert dec == secret_text
    
    # Lock and verify decryption fails
    crypto_vault.lock()
    assert crypto_vault.is_unlocked is False
    try:
        crypto_vault.decrypt_string(enc)
        assert False, "Should have thrown error when locked"
    except ValueError:
        pass
        
    # Unlock again
    success = crypto_vault.unlock(pwd, meta["salt"], meta["auth_check"])
    assert success is True
    assert crypto_vault.decrypt_string(enc) == secret_text
    print("  ✔ Crypto vault passed.")

def test_api_endpoints():
    print("[3/5] Testing FastAPI endpoints with TestClient...")
    client = TestClient(app)

    # 1. Check root
    res = client.get("/")
    assert res.status_code == 200

    # 2. Check Auth Status
    res = client.get("/api/auth/status")
    assert res.status_code == 200
    data = res.json()
    assert "has_master_password" in data

    # 3. Create a host
    new_host = {
        "label": "Test Production Box",
        "hostname": "192.168.1.200",
        "port": 22,
        "username": "ubuntu",
        "auth_type": "password",
        "password": "ubuntu_password_99",
        "group": "Cloud",
        "tags": ["prod", "web"],
        "color": "#00b894",
        "notes": "Test server for pytest validation"
    }
    res = client.post("/api/hosts", json=new_host)
    assert res.status_code == 200, res.text
    host_data = res.json()["host"]
    host_id = host_data["id"]
    assert host_data["label"] == "Test Production Box"

    # Verify list hosts
    res = client.get("/api/hosts")
    assert res.status_code == 200
    hosts_list = res.json()
    assert any(h["id"] == host_id for h in hosts_list)
    # Ensure raw password is NOT leaked in JSON list
    created_item = next(h for h in hosts_list if h["id"] == host_id)
    assert "password" not in created_item
    assert "password_encrypted" not in created_item
    assert created_item["has_password"] is True

    # 4. Snippets
    new_snippet = {
        "name": "Nginx Reload",
        "command": "sudo systemctl reload nginx",
        "tags": ["nginx", "web"],
        "description": "Reloads nginx without downtime"
    }
    res = client.post("/api/snippets", json=new_snippet)
    assert res.status_code == 200
    snip_id = res.json()["snippet"]["id"]

    res = client.get("/api/snippets")
    assert res.status_code == 200
    assert any(s["id"] == snip_id for s in res.json())

    # 5. Tunnels
    new_tunnel = {
        "name": "Remote Postgres DB",
        "host_id": host_id,
        "tunnel_type": "local",
        "local_port": 5433,
        "remote_host": "127.0.0.1",
        "remote_port": 5432
    }
    res = client.post("/api/tunnels", json=new_tunnel)
    assert res.status_code == 200
    tunnel_id = res.json()["tunnel"]["id"]

    res = client.get("/api/tunnels")
    assert res.status_code == 200
    assert any(t["id"] == tunnel_id for t in res.json())

    # 6. Keys
    res = client.post("/api/keys/generate", json={
        "name": "Automated Test Key",
        "key_type": "ed25519"
    })
    assert res.status_code == 200
    key_id = res.json()["key"]["id"]

    res = client.get("/api/keys")
    assert res.status_code == 200
    assert any(k["id"] == key_id for k in res.json())

    # 7. Clean up test records
    client.delete(f"/api/hosts/{host_id}")
    client.delete(f"/api/snippets/{snip_id}")
    client.delete(f"/api/tunnels/{tunnel_id}")
    client.delete(f"/api/keys/{key_id}")
    print("  ✔ FastAPI endpoints tested successfully.")

def test_json_persistence():
    print("[4/5] Checking JSON file storage persistence (termius_vault.json)...")
    vault_file = Path("termius_vault.json")
    assert vault_file.exists(), "termius_vault.json does not exist on disk"
    with open(vault_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert "version" in data
    assert "hosts" in data
    assert "snippets" in data
    assert "tunnels" in data
    assert "settings" in data
    print(f"  ✔ termius_vault.json verified ({len(data['hosts'])} hosts, {len(data['snippets'])} snippets).")

if __name__ == "__main__":
    test_key_generator()
    test_crypto_vault()
    test_api_endpoints()
    test_json_persistence()
    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")

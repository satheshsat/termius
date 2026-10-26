import os
import base64
from typing import Optional
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

PBKDF2_ITERATIONS = 100_000
MAGIC_CHECK = "TERMIUS_VAULT_OK_V1"

class VaultCrypto:
    def __init__(self):
        self._key: Optional[bytes] = None
        self._salt: Optional[bytes] = None

    @property
    def is_unlocked(self) -> bool:
        return self._key is not None

    def derive_key(self, password: str, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=PBKDF2_ITERATIONS,
        )
        return kdf.derive(password.encode("utf-8"))

    def initialize_new_vault(self, master_password: str) -> dict:
        salt = os.urandom(16)
        key = self.derive_key(master_password, salt)
        self._key = key
        self._salt = salt
        
        # Encrypt the magic check string
        auth_check = self.encrypt_string(MAGIC_CHECK, key)
        return {
            "salt": base64.b64encode(salt).decode("utf-8"),
            "auth_check": auth_check,
        }

    def unlock(self, master_password: str, salt_b64: str, auth_check_b64: str) -> bool:
        try:
            salt = base64.b64decode(salt_b64)
            key = self.derive_key(master_password, salt)
            decrypted = self.decrypt_string(auth_check_b64, key)
            if decrypted == MAGIC_CHECK:
                self._key = key
                self._salt = salt
                return True
            return False
        except Exception:
            return False

    def lock(self):
        self._key = None

    def change_master_password(self, old_password: str, new_password: str, old_salt_b64: str, old_auth_b64: str) -> Optional[dict]:
        if not self.unlock(old_password, old_salt_b64, old_auth_b64):
            return None
        return self.initialize_new_vault(new_password)

    def encrypt_string(self, plaintext: str, key: Optional[bytes] = None) -> str:
        k = key or self._key
        if not k:
            raise ValueError("Vault is locked; cannot encrypt")
        if not plaintext:
            return ""
        aesgcm = AESGCM(k)
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        # combine nonce + ciphertext (tag is appended by AESGCM)
        combined = nonce + ciphertext
        return base64.b64encode(combined).decode("utf-8")

    def decrypt_string(self, encrypted_b64: str, key: Optional[bytes] = None) -> str:
        k = key or self._key
        if not k:
            raise ValueError("Vault is locked; cannot decrypt")
        if not encrypted_b64:
            return ""
        try:
            raw = base64.b64decode(encrypted_b64)
            if len(raw) < 12 + 16:
                raise ValueError("Invalid ciphertext length")
            nonce = raw[:12]
            ciphertext = raw[12:]
            aesgcm = AESGCM(k)
            decrypted = aesgcm.decrypt(nonce, ciphertext, None)
            return decrypted.decode("utf-8")
        except InvalidTag:
            raise ValueError("Authentication tag mismatch or invalid password")

crypto_vault = VaultCrypto()

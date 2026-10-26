import hashlib
import base64
from typing import Tuple
from cryptography.hazmat.primitives.asymmetric import rsa, ed25519
from cryptography.hazmat.primitives import serialization

def generate_ssh_keypair(
    key_type: str = "ed25519",
    bits: int = 2048,
    passphrase: str = None
) -> Tuple[str, str, str]:
    """
    Generates an SSH key pair.
    Returns: (public_key_openssh, private_key_pem, fingerprint_sha256)
    """
    if key_type.lower() == "ed25519":
        private_key = ed25519.Ed25519PrivateKey.generate()
    else:
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=bits,
        )

    # Encryption for private key PEM if passphrase given
    if passphrase:
        encryption = serialization.BestAvailableEncryption(passphrase.encode("utf-8"))
    else:
        encryption = serialization.NoEncryption()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=encryption,
    ).decode("utf-8")

    public_openssh = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    ).decode("utf-8")

    # Generate SHA256 fingerprint from public key base64 portion
    parts = public_openssh.strip().split()
    fingerprint = ""
    if len(parts) >= 2:
        raw_key = base64.b64decode(parts[1])
        fp_digest = hashlib.sha256(raw_key).digest()
        fingerprint = "SHA256:" + base64.b64encode(fp_digest).decode("utf-8").rstrip("=")

    return public_openssh, private_pem, fingerprint

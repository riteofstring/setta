import hashlib
import secrets


def create_salt():
    return secrets.token_bytes(16)


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000, dklen=32)


def get_salt_and_hash(password: str):
    salt = create_salt()
    return {"salt": salt, "password": hash_password(password, salt)}

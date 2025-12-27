import os
from pathlib import Path
from urllib.parse import parse_qs

from setta.utils.constants import C

AUTH_BEARER_PREFIX = "Bearer "
AUTH_TOKEN_ENV_VAR = "SETTA_AUTH_TOKEN"
WEBSOCKET_PROTOCOL_PREFIX = "setta.token."


def load_auth_token_from_file(token_file: Path) -> str:
    token = token_file.read_text().strip()
    if not token:
        raise ValueError(f"Auth token file is empty: {token_file}")
    return token


def configure_auth_token(token: str) -> None:
    if not token:
        raise ValueError("Auth token must be non-empty")
    C.AUTH_TOKEN = token
    os.environ[AUTH_TOKEN_ENV_VAR] = token


def get_configured_auth_token() -> str:
    token = C.AUTH_TOKEN or os.environ.get(AUTH_TOKEN_ENV_VAR)
    if not token:
        raise RuntimeError("Auth token is required; start with --token-file.")
    if not C.AUTH_TOKEN:
        C.AUTH_TOKEN = token
    return token


def parse_bearer_token(value: str | None) -> str | None:
    if not value:
        return None
    if not value.startswith(AUTH_BEARER_PREFIX):
        return None
    token = value[len(AUTH_BEARER_PREFIX) :].strip()
    return token or None


def extract_header(headers: list[tuple[bytes, bytes]], name: str) -> str | None:
    target = name.lower().encode()
    for key, value in headers:
        if key.lower() == target:
            return value.decode("latin-1")
    return None


def extract_http_token(headers: list[tuple[bytes, bytes]]) -> str | None:
    return parse_bearer_token(extract_header(headers, "authorization"))


def extract_websocket_token(
    headers: list[tuple[bytes, bytes]],
    query_string: bytes,
) -> str | None:
    header_token = extract_http_token(headers)
    if header_token:
        return header_token
    protocol_token = _parse_websocket_protocol(
        extract_header(headers, "sec-websocket-protocol")
    )
    if protocol_token:
        return protocol_token
    if not query_string:
        return None
    query = parse_qs(query_string.decode("utf-8"))
    token_values = query.get("token")
    if not token_values:
        return None
    token = token_values[0].strip()
    return token or None


def _parse_websocket_protocol(value: str | None) -> str | None:
    if not value:
        return None
    for entry in value.split(","):
        entry = entry.strip()
        if not entry:
            continue
        if entry.startswith(WEBSOCKET_PROTOCOL_PREFIX):
            token = entry[len(WEBSOCKET_PROTOCOL_PREFIX) :].strip()
            return token or None
    return None

import base64
import hashlib
import hmac
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

LAUNCHER_ORIGIN_HASH_PARAM = "lo"
LAUNCHER_ORIGIN_PROOF_HASH_PARAM = "lop"


def normalize_launcher_origin(raw_origin: str | None) -> str | None:
    if raw_origin is None:
        return None
    trimmed_origin = raw_origin.strip()
    if not trimmed_origin:
        return None
    parsed_origin = urlsplit(trimmed_origin)
    if parsed_origin.scheme not in {"http", "https"}:
        return None
    hostname = parsed_origin.hostname
    if hostname is None:
        return None
    if parsed_origin.username or parsed_origin.password:
        return None
    try:
        port = parsed_origin.port
    except ValueError:
        return None
    normalized_host = hostname
    if ":" in hostname and not hostname.startswith("["):
        normalized_host = f"[{hostname}]"
    if port is None:
        return f"{parsed_origin.scheme}://{normalized_host}"
    return f"{parsed_origin.scheme}://{normalized_host}:{port}"


def mint_launcher_origin_handoff_proof(
    *,
    session_id: str,
    launcher_origin: str,
    secret: bytes,
) -> str:
    payload = _handoff_payload(
        session_id=session_id,
        launcher_origin=launcher_origin,
    )
    signature = hmac.new(secret, payload, hashlib.sha256).digest()
    return _base64url_encode(signature)


def validate_launcher_origin_handoff_proof(
    *,
    session_id: str,
    launcher_origin: str,
    proof: str,
    secret: bytes,
) -> bool:
    normalized_proof = proof.strip()
    if not normalized_proof:
        return False
    expected_proof = mint_launcher_origin_handoff_proof(
        session_id=session_id,
        launcher_origin=launcher_origin,
        secret=secret,
    )
    return hmac.compare_digest(normalized_proof, expected_proof)


def append_launcher_origin_handoff_to_bootstrap_url(
    *,
    bootstrap_url_fragment: str,
    launcher_origin: str,
    proof: str,
) -> str:
    parsed = urlsplit(bootstrap_url_fragment)
    hash_params = [
        (key, value)
        for key, value in parse_qsl(parsed.fragment, keep_blank_values=True)
        if key not in {LAUNCHER_ORIGIN_HASH_PARAM, LAUNCHER_ORIGIN_PROOF_HASH_PARAM}
    ]
    hash_params.append((LAUNCHER_ORIGIN_HASH_PARAM, launcher_origin))
    hash_params.append((LAUNCHER_ORIGIN_PROOF_HASH_PARAM, proof))
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.query,
            urlencode(hash_params),
        )
    )


def _handoff_payload(*, session_id: str, launcher_origin: str) -> bytes:
    return f"{session_id}\n{launcher_origin}".encode("utf-8")


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

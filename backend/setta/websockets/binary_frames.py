import json

HEADER_LENGTH_BYTES = 4


def encode_binary_frame(header: dict[str, object], payload: bytes) -> bytes:
    header_bytes = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    header_len = len(header_bytes)
    return header_len.to_bytes(HEADER_LENGTH_BYTES, "big") + header_bytes + payload


def decode_binary_frame(data: bytes) -> tuple[dict[str, object], bytes]:
    if len(data) < HEADER_LENGTH_BYTES:
        raise ValueError("Binary frame too short to include header length.")
    header_len = int.from_bytes(data[:HEADER_LENGTH_BYTES], "big")
    if header_len < 0:
        raise ValueError("Binary frame header length is invalid.")
    header_end = HEADER_LENGTH_BYTES + header_len
    if len(data) < header_end:
        raise ValueError("Binary frame header is incomplete.")
    header_bytes = data[HEADER_LENGTH_BYTES:header_end]
    try:
        header = json.loads(header_bytes.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Binary frame header is not valid JSON.") from exc
    if not isinstance(header, dict):
        raise ValueError("Binary frame header must be a JSON object.")
    payload = data[header_end:]
    return header, payload

import json


HEADER_LENGTH_BYTES = 4


def encode_binary_frame(header: dict[str, object], payload: bytes) -> bytes:
    header_bytes = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    header_len = len(header_bytes)
    return header_len.to_bytes(HEADER_LENGTH_BYTES, "big") + header_bytes + payload

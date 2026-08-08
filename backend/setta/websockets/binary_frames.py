import json

from setta.types.generated.go_shared_constants import HEADER_LENGTH_BYTES


def _decode_header_length(data: bytes) -> int:
    if len(data) < HEADER_LENGTH_BYTES:
        raise ValueError("Binary frame too short to include header length.")
    return int.from_bytes(data[:HEADER_LENGTH_BYTES], "big")


def _split_header_bytes(data: bytes, header_len: int) -> tuple[bytes, bytes]:
    header_end = HEADER_LENGTH_BYTES + header_len
    header_bytes = data[HEADER_LENGTH_BYTES:header_end]
    if len(header_bytes) != header_len:
        raise ValueError("Binary frame header is incomplete.")
    return header_bytes, data[header_end:]


def _decode_header_object(header_bytes: bytes) -> dict[str, object]:
    try:
        header = json.loads(header_bytes.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Binary frame header is not valid JSON.") from exc
    if not isinstance(header, dict):
        raise ValueError("Binary frame header must be a JSON object.")
    return header


def decode_binary_frame(data: bytes) -> tuple[dict[str, object], bytes]:
    header_len = _decode_header_length(data)
    header_bytes, payload = _split_header_bytes(data, header_len)
    return _decode_header_object(header_bytes), payload

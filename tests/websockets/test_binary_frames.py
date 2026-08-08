import pytest

from setta.websockets.binary_frames import decode_binary_frame
from tests.helpers.binary_frames import encode_binary_frame


def test_binary_frame_roundtrip() -> None:
    header = {"messageType": "Test", "content": {"value": 1}}
    payload = b"\x00\x01binary"
    frame = encode_binary_frame(header, payload)
    decoded_header, decoded_payload = decode_binary_frame(frame)
    assert decoded_header == header
    assert decoded_payload == payload


def test_binary_frame_rejects_short_payload() -> None:
    with pytest.raises(ValueError):
        decode_binary_frame(b"\x00\x00\x00")


def test_binary_frame_rejects_incomplete_header() -> None:
    with pytest.raises(ValueError, match="header is incomplete"):
        decode_binary_frame(b"\x00\x00\x00\x05{}")


def test_binary_frame_rejects_invalid_json_header() -> None:
    with pytest.raises(ValueError, match="not valid JSON"):
        decode_binary_frame(b"\x00\x00\x00\x04nope")


def test_binary_frame_rejects_non_object_header() -> None:
    with pytest.raises(ValueError, match="must be a JSON object"):
        decode_binary_frame(b"\x00\x00\x00\x03[] ")

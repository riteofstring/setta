from urllib.parse import parse_qs, urlparse

from setta.api.listener import SettaListener
from setta.types.id import ID


def test_websocket_endpoint_omits_share_session_id_when_missing() -> None:
    listener = SettaListener(project_config_id=ID("proj-1"))

    parsed = urlparse(listener.websocket_endpoint)

    assert parsed.query == ""


def test_websocket_endpoint_includes_share_session_id() -> None:
    listener = SettaListener(
        project_config_id=ID("proj-1"),
        share_session_id="session-a",
    )

    parsed = urlparse(listener.websocket_endpoint)
    params = parse_qs(parsed.query)

    assert params.get("shareSessionId") == ["session-a"]

import unittest
from urllib.parse import parse_qs, urlparse

from setta.api.listener import SettaListener
from setta.types.id import ID


class SettaListenerWebsocketEndpointTests(unittest.TestCase):
    def test_websocket_endpoint_omits_share_session_id_when_missing(self) -> None:
        listener = SettaListener(project_config_id=ID("proj-1"))

        parsed = urlparse(listener.websocket_endpoint)

        self.assertEqual("", parsed.query)

    def test_websocket_endpoint_includes_share_session_id(self) -> None:
        listener = SettaListener(
            project_config_id=ID("proj-1"),
            share_session_id="session-a",
        )

        parsed = urlparse(listener.websocket_endpoint)
        params = parse_qs(parsed.query)

        self.assertEqual(["session-a"], params.get("shareSessionId"))

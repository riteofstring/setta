#!/usr/bin/env python3

import argparse
import copy
import json
import signal
import threading
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HEALTH_PATH = "/health"
EVENT_PATH = "/event"
APP_STATE_EVENT_TYPE = "app-state"
CONSOLE_EVENT_TYPES = frozenset({"console", "page-error", "unhandledrejection"})
PERFORMANCE_APP_STATE_KIND_PREFIXES = ("gpu-flow-", "perf-")
PERFORMANCE_EVENT_PREFIX = "performance-"
TRANSPORT_EVENT_PREFIXES = ("network-", "websocket-")
TRANSPORT_DETAIL_KEYS = (
    "detailText",
    "detailJson",
    "detailBodyText",
    "detailBodyJson",
)
TRANSPORT_DETAIL_EVENT_KEYS = (
    "type",
    "requestId",
    "transport",
    "method",
    "url",
    "status",
    "direction",
    "socketId",
    "kind",
    "size",
)
TRANSPORT_DETAIL_PAYLOAD_KEYS = (
    "sequenceNumber",
    "receivedAt",
    "tabId",
    "tabUrl",
    "frameId",
)


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class RecorderState:
    artifact_dir: Path
    events: list[dict] = field(default_factory=list)
    event_counts_by_type: Counter[str] = field(default_factory=Counter)
    lock: threading.Lock = field(default_factory=threading.Lock)
    started_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        self.events_file = self.artifact_dir / "events.ndjson"
        self.recording_file = self.artifact_dir / "recording.json"
        self.session_file = self.artifact_dir / "session.json"
        self.console_file = self.artifact_dir / "console.ndjson"
        self.transport_file = self.artifact_dir / "transport.ndjson"
        self.transport_details_file = self.artifact_dir / "transport_details.ndjson"
        self.app_state_file = self.artifact_dir / "app_state.ndjson"
        self.performance_file = self.artifact_dir / "performance.ndjson"
        self.events_file.write_text("", encoding="utf-8")
        self.console_file.write_text("", encoding="utf-8")
        self.transport_file.write_text("", encoding="utf-8")
        self.transport_details_file.write_text("", encoding="utf-8")
        self.app_state_file.write_text("", encoding="utf-8")
        self.performance_file.write_text("", encoding="utf-8")

    def append_event(self, payload: dict) -> None:
        with self.lock:
            normalized_payload, transport_detail = split_transport_details(payload)
            self.events.append(normalized_payload)
            event_type = event_type_from_payload(normalized_payload)
            if event_type is not None:
                self.event_counts_by_type[event_type] += 1
            for path, line_payload in self._iter_event_artifact_writes(
                event_type=event_type,
                normalized_payload=normalized_payload,
                transport_detail=transport_detail,
            ):
                append_ndjson_line(path, line_payload)

    def _iter_event_artifact_writes(
        self,
        *,
        event_type: str | None,
        normalized_payload: dict,
        transport_detail: dict | None,
    ) -> list[tuple[Path, dict]]:
        writes = [(self.events_file, normalized_payload)]
        writes.extend(
            (path, normalized_payload)
            for path in self._extra_event_artifact_paths(event_type, normalized_payload)
        )
        if transport_detail is not None and is_transport_event(event_type):
            writes.append((self.transport_details_file, transport_detail))
        return writes

    def _extra_event_artifact_paths(
        self, event_type: str | None, normalized_payload: dict
    ) -> list[Path]:
        if event_type is None:
            return []

        paths: list[Path] = []
        if is_console_event(event_type):
            paths.append(self.console_file)
        if is_transport_event(event_type):
            paths.append(self.transport_file)
        if event_type == APP_STATE_EVENT_TYPE:
            paths.append(self.app_state_file)
        if is_performance_event(event_type, normalized_payload):
            paths.append(self.performance_file)
        return paths

    def write_session_files(self, stop_reason: str) -> None:
        with self.lock:
            payload = {
                "format": "setta.chrome-repro-recorder/v1",
                "createdAt": self.started_at,
                "finalizedAt": utc_now_iso(),
                "artifactDir": str(self.artifact_dir),
                "eventCount": len(self.events),
                "eventsFile": str(self.events_file),
                "consoleEventsFile": str(self.console_file),
                "transportEventsFile": str(self.transport_file),
                "transportDetailsFile": str(self.transport_details_file),
                "appStateEventsFile": str(self.app_state_file),
                "performanceEventsFile": str(self.performance_file),
                "eventCountsByType": dict(sorted(self.event_counts_by_type.items())),
                "stopReason": stop_reason,
                "events": self.events,
            }
            session_payload = {
                "format": payload["format"],
                "createdAt": self.started_at,
                "finalizedAt": payload["finalizedAt"],
                "artifactDir": str(self.artifact_dir),
                "eventCount": len(self.events),
                "eventsFile": str(self.events_file),
                "consoleEventsFile": str(self.console_file),
                "transportEventsFile": str(self.transport_file),
                "transportDetailsFile": str(self.transport_details_file),
                "appStateEventsFile": str(self.app_state_file),
                "performanceEventsFile": str(self.performance_file),
                "eventCountsByType": payload["eventCountsByType"],
                "recordingFile": str(self.recording_file),
                "stopReason": stop_reason,
            }
            self.recording_file.write_text(
                json.dumps(payload, indent=2, ensure_ascii=True) + "\n",
                encoding="utf-8",
            )
            self.session_file.write_text(
                json.dumps(session_payload, indent=2, ensure_ascii=True) + "\n",
                encoding="utf-8",
            )


def append_ndjson_line(path: Path, payload: dict) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")


def present_keys(source: dict, keys: tuple[str, ...]) -> list[str]:
    return [key for key in keys if key in source]


def copy_present_fields(source: dict, keys: tuple[str, ...]) -> dict:
    return {key: source[key] for key in keys if key in source}


def clone_payload_without_event_fields(payload: dict, event_fields: list[str]) -> dict:
    normalized_payload = copy.deepcopy(payload)
    normalized_event = normalized_payload["event"]
    assert isinstance(normalized_event, dict)
    for key in event_fields:
        normalized_event.pop(key, None)
    return normalized_payload


def split_transport_details(payload: dict) -> tuple[dict, dict | None]:
    event = payload.get("event")
    if not isinstance(event, dict):
        return payload, None

    detail_keys = present_keys(event, TRANSPORT_DETAIL_KEYS)
    if not detail_keys:
        return payload, None

    normalized_payload = clone_payload_without_event_fields(payload, detail_keys)
    detail_event = copy_present_fields(event, TRANSPORT_DETAIL_EVENT_KEYS)
    detail_event.update(copy_present_fields(event, tuple(detail_keys)))
    detail_payload = copy_present_fields(payload, TRANSPORT_DETAIL_PAYLOAD_KEYS)
    detail_payload["event"] = detail_event
    return normalized_payload, detail_payload


def event_type_from_payload(payload: dict) -> str | None:
    event = payload.get("event")
    if not isinstance(event, dict):
        return None
    event_type = event.get("type")
    if not isinstance(event_type, str):
        return None
    normalized = event_type.strip()
    return normalized or None


def is_console_event(event_type: str | None) -> bool:
    return event_type in CONSOLE_EVENT_TYPES


def is_transport_event(event_type: str | None) -> bool:
    return bool(event_type) and event_type.startswith(TRANSPORT_EVENT_PREFIXES)


def is_performance_event(event_type: str | None, payload: dict) -> bool:
    if bool(event_type) and event_type.startswith(PERFORMANCE_EVENT_PREFIX):
        return True
    if event_type != APP_STATE_EVENT_TYPE:
        return False
    event = payload.get("event")
    if not isinstance(event, dict):
        return False
    kind = event.get("kind")
    return isinstance(kind, str) and kind.startswith(
        PERFORMANCE_APP_STATE_KIND_PREFIXES
    )


def read_json_object_request(
    handler: BaseHTTPRequestHandler,
) -> tuple[dict | None, tuple[HTTPStatus, dict] | None]:
    content_length = int(handler.headers.get("Content-Length", "0"))
    if content_length <= 0:
        return None, (HTTPStatus.BAD_REQUEST, {"ok": False, "error": "empty body"})

    raw_body = handler.rfile.read(content_length)
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        return None, (
            HTTPStatus.BAD_REQUEST,
            {"ok": False, "error": f"invalid json: {exc}"},
        )

    if not isinstance(payload, dict):
        return None, (
            HTTPStatus.BAD_REQUEST,
            {"ok": False, "error": "payload must be an object"},
        )
    return payload, None


class RecorderHandlerBase(BaseHTTPRequestHandler):
    state: RecorderState

    def _send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != HEALTH_PATH:
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False})
            return
        self._send_json(HTTPStatus.OK, {"ok": True})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != EVENT_PATH:
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False})
            return
        self._handle_event_post()

    def _handle_event_post(self) -> None:
        payload, error = read_json_object_request(self)
        if error is not None:
            self._send_json(*error)
            return
        assert payload is not None
        self.state.append_event(payload)
        self._send_json(HTTPStatus.OK, {"ok": True})

    def log_message(self, _format: str, *_args: object) -> None:
        return


def build_handler(state: RecorderState):
    return type("RecorderHandler", (RecorderHandlerBase,), {"state": state})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect Chrome repro recorder events into a local artifact dir."
    )
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", required=True, type=int)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    state = RecorderState(Path(args.artifact_dir))
    server = ThreadingHTTPServer((args.host, args.port), build_handler(state))

    stop_reason = "signal"
    stop_event = threading.Event()

    def handle_stop(_signum: int, _frame: object | None) -> None:
        nonlocal stop_reason
        if stop_event.is_set():
            return
        stop_reason = "signal"
        stop_event.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, handle_stop)
    signal.signal(signal.SIGINT, handle_stop)

    try:
        server.serve_forever()
        if not stop_event.is_set():
            stop_reason = "shutdown"
    finally:
        server.server_close()
        state.write_session_files(stop_reason=stop_reason)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

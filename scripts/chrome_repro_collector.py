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
        self.events_file.write_text("", encoding="utf-8")
        self.console_file.write_text("", encoding="utf-8")
        self.transport_file.write_text("", encoding="utf-8")
        self.transport_details_file.write_text("", encoding="utf-8")
        self.app_state_file.write_text("", encoding="utf-8")

    def append_event(self, payload: dict) -> None:
        with self.lock:
            normalized_payload, transport_detail = split_transport_details(payload)
            self.events.append(normalized_payload)
            event_type = event_type_from_payload(normalized_payload)
            if event_type is not None:
                self.event_counts_by_type[event_type] += 1
            append_ndjson_line(self.events_file, normalized_payload)
            if is_console_event(event_type):
                append_ndjson_line(self.console_file, normalized_payload)
            if is_transport_event(event_type):
                append_ndjson_line(self.transport_file, normalized_payload)
                if transport_detail is not None:
                    append_ndjson_line(self.transport_details_file, transport_detail)
            if event_type == "app-state":
                append_ndjson_line(self.app_state_file, normalized_payload)

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


def split_transport_details(payload: dict) -> tuple[dict, dict | None]:
    event = payload.get("event")
    if not isinstance(event, dict):
        return payload, None

    detail_keys = [
        key
        for key in ("detailText", "detailJson", "detailBodyText", "detailBodyJson")
        if key in event
    ]
    if len(detail_keys) == 0:
        return payload, None

    normalized_payload = copy.deepcopy(payload)
    normalized_event = normalized_payload.get("event")
    if not isinstance(normalized_event, dict):
        return normalized_payload, None
    for key in detail_keys:
        normalized_event.pop(key, None)

    detail_event = {
        key: event.get(key)
        for key in (
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
        if key in event
    }
    for key in detail_keys:
        detail_event[key] = event.get(key)

    detail_payload = {
        key: payload.get(key)
        for key in ("sequenceNumber", "receivedAt", "tabId", "tabUrl", "frameId")
        if key in payload
    }
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
    return event_type in {"console", "page-error", "unhandledrejection"}


def is_transport_event(event_type: str | None) -> bool:
    if event_type is None:
        return False
    return event_type.startswith("network-") or event_type.startswith("websocket-")


def build_handler(state: RecorderState):
    class RecorderHandler(BaseHTTPRequestHandler):
        def _send_json(self, status: HTTPStatus, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            if self.path != "/health":
                self._send_json(HTTPStatus.NOT_FOUND, {"ok": False})
                return
            self._send_json(HTTPStatus.OK, {"ok": True})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/event":
                self._send_json(HTTPStatus.NOT_FOUND, {"ok": False})
                return
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0:
                self._send_json(
                    HTTPStatus.BAD_REQUEST, {"ok": False, "error": "empty body"}
                )
                return
            raw_body = self.rfile.read(content_length)
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except json.JSONDecodeError as exc:
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"ok": False, "error": f"invalid json: {exc}"},
                )
                return
            if not isinstance(payload, dict):
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"ok": False, "error": "payload must be an object"},
                )
                return
            state.append_event(payload)
            self._send_json(HTTPStatus.OK, {"ok": True})

        def log_message(self, _format: str, *_args: object) -> None:
            return

    return RecorderHandler


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

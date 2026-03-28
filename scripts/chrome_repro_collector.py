#!/usr/bin/env python3

import argparse
import json
import signal
import threading
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
    lock: threading.Lock = field(default_factory=threading.Lock)
    started_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        self.events_file = self.artifact_dir / "events.ndjson"
        self.recording_file = self.artifact_dir / "recording.json"
        self.session_file = self.artifact_dir / "session.json"
        self.events_file.write_text("", encoding="utf-8")

    def append_event(self, payload: dict) -> None:
        with self.lock:
            self.events.append(payload)
            with self.events_file.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(payload, ensure_ascii=True) + "\n")

    def write_session_files(self, stop_reason: str) -> None:
        with self.lock:
            payload = {
                "format": "setta.chrome-repro-recorder/v1",
                "createdAt": self.started_at,
                "finalizedAt": utc_now_iso(),
                "artifactDir": str(self.artifact_dir),
                "eventCount": len(self.events),
                "eventsFile": str(self.events_file),
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

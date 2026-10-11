from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from setta.sessions import LiveSession, LiveSessionStore


def main() -> int:
    app, _command, *arguments = sys.argv[1:]
    workspace = Path(arguments[arguments.index("--project-root") + 1])
    record = workspace / "session.json"
    if (workspace / "fail-startup").exists():
        print("The example could not be loaded.", file=sys.stderr, flush=True)
        return 1
    store = LiveSessionStore()
    with store.claim(app, workspace, lambda candidate: True) as lease:
        server = HTTPServer(("127.0.0.1", 0), _Handler)
        session = LiveSession(
            app_id=app,
            project_path=str(workspace),
            url=f"http://127.0.0.1:{server.server_port}",
            owner_pid=os.getpid(),
            instance_nonce=str(os.getpid()),
        )
        _Handler.identity = {
            "appId": app,
            "projectPath": session.project_path,
            "instanceNonce": session.instance_nonce,
            "schemaVersion": f"{app}-session/v1",
        }
        lease.publish(session)
    document = session.document()
    record.write_text(json.dumps(document))
    print(json.dumps({**document, "schemaVersion": "setta-open/v1"}), flush=True)
    server.serve_forever()
    return 0


class _Handler(BaseHTTPRequestHandler):
    identity: dict[str, str]

    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(
            json.dumps(self.identity).encode()
            if self.path == "/api/v2/runtime/session"
            else b"ready"
        )

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    raise SystemExit(main())

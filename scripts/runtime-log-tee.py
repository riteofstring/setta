#!/usr/bin/env python3

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


LOCAL_URL_RE = re.compile(r"Local:\s*(http://\S+)")
READY_URL_RE = re.compile(r"Ready:\s*(http://\S+)")
SESSION_ID_RE = re.compile(r"Setta running \(session ([^)]+)\)")
RUNTIME_BLOCK_START_RE = re.compile(r"Starting Chrome with remote debugging on port (\d+)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Mirror runtime output to stdout while keeping a bounded rotated log.",
    )
    parser.add_argument("--log-path", required=True)
    parser.add_argument("--state-path", required=True)
    parser.add_argument("--max-bytes", type=int, default=64 * 1024 * 1024)
    parser.add_argument("--backups", type=int, default=2)
    return parser.parse_args()


class RuntimeState:
    def __init__(self, state_path: Path) -> None:
        self.state_path = state_path
        self.current_block: dict[str, object] = {
            "frontendUrl": None,
            "backendUrl": None,
            "debugPort": None,
            "sessionIds": [],
        }

    def reset(self, debug_port: int | None) -> None:
        self.current_block = {
            "frontendUrl": None,
            "backendUrl": None,
            "debugPort": debug_port,
            "sessionIds": [],
        }
        self.write()

    def update_from_line(self, line: str) -> None:
        runtime_match = RUNTIME_BLOCK_START_RE.search(line)
        if runtime_match:
            self.reset(int(runtime_match.group(1)))
            return

        updated = False

        local_match = LOCAL_URL_RE.search(line)
        if local_match:
            self.current_block["frontendUrl"] = local_match.group(1)
            updated = True

        ready_match = READY_URL_RE.search(line)
        if ready_match:
            self.current_block["backendUrl"] = ready_match.group(1)
            updated = True

        session_match = SESSION_ID_RE.search(line)
        if session_match:
            session_ids = self.current_block["sessionIds"]
            assert isinstance(session_ids, list)
            session_id = session_match.group(1)
            if session_id not in session_ids:
                session_ids.append(session_id)
                updated = True

        if updated:
            self.write()

    def write(self) -> None:
        payload = {
            "frontendUrl": self.current_block["frontendUrl"],
            "backendUrl": self.current_block["backendUrl"],
            "debugPort": self.current_block["debugPort"],
            "sessionIds": self.current_block["sessionIds"],
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.state_path.with_name(f"{self.state_path.name}.tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(tmp_path, self.state_path)


class RotatingLogWriter:
    def __init__(self, log_path: Path, max_bytes: int, backups: int) -> None:
        self.log_path = log_path
        self.max_bytes = max_bytes
        self.backups = backups
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.log_path.open("ab")
        self.current_size = self.log_path.stat().st_size if self.log_path.exists() else 0

    def rotate(self) -> None:
        self.handle.close()
        if self.backups > 0:
            oldest_backup = self.log_path.with_name(f"{self.log_path.name}.{self.backups}")
            if oldest_backup.exists():
                oldest_backup.unlink()
            for index in range(self.backups - 1, 0, -1):
                src = self.log_path.with_name(f"{self.log_path.name}.{index}")
                dst = self.log_path.with_name(f"{self.log_path.name}.{index + 1}")
                if src.exists():
                    os.replace(src, dst)
            if self.log_path.exists():
                os.replace(self.log_path, self.log_path.with_name(f"{self.log_path.name}.1"))
        else:
            self.log_path.unlink(missing_ok=True)
        self.handle = self.log_path.open("wb")
        self.current_size = 0

    def write(self, chunk: bytes) -> None:
        if self.max_bytes > 0 and self.current_size > 0 and self.current_size + len(chunk) > self.max_bytes:
            self.rotate()
        self.handle.write(chunk)
        self.handle.flush()
        self.current_size += len(chunk)

    def close(self) -> None:
        self.handle.close()


def main() -> int:
    args = parse_args()
    if args.max_bytes <= 0:
        raise SystemExit("--max-bytes must be positive.")
    if args.backups < 0:
        raise SystemExit("--backups must be zero or greater.")

    log_writer = RotatingLogWriter(Path(args.log_path), args.max_bytes, args.backups)
    runtime_state = RuntimeState(Path(args.state_path))

    try:
        while True:
            chunk = sys.stdin.buffer.readline()
            if chunk == b"":
                break
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            log_writer.write(chunk)
            runtime_state.update_from_line(chunk.decode("utf-8", errors="replace"))
    finally:
        log_writer.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

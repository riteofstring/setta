#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import pathlib
import tempfile
import time
from datetime import datetime, timezone


DEFAULT_ROOT = pathlib.Path("/home/sprite/.setta/cold-soak")


def fsync_directory(path: pathlib.Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_write(path: pathlib.Path, value: str) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = pathlib.Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as destination:
            destination.write(value)
            destination.flush()
            os.fsync(destination.fileno())
        os.replace(temporary_path, path)
        fsync_directory(path.parent)
    finally:
        temporary_path.unlink(missing_ok=True)


def read_integer(path: pathlib.Path) -> int:
    return int(path.read_text(encoding="utf-8").strip())


def read_history(path: pathlib.Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def current_boot_id() -> str:
    overridden = os.environ.get("SETTA_COLD_SOAK_BOOT_ID")
    if overridden:
        return overridden
    return pathlib.Path("/proc/sys/kernel/random/boot_id").read_text(encoding="utf-8").strip()


def read_probe(root: pathlib.Path) -> None:
    sentinel = (root / "persistence-sentinel").read_bytes()
    result = {
        "sentinel_sha256": hashlib.sha256(sentinel).hexdigest(),
        "service_start_count": read_integer(root / "service-start-count"),
        "service_start_history": read_history(root / "service-start-history.jsonl"),
        "service_heartbeat": read_integer(root / "service-heartbeat"),
        "current_boot_id": current_boot_id(),
    }
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))


def run_service(root: pathlib.Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    counter_path = root / "service-start-count"
    history_path = root / "service-start-history.jsonl"
    heartbeat_path = root / "service-heartbeat"

    try:
        count = read_integer(counter_path)
    except FileNotFoundError:
        count = 0

    entry = {
        "boot_id": current_boot_id(),
        "pid": os.getpid(),
        "started_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    with history_path.open("a", encoding="utf-8") as history:
        history.write(json.dumps(entry, separators=(",", ":"), sort_keys=True) + "\n")
        history.flush()
        os.fsync(history.fileno())
    fsync_directory(root)
    atomic_write(counter_path, f"{count + 1}\n")
    atomic_write(heartbeat_path, "0\n")

    heartbeat = 0
    while True:
        heartbeat += 1
        atomic_write(heartbeat_path, f"{heartbeat}\n")
        time.sleep(0.1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--read", action="store_true")
    arguments = parser.parse_args()
    root = pathlib.Path(os.environ.get("SETTA_COLD_SOAK_ROOT", DEFAULT_ROOT))
    if arguments.read:
        read_probe(root)
        return
    run_service(root)


if __name__ == "__main__":
    main()

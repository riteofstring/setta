#!/usr/bin/env python3
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import time


CGROUP_ROOT = pathlib.Path("/sys/fs/cgroup")


def cgroup_path():
    for line in pathlib.Path("/proc/self/cgroup").read_text(encoding="utf-8").splitlines():
        fields = line.split(":", 2)
        if len(fields) == 3 and fields[0] == "0":
            return CGROUP_ROOT / fields[2].lstrip("/")
    raise RuntimeError("unified cgroup v2 path is unavailable")


def scalar(path):
    value = path.read_text(encoding="utf-8").strip()
    return 0 if value == "max" else int(value)


def raw_scalar(path):
    return path.read_text(encoding="utf-8").strip()


def keyed(path):
    result = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        name, value = line.split()
        result[name] = int(value)
    return result


def tree_bytes(root):
    logical = 0
    allocated = 0
    if not root.exists():
        return logical, allocated
    for path in root.rglob("*"):
        if path.is_file() and not path.is_symlink():
            status = path.stat()
            logical += status.st_size
            allocated += status.st_blocks * 512
    return logical, allocated


def snapshot(root):
    child = cgroup_path()
    whole = CGROUP_ROOT
    logical, allocated = tree_bytes(root)
    memory_maximum = raw_scalar(whole / "memory.max")
    # cpu.max contains quota and period; retain the provider value verbatim.
    cpu_maximum = raw_scalar(whole / "cpu.max")
    print(
        json.dumps(
            {
                "whole_path": str(whole),
                "child_path": str(child),
                "cpu_whole": keyed(whole / "cpu.stat"),
                "cpu_child": keyed(child / "cpu.stat"),
                "memory_whole": {
                    "current": scalar(whole / "memory.current"),
                    "peak": scalar(whole / "memory.peak"),
                    **{f"event_{key}": value for key, value in keyed(whole / "memory.events").items()},
                },
                "memory_child": {
                    "current": scalar(child / "memory.current"),
                    "peak": scalar(child / "memory.peak"),
                    **{f"event_{key}": value for key, value in keyed(child / "memory.events").items()},
                },
                "memory_maximum": memory_maximum,
                "cpu_maximum": cpu_maximum,
                "logical_bytes": logical,
                "allocated_bytes": allocated,
            },
            sort_keys=True,
        )
    )


def write_bytes(root, count):
    root.mkdir(parents=True, exist_ok=True)
    path = root / "payload.bin"
    block = bytes(range(256)) * 4096
    remaining = count
    with path.open("wb") as destination:
        while remaining:
            chunk = block[: min(len(block), remaining)]
            destination.write(chunk)
            remaining -= len(chunk)
        destination.flush()
        os.fsync(destination.fileno())
    directory = os.open(root, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def delete_trim(root):
    shutil.rmtree(root, ignore_errors=True)
    try:
        result = subprocess.run(
            ["/sbin/fstrim", "-v", "/"],
            check=False,
            capture_output=True,
            text=True,
        )
        evidence = {"exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    except FileNotFoundError:
        evidence = {"unavailable": "/sbin/fstrim is absent"}
    print(json.dumps(evidence, sort_keys=True))


def burn_cpu(seconds):
    deadline = time.monotonic() + seconds
    value = 1
    while time.monotonic() < deadline:
        value = (value * 1103515245 + 12345) & 0x7FFFFFFF
    print(value)


def start_preview(port):
    root = pathlib.Path("/tmp/setta-phase1c-preview")
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.html").write_text("phase1c-preview\n", encoding="utf-8")
    subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(root)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                print(json.dumps({"port": port, "ready": True}))
                return
        except OSError:
            time.sleep(0.05)
    raise RuntimeError("preview server did not become ready")


def lease(action, name, seconds):
    methods = {"acquired": "POST", "renewed": "PUT", "released": "DELETE"}
    method = methods[action]
    path = "/v1/tasks" if action == "acquired" else f"/v1/tasks/{name}"
    body = b""
    if action != "released":
        fields = {"expire": seconds}
        if action == "acquired":
            fields["name"] = name
        body = json.dumps(fields, separators=(",", ":")).encode("utf-8")
    request = (
        f"{method} {path} HTTP/1.1\r\nHost: sprite\r\nContent-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n"
    ).encode("ascii") + body
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.connect("/.sprite/api.sock")
    connection.sendall(request)
    response = bytearray()
    while True:
        chunk = connection.recv(65536)
        if not chunk:
            break
        response.extend(chunk)
    connection.close()
    header, _, payload = bytes(response).partition(b"\r\n\r\n")
    status = int(header.split(b" ", 2)[1])
    expected = 204 if action == "released" else (201 if action == "acquired" else 200)
    if status != expected:
        raise RuntimeError(f"lease {action} returned HTTP {status}")
    decoded = {} if not payload else json.loads(payload)
    print(json.dumps({"action": action, "status": status, "lease": decoded}, sort_keys=True))


def main():
    command = sys.argv[1]
    if command == "snapshot":
        snapshot(pathlib.Path(sys.argv[2]))
    elif command == "write":
        write_bytes(pathlib.Path(sys.argv[2]), int(sys.argv[3]))
    elif command == "delete-trim":
        delete_trim(pathlib.Path(sys.argv[2]))
    elif command == "cpu":
        burn_cpu(int(sys.argv[2]))
    elif command == "preview-start":
        start_preview(int(sys.argv[2]))
    elif command == "lease":
        lease(sys.argv[2], sys.argv[3], int(sys.argv[4]))
    else:
        raise RuntimeError(f"unsupported command: {command}")


if __name__ == "__main__":
    main()

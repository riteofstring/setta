from __future__ import annotations

import contextlib
import copy
import http.server
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from collections.abc import Iterator
from pathlib import Path
from typing import Any, cast

from scripts import run_local_setta

ROOT = Path(__file__).resolve().parents[3]
CANVAS_BACKEND = ROOT / "apps" / "python-canvas" / "backend"
BENCH_BACKEND = ROOT / "apps" / "bench" / "backend"


class _CanvasContractServer(http.server.ThreadingHTTPServer):
    def __init__(self, documents: dict[str, object]) -> None:
        super().__init__(("127.0.0.1", 0), _CanvasContractHandler)
        self.documents = documents
        self.requests: list[str] = []


class _CanvasContractHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        server = cast(_CanvasContractServer, self.server)
        server.requests.append(self.path)
        document = server.documents.get(self.path)
        if document is None:
            self.send_error(404)
            return
        content = json.dumps(document, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args: Any) -> None:
        return


class CanvasBenchHandoffTests(unittest.TestCase):
    def test_native_export_import_and_launch_preserve_canvas_semantics(self) -> None:
        go = run_local_setta._pinned_go()
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            canvas_binary = _native_path(root, "python-canvas")
            bench_binary = _native_path(root, "bench")
            _build_native(go, CANVAS_BACKEND, "./cmd/python-canvas", canvas_binary)
            _build_native(go, BENCH_BACKEND, "./cmd/bench", bench_binary)

            canvas_root = root / "canvas-project"
            canvas_state = (
                canvas_root / "nested" / ".local" / "python-canvas" / "project.json"
            )
            canvas_state.parent.mkdir(parents=True)
            snapshot = _canvas_snapshot()
            venv_root = canvas_root / ".venv"
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "venv",
                    "--without-pip",
                    str(venv_root),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            venv_python = venv_root / (
                "Scripts/python.exe" if os.name == "nt" else "bin/python"
            )
            identity: dict[str, object] = {
                "schemaVersion": "python-canvas-session/v1",
                "appId": "python-canvas",
                "projectPath": str(canvas_state.resolve()),
                "instanceNonce": "canvas-bench-handoff",
            }
            bundle_root = root / "canvas-bundle"
            with _serve_canvas(snapshot, identity) as (canvas_url, canvas_server):
                exported = subprocess.run(
                    [
                        str(canvas_binary),
                        "export-bench",
                        "--url",
                        canvas_url,
                        "--callable",
                        "callable:scale",
                        "--output",
                        str(bundle_root),
                        "--python",
                        str(Path(sys.executable).resolve()),
                    ],
                    cwd=ROOT,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
            self.assertEqual(exported.returncode, 0, exported.stderr)
            export_result = json.loads(exported.stdout)
            self.assertEqual(
                canvas_server.requests,
                ["/api/v2/project", "/api/v2/runtime/session"],
            )
            self.assertEqual(export_result["bundleDirectory"], str(bundle_root))
            bundle = json.loads(
                (bundle_root / "bench-candidate.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                Path(bundle["candidate"]["command"]["argv"][0]).resolve(),
                venv_python.resolve(),
            )
            self.assertEqual(bundle["source"]["callableId"], "callable:scale")
            runtime = json.loads(
                (bundle_root / "runtime.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                runtime["parameters"],
                [
                    {
                        "name": "value",
                        "passingStyle": "positional_only",
                        "hasDefault": True,
                    }
                ],
            )
            self.assertIn(
                "state.Scale = make_scaler(state.Factor)",
                (bundle_root / "program.py").read_text(encoding="utf-8"),
            )

            bench_root = root / "bench-project"
            bench_root.mkdir()
            (bench_root / "cases.jsonl").write_text(
                "\n".join(
                    (
                        json.dumps(
                            {
                                "id": "explicit",
                                "input": {"value": 7},
                                "expected": 28,
                            }
                        ),
                        json.dumps({"id": "default", "input": {}, "expected": 20}),
                    )
                )
                + "\n",
                encoding="utf-8",
            )
            web_root = root / "web"
            web_root.mkdir()
            (web_root / "index.html").write_text("<!doctype html>\n", encoding="utf-8")
            with _serve_bench(bench_binary, bench_root, web_root) as bench_url:
                initial = _bench_json(bench_url, "/api/v1/project")
                imported_project = _bench_json(
                    bench_url,
                    "/api/v1/candidates/import",
                    method="POST",
                    expected_status=200,
                    document={
                        "projectId": initial["id"],
                        "expectedRevision": initial["revision"],
                        "bundleDirectory": str(bundle_root),
                    },
                )
                imported = next(
                    candidate
                    for candidate in imported_project["candidates"]
                    if candidate["id"] == export_result["candidateId"]
                )
                imported_material = bench_root / Path(
                    imported["command"]["workingDirectory"]
                )
                self.assertTrue((imported_material / "candidate.py").is_file())
                self.assertEqual(
                    imported["command"]["argv"][0],
                    bundle["candidate"]["command"]["argv"][0],
                )
                self.assertEqual(imported["origin"], bundle["source"])

                mirror = copy.deepcopy(imported)
                mirror["id"] = "canvas-mirror"
                mirror["name"] = "Canvas mirror"
                mirror["origin"] = None
                draft = {
                    "name": "Canvas handoff",
                    "caseSet": {
                        "id": "cases",
                        "name": "Inputs",
                        "manifest": "cases.jsonl",
                    },
                    "candidates": [imported, mirror],
                    "evaluator": None,
                    "execution": {"concurrency": 1, "timeoutMilliseconds": 10_000},
                    "presentation": {
                        "sections": {
                            "cases": _layout(80, 180, 1),
                            imported["id"]: _layout(460, 80, 2),
                            mirror["id"]: _layout(460, 320, 3),
                        },
                        "viewport": {"x": 0, "y": 0, "zoom": 1},
                    },
                }
                configured = _bench_json(
                    bench_url,
                    "/api/v1/project",
                    method="PUT",
                    expected_status=200,
                    document={
                        "projectId": imported_project["id"],
                        "expectedRevision": imported_project["revision"],
                        "project": draft,
                    },
                )
                ready = _bench_json(bench_url, "/api/v1/snapshot")
                self.assertEqual(
                    ready["validation"],
                    {
                        "ready": True,
                        "caseCount": 2,
                        "executionCount": 4,
                        "issues": [],
                    },
                )
                launch = _bench_json(
                    bench_url,
                    "/api/v1/launches",
                    method="POST",
                    expected_status=202,
                    document={
                        "projectId": configured["id"],
                        "expectedRevision": configured["revision"],
                        "candidateIds": [imported["id"], mirror["id"]],
                    },
                )
                finished = _wait_for_runs(bench_url, set(launch["runIds"]))

            imported_run = next(
                run for run in finished["runs"] if run["candidateId"] == imported["id"]
            )
            self.assertEqual(imported_run["status"], "completed")
            results = {
                result["caseId"]: result for result in imported_run["caseResults"]
            }
            self.assertEqual(results["explicit"]["output"], 28)
            self.assertEqual(results["default"]["output"], 20)
            for result in results.values():
                self.assertEqual(result["status"], "succeeded")
                self.assertIsNone(result["error"])
                self.assertEqual(result["stderr"], "")


def _native_path(root: Path, name: str) -> Path:
    return root / (name + ".exe" if os.name == "nt" else name)


def _build_native(go: Path, cwd: Path, package: str, output: Path) -> None:
    subprocess.run(
        [
            str(go),
            "build",
            "-mod=readonly",
            "-trimpath",
            "-buildvcs=false",
            "-o",
            str(output),
            package,
        ],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )


def _canvas_snapshot() -> dict[str, object]:
    prefix = (
        "def make_scaler(factor):\n"
        "    def scale(value=5, /):\n"
        "        return value * factor\n"
        "    return scale"
    )
    body = (
        "class SettaState:\n"
        "    def __init__(state):\n"
        "        state.Factor = 4\n"
        "        state.Scale = make_scaler(state.Factor)"
    )
    suffix = "state = SettaState()"
    code = prefix + "\n\n" + body + "\n\n" + suffix
    body_start = len((prefix + "\n\n").encode("utf-8"))
    return {
        "version": "v2",
        "project": {
            "id": "project:handoff",
            "name": "Canvas handoff",
            "revision": 9,
        },
        "pythonTarget": {"prefix": prefix, "suffix": suffix},
        "callables": [
            {
                "id": "callable:scale",
                "name": "Scale value",
                "authoredExpression": "state.Scale",
                "parameters": [
                    {
                        "id": "parameter:value",
                        "name": "value",
                        "nameEditable": False,
                        "passingStyle": "positional_only",
                        "typeAnnotation": None,
                        "default": "5",
                        "providerOrdinal": 0,
                        "authoredExpression": "",
                        "ui": {
                            "type": "CodeParam",
                            "configuration": {
                                "disabled": False,
                                "language": "python",
                                "placeholder": None,
                                "singleLine": True,
                                "wrapLines": True,
                            },
                        },
                    }
                ],
            }
        ],
        "parameterDictionaries": [],
        "lists": [],
        "topLevelSectionIds": ["callable:scale"],
        "generatedCode": {
            "code": code,
            "body": body,
            "generatedBodyRange": {
                "start": body_start,
                "end": body_start + len(body.encode("utf-8")),
            },
            "sourceRangesByTargetId": {},
        },
        "diagnostics": [],
        "diagnosticsRevision": 9,
        "providerStatus": {
            "provider": "basedpyright",
            "status": "unavailable",
            "state": "not_started",
        },
    }


@contextlib.contextmanager
def _serve_canvas(
    snapshot: dict[str, object], identity: dict[str, object]
) -> Iterator[tuple[str, _CanvasContractServer]]:
    server = _CanvasContractServer(
        {
            "/api/v2/project": snapshot,
            "/api/v2/runtime/session": identity,
        }
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@contextlib.contextmanager
def _serve_bench(binary: Path, project_root: Path, web_root: Path) -> Iterator[str]:
    process = subprocess.Popen(
        [
            str(binary),
            "serve",
            "--project-root",
            str(project_root),
            "--create=true",
            "--web-root",
            str(web_root),
            "--session-nonce",
            "canvas-bench-handoff",
            "--supervised-stdin=true",
            "--port",
            "0",
        ],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    try:
        readiness = json.loads(_readline(process, 10))
        if readiness.get("app") != "bench":
            raise AssertionError(f"unexpected Bench readiness: {readiness!r}")
        yield readiness["url"]
    finally:
        _stop_process(process)


def _readline(process: subprocess.Popen[str], timeout: float) -> str:
    stdout = process.stdout
    if stdout is None:
        raise AssertionError("Bench stdout is unavailable")
    result: queue.Queue[str] = queue.Queue(maxsize=1)
    thread = threading.Thread(target=lambda: result.put(stdout.readline()), daemon=True)
    thread.start()
    try:
        line = result.get(timeout=timeout)
    except queue.Empty as error:
        process.kill()
        process.wait(timeout=5)
        detail = process.stderr.read() if process.stderr is not None else ""
        raise AssertionError(f"Bench readiness timed out: {detail}") from error
    if line == "":
        detail = process.stderr.read() if process.stderr is not None else ""
        raise AssertionError(f"Bench exited before readiness: {detail}")
    return line


def _stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is None and process.stdin is not None:
        process.stdin.close()
    try:
        return_code = process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        return_code = process.wait(timeout=5)
    detail = process.stderr.read() if process.stderr is not None else ""
    for stream in (process.stdin, process.stdout, process.stderr):
        if stream is not None and not stream.closed:
            stream.close()
    if return_code != 0:
        raise AssertionError(f"Bench exited with {return_code}: {detail}")


def _bench_json(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    expected_status: int = 200,
    document: dict[str, object] | None = None,
) -> Any:
    content = None
    headers = {"Accept": "application/json"}
    if document is not None:
        content = json.dumps(document, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if method != "GET":
        headers["Origin"] = base_url
    request = urllib.request.Request(
        base_url + path,
        data=content,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status != expected_status:
                message = (
                    f"{method} {path} returned {response.status}, "
                    f"want {expected_status}"
                )
                raise AssertionError(message)
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise AssertionError(
            f"{method} {path} failed: {error.code} {detail}"
        ) from error


def _wait_for_runs(
    base_url: str, run_ids: set[str], timeout: float = 15
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    terminal = {"completed", "failed", "canceled", "interrupted"}
    while time.monotonic() < deadline:
        snapshot = cast(dict[str, Any], _bench_json(base_url, "/api/v1/snapshot"))
        selected = [run for run in snapshot["runs"] if run["id"] in run_ids]
        if len(selected) == len(run_ids) and all(
            run["status"] in terminal for run in selected
        ):
            return snapshot
        time.sleep(0.05)
    raise AssertionError(f"Bench runs did not finish within {timeout:g} seconds")


def _layout(x: int, y: int, z_index: int) -> dict[str, int]:
    return {"x": x, "y": y, "width": 300, "height": 180, "zIndex": z_index}


if __name__ == "__main__":
    unittest.main()

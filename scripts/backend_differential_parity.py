#!/usr/bin/env python

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import textwrap
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import yaml
from websockets.sync.client import connect as websocket_connect

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
VENV_BIN_DIR = REPO_ROOT / ".venv" / "bin"
DEFAULT_MANIFEST_PATH = SCRIPT_DIR / "backend-differential-parity-scenarios.yaml"
PROJECT_FILE_NAME = "project.json"
SETTINGS_FILE_NAME = "settings.json"
BOOTSTRAP_TOKEN_LINE_RE = re.compile(r"^\s*Token:\s+(\S+)\s*$", re.MULTILINE)
BOOTSTRAP_URL_RE = re.compile(r"https?://\S+/__setta__/bootstrap#token=(\S+)")
GO_FRONTEND_WEBSOCKET_ROUTE_RE = re.compile(
    r'^\s*RouteFrontend\s*=\s*"([^"]+)"', re.MULTILINE
)
PY_FRONTEND_WEBSOCKET_ROUTE_RE = re.compile(
    r'^\s*WEBSOCKET_FRONTEND\s*=\s*"([^"]+)"', re.MULTILINE
)
PY_ROUTE_PREFIX_RE = re.compile(r'^\s*PREFIX\s*=\s*"([^"]+)"', re.MULTILINE)
REQUEST_TIMEOUT_SECONDS = 10.0
STARTUP_TIMEOUT_SECONDS = 60.0
WEBSOCKET_TIMEOUT_SECONDS = 6.0
POLL_INTERVAL_SECONDS = 0.2
CURRENT_GO_BIN: str | None = None

ROUTE_CREATE_PROJECT_CONFIG = "/api/createProjectConfig"
ROUTE_LOAD_ALL_PROJECT_METADATA = "/api/loadAllProjectMetadata"
ROUTE_LOAD_PROJECT_CONFIG = "/api/loadProjectConfig"
ROUTE_GET_LATEST_PROJECT_STATE = "/api/getLatestProjectState"
ROUTE_TOGGLE_IS_EDITING_VIEW_MODE = "/api/toggleIsEditingViewMode"


class ParityHarnessError(RuntimeError):
    pass


@dataclass(frozen=True)
class ScenarioConfig:
    name: str
    kind: str
    seed: str
    fixture: Path | None
    description: str | None


@dataclass(frozen=True)
class RefTarget:
    label: str
    root: Path


@dataclass
class ScenarioRunResult:
    scenario_name: str
    ref_label: str
    summary: dict[str, Any]
    raw: dict[str, Any]
    log_path: Path


@dataclass
class BackendSession:
    target: RefTarget
    process: subprocess.Popen[str]
    session: requests.Session
    workspace_root: Path
    setta_home: Path
    setta_files_root: Path
    base_url: str
    websocket_url: str
    frontend_origin: str
    log_path: Path
    temp_root: Path

    def close(self) -> None:
        try:
            self.session.close()
        finally:
            terminate_process(self.process)
            shutil.rmtree(self.temp_root, ignore_errors=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run a small differential backend parity harness against the current "
            "worktree and a baseline git ref."
        )
    )
    parser.add_argument(
        "--baseline-ref",
        default="main",
        help="Git ref to compare against. Ignored when --baseline-worktree is set.",
    )
    parser.add_argument(
        "--baseline-worktree",
        help="Existing checkout/worktree to use as the baseline instead of creating a temporary one.",
    )
    parser.add_argument(
        "--manifest",
        default=str(DEFAULT_MANIFEST_PATH),
        help="Scenario manifest path.",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        help="Run only the named scenario. Repeat to include multiple scenarios.",
    )
    parser.add_argument(
        "--artifacts-dir",
        help="Optional directory to write per-scenario raw outputs.",
    )
    parser.add_argument(
        "--keep-baseline-worktree",
        action="store_true",
        help="Keep the temporary baseline worktree on disk after the run.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest_path = Path(args.manifest).resolve()
    scenarios = load_manifest(manifest_path)
    if args.only:
        only = {name.strip() for name in args.only if name.strip()}
        scenarios = [scenario for scenario in scenarios if scenario.name in only]
        missing = sorted(only.difference({scenario.name for scenario in scenarios}))
        if missing:
            raise ParityHarnessError(
                "Unknown scenario name(s): " + ", ".join(missing)
            )
    if not scenarios:
        raise ParityHarnessError("No parity scenarios selected.")

    artifacts_dir = None
    if args.artifacts_dir:
        artifacts_dir = Path(args.artifacts_dir).resolve()
        artifacts_dir.mkdir(parents=True, exist_ok=True)

    baseline_root, cleanup_baseline = prepare_baseline_root(
        repo_root=REPO_ROOT,
        baseline_ref=args.baseline_ref,
        baseline_worktree=args.baseline_worktree,
        keep_baseline_worktree=args.keep_baseline_worktree,
    )
    current_target = RefTarget(label="current", root=REPO_ROOT)
    baseline_target = RefTarget(label=f"baseline:{args.baseline_ref}", root=baseline_root)

    mismatches: list[str] = []
    try:
        for scenario in scenarios:
            print(f"\n== {scenario.name} ==", flush=True)
            baseline_result = run_scenario(target=baseline_target, scenario=scenario)
            current_result = run_scenario(target=current_target, scenario=scenario)

            if artifacts_dir is not None:
                write_artifact(artifacts_dir, baseline_result)
                write_artifact(artifacts_dir, current_result)

            if baseline_result.summary == current_result.summary:
                print("PASS", flush=True)
                print(
                    json.dumps(current_result.summary, indent=2, sort_keys=True),
                    flush=True,
                )
                continue

            print("MISMATCH", flush=True)
            print(f"baseline log: {baseline_result.log_path}", flush=True)
            print(f"current log:  {current_result.log_path}", flush=True)
            print(
                render_summary_diff(
                    baseline_label=baseline_target.label,
                    baseline_summary=baseline_result.summary,
                    current_label=current_target.label,
                    current_summary=current_result.summary,
                ),
                flush=True,
            )
            mismatches.append(scenario.name)
    finally:
        cleanup_baseline()

    if mismatches:
        print(
            "\nParity mismatches found: " + ", ".join(mismatches),
            file=sys.stderr,
            flush=True,
        )
        return 1

    print("\nAll selected parity scenarios matched.", flush=True)
    return 0


def load_manifest(path: Path) -> list[ScenarioConfig]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ParityHarnessError(f"Manifest must be a mapping: {path}")
    raw_scenarios = payload.get("scenarios")
    if not isinstance(raw_scenarios, list):
        raise ParityHarnessError(f"Manifest must contain a scenarios list: {path}")

    scenarios: list[ScenarioConfig] = []
    for raw_entry in raw_scenarios:
        if not isinstance(raw_entry, dict):
            raise ParityHarnessError(f"Scenario entry must be a mapping: {raw_entry!r}")
        name = str(raw_entry.get("name", "")).strip()
        kind = str(raw_entry.get("kind", "")).strip()
        seed = str(raw_entry.get("seed", "empty")).strip() or "empty"
        fixture = raw_entry.get("fixture")
        description = raw_entry.get("description")
        if not name:
            raise ParityHarnessError(f"Scenario missing name in {path}")
        if not kind:
            raise ParityHarnessError(f"Scenario {name} missing kind in {path}")
        fixture_path = None
        if fixture is not None:
            fixture_path = (path.parent / str(fixture)).resolve()
            if not fixture_path.exists():
                raise ParityHarnessError(
                    f"Scenario {name} fixture does not exist: {fixture_path}"
                )
        scenarios.append(
            ScenarioConfig(
                name=name,
                kind=kind,
                seed=seed,
                fixture=fixture_path,
                description=None if description is None else str(description),
            )
        )
    return scenarios


def prepare_baseline_root(
    repo_root: Path,
    baseline_ref: str,
    baseline_worktree: str | None,
    keep_baseline_worktree: bool,
) -> tuple[Path, Any]:
    if baseline_worktree:
        existing_root = Path(baseline_worktree).resolve()
        if not existing_root.exists():
            raise ParityHarnessError(
                f"Baseline worktree does not exist: {existing_root}"
            )
        return existing_root, lambda: None

    parent = Path(
        tempfile.mkdtemp(prefix="setta-backend-parity-baseline-", dir=os.getenv("TMPDIR"))
    )
    worktree_root = parent / "baseline"
    command = [
        "git",
        "-C",
        str(repo_root),
        "worktree",
        "add",
        "--detach",
        str(worktree_root),
        baseline_ref,
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ParityHarnessError(
            "Failed to create baseline worktree:\n"
            + result.stdout
            + result.stderr
        )

    current_venv = repo_root / ".venv"
    baseline_venv = worktree_root / ".venv"
    if current_venv.exists() and not baseline_venv.exists():
        baseline_venv.symlink_to(current_venv, target_is_directory=True)

    def cleanup() -> None:
        if keep_baseline_worktree:
            print(f"Keeping baseline worktree at {worktree_root}", flush=True)
            return
        subprocess.run(
            [
                "git",
                "-C",
                str(repo_root),
                "worktree",
                "remove",
                "--force",
                str(worktree_root),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        shutil.rmtree(parent, ignore_errors=True)

    return worktree_root, cleanup


def run_scenario(target: RefTarget, scenario: ScenarioConfig) -> ScenarioRunResult:
    backend = start_backend(target, scenario)
    try:
        summary, raw = execute_scenario(backend, scenario)
        return ScenarioRunResult(
            scenario_name=scenario.name,
            ref_label=target.label,
            summary=summary,
            raw=raw,
            log_path=backend.log_path,
        )
    finally:
        backend.close()


def start_backend(target: RefTarget, scenario: ScenarioConfig) -> BackendSession:
    temp_root = Path(tempfile.mkdtemp(prefix=f"setta-backend-parity-{target.label.replace(':', '-')}-"))
    workspace_root = temp_root / "workspace"
    setta_home = temp_root / ".setta-development"
    setta_files_root = workspace_root / "setta_files"
    log_path = temp_root / "backend.log"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)
    seed_setta_files(setta_files_root, scenario)

    host = "127.0.0.1"
    port = find_free_port()
    frontend_port = find_free_port(exclude_ports={port})
    base_url = f"http://{host}:{port}"
    frontend_websocket_route = resolve_frontend_websocket_route(target.root)
    websocket_url = f"ws://{host}:{port}{frontend_websocket_route}"
    frontend_origin = f"http://{host}:{frontend_port}"

    env = os.environ.copy()
    env["PATH"] = build_child_path(env)
    env["PYTHONPATH"] = build_child_pythonpath(target.root, env.get("PYTHONPATH"))
    env["SETTA_NO_OPEN"] = "1"
    env["SETTA_HOST"] = host
    env["SETTA_PORT"] = str(port)
    env["SETTA_HOME"] = str(setta_home)
    env["SETTA_FILES_ROOT"] = str(setta_files_root)
    env["SETTA_DEV_FRONTEND_PORT"] = str(frontend_port)
    env["SETTA_BIN"] = str(write_python_setta_wrapper(temp_root))
    packaged_server_bin = REPO_ROOT / ".tools" / "dev-bin" / "setta-server"
    if packaged_server_bin.exists():
        env["SETTA_SERVER_BIN"] = str(packaged_server_bin)
    resolved_go_bin = resolve_current_go_bin()
    if resolved_go_bin:
        env["SETTA_GO_BIN"] = resolved_go_bin

    with log_path.open("w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            ["bash", "./frontend/backendStart.sh", "--no-open"],
            cwd=target.root,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )

    token = wait_for_bootstrap_token(
        process=process,
        base_url=base_url,
        log_path=log_path,
    )
    session = bootstrap_session(base_url=base_url, token=token)
    wait_for_backend_ready(
        process=process,
        session=session,
        base_url=base_url,
        log_path=log_path,
    )
    return BackendSession(
        target=target,
        process=process,
        session=session,
        workspace_root=workspace_root,
        setta_home=setta_home,
        setta_files_root=setta_files_root,
        base_url=base_url,
        websocket_url=websocket_url,
        frontend_origin=frontend_origin,
        log_path=log_path,
        temp_root=temp_root,
    )


def seed_setta_files(setta_files_root: Path, scenario: ScenarioConfig) -> None:
    setta_files_root.mkdir(parents=True, exist_ok=True)
    if scenario.seed == "none":
        return
    if scenario.seed == "empty":
        write_json(setta_files_root / PROJECT_FILE_NAME, minimal_document())
    elif scenario.seed == "fixture":
        if scenario.fixture is None:
            raise ParityHarnessError(
                f"Scenario {scenario.name} requires a fixture path."
            )
        payload = json.loads(scenario.fixture.read_text(encoding="utf-8"))
        write_json(setta_files_root / PROJECT_FILE_NAME, payload)
    else:
        raise ParityHarnessError(
            f"Unsupported seed mode {scenario.seed!r} for scenario {scenario.name}"
        )
    write_json(setta_files_root / SETTINGS_FILE_NAME, minimal_document())


def minimal_document() -> dict[str, Any]:
    return {"schemaVersion": 1, "projects": {}}


def build_child_path(env: dict[str, str]) -> str:
    current = env.get("PATH", "")
    if VENV_BIN_DIR.exists():
        return f"{VENV_BIN_DIR}{os.pathsep}{current}"
    return current


def build_child_pythonpath(target_root: Path, existing_pythonpath: str | None) -> str:
    parts = [str(target_root / "backend")]
    if existing_pythonpath:
        parts.append(existing_pythonpath)
    return os.pathsep.join(parts)


def write_python_setta_wrapper(temp_root: Path) -> Path:
    python_bin = VENV_BIN_DIR / "python"
    if not python_bin.exists():
        raise ParityHarnessError(f"Missing Python interpreter for harness wrapper: {python_bin}")
    wrapper_path = temp_root / "setta-wrapper.sh"
    wrapper_path.write_text(
        "#!/usr/bin/env bash\n"
        + "set -euo pipefail\n"
        + f'exec "{python_bin}" -m setta "$@"\n',
        encoding="utf-8",
    )
    wrapper_path.chmod(0o755)
    return wrapper_path


def resolve_current_go_bin() -> str | None:
    global CURRENT_GO_BIN
    if CURRENT_GO_BIN is not None:
        return CURRENT_GO_BIN

    result = subprocess.run(
        [str(REPO_ROOT / "scripts" / "go.sh"), "env", "GOROOT"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        CURRENT_GO_BIN = ""
        return None

    go_root = result.stdout.strip()
    if not go_root:
        CURRENT_GO_BIN = ""
        return None
    go_bin = str(Path(go_root) / "bin" / "go")
    CURRENT_GO_BIN = go_bin
    return go_bin


def resolve_frontend_websocket_route(target_root: Path) -> str:
    go_routes_path = target_root / "internal" / "wsapi" / "routes.go"
    if go_routes_path.exists():
        route = extract_regex_match(
            go_routes_path,
            GO_FRONTEND_WEBSOCKET_ROUTE_RE,
            "RouteFrontend",
        )
        if route.startswith("/"):
            return route
        raise ParityHarnessError(
            f"Resolved invalid Go frontend websocket route {route!r} from {go_routes_path}"
        )

    python_routes_path = target_root / "backend" / "setta" / "types" / "routes.py"
    if python_routes_path.exists():
        route = extract_regex_match(
            python_routes_path,
            PY_FRONTEND_WEBSOCKET_ROUTE_RE,
            "WEBSOCKET_FRONTEND",
        )
        prefix = extract_regex_match(
            python_routes_path,
            PY_ROUTE_PREFIX_RE,
            "PREFIX",
        )
        resolved = f"{prefix.rstrip('/')}{route}"
        if resolved.startswith("/"):
            return resolved
        raise ParityHarnessError(
            "Resolved invalid Python frontend websocket route "
            f"{resolved!r} from {python_routes_path}"
        )

    raise ParityHarnessError(
        "Could not resolve frontend websocket route from target checkout: "
        f"{target_root}"
    )


def extract_regex_match(path: Path, pattern: re.Pattern[str], label: str) -> str:
    contents = path.read_text(encoding="utf-8")
    match = pattern.search(contents)
    if match is None:
        raise ParityHarnessError(
            f"Could not find {label} in expected route definition file: {path}"
        )
    return match.group(1).strip()


def wait_for_bootstrap_token(
    process: subprocess.Popen[str],
    base_url: str,
    log_path: Path,
) -> str:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    last_server_error: str | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise ParityHarnessError(
                "Backend exited before startup completed.\n\n"
                + tail_log(log_path)
            )
        log_text = read_text(log_path)
        token = extract_bootstrap_token(log_text)
        if token:
            try:
                response = requests.get(
                    base_url + "/__setta__/bootstrap",
                    timeout=1.0,
                )
                if response.status_code < 500:
                    return token
            except requests.RequestException as exc:
                last_server_error = str(exc)
        time.sleep(POLL_INTERVAL_SECONDS)
    message = "Timed out waiting for backend bootstrap token."
    if last_server_error:
        message += f"\nLast server probe error: {last_server_error}"
    message += "\n\n" + tail_log(log_path)
    raise ParityHarnessError(message)


def extract_bootstrap_token(log_text: str) -> str | None:
    line_match = BOOTSTRAP_TOKEN_LINE_RE.search(log_text)
    if line_match:
        return line_match.group(1).strip()

    url_match = BOOTSTRAP_URL_RE.search(log_text)
    if not url_match:
        return None

    raw_url = url_match.group(0)
    parsed = urlparse(raw_url)
    if parsed.fragment.startswith("token="):
        return parsed.fragment.split("=", 1)[1].strip()
    return url_match.group(1).strip()


def bootstrap_session(base_url: str, token: str) -> requests.Session:
    session = requests.Session()
    session.trust_env = False
    response = session.post(
        base_url + "/__setta__/bootstrap/consume",
        json={"token": token},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise ParityHarnessError(
            f"Bootstrap consume failed with {response.status_code}: {response.text}"
        )
    if not session.cookies:
        raise ParityHarnessError("Bootstrap consume did not mint an auth cookie.")
    return session


def wait_for_backend_ready(
    process: subprocess.Popen[str],
    session: requests.Session,
    base_url: str,
    log_path: Path,
) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    last_error: str | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise ParityHarnessError(
                "Backend exited before startup completed.\n\n" + tail_log(log_path)
            )
        try:
            response = session.post(
                base_url + ROUTE_LOAD_ALL_PROJECT_METADATA,
                json={},
                timeout=1.0,
            )
            if response.status_code == 200:
                return
            last_error = f"{response.status_code}: {response.text[:400]}"
        except requests.RequestException as exc:
            last_error = str(exc)
        time.sleep(POLL_INTERVAL_SECONDS)
    message = "Timed out waiting for backend readiness."
    if last_error:
        message += f"\nLast readiness probe error: {last_error}"
    message += "\n\n" + tail_log(log_path)
    raise ParityHarnessError(message)


def execute_scenario(
    backend: BackendSession,
    scenario: ScenarioConfig,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if scenario.kind == "create_project_defaults":
        return execute_create_project_defaults(backend)
    if scenario.kind == "initial_frontend_websocket_inventory":
        return execute_initial_frontend_websocket_inventory(backend)
    if scenario.kind == "toggle_view_mode_broadcast":
        return execute_toggle_view_mode_broadcast(backend)
    if scenario.kind == "latest_state_after_create_project":
        return execute_latest_state_after_create_project(backend)
    if scenario.kind == "latest_state_empty_callable_shown_param_ids":
        return execute_latest_state_empty_callable_shown_param_ids(backend)
    raise ParityHarnessError(
        f"Unsupported scenario kind {scenario.kind!r} for {scenario.name}"
    )


def execute_create_project_defaults(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    create_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_CREATE_PROJECT_CONFIG,
        payload={"previewImgColor": "bg-orange-500/60 dark:bg-orange-600/30"},
    )
    created_name = normalize_response_json(create_response)
    if not isinstance(created_name, str) or not created_name.strip():
        raise ParityHarnessError(
            f"createProjectConfig returned unexpected payload: {created_name!r}"
        )

    load_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": created_name},
    )
    loaded = normalize_response_json(load_response)
    if not isinstance(loaded, dict):
        raise ParityHarnessError(f"loadProjectConfig returned unexpected payload: {loaded!r}")

    summary = summarize_loaded_project_state(loaded)
    raw = {
        "createProjectConfig": created_name,
        "loadProjectConfig": loaded,
    }
    return summary, raw


def execute_initial_frontend_websocket_inventory(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    envelopes = read_frontend_messages(
        websocket_url=backend.websocket_url,
        frontend_origin=backend.frontend_origin,
        cookie_header=build_cookie_header(backend.session),
        wanted_types={"FrontendIdentity", "AllConnections"},
    )
    summary = summarize_frontend_inventory(envelopes)
    return summary, {"messages": envelopes}


def execute_toggle_view_mode_broadcast(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)

    with websocket_connect(
        backend.websocket_url,
        additional_headers={"Cookie": build_cookie_header(backend.session)},
        origin=backend.frontend_origin,
        open_timeout=WEBSOCKET_TIMEOUT_SECONDS,
        proxy=None,
    ) as conn:
        initial_messages = read_messages_until_timeout(
            conn,
            timeout=2.0,
            max_messages=4,
        )
        toggle_response = post_json(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_TOGGLE_IS_EDITING_VIEW_MODE,
            payload={
                "projectConfigId": project_id,
                "frontendOpId": "toggle-view-mode-op",
            },
        )
        update_messages = read_messages_until_timeout(
            conn,
            timeout=WEBSOCKET_TIMEOUT_SECONDS,
            max_messages=6,
        )

    latest_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_GET_LATEST_PROJECT_STATE,
        payload={"projectConfigId": project_id},
    )
    latest = normalize_response_json(latest_response)
    if not isinstance(latest, dict):
        raise ParityHarnessError(
            f"getLatestProjectState returned unexpected payload: {latest!r}"
        )

    summary = summarize_toggle_view_mode_result(
        http_status=toggle_response.status_code,
        update_messages=update_messages,
        latest_payload=latest,
    )
    raw = {
        "createdProjectName": created_name,
        "initialMessages": initial_messages,
        "toggleResponse": normalize_response_json(toggle_response),
        "websocketMessages": update_messages,
        "latestProjectState": latest,
        "loadProjectConfig": loaded,
    }
    return summary, raw


def execute_latest_state_empty_callable_shown_param_ids(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_GET_LATEST_PROJECT_STATE,
        payload={"projectConfigId": "project-alpha"},
    )
    payload = normalize_response_json(response)
    if not isinstance(payload, dict):
        raise ParityHarnessError(
            f"getLatestProjectState returned unexpected payload: {payload!r}"
        )
    summary = summarize_empty_callable_latest_state(
        http_status=response.status_code,
        payload=payload,
    )
    return summary, {"latestProjectState": payload}


def execute_latest_state_after_create_project(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_GET_LATEST_PROJECT_STATE,
        payload={"projectConfigId": project_id},
    )
    payload = normalize_response_json(response)
    if not isinstance(payload, dict):
        raise ParityHarnessError(
            f"getLatestProjectState returned unexpected payload: {payload!r}"
        )
    summary = summarize_latest_state_after_create_project(
        http_status=response.status_code,
        payload=payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "loadProjectConfig": loaded,
        "latestProjectState": payload,
    }


def create_and_load_project(backend: BackendSession) -> tuple[str, dict[str, Any]]:
    create_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_CREATE_PROJECT_CONFIG,
        payload={"previewImgColor": "bg-orange-500/60 dark:bg-orange-600/30"},
    )
    created_name = normalize_response_json(create_response)
    if not isinstance(created_name, str) or not created_name.strip():
        raise ParityHarnessError(
            f"createProjectConfig returned unexpected payload: {created_name!r}"
        )
    load_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": created_name},
    )
    loaded = normalize_response_json(load_response)
    if not isinstance(loaded, dict):
        raise ParityHarnessError(f"loadProjectConfig returned unexpected payload: {loaded!r}")
    return created_name, loaded


def find_project_id_by_name(backend: BackendSession, project_name: str) -> str:
    response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_ALL_PROJECT_METADATA,
        payload={},
    )
    payload = normalize_response_json(response)
    if not isinstance(payload, dict):
        raise ParityHarnessError(
            f"loadAllProjectMetadata returned unexpected payload: {payload!r}"
        )
    entries = payload.get("projectMetadata")
    if not isinstance(entries, list):
        raise ParityHarnessError(
            f"projectMetadata must be a list, got {type(entries).__name__}"
        )
    for entry in entries:
        if not isinstance(entry, dict):
            raise ParityHarnessError(
                f"projectMetadata entry must be an object, got {type(entry).__name__}"
            )
        if normalized_string(entry.get("name")) != project_name:
            continue
        return expect_non_empty_string(entry.get("id"), "projectMetadata[].id")
    raise ParityHarnessError(
        f"Could not find created project {project_name!r} in project metadata."
    )


def post_json(
    session: requests.Session,
    base_url: str,
    route: str,
    payload: dict[str, Any],
) -> requests.Response:
    response = session.post(
        base_url + route,
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise ParityHarnessError(
            f"Request {route} failed with {response.status_code}: {response.text}"
        )
    return response


def normalize_response_json(response: requests.Response) -> Any:
    try:
        return response.json()
    except json.JSONDecodeError as exc:
        raise ParityHarnessError(
            f"Expected JSON response from {response.request.path_url}: {exc}\n{response.text}"
        ) from exc


def summarize_loaded_project_state(payload: dict[str, Any]) -> dict[str, Any]:
    project_config = object_field(payload, "projectConfig")
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    active_view_mode_id = normalized_string(project_config.get("activeViewModeId"))
    project_chat_windowing = object_field(
        payload, "projectChatWindowing", allow_missing=True
    )
    instances_by_id = object_field(
        project_chat_windowing, "instancesById", allow_missing=True
    )
    return {
        "projectNamePresent": bool(normalized_string(project_config.get("name"))),
        "projectIDPresent": bool(normalized_string(project_config.get("id"))),
        "viewModeCount": len(view_modes),
        "activeViewModeIdPresent": bool(active_view_mode_id),
        "activeViewModePresentInMap": bool(
            active_view_mode_id and active_view_mode_id in view_modes
        ),
        "isEditingViewMode": bool(project_config.get("isEditingViewMode", False)),
        "windowSpaceCount": len(
            object_field(project_config, "windowSpaces", allow_missing=True)
        ),
        "topLevelSectionCount": len(
            object_field(project_config, "topLevelSections", allow_missing=True)
        ),
        "projectChatWindowCount": len(instances_by_id),
    }


def summarize_frontend_inventory(envelopes: list[dict[str, Any]]) -> dict[str, Any]:
    identity = find_message(envelopes, "FrontendIdentity")
    inventory = find_message(envelopes, "AllConnections")
    connections = inventory.get("content") if inventory else None
    if connections is None:
        normalized_connections: list[dict[str, Any]] = []
    else:
        if not isinstance(connections, list):
            raise ParityHarnessError(
                f"AllConnections content must be a list, got {type(connections).__name__}"
            )
        normalized_connections = [
            expect_object(entry, "AllConnections[]") for entry in connections
        ]
    upper_types = sorted(
        normalized_string(entry.get("connectionType")).upper()
        for entry in normalized_connections
        if normalized_string(entry.get("connectionType"))
    )
    return {
        "frontendIdentityReceived": identity is not None,
        "allConnectionsReceived": inventory is not None,
        "connectionCount": len(normalized_connections),
        "connectionTypes": upper_types,
        "hasServerConnection": "SERVER" in upper_types,
        "frontendConnectionCount": sum(1 for value in upper_types if value == "FRONTEND"),
    }


def summarize_toggle_view_mode_result(
    http_status: int,
    update_messages: list[dict[str, Any]],
    latest_payload: dict[str, Any],
) -> dict[str, Any]:
    update = find_message(update_messages, "UpdateFrontendProjectState")
    websocket_is_editing = None
    websocket_completed_op = False
    if update is not None:
        update_content = object_field(update, "content")
        project_state = object_field(update_content, "projectState")
        project_config = object_field(project_state, "projectConfig")
        websocket_is_editing = bool(project_config.get("isEditingViewMode", False))
        completed_op_ids = update_content.get("completedOpIds") or []
        if not isinstance(completed_op_ids, list):
            raise ParityHarnessError(
                f"completedOpIds must be a list, got {type(completed_op_ids).__name__}"
            )
        websocket_completed_op = "toggle-view-mode-op" in completed_op_ids

    project_state = object_field(latest_payload, "projectState")
    project_config = object_field(project_state, "projectConfig")
    return {
        "httpStatus": http_status,
        "websocketUpdateReceived": update is not None,
        "websocketIsEditingViewMode": websocket_is_editing,
        "websocketCompletedToggleOp": websocket_completed_op,
        "latestIsEditingViewMode": bool(project_config.get("isEditingViewMode", False)),
    }


def summarize_empty_callable_latest_state(
    http_status: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    project_state = object_field(payload, "projectState")
    shown_param_ids = object_field(project_state, "shownParamIds", allow_missing=True)
    raw_shown_entry = shown_param_ids.get("empty-callable-variant")
    shown_entry = expect_object(
        raw_shown_entry, "shownParamIds.empty-callable-variant", allow_missing=True
    )
    pinned = object_field(shown_entry, "pinned", allow_missing=True)
    unpinned = object_field(shown_entry, "unpinned", allow_missing=True)
    pinned_top_level = expect_string_list(
        pinned.get("topLevelParamIds") if pinned else [],
        "shownParamIds.empty-callable-variant.pinned.topLevelParamIds",
    )
    unpinned_top_level = expect_string_list(
        unpinned.get("topLevelParamIds") if unpinned else [],
        "shownParamIds.empty-callable-variant.unpinned.topLevelParamIds",
    )
    pinned_paths = object_field(
        pinned, "requiredParamIdsToPaths", allow_missing=True
    )
    unpinned_paths = object_field(
        unpinned, "requiredParamIdsToPaths", allow_missing=True
    )
    return {
        "httpStatus": http_status,
        "shownParamEntryPresent": raw_shown_entry is not None,
        "pinnedTopLevelParamIds": pinned_top_level,
        "unpinnedTopLevelParamIds": unpinned_top_level,
        "pinnedRequiredPathCount": len(pinned_paths),
        "unpinnedRequiredPathCount": len(unpinned_paths),
    }


def summarize_latest_state_after_create_project(
    http_status: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    project_state = object_field(payload, "projectState")
    project_config = object_field(project_state, "projectConfig")
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    shown_param_ids = object_field(project_state, "shownParamIds", allow_missing=True)
    active_view_mode_id = normalized_string(project_config.get("activeViewModeId"))
    return {
        "httpStatus": http_status,
        "projectIDPresent": bool(normalized_string(project_config.get("id"))),
        "projectNamePresent": bool(normalized_string(project_config.get("name"))),
        "viewModeCount": len(view_modes),
        "activeViewModeIdPresent": bool(active_view_mode_id),
        "activeViewModePresentInMap": bool(
            active_view_mode_id and active_view_mode_id in view_modes
        ),
        "isEditingViewMode": bool(project_config.get("isEditingViewMode", False)),
        "topLevelSectionCount": len(
            object_field(project_config, "topLevelSections", allow_missing=True)
        ),
        "shownParamEntryCount": len(shown_param_ids),
    }


def read_frontend_messages(
    websocket_url: str,
    frontend_origin: str,
    cookie_header: str,
    wanted_types: set[str],
) -> list[dict[str, Any]]:
    with websocket_connect(
        websocket_url,
        additional_headers={"Cookie": cookie_header},
        origin=frontend_origin,
        open_timeout=WEBSOCKET_TIMEOUT_SECONDS,
        proxy=None,
    ) as conn:
        return read_messages_until_timeout(
            conn,
            timeout=WEBSOCKET_TIMEOUT_SECONDS,
            max_messages=max(6, len(wanted_types) * 3),
        )


def read_messages_until_timeout(
    conn: Any,
    timeout: float,
    max_messages: int = 6,
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and len(messages) < max_messages:
        remaining = max(deadline - time.monotonic(), 0.1)
        try:
            raw_message = conn.recv(timeout=remaining)
        except TimeoutError:
            break
        if not isinstance(raw_message, str):
            raise ParityHarnessError(
                f"Expected text websocket message, got {type(raw_message).__name__}"
            )
        message = json.loads(raw_message)
        if not isinstance(message, dict):
            raise ParityHarnessError(
                f"Expected websocket JSON object, got {type(message).__name__}"
            )
        messages.append(message)
    return messages


def find_message(messages: list[dict[str, Any]], message_type: str) -> dict[str, Any] | None:
    for message in messages:
        if normalized_string(message.get("messageType")) == message_type:
            return message
    return None


def build_cookie_header(session: requests.Session) -> str:
    pairs = [f"{cookie.name}={cookie.value}" for cookie in session.cookies]
    if not pairs:
        raise ParityHarnessError("Session does not contain any cookies for websocket auth.")
    return "; ".join(pairs)


def expect_object(
    value: Any,
    key: str,
    allow_missing: bool = False,
) -> dict[str, Any]:
    if value is None:
        if allow_missing:
            return {}
        raise ParityHarnessError(f"Missing object field {key}")
    if isinstance(value, dict):
        return value
    if allow_missing:
        return {}
    raise ParityHarnessError(f"Expected object for {key}, got {type(value).__name__}")


def object_field(
    mapping: dict[str, Any],
    key: str,
    allow_missing: bool = False,
) -> dict[str, Any]:
    if not isinstance(mapping, dict):
        raise ParityHarnessError(
            f"Expected object before reading field {key}, got {type(mapping).__name__}"
        )
    return expect_object(mapping.get(key), key, allow_missing=allow_missing)


def expect_string_list(value: Any, label: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ParityHarnessError(f"Expected list for {label}, got {type(value).__name__}")
    result: list[str] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, str):
            raise ParityHarnessError(
                f"Expected string for {label}[{index}], got {type(entry).__name__}"
            )
        result.append(entry)
    return result


def expect_non_empty_string(value: Any, label: str) -> str:
    normalized = normalized_string(value)
    if not normalized:
        raise ParityHarnessError(f"Expected non-empty string for {label}")
    return normalized


def normalized_string(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def find_free_port(exclude_ports: set[int] | None = None) -> int:
    excluded = exclude_ports or set()
    for _ in range(100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        if port not in excluded:
            return port
    raise ParityHarnessError("Unable to find a free TCP port.")


def tail_log(path: Path, line_count: int = 80) -> str:
    text = read_text(path)
    if not text:
        return f"(log file is empty: {path})"
    lines = text.splitlines()
    return "\n".join(lines[-line_count:])


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
        return
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_artifact(artifacts_dir: Path, result: ScenarioRunResult) -> None:
    scenario_dir = artifacts_dir / result.scenario_name
    scenario_dir.mkdir(parents=True, exist_ok=True)
    write_json(scenario_dir / f"{sanitize_label(result.ref_label)}.json", result.raw)


def sanitize_label(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "result"


def render_summary_diff(
    baseline_label: str,
    baseline_summary: dict[str, Any],
    current_label: str,
    current_summary: dict[str, Any],
) -> str:
    return "\n".join(
        [
            f"{baseline_label}:",
            indent_json(baseline_summary),
            f"{current_label}:",
            indent_json(current_summary),
        ]
    )


def indent_json(payload: dict[str, Any]) -> str:
    return textwrap.indent(
        json.dumps(payload, indent=2, sort_keys=True),
        "  ",
    )


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ParityHarnessError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

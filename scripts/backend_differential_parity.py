#!/usr/bin/env python

import argparse
import ast
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
SETTINGS_PROJECT_FILE_NAME = "setta-settings-project.json"
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
ROUTE_SET_PROJECT_CHAT_WINDOWING_STATE = "/api/setProjectChatWindowingState"
ROUTE_SET_PROJECT_CHAT_WINDOW_CHAT_ID = "/api/setProjectChatWindowChatId"
ROUTE_CREATE_WINDOW_SPACE = "/api/createWindowSpace"
ROUTE_CREATE_PROMPT_TEMPLATE = "/api/createPromptTemplate"
ROUTE_SET_PROMPT_TEMPLATE_LINK = "/api/setPromptTemplateLink"
ROUTE_LOAD_SETTINGS = "/api/loadSettings"
ROUTE_SAVE_SETTINGS = "/api/saveSettings"
ROUTE_SAVE_PROJECT = "/api/saveProject"
ROUTE_TOGGLE_IS_EDITING_VIEW_MODE = "/api/toggleIsEditingViewMode"
ROUTE_DELETE_VIEW_MODE = "/api/deleteViewMode"
ROUTE_CREATE_WORKSPACE_LAUNCH_INTENT = "/api/createWorkspaceLaunchIntent"
ROUTE_LAUNCH = "/api/launch"

SETTINGS_CORE_SECTION_NAMES = [
    "shortcuts",
    "gui",
    "backend",
    "sectionSizingPolicy",
    "languageServer",
]
SETTINGS_PARAM_LAYOUT_SENTINEL_SECTION_NAMES = [
    "buttonParamCodeObjDefault",
    "codeCallableCodeObjDefault",
    "codeParamCodeObjDefault",
]
SETTINGS_STRUCTURE_WORKFLOW_SECTION_NAMES = [
    "stateMachineStartSectionDefault",
    "stateMachineGateSectionDefault",
    "stateMachineEndSectionDefault",
]
SETTINGS_ALL_LEAD_SECTION_NAMES = [
    "shortcuts",
    "gui",
    "backend",
    "chatWindowing",
]
SETTINGS_PARAM_IMPL_SAMPLE_SPECS = [
    ("backend.autosave", "backend", ["autosave"]),
    ("backend.renameRefactorMode", "backend", ["renameRefactorMode"]),
    ("gui.gridColor", "gui", ["gridColor"]),
    (
        "sectionSizingPolicy.metaControlByType",
        "sectionSizingPolicy",
        ["metaControlByType"],
    ),
]
SETTINGS_DROPDOWN_PARAM_SAMPLE_SPECS = [
    ("backend.renameRefactorMode", "backend", ["renameRefactorMode"]),
]
SETTINGS_DISPLAY_NAME_SAMPLE_CODE_OBJ_NAMES = [
    "gui",
    "languageServer",
    "renameRefactorMode",
]


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

    return open_backend_session(
        target=target,
        temp_root=temp_root,
        workspace_root=workspace_root,
        setta_home=setta_home,
        setta_files_root=setta_files_root,
        log_path=log_path,
    )


def open_backend_session(
    target: RefTarget,
    temp_root: Path,
    workspace_root: Path,
    setta_home: Path,
    setta_files_root: Path,
    log_path: Path,
) -> BackendSession:
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)

    host = "127.0.0.1"
    port = find_free_port()
    frontend_port = find_free_port(exclude_ports={port})
    base_url = f"http://{host}:{port}"
    frontend_websocket_route = resolve_frontend_websocket_route(target.root)
    websocket_url = f"ws://{host}:{port}{frontend_websocket_route}"
    frontend_origin = f"http://{host}:{frontend_port}"
    env = build_backend_env(
        target_root=target.root,
        temp_root=temp_root,
        host=host,
        port=port,
        setta_home=setta_home,
        setta_files_root=setta_files_root,
        frontend_port=frontend_port,
    )

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


def restart_backend(backend: BackendSession) -> None:
    backend.session.close()
    terminate_process(backend.process)

    restarted = open_backend_session(
        target=backend.target,
        temp_root=backend.temp_root,
        workspace_root=backend.workspace_root,
        setta_home=backend.setta_home,
        setta_files_root=backend.setta_files_root,
        log_path=backend.log_path,
    )
    backend.process = restarted.process
    backend.session = restarted.session
    backend.base_url = restarted.base_url
    backend.websocket_url = restarted.websocket_url
    backend.frontend_origin = restarted.frontend_origin


def restart_backend_allow_startup_failure(backend: BackendSession) -> str | None:
    backend.session.close()
    terminate_process(backend.process)

    try:
        restarted = open_backend_session(
            target=backend.target,
            temp_root=backend.temp_root,
            workspace_root=backend.workspace_root,
            setta_home=backend.setta_home,
            setta_files_root=backend.setta_files_root,
            log_path=backend.log_path,
        )
    except ParityHarnessError as exc:
        return str(exc)

    backend.process = restarted.process
    backend.session = restarted.session
    backend.base_url = restarted.base_url
    backend.websocket_url = restarted.websocket_url
    backend.frontend_origin = restarted.frontend_origin
    return None


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


def build_backend_env(
    target_root: Path,
    temp_root: Path,
    host: str,
    port: int,
    setta_home: Path,
    setta_files_root: Path,
    frontend_port: int,
) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = build_child_path(env)
    env["PYTHONPATH"] = build_child_pythonpath(target_root, env.get("PYTHONPATH"))
    env["SETTA_NO_OPEN"] = "1"
    env["SETTA_HOST"] = host
    env["SETTA_PORT"] = str(port)
    env["SETTA_HOME"] = str(setta_home)
    env["SETTA_FILES_ROOT"] = str(setta_files_root)
    env["SETTA_DEV_FRONTEND_PORT"] = str(frontend_port)

    resolved_go_bin = resolve_current_go_bin()
    if resolved_go_bin:
        env["SETTA_GO_BIN"] = resolved_go_bin

    env.pop("SETTA_SERVER_BIN", None)
    if target_uses_go_launcher(target_root):
        env.pop("SETTA_BIN", None)
        return env

    env["SETTA_BIN"] = str(write_python_setta_wrapper(temp_root))
    return env


def target_uses_go_launcher(target_root: Path) -> bool:
    return (target_root / "cmd" / "setta" / "main.go").exists()


def write_python_setta_wrapper(temp_root: Path) -> Path:
    python_bin = VENV_BIN_DIR / "python"
    if not python_bin.exists():
        raise ParityHarnessError(
            f"Missing Python interpreter for harness wrapper: {python_bin}"
        )
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
    if scenario.kind == "latest_state_prunes_stale_active_ids":
        return execute_latest_state_prunes_stale_active_ids(backend)
    if scenario.kind == "persisted_project_windowing_after_create":
        return execute_persisted_project_windowing_after_create(backend)
    if scenario.kind == "project_windowing_authoritative_presence_on_load":
        return execute_project_windowing_authoritative_presence_on_load(backend)
    if scenario.kind == "windowing_section_binding_dedup_and_title_clearing_on_load":
        return execute_windowing_section_binding_dedup_and_title_clearing_on_load(
            backend
        )
    if scenario.kind == "project_chat_windowing_invalid_owner_mode_combos_on_load":
        return execute_project_chat_windowing_invalid_owner_mode_combos_on_load(
            backend
        )
    if scenario.kind == "window_spaces_invalid_owner_mode_combos_on_load":
        return execute_window_spaces_invalid_owner_mode_combos_on_load(backend)
    if scenario.kind == "windowing_scoped_per_project_config":
        return execute_windowing_scoped_per_project_config(backend)
    if scenario.kind == "project_chat_window_chat_id_route_contract":
        return execute_project_chat_window_chat_id_route_contract(backend)
    if scenario.kind == "project_chat_windowing_state_invalid_owner_mode_write_contract":
        return execute_project_chat_windowing_state_invalid_owner_mode_write_contract(
            backend
        )
    if scenario.kind == "window_space_create_invalid_owner_mode_write_contract":
        return execute_window_space_create_invalid_owner_mode_write_contract(backend)
    if scenario.kind == "prompt_template_link_rejects_non_prompt_sections":
        return execute_prompt_template_link_rejects_non_prompt_sections(backend)
    if scenario.kind == "window_spaces_duplicate_sort_indices_on_load":
        return execute_window_spaces_duplicate_sort_indices_on_load(backend)
    if scenario.kind == "settings_project_shell":
        return execute_settings_project_shell(backend)
    if scenario.kind == "settings_project_live_hydration":
        return execute_settings_project_live_hydration(backend)
    if scenario.kind == "settings_project_reserved_name_save_update":
        return execute_settings_project_reserved_name_save_update(backend)
    if scenario.kind == "settings_project_required_view_mode_repair":
        return execute_settings_project_required_view_mode_repair(backend)
    if scenario.kind == "settings_project_deleted_active_view_mode_repair":
        return execute_settings_project_deleted_active_view_mode_repair(backend)
    if scenario.kind == "settings_project_missing_required_section_fails_closed":
        return execute_settings_project_missing_required_section_fails_closed(backend)
    if scenario.kind == "settings_project_existing_section_code_obj_backfill":
        return execute_settings_project_existing_section_code_obj_backfill(backend)
    if scenario.kind == "settings_project_display_name_backfill":
        return execute_settings_project_display_name_backfill(backend)
    if scenario.kind == "settings_project_valid_view_mode_noop":
        return execute_settings_project_valid_view_mode_noop(backend)
    if scenario.kind == "settings_project_missing_visible_layout_repair":
        return execute_settings_project_missing_visible_layout_repair(backend)
    if scenario.kind == "settings_project_top_level_layout_repair":
        return execute_settings_project_top_level_layout_repair(backend)
    if scenario.kind == "workspace_launch_outdated_settings_error":
        return execute_workspace_launch_outdated_settings_error(backend)
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


def execute_latest_state_prunes_stale_active_ids(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    persisted_payload = read_persisted_project_document(backend)
    projects = object_field(persisted_payload, "projects", allow_missing=True)
    source_projects = object_field(
        persisted_payload,
        "projectConfigs",
        allow_missing=True,
    )
    project = expect_object(
        projects.get(project_id) or source_projects.get(project_id),
        f"projects.{project_id}",
    )

    top_level_section_ids = expect_string_list(
        project.get("topLevelSectionIds"),
        f"projects.{project_id}.topLevelSectionIds",
    )
    if not top_level_section_ids:
        top_level_sections = object_field(
            project,
            "topLevelSections",
            allow_missing=True,
        )
        top_level_section_ids = list(top_level_sections.keys())
    if not top_level_section_ids:
        raise ParityHarnessError(
            f"Expected project {project_id!r} to have at least one top-level section."
        )

    valid_section_id = top_level_section_ids[0]
    project["activeIds"] = [valid_section_id, "deleted-section"]
    if project_id in projects:
        projects[project_id] = project
        persisted_payload["projects"] = projects
    else:
        source_projects[project_id] = project
        persisted_payload["projectConfigs"] = source_projects
    write_json(backend.setta_files_root / PROJECT_FILE_NAME, persisted_payload)

    restart_backend(backend)

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
    summary = summarize_latest_state_prunes_stale_active_ids(
        http_status=response.status_code,
        payload=payload,
        valid_section_id=valid_section_id,
    )
    return summary, {
        "createdProjectName": created_name,
        "loadProjectConfig": loaded,
        "persistedProjectDocumentAfterActiveIDCorruption": persisted_payload,
        "latestProjectState": payload,
    }


def execute_persisted_project_windowing_after_create(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    payload = read_persisted_project_document(backend)
    summary = summarize_persisted_project_windowing_after_create(
        project_id=project_id,
        payload=payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "persistedProjectDocument": payload,
    }


def execute_project_windowing_authoritative_presence_on_load(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    persisted_payload = read_persisted_project_document(backend)
    corrupted_payload = remove_project_windowing_from_store_payload(
        persisted_payload,
        project_id=project_id,
    )
    write_json(backend.setta_files_root / PROJECT_FILE_NAME, corrupted_payload)

    restart_startup_error = restart_backend_allow_startup_failure(backend)
    restart_load_http_status: int | None = None
    restart_load_payload: Any = None
    restart_latest_http_status: int | None = None
    restart_latest_payload: Any = None
    if restart_startup_error is None:
        restart_load_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_LOAD_PROJECT_CONFIG,
            payload={"projectConfigName": created_name},
        )
        restart_load_http_status = restart_load_response.status_code
        restart_load_payload = normalize_response_json_allow_status(restart_load_response)

        if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
            restarted_project_config = object_field(restart_load_payload, "projectConfig")
            restarted_project_id = expect_non_empty_string(
                restarted_project_config.get("id"),
                "projectConfig.id",
            )
            restart_latest_response = post_json_allow_status(
                session=backend.session,
                base_url=backend.base_url,
                route=ROUTE_GET_LATEST_PROJECT_STATE,
                payload={"projectConfigId": restarted_project_id},
            )
            restart_latest_http_status = restart_latest_response.status_code
            restart_latest_payload = normalize_response_json_allow_status(
                restart_latest_response
            )

    persisted_after_payload = read_persisted_project_document(backend)
    summary = summarize_project_windowing_authoritative_presence_on_load(
        restart_startup_error=restart_startup_error,
        restart_load_http_status=restart_load_http_status,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=restart_latest_http_status,
        restart_latest_payload=restart_latest_payload,
        persisted_after_payload=persisted_after_payload,
        project_id=project_id,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "corruptedProjectDocument": corrupted_payload,
        "restartStartupError": restart_startup_error,
        "restartLoadProjectConfigStatus": restart_load_http_status,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": restart_latest_http_status,
        "restartLatestProjectState": restart_latest_payload,
        "persistedProjectDocumentAfterRestart": persisted_after_payload,
    }


def execute_windowing_section_binding_dedup_and_title_clearing_on_load(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    project_config = object_field(loaded, "projectConfig")
    top_level_sections = object_field(project_config, "topLevelSections", allow_missing=True)
    if not top_level_sections:
        raise ParityHarnessError(
            f"Expected created project {project_id!r} to have at least one top-level section."
        )
    section_id = next(iter(top_level_sections))

    persisted_payload = read_persisted_project_document(backend)
    corrupted_payload = seed_windowing_section_binding_conflicts_in_store_payload(
        persisted_payload,
        project_id=project_id,
        section_id=section_id,
    )
    write_json(backend.setta_files_root / PROJECT_FILE_NAME, corrupted_payload)

    restart_backend(backend)

    restart_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": created_name},
    )
    restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    restart_latest_http_status: int | None = None
    restart_latest_payload: Any = None
    if restart_load_response.status_code == 200 and isinstance(restart_load_payload, dict):
        restart_project_config = object_field(restart_load_payload, "projectConfig")
        restart_project_id = expect_non_empty_string(
            restart_project_config.get("id"),
            "projectConfig.id",
        )
        restart_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": restart_project_id},
        )
        restart_latest_http_status = restart_latest_response.status_code
        restart_latest_payload = normalize_response_json_allow_status(
            restart_latest_response
        )

    summary = summarize_windowing_section_binding_dedup_and_title_clearing_on_load(
        restart_load_http_status=restart_load_response.status_code,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=restart_latest_http_status,
        restart_latest_payload=restart_latest_payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "corruptedProjectDocument": corrupted_payload,
        "restartLoadProjectConfigStatus": restart_load_response.status_code,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": restart_latest_http_status,
        "restartLatestProjectState": restart_latest_payload,
    }


def execute_project_chat_windowing_invalid_owner_mode_combos_on_load(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)

    persisted_payload = read_persisted_project_document(backend)
    corrupted_payload = seed_invalid_project_chat_windowing_owner_mode_in_store_payload(
        persisted_payload,
        project_id=project_id,
    )
    write_json(backend.setta_files_root / PROJECT_FILE_NAME, corrupted_payload)

    restart_startup_error = restart_backend_allow_startup_failure(backend)
    restart_load_http_status: int | None = None
    restart_load_payload: Any = None
    if restart_startup_error is None:
        restart_load_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_LOAD_PROJECT_CONFIG,
            payload={"projectConfigName": created_name},
        )
        restart_load_http_status = restart_load_response.status_code
        restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    summary = summarize_project_chat_windowing_invalid_owner_mode_combos_on_load(
        restart_startup_error=restart_startup_error,
        restart_load_http_status=restart_load_http_status,
        restart_load_payload=restart_load_payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "corruptedProjectDocument": corrupted_payload,
        "restartStartupError": restart_startup_error,
        "restartLoadProjectConfigStatus": restart_load_http_status,
        "restartLoadProjectConfig": restart_load_payload,
    }


def execute_window_spaces_invalid_owner_mode_combos_on_load(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)

    persisted_payload = read_persisted_project_document(backend)
    corrupted_payload = seed_invalid_window_spaces_owner_mode_in_store_payload(
        persisted_payload,
        project_id=project_id,
    )
    write_json(backend.setta_files_root / PROJECT_FILE_NAME, corrupted_payload)

    restart_startup_error = restart_backend_allow_startup_failure(backend)
    restart_load_http_status: int | None = None
    restart_load_payload: Any = None
    if restart_startup_error is None:
        restart_load_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_LOAD_PROJECT_CONFIG,
            payload={"projectConfigName": created_name},
        )
        restart_load_http_status = restart_load_response.status_code
        restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    summary = summarize_window_spaces_invalid_owner_mode_combos_on_load(
        restart_startup_error=restart_startup_error,
        restart_load_http_status=restart_load_http_status,
        restart_load_payload=restart_load_payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "corruptedProjectDocument": corrupted_payload,
        "restartStartupError": restart_startup_error,
        "restartLoadProjectConfigStatus": restart_load_http_status,
        "restartLoadProjectConfig": restart_load_payload,
    }


def execute_windowing_scoped_per_project_config(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    first_name, _ = create_and_load_project(backend)
    second_name, _ = create_and_load_project(backend)
    first_project_id = find_project_id_by_name(backend, first_name)
    second_project_id = find_project_id_by_name(backend, second_name)

    persisted_payload = read_persisted_project_document(backend)
    seeded_payload = seed_distinct_windowing_per_project_in_store_payload(
        persisted_payload,
        {
            first_project_id: {
                "projectChatWindowing": {
                    "instancesById": {
                        "instance-alpha": {
                            "instanceId": "instance-alpha",
                            "placement": "floating",
                            "mode": "project_ai_mode",
                            "chatId": "chat-live-alpha",
                        }
                    },
                    "order": ["instance-alpha"],
                    "nextInstanceNumber": 2,
                },
                "windowSpaces": {
                    "space-alpha": {
                        "id": "space-alpha",
                        "name": "Alpha Workspace",
                        "sortIndex": 0,
                        "windowsById": {
                            "window-alpha": {
                                "surfaceKind": "project_chat",
                                "mode": "project_ai_mode",
                                "chatId": "chat-saved-alpha",
                            }
                        },
                        "order": ["window-alpha"],
                    }
                },
            },
            second_project_id: {
                "projectChatWindowing": {
                    "instancesById": {
                        "instance-beta": {
                            "instanceId": "instance-beta",
                            "placement": "floating",
                            "mode": "project_ai_mode",
                            "chatId": "chat-live-beta",
                        }
                    },
                    "order": ["instance-beta"],
                    "nextInstanceNumber": 2,
                },
                "windowSpaces": {
                    "space-beta": {
                        "id": "space-beta",
                        "name": "Beta Workspace",
                        "sortIndex": 0,
                        "windowsById": {
                            "window-beta": {
                                "surfaceKind": "project_chat",
                                "mode": "project_ai_mode",
                                "chatId": "chat-saved-beta",
                            }
                        },
                        "order": ["window-beta"],
                    }
                },
            },
        },
    )
    write_json(backend.setta_files_root / PROJECT_FILE_NAME, seeded_payload)

    restart_backend(backend)

    first_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": first_name},
    )
    first_load_payload = normalize_response_json_allow_status(first_load_response)
    first_latest_http_status: int | None = None
    first_latest_payload: Any = None
    if first_load_response.status_code == 200 and isinstance(first_load_payload, dict):
        first_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": first_project_id},
        )
        first_latest_http_status = first_latest_response.status_code
        first_latest_payload = normalize_response_json_allow_status(first_latest_response)

    second_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": second_name},
    )
    second_load_payload = normalize_response_json_allow_status(second_load_response)
    second_latest_http_status: int | None = None
    second_latest_payload: Any = None
    if second_load_response.status_code == 200 and isinstance(second_load_payload, dict):
        second_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": second_project_id},
        )
        second_latest_http_status = second_latest_response.status_code
        second_latest_payload = normalize_response_json_allow_status(
            second_latest_response
        )

    summary = summarize_windowing_scoped_per_project_config(
        first_load_http_status=first_load_response.status_code,
        first_load_payload=first_load_payload,
        first_latest_http_status=first_latest_http_status,
        first_latest_payload=first_latest_payload,
        second_load_http_status=second_load_response.status_code,
        second_load_payload=second_load_payload,
        second_latest_http_status=second_latest_http_status,
        second_latest_payload=second_latest_payload,
    )
    return summary, {
        "firstProjectName": first_name,
        "firstProjectID": first_project_id,
        "secondProjectName": second_name,
        "secondProjectID": second_project_id,
        "seededProjectDocument": seeded_payload,
        "firstLoadProjectConfigStatus": first_load_response.status_code,
        "firstLoadProjectConfig": first_load_payload,
        "firstLatestProjectStateStatus": first_latest_http_status,
        "firstLatestProjectState": first_latest_payload,
        "secondLoadProjectConfigStatus": second_load_response.status_code,
        "secondLoadProjectConfig": second_load_payload,
        "secondLatestProjectStateStatus": second_latest_http_status,
        "secondLatestProjectState": second_latest_payload,
    }


def execute_project_chat_window_chat_id_route_contract(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    project_config = object_field(loaded, "projectConfig")
    top_level_sections = object_field(project_config, "topLevelSections", allow_missing=True)
    if not top_level_sections:
        raise ParityHarnessError(
            f"Expected created project {project_id!r} to have at least one top-level section."
        )
    section_id = next(iter(top_level_sections))

    persisted_payload = read_persisted_project_document(backend)
    seeded_payload = seed_project_chat_window_chat_id_route_payload_in_store(
        persisted_payload,
        project_id=project_id,
        section_id=section_id,
    )
    write_json(backend.setta_files_root / PROJECT_FILE_NAME, seeded_payload)

    restart_backend(backend)

    valid_bind_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SET_PROJECT_CHAT_WINDOW_CHAT_ID,
        payload={
            "projectConfigId": project_id,
            "instanceId": "project-ai-window",
            "chatId": "chat-after",
        },
    )
    valid_bind_payload = normalize_response_json_allow_status(valid_bind_response)

    invalid_mode_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SET_PROJECT_CHAT_WINDOW_CHAT_ID,
        payload={
            "projectConfigId": project_id,
            "instanceId": "section-window",
            "chatId": "chat-after",
        },
    )
    invalid_mode_payload = normalize_response_json_allow_status(invalid_mode_response)

    missing_window_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SET_PROJECT_CHAT_WINDOW_CHAT_ID,
        payload={
            "projectConfigId": project_id,
            "instanceId": "missing-window",
            "chatId": "chat-after",
        },
    )
    missing_window_payload = normalize_response_json_allow_status(missing_window_response)

    latest_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_GET_LATEST_PROJECT_STATE,
        payload={"projectConfigId": project_id},
    )
    latest_payload = normalize_response_json_allow_status(latest_response)

    summary = summarize_project_chat_window_chat_id_route_contract(
        valid_bind_http_status=valid_bind_response.status_code,
        valid_bind_payload=valid_bind_payload,
        invalid_mode_http_status=invalid_mode_response.status_code,
        invalid_mode_payload=invalid_mode_payload,
        missing_window_http_status=missing_window_response.status_code,
        missing_window_payload=missing_window_payload,
        latest_http_status=latest_response.status_code,
        latest_payload=latest_payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "seededProjectDocument": seeded_payload,
        "validBindStatus": valid_bind_response.status_code,
        "validBindPayload": valid_bind_payload,
        "invalidModeStatus": invalid_mode_response.status_code,
        "invalidModePayload": invalid_mode_payload,
        "missingWindowStatus": missing_window_response.status_code,
        "missingWindowPayload": missing_window_payload,
        "latestProjectStateStatus": latest_response.status_code,
        "latestProjectState": latest_payload,
    }


def execute_project_chat_windowing_state_invalid_owner_mode_write_contract(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    project_config = object_field(loaded, "projectConfig")
    top_level_sections = object_field(project_config, "topLevelSections", allow_missing=True)
    if not top_level_sections:
        raise ParityHarnessError(
            f"Expected created project {project_id!r} to have at least one top-level section."
        )
    section_id = next(iter(top_level_sections))

    section_mode_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SET_PROJECT_CHAT_WINDOWING_STATE,
        payload={
            "projectConfigId": project_id,
            "state": {
                "instancesById": {
                    "section-missing-binding": {
                        "instanceId": "section-missing-binding",
                        "placement": "floating",
                        "mode": "section_mode",
                    }
                },
                "order": ["section-missing-binding"],
                "nextInstanceNumber": 2,
            },
        },
    )
    section_mode_payload = normalize_response_json_allow_status(section_mode_response)

    git_graph_section_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SET_PROJECT_CHAT_WINDOWING_STATE,
        payload={
            "projectConfigId": project_id,
            "state": {
                "instancesById": {
                    "git-graph-section-window": {
                        "instanceId": "git-graph-section-window",
                        "placement": "floating",
                        "mode": "git_graph_mode",
                        "sectionIdOrNull": section_id,
                    }
                },
                "order": ["git-graph-section-window"],
                "nextInstanceNumber": 2,
            },
        },
    )
    git_graph_section_payload = normalize_response_json_allow_status(
        git_graph_section_response
    )

    git_graph_canvas_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SET_PROJECT_CHAT_WINDOWING_STATE,
        payload={
            "projectConfigId": project_id,
            "state": {
                "instancesById": {
                    "git-graph-canvas-window": {
                        "instanceId": "git-graph-canvas-window",
                        "placement": "canvas_section",
                        "mode": "git_graph_mode",
                    }
                },
                "order": ["git-graph-canvas-window"],
                "nextInstanceNumber": 2,
            },
        },
    )
    git_graph_canvas_payload = normalize_response_json_allow_status(
        git_graph_canvas_response
    )

    summary = summarize_project_chat_windowing_state_invalid_owner_mode_write_contract(
        section_mode_http_status=section_mode_response.status_code,
        section_mode_payload=section_mode_payload,
        git_graph_section_http_status=git_graph_section_response.status_code,
        git_graph_section_payload=git_graph_section_payload,
        git_graph_canvas_http_status=git_graph_canvas_response.status_code,
        git_graph_canvas_payload=git_graph_canvas_payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "sectionModeStatus": section_mode_response.status_code,
        "sectionModePayload": section_mode_payload,
        "gitGraphSectionStatus": git_graph_section_response.status_code,
        "gitGraphSectionPayload": git_graph_section_payload,
        "gitGraphCanvasStatus": git_graph_canvas_response.status_code,
        "gitGraphCanvasPayload": git_graph_canvas_payload,
    }


def execute_window_space_create_invalid_owner_mode_write_contract(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    project_config = object_field(loaded, "projectConfig")
    top_level_sections = object_field(project_config, "topLevelSections", allow_missing=True)
    if not top_level_sections:
        raise ParityHarnessError(
            f"Expected created project {project_id!r} to have at least one top-level section."
        )
    section_id = next(iter(top_level_sections))

    def post_invalid_window_space(state: dict[str, Any]) -> tuple[int, Any]:
        response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_CREATE_WINDOW_SPACE,
            payload={
                "projectConfigId": project_id,
                "name": "Focused Layout",
                "state": state,
            },
        )
        return response.status_code, normalize_response_json_allow_status(response)

    section_missing_status, section_missing_payload = post_invalid_window_space(
        {
            "windowsById": {
                "section-missing-binding": {
                    "surfaceKind": "section",
                    "mode": "section_mode",
                }
            },
            "order": ["section-missing-binding"],
        }
    )
    project_chat_section_status, project_chat_section_payload = post_invalid_window_space(
        {
            "windowsById": {
                "project-chat-section-window": {
                    "surfaceKind": "project_chat",
                    "sectionIdOrNull": section_id,
                    "mode": "project_ai_mode",
                }
            },
            "order": ["project-chat-section-window"],
        }
    )
    section_git_graph_status, section_git_graph_payload = post_invalid_window_space(
        {
            "windowsById": {
                "section-git-graph-window": {
                    "surfaceKind": "section",
                    "sectionIdOrNull": section_id,
                    "mode": "git_graph_mode",
                }
            },
            "order": ["section-git-graph-window"],
        }
    )
    project_chat_section_mode_status, project_chat_section_mode_payload = post_invalid_window_space(
        {
            "windowsById": {
                "project-chat-section-mode-window": {
                    "surfaceKind": "project_chat",
                    "mode": "section_mode",
                }
            },
            "order": ["project-chat-section-mode-window"],
        }
    )
    non_project_ai_chat_id_status, non_project_ai_chat_id_payload = post_invalid_window_space(
        {
            "windowsById": {
                "section-chat-id-window": {
                    "surfaceKind": "section",
                    "sectionIdOrNull": section_id,
                    "mode": "section_mode",
                    "chatId": "stale-chat",
                }
            },
            "order": ["section-chat-id-window"],
        }
    )

    summary = summarize_window_space_create_invalid_owner_mode_write_contract(
        section_missing_http_status=section_missing_status,
        section_missing_payload=section_missing_payload,
        project_chat_section_http_status=project_chat_section_status,
        project_chat_section_payload=project_chat_section_payload,
        section_git_graph_http_status=section_git_graph_status,
        section_git_graph_payload=section_git_graph_payload,
        project_chat_section_mode_http_status=project_chat_section_mode_status,
        project_chat_section_mode_payload=project_chat_section_mode_payload,
        non_project_ai_chat_id_http_status=non_project_ai_chat_id_status,
        non_project_ai_chat_id_payload=non_project_ai_chat_id_payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "sectionMissingStatus": section_missing_status,
        "sectionMissingPayload": section_missing_payload,
        "projectChatSectionStatus": project_chat_section_status,
        "projectChatSectionPayload": project_chat_section_payload,
        "sectionGitGraphStatus": section_git_graph_status,
        "sectionGitGraphPayload": section_git_graph_payload,
        "projectChatSectionModeStatus": project_chat_section_mode_status,
        "projectChatSectionModePayload": project_chat_section_mode_payload,
        "nonProjectAIChatIDStatus": non_project_ai_chat_id_status,
        "nonProjectAIChatIDPayload": non_project_ai_chat_id_payload,
    }


def execute_prompt_template_link_rejects_non_prompt_sections(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)
    project_config = object_field(loaded, "projectConfig")
    top_level_sections = object_field(project_config, "topLevelSections", allow_missing=True)
    if not top_level_sections:
        raise ParityHarnessError(
            f"Expected created project {project_id!r} to have at least one top-level section."
        )
    non_prompt_section_id = next(iter(top_level_sections))

    create_template_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_CREATE_PROMPT_TEMPLATE,
        payload={
            "name": "Greeting",
            "template": "Hello {{ name }}",
        },
    )
    create_template_payload = normalize_response_json(create_template_response)
    created_template = expect_object(create_template_payload, "createPromptTemplate")
    template_id = normalized_string(created_template.get("id"))
    if not template_id:
        raise ParityHarnessError(
            f"createPromptTemplate returned unexpected payload: {create_template_payload!r}"
        )

    link_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SET_PROMPT_TEMPLATE_LINK,
        payload={
            "projectConfigId": project_id,
            "sectionId": non_prompt_section_id,
            "promptTemplateId": template_id,
        },
    )
    link_payload = normalize_response_json_allow_status(link_response)

    summary = summarize_prompt_template_link_rejects_non_prompt_sections(
        link_http_status=link_response.status_code,
        link_payload=link_payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfig": loaded,
        "nonPromptSectionID": non_prompt_section_id,
        "createdPromptTemplate": create_template_payload,
        "linkStatus": link_response.status_code,
        "linkPayload": link_payload,
    }


def execute_window_spaces_duplicate_sort_indices_on_load(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    created_name, loaded = create_and_load_project(backend)
    project_id = find_project_id_by_name(backend, created_name)

    created_window_spaces: list[tuple[str, str]] = []
    for window_space_name in ["Zulu Layout", "Alpha Layout", "Beta Layout"]:
        create_response = post_json(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_CREATE_WINDOW_SPACE,
            payload={
                "projectConfigId": project_id,
                "name": window_space_name,
                "state": {
                    "windowsById": {
                        "window-primary": {
                            "surfaceKind": "project_chat",
                            "mode": "project_ai_mode",
                        }
                    },
                    "order": ["window-primary"],
                },
            },
        )
        create_payload = normalize_response_json(create_response)
        if not isinstance(create_payload, dict):
            raise ParityHarnessError(
                f"createWindowSpace returned unexpected payload: {create_payload!r}"
            )
        window_space_id = normalized_string(create_payload.get("id"))
        if not window_space_id:
            raise ParityHarnessError(
                f"createWindowSpace response missing id: {create_payload!r}"
        )
        created_window_spaces.append((window_space_id, window_space_name))

    post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SAVE_PROJECT,
        payload={"projectConfigId": project_id},
    )

    project_path = backend.setta_files_root / PROJECT_FILE_NAME
    persisted_payload = json.loads(project_path.read_text(encoding="utf-8"))
    projects = object_field(persisted_payload, "projects", allow_missing=True)
    source_projects = object_field(
        persisted_payload,
        "projectConfigs",
        allow_missing=True,
    )
    project = expect_object(
        projects.get(project_id) or source_projects.get(project_id),
        f"projects.{project_id}",
    )
    window_spaces = object_field(project, "windowSpaces", allow_missing=True)

    reordered_window_spaces: dict[str, Any] = {}
    for index, (window_space_id, _) in enumerate(created_window_spaces):
        window_space = expect_object(
            window_spaces.get(window_space_id),
            f"windowSpaces.{window_space_id}",
        )
        if index < 2:
            window_space["sortIndex"] = 0
        else:
            window_space["sortIndex"] = 2
        reordered_window_spaces[window_space_id] = window_space
    for window_space_id, window_space in window_spaces.items():
        if window_space_id in reordered_window_spaces:
            continue
        reordered_window_spaces[window_space_id] = window_space

    project["windowSpaces"] = reordered_window_spaces
    if project_id in projects:
        projects[project_id] = project
        persisted_payload["projects"] = projects
    else:
        source_projects[project_id] = project
        persisted_payload["projectConfigs"] = source_projects
    write_json_preserving_order(project_path, persisted_payload)
    restart_backend(backend)

    load_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": created_name},
    )
    load_payload = normalize_response_json(load_response)
    if not isinstance(load_payload, dict):
        raise ParityHarnessError(
            f"loadProjectConfig returned unexpected payload: {load_payload!r}"
        )

    latest_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_GET_LATEST_PROJECT_STATE,
        payload={"projectConfigId": project_id},
    )
    latest_payload = normalize_response_json(latest_response)
    if not isinstance(latest_payload, dict):
        raise ParityHarnessError(
            f"getLatestProjectState returned unexpected payload: {latest_payload!r}"
        )

    summary = summarize_window_space_duplicate_sort_indices_on_load(
        load_http_status=load_response.status_code,
        load_payload=load_payload,
        latest_http_status=latest_response.status_code,
        latest_payload=latest_payload,
    )
    return summary, {
        "createdProjectName": created_name,
        "projectID": project_id,
        "loadProjectConfigBeforeCorruption": loaded,
        "createdWindowSpaces": created_window_spaces,
        "persistedProjectDocumentAfterSortIndexCorruption": persisted_payload,
        "loadProjectConfigStatus": load_response.status_code,
        "loadProjectConfig": load_payload,
        "latestProjectStateStatus": latest_response.status_code,
        "latestProjectState": latest_payload,
    }


def execute_settings_project_shell(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    load_payload = normalize_response_json_allow_status(load_response)

    latest_response = None
    latest_payload = None
    if load_response.status_code == 200 and isinstance(load_payload, dict):
        project_config = object_field(load_payload, "projectConfig")
        project_id = expect_non_empty_string(
            project_config.get("id"),
            "projectConfig.id",
        )
        latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": project_id},
        )
        latest_payload = normalize_response_json_allow_status(latest_response)

    summary = summarize_settings_project_shell(
        http_status=load_response.status_code,
        payload=load_payload,
        latest_http_status=None
        if latest_response is None
        else latest_response.status_code,
        latest_payload=latest_payload,
        workspace_root=str(backend.workspace_root),
    )
    return summary, {
        "loadProjectConfigStatus": load_response.status_code,
        "loadProjectConfig": load_payload,
        "latestProjectStateStatus": None
        if latest_response is None
        else latest_response.status_code,
        "latestProjectState": latest_payload,
    }


def execute_settings_project_live_hydration(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    load_settings_response = post_json(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_SETTINGS,
        payload={},
    )
    settings_payload = normalize_response_json(load_settings_response)
    if not isinstance(settings_payload, dict):
        raise ParityHarnessError(
            f"loadSettings returned unexpected payload: {settings_payload!r}"
        )

    next_settings = json.loads(json.dumps(settings_payload))
    backend_settings = object_field(next_settings, "backend")
    backend_settings["renameRefactorMode"] = "NEVER_RENAME"

    save_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_SAVE_SETTINGS,
        payload={"settings": next_settings},
    )
    save_payload = normalize_response_json_allow_status(save_response)

    load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    load_payload = normalize_response_json_allow_status(load_response)

    latest_response = None
    latest_payload = None
    if load_response.status_code == 200 and isinstance(load_payload, dict):
        project_config = object_field(load_payload, "projectConfig")
        project_id = expect_non_empty_string(
            project_config.get("id"),
            "projectConfig.id",
        )
        latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": project_id},
        )
        latest_payload = normalize_response_json_allow_status(latest_response)

    summary = summarize_settings_project_live_hydration(
        save_http_status=save_response.status_code,
        save_payload=save_payload,
        load_http_status=load_response.status_code,
        load_payload=load_payload,
        latest_http_status=None
        if latest_response is None
        else latest_response.status_code,
        latest_payload=latest_payload,
    )
    return summary, {
        "loadSettings": settings_payload,
        "saveSettingsStatus": save_response.status_code,
        "saveSettings": save_payload,
        "loadProjectConfigStatus": load_response.status_code,
        "loadProjectConfig": load_payload,
        "latestProjectStateStatus": None
        if latest_response is None
        else latest_response.status_code,
        "latestProjectState": latest_payload,
    }


def execute_settings_project_reserved_name_save_update(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)

    save_response = None
    save_payload = None

    if initial_load_response.status_code == 200 and isinstance(initial_load_payload, dict):
        save_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_SAVE_PROJECT,
            payload={"projectConfigId": "settings"},
        )
        save_payload = normalize_response_json_allow_status(save_response)

    restart_load_response = None
    restart_load_payload = None
    restart_latest_response = None
    restart_latest_payload = None
    persisted_after_payload = None

    if initial_load_response.status_code == 200:
        restart_backend(backend)
        restart_load_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_LOAD_PROJECT_CONFIG,
            payload={"projectConfigName": "settings"},
        )
        restart_load_payload = normalize_response_json_allow_status(restart_load_response)
        if restart_load_response.status_code == 200 and isinstance(restart_load_payload, dict):
            restarted_project_config = object_field(restart_load_payload, "projectConfig")
            restarted_project_id = expect_non_empty_string(
                restarted_project_config.get("id"),
                "projectConfig.id",
            )
            restart_latest_response = post_json_allow_status(
                session=backend.session,
                base_url=backend.base_url,
                route=ROUTE_GET_LATEST_PROJECT_STATE,
                payload={"projectConfigId": restarted_project_id},
            )
            restart_latest_payload = normalize_response_json_allow_status(
                restart_latest_response
            )
        persisted_after_payload = read_persisted_settings_project_document(backend)

    summary = summarize_settings_project_reserved_name_save_update(
        initial_load_http_status=initial_load_response.status_code,
        save_http_status=None if save_response is None else save_response.status_code,
        restart_load_http_status=None
        if restart_load_response is None
        else restart_load_response.status_code,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        restart_latest_payload=restart_latest_payload,
        persisted_after_payload=persisted_after_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "saveProjectStatus": None if save_response is None else save_response.status_code,
        "saveProject": save_payload,
        "restartLoadProjectConfigStatus": None
        if restart_load_response is None
        else restart_load_response.status_code,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        "restartLatestProjectState": restart_latest_payload,
        "persistedSettingsProjectDocumentAfterRestart": persisted_after_payload,
    }


def execute_settings_project_required_view_mode_repair(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)
    if initial_load_response.status_code != 200 or not isinstance(initial_load_payload, dict):
        summary = {
            "initialLoadHttpStatus": initial_load_response.status_code,
            "deleteHttpStatus": None,
            "restartLoadHttpStatus": None,
        }
        return summary, {
            "initialLoadProjectConfigStatus": initial_load_response.status_code,
            "initialLoadProjectConfig": initial_load_payload,
        }

    project_config = object_field(initial_load_payload, "projectConfig")
    project_id = expect_non_empty_string(project_config.get("id"), "projectConfig.id")
    deleted_view_mode_id = find_settings_view_mode_id(
        initial_load_payload,
        "All Settings",
    )

    delete_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_DELETE_VIEW_MODE,
        payload={
            "projectConfigId": project_id,
            "viewModeId": deleted_view_mode_id,
        },
    )
    delete_payload = normalize_response_json_allow_status(delete_response)

    pre_restart_latest_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_GET_LATEST_PROJECT_STATE,
        payload={"projectConfigId": project_id},
    )
    pre_restart_latest_payload = normalize_response_json_allow_status(
        pre_restart_latest_response
    )

    restart_backend(backend)

    restart_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    restart_latest_response = None
    restart_latest_payload = None
    if restart_load_response.status_code == 200 and isinstance(restart_load_payload, dict):
        restarted_project_config = object_field(restart_load_payload, "projectConfig")
        restarted_project_id = expect_non_empty_string(
            restarted_project_config.get("id"),
            "projectConfig.id",
        )
        restart_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": restarted_project_id},
        )
        restart_latest_payload = normalize_response_json_allow_status(
            restart_latest_response
        )

    persisted_payload = read_persisted_settings_project_document(backend)
    summary = summarize_settings_project_required_view_mode_repair(
        initial_load_http_status=initial_load_response.status_code,
        delete_http_status=delete_response.status_code,
        pre_restart_latest_http_status=pre_restart_latest_response.status_code,
        pre_restart_latest_payload=pre_restart_latest_payload,
        restart_load_http_status=restart_load_response.status_code,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        restart_latest_payload=restart_latest_payload,
        persisted_payload=persisted_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "deleteViewModeStatus": delete_response.status_code,
        "deleteViewMode": delete_payload,
        "preRestartLatestProjectStateStatus": pre_restart_latest_response.status_code,
        "preRestartLatestProjectState": pre_restart_latest_payload,
        "restartLoadProjectConfigStatus": restart_load_response.status_code,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        "restartLatestProjectState": restart_latest_payload,
        "persistedSettingsProjectDocument": persisted_payload,
    }


def execute_settings_project_deleted_active_view_mode_repair(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)

    persisted_payload = read_persisted_settings_project_document(backend)
    corrupted_payload = delete_settings_view_mode_from_store_payload(
        persisted_payload,
        view_mode_name="Core",
    )
    write_json(backend.setta_files_root / SETTINGS_PROJECT_FILE_NAME, corrupted_payload)

    restart_backend(backend)

    restart_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    restart_latest_response = None
    restart_latest_payload = None
    if restart_load_response.status_code == 200 and isinstance(restart_load_payload, dict):
        restarted_project_config = object_field(restart_load_payload, "projectConfig")
        restarted_project_id = expect_non_empty_string(
            restarted_project_config.get("id"),
            "projectConfig.id",
        )
        restart_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": restarted_project_id},
        )
        restart_latest_payload = normalize_response_json_allow_status(
            restart_latest_response
        )

    persisted_after_payload = read_persisted_settings_project_document(backend)
    summary = summarize_settings_project_deleted_active_view_mode_repair(
        initial_load_http_status=initial_load_response.status_code,
        restart_load_http_status=restart_load_response.status_code,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        restart_latest_payload=restart_latest_payload,
        persisted_after_payload=persisted_after_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "corruptedSettingsProjectDocument": corrupted_payload,
        "restartLoadProjectConfigStatus": restart_load_response.status_code,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        "restartLatestProjectState": restart_latest_payload,
        "persistedSettingsProjectDocumentAfterRestart": persisted_after_payload,
    }


def execute_settings_project_missing_required_section_fails_closed(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)

    persisted_payload = read_persisted_settings_project_document(backend)
    corrupted_payload = remove_settings_section_from_store_payload(
        persisted_payload,
        section_name="spreadsheetSectionDefault",
    )
    write_json(backend.setta_files_root / SETTINGS_PROJECT_FILE_NAME, corrupted_payload)

    restart_startup_error = restart_backend_allow_startup_failure(backend)
    restart_load_http_status: int | None = None
    restart_load_payload: Any = None
    if restart_startup_error is None:
        restart_load_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_LOAD_PROJECT_CONFIG,
            payload={"projectConfigName": "settings"},
        )
        restart_load_http_status = restart_load_response.status_code
        restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    summary = summarize_settings_project_missing_required_section_fails_closed(
        initial_load_http_status=initial_load_response.status_code,
        restart_startup_error=restart_startup_error,
        restart_load_http_status=restart_load_http_status,
        restart_load_payload=restart_load_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "corruptedSettingsProjectDocument": corrupted_payload,
        "restartStartupError": restart_startup_error,
        "restartLoadProjectConfigStatus": restart_load_http_status,
        "restartLoadProjectConfig": restart_load_payload,
    }


def execute_settings_project_existing_section_code_obj_backfill(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)

    persisted_payload = read_persisted_settings_project_document(backend)
    corrupted_payload = persisted_payload
    for _sample_name, section_name, param_path in SETTINGS_PARAM_IMPL_SAMPLE_SPECS:
        corrupted_payload = remove_settings_param_from_store_payload(
            corrupted_payload,
            section_name=section_name,
            param_path=param_path,
        )
    write_json(backend.setta_files_root / SETTINGS_PROJECT_FILE_NAME, corrupted_payload)

    restart_startup_error = restart_backend_allow_startup_failure(backend)
    restart_startup_persisted_payload: Any = None
    restart_load_http_status: int | None = None
    restart_load_payload: Any = None
    post_load_persisted_payload: Any = None
    if restart_startup_error is None:
        restart_startup_persisted_payload = read_persisted_settings_project_document(
            backend
        )
        restart_load_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_LOAD_PROJECT_CONFIG,
            payload={"projectConfigName": "settings"},
        )
        restart_load_http_status = restart_load_response.status_code
        restart_load_payload = normalize_response_json_allow_status(restart_load_response)
        post_load_persisted_payload = read_persisted_settings_project_document(backend)

    summary = summarize_settings_project_existing_section_code_obj_backfill(
        initial_load_http_status=initial_load_response.status_code,
        restart_startup_error=restart_startup_error,
        restart_startup_persisted_payload=restart_startup_persisted_payload,
        restart_load_http_status=restart_load_http_status,
        restart_load_payload=restart_load_payload,
        post_load_persisted_payload=post_load_persisted_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "corruptedSettingsProjectDocument": corrupted_payload,
        "restartStartupError": restart_startup_error,
        "restartStartupPersistedSettingsProjectDocument": restart_startup_persisted_payload,
        "restartLoadProjectConfigStatus": restart_load_http_status,
        "restartLoadProjectConfig": restart_load_payload,
        "postLoadPersistedSettingsProjectDocument": post_load_persisted_payload,
    }


def execute_settings_project_display_name_backfill(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)

    persisted_payload = read_persisted_settings_project_document(backend)
    corrupted_payload = set_settings_code_obj_display_name_in_store_payload(
        persisted_payload,
        code_obj_name="gui",
        display_name="Custom GUI Label",
    )
    corrupted_payload = set_settings_code_obj_display_name_in_store_payload(
        corrupted_payload,
        code_obj_name="languageServer",
        display_name="",
    )
    corrupted_payload = remove_settings_param_from_store_payload(
        corrupted_payload,
        section_name="backend",
        param_path=["renameRefactorMode"],
    )
    write_json(backend.setta_files_root / SETTINGS_PROJECT_FILE_NAME, corrupted_payload)

    restart_backend(backend)

    restart_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    restart_latest_response = None
    restart_latest_payload = None
    if restart_load_response.status_code == 200 and isinstance(restart_load_payload, dict):
        restarted_project_config = object_field(restart_load_payload, "projectConfig")
        restarted_project_id = expect_non_empty_string(
            restarted_project_config.get("id"),
            "projectConfig.id",
        )
        restart_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": restarted_project_id},
        )
        restart_latest_payload = normalize_response_json_allow_status(
            restart_latest_response
        )

    persisted_after_payload = read_persisted_settings_project_document(backend)
    summary = summarize_settings_project_display_name_backfill(
        initial_load_http_status=initial_load_response.status_code,
        restart_load_http_status=restart_load_response.status_code,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        restart_latest_payload=restart_latest_payload,
        persisted_after_payload=persisted_after_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "corruptedSettingsProjectDocument": corrupted_payload,
        "restartLoadProjectConfigStatus": restart_load_response.status_code,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        "restartLatestProjectState": restart_latest_payload,
        "persistedSettingsProjectDocumentAfterRestart": persisted_after_payload,
    }


def execute_settings_project_valid_view_mode_noop(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)
    persisted_before_payload = read_persisted_settings_project_document(backend)

    restart_backend(backend)

    restart_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    restart_latest_response = None
    restart_latest_payload = None
    if restart_load_response.status_code == 200 and isinstance(restart_load_payload, dict):
        restarted_project_config = object_field(restart_load_payload, "projectConfig")
        restarted_project_id = expect_non_empty_string(
            restarted_project_config.get("id"),
            "projectConfig.id",
        )
        restart_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": restarted_project_id},
        )
        restart_latest_payload = normalize_response_json_allow_status(
            restart_latest_response
        )

    persisted_after_payload = read_persisted_settings_project_document(backend)
    summary = summarize_settings_project_valid_view_mode_noop(
        initial_load_http_status=initial_load_response.status_code,
        restart_load_http_status=restart_load_response.status_code,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        restart_latest_payload=restart_latest_payload,
        persisted_before_payload=persisted_before_payload,
        persisted_after_payload=persisted_after_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "persistedSettingsProjectDocumentBeforeRestart": persisted_before_payload,
        "restartLoadProjectConfigStatus": restart_load_response.status_code,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        "restartLatestProjectState": restart_latest_payload,
        "persistedSettingsProjectDocumentAfterRestart": persisted_after_payload,
    }


def execute_settings_project_top_level_layout_repair(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)

    persisted_payload = read_persisted_settings_project_document(backend)
    corrupted_payload = clear_settings_top_level_layouts_from_store_payload(
        persisted_payload
    )
    write_json(backend.setta_files_root / SETTINGS_PROJECT_FILE_NAME, corrupted_payload)

    restart_backend(backend)

    restart_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    restart_latest_response = None
    restart_latest_payload = None
    if restart_load_response.status_code == 200 and isinstance(restart_load_payload, dict):
        restarted_project_config = object_field(restart_load_payload, "projectConfig")
        restarted_project_id = expect_non_empty_string(
            restarted_project_config.get("id"),
            "projectConfig.id",
        )
        restart_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": restarted_project_id},
        )
        restart_latest_payload = normalize_response_json_allow_status(
            restart_latest_response
        )

    persisted_after_payload = read_persisted_settings_project_document(backend)
    summary = summarize_settings_project_top_level_layout_repair(
        initial_load_http_status=initial_load_response.status_code,
        restart_load_http_status=restart_load_response.status_code,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        restart_latest_payload=restart_latest_payload,
        persisted_after_payload=persisted_after_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "corruptedSettingsProjectDocument": corrupted_payload,
        "restartLoadProjectConfigStatus": restart_load_response.status_code,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        "restartLatestProjectState": restart_latest_payload,
        "persistedSettingsProjectDocumentAfterRestart": persisted_after_payload,
    }


def execute_settings_project_missing_visible_layout_repair(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_load_payload = normalize_response_json_allow_status(initial_load_response)

    persisted_payload = read_persisted_settings_project_document(backend)
    corrupted_payload = remove_settings_view_mode_layout_entry_from_store_payload(
        persisted_payload,
        view_mode_name="Param Defaults",
        section_name="buttonParamCodeObjDefault",
    )
    write_json(backend.setta_files_root / SETTINGS_PROJECT_FILE_NAME, corrupted_payload)

    restart_backend(backend)

    restart_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    restart_load_payload = normalize_response_json_allow_status(restart_load_response)

    restart_latest_response = None
    restart_latest_payload = None
    if restart_load_response.status_code == 200 and isinstance(restart_load_payload, dict):
        restarted_project_config = object_field(restart_load_payload, "projectConfig")
        restarted_project_id = expect_non_empty_string(
            restarted_project_config.get("id"),
            "projectConfig.id",
        )
        restart_latest_response = post_json_allow_status(
            session=backend.session,
            base_url=backend.base_url,
            route=ROUTE_GET_LATEST_PROJECT_STATE,
            payload={"projectConfigId": restarted_project_id},
        )
        restart_latest_payload = normalize_response_json_allow_status(
            restart_latest_response
        )

    persisted_after_payload = read_persisted_settings_project_document(backend)
    summary = summarize_settings_project_missing_visible_layout_repair(
        initial_load_http_status=initial_load_response.status_code,
        restart_load_http_status=restart_load_response.status_code,
        restart_load_payload=restart_load_payload,
        restart_latest_http_status=None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        restart_latest_payload=restart_latest_payload,
        persisted_after_payload=persisted_after_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_load_response.status_code,
        "initialLoadProjectConfig": initial_load_payload,
        "corruptedSettingsProjectDocument": corrupted_payload,
        "restartLoadProjectConfigStatus": restart_load_response.status_code,
        "restartLoadProjectConfig": restart_load_payload,
        "restartLatestProjectStateStatus": None
        if restart_latest_response is None
        else restart_latest_response.status_code,
        "restartLatestProjectState": restart_latest_payload,
        "persistedSettingsProjectDocumentAfterRestart": persisted_after_payload,
    }


def execute_workspace_launch_outdated_settings_error(
    backend: BackendSession,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial_settings_load_response = post_json_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_LOAD_PROJECT_CONFIG,
        payload={"projectConfigName": "settings"},
    )
    initial_settings_load_payload = normalize_response_json_allow_status(
        initial_settings_load_response
    )

    persisted_payload = read_persisted_settings_project_document(backend)
    corrupted_payload = remove_settings_section_from_store_payload(
        persisted_payload,
        section_name="spreadsheetSectionDefault",
    )

    launch_workspace_root = backend.temp_root / "launch-target-workspace"
    launch_setta_files_root = launch_workspace_root / "setta_files"
    launch_workspace_root.mkdir(parents=True, exist_ok=True)
    launch_setta_files_root.mkdir(parents=True, exist_ok=True)
    write_json(
        launch_setta_files_root / SETTINGS_PROJECT_FILE_NAME,
        corrupted_payload,
    )

    return_url = backend.frontend_origin + "/home"
    create_intent_response = post_json_with_origin_allow_status(
        session=backend.session,
        base_url=backend.base_url,
        route=ROUTE_CREATE_WORKSPACE_LAUNCH_INTENT,
        payload={
            "launchRequest": {
                "workspaceRoot": str(launch_workspace_root),
                "settaFilesLocation": "local",
            },
            "returnUrl": return_url,
        },
        origin=backend.frontend_origin,
    )
    create_intent_payload = normalize_response_json_allow_status(create_intent_response)

    launch_response = None
    launch_payload = None
    if create_intent_response.status_code == 200 and isinstance(create_intent_payload, dict):
        launch_intent_token = normalized_string(
            create_intent_payload.get("launchIntentToken")
        )
        if launch_intent_token:
            launch_response = post_json_with_origin_allow_status(
                session=backend.session,
                base_url=backend.base_url,
                route=ROUTE_LAUNCH,
                payload={"launchIntentToken": launch_intent_token},
                origin=backend.frontend_origin,
            )
            launch_payload = normalize_response_json_allow_status(launch_response)

    summary = summarize_workspace_launch_outdated_settings_error(
        initial_settings_load_http_status=initial_settings_load_response.status_code,
        create_intent_http_status=create_intent_response.status_code,
        create_intent_payload=create_intent_payload,
        launch_http_status=None if launch_response is None else launch_response.status_code,
        launch_payload=launch_payload,
    )
    return summary, {
        "initialLoadProjectConfigStatus": initial_settings_load_response.status_code,
        "initialLoadProjectConfig": initial_settings_load_payload,
        "corruptedSettingsProjectDocument": corrupted_payload,
        "createWorkspaceLaunchIntentStatus": create_intent_response.status_code,
        "createWorkspaceLaunchIntent": create_intent_payload,
        "launchStatus": None if launch_response is None else launch_response.status_code,
        "launch": launch_payload,
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
    response = post_json_allow_status(
        session=session,
        base_url=base_url,
        route=route,
        payload=payload,
    )
    if response.status_code != 200:
        raise ParityHarnessError(
            f"Request {route} failed with {response.status_code}: {response.text}"
        )
    return response


def post_json_allow_status(
    session: requests.Session,
    base_url: str,
    route: str,
    payload: dict[str, Any],
) -> requests.Response:
    return session.post(
        base_url + route,
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )


def post_json_with_origin_allow_status(
    session: requests.Session,
    base_url: str,
    route: str,
    payload: dict[str, Any],
    origin: str,
) -> requests.Response:
    return session.post(
        base_url + route,
        json=payload,
        headers={"Origin": origin},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )


def normalize_response_json(response: requests.Response) -> Any:
    payload = normalize_response_json_allow_status(response)
    if isinstance(payload, dict) and "_rawText" in payload:
        raise ParityHarnessError(
            f"Expected JSON response from {response.request.path_url}: {payload['_rawText']}"
        )
    return payload


def normalize_response_json_allow_status(response: requests.Response) -> Any:
    try:
        return response.json()
    except json.JSONDecodeError:
        return {"_rawText": response.text}


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
    raw_window_spaces = project_config.get("windowSpaces")
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
        "windowSpacesObjectPresent": isinstance(raw_window_spaces, dict),
        "shownParamEntryCount": len(shown_param_ids),
    }


def summarize_latest_state_prunes_stale_active_ids(
    http_status: int,
    payload: dict[str, Any],
    valid_section_id: str,
) -> dict[str, Any]:
    project_state = object_field(payload, "projectState")
    project_config = object_field(project_state, "projectConfig")
    active_ids = expect_string_list(
        project_config.get("activeIds"),
        "projectState.projectConfig.activeIds",
    )
    return {
        "httpStatus": http_status,
        "activeIDCount": len(active_ids),
        "retainedValidSectionID": valid_section_id in active_ids,
        "hasDeletedSectionID": "deleted-section" in active_ids,
    }


def summarize_persisted_project_windowing_after_create(
    project_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    projects = object_field(payload, "projects", allow_missing=True)
    source_projects = object_field(payload, "projectConfigs", allow_missing=True)
    project = expect_object(
        projects.get(project_id) or source_projects.get(project_id),
        f"projects.{project_id}",
    )
    raw_windowing = project.get("projectChatWindowing")
    if raw_windowing is None:
        source_windowing_by_id = object_field(
            payload,
            "projectChatWindowingByProjectConfigId",
            allow_missing=True,
        )
        raw_windowing = source_windowing_by_id.get(project_id)
    windowing = expect_object(
        raw_windowing,
        f"projectChatWindowing.{project_id}",
        allow_missing=True,
    )
    instances_by_id = object_field(windowing, "instancesById", allow_missing=True)
    order = expect_list(
        windowing.get("order"),
        f"projects.{project_id}.projectChatWindowing.order",
        allow_missing=True,
    )
    next_instance_number = windowing.get("nextInstanceNumber")
    return {
        "projectPresent": True,
        "projectChatWindowingPresent": raw_windowing is not None,
        "projectChatWindowCount": len(instances_by_id),
        "projectChatWindowOrderCount": len(order),
        "nextInstanceNumber": next_instance_number,
    }


def summarize_project_windowing_authoritative_presence_on_load(
    restart_startup_error: str | None,
    restart_load_http_status: int | None,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
    persisted_after_payload: dict[str, Any],
    project_id: str,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "persistedWindowingPresentAfterRestart": project_has_windowing_in_store_payload(
            persisted_after_payload,
            project_id=project_id,
        ),
    }
    if restart_startup_error is not None:
        summary["restartStartupStatus"] = "failed"
        return summary

    summary["restartStartupStatus"] = "ready"
    summary["restartLoadHttpStatus"] = restart_load_http_status
    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        raw_windowing = restart_load_payload.get("projectChatWindowing")
        summary["restartLoadProjectChatWindowingPresent"] = isinstance(
            raw_windowing,
            dict,
        )
    elif restart_load_http_status is not None:
        summary["restartLoadErrorSummary"] = normalize_error_summary(
            restart_load_payload
        )

    summary["restartLatestHttpStatus"] = restart_latest_http_status
    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        raw_windowing = latest_project_state.get("projectChatWindowing")
        summary["restartLatestProjectChatWindowingPresent"] = isinstance(
            raw_windowing,
            dict,
        )
    elif restart_latest_http_status is not None:
        summary["restartLatestErrorSummary"] = normalize_error_summary(
            restart_latest_payload
        )

    return summary


def summarize_windowing_section_binding_dedup_and_title_clearing_on_load(
    restart_load_http_status: int,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "restartLoadHttpStatus": restart_load_http_status,
        "restartLatestHttpStatus": restart_latest_http_status,
    }

    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        summary.update(
            summarize_single_config_windowing_section_binding_state(
                payload=restart_load_payload,
                prefix="restartLoad",
            )
        )
    else:
        summary["restartLoadErrorSummary"] = normalize_error_summary(restart_load_payload)

    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        summary.update(
            summarize_single_config_windowing_section_binding_state(
                payload=latest_project_state,
                prefix="restartLatest",
            )
        )
    elif restart_latest_http_status is not None:
        summary["restartLatestErrorSummary"] = normalize_error_summary(
            restart_latest_payload
        )

    return summary


def summarize_project_chat_windowing_invalid_owner_mode_combos_on_load(
    restart_startup_error: str | None,
    restart_load_http_status: int | None,
    restart_load_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    if restart_startup_error is not None:
        summary["restartStartupStatus"] = "failed"
        return summary

    summary["restartStartupStatus"] = "ready"
    summary["restartLoadHttpStatus"] = restart_load_http_status
    if restart_load_http_status != 200:
        summary["restartLoadErrorSummary"] = normalize_error_summary(restart_load_payload)
    return summary


def summarize_window_spaces_invalid_owner_mode_combos_on_load(
    restart_startup_error: str | None,
    restart_load_http_status: int | None,
    restart_load_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    if restart_startup_error is not None:
        summary["restartStartupStatus"] = "failed"
        return summary

    summary["restartStartupStatus"] = "ready"
    summary["restartLoadHttpStatus"] = restart_load_http_status
    if restart_load_http_status != 200:
        summary["restartLoadErrorSummary"] = normalize_error_summary(restart_load_payload)
    return summary


def summarize_windowing_scoped_per_project_config(
    first_load_http_status: int,
    first_load_payload: Any,
    first_latest_http_status: int | None,
    first_latest_payload: Any,
    second_load_http_status: int,
    second_load_payload: Any,
    second_latest_http_status: int | None,
    second_latest_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "firstLoadHttpStatus": first_load_http_status,
        "firstLatestHttpStatus": first_latest_http_status,
        "secondLoadHttpStatus": second_load_http_status,
        "secondLatestHttpStatus": second_latest_http_status,
    }
    if first_load_http_status == 200 and isinstance(first_load_payload, dict):
        summary.update(
            summarize_single_config_windowing_scope(
                payload=first_load_payload,
                prefix="firstLoad",
            )
        )
    if first_latest_http_status == 200 and isinstance(first_latest_payload, dict):
        summary.update(
            summarize_single_config_windowing_scope(
                payload=object_field(first_latest_payload, "projectState"),
                prefix="firstLatest",
            )
        )
    if second_load_http_status == 200 and isinstance(second_load_payload, dict):
        summary.update(
            summarize_single_config_windowing_scope(
                payload=second_load_payload,
                prefix="secondLoad",
            )
        )
    if second_latest_http_status == 200 and isinstance(second_latest_payload, dict):
        summary.update(
            summarize_single_config_windowing_scope(
                payload=object_field(second_latest_payload, "projectState"),
                prefix="secondLatest",
            )
        )
    return summary


def summarize_project_chat_window_chat_id_route_contract(
    valid_bind_http_status: int,
    valid_bind_payload: Any,
    invalid_mode_http_status: int,
    invalid_mode_payload: Any,
    missing_window_http_status: int,
    missing_window_payload: Any,
    latest_http_status: int,
    latest_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "validBindHttpStatus": valid_bind_http_status,
        "invalidModeHttpStatus": invalid_mode_http_status,
        "missingWindowHttpStatus": missing_window_http_status,
        "latestHttpStatus": latest_http_status,
    }
    if valid_bind_http_status == 200 and isinstance(valid_bind_payload, dict):
        summary["validBindChatID"] = project_chat_window_chat_id_from_windowing_payload(
            valid_bind_payload,
            "project-ai-window",
        )
    else:
        summary["validBindErrorSummary"] = normalize_error_summary(valid_bind_payload)

    if invalid_mode_http_status != 200:
        summary["invalidModeErrorCode"] = normalize_error_code(invalid_mode_payload)
        summary["invalidModeErrorSummary"] = normalize_error_summary(invalid_mode_payload)

    if missing_window_http_status != 200:
        summary["missingWindowErrorCode"] = normalize_error_code(missing_window_payload)
        summary["missingWindowErrorSummary"] = normalize_error_summary(
            missing_window_payload
        )

    if latest_http_status == 200 and isinstance(latest_payload, dict):
        latest_single_config = object_field(latest_payload, "projectState")
        summary["latestProjectAIChatID"] = project_chat_window_chat_id_from_single_config(
            latest_single_config,
            "project-ai-window",
        )
        summary["latestSectionModeChatID"] = project_chat_window_chat_id_from_single_config(
            latest_single_config,
            "section-window",
        )
    else:
        summary["latestErrorSummary"] = normalize_error_summary(latest_payload)
    return summary


def summarize_project_chat_windowing_state_invalid_owner_mode_write_contract(
    section_mode_http_status: int,
    section_mode_payload: Any,
    git_graph_section_http_status: int,
    git_graph_section_payload: Any,
    git_graph_canvas_http_status: int,
    git_graph_canvas_payload: Any,
) -> dict[str, Any]:
    return {
        "sectionModeHttpStatus": section_mode_http_status,
        "sectionModeErrorCode": normalize_error_code(section_mode_payload),
        "sectionModeErrorSummary": normalize_error_summary(section_mode_payload),
        "gitGraphSectionHttpStatus": git_graph_section_http_status,
        "gitGraphSectionErrorCode": normalize_error_code(git_graph_section_payload),
        "gitGraphSectionErrorSummary": normalize_error_summary(
            git_graph_section_payload
        ),
        "gitGraphCanvasHttpStatus": git_graph_canvas_http_status,
        "gitGraphCanvasErrorCode": normalize_error_code(git_graph_canvas_payload),
        "gitGraphCanvasErrorSummary": normalize_error_summary(
            git_graph_canvas_payload
        ),
    }


def summarize_window_space_create_invalid_owner_mode_write_contract(
    section_missing_http_status: int,
    section_missing_payload: Any,
    project_chat_section_http_status: int,
    project_chat_section_payload: Any,
    section_git_graph_http_status: int,
    section_git_graph_payload: Any,
    project_chat_section_mode_http_status: int,
    project_chat_section_mode_payload: Any,
    non_project_ai_chat_id_http_status: int,
    non_project_ai_chat_id_payload: Any,
) -> dict[str, Any]:
    return {
        "sectionMissingHttpStatus": section_missing_http_status,
        "sectionMissingErrorCode": normalize_error_code(section_missing_payload),
        "sectionMissingErrorSummary": normalize_error_summary(section_missing_payload),
        "projectChatSectionHttpStatus": project_chat_section_http_status,
        "projectChatSectionErrorCode": normalize_error_code(
            project_chat_section_payload
        ),
        "projectChatSectionErrorSummary": normalize_error_summary(
            project_chat_section_payload
        ),
        "sectionGitGraphHttpStatus": section_git_graph_http_status,
        "sectionGitGraphErrorCode": normalize_error_code(section_git_graph_payload),
        "sectionGitGraphErrorSummary": normalize_error_summary(
            section_git_graph_payload
        ),
        "projectChatSectionModeHttpStatus": project_chat_section_mode_http_status,
        "projectChatSectionModeErrorCode": normalize_error_code(
            project_chat_section_mode_payload
        ),
        "projectChatSectionModeErrorSummary": normalize_error_summary(
            project_chat_section_mode_payload
        ),
        "nonProjectAIChatIDHttpStatus": non_project_ai_chat_id_http_status,
        "nonProjectAIChatIDErrorCode": normalize_error_code(
            non_project_ai_chat_id_payload
        ),
        "nonProjectAIChatIDErrorSummary": normalize_error_summary(
            non_project_ai_chat_id_payload
        ),
    }


def summarize_prompt_template_link_rejects_non_prompt_sections(
    link_http_status: int,
    link_payload: Any,
) -> dict[str, Any]:
    error_code = normalize_prompt_template_link_non_prompt_error(
        normalize_error_code(link_payload)
    )
    error_summary = normalize_prompt_template_link_non_prompt_error(
        normalize_error_summary(link_payload)
    )
    return {
        "linkHttpStatus": link_http_status,
        "linkErrorCode": error_code,
        "linkErrorSummary": error_summary,
    }


def summarize_window_space_duplicate_sort_indices_on_load(
    load_http_status: int,
    load_payload: dict[str, Any],
    latest_http_status: int,
    latest_payload: dict[str, Any],
) -> dict[str, Any]:
    load_window_spaces = extract_load_window_spaces(load_payload)
    latest_window_spaces = extract_latest_window_spaces(latest_payload)
    return {
        "loadHttpStatus": load_http_status,
        "loadSortIndexByWindowSpaceName": sort_index_summary_by_name(load_window_spaces),
        "loadSortedWindowSpaceNames": sort_window_space_names(load_window_spaces),
        "loadHasDuplicateSortIndices": has_duplicate_sort_indices(load_window_spaces),
        "latestHttpStatus": latest_http_status,
        "latestSortIndexByWindowSpaceName": sort_index_summary_by_name(
            latest_window_spaces
        ),
        "latestSortedWindowSpaceNames": sort_window_space_names(latest_window_spaces),
        "latestHasDuplicateSortIndices": has_duplicate_sort_indices(
            latest_window_spaces
        ),
    }


def summarize_single_config_windowing_scope(
    payload: dict[str, Any],
    prefix: str,
) -> dict[str, Any]:
    project_config = object_field(payload, "projectConfig")
    window_spaces = object_field(project_config, "windowSpaces", allow_missing=True)
    window_space_window_ids_by_space: dict[str, list[str]] = {}
    for window_space_id in sorted(window_spaces.keys()):
        window_space = expect_object(
            window_spaces[window_space_id],
            f"projectConfig.windowSpaces.{window_space_id}",
        )
        windows_by_id = object_field(
            window_space,
            "windowsById",
            allow_missing=True,
        )
        window_space_window_ids_by_space[window_space_id] = sorted(windows_by_id.keys())

    project_chat_windowing = expect_object(
        payload.get("projectChatWindowing"),
        "projectChatWindowing",
        allow_missing=True,
    )
    project_chat_instances = object_field(
        project_chat_windowing,
        "instancesById",
        allow_missing=True,
    )
    project_chat_chat_ids: dict[str, str | None] = {}
    for instance_id in sorted(project_chat_instances.keys()):
        instance = expect_object(
            project_chat_instances[instance_id],
            f"projectChatWindowing.instancesById.{instance_id}",
        )
        chat_id = instance.get("chatId")
        project_chat_chat_ids[instance_id] = (
            None if chat_id is None else normalized_string(chat_id)
        )

    return {
        f"{prefix}WindowSpaceIDs": sorted(window_spaces.keys()),
        f"{prefix}WindowSpaceWindowIDsBySpace": window_space_window_ids_by_space,
        f"{prefix}ProjectChatWindowIDs": sorted(project_chat_instances.keys()),
        f"{prefix}ProjectChatChatIDs": project_chat_chat_ids,
    }


def summarize_single_config_windowing_section_binding_state(
    payload: dict[str, Any],
    prefix: str,
) -> dict[str, Any]:
    project_chat_windowing = expect_object(
        payload.get("projectChatWindowing"),
        "projectChatWindowing",
        allow_missing=True,
    )
    project_chat_instances = object_field(
        project_chat_windowing,
        "instancesById",
        allow_missing=True,
    )
    project_chat_titles: dict[str, str | None] = {}
    for instance_id, raw_instance in project_chat_instances.items():
        instance = expect_object(raw_instance, f"projectChatWindowing.instancesById.{instance_id}")
        title_value = instance.get("title")
        project_chat_titles[instance_id] = (
            None if title_value is None else normalized_string(title_value)
        )

    project_config = object_field(payload, "projectConfig")
    window_spaces = object_field(project_config, "windowSpaces", allow_missing=True)
    space = expect_object(
        window_spaces.get("space-dedupe"),
        "projectConfig.windowSpaces.space-dedupe",
        allow_missing=True,
    )
    space_windows = object_field(space, "windowsById", allow_missing=True)
    space_titles: dict[str, str | None] = {}
    for window_id, raw_window in space_windows.items():
        window = expect_object(raw_window, f"projectConfig.windowSpaces.space-dedupe.windowsById.{window_id}")
        title_value = window.get("title")
        space_titles[window_id] = (
            None if title_value is None else normalized_string(title_value)
        )

    return {
        f"{prefix}ProjectChatSectionWindowCount": len(project_chat_instances),
        f"{prefix}ProjectChatSectionWindowIDs": sorted(project_chat_instances.keys()),
        f"{prefix}ProjectChatSectionWindowTitles": project_chat_titles,
        f"{prefix}WindowSpaceSectionWindowCount": len(space_windows),
        f"{prefix}WindowSpaceSectionWindowIDs": sorted(space_windows.keys()),
        f"{prefix}WindowSpaceSectionWindowTitles": space_titles,
    }


def project_chat_window_chat_id_from_single_config(
    payload: dict[str, Any],
    instance_id: str,
) -> str | None:
    project_chat_windowing = expect_object(
        payload.get("projectChatWindowing"),
        "projectChatWindowing",
        allow_missing=True,
    )
    return project_chat_window_chat_id_from_windowing_payload(
        project_chat_windowing,
        instance_id,
    )


def project_chat_window_chat_id_from_windowing_payload(
    payload: dict[str, Any],
    instance_id: str,
) -> str | None:
    project_chat_instances = object_field(
        payload,
        "instancesById",
        allow_missing=True,
    )
    instance = expect_object(
        project_chat_instances.get(instance_id),
        f"instancesById.{instance_id}",
        allow_missing=True,
    )
    chat_id = instance.get("chatId")
    if chat_id is None:
        return None
    return normalized_string(chat_id)


def summarize_settings_project_shell(
    http_status: int,
    payload: Any,
    latest_http_status: int | None,
    latest_payload: Any,
    workspace_root: str,
) -> dict[str, Any]:
    summary: dict[str, Any] = {"httpStatus": http_status, "latestHttpStatus": latest_http_status}
    if http_status != 200 or not isinstance(payload, dict):
        return summary

    display_name_sample_names = [
        "gui",
        "languageServer",
        "iFrameSectionDefault",
        "genPythonCodeSectionDefault",
    ]
    project_config = object_field(payload, "projectConfig")
    sections = object_field(payload, "sections", allow_missing=True)
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    active_view_mode_id = normalized_string(project_config.get("activeViewModeId"))

    section_names = []
    for key in sorted(sections):
        section = expect_object(sections[key], f"sections.{key}")
        section_names.append(normalized_string(section.get("name")))
    section_names.sort()

    ordered_view_mode_names_list = ordered_view_mode_names(view_modes)
    ordered_view_modes = [
        settings_view_mode_by_name(view_modes, view_mode_name)
        for view_mode_name in ordered_view_mode_names_list
    ]

    counts_by_view: dict[str, int] = {}
    active_view_mode_name = ""
    for view_mode in ordered_view_modes:
        view_mode_name = normalized_string(view_mode.get("name"))
        visibility = object_field(view_mode, "visibilityBySectionId", allow_missing=True)
        visible_count = sum(1 for visible in visibility.values() if visible is True)
        if not visibility:
            visible_count = len(
                object_field(view_mode, "topLevelSections", allow_missing=True)
            )
        counts_by_view[view_mode_name] = visible_count
        if normalized_string(view_mode.get("id")) == active_view_mode_id:
            active_view_mode_name = view_mode_name

    latest_project_name = None
    latest_project_id_matches = None
    if latest_http_status == 200 and isinstance(latest_payload, dict):
        latest_project_state = object_field(latest_payload, "projectState")
        latest_project_config = object_field(latest_project_state, "projectConfig")
        latest_project_name = normalized_string(latest_project_config.get("name"))
        latest_project_id_matches = normalized_string(
            latest_project_config.get("id")
        ) == normalized_string(project_config.get("id"))

    project_chat_windowing = object_field(
        payload, "projectChatWindowing", allow_missing=True
    )
    summary.update(
        {
            "projectName": normalized_string(project_config.get("name")),
            "sectionCount": len(sections),
            "sectionNames": section_names,
            "viewModeCount": len(view_modes),
            "viewModeNames": ordered_view_mode_names_list,
            "activeViewModeName": active_view_mode_name,
            "countsByView": counts_by_view,
            "fixedWidthSectionCount": settings_payload_fixed_width_section_count(
                payload,
                expected_width=550,
            ),
            "jsonSourceVariantNameSamples": settings_payload_section_variant_name_samples(
                payload,
                display_name_sample_names,
                workspace_root=workspace_root,
            ),
            "jsonSourceConfigLanguageSamples": settings_payload_section_config_language_samples(
                payload,
                display_name_sample_names,
            ),
            "sectionWidthSamples": settings_payload_section_width_samples(
                payload,
                display_name_sample_names,
            ),
            "sectionDisplayNameSamples": settings_payload_section_display_name_samples(
                payload,
                display_name_sample_names,
            ),
            "rootCodeObjDisplayNameSamples": settings_payload_code_obj_display_name_samples(
                payload,
                display_name_sample_names,
            ),
            "showParamDisplayNames": bool(
                project_config.get("showParamDisplayNames", False)
            ),
            "allowJsonSourceKeyEdits": bool(
                project_config.get("allowJsonSourceKeyEdits", False)
            ),
            "projectChatWindowingKeys": sorted(project_chat_windowing.keys()),
            "latestProjectName": latest_project_name,
            "latestProjectIDMatchesLoadProjectID": latest_project_id_matches,
        }
    )
    summary.update(
        summarize_settings_view_mode_layout_contract(
            project_config=project_config,
            sections=sections,
        )
    )
    if latest_http_status == 200 and isinstance(latest_payload, dict):
        latest_project_state = object_field(latest_payload, "projectState")
        latest_project_config = object_field(latest_project_state, "projectConfig")
        latest_sections = object_field(latest_project_state, "sections", allow_missing=True)
        summary.update(
            summarize_settings_view_mode_layout_contract(
                project_config=latest_project_config,
                sections=latest_sections,
                key_prefix="latest",
            )
        )
        summary.update(
            {
                "latestFixedWidthSectionCount": settings_payload_fixed_width_section_count(
                    latest_project_state,
                    expected_width=550,
                ),
                "latestJSONSourceVariantNameSamples": settings_payload_section_variant_name_samples(
                    latest_project_state,
                    display_name_sample_names,
                    workspace_root=workspace_root,
                ),
                "latestJSONSourceConfigLanguageSamples": settings_payload_section_config_language_samples(
                    latest_project_state,
                    display_name_sample_names,
                ),
                "latestSectionWidthSamples": settings_payload_section_width_samples(
                    latest_project_state,
                    display_name_sample_names,
                ),
                "latestSectionDisplayNameSamples": settings_payload_section_display_name_samples(
                    latest_project_state,
                    display_name_sample_names,
                ),
                "latestRootCodeObjDisplayNameSamples": settings_payload_code_obj_display_name_samples(
                    latest_project_state,
                    display_name_sample_names,
                ),
            }
        )
    return summary


def summarize_settings_project_live_hydration(
    save_http_status: int,
    save_payload: Any,
    load_http_status: int,
    load_payload: Any,
    latest_http_status: int | None,
    latest_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "saveHttpStatus": save_http_status,
        "loadHttpStatus": load_http_status,
        "latestHttpStatus": latest_http_status,
    }
    if save_http_status != 200:
        summary["savePayload"] = save_payload
        return summary
    if load_http_status != 200 or not isinstance(load_payload, dict):
        return summary

    summary["loadedRenameRefactorMode"] = extract_settings_project_param_value(
        load_payload,
        section_name="backend",
        param_path=["renameRefactorMode"],
    )

    if latest_http_status == 200 and isinstance(latest_payload, dict):
        latest_project_state = object_field(latest_payload, "projectState")
        summary["latestRenameRefactorMode"] = extract_settings_project_param_value(
            latest_project_state,
            section_name="backend",
            param_path=["renameRefactorMode"],
        )

    return summary


def summarize_settings_project_reserved_name_save_update(
    initial_load_http_status: int,
    save_http_status: int | None,
    restart_load_http_status: int | None,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
    persisted_after_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
        "saveProjectHttpStatus": save_http_status,
        "restartLoadHttpStatus": restart_load_http_status,
        "restartLatestHttpStatus": restart_latest_http_status,
    }

    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        restart_project_config = object_field(restart_load_payload, "projectConfig")
        summary["restartLoadProjectName"] = normalized_string(
            restart_project_config.get("name")
        )
        restart_load_active_view_mode_name = settings_payload_active_view_mode_name(
            restart_load_payload
        )
        if restart_load_active_view_mode_name is not None:
            summary["restartLoadActiveViewModeName"] = (
                restart_load_active_view_mode_name
            )

    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        restart_latest_project_config = object_field(latest_project_state, "projectConfig")
        summary["restartLatestProjectName"] = normalized_string(
            restart_latest_project_config.get("name")
        )
        restart_latest_active_view_mode_name = settings_payload_active_view_mode_name(
            latest_project_state
        )
        if restart_latest_active_view_mode_name is not None:
            summary["restartLatestActiveViewModeName"] = (
                restart_latest_active_view_mode_name
            )

    if isinstance(persisted_after_payload, dict):
        settings_project = settings_project_payload_from_store_payload(persisted_after_payload)
        persisted_project_config = settings_project
        if "projectConfig" in settings_project:
            persisted_project_config = object_field(settings_project, "projectConfig")
        summary["persistedProjectName"] = normalized_string(
            persisted_project_config.get("name")
        )
        persisted_active_view_mode_name = settings_store_active_view_mode_name(
            persisted_after_payload
        )
        if persisted_active_view_mode_name is not None:
            summary["persistedActiveViewModeName"] = persisted_active_view_mode_name

    return summary


def summarize_settings_project_required_view_mode_repair(
    initial_load_http_status: int,
    delete_http_status: int,
    pre_restart_latest_http_status: int,
    pre_restart_latest_payload: Any,
    restart_load_http_status: int,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
    persisted_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
        "deleteHttpStatus": delete_http_status,
        "restartLoadHttpStatus": restart_load_http_status,
        "restartLatestHttpStatus": restart_latest_http_status,
    }

    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        restart_view_mode_names = settings_payload_view_mode_names(restart_load_payload)
        summary["restartLoadViewModeCount"] = len(restart_view_mode_names)
        summary["restartLoadViewModeNames"] = restart_view_mode_names
        summary["restartLoadHasAllSettings"] = "All Settings" in restart_view_mode_names

    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        restart_latest_view_mode_names = settings_payload_view_mode_names(
            latest_project_state
        )
        summary["restartLatestViewModeCount"] = len(restart_latest_view_mode_names)
        summary["restartLatestViewModeNames"] = restart_latest_view_mode_names
        summary["restartLatestHasAllSettings"] = (
            "All Settings" in restart_latest_view_mode_names
        )

    persisted_view_mode_names = settings_store_view_mode_names(persisted_payload)
    summary["persistedViewModeCount"] = len(persisted_view_mode_names)
    summary["persistedViewModeNames"] = persisted_view_mode_names
    summary["persistedHasAllSettings"] = "All Settings" in persisted_view_mode_names
    return summary


def summarize_settings_project_missing_required_section_fails_closed(
    initial_load_http_status: int,
    restart_startup_error: str | None,
    restart_load_http_status: int | None,
    restart_load_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
    }
    if restart_startup_error is not None:
        summary["restartStartupStatus"] = "failed"
        summary["restartStartupErrorSummary"] = normalize_backend_error_summary(
            restart_startup_error
        )
        return summary

    summary["restartStartupStatus"] = "ready"
    summary["restartLoadHttpStatus"] = restart_load_http_status
    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        sections = object_field(restart_load_payload, "sections", allow_missing=True)
        summary["restartLoadSectionCount"] = len(sections)
    else:
        summary["restartLoadErrorSummary"] = normalize_error_summary(
            restart_load_payload
        )
    return summary


def summarize_settings_project_existing_section_code_obj_backfill(
    initial_load_http_status: int,
    restart_startup_error: str | None,
    restart_startup_persisted_payload: Any,
    restart_load_http_status: int | None,
    restart_load_payload: Any,
    post_load_persisted_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
    }
    if restart_startup_error is not None:
        summary["restartStartupStatus"] = "failed"
        summary["restartStartupErrorSummary"] = normalize_backend_error_summary(
            restart_startup_error
        )
        return summary

    summary["restartStartupStatus"] = "ready"
    summary["restartStartupParamImplTypes"] = settings_store_param_impl_type_samples(
        restart_startup_persisted_payload
    )
    summary["restartStartupDropdownChoices"] = settings_store_dropdown_choice_samples(
        restart_startup_persisted_payload
    )

    summary["restartLoadHttpStatus"] = restart_load_http_status
    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        summary["restartLoadParamImplTypes"] = settings_payload_param_impl_type_samples(
            restart_load_payload
        )
        summary["restartLoadDropdownChoices"] = settings_payload_dropdown_choice_samples(
            restart_load_payload
        )
    else:
        summary["restartLoadErrorSummary"] = normalize_error_summary(
            restart_load_payload
        )

    summary["postLoadPersistedParamImplTypes"] = settings_store_param_impl_type_samples(
        post_load_persisted_payload
    )
    summary["postLoadPersistedDropdownChoices"] = settings_store_dropdown_choice_samples(
        post_load_persisted_payload
    )
    return summary


def summarize_settings_project_display_name_backfill(
    initial_load_http_status: int,
    restart_load_http_status: int,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
    persisted_after_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
        "restartLoadHttpStatus": restart_load_http_status,
        "restartLatestHttpStatus": restart_latest_http_status,
        "persistedAfterRestartCodeObjDisplayNames": settings_store_code_obj_display_name_samples(
            persisted_after_payload,
            SETTINGS_DISPLAY_NAME_SAMPLE_CODE_OBJ_NAMES,
        ),
    }

    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        summary["restartLoadCodeObjDisplayNames"] = settings_payload_code_obj_display_name_samples(
            restart_load_payload,
            SETTINGS_DISPLAY_NAME_SAMPLE_CODE_OBJ_NAMES,
        )
    else:
        summary["restartLoadErrorSummary"] = normalize_error_summary(
            restart_load_payload
        )

    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        summary["restartLatestCodeObjDisplayNames"] = settings_payload_code_obj_display_name_samples(
            latest_project_state,
            SETTINGS_DISPLAY_NAME_SAMPLE_CODE_OBJ_NAMES,
        )
    elif restart_latest_http_status is not None:
        summary["restartLatestErrorSummary"] = normalize_error_summary(
            restart_latest_payload
        )

    return summary


def summarize_settings_project_valid_view_mode_noop(
    initial_load_http_status: int,
    restart_load_http_status: int,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
    persisted_before_payload: Any,
    persisted_after_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
        "restartLoadHttpStatus": restart_load_http_status,
        "restartLatestHttpStatus": restart_latest_http_status,
        "persistedDocumentUnchanged": persisted_before_payload == persisted_after_payload,
    }

    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        restart_view_mode_names = settings_payload_view_mode_names(restart_load_payload)
        summary["restartLoadViewModeCount"] = len(restart_view_mode_names)
        summary["restartLoadHasAllSettings"] = "All Settings" in restart_view_mode_names

    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        restart_latest_view_mode_names = settings_payload_view_mode_names(
            latest_project_state
        )
        summary["restartLatestViewModeCount"] = len(restart_latest_view_mode_names)
        summary["restartLatestHasAllSettings"] = (
            "All Settings" in restart_latest_view_mode_names
        )

    persisted_view_mode_names = settings_store_view_mode_names(persisted_after_payload)
    summary["persistedViewModeCount"] = len(persisted_view_mode_names)
    summary["persistedHasAllSettings"] = "All Settings" in persisted_view_mode_names
    return summary


def summarize_settings_project_top_level_layout_repair(
    initial_load_http_status: int,
    restart_load_http_status: int,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
    persisted_after_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
        "restartLoadHttpStatus": restart_load_http_status,
        "restartLatestHttpStatus": restart_latest_http_status,
    }

    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        project_config = object_field(restart_load_payload, "projectConfig")
        restart_view_mode_names = settings_payload_view_mode_names(restart_load_payload)
        summary["restartLoadViewModeCount"] = len(restart_view_mode_names)
        summary["restartLoadTopLevelSectionCount"] = len(
            object_field(project_config, "topLevelSections", allow_missing=True)
        )

    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        latest_project_config = object_field(latest_project_state, "projectConfig")
        restart_latest_view_mode_names = settings_payload_view_mode_names(
            latest_project_state
        )
        summary["restartLatestViewModeCount"] = len(restart_latest_view_mode_names)
        summary["restartLatestTopLevelSectionCount"] = len(
            object_field(latest_project_config, "topLevelSections", allow_missing=True)
        )

    persisted_view_mode_names = settings_store_view_mode_names(persisted_after_payload)
    summary["persistedViewModeCount"] = len(persisted_view_mode_names)
    summary["persistedTopLevelSectionCount"] = settings_store_top_level_section_count(
        persisted_after_payload
    )
    return summary


def summarize_settings_project_missing_visible_layout_repair(
    initial_load_http_status: int,
    restart_load_http_status: int,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
    persisted_after_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
        "restartLoadHttpStatus": restart_load_http_status,
        "restartLatestHttpStatus": restart_latest_http_status,
        "persistedParamLayoutPresent": settings_store_view_mode_layout_contains_section(
            persisted_after_payload,
            view_mode_name="Param Defaults",
            section_name="buttonParamCodeObjDefault",
        ),
    }

    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        summary["restartLoadParamLayoutPresent"] = (
            settings_payload_view_mode_layout_contains_section(
                restart_load_payload,
                view_mode_name="Param Defaults",
                section_name="buttonParamCodeObjDefault",
            )
        )

    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        summary["restartLatestParamLayoutPresent"] = (
            settings_payload_view_mode_layout_contains_section(
                latest_project_state,
                view_mode_name="Param Defaults",
                section_name="buttonParamCodeObjDefault",
            )
        )
    return summary


def summarize_settings_project_deleted_active_view_mode_repair(
    initial_load_http_status: int,
    restart_load_http_status: int,
    restart_load_payload: Any,
    restart_latest_http_status: int | None,
    restart_latest_payload: Any,
    persisted_after_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialLoadHttpStatus": initial_load_http_status,
        "restartLoadHttpStatus": restart_load_http_status,
        "restartLatestHttpStatus": restart_latest_http_status,
    }

    if restart_load_http_status == 200 and isinstance(restart_load_payload, dict):
        summary.update(
            summarize_settings_project_active_view_mode_projection(
                object_field(restart_load_payload, "projectConfig"),
                prefix="restartLoad",
            )
        )

    if restart_latest_http_status == 200 and isinstance(restart_latest_payload, dict):
        latest_project_state = object_field(restart_latest_payload, "projectState")
        summary.update(
            summarize_settings_project_active_view_mode_projection(
                object_field(latest_project_state, "projectConfig"),
                prefix="restartLatest",
            )
        )

    persisted_settings_project = settings_project_payload_from_store_payload(
        persisted_after_payload
    )
    persisted_project_config = persisted_settings_project
    if "projectConfig" in persisted_settings_project:
        persisted_project_config = object_field(persisted_settings_project, "projectConfig")
    summary.update(
        summarize_settings_project_active_view_mode_projection(
            persisted_project_config,
            prefix="persisted",
        )
    )
    return summary


def summarize_workspace_launch_outdated_settings_error(
    initial_settings_load_http_status: int,
    create_intent_http_status: int,
    create_intent_payload: Any,
    launch_http_status: int | None,
    launch_payload: Any,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "initialSettingsLoadHttpStatus": initial_settings_load_http_status,
        "createIntentHttpStatus": create_intent_http_status,
        "launchHttpStatus": launch_http_status,
    }

    if create_intent_http_status == 200 and isinstance(create_intent_payload, dict):
        summary["createIntentOk"] = bool(create_intent_payload.get("ok"))
        summary["createIntentHasToken"] = bool(
            normalized_string(create_intent_payload.get("launchIntentToken"))
        )
    else:
        summary["createIntentErrorSummary"] = normalize_error_summary(
            create_intent_payload
        )

    if launch_http_status == 200 and isinstance(launch_payload, dict):
        summary["launchOk"] = bool(launch_payload.get("ok"))
        error_payload = expect_object(
            launch_payload.get("error"),
            "launch.error",
            allow_missing=True,
        )
        error_code = normalized_string(error_payload.get("code"))
        error_message = normalized_string(error_payload.get("message"))
        if error_code:
            summary["launchErrorCode"] = error_code
        if error_message:
            summary["launchErrorHasMigrationCopy"] = (
                "older Setta settings/project format" in error_message
            )
            summary["launchErrorHasSectionName"] = (
                "spreadsheetSectionDefault" in error_message
            )
    elif launch_http_status is not None:
        summary["launchErrorSummary"] = normalize_error_summary(launch_payload)

    return summary


def summarize_settings_project_active_view_mode_projection(
    project_config: dict[str, Any],
    prefix: str,
) -> dict[str, Any]:
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    active_view_mode_id = normalized_string(project_config.get("activeViewModeId"))
    summary: dict[str, Any] = {
        f"{prefix}ViewModeCount": len(ordered_view_mode_names(view_modes)),
        f"{prefix}IsEditingViewMode": bool(project_config.get("isEditingViewMode", False)),
        f"{prefix}ActiveViewModeIdPresent": bool(active_view_mode_id),
        f"{prefix}ActiveViewModePresentInMap": bool(
            active_view_mode_id and active_view_mode_id in view_modes
        ),
    }
    if not active_view_mode_id or active_view_mode_id not in view_modes:
        return summary

    active_view_mode = expect_object(
        view_modes[active_view_mode_id],
        f"viewModes.{active_view_mode_id}",
    )
    summary[f"{prefix}ProjectLayoutMatchesActiveViewMode"] = (
        object_field(project_config, "topLevelSections", allow_missing=True)
        == object_field(active_view_mode, "topLevelSections", allow_missing=True)
    )
    summary[f"{prefix}ProjectViewportMatchesActiveViewMode"] = (
        object_field(project_config, "viewport", allow_missing=True)
        == object_field(active_view_mode, "viewport", allow_missing=True)
    )
    summary[f"{prefix}ProjectViewportInitializedMatchesActiveViewMode"] = bool(
        project_config.get("viewportInitialized", False)
    ) == bool(active_view_mode.get("viewportInitialized", False))
    return summary


def find_settings_project_param_code_obj_id(
    payload: dict[str, Any],
    section_name: str,
    param_path: list[str],
) -> str:
    sections = object_field(payload, "sections")
    target_section_id = ""
    for section_id, raw_section in sections.items():
        section = expect_object(raw_section, f"sections.{section_id}")
        if normalized_string(section.get("name")) == section_name:
            target_section_id = section_id
            break
    if not target_section_id:
        raise ParityHarnessError(f"Unable to find settings section named {section_name!r}")

    section = expect_object(sections[target_section_id], f"sections.{target_section_id}")
    current_children = section_child_code_object_ids(
        payload,
        section_id=target_section_id,
        section=section,
    )
    current_code_obj_id = ""

    for index, path_part in enumerate(param_path):
        current_code_obj_id = find_named_code_object_id(
            payload,
            candidate_ids=current_children,
            child_name=path_part,
        )
        if index+1 < len(param_path):
            current_children = code_object_child_ids(payload, current_code_obj_id)

    if not current_code_obj_id:
        raise ParityHarnessError(
            f"Unable to find settings param path {param_path!r} in section {section_name!r}"
        )
    return current_code_obj_id


def extract_settings_project_param_value(
    payload: dict[str, Any],
    section_name: str,
    param_path: list[str],
) -> Any:
    current_code_obj_id = find_settings_project_param_code_obj_id(
        payload,
        section_name=section_name,
        param_path=param_path,
    )
    return code_object_value(payload, current_code_obj_id)


def extract_settings_project_param_impl_type(
    payload: dict[str, Any],
    section_name: str,
    param_path: list[str],
) -> str:
    current_code_obj_id = find_settings_project_param_code_obj_id(
        payload,
        section_name=section_name,
        param_path=param_path,
    )
    return code_object_impl_type(payload, current_code_obj_id)


def try_extract_settings_project_param_impl_type(
    payload: Any,
    section_name: str,
    param_path: list[str],
) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return False, None
    try:
        return True, extract_settings_project_param_impl_type(
            payload,
            section_name=section_name,
            param_path=param_path,
        )
    except ParityHarnessError:
        return False, None


def try_extract_settings_project_param_impl_type_from_store_payload(
    payload: Any,
    section_name: str,
    param_path: list[str],
) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return False, None
    try:
        settings_project = settings_project_payload_from_store_payload(payload)
    except ParityHarnessError:
        return False, None
    return try_extract_settings_project_param_impl_type(
        settings_project,
        section_name=section_name,
        param_path=param_path,
    )


def extract_settings_project_param_dropdown_choices(
    payload: dict[str, Any],
    section_name: str,
    param_path: list[str],
) -> list[str] | None:
    current_code_obj_id = find_settings_project_param_code_obj_id(
        payload,
        section_name=section_name,
        param_path=param_path,
    )
    impl_payload = code_object_impl_payload(payload, current_code_obj_id)
    raw_choices = impl_payload.get("choices")
    if raw_choices is None:
        return None
    return expect_string_list(raw_choices, "codeObjImpls.<dropdown>.choices")


def try_extract_settings_project_param_dropdown_choices(
    payload: Any,
    section_name: str,
    param_path: list[str],
) -> tuple[bool, list[str] | None]:
    if not isinstance(payload, dict):
        return False, None
    try:
        return True, extract_settings_project_param_dropdown_choices(
            payload,
            section_name=section_name,
            param_path=param_path,
        )
    except ParityHarnessError:
        return False, None


def try_extract_settings_project_param_dropdown_choices_from_store_payload(
    payload: Any,
    section_name: str,
    param_path: list[str],
) -> tuple[bool, list[str] | None]:
    if not isinstance(payload, dict):
        return False, None
    try:
        settings_project = settings_project_payload_from_store_payload(payload)
    except ParityHarnessError:
        return False, None
    return try_extract_settings_project_param_dropdown_choices(
        settings_project,
        section_name=section_name,
        param_path=param_path,
    )


def try_extract_settings_project_param_value(
    payload: Any,
    section_name: str,
    param_path: list[str],
) -> tuple[bool, Any]:
    if not isinstance(payload, dict):
        return False, None
    try:
        return True, extract_settings_project_param_value(
            payload,
            section_name=section_name,
            param_path=param_path,
        )
    except ParityHarnessError:
        return False, None


def try_extract_settings_project_param_value_from_store_payload(
    payload: Any,
    section_name: str,
    param_path: list[str],
) -> tuple[bool, Any]:
    if not isinstance(payload, dict):
        return False, None
    try:
        settings_project = settings_project_payload_from_store_payload(payload)
    except ParityHarnessError:
        return False, None
    return try_extract_settings_project_param_value(
        settings_project,
        section_name=section_name,
        param_path=param_path,
    )


def section_child_code_object_ids(
    payload: dict[str, Any],
    section_id: str,
    section: dict[str, Any],
) -> list[str]:
    section_shared_modifier = object_field(section, "sharedModifier", allow_missing=True)
    shared_children = expect_string_list(
        section_shared_modifier.get("children"),
        f"sections.{section_id}.sharedModifier.children",
    )
    if shared_children:
        return shared_children

    section_variant_id = expect_non_empty_string(
        default_variant_id_for_model(section),
        f"sections.{section_id}.defaultVariant",
    )
    section_variants = object_field(payload, "sectionVariants")
    section_variant = expect_object(
        section_variants.get(section_variant_id),
        f"sectionVariants.{section_variant_id}",
    )
    section_impl_id = expect_non_empty_string(
        impl_id_for_variant(section_variant),
        f"sectionVariants.{section_variant_id}.impl",
    )
    section_impls = object_field(payload, "sectionImpls")
    section_impl = expect_object(
        section_impls.get(section_impl_id),
        f"sectionImpls.{section_impl_id}",
    )
    section_impl_payload = impl_payload_object(
        section_impl,
        f"sectionImpls.{section_impl_id}",
    )
    top_level_param_id = expect_non_empty_string(
        section_impl_payload.get("topLevelParamId"),
        f"sectionImpls.{section_impl_id}.topLevelParamId",
    )
    return code_object_child_ids(payload, top_level_param_id)


def code_object_child_ids(payload: dict[str, Any], code_obj_id: str) -> list[str]:
    code_objs = object_field(payload, "codeObjs")
    code_obj = expect_object(code_objs.get(code_obj_id), f"codeObjs.{code_obj_id}")
    code_obj_shared_modifier = object_field(code_obj, "sharedModifier", allow_missing=True)
    shared_children = expect_string_list(
        code_obj_shared_modifier.get("children"),
        f"codeObjs.{code_obj_id}.sharedModifier.children",
    )
    if shared_children:
        return shared_children

    code_obj_variants = object_field(payload, "codeObjVariants")
    code_obj_variant_id = expect_non_empty_string(
        default_variant_id_for_model(code_obj),
        f"codeObjs.{code_obj_id}.defaultVariant",
    )
    code_obj_variant = expect_object(
        code_obj_variants.get(code_obj_variant_id),
        f"codeObjVariants.{code_obj_variant_id}",
    )
    code_obj_impl_id = expect_non_empty_string(
        impl_id_for_variant(code_obj_variant),
        f"codeObjVariants.{code_obj_variant_id}.impl",
    )
    code_obj_impls = object_field(payload, "codeObjImpls")
    code_obj_impl = expect_object(
        code_obj_impls.get(code_obj_impl_id),
        f"codeObjImpls.{code_obj_impl_id}",
    )
    code_obj_impl_payload = impl_payload_object(
        code_obj_impl,
        f"codeObjImpls.{code_obj_impl_id}",
    )
    return expect_string_list(
        code_obj_impl_payload.get("children"),
        f"codeObjImpls.{code_obj_impl_id}.children",
    )


def find_named_code_object_id(
    payload: dict[str, Any],
    candidate_ids: list[str],
    child_name: str,
) -> str:
    code_objs = object_field(payload, "codeObjs")
    for candidate_id in candidate_ids:
        child_code_obj = expect_object(
            code_objs.get(candidate_id),
            f"codeObjs.{candidate_id}",
        )
        if normalized_string(child_code_obj.get("name")) == child_name:
            return candidate_id
    raise ParityHarnessError(
        f"Unable to find child code object named {child_name!r} in candidates {candidate_ids!r}"
    )


def code_object_value(payload: dict[str, Any], code_obj_id: str) -> Any:
    code_objs = object_field(payload, "codeObjs")
    code_obj = expect_object(code_objs.get(code_obj_id), f"codeObjs.{code_obj_id}")
    code_obj_shared_modifier = object_field(code_obj, "sharedModifier", allow_missing=True)
    if "value" in code_obj_shared_modifier:
        return normalize_scalar_payload_value(code_obj_shared_modifier.get("value"))

    code_obj_variant_id = expect_non_empty_string(
        default_variant_id_for_model(code_obj),
        f"codeObjs.{code_obj_id}.defaultVariant",
    )
    code_obj_variants = object_field(payload, "codeObjVariants")
    code_obj_variant = expect_object(
        code_obj_variants.get(code_obj_variant_id),
        f"codeObjVariants.{code_obj_variant_id}",
    )
    variant_modifier = object_field(code_obj_variant, "modifier", allow_missing=True)
    if "value" in variant_modifier:
        return normalize_scalar_payload_value(variant_modifier.get("value"))

    code_obj_impl_payload = code_object_impl_payload(payload, code_obj_id)
    return normalize_scalar_payload_value(code_obj_impl_payload.get("value"))


def code_object_impl_type(payload: dict[str, Any], code_obj_id: str) -> str:
    code_obj_impl = code_object_impl(payload, code_obj_id)
    impl_type = normalized_string(code_obj_impl.get("type"))
    if impl_type:
        return impl_type
    code_obj_impl_payload = impl_payload_object(
        code_obj_impl,
        f"codeObjImpls.{code_obj_id}",
    )
    payload_type = normalized_string(code_obj_impl_payload.get("type"))
    if payload_type:
        return payload_type
    raise ParityHarnessError(f"Code object {code_obj_id!r} impl is missing a type field")


def code_object_impl_payload(payload: dict[str, Any], code_obj_id: str) -> dict[str, Any]:
    code_obj_impl = code_object_impl(payload, code_obj_id)
    return impl_payload_object(code_obj_impl, f"codeObjImpls.{code_obj_id}")


def code_object_impl(payload: dict[str, Any], code_obj_id: str) -> dict[str, Any]:
    code_objs = object_field(payload, "codeObjs")
    code_obj = expect_object(code_objs.get(code_obj_id), f"codeObjs.{code_obj_id}")
    code_obj_variant_id = expect_non_empty_string(
        default_variant_id_for_model(code_obj),
        f"codeObjs.{code_obj_id}.defaultVariant",
    )
    code_obj_variants = object_field(payload, "codeObjVariants")
    code_obj_variant = expect_object(
        code_obj_variants.get(code_obj_variant_id),
        f"codeObjVariants.{code_obj_variant_id}",
    )
    code_obj_impls = object_field(payload, "codeObjImpls")
    code_obj_impl_id = expect_non_empty_string(
        impl_id_for_variant(code_obj_variant),
        f"codeObjVariants.{code_obj_variant_id}.impl",
    )
    return expect_object(
        code_obj_impls.get(code_obj_impl_id),
        f"codeObjImpls.{code_obj_impl_id}",
    )


def normalize_scalar_payload_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if not trimmed:
        return value
    if trimmed[0] in {'"', "{", "["} or trimmed in {"true", "false", "null"}:
        try:
            return json.loads(trimmed)
        except json.JSONDecodeError:
            return value
    return value


def default_variant_id_for_model(model: dict[str, Any]) -> Any:
    if "defaultVariant" in model:
        return model.get("defaultVariant")
    return model.get("defaultVariantId")


def impl_id_for_variant(variant: dict[str, Any]) -> Any:
    if "impl" in variant:
        return variant.get("impl")
    return variant.get("implId")


def impl_payload_object(impl: dict[str, Any], label: str) -> dict[str, Any]:
    payload = impl.get("payload")
    if isinstance(payload, dict):
        return payload
    if payload is not None:
        raise ParityHarnessError(f"Expected object payload for {label}, got {type(payload).__name__}")
    return impl


def find_child_code_object_id(
    payload: dict[str, Any],
    parent_code_obj_id: str,
    child_name: str,
) -> str:
    return find_named_code_object_id(
        payload,
        candidate_ids=code_object_child_ids(payload, parent_code_obj_id),
        child_name=child_name,
    )


def settings_payload_view_mode_names(payload: dict[str, Any]) -> list[str]:
    project_config = object_field(payload, "projectConfig")
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    return ordered_view_mode_names(view_modes)


def settings_payload_param_impl_type_samples(payload: Any) -> dict[str, str | None]:
    samples: dict[str, str | None] = {
        sample_name: None
        for sample_name, _section_name, _param_path in SETTINGS_PARAM_IMPL_SAMPLE_SPECS
    }
    for sample_name, section_name, param_path in SETTINGS_PARAM_IMPL_SAMPLE_SPECS:
        _present, impl_type = try_extract_settings_project_param_impl_type(
            payload,
            section_name=section_name,
            param_path=param_path,
        )
        samples[sample_name] = impl_type
    return samples


def settings_store_param_impl_type_samples(payload: Any) -> dict[str, str | None]:
    samples: dict[str, str | None] = {
        sample_name: None
        for sample_name, _section_name, _param_path in SETTINGS_PARAM_IMPL_SAMPLE_SPECS
    }
    for sample_name, section_name, param_path in SETTINGS_PARAM_IMPL_SAMPLE_SPECS:
        _present, impl_type = try_extract_settings_project_param_impl_type_from_store_payload(
            payload,
            section_name=section_name,
            param_path=param_path,
        )
        samples[sample_name] = impl_type
    return samples


def settings_payload_dropdown_choice_samples(payload: Any) -> dict[str, list[str] | None]:
    samples: dict[str, list[str] | None] = {
        sample_name: None
        for sample_name, _section_name, _param_path in SETTINGS_DROPDOWN_PARAM_SAMPLE_SPECS
    }
    for sample_name, section_name, param_path in SETTINGS_DROPDOWN_PARAM_SAMPLE_SPECS:
        _present, choices = try_extract_settings_project_param_dropdown_choices(
            payload,
            section_name=section_name,
            param_path=param_path,
        )
        samples[sample_name] = choices
    return samples


def settings_store_dropdown_choice_samples(payload: Any) -> dict[str, list[str] | None]:
    samples: dict[str, list[str] | None] = {
        sample_name: None
        for sample_name, _section_name, _param_path in SETTINGS_DROPDOWN_PARAM_SAMPLE_SPECS
    }
    for sample_name, section_name, param_path in SETTINGS_DROPDOWN_PARAM_SAMPLE_SPECS:
        _present, choices = (
            try_extract_settings_project_param_dropdown_choices_from_store_payload(
                payload,
                section_name=section_name,
                param_path=param_path,
            )
        )
        samples[sample_name] = choices
    return samples


def settings_payload_active_view_mode_name(payload: dict[str, Any]) -> str | None:
    project_config = object_field(payload, "projectConfig")
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    active_view_mode_id = normalized_string(project_config.get("activeViewModeId"))
    if not active_view_mode_id or active_view_mode_id not in view_modes:
        return None
    active_view_mode = expect_object(
        view_modes[active_view_mode_id],
        f"viewModes.{active_view_mode_id}",
    )
    return normalized_string(active_view_mode.get("name")) or None


def settings_store_view_mode_names(payload: dict[str, Any]) -> list[str]:
    if not isinstance(payload, dict):
        raise ParityHarnessError(
            "Persisted settings project document must be a JSON object, "
            f"got {type(payload).__name__}"
        )

    settings_project = settings_project_payload_from_store_payload(payload)
    view_modes = object_field(settings_project, "viewModes", allow_missing=True)
    if not view_modes:
        project_config = object_field(settings_project, "projectConfig", allow_missing=True)
        if project_config:
            view_modes = object_field(project_config, "viewModes", allow_missing=True)
    return ordered_view_mode_names(view_modes)


def settings_store_active_view_mode_name(payload: dict[str, Any]) -> str | None:
    if not isinstance(payload, dict):
        raise ParityHarnessError(
            "Persisted settings project document must be a JSON object, "
            f"got {type(payload).__name__}"
        )

    settings_project = settings_project_payload_from_store_payload(payload)
    project_config = settings_project
    if "projectConfig" in settings_project:
        project_config = object_field(settings_project, "projectConfig")
    active_view_mode_id = normalized_string(project_config.get("activeViewModeId"))
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    if not active_view_mode_id or active_view_mode_id not in view_modes:
        return None
    active_view_mode = expect_object(
        view_modes[active_view_mode_id],
        f"viewModes.{active_view_mode_id}",
    )
    return normalized_string(active_view_mode.get("name")) or None


def settings_store_top_level_section_count(payload: dict[str, Any]) -> int:
    if not isinstance(payload, dict):
        raise ParityHarnessError(
            "Persisted settings project document must be a JSON object, "
            f"got {type(payload).__name__}"
        )

    settings_project = settings_project_payload_from_store_payload(payload)
    project_config = settings_project
    if "projectConfig" in settings_project:
        project_config = object_field(settings_project, "projectConfig")
    return len(object_field(project_config, "topLevelSections", allow_missing=True))


def settings_payload_view_mode_layout_contains_section(
    payload: dict[str, Any],
    view_mode_name: str,
    section_name: str,
) -> bool:
    project_config = object_field(payload, "projectConfig")
    sections = object_field(payload, "sections", allow_missing=True)
    section_id = find_section_id_by_name(sections, section_name)
    view_mode_id = find_settings_view_mode_id(payload, view_mode_name)
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    view_mode = expect_object(view_modes.get(view_mode_id), f"viewModes.{view_mode_id}")
    visibility = object_field(view_mode, "visibilityBySectionId", allow_missing=True)
    top_level_sections = object_field(view_mode, "topLevelSections", allow_missing=True)
    return visibility.get(section_id) is True and section_id in top_level_sections


def settings_store_view_mode_layout_contains_section(
    payload: Any,
    view_mode_name: str,
    section_name: str,
) -> bool | None:
    if not isinstance(payload, dict):
        return None
    try:
        settings_project = settings_project_payload_from_store_payload(payload)
    except ParityHarnessError:
        return None
    if "projectConfig" not in settings_project:
        settings_project = {
            "projectConfig": settings_project,
            "sections": object_field(settings_project, "sections", allow_missing=True),
        }
    return settings_payload_view_mode_layout_contains_section(
        settings_project,
        view_mode_name=view_mode_name,
        section_name=section_name,
    )


def settings_payload_fixed_width_section_count(
    payload: dict[str, Any],
    expected_width: float,
) -> int:
    sections = object_field(payload, "sections", allow_missing=True)
    count = 0
    for raw_section in sections.values():
        section = expect_object(raw_section, "sections.<value>")
        section_name = normalized_string(section.get("name"))
        if not section_name:
            continue
        if settings_payload_section_width(payload, section_name) == float(expected_width):
            count += 1
    return count


def settings_payload_section_variant_name_samples(
    payload: dict[str, Any],
    section_names: list[str],
    workspace_root: str,
) -> dict[str, str]:
    return {
        section_name: normalize_parity_path(
            settings_payload_section_variant(payload, section_name).get("name"),
            workspace_root,
        )
        for section_name in section_names
    }


def settings_payload_section_config_language_samples(
    payload: dict[str, Any],
    section_names: list[str],
) -> dict[str, str]:
    return {
        section_name: normalized_string(
            settings_payload_section_impl(payload, section_name).get("configLanguage")
        )
        for section_name in section_names
    }


def settings_payload_section_width_samples(
    payload: dict[str, Any],
    section_names: list[str],
) -> dict[str, Any]:
    return {
        section_name: settings_payload_section_width(payload, section_name)
        for section_name in section_names
    }


def settings_payload_section_display_name_samples(
    payload: dict[str, Any],
    section_names: list[str],
) -> dict[str, str]:
    sections = object_field(payload, "sections", allow_missing=True)
    display_names: dict[str, str] = {}
    for section_name in section_names:
        section_id = find_section_id_by_name(sections, section_name)
        section = expect_object(sections.get(section_id), f"sections.{section_id}")
        display_names[section_name] = normalized_string(section.get("displayName"))
    return display_names


def settings_payload_code_obj_display_name_samples(
    payload: dict[str, Any],
    code_obj_names: list[str],
) -> dict[str, str]:
    code_objs = object_field(payload, "codeObjs", allow_missing=True)
    display_names: dict[str, str] = {}
    for code_obj_name in code_obj_names:
        code_obj_id = find_code_obj_id_by_name(code_objs, code_obj_name)
        code_obj = expect_object(code_objs.get(code_obj_id), f"codeObjs.{code_obj_id}")
        display_names[code_obj_name] = normalized_string(code_obj.get("displayName"))
    return display_names


def settings_store_code_obj_display_name_samples(
    payload: Any,
    code_obj_names: list[str],
) -> dict[str, str | None]:
    samples: dict[str, str | None] = {code_obj_name: None for code_obj_name in code_obj_names}
    if not isinstance(payload, dict):
        return samples
    try:
        settings_project = settings_project_payload_from_store_payload(payload)
    except ParityHarnessError:
        return samples
    resolved = settings_payload_code_obj_display_name_samples(
        settings_project,
        code_obj_names,
    )
    return {code_obj_name: resolved.get(code_obj_name) for code_obj_name in code_obj_names}


def settings_payload_section_width(
    payload: dict[str, Any],
    section_name: str,
) -> Any:
    section_impl = settings_payload_section_impl(payload, section_name)
    size = object_field(section_impl, "size", allow_missing=True)
    width = size.get("width")
    if isinstance(width, (int, float)):
        return float(width)
    return width


def settings_payload_section_impl(
    payload: dict[str, Any],
    section_name: str,
) -> dict[str, Any]:
    section_variant = settings_payload_section_variant(payload, section_name)
    section_impl_id = expect_non_empty_string(
        section_variant.get("impl"),
        f"sectionVariants.{section_name}.impl",
    )
    section_impls = object_field(payload, "sectionImpls", allow_missing=True)
    return expect_object(section_impls.get(section_impl_id), f"sectionImpls.{section_impl_id}")


def settings_payload_section_variant(
    payload: dict[str, Any],
    section_name: str,
) -> dict[str, Any]:
    project_config = object_field(payload, "projectConfig")
    sections = object_field(payload, "sections", allow_missing=True)
    section_id = find_section_id_by_name(sections, section_name)
    section_variant_map = object_field(project_config, "sectionVariantMap", allow_missing=True)
    section_variant_id = expect_non_empty_string(
        section_variant_map.get(section_id),
        f"projectConfig.sectionVariantMap.{section_id}",
    )
    section_variants = object_field(payload, "sectionVariants", allow_missing=True)
    return expect_object(
        section_variants.get(section_variant_id),
        f"sectionVariants.{section_variant_id}",
    )


def normalize_parity_path(raw_path: Any, workspace_root: str) -> str:
    normalized = normalized_string(raw_path)
    if not normalized:
        return ""
    normalized = os.path.normpath(normalized)
    if workspace_root and os.path.isabs(normalized):
        workspace_root_path = Path(os.path.normpath(workspace_root)).resolve()
        try:
            return Path(normalized).resolve().relative_to(workspace_root_path).as_posix()
        except ValueError:
            pass
    return normalized.replace(os.sep, "/")


def settings_project_payload_from_store_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if "projectConfig" in payload:
        return payload

    projects = object_field(payload, "projects", allow_missing=True)
    settings_project = expect_object(
        projects.get("settings"),
        "projects.settings",
        allow_missing=True,
    )
    if not settings_project:
        raise ParityHarnessError(
            "Persisted settings project document missing projects.settings"
        )
    return settings_project


def remove_settings_section_from_store_payload(
    payload: dict[str, Any],
    section_name: str,
) -> dict[str, Any]:
    cloned = json.loads(json.dumps(payload))
    settings_project = settings_project_payload_from_store_payload(cloned)
    if "projectConfig" in cloned:
        remove_settings_section_from_single_config_payload(cloned, section_name)
        return cloned

    projects = object_field(cloned, "projects", allow_missing=True)
    remove_settings_section_from_project_payload(settings_project, section_name)
    projects["settings"] = settings_project
    return cloned


def remove_settings_param_from_store_payload(
    payload: dict[str, Any],
    section_name: str,
    param_path: list[str],
) -> dict[str, Any]:
    cloned = json.loads(json.dumps(payload))
    settings_project = settings_project_payload_from_store_payload(cloned)
    remove_settings_param_from_project_payload(
        settings_project,
        section_name=section_name,
        param_path=param_path,
    )
    if "projectConfig" in cloned:
        return cloned

    projects = object_field(cloned, "projects", allow_missing=True)
    projects["settings"] = settings_project
    return cloned


def set_settings_code_obj_display_name_in_store_payload(
    payload: dict[str, Any],
    code_obj_name: str,
    display_name: str,
) -> dict[str, Any]:
    cloned = json.loads(json.dumps(payload))
    settings_project = settings_project_payload_from_store_payload(cloned)
    code_objs = object_field(settings_project, "codeObjs", allow_missing=True)
    code_obj_id = find_code_obj_id_by_name(code_objs, code_obj_name)
    code_obj = expect_object(code_objs.get(code_obj_id), f"codeObjs.{code_obj_id}")
    code_obj["displayName"] = display_name

    if "projectConfig" in cloned:
        return cloned

    projects = object_field(cloned, "projects", allow_missing=True)
    projects["settings"] = settings_project
    return cloned


def delete_settings_view_mode_from_store_payload(
    payload: dict[str, Any],
    view_mode_name: str,
) -> dict[str, Any]:
    cloned = json.loads(json.dumps(payload))
    settings_project = settings_project_payload_from_store_payload(cloned)

    project_config = settings_project
    if "projectConfig" in settings_project:
        project_config = object_field(settings_project, "projectConfig")
    view_modes = object_field(project_config, "viewModes", allow_missing=True)

    deleted_view_mode_id = ""
    for candidate_view_mode_id, raw_view_mode in view_modes.items():
        view_mode = expect_object(
            raw_view_mode,
            f"viewModes.{candidate_view_mode_id}",
        )
        if normalized_string(view_mode.get("name")) == view_mode_name:
            deleted_view_mode_id = candidate_view_mode_id
            break
    if not deleted_view_mode_id:
        raise ParityHarnessError(
            f"Unable to find settings view mode named {view_mode_name!r}"
        )

    view_modes.pop(deleted_view_mode_id, None)
    project_config["activeViewModeId"] = deleted_view_mode_id
    project_config["isEditingViewMode"] = True
    project_config["viewport"] = {"x": 80, "y": 40, "zoom": 1.3}
    project_config["viewportInitialized"] = True

    if "projectConfig" in cloned:
        return cloned

    projects = object_field(cloned, "projects", allow_missing=True)
    projects["settings"] = settings_project
    return cloned


def clear_settings_top_level_layouts_from_store_payload(payload: dict[str, Any]) -> dict[str, Any]:
    cloned = json.loads(json.dumps(payload))
    settings_project = settings_project_payload_from_store_payload(cloned)

    project_config = settings_project
    if "projectConfig" in settings_project:
        project_config = object_field(settings_project, "projectConfig")
    project_config["topLevelSections"] = {}

    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    for view_mode_id, raw_view_mode in view_modes.items():
        view_mode = expect_object(raw_view_mode, f"viewModes.{view_mode_id}")
        view_mode["topLevelSections"] = {}

    if "projectConfig" in cloned:
        return cloned

    projects = object_field(cloned, "projects", allow_missing=True)
    projects["settings"] = settings_project
    return cloned


def remove_settings_view_mode_layout_entry_from_store_payload(
    payload: dict[str, Any],
    view_mode_name: str,
    section_name: str,
) -> dict[str, Any]:
    cloned = json.loads(json.dumps(payload))
    settings_project = settings_project_payload_from_store_payload(cloned)

    project_config = settings_project
    if "projectConfig" in settings_project:
        project_config = object_field(settings_project, "projectConfig")
    sections = object_field(settings_project, "sections", allow_missing=True)
    section_id = find_section_id_by_name(sections, section_name)
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    view_mode_id = find_settings_view_mode_id(
        {"projectConfig": project_config},
        view_mode_name,
    )
    view_mode = expect_object(view_modes.get(view_mode_id), f"viewModes.{view_mode_id}")
    top_level_sections = object_field(view_mode, "topLevelSections", allow_missing=True)
    top_level_sections.pop(section_id, None)

    if "projectConfig" in cloned:
        return cloned

    projects = object_field(cloned, "projects", allow_missing=True)
    projects["settings"] = settings_project
    return cloned


def remove_settings_section_from_single_config_payload(
    payload: dict[str, Any],
    section_name: str,
) -> None:
    project_config = object_field(payload, "projectConfig")
    sections = object_field(payload, "sections")
    section_id = find_section_id_by_name(sections, section_name)
    remove_settings_section_references(
        project_config=project_config,
        sections=sections,
        section_variants=object_field(payload, "sectionVariants", allow_missing=True),
        section_impls=object_field(payload, "sectionImpls", allow_missing=True),
        section_id=section_id,
        top_level_section_ids_owner=payload,
    )


def remove_settings_section_from_project_payload(
    project_payload: dict[str, Any],
    section_name: str,
) -> None:
    sections = object_field(project_payload, "sections")
    section_id = find_section_id_by_name(sections, section_name)
    remove_settings_section_references(
        project_config=project_payload,
        sections=sections,
        section_variants=object_field(project_payload, "sectionVariants", allow_missing=True),
        section_impls=object_field(project_payload, "sectionImpls", allow_missing=True),
        section_id=section_id,
        top_level_section_ids_owner=project_payload,
    )


def remove_settings_param_from_project_payload(
    project_payload: dict[str, Any],
    section_name: str,
    param_path: list[str],
) -> None:
    section_id, parent_kind, parent_id, target_code_obj_id = (
        find_settings_param_code_object_lineage(
            project_payload,
            section_name=section_name,
            param_path=param_path,
        )
    )
    remove_settings_param_references(
        project_payload,
        section_id=section_id,
        parent_kind=parent_kind,
        parent_id=parent_id,
        target_code_obj_id=target_code_obj_id,
    )


def remove_settings_section_references(
    project_config: dict[str, Any],
    sections: dict[str, Any],
    section_variants: dict[str, Any],
    section_impls: dict[str, Any],
    section_id: str,
    top_level_section_ids_owner: dict[str, Any] | None,
) -> None:
    section_variant_map = object_field(
        project_config,
        "sectionVariantMap",
        allow_missing=True,
    )
    variant_id = normalized_string(section_variant_map.pop(section_id, None))
    if variant_id:
        section_variant = expect_object(
            section_variants.pop(variant_id, None),
            f"sectionVariants.{variant_id}",
            allow_missing=True,
        )
        impl_id = normalized_string(impl_id_for_variant(section_variant))
        if impl_id:
            section_impls.pop(impl_id, None)

    sections.pop(section_id, None)

    if (
        top_level_section_ids_owner is not None
        and "topLevelSectionIds" in top_level_section_ids_owner
    ):
        top_level_section_ids = expect_list(
            top_level_section_ids_owner.get("topLevelSectionIds"),
            "topLevelSectionIds",
            allow_missing=True,
        )
        top_level_section_ids_owner["topLevelSectionIds"] = [
            section for section in top_level_section_ids if section != section_id
        ]

    top_level_sections = object_field(
        project_config,
        "topLevelSections",
        allow_missing=True,
    )
    top_level_sections.pop(section_id, None)

    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    for view_mode_id, raw_view_mode in view_modes.items():
        view_mode = expect_object(raw_view_mode, f"viewModes.{view_mode_id}")
        object_field(view_mode, "visibilityBySectionId", allow_missing=True).pop(
            section_id, None
        )
        object_field(view_mode, "topLevelSections", allow_missing=True).pop(
            section_id, None
        )


def remove_settings_param_references(
    payload: dict[str, Any],
    section_id: str,
    parent_kind: str,
    parent_id: str,
    target_code_obj_id: str,
) -> None:
    section_impl = resolve_settings_section_impl(payload, section_id)
    section_impl_payload = impl_payload_object(
        section_impl,
        f"sectionImpls.{section_id}",
    )
    code_obj_variant_map = object_field(
        section_impl_payload,
        "codeObjVariantMap",
        allow_missing=True,
    )

    subtree_ids = collect_settings_code_obj_subtree_ids(payload, target_code_obj_id)
    for code_obj_id in subtree_ids:
        code_obj_variant_map.pop(code_obj_id, None)

    remove_settings_child_reference(
        payload,
        parent_kind=parent_kind,
        parent_id=parent_id,
        child_id=target_code_obj_id,
    )

    code_objs = object_field(payload, "codeObjs")
    code_obj_variants = object_field(payload, "codeObjVariants")
    code_obj_impls = object_field(payload, "codeObjImpls")
    for code_obj_id in subtree_ids:
        code_obj = expect_object(
            code_objs.pop(code_obj_id, None),
            f"codeObjs.{code_obj_id}",
            allow_missing=True,
        )
        variant_id = normalized_string(default_variant_id_for_model(code_obj))
        if not variant_id:
            continue
        code_obj_variant = expect_object(
            code_obj_variants.pop(variant_id, None),
            f"codeObjVariants.{variant_id}",
            allow_missing=True,
        )
        impl_id = normalized_string(impl_id_for_variant(code_obj_variant))
        if impl_id:
            code_obj_impls.pop(impl_id, None)


def find_section_id_by_name(sections: dict[str, Any], section_name: str) -> str:
    for section_id, raw_section in sections.items():
        section = expect_object(raw_section, f"sections.{section_id}")
        if normalized_string(section.get("name")) == section_name:
            return section_id
    raise ParityHarnessError(
        f"Unable to find settings section named {section_name!r}"
    )


def find_code_obj_id_by_name(code_objs: dict[str, Any], code_obj_name: str) -> str:
    for code_obj_id, raw_code_obj in code_objs.items():
        code_obj = expect_object(raw_code_obj, f"codeObjs.{code_obj_id}")
        if normalized_string(code_obj.get("name")) == code_obj_name:
            return code_obj_id
    raise ParityHarnessError(
        f"Unable to find code object named {code_obj_name!r}"
    )


def find_settings_param_code_object_lineage(
    payload: dict[str, Any],
    section_name: str,
    param_path: list[str],
) -> tuple[str, str, str, str]:
    sections = object_field(payload, "sections")
    section_id = find_section_id_by_name(sections, section_name)
    section = expect_object(sections.get(section_id), f"sections.{section_id}")
    parent_kind, parent_id = resolve_settings_section_child_parent(
        payload,
        section_id=section_id,
        section=section,
    )
    current_children = section_child_code_object_ids(
        payload,
        section_id=section_id,
        section=section,
    )
    target_code_obj_id = ""
    current_parent_kind = parent_kind
    current_parent_id = parent_id
    for index, path_part in enumerate(param_path):
        target_code_obj_id = find_named_code_object_id(
            payload,
            candidate_ids=current_children,
            child_name=path_part,
        )
        if index + 1 < len(param_path):
            current_parent_kind = "code_obj"
            current_parent_id = target_code_obj_id
            current_children = code_object_child_ids(payload, target_code_obj_id)
    if not target_code_obj_id:
        raise ParityHarnessError(
            f"Unable to find settings param path {param_path!r} in section {section_name!r}"
        )
    return section_id, current_parent_kind, current_parent_id, target_code_obj_id


def resolve_settings_section_child_parent(
    payload: dict[str, Any],
    section_id: str,
    section: dict[str, Any],
) -> tuple[str, str]:
    section_shared_modifier = object_field(section, "sharedModifier", allow_missing=True)
    shared_children = expect_string_list(
        section_shared_modifier.get("children"),
        f"sections.{section_id}.sharedModifier.children",
    )
    if shared_children:
        return "section", section_id
    return "code_obj", resolve_settings_section_top_level_param_id(payload, section_id)


def resolve_settings_section_impl(
    payload: dict[str, Any],
    section_id: str,
) -> dict[str, Any]:
    sections = object_field(payload, "sections")
    section = expect_object(sections.get(section_id), f"sections.{section_id}")
    section_variant_id = normalized_string(default_variant_id_for_model(section))
    if not section_variant_id:
        section_variant_map = object_field(
            payload,
            "sectionVariantMap",
            allow_missing=True,
        )
        section_variant_id = normalized_string(section_variant_map.get(section_id))
    if not section_variant_id and "projectConfig" in payload:
        project_config = object_field(payload, "projectConfig")
        section_variant_map = object_field(
            project_config,
            "sectionVariantMap",
            allow_missing=True,
        )
        section_variant_id = normalized_string(section_variant_map.get(section_id))
    if not section_variant_id:
        raise ParityHarnessError(
            f"Unable to resolve section variant for settings section {section_id!r}"
        )

    section_variants = object_field(payload, "sectionVariants")
    section_variant = expect_object(
        section_variants.get(section_variant_id),
        f"sectionVariants.{section_variant_id}",
    )
    section_impl_id = expect_non_empty_string(
        impl_id_for_variant(section_variant),
        f"sectionVariants.{section_variant_id}.impl",
    )
    section_impls = object_field(payload, "sectionImpls")
    return expect_object(
        section_impls.get(section_impl_id),
        f"sectionImpls.{section_impl_id}",
    )


def resolve_settings_section_top_level_param_id(
    payload: dict[str, Any],
    section_id: str,
) -> str:
    section_impl = resolve_settings_section_impl(payload, section_id)
    section_impl_payload = impl_payload_object(
        section_impl,
        f"sectionImpls.{section_id}",
    )
    return expect_non_empty_string(
        section_impl_payload.get("topLevelParamId"),
        f"sectionImpls.{section_id}.topLevelParamId",
    )


def collect_settings_code_obj_subtree_ids(
    payload: dict[str, Any],
    root_code_obj_id: str,
) -> list[str]:
    collected: list[str] = []
    queue = [root_code_obj_id]
    seen: set[str] = set()
    while queue:
        current_code_obj_id = queue.pop()
        if current_code_obj_id in seen:
            continue
        seen.add(current_code_obj_id)
        collected.append(current_code_obj_id)
        try:
            child_ids = code_object_child_ids(payload, current_code_obj_id)
        except ParityHarnessError:
            child_ids = []
        queue.extend(child_ids)
    return collected


def remove_settings_child_reference(
    payload: dict[str, Any],
    parent_kind: str,
    parent_id: str,
    child_id: str,
) -> None:
    if parent_kind == "section":
        sections = object_field(payload, "sections")
        section = expect_object(sections.get(parent_id), f"sections.{parent_id}")
        shared_modifier = object_field(section, "sharedModifier", allow_missing=True)
        children = expect_string_list(
            shared_modifier.get("children"),
            f"sections.{parent_id}.sharedModifier.children",
        )
        shared_modifier["children"] = [
            candidate_id for candidate_id in children if candidate_id != child_id
        ]
        section["sharedModifier"] = shared_modifier
        sections[parent_id] = section
        return
    if parent_kind != "code_obj":
        raise ParityHarnessError(f"Unsupported settings child parent kind {parent_kind!r}")
    remove_code_object_child_reference(payload, parent_id, child_id)


def remove_code_object_child_reference(
    payload: dict[str, Any],
    parent_code_obj_id: str,
    child_id: str,
) -> None:
    code_objs = object_field(payload, "codeObjs")
    code_obj = expect_object(
        code_objs.get(parent_code_obj_id),
        f"codeObjs.{parent_code_obj_id}",
    )
    shared_modifier = object_field(code_obj, "sharedModifier", allow_missing=True)
    shared_children = expect_string_list(
        shared_modifier.get("children"),
        f"codeObjs.{parent_code_obj_id}.sharedModifier.children",
    )
    if child_id in shared_children:
        shared_modifier["children"] = [
            candidate_id for candidate_id in shared_children if candidate_id != child_id
        ]
        code_obj["sharedModifier"] = shared_modifier
        code_objs[parent_code_obj_id] = code_obj
        return

    code_obj_variants = object_field(payload, "codeObjVariants")
    code_obj_variant_id = expect_non_empty_string(
        default_variant_id_for_model(code_obj),
        f"codeObjs.{parent_code_obj_id}.defaultVariant",
    )
    code_obj_variant = expect_object(
        code_obj_variants.get(code_obj_variant_id),
        f"codeObjVariants.{code_obj_variant_id}",
    )
    variant_modifier = object_field(code_obj_variant, "modifier", allow_missing=True)
    variant_children = expect_string_list(
        variant_modifier.get("children"),
        f"codeObjVariants.{code_obj_variant_id}.modifier.children",
    )
    if child_id in variant_children:
        variant_modifier["children"] = [
            candidate_id for candidate_id in variant_children if candidate_id != child_id
        ]
        code_obj_variant["modifier"] = variant_modifier
        code_obj_variants[code_obj_variant_id] = code_obj_variant
        return

    code_obj_impl_id = expect_non_empty_string(
        impl_id_for_variant(code_obj_variant),
        f"codeObjVariants.{code_obj_variant_id}.impl",
    )
    code_obj_impls = object_field(payload, "codeObjImpls")
    code_obj_impl = expect_object(
        code_obj_impls.get(code_obj_impl_id),
        f"codeObjImpls.{code_obj_impl_id}",
    )
    code_obj_impl_payload = impl_payload_object(
        code_obj_impl,
        f"codeObjImpls.{code_obj_impl_id}",
    )
    children = expect_string_list(
        code_obj_impl_payload.get("children"),
        f"codeObjImpls.{code_obj_impl_id}.children",
    )
    code_obj_impl_payload["children"] = [
        candidate_id for candidate_id in children if candidate_id != child_id
    ]
    code_obj_impls[code_obj_impl_id] = code_obj_impl


def ordered_view_mode_names(view_modes: dict[str, Any]) -> list[str]:
    ordered: list[dict[str, Any]] = []
    for view_mode_id, raw_view_mode in view_modes.items():
        ordered.append(expect_object(raw_view_mode, f"viewModes.{view_mode_id}"))
    ordered.sort(
        key=lambda view_mode: (
            int(view_mode.get("sortIndex") or 0),
            normalized_string(view_mode.get("name")),
            normalized_string(view_mode.get("id")),
        )
    )
    return [normalized_string(view_mode.get("name")) for view_mode in ordered]


def summarize_settings_view_mode_layout_contract(
    project_config: dict[str, Any],
    sections: dict[str, Any],
    key_prefix: str = "",
) -> dict[str, Any]:
    section_id_by_name = settings_section_id_by_name(sections)
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    ordered_names = ordered_view_mode_names(view_modes)
    viewport_defaults: dict[str, dict[str, Any]] = {}
    for view_mode_name in ordered_names:
        view_mode = settings_view_mode_by_name(view_modes, view_mode_name)
        viewport_defaults[view_mode_name] = {
            "viewportIsNone": view_mode.get("viewport") is None,
            "viewportInitialized": bool(view_mode.get("viewportInitialized", False)),
        }
    return {
        prefixed_summary_key(key_prefix, "viewModeNames"): ordered_names,
        prefixed_summary_key(
            key_prefix, "viewModeViewportDefaults"
        ): viewport_defaults,
        prefixed_summary_key(
            key_prefix, "coreLayoutSentinels"
        ): settings_view_mode_layout_sentinels(
            settings_view_mode_by_name(view_modes, "Core"),
            section_id_by_name=section_id_by_name,
            section_names=SETTINGS_CORE_SECTION_NAMES,
        ),
        prefixed_summary_key(
            key_prefix, "paramLayoutSentinels"
        ): settings_view_mode_layout_sentinels(
            settings_view_mode_by_name(view_modes, "Param Defaults"),
            section_id_by_name=section_id_by_name,
            section_names=SETTINGS_PARAM_LAYOUT_SENTINEL_SECTION_NAMES,
        ),
        prefixed_summary_key(
            key_prefix, "structureWorkflowLayoutSentinels"
        ): settings_view_mode_layout_sentinels(
            settings_view_mode_by_name(
                view_modes, "Section Defaults Structure and Code"
            ),
            section_id_by_name=section_id_by_name,
            section_names=SETTINGS_STRUCTURE_WORKFLOW_SECTION_NAMES,
        ),
        prefixed_summary_key(
            key_prefix, "allSettingsLeadLayoutSentinels"
        ): settings_view_mode_layout_sentinels(
            settings_view_mode_by_name(view_modes, "All Settings"),
            section_id_by_name=section_id_by_name,
            section_names=SETTINGS_ALL_LEAD_SECTION_NAMES,
        ),
    }


def prefixed_summary_key(prefix: str, base_key: str) -> str:
    if not prefix:
        return base_key
    return prefix + base_key[:1].upper() + base_key[1:]


def settings_section_id_by_name(sections: dict[str, Any]) -> dict[str, str]:
    section_id_by_name: dict[str, str] = {}
    for section_id, raw_section in sections.items():
        section = expect_object(raw_section, f"sections.{section_id}")
        section_name = normalized_string(section.get("name"))
        if section_name:
            section_id_by_name[section_name] = section_id
    return section_id_by_name


def settings_view_mode_by_name(
    view_modes: dict[str, Any],
    view_mode_name: str,
) -> dict[str, Any]:
    for view_mode_id, raw_view_mode in view_modes.items():
        view_mode = expect_object(raw_view_mode, f"viewModes.{view_mode_id}")
        if normalized_string(view_mode.get("name")) == view_mode_name:
            return view_mode
    raise ParityHarnessError(
        f"Unable to find settings view mode named {view_mode_name!r}"
    )


def settings_view_mode_layout_sentinels(
    view_mode: dict[str, Any],
    section_id_by_name: dict[str, str],
    section_names: list[str],
) -> dict[str, dict[str, float]]:
    top_level_sections = object_field(view_mode, "topLevelSections", allow_missing=True)
    visibility = object_field(view_mode, "visibilityBySectionId", allow_missing=True)
    sentinels: dict[str, dict[str, float]] = {}
    for section_name in section_names:
        section_id = normalized_string(section_id_by_name.get(section_name))
        if not section_id:
            raise ParityHarnessError(
                f"Unable to find settings section named {section_name!r}"
            )
        if section_id in visibility and visibility[section_id] is not True:
            raise ParityHarnessError(
                f"Expected settings section {section_name!r} to be visible in view "
                f"{normalized_string(view_mode.get('name'))!r}"
            )
        layout = expect_object(
            top_level_sections.get(section_id),
            f"topLevelSections.{section_id}",
        )
        sentinels[section_name] = {
            "x": float(layout.get("x") or 0),
            "y": float(layout.get("y") or 0),
        }
    return sentinels


def find_settings_view_mode_id(payload: dict[str, Any], view_mode_name: str) -> str:
    project_config = object_field(payload, "projectConfig")
    view_modes = object_field(project_config, "viewModes", allow_missing=True)
    for view_mode_id, raw_view_mode in view_modes.items():
        view_mode = expect_object(raw_view_mode, f"viewModes.{view_mode_id}")
        if normalized_string(view_mode.get("name")) == view_mode_name:
            return view_mode_id
    raise ParityHarnessError(
        f"Unable to find settings view mode named {view_mode_name!r}"
    )


def read_persisted_project_document(backend: BackendSession) -> dict[str, Any]:
    project_path = backend.setta_files_root / PROJECT_FILE_NAME
    try:
        payload = json.loads(project_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ParityHarnessError(
            f"Persisted project document missing at {project_path}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise ParityHarnessError(
            f"Persisted project document is not valid JSON at {project_path}: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise ParityHarnessError(
            "Persisted project document must be a JSON object, "
            f"got {type(payload).__name__}"
        )
    return payload


def project_has_windowing_in_store_payload(payload: dict[str, Any], project_id: str) -> bool:
    projects = object_field(payload, "projects", allow_missing=True)
    if project_id in projects:
        project = expect_object(projects[project_id], f"projects.{project_id}")
        raw_windowing = project.get("projectChatWindowing")
        return isinstance(raw_windowing, dict)

    source_projects = object_field(payload, "projectConfigs", allow_missing=True)
    if project_id in source_projects:
        raw_windowing_by_id = object_field(
            payload,
            "projectChatWindowingByProjectConfigId",
            allow_missing=True,
        )
        raw_windowing = raw_windowing_by_id.get(project_id)
        return isinstance(raw_windowing, dict)

    raise ParityHarnessError(f"Unable to find project {project_id!r} in store payload")


def remove_project_windowing_from_store_payload(
    payload: dict[str, Any],
    project_id: str,
) -> dict[str, Any]:
    projects = object_field(payload, "projects", allow_missing=True)
    if project_id in projects:
        project = expect_object(projects[project_id], f"projects.{project_id}")
        project.pop("projectChatWindowing", None)
        projects[project_id] = project
        payload["projects"] = projects
        return payload

    source_projects = object_field(payload, "projectConfigs", allow_missing=True)
    if project_id in source_projects:
        raw_windowing_by_id = object_field(
            payload,
            "projectChatWindowingByProjectConfigId",
            allow_missing=True,
        )
        raw_windowing_by_id.pop(project_id, None)
        payload["projectChatWindowingByProjectConfigId"] = raw_windowing_by_id
        return payload

    raise ParityHarnessError(f"Unable to find project {project_id!r} in store payload")


def seed_windowing_section_binding_conflicts_in_store_payload(
    payload: dict[str, Any],
    project_id: str,
    section_id: str,
) -> dict[str, Any]:
    project_chat_windowing = {
        "instancesById": {
            "project-chat-window-1": {
                "instanceId": "project-chat-window-1",
                "placement": "canvas_section",
                "sectionIdOrNull": section_id,
                "title": "Canvas Section Chat",
                "zIndex": 1,
            },
            "project-chat-window-2": {
                "instanceId": "project-chat-window-2",
                "placement": "floating",
                "sectionIdOrNull": section_id,
                "title": "Floating Section Chat",
                "zIndex": 10,
            },
        },
        "order": [
            "project-chat-window-2",
            "project-chat-window-1",
        ],
        "nextInstanceNumber": 3,
    }
    window_spaces = {
        "space-dedupe": {
            "id": "space-dedupe",
            "name": "Workspace",
            "sortIndex": 0,
            "windowsById": {
                "window-1": {
                    "surfaceKind": "section",
                    "sectionIdOrNull": section_id,
                    "title": "Lower Priority Section",
                    "zIndex": 1,
                },
                "window-2": {
                    "surfaceKind": "section",
                    "sectionIdOrNull": section_id,
                    "title": "Higher Priority Section",
                    "zIndex": 10,
                },
            },
            "order": [
                "window-1",
                "window-2",
            ],
        }
    }

    projects = object_field(payload, "projects", allow_missing=True)
    if project_id in projects:
        project = expect_object(projects[project_id], f"projects.{project_id}")
        project["projectChatWindowing"] = project_chat_windowing
        project["windowSpaces"] = window_spaces
        projects[project_id] = project
        payload["projects"] = projects
        return payload

    source_projects = object_field(payload, "projectConfigs", allow_missing=True)
    if project_id in source_projects:
        project = expect_object(source_projects[project_id], f"projectConfigs.{project_id}")
        project["windowSpaces"] = window_spaces
        source_projects[project_id] = project
        payload["projectConfigs"] = source_projects

        raw_windowing_by_id = object_field(
            payload,
            "projectChatWindowingByProjectConfigId",
            allow_missing=True,
        )
        raw_windowing_by_id[project_id] = project_chat_windowing
        payload["projectChatWindowingByProjectConfigId"] = raw_windowing_by_id
        return payload

    raise ParityHarnessError(f"Unable to find project {project_id!r} in store payload")


def seed_invalid_project_chat_windowing_owner_mode_in_store_payload(
    payload: dict[str, Any],
    project_id: str,
) -> dict[str, Any]:
    invalid_windowing = {
        "instancesById": {
            "project-chat-window-invalid": {
                "instanceId": "project-chat-window-invalid",
                "placement": "canvas_section",
                "mode": "git_graph_mode",
            }
        },
        "order": ["project-chat-window-invalid"],
        "nextInstanceNumber": 2,
    }

    projects = object_field(payload, "projects", allow_missing=True)
    if project_id in projects:
        project = expect_object(projects[project_id], f"projects.{project_id}")
        project["projectChatWindowing"] = invalid_windowing
        projects[project_id] = project
        payload["projects"] = projects
        return payload

    source_projects = object_field(payload, "projectConfigs", allow_missing=True)
    if project_id in source_projects:
        raw_windowing_by_id = object_field(
            payload,
            "projectChatWindowingByProjectConfigId",
            allow_missing=True,
        )
        raw_windowing_by_id[project_id] = invalid_windowing
        payload["projectChatWindowingByProjectConfigId"] = raw_windowing_by_id
        return payload

    raise ParityHarnessError(f"Unable to find project {project_id!r} in store payload")


def seed_invalid_window_spaces_owner_mode_in_store_payload(
    payload: dict[str, Any],
    project_id: str,
) -> dict[str, Any]:
    invalid_window_spaces = {
        "space-invalid": {
            "id": "space-invalid",
            "name": "Invalid Workspace",
            "sortIndex": 0,
            "windowsById": {
                "window-invalid": {
                    "surfaceKind": "project_chat",
                    "sectionIdOrNull": "section-invalid",
                }
            },
            "order": ["window-invalid"],
        }
    }

    projects = object_field(payload, "projects", allow_missing=True)
    if project_id in projects:
        project = expect_object(projects[project_id], f"projects.{project_id}")
        project["windowSpaces"] = invalid_window_spaces
        projects[project_id] = project
        payload["projects"] = projects
        return payload

    source_projects = object_field(payload, "projectConfigs", allow_missing=True)
    if project_id in source_projects:
        project = expect_object(source_projects[project_id], f"projectConfigs.{project_id}")
        project["windowSpaces"] = invalid_window_spaces
        source_projects[project_id] = project
        payload["projectConfigs"] = source_projects
        return payload

    raise ParityHarnessError(f"Unable to find project {project_id!r} in store payload")


def seed_distinct_windowing_per_project_in_store_payload(
    payload: dict[str, Any],
    project_windowing_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    projects = object_field(payload, "projects", allow_missing=True)
    if projects and all(project_id in projects for project_id in project_windowing_by_id):
        for project_id, windowing_payload in project_windowing_by_id.items():
            project = expect_object(projects[project_id], f"projects.{project_id}")
            project["projectChatWindowing"] = windowing_payload["projectChatWindowing"]
            project["windowSpaces"] = windowing_payload["windowSpaces"]
            projects[project_id] = project
        payload["projects"] = projects
        return payload

    source_projects = object_field(payload, "projectConfigs", allow_missing=True)
    if source_projects and all(
        project_id in source_projects for project_id in project_windowing_by_id
    ):
        raw_windowing_by_id = object_field(
            payload,
            "projectChatWindowingByProjectConfigId",
            allow_missing=True,
        )
        for project_id, windowing_payload in project_windowing_by_id.items():
            project = expect_object(
                source_projects[project_id],
                f"projectConfigs.{project_id}",
            )
            project["windowSpaces"] = windowing_payload["windowSpaces"]
            source_projects[project_id] = project
            raw_windowing_by_id[project_id] = windowing_payload["projectChatWindowing"]
        payload["projectConfigs"] = source_projects
        payload["projectChatWindowingByProjectConfigId"] = raw_windowing_by_id
        return payload

    missing_ids = sorted(project_windowing_by_id.keys())
    raise ParityHarnessError(
        f"Unable to find projects {missing_ids!r} in store payload"
    )


def seed_project_chat_window_chat_id_route_payload_in_store(
    payload: dict[str, Any],
    project_id: str,
    section_id: str,
) -> dict[str, Any]:
    project_chat_windowing = {
        "instancesById": {
            "project-ai-window": {
                "instanceId": "project-ai-window",
                "placement": "floating",
                "mode": "project_ai_mode",
            },
            "section-window": {
                "instanceId": "section-window",
                "placement": "canvas_section",
                "mode": "section_mode",
                "sectionIdOrNull": section_id,
            },
        },
        "order": ["project-ai-window", "section-window"],
        "nextInstanceNumber": 3,
    }

    projects = object_field(payload, "projects", allow_missing=True)
    if project_id in projects:
        project = expect_object(projects[project_id], f"projects.{project_id}")
        project["projectChatWindowing"] = project_chat_windowing
        projects[project_id] = project
        payload["projects"] = projects
        return payload

    source_projects = object_field(payload, "projectConfigs", allow_missing=True)
    if project_id in source_projects:
        raw_windowing_by_id = object_field(
            payload,
            "projectChatWindowingByProjectConfigId",
            allow_missing=True,
        )
        raw_windowing_by_id[project_id] = project_chat_windowing
        payload["projectChatWindowingByProjectConfigId"] = raw_windowing_by_id
        return payload

    raise ParityHarnessError(f"Unable to find project {project_id!r} in store payload")


def read_persisted_settings_project_document(backend: BackendSession) -> dict[str, Any]:
    project_path = backend.setta_files_root / SETTINGS_PROJECT_FILE_NAME
    try:
        payload = json.loads(project_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ParityHarnessError(
            f"Persisted settings project document missing at {project_path}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise ParityHarnessError(
            f"Persisted settings project document is not valid JSON at {project_path}: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise ParityHarnessError(
            "Persisted settings project document must be a JSON object, "
            f"got {type(payload).__name__}"
        )
    return payload


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


def expect_list(value: Any, label: str, allow_missing: bool = False) -> list[Any]:
    if value is None:
        if allow_missing:
            return []
        raise ParityHarnessError(f"Missing list field {label}")
    if isinstance(value, list):
        return value
    if allow_missing:
        return []
    raise ParityHarnessError(f"Expected list for {label}, got {type(value).__name__}")


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


def extract_load_window_spaces(payload: dict[str, Any]) -> dict[str, Any]:
    project_config = object_field(payload, "projectConfig")
    return object_field(project_config, "windowSpaces", allow_missing=True)


def extract_latest_window_spaces(payload: dict[str, Any]) -> dict[str, Any]:
    project_state = object_field(payload, "projectState")
    project_config = object_field(project_state, "projectConfig")
    return object_field(project_config, "windowSpaces", allow_missing=True)


def sort_index_summary_by_name(window_spaces: dict[str, Any]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for window_space_id, window_space in window_spaces.items():
        if not isinstance(window_space, dict):
            raise ParityHarnessError(
                f"windowSpaces entry must be an object, got {type(window_space).__name__}"
            )
        sort_index = window_space.get("sortIndex")
        if sort_index is None:
            sort_index = 0
        if not isinstance(sort_index, int):
            raise ParityHarnessError(
                f"windowSpaces[{window_space_id!r}].sortIndex must be an int, got {sort_index!r}"
            )
        window_space_name = normalized_string(window_space.get("name"))
        if not window_space_name:
            raise ParityHarnessError(
                f"windowSpaces[{window_space_id!r}].name must be a non-empty string."
            )
        summary[window_space_name] = sort_index
    return summary


def sort_window_space_names(window_spaces: dict[str, Any]) -> list[str]:
    def sort_key(item: tuple[str, Any]) -> tuple[int, str, str]:
        window_space_id, window_space = item
        if not isinstance(window_space, dict):
            raise ParityHarnessError(
                f"windowSpaces entry must be an object, got {type(window_space).__name__}"
            )
        sort_index = window_space.get("sortIndex")
        if sort_index is None:
            sort_index = 0
        if not isinstance(sort_index, int):
            raise ParityHarnessError(
                f"windowSpaces[{window_space_id!r}].sortIndex must be an int, got {sort_index!r}"
            )
        name = normalized_string(window_space.get("name"))
        return sort_index, name.lower(), window_space_id

    return [
        normalized_string(window_space.get("name"))
        for _, window_space in sorted(window_spaces.items(), key=sort_key)
    ]


def has_duplicate_sort_indices(window_spaces: dict[str, Any]) -> bool:
    seen: set[int] = set()
    for sort_index in sort_index_summary_by_name(window_spaces).values():
        if sort_index in seen:
            return True
        seen.add(sort_index)
    return False


def normalize_error_summary(payload: Any) -> str:
    if isinstance(payload, dict):
        raw_text = normalized_string(payload.get("_rawText"))
        if raw_text:
            return raw_text
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str):
                return message.strip()
            code = error.get("code")
            if isinstance(code, str):
                return code.strip()
        message = payload.get("message")
        if isinstance(message, str):
            normalized_validation_message = normalize_python_validation_message(
                message
            )
            if normalized_validation_message:
                return normalized_validation_message
        detail = payload.get("detail")
        if isinstance(detail, str):
            return detail.strip()
        if isinstance(message, str):
            return message.strip()
        code = payload.get("code")
        if isinstance(code, str):
            return code.strip()
    return normalized_string(str(payload))


def normalize_error_code(payload: Any) -> str:
    if not isinstance(payload, dict):
        return normalized_string(str(payload))
    error = payload.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        if isinstance(code, str):
            return code.strip()
    code = payload.get("code")
    if isinstance(code, str):
        return code.strip()
    message = payload.get("message")
    if isinstance(message, str):
        normalized_validation_message = normalize_python_validation_message(message)
        if normalized_validation_message:
            return normalized_validation_message
    return normalize_error_summary(payload)


def normalize_prompt_template_link_non_prompt_error(value: Any) -> str:
    normalized = normalized_string(value)
    if "failed type guard" in normalized.lower():
        return "failed type guard"
    return normalized


PYTHON_VALUE_ERROR_RE = re.compile(r"ValueError\((?P<quoted>'(?:[^'\\\\]|\\\\.)*')\)")


def normalize_python_validation_message(message: str) -> str | None:
    stripped_message = normalized_string(message)
    if not stripped_message:
        return None
    sanitized_message = PYTHON_VALUE_ERROR_RE.sub(
        lambda match: match.group("quoted"),
        stripped_message,
    )
    try:
        parsed_message = ast.literal_eval(sanitized_message)
    except (SyntaxError, ValueError):
        return None
    return extract_python_validation_message(parsed_message)


def extract_python_validation_message(payload: Any) -> str | None:
    if isinstance(payload, dict):
        raw_message = payload.get("msg")
        if isinstance(raw_message, str):
            normalized_message = normalized_string(raw_message)
            if normalized_message.startswith("Value error, "):
                return normalized_string(
                    normalized_message[len("Value error, ") :]
                )
            return normalized_message
        return None
    if isinstance(payload, list):
        for entry in payload:
            normalized_message = extract_python_validation_message(entry)
            if normalized_message:
                return normalized_message
        return None
    return None


def normalize_backend_error_summary(error_text: str) -> str:
    cleaned = error_text.replace("\x00", "")
    missing_settings_match = re.search(
        r"Missing settings section ([A-Za-z0-9_]+)\.",
        cleaned,
    )
    if missing_settings_match is not None:
        return f"Missing settings section {missing_settings_match.group(1)}."

    for raw_line in reversed(cleaned.splitlines()):
        line = raw_line.strip()
        if not line or line == "Backend exited before startup completed.":
            continue
        if re.match(r"^[\w.]+(?:Error|Exception): .+$", line):
            return line
    return normalized_string(error_text)


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


def write_json_preserving_order(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=False) + "\n",
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

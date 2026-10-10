from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping, Sequence
from pathlib import Path, PurePosixPath

from .inspection import inspect_wheel
from .lifecycle import (
    FailureCapture,
    assert_server_unavailable,
    assert_session_cleanup,
    cleanup_live_server,
)
from .models import (
    APP_DESCRIPTORS,
    APP_ID,
    APP_IDS,
    APPLIED_PROJECT_NAME,
    COMMAND_TIMEOUT_SECONDS,
    EXPERIMENT_LENS_APP_ID,
    EXPERIMENT_LENS_RUNTIME_SESSION_SCHEMA,
    EXPERIMENT_LENS_SCHEMA,
    HTTP_TIMEOUT_SECONDS,
    MAX_HTTP_BODY_BYTES,
    MAX_HTTP_REQUEST_BYTES,
    MAX_RUN_STREAM_BYTES,
    OPEN_CLOSE_TIMEOUT_SECONDS,
    OPEN_READY_TIMEOUT_SECONDS,
    PUBLIC_OPEN_SCHEMA,
    REALTIME_APP_ID,
    REALTIME_RUNTIME_SESSION_SCHEMA,
    REALTIME_SCHEMA,
    REQUIRED_EXPERIMENT_LENS_SCHEMAS,
    REQUIRED_OFFLINE_SCHEMA_COMMANDS,
    REQUIRED_REALTIME_SCHEMA_COMMANDS,
    REQUIRED_REVIEW_SCHEMAS,
    REVIEW_APP_ID,
    REVIEW_RUNTIME_SESSION_SCHEMA,
    REVIEW_SCHEMA,
    RUN_ALLOWANCE_MILLISECONDS,
    RUN_TIMEOUT_SECONDS,
    RUNTIME_SESSION_SCHEMA,
    SESSION_SCHEMA,
    AssetReferences,
    HTTPResult,
    LiveSessionIdentity,
    NoRedirect,
    ProjectIdentity,
    SmokeError,
    WheelInspection,
    is_nonnegative_int,
    is_positive_int,
    origin,
    parse_json_document,
    process_failure_message,
    read_bounded,
    require_list,
    require_object,
    strict_utf8,
    validate_exact_loopback_origin,
    validate_http_url,
)
from .process import (
    ForegroundOpen,
    assert_no_retired_alias,
    install_environment,
    popen_foreground,
    require_python,
    run_process,
    runtime_environment,
    venv_python,
    venv_scripts,
    venv_setta,
)


def smoke_wheel(
    wheel: Path,
    *,
    python: Path,
    expected_platform_tag: str | None = None,
    keep_temporary_directory: bool = False,
) -> WheelInspection:

    inspection = inspect_wheel(wheel, expected_platform_tag=expected_platform_tag)
    launcher = require_python(python)
    temporary: tempfile.TemporaryDirectory[str] | None
    if keep_temporary_directory:
        temporary = None
        temporary_root = Path(tempfile.mkdtemp(prefix="setta-wheel-smoke-"))
    else:
        temporary = tempfile.TemporaryDirectory(prefix="setta-wheel-smoke-")
        temporary_root = Path(temporary.name)
    try:
        run_clean_install(inspection.path, launcher, temporary_root)
    finally:
        if temporary is not None:
            temporary.cleanup()
        else:
            print(
                f"Setta smoke temporary directory retained: {temporary_root}",
                file=sys.stderr,
            )
    return inspection


def run_clean_install(wheel: Path, launcher: Path, temporary_root: Path) -> None:
    unrelated = temporary_root / "unrelated-working-directory"
    unrelated.mkdir(mode=0o700)
    environment_root = temporary_root / "clean-environment"
    run_process(
        (str(launcher), "-m", "venv", str(environment_root)),
        cwd=unrelated,
        env=install_environment(),
        timeout=300.0,
        label="create clean virtual environment",
    )
    python = venv_python(environment_root)
    run_process(
        (
            str(python),
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-input",
            "--only-binary",
            ":all:",
            str(wheel),
        ),
        cwd=unrelated,
        env=install_environment(),
        timeout=300.0,
        label="install the built wheel into the clean virtual environment",
    )
    environment = runtime_environment(venv_scripts(environment_root))
    setta = venv_setta(environment_root)
    assert_no_retired_alias(venv_scripts(environment_root), environment)
    assert_installed_root_commands(setta, python, environment, unrelated, wheel)
    assert_offline_schema(setta, environment, unrelated)
    assert_experiment_lens_offline_schema(setta, environment, unrelated)
    assert_realtime_offline_schema(setta, environment, unrelated)
    assert_review_offline_schema(setta, environment, unrelated)
    exercise_live_server(setta, environment, unrelated, temporary_root, python)
    exercise_experiment_lens_server(setta, environment, unrelated, temporary_root)
    exercise_realtime_server(setta, environment, unrelated, temporary_root)
    exercise_review_server(setta, environment, unrelated, temporary_root)


def assert_installed_root_commands(
    setta: Path,
    python: Path,
    environment: Mapping[str, str],
    cwd: Path,
    wheel: Path,
) -> None:
    version = run_process(
        (str(setta), "--version"),
        cwd=cwd,
        env=environment,
        timeout=COMMAND_TIMEOUT_SECONDS,
        label="setta --version",
    )
    version_text = strict_utf8(version.stdout, "setta --version output")
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)+(?:[A-Za-z0-9.+-]*)\n", version_text):
        raise SmokeError("setta --version did not print one package version")
    if version_text.strip() not in wheel.name:
        raise SmokeError(
            "installed setta version does not match the inspected wheel filename"
        )
    apps = run_json_command(
        (str(setta), "apps", "--json"), environment, cwd, "setta apps --json"
    )
    if (
        set(apps) != {"apps", "schemaVersion"}
        or apps.get("schemaVersion") != "setta-apps/v1"
    ):
        raise SmokeError("setta apps --json has an invalid public shape")
    app_documents = require_list(apps["apps"], "setta app list")
    if app_documents != list(APP_DESCRIPTORS):
        raise SmokeError(
            "setta apps --json does not expose the canonical installed app inventory"
        )
    module = run_process(
        (str(python), "-m", "setta"),
        cwd=cwd,
        env=environment,
        timeout=COMMAND_TIMEOUT_SECONDS,
        label="python -m setta",
    )
    if not strict_utf8(module.stdout, "python -m setta output").startswith(
        "Usage: setta "
    ):
        raise SmokeError("python -m setta did not dispatch the installed root command")
    doctor = run_json_command(
        (str(setta), "doctor", "--json"), environment, cwd, "setta doctor --json"
    )
    assert_doctor(doctor)


def assert_doctor(document: Mapping[str, object]) -> None:
    if set(document) != {"apps", "checks", "schemaVersion", "status"}:
        raise SmokeError("setta doctor --json has an invalid public shape")
    if (
        document.get("schemaVersion") != "setta-doctor/v1"
        or document.get("status") != "ok"
    ):
        raise SmokeError(
            "setta doctor --json did not report a healthy installed runtime"
        )
    checks = require_list(document["checks"], "doctor checks")
    if not checks or not all(
        isinstance(check, dict) and check.get("status") == "ok" for check in checks
    ):
        raise SmokeError("setta doctor --json did not validate packaged runtime assets")
    apps = require_list(document["apps"], "doctor apps")
    app_ids = tuple(app.get("id") if isinstance(app, dict) else None for app in apps)
    if app_ids != APP_IDS or any(
        not isinstance(app, dict) or app.get("status") != "ok" for app in apps
    ):
        raise SmokeError("setta doctor --json did not validate every installed app")


def assert_offline_schema(
    setta: Path, environment: Mapping[str, str], cwd: Path
) -> None:
    document = run_json_command(
        (str(setta), APP_ID, "schema"),
        environment,
        cwd,
        "offline Python Canvas schema",
    )
    assert_offline_schema_document(document)


def assert_offline_schema_document(document: Mapping[str, object]) -> None:
    required = {
        "commands",
        "errors",
        "operations",
        "results",
        "v2Vocabulary",
        "version",
    }
    if set(document) != required or document.get("version") != "v2":
        raise SmokeError("offline Python Canvas schema has an invalid shape")
    commands = require_list(document["commands"], "offline schema commands")
    names = {
        item.get("name")
        for item in commands
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    }
    if REQUIRED_OFFLINE_SCHEMA_COMMANDS - names:
        raise SmokeError("offline Python Canvas schema omits public AI-native commands")


def assert_experiment_lens_offline_schema(
    setta: Path, environment: Mapping[str, str], cwd: Path
) -> None:
    document = run_json_command(
        (str(setta), EXPERIMENT_LENS_APP_ID, "schema"),
        environment,
        cwd,
        "offline Experiment Lens schema",
    )
    assert_experiment_lens_offline_schema_document(document)


def assert_experiment_lens_offline_schema_document(
    document: Mapping[str, object],
) -> None:
    if set(document) != {"schemaVersion", "schemas"}:
        raise SmokeError("offline Experiment Lens schema has an invalid shape")
    if document.get("schemaVersion") != EXPERIMENT_LENS_SCHEMA:
        raise SmokeError("offline Experiment Lens schema has an invalid version")
    schemas = require_object(document["schemas"], "offline Experiment Lens schemas")
    if set(schemas) != REQUIRED_EXPERIMENT_LENS_SCHEMAS:
        raise SmokeError("offline Experiment Lens schema omits public contracts")


def assert_realtime_offline_schema(
    setta: Path, environment: Mapping[str, str], cwd: Path
) -> None:
    document = run_json_command(
        (str(setta), REALTIME_APP_ID, "schema"),
        environment,
        cwd,
        "offline Realtime schema",
    )
    assert_realtime_offline_schema_document(document)


def assert_realtime_offline_schema_document(
    document: Mapping[str, object],
) -> None:
    required = {
        "commands",
        "errors",
        "inputs",
        "operations",
        "results",
        "schemaVersion",
        "schemas",
    }
    if set(document) != required or document.get("schemaVersion") != REALTIME_SCHEMA:
        raise SmokeError("offline Realtime schema has an invalid shape")
    commands = require_object(document["commands"], "offline Realtime commands")
    if set(commands) != REQUIRED_REALTIME_SCHEMA_COMMANDS:
        raise SmokeError("offline Realtime schema omits public commands")


def assert_review_offline_schema(
    setta: Path, environment: Mapping[str, str], cwd: Path
) -> None:
    document = run_json_command(
        (str(setta), REVIEW_APP_ID, "schema"),
        environment,
        cwd,
        "offline Review schema",
    )
    assert_review_offline_schema_document(document)


def assert_review_offline_schema_document(document: Mapping[str, object]) -> None:
    if set(document) != {"schemaVersion", "schemas"}:
        raise SmokeError("offline Review schema has an invalid shape")
    if document.get("schemaVersion") != REVIEW_SCHEMA:
        raise SmokeError("offline Review schema has an invalid version")
    schemas = require_object(document["schemas"], "offline Review schemas")
    if set(schemas) != REQUIRED_REVIEW_SCHEMAS:
        raise SmokeError("offline Review schema omits public contracts")


def exercise_live_server(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    temporary_root: Path,
    launcher_python: Path,
) -> None:
    project_directory = temporary_root / "project"
    project_directory.mkdir(mode=0o700)
    project = project_directory / "canvas.json"
    expected_project = str(project.resolve(strict=False))
    live = start_foreground_open(
        (
            str(setta),
            APP_ID,
            "open",
            "--project",
            str(project),
            "--create",
            "--no-open",
        ),
        cwd=cwd,
        environment=environment,
    )
    readiness_url = ""
    failure_capture = FailureCapture()
    with failure_capture:
        readiness = parse_json_document(
            live.wait_for_readiness(OPEN_READY_TIMEOUT_SECONDS), "public open readiness"
        )
        readiness_url = assert_open_readiness(readiness, expected_project)
        session = run_json_command(
            (str(setta), APP_ID, "session", "inspect", "--project", str(project)),
            environment,
            cwd,
            "live Python Canvas session inspect",
        )
        identity = assert_session(session, expected_project, readiness_url)
        live.retain_app_session(identity)
        blank_project = assert_same_origin_http(
            readiness_url, expected_project, identity.instance_nonce
        )
        exercise_same_origin_terminal(readiness_url, blank_project.project_id)
        assert_blank_project_run(setta, environment, cwd, project, blank_project)
        renamed = assert_deterministic_apply(
            setta,
            environment,
            cwd,
            project,
            blank_project,
            temporary_root / "acceptance-operation.json",
        )
        assert_clean_launcher_fallback_run(
            setta,
            environment,
            cwd,
            project,
            renamed,
            launcher_python,
            temporary_root / "launcher-probe-operation.json",
        )
        assert_no_runner_artifacts(project_directory)
    failure = failure_capture.error
    cleanup_failure = cleanup_live_server(
        live,
        setta,
        environment,
        cwd,
        project,
        readiness_url,
        failed=failure is not None,
        close_foreground=close_foreground_open,
        session_cleanup=assert_session_cleanup,
        server_unavailable=assert_server_unavailable,
    )
    if failure is not None:
        if cleanup_failure is not None:
            if isinstance(failure, SmokeError):
                raise SmokeError(
                    f"{failure}; cleanup also failed: {cleanup_failure}"
                ) from failure
            failure.add_note(
                f"Setta wheel smoke cleanup also failed: {cleanup_failure}"
            )
        raise failure
    if cleanup_failure is not None:
        raise cleanup_failure


def exercise_realtime_server(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    temporary_root: Path,
) -> None:
    project = temporary_root / "realtime-project"
    project.mkdir(mode=0o700)
    write_realtime_entrypoint(project / "app.py")
    expected_project = str(project.resolve(strict=True))
    live = start_foreground_open(
        (
            str(setta),
            REALTIME_APP_ID,
            "open",
            "--project-root",
            str(project),
            "--create",
            "--no-open",
        ),
        cwd=cwd,
        environment=environment,
    )
    readiness_url = ""
    failure_capture = FailureCapture()
    with failure_capture:
        readiness = parse_json_document(
            live.wait_for_readiness(OPEN_READY_TIMEOUT_SECONDS),
            "Realtime public open readiness",
        )
        readiness_url = assert_realtime_open_readiness(readiness, expected_project)
        nonce = assert_realtime_web_and_identity(readiness_url, expected_project)
        live.retain_app_session(
            LiveSessionIdentity(
                project_path=expected_project,
                url=readiness_url,
                owner_pid=live.process.pid,
                instance_nonce=nonce,
            )
        )
        snapshot = run_json_command(
            (
                str(setta),
                REALTIME_APP_ID,
                "snapshot",
                "--project-root",
                str(project),
            ),
            environment,
            cwd,
            "live Realtime snapshot",
        )
        assert_realtime_ready(snapshot)
        assert_realtime_invoke(
            setta,
            environment,
            cwd,
            project,
            temporary_root / "realtime-invoke.json",
        )
    failure = failure_capture.error
    cleanup_failure = cleanup_live_server(
        live,
        setta,
        environment,
        cwd,
        project,
        readiness_url,
        failed=failure is not None,
        close_foreground=close_foreground_open,
        session_cleanup=assert_realtime_session_cleanup,
        server_unavailable=assert_server_unavailable,
    )
    if failure is not None:
        if cleanup_failure is not None:
            if isinstance(failure, SmokeError):
                raise SmokeError(
                    f"{failure}; cleanup also failed: {cleanup_failure}"
                ) from failure
            failure.add_note(
                f"Setta wheel smoke cleanup also failed: {cleanup_failure}"
            )
        raise failure
    if cleanup_failure is not None:
        raise cleanup_failure


def exercise_experiment_lens_server(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    temporary_root: Path,
) -> None:
    project = temporary_root / "experiment-lens-project"
    project.mkdir(mode=0o700)
    write_experiment_lens_project(project)
    expected_project = str(project.resolve(strict=True))
    live = start_foreground_open(
        (
            str(setta),
            EXPERIMENT_LENS_APP_ID,
            "open",
            "--project-root",
            str(project),
            "--no-open",
        ),
        cwd=cwd,
        environment=environment,
    )
    readiness_url = ""
    failure_capture = FailureCapture()
    with failure_capture:
        readiness = parse_json_document(
            live.wait_for_readiness(OPEN_READY_TIMEOUT_SECONDS),
            "Experiment Lens public open readiness",
        )
        readiness_url = assert_experiment_lens_open_readiness(
            readiness, expected_project
        )
        nonce = assert_experiment_lens_web_and_identity(readiness_url, expected_project)
        live.retain_app_session(
            LiveSessionIdentity(
                project_path=expected_project,
                url=readiness_url,
                owner_pid=live.process.pid,
                instance_nonce=nonce,
            )
        )
        live_response = http_get(readiness_url + "/api/v1/experiment-lens")
        live_snapshot = require_object(
            parse_json_document(
                live_response.body, "Experiment Lens live snapshot API response"
            ),
            "Experiment Lens live snapshot API response",
        )
        if (
            live_response.status != 200
            or live_response.content_type != "application/json"
        ):
            raise SmokeError("Experiment Lens did not serve its live snapshot API")
        assert_experiment_lens_snapshot(
            live_snapshot, "Experiment Lens live snapshot API response", revision=0
        )
        cli_snapshot = run_json_command(
            (
                str(setta),
                EXPERIMENT_LENS_APP_ID,
                "snapshot",
                "--project-root",
                str(project),
            ),
            environment,
            cwd,
            "live Experiment Lens snapshot",
        )
        assert_experiment_lens_snapshot(
            cli_snapshot, "live Experiment Lens snapshot", revision=0
        )
        if cli_snapshot != live_snapshot:
            raise SmokeError("Experiment Lens CLI snapshot does not match the live API")
        selected = assert_experiment_lens_apply(
            setta,
            environment,
            cwd,
            project,
            cli_snapshot,
            temporary_root / "experiment-lens-mutation.json",
        )
        assert_experiment_lens_export(
            setta,
            environment,
            cwd,
            project,
            selected,
            temporary_root / "experiment-lens-selection-packet.json",
        )
    failure = failure_capture.error
    cleanup_failure = cleanup_live_server(
        live,
        setta,
        environment,
        cwd,
        project,
        readiness_url,
        failed=failure is not None,
        close_foreground=close_foreground_open,
        session_cleanup=assert_experiment_lens_session_cleanup,
        server_unavailable=assert_server_unavailable,
    )
    if failure is not None:
        if cleanup_failure is not None:
            if isinstance(failure, SmokeError):
                raise SmokeError(
                    f"{failure}; cleanup also failed: {cleanup_failure}"
                ) from failure
            failure.add_note(
                f"Setta wheel smoke cleanup also failed: {cleanup_failure}"
            )
        raise failure
    if cleanup_failure is not None:
        raise cleanup_failure


def exercise_review_server(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    temporary_root: Path,
) -> None:
    project = temporary_root / "review-project"
    project.mkdir(mode=0o700)
    write_review_project(project)
    expected_project = str(project.resolve(strict=True))
    live = start_foreground_open(
        (
            str(setta),
            REVIEW_APP_ID,
            "open",
            "--project-root",
            str(project),
            "--no-open",
        ),
        cwd=cwd,
        environment=environment,
    )
    readiness_url = ""
    failure_capture = FailureCapture()
    with failure_capture:
        readiness = parse_json_document(
            live.wait_for_readiness(OPEN_READY_TIMEOUT_SECONDS),
            "Review public open readiness",
        )
        readiness_url = assert_review_open_readiness(readiness, expected_project)
        nonce = assert_review_web_and_identity(readiness_url, expected_project)
        live.retain_app_session(
            LiveSessionIdentity(
                project_path=expected_project,
                url=readiness_url,
                owner_pid=live.process.pid,
                instance_nonce=nonce,
            )
        )
        live_response = http_get(readiness_url + "/api/v1/review")
        live_snapshot = require_object(
            parse_json_document(
                live_response.body, "Review live snapshot API response"
            ),
            "Review live snapshot API response",
        )
        if (
            live_response.status != 200
            or live_response.content_type != "application/json"
        ):
            raise SmokeError("Review did not serve its live snapshot API")
        assert_review_snapshot(live_snapshot, "Review live snapshot API response")
        cli_snapshot = run_json_command(
            (
                str(setta),
                REVIEW_APP_ID,
                "snapshot",
                "--project-root",
                str(project),
            ),
            environment,
            cwd,
            "live Review snapshot",
        )
        assert_review_snapshot(cli_snapshot, "live Review snapshot")
        if cli_snapshot != live_snapshot:
            raise SmokeError("Review CLI snapshot does not match the live API")
    failure = failure_capture.error
    cleanup_failure = cleanup_live_server(
        live,
        setta,
        environment,
        cwd,
        project,
        readiness_url,
        failed=failure is not None,
        close_foreground=close_foreground_open,
        session_cleanup=assert_review_session_cleanup,
        server_unavailable=assert_server_unavailable,
    )
    if failure is not None:
        if cleanup_failure is not None:
            if isinstance(failure, SmokeError):
                raise SmokeError(
                    f"{failure}; cleanup also failed: {cleanup_failure}"
                ) from failure
            failure.add_note(
                f"Setta wheel smoke cleanup also failed: {cleanup_failure}"
            )
        raise failure
    if cleanup_failure is not None:
        raise cleanup_failure


def write_experiment_lens_project(project: Path) -> None:
    data = project / "data"
    try:
        data.mkdir(mode=0o700)
        with (data / "observations.json").open("xb") as destination:
            destination.write(_experiment_lens_observation_source_bytes())
        (data / "observations.json").chmod(0o600)
    except OSError as error:
        raise SmokeError(
            "unable to create the Experiment Lens acceptance project"
        ) from error
    write_operation(
        project / "experiment.json",
        _experiment_lens_manifest(),
        "Experiment Lens manifest",
    )


def _experiment_lens_observation_source_bytes() -> bytes:
    return (
        b'{"version":1,"experimentId":"smoke","observations":['
        b'{"id":"run-1","values":{"score":1}}]}\n'
    )


def _experiment_lens_manifest() -> dict[str, object]:
    observations = _experiment_lens_observation_source_bytes()
    return {
        "version": 1,
        "id": "smoke",
        "title": "Experiment Lens wheel smoke",
        "summary": "Verify the packaged Experiment Lens application.",
        "fields": [
            {
                "id": "score",
                "label": "Score",
                "description": "",
                "role": "metric",
                "valueType": "number",
                "unit": None,
                "nullable": False,
            }
        ],
        "observations": {
            "path": "data/observations.json",
            "byteLength": len(observations),
            "sha256": hashlib.sha256(observations).hexdigest(),
        },
        "artifacts": [],
        "relations": [],
        "presentation": {
            "initialViewId": "overview",
            "sections": [
                {
                    "id": "observations",
                    "title": "Observations",
                    "type": "table",
                    "fieldIds": ["score"],
                }
            ],
            "views": [
                {
                    "id": "overview",
                    "name": "Overview",
                    "viewport": {"x": 0, "y": 0, "zoom": 1},
                    "placements": [
                        {
                            "sectionId": "observations",
                            "x": 40,
                            "y": 40,
                            "width": 640,
                            "height": 420,
                        }
                    ],
                }
            ],
        },
        "provenance": {
            "producer": {
                "kind": "application",
                "name": "Setta wheel smoke",
            },
            "createdAt": "2026-09-19T00:00:00Z",
        },
    }


def _experiment_lens_selection(*, selected: bool) -> dict[str, object]:
    return {
        "filters": [],
        "focusedObservationId": "run-1" if selected else None,
        "selectedObservationIds": ["run-1"] if selected else [],
        "selectedArtifactIds": [],
        "ranges": [],
        "annotations": [],
    }


def assert_experiment_lens_snapshot(
    document: Mapping[str, object], label: str, *, revision: int
) -> None:
    required = {
        "version",
        "manifestPath",
        "manifestSha256",
        "observationSourcePath",
        "observationSourceSha256",
        "experiment",
        "observations",
        "artifacts",
        "revision",
        "selection",
    }
    manifest = _experiment_lens_manifest()
    observation_reference = require_object(
        manifest["observations"], "Experiment Lens observation reference"
    )
    digest = document.get("manifestSha256")
    if (
        set(document) != required
        or document.get("version") != 1
        or document.get("manifestPath") != "experiment.json"
        or not isinstance(digest, str)
        or re.fullmatch(r"[0-9a-f]{64}", digest) is None
        or document.get("observationSourcePath") != "data/observations.json"
        or document.get("observationSourceSha256")
        != observation_reference.get("sha256")
        or document.get("experiment") != manifest
        or document.get("observations") != [{"id": "run-1", "values": {"score": 1}}]
        or document.get("artifacts") != []
        or document.get("revision") != revision
        or document.get("selection")
        != _experiment_lens_selection(selected=revision > 0)
    ):
        raise SmokeError(f"{label} has an invalid experiment snapshot")


def assert_experiment_lens_apply(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    snapshot: Mapping[str, object],
    input_path: Path,
) -> Mapping[str, object]:
    manifest_digest = snapshot.get("manifestSha256")
    observation_digest = snapshot.get("observationSourceSha256")
    if not isinstance(manifest_digest, str) or not isinstance(observation_digest, str):
        raise SmokeError("Experiment Lens snapshot omitted its source identity")
    write_operation(
        input_path,
        {
            "experimentId": "smoke",
            "manifestSha256": manifest_digest,
            "observationSourceSha256": observation_digest,
            "expectedRevision": 0,
            "selection": _experiment_lens_selection(selected=True),
        },
        "Experiment Lens mutation",
    )
    try:
        result = run_json_command(
            (
                str(setta),
                EXPERIMENT_LENS_APP_ID,
                "apply",
                "--project-root",
                str(project),
                "--file",
                str(input_path),
            ),
            environment,
            cwd,
            "live Experiment Lens apply",
        )
    finally:
        remove_experiment_lens_input(input_path)
    if set(result) != {"version", "snapshot"} or result.get("version") != 1:
        raise SmokeError("Experiment Lens apply returned an invalid envelope")
    selected = require_object(result["snapshot"], "Experiment Lens apply snapshot")
    assert_experiment_lens_snapshot(
        selected, "Experiment Lens apply snapshot", revision=1
    )
    return selected


def assert_experiment_lens_export(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    snapshot: Mapping[str, object],
    output_path: Path,
) -> None:
    result = run_json_command(
        (
            str(setta),
            EXPERIMENT_LENS_APP_ID,
            "export",
            "--project-root",
            str(project),
            "--output",
            str(output_path),
        ),
        environment,
        cwd,
        "Experiment Lens selection export",
    )
    if set(result) != {"version", "packet"} or result.get("version") != 1:
        raise SmokeError("Experiment Lens export returned an invalid envelope")
    packet = require_object(result["packet"], "Experiment Lens selection packet")
    packet_id = packet.get("id")
    source = require_object(packet.get("source"), "Experiment Lens packet source")
    if (
        set(packet)
        != {
            "version",
            "id",
            "experiment",
            "source",
            "revision",
            "selection",
            "observations",
            "artifacts",
        }
        or packet.get("version") != 1
        or packet_id != "smoke-r1"
        or packet.get("experiment")
        != {
            "id": "smoke",
            "title": "Experiment Lens wheel smoke",
            "summary": "Verify the packaged Experiment Lens application.",
        }
        or source
        != {
            "manifestPath": "experiment.json",
            "manifestSha256": snapshot.get("manifestSha256"),
            "observationSourcePath": "data/observations.json",
            "observationSourceSha256": snapshot.get("observationSourceSha256"),
        }
        or packet.get("revision") != 1
        or packet.get("selection") != _experiment_lens_selection(selected=True)
        or packet.get("observations") != [{"id": "run-1", "values": {"score": 1}}]
        or packet.get("artifacts") != []
    ):
        raise SmokeError("Experiment Lens export returned an invalid selection packet")
    try:
        with output_path.open("rb") as exported:
            exported_packet = require_object(
                parse_json_document(
                    read_bounded(
                        exported,
                        MAX_HTTP_BODY_BYTES,
                        "Experiment Lens exported selection packet",
                    ),
                    "Experiment Lens exported selection packet",
                ),
                "Experiment Lens exported selection packet",
            )
    except OSError as error:
        raise SmokeError(
            "Experiment Lens did not write its requested selection packet"
        ) from error
    if exported_packet != packet:
        raise SmokeError(
            "Experiment Lens exported file does not match its command result"
        )


def remove_experiment_lens_input(path: Path) -> None:
    try:
        path.unlink()
    except OSError as error:
        raise SmokeError("unable to remove the Experiment Lens mutation") from error


def write_review_project(project: Path) -> None:
    requests = project / "requests"
    try:
        requests.mkdir(mode=0o700)
    except OSError as error:
        raise SmokeError("unable to create the Review acceptance project") from error
    write_operation(project / "review.json", _review_manifest(), "Review manifest")
    write_operation(
        requests / "packaged-review.json",
        _review_request(),
        "Review request",
    )


def _review_manifest() -> dict[str, object]:
    return {
        "version": 1,
        "id": "review-wheel-smoke",
        "name": "Review wheel smoke",
        "requests": ["requests/packaged-review.json"],
    }


def _review_request() -> dict[str, object]:
    return {
        "version": 1,
        "id": "packaged-review",
        "type": "completion",
        "title": "Verify the packaged Review app",
        "requestedDecision": (
            "Confirm that the packaged Review app can read this request."
        ),
        "evidence": [],
        "relations": [],
        "provenance": {
            "producer": {"kind": "script", "name": "Setta wheel smoke"},
            "createdAt": "2026-09-19T00:00:00Z",
        },
        "completion": {
            "claims": [
                {
                    "id": "packaged-app",
                    "text": "The packaged Review app is available.",
                }
            ]
        },
    }


def assert_review_snapshot(document: Mapping[str, object], label: str) -> None:
    if (
        set(document) != {"project", "requests", "revision", "version"}
        or document.get("version") != 1
        or document.get("revision") != 0
        or document.get("project") != _review_manifest()
    ):
        raise SmokeError(f"{label} has an invalid project envelope")
    requests = require_list(document.get("requests"), f"{label} requests")
    if len(requests) != 1:
        raise SmokeError(f"{label} does not contain the acceptance request")
    request = require_object(requests[0], f"{label} request")
    digest = request.get("sha256")
    if (
        set(request)
        != {"assessments", "evidence", "path", "request", "response", "sha256"}
        or request.get("path") != "requests/packaged-review.json"
        or request.get("request") != _review_request()
        or request.get("assessments") != []
        or request.get("evidence") != []
        or request.get("response") is not None
        or not isinstance(digest, str)
        or re.fullmatch(r"[0-9a-f]{64}", digest) is None
    ):
        raise SmokeError(f"{label} has an invalid acceptance request")


def write_realtime_entrypoint(path: Path) -> None:
    source = (
        b"def increment(value=0):\n"
        b"    return {'value': value + 1}\n"
        b"\n"
        b"handlers = {'increment': increment}\n"
    )
    try:
        with path.open("xb") as destination:
            destination.write(source)
        path.chmod(0o600)
    except OSError as error:
        raise SmokeError(
            "unable to write the Realtime acceptance entrypoint"
        ) from error


def assert_realtime_ready(document: Mapping[str, object]) -> None:
    runtime = require_object(document.get("runtime"), "live Realtime runtime")
    if runtime.get("workerState") != "ready":
        raise SmokeError("Realtime open did not initialize the entrypoint")


def assert_realtime_invoke(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    input_path: Path,
) -> None:
    write_operation(
        input_path,
        {"arguments": {"value": 41}, "content": []},
        "Realtime invoke",
    )
    try:
        result = run_json_command(
            (
                str(setta),
                REALTIME_APP_ID,
                "invoke",
                "--project-root",
                str(project),
                "--handler",
                "increment",
                "--file",
                str(input_path),
            ),
            environment,
            cwd,
            "live Realtime invoke",
        )
    finally:
        remove_realtime_invoke_input(input_path)
    if result != {"outputs": {"value": 42}, "updateCount": 0, "error": None}:
        raise SmokeError("live Realtime invoke did not return the expected output")


def remove_realtime_invoke_input(path: Path) -> None:
    try:
        path.unlink()
    except OSError as error:
        raise SmokeError("unable to remove the Realtime invoke input") from error


def assert_realtime_session_cleanup(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    *,
    timeout: float = COMMAND_TIMEOUT_SECONDS,
) -> None:
    result = run_process(
        (
            str(setta),
            REALTIME_APP_ID,
            "snapshot",
            "--project-root",
            str(project),
        ),
        cwd=cwd,
        env=environment,
        timeout=timeout,
        label="Realtime post-shutdown snapshot",
    )
    document = require_object(
        parse_json_document(result.stdout, "Realtime post-shutdown snapshot output"),
        "Realtime post-shutdown snapshot output",
    )
    if set(document) != {"project", "runtime"}:
        raise SmokeError("Realtime shutdown did not restore offline project access")


def assert_experiment_lens_session_cleanup(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    *,
    timeout: float = COMMAND_TIMEOUT_SECONDS,
) -> None:
    result = run_process(
        (
            str(setta),
            EXPERIMENT_LENS_APP_ID,
            "snapshot",
            "--project-root",
            str(project),
        ),
        cwd=cwd,
        env=environment,
        timeout=timeout,
        label="Experiment Lens post-shutdown snapshot",
    )
    document = require_object(
        parse_json_document(
            result.stdout, "Experiment Lens post-shutdown snapshot output"
        ),
        "Experiment Lens post-shutdown snapshot output",
    )
    revision = document.get("revision")
    if not is_nonnegative_int(revision) or revision > 1:
        raise SmokeError(
            "Experiment Lens post-shutdown snapshot has an invalid revision"
        )
    assert_experiment_lens_snapshot(
        document, "Experiment Lens post-shutdown snapshot", revision=revision
    )


def assert_review_session_cleanup(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    *,
    timeout: float = COMMAND_TIMEOUT_SECONDS,
) -> None:
    result = run_process(
        (
            str(setta),
            REVIEW_APP_ID,
            "snapshot",
            "--project-root",
            str(project),
        ),
        cwd=cwd,
        env=environment,
        timeout=timeout,
        label="Review post-shutdown snapshot",
    )
    document = require_object(
        parse_json_document(result.stdout, "Review post-shutdown snapshot output"),
        "Review post-shutdown snapshot output",
    )
    assert_review_snapshot(document, "Review post-shutdown snapshot")


def close_foreground_open(live: ForegroundOpen) -> None:
    try:
        closed = live.close_gracefully(OPEN_CLOSE_TIMEOUT_SECONDS)
    except SmokeError:
        live.terminate()
        raise
    if closed.returncode != 130:
        raise SmokeError(
            process_failure_message(
                closed.command, closed.returncode, closed.stdout, closed.stderr
            )
        )


def start_foreground_open(
    command: Sequence[str], *, cwd: Path, environment: Mapping[str, str]
) -> ForegroundOpen:
    process, tree = popen_foreground(
        command, cwd=cwd, env=environment, stdin=subprocess.DEVNULL
    )
    opened = False
    try:
        foreground = ForegroundOpen(process, command, tree=tree)
        opened = True
        return foreground
    finally:
        if not opened:
            try:
                tree.force_stop(process)
            finally:
                tree.close()


def assert_open_readiness(document: object, expected_project: str) -> str:
    readiness = require_object(document, "public open readiness")
    if set(readiness) != {"appId", "projectPath", "schemaVersion", "url"}:
        raise SmokeError("public open readiness has an invalid shape")
    if (
        readiness.get("schemaVersion") != PUBLIC_OPEN_SCHEMA
        or readiness.get("appId") != APP_ID
    ):
        raise SmokeError("public open readiness does not identify Python Canvas")
    if readiness.get("projectPath") != expected_project:
        raise SmokeError(
            "public open readiness did not return the canonical project path"
        )
    url = readiness.get("url")
    if not isinstance(url, str):
        raise SmokeError("public open readiness has no URL")
    validate_exact_loopback_origin(url)
    return url


def assert_realtime_open_readiness(document: object, expected_project: str) -> str:
    readiness = require_object(document, "Realtime public open readiness")
    if set(readiness) != {"appId", "projectPath", "schemaVersion", "url"}:
        raise SmokeError("Realtime public open readiness has an invalid shape")
    if (
        readiness.get("schemaVersion") != PUBLIC_OPEN_SCHEMA
        or readiness.get("appId") != REALTIME_APP_ID
        or readiness.get("projectPath") != expected_project
    ):
        raise SmokeError("Realtime public open readiness has an invalid identity")
    url = readiness.get("url")
    if not isinstance(url, str):
        raise SmokeError("Realtime public open readiness has no URL")
    validate_exact_loopback_origin(url)
    return url


def assert_experiment_lens_open_readiness(
    document: object, expected_project: str
) -> str:
    readiness = require_object(document, "Experiment Lens public open readiness")
    if set(readiness) != {"appId", "projectPath", "schemaVersion", "url"}:
        raise SmokeError("Experiment Lens public open readiness has an invalid shape")
    if (
        readiness.get("schemaVersion") != PUBLIC_OPEN_SCHEMA
        or readiness.get("appId") != EXPERIMENT_LENS_APP_ID
        or readiness.get("projectPath") != expected_project
    ):
        raise SmokeError(
            "Experiment Lens public open readiness has an invalid identity"
        )
    url = readiness.get("url")
    if not isinstance(url, str):
        raise SmokeError("Experiment Lens public open readiness has no URL")
    validate_exact_loopback_origin(url)
    return url


def assert_review_open_readiness(document: object, expected_project: str) -> str:
    readiness = require_object(document, "Review public open readiness")
    if set(readiness) != {"appId", "projectPath", "schemaVersion", "url"}:
        raise SmokeError("Review public open readiness has an invalid shape")
    if (
        readiness.get("schemaVersion") != PUBLIC_OPEN_SCHEMA
        or readiness.get("appId") != REVIEW_APP_ID
        or readiness.get("projectPath") != expected_project
    ):
        raise SmokeError("Review public open readiness has an invalid identity")
    url = readiness.get("url")
    if not isinstance(url, str):
        raise SmokeError("Review public open readiness has no URL")
    validate_exact_loopback_origin(url)
    return url


def assert_realtime_web_and_identity(origin_url: str, project_path: str) -> str:
    root = http_get(origin_url + "/")
    if (
        root.status != 200
        or not root.content_type.startswith("text/html")
        or not root.body
    ):
        raise SmokeError("Realtime did not serve root HTML from the public origin")
    asset = http_get(find_same_origin_asset(origin_url, root.body))
    if asset.status != 200 or not asset.body or not asset.content_type:
        raise SmokeError("Realtime did not serve its packaged web root")
    identity = http_get(origin_url + "/api/v2/runtime/session")
    document = require_object(
        parse_json_document(identity.body, "Realtime session identity response"),
        "Realtime session identity response",
    )
    nonce = document.get("instanceNonce")
    if (
        identity.status != 200
        or identity.content_type != "application/json"
        or set(document) != {"appId", "instanceNonce", "projectPath", "schemaVersion"}
        or document.get("schemaVersion") != REALTIME_RUNTIME_SESSION_SCHEMA
        or document.get("appId") != REALTIME_APP_ID
        or document.get("projectPath") != project_path
        or not isinstance(nonce, str)
        or len(nonce) < 16
    ):
        raise SmokeError("Realtime session identity does not match public readiness")
    return nonce


def assert_experiment_lens_web_and_identity(origin_url: str, project_path: str) -> str:
    root = http_get(origin_url + "/")
    if (
        root.status != 200
        or not root.content_type.startswith("text/html")
        or not root.body
    ):
        raise SmokeError(
            "Experiment Lens did not serve root HTML from the public origin"
        )
    asset = http_get(find_same_origin_asset(origin_url, root.body))
    if asset.status != 200 or not asset.body or not asset.content_type:
        raise SmokeError("Experiment Lens did not serve its packaged web root")
    identity = http_get(origin_url + "/api/v2/runtime/session")
    document = require_object(
        parse_json_document(identity.body, "Experiment Lens session identity response"),
        "Experiment Lens session identity response",
    )
    nonce = document.get("instanceNonce")
    if (
        identity.status != 200
        or identity.content_type != "application/json"
        or set(document) != {"appId", "instanceNonce", "projectPath", "schemaVersion"}
        or document.get("schemaVersion") != EXPERIMENT_LENS_RUNTIME_SESSION_SCHEMA
        or document.get("appId") != EXPERIMENT_LENS_APP_ID
        or document.get("projectPath") != project_path
        or not isinstance(nonce, str)
        or len(nonce) < 16
    ):
        raise SmokeError(
            "Experiment Lens session identity does not match public readiness"
        )
    return nonce


def assert_review_web_and_identity(origin_url: str, project_path: str) -> str:
    root = http_get(origin_url + "/")
    if (
        root.status != 200
        or not root.content_type.startswith("text/html")
        or not root.body
    ):
        raise SmokeError("Review did not serve root HTML from the public origin")
    asset = http_get(find_same_origin_asset(origin_url, root.body))
    if asset.status != 200 or not asset.body or not asset.content_type:
        raise SmokeError("Review did not serve its packaged web root")
    identity = http_get(origin_url + "/api/v2/runtime/session")
    document = require_object(
        parse_json_document(identity.body, "Review session identity response"),
        "Review session identity response",
    )
    nonce = document.get("instanceNonce")
    if (
        identity.status != 200
        or identity.content_type != "application/json"
        or set(document) != {"appId", "instanceNonce", "projectPath", "schemaVersion"}
        or document.get("schemaVersion") != REVIEW_RUNTIME_SESSION_SCHEMA
        or document.get("appId") != REVIEW_APP_ID
        or document.get("projectPath") != project_path
        or not isinstance(nonce, str)
        or len(nonce) < 16
    ):
        raise SmokeError("Review session identity does not match public readiness")
    return nonce


def assert_session(
    document: Mapping[str, object], expected_project: str, expected_url: str
) -> LiveSessionIdentity:
    if set(document) != {
        "appId",
        "formatVersion",
        "instanceNonce",
        "ownerPid",
        "projectPath",
        "url",
    }:
        raise SmokeError("live session inspect has an invalid shape")
    nonce = document.get("instanceNonce")
    owner_pid = document.get("ownerPid")
    if (
        document.get("formatVersion") != SESSION_SCHEMA
        or document.get("appId") != APP_ID
        or document.get("projectPath") != expected_project
        or document.get("url") != expected_url
        or not isinstance(nonce, str)
        or len(nonce) < 16
        or not is_positive_int(owner_pid)
    ):
        raise SmokeError(
            "live session inspect does not match foreground open readiness"
        )
    return LiveSessionIdentity(
        project_path=expected_project,
        url=expected_url,
        owner_pid=owner_pid,
        instance_nonce=nonce,
    )


def assert_same_origin_http(
    origin_url: str, project_path: str, nonce: str
) -> ProjectIdentity:
    root = http_get(origin_url + "/")
    if (
        root.status != 200
        or not root.content_type.startswith("text/html")
        or not root.body
    ):
        raise SmokeError("live server did not serve root HTML from the public origin")
    asset_url = find_same_origin_asset(origin_url, root.body)
    asset = http_get(asset_url)
    if asset.status != 200 or not asset.body or not asset.content_type:
        raise SmokeError(
            "live server did not serve a production web asset from the public origin"
        )
    project = http_get(origin_url + "/api/v2/project")
    project_document = parse_json_document(project.body, "project API response")
    project_mapping = require_object(project_document, "project API response")
    if (
        project.status != 200
        or project.content_type != "application/json"
        or project_mapping.get("version") != "v2"
    ):
        raise SmokeError("live server did not serve the same-origin project API")
    project_identity = project_identity_from_snapshot(
        project_mapping, "same-origin project API"
    )
    identity = http_get(origin_url + "/api/v2/runtime/session")
    identity_document = parse_json_document(
        identity.body, "runtime session API response"
    )
    if (
        identity.status != 200
        or identity.content_type != "application/json"
        or identity_document
        != {
            "schemaVersion": RUNTIME_SESSION_SCHEMA,
            "appId": APP_ID,
            "projectPath": project_path,
            "instanceNonce": nonce,
        }
    ):
        raise SmokeError(
            "same-origin runtime session API does not match the published session"
        )
    return project_identity


def exercise_same_origin_terminal(origin_url: str, project_id: str) -> None:
    opened = False
    try:
        response = http_post_json(
            origin_url + "/api/v2/project/terminal",
            {"projectId": project_id, "columns": 80, "rows": 24},
        )
        opened = True
        document = require_object(
            parse_json_document(response.body, "terminal open API response"),
            "terminal open API response",
        )
        if (
            response.status != 200
            or response.content_type != "application/json"
            or document != {"created": True, "columns": 80, "rows": 24}
        ):
            raise SmokeError(
                "same-origin terminal open did not publish the expected transient "
                "session"
            )
    finally:
        if opened:
            closed = http_post_json(
                origin_url + "/api/v2/project/terminal/close",
                {"projectId": project_id},
            )
            if closed.status != 204 or closed.body:
                raise SmokeError(
                    "same-origin terminal close did not reap the transient session"
                )


def assert_blank_project_run(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    expected: ProjectIdentity,
) -> None:
    snapshot = snapshot_from_project_session(setta, environment, cwd, project)
    if (
        project_identity_from_snapshot(snapshot, "snapshot before blank-project AI run")
        != expected
    ):
        raise SmokeError(
            "snapshot before blank-project AI run changed the project identity"
        )
    result = run_json_command(
        (
            str(setta),
            APP_ID,
            "run",
            "--project",
            str(project),
            "--run-timeout",
            f"{RUN_TIMEOUT_SECONDS}s",
        ),
        environment,
        cwd,
        "blank-project Python Canvas AI run",
    )
    assert_ai_run_result(result, expected.project_id, expected.revision)
    assert_normal_blank_project_run_result(result)


def assert_normal_blank_project_run_result(result: Mapping[str, object]) -> None:
    if (
        result.get("terminationReason") != "exited"
        or result.get("exitCode") != 0
        or result.get("stdoutTruncated") is not False
        or result.get("stderrTruncated") is not False
    ):
        raise SmokeError(
            "blank-project AI run did not terminate normally with exit code 0"
        )


def snapshot_from_project_session(
    setta: Path, environment: Mapping[str, str], cwd: Path, project: Path
) -> Mapping[str, object]:
    snapshot = run_json_command(
        (str(setta), APP_ID, "snapshot", "--project", str(project)),
        environment,
        cwd,
        "project snapshot before AI run",
    )
    if snapshot.get("version") != "v2":
        raise SmokeError("project snapshot before AI run has an invalid version")
    return snapshot


def assert_deterministic_apply(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    expected: ProjectIdentity,
    operation_path: Path,
) -> ProjectIdentity:
    write_acceptance_operation(operation_path)
    try:
        applied = run_json_command(
            (
                str(setta),
                APP_ID,
                "apply",
                "--project",
                str(project),
                "--file",
                str(operation_path),
            ),
            environment,
            cwd,
            "deterministic Python Canvas AI apply",
        )
    finally:
        remove_acceptance_operation(operation_path)
    observed = project_identity_from_snapshot(applied, "deterministic AI apply result")
    expected_after = ProjectIdentity(
        project_id=expected.project_id,
        name=APPLIED_PROJECT_NAME,
        revision=expected.revision + 1,
    )
    if observed != expected_after:
        raise SmokeError(
            "deterministic AI apply did not publish the exact expected project revision"
        )
    return observed


def assert_clean_launcher_fallback_run(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    expected: ProjectIdentity,
    launcher_python: Path,
    operation_path: Path,
) -> None:
    write_launcher_probe_operation(operation_path)
    try:
        applied = run_json_command(
            (
                str(setta),
                APP_ID,
                "apply",
                "--project",
                str(project),
                "--file",
                str(operation_path),
            ),
            environment,
            cwd,
            "clean-launcher fallback AI apply",
        )
    finally:
        remove_acceptance_operation(operation_path)
    expected_after = ProjectIdentity(
        project_id=expected.project_id,
        name=expected.name,
        revision=expected.revision + 1,
    )
    if (
        project_identity_from_snapshot(applied, "clean-launcher fallback AI apply")
        != expected_after
    ):
        raise SmokeError(
            "clean-launcher fallback AI apply did not publish one revision"
        )
    result = run_json_command(
        (
            str(setta),
            APP_ID,
            "run",
            "--project",
            str(project),
            "--run-timeout",
            f"{RUN_TIMEOUT_SECONDS}s",
        ),
        environment,
        cwd,
        "clean-launcher fallback AI run",
    )
    assert_ai_run_result(result, expected_after.project_id, expected_after.revision)
    assert_normal_blank_project_run_result(result)
    assert_clean_launcher_report(result.get("stdout"), launcher_python)


def assert_clean_launcher_report(value: object, launcher_python: Path) -> None:
    if not isinstance(value, str):
        raise SmokeError("clean-launcher fallback AI run omitted standard output")
    document = parse_json_document(
        value.encode("utf-8"), "clean-launcher fallback report"
    )
    report = require_object(document, "clean-launcher fallback report")
    if set(report) != {"basePrefix", "executable", "prefix"}:
        raise SmokeError("clean-launcher fallback report has an invalid shape")
    executable = report.get("executable")
    prefix = report.get("prefix")
    base_prefix = report.get("basePrefix")
    if (
        not isinstance(executable, str)
        or not executable
        or not isinstance(prefix, str)
        or not prefix
        or not isinstance(base_prefix, str)
        or not base_prefix
    ):
        raise SmokeError("clean-launcher fallback report has invalid paths")
    expected_root = launcher_python.parent.parent.resolve(strict=True)
    reported_prefix = Path(prefix).resolve(strict=True)
    reported_executable = Path(executable)
    if reported_prefix != expected_root:
        raise SmokeError("clean-launcher fallback AI run did not retain the clean venv")
    try:
        same_launcher = reported_executable.samefile(launcher_python)
    except OSError as error:
        raise SmokeError(
            "clean-launcher fallback report has an invalid executable"
        ) from error
    if not same_launcher or Path(base_prefix).resolve(strict=True) == reported_prefix:
        raise SmokeError("clean-launcher fallback AI run did not use the venv launcher")


def project_identity_from_snapshot(
    document: Mapping[str, object], label: str
) -> ProjectIdentity:
    if document.get("version") != "v2":
        raise SmokeError(f"{label} has an unsupported snapshot version")
    project = require_object(document.get("project"), f"{label} project")
    if set(project) != {"id", "name", "revision"}:
        raise SmokeError(f"{label} has an invalid project identity shape")
    project_id = project.get("id")
    name = project.get("name")
    revision = project.get("revision")
    if (
        not isinstance(project_id, str)
        or not project_id.strip()
        or not isinstance(name, str)
        or not is_positive_int(revision)
    ):
        raise SmokeError(f"{label} has invalid project identity values")
    return ProjectIdentity(project_id=project_id, name=name, revision=revision)


def write_acceptance_operation(path: Path) -> None:
    write_operation(
        path,
        {"name": APPLIED_PROJECT_NAME, "operation": "project.rename"},
        "deterministic AI apply",
    )


def write_launcher_probe_operation(path: Path) -> None:
    write_operation(
        path,
        {
            "operation": "pythonTarget.set",
            "prefix": (
                "import json\n"
                "import sys\n"
                "print(json.dumps({'executable': sys.executable, 'prefix': sys.prefix, "
                "'basePrefix': sys.base_prefix}, sort_keys=True))"
            ),
            "suffix": "state = SettaState()",
        },
        "clean-launcher fallback AI apply",
    )


def write_operation(path: Path, document: Mapping[str, object], label: str) -> None:
    try:
        content = json.dumps(
            document, ensure_ascii=False, separators=(",", ":"), sort_keys=True
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise SmokeError(f"{label} cannot serialize its operation") from error
    if len(content) > MAX_HTTP_REQUEST_BYTES:
        raise SmokeError(f"{label} operation exceeds its byte limit")
    try:
        with path.open("xb") as destination:
            destination.write(content)
        path.chmod(0o600)
    except FileExistsError as error:
        raise SmokeError(f"{label} operation path already exists") from error
    except OSError as error:
        raise SmokeError(f"unable to write the {label} operation") from error


def remove_acceptance_operation(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError as error:
        raise SmokeError(
            "deterministic AI apply operation disappeared before cleanup"
        ) from error
    except OSError as error:
        raise SmokeError(
            "unable to remove the deterministic AI apply operation"
        ) from error


def assert_ai_run_result(
    result: Mapping[str, object], expected_id: str, expected_revision: int
) -> None:
    required = {
        "elapsedMilliseconds",
        "projectId",
        "revision",
        "stderr",
        "stderrTruncated",
        "stdout",
        "stdoutTruncated",
        "terminationReason",
    }
    allowed = required | {"exitCode"}
    if not required.issubset(result) or not set(result).issubset(allowed):
        raise SmokeError("AI run result has an invalid public shape")
    termination = result.get("terminationReason")
    stdout = result.get("stdout")
    stderr = result.get("stderr")
    elapsed = result.get("elapsedMilliseconds")
    if (
        result.get("projectId") != expected_id
        or result.get("revision") != expected_revision
        or not isinstance(stdout, str)
        or not isinstance(stderr, str)
        or not isinstance(result.get("stdoutTruncated"), bool)
        or not isinstance(result.get("stderrTruncated"), bool)
        or not is_nonnegative_int(elapsed)
        or elapsed > RUN_TIMEOUT_SECONDS * 1000 + RUN_ALLOWANCE_MILLISECONDS
        or termination not in {"exited", "signaled", "timed_out", "output_limit"}
    ):
        raise SmokeError("AI run result does not satisfy the bounded runner contract")
    if (
        len(stdout.encode("utf-8")) > MAX_RUN_STREAM_BYTES
        or len(stderr.encode("utf-8")) > MAX_RUN_STREAM_BYTES
    ):
        raise SmokeError("AI run result exceeds the runner's bounded capture envelope")
    exit_code = result.get("exitCode")
    if termination == "exited":
        if not is_nonnegative_int(exit_code):
            raise SmokeError("AI run result omitted an ordinary process exit code")
    elif "exitCode" in result:
        raise SmokeError(
            "AI run result exposed an exit code for an interrupted process"
        )


def assert_no_runner_artifacts(project_directory: Path) -> None:
    artifacts = sorted(project_directory.glob(".setta-ai-run-*.py"))
    if artifacts:
        raise SmokeError(
            "AI run left generated Python artifacts in the project directory"
        )


def find_same_origin_asset(origin_url: str, html_body: bytes) -> str:
    source = strict_utf8(html_body, "root HTML")
    parser = AssetReferences()
    parser.feed(source)
    parser.close()
    expected_origin = origin(urllib.parse.urlsplit(origin_url))
    for reference in parser.references:
        candidate = urllib.parse.urljoin(origin_url + "/", reference)
        parsed = urllib.parse.urlsplit(candidate)
        if origin(parsed) != expected_origin:
            continue
        if parsed.path.startswith("/api/") or not PurePosixPath(parsed.path).suffix:
            continue
        return candidate
    raise SmokeError(
        "root HTML has no same-origin production script or stylesheet asset"
    )


def http_get(url: str, *, timeout: float = HTTP_TIMEOUT_SECONDS) -> HTTPResult:
    return http_request(url, method="GET", timeout=timeout)


def http_post_json(url: str, document: Mapping[str, object]) -> HTTPResult:
    try:
        body = json.dumps(
            document, ensure_ascii=False, separators=(",", ":"), sort_keys=True
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise SmokeError("HTTP JSON request cannot be serialized") from error
    if not body or len(body) > MAX_HTTP_REQUEST_BYTES:
        raise SmokeError("HTTP JSON request exceeds its bounded byte limit")
    return http_request(
        url,
        method="POST",
        body=body,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )


def http_request(
    url: str,
    *,
    method: str,
    body: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float = HTTP_TIMEOUT_SECONDS,
) -> HTTPResult:
    validate_http_url(url)
    if timeout <= 0:
        raise SmokeError("HTTP request has an invalid timeout")
    request = urllib.request.Request(
        url,
        data=body,
        headers=dict(headers or {"Accept": "*/*"}),
        method=method,
    )
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=timeout) as response:
            response_body = read_bounded(
                response, MAX_HTTP_BODY_BYTES, f"HTTP response from {url}"
            )
            content_type = response.headers.get_content_type()
            status = response.status
            final_url = response.geturl()
    except (OSError, urllib.error.HTTPError, urllib.error.URLError) as error:
        raise SmokeError(f"HTTP request failed for {url}") from error
    if final_url != url:
        raise SmokeError(f"HTTP request unexpectedly redirected: {url}")
    return HTTPResult(
        url=url,
        status=status,
        content_type=content_type,
        body=response_body,
    )


def run_json_command(
    command: Sequence[str],
    environment: Mapping[str, str],
    cwd: Path,
    label: str,
    *,
    allowed_returncodes: frozenset[int] = frozenset({0}),
) -> dict[str, object]:
    result = run_process(
        command,
        cwd=cwd,
        env=environment,
        timeout=COMMAND_TIMEOUT_SECONDS,
        label=label,
        allowed_returncodes=allowed_returncodes,
    )
    document = parse_json_document(result.stdout, f"{label} output")
    return require_object(document, f"{label} output")

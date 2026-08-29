from __future__ import annotations

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

from setta_wheel_smoke.inspection import inspect_wheel
from setta_wheel_smoke.lifecycle import (
    FailureCapture,
    assert_server_unavailable,
    assert_session_cleanup,
    cleanup_live_server,
)
from setta_wheel_smoke.models import (
    APP_ID,
    APPLIED_PROJECT_NAME,
    COMMAND_TIMEOUT_SECONDS,
    HTTP_TIMEOUT_SECONDS,
    MAX_HTTP_BODY_BYTES,
    MAX_HTTP_REQUEST_BYTES,
    MAX_RUN_STREAM_BYTES,
    OPEN_CLOSE_TIMEOUT_SECONDS,
    OPEN_READY_TIMEOUT_SECONDS,
    PUBLIC_OPEN_SCHEMA,
    REQUIRED_OFFLINE_SCHEMA_COMMANDS,
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
from setta_wheel_smoke.process import (
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
    exercise_live_server(setta, environment, unrelated, temporary_root, python)


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
    if app_documents != [
        {
            "id": APP_ID,
            "name": "Python Canvas",
            "summary": "Author and run one local Python project.",
        }
    ]:
        raise SmokeError(
            "setta apps --json does not expose the installed Python Canvas app"
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
    if (
        len(apps) != 1
        or not isinstance(apps[0], dict)
        or apps[0].get("id") != APP_ID
        or apps[0].get("status") != "ok"
    ):
        raise SmokeError(
            "setta doctor --json did not validate Python Canvas and Basedpyright"
        )


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
                "same-origin terminal open did not publish the expected transient session"
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
    if not all(
        isinstance(path, str) and path for path in (executable, prefix, base_prefix)
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

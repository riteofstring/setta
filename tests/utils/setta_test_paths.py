from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from setta.utils.constants import C

SeedSettaFilesFn = Callable[[Path], None]


@contextmanager
def patched_setta_paths(
    tmp_root: Path,
    *,
    seed_fn: SeedSettaFilesFn | None = None,
) -> Iterator[Path]:
    """Patch `setta.utils.constants.C` paths to point at an isolated test workspace."""

    setta_root = tmp_root / "setta_files"
    code_folder = setta_root / "code"
    artifacts_folder = setta_root / "artifacts"
    backup_folder = setta_root / "backups"

    run_folder = setta_root / "run"
    run_sessions_folder = run_folder / "sessions"
    run_logs_folder = run_folder / "logs"

    runtime_folder = setta_root / "runtime"
    runtime_sessions_folder = runtime_folder / "sessions"
    runtime_logs_folder = runtime_folder / "logs"
    runtime_mcp_folder = runtime_folder / "mcp"
    runtime_secrets_folder = runtime_folder / "secrets"
    detached_runs_folder = runtime_folder / "detached_runs"

    deployments_folder = setta_root / "deployments"

    for path in (
        code_folder,
        artifacts_folder,
        backup_folder,
        run_sessions_folder,
        run_logs_folder,
        runtime_sessions_folder,
        runtime_logs_folder,
        runtime_mcp_folder,
        runtime_secrets_folder,
        detached_runs_folder,
        deployments_folder,
    ):
        path.mkdir(parents=True, exist_ok=True)

    if seed_fn is not None:
        seed_fn(setta_root)

    with (
        patch.object(C, "SETTA_FILES_FOLDER", setta_root),
        patch.object(C, "CODE_FOLDER", code_folder),
        patch.object(C, "ARTIFACTS_FOLDER", artifacts_folder),
        patch.object(C, "DB_BACKUP_FOLDER", backup_folder),
        patch.object(C, "RUN_FOLDER", run_folder),
        patch.object(C, "RUN_SESSIONS_FOLDER", run_sessions_folder),
        patch.object(C, "RUN_LOGS_FOLDER", run_logs_folder),
        patch.object(C, "RUNTIME_FOLDER", runtime_folder),
        patch.object(C, "RUNTIME_SESSIONS_FOLDER", runtime_sessions_folder),
        patch.object(C, "RUNTIME_LOGS_FOLDER", runtime_logs_folder),
        patch.object(C, "RUNTIME_MCP_FOLDER", runtime_mcp_folder),
        patch.object(C, "RUNTIME_SECRETS_FOLDER", runtime_secrets_folder),
        patch.object(C, "DETACHED_RUNS_FOLDER", detached_runs_folder),
        patch.object(C, "DEPLOYMENTS_FOLDER", deployments_folder),
    ):
        yield setta_root

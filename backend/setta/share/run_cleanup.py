import asyncio
import shutil
import time

from setta.utils.constants import C

DEFAULT_SHARE_RUN_TTL_SECONDS = 60 * 30
DEFAULT_SHARE_RUN_CLEANUP_INTERVAL_SECONDS = 60 * 5


def cleanup_share_run_output(
    project_config_name: str,
    deployment_version: str,
    *,
    ttl_seconds: int = DEFAULT_SHARE_RUN_TTL_SECONDS,
) -> int:
    runs_root = C.SHARE_RUNS_FOLDER / project_config_name / deployment_version
    if not runs_root.exists():
        return 0
    cutoff = time.time() - ttl_seconds
    removed = 0
    for session_dir in runs_root.iterdir():
        if not session_dir.is_dir():
            continue
        for run_dir in session_dir.iterdir():
            if not run_dir.is_dir():
                continue
            if run_dir.stat().st_mtime <= cutoff:
                shutil.rmtree(run_dir)
                removed += 1
        if not any(session_dir.iterdir()):
            session_dir.rmdir()
    return removed


async def run_share_run_cleanup_loop(
    project_config_name: str,
    deployment_version: str,
    *,
    ttl_seconds: int = DEFAULT_SHARE_RUN_TTL_SECONDS,
    interval_seconds: int = DEFAULT_SHARE_RUN_CLEANUP_INTERVAL_SECONDS,
) -> None:
    while True:
        cleanup_share_run_output(
            project_config_name,
            deployment_version,
            ttl_seconds=ttl_seconds,
        )
        await asyncio.sleep(interval_seconds)

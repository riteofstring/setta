from pathlib import Path

from fastapi import HTTPException, status

from setta.utils.utils import normalize_path

_SHARE_ALLOWED_SUBFOLDERS = ("artifacts", "json_sources", "code")


def _resolve_request_path(path: str | Path, deployment_root: Path) -> Path:
    raw_path = Path(path)
    if raw_path.is_absolute():
        return raw_path.resolve()
    normalized = normalize_path(raw_path)
    return (deployment_root / normalized).resolve()


def _share_allowed_roots(deployment_root: Path) -> list[Path]:
    return [
        (deployment_root / folder).resolve() for folder in _SHARE_ALLOWED_SUBFOLDERS
    ]


def ensure_share_deployment_path(
    path: str | Path, deployment_root: Path | None
) -> Path:
    if deployment_root is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Share deployment root is not configured.",
        )
    resolved = _resolve_request_path(path, deployment_root)
    for root in _share_allowed_roots(deployment_root):
        if resolved.is_relative_to(root):
            return resolved
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Share mode file access is restricted to the share deployment "
            "artifacts/json_sources/code paths."
        ),
    )

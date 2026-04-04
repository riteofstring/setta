from pathlib import Path


def resolve_attachment_path(
    artifact_id: str,
    *,
    base_root: Path,
    artifacts_root: Path,
    allow_external: bool,
    require_exists: bool,
) -> Path:
    if not artifact_id or not artifact_id.strip():
        raise ValueError("Attachment id must be a non-empty string.")

    raw_path = Path(artifact_id)
    if raw_path.is_absolute():
        resolved = raw_path.resolve()
    else:
        resolved = (base_root / raw_path).resolve()
    base_root_resolved = base_root.resolve()
    artifacts_root_resolved = artifacts_root.resolve()

    if not allow_external:
        if not raw_path.is_absolute() and not resolved.is_relative_to(
            base_root_resolved
        ):
            raise PermissionError("Attachment path escapes base root.")
        if not resolved.is_relative_to(artifacts_root_resolved):
            raise PermissionError("Attachment path outside artifacts root.")
    if resolved.exists() and resolved.is_dir():
        raise IsADirectoryError(f"Attachment path is a directory: {artifact_id}")
    if require_exists and not resolved.exists():
        raise FileNotFoundError(f"Attachment not found: {artifact_id}")
    return resolved

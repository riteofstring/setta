from pathlib import Path


def parse_share_deployment_version(value: str) -> int | None:
    if not value.startswith("v"):
        return None
    suffix = value[1:]
    if not suffix.isdigit():
        return None
    return int(suffix)


def iter_share_deployment_versions(project_root: Path) -> list[tuple[int, Path]]:
    versions: list[tuple[int, Path]] = []
    if not project_root.exists():
        return versions
    for entry in project_root.iterdir():
        if not entry.is_dir():
            continue
        version_number = parse_share_deployment_version(entry.name)
        if version_number is None:
            continue
        versions.append((version_number, entry))
    return versions

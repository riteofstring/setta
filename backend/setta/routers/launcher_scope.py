from pathlib import Path

from setta.utils.paths import get_setta_paths


def resolve_launcher_setta_home(*, setta_home: str | None) -> Path:
    if setta_home is None:
        return get_setta_paths().setta_home.resolve(strict=False)
    trimmed = setta_home.strip()
    if not trimmed:
        return get_setta_paths().setta_home.resolve(strict=False)
    return Path(trimmed).expanduser().resolve(strict=False)

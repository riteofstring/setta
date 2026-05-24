from pathlib import Path

from setta.utils.paths import resolve_setta_paths


def resolve_setta_home(*, allow_env_override: bool = True) -> Path:
    """Return the Go-resolved per-user Setta directory (<setta_home>)."""

    return resolve_setta_paths(
        allow_env_files_overrides=False,
        allow_env_non_files_overrides=allow_env_override,
        allow_profile_env_overrides=False,
    ).setta_home


def resolve_setta_user_config_path(*, setta_home: Path | None = None) -> Path:
    return (setta_home or resolve_setta_home()) / "config.json"

import os
import sys
from pathlib import Path

from setta.utils.env_vars import SETTA_HOME_ENV


def resolve_setta_home() -> Path:
    """Return the per-user Setta directory (<setta_home>).

    - Unix/macOS: ~/.setta
    - Windows: %APPDATA%\\.setta

    Tests can override via SETTA_HOME.
    """

    raw_override = os.environ.get(SETTA_HOME_ENV)
    if raw_override is not None:
        trimmed = raw_override.strip()
        if trimmed:
            return Path(os.path.expandvars(os.path.expanduser(trimmed))).resolve(
                strict=False
            )

    if sys.platform == "win32":
        raw_appdata = os.environ.get("APPDATA", "").strip()
        if raw_appdata:
            return (Path(raw_appdata) / ".setta").resolve(strict=False)
        return (Path.home() / "AppData" / "Roaming" / ".setta").resolve(strict=False)

    return (Path.home() / ".setta").resolve(strict=False)


def resolve_setta_user_config_path(*, setta_home: Path | None = None) -> Path:
    return (setta_home or resolve_setta_home()) / "config.json"

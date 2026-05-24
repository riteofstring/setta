import os
import platform
import subprocess
from pathlib import Path

import pytest


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _script_platform() -> str:
    system = platform.system()
    machine = platform.machine()
    if system == "Darwin":
        if machine == "arm64":
            return "mac-arm64"
        if machine == "x86_64":
            return "mac-x64"
    if system == "Linux":
        return "linux64"
    pytest.skip(f"unsupported Chrome for Testing resolver platform: {system} {machine}")
    raise AssertionError("unreachable")


def _chrome_bin_for_cache(cache_root: Path, version: str, script_platform: str) -> Path:
    install_dir = cache_root / "Canary" / version / script_platform
    if script_platform.startswith("mac-"):
        return (
            install_dir
            / f"chrome-{script_platform}"
            / "Google Chrome for Testing.app"
            / "Contents"
            / "MacOS"
            / "Google Chrome for Testing"
        )
    return install_dir / "chrome-linux64" / "chrome"


def _write_executable(path: Path, body: str = "#!/usr/bin/env bash\nexit 0\n") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def test_resolver_uses_newest_supported_cached_chrome_before_python_lookup(
    tmp_path: Path,
) -> None:
    repo_root = _repo_root()
    cache_root = tmp_path / "chrome-cache"
    script_platform = _script_platform()
    old_cached_bin = _chrome_bin_for_cache(cache_root, "149.0.9.0", script_platform)
    new_cached_bin = _chrome_bin_for_cache(cache_root, "149.0.10.0", script_platform)
    python_called_marker = tmp_path / "python_called"
    stub_dir = tmp_path / "bin"
    stub_dir.mkdir(parents=True, exist_ok=True)

    _write_executable(old_cached_bin)
    _write_executable(new_cached_bin)
    _write_executable(
        stub_dir / "python3",
        f"""#!/usr/bin/env bash
set -euo pipefail
touch "{python_called_marker}"
echo "python should not be needed for cached Chrome" >&2
exit 17
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env.get('PATH', '')}"
    env["SETTA_CHROME_FOR_TESTING_CACHE"] = str(cache_root)

    result = subprocess.run(
        ["bash", str(repo_root / "scripts" / "resolve-chrome-for-testing-149.sh")],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(new_cached_bin)
    assert not python_called_marker.exists()


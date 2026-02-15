import json

from tests.start.dev_script_wiring_helpers import repo_root


def test_frontend_reset_script_uses_workspace_without_hardcoded_root() -> None:
    root = repo_root()
    package_json = json.loads((root / "frontend" / "package.json").read_text())
    reset_script = package_json["scripts"]["reset"]
    assert "--workspace" in reset_script
    assert "--setta-files-root" not in reset_script


def test_backend_start_uses_shared_setta_path_flag_parser() -> None:
    root = repo_root()
    backend_start = (root / "frontend" / "backendStart.sh").read_text(encoding="utf-8")
    assert "scripts/lib/setta_path_flags.sh" in backend_start
    assert "setta_path_flags_try_parse" in backend_start
    assert "setta_path_flags_seed_from_env" in backend_start


def test_reset_setta_state_uses_shared_setta_path_flag_parser() -> None:
    root = repo_root()
    reset_script = (root / "scripts" / "reset-setta-state.sh").read_text(
        encoding="utf-8"
    )
    assert "scripts/lib/setta_path_flags.sh" in reset_script
    assert "setta_path_flags_try_parse" in reset_script

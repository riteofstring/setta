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


def test_playwright_runner_gates_plugin_seeding_with_target_selection() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert 'SHOULD_SEED_PLUGIN_FIXTURES="${SHOULD_PREPARE_PLUGIN_FIXTURES}"' in script
    assert 'SHOULD_SEED_PLUGIN_ARTIFACTS="${SHOULD_PREPARE_PLUGIN_FIXTURES}"' in script
    assert 'if [[ "${SHOULD_SEED_PLUGIN_FIXTURES}" == "1" ]]; then' in script
    assert 'if [[ "${SHOULD_SEED_PLUGIN_ARTIFACTS}" == "1" ]]; then' in script

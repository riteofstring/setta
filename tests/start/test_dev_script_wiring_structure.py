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


def test_backend_start_uses_explicit_python_module_boundaries() -> None:
    root = repo_root()
    backend_start = (root / "frontend" / "backendStart.sh").read_text(encoding="utf-8")
    assert 'SETTA_CMD=("${SETTA_PYTHON_BIN}" "-m" "setta")' in backend_start
    assert 'SETTA_CMD=("${SETTA_PYTHON_BIN}" "-m" "setta.dev_start")' in backend_start
    assert 'SETTA_BIN="${SETTA_BIN:-setta}"' not in backend_start


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


def test_backend_test_runner_uses_temp_cache_root_by_default() -> None:
    root = repo_root()
    script = (root / "scripts" / "run_backend_tests.sh").read_text(
        encoding="utf-8"
    )
    assert "resolve_test_cache_root()" in script
    assert "SETTA_TEST_CACHE_DIR" in script
    assert "setta-test-cache" in script
    assert 'PLUGIN_FIXTURE_CACHE_DIR="${ROOT_DIR}/setta_files/.cache"' not in script


def test_playwright_runner_uses_temp_cache_root_by_default() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "resolve_test_cache_root()" in script
    assert "SETTA_TEST_CACHE_DIR" in script
    assert "setta-test-cache" in script
    assert (
        'PLUGIN_FIXTURE_CACHE_DIR="${SETTA_TEST_CACHE_ROOT}/plugin-fixtures"'
        in script
    )
    assert (
        "SETTA_E2E_PLUGIN_ARTIFACT_DIR:-${SETTA_TEST_CACHE_ROOT}/playwright-plugin-artifacts"
        in script
    )
    assert 'PLUGIN_FIXTURE_CACHE_DIR="${ROOT_DIR}/setta_files/.cache"' not in script


def test_playwright_runner_writes_non_empty_record_manifest_for_seeded_wheels() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "record_lines = []" in script
    assert 'record_lines.append(f"{dist_info_name}/RECORD,,")' in script
    assert (
        'zipf.writestr(f"{dist_info_name}/RECORD", "\\n".join(record_lines) + "\\n")'
        in script
    )


def test_playwright_runner_validates_seeded_fixture_completeness_before_skip() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "seeded_plugin_fixture_is_complete()" in script
    assert (
        'if ! seeded_plugin_fixture_is_complete "${fixture_root}" "${seeded_fixture_root}"; then'
        in script
    )


def test_playwright_runner_uses_seed_fixture_stamp_short_circuit() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "compute_workspace_seed_fixture_change_stamp()" in script
    assert 'seed_stamp_cache_file="${seed_cache_file}.stamp"' in script
    assert 'cached_stamp="$(<"${seed_stamp_cache_file}")"' in script
    assert 'if [[ -n "${cached_signature}" && "${cached_stamp}" == "${current_stamp}" ]]; then' in script


def test_playwright_runner_uses_single_workspace_seed_fixture_list() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "readonly WORKSPACE_SEED_FIXTURES=(" in script
    assert "compute_named_plugin_fixture_signature" in script
    assert "compute_named_plugin_fixture_change_stamp" in script


def test_plugin_fixture_cache_exports_named_fixture_signature_helpers() -> None:
    root = repo_root()
    cache_script = (root / "scripts" / "plugin-fixtures" / "cache.sh").read_text(
        encoding="utf-8"
    )
    assert "compute_named_plugin_fixture_signature()" in cache_script
    assert "compute_named_plugin_fixture_change_stamp()" in cache_script


def test_playwright_runner_uses_local_artifact_stamp_short_circuit() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "compute_local_plugin_artifact_change_stamp()" in script
    assert 'artifact_stamp_cache_file="${PLUGIN_ARTIFACT_CACHE_FILE}.stamp"' in script
    assert 'cached_stamp="$(<"${artifact_stamp_cache_file}")"' in script
    assert 'if [[ -n "${cached_signature}" && "${cached_stamp}" == "${current_stamp}" ]]; then' in script


def test_playwright_runner_reseeds_plugin_fixtures_for_reused_workspaces() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    existing_workspace_line = script.find("Workspace already seeded")
    fixture_seed_guard_line = script.find(
        'if [[ "${SHOULD_SEED_PLUGIN_FIXTURES}" == "1" ]]; then'
    )
    assert existing_workspace_line != -1
    assert fixture_seed_guard_line != -1
    assert existing_workspace_line < fixture_seed_guard_line


def test_playwright_runner_overwrites_seeded_project_state_with_go_runtime_shape() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "_seed_minimal_setta_files(setta_root)" in script
    assert "./scripts/go.sh run ./cmd/setta-seed-playwright-workspace" in script
    assert '--setta-files-root "${SETTA_WORKSPACE_ROOT}/setta_files"' in script


def test_playwright_runner_reads_bootstrap_token_from_backend_log() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert '"${PYTHON_BIN}" - "${LOG_DIR}/backend.log"' in script
    assert 'token_pattern = re.compile(r"^\\s*Token:\\s+(\\S+)\\s*$")' in script
    assert "Timed out waiting for bootstrap token in" in script


def test_playwright_runner_builds_current_go_cli_binary_by_default() -> None:
    root = repo_root()
    script = (root / "scripts" / "run-playwright-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "prepare_current_setta_cli()" in script
    assert "./scripts/go.sh build -o" in script
    assert "./cmd/setta" in script
    assert "./cmd/setta-server" in script
    assert 'export SETTA_GO_CLI_BIN="${current_setta_go_bin}"' in script
    assert 'export SETTA_SERVER_BIN="${current_setta_server_bin}"' in script


def test_plugin_fixture_link_script_defaults_to_no_rescan_and_unlink_wrapper_removed() -> None:
    root = repo_root()
    link_script = (root / "scripts" / "plugin-fixtures" / "link.sh").read_text(
        encoding="utf-8"
    )
    assert "rescan_after_link=0" in link_script
    assert not (root / "scripts" / "plugin-fixtures" / "unlink.sh").exists()

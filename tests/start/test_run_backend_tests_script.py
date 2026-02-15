import os
import subprocess
import sys
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _build_backend_test_runner_sandbox(tmp_path: Path) -> tuple[Path, Path]:
    root = repo_root()
    sandbox_root = tmp_path / "backend_test_runner_sandbox"
    scripts_dir = sandbox_root / "scripts"
    plugin_fixture_scripts = scripts_dir / "plugin-fixtures"
    fixture_root = sandbox_root / "tests" / "fixtures" / "plugins" / "fixture-a"
    fixture_frontend_src = fixture_root / "frontend" / "src"
    fixture_frontend_dist = fixture_root / "frontend" / "dist"
    non_plugin_tests_dir = sandbox_root / "tests" / "start"
    plugin_tests_dir = sandbox_root / "tests" / "plugins"
    bin_dir = sandbox_root / "bin"

    plugin_fixture_scripts.mkdir(parents=True, exist_ok=True)
    fixture_frontend_src.mkdir(parents=True, exist_ok=True)
    fixture_frontend_dist.mkdir(parents=True, exist_ok=True)
    non_plugin_tests_dir.mkdir(parents=True, exist_ok=True)
    plugin_tests_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    (sandbox_root / "frontend").mkdir(parents=True, exist_ok=True)

    run_backend_tests_src = root / "scripts" / "run_backend_tests.sh"
    run_backend_tests_dst = scripts_dir / "run_backend_tests.sh"
    run_backend_tests_dst.write_text(
        run_backend_tests_src.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    run_backend_tests_dst.chmod(0o755)
    cache_helper_src = root / "scripts" / "plugin-fixtures" / "cache.sh"
    cache_helper_dst = plugin_fixture_scripts / "cache.sh"
    cache_helper_dst.write_text(
        cache_helper_src.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    cache_helper_dst.chmod(0o755)

    fixture_manifest = fixture_root / "setta.plugin.json"
    fixture_manifest.write_text(
        (
            '{"id":"fixture-a","name":"Fixture A","frontend":'
            '{"entrypoint":"frontend/dist/index.js","style":"frontend/dist/index.css"}}'
        ),
        encoding="utf-8",
    )
    (fixture_frontend_src / "index.js").write_text(
        "export const fixture = true;\n",
        encoding="utf-8",
    )
    (fixture_frontend_dist / "index.js").write_text(
        "export const built = true;\n",
        encoding="utf-8",
    )
    (fixture_frontend_dist / "index.css").write_text(
        ".fixture { color: red; }\n",
        encoding="utf-8",
    )
    (non_plugin_tests_dir / "test_example.py").write_text(
        "def test_example() -> None:\n    assert True\n",
        encoding="utf-8",
    )
    (plugin_tests_dir / "test_plugin_example.py").write_text(
        "def test_plugin_example() -> None:\n    assert True\n",
        encoding="utf-8",
    )

    build_count_file = sandbox_root / "build_count.txt"
    build_script = plugin_fixture_scripts / "build.sh"
    build_script.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
count_file="build_count.txt"
fixture_dist="tests/fixtures/plugins/fixture-a/frontend/dist"
count=0
if [[ -f "${count_file}" ]]; then
  count="$(<"${count_file}")"
fi
echo "$((count + 1))" > "${count_file}"
mkdir -p "${fixture_dist}"
printf '%s\n' 'export const built = true;' > "${fixture_dist}/index.js"
printf '%s\n' '.fixture { color: red; }' > "${fixture_dist}/index.css"
""",
        encoding="utf-8",
    )
    build_script.chmod(0o755)
    (sandbox_root / "frontend" / "package.json").write_text(
        '{"name":"fixture-frontend","version":"1.0.0"}\n',
        encoding="utf-8",
    )
    (sandbox_root / "frontend" / "pnpm-lock.yaml").write_text(
        "lockfileVersion: '9.0'\n",
        encoding="utf-8",
    )
    (scripts_dir / "node_version.txt").write_text("20.11.0\n", encoding="utf-8")

    activate_script = sandbox_root / "activate.sh"
    activate_script.write_text(
        "#!/usr/bin/env bash\nexport BACKEND_TEST_RUNNER_SANDBOX=1\n",
        encoding="utf-8",
    )
    activate_script.chmod(0o755)

    pytest_capture_file = sandbox_root / "pytest_args.txt"
    pytest_stub = bin_dir / "pytest"
    pytest_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{pytest_capture_file}"
""",
        encoding="utf-8",
    )
    pytest_stub.chmod(0o755)

    return sandbox_root, build_count_file


def _run_backend_test_runner(
    sandbox_root: Path,
    *,
    extra_env: dict[str, str] | None = None,
    pytest_args: list[str] | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    if extra_env:
        env.update(extra_env)
    args = pytest_args if pytest_args is not None else ["-k", "plugins"]
    return subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run_backend_tests.sh"),
            *args,
        ],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def _compute_plugin_fixture_signature(sandbox_root: Path) -> str:
    command = (
        f". '{sandbox_root / 'scripts' / 'plugin-fixtures' / 'cache.sh'}' && "
        f"compute_plugin_fixture_signature '{sandbox_root}'"
    )
    result = subprocess.run(
        ["bash", "-lc", command],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    return result.stdout.strip()


def _compute_plugin_fixture_change_stamp(sandbox_root: Path) -> str:
    command = (
        f". '{sandbox_root / 'scripts' / 'plugin-fixtures' / 'cache.sh'}' && "
        f"compute_plugin_fixture_change_stamp '{sandbox_root}'"
    )
    result = subprocess.run(
        ["bash", "-lc", command],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    return result.stdout.strip()


def _run_cache_helper_command(
    sandbox_root: Path,
    command: str,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", "-lc", command],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )


def test_plugin_fixture_signature_is_content_based_not_path_based(
    tmp_path: Path,
) -> None:
    # Fixture signatures should match across different root paths when file contents are identical.
    first_sandbox, _ = _build_backend_test_runner_sandbox(tmp_path / "first")
    second_sandbox, _ = _build_backend_test_runner_sandbox(tmp_path / "second")

    first_signature = _compute_plugin_fixture_signature(first_sandbox)
    second_signature = _compute_plugin_fixture_signature(second_sandbox)

    assert first_signature == second_signature


def test_plugin_fixture_signature_includes_frontend_toolchain_inputs(
    tmp_path: Path,
) -> None:
    # Frontend toolchain file changes should invalidate fixture signatures.
    sandbox_root, _ = _build_backend_test_runner_sandbox(tmp_path)
    first_signature = _compute_plugin_fixture_signature(sandbox_root)

    package_json = sandbox_root / "frontend" / "package.json"
    package_json.write_text(
        '{"name":"fixture-frontend","version":"2.0.0"}\n',
        encoding="utf-8",
    )
    second_signature = _compute_plugin_fixture_signature(sandbox_root)

    assert first_signature != second_signature


def test_plugin_fixture_change_stamp_uses_subsecond_mtime_precision(
    tmp_path: Path,
) -> None:
    # Same-size edits with only nanosecond mtime changes should invalidate the change stamp.
    sandbox_root, _ = _build_backend_test_runner_sandbox(tmp_path)
    fixture_manifest = (
        sandbox_root
        / "tests"
        / "fixtures"
        / "plugins"
        / "fixture-a"
        / "setta.plugin.json"
    )
    first_stamp = _compute_plugin_fixture_change_stamp(sandbox_root)
    original_payload = fixture_manifest.read_text(encoding="utf-8")
    updated_payload = original_payload.replace('"name":"Fixture A"', '"name":"Fixture B"')
    assert len(updated_payload) == len(original_payload)
    fixture_manifest.write_text(updated_payload, encoding="utf-8")
    stat_result = fixture_manifest.stat()
    os.utime(
        fixture_manifest,
        ns=(stat_result.st_atime_ns, stat_result.st_mtime_ns + 1),
    )
    second_stamp = _compute_plugin_fixture_change_stamp(sandbox_root)

    assert first_stamp != second_stamp


def test_run_backend_tests_rebuilds_fixtures_only_when_signature_changes(
    tmp_path: Path,
) -> None:
    # The backend test runner should rebuild plugin fixtures once per input signature and still run pytest.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    first_run = _run_backend_test_runner(sandbox_root)
    assert first_run.returncode == 0, f"{first_run.stdout}\n{first_run.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"
    cache_file = (
        sandbox_root
        / "setta_files"
        / ".cache"
        / "backend-test-plugin-fixtures-all.signature"
    )
    assert cache_file.exists()
    assert (
        (sandbox_root / "pytest_args.txt")
        .read_text(encoding="utf-8")
        .strip()
        .endswith("-k plugins")
    )

    second_run = _run_backend_test_runner(sandbox_root)
    assert second_run.returncode == 0, f"{second_run.stdout}\n{second_run.stderr}"
    assert "plugin fixtures unchanged; skipping rebuild" in second_run.stdout
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"

    fixture_manifest = (
        sandbox_root
        / "tests"
        / "fixtures"
        / "plugins"
        / "fixture-a"
        / "setta.plugin.json"
    )
    fixture_manifest.write_text(
        '{"id":"fixture-a","name":"Fixture A","version":"0.2.0"}',
        encoding="utf-8",
    )

    third_run = _run_backend_test_runner(sandbox_root)
    assert third_run.returncode == 0, f"{third_run.stdout}\n{third_run.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "2"


def test_run_backend_tests_force_flag_rebuilds_fixtures(tmp_path: Path) -> None:
    # The explicit force flag should trigger fixture rebuild even when signatures are unchanged.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    first_run = _run_backend_test_runner(sandbox_root)
    assert first_run.returncode == 0, f"{first_run.stdout}\n{first_run.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"

    forced_run = _run_backend_test_runner(
        sandbox_root,
        extra_env={"SETTA_FORCE_PLUGIN_FIXTURE_BUILD": "1"},
    )
    assert forced_run.returncode == 0, f"{forced_run.stdout}\n{forced_run.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "2"


def test_force_fixture_build_computes_signature_after_build(
    tmp_path: Path,
) -> None:
    # Force rebuild should run build first and only then evaluate final signature writes.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)
    cache_file = (
        sandbox_root
        / "setta_files"
        / ".cache"
        / "backend-test-plugin-fixtures-force.signature"
    )
    stamp_cache_file = cache_file.with_suffix(cache_file.suffix + ".stamp")
    command = f"""
set -euo pipefail
. '{sandbox_root / "scripts" / "plugin-fixtures" / "cache.sh"}'
compute_plugin_fixture_signature() {{
  if [[ ! -f "{build_count_file}" ]]; then
    echo "signature evaluated before build completed" >&2
    return 98
  fi
  printf '%s\\n' 'force-signature'
}}
compute_plugin_fixture_change_stamp() {{
  printf '%s\\n' 'force-stamp'
}}
SETTA_FORCE_PLUGIN_FIXTURE_BUILD=1
build_plugin_fixtures_if_needed "{sandbox_root}" "{cache_file}" "test"
"""
    result = _run_cache_helper_command(sandbox_root, command)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"
    assert cache_file.read_text(encoding="utf-8").strip() == "force-signature"
    assert stamp_cache_file.read_text(encoding="utf-8").strip() == "force-stamp"


def test_fixture_stamp_short_circuit_skips_full_signature_recompute(
    tmp_path: Path,
) -> None:
    # Unchanged change-stamp runs should reuse cached signature without recomputing file checksums.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)
    cache_file = (
        sandbox_root
        / "setta_files"
        / ".cache"
        / "backend-test-plugin-fixtures-stamp.signature"
    )
    signature_calls_file = sandbox_root / "signature_calls.txt"
    command = f"""
set -euo pipefail
. '{sandbox_root / "scripts" / "plugin-fixtures" / "cache.sh"}'
compute_plugin_fixture_signature() {{
  local count=0
  if [[ -f "{signature_calls_file}" ]]; then
    count="$(<"{signature_calls_file}")"
  fi
  echo "$((count + 1))" > "{signature_calls_file}"
  printf '%s\\n' 'cached-signature'
}}
compute_plugin_fixture_change_stamp() {{
  printf '%s\\n' 'stable-stamp'
}}
build_plugin_fixtures_if_needed "{sandbox_root}" "{cache_file}" "test"
build_plugin_fixtures_if_needed "{sandbox_root}" "{cache_file}" "test"
"""
    result = _run_cache_helper_command(sandbox_root, command)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"
    assert signature_calls_file.read_text(encoding="utf-8").strip() == "1"
    assert "plugin fixtures unchanged; skipping rebuild" in result.stdout


def test_fixture_stamp_backfills_when_signature_cache_exists_without_stamp(
    tmp_path: Path,
) -> None:
    # Unchanged runs should backfill missing stamp caches to restore fast-path behavior.
    sandbox_root, _build_count_file = _build_backend_test_runner_sandbox(tmp_path)
    cache_file = (
        sandbox_root
        / "setta_files"
        / ".cache"
        / "backend-test-plugin-fixtures-stamp-backfill.signature"
    )
    stamp_cache_file = cache_file.with_suffix(cache_file.suffix + ".stamp")
    signature_calls_file = sandbox_root / "signature_calls_backfill.txt"
    command = f"""
set -euo pipefail
. '{sandbox_root / "scripts" / "plugin-fixtures" / "cache.sh"}'
mkdir -p "$(dirname '{cache_file}')"
printf '%s' 'cached-signature' > '{cache_file}'
rm -f '{stamp_cache_file}'
compute_plugin_fixture_signature() {{
  local count=0
  if [[ -f "{signature_calls_file}" ]]; then
    count="$(<"{signature_calls_file}")"
  fi
  echo "$((count + 1))" > "{signature_calls_file}"
  printf '%s\\n' 'cached-signature'
}}
compute_plugin_fixture_change_stamp() {{
  printf '%s\\n' 'stable-stamp'
}}
build_plugin_fixtures_if_needed "{sandbox_root}" "{cache_file}" "test"
build_plugin_fixtures_if_needed "{sandbox_root}" "{cache_file}" "test"
"""
    result = _run_cache_helper_command(sandbox_root, command)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert signature_calls_file.read_text(encoding="utf-8").strip() == "1"
    assert stamp_cache_file.read_text(encoding="utf-8").strip() == "stable-stamp"
    assert "plugin fixtures unchanged; skipping rebuild" in result.stdout


def test_run_backend_tests_rebuilds_when_fixture_outputs_are_missing(
    tmp_path: Path,
) -> None:
    # Missing built fixture outputs should trigger a rebuild even when signatures are unchanged.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    first_run = _run_backend_test_runner(sandbox_root)
    assert first_run.returncode == 0, f"{first_run.stdout}\n{first_run.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"

    built_output = (
        sandbox_root
        / "tests"
        / "fixtures"
        / "plugins"
        / "fixture-a"
        / "frontend"
        / "dist"
        / "index.js"
    )
    built_output.unlink()

    second_run = _run_backend_test_runner(sandbox_root)
    assert second_run.returncode == 0, f"{second_run.stdout}\n{second_run.stderr}"
    assert "plugin fixture outputs missing; rebuilding" in second_run.stdout
    assert build_count_file.read_text(encoding="utf-8").strip() == "2"


def test_run_backend_tests_rebuilds_when_fixture_style_output_is_missing(
    tmp_path: Path,
) -> None:
    # Missing declared style outputs should trigger a rebuild even with unchanged signatures.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    first_run = _run_backend_test_runner(sandbox_root)
    assert first_run.returncode == 0, f"{first_run.stdout}\n{first_run.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"

    built_style_output = (
        sandbox_root
        / "tests"
        / "fixtures"
        / "plugins"
        / "fixture-a"
        / "frontend"
        / "dist"
        / "index.css"
    )
    built_style_output.unlink()

    second_run = _run_backend_test_runner(sandbox_root)
    assert second_run.returncode == 0, f"{second_run.stdout}\n{second_run.stderr}"
    assert "plugin fixture outputs missing; rebuilding" in second_run.stdout
    assert build_count_file.read_text(encoding="utf-8").strip() == "2"


def test_run_backend_tests_honors_python_bin_override_for_cache_checks(
    tmp_path: Path,
) -> None:
    # Cache checks should use PYTHON_BIN when provided, even if `python` is unavailable.
    sandbox_root, _build_count_file = _build_backend_test_runner_sandbox(tmp_path)
    broken_python = sandbox_root / "bin" / "python"
    broken_python.write_text(
        "#!/usr/bin/env bash\nexit 127\n",
        encoding="utf-8",
    )
    broken_python.chmod(0o755)

    result = _run_backend_test_runner(
        sandbox_root,
        extra_env={"PYTHON_BIN": sys.executable},
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"


def test_run_backend_tests_skips_fixture_build_for_non_plugin_targets(
    tmp_path: Path,
) -> None:
    # Non-plugin-targeted test runs should skip plugin fixture build overhead by default.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    result = _run_backend_test_runner(
        sandbox_root,
        pytest_args=["tests/start/test_run_backend_tests_script.py"],
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "Skipping plugin fixture build for selected pytest targets." in result.stdout
    assert not build_count_file.exists()
    assert not (
        sandbox_root / "setta_files" / ".cache" / "backend-test-plugin-fixtures-all.signature"
    ).exists()


def test_run_backend_tests_skips_fixture_build_for_non_plugin_directory_targets(
    tmp_path: Path,
) -> None:
    # Directory targets that do not include plugin tests should skip fixture prep.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    result = _run_backend_test_runner(
        sandbox_root,
        pytest_args=["tests/start"],
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "Skipping plugin fixture build for selected pytest targets." in result.stdout
    assert not build_count_file.exists()


def test_run_backend_tests_builds_fixtures_for_plugin_directory_targets(
    tmp_path: Path,
) -> None:
    # Plugin-directory targets should still trigger fixture prep.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    result = _run_backend_test_runner(
        sandbox_root,
        pytest_args=["tests/plugins"],
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"
    assert "Skipping plugin fixture build for selected pytest targets." not in result.stdout


def test_run_backend_tests_skips_fixtures_for_selector_only_non_plugin_runs(
    tmp_path: Path,
) -> None:
    # Selector-only runs without plugin hints should skip fixture prep.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    result = _run_backend_test_runner(
        sandbox_root,
        pytest_args=["-k", "start"],
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "Skipping plugin fixture build for selected pytest targets." in result.stdout
    assert not build_count_file.exists()


def test_run_backend_tests_builds_fixtures_for_selector_only_runs_when_outputs_missing(
    tmp_path: Path,
) -> None:
    # Selector-only runs should rebuild fixtures when expected outputs are missing.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)
    built_output = (
        sandbox_root
        / "tests"
        / "fixtures"
        / "plugins"
        / "fixture-a"
        / "frontend"
        / "dist"
        / "index.js"
    )
    built_output.unlink()

    result = _run_backend_test_runner(
        sandbox_root,
        pytest_args=["-k", "start"],
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"


def test_run_backend_tests_can_force_fixture_build_for_non_plugin_targets(
    tmp_path: Path,
) -> None:
    # Explicit opt-in should force fixture build even for non-plugin-targeted runs.
    sandbox_root, build_count_file = _build_backend_test_runner_sandbox(tmp_path)

    result = _run_backend_test_runner(
        sandbox_root,
        extra_env={"SETTA_BUILD_PLUGIN_FIXTURES": "1"},
        pytest_args=["tests/start/test_run_backend_tests_script.py"],
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert build_count_file.read_text(encoding="utf-8").strip() == "1"

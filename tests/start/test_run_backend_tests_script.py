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
    bin_dir = sandbox_root / "bin"

    plugin_fixture_scripts.mkdir(parents=True, exist_ok=True)
    fixture_frontend_src.mkdir(parents=True, exist_ok=True)
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
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "run_backend_tests.sh"),
            "-k",
            "plugins",
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

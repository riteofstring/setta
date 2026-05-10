import os
import subprocess
import sys
import zipfile
from pathlib import Path

from tests.start.packaged_distribution_helpers import (
    _build_wheel,
    _read_single_wheel_member,
    _write_minimal_distribution_project,
)


def test_wheel_build_requires_packaged_go_binaries(tmp_path: Path) -> None:
    # Wheel builds must fail fast instead of silently shipping a broken router.
    project_root = _write_minimal_distribution_project(
        tmp_path,
        include_go_binaries=False,
    )
    outdir = tmp_path / "dist"

    result = _build_wheel(project_root, outdir)

    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode != 0
    assert "Wheel builds require packaged Go binaries" in combined_output
    assert "./scripts/build_packaged_go_binaries.sh" in combined_output


def test_wheel_build_with_packaged_go_binaries_uses_platform_tags(
    tmp_path: Path,
) -> None:
    # Packaged Go binaries make the wheel platform-specific, never universal.
    project_root = _write_minimal_distribution_project(
        tmp_path,
        include_go_binaries=True,
    )
    outdir = tmp_path / "dist"

    result = _build_wheel(project_root, outdir)

    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta-*.whl"))
    assert len(wheel_paths) == 1
    wheel_path = wheel_paths[0]
    assert not wheel_path.name.endswith("-any.whl")

    wheel_metadata = _read_single_wheel_member(wheel_path, ".dist-info/WHEEL")

    assert "Root-Is-Purelib: false" in wheel_metadata
    assert "Tag: py3-none-any" not in wheel_metadata


def test_wheel_build_with_packaged_go_binaries_includes_only_packaged_boundary(
    tmp_path: Path,
) -> None:
    # The wheel should ship the thin packaged entrypoint plus explicit runtime
    # assets, not the full source-tree backend/runtime payload.
    project_root = _write_minimal_distribution_project(
        tmp_path,
        include_go_binaries=True,
    )
    outdir = tmp_path / "dist"

    result = _build_wheel(project_root, outdir)

    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta-*.whl"))
    assert len(wheel_paths) == 1

    with zipfile.ZipFile(wheel_paths[0]) as wheel_archive:
        names = set(wheel_archive.namelist())

    expected_names = {
        "setta/__init__.py",
        "setta/__main__.py",
        "setta/entrypoint.py",
        "setta/local_core_client.py",
        "setta/runtime_compat.py",
        "setta/sdk_contracts/constants.py",
        "setta/plugin_runtime/__init__.py",
        "setta/plugin_runtime/app_subsystem.py",
        "setta/plugin_runtime/watch_code.py",
        "setta/types/generated/go_shared_constants.py",
        "setta/agentic/external_adapters/sidecars/claude_sdk_runner.py",
        "setta/agentic/external_adapters/sidecars/package.json",
        "setta/agentic/external_adapters/sidecars/node_modules/marker.txt",
        "setta/static/frontend/index.html",
        "setta/vendor/node/darwin-arm64/node",
        "setta/plugins/schemas/setta.plugin.schema.json",
        "setta/launcher_artifacts/assets/Setta.icns",
        "setta/go_bin/setta",
        "setta/go_bin/setta-server",
    }
    assert expected_names.issubset(names)

    unexpected_names = {
        "setta/dev_start.py",
        "setta/server.py",
        "setta/start.py",
        "setta/launcher_setup.py",
        "setta/agentic/external_adapters/claude_sdk.py",
        "setta/agentic/external_adapters/sidecars/__pycache__/ignored.pyc",
    }
    assert names.isdisjoint(unexpected_names)


def test_wheel_metadata_limits_default_dependencies_to_packaged_boundary(
    tmp_path: Path,
) -> None:
    # The default wheel install should only depend on the Python tools and
    # sidecar SDK that the packaged runtime still uses directly. Python LSP now
    # enters through the defaults/plugin path rather than core metadata.
    project_root = _write_minimal_distribution_project(
        tmp_path,
        include_go_binaries=True,
    )
    outdir = tmp_path / "dist"

    result = _build_wheel(project_root, outdir)

    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta-*.whl"))
    assert len(wheel_paths) == 1

    metadata = _read_single_wheel_member(wheel_paths[0], ".dist-info/METADATA")

    requires_lines = {
        line for line in metadata.splitlines() if line.startswith("Requires-Dist:")
    }
    default_requires = {line for line in requires_lines if "extra ==" not in line}
    defaults_requires = {
        line for line in requires_lines if "extra == 'defaults'" in line
    }
    source_requires = {line for line in requires_lines if "extra == 'source'" in line}
    dev_requires = {line for line in requires_lines if "extra == 'dev'" in line}

    assert default_requires == {
        "Requires-Dist: claude-agent-sdk==0.1.52",
        "Requires-Dist: ruff==0.12.12",
    }

    assert "Provides-Extra: defaults" in metadata
    assert defaults_requires == {
        "Requires-Dist: setta-basedpyright==0.1.0; extra == 'defaults'",
    }

    assert "Requires-Dist: click==8.2.1" not in default_requires
    assert "Requires-Dist: fastapi==0.115.12" not in default_requires
    assert "Requires-Dist: uvicorn==0.34.3" not in default_requires
    assert "Requires-Dist: mcp==1.25.0" not in default_requires
    assert "Requires-Dist: litellm==1.80.15" not in default_requires

    assert "Provides-Extra: source" in metadata
    assert "Provides-Extra: dev" in metadata
    assert source_requires == {
        "Requires-Dist: requests==2.32.4; extra == 'source'",
        "Requires-Dist: websockets==15.0.1; extra == 'source'",
        "Requires-Dist: psutil==7.0.0; extra == 'source'",
        "Requires-Dist: mcp==1.25.0; extra == 'source'",
        "Requires-Dist: pydantic==2.11.5; extra == 'source'",
        "Requires-Dist: watchfiles==0.24.0; extra == 'source'",
    }
    assert dev_requires == {
        "Requires-Dist: build==1.0.3; extra == 'dev'",
        "Requires-Dist: coverage==7.10.6; extra == 'dev'",
        "Requires-Dist: datamodel-code-generator==0.56.0; extra == 'dev'",
        "Requires-Dist: pip-audit==2.9.0; extra == 'dev'",
        "Requires-Dist: pyyaml==6.0.2; extra == 'dev'",
        "Requires-Dist: pytest==8.3.3; extra == 'dev'",
        "Requires-Dist: pytest-asyncio==0.23.8; extra == 'dev'",
        "Requires-Dist: python-dotenv==1.1.0; extra == 'dev'",
        "Requires-Dist: twine==6.1.0; extra == 'dev'",
        "Requires-Dist: ty==0.0.29; extra == 'dev'",
        "Requires-Dist: vulture==2.14; extra == 'dev'",
        "Requires-Dist: watchdog==6.0.0; extra == 'dev'",
    }


def test_wheel_installs_and_runs_real_packaged_entrypoint_modules(
    tmp_path: Path,
) -> None:
    # The real packaged Python modules should stay import-safe when installed
    # without the larger source-tree backend/runtime files that dev workflows
    # still carry.
    project_root = _write_minimal_distribution_project(
        tmp_path,
        include_go_binaries=True,
    )
    outdir = tmp_path / "dist"

    result = _build_wheel(project_root, outdir)

    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta-*.whl"))
    assert len(wheel_paths) == 1
    wheel_path = wheel_paths[0]

    venv_dir = tmp_path / "venv"
    venv_result = subprocess.run(
        [sys.executable, "-m", "venv", str(venv_dir)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert venv_result.returncode == 0, (
        f"{venv_result.stdout}\n{venv_result.stderr}"
    ).strip()

    venv_python = venv_dir / "bin" / "python"
    install_result = subprocess.run(
        [str(venv_python), "-m", "pip", "install", "--no-deps", str(wheel_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert install_result.returncode == 0, (
        f"{install_result.stdout}\n{install_result.stderr}"
    ).strip()

    args_capture = tmp_path / "go-args.txt"
    go_stub = tmp_path / "setta-go"
    go_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{args_capture}"
printf 'setta version from go\\n'
""",
        encoding="utf-8",
    )
    go_stub.chmod(0o755)

    env = os.environ.copy()
    env["SETTA_GO_CLI_BIN"] = str(go_stub)
    run_result = subprocess.run(
        [str(venv_python), "-m", "setta", "version"],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )

    assert run_result.returncode == 0, (
        f"{run_result.stdout}\n{run_result.stderr}"
    ).strip()
    assert "setta version from go" in run_result.stdout
    assert args_capture.read_text(encoding="utf-8").strip() == "version"

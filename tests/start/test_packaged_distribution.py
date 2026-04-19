import os
import shutil
import subprocess
import sys
import tomllib
import zipfile
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_minimal_distribution_project(
    tmp_path: Path,
    *,
    include_go_binaries: bool,
    use_repo_packaged_entrypoint_modules: bool = False,
) -> Path:
    project_root = tmp_path / "packaged-project"
    package_root = project_root / "backend" / "setta"
    package_root.mkdir(parents=True, exist_ok=True)

    (project_root / "pyproject.toml").write_text(
        (_repo_root() / "pyproject.toml").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (project_root / "hatch_build.py").write_text(
        (_repo_root() / "hatch_build.py").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (project_root / "README.md").write_text("# temp package\n", encoding="utf-8")
    (project_root / "LICENSE").write_text("Apache-2.0\n", encoding="utf-8")
    if use_repo_packaged_entrypoint_modules:
        for relative_path in ("__init__.py", "__main__.py", "entrypoint.py"):
            (package_root / relative_path).write_text(
                (_repo_root() / "backend" / "setta" / relative_path).read_text(
                    encoding="utf-8"
                ),
                encoding="utf-8",
            )
    else:
        (package_root / "__init__.py").write_text(
            '__version__ = "0.0.0"\n', encoding="utf-8"
        )
        (package_root / "__main__.py").write_text(
            "from setta.entrypoint import main\n",
            encoding="utf-8",
        )
        (package_root / "entrypoint.py").write_text(
            "def main() -> None:\n    return None\n",
            encoding="utf-8",
        )
    (package_root / "dev_start.py").write_text(
        "def main() -> int:\n    return 0\n",
        encoding="utf-8",
    )
    (package_root / "server.py").write_text("app = object()\n", encoding="utf-8")
    (package_root / "start.py").write_text("def cli() -> None:\n    return None\n", encoding="utf-8")
    (package_root / "launcher_setup.py").write_text(
        "def setup() -> None:\n    return None\n",
        encoding="utf-8",
    )
    (package_root / "agentic" / "external_adapters").mkdir(parents=True, exist_ok=True)
    (package_root / "agentic" / "external_adapters" / "claude_sdk.py").write_text(
        "def run() -> None:\n    return None\n",
        encoding="utf-8",
    )
    sidecars_root = package_root / "agentic" / "external_adapters" / "sidecars"
    sidecars_root.mkdir(parents=True, exist_ok=True)
    (sidecars_root / "claude_sdk_runner.py").write_text(
        "print('claude sidecar')\n",
        encoding="utf-8",
    )
    (sidecars_root / "package.json").write_text(
        '{"name":"setta-sidecars"}\n',
        encoding="utf-8",
    )
    sidecar_modules = sidecars_root / "node_modules"
    sidecar_modules.mkdir(parents=True, exist_ok=True)
    (sidecar_modules / "marker.txt").write_text("node modules\n", encoding="utf-8")
    sidecar_cache = sidecars_root / "__pycache__"
    sidecar_cache.mkdir(parents=True, exist_ok=True)
    (sidecar_cache / "ignored.pyc").write_text("cache\n", encoding="utf-8")

    frontend_root = package_root / "static" / "frontend"
    frontend_root.mkdir(parents=True, exist_ok=True)
    (frontend_root / "index.html").write_text("<html>dist</html>\n", encoding="utf-8")

    vendor_node_root = package_root / "vendor" / "node" / "darwin-arm64"
    vendor_node_root.mkdir(parents=True, exist_ok=True)
    node_binary = vendor_node_root / "node"
    node_binary.write_text("node\n", encoding="utf-8")
    if os.name != "nt":
        node_binary.chmod(0o755)

    plugin_schema_root = package_root / "plugins" / "schemas"
    plugin_schema_root.mkdir(parents=True, exist_ok=True)
    (plugin_schema_root / "setta.plugin.schema.json").write_text(
        "{}\n",
        encoding="utf-8",
    )

    launcher_assets_root = package_root / "launcher_artifacts" / "assets"
    launcher_assets_root.mkdir(parents=True, exist_ok=True)
    (launcher_assets_root / "Setta.icns").write_text("icon\n", encoding="utf-8")

    go_bin_root = package_root / "go_bin"
    go_bin_root.mkdir(parents=True, exist_ok=True)
    if include_go_binaries:
        for binary_name in ("setta", "setta-server"):
            binary_path = go_bin_root / binary_name
            binary_path.write_text("binary\n", encoding="utf-8")
            if os.name != "nt":
                binary_path.chmod(0o755)

    return project_root


def _build_wheel(project_root: Path, outdir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "build", "--wheel", "--outdir", str(outdir)],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
    )


def _install_editable(project_root: Path, venv_python: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(venv_python), "-m", "pip", "install", "--no-deps", "-e", str(project_root)],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
    )


def _build_first_party_basedpyright_wheel(tmp_path: Path) -> Path:
    source_root = _repo_root() / "plugins" / "setta-basedpyright"
    plugin_root = tmp_path / "setta-basedpyright"
    shutil.copytree(source_root, plugin_root)
    shutil.rmtree(plugin_root / "build", ignore_errors=True)

    outdir = tmp_path / "dist"
    result = _build_wheel(plugin_root, outdir)
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta_basedpyright-*.whl"))
    assert len(wheel_paths) == 1
    return wheel_paths[0]


def _build_first_party_app_subsystem_wheel(tmp_path: Path) -> Path:
    source_root = _repo_root() / "plugins" / "setta-json-render-app-gen"
    plugin_root = tmp_path / "setta-json-render-app-gen"
    shutil.copytree(source_root, plugin_root)
    shutil.rmtree(plugin_root / "build", ignore_errors=True)

    outdir = tmp_path / "dist"
    result = _build_wheel(plugin_root, outdir)
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta_json_render_app_gen-*.whl"))
    assert len(wheel_paths) == 1
    return wheel_paths[0]


def test_editable_install_does_not_require_packaged_go_binaries(tmp_path: Path) -> None:
    project_root = _write_minimal_distribution_project(
        tmp_path,
        include_go_binaries=False,
    )
    for relative_path in (
        "backend/setta/static/frontend",
        "backend/setta/vendor/node",
        "backend/setta/plugins/schemas",
        "backend/setta/launcher_artifacts/assets",
        "backend/setta/go_bin",
    ):
        shutil.rmtree(project_root / relative_path)
    venv_root = tmp_path / "editable-venv"

    subprocess.run(
        [sys.executable, "-m", "venv", str(venv_root)],
        check=True,
        capture_output=True,
        text=True,
    )
    venv_python = (
        venv_root / "Scripts" / "python.exe"
        if os.name == "nt"
        else venv_root / "bin" / "python"
    )

    result = _install_editable(project_root, venv_python)

    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output


def test_pyproject_defaults_extra_installs_basedpyright_plugin() -> None:
    pyproject = tomllib.loads((_repo_root() / "pyproject.toml").read_text(encoding="utf-8"))

    optional_dependencies = pyproject["project"]["optional-dependencies"]
    assert optional_dependencies["defaults"] == ["setta-basedpyright==0.1.0"]


def test_first_party_basedpyright_plugin_package_owns_basedpyright_dependency() -> None:
    plugin_pyproject = tomllib.loads(
        (_repo_root() / "plugins" / "setta-basedpyright" / "pyproject.toml").read_text(
            encoding="utf-8"
        )
    )

    assert plugin_pyproject["project"]["dependencies"] == ["basedpyright==1.25.0"]


def test_first_party_app_subsystem_plugin_package_has_no_python_runtime_dependency() -> None:
    plugin_pyproject = tomllib.loads(
        (
            _repo_root()
            / "plugins"
            / "setta-json-render-app-gen"
            / "pyproject.toml"
        ).read_text(encoding="utf-8")
    )

    assert plugin_pyproject["project"]["dependencies"] == []


def test_first_party_basedpyright_plugin_wheel_packages_python_backend_only(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_basedpyright_wheel(tmp_path)

    with zipfile.ZipFile(wheel_path) as wheel_archive:
        names = set(wheel_archive.namelist())

    assert any(name.endswith("setta-basedpyright/backend/main.py") for name in names)
    assert not any(name.endswith("backend/main.go") for name in names)
    assert any(name.endswith("setta-basedpyright/content/config/schema.json") for name in names)
    assert any(name.endswith("setta-basedpyright/setta.plugin.json") for name in names)


def test_first_party_basedpyright_plugin_wheel_installs_under_plugin_specific_root(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_basedpyright_wheel(tmp_path)
    site_packages = tmp_path / "site-packages"
    install_result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-deps",
            "--target",
            str(site_packages),
            str(wheel_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert install_result.returncode == 0, (
        f"{install_result.stdout}\n{install_result.stderr}"
    ).strip()

    installed_plugin_root = site_packages / "setta-basedpyright"
    assert (installed_plugin_root / "setta.plugin.json").is_file()
    assert (installed_plugin_root / "backend" / "main.py").is_file()
    assert (installed_plugin_root / "content" / "config" / "schema.json").is_file()

    record_path = site_packages / "setta_basedpyright-0.1.0.dist-info" / "RECORD"
    record_text = record_path.read_text(encoding="utf-8")
    assert "setta-basedpyright/setta.plugin.json" in record_text
    assert "setta-basedpyright/backend/main.py" in record_text


def test_first_party_app_subsystem_plugin_wheel_packages_runtime_managed_assets(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_app_subsystem_wheel(tmp_path)

    with zipfile.ZipFile(wheel_path) as wheel_archive:
        names = set(wheel_archive.namelist())

    assert any(
        name.endswith("setta-json-render-app-gen/setta.plugin.json")
        for name in names
    )
    assert any(name.endswith("setta-json-render-app-gen/README.md") for name in names)
    assert any(
        name.endswith("setta-json-render-app-gen/runtime_backend/main.py")
        for name in names
    )
    assert any(
        name.endswith("setta-json-render-app-gen/frontend/dist/index.js")
        for name in names
    )
    assert any(
        name.endswith("setta-json-render-app-gen/frontend/dist/index.css")
        for name in names
    )


def test_first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_app_subsystem_wheel(tmp_path)
    site_packages = tmp_path / "site-packages"
    install_result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-deps",
            "--target",
            str(site_packages),
            str(wheel_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert install_result.returncode == 0, (
        f"{install_result.stdout}\n{install_result.stderr}"
    ).strip()

    installed_plugin_root = site_packages / "setta-json-render-app-gen"
    assert (installed_plugin_root / "setta.plugin.json").is_file()
    assert (installed_plugin_root / "README.md").is_file()
    assert (installed_plugin_root / "runtime_backend" / "main.py").is_file()
    assert (installed_plugin_root / "frontend" / "dist" / "index.js").is_file()
    assert (installed_plugin_root / "frontend" / "dist" / "index.css").is_file()

    record_path = (
        site_packages / "setta_json_render_app_gen-0.1.0.dist-info" / "RECORD"
    )
    record_text = record_path.read_text(encoding="utf-8")
    assert "setta-json-render-app-gen/setta.plugin.json" in record_text
    assert "setta-json-render-app-gen/README.md" in record_text
    assert "setta-json-render-app-gen/runtime_backend/main.py" in record_text
    assert "setta-json-render-app-gen/frontend/dist/index.js" in record_text
    assert "setta-json-render-app-gen/frontend/dist/index.css" in record_text


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

    with zipfile.ZipFile(wheel_path) as wheel_archive:
        wheel_metadata = wheel_archive.read("setta-0.0.0.dist-info/WHEEL").decode(
            "utf-8"
        )

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

    wheel_paths = list(outdir.glob("setta-0.0.0-*.whl"))
    assert len(wheel_paths) == 1

    with zipfile.ZipFile(wheel_paths[0]) as wheel_archive:
        metadata = wheel_archive.read("setta-0.0.0.dist-info/METADATA").decode("utf-8")

    requires_lines = {
        line for line in metadata.splitlines() if line.startswith("Requires-Dist:")
    }
    default_requires = {
        line for line in requires_lines if "extra ==" not in line
    }
    defaults_requires = {
        line for line in requires_lines if "extra == 'defaults'" in line
    }
    source_requires = {
        line for line in requires_lines if "extra == 'source'" in line
    }
    dev_requires = {
        line for line in requires_lines if "extra == 'dev'" in line
    }

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
        use_repo_packaged_entrypoint_modules=True,
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

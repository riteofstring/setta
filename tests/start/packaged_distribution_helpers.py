import os
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _read_setta_package_version() -> str:
    init_content = (_repo_root() / "backend" / "setta" / "__init__.py").read_text(
        encoding="utf-8"
    )
    for line in init_content.splitlines():
        stripped = line.strip()
        if stripped.startswith('__version__ = "') and stripped.endswith('"'):
            return stripped.removeprefix('__version__ = "').removesuffix('"')
    raise AssertionError("setta package version not found")


def _write_minimal_distribution_project(
    tmp_path: Path,
    *,
    include_go_binaries: bool,
) -> Path:
    project_root = tmp_path / "packaged-project"
    package_root = project_root / "backend" / "setta"
    package_root.mkdir(parents=True, exist_ok=True)
    (package_root / "plugin_runtime").mkdir(parents=True, exist_ok=True)
    (package_root / "sdk_contracts").mkdir(parents=True, exist_ok=True)
    (package_root / "types" / "generated").mkdir(parents=True, exist_ok=True)

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
    source_package_root = _repo_root() / "backend" / "setta"
    for relative_path in (
        "__init__.py",
        "__main__.py",
        "entrypoint.py",
        "local_core_client.py",
        "sdk_contracts/constants.py",
        "runtime_compat.py",
        "plugin_runtime/__init__.py",
        "plugin_runtime/app_subsystem.py",
        "plugin_runtime/watch_code.py",
        "types/generated/go_shared_constants.py",
    ):
        shutil.copy2(source_package_root / relative_path, package_root / relative_path)
    (package_root / "dev_start.py").write_text(
        "def main() -> int:\n    return 0\n",
        encoding="utf-8",
    )
    (package_root / "server.py").write_text("app = object()\n", encoding="utf-8")
    (package_root / "start.py").write_text(
        "def cli() -> None:\n    return None\n", encoding="utf-8"
    )
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


def _build_wheel(
    project_root: Path,
    outdir: Path,
    *,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    process_env = os.environ.copy()
    if env:
        process_env.update(env)
    return subprocess.run(
        [sys.executable, "-m", "build", "--wheel", "--outdir", str(outdir)],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
        env=process_env,
    )


def _build_sdist(
    project_root: Path,
    outdir: Path,
    *,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    process_env = os.environ.copy()
    if env:
        process_env.update(env)
    return subprocess.run(
        [sys.executable, "-m", "build", "--sdist", "--outdir", str(outdir)],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
        env=process_env,
    )


def _read_single_wheel_member(wheel_path: Path, suffix: str) -> str:
    with zipfile.ZipFile(wheel_path) as wheel_archive:
        matches = [name for name in wheel_archive.namelist() if name.endswith(suffix)]
        assert len(matches) == 1
        return wheel_archive.read(matches[0]).decode("utf-8")


def _install_editable(
    project_root: Path, venv_python: Path
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            str(venv_python),
            "-m",
            "pip",
            "install",
            "--no-deps",
            "-e",
            str(project_root),
        ],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
    )


def _pnpm_command() -> str:
    return "pnpm.cmd" if os.name == "nt" else "pnpm"


def _assert_pnpm_command_succeeds(
    package_root: Path,
    *args: str,
    env: dict[str, str] | None = None,
) -> None:
    process_env = os.environ.copy()
    if env:
        process_env.update(env)
    result = subprocess.run(
        [_pnpm_command(), "--dir", str(package_root), *args],
        capture_output=True,
        text=True,
        check=False,
        env=process_env,
    )
    output = f"{result.stdout}\n{result.stderr}".strip()
    assert result.returncode == 0, output


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


def _app_subsystem_frontend_sdk_env(source_root: Path | None = None) -> dict[str, str]:
    if source_root is None:
        source_root = _repo_root() / "frontend" / "plugin-sdk" / "app-subsystem"
    return {"SETTA_APP_SUBSYSTEM_FRONTEND_SDK_SOURCE_ROOT": str(source_root)}


def _stage_first_party_app_subsystem_plugin_source(
    tmp_path: Path,
    *,
    remove_dist: bool = True,
    remove_vendored_sdk_dist: bool = True,
) -> Path:
    source_root = _repo_root() / "plugins" / "setta-json-render-app-gen"
    plugin_root = tmp_path / "setta-json-render-app-gen"
    frontend_root = plugin_root / "frontend"
    shutil.copytree(source_root, plugin_root)
    shutil.rmtree(plugin_root / "build", ignore_errors=True)
    if remove_dist:
        shutil.rmtree(frontend_root / "dist", ignore_errors=True)
    if remove_vendored_sdk_dist:
        shutil.rmtree(
            frontend_root / "vendor" / "app-subsystem-frontend-sdk" / "dist",
            ignore_errors=True,
        )
    shutil.rmtree(frontend_root / "node_modules", ignore_errors=True)
    return plugin_root


def _stage_first_party_watch_code_plugin_source(
    tmp_path: Path, *, remove_dist: bool = True
) -> Path:
    source_root = _repo_root() / "plugins" / "setta-watch-code"
    plugin_root = tmp_path / "setta-watch-code"
    frontend_root = plugin_root / "frontend"
    shutil.copytree(source_root, plugin_root)
    shutil.rmtree(plugin_root / "build", ignore_errors=True)
    if remove_dist:
        shutil.rmtree(frontend_root / "dist", ignore_errors=True)
    shutil.rmtree(frontend_root / "node_modules", ignore_errors=True)
    return plugin_root


def _stage_unknown_id_app_subsystem_plugin_source(tmp_path: Path) -> Path:
    source_root = (
        _repo_root() / "tests" / "fixtures" / "plugins" / "app-subsystem-unknown-id"
    )
    plugin_root = tmp_path / "app-subsystem-unknown-id"
    frontend_root = plugin_root / "frontend"
    shutil.copytree(source_root, plugin_root)
    shutil.rmtree(frontend_root / "dist", ignore_errors=True)
    shutil.rmtree(frontend_root / "node_modules", ignore_errors=True)
    return plugin_root


def _stage_app_subsystem_frontend_sdk_source(tmp_path: Path) -> Path:
    source_root = _repo_root() / "frontend" / "plugin-sdk" / "app-subsystem"
    package_root = tmp_path / "app-subsystem-frontend-sdk"
    shutil.copytree(source_root, package_root)
    shutil.rmtree(package_root / "dist", ignore_errors=True)
    shutil.rmtree(package_root / "node_modules", ignore_errors=True)
    return package_root


def _assert_matching_file_content(left: Path, right: Path) -> None:
    assert left.read_bytes() == right.read_bytes(), (
        f"expected matching file content for {left} and {right}"
    )


def _build_first_party_app_subsystem_wheel(
    tmp_path: Path, *, remove_dist: bool = True
) -> Path:
    plugin_root = _stage_first_party_app_subsystem_plugin_source(
        tmp_path, remove_dist=remove_dist
    )
    outdir = tmp_path / "dist"
    result = _build_wheel(
        plugin_root,
        outdir,
        env=_app_subsystem_frontend_sdk_env(),
    )
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta_json_render_app_gen-*.whl"))
    assert len(wheel_paths) == 1
    return wheel_paths[0]


def _build_first_party_watch_code_wheel(
    tmp_path: Path, *, remove_dist: bool = True
) -> Path:
    plugin_root = _stage_first_party_watch_code_plugin_source(
        tmp_path, remove_dist=remove_dist
    )
    outdir = tmp_path / "dist"
    result = _build_wheel(plugin_root, outdir)
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta_watch_code-*.whl"))
    assert len(wheel_paths) == 1
    return wheel_paths[0]


def _build_plugin_runtime_test_setta_wheel(tmp_path: Path) -> Path:
    project_root = tmp_path / "setta-runtime-wheel"
    package_root = project_root / "setta"
    package_root.mkdir(parents=True, exist_ok=True)
    for relative_path in (
        "__init__.py",
        "entrypoint.py",
        "local_core_client.py",
        "runtime_compat.py",
        "plugin_runtime/__init__.py",
        "plugin_runtime/app_subsystem.py",
        "plugin_runtime/watch_code.py",
        "sdk_contracts/constants.py",
        "types/generated/go_shared_constants.py",
    ):
        source_path = _repo_root() / "backend" / "setta" / relative_path
        target_path = package_root / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(
            source_path.read_text(encoding="utf-8"), encoding="utf-8"
        )
    for relative_path in (
        "sdk_contracts/__init__.py",
        "types/__init__.py",
        "types/generated/__init__.py",
    ):
        target_path = package_root / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text("", encoding="utf-8")

    (project_root / "pyproject.toml").write_text(
        "\n".join(
            [
                "[build-system]",
                'requires = ["setuptools==80.9.0", "wheel==0.45.1"]',
                'build-backend = "setuptools.build_meta"',
                "",
                "[project]",
                'name = "setta"',
                f'version = "{_read_setta_package_version()}"',
                'requires-python = ">=3.12"',
                "dependencies = []",
                "",
                "[tool.setuptools]",
                'packages = ["setta", "setta.plugin_runtime", "setta.sdk_contracts", "setta.types", "setta.types.generated"]',
                "",
            ]
        ),
        encoding="utf-8",
    )

    outdir = tmp_path / "setta-dist"
    result = _build_wheel(project_root, outdir)
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta-*.whl"))
    assert len(wheel_paths) == 1
    return wheel_paths[0]


def _install_plugin_wheel_with_packaged_setta_runtime(
    site_packages: Path,
    plugin_wheel_path: Path,
    setta_wheel_path: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-index",
            "--find-links",
            str(setta_wheel_path.parent),
            "--target",
            str(site_packages),
            str(plugin_wheel_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def _build_first_party_app_subsystem_sdist(tmp_path: Path) -> Path:
    plugin_root = _stage_first_party_app_subsystem_plugin_source(
        tmp_path, remove_dist=True
    )
    outdir = tmp_path / "dist"
    result = _build_sdist(
        plugin_root,
        outdir,
        env=_app_subsystem_frontend_sdk_env(),
    )
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    sdist_paths = list(outdir.glob("setta_json_render_app_gen-*.tar.gz"))
    assert len(sdist_paths) == 1
    return sdist_paths[0]


def _extract_sdist(sdist_path: Path, extract_root: Path) -> Path:
    with tarfile.open(sdist_path, "r:gz") as archive:
        archive.extractall(extract_root, filter="data")
    extracted_roots = [path for path in extract_root.iterdir() if path.is_dir()]
    assert len(extracted_roots) == 1
    return extracted_roots[0]

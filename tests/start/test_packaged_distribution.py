import json
import os
import shutil
import subprocess
import sys
import tarfile
import tomllib
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
        "plugin_runtime/local_core.py",
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
    assert (
        left.read_bytes() == right.read_bytes()
    ), f"expected matching file content for {left} and {right}"


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
        "plugin_runtime/local_core.py",
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


def test_minimal_distribution_project_uses_packaged_runtime_modules(
    tmp_path: Path,
) -> None:
    project_root = _write_minimal_distribution_project(
        tmp_path,
        include_go_binaries=False,
    )
    app_subsystem_runtime = (
        project_root / "backend" / "setta" / "plugin_runtime" / "app_subsystem.py"
    )

    runtime_text = app_subsystem_runtime.read_text(encoding="utf-8")
    assert "local_core_command_for_listener_endpoint" in runtime_text
    assert "run_app_subsystem_backend" in runtime_text
    assert runtime_text == (
        _repo_root() / "backend" / "setta" / "plugin_runtime" / "app_subsystem.py"
    ).read_text(encoding="utf-8")


def test_pyproject_defaults_extra_installs_first_party_plugins() -> None:
    pyproject = tomllib.loads(
        (_repo_root() / "pyproject.toml").read_text(encoding="utf-8")
    )

    optional_dependencies = pyproject["project"]["optional-dependencies"]
    assert optional_dependencies["defaults"] == [
        "setta-basedpyright==0.1.0",
        "setta-watch-code==0.1.0",
    ]


def test_first_party_basedpyright_plugin_package_owns_basedpyright_dependency() -> None:
    plugin_pyproject = tomllib.loads(
        (_repo_root() / "plugins" / "setta-basedpyright" / "pyproject.toml").read_text(
            encoding="utf-8"
        )
    )

    assert plugin_pyproject["project"]["dependencies"] == ["basedpyright==1.25.0"]


def test_first_party_app_subsystem_plugin_package_declares_setta_runtime_dependency() -> (
    None
):
    plugin_pyproject = tomllib.loads(
        (
            _repo_root() / "plugins" / "setta-json-render-app-gen" / "pyproject.toml"
        ).read_text(encoding="utf-8")
    )

    expected_version = _read_setta_package_version()
    assert plugin_pyproject["project"]["dependencies"] == [f"setta=={expected_version}"]


def test_first_party_watch_code_plugin_package_declares_setta_runtime_dependency() -> (
    None
):
    plugin_pyproject = tomllib.loads(
        (_repo_root() / "plugins" / "setta-watch-code" / "pyproject.toml").read_text(
            encoding="utf-8"
        )
    )

    expected_version = _read_setta_package_version()
    assert plugin_pyproject["project"]["dependencies"] == [f"setta=={expected_version}"]


def test_first_party_app_subsystem_plugin_wheel_declares_setta_runtime_dependency(
    tmp_path: Path,
) -> None:
    expected_version = _read_setta_package_version()
    wheel_path = _build_first_party_app_subsystem_wheel(tmp_path)

    with zipfile.ZipFile(wheel_path) as wheel_archive:
        metadata_name = next(
            name
            for name in wheel_archive.namelist()
            if name.endswith(".dist-info/METADATA")
        )
        metadata = wheel_archive.read(metadata_name).decode("utf-8")

    assert f"Requires-Dist: setta=={expected_version}" in metadata


def test_first_party_app_subsystem_plugin_frontend_builds_from_staged_source_tree(
    tmp_path: Path,
) -> None:
    plugin_root = _stage_first_party_app_subsystem_plugin_source(tmp_path)
    frontend_root = plugin_root / "frontend"
    vendored_sdk_dist = (
        frontend_root / "vendor" / "app-subsystem-frontend-sdk" / "dist" / "index.js"
    )
    sdk_env = _app_subsystem_frontend_sdk_env()

    assert not vendored_sdk_dist.exists()

    _assert_pnpm_command_succeeds(frontend_root, "install", "--lockfile=false")
    _assert_pnpm_command_succeeds(frontend_root, "run", "typecheck")
    _assert_pnpm_command_succeeds(frontend_root, "run", "test", env=sdk_env)
    _assert_pnpm_command_succeeds(frontend_root, "run", "build", env=sdk_env)

    built_js = frontend_root / "dist" / "index.js"
    built_css = frontend_root / "dist" / "index.css"
    assert vendored_sdk_dist.is_file()
    assert built_js.is_file()
    assert built_css.is_file()

    bundle_text = built_js.read_text(encoding="utf-8")
    assert "frontend/node_modules" not in bundle_text
    assert "plugin-sdk/app-subsystem/src" not in bundle_text
    assert str(_repo_root()) not in bundle_text


def test_app_subsystem_frontend_sdk_source_package_builds_from_its_own_root(
    tmp_path: Path,
) -> None:
    package_root = _stage_app_subsystem_frontend_sdk_source(tmp_path)

    _assert_pnpm_command_succeeds(package_root, "install", "--lockfile=false")
    _assert_pnpm_command_succeeds(package_root, "run", "typecheck")
    _assert_pnpm_command_succeeds(package_root, "run", "build")

    assert (package_root / "dist" / "index.js").is_file()


def test_vendored_app_subsystem_frontend_sdk_matches_source_package_build(
    tmp_path: Path,
) -> None:
    package_root = _stage_app_subsystem_frontend_sdk_source(tmp_path)
    plugin_root = _stage_first_party_app_subsystem_plugin_source(tmp_path)
    frontend_root = plugin_root / "frontend"
    vendored_sdk_root = frontend_root / "vendor" / "app-subsystem-frontend-sdk"

    _assert_pnpm_command_succeeds(package_root, "install", "--lockfile=false")
    _assert_pnpm_command_succeeds(package_root, "run", "build")
    _assert_pnpm_command_succeeds(
        frontend_root,
        "run",
        "prepare-sdk",
        env=_app_subsystem_frontend_sdk_env(package_root),
    )

    _assert_matching_file_content(
        package_root / "dist" / "index.js",
        vendored_sdk_root / "dist" / "index.js",
    )
    _assert_matching_file_content(
        package_root / "types" / "index.d.ts",
        vendored_sdk_root / "types" / "index.d.ts",
    )


def test_vendored_app_subsystem_frontend_sdk_dist_is_not_tracked() -> None:
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "plugins/setta-json-render-app-gen/frontend/vendor/app-subsystem-frontend-sdk/dist/**",
        ],
        cwd=_repo_root(),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""


def test_first_party_basedpyright_plugin_wheel_packages_python_backend_only(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_basedpyright_wheel(tmp_path)

    with zipfile.ZipFile(wheel_path) as wheel_archive:
        names = set(wheel_archive.namelist())

    assert any(name.endswith("setta-basedpyright/backend/main.py") for name in names)
    assert not any(name.endswith("backend/main.go") for name in names)
    assert any(
        name.endswith("setta-basedpyright/content/config/schema.json") for name in names
    )
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
        name.endswith("setta-json-render-app-gen/setta.plugin.json") for name in names
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


def test_first_party_watch_code_plugin_wheel_packages_runtime_managed_assets(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_watch_code_wheel(tmp_path)

    with zipfile.ZipFile(wheel_path) as wheel_archive:
        names = set(wheel_archive.namelist())

    assert any(name.endswith("setta-watch-code/setta.plugin.json") for name in names)
    assert any(name.endswith("setta-watch-code/README.md") for name in names)
    assert any(
        name.endswith("setta-watch-code/frontend/dist/index.js") for name in names
    )
    assert any(
        name.endswith("setta-watch-code/frontend/dist/setta-watch-code-frontend.css")
        for name in names
    )


def test_first_party_app_subsystem_plugin_sdist_includes_frontend_build_inputs(
    tmp_path: Path,
) -> None:
    sdist_path = _build_first_party_app_subsystem_sdist(tmp_path)

    with tarfile.open(sdist_path, "r:gz") as sdist_archive:
        names = set(sdist_archive.getnames())

    assert any(name.endswith("build_backend.py") for name in names)
    assert any(name.endswith("frontend/.npmrc") for name in names)
    assert any(name.endswith("frontend/package.json") for name in names)
    assert any(name.endswith("frontend/tsconfig.json") for name in names)
    assert any(name.endswith("frontend/tsconfig.typecheck.json") for name in names)
    assert any(
        name.endswith("frontend/scripts/materialize-vendored-app-subsystem-sdk.mjs")
        for name in names
    )
    assert any(name.endswith("frontend/src/index.ts") for name in names)
    assert any(name.endswith("frontend/typecheck/standalone.ts") for name in names)
    assert any(
        name.endswith("frontend/tests/state/actions/app.test.ts") for name in names
    )
    assert any(
        name.endswith("frontend/vendor/app-subsystem-frontend-sdk/package.json")
        for name in names
    )
    assert any(
        name.endswith("frontend/vendor/app-subsystem-frontend-sdk/dist/index.js")
        for name in names
    )
    assert any(
        name.endswith("frontend/vendor/app-subsystem-frontend-sdk/types/index.d.ts")
        for name in names
    )
    assert not any(name.endswith("frontend/dist/index.js") for name in names)
    assert not any("/node_modules/" in name for name in names)


def test_first_party_app_subsystem_plugin_sdist_frontend_package_runs_standalone(
    tmp_path: Path,
) -> None:
    sdist_path = _build_first_party_app_subsystem_sdist(tmp_path)
    extracted_root = _extract_sdist(sdist_path, tmp_path / "sdist-frontend")
    frontend_root = extracted_root / "frontend"

    _assert_pnpm_command_succeeds(frontend_root, "install", "--lockfile=false")
    _assert_pnpm_command_succeeds(frontend_root, "run", "typecheck")
    _assert_pnpm_command_succeeds(frontend_root, "run", "test")
    _assert_pnpm_command_succeeds(frontend_root, "run", "build")

    built_js = frontend_root / "dist" / "index.js"
    built_css = frontend_root / "dist" / "index.css"
    assert built_js.is_file()
    assert built_css.is_file()

    bundle_text = built_js.read_text(encoding="utf-8")
    assert "plugin-sdk/app-subsystem/src" not in bundle_text
    assert str(_repo_root()) not in bundle_text


def test_first_party_app_subsystem_plugin_wheel_builds_from_sdist(
    tmp_path: Path,
) -> None:
    sdist_path = _build_first_party_app_subsystem_sdist(tmp_path)
    extracted_root = _extract_sdist(sdist_path, tmp_path / "sdist-extracted")
    outdir = tmp_path / "wheel-from-sdist"

    result = _build_wheel(extracted_root, outdir)
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("setta_json_render_app_gen-*.whl"))
    assert len(wheel_paths) == 1
    with zipfile.ZipFile(wheel_paths[0]) as wheel_archive:
        names = set(wheel_archive.namelist())

    assert any(
        name.endswith("setta-json-render-app-gen/frontend/dist/index.js")
        for name in names
    )
    assert any(
        name.endswith("setta-json-render-app-gen/frontend/dist/index.css")
        for name in names
    )


def test_first_party_app_subsystem_plugin_wheel_rebuilds_stale_frontend_bundle(
    tmp_path: Path,
) -> None:
    plugin_root = _stage_first_party_app_subsystem_plugin_source(
        tmp_path, remove_dist=False
    )
    stale_dist_root = plugin_root / "frontend" / "dist"
    stale_dist_root.mkdir(parents=True, exist_ok=True)
    (stale_dist_root / "index.js").write_text("STALE_JS\n", encoding="utf-8")
    (stale_dist_root / "index.css").write_text("STALE_CSS\n", encoding="utf-8")

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
    wheel_path = wheel_paths[0]
    with zipfile.ZipFile(wheel_path) as wheel_archive:
        bundle_name = next(
            name
            for name in wheel_archive.namelist()
            if name.endswith("setta-json-render-app-gen/frontend/dist/index.js")
        )
        style_name = next(
            name
            for name in wheel_archive.namelist()
            if name.endswith("setta-json-render-app-gen/frontend/dist/index.css")
        )
        bundle_text = wheel_archive.read(bundle_name).decode("utf-8")
        style_text = wheel_archive.read(style_name).decode("utf-8")

    assert "STALE_JS" not in bundle_text
    assert "STALE_CSS" not in style_text


def test_first_party_app_subsystem_plugin_wheel_build_installs_dependencies_when_node_modules_exists(
    tmp_path: Path,
) -> None:
    plugin_root = _stage_first_party_app_subsystem_plugin_source(
        tmp_path, remove_dist=True
    )
    node_modules_root = plugin_root / "frontend" / "node_modules"
    node_modules_root.mkdir(parents=True, exist_ok=True)
    (node_modules_root / "marker.txt").write_text("stale\n", encoding="utf-8")

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


def test_unknown_id_app_subsystem_plugin_frontend_builds_from_staged_source_tree(
    tmp_path: Path,
) -> None:
    plugin_root = _stage_unknown_id_app_subsystem_plugin_source(tmp_path)
    assert not (plugin_root / "frontend" / "dist" / "index.js").exists()

    outdir = tmp_path / "dist"
    result = _build_wheel(plugin_root, outdir)
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output

    wheel_paths = list(outdir.glob("acme_app_subsystem_fixture-*.whl"))
    assert len(wheel_paths) == 1
    with zipfile.ZipFile(wheel_paths[0]) as wheel_archive:
        names = set(wheel_archive.namelist())

    assert any(
        name.endswith("acme-app-subsystem-fixture/frontend/dist/index.js")
        for name in names
    )
    assert any(
        name.endswith("acme-app-subsystem-fixture/frontend/dist/index.css")
        for name in names
    )
    assert not any(
        name.endswith("acme-app-subsystem-fixture/frontend/package.json")
        for name in names
    )
    assert not any(
        name.endswith("acme-app-subsystem-fixture/frontend/src/index.js")
        for name in names
    )


def test_first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_app_subsystem_wheel(tmp_path)
    setta_wheel_path = _build_plugin_runtime_test_setta_wheel(tmp_path)
    site_packages = tmp_path / "site-packages"
    install_result = _install_plugin_wheel_with_packaged_setta_runtime(
        site_packages,
        wheel_path,
        setta_wheel_path,
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
    assert not (installed_plugin_root / "frontend" / "package.json").exists()

    record_path = site_packages / "setta_json_render_app_gen-0.1.0.dist-info" / "RECORD"
    record_text = record_path.read_text(encoding="utf-8")
    assert "setta-json-render-app-gen/setta.plugin.json" in record_text
    assert "setta-json-render-app-gen/README.md" in record_text
    assert "setta-json-render-app-gen/runtime_backend/main.py" in record_text
    assert "setta-json-render-app-gen/frontend/dist/index.js" in record_text
    assert "setta-json-render-app-gen/frontend/dist/index.css" in record_text


def test_first_party_watch_code_plugin_wheel_installs_under_plugin_specific_root(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_watch_code_wheel(tmp_path)
    setta_wheel_path = _build_plugin_runtime_test_setta_wheel(tmp_path)
    site_packages = tmp_path / "site-packages"
    install_result = _install_plugin_wheel_with_packaged_setta_runtime(
        site_packages,
        wheel_path,
        setta_wheel_path,
    )
    assert install_result.returncode == 0, (
        f"{install_result.stdout}\n{install_result.stderr}"
    ).strip()

    installed_plugin_root = site_packages / "setta-watch-code"
    assert (installed_plugin_root / "setta.plugin.json").is_file()
    assert (installed_plugin_root / "README.md").is_file()
    assert (installed_plugin_root / "frontend" / "dist" / "index.js").is_file()
    assert (
        installed_plugin_root / "frontend" / "dist" / "setta-watch-code-frontend.css"
    ).is_file()
    assert not (installed_plugin_root / "frontend" / "package.json").exists()

    record_path = site_packages / "setta_watch_code-0.1.0.dist-info" / "RECORD"
    record_text = record_path.read_text(encoding="utf-8")
    assert "setta-watch-code/setta.plugin.json" in record_text
    assert "setta-watch-code/README.md" in record_text
    assert "setta-watch-code/frontend/dist/index.js" in record_text
    assert "setta-watch-code/frontend/dist/setta-watch-code-frontend.css" in record_text


def test_plugin_runtime_test_setta_wheel_keeps_local_core_boundary_packaged_only(
    tmp_path: Path,
) -> None:
    wheel_path = _build_plugin_runtime_test_setta_wheel(tmp_path)
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

    probe = subprocess.run(
        [
            sys.executable,
            "-c",
            "\n".join(
                [
                    "import sys",
                    f"sys.path.insert(0, {str(site_packages)!r})",
                    "from setta.local_core_client import LocalCoreClient",
                    "from setta.plugin_runtime import run_local_core_command",
                    "assert callable(run_local_core_command)",
                    "assert not hasattr(LocalCoreClient, 'render_realtime_dependency_values')",
                ]
            ),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert probe.returncode == 0, f"{probe.stdout}\n{probe.stderr}".strip()


def test_first_party_app_subsystem_plugin_installed_frontend_bundle_imports_without_repo_path_assumptions(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_app_subsystem_wheel(tmp_path)
    setta_wheel_path = _build_plugin_runtime_test_setta_wheel(tmp_path)
    site_packages = tmp_path / "site-packages"
    install_result = _install_plugin_wheel_with_packaged_setta_runtime(
        site_packages,
        wheel_path,
        setta_wheel_path,
    )
    assert install_result.returncode == 0, (
        f"{install_result.stdout}\n{install_result.stderr}"
    ).strip()

    installed_bundle = (
        site_packages / "setta-json-render-app-gen" / "frontend" / "dist" / "index.js"
    )
    bundle_text = installed_bundle.read_text(encoding="utf-8")
    assert "frontend/node_modules" not in bundle_text
    assert "plugin-sdk/app-subsystem/dist/index.js" not in bundle_text
    assert str(_repo_root()) not in bundle_text

    node_script = f"""
import {{ JSDOM }} from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {{
  url: "http://localhost/",
}});
const globals = {{
  window: dom.window,
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  navigator: dom.window.navigator,
  Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
}};
for (const [key, value] of Object.entries(globals)) {{
  Object.defineProperty(globalThis, key, {{
    configurable: true,
    writable: true,
    value,
  }});
}}

const module = await import({json.dumps(installed_bundle.as_uri())});
if (module.apiVersion !== 1) {{
  throw new Error(`unexpected apiVersion: ${{module.apiVersion}}`);
}}
if (module.default?.overviewTab?.moreMenuLabel !== "JSON Render") {{
  throw new Error("installed bundle did not expose the app subsystem registration");
}}
if ((module.default?.chat?.slashCommands?.length ?? 0) < 1) {{
  throw new Error("installed bundle did not expose chat slash commands");
}}
"""
    node_result = subprocess.run(
        ["node", "--input-type=module"],
        cwd=_repo_root() / "frontend",
        input=node_script,
        capture_output=True,
        text=True,
        check=False,
    )
    assert node_result.returncode == 0, (
        f"{node_result.stdout}\n{node_result.stderr}"
    ).strip()


def test_first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain(
    tmp_path: Path,
) -> None:
    wheel_path = _build_first_party_app_subsystem_wheel(tmp_path)
    setta_wheel_path = _build_plugin_runtime_test_setta_wheel(tmp_path)
    site_packages = tmp_path / "site-packages"
    install_result = _install_plugin_wheel_with_packaged_setta_runtime(
        site_packages,
        wheel_path,
        setta_wheel_path,
    )
    assert install_result.returncode == 0, (
        f"{install_result.stdout}\n{install_result.stderr}"
    ).strip()

    go_stub = tmp_path / "setta-go-stub.py"
    go_stub.write_text(
        """#!/usr/bin/env python3
import json
import sys

from setta import __version__
from setta.sdk_contracts.constants import SETTA_SDK_CONTRACT_VERSION

if len(sys.argv) != 2 or sys.argv[1] != "sdk-local-core":
    raise SystemExit(1)

print(json.dumps({
    "protocolVersion": 1,
    "sdkVersion": __version__,
    "sdkContractVersion": SETTA_SDK_CONTRACT_VERSION,
    "coreVersion": "test-core",
}))
sys.stdout.flush()

request = json.loads(sys.stdin.readline())
command_name = request.get("commandName")
result = None
if command_name == "get_effective_app_spec_path":
    result = "plugins/setta-json-render-app-gen/app_specs/app.json"
elif command_name == "get_effective_app_theme_mode":
    result = "auto"
elif command_name == "get_effective_app_definition":
    result = {
        "catalogId": "default",
        "appSpecVersion": "v1",
        "appSpecPath": "plugins/setta-json-render-app-gen/app_specs/app.json",
    }
elif command_name == "validate_app_definition":
    result = {"errors": [], "warnings": [], "capabilities": {}}
else:
    result = {"appSpec": None, "appDefinition": None}

print(json.dumps({"callId": request.get("callId"), "ok": True, "result": result}))
sys.stdout.flush()
""",
        encoding="utf-8",
    )
    go_stub.chmod(0o755)

    installed_plugin_root = site_packages / "setta-json-render-app-gen"
    plugin_backend = installed_plugin_root / "runtime_backend" / "main.py"
    env = os.environ.copy()
    env["PYTHONPATH"] = str(site_packages)
    env["SETTA_GO_CLI_BIN"] = str(go_stub)

    probe_result = subprocess.run(
        [sys.executable, str(plugin_backend), "--setta-plugin-backend-probe"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert probe_result.returncode == 0, (
        f"{probe_result.stdout}\n{probe_result.stderr}"
    ).strip()
    probe_payload = json.loads(probe_result.stdout)
    assert probe_payload["appSubsystemBackend"]["contractVersion"] == 1
    assert {
        endpoint["name"]
        for endpoint in probe_payload["appSubsystemBackend"]["listenerEndpoints"]
    } >= {
        "appsubsystem_get_effective_app_spec_path",
        "appsubsystem_validate_app_definition",
    }
    assert probe_payload["listenerEndpoints"] == []

    runtime_request = {
        "schemaVersion": 1,
        "kind": "listener_endpoint",
        "listenerEndpoint": {
            "endpointName": "appsubsystem_get_effective_app_spec_path",
            "context": {"settaFilesRoot": str(tmp_path / "setta_files")},
            "payload": {},
        },
    }
    runtime_result = subprocess.run(
        [sys.executable, str(plugin_backend), "--setta-plugin-backend-runtime"],
        cwd=tmp_path,
        input=json.dumps(runtime_request),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert runtime_result.returncode == 0, (
        f"{runtime_result.stdout}\n{runtime_result.stderr}"
    ).strip()
    runtime_payload = json.loads(runtime_result.stdout)
    assert runtime_payload["listenerEndpoint"]["result"] == (
        "plugins/setta-json-render-app-gen/app_specs/app.json"
    )
    assert runtime_payload["listenerEndpoint"].get("error") is None


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
        "setta/plugin_runtime/local_core.py",
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
        "Requires-Dist: setta-watch-code==0.1.0; extra == 'defaults'",
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

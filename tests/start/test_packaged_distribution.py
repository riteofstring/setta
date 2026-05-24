import base64
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tomllib
import zipfile
from pathlib import Path

from tests.start.packaged_distribution_helpers import (
    _app_subsystem_frontend_sdk_env,
    _assert_matching_file_content,
    _assert_pnpm_command_succeeds,
    _build_first_party_app_subsystem_sdist,
    _build_first_party_app_subsystem_wheel,
    _build_first_party_basedpyright_wheel,
    _build_first_party_watch_code_wheel,
    _build_plugin_runtime_test_setta_wheel,
    _build_wheel,
    _extract_sdist,
    _install_editable,
    _install_plugin_wheel_with_packaged_setta_runtime,
    _read_setta_package_version,
    _repo_root,
    _stage_app_subsystem_frontend_sdk_source,
    _stage_first_party_app_subsystem_plugin_source,
    _stage_unknown_id_app_subsystem_plugin_source,
    _write_minimal_distribution_project,
)


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
    watch_code_runtime = (
        project_root / "backend" / "setta" / "plugin_runtime" / "watch_code.py"
    )
    assert watch_code_runtime.read_text(encoding="utf-8") == (
        _repo_root() / "backend" / "setta" / "plugin_runtime" / "watch_code.py"
    ).read_text(encoding="utf-8")


def test_pyproject_defaults_extra_installs_first_party_language_server_plugin() -> None:
    pyproject = tomllib.loads(
        (_repo_root() / "pyproject.toml").read_text(encoding="utf-8")
    )

    optional_dependencies = pyproject["project"]["optional-dependencies"]
    assert optional_dependencies["defaults"] == [
        "setta-basedpyright==0.1.0",
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
    assert any(name.endswith("setta-watch-code/backend/main.py") for name in names)
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
    assert (installed_plugin_root / "backend" / "main.py").is_file()
    assert (installed_plugin_root / "frontend" / "dist" / "index.js").is_file()
    assert (
        installed_plugin_root / "frontend" / "dist" / "setta-watch-code-frontend.css"
    ).is_file()
    assert not (installed_plugin_root / "frontend" / "package.json").exists()

    record_path = site_packages / "setta_watch_code-0.1.0.dist-info" / "RECORD"
    record_text = record_path.read_text(encoding="utf-8")
    assert "setta-watch-code/setta.plugin.json" in record_text
    assert "setta-watch-code/README.md" in record_text
    assert "setta-watch-code/backend/main.py" in record_text
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


def test_first_party_watch_code_plugin_backend_runs_without_developer_go_toolchain(
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

    go_stub = tmp_path / "setta-go-stub.py"
    go_stub.write_text(
        """#!/usr/bin/env python3
import json
import os
import sys

if sys.argv[1:] != ["sdk-local-core"]:
    raise SystemExit(f"unexpected args: {sys.argv[1:]!r}")

print(json.dumps({
    "protocolVersion": 1,
    "sdkVersion": os.environ["SETTA_STUB_SDK_VERSION"],
    "coreVersion": "stub-core",
    "sdkContractVersion": 2,
}), flush=True)

for line in sys.stdin:
    request = json.loads(line)
    command = request["commandName"]
    payload = request.get("payload", {})
    if command == "watch_code_set_inputs":
        result = {
            "folders": payload["folders"],
            "files": payload["files"],
            "registry": {},
            "baselineByPath": {},
        }
    elif command == "watch_code_get_project_data":
        result = {
            "folders": [{"path": "pkg", "recursive": True}],
            "files": ["pkg/watch.py"],
            "registry": {},
            "baselineByPath": {},
        }
    else:
        result = {
            "folders": [],
            "files": payload.get("files", []),
            "registry": {},
            "baselineByPath": {},
        }
    print(json.dumps({
        "callId": request["callId"],
        "ok": True,
        "result": result,
        "details": {},
    }), flush=True)
""",
        encoding="utf-8",
    )
    go_stub.chmod(0o755)

    installed_plugin_root = site_packages / "setta-watch-code"
    plugin_backend = installed_plugin_root / "backend" / "main.py"
    env = os.environ.copy()
    env["PYTHONPATH"] = str(site_packages)
    env["SETTA_GO_CLI_BIN"] = str(go_stub)
    env["SETTA_STUB_SDK_VERSION"] = _read_setta_package_version()

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
    assert probe_payload["watchCodeBackend"]["contractVersion"] == 1
    assert probe_payload["routes"] == [
        {"path": "/plugins/setta-watch-code/watch-code/inputs", "methods": ["POST"]},
    ]
    assert {setting["id"] for setting in probe_payload["uiSettings"]} == {
        "folders",
        "files",
    }
    assert all("paneId" not in setting for setting in probe_payload["uiSettings"])

    route_body = base64.b64encode(
        json.dumps(
            {
                "projectConfigId": "project-alpha",
                "folders": [],
                "files": ["pkg/watch.py"],
            },
            separators=(",", ":"),
        ).encode("utf-8")
    ).decode("ascii")
    route_request = {
        "schemaVersion": 1,
        "kind": "http",
        "http": {
            "context": {
                "settaFilesRoot": str(tmp_path / "setta_files"),
                "workspaceRoot": str(tmp_path / "workspace"),
            },
            "method": "POST",
            "path": "/plugins/setta-watch-code/watch-code/inputs",
            "headers": {},
            "bodyBase64": route_body,
        },
    }
    route_result = subprocess.run(
        [sys.executable, str(plugin_backend), "--setta-plugin-backend-runtime"],
        cwd=tmp_path,
        input=json.dumps(route_request),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert route_result.returncode == 0, (
        f"{route_result.stdout}\n{route_result.stderr}"
    ).strip()
    route_payload = json.loads(route_result.stdout)
    assert route_payload["http"]["statusCode"] == 200
    route_response_body = json.loads(
        base64.b64decode(route_payload["http"]["bodyBase64"]).decode("utf-8")
    )
    assert route_response_body == {
        "projectData": {
            "folders": [],
            "files": ["pkg/watch.py"],
            "registry": {},
            "baselineByPath": {},
        }
    }

    setting_request = {
        "schemaVersion": 1,
        "kind": "ui_setting",
        "uiSetting": {
            "context": {
                "settaFilesRoot": str(tmp_path / "setta_files"),
                "workspaceRoot": str(tmp_path / "workspace"),
            },
            "operation": "read",
            "handlerId": "read_files",
            "projectConfigId": "project-alpha",
        },
    }
    setting_result = subprocess.run(
        [sys.executable, str(plugin_backend), "--setta-plugin-backend-runtime"],
        cwd=tmp_path,
        input=json.dumps(setting_request),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert setting_result.returncode == 0, (
        f"{setting_result.stdout}\n{setting_result.stderr}"
    ).strip()
    setting_payload = json.loads(setting_result.stdout)
    assert setting_payload["uiSetting"] == {"value": ["pkg/watch.py"]}

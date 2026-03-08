import os
import subprocess
import sys
import zipfile
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_minimal_distribution_project(
    tmp_path: Path, *, include_go_binaries: bool
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
    (package_root / "__init__.py").write_text('__version__ = "0.0.0"\n', encoding="utf-8")
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
    (sidecars_root / "opencode_sdk_runner.mjs").write_text(
        "console.log('opencode sidecar');\n",
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

    wheel_paths = list(outdir.glob("setta-0.0.0-*.whl"))
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
    # assets, not the full legacy Python backend tree.
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
        names = set(wheel_archive.namelist())

    expected_names = {
        "setta/__init__.py",
        "setta/__main__.py",
        "setta/entrypoint.py",
        "setta/agentic/external_adapters/sidecars/claude_sdk_runner.py",
        "setta/agentic/external_adapters/sidecars/opencode_sdk_runner.mjs",
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

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
    (package_root / "entrypoint.py").write_text(
        "def main() -> None:\n    return None\n",
        encoding="utf-8",
    )

    if include_go_binaries:
        go_bin_root = package_root / "go_bin"
        go_bin_root.mkdir(parents=True, exist_ok=True)
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

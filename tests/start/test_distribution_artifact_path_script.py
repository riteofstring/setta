import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _run_helper(
    *,
    artifact_dir: Path,
    filename_pattern: str,
    artifact_label: str,
) -> subprocess.CompletedProcess[str]:
    helper = _repo_root() / "scripts" / "lib" / "distribution_artifact_path.sh"
    env = os.environ.copy()
    return subprocess.run(
        [
            "bash",
            "-lc",
            (
                f'source "{helper}" && '
                f'setta_resolve_single_dist_artifact "{artifact_dir}" '
                f'"{filename_pattern}" "{artifact_label}"'
            ),
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def test_distribution_artifact_helper_returns_the_single_matching_path(
    tmp_path: Path,
) -> None:
    # The shared helper should resolve the one built artifact path deterministically.
    artifact_dir = tmp_path / "dist"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    expected_path = artifact_dir / "setta-0.0.0.tar.gz"
    expected_path.write_text("sdist\n", encoding="utf-8")

    result = _run_helper(
        artifact_dir=artifact_dir,
        filename_pattern="*.tar.gz",
        artifact_label="sdist",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(expected_path.resolve(strict=False))


def test_distribution_artifact_helper_rejects_missing_matches(tmp_path: Path) -> None:
    # Wrapper scripts should fail fast when the expected build artifact is absent.
    artifact_dir = tmp_path / "dist"
    artifact_dir.mkdir(parents=True, exist_ok=True)

    result = _run_helper(
        artifact_dir=artifact_dir,
        filename_pattern="*.whl",
        artifact_label="wheel",
    )

    assert result.returncode != 0
    assert "No wheel found" in f"{result.stdout}{result.stderr}"


def test_distribution_artifact_helper_rejects_multiple_matches(tmp_path: Path) -> None:
    # Wrapper scripts should not guess which artifact to install when more than one exists.
    artifact_dir = tmp_path / "dist"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / "setta-0.0.0-py3-none-macosx_14_0_arm64.whl").write_text(
        "wheel-a\n",
        encoding="utf-8",
    )
    (artifact_dir / "setta-0.0.1-py3-none-macosx_14_0_arm64.whl").write_text(
        "wheel-b\n",
        encoding="utf-8",
    )

    result = _run_helper(
        artifact_dir=artifact_dir,
        filename_pattern="*.whl",
        artifact_label="wheel",
    )

    combined_output = f"{result.stdout}{result.stderr}"
    assert result.returncode != 0
    assert "Expected exactly one wheel" in combined_output
    assert "setta-0.0.0-py3-none-macosx_14_0_arm64.whl" in combined_output
    assert "setta-0.0.1-py3-none-macosx_14_0_arm64.whl" in combined_output

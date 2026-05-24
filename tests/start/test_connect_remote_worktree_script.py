import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _build_sandbox(tmp_path: Path) -> Path:
    repo_root = _repo_root()
    sandbox_root = tmp_path / "remote_sandbox"
    for rel_path in (
        "connect.sh",
        "remote.sh",
        "scripts/aws-devbox-remote.sh",
        "scripts/aws-devbox-remote-runtime.sh",
    ):
        src = repo_root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)
    return sandbox_root


def _write_capture_stub(path: Path, output_path: Path, label: str) -> None:
    _write_executable(
        path,
        f"""#!/usr/bin/env python3
import os
import sys
from pathlib import Path

payload = "\\n".join([
    "label={label}",
    "argv=" + "\\t".join(sys.argv[1:]),
])
Path(r"{output_path}").write_text(payload, encoding="utf-8")
""",
    )


def _read_capture(path: Path) -> tuple[str, list[str]]:
    raw = path.read_text(encoding="utf-8").splitlines()
    label = raw[0].split("=", 1)[1]
    argv_line = raw[1].split("=", 1)[1]
    argv = [] if argv_line == "" else argv_line.split("\t")
    return label, argv


def test_remote_sh_defaults_to_runtime_select(tmp_path: Path) -> None:
    sandbox_root = _build_sandbox(tmp_path)
    capture_path = tmp_path / "capture.txt"
    _write_capture_stub(
        sandbox_root / "scripts" / "aws-devbox-remote-runtime.sh",
        capture_path,
        "runtime",
    )
    _write_capture_stub(
        sandbox_root / "scripts" / "aws-devbox-remote.sh",
        tmp_path / "unused.txt",
        "nochrome",
    )

    result = subprocess.run(
        ["sh", str(sandbox_root / "remote.sh")],
        cwd=sandbox_root,
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    label, argv = _read_capture(capture_path)
    assert label == "runtime"
    assert argv == ["ai", "select", "--attach"]


def test_remote_sh_routes_nochrome_to_aws_devbox_remote(tmp_path: Path) -> None:
    sandbox_root = _build_sandbox(tmp_path)
    capture_path = tmp_path / "capture.txt"
    _write_capture_stub(
        sandbox_root / "scripts" / "aws-devbox-remote.sh",
        capture_path,
        "nochrome",
    )
    _write_capture_stub(
        sandbox_root / "scripts" / "aws-devbox-remote-runtime.sh",
        tmp_path / "unused.txt",
        "runtime",
    )

    result = subprocess.run(
        ["sh", str(sandbox_root / "remote.sh"), "--nochrome", "--root"],
        cwd=sandbox_root,
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    label, argv = _read_capture(capture_path)
    assert label == "nochrome"
    assert argv == ["--root"]


def test_connect_sh_is_alias_for_remote_sh(tmp_path: Path) -> None:
    sandbox_root = _build_sandbox(tmp_path)
    capture_path = tmp_path / "capture.txt"
    _write_capture_stub(
        sandbox_root / "scripts" / "aws-devbox-remote-runtime.sh",
        capture_path,
        "runtime",
    )
    _write_capture_stub(
        sandbox_root / "scripts" / "aws-devbox-remote.sh",
        tmp_path / "unused.txt",
        "nochrome",
    )

    result = subprocess.run(
        ["sh", str(sandbox_root / "connect.sh"), "reset", "local", "--no-open"],
        cwd=sandbox_root,
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    label, argv = _read_capture(capture_path)
    assert label == "runtime"
    assert argv == ["aireset", "local", "--no-open"]


def test_remote_sh_preserves_attach_flag_for_runtime_script(tmp_path: Path) -> None:
    sandbox_root = _build_sandbox(tmp_path)
    capture_path = tmp_path / "capture.txt"
    _write_capture_stub(
        sandbox_root / "scripts" / "aws-devbox-remote-runtime.sh",
        capture_path,
        "runtime",
    )
    _write_capture_stub(
        sandbox_root / "scripts" / "aws-devbox-remote.sh",
        tmp_path / "unused.txt",
        "nochrome",
    )

    result = subprocess.run(
        ["sh", str(sandbox_root / "remote.sh"), "local", "--attach"],
        cwd=sandbox_root,
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    label, argv = _read_capture(capture_path)
    assert label == "runtime"
    assert argv == ["ai", "local", "--attach"]

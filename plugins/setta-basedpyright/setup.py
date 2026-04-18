from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py as _build_py
from wheel.bdist_wheel import bdist_wheel as _bdist_wheel

PLUGIN_ROOT = Path(__file__).resolve().parent
PACKAGE_NAME = "setta_basedpyright"
SOURCE_MANIFEST_PATH = PLUGIN_ROOT / "setta.plugin.json"
BACKEND_SOURCE_DIR = PLUGIN_ROOT / "backend"


def packaged_backend_file_name() -> str:
    if sys.platform == "win32":
        return "plugin-backend.exe"
    return "plugin-backend"


def packaged_backend_relative_path() -> str:
    return f"backend/{packaged_backend_file_name()}"


def resolve_go_binary() -> str:
    for env_name in ("SETTA_GO_BIN", "GO"):
        candidate = os.environ.get(env_name, "").strip()
        if candidate and Path(candidate).is_file():
            return candidate

    resolved = shutil.which("go")
    if resolved:
        return resolved

    repo_go_script = PLUGIN_ROOT.parent.parent / "scripts" / "go.sh"
    if os.name != "nt" and repo_go_script.is_file():
        return str(repo_go_script)

    raise RuntimeError(
        "Go toolchain is required to build the packaged setta-basedpyright backend"
    )


class build_py(_build_py):
    def run(self) -> None:
        source_backend_path = PLUGIN_ROOT / packaged_backend_relative_path()
        backend_existed = source_backend_path.exists()
        self._build_packaged_backend(source_backend_path)
        try:
            super().run()
            self._write_packaged_manifest()
        finally:
            if not backend_existed and source_backend_path.exists():
                source_backend_path.unlink()

    def get_outputs(self, include_bytecode: bool = True) -> list[str]:
        outputs = list(super().get_outputs(include_bytecode))
        backend_output = str(self._package_root() / packaged_backend_relative_path())
        if backend_output not in outputs:
            outputs.append(backend_output)
        return outputs

    def _build_packaged_backend(self, backend_output: Path) -> None:
        backend_output.parent.mkdir(parents=True, exist_ok=True)

        command = [
            resolve_go_binary(),
            "build",
            "-mod=readonly",
            "-o",
            str(backend_output.resolve()),
            ".",
        ]
        subprocess.run(
            command,
            cwd=BACKEND_SOURCE_DIR,
            check=True,
            env=os.environ.copy(),
        )
        if os.name != "nt":
            backend_output.chmod(0o755)

    def _write_packaged_manifest(self) -> None:
        manifest = json.loads(SOURCE_MANIFEST_PATH.read_text(encoding="utf-8"))
        backend = manifest.get("backend")
        if not isinstance(backend, dict):
            raise RuntimeError("setta-basedpyright manifest backend must be an object")
        backend["entrypoint"] = packaged_backend_relative_path()
        self._package_root().mkdir(parents=True, exist_ok=True)
        (self._package_root() / "setta.plugin.json").write_text(
            json.dumps(manifest, indent=2) + "\n",
            encoding="utf-8",
        )

    def _package_root(self) -> Path:
        return Path(self.build_lib).resolve() / PACKAGE_NAME


class bdist_wheel(_bdist_wheel):
    def finalize_options(self) -> None:
        super().finalize_options()
        self.root_is_pure = False


setup(
    cmdclass={
        "build_py": build_py,
        "bdist_wheel": bdist_wheel,
    }
)

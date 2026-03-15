import json
import tempfile
from collections.abc import Callable
from io import StringIO
from pathlib import Path
from typing import Any

import toml
import yaml
from dotenv import dotenv_values, load_dotenv
from filelock import FileLock

from setta.types.id import ID
from setta.types.project_state import ProjectStateBackend
from setta.utils.paths import normalize_state_path, normalize_workspace_path
from setta.utils.utils import compute_md5_prefix


class DBE:
    def __init__(
        self,
        path: Path,
        *,
        runtime_root: Path | None = None,
        lock_root: Path | None = None,
    ):
        self.path = normalize_state_path(path)
        self.runtime_root = (
            normalize_state_path(runtime_root)
            if runtime_root is not None
            else self.path
        )
        self.lock_root = (
            normalize_state_path(lock_root)
            if lock_root is not None
            else self.runtime_root
        )
        self.project = self.path / "project.json"
        self.prompts = self.path / "prompts"
        self.dot_env = normalize_workspace_path(".env")
        self.path.mkdir(parents=True, exist_ok=True)
        if self.runtime_root != self.path:
            self.runtime_root.mkdir(parents=True, exist_ok=True)
        if self.lock_root not in (self.path, self.runtime_root):
            self.lock_root.mkdir(parents=True, exist_ok=True)

    def get_file_lock(self, path):
        locks_dir = self.lock_root / "file_locks"
        locks_dir.mkdir(parents=True, exist_ok=True)
        # Create a hash to avoid name conflicts
        path_hash = compute_md5_prefix(str(path.absolute()), 8)
        lock_filename = f"{path.name}_{path_hash}.lock"
        lock_path = locks_dir / lock_filename
        return FileLock(lock_path, timeout=10)

    def read(self, path: Path, mode="r"):
        if not path.exists():
            return None
        lock = self.get_file_lock(path)
        with lock:
            with open(path, mode) as f:
                return f.read()

    def write(self, path: Path, data, mode="w"):
        lock = self.get_file_lock(path)

        with lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode=mode, dir=path.parent, delete=False, suffix=".tmp"
            ) as tmp:
                tmp.write(data)
                tmp_path = tmp.name

            Path(tmp_path).replace(path)

    def copy(self, source: Path, dest: Path):
        content = self.read(source, mode="rb")
        if content is None:
            raise FileNotFoundError(f"Source file {source} does not exist")
        self.write(dest, content, mode="wb")

    def read_json(self, path: Path):
        x = self.read(path)
        if x is None:
            return {}
        return json.loads(x)

    def write_json(self, path: Path, data: Any):
        def default(obj: Any):
            if isinstance(obj, Path):
                return str(obj)
            raise TypeError(
                f"Object of type {obj.__class__.__name__} is not JSON serializable"
            )

        self.write(path, json.dumps(data, indent=2, sort_keys=True, default=default))

    def update_json(self, path: Path, update_fn: Callable[[Any], Any]) -> Any:
        """Atomically update a JSON file under a single file lock.

        This prevents lost updates when multiple writers do a read/modify/write cycle
        concurrently.
        """

        def default(obj: Any):
            if isinstance(obj, Path):
                return str(obj)
            raise TypeError(
                f"Object of type {obj.__class__.__name__} is not JSON serializable"
            )

        lock = self.get_file_lock(path)
        with lock:
            payload: Any
            if path.exists():
                raw = path.read_text(encoding="utf-8")
                payload = json.loads(raw) if raw else {}
            else:
                payload = {}

            updated = update_fn(payload)

            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w", dir=path.parent, delete=False, suffix=".tmp"
            ) as tmp:
                tmp.write(
                    json.dumps(updated, indent=2, sort_keys=True, default=default)
                )
                tmp_path = tmp.name

            Path(tmp_path).replace(path)
            return updated

    def read_yaml(self, path: Path) -> Any:
        raw = self.read(path)
        if raw is None:
            return {}
        return yaml.safe_load(raw)

    def write_yaml(self, path: Path, data: Any) -> None:
        payload = yaml.safe_dump(data, sort_keys=False)
        self.write(path, payload)

    def read_toml(self, path: Path) -> Any:
        raw = self.read(path)
        if raw is None:
            return {}
        return toml.loads(raw)

    def write_toml(self, path: Path, data: Any) -> None:
        payload = toml.dumps(data)
        self.write(path, payload)

    def read_jsonl(self, path: Path) -> list[dict]:
        if not path.exists():
            return []

        lock = self.get_file_lock(path)
        items: list[dict] = []
        with lock:
            with open(path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        items.append(json.loads(line))
        return items

    def write_jsonl(self, path: Path, items: list[dict]):
        lock = self.get_file_lock(path)

        with lock:
            with tempfile.NamedTemporaryFile(
                mode="w", dir=path.parent, delete=False, suffix=".tmp"
            ) as tmp:
                for item in items:
                    json.dump(item, tmp, sort_keys=True)
                    tmp.write("\n")
                tmp_path = tmp.name

            Path(tmp_path).replace(path)

    def read_project(self):
        payload = self.read_json(self.project)
        return self._load_project_state_from_payload(payload)

    def write_project(self, project: ProjectStateBackend):
        self.write_json(self.project, project.model_dump(mode="json"))

    def read_project_required(self) -> ProjectStateBackend:
        if not self.project.exists():
            raise FileNotFoundError(f"Project file not found: {self.project}")
        payload = json.loads(self.project.read_text(encoding="utf-8"))
        if not payload:
            raise ValueError(f"Project file is empty: {self.project}")
        return self._load_project_state_from_payload(payload)

    def _load_project_state_from_payload(
        self,
        payload: Any,
    ) -> ProjectStateBackend:
        if not isinstance(payload, dict):
            raise TypeError("Project payload must be a JSON object.")
        return ProjectStateBackend.model_validate(payload)

    def read_dot_env(self) -> dict[str, str]:
        raw = self.read(self.dot_env)
        if raw is None:
            return {}
        env_vars = dotenv_values(stream=StringIO(raw))
        return {key: value for key, value in env_vars.items() if value is not None}

    def reload_dot_env(self) -> None:
        load_dotenv(dotenv_path=self.dot_env, override=True)

    def write_dot_env(self, env_vars: dict[str, str]) -> None:
        lines = [f"{key}={value}" for key, value in env_vars.items()]
        content = "\n".join(lines)
        if content:
            content += "\n"
        self.write(self.dot_env, content)

    def prompt_path(self, prompt_id: ID) -> Path:
        return self.prompts / f"{prompt_id}.json"

    def read_prompt(self, prompt_id: ID) -> dict | None:
        path = self.prompt_path(prompt_id)
        if not path.exists():
            return None
        data = self.read_json(path)
        if not data:
            return None
        return data

    def write_prompt(self, prompt_id: ID, payload: dict) -> None:
        self.write_json(self.prompt_path(prompt_id), payload)

    def list_prompt_paths(self) -> list[Path]:
        if not self.prompts.exists():
            return []
        return sorted(self.prompts.glob("*.json"))

    def delete_prompt_file(self, prompt_id: ID) -> None:
        path = self.prompt_path(prompt_id)
        lock = self.get_file_lock(path)
        with lock:
            if path.exists():
                path.unlink()

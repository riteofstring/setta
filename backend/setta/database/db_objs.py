import json
import tempfile
from io import StringIO
from pathlib import Path
from typing import Any

from dotenv import dotenv_values, load_dotenv
from filelock import FileLock

from setta.types.id import (
    ID,
    CanonicalToTemporaryIDMap,
    TemporaryToCanonicalIDMap,
)
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.share_deployment import ShareDeploymentManifest
from setta.utils.utils import compute_md5_prefix, normalize_path


class DBE:
    def __init__(
        self,
        path: Path,
        *,
        runtime_root: Path | None = None,
        lock_root: Path | None = None,
    ):
        self.path = normalize_path(path)
        self.runtime_root = (
            normalize_path(runtime_root) if runtime_root is not None else self.path
        )
        self.lock_root = (
            normalize_path(lock_root) if lock_root is not None else self.runtime_root
        )
        self.project = self.path / "project.json"
        self.temporary_id_map = self.runtime_root / "temporary_id_map.json"
        self.notifications = self.path / "notifications.json"
        self.settings = self.path / "setta-settings.json"
        self.settings_project = self.path / "setta-settings-project.json"
        self.chats = self.path / "chats"
        self.llm_config = self.path / "llm_config.json"
        self.llm_config_example = self.path / "llm_config.example.json"
        self.agent_profiles = self.path / "agent_profiles.json"
        self.agent_runs = self.path / "agent_runs"
        self.prompts = self.path / "prompts"
        self.prompts_example = self.path / "prompts.example.json"
        self.share_manifest = self.path / "manifest.json"
        self.dot_env = Path(".env")
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
        return ProjectStateBackend.model_validate(self.read_json(self.project))

    def write_project(self, project: ProjectStateBackend):
        self.write_json(self.project, project.model_dump())

    def read_project_required(self) -> ProjectStateBackend:
        if not self.project.exists():
            raise FileNotFoundError(f"Project file not found: {self.project}")
        payload = json.loads(self.project.read_text(encoding="utf-8"))
        if not payload:
            raise ValueError(f"Project file is empty: {self.project}")
        return ProjectStateBackend.model_validate(payload)

    def read_share_manifest(self) -> ShareDeploymentManifest:
        if not self.share_manifest.exists():
            raise FileNotFoundError(
                f"Share deployment manifest not found: {self.share_manifest}"
            )
        payload = json.loads(self.share_manifest.read_text(encoding="utf-8"))
        if not payload:
            raise ValueError(
                f"Share deployment manifest is empty: {self.share_manifest}"
            )
        return ShareDeploymentManifest.model_validate(payload)

    def read_share_manifest_optional(self) -> ShareDeploymentManifest | None:
        if not self.share_manifest.exists():
            return None
        payload = json.loads(self.share_manifest.read_text(encoding="utf-8"))
        if not payload:
            return None
        return ShareDeploymentManifest.model_validate(payload)

    def read_temporary_id_map(self):
        raw_map = self.read_json(self.temporary_id_map)
        canonical_to_temporary: CanonicalToTemporaryIDMap = {
            ID(k): ID(v) for k, v in raw_map.items()
        }
        temporary_to_canonical: TemporaryToCanonicalIDMap = {
            ID(v): ID(k) for k, v in raw_map.items()
        }
        return temporary_to_canonical, canonical_to_temporary

    def write_temporary_id_map(self, canonical_to_temporary: CanonicalToTemporaryIDMap):
        serializable_map = {str(k): str(v) for k, v in canonical_to_temporary.items()}
        self.write_json(self.temporary_id_map, serializable_map)

    def read_notifications(self, projectConfigId: ID | None = None):
        data = self.read_jsonl(self.notifications)
        data = [SettaNotification.model_validate(item) for item in data]
        if projectConfigId:
            return [s for s in data if s.projectConfigId == projectConfigId]
        return data

    def write_notifications(self, notifications: list[SettaNotification]):
        data = [n.model_dump() for n in notifications]
        self.write_jsonl(self.notifications, data)

    def delete_notification(self, notification_id: ID):
        data = self.read_notifications()
        filtered = [item for item in data if item.id != notification_id]
        self.write_notifications(filtered)

    def read_settings_project(self):
        return ProjectStateSingleConfig.model_validate(
            self.read_json(self.settings_project)
        )

    def write_settings_project(self, settings_project: ProjectStateSingleConfig):
        self.write_json(self.settings_project, settings_project.model_dump())

    def read_llm_config(self) -> dict[str, Any]:
        return self.read_json(self.llm_config)

    def write_llm_config(self, payload: Any) -> None:
        self.write_json(self.llm_config, payload)

    def read_llm_config_example(self) -> dict[str, Any]:
        return self.read_json(self.llm_config_example)

    def write_llm_config_example(self, payload: Any) -> None:
        self.write_json(self.llm_config_example, payload)

    def read_prompts_example(self) -> Any:
        return self.read_json(self.prompts_example)

    def write_prompts_example(self, payload: Any) -> None:
        self.write_json(self.prompts_example, payload)

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

    def chat_path(self, chat_id: ID) -> Path:
        return self.chats / f"{chat_id}.json"

    def read_chat(self, chat_id: ID) -> dict | None:
        path = self.chat_path(chat_id)
        if not path.exists():
            return None
        return self.read_json(path)

    def write_chat(self, chat_id: ID, data: Any):
        self.write_json(self.chat_path(chat_id), data)

    def list_chat_paths(self) -> list[Path]:
        if not self.chats.exists():
            return []
        return sorted(self.chats.glob("*.json"))

    def delete_chat_file(self, chat_id: ID):
        path = self.chat_path(chat_id)
        lock = self.get_file_lock(path)
        with lock:
            if path.exists():
                path.unlink()

    def read_agent_profiles(self) -> list[dict]:
        payload = self.read_json(self.agent_profiles)
        if not payload:
            return []
        if not isinstance(payload, list):
            raise ValueError("agent_profiles.json must contain a list of profiles")
        return payload

    def write_agent_profiles(self, payload: list[dict]) -> None:
        self.write_json(self.agent_profiles, payload)

    def agent_run_path(self, run_id: ID) -> Path:
        return self.agent_runs / f"{run_id}.json"

    def read_agent_run(self, run_id: ID) -> dict | None:
        path = self.agent_run_path(run_id)
        if not path.exists():
            return None
        data = self.read_json(path)
        if not data:
            return None
        return data

    def write_agent_run(self, run_id: ID, payload: dict) -> None:
        self.write_json(self.agent_run_path(run_id), payload)

    def list_agent_run_paths(self) -> list[Path]:
        if not self.agent_runs.exists():
            return []
        return sorted(self.agent_runs.glob("*.json"))

    def delete_agent_run_file(self, run_id: ID) -> None:
        path = self.agent_run_path(run_id)
        lock = self.get_file_lock(path)
        with lock:
            if path.exists():
                path.unlink()

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

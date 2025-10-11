import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any

from filelock import FileLock

from setta.types.ai import IDToUUIDForLLM, UUIDToIDForLLM
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.utils.utils import normalize_path


class DBE:
    def __init__(self, path: Path):
        self.path = normalize_path(path)
        self.project = self.path / "project.json"
        self.uuid_mapping = self.path / "uuid_mapping.json"
        self.notifications = self.path / "notifications.json"
        self.settings = self.path / "setta-settings.json"
        self.settings_project = self.path / "setta-settings-project.json"
        self.chats = self.path / "chats"
        self.path.mkdir(parents=True, exist_ok=True)

    def get_file_lock(self, path):
        locks_dir = self.path / "file_locks"
        locks_dir.mkdir(exist_ok=True)
        # Create a hash to avoid name conflicts
        path_hash = hashlib.md5(str(path.absolute()).encode()).hexdigest()[:8]
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
        self.write(path, json.dumps(data, indent=2, sort_keys=True))

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

    def read_uuid_mapping(self):
        uuid_to_id: UUIDToIDForLLM = self.read_json(self.uuid_mapping)
        id_to_uuid: IDToUUIDForLLM = {v: k for k, v in uuid_to_id.items()}
        return id_to_uuid, uuid_to_id

    def write_uuid_mapping(self, uuid_to_id: UUIDToIDForLLM):
        self.write_json(self.uuid_mapping, uuid_to_id)

    def read_notifications(self, projectConfigId: str | None = None):
        data = self.read_jsonl(self.notifications)
        data = [SettaNotification.model_validate(item) for item in data]
        if projectConfigId:
            return [s for s in data if s.projectConfigId == projectConfigId]
        return data

    def write_notifications(self, notifications: list[SettaNotification]):
        data = [n.model_dump() for n in notifications]
        self.write_jsonl(self.notifications, data)

    def delete_notification(self, notification_id: str):
        data = self.read_notifications()
        filtered = [item for item in data if item.id != notification_id]
        self.write_notifications(filtered)

    def read_settings_project(self):
        return ProjectStateSingleConfig.model_validate(
            self.read_json(self.settings_project)
        )

    def write_settings_project(self, settings_project: ProjectStateSingleConfig):
        self.write_json(self.settings_project, settings_project.model_dump())

    def chat_path(self, chat_id: str) -> Path:
        return self.chats / f"{chat_id}.json"

    def read_chat(self, chat_id: str) -> dict | None:
        path = self.chat_path(chat_id)
        if not path.exists():
            return None
        return self.read_json(path)

    def write_chat(self, chat_id: str, data: Any):
        self.write_json(self.chat_path(chat_id), data)

    def list_chat_paths(self) -> list[Path]:
        if not self.chats.exists():
            return []
        return sorted(self.chats.glob("*.json"))

    def delete_chat_file(self, chat_id: str):
        path = self.chat_path(chat_id)
        lock = self.get_file_lock(path)
        with lock:
            if path.exists():
                path.unlink()

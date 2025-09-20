import json
import tempfile
from pathlib import Path
from typing import Any

from filelock import FileLock

from setta.types.ai import IDToUUIDForLLM, UUIDToIDForLLM
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateBackend


class DBE:
    def __init__(self, path: Path):
        self.path = path
        self.project = self.path / "project.json"
        self.uuid_mapping = self.path / "uuid_mapping.json"
        self.notifications = self.path / "notifications.json"
        self.path.mkdir(parents=True, exist_ok=True)

    def get_file_lock(self, path):
        return FileLock(f"{path}.lock", timeout=10)

    def read(self, path: Path):
        if not path.exists():
            return {}

        lock = self.get_file_lock(path)
        with lock:
            with open(path, "r") as f:
                return json.load(f)

    def write(self, path: Path, data: Any) -> None:
        lock = self.get_file_lock(path)

        with lock:
            with tempfile.NamedTemporaryFile(
                mode="w", dir=path.parent, delete=False, suffix=".tmp"
            ) as tmp:
                json.dump(data, tmp, indent=2, sort_keys=True)
                tmp_path = tmp.name

            Path(tmp_path).replace(path)

    def read_jsonl(self, path: Path) -> list[dict]:
        if not path.exists():
            return []

        lock = self.get_file_lock(path)
        items = []
        with lock:
            with open(path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        items.append(json.loads(line))
        return items

    def write_jsonl(self, path: Path, items: list[dict]) -> None:
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
        return ProjectStateBackend.model_validate(self.read(self.project))

    def write_project(self, project: ProjectStateBackend):
        x = project.model_dump()
        self.write(self.project, x)

    def read_uuid_mapping(self):
        uuid_to_id: UUIDToIDForLLM = self.read(self.uuid_mapping)
        id_to_uuid: IDToUUIDForLLM = {v: k for k, v in uuid_to_id.items()}
        return id_to_uuid, uuid_to_id

    def write_uuid_mapping(self, uuid_to_id: UUIDToIDForLLM):
        self.write(self.uuid_mapping, uuid_to_id)

    def read_notifications(
        self, projectConfigId: str | None = None
    ) -> list[SettaNotification]:
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

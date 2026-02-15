import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from setta.database.db_objs import DBE
from setta.types.binary_content import BinaryContentRef
from setta.utils.constants import C

DEFAULT_CHUNK_SIZE = 1024 * 1024


class BinaryPayloadTooLargeError(ValueError):
    def __init__(self, *, max_bytes: int, observed_bytes: int) -> None:
        super().__init__(
            f"Binary payload is too large. Maximum size is {max_bytes} bytes."
        )
        self.max_bytes = max_bytes
        self.observed_bytes = observed_bytes


@dataclass(frozen=True)
class BinaryStore:
    root: Path
    ttl_seconds: int = C.BINARY_TTL_SECONDS
    _last_cleanup_at: float | None = field(
        default=None, init=False, repr=False, compare=False
    )
    _writes_since_cleanup: int = field(default=0, init=False, repr=False, compare=False)

    @classmethod
    def from_dbe(cls, dbe: DBE) -> "BinaryStore":
        return cls(root=dbe.runtime_root / C.BINARY_FOLDER_NAME)

    def _ensure_root(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def _content_path(self, content_id: str) -> Path:
        return self.root / content_id

    def _metadata_path(self, content_id: str) -> Path:
        return self.root / f"{content_id}.json"

    def _guard_content_id(self, content_id: str) -> None:
        if (
            not content_id
            or content_id in {".", ".."}
            or "/" in content_id
            or "\\" in content_id
        ):
            raise ValueError(f"Invalid content id: {content_id!r}")

    def _record_write(self) -> None:
        object.__setattr__(
            self, "_writes_since_cleanup", self._writes_since_cleanup + 1
        )

    def _should_cleanup(self, now: float) -> bool:
        interval = C.BINARY_CLEANUP_INTERVAL_SECONDS
        write_interval = C.BINARY_CLEANUP_WRITE_INTERVAL
        if interval <= 0 and write_interval <= 0:
            return True
        if write_interval > 0 and self._writes_since_cleanup >= write_interval:
            return True
        last_cleanup = self._last_cleanup_at
        if interval > 0 and (last_cleanup is None or now - last_cleanup >= interval):
            return True
        return False

    def _write_metadata(self, ref: BinaryContentRef, *, durable: bool) -> None:
        metadata_path = self._metadata_path(ref.contentId)
        payload = {
            "byteLength": ref.byteLength,
            "mimeType": ref.mimeType,
            "sha256": ref.sha256,
            "durable": durable,
        }
        metadata_path.write_text(json.dumps(payload, separators=(",", ":")))

    def _read_metadata(self, content_id: str) -> dict[str, object] | None:
        metadata_path = self._metadata_path(content_id)
        if not metadata_path.exists():
            return None
        try:
            return json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None

    def _is_durable(self, content_id: str) -> bool:
        metadata = self._read_metadata(content_id)
        if not metadata:
            return False
        return metadata.get("durable") is True

    def _build_ref(
        self,
        content_id: str,
        *,
        byte_length: int,
        mime_type: str | None,
        sha256: str | None,
    ) -> BinaryContentRef:
        return BinaryContentRef(
            contentId=content_id,
            byteLength=byte_length,
            mimeType=mime_type,
            sha256=sha256,
        )

    def store_bytes(
        self,
        data: bytes,
        *,
        mime_type: str | None = None,
        durable: bool = False,
    ) -> BinaryContentRef:
        self._ensure_root()
        content_id = uuid4().hex
        path = self._content_path(content_id)
        path.write_bytes(data)
        sha256 = hashlib.sha256(data).hexdigest()
        ref = self._build_ref(
            content_id,
            byte_length=len(data),
            mime_type=mime_type,
            sha256=sha256,
        )
        self._write_metadata(ref, durable=durable)
        self._record_write()
        self.cleanup_expired()
        return ref

    def store_stream(
        self,
        stream: BinaryIO,
        *,
        mime_type: str | None = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        durable: bool = False,
        max_bytes: int | None = None,
    ) -> BinaryContentRef:
        self._ensure_root()
        content_id = uuid4().hex
        path = self._content_path(content_id)
        sha256 = hashlib.sha256()
        total = 0
        try:
            with open(path, "wb") as handle:
                while True:
                    chunk = stream.read(chunk_size)
                    if not chunk:
                        break
                    next_total = total + len(chunk)
                    if max_bytes is not None and next_total > max_bytes:
                        raise BinaryPayloadTooLargeError(
                            max_bytes=max_bytes,
                            observed_bytes=next_total,
                        )
                    handle.write(chunk)
                    sha256.update(chunk)
                    total = next_total
        except Exception:
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass
            raise
        ref = self._build_ref(
            content_id,
            byte_length=total,
            mime_type=mime_type,
            sha256=sha256.hexdigest(),
        )
        self._write_metadata(ref, durable=durable)
        self._record_write()
        self.cleanup_expired()
        return ref

    def resolve_content(self, content_id: str) -> Path | None:
        self._guard_content_id(content_id)
        path = self._content_path(content_id)
        if not path.exists():
            return None
        return path

    def resolve_metadata(self, content_id: str) -> BinaryContentRef | None:
        self._guard_content_id(content_id)
        metadata = self._read_metadata(content_id)
        if not metadata:
            return None
        byte_length = metadata.get("byteLength")
        if not isinstance(byte_length, int):
            return None
        mime_type = metadata.get("mimeType")
        if mime_type is not None and not isinstance(mime_type, str):
            mime_type = None
        sha256 = metadata.get("sha256")
        if sha256 is not None and not isinstance(sha256, str):
            sha256 = None
        return self._build_ref(
            content_id,
            byte_length=byte_length,
            mime_type=mime_type,
            sha256=sha256,
        )

    def read_bytes(self, content_id: str) -> bytes:
        path = self.resolve_content(content_id)
        if path is None:
            raise FileNotFoundError(f"Missing binary payload: {content_id}")
        return path.read_bytes()

    def promote_to_durable(
        self, content_id: str, *, mime_type: str | None = None
    ) -> BinaryContentRef:
        self._guard_content_id(content_id)
        path = self._content_path(content_id)
        if not path.exists():
            raise FileNotFoundError(f"Missing binary payload: {content_id}")
        metadata = self._read_metadata(content_id) or {}
        byte_length = metadata.get("byteLength")
        if not isinstance(byte_length, int):
            byte_length = path.stat().st_size
        existing_mime = metadata.get("mimeType")
        if existing_mime is not None and not isinstance(existing_mime, str):
            existing_mime = None
        sha256 = metadata.get("sha256")
        if sha256 is not None and not isinstance(sha256, str):
            sha256 = None
        ref = self._build_ref(
            content_id,
            byte_length=byte_length,
            mime_type=mime_type or existing_mime,
            sha256=sha256,
        )
        self._write_metadata(ref, durable=True)
        return ref

    def delete(self, content_id: str) -> None:
        self._guard_content_id(content_id)
        path = self._content_path(content_id)
        if path.exists():
            path.unlink()
        metadata_path = self._metadata_path(content_id)
        if metadata_path.exists():
            metadata_path.unlink()

    def cleanup_expired(self) -> None:
        if self.ttl_seconds <= 0:
            return
        if not self.root.exists():
            return
        now = time.time()
        if not self._should_cleanup(now):
            return
        object.__setattr__(self, "_last_cleanup_at", now)
        object.__setattr__(self, "_writes_since_cleanup", 0)
        cutoff = now - self.ttl_seconds
        for entry in self.root.iterdir():
            if entry.is_dir():
                continue
            if entry.suffix == ".json":
                continue
            content_id = entry.name
            if self._is_durable(content_id):
                continue
            try:
                mtime = entry.stat().st_mtime
            except OSError:
                continue
            if mtime >= cutoff:
                continue
            try:
                entry.unlink()
            except OSError:
                continue
            metadata_path = self._metadata_path(content_id)
            if metadata_path.exists():
                try:
                    metadata_path.unlink()
                except OSError:
                    continue
        for metadata_path in self.root.glob("*.json"):
            content_id = metadata_path.stem
            if self._content_path(content_id).exists():
                continue
            try:
                metadata_path.unlink()
            except OSError:
                continue

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BinaryContentRef:
    contentId: str
    byteLength: int
    mimeType: str | None = None
    sha256: str | None = None

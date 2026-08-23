"""Small, deterministic JSON process-boundary helpers."""

from __future__ import annotations

import json
from typing import TextIO


def write_json(writer: TextIO, document: object, *, pretty: bool = False) -> None:
    if pretty:
        payload = json.dumps(document, indent=2, sort_keys=True)
    else:
        payload = json.dumps(document, separators=(",", ":"), sort_keys=True)
    writer.write(payload)
    writer.write("\n")
    writer.flush()

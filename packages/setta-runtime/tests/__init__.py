from __future__ import annotations

import sys
from pathlib import Path

_RUNTIME_ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(_RUNTIME_ROOT), str(_RUNTIME_ROOT / "src")]

from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

_REQUIRED_GO_BINARY_STEMS = ("setta", "setta-server")


class SettaWheelBuildHook(BuildHookInterface):
    PLUGIN_NAME = "setta-wheel"

    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        del version
        if self.target_name != "wheel":
            return

        self._require_packaged_go_binaries()

        # Packaged Go executables make the wheel platform-specific.
        build_data["pure_python"] = False
        build_data["infer_tag"] = True

    def _require_packaged_go_binaries(self) -> None:
        go_bin_dir = Path(self.root) / "backend" / "setta" / "go_bin"
        missing_binaries = [
            binary_stem
            for binary_stem in _REQUIRED_GO_BINARY_STEMS
            if self._resolve_binary(go_bin_dir, binary_stem) is None
        ]
        if missing_binaries:
            missing = ", ".join(missing_binaries)
            raise RuntimeError(
                "Wheel builds require packaged Go binaries under backend/setta/go_bin. "
                "Run ./scripts/build_packaged_go_binaries.sh or "
                "./scripts/build_python_distribution_with_go_binaries.sh before "
                f"building a wheel. Missing: {missing}"
            )

    def _resolve_binary(self, go_bin_dir: Path, binary_stem: str) -> Path | None:
        candidates = (
            go_bin_dir / binary_stem,
            go_bin_dir / f"{binary_stem}.exe",
        )
        for candidate in candidates:
            if candidate.is_file():
                return candidate
        return None

def get_build_hook() -> type[SettaWheelBuildHook]:
    return SettaWheelBuildHook

import platform
from pathlib import Path

_NODE_VENDOR_ROOT = Path(__file__).resolve().parent.parent / "vendor" / "node"


def _normalize_machine(machine: str) -> str | None:
    normalized = machine.lower()
    if normalized in ("x86_64", "amd64"):
        return "x64"
    if normalized in ("arm64", "aarch64"):
        return "arm64"
    return None


def _normalize_system(system: str) -> str | None:
    normalized = system.lower()
    if normalized == "darwin":
        return "darwin"
    if normalized == "linux":
        return "linux"
    if normalized == "windows":
        return "win"
    return None


def get_platform_tag() -> str | None:
    os_tag = _normalize_system(platform.system())
    arch_tag = _normalize_machine(platform.machine())
    if not os_tag or not arch_tag:
        return None
    return f"{os_tag}-{arch_tag}"


def get_bundled_node_path() -> Path | None:
    platform_tag = get_platform_tag()
    if not platform_tag:
        return None
    root = _NODE_VENDOR_ROOT / platform_tag
    candidates = [root / "node", root / "node.exe", root / "bin" / "node"]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def resolve_node_command(command_path: str | None) -> str:
    if command_path:
        normalized = command_path.strip()
        if normalized:
            return normalized
    bundled = get_bundled_node_path()
    if bundled is not None:
        return str(bundled)
    return "node"

import os
from pathlib import Path


def iter_skill_roots(workspace_root: Path) -> list[tuple[str, str, Path]]:
    """Return deduplicated skill roots discovered from workspace, user, and env."""
    home = Path.home()
    xdg_config_home_raw = os.environ.get("XDG_CONFIG_HOME")
    if xdg_config_home_raw:
        xdg_config_home = Path(xdg_config_home_raw)
    else:
        xdg_config_home = home / ".config"
    candidates = [
        (
            "workspace_agents_skills",
            "Workspace .agents/skills",
            workspace_root / ".agents" / "skills",
        ),
        (
            "workspace_claude_skills",
            "Workspace .claude/skills",
            workspace_root / ".claude" / "skills",
        ),
        (
            "workspace_opencode_skills",
            "Workspace .opencode/skills",
            workspace_root / ".opencode" / "skills",
        ),
        ("user_agents_skills", "User ~/.agents/skills", home / ".agents" / "skills"),
        ("user_claude_skills", "User ~/.claude/skills", home / ".claude" / "skills"),
        (
            "user_opencode_skills",
            "User ${XDG_CONFIG_HOME:-~/.config}/opencode/skills",
            xdg_config_home / "opencode" / "skills",
        ),
        ("admin_codex_skills", "Admin /etc/codex/skills", Path("/etc/codex/skills")),
    ]
    env_candidates = [
        (
            "agents_home_skills",
            "AGENTS_HOME skills",
            os.environ.get("AGENTS_HOME"),
        ),
        (
            "codex_home_skills",
            "CODEX_HOME skills",
            os.environ.get("CODEX_HOME"),
        ),
    ]
    for root_id, label, raw_path in env_candidates:
        if not raw_path:
            continue
        base_path = Path(raw_path).expanduser().resolve(strict=False)
        root_path = base_path if base_path.name == "skills" else base_path / "skills"
        candidates.append((root_id, label, root_path))

    roots: list[tuple[str, str, Path]] = []
    seen_paths: set[Path] = set()
    for root_id, label, root_path in candidates:
        resolved = root_path.expanduser().resolve(strict=False)
        if resolved in seen_paths:
            continue
        seen_paths.add(resolved)
        roots.append((root_id, label, resolved))
    return roots

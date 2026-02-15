import os
from pathlib import Path

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, Field

from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.utils.paths import get_setta_paths

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])

_SKIP_SEGMENTS = {"node_modules", ".git", "setta_files", "dist", "build"}


class AppGenSkillEntry(BaseModel):
    skillId: str
    name: str
    rootLabel: str
    rootPath: str
    relativePath: str
    skillPath: str
    description: str = Field(default="")


class GetAppGenSkillContentRequest(BaseModel):
    skillId: str


class AppGenSkillContent(BaseModel):
    skillId: str
    content: str


def _iter_skill_roots(workspace_root: Path) -> list[tuple[str, str, Path]]:
    home = Path.home()
    candidates = [
        ("workspace_skills", "Workspace skills", workspace_root / "skills"),
        (
            "workspace_agents_skills",
            "Workspace .agents/skills",
            workspace_root / ".agents" / "skills",
        ),
        ("user_agents_skills", "User ~/.agents/skills", home / ".agents" / "skills"),
        ("user_codex_skills", "User ~/.codex/skills", home / ".codex" / "skills"),
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


def _extract_skill_description(skill_doc: Path) -> str:
    try:
        raw = skill_doc.read_text(encoding="utf-8")
    except OSError:
        return ""
    for line in raw.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        return trimmed[:240]
    return ""


def list_app_gen_skills(workspace_root: Path) -> list[AppGenSkillEntry]:
    rows: list[AppGenSkillEntry] = []
    for root_id, label, root_path in _iter_skill_roots(workspace_root):
        if not root_path.exists() or not root_path.is_dir():
            continue
        for skill_doc in root_path.rglob("SKILL.md"):
            if any(segment in _SKIP_SEGMENTS for segment in skill_doc.parts):
                continue
            skill_dir = skill_doc.parent
            try:
                relative = skill_dir.relative_to(root_path).as_posix()
            except ValueError:
                continue
            relative_path = relative if relative else "."
            rows.append(
                AppGenSkillEntry(
                    skillId=f"{root_id}::{relative_path}",
                    name=skill_dir.name,
                    rootLabel=label,
                    rootPath=str(root_path),
                    relativePath=relative_path,
                    skillPath=str(skill_doc),
                    description=_extract_skill_description(skill_doc),
                )
            )
    rows.sort(
        key=lambda row: (
            row.rootLabel.lower(),
            row.relativePath.lower(),
            row.name.lower(),
        )
    )
    return rows


def read_app_gen_skill_content(
    *,
    workspace_root: Path,
    skill_id: str,
) -> AppGenSkillContent:
    raw_id = skill_id.strip()
    if "::" not in raw_id:
        raise ValueError("Invalid skill id.")
    root_id, relative_path = raw_id.split("::", 1)
    roots = {entry[0]: entry[2] for entry in _iter_skill_roots(workspace_root)}
    if root_id not in roots:
        raise KeyError(f"Unknown skill root: {root_id}")
    root_path = roots[root_id].resolve(strict=False)
    relative = relative_path.strip()
    if relative in ("", "."):
        skill_dir = root_path
    else:
        skill_dir = (root_path / relative).resolve(strict=False)
    if not skill_dir.is_relative_to(root_path):
        raise ValueError("Invalid skill path.")
    skill_doc = skill_dir / "SKILL.md"
    if not skill_doc.exists():
        raise KeyError(f"Missing SKILL.md for {raw_id}")
    try:
        content = skill_doc.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(str(exc)) from exc
    return AppGenSkillContent(skillId=raw_id, content=content)


@router.get(Route.GET_APP_GEN_SKILLS)
async def route_get_app_gen_skills() -> list[AppGenSkillEntry]:
    workspace_root = get_setta_paths().workspace_root
    return list_app_gen_skills(workspace_root)


@router.post(Route.GET_APP_GEN_SKILL_CONTENT)
async def route_get_app_gen_skill_content(
    x: GetAppGenSkillContentRequest,
) -> AppGenSkillContent:
    workspace_root = get_setta_paths().workspace_root
    try:
        return read_app_gen_skill_content(
            workspace_root=workspace_root,
            skill_id=x.skillId,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

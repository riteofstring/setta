import codecs
import os
from pathlib import Path

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, Field

from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.utils.paths import get_setta_paths
from setta.utils.skill_roots import iter_skill_roots

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])

_SKIP_SEGMENTS = {"node_modules", ".git", "setta_files", "dist", "build"}
_MAX_SKILL_CONTENT_PREVIEW_BYTES = 262_144


class AppGenSkillEntry(BaseModel):
    skillId: str
    name: str
    rootLabel: str
    rootPath: str
    relativePath: str
    description: str = Field(default="")


class GetAppGenSkillContentRequest(BaseModel):
    skillId: str


class AppGenSkillContent(BaseModel):
    skillId: str
    content: str
    truncated: bool = False
    originalSizeBytes: int


def _extract_skill_description(skill_doc: Path) -> str:
    try:
        with skill_doc.open("r", encoding="utf-8") as handle:
            for line in handle:
                trimmed = line.strip()
                if not trimmed or trimmed.startswith("#"):
                    continue
                return trimmed[:240]
    except (OSError, UnicodeError):
        return ""
    return ""


def _iter_skill_docs(root_path: Path):
    for current_dir, dirnames, filenames in os.walk(root_path, topdown=True):
        dirnames[:] = [name for name in dirnames if name not in _SKIP_SEGMENTS]
        if "SKILL.md" not in filenames:
            continue
        yield Path(current_dir) / "SKILL.md"


def list_app_gen_skills(workspace_root: Path) -> list[AppGenSkillEntry]:
    rows: list[AppGenSkillEntry] = []
    for root_id, label, root_path in iter_skill_roots(workspace_root):
        try:
            root_exists = root_path.exists()
            root_is_dir = root_path.is_dir()
        except OSError:
            # Permission errors (for example /etc/codex/skills) should not
            # break skills discovery for other readable roots.
            continue
        if not root_exists or not root_is_dir:
            continue
        try:
            for skill_doc in _iter_skill_docs(root_path):
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
                        description=_extract_skill_description(skill_doc),
                    )
                )
        except OSError:
            # If walking a root fails, keep other roots visible.
            continue
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
    roots = {entry[0]: entry[2] for entry in iter_skill_roots(workspace_root)}
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
    try:
        skill_doc_exists = skill_doc.exists()
    except OSError as exc:
        raise ValueError(str(exc)) from exc
    if not skill_doc_exists:
        raise KeyError(f"Missing SKILL.md for {raw_id}")
    try:
        original_size_bytes = skill_doc.stat().st_size
        with skill_doc.open("rb") as handle:
            preview_bytes = handle.read(_MAX_SKILL_CONTENT_PREVIEW_BYTES + 1)
    except OSError as exc:
        raise ValueError(str(exc)) from exc
    truncated = original_size_bytes > _MAX_SKILL_CONTENT_PREVIEW_BYTES
    if truncated:
        preview_bytes = preview_bytes[:_MAX_SKILL_CONTENT_PREVIEW_BYTES]
    decoder = codecs.getincrementaldecoder("utf-8")()
    try:
        content = decoder.decode(preview_bytes, final=not truncated)
    except UnicodeDecodeError as exc:
        raise ValueError(str(exc)) from exc
    return AppGenSkillContent(
        skillId=raw_id,
        content=content,
        truncated=truncated,
        originalSizeBytes=original_size_bytes,
    )


@router.get(Route.GET_APP_GEN_SKILLS)
def route_get_app_gen_skills() -> list[AppGenSkillEntry]:
    workspace_root = get_setta_paths().workspace_root
    return list_app_gen_skills(workspace_root)


@router.post(Route.GET_APP_GEN_SKILL_CONTENT)
def route_get_app_gen_skill_content(
    x: GetAppGenSkillContentRequest,
) -> AppGenSkillContent:
    workspace_root = get_setta_paths().workspace_root
    try:
        return read_app_gen_skill_content(
            workspace_root=workspace_root,
            skill_id=x.skillId,
        )
    except KeyError as exc:
        detail = exc.args[0] if exc.args else str(exc)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

import codecs
import os
from pathlib import Path
import re

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
_CUSTOM_SKILL_RELATIVE_PATH_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_CUSTOM_SKILL_ROOT_PRIORITY = (
    "agents_home_skills",
    "user_agents_skills",
    "workspace_agents_skills",
)
_CUSTOM_SKILL_EDITABLE_ROOT_IDS = frozenset(_CUSTOM_SKILL_ROOT_PRIORITY)


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


class UpsertAppGenCustomSkillRequest(BaseModel):
    skillId: str | None = None
    relativePath: str | None = None
    content: str


class UpsertAppGenCustomSkillResponse(BaseModel):
    skillId: str
    created: bool
    rootPath: str
    skillDocPath: str


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


def _resolve_skill_roots_by_id(workspace_root: Path) -> dict[str, tuple[str, Path]]:
    roots: dict[str, tuple[str, Path]] = {}
    for root_id, root_label, root_path in iter_skill_roots(workspace_root):
        roots[root_id] = (root_label, root_path)
    return roots


def _split_skill_id(skill_id: str) -> tuple[str, str]:
    raw_id = skill_id.strip()
    if "::" not in raw_id:
        raise ValueError("Invalid skill id.")
    return raw_id.split("::", 1)


def _resolve_skill_doc_path_from_id(
    *,
    workspace_root: Path,
    skill_id: str,
) -> tuple[str, str, Path, str, Path]:
    root_id, relative_path = _split_skill_id(skill_id)
    roots = _resolve_skill_roots_by_id(workspace_root)
    if root_id not in roots:
        raise KeyError(f"Unknown skill root: {root_id}")
    root_label, root_path = roots[root_id]
    resolved_root_path = root_path.resolve(strict=False)
    relative = relative_path.strip()
    if relative in ("", "."):
        skill_dir = resolved_root_path
        normalized_relative_path = "."
    else:
        skill_dir = (resolved_root_path / relative).resolve(strict=False)
        normalized_relative_path = relative
    if not skill_dir.is_relative_to(resolved_root_path):
        raise ValueError("Invalid skill path.")
    return (
        root_id,
        root_label,
        resolved_root_path,
        normalized_relative_path,
        skill_dir / "SKILL.md",
    )


def _resolve_default_custom_skill_root(
    workspace_root: Path,
) -> tuple[str, str, Path]:
    roots = list(iter_skill_roots(workspace_root))
    roots_by_id: dict[str, tuple[str, Path]] = {}
    for root_id, root_label, root_path in roots:
        roots_by_id[root_id] = (root_label, root_path.resolve(strict=False))
    for root_id in _CUSTOM_SKILL_ROOT_PRIORITY:
        if root_id in roots_by_id:
            root_label, root_path = roots_by_id[root_id]
            return root_id, root_label, root_path
    fallback_root = (Path.home() / ".agents" / "skills").resolve(strict=False)
    return "user_agents_skills", "User ~/.agents/skills", fallback_root


def _normalize_custom_skill_relative_path(relative_path: str) -> str:
    normalized = relative_path.strip()
    if not _CUSTOM_SKILL_RELATIVE_PATH_PATTERN.fullmatch(normalized):
        raise ValueError(
            "relativePath must start with an alphanumeric character and only "
            "contain letters, numbers, underscores, or hyphens."
        )
    return normalized


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
    _, _, _, _, skill_doc = _resolve_skill_doc_path_from_id(
        workspace_root=workspace_root,
        skill_id=raw_id,
    )
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


def upsert_app_gen_custom_skill(
    *,
    workspace_root: Path,
    skill_id: str | None,
    relative_path: str | None,
    content: str,
) -> UpsertAppGenCustomSkillResponse:
    selected_skill_id = (skill_id or "").strip()
    selected_relative_path = (relative_path or "").strip()
    if selected_skill_id and selected_relative_path:
        raise ValueError("Provide either skillId or relativePath, not both.")
    if not selected_skill_id and not selected_relative_path:
        raise ValueError("relativePath is required when skillId is not provided.")

    target_root_id, _, target_root_path = _resolve_default_custom_skill_root(
        workspace_root
    )
    target_root_path.mkdir(parents=True, exist_ok=True)

    if selected_skill_id:
        (
            existing_root_id,
            _,
            existing_root_path,
            existing_relative_path,
            existing_skill_doc,
        ) = _resolve_skill_doc_path_from_id(
            workspace_root=workspace_root,
            skill_id=selected_skill_id,
        )
        if existing_root_id not in _CUSTOM_SKILL_EDITABLE_ROOT_IDS:
            raise ValueError(
                "Only skills under AGENTS_HOME/skills, ~/.agents/skills, or "
                "workspace .agents/skills are editable."
            )
        target_root_id = existing_root_id
        target_root_path = existing_root_path
        if existing_relative_path in ("", "."):
            raise ValueError("Editing root-level SKILL.md is not supported.")
        target_relative_path = existing_relative_path
        skill_doc = existing_skill_doc
    else:
        target_relative_path = _normalize_custom_skill_relative_path(
            selected_relative_path
        )
        skill_doc = (target_root_path / target_relative_path / "SKILL.md").resolve(
            strict=False
        )
        if not skill_doc.is_relative_to(target_root_path):
            raise ValueError("Invalid skill path.")

    created = False
    try:
        created = not skill_doc.exists()
        skill_doc.parent.mkdir(parents=True, exist_ok=True)
        with skill_doc.open("w", encoding="utf-8") as handle:
            handle.write(content)
    except OSError as exc:
        raise ValueError(str(exc)) from exc

    return UpsertAppGenCustomSkillResponse(
        skillId=f"{target_root_id}::{target_relative_path}",
        created=created,
        rootPath=str(target_root_path),
        skillDocPath=str(skill_doc),
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


@router.post(Route.UPSERT_APP_GEN_CUSTOM_SKILL)
def route_upsert_app_gen_custom_skill(
    x: UpsertAppGenCustomSkillRequest,
) -> UpsertAppGenCustomSkillResponse:
    workspace_root = get_setta_paths().workspace_root
    try:
        return upsert_app_gen_custom_skill(
            workspace_root=workspace_root,
            skill_id=x.skillId,
            relative_path=x.relativePath,
            content=x.content,
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

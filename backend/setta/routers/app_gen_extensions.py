import codecs
import os
import re
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
    isEditable: bool
    editabilityReason: str | None = None
    description: str = Field(default="")


class GetAppGenSkillsResponse(BaseModel):
    skills: list[AppGenSkillEntry]
    customSkillCreateRootPath: str | None = None
    customSkillCreateRootActionable: bool = False


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


def _iter_prioritized_custom_skill_roots(
    workspace_root: Path,
) -> list[tuple[str, str, Path]]:
    env_agents_home = os.environ.get("AGENTS_HOME")
    candidates: list[tuple[str, str, Path]] = []
    if env_agents_home:
        agents_home_root = Path(env_agents_home).expanduser().resolve(strict=False)
        agents_home_skills = (
            agents_home_root
            if agents_home_root.name == "skills"
            else agents_home_root / "skills"
        )
        candidates.append(
            ("agents_home_skills", "AGENTS_HOME skills", agents_home_skills)
        )
    candidates.extend(
        [
            (
                "user_agents_skills",
                "User ~/.agents/skills",
                Path.home() / ".agents" / "skills",
            ),
            (
                "workspace_agents_skills",
                "Workspace .agents/skills",
                workspace_root / ".agents" / "skills",
            ),
        ]
    )

    deduped_candidates: list[tuple[str, str, Path]] = []
    seen_paths: set[Path] = set()
    for root_id, root_label, root_path in candidates:
        resolved_root_path = root_path.expanduser().resolve(strict=False)
        if resolved_root_path in seen_paths:
            continue
        seen_paths.add(resolved_root_path)
        deduped_candidates.append((root_id, root_label, resolved_root_path))

    prioritized_roots: list[tuple[str, str, Path]] = []
    for root_id in _CUSTOM_SKILL_ROOT_PRIORITY:
        for candidate_root_id, root_label, root_path in deduped_candidates:
            if candidate_root_id != root_id:
                continue
            prioritized_roots.append((candidate_root_id, root_label, root_path))
            break
    if prioritized_roots:
        return prioritized_roots
    fallback_root = (Path.home() / ".agents" / "skills").resolve(strict=False)
    return [("user_agents_skills", "User ~/.agents/skills", fallback_root)]


def _resolve_discoverable_root_id_for_path(
    *,
    workspace_root: Path,
    root_path: Path,
    fallback_root_id: str,
) -> str:
    resolved_target_root = root_path.resolve(strict=False)
    for root_id, _, discovered_root_path in iter_skill_roots(workspace_root):
        if discovered_root_path.resolve(strict=False) == resolved_target_root:
            return root_id
    return fallback_root_id


def _build_skill_index_by_id(workspace_root: Path) -> dict[str, AppGenSkillEntry]:
    skill_index: dict[str, AppGenSkillEntry] = {}
    for row in list_app_gen_skills(workspace_root):
        skill_index[row.skillId] = row
    return skill_index


def _cleanup_custom_skill_probe_paths(created_paths: list[Path]) -> None:
    for created_path in created_paths:
        try:
            created_path.rmdir()
        except OSError:
            break


def _collect_missing_custom_skill_probe_paths(root_path: Path) -> list[Path]:
    missing_paths: list[Path] = []
    current_path = root_path.resolve(strict=False)
    while True:
        if current_path.exists():
            return missing_paths
        missing_paths.append(current_path)
        parent_path = current_path.parent
        if parent_path == current_path:
            return missing_paths
        current_path = parent_path


def _find_existing_custom_skill_parent(root_path: Path) -> Path:
    current_path = root_path.resolve(strict=False)
    while True:
        if current_path.exists():
            return current_path
        parent_path = current_path.parent
        if parent_path == current_path:
            return current_path
        current_path = parent_path


def _check_custom_skill_root_candidate(
    root_path: Path,
) -> tuple[bool, bool, str | None]:
    resolved_root_path = root_path.resolve(strict=False)
    try:
        root_exists = resolved_root_path.exists()
    except OSError as exc:
        return False, False, str(exc)
    if root_exists:
        try:
            if not resolved_root_path.is_dir():
                return False, True, "not a directory"
        except OSError as exc:
            return False, True, str(exc)
        if os.access(resolved_root_path, os.W_OK | os.X_OK):
            return True, True, None
        return False, True, "not writable"
    try:
        existing_parent_path = _find_existing_custom_skill_parent(resolved_root_path)
        if not existing_parent_path.is_dir():
            return False, False, "parent path is not a directory"
    except OSError as exc:
        return False, False, str(exc)
    if os.access(existing_parent_path, os.W_OK | os.X_OK):
        return True, False, None
    return False, False, "parent directory not writable"


def _probe_custom_skill_root_writable(
    root_path: Path,
) -> tuple[bool, bool, str | None]:
    resolved_root_path = root_path.resolve(strict=False)
    try:
        root_exists = resolved_root_path.exists()
        created_paths = (
            [] if root_exists else _collect_missing_custom_skill_probe_paths(root_path)
        )
    except OSError as exc:
        return False, False, str(exc)
    try:
        resolved_root_path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        return False, root_exists, str(exc)

    probe_name = f".setta-write-probe-{os.getpid()}-{os.urandom(4).hex()}"
    probe_path = resolved_root_path / probe_name
    try:
        with probe_path.open("w", encoding="utf-8") as handle:
            handle.write("")
        probe_path.unlink()
    except OSError as exc:
        try:
            probe_path.unlink()
        except OSError:
            pass
        _cleanup_custom_skill_probe_paths(created_paths)
        return False, root_exists, str(exc)
    _cleanup_custom_skill_probe_paths(created_paths)
    return True, root_exists, None


def _resolve_custom_skill_create_root(
    workspace_root: Path,
) -> tuple[str, str, Path, bool]:
    checked_roots: list[str] = []
    for root_id, root_label, root_path in _iter_prioritized_custom_skill_roots(
        workspace_root
    ):
        is_candidate, root_exists, error = _check_custom_skill_root_candidate(root_path)
        if is_candidate:
            return root_id, root_label, root_path, root_exists
        checked_roots.append(f"{root_id} ({root_path}): {error or 'not writable'}")
    checked_detail = "; ".join(checked_roots)
    raise ValueError(
        f"No writable custom skill root available. Checked: {checked_detail}"
    )


def _resolve_custom_skill_create_root_for_write(
    workspace_root: Path,
) -> tuple[str, str, Path, bool]:
    checked_roots: list[str] = []
    for root_id, root_label, root_path in _iter_prioritized_custom_skill_roots(
        workspace_root
    ):
        is_writable, root_exists, error = _probe_custom_skill_root_writable(root_path)
        if is_writable:
            return root_id, root_label, root_path, root_exists
        checked_roots.append(f"{root_id} ({root_path}): {error or 'not writable'}")
    checked_detail = "; ".join(checked_roots)
    raise ValueError(
        f"No writable custom skill root available. Checked: {checked_detail}"
    )


def _normalize_custom_skill_relative_path(relative_path: str) -> str:
    normalized = relative_path.strip()
    if not _CUSTOM_SKILL_RELATIVE_PATH_PATTERN.fullmatch(normalized):
        raise ValueError(
            "relativePath must start with an alphanumeric character and only "
            "contain letters, numbers, underscores, or hyphens."
        )
    return normalized


def _resolve_skill_editability(
    *,
    root_id: str,
    relative_path: str,
) -> tuple[bool, str | None]:
    if root_id not in _CUSTOM_SKILL_EDITABLE_ROOT_IDS:
        return (
            False,
            "Only skills under AGENTS_HOME/skills, ~/.agents/skills, or workspace .agents/skills are editable.",
        )
    normalized_relative_path = relative_path.strip()
    if normalized_relative_path in ("", "."):
        return False, "Editing root-level SKILL.md is not supported."
    return True, None


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
                is_editable, editability_reason = _resolve_skill_editability(
                    root_id=root_id,
                    relative_path=relative_path,
                )
                rows.append(
                    AppGenSkillEntry(
                        skillId=f"{root_id}::{relative_path}",
                        name=skill_dir.name,
                        rootLabel=label,
                        rootPath=str(root_path),
                        relativePath=relative_path,
                        isEditable=is_editable,
                        editabilityReason=editability_reason,
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


def resolve_app_gen_skills_response(workspace_root: Path) -> GetAppGenSkillsResponse:
    custom_skill_create_root_path: str | None = None
    custom_skill_create_root_actionable = False
    try:
        (
            _,
            _,
            custom_skill_create_root,
            custom_skill_create_root_actionable,
        ) = _resolve_custom_skill_create_root(workspace_root)
        custom_skill_create_root_path = str(custom_skill_create_root)
    except ValueError:
        pass
    return GetAppGenSkillsResponse(
        skills=list_app_gen_skills(workspace_root),
        customSkillCreateRootPath=custom_skill_create_root_path,
        customSkillCreateRootActionable=custom_skill_create_root_actionable,
    )


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

    if selected_skill_id:
        skill_index = _build_skill_index_by_id(workspace_root)
        selected_skill = skill_index.get(selected_skill_id)
        if selected_skill is None:
            raise KeyError(f"Unknown or non-discoverable skillId: {selected_skill_id}")
        (
            existing_root_id,
            _,
            existing_root_path,
            existing_relative_path,
            existing_skill_doc,
        ) = _resolve_skill_doc_path_from_id(
            workspace_root=workspace_root,
            skill_id=selected_skill.skillId,
        )
        try:
            existing_skill_doc_exists = existing_skill_doc.exists()
        except OSError as exc:
            raise ValueError(str(exc)) from exc
        if not existing_skill_doc_exists:
            raise KeyError(f"Missing SKILL.md for {selected_skill.skillId}")
        if not selected_skill.isEditable:
            if selected_skill.editabilityReason is None:
                raise ValueError("Selected skill is not editable.")
            raise ValueError(selected_skill.editabilityReason)
        target_root_id = existing_root_id
        target_root_path = existing_root_path
        target_relative_path = existing_relative_path
        skill_doc = existing_skill_doc
        created = False
    else:
        (
            target_root_id,
            _,
            target_root_path,
            _,
        ) = _resolve_custom_skill_create_root_for_write(workspace_root)
        target_root_id = _resolve_discoverable_root_id_for_path(
            workspace_root=workspace_root,
            root_path=target_root_path,
            fallback_root_id=target_root_id,
        )
        target_relative_path = _normalize_custom_skill_relative_path(
            selected_relative_path
        )
        skill_doc = (target_root_path / target_relative_path / "SKILL.md").resolve(
            strict=False
        )
        if not skill_doc.is_relative_to(target_root_path):
            raise ValueError("Invalid skill path.")
        try:
            if skill_doc.exists():
                raise ValueError(
                    f"Custom skill already exists for relativePath '{target_relative_path}'."
                )
        except OSError as exc:
            raise ValueError(str(exc)) from exc
        created = True

    try:
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
def route_get_app_gen_skills() -> GetAppGenSkillsResponse:
    workspace_root = get_setta_paths().workspace_root
    return resolve_app_gen_skills_response(workspace_root)


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

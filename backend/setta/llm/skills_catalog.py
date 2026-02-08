import re
import shutil
from pathlib import Path
from typing import Any

import yaml

from setta.database.db_objs import DBE
from setta.llm.capabilities_config import (
    ensure_workspace_skill_source,
    get_skill_source_by_id,
    get_skill_sources,
)
from setta.types.capabilities import (
    SkillCatalogResponse,
    SkillDetailsResponse,
    SkillEntry,
    SkillSource,
)

FRONT_MATTER_DELIMITER = "---"
SKILL_DOC_NAME = "SKILL.md"
DEFAULT_IMPORTED_SKILL_NAME = "Imported Skill"
DEFAULT_IMPORTED_SKILL_DESCRIPTION = "Imported from markdown"


def get_skills_catalog(dbe: DBE) -> SkillCatalogResponse:
    sources = get_skill_sources(dbe)
    skills: list[SkillEntry] = []
    for source in sources:
        skills.extend(_scan_source(source))
    skills.sort(key=lambda entry: (entry.name.lower(), entry.id))
    return SkillCatalogResponse(sources=sources, skills=skills)


def get_skill_details(dbe: DBE, skill_ref: str) -> SkillDetailsResponse:
    catalog = get_skills_catalog(dbe)
    for entry in catalog.skills:
        if entry.id != skill_ref:
            continue
        skill_path = Path(entry.absolutePath) / SKILL_DOC_NAME
        raw_text = skill_path.read_text(encoding="utf-8")
        metadata, content, parse_error = _parse_skill_markdown(raw_text)
        return SkillDetailsResponse(
            id=entry.id,
            sourceId=entry.sourceId,
            sourceLabel=entry.sourceLabel,
            relativePath=entry.relativePath,
            absolutePath=entry.absolutePath,
            name=entry.name,
            description=entry.description,
            version=entry.version,
            metadata=metadata,
            content=content,
            parseError=parse_error,
        )
    raise KeyError(f"Skill '{skill_ref}' not found")


def load_skill_prompt_blocks(dbe: DBE, skill_ids: list[str]) -> list[str]:
    if not skill_ids:
        return []
    by_id: dict[str, SkillEntry] = {}
    for entry in get_skills_catalog(dbe).skills:
        by_id[entry.id] = entry
    blocks: list[str] = []
    for skill_id in skill_ids:
        if skill_id not in by_id:
            raise KeyError(f"Skill '{skill_id}' not found")
        entry = by_id[skill_id]
        skill_path = Path(entry.absolutePath) / SKILL_DOC_NAME
        raw_text = skill_path.read_text(encoding="utf-8")
        _, content, parse_error = _parse_skill_markdown(raw_text)
        if parse_error:
            raise ValueError(f"Skill '{skill_id}' is invalid: {parse_error}")
        header = f"### {entry.name} ({entry.id})"
        body = content.strip()
        blocks.append(f"{header}\n{body}" if body else header)
    return blocks


def import_skill_markdown(
    dbe: DBE,
    *,
    markdown: str,
    source_id: str | None = None,
    slug: str | None = None,
) -> SkillEntry:
    normalized_markdown = markdown.strip()
    if not normalized_markdown:
        raise ValueError("Skill markdown cannot be empty")

    if source_id:
        source = get_skill_source_by_id(dbe, source_id)
    else:
        source = ensure_workspace_skill_source(dbe)

    source_root = Path(source.path).expanduser().resolve(strict=False)
    source_root.mkdir(parents=True, exist_ok=True)

    normalized_doc, inferred_name = _normalize_skill_markdown(
        normalized_markdown,
        explicit_name=None,
    )
    resolved_slug = _resolve_unique_slug(
        source_root=source_root,
        base_slug=_slugify(slug or inferred_name or DEFAULT_IMPORTED_SKILL_NAME),
    )
    skill_dir = source_root / resolved_slug
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / SKILL_DOC_NAME).write_text(f"{normalized_doc}\n", encoding="utf-8")

    skill_ref = f"{source.id}::{resolved_slug}"
    return _require_skill_entry_by_ref(dbe, skill_ref)


def delete_skills(dbe: DBE, skill_refs: list[str]) -> list[str]:
    if not skill_refs:
        return []

    seen_refs: set[str] = set()
    deleted_refs: list[str] = []
    catalog = get_skills_catalog(dbe)
    by_ref = {entry.id: entry for entry in catalog.skills}

    for skill_ref in skill_refs:
        if skill_ref in seen_refs:
            continue
        seen_refs.add(skill_ref)
        entry = by_ref.get(skill_ref)
        if entry is None:
            raise KeyError(f"Skill '{skill_ref}' not found")
        skill_dir = Path(entry.absolutePath).resolve(strict=False)
        if not skill_dir.exists():
            continue
        shutil.rmtree(skill_dir)
        deleted_refs.append(skill_ref)
    return deleted_refs


def _scan_source(source: SkillSource) -> list[SkillEntry]:
    root = Path(source.path).expanduser().resolve(strict=False)
    if not root.exists() or not root.is_dir():
        return []

    entries: list[SkillEntry] = []
    for skill_doc_path in sorted(root.rglob(SKILL_DOC_NAME)):
        skill_dir = skill_doc_path.parent
        relative_dir = skill_dir.relative_to(root)
        relative_path = "." if str(relative_dir) == "." else relative_dir.as_posix()
        skill_ref = f"{source.id}::{relative_path}"

        raw_text = skill_doc_path.read_text(encoding="utf-8")
        metadata, _, parse_error = _parse_skill_markdown(raw_text)
        if _is_hidden_from_setta_catalog(metadata):
            continue
        name = _extract_name(metadata, skill_dir.name)
        description = _extract_description(metadata)
        version = _extract_version(metadata)
        entries.append(
            SkillEntry(
                id=skill_ref,
                sourceId=source.id,
                sourceLabel=source.label,
                relativePath=relative_path,
                absolutePath=str(skill_dir),
                name=name,
                description=description,
                version=version,
                parseError=parse_error,
            )
        )
    return entries


def _parse_skill_markdown(
    text: str,
) -> tuple[dict[str, Any] | None, str, str | None]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != FRONT_MATTER_DELIMITER:
        return None, text, "Missing front matter delimiter."

    end_index: int | None = None
    for idx, line in enumerate(lines[1:], start=1):
        if line.strip() == FRONT_MATTER_DELIMITER:
            end_index = idx
            break
    if end_index is None:
        return None, text, "Unterminated front matter."

    front_matter_text = "\n".join(lines[1:end_index])
    content = "\n".join(lines[end_index + 1 :])
    try:
        metadata = yaml.safe_load(front_matter_text) or {}
    except yaml.YAMLError as exc:
        return None, content, f"Invalid YAML front matter: {exc}"
    if not isinstance(metadata, dict):
        return None, content, "Front matter is not a mapping."
    return metadata, content, None


def _extract_name(metadata: dict[str, Any] | None, fallback: str) -> str:
    if metadata is None:
        return fallback
    value = metadata.get("name")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _extract_description(metadata: dict[str, Any] | None) -> str:
    if metadata is None:
        return ""
    value = metadata.get("description")
    if isinstance(value, str):
        return value.strip()
    return ""


def _extract_version(metadata: dict[str, Any] | None) -> str | None:
    if metadata is None:
        return None
    raw_metadata = metadata.get("metadata")
    if not isinstance(raw_metadata, dict):
        return None
    version = raw_metadata.get("version")
    if not isinstance(version, str):
        return None
    stripped = version.strip()
    return stripped or None


def _is_hidden_from_setta_catalog(metadata: dict[str, Any] | None) -> bool:
    if metadata is None:
        return False
    root_flag = metadata.get("settaInAppVisible")
    if isinstance(root_flag, bool):
        return not root_flag
    nested_metadata = metadata.get("metadata")
    if not isinstance(nested_metadata, dict):
        return False
    nested_flag = nested_metadata.get("settaInAppVisible")
    if isinstance(nested_flag, bool):
        return not nested_flag
    return False


def _require_skill_entry_by_ref(dbe: DBE, skill_ref: str) -> SkillEntry:
    for entry in get_skills_catalog(dbe).skills:
        if entry.id == skill_ref:
            return entry
    raise KeyError(f"Skill '{skill_ref}' not found")


def _normalize_skill_markdown(
    markdown: str,
    *,
    explicit_name: str | None = None,
) -> tuple[str, str]:
    metadata, content, parse_error = _parse_skill_markdown(markdown)
    if parse_error is None:
        if metadata is None:
            return markdown, explicit_name or DEFAULT_IMPORTED_SKILL_NAME
        name = _extract_name(
            metadata,
            explicit_name
            or _extract_first_markdown_heading(content)
            or DEFAULT_IMPORTED_SKILL_NAME,
        )
        return markdown, name

    inferred_name = (
        explicit_name
        or _extract_first_markdown_heading(markdown)
        or DEFAULT_IMPORTED_SKILL_NAME
    )
    payload = {
        "name": inferred_name,
        "description": DEFAULT_IMPORTED_SKILL_DESCRIPTION,
        "metadata": {"version": "1.0.0"},
    }
    front_matter = yaml.safe_dump(payload, sort_keys=False).strip()
    body = markdown.strip()
    normalized = (
        f"{FRONT_MATTER_DELIMITER}\n{front_matter}\n{FRONT_MATTER_DELIMITER}\n{body}"
    )
    return normalized, inferred_name


def _extract_first_markdown_heading(markdown: str) -> str | None:
    for line in markdown.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            heading = stripped.lstrip("#").strip()
            if heading:
                return heading
            continue
        break
    return None


def _slugify(value: str) -> str:
    lowered = value.strip().lower()
    if not lowered:
        return "skill"
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    if not slug:
        return "skill"
    return slug


def _resolve_unique_slug(*, source_root: Path, base_slug: str) -> str:
    candidate = base_slug
    suffix = 2
    while (source_root / candidate).exists():
        candidate = f"{base_slug}-{suffix}"
        suffix += 1
    return candidate

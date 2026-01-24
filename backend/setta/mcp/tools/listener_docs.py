from pathlib import Path

from pydantic import BaseModel

from setta.mcp.tool_setup import setta_init_tool

_DOC_SOURCES = {
    "examples": "guides/setta-listener-examples.md",
    "emit_to_frontend": "reference/emit_to_frontend.md",
    "hot_reload": "guides/setta-listener-hot-reload.md",
    "realtime_behavior": "reference/setta-realtime-behavior.md",
    "listener_flows": "reference/listener-flows.md",
    "logging_and_error_handling": "reference/logging-and-error-handling.md",
    "meta_controls": "reference/meta-controls.md",
}

_DEFAULT_DOC_IDS = [
    "examples",
    "emit_to_frontend",
    "hot_reload",
    "realtime_behavior",
]


class ListenerDocEntry(BaseModel):
    doc_id: str
    path: str
    content: str


class ListenerDocsBundle(BaseModel):
    docs: list[ListenerDocEntry]
    available_docs: list[str]


@setta_init_tool
def get_setta_docs(
    *,
    doc_ids: list[str] | None = None,
) -> ListenerDocsBundle:
    """
    Return docs from the Setta docs directory.
    Args:
        doc_ids: Optional list of doc IDs or doc-relative paths to include; omit for
            the default listener-focused set.
    """
    docs_root = _resolve_docs_root()
    resolved_ids = doc_ids or _DEFAULT_DOC_IDS
    docs = [_load_doc(doc_id, docs_root) for doc_id in resolved_ids]
    available_docs = _list_available_docs(docs_root)
    return ListenerDocsBundle(docs=docs, available_docs=available_docs)


def _resolve_docs_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "docs"
        if candidate.is_dir():
            return candidate.resolve()
    raise FileNotFoundError("Setta docs directory not found")


def _load_doc(doc_id: str, docs_root: Path) -> ListenerDocEntry:
    relative_path = _resolve_doc_relative_path(doc_id, docs_root)
    full_path = docs_root / relative_path
    if not full_path.is_file():
        raise FileNotFoundError(f"Listener doc not found: {full_path}")
    content = full_path.read_text(encoding="utf-8")
    return ListenerDocEntry(
        doc_id=doc_id,
        path=str(Path("docs") / relative_path),
        content=content,
    )


def _list_available_docs(docs_root: Path) -> list[str]:
    doc_ids = set(_DOC_SOURCES.keys())
    for doc_path in docs_root.rglob("*.md"):
        if not doc_path.is_file():
            continue
        relative = doc_path.relative_to(docs_root)
        doc_ids.add(str(relative.with_suffix("")))
    return sorted(doc_ids)


def _resolve_doc_relative_path(doc_id: str, docs_root: Path) -> Path:
    if doc_id in _DOC_SOURCES:
        return Path(_DOC_SOURCES[doc_id])

    candidate = Path(doc_id)
    if candidate.suffix == "":
        candidate = candidate.with_suffix(".md")
    if candidate.is_absolute():
        raise ValueError(f"Doc id must be a relative path: {doc_id}")
    resolved = (docs_root / candidate).resolve()
    if docs_root not in resolved.parents:
        raise ValueError(f"Doc id must resolve under docs/: {doc_id}")
    return resolved.relative_to(docs_root)

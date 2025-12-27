from pathlib import Path

from pydantic import BaseModel

from setta.mcp.tool_setup import setta_init_tool

_DOC_SOURCES = {
    "examples": "setta-listener-examples.md",
    "emit_to_frontend": "emit_to_frontend.md",
    "hot_reload": "setta-listener-hot-reload.md",
    "realtime_behavior": "setta-realtime-behavior.md",
    "listener_flows": "listener-flows.md",
    "logging_and_error_handling": "logging-and-error-handling.md",
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
def get_setta_listener_api_docs(
    *,
    doc_ids: list[str] | None = None,
) -> ListenerDocsBundle:
    """
    Return docs relevant to writing Setta listener scripts.
    Args:
        doc_ids: Optional list of doc IDs to include; omit for the default set.
    """
    docs_root = _resolve_docs_root()
    resolved_ids = doc_ids or _DEFAULT_DOC_IDS
    docs = [_load_doc(doc_id, docs_root) for doc_id in resolved_ids]
    available_docs = sorted(_DOC_SOURCES.keys())
    return ListenerDocsBundle(docs=docs, available_docs=available_docs)


def _resolve_docs_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "docs"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Setta docs directory not found")


def _load_doc(doc_id: str, docs_root: Path) -> ListenerDocEntry:
    if doc_id not in _DOC_SOURCES:
        raise ValueError(f"Unknown listener doc id: {doc_id}")
    relative_path = Path("docs") / _DOC_SOURCES[doc_id]
    full_path = docs_root / _DOC_SOURCES[doc_id]
    if not full_path.is_file():
        raise FileNotFoundError(f"Listener doc not found: {full_path}")
    content = full_path.read_text(encoding="utf-8")
    return ListenerDocEntry(doc_id=doc_id, path=str(relative_path), content=content)

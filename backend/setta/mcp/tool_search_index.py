from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import bm25s
from mcp.types import ToolAnnotations

if TYPE_CHECKING:
    from litellm.types.llms.openai import ChatCompletionToolParam
    from mcp.types import Tool


@dataclass(frozen=True)
class ToolSearchEntry:
    name: str
    description: str
    parameters: dict[str, Any]
    annotations: ToolAnnotations | None


@dataclass(frozen=True)
class ToolSearchResult:
    name: str
    description: str
    category: str | None


@dataclass
class ToolSearchIndex:
    retriever: bm25s.BM25
    entries: list[ToolSearchEntry]

    @classmethod
    def build(cls, entries: list[ToolSearchEntry]) -> "ToolSearchIndex | None":
        if not entries:
            return None
        documents = [_build_tool_document_text(entry) for entry in entries]
        retriever = bm25s.BM25()
        corpus_tokens = bm25s.tokenize(
            documents,
            stopwords="en",
            show_progress=False,
        )
        retriever.index(corpus_tokens, show_progress=False)
        return cls(retriever=retriever, entries=entries)

    def search(self, query: str, limit: int) -> list[ToolSearchResult]:
        normalized_query = query.strip()
        if normalized_query == "":
            raise ValueError("query must not be empty")

        query_tokens = bm25s.tokenize(
            [normalized_query],
            stopwords="en",
            show_progress=False,
        )
        if not query_tokens or not any(query_tokens[0]):
            raise ValueError("query must include at least one searchable token")

        normalized_limit = limit if limit > 0 else 5
        max_results = min(normalized_limit, len(self.entries))
        doc_ids, scores = self.retriever.retrieve(
            query_tokens,
            k=max_results,
            show_progress=False,
        )
        results: list[ToolSearchResult] = []
        for doc_index, _ in zip(doc_ids[0], scores[0]):
            if doc_index < 0 or doc_index >= len(self.entries):
                continue
            entry = self.entries[doc_index]
            results.append(
                ToolSearchResult(
                    name=entry.name,
                    description=entry.description,
                    category=_extract_tool_category(entry.annotations),
                )
            )
        return results


def build_tool_search_entries_from_llm_definitions(
    definitions: dict[str, "ChatCompletionToolParam"],
    annotations_by_name: dict[str, ToolAnnotations | None],
) -> list[ToolSearchEntry]:
    entries: list[ToolSearchEntry] = []
    for name, definition in definitions.items():
        annotations = annotations_by_name[name] if name in annotations_by_name else None
        entries.append(
            ToolSearchEntry(
                name=name,
                description=_extract_llm_tool_description(definition),
                parameters=_extract_llm_tool_parameters(definition),
                annotations=annotations,
            )
        )
    return entries


def build_tool_search_entries_from_mcp_tools(
    tools: list["Tool"],
) -> list[ToolSearchEntry]:
    entries: list[ToolSearchEntry] = []
    for tool in tools:
        entries.append(
            ToolSearchEntry(
                name=tool.name,
                description=tool.description or "",
                parameters=tool.parameters or {},
                annotations=tool.annotations,
            )
        )
    return entries


def _extract_llm_tool_description(definition: "ChatCompletionToolParam") -> str:
    function_payload = definition.get("function")
    if isinstance(function_payload, dict):
        description = function_payload.get("description")
        if isinstance(description, str):
            return description
    return ""


def _extract_llm_tool_parameters(
    definition: "ChatCompletionToolParam",
) -> dict[str, Any]:
    function_payload = definition.get("function")
    if isinstance(function_payload, dict):
        parameters = function_payload.get("parameters")
        if isinstance(parameters, dict):
            return parameters
    return {}


def _extract_tool_category(annotations: ToolAnnotations | None) -> str | None:
    if annotations is None:
        return None
    payload = annotations.model_dump()
    category = payload.get("searchCategory")
    if isinstance(category, str) and category.strip():
        return category
    return None


def _build_tool_document_text(entry: ToolSearchEntry) -> str:
    parameter_text = _build_parameter_text(entry.parameters)
    parts = [entry.name]
    if "_" in entry.name:
        parts.append(entry.name.replace("_", " "))
    parts.extend(
        [
            entry.description,
            parameter_text,
            _build_tool_search_metadata_text(entry.annotations),
        ]
    )
    return " ".join(part for part in parts if part)


def _build_tool_search_metadata_text(annotations: ToolAnnotations | None) -> str:
    if annotations is None:
        return ""
    payload = annotations.model_dump()
    tags = payload.get("searchTags")
    category = payload.get("searchCategory")
    segments: list[str] = []
    if isinstance(category, str) and category.strip():
        segments.append(category)
    if isinstance(tags, list):
        for tag in tags:
            if isinstance(tag, str) and tag.strip():
                segments.append(tag)
    return " ".join(segments)


def _build_parameter_text(parameters: dict[str, Any]) -> str:
    if not parameters:
        return ""
    properties = parameters.get("properties")
    if not isinstance(properties, dict):
        return ""

    segments: list[str] = []
    for prop_name, prop_schema in properties.items():
        segments.append(str(prop_name))
        if not isinstance(prop_schema, dict):
            continue
        segments.extend(_collect_schema_text(prop_schema, parameters, set()))
    return " ".join(segment for segment in segments if isinstance(segment, str))


def _collect_schema_text(
    schema: Any,
    root_schema: dict[str, Any],
    seen_refs: set[str],
) -> list[str]:
    segments: list[str] = []
    if not isinstance(schema, dict):
        return segments

    description = schema.get("description")
    if isinstance(description, str):
        segments.append(description)

    ref = schema.get("$ref")
    if isinstance(ref, str):
        target = _resolve_json_pointer(root_schema, ref)
        if isinstance(target, dict) and ref not in seen_refs:
            seen_refs.add(ref)
            try:
                segments.extend(_collect_schema_text(target, root_schema, seen_refs))
            finally:
                seen_refs.remove(ref)

    for keyword in ("anyOf", "allOf", "oneOf"):
        options = schema.get(keyword)
        if isinstance(options, list):
            for option in options:
                segments.extend(_collect_schema_text(option, root_schema, seen_refs))

    items = schema.get("items")
    if isinstance(items, dict):
        segments.extend(_collect_schema_text(items, root_schema, seen_refs))
    elif isinstance(items, list):
        for entry in items:
            segments.extend(_collect_schema_text(entry, root_schema, seen_refs))

    properties = schema.get("properties")
    if isinstance(properties, dict):
        for sub_name, sub_schema in properties.items():
            segments.append(str(sub_name))
            segments.extend(_collect_schema_text(sub_schema, root_schema, seen_refs))

    additional_properties = schema.get("additionalProperties")
    if isinstance(additional_properties, dict):
        segments.extend(
            _collect_schema_text(additional_properties, root_schema, seen_refs)
        )

    return segments


def _resolve_json_pointer(schema: dict[str, Any], pointer: str) -> Any:
    if not isinstance(pointer, str) or not pointer.startswith("#/"):
        return None
    current: Any = schema
    parts = pointer[2:].split("/")
    for raw_part in parts:
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            try:
                index = int(part)
            except ValueError:
                return None
            if index < 0 or index >= len(current):
                return None
            current = current[index]
        else:
            return None
        if current is None:
            return None
    return current

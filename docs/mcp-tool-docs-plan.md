## MCP tool doc improvements

Two concrete follow-ups will make our MCP tools easier to discover and understand:

1. Index nested parameter descriptions – extend `_build_parameter_text` (or a helper) so that it walks referenced schemas/`$defs`, capturing descriptions for nested objects like `SectionSize`. Feed those descriptions into the BM25 document text so search results surface rich context.
2. Annotate project-state request models – add `Field(description=...)` metadata (and class docstrings where helpful) to every Pydantic model that backs a `@project_state_tool`, including nested types such as `SectionSize`. This ensures the schema delivered to the LLM already contains human-readable argument docs.

Once both are done, the LLM will see descriptive text for every argument and our tool search will leverage that detail for ranking.

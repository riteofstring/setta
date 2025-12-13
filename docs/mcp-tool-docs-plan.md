## MCP tool doc improvements

Two concrete follow-ups will make our MCP tools easier to discover and understand:

1. ✅ Index nested parameter descriptions – `_build_parameter_text` now delegates to a recursive walker that follows `$ref` chains, `anyOf`/`allOf`, arrays, and `additionalProperties`, so nested objects like `SectionSize` contribute their property names and descriptions to the BM25 documents driving tool search.
2. Annotate project-state request models – add `Field(description=...)` metadata (and class docstrings where helpful) to every Pydantic model that backs a `@project_state_tool`, including nested types such as `SectionSize`. This ensures the schema delivered to the LLM already contains human-readable argument docs.

Once both are done, the LLM will see descriptive text for every argument and our tool search will leverage that detail for ranking.

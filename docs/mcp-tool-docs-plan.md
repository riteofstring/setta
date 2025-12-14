## MCP tool doc improvements

Two concrete follow-ups will make our MCP tools easier to discover and understand:

1. ✅ Index nested parameter descriptions – `_build_parameter_text` now delegates to a recursive walker that follows `$ref` chains, `anyOf`/`allOf`, arrays, and `additionalProperties`, so nested objects like `SectionSize` contribute their property names and descriptions to the BM25 documents driving tool search.
2. ✅ Annotate project-state request models – Every `@project_state_tool` request payload in `backend/setta/project_state/project_manager_types.py` (and helper types such as `SectionSize`) now sets `Field(..., description=...)`, so the schemas and `_build_parameter_text` output include the human-readable argument docs the search index consumes.

Once both are done, the LLM will see descriptive text for every argument and our tool search will leverage that detail for ranking.

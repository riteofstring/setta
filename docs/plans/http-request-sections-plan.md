# HTTP Request Sections

This page describes how HTTP request sections expose REST endpoints as param UIs, how
schemas are resolved, and how requests are executed.

## What an HTTP request section is
- `SectionType.HttpRequest` represents a REST endpoint instead of a Python callable.
- The section stores request configuration (method, URL, headers, auth, body mode).
- Parameter controls are generated from a request schema and stored as code objects.
- A "Send" action executes the request and captures a response preview.

## Creation + UI flow
- Add via the section menu as "HTTP Request".
- Shortcut: if a user types a URL (or "METHOD URL") into a Callable search field,
  prompt to convert that section into an HTTP Request section.
- The section header shows method + URL inputs plus a "Send" button.
- The right-side config pane exposes schema source, headers/auth, and refresh.

## Project state model
- Add `SectionType.HttpRequest` in `backend/setta/types/section_impls.py`.
- Add `HttpRequestSectionImpl` extending `BaseSectionWithParamsImpl` with:
  - requestMethod, requestUrl, requestHeaders, requestAuth, bodyMode
  - topLevelParamId (parent code object for params)
  - paramBindings (param id -> HttpParamBinding)
  - schemaSource, schemaCacheKey, schemaUpdatedAt
  - lastResponsePreview (optional, for UI only)
- Add `HttpParamBinding` in `backend/setta/types/code_obj_impls.py` (or a new
  shared model) and attach it to param impls:
  - location: path, query, header, body
  - jsonPointer: for nested body fields
  - required: bool

## Schema resolution (auto)
- If a manual schema override exists, use it.
- Else try OpenAPI or JSON Schema:
  - Prefer a configured OpenAPI URL, then probe same-origin defaults like
    `/openapi.json`, `/swagger.json`, or `/.well-known/openapi.json`.
  - Resolve the selected method + path into request params and requestBody.
- Else infer from a sample request JSON (user pasted or last sent request).
- If all else fails, show a single raw JSON body field.

## Param mapping
- Map schema types to Setta controls:
  - string -> TextParam (format: password -> PasswordParam, textarea -> TextAreaParam)
  - number/integer -> CodeParam (Slider when min/max/step is available)
  - boolean -> SwitchParam
  - enum -> DropdownParam
  - object -> NestedParam
  - array -> NestedParam (item schema as child)
- URL path params (`/users/{id}`) become required path bindings.
- Store each param's location + pointer in `HttpParamBinding`.

## Request execution
- New backend route `route_send_http_request` composes URL, query, headers, and body
  from param values and executes the request server-side (avoids CORS).
- Response metadata (status, headers, body) is stored as a preview on the section.
- Errors surface as a status indicator; no automatic retries.

## Caching + storage
- Primary (recommended): cache resolved schemas under
  `setta_files/http_schema_cache/<projectConfigId>/<sectionId>.json` and store the
  `schemaCacheKey` plus timestamps on the section.
- Alternative: embed schema payloads into the project config for portability at the
  cost of larger configs and more merge noise.

## Related code
- `backend/setta/types/section_impls.py`
- `backend/setta/types/code_obj_impls.py`
- `backend/setta/project_state/project_code.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/routers/project_manager.py`
- `frontend/src/components/Section/Layouts/HttpRequestArea.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/HttpRequestSettings.tsx`
- `frontend/src/state/actions/sections/createSectionsHelper.ts`

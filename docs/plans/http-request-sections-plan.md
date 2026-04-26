# HTTP Request Sections

This page describes how HTTP request sections expose REST endpoints as param UIs, how
schemas are resolved, and how requests are executed.

## MVP scope (simple request runner)
The first iteration should stay deliberately small: a reliable way to send a request
and view the response, embedded as a Setta section on the canvas.

- Method + URL inputs.
- Headers editor (simple key/value).
- Body editor (raw text; optional JSON mode with formatting/validation).
- "Send" action that executes server-side (avoid browser CORS) and stores a response preview.
- No collections, workspaces, tests, monitors, scripting, etc.

Everything else in this doc (OpenAPI schema resolution, param UIs, etc.) can land
after the core request/response loop feels solid.

## What an HTTP request section is
- `SectionType.HttpRequest` represents a REST endpoint instead of a Python callable.
- The section stores request configuration (method, URL, headers, optional auth, body mode).
- Parameter controls are generated from a request schema and stored as code objects.
- A "Send" action executes the request and captures a response preview.

## Creation + UI flow
- Add via the section menu as "HTTP Request".
- Shortcut: if a user types a URL (or "METHOD URL") into a Callable search field,
  prompt to convert that section into an HTTP Request section.
- The section header shows method + URL inputs plus a "Send" button.
- The right-side config pane exposes schema source, headers/auth, and refresh.

## Project state model
- Add `SectionType.HttpRequest` to the shared section contract and wire Go
  runtime support through `internal/projectstate`.
- Add `HttpRequestSectionImpl` to the shared section contract, extending
  `BaseSectionWithParamsImpl`, with:
  - requestMethod, requestUrl, requestHeaders, requestAuth, bodyMode
  - topLevelParamId (parent code object for params)
  - paramBindings (param id -> HttpParamBinding)
  - schemaSource, schemaCacheKey, schemaUpdatedAt
  - lastResponsePreview (optional, for UI only)
- Add `HttpParamBinding` to the shared code-object contract and attach it to
  param impls:
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

## Secrets + auth (safe defaults)
Auth matters for real APIs, but we should keep the UI simple while avoiding secret leaks.

- `setta_files/` is gitignored; any on-disk secret material must live under it.
- Prefer storing auth tokens in Setta's runtime secret store via `PasswordParam` (project state
  persists only `hasSecret`, not the token value).
- Avoid persisting bearer tokens / API keys directly inside `HttpRequestSectionImpl` fields
  that would be copied into share deployments. A share snapshot should not contain secrets.
- MVP suggestion: no dedicated "Auth" UI; treat auth as header/query params, but support
  secret-backed values (for example, a header value sourced from a `PasswordParam`).

## Caching + storage
- Primary (recommended): cache resolved schemas under
  `setta_files/http_schema_cache/<projectConfigId>/<sectionId>.json` and store the
  `schemaCacheKey` plus timestamps on the section.
- Alternative: embed schema payloads into the project config for portability at the
  cost of larger configs and more merge noise.

## Related code
- `backend/setta/types/section_impls.py`
- `backend/setta/types/code_obj_impls.py`
- `internal/projectstate/*`
- `internal/httpapi/project_routes.go`
- `frontend/src/components/Section/Layouts/HttpRequestArea.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/HttpRequestSettings.tsx`
- `frontend/src/state/actions/sections/createSectionsHelper.ts`

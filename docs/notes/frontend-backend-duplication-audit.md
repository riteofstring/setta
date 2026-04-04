# Frontend/Backend Duplication Audit

Status: this note records the unjustified duplications found during the audit. The corresponding code fixes were implemented in follow-up commits after the audit was written.

## Scope

This audit reviewed handwritten logic in `frontend/src/` against backend-owned behavior in `internal/`, `cmd/`, and the retained Python package surface under `backend/setta/`.

Generated endpoint/type bindings were not counted as duplication. This note records only the cases that look unjustified. Some overlap areas were reviewed and intentionally excluded because they are UI projection, local draft persistence, or frontend-only orchestration rather than competing sources of truth.

## Unjustified Duplications

### 1. Run-target selection and runnable-code policy are duplicated in the frontend

#### Backend owner

The backend already owns the canonical rules for:

- which code languages are runnable
- whether Python codegen is enabled
- whether an empty run request means "run generated entry" or "run the manual entry code block"
- whether a selected section is runnable at all

Relevant backend code:

- `internal/projectstate/project_graph.go:1116-1129`
  - `SectionImpl.IsRunnableCode()` hard-codes runnable languages to Python and Bash.
  - `Project.HasPythonCodegenTarget()` determines whether Python codegen is enabled.
- `internal/projectstate/run_graph.go:51-81`
  - `Document.ResolveRunTarget()` decides whether a run request resolves to the generated entry target or a manual code section.
- `internal/runs/planner.go:178-194`
  - The planner resolves the target through backend-owned logic and rejects non-runnable targets.

#### Frontend duplication

The frontend re-implements the same policy in several places:

- `frontend/src/utils/codeLanguage.ts:15-29`
  - `RUNNABLE_CODE_LANGUAGES` and `isRunnableCodeLanguage()` duplicate the backend's runnable-language rule.
- `frontend/src/utils/codegenTargets.ts:21-31`
  - `projectConfigHasPythonCodegen()` duplicates the backend's Python-codegen-presence rule.
- `frontend/src/components/Panes/Overview/runInstructionsRunnableCodeBlocks.ts:4-12`
  - duplicates the rule "manual code is runnable only for Python/Bash; generated Python is runnable only when Python codegen is enabled".
- `frontend/src/components/Section/Header/RunButton.tsx:12-21`
  - duplicates section-level run visibility using the same policy.
- `frontend/src/components/AppHeader/RunButton.tsx:36-41`
  - duplicates the main Run button eligibility rule by re-deriving whether there is a runnable default target.
- `frontend/src/components/Section/Header/ToggleEntryCodeBlockButton.tsx:14-43`
  - duplicates the special-case semantics for generated Python as the implicit entry code block when Python codegen is enabled.
- `frontend/src/state/actions/runOrImportCode.ts:36-84`
  - duplicates multiple backend decisions at once:
  - rejects non-Python/Bash languages
  - rejects selecting generated Python as a manual target when Python codegen is disabled
  - re-maps a generated-Python selection back to `null` so the backend interprets it as "run the generated entry target"

#### Why this is unjustified

This is not just "the UI needs a convenience helper." The frontend currently contains multiple handwritten copies of the backend's run policy, and those copies affect what actions the user can see and attempt before the request ever reaches the backend.

That is risky because the backend is already the authority and the policy is drift-prone. A few concrete drift cases:

- adding another runnable language would require updates in multiple frontend files
- changing generated-entry selection semantics would require coordinated frontend edits
- allowing plugin-generated runnable entry targets would break the frontend's Python-only assumptions
- changing entry-code-block rules would require frontend updates in multiple places with slightly different behavior

The backend already centralizes this logic. The frontend copies provide no new authority, only another place for the policy to go stale.

#### Recommended direction

Move the frontend off handwritten run-policy inference and onto backend-derived capability data. Examples:

- expose a hydrated `defaultRunTarget`
- expose per-section `isRunnable` / `canSelectAsEntry`
- expose a backend-derived run-target listing for custom runs
- expose a backend-derived disabled reason for the main Run button

The frontend should only render backend-derived capabilities and invoke the run route, not re-decide the run graph locally.

### 2. File-browser root containment and path normalization are duplicated in the frontend

#### Backend owner

The backend already owns canonical path normalization and root-containment rules:

- `internal/statefs/statefs.go:29-83`
  - `NormalizePath()`
  - `EnsureWithinRoot()`
  - `ResolveWithinRoot()`
- `internal/filebrowser/service.go:796-828`
  - `resolveFolderPath()`
  - `resolvePathWithinWorkspace()`
  - `ensureWithinWorkspaceRoot()`
- `internal/filebrowser/service.go:1110-1143`
  - comparison helpers such as `resolveForComparison()`, `isWithinRoot()`, and `samePath()`

This backend logic is correctness-sensitive. It controls what paths are considered valid, what stays inside the workspace root, and how path comparisons behave.

#### Frontend duplication

The frontend contains a second path-policy stack:

- `frontend/src/utils/browserPaths.ts:4-143`
  - normalizes separators
  - extracts roots for Unix and Windows paths
  - normalizes `.` and `..`
  - distinguishes absolute vs relative paths
  - enforces containment inside a root
  - special-cases `/var` vs `/private/var` and `/tmp` vs `/private/tmp`
- `frontend/src/utils/fileBrowserPathRelation.ts:3-32`
  - duplicates same-path / descendant-path comparison rules.
- `frontend/src/components/Utils/CodeMirror/folderPathCompletions.ts:55-176` and `frontend/src/components/Utils/CodeMirror/folderPathCompletions.ts:238-252`
  - uses the frontend path policy to decide whether a completion request is inside the root before calling the backend.
- `frontend/src/components/Section/Layouts/BrowserArea.tsx:1295-1309`, `frontend/src/components/Section/Layouts/BrowserArea.tsx:1359-1363`, `frontend/src/components/Section/Layouts/BrowserArea.tsx:1683-1740`, and `frontend/src/components/Section/Layouts/BrowserArea.tsx:2028-2124`
  - repeatedly re-validates item paths and folder paths against the root using the frontend helper before displaying labels, tooltips, or loading folder contents.
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:290-356`, `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:1272-1291`, and `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx:1947-1998`
  - uses the frontend comparison helpers broadly for drag/drop and path relation checks.

#### Why this is unjustified

This duplication is more serious than a harmless formatting helper because the frontend copy is re-implementing backend-owned containment semantics.

Problems with that:

- containment rules are correctness-sensitive and should have one owner
- the frontend helper already carries platform-specific policy (`C:/`, `/private/tmp`, `/private/var`) that can drift from backend behavior
- the backend path stack handles details the frontend does not fully model, such as environment expansion, `~` expansion, and symlink-aware comparison paths in some flows
- multiple frontend features now depend on local path-policy guesses before even sending the request to the backend

The frontend does need display helpers, but it does not need a second authority on "is this path valid and inside the allowed root?" The backend already answers that question.

#### Recommended direction

Reduce frontend path logic to presentation-only transforms and push path authority back to the backend. Examples:

- accept raw user-entered folder paths and let the backend return the normalized safe path or an error
- expose backend-normalized folder paths and relative display paths in file-browser responses
- expose backend-derived path relation metadata when drag/drop rules need it

If the frontend keeps any helper at all, it should be a lightweight syntactic convenience to avoid obviously broken requests, not a second implementation of containment policy.

## Reviewed But Not Listed As Unjustified

The following overlap areas were reviewed and intentionally excluded from the unjustified list:

- state machine run selection/presentation helpers
  - mostly frontend projection over backend-authored run state for rendering
- LLM config selection helpers
  - mostly UI grouping/default-pick logic over hydrated backend config data
- dictation fallback policy
  - frontend-only orchestration because browser dictation fallback exists on the client, not in backend runtime policy
- workspace switcher history and `settaFilesLocation` normalization
  - local draft/history hygiene; backend still validates launch inputs
- app draft preview parsing
  - lightweight client preview logic; backend still owns canonical validation
- file-extension-to-language inference
  - primarily frontend ergonomics for editor/file-browser behavior rather than backend runtime authority

## Bottom Line

After a broad sweep, the unjustified duplication clusters are:

1. run-target / runnability policy
2. file-browser path normalization / containment policy

Those are the places where frontend code is currently shadowing backend-owned correctness rules instead of consuming backend-derived results.

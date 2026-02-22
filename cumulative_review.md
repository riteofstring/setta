## 2026-02-24 15:45:02 CST

### Consolidated Findings
1. The UI setting reveal websocket result path used an untyped side parse in addition to the typed adapter path, which increased complexity and made failures harder to reason about.
2. In multi-client/share-mode sessions, reveal acknowledgements were not bound to a specific frontend websocket, creating nondeterministic responses when multiple frontends were connected.
3. Frontend reveal logic could do broad DOM scans and plugin reveal errors were sometimes collapsed into generic messages.
4. Backend UI-setting flows still had compatibility-oriented fallback logic and redundant work in set+reveal paths.

### Proposed Fixes Implemented
1. Added a fully typed backend websocket message path for `UISettingRevealResult` and removed the untyped reveal-result fallback parser.
2. Added deterministic frontend websocket selection for reveal requests and bound reveal waiters to an expected websocket id.
3. Optimized reveal lookup to direct anchor selector access and preserved plugin reveal error detail in responses.
4. Removed compatibility-style fallback branches/no-op logic and eliminated duplicate registry rebuild work for set+reveal.
5. Added/updated unit, integration, frontend, and Playwright tests for deterministic reveal routing, error propagation, and reveal behavior.

### UX/DX Before and After
1. UX before: reveal completion could resolve from the wrong client tab/window.
2. UX after: reveal completion resolves only from the targeted frontend websocket, making behavior deterministic.
3. UX before: plugin reveal failures could appear generic.
4. UX after: plugin handler failure details are returned to users/tools directly.
5. UX before: reveal operations could do heavier DOM work on large pages.
6. UX after: reveal uses direct selector lookup, reducing DOM traversal overhead.
7. DX before: mixed typed/untyped websocket handling and fallback branches increased debugging cost.
8. DX after: single typed dispatch path and simpler control flow improve maintainability and diagnosis speed.

## 2026-02-24 16:37:37 CST

### Consolidated Findings
1. Plugin UI settings could disappear when shadowed status rows were keyed only by `pluginId` instead of unique plugin entries.
2. Backend UI-setting registration accepted invalid `valueSchema` payloads and failed later during registry/tool usage.
3. Reveal flow still had a compatibility fallback that could report success without frontend acknowledgement.
4. Frontend reveal behavior had timing races (plugin pane mount and fixed anchor timeout) and exceptions could degrade into backend timeouts.
5. Worker UI-setting registration mutated handler maps before host registration completed, allowing partial state leaks on failure.
6. Per-environment LLM API key anchors introduced non-canonical IDs not represented in the UI-setting registry.

### Proposed Fixes Implemented
1. Removed plugin status-map gating in registry construction and relied on active runtime plugin list semantics.
2. Validated backend registration `valueSchema` with `UISettingValueSchema.model_validate(...)` and failed fast with `PLUGIN_BACKEND_REGISTER_FAILED`.
3. Removed reveal-result fallback success behavior and required `ui_setting_reveal_result_hub` + explicit frontend acknowledgement for reveal success.
4. Replaced fixed anchor polling with duration-based deadline polling and added bounded plugin-handler retry while plugin panes mount.
5. Added exception handling around frontend reveal message processing and always returned structured failed `UISettingRevealResult` payloads on errors.
6. Made worker registration atomic by committing read/write handler maps only after successful `host.register_ui_setting`.
7. Removed non-canonical per-row LLM API key anchors from Project AI settings.
8. Added focused pytest, Vitest, and Playwright coverage for each corrected path.

### UX/DX Before and After
1. UX before: active plugin settings could vanish in shadowed installations.
2. UX after: active plugin settings remain discoverable and actionable.
3. UX before: invalid plugin setting schemas surfaced as delayed runtime failures.
4. UX after: schema issues fail immediately during plugin registration with clear context.
5. UX before: reveal operations could return false success or delayed generic timeout failures.
6. UX after: reveal results are acknowledgement-driven with immediate structured error details.
7. UX before: reveal reliability degraded on slower pane/DOM mount paths.
8. UX after: reveal reliability improves under delayed mount/render conditions.
9. DX before: fallback branches and partial worker side effects obscured root causes.
10. DX after: fail-fast validation and atomic registration simplify debugging and retries.

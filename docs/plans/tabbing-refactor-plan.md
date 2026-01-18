# Tabbing refactor plan

## Goals
- Replace the ad-hoc tabbing handlers with a single, explicit focus manager.
- Make Tab/Shift+Tab deterministic across Overview, Canvas (sections), UI Editor, and Site Logo.
- Keep param indent/unindent (Tab/Shift+Tab) from fighting with focus navigation.
- Remove legacy tabbing logic; no backward compatibility required.

## Current issues
- Multiple competing Tab handlers:
  - `tabbingLogic.ts` hard-jumps focus between panes.
  - `sectionContainerCoreOnKeyDown` always prevents and stops propagation.
  - Document-level shortcuts in `keyActivations.ts` also react to Tab.
- Focus order is implicit and brittle (DOM order + manual jumps).
- CodeMirror tab handling, panes, and section focus behavior are tangled.
- Param indent shortcuts and tab navigation share Tab/Shift+Tab without clear precedence.

## Design decisions
- Single owner: a centralized Focus Manager handles Tab/Shift+Tab on `document`.
- Explicit scopes: Overview, Canvas, UI Editor, Site Logo (and optionally per-section).
- Explicit precedence: if param selection is active, Tab/Shift+Tab belongs to param indent.
- Stop relying on DOM incidental order; use ordered scopes + computed focusables.
- Remove legacy handlers rather than trying to "bridge" old behavior.

## Proposed architecture
### Focus Manager (new module)
- Location: `frontend/src/utils/focusManager.ts` (or `frontend/src/state/actions/focusManager.ts`).
- Responsibilities:
  - Register focus scopes with order and root elements.
  - Determine current scope from `event.target`.
  - Compute next/prev focusable element within scope.
  - Move to next/prev scope when at end/start.
  - Call `movePaneToIncludeElement` for canvas focus targets.
- Scope metadata:
  - `scopeId`, `order`, `rootRef`, optional `behavior` (canvas vs pane).
  - `getFocusableElements(root)`, with consistent filtering.
- DOM integration:
  - `data-tab-scope` attribute on scope roots.
  - Helper hook: `useTabScope({ scopeId, order, rootRef, behavior })`.

### Param indent precedence
- Document-level Tab handler:
  - If any section has `selectedParams.length > 0`, run indent/unindent action and `preventDefault`.
  - Otherwise fall through to focus manager.
- Never call legacy `tabFromDocumentBody` for param selection.

### Input handling
- If `event.defaultPrevented` or `data-tab-native` on target, skip focus manager.
- If target is a native input/textarea/select/contentEditable, allow native tabbing unless:
  - focus is within a managed canvas section, and
  - we explicitly want section-level tab order.
- CodeMirror integration:
  - Treat CodeMirror as a focusable element; manager moves focus between inputs.
  - Do not rely on internal CodeMirror keymaps for tab navigation.

## Implementation steps
1. **Inventory + delete legacy handlers**
   - Remove from `frontend/src/utils/tabbingLogic.ts`:
     - `overviewPaneOnKeyDown`, `uiEditorPaneOnKeyDown`, `tabFromDocumentBody`,
       `sectionContainerCoreOnKeyDown`, and their call sites.
   - Remove Tab-specific handlers from:
     - `frontend/src/components/Section/Container/ContainerCore.tsx`
     - `frontend/src/components/Panes/Overview/Overview.tsx`
     - `frontend/src/components/Panes/UiEditor/UiEditor.tsx`
2. **Introduce Focus Manager**
   - Add new module with:
     - scope registry
     - ordered scope list
     - `focusNext` / `focusPrev`
     - `getScopeForElement`
     - `getFocusableElements`
3. **Register scopes**
   - Overview pane root (`#OverviewPane`).
   - Canvas root (a container that includes all sections).
   - UI Editor pane root (`#UiEditorPane`).
   - Site Logo (single element treated as a scope).
4. **Section focus model**
   - Option A (simpler): treat entire canvas as one scope, rely on DOM order.
   - Option B (preferred): register each section root as a sub-scope in the canvas.
   - Use `useSectionRefs` to register section roots and order by layout.
5. **Wire Tab/Shift+Tab**
   - In `keyActivations.ts`, move Tab handling to:
     - param indent when selection exists (always `preventDefault`).
     - focus manager otherwise (also `preventDefault`).
   - Remove any other Tab interception.
6. **Clean up callers**
   - Replace `focusOnSection` and related calls with explicit focus manager APIs
     (or keep helper wrappers that delegate to the manager).
7. **Manual verification**
   - Tabbing between overview → canvas → ui editor → site logo (and back).
   - Tabbing within a section with params and CodeMirror fields.
   - Param selection + Tab/Shift+Tab indent/unindent without focus jumps.
   - No console errors on keydown.

## Testing/verification checklist
- Tab order is deterministic and consistent.
- Shift+Tab walks reverse order.
- Param selection uses Tab for indent, never for focus changes.
- Tabbing in a CodeMirror input either stays in-field or follows the new focus rules.
- Canvas focus scrolls to the newly focused element.

## Non-goals
- Backward compatibility with the old tabbing behavior.
- Preserving legacy edge cases in tabbingLogic.
- Keeping old handlers around "just in case."

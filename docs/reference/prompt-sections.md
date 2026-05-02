# Prompt Sections

Prompt sections now support two source modes:

- local section-owned prompt text
- linked prompt template ids stored in the project-wide prompt-template store

This page documents how those two modes behave in the editor, preview, and
runtime/codegen paths.

## Core fields

Prompt sections store these main fields on `PromptSectionImpl`:

- `promptTemplateId`: optional id of the linked saved prompt template.
- `template`: cached prompt text snapshot stored on the section itself.
- `format`: prompt format (`jinja`, etc).
- `inputs`: prompt-section-local input map retained on the model.
- `renderedText`: latest preview text.
- `missingVariables`: latest unresolved template variables.
- `renderError`: latest preview/render error, if any.

## Local mode

When `promptTemplateId` is `null`, the section owns its own prompt text:

- The section editor is writable.
- Editing the template uses `route_set_prompt_template`.
- Changing format uses `route_set_prompt_format`.
- Updating local template text clears any previous prompt-template link.
- Preview state is computed directly from the section's own `template` and
  `format`.

## Linked template mode

When `promptTemplateId` is set, the section behaves as a view onto a saved
prompt template:

- The settings pane uses `route_set_prompt_template_link` to connect the
  section to a saved template id.
- The canvas editor becomes read-only and shows which template it is following.
- The settings pane offers "Make local copy", which unlinks the section and
  preserves the current linked source text as the new local template.
- Updating the saved prompt template automatically refreshes every linked Prompt
  section's cached `template`, `format`, and preview state.

Linked sections use the saved template as the source of truth. The cached
`template` and `format` on the section exist so project state, previews, and
some runtime paths have a synchronized snapshot, but the DB-backed resolution
path prefers the saved prompt template when one exists.

## Broken-link behavior

If a linked prompt template id no longer exists:

- The canvas editor stays read-only.
- The UI shows a broken-link message instead of silently falling back to stale
  prompt content.
- The current recovery path is selecting a different prompt template.

Current limitation:

- The backend rejects unlinking a Prompt section whose linked template is
  already missing, because it cannot resolve the current source template
  through the normal DB-backed pathway.

## Codegen and workflow resolution

Prompt sections matter in two runtime paths introduced or changed by this
branch:

- Dependency-graph/codegen export resolves the live linked template text when a
  DB handle is available, so codegen follows the saved prompt template instead
  of an old cached snapshot.
- Workflow `send_prompt` edges that target a Prompt section resolve that Prompt
  section through the same source-of-truth pathway, so a Prompt section linked
  to a saved prompt template dispatches the current template text at runtime.

Both paths fail loudly when the linked template is missing.

## Template deletion behavior

Prompt-template deletion now has two different outcomes depending on where the
template is referenced:

- Workflow edges that reference a saved prompt template block deletion with a
  `409` conflict.
- Prompt sections do not currently block template deletion. If the template is
  deleted anyway, linked Prompt sections enter the broken-link state described
  above.

## Related docs

- `docs/reference/codegen-section-policy-and-metadata.md`
- `docs/reference/state-machine-workflows.md`

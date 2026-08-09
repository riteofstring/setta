# `@setta/workspace` developer guides

These guides describe the current private, locally installable package milestone. The generated
TypeScript declarations remain the exact API source of truth; the guides explain how the public
contracts fit together without exposing XYFlow, dnd-kit, or package internals.

Start with the package [quickstart](../README.md#five-minute-uncontrolled-example), then use the
smallest guide that matches the integration being built.

| Guide                                                       | Use it for                                                                                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Host integration](integration.md)                          | Document ownership, persistence, capabilities, creation, clipboard adapters, detachable windows, outline navigation, controller commands, extensions, minimap, selection, and history. |
| [Recursive sections](recursive-sections.md)                 | Container registration, canonical containment, sorting and free-move modes, orientation, locking, minimizing, size modes, overflow, snapping, and section presentation.                |
| [Sortable item trees](sortable-item-trees.md)               | Host-owned item data, validation, selection, atomic move plans, pointer/touch/keyboard movement, zoom, and persistence.                                                                |
| [Theming](theming.md)                                       | Required CSS, scoped light/dark/system appearance, semantic tokens, grid styling, chrome, accents, tags, and host-renderer theming.                                                    |
| [Accessibility and keyboard](accessibility-and-keyboard.md) | Package keyboard commands, focus and announcements, host-renderer responsibilities, zoom/reflow, coarse pointers, and reduced motion.                                                  |
| [Verification and support](verification-and-support.md)     | Performance guidance, browser policy, local package checks, supply-chain policy, attribution, deferred capabilities, and non-goals.                                                    |

## Stable ownership boundary

- `WorkspaceDocument` owns serializable workbench structure and package presentation.
- The host owns section payload meaning, ID allocation, persistence, authorization, and renderer
  behavior.
- `WorkspaceClipboardAdapter` owns transport plus host ID/payload cloning; the package owns the
  validated frame, root-block placement, shortcuts, and atomic paste command.
- `WorkspaceDetachmentProvider` owns transient same-origin window sessions; the host may own their
  preference bounds and explicit head contributions.
- `WorkspaceOutline` owns transient disclosure and tree navigation; the controller remains the
  document, selection, focus, and viewport boundary.
- `SortableItemTree` owns item interaction and planning; the host owns the item tree and applies an
  accepted `ItemMovePlan`.
- Upstream canvas and drag-and-drop contracts stay behind package adapters.
- No current Setta application model, backend, source alias, compatibility layer, or undeclared
  package path is part of the consumer contract.

The package has reached its private reusable-package milestone. Distribution and a public
compatibility policy remain undecided; no compatibility aliases or migrations are implied by these
guides.

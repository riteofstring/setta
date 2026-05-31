# Setta UI Stack Recommendation

This is a stack research note. The current source of truth for Setta 3 remains
`docs/plans/setta-3-architecture-rewrite.md`.

## Recommendation

Use **shadcn/ui + Tailwind 4** for the app shell, but keep the XYFlow node layer custom and lightweight.

```txt
App shell / panels / dialogs / settings:
  shadcn/ui + Tailwind 4

Canvas nodes:
  custom lightweight React components
  Tailwind utilities or CSS Modules
  minimal Radix/shadcn primitives

Active/editing states:
  mount heavier UI only when needed
  CodeMirror only when active
```

## Why

The main performance risks in a large XYFlow canvas are not Tailwind or shadcn by themselves. The bigger risks are:

- too many DOM elements
- deep nested node layouts
- expensive paint styles like shadows, blur, filters, gradients
- too many mounted interactive primitives
- broad state subscriptions causing many node re-renders
- CodeMirror or complex editors mounted in every node

Tailwind mostly compiles to CSS, so it is not the core runtime bottleneck. shadcn/ui is source code you own, so it is useful, but should not be treated as free inside thousands of nodes.

## Avoid

Do **not** use full shadcn/Radix components inside every node by default.

Avoid this pattern:

```txt
Every node:
  Card
  Tooltip
  Popover
  Select
  DropdownMenu
  CodeMirror
  animated wrappers
  deep layout nesting
```

That will likely become expensive at scale.

## Do

Use this pattern instead:

```txt
Inactive node:
  shallow DOM
  static classes
  simple text/preview
  no mounted editor
  no hidden menus/popovers

Active node:
  richer controls
  mounted editor
  overlays/portals
  shadcn/Radix where useful
```

## shadcn without Tailwind?

Probably not worth it.

shadcn’s default ergonomics assume Tailwind and CSS variables. Removing Tailwind means you spend time porting the system instead of building Setta. If you want custom CSS only, skip shadcn too and build a small design system from scratch.

## Raw custom CSS?

Useful only in hot paths.

Do not build the whole app with raw custom CSS. That will likely increase product/design-system complexity. Use custom CSS where performance matters most: the canvas, node internals, dense previews, and active/inactive node transitions.

## Final choice

```txt
React + Vite
Tailwind 4
shadcn/ui for app chrome
custom lean components for XYFlow nodes
CSS variables for design tokens
CSS Modules/plain CSS only where useful
fine-grained state management
strict node performance budget
```

## Core rule

**shadcn at the edges, custom lean components in the canvas.**

Performance will come more from fewer elements, simpler paint, careful state subscriptions, and active/inactive rendering than from choosing Tailwind vs CSS Modules.

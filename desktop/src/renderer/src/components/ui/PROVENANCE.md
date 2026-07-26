# shadcn/ui component provenance

Everything in this directory is official shadcn/ui component source, copied by
hand from a pinned upstream revision. Nothing here is a Setta approximation of
shadcn, and nothing here may be edited to add Setta behaviour — Setta-specific
wrappers live outside this directory (see `../setta-compact-input.tsx` and
`../setta-status-badge.tsx`).

The shadcn CLI is deliberately not installed, invoked, or vendored in any form,
including `npx`/`pnpm dlx`. Component source is retrieved directly from the
pinned upstream repository.

## Pinned upstream

| Field        | Value                                                |
| ------------ | ---------------------------------------------------- |
| Repository   | https://github.com/shadcn-ui/ui                      |
| Revision     | `7774cd7dcee1e98d0815aa6e829f33a7fc952fdf`           |
| Registry     | `apps/v4/registry/bases/base` (Base UI variant only) |
| Style        | `apps/v4/registry/styles/style-nova.css`             |
| Runtime peer | `@base-ui/react` `1.6.0`                             |

The `radix` and `aria` sibling registries are out of scope: Setta takes the
Base UI variant only and has no direct `@radix-ui/*` dependency.

`nova` is the selected shadcn style ("reduced padding and margins"). Setta's
command center, settings, and runtime surfaces are dense, and nova's 28px
`sm` control height matches the sizing those surfaces already used.

## Imported components

| Local file   | Upstream source                             |
| ------------ | ------------------------------------------- |
| `badge.tsx`  | `apps/v4/registry/bases/base/ui/badge.tsx`  |
| `button.tsx` | `apps/v4/registry/bases/base/ui/button.tsx` |
| `input.tsx`  | `apps/v4/registry/bases/base/ui/input.tsx`  |

`shadcn-nova.css` carries the `cn-*` rules those three components resolve, taken
verbatim from the `Badge`, `Button`, and `Input` sections of the pinned
`style-nova.css`.

## Local modifications

These are the only changes made to the copied source:

- the `cn` import is rewritten from `@/registry/bases/base/lib/utils` to
  Setta's `@renderer/lib/utils`
- the files are formatted with the repository's Prettier configuration
- `shadcn-nova.css` is unwrapped from upstream's `.style-nova` selector, since
  Setta ships exactly one style, and it carries only the sections belonging to
  the imported components. Sections for components Setta has not imported
  (Button Group, Input OTP, Input Group, and the rest of the catalog) are
  excluded rather than checked in unused; import them alongside their component.

Setta-side wiring that these components depend on, in `../../styles.css`:

- `shadcn-nova.css` is imported into `layer(base)`, matching upstream, so
  call-site Tailwind utilities still win over component classes
- `@custom-variant dark` is bound to Setta's `data-color-mode`, so `dark:` in
  the copied source follows the appearance setting rather than the OS
  preference

`knip.json` lists this directory as an entry point. Upstream's export surface
(`buttonVariants`, `badgeVariants`) is part of the copied source whether or not
Setta consumes all of it, so it is not reported as dead code; the files are
still analysed, so their dependencies remain accounted for.

Setta's Tailwind radius scale is deliberately left at the framework defaults.
The copied rules read `--radius-md` and `rounded-lg`, which resolve against
those defaults; adopting shadcn's `--radius`-derived scale would restyle
unrelated Setta surfaces and is not required by the imported components.

## Renderer audit

Checked for local components that either claimed to be shadcn or duplicated an
imported primitive's responsibility:

- `Button`, `Badge`, and `Input` previously had Setta-authored implementations
  in this directory with `primary`/`secondary`, `neutral`/`success`/`danger`,
  and compact-input APIs. All three were replaced by the official source, and
  every consumer moved to the official variant, size, and composition contracts.
- the badge-shaped spans in `speech-provider-selection-card.tsx` and
  `openai-voice-connection-card.tsx` duplicated Badge and hard-coded raw
  emerald/sky palette colours. They now render through `SettaStatusBadge`,
  which is the Setta-domain status component built on the official Badge.
- the hand-rolled API-key `<input>` in `codex-account-panel.tsx` duplicated
  Input and now uses `SettaCompactInput`.
- `AppearanceShadcnPalette` and the `shadcn_*` appearance presets in the Go
  contract are named after the shadcn CSS variable set they populate. They are
  colour tokens, not components, and stay as they are.
- the command center's own chrome (`setta-shell-*`, `setta-settings-page-*`,
  the Director approval form fields) is Setta-domain UI styled by
  `director-command-center.css`. It is not shadcn-derived and is not renamed.
- `settings-panel-color-fields.tsx` keeps a native `<input type="range">`; no
  shadcn Slider has been imported.

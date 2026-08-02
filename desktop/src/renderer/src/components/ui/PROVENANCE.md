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

| Local file        | Upstream source                                  |
| ----------------- | ------------------------------------------------ |
| `accordion.tsx`   | `apps/v4/registry/bases/base/ui/accordion.tsx`   |
| `alert.tsx`       | `apps/v4/registry/bases/base/ui/alert.tsx`       |
| `badge.tsx`       | `apps/v4/registry/bases/base/ui/badge.tsx`       |
| `button.tsx`      | `apps/v4/registry/bases/base/ui/button.tsx`      |
| `card.tsx`        | `apps/v4/registry/bases/base/ui/card.tsx`        |
| `chart.tsx`       | `apps/v4/registry/bases/base/ui/chart.tsx`       |
| `dialog.tsx`      | `apps/v4/registry/bases/base/ui/dialog.tsx`      |
| `input.tsx`       | `apps/v4/registry/bases/base/ui/input.tsx`       |
| `scroll-area.tsx` | `apps/v4/registry/bases/base/ui/scroll-area.tsx` |
| `separator.tsx`   | `apps/v4/registry/bases/base/ui/separator.tsx`   |
| `table.tsx`       | `apps/v4/registry/bases/base/ui/table.tsx`       |
| `tabs.tsx`        | `apps/v4/registry/bases/base/ui/tabs.tsx`        |
| `tooltip.tsx`     | `apps/v4/registry/bases/base/ui/tooltip.tsx`     |

`chart.tsx` brings the runtime dependency upstream pins for it, `recharts`
`3.8.0`, added through `./update_dependencies.sh`.

`dialog.tsx`, `scroll-area.tsx`, and `tooltip.tsx` arrived with their consumers:
the artifact browser overlay, its scrolling document surface, and the icon-only
controls the rail and the overlay label with tooltips.

The Dialog and Tooltip styles name upstream's enter and exit animation
utilities, so `tw-animate-css` `1.4.0` — the version upstream pins at the same
revision — is now a direct dependency, added through
`./update_dependencies.sh`. It is a CSS-only package with no runtime.

`shadcn-nova.css` carries the `cn-*` rules these components resolve, taken
verbatim from the matching sections of the pinned `style-nova.css`.

## Local modifications

These are the only changes made to the copied source:

- the `cn` import is rewritten from `@/registry/bases/base/lib/utils` to
  Setta's `@renderer/lib/utils`
- the files are formatted with the repository's Prettier configuration
- the `"use client"` directive is dropped. Setta has no React Server
  Components boundary, and a module-level directive is a bundler warning here.
- `accordion.tsx` and `dialog.tsx` resolve upstream's `IconPlaceholder` to
  `lucide-react`, which is the icon library Setta already depends on and the
  default the published registry substitutes. The `data-slot` and class names
  are unchanged.
- `chart.tsx` anchors its dark theme selector to the document root's
  `data-color-mode` instead of a `.dark` class, matching the `dark:` variant
  below. Without the root anchor, any ordinary ancestor would satisfy the
  not-light selector even while the document was light; without the selector
  change, a `theme`-keyed `ChartConfig` would emit a rule that can never match.
- `shadcn-nova.css` is unwrapped from upstream's `.style-nova` selector, since
  Setta ships exactly one style, and it carries only the sections belonging to
  the imported components. Sections for components Setta has not imported
  (Button Group, Input OTP, Input Group, and the rest of the catalog) are
  excluded rather than checked in unused; import them alongside their component.
  The `*-aria` rules inside an imported component's section are excluded too:
  they belong to the React Aria registry variant, which this plan does not take.

Setta-side wiring that these components depend on, in `../../styles.css`:

- `shadcn-nova.css` is imported into `layer(base)`, matching upstream, so
  call-site Tailwind utilities still win over component classes
- `@custom-variant dark` is bound to Setta's `data-color-mode`, so `dark:` in
  the copied source follows the appearance setting rather than the OS
  preference
- `@custom-variant data-open` and `@custom-variant data-closed` carry the Base
  UI half of the variants upstream declares in `shadcn/tailwind.css`. The
  Radix half is omitted because Setta takes the Base UI registry only.
- `tw-animate-css` is imported so the `animate-in`, `animate-out`, `fade-*`,
  `zoom-*`, and `slide-in-from-*` utilities the Dialog and Tooltip styles name
  resolve
- `--animate-accordion-down`, `--animate-accordion-up`, and their keyframes are
  redeclared after that import. The package's own accordion keyframes resolve
  Radix's `--radix-accordion-content-height`; Setta takes the Base UI registry,
  whose panel measures itself into `--accordion-panel-height`.
- a reduced-motion query switches the accordion panel, dialog, and tooltip
  animations off

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
- the artifact catalog's own components — `ArtifactDocument`, `ArtifactSection`,
  the chart and table adapters, and the rest under
  `../../features/artifacts/components/` — are named as Setta components
  because shadcn has no equivalent. They compose the primitives here rather
  than restyling them, and the tone treatments they add for the catalog's
  status severities use Setta's status tokens.
- the old Director artifact rows and in-rail detail panel
  (`director-artifact-item`, `director-artifact-detail*`) are gone. What replaced
  them — `director-artifact-preview*`, `director-artifact-browser*` — is
  Setta-domain chrome around the official Dialog, Scroll Area, Tooltip, and
  Button, not a restyling of them.
- the rail card's figures in `../../features/artifacts/ArtifactCardFigures.tsx`
  are deliberately not the catalog's components: a card must not mount Recharts
  for an artifact the reader has not opened, so it draws one static sparkline
  with the same tokens instead.

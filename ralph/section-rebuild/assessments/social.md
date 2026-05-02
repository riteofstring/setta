# Social Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/top_level_section_creation.go`,
  `internal/projectstate/section_data_settings.go`,
  `internal/projectstate/section_data_settings_test.go`,
  `internal/projectstate/auto_layout.go`,
  `internal/settingsstate/defaults.json`,
  `internal/projectstate/readable_export.go`,
  `frontend/src/components/Section/Layouts/SocialArea.tsx`,
  `frontend/src/components/Panes/UiEditor/SectionConfig/SocialAreaSettings.tsx`,
  `frontend/src/state/hooks/social.ts`,
  `frontend/src/state/hooks/sectionSizes.ts`, and
  `frontend/src/components/Section/Header/HeaderIcon.tsx`.
- Data shown: section name/title, persisted `url`, detected provider state,
  provider-specific embed identity, and the media preview content derived from
  that URL.
- Controls/actions: standard section titlebar controls, section type/menu
  affordance, social URL input from section settings, YouTube thumbnail click
  affordance that swaps to the player, and Twitter/X tweet embed selection from
  the same URL field.
- Important states: empty/unsupported URL renders no provider body, YouTube URL
  renders a thumbnail until clicked, YouTube player sizing follows the section
  size, Twitter/X URL renders a tweet embed and uses auto-height sizing, and
  editing can be disabled when structure editing is not allowed.
- Interactions that must stay recognizable: editing the Social Media URL,
  recognizing provider detection from the URL, clicking a YouTube thumbnail to
  play, and embedding provider content inside the section body.

## Layout Invariants
- Conceptual regions and ordering: external preview label above the prototype,
  shared flat section titlebar, compact URL/provider strip, then the provider
  embed preview as the main media body.
- Relative placement of important controls: the URL input and provider state
  stay adjacent above the embed they determine; generic section controls stay in
  the shared titlebar.
- Grouping/containment relationships: the provider preview is one contained
  embed surface, not a row table, child list, workflow node, or artifact layer
  stack.
- Scroll or overflow expectations: the Social prototype should be compact and
  media-oriented, reflecting the real `Social` min size of 200x50 and auto size
  defaults while still leaving enough body area to show the provider embed
  affordance without clipping.

## Intentional Differences
- What the flat prototype is allowed to change: provider embed chrome, URL
  settings, thumbnail, play state, and tweet card can be rendered as static
  flat HTML/CSS rather than live third-party widgets.
- What production layout logic is intentionally not reused: no `react-youtube`,
  `react-tweet`, `get-youtube-id`, Zustand selectors, local storage theme
  hooks, resize hooks, debounce/OpenAPI mutation wiring, Tailwind class chains,
  or production embed DOM structure are copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element maps to the real Social section
  contract, URL settings UI, provider helper, provider-specific header icon, or
  YouTube/Twitter embed behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: URL field, provider detection, YouTube thumbnail/play
  affordance, YouTube video id, Twitter/X tweet id option, editable/locked
  state, compact auto-size note, and contained embed body all map to inspected
  source.
- Confirmation that the required section-type label is external page/gallery
  chrome and not part of the section body, shell, titlebar, toolbar, controls,
  or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task will add Social-only functions/styles/tests and gallery
  entries. It will not alter Callable or Dict fixtures, body structure,
  controls, row hierarchy, ports, or CSS.

## Component Plan
- New files or functions: add `FlatSocialSectionPrototype`, Social fixture data,
  Social-specific body helpers, Social section icon styling, and dark/light
  gallery entries in `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: title `Launch Clip`, URL
  `https://www.youtube.com/watch?v=setta-launch`, YouTube video id
  `setta-launch`, alternate Twitter/X tweet id `1784926812345678901`, and
  editable state `true`.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert Social gallery labels, URL/provider/embed affordances, compact media
  CSS, absence of ports/row groups/workflow handles, and continued
  Callable/Dict isolation; run focused Vitest, formatting, `git diff --check`,
  and CDP visual verification on `/internal/flat-section-prototype`.

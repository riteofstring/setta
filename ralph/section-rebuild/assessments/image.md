# Image Prototype Assessment

## Functionality

- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/top_level_section_creation.go`,
  `internal/projectstate/section_data_settings.go`,
  `internal/projectstate/section_data_settings_test.go`,
  `internal/projectstate/auto_layout.go`,
  `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`,
  `frontend/src/components/Section/Layouts/ImageArea.tsx`,
  `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`,
  `frontend/src/components/Section/Header/MenuButton/AddArtifactByFilepath.tsx`,
  `frontend/src/components/Section/Header/MenuButton/AddArtifactByFilepath.test.tsx`,
  `frontend/src/components/Panes/UiEditor/SectionConfig/ImageAreaSettings.tsx`,
  `frontend/src/state/hooks/artifacts.ts`, and
  `frontend/src/state/actions/sections/createSections.ts`.
- Data shown maps to real Image data: section name/title, `imagePath`, a
  decoded image artifact for that path, and the image preview rendered with
  object-contain behavior.
- Controls/actions: Image sections expose an image section type/menu affordance,
  standard section controls, `Add artifact by filepath` in the section menu, and
  an `Image Path` settings input that updates `imagePath` through
  `setImageAreaImagePath`.
- Important states: populated versus empty `imagePath`, cached raw image
  loading, decoded image available versus not yet decoded, and file-open/create
  behavior that reuses an existing Image section for the same path. The primary
  fixture uses a populated path with a decoded image preview.
- Interactions that must stay recognizable: choosing an artifact path,
  editing/confirming `imagePath`, decoding/loading the image artifact, and
  displaying the decoded image scaled inside the section. The prototype
  represents these as static HTML controls and a static preview image; it does
  not implement file picking, mutation, or decoding.

## Layout Invariants

- Conceptual regions and ordering: flat section titlebar first, then a compact
  path/import control strip, then the image preview figure as the primary body
  region.
- Relative placement of important controls: image path state and the add/import
  affordance stay adjacent to the preview they affect, while generic section
  controls remain in the shared titlebar/menu area.
- Grouping/containment relationships: the image preview remains inside a figure
  region and scales as a single contained artifact rather than rows, ports, or
  nested child cards.
- Scroll or overflow expectations: the preview clips/contains the image and
  should not create row-style vertical overflow. The Image prototype should be
  media-oriented and moderately compact, reflecting the real min sizing
  relationship of Image sections rather than inheriting the Callable/Dict
  row-heavy body.

## Intentional Differences

- The flat prototype may replace the production rounded settings input,
  Tailwind figure classes, and menu styling with the accepted flat shell,
  monospace rhythm, and subtle separators.
- Production layout logic intentionally not reused: Zustand selectors,
  `useImageArtifact`, raw image decoding effects, OpenAPI calls, dropzone/file
  picker modal wiring, Tailwind class chains, and the production figure DOM
  organization are not copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element is backed by the real Image
  contract, image settings, artifact import path, or decoded preview behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: title/name, `imagePath`, add/import action, image path input,
  figure preview, and object-contain image presentation all map to inspected
  source.
- Confirmation that the required section-type label is external page/gallery
  chrome and not part of the section body, shell, titlebar, toolbar, controls,
  or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task adds a new Image prototype and external gallery labels only
  and does not redesign their internal layout, fixtures, controls, ports, row
  hierarchy, or rhythm.

## Component Plan

- New files or functions: add `FlatImageSectionPrototype`, Image-only fixture
  data, and Image-only prototype body helpers in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`. Add or
  update gallery-only preview item labels outside section bodies.
- Static fixture data: title `Source Image`, image path
  `artifacts/source-image.png`, and a decoded preview image fixture rendered as
  a contained image artifact.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert Image affordances, gallery presence and external labels, compact/media
  CSS, no workflow handles/ports/row params, and continued isolation from
  Callable and Param Dict/Dict baselines.

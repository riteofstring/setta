# Chart Prototype Assessment

## Functionality

- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/chart_frontend_types.go`,
  `internal/projectstate/chart_sections.go`,
  `internal/projectstate/chart_sections_test.go`,
  `internal/projectstate/top_level_section_creation.go`,
  `internal/projectstate/readable_export.go`,
  `internal/projectstate/python_codegen_policy.go`,
  `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`,
  `frontend/src/components/Section/Layouts/ChartArea/ChartArea.tsx`,
  `frontend/src/components/Section/Layouts/ChartArea/LineChart.ts`,
  `frontend/src/components/Section/Layouts/ChartArea/ScatterChart.ts`,
  `frontend/src/components/Section/Layouts/ChartArea/ChartTransforms.test.ts`,
  `frontend/src/components/Panes/UiEditor/SectionConfig/ChartAreaSettings.tsx`,
  `frontend/src/components/Panes/UiEditor/SectionConfig/ChartAreaSettings.test.tsx`,
  `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`, and
  `frontend/src/components/Section/Header/MenuButton/AddArtifactByFilepath.tsx`.
- Data shown maps to real Chart data: section name/title, `dataPath`, loaded
  `ChartDataArtifact` columns, chart type, axis column settings, second Y-axis
  assignment for line charts, category column for scatter charts, and log-scale
  boolean settings.
- Controls/actions: Chart sections expose a section type/menu affordance,
  standard section controls, `Add artifact by filepath` for `dataPath`, a Data
  Path settings input, chart type selection, X-axis and category column
  selections, and log-scale toggles backed by `setChartType`,
  `setChartAreaDataPath`, and `setChartSettings`.
- Important states: empty versus populated `dataPath`, chart data available
  versus unavailable, line versus scatter settings, optional line X-axis column,
  scatter category column, hidden datasets through legend interaction, and
  linear versus logarithmic axis scale settings. The primary fixture uses a
  populated line chart because line is the default Chart type.
- Interactions that must stay recognizable: importing or editing a data path,
  selecting chart type, selecting data columns, toggling log scales, viewing
  the rendered chart canvas, and legend/crosshair-oriented chart interaction.
  The prototype represents these as static HTML controls, a compact settings
  summary, and a static chart preview; it does not implement Chart.js, mutation,
  file picking, tooltips, or dataset hiding.

## Layout Invariants

- Conceptual regions and ordering: flat section titlebar first, then a compact
  data path/import strip, then the chart preview canvas-like region as the
  primary body, with chart settings adjacent to the preview rather than mixed
  into row params.
- Relative placement of important controls: path/import controls stay close to
  the chart data they load; type, column, axis, and log-scale settings remain
  grouped as chart configuration controls; the rendered plot remains the
  dominant body region.
- Grouping/containment relationships: the chart preview remains a single
  contained plotting surface with axis labels, dataset/legend indicators, and
  plotted series. It is not a row list, workflow node, or nested-child
  container.
- Scroll or overflow expectations: Chart is a media/canvas-oriented section
  with default 300 by 300 sizing. The prototype should be taller than compact
  control-only sections and clip/contain its preview without vertical row-style
  overflow.

## Intentional Differences

- The flat prototype may replace the production Chart.js canvas, rounded
  settings panel controls, combobox DOM, and Tailwind figure classes with the
  accepted flat shell, monospace rhythm, subtle separators, and static semantic
  preview markup.
- Production layout logic intentionally not reused: Chart.js instantiation,
  canvas resize effects, Zustand selectors, deep compare hooks, OpenAPI calls,
  artifact loading hooks, combobox components, tooltip/crosshair plugins, and
  Tailwind class chains are not copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element is backed by the real Chart
  contract, chart artifact data, chart settings, chart menu import behavior, or
  ChartArea rendering behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: title/name, `dataPath`, add/import action, chart type,
  X-axis column, second Y-axis column, log-scale toggles, loaded data columns,
  legend/dataset indicators, axes, and plotted line preview all map to inspected
  source.
- Confirmation that the required section-type label is external page/gallery
  chrome and not part of the section body, shell, titlebar, toolbar, controls,
  or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task adds a new Chart prototype only and does not redesign
  their internal layout, fixtures, controls, ports, row hierarchy, dimensions,
  spacing, or visual rhythm.

## Component Plan

- New files or functions: add `FlatChartSectionPrototype`, Chart-only fixture
  data, and Chart-only prototype body helpers in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`. Add the
  Chart item to the existing external gallery wrapper.
- Static fixture data: title `Metrics Chart`, data path
  `artifacts/metrics.csv`, line chart type, X-axis `time`, second Y-axis
  `humidity`, log-scale states for X/Y1/Y2 axes, and loaded columns `time`,
  `temperature`, `humidity`, and `pressure`.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert Chart affordances, gallery presence and external label, media/canvas
  CSS, no workflow handles/ports/row params, and continued isolation from
  Callable and Param Dict/Dict baselines.

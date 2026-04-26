import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FlatBrowserSectionPrototype,
  FlatCallableSectionPrototype,
  FlatChartSectionPrototype,
  FlatChatSectionPrototype,
  FlatCodeSectionPrototype,
  FlatDictSectionPrototype,
  FlatDrawSectionPrototype,
  FlatGenPythonCodeSectionPrototype,
  FlatGenPythonMetadataSectionPrototype,
  FlatGlobalVariablesSectionPrototype,
  FlatGroupSectionPrototype,
  FlatIFrameSectionPrototype,
  FlatImageSectionPrototype,
  FlatListRootSectionPrototype,
  FlatMetaControlSectionPrototype,
  FlatPluginSectionPrototype,
  FlatPromptSectionPrototype,
  FlatSectionPrototypeGallery,
  FlatSocialSectionPrototype,
  FlatSpreadsheetSectionPrototype,
  FlatStateMachineEndSectionPrototype,
  FlatStateMachineGateSectionPrototype,
  FlatStateMachineStartSectionPrototype,
  FlatTaskBoardSectionPrototype,
  FlatTerminalSectionPrototype,
  FlatTextBlockSectionPrototype,
} from "./FlatSectionPrototype";

const flatSectionPrototypeCss = readFileSync(
  new URL("./FlatSectionPrototype.css", import.meta.url),
  "utf8",
);

describe("FlatSectionPrototype", () => {
  it("renders prototype shells without card chrome tokens", () => {
    const markup = renderToStaticMarkup(<FlatSectionPrototypeGallery />);

    expect(markup).toContain('data-flat-section-kind="browser"');
    expect(markup).toContain('data-flat-section-kind="callable"');
    expect(markup).toContain('data-flat-section-kind="chart"');
    expect(markup).toContain('data-flat-section-kind="chat"');
    expect(markup).toContain('data-flat-section-kind="code"');
    expect(markup).toContain('data-flat-section-kind="dict"');
    expect(markup).toContain('data-flat-section-kind="draw"');
    expect(markup).toContain('data-flat-section-kind="gen-python-code"');
    expect(markup).toContain('data-flat-section-kind="gen-python-metadata"');
    expect(markup).toContain('data-flat-section-kind="global-variables"');
    expect(markup).toContain('data-flat-section-kind="group"');
    expect(markup).toContain('data-flat-section-kind="image"');
    expect(markup).toContain('data-flat-section-kind="iframe"');
    expect(markup).toContain('data-flat-section-kind="list-root"');
    expect(markup).toContain('data-flat-section-kind="meta-control"');
    expect(markup).toContain('data-flat-section-kind="plugin"');
    expect(markup).toContain('data-flat-section-kind="prompt"');
    expect(markup).toContain('data-flat-section-kind="social"');
    expect(markup).toContain('data-flat-section-kind="spreadsheet"');
    expect(markup).toContain('data-flat-section-kind="task-board"');
    expect(markup).toContain('data-flat-section-kind="terminal"');
    expect(markup).toContain('data-flat-section-kind="text-block"');
    expect(markup).toContain('data-flat-section-kind="state-machine-start"');
    expect(markup).toContain('data-flat-section-kind="state-machine-gate"');
    expect(markup).toContain('data-flat-section-kind="state-machine-end"');
    expect(markup).toContain('data-flat-theme-preview="dark"');
    expect(markup).toContain('data-flat-theme-preview="light"');
    expect(markup).not.toContain(">Dark<");
    expect(markup).not.toContain(">Light<");
    expect((markup.match(/data-flat-preview-theme="dark"/g) ?? []).length).toBe(
      25,
    );
    expect(
      (markup.match(/data-flat-preview-theme="light"/g) ?? []).length,
    ).toBe(25);
    expect((markup.match(/data-flat-task-board="true"/g) ?? []).length).toBe(2);
    expect(markup).toContain('data-flat-section-gallery-label="Browser"');
    expect(markup).toContain('data-flat-section-gallery-label="Callable"');
    expect(markup).toContain('data-flat-section-gallery-label="Chart"');
    expect(markup).toContain('data-flat-section-gallery-label="Chat"');
    expect(markup).toContain('data-flat-section-gallery-label="Code"');
    expect(markup).toContain('data-flat-section-gallery-label="GenPythonCode"');
    expect(markup).toContain(
      'data-flat-section-gallery-label="GenPythonMetadata"',
    );
    expect(markup).toContain('data-flat-section-gallery-label="Draw"');
    expect(markup).toContain(
      'data-flat-section-gallery-label="Param Dict / Dict"',
    );
    expect(markup).toContain('data-flat-section-gallery-label="ListRoot"');
    expect(markup).toContain('data-flat-section-gallery-label="Group"');
    expect(markup).toContain(
      'data-flat-section-gallery-label="GlobalVariables"',
    );
    expect(markup).toContain('data-flat-section-gallery-label="IFrame"');
    expect(markup).toContain('data-flat-section-gallery-label="Image"');
    expect(markup).toContain('data-flat-section-gallery-label="MetaControl"');
    expect(markup).toContain('data-flat-section-gallery-label="Plugin"');
    expect(markup).toContain('data-flat-section-gallery-label="Prompt"');
    expect(markup).toContain('data-flat-section-gallery-label="Social"');
    expect(markup).toContain('data-flat-section-gallery-label="Spreadsheet"');
    expect(markup).toContain('data-flat-section-gallery-label="TaskBoard"');
    expect(markup).toContain('data-flat-section-gallery-label="Terminal"');
    expect(markup).toContain('data-flat-section-gallery-label="TextBlock"');
    expect(markup).toContain(
      'data-flat-section-gallery-label="StateMachineStart"',
    );
    expect(markup).toContain(
      'data-flat-section-gallery-label="StateMachineGate"',
    );
    expect(markup).toContain(
      'data-flat-section-gallery-label="StateMachineEnd"',
    );
    expect(markup).toContain('data-flat-section-type-menu="true"');
    expect(markup).toContain("flat-section-prototype-gallery");
    expect(markup).toContain("flat-section-prototype-gallery__item");
    expect(markup).not.toContain("undefined");
    expect(markup).toContain("flat-section-prototype-gallery__label");
    expect(markup).toContain("flat-section-prototype--dark");
    expect(markup).toContain("flat-section-prototype--light");
    expect(markup).toContain("rank_items");
    expect(markup).toContain("builtins.sorted");
    expect(markup).toContain("workspace_profile");
    expect(markup).toContain("Prototype Group");
    expect(markup).toContain("Source Image");
    expect(markup).toContain("Draft Prompt");
    expect(markup).toContain("Sketch Layer");
    expect(markup).toContain("Metrics Chart");
    expect(markup).toContain("Review Notes");
    expect(markup).toContain("artifacts/metrics.csv");
    expect(markup).toContain("Release Brief");
    expect(markup).toContain("Sampling Controls");
    expect(markup).toContain("Launch Clip");
    expect(markup).toContain("Global Variables");
    expect(markup).toContain("Manual Runner");
    expect(markup).toContain("Generated Python Code");
    expect(markup).toContain("Managed Console");
    expect(markup).toContain("Example Embed");
    expect(markup).toContain("Review Chat");
    expect(markup).toContain("Workspace Browser");
    expect(markup).toContain("React Fixture Card");
    expect(markup).toContain("Release Board");
    expect(markup).toContain("Forecast Sheet");
    expect(markup).toContain("/workspace/assets");
    expect(markup).toContain("release-cover.png");
    expect(markup).toContain("/workspace/reports/forecast.xlsx");
    expect(markup).toContain("https://www.youtube.com/watch?v=setta-launch");
    expect(markup).toContain("gg-code-slash");
    expect(markup).toContain("gg-list");
    expect(markup).toContain("gg-folder");
    expect(markup).toContain("gg-pen");
    expect(markup).toContain("gg-image");
    expect(markup).toContain("flat-section-prototype__chart-glyph");
    expect(markup).toContain("flat-section-prototype__meta-control-glyph");
    expect(markup).toContain("flat-section-prototype__plugin-glyph");
    expect(markup).toContain("flat-section-prototype__task-board-glyph");
    expect(markup).toContain("flat-section-prototype__global-glyph");
    expect(markup).toContain("flat-section-prototype__prompt-glyph");
    expect(markup).toContain("flat-section-prototype__social-glyph");
    expect(markup).toContain("flat-section-prototype__spreadsheet-glyph");
    expect(markup).toContain("flat-section-prototype__chat-glyph");
    expect(markup).toContain("flat-section-prototype__terminal-glyph");
    expect(markup).toContain("flat-section-prototype__text-block-glyph");
    expect(markup).toContain("gg-menu");
    expect(markup).toContain("gg-git-branch");
    expect(markup).toContain("gg-check");
    expect(markup).toContain("flat-section-prototype__icon-button");
    expect(markup).toContain("flat-section-prototype__icon-glyph");
    expect(markup).toContain("flat-section-prototype__header");
    expect(markup).toContain("flat-section-prototype__top-controls");
    expect(markup).not.toContain("px-2.5");
    expect(markup).toContain('placeholder="please enter function name"');
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).toContain('data-flat-control-toggle="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("flex min-h-8 items-center gap-2");
    expect(markup).not.toContain("flex items-center gap-1");
    expect(markup).not.toContain("mr-1.5");
    expect(markup).not.toContain("grid-cols");
    expect(markup).not.toContain("justify-self");
    expect(markup).toContain(
      "flat-section-prototype__top-button flat-section-prototype__top-button--lock",
    );
    expect(markup).not.toContain("rounded");
    expect(markup).not.toContain("shadow");
    expect(markup).not.toContain("opacity");
    expect(markup).not.toContain("dark:");
    expect(markup).not.toContain("[color:");
    expect(markup).not.toContain('data-flat-control="column-resize"');
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("filter keys");
    expect(markup).toContain('data-flat-row-group="pinned"');
    expect(markup).toContain('data-flat-row-group="body"');
  });

  it("keeps section shells narrow-capable and hierarchy-led", () => {
    expect(flatSectionPrototypeCss).toContain("min-width: 0;");
    expect(flatSectionPrototypeCss).not.toContain("min-width: 280px");
    expect(flatSectionPrototypeCss).toContain("container-type: inline-size");
    expect(flatSectionPrototypeCss).toContain("@container (max-width: 14rem)");
    expect(flatSectionPrototypeCss).toContain("--flat-divider");
    expect(flatSectionPrototypeCss).toContain("--flat-chrome-bg");
    expect(flatSectionPrototypeCss).toContain("font-weight: 700;");
  });

  it("keeps the callable prototype markup lean and row-oriented", () => {
    const markup = renderToStaticMarkup(<FlatCallableSectionPrototype />);
    const divCount = (markup.match(/<div\b/g) ?? []).length;
    const spanCount = (markup.match(/<span\b/g) ?? []).length;
    const iconGlyphCount = (
      markup.match(/flat-section-prototype__icon-glyph/g) ?? []
    ).length;
    const iconElementCount = (markup.match(/<i\b/g) ?? []).length;
    const rowCount = (markup.match(/data-flat-row-key=/g) ?? []).length;
    const rowGroupListCount = (
      markup.match(/<ol[^>]*data-flat-row-group=/g) ?? []
    ).length;
    const rowGroupSectionCount = (
      markup.match(/<section[^>]*data-flat-row-group=/g) ?? []
    ).length;

    expect(divCount).toBe(0);
    expect(spanCount).toBe(iconGlyphCount);
    expect(iconGlyphCount).toBe(5);
    expect(iconElementCount).toBe(0);
    expect(rowCount).toBeGreaterThanOrEqual(4);
    expect(rowGroupListCount).toBe(2);
    expect(rowGroupSectionCount).toBe(0);
    expect(markup).toContain('data-flat-shell-strip="ports"');
    expect(markup).toContain("flat-section-prototype__ports");
    expect(markup).toContain("flat-section-prototype__port-list--left");
    expect(markup).toContain("flat-section-prototype__port-row--right");
    expect(markup).toContain('data-flat-row-emphasis="edge"');
    expect(markup).toContain('data-flat-row-emphasis="required"');
    expect(markup).toContain('data-flat-row-emphasis="optional"');
    expect(markup).toContain("flat-section-prototype__row-key");
    expect(markup).toContain("flat-section-prototype__row-value");
    expect(markup).not.toContain("hover:bg-[color:var(--flat-hover)]");
    expect(markup).not.toContain("focus:border-[color:var(--flat-focus)]");
    expect(markup).not.toContain("border-solid");
    expect(markup).not.toContain("[border-width:0_0_1px_0]");
    expect(markup).not.toContain("leading-[var(--flat-row-height)]");
    expect(markup).not.toContain("before:left-[-0.9375rem]");
    expect(markup).not.toContain("after:right-[-0.9375rem]");
    expect(markup).toContain('data-flat-port-label="IN"');
    expect(markup).not.toContain("before:content-[attr(data-flat-port-label)]");
    expect(markup).not.toContain("flex min-h-[var(--flat-row-height)]");
    expect(markup).not.toContain("pl-[calc(0.75rem+var(");
    expect(markup).not.toContain("grid");
    expect(markup).not.toContain('data-flat-pinned-marker="true"');
    expect(markup).not.toContain("gg-pin-alt");
    expect(markup).not.toContain(">Pinned Params<");
    expect(markup).not.toContain('data-flat-control="column-resize"');
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("border-neutral-200");
    expect(markup).not.toContain("bg-blue-50/80");
    expect(markup).not.toContain("transition-colors");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");
  });

  it("mounts the args controls only when explicitly revealed", () => {
    const markup = renderToStaticMarkup(
      <FlatCallableSectionPrototype controlsInitiallyOpen />,
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('data-flat-control="column-resize"');
    expect(markup).toContain('data-flat-action-bar="true"');
    expect(markup).toContain('value="filter"');
    expect(markup).toContain("gg-search");
    expect(markup).toContain("flat-section-prototype__filter-input");
    expect(markup).toContain("flat-section-prototype__action-bar");
    expect(markup).toContain("flat-section-prototype__icon-glyph");
    expect(markup).toContain("flat-section-prototype__action-button--resize");
    expect(markup).not.toContain("flex min-h-9 items-center gap-0.5");
    expect(markup).not.toContain("grid-cols");
    expect(markup).not.toContain("justify-self");
    expect(markup).not.toContain(">Args<");
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("group-hover");
  });

  it("marks dict grouping and nested row hierarchy without helper rail elements", () => {
    const markup = renderToStaticMarkup(<FlatDictSectionPrototype />);

    expect(markup).toContain('data-flat-row-emphasis="group"');
    expect(markup).toContain('data-flat-row-emphasis="nested"');
    expect(markup).toContain("flat-section-prototype__row--rail");
    expect(markup).toContain("flat-section-prototype__row--rail-start");
    expect(markup).toContain("flat-section-prototype__row--rail-end");
    expect(markup).toContain("--flat-depth-offset:0.875rem");
    expect(markup).toContain("--flat-rail-left:1rem");
    expect(markup).not.toContain("--flat-rail-width");
    expect(markup).not.toContain("after:w-[var(--flat-rail-width)]");
    const spanCount = (markup.match(/<span\b/g) ?? []).length;
    const iconGlyphCount = (
      markup.match(/flat-section-prototype__icon-glyph/g) ?? []
    ).length;
    expect(spanCount).toBe(iconGlyphCount);
  });

  it("renders list root child controls, selected view mode, and nested child layout", () => {
    const markup = renderToStaticMarkup(<FlatListRootSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="list-root"');
    expect(markup).toContain('data-flat-list-root="true"');
    expect(markup).toContain("Sprint Intake");
    expect(markup).toContain('aria-label="Child section controls"');
    expect(markup).toContain('aria-label="Child count"');
    expect(markup).toContain('value="3"');
    expect(markup).toContain('aria-label="Delete child sections"');
    expect(markup).toContain('aria-label="Create child sections"');
    expect(markup).toContain('data-flat-list-root-action="delete"');
    expect(markup).toContain('data-flat-list-root-action="create"');
    expect(markup).toContain(
      'data-flat-list-root-default-child-type="Callable"',
    );
    expect(markup).toContain("Default child");
    expect(markup).toContain('data-flat-list-root-view-mode="kanban"');
    expect(markup).toContain('data-flat-list-root-view-option="default"');
    expect(markup).toContain('data-flat-list-root-view-option="task_list"');
    expect(markup).toContain('data-flat-list-root-view-option="kanban"');
    expect(markup).toContain("Default Stack");
    expect(markup).toContain("Task List");
    expect(markup).toContain("Kanban Board");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-flat-list-root-children="kanban"');
    expect(markup).toContain('data-flat-list-root-sortable-child="true"');
    expect(markup).toContain('data-flat-list-root-child-type="Callable"');
    expect(markup).toContain('data-flat-list-root-child-type="TextBlock"');
    expect(markup).toContain('data-flat-list-root-child-type="Prompt"');
    expect(markup).toContain("rank_items");
    expect(markup).toContain("review_notes");
    expect(markup).toContain("draft_prompt");
    expect(markup).toContain("gg-math-plus");
    expect(markup).toContain("gg-math-minus");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain('aria-label="Minimize section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain("data-flat-state-machine");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-list-root");
    expect(dictMarkup).not.toContain("data-flat-list-root");
    expect(callableMarkup).not.toContain("Sprint Intake");
    expect(dictMarkup).not.toContain("Sprint Intake");
  });

  it("renders group layout controls, child incrementer, ungroup action, and nested children", () => {
    const markup = renderToStaticMarkup(<FlatGroupSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="group"');
    expect(markup).toContain('data-flat-group="true"');
    expect(markup).toContain("Prototype Group");
    expect(markup).toContain('data-flat-group-orientation="horizontal"');
    expect(markup).toContain('data-flat-group-overflow-mode="on"');
    expect(markup).toContain('aria-label="Group layout controls"');
    expect(markup).toContain('aria-label="Group orientation"');
    expect(markup).toContain('data-flat-group-orientation-option="vertical"');
    expect(markup).toContain('data-flat-group-orientation-option="horizontal"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-flat-group-overflow="on"');
    expect(markup).toContain('data-flat-group-default-child-type="Callable"');
    expect(markup).toContain("Default child");
    expect(markup).toContain('aria-label="Ungroup sections"');
    expect(markup).toContain('data-flat-group-action="ungroup"');
    expect(markup).toContain('aria-label="Group child section controls"');
    expect(markup).toContain('aria-label="Group child count"');
    expect(markup).toContain('value="3"');
    expect(markup).toContain('aria-label="Delete group child sections"');
    expect(markup).toContain('aria-label="Create group child sections"');
    expect(markup).toContain('data-flat-group-action="delete"');
    expect(markup).toContain('data-flat-group-action="create"');
    expect(markup).toContain('data-flat-group-children="horizontal"');
    expect(markup).toContain('data-flat-group-sortable-child="true"');
    expect(markup).toContain('data-flat-group-child-type="Dict"');
    expect(markup).toContain('data-flat-group-child-type="Callable"');
    expect(markup).toContain('data-flat-group-child-type="TextBlock"');
    expect(markup).toContain("source_config");
    expect(markup).toContain("normalize_inputs");
    expect(markup).toContain("preview_notes");
    expect(markup).toContain("gg-folder");
    expect(markup).toContain("gg-math-plus");
    expect(markup).toContain("gg-math-minus");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain('aria-label="Minimize section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-group");
    expect(dictMarkup).not.toContain("data-flat-group");
    expect(callableMarkup).not.toContain("Prototype Group");
    expect(dictMarkup).not.toContain("Prototype Group");
  });

  it("renders draw controls, layer stack, canvas items, and active draft overlay", () => {
    const markup = renderToStaticMarkup(<FlatDrawSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="draw"');
    expect(markup).toContain('data-flat-draw="true"');
    expect(markup).toContain("Sketch Layer");
    expect(markup).toContain('data-flat-draw-mode="draw"');
    expect(markup).toContain('data-flat-draw-active-layer="ink-layer"');
    expect(markup).toContain('aria-label="Draw tool controls"');
    expect(markup).toContain('aria-label="Brush color"');
    expect(markup).toContain('data-flat-draw-color="#ff0000"');
    expect(markup).toContain('data-flat-draw-color-choice="#ff0000"');
    expect(markup).toContain('data-flat-draw-color-choice="#1e40af"');
    expect(markup).toContain('data-flat-draw-color-choice="#22c55e"');
    expect(markup).toContain('aria-label="Draw canvas mode"');
    expect(markup).toContain('aria-label="Draw mode"');
    expect(markup).toContain('aria-label="Erase mode"');
    expect(markup).toContain('aria-label="Edit mode"');
    expect(markup).toContain('data-flat-draw-mode-option="draw"');
    expect(markup).toContain('data-flat-draw-mode-option="erase"');
    expect(markup).toContain('data-flat-draw-mode-option="edit"');
    expect(markup).toContain('aria-label="Brush settings"');
    expect(markup).toContain('aria-label="Brush size"');
    expect(markup).toContain('name="draw-brush-size"');
    expect(markup).toContain('value="16"');
    expect(markup).toContain('aria-label="Brush Opacity"');
    expect(markup).toContain('name="draw-brush-alpha"');
    expect(markup).toContain('value="0.8"');
    expect(markup).toContain('aria-label="Brush shape"');
    expect(markup).toContain('data-flat-draw-brush-shape="round"');
    expect(markup).toContain('data-flat-draw-brush-shape-option="butt"');
    expect(markup).toContain('data-flat-draw-brush-shape-option="round"');
    expect(markup).toContain('aria-label="Eraser brush size"');
    expect(markup).toContain('name="draw-eraser-size"');
    expect(markup).toContain('value="24"');
    expect(markup).toContain('aria-label="Clear active layer brush strokes"');
    expect(markup).toContain('data-flat-draw-action="clear-strokes"');
    expect(markup).toContain('aria-label="Draw canvas and layer stack"');
    expect(markup).toContain('aria-label="Layered draw canvas preview"');
    expect(markup).toContain('data-flat-draw-canvas="true"');
    expect(markup).toContain('data-flat-draw-canvas-layer="ink-layer"');
    expect(markup).toContain('data-flat-draw-canvas-layer="image-layer"');
    expect(markup).toContain('data-flat-draw-layer-active="true"');
    expect(markup).toContain('data-flat-draw-layer-item="stroke-main"');
    expect(markup).toContain('data-flat-draw-layer-item-type="BrushStroke"');
    expect(markup).toContain(
      'data-flat-draw-layer-item-path="artifacts/stroke-main.json"',
    );
    expect(markup).toContain(
      'data-flat-draw-layer-item-transform="artifacts/stroke-main-transform.json"',
    );
    expect(markup).toContain('data-flat-draw-layer-item="reference-image"');
    expect(markup).toContain('data-flat-draw-layer-item-type="Image"');
    expect(markup).toContain(
      'data-flat-draw-layer-item-path="artifacts/reference-image.png"',
    );
    expect(markup).toContain(
      'data-flat-draw-layer-item-transform="artifacts/reference-image-transform.json"',
    );
    expect(markup).toContain('data-flat-draw-draft-canvas="true"');
    expect(markup).toContain('aria-label="Draw layers"');
    expect(markup).toContain('aria-label="Active Layer Opacity"');
    expect(markup).toContain('name="draw-layer-alpha"');
    expect(markup).toContain('aria-label="Layer list"');
    expect(markup).toContain('data-flat-draw-layer="hidden-layer"');
    expect(markup).toContain('data-flat-draw-layer-visible="false"');
    expect(markup).toContain('data-flat-draw-layer-reorder="true"');
    expect(markup).toContain('data-flat-draw-layer-action="toggle-visibility"');
    expect(markup).toContain('data-flat-draw-layer-action="delete"');
    expect(markup).toContain('aria-label="Add draw layer"');
    expect(markup).toContain('data-flat-draw-layer-action="add"');
    expect(markup).toContain("Layer 3 Ink");
    expect(markup).toContain("Layer 2 Image");
    expect(markup).toContain("Layer 1 Hidden");
    expect(markup).toContain("2 elements");
    expect(markup).toContain("1 elements");
    expect(markup).toContain("0 elements");
    expect(markup).toContain("gg-pen");
    expect(markup).toContain("gg-erase");
    expect(markup).toContain("gg-maximize");
    expect(markup).toContain("gg-shape-circle");
    expect(markup).toContain("gg-trash");
    expect(markup).toContain("gg-math-plus");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-draw");
    expect(dictMarkup).not.toContain("data-flat-draw");
    expect(callableMarkup).not.toContain("Sketch Layer");
    expect(dictMarkup).not.toContain("Sketch Layer");
    expect(callableMarkup).not.toContain("artifacts/stroke-main.json");
    expect(dictMarkup).not.toContain("artifacts/stroke-main.json");
  });

  it("renders image path controls, artifact import, and contained decoded preview", () => {
    const markup = renderToStaticMarkup(<FlatImageSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="image"');
    expect(markup).toContain('data-flat-image="true"');
    expect(markup).toContain("Source Image");
    expect(markup).toContain("Image Path");
    expect(markup).toContain('aria-label="Image artifact controls"');
    expect(markup).toContain('aria-label="Image path"');
    expect(markup).toContain('name="image-path"');
    expect(markup).toContain('value="artifacts/source-image.png"');
    expect(markup).toContain(
      'data-flat-image-path="artifacts/source-image.png"',
    );
    expect(markup).toContain('aria-label="Add artifact by filepath"');
    expect(markup).toContain(
      'data-flat-image-action="add-artifact-by-filepath"',
    );
    expect(markup).toContain("Add Artifact");
    expect(markup).toContain('aria-label="Decoded image preview"');
    expect(markup).toContain('data-flat-image-preview="decoded"');
    expect(markup).toContain('data-flat-image-fit="contain"');
    expect(markup).toContain("<img");
    expect(markup).toContain('src="data:image/svg+xml');
    expect(markup).toContain("flat-section-prototype__image-preview-img");
    expect(markup).toContain("gg-image");
    expect(markup).toContain("gg-math-plus");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-image");
    expect(dictMarkup).not.toContain("data-flat-image");
    expect(callableMarkup).not.toContain("Source Image");
    expect(dictMarkup).not.toContain("Source Image");
    expect(callableMarkup).not.toContain("artifacts/source-image.png");
    expect(dictMarkup).not.toContain("artifacts/source-image.png");
  });

  it("renders text block mode controls, settings, scrollable markdown content, and code copy affordance", () => {
    const markup = renderToStaticMarkup(<FlatTextBlockSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="text-block"');
    expect(markup).toContain('data-flat-text-block="true"');
    expect(markup).toContain("Review Notes");
    expect(markup).toContain('data-flat-text-block-format="Markdown"');
    expect(markup).toContain('data-flat-text-block-display-mode="Render"');
    expect(markup).toContain(
      'data-flat-text-block-heading-as-section-name="false"',
    );
    expect(markup).toContain('data-flat-text-block-meta-control-style="false"');
    expect(markup).toContain('data-flat-text-block-master-font-size="18"');
    expect(markup).toContain('aria-label="Edit Markdown"');
    expect(markup).toContain(
      'data-flat-text-block-action="toggle-display-mode"',
    );
    expect(markup).toContain('data-flat-text-block-next-display-mode="Edit"');
    expect(markup).toContain('aria-label="Text block settings"');
    expect(markup).toContain('data-flat-text-block-setting="format"');
    expect(markup).toContain('data-flat-text-block-setting="display"');
    expect(markup).toContain('data-flat-text-block-setting="heading-name"');
    expect(markup).toContain('data-flat-text-block-setting="transparent"');
    expect(markup).toContain('data-flat-text-block-setting-active="true"');
    expect(markup).toContain('aria-label="Master font size"');
    expect(markup).toContain('name="text-block-master-font-size"');
    expect(markup).toContain('value="18"');
    expect(markup).toContain("18px");
    expect(markup).toContain('aria-label="Rendered markdown text"');
    expect(markup).toContain('data-flat-text-block-rendered="true"');
    expect(markup).toContain("Summarize the source material");
    expect(markup).toContain("Capture open questions");
    expect(markup).toContain("status: ready");
    expect(markup).toContain('data-flat-text-block-code-block="true"');
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup).toContain('data-flat-text-block-code-copy="true"');
    expect(markup).toContain("owner =");
    expect(markup).toContain("status =");
    expect(markup).toContain("flat-section-prototype__text-block-glyph");
    expect(markup).toContain("gg-copy");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-text-block");
    expect(dictMarkup).not.toContain("data-flat-text-block");
    expect(callableMarkup).not.toContain("Review Notes");
    expect(dictMarkup).not.toContain("Review Notes");
  });

  it("renders prompt source controls, template editor, preview state, and variable status", () => {
    const markup = renderToStaticMarkup(<FlatPromptSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="prompt"');
    expect(markup).toContain('data-flat-prompt="true"');
    expect(markup).toContain("Draft Prompt");
    expect(markup).toContain('data-flat-prompt-source="linked-template"');
    expect(markup).toContain(
      'data-flat-prompt-template-id="template-release-brief"',
    );
    expect(markup).toContain('data-flat-prompt-format="Jinja"');
    expect(markup).toContain('data-flat-prompt-missing-count="1"');
    expect(markup).toContain('aria-label="Prompt view mode"');
    expect(markup).toContain('data-flat-prompt-view-mode="template"');
    expect(markup).toContain('data-flat-prompt-view-mode="preview"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-flat-prompt-state="render-error"');
    expect(markup).toContain("Missing 1");
    expect(markup).toContain('aria-label="Prompt source controls"');
    expect(markup).toContain('aria-label="Linked prompt template selector"');
    expect(markup).toContain('data-flat-prompt-template-selector="true"');
    expect(markup).toContain("Release Brief");
    expect(markup).toContain("Summarizes release notes for reviewers.");
    expect(markup).toContain("Make Local Copy");
    expect(markup).toContain('data-flat-prompt-action="make-local-copy"');
    expect(markup).toContain('aria-label="Prompt format"');
    expect(markup).toContain('name="prompt-format"');
    expect(markup).toContain("Project AI Settings");
    expect(markup).toContain('data-flat-prompt-linked-template-note="true"');
    expect(markup).toContain('aria-label="Prompt editor and preview"');
    expect(markup).toContain('aria-label="Prompt template editor"');
    expect(markup).toContain('data-flat-prompt-template-editor="true"');
    expect(markup).toContain('data-flat-prompt-template-readonly="true"');
    expect(markup).toContain('aria-label="Prompt template source"');
    expect(markup).toContain('name="prompt-template-source"');
    expect(markup).toContain("Write a {{ tone }} release brief");
    expect(markup).toContain("{{ product }}");
    expect(markup).toContain("{{ owner }}");
    expect(markup).toContain('aria-label="Rendered prompt preview"');
    expect(markup).toContain('data-flat-prompt-render-preview="true"');
    expect(markup).toContain('data-flat-prompt-render-error="true"');
    expect(markup).toContain("Missing variables: owner");
    expect(markup).toContain("Write a concise release brief for Setta.");
    expect(markup).toContain(
      'aria-label="Prompt inputs and missing variables"',
    );
    expect(markup).toContain('aria-label="Prompt inputs"');
    expect(markup).toContain('data-flat-prompt-input="product"');
    expect(markup).toContain('data-flat-prompt-input="tone"');
    expect(markup).toContain(">Setta<");
    expect(markup).toContain(">concise<");
    expect(markup).toContain('aria-label="Missing prompt variables"');
    expect(markup).toContain('data-flat-prompt-missing-variable="owner"');
    expect(markup).toContain(">required<");
    expect(markup).toContain("flat-section-prototype__prompt-glyph");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-text-block");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-prompt");
    expect(dictMarkup).not.toContain("data-flat-prompt");
    expect(callableMarkup).not.toContain("Draft Prompt");
    expect(dictMarkup).not.toContain("Draft Prompt");
    expect(callableMarkup).not.toContain("template-release-brief");
    expect(dictMarkup).not.toContain("template-release-brief");
  });

  it("renders meta control as a compact single-control widget with real control affordances", () => {
    const markup = renderToStaticMarkup(<FlatMetaControlSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="meta-control"');
    expect(markup).toContain('data-flat-meta-control="true"');
    expect(markup).toContain("Sampling Controls");
    expect(markup).toContain(
      'data-flat-meta-control-param-id="param-temperature"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-code-obj-type="SliderParam"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-code-obj-variant-map="param-temperature:param-temperature-v1"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-show-section-title="true"',
    );
    expect(markup).toContain('data-flat-meta-control-section-title="visible"');
    expect(markup).toContain(
      'data-flat-meta-control-realtime="section-dependency"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-persistence="setParamEnteredValue"',
    );
    expect(markup).toContain('aria-label="Open MetaControl menu"');
    expect(markup).toContain('data-flat-meta-control-menu="true"');
    expect(markup).toContain('data-flat-meta-control-menu-action="show-title"');
    expect(markup).toContain(
      'data-flat-meta-control-menu-action="lock-position"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-menu-action="hide-or-close"',
    );
    expect(markup).toContain('aria-label="Active meta control"');
    expect(markup).toContain(
      'data-flat-meta-control-active-param="param-temperature"',
    );
    expect(markup).toContain('aria-label="SliderParam meta control value"');
    expect(markup).toContain(
      'data-flat-meta-control-widget-type="SliderParam"',
    );
    expect(markup).toContain('aria-label="temperature slider value"');
    expect(markup).toContain('name="meta-control-temperature"');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('value="0.72"');
    expect(markup).toContain(">0.72<");
    expect(markup).toContain(
      'aria-label="Supported meta control widget examples"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-widget-type="ButtonParam"',
    );
    expect(markup).toContain('data-flat-meta-control-action-mode="SETTA_API"');
    expect(markup).toContain(
      'data-flat-meta-control-widget-type="SwitchParam"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-widget-type="ColorPickerParam"',
    );
    expect(markup).toContain("#2563eb");
    expect(markup).toContain(
      'data-flat-meta-control-widget-type="DropdownParam"',
    );
    expect(markup).toContain(">balanced<");
    expect(markup).toContain('data-flat-meta-control-widget-type="DateParam"');
    expect(markup).toContain('data-flat-meta-control-date-mode="calendar"');
    expect(markup).toContain('data-flat-meta-control-date-selection="single"');
    expect(markup).toContain('data-flat-meta-control-widget-type="TimeParam"');
    expect(markup).toContain('data-flat-meta-control-time-mode="input"');
    expect(markup).toContain(
      'data-flat-meta-control-widget-type="DropzoneParam"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-dropzone-mode="STATELESS"',
    );
    expect(markup).toContain("Action event");
    expect(markup).toContain(
      'data-flat-meta-control-selected-param="param-temperature"',
    );
    expect(markup).toContain(
      'data-flat-meta-control-pinned-param="param-temperature"',
    );
    expect(markup).toContain("param-temperature-v1");
    expect(markup).toContain("flat-section-prototype__meta-control-glyph");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain('aria-label="Minimize section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-text-block");
    expect(markup).not.toContain("data-flat-prompt");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-meta-control");
    expect(dictMarkup).not.toContain("data-flat-meta-control");
    expect(callableMarkup).not.toContain("Sampling Controls");
    expect(dictMarkup).not.toContain("Sampling Controls");
    expect(callableMarkup).not.toContain("param-temperature");
    expect(dictMarkup).not.toContain("param-temperature");
  });

  it("renders social URL settings, provider detection, and contained embed affordances", () => {
    const markup = renderToStaticMarkup(<FlatSocialSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="social"');
    expect(markup).toContain('data-flat-social="true"');
    expect(markup).toContain("Launch Clip");
    expect(markup).toContain('data-flat-social-provider="youtube"');
    expect(markup).toContain('data-flat-social-editable="true"');
    expect(markup).toContain('data-flat-social-size-mode="auto"');
    expect(markup).toContain(
      'data-flat-social-url="https://www.youtube.com/watch?v=setta-launch"',
    );
    expect(markup).toContain('aria-label="Social URL settings"');
    expect(markup).toContain("Social Media URL");
    expect(markup).toContain('aria-label="Social Media URL"');
    expect(markup).toContain('name="social-media-url"');
    expect(markup).toContain(
      'value="https://www.youtube.com/watch?v=setta-launch"',
    );
    expect(markup).toContain('aria-label="Detected social providers"');
    expect(markup).toContain('data-flat-social-provider-option="youtube"');
    expect(markup).toContain('data-flat-social-provider-status="active"');
    expect(markup).toContain('data-flat-social-provider-option="twitter"');
    expect(markup).toContain('data-flat-social-provider-status="supported"');
    expect(markup).toContain(">YouTube<");
    expect(markup).toContain(">Twitter/X<");
    expect(markup).toContain('aria-label="YouTube social embed preview"');
    expect(markup).toContain('data-flat-social-embed-provider="youtube"');
    expect(markup).toContain(
      'data-flat-social-youtube-video-id="setta-launch"',
    );
    expect(markup).toContain('data-flat-social-player-state="thumbnail"');
    expect(markup).toContain('aria-label="YouTube thumbnail click target"');
    expect(markup).toContain('data-flat-social-thumbnail-click="show-video"');
    expect(markup).toContain('aria-label="Play YouTube video"');
    expect(markup).toContain('data-flat-social-action="play-youtube"');
    expect(markup).toContain("gg-play-button-o");
    expect(markup).toContain("YouTube thumbnail waits for click");
    expect(markup).toContain('aria-label="Twitter/X embed route"');
    expect(markup).toContain('data-flat-social-embed-provider="twitter"');
    expect(markup).toContain(
      'data-flat-social-twitter-tweet-id="1784926812345678901"',
    );
    expect(markup).toContain("1784926812345678901");
    expect(markup).toContain("flat-section-prototype__social-glyph");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-text-block");
    expect(markup).not.toContain("data-flat-prompt");
    expect(markup).not.toContain("data-flat-meta-control");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-social");
    expect(dictMarkup).not.toContain("data-flat-social");
    expect(callableMarkup).not.toContain("Launch Clip");
    expect(dictMarkup).not.toContain("Launch Clip");
    expect(callableMarkup).not.toContain("setta-launch");
    expect(dictMarkup).not.toContain("setta-launch");
  });

  it("renders global variables singleton status, kwargs controls, and global param rows", () => {
    const markup = renderToStaticMarkup(
      <FlatGlobalVariablesSectionPrototype />,
    );

    expect(markup).toContain('data-flat-section-kind="global-variables"');
    expect(markup).toContain('data-flat-global-variables="true"');
    expect(markup).toContain("Global Variables");
    expect(markup).toContain('data-flat-global-singleton="true"');
    expect(markup).toContain('data-flat-global-title-editable="false"');
    expect(markup).toContain(
      'data-flat-global-top-level-param-id="global-root"',
    );
    expect(markup).toContain('data-flat-global-export-mode="top-level"');
    expect(markup).toContain('data-flat-global-selected-params="api_token"');
    expect(markup).toContain('data-flat-global-pinned-params="workspace_id"');
    expect(markup).toContain('data-flat-global-edge-input-params="api_token"');
    expect(markup).toContain('aria-label="Global variable controls"');
    expect(markup).toContain('aria-label="Global variable param actions"');
    expect(markup).toContain('data-flat-global-action="remove-kwarg"');
    expect(markup).toContain('data-flat-global-action="add-kwarg"');
    expect(markup).toContain('data-flat-global-action="pin-selected"');
    expect(markup).toContain('data-flat-global-action="convert-edge-input"');
    expect(markup).toContain('data-flat-global-action="delete-selected"');
    expect(markup).toContain('aria-label="Global variables filter"');
    expect(markup).toContain('name="global-variables-filter"');
    expect(markup).toContain('value="global"');
    expect(markup).toContain('aria-label="Global variables status"');
    expect(markup).toContain('data-flat-global-status="singleton"');
    expect(markup).toContain('data-flat-global-status="top-level-param"');
    expect(markup).toContain('data-flat-global-status="python-export"');
    expect(markup).toContain("Top-level root");
    expect(markup).toContain("Python export");
    expect(markup).toContain('aria-label="Global variable params"');
    expect(markup).toContain('data-flat-row-group="pinned"');
    expect(markup).toContain('data-flat-row-group="body"');
    expect(markup).toContain('data-flat-row-key="workspace_id"');
    expect(markup).toContain('data-flat-row-key="api_token"');
    expect(markup).toContain('data-flat-row-key="runtime"');
    expect(markup).toContain('data-flat-row-key="environment"');
    expect(markup).toContain('data-flat-row-key="retry_limit"');
    expect(markup).toContain('data-flat-row-key="release_notes_url"');
    expect(markup).toContain('data-flat-row-emphasis="pinned"');
    expect(markup).toContain('data-flat-row-emphasis="edge"');
    expect(markup).toContain('data-flat-row-emphasis="group"');
    expect(markup).toContain('data-flat-row-emphasis="nested"');
    expect(markup).toContain('data-flat-row-emphasis="optional"');
    expect(markup).toContain("TextParam &quot;alpha&quot;");
    expect(markup).toContain("PasswordParam connected");
    expect(markup).toContain("NestedParam");
    expect(markup).toContain("TextParam &quot;staging&quot;");
    expect(markup).toContain("CodeParam 3");
    expect(markup).toContain("flat-section-prototype__global-glyph");
    expect(markup).toContain("gg-math-plus");
    expect(markup).toContain("gg-math-minus");
    expect(markup).toContain("gg-pin-alt");
    expect(markup).toContain("gg-link");
    expect(markup).toContain("gg-close");
    expect(markup).toContain("gg-search");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-global-variables");
    expect(dictMarkup).not.toContain("data-flat-global-variables");
    expect(callableMarkup).not.toContain("Global Variables");
    expect(dictMarkup).not.toContain("Global Variables");
    expect(callableMarkup).not.toContain("global-root");
    expect(dictMarkup).not.toContain("global-root");
    expect(callableMarkup).not.toContain("api_token");
    expect(dictMarkup).not.toContain("api_token");
  });

  it("renders code editor, run affordances, file binding, diagnostics, and attached terminal state", () => {
    const markup = renderToStaticMarkup(<FlatCodeSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="code"');
    expect(markup).toContain('data-flat-code="true"');
    expect(markup).toContain("Manual Runner");
    expect(markup).toContain('data-flat-code-language="python"');
    expect(markup).toContain('data-flat-code-can-run="true"');
    expect(markup).toContain('data-flat-code-entry-code-block="true"');
    expect(markup).toContain('data-flat-code-terminal-visible="true"');
    expect(markup).toContain('data-flat-code-auto-binding="true"');
    expect(markup).toContain('data-flat-code-access-mode="read_write"');
    expect(markup).toContain(
      'data-flat-code-attached-terminal-id="terminal-manual-runner"',
    );
    expect(markup).toContain('data-flat-code-preview-source="persisted"');
    expect(markup).toContain('aria-label="Run this code block"');
    expect(markup).toContain('aria-label="Toggle Entry Code Block"');
    expect(markup).toContain('aria-label="Hide terminal"');
    expect(markup).toContain('aria-label="Problems 2"');
    expect(markup).toContain('data-flat-code-header-action="run"');
    expect(markup).toContain('data-flat-code-header-action="entry"');
    expect(markup).toContain('data-flat-code-header-action="terminal"');
    expect(markup).toContain('data-flat-code-header-action="diagnostics"');
    expect(markup).toContain('data-flat-code-header-action-state="ready"');
    expect(markup).toContain('data-flat-code-header-action-state="selected"');
    expect(markup).toContain('data-flat-code-header-action-state="visible"');
    expect(markup).toContain('data-flat-code-header-action-state="issues"');
    expect(markup).toContain(
      'aria-label="Code file binding and runtime status"',
    );
    expect(markup).toContain('aria-label="Code file path"');
    expect(markup).toContain('name="code-file-path"');
    expect(markup).toContain('value="code/sections/manual_runner.py"');
    expect(markup).toContain('aria-label="Code file access mode"');
    expect(markup).toContain('name="code-access-mode"');
    expect(markup).toContain('value="read_write"');
    expect(markup).toContain("Read &amp; Write");
    expect(markup).toContain('aria-label="Code section status"');
    expect(markup).toContain('data-flat-code-status="language"');
    expect(markup).toContain('data-flat-code-status="binding"');
    expect(markup).toContain('data-flat-code-status="entry"');
    expect(markup).toContain('aria-label="Code diagnostics summary"');
    expect(markup).toContain('data-flat-code-diagnostics-count="2"');
    expect(markup).toContain(
      'data-flat-code-suppressed-codes="reportUnusedCall"',
    );
    expect(markup).toContain('data-flat-code-diagnostics-muted="false"');
    expect(markup).toContain('data-flat-code-diagnostics-state="active"');
    expect(markup).toContain('data-flat-code-diagnostics-state="muted"');
    expect(markup).toContain('data-flat-code-diagnostics-state="suppressed"');
    expect(markup).toContain("reportUnusedCall");
    expect(markup).toContain('aria-label="Code editor"');
    expect(markup).toContain('data-flat-code-editor="true"');
    expect(markup).toContain('data-flat-code-editor-language="python"');
    expect(markup).toContain('data-flat-code-line="1"');
    expect(markup).toContain('data-flat-code-line="4"');
    expect(markup).toContain("def run(context):");
    expect(markup).toContain("rank_items(profile.items)");
    expect(markup).toContain('data-flat-code-diagnostic="warning"');
    expect(markup).toContain('data-flat-code-diagnostic="error"');
    expect(markup).toContain(
      'data-flat-code-diagnostic-code="reportMissingTypeStubs"',
    );
    expect(markup).toContain(
      'data-flat-code-diagnostic-code="reportPossiblyUnboundVariable"',
    );
    expect(markup).toContain("Type information is unavailable");
    expect(markup).toContain("score may be unbound");
    expect(markup).toContain('aria-label="Attached terminal child"');
    expect(markup).toContain(
      'data-flat-code-terminal-child="terminal-manual-runner"',
    );
    expect(markup).toContain("Attached terminal");
    expect(markup).toContain("flat-section-prototype__entry-glyph");
    expect(markup).toContain("flat-section-prototype__terminal-glyph");
    expect(markup).toContain("flat-section-prototype__diagnostics-glyph");
    expect(markup).toContain("gg-play-button-o");
    expect(markup).toContain("gg-code-slash");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-code=");
    expect(dictMarkup).not.toContain("data-flat-code=");
    expect(callableMarkup).not.toContain("Manual Runner");
    expect(dictMarkup).not.toContain("Manual Runner");
    expect(callableMarkup).not.toContain("terminal-manual-runner");
    expect(dictMarkup).not.toContain("terminal-manual-runner");
  });

  it("renders generated Python prefix, protected body, suffix, diagnostics, and generated binding state", () => {
    const markup = renderToStaticMarkup(<FlatGenPythonCodeSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="gen-python-code"');
    expect(markup).toContain('data-flat-gen-python-code="true"');
    expect(markup).toContain("Generated Python Code");
    expect(markup).toContain('data-flat-gen-python-language="python"');
    expect(markup).toContain('data-flat-gen-python-can-run="true"');
    expect(markup).toContain('data-flat-gen-python-entry-code-block="true"');
    expect(markup).toContain('data-flat-gen-python-terminal-visible="true"');
    expect(markup).toContain('data-flat-gen-python-auto-binding="false"');
    expect(markup).toContain('data-flat-gen-python-access-mode="write_only"');
    expect(markup).toContain('data-flat-gen-python-codegen-enabled="true"');
    expect(markup).toContain(
      'data-flat-gen-python-file-binding="code/sections/alpha/setta_gen.py"',
    );
    expect(markup).toContain(
      'data-flat-gen-python-attached-terminal-id="terminal-gen-python"',
    );
    expect(markup).toContain(
      'data-flat-gen-python-diagnostics-source="unmappedGenCode"',
    );
    expect(markup).toContain('data-flat-gen-python-separator-newlines="2"');
    expect(markup).toContain('aria-label="Run this code block"');
    expect(markup).toContain('aria-label="Toggle Entry Code Block"');
    expect(markup).toContain('aria-label="Hide terminal"');
    expect(markup).toContain('aria-label="Issues 1"');
    expect(markup).toContain('data-flat-gen-python-header-action="run"');
    expect(markup).toContain('data-flat-gen-python-header-action="entry"');
    expect(markup).toContain('data-flat-gen-python-header-action="terminal"');
    expect(markup).toContain(
      'data-flat-gen-python-header-action="diagnostics"',
    );
    expect(markup).toContain(
      'aria-label="Generated Python file binding and runtime status"',
    );
    expect(markup).toContain('aria-label="Generated Python file path"');
    expect(markup).toContain('name="gen-python-file-path"');
    expect(markup).toContain('value="code/sections/alpha/setta_gen.py"');
    expect(markup).toContain('aria-label="Generated Python file access mode"');
    expect(markup).toContain('name="gen-python-access-mode"');
    expect(markup).toContain('value="write_only"');
    expect(markup).toContain("Write Only");
    expect(markup).toContain('aria-label="Generated Python section status"');
    expect(markup).toContain('data-flat-gen-python-status="language"');
    expect(markup).toContain('data-flat-gen-python-status="binding"');
    expect(markup).toContain('data-flat-gen-python-status="codegen"');
    expect(markup).toContain(
      'aria-label="Generated Python diagnostics summary"',
    );
    expect(markup).toContain('data-flat-gen-python-diagnostics-count="1"');
    expect(markup).toContain("Generated Issues");
    expect(markup).toContain("unmappedGenCode");
    expect(markup).toContain('aria-label="Generated Python editor"');
    expect(markup).toContain('data-flat-gen-python-editor="true"');
    expect(markup).toContain('data-flat-gen-python-editor-language="python"');
    expect(markup).toContain('data-flat-gen-python-zone="prefix"');
    expect(markup).toContain('data-flat-gen-python-zone="generated"');
    expect(markup).toContain('data-flat-gen-python-zone="suffix"');
    expect(markup).toContain('data-flat-gen-python-editable="true"');
    expect(markup).toContain('data-flat-gen-python-readonly="true"');
    expect(markup).toContain("Generated read-only");
    expect(markup).toContain("protected");
    expect(markup).toContain('data-flat-gen-python-line="1"');
    expect(markup).toContain('data-flat-gen-python-line="10"');
    expect(markup).toContain('data-flat-gen-python-line-region="prefix"');
    expect(markup).toContain('data-flat-gen-python-line-region="generated"');
    expect(markup).toContain('data-flat-gen-python-line-region="suffix"');
    expect(markup).toContain("import math");
    expect(markup).toContain("class SettaState:");
    expect(markup).toContain("state.workspace_id");
    expect(markup).toContain("state = SettaState()");
    expect(markup).toContain('data-flat-code-diagnostic="warning"');
    expect(markup).toContain(
      'data-flat-code-diagnostic-code="reportGeneratedValue"',
    );
    expect(markup).toContain("Generated value needs runtime data");
    expect(markup).toContain(
      'aria-label="Attached generated Python terminal child"',
    );
    expect(markup).toContain(
      'data-flat-gen-python-terminal-child="terminal-gen-python"',
    );
    expect(markup).toContain("Attached terminal");
    expect(markup).toContain("flat-section-prototype__entry-glyph");
    expect(markup).toContain("flat-section-prototype__terminal-glyph");
    expect(markup).toContain("flat-section-prototype__diagnostics-glyph");
    expect(markup).toContain("gg-play-button-o");
    expect(markup).toContain("gg-code-slash");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");
    expect(markup).not.toContain('data-flat-code="true"');

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-gen-python-code");
    expect(dictMarkup).not.toContain("data-flat-gen-python-code");
    expect(callableMarkup).not.toContain("Generated Python Code");
    expect(dictMarkup).not.toContain("Generated Python Code");
    expect(callableMarkup).not.toContain("terminal-gen-python");
    expect(dictMarkup).not.toContain("terminal-gen-python");
  });

  it("renders generated Python metadata as an enabled read-only metadata code viewer", () => {
    const markup = renderToStaticMarkup(
      <FlatGenPythonMetadataSectionPrototype />,
    );

    expect(markup).toContain('data-flat-section-kind="gen-python-metadata"');
    expect(markup).toContain('data-flat-gen-python-metadata="true"');
    expect(markup).toContain("Generated Python Metadata");
    expect(markup).toContain('data-flat-gen-python-metadata-language="python"');
    expect(markup).toContain('data-flat-gen-python-metadata-enabled="true"');
    expect(markup).toContain('data-flat-gen-python-metadata-readonly="true"');
    expect(markup).toContain(
      'data-flat-gen-python-metadata-auto-binding="false"',
    );
    expect(markup).toContain(
      'data-flat-gen-python-metadata-access-mode="write_only"',
    );
    expect(markup).toContain(
      'data-flat-gen-python-metadata-file-binding="code/sections/alpha/setta_gen_meta.py"',
    );
    expect(markup).toContain('data-flat-gen-python-metadata-section-count="3"');
    expect(markup).toContain('aria-label="Generated Python metadata status"');
    expect(markup).toContain("Metadata File");
    expect(markup).toContain("code/sections/alpha/setta_gen_meta.py");
    expect(markup).toContain(
      'aria-label="Generated Python metadata section status"',
    );
    expect(markup).toContain('data-flat-gen-python-metadata-status="language"');
    expect(markup).toContain('data-flat-gen-python-metadata-status="metadata"');
    expect(markup).toContain('data-flat-gen-python-metadata-status="access"');
    expect(markup).toContain('data-flat-gen-python-metadata-status="body"');
    expect(markup).toContain('data-flat-gen-python-metadata-status="sections"');
    expect(markup).toContain("read-only");
    expect(markup).toContain('aria-label="Generated Python metadata editor"');
    expect(markup).toContain('data-flat-gen-python-metadata-editor="readonly"');
    expect(markup).toContain(
      'data-flat-gen-python-metadata-editor-language="python"',
    );
    expect(markup).toContain(
      'aria-label="Generated Python metadata code lines"',
    );
    expect(markup).toContain('data-flat-gen-python-metadata-line="1"');
    expect(markup).toContain('data-flat-gen-python-metadata-line="105"');
    expect(markup).toContain(
      'data-flat-gen-python-metadata-line-kind="definition"',
    );
    expect(markup).toContain(
      'data-flat-gen-python-metadata-line-kind="project"',
    );
    expect(markup).toContain(
      'data-flat-gen-python-metadata-line-kind="sections"',
    );
    expect(markup).toContain(
      'data-flat-gen-python-metadata-line-kind="sections_by_id"',
    );
    expect(markup).toContain('data-flat-gen-python-metadata-line-kind="meta"');
    expect(markup).toContain("from dataclasses import dataclass");
    expect(markup).toContain("class ProjectMetadata:");
    expect(markup).toContain("class SectionMetadata:");
    expect(markup).toContain("class SettaGenMetadata:");
    expect(markup).toContain("project = ProjectMetadata(");
    expect(markup).toContain("activeViewModeId=&#x27;view-mode-1&#x27;");
    expect(markup).toContain("sections = {");
    expect(markup).toContain("sections_by_id = {");
    expect(markup).toContain(
      "meta = SettaGenMetadata(project=project, sections=sections, sections_by_id=sections_by_id)",
    );
    expect(markup).not.toContain('data-flat-gen-python-code="true"');
    expect(markup).not.toContain("data-flat-gen-python-header-action");
    expect(markup).not.toContain('aria-label="Run this code block"');
    expect(markup).not.toContain('aria-label="Toggle Entry Code Block"');
    expect(markup).not.toContain('aria-label="Hide terminal"');
    expect(markup).not.toContain('aria-label="Issues 1"');
    expect(markup).not.toContain("data-flat-gen-python-terminal-child");
    expect(markup).not.toContain("Attached terminal");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");
    expect(markup).not.toContain('data-flat-code="true"');

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-gen-python-metadata");
    expect(dictMarkup).not.toContain("data-flat-gen-python-metadata");
    expect(callableMarkup).not.toContain("Generated Python Metadata");
    expect(dictMarkup).not.toContain("Generated Python Metadata");
    expect(callableMarkup).not.toContain("setta_gen_meta.py");
    expect(dictMarkup).not.toContain("setta_gen_meta.py");
  });

  it("renders terminal session status, scrollback, prompt input, and read/write surface", () => {
    const markup = renderToStaticMarkup(<FlatTerminalSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="terminal"');
    expect(markup).toContain('data-flat-terminal="true"');
    expect(markup).toContain("Managed Console");
    expect(markup).toContain(
      'data-flat-terminal-section-id="terminal-managed-console"',
    );
    expect(markup).toContain('data-flat-terminal-context="top-level"');
    expect(markup).toContain(
      'data-flat-terminal-session-mode="managed_console"',
    );
    expect(markup).toContain('data-flat-terminal-status="ready"');
    expect(markup).toContain('data-flat-terminal-access="read-write"');
    expect(markup).toContain('data-flat-terminal-cols="96"');
    expect(markup).toContain('data-flat-terminal-rows="24"');
    expect(markup).toContain('data-flat-terminal-scrollback-lines="128"');
    expect(markup).toContain('aria-label="Terminal session status"');
    expect(markup).toContain('data-flat-terminal-status-item="connection"');
    expect(markup).toContain('data-flat-terminal-status-item="mode"');
    expect(markup).toContain('data-flat-terminal-status-item="access"');
    expect(markup).toContain('data-flat-terminal-status-item="geometry"');
    expect(markup).toContain("managed_console");
    expect(markup).toContain("read-write");
    expect(markup).toContain("96x24");
    expect(markup).toContain('aria-label="Read/write terminal surface"');
    expect(markup).toContain('data-flat-terminal-surface="xterm"');
    expect(markup).toContain('data-section-main-editor="true"');
    expect(markup).toContain('aria-label="Terminal scrollback"');
    expect(markup).toContain('data-flat-terminal-line="ready"');
    expect(markup).toContain('data-flat-terminal-line-kind="system"');
    expect(markup).toContain('data-flat-terminal-line-kind="command"');
    expect(markup).toContain('data-flat-terminal-line-kind="output"');
    expect(markup).toContain("terminal websocket ready");
    expect(markup).toContain("pwd");
    expect(markup).toContain("/home/ubuntu/dev/setta");
    expect(markup).toContain("fit 96 cols x 24 rows");
    expect(markup).toContain("TerminalArea.test.tsx");
    expect(markup).toContain("PASS TerminalArea.test.tsx");
    expect(markup).toContain('data-flat-terminal-active-input="true"');
    expect(markup).toContain("setta@workspace:~$");
    expect(markup).toContain("tail -f logs/runtime.log");
    expect(markup).toContain("flat-section-prototype__terminal-cursor");
    expect(markup).toContain("flat-section-prototype__terminal-glyph");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain('data-flat-code="true"');
    expect(markup).not.toContain("data-flat-gen-python-header-action");
    expect(markup).not.toContain('aria-label="Run this code block"');
    expect(markup).not.toContain('aria-label="Toggle Entry Code Block"');
    expect(markup).not.toContain('aria-label="Hide terminal"');
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-terminal");
    expect(dictMarkup).not.toContain("data-flat-terminal");
    expect(callableMarkup).not.toContain("Managed Console");
    expect(dictMarkup).not.toContain("Managed Console");
    expect(callableMarkup).not.toContain("terminal-managed-console");
    expect(dictMarkup).not.toContain("terminal-managed-console");
  });

  it("renders iframe source status and a contained iframe viewport without body controls", () => {
    const markup = renderToStaticMarkup(<FlatIFrameSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="iframe"');
    expect(markup).toContain('data-flat-iframe="true"');
    expect(markup).toContain("Example Embed");
    expect(markup).toContain(
      'data-flat-iframe-src="https://example.com/embed"',
    );
    expect(markup).toContain('data-flat-iframe-title="demo"');
    expect(markup).toContain('data-flat-iframe-validation="valid"');
    expect(markup).toContain('data-flat-iframe-resize-mode="container-fit"');
    expect(markup).toContain('data-flat-iframe-default-size="250x150"');
    expect(markup).toContain('aria-label="Iframe source status"');
    expect(markup).toContain('data-flat-iframe-status-item="source"');
    expect(markup).toContain('data-flat-iframe-status-item="validation"');
    expect(markup).toContain('data-flat-iframe-status-item="resize"');
    expect(markup).toContain("valid iframe");
    expect(markup).toContain("fills section");
    expect(markup).toContain('aria-label="Rendered iframe embed"');
    expect(markup).toContain('data-flat-iframe-preview="rendered"');
    expect(markup).toContain('data-flat-iframe-frame="true"');
    expect(markup).toContain("<iframe");
    expect(markup).toContain('title="demo"');
    expect(markup).toContain("demo");
    expect(markup).toContain(
      "Embedded iframe content sized by the section body.",
    );
    expect(markup).toContain("gg-code-slash");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain('data-flat-code="true"');
    expect(markup).not.toContain("data-flat-gen-python");
    expect(markup).not.toContain("data-flat-terminal=");
    expect(markup).not.toContain("data-flat-terminal-surface");
    expect(markup).not.toContain('aria-label="Run this code block"');
    expect(markup).not.toContain('aria-label="Toggle Entry Code Block"');
    expect(markup).not.toContain('aria-label="Hide terminal"');
    expect(markup).not.toContain("Add Artifact");
    expect(markup).not.toContain("Iframe Code");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-iframe");
    expect(dictMarkup).not.toContain("data-flat-iframe");
    expect(callableMarkup).not.toContain("Example Embed");
    expect(dictMarkup).not.toContain("Example Embed");
    expect(callableMarkup).not.toContain("https://example.com/embed");
    expect(dictMarkup).not.toContain("https://example.com/embed");
  });

  it("renders chat thread controls, transcript, composer, and source/target scope handles", () => {
    const markup = renderToStaticMarkup(<FlatChatSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="chat"');
    expect(markup).toContain('data-flat-chat="true"');
    expect(markup).toContain("Review Chat");
    expect(markup).toContain('data-flat-chat-managed="true"');
    expect(markup).toContain('data-flat-chat-chat-id="chat-release-review"');
    expect(markup).toContain(
      'data-flat-chat-engine-config-id="engine-setta-llm"',
    );
    expect(markup).toContain('data-flat-chat-engine-type="setta_llm"');
    expect(markup).toContain(
      'data-flat-chat-agent-profile-id="agent-reviewer"',
    );
    expect(markup).toContain('data-flat-chat-permission-mode="minimal"');
    expect(markup).toContain('data-flat-chat-search-enabled="true"');
    expect(markup).toContain('data-flat-chat-thinking="true"');
    expect(markup).toContain('data-flat-chat-dictation-mode="auto"');
    expect(markup).toContain('data-flat-chat-waiting-for-response="true"');
    expect(markup).toContain('data-flat-chat-active-branch-id="branch-main"');
    expect(markup).toContain('data-flat-chat-branch-count="3"');
    expect(markup).toContain('aria-label="Chat thread and execution state"');
    expect(markup).toContain('aria-label="Managed chat thread controls"');
    expect(markup).toContain('data-flat-chat-action="history"');
    expect(markup).toContain('data-flat-chat-action="new-chat"');
    expect(markup).toContain(">History<");
    expect(markup).toContain(">New Chat<");
    expect(markup).toContain('aria-label="Chat execution settings"');
    expect(markup).toContain('data-flat-chat-setting="permission"');
    expect(markup).toContain('data-flat-chat-setting="search"');
    expect(markup).toContain('data-flat-chat-setting="thinking"');
    expect(markup).toContain('data-flat-chat-setting="dictation"');
    expect(markup).toContain('data-flat-chat-setting="context"');
    expect(markup).toContain("18.4k");
    expect(markup).toContain("64k");
    expect(markup).toContain('aria-label="Chat edge scope handles"');
    expect(markup).toContain('data-flat-chat-edge-handle="target"');
    expect(markup).toContain('data-flat-chat-edge-handle="source"');
    expect(markup).toContain('data-flat-agentic-edge-kind="chat_chat"');
    expect(markup).toContain('data-flat-agentic-edge-kind="chat_section"');
    expect(markup).toContain('data-flat-chat-scope-targets="1"');
    expect(markup).toContain('data-flat-chat-scope-sources="2"');
    expect(markup).toContain('aria-label="Chat message transcript"');
    expect(markup).toContain('data-flat-chat-transcript="scroll"');
    expect(markup).toContain('data-flat-chat-message="msg-user-review"');
    expect(markup).toContain('data-flat-chat-role="user"');
    expect(markup).toContain('data-flat-chat-role="assistant"');
    expect(markup).toContain('data-flat-chat-role="tool"');
    expect(markup).toContain('data-flat-chat-message-streaming="true"');
    expect(markup).toContain("Review the current project sections");
    expect(markup).toContain("missing regression coverage");
    expect(markup).toContain("section_state returned 4 matching sections");
    expect(markup).toContain(
      "Checking section scope before drafting the final response",
    );
    expect(markup).toContain('data-flat-chat-attachment="release-notes.md"');
    expect(markup).toContain("release-notes.md");
    expect(markup).toContain('data-flat-chat-branch-switch="1/3"');
    expect(markup).toContain('data-flat-chat-tool-call="call-scope-1"');
    expect(markup).toContain('data-flat-chat-tool-call="call-scope-2"');
    expect(markup).toContain('data-flat-chat-tool-name="section_state"');
    expect(markup).toContain('aria-label="Active tool-call arguments"');
    expect(markup).toContain('data-flat-chat-tool-argument="call-scope-2"');
    expect(markup).toContain(
      'data-flat-chat-tool-argument-name="section_state"',
    );
    expect(markup).toContain("global-variables");
    expect(markup).toContain('aria-label="Chat composer"');
    expect(markup).toContain('data-flat-chat-composer="true"');
    expect(markup).toContain('aria-label="Chat message draft"');
    expect(markup).toContain('name="chat-message-draft"');
    expect(markup).toContain("Add launch blockers before sending.");
    expect(markup).toContain('aria-label="Chat composer controls"');
    expect(markup).toContain('aria-label="Attach file"');
    expect(markup).toContain('data-flat-chat-composer-action="attach"');
    expect(markup).toContain('aria-label="Start dictation"');
    expect(markup).toContain('data-flat-chat-composer-action="dictation"');
    expect(markup).toContain(
      'data-flat-chat-slash-commands="/new /resume /help"',
    );
    expect(markup).toContain('aria-label="Stop chat response"');
    expect(markup).toContain('data-flat-chat-composer-action="stop"');
    expect(markup).toContain("gg-shape-square");
    expect(markup).toContain("flat-section-prototype__chat-glyph");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain('data-flat-code="true"');
    expect(markup).not.toContain("data-flat-gen-python");
    expect(markup).not.toContain("data-flat-terminal=");
    expect(markup).not.toContain("data-flat-iframe");
    expect(markup).not.toContain('aria-label="Run this code block"');
    expect(markup).not.toContain('aria-label="Toggle Entry Code Block"');
    expect(markup).not.toContain('aria-label="Hide terminal"');
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-chat");
    expect(dictMarkup).not.toContain("data-flat-chat");
    expect(callableMarkup).not.toContain("Review Chat");
    expect(dictMarkup).not.toContain("Review Chat");
    expect(callableMarkup).not.toContain("chat-release-review");
    expect(dictMarkup).not.toContain("chat-release-review");
  });

  it("renders browser filters, saved searches, navigation, view modes, and file list affordances", () => {
    const markup = renderToStaticMarkup(<FlatBrowserSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="browser"');
    expect(markup).toContain('data-flat-browser="true"');
    expect(markup).toContain("Workspace Browser");
    expect(markup).toContain('data-flat-browser-folder="/workspace/assets"');
    expect(markup).toContain('data-flat-browser-root-path="/workspace"');
    expect(markup).toContain('data-flat-browser-path-separator="/"');
    expect(markup).toContain(
      'data-flat-browser-ignore-patterns="node_modules,.git"',
    );
    expect(markup).toContain('data-flat-browser-hide-column="false"');
    expect(markup).toContain('data-flat-browser-view-mode="list"');
    expect(markup).toContain('data-flat-browser-search-scope="recursive"');
    expect(markup).toContain('data-flat-browser-filter-text="release"');
    expect(markup).toContain('data-flat-browser-column-width="72%"');
    expect(markup).toContain('data-flat-browser-types-column-width="220px"');
    expect(markup).toContain(
      'data-flat-browser-allow-outside-workspace-root="true"',
    );
    expect(markup).toContain(
      'data-flat-browser-missing-folder-behavior="empty"',
    );
    expect(markup).toContain(
      'data-flat-browser-loaded-via="getFolderContents"',
    );
    expect(markup).toContain('aria-label="Browser filters and saved searches"');
    expect(markup).toContain('data-flat-browser-filters-visible="true"');
    expect(markup).toContain('aria-label="Browser type filters"');
    expect(markup).toContain('data-flat-browser-type-filter="image"');
    expect(markup).toContain('data-flat-browser-type-filter="video"');
    expect(markup).toContain('data-flat-browser-type-filter="audio"');
    expect(markup).toContain('data-flat-browser-type-filter="text"');
    expect(markup).toContain('data-flat-browser-type-filter="data"');
    expect(markup).toContain('data-flat-browser-type-filter-active="true"');
    expect(markup).toContain('aria-label="Select all Browser type filters"');
    expect(markup).toContain(
      'data-flat-browser-type-filter-action="select-all"',
    );
    expect(markup).toContain('aria-label="Browser saved searches"');
    expect(markup).toContain(
      'data-flat-browser-saved-search="search-release-media"',
    );
    expect(markup).toContain('data-flat-browser-saved-search-active="true"');
    expect(markup).toContain('data-flat-browser-saved-search-query="release"');
    expect(markup).toContain(
      'data-flat-browser-saved-search-scope="recursive"',
    );
    expect(markup).toContain(
      'data-flat-browser-saved-search="search-local-docs"',
    );
    expect(markup).toContain("Release media");
    expect(markup).toContain("Local docs");
    expect(markup).toContain('data-flat-browser-column-resize="types"');
    expect(markup).toContain(
      'aria-label="Browser path, filter, and view controls"',
    );
    expect(markup).toContain('aria-label="Browser folder history"');
    expect(markup).toContain('aria-label="Go back"');
    expect(markup).toContain('aria-label="Go forward"');
    expect(markup).toContain('aria-label="Go up"');
    expect(markup).toContain('data-flat-browser-action="go-up"');
    expect(markup).toContain('aria-label="Browser folder path"');
    expect(markup).toContain('name="browser-folder-path"');
    expect(markup).toContain('value="/workspace/assets"');
    expect(markup).toContain('aria-label="Browser filter"');
    expect(markup).toContain('name="browser-filter"');
    expect(markup).toContain('value="release"');
    expect(markup).toContain('aria-label="Save Browser search"');
    expect(markup).toContain('data-flat-browser-action="save-search"');
    expect(markup).toContain('aria-label="Browser view mode"');
    expect(markup).toContain('data-flat-browser-view-option="list"');
    expect(markup).toContain('data-flat-browser-view-option="thumbnail"');
    expect(markup).toContain('data-flat-browser-view-option="carousel"');
    expect(markup).toContain('data-flat-browser-view-active="true"');
    expect(markup).toContain('aria-label="Browser breadcrumbs"');
    expect(markup).toContain('data-flat-browser-breadcrumb="/workspace"');
    expect(markup).toContain(
      'data-flat-browser-breadcrumb="/workspace/assets"',
    );
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Browser list view"');
    expect(markup).toContain('data-flat-browser-list="true"');
    expect(markup).toContain('aria-label="Browser list columns"');
    expect(markup).toContain('data-flat-browser-sort-column="name"');
    expect(markup).toContain('data-flat-browser-sort-direction="asc"');
    expect(markup).toContain('data-flat-browser-sort-column="modified"');
    expect(markup).toContain('data-flat-browser-column-resize="files"');
    expect(markup).toContain('aria-label="Browser folder items"');
    expect(markup).toContain('data-flat-browser-visible-item-count="5"');
    expect(markup).toContain(
      'data-flat-browser-item="/workspace/assets/screenshots"',
    );
    expect(markup).toContain('data-flat-browser-item-kind="folder"');
    expect(markup).toContain('data-flat-browser-item-droppable="true"');
    expect(markup).toContain('data-flat-browser-item-expanded="true"');
    expect(markup).toContain(
      'data-flat-browser-folder-toggle="/workspace/assets/screenshots"',
    );
    expect(markup).toContain(
      'data-flat-browser-item="/workspace/assets/screenshots/release-cover.png"',
    );
    expect(markup).toContain('data-flat-browser-item-kind="file"');
    expect(markup).toContain('data-flat-browser-item-draggable="true"');
    expect(markup).toContain('data-flat-browser-item-selected="true"');
    expect(markup).toContain('data-flat-browser-item-preview-kind="image"');
    expect(markup).toContain('data-flat-browser-row-open="double-click"');
    expect(markup).toContain("release-cover.png");
    expect(markup).toContain("release-notes.md");
    expect(markup).toContain("metrics.csv");
    expect(markup).toContain("Today 09:42");
    expect(markup).toContain("Date modified");
    expect(markup).toContain("gg-folder");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain('data-flat-code="true"');
    expect(markup).not.toContain("data-flat-gen-python");
    expect(markup).not.toContain("data-flat-terminal=");
    expect(markup).not.toContain("data-flat-iframe");
    expect(markup).not.toContain("data-flat-chat");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-browser");
    expect(dictMarkup).not.toContain("data-flat-browser");
    expect(callableMarkup).not.toContain("Workspace Browser");
    expect(dictMarkup).not.toContain("Workspace Browser");
    expect(callableMarkup).not.toContain("/workspace/assets");
    expect(dictMarkup).not.toContain("/workspace/assets");
    expect(callableMarkup).not.toContain("release-cover.png");
    expect(dictMarkup).not.toContain("release-cover.png");
  });

  it("renders plugin runtime host metadata and a mounted plugin-owned renderer", () => {
    const markup = renderToStaticMarkup(<FlatPluginSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="plugin"');
    expect(markup).toContain('data-flat-plugin="true"');
    expect(markup).toContain("React Fixture Card");
    expect(markup).toContain('data-flat-plugin-section-type="Plugin"');
    expect(markup).toContain(
      'data-flat-plugin-section-id="plugin-react-fixture"',
    );
    expect(markup).toContain(
      'data-flat-plugin-plugin-id="setta-fixture-frontend-react"',
    );
    expect(markup).toContain('data-flat-plugin-kind="fixture-react-card"');
    expect(markup).toContain('data-flat-plugin-schema-version="1"');
    expect(markup).toContain('data-flat-plugin-server-mode="ide"');
    expect(markup).toContain('data-flat-plugin-read-only="false"');
    expect(markup).toContain(
      'data-flat-plugin-effective-capabilities="registerSectionKinds,updateSection"',
    );
    expect(markup).toContain('aria-label="Plugin runtime host"');
    expect(markup).toContain('data-flat-plugin-host-field="pluginId"');
    expect(markup).toContain('data-flat-plugin-host-field="kind"');
    expect(markup).toContain('data-flat-plugin-host-field="schemaVersion"');
    expect(markup).toContain('data-flat-plugin-host-field="serverMode"');
    expect(markup).toContain('data-flat-plugin-host-field="capabilities"');
    expect(markup).toContain('aria-label="Mounted plugin renderer"');
    expect(markup).toContain('data-flat-plugin-renderer="mounted"');
    expect(markup).toContain(
      'data-flat-plugin-renderer-title="React Fixture Card"',
    );
    expect(markup).toContain(
      'data-flat-plugin-renderer-description="Section kind rendered with React component tree."',
    );
    expect(markup).toContain(
      'data-flat-plugin-renderer-lifecycle="mount,update,unmount"',
    );
    expect(markup).toContain(
      'data-flat-plugin-renderer-kind="fixture-react-card"',
    );
    expect(markup).toContain('data-flat-plugin-renderer-read-only="false"');
    expect(markup).toContain('data-flat-plugin-renderer-mode="ide"');
    expect(markup).toContain("mode:ide");
    expect(markup).toContain('data-flat-plugin-data-field="details"');
    expect(markup).toContain("React renderer is active.");
    expect(markup).toContain('aria-label="Plugin renderer stats"');
    expect(markup).toContain('data-flat-plugin-renderer-stat="words"');
    expect(markup).toContain(
      'data-flat-plugin-renderer-stat-source="computed"',
    );
    expect(markup).toContain('data-flat-plugin-renderer-stat="local-clicks"');
    expect(markup).toContain('data-flat-plugin-renderer-stat="saved-pulses"');
    expect(markup).toContain('data-flat-plugin-renderer-stat="state"');
    expect(markup).toContain(">Unpinned<");
    expect(markup).toContain('aria-label="Plugin renderer controls"');
    expect(markup).toContain('data-flat-plugin-renderer-action="toggle-pin"');
    expect(markup).toContain('data-flat-plugin-renderer-action="save-pulse"');
    expect(markup).toContain('data-flat-plugin-update-section="data.pulses"');
    expect(markup).toContain('data-flat-plugin-renderer-action="local-click"');
    expect(markup).toContain('data-flat-plugin-local-state="true"');
    expect(markup).toContain(">Pin<");
    expect(markup).toContain(">Save Pulse<");
    expect(markup).toContain(">Local Click<");
    expect(markup).toContain('aria-label="Plugin renderer tags"');
    expect(markup).toContain('data-flat-plugin-data-field="tags"');
    expect(markup).toContain('data-flat-plugin-tag="react"');
    expect(markup).toContain('data-flat-plugin-tag="fixture"');
    expect(markup).toContain("flat-section-prototype__plugin-glyph");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain('data-flat-code="true"');
    expect(markup).not.toContain("data-flat-gen-python");
    expect(markup).not.toContain("data-flat-terminal=");
    expect(markup).not.toContain("data-flat-iframe");
    expect(markup).not.toContain("data-flat-chat");
    expect(markup).not.toContain("data-flat-browser");
    expect(markup).not.toContain('aria-label="Run this code block"');
    expect(markup).not.toContain('aria-label="Toggle Entry Code Block"');
    expect(markup).not.toContain('aria-label="Hide terminal"');
    expect(markup).not.toContain("Open Plugins");
    expect(markup).not.toContain("Copy Section JSON");
    expect(markup).not.toContain("Delete Section");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-plugin");
    expect(dictMarkup).not.toContain("data-flat-plugin");
    expect(callableMarkup).not.toContain("React Fixture Card");
    expect(dictMarkup).not.toContain("React Fixture Card");
    expect(callableMarkup).not.toContain("setta-fixture-frontend-react");
    expect(dictMarkup).not.toContain("setta-fixture-frontend-react");
  });

  it("renders task board controls, Kanban lanes, task actions, schedule summaries, and resize affordances", () => {
    const markup = renderToStaticMarkup(<FlatTaskBoardSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="task-board"');
    expect(markup).toContain('data-flat-task-board="true"');
    expect(markup).toContain("Release Board");
    expect(markup).toContain('data-flat-task-board-section-type="TaskBoard"');
    expect(markup).toContain('data-flat-task-board-view-mode="kanban"');
    expect(markup).toContain('data-flat-task-board-editable="true"');
    expect(markup).toContain('data-flat-task-board-column-count="3"');
    expect(markup).toContain('data-flat-task-board-task-count="4"');
    expect(markup).toContain('aria-label="Task board controls"');
    expect(markup).toContain('aria-label="Task board view mode"');
    expect(markup).toContain('data-flat-task-board-view-option="task_list"');
    expect(markup).toContain('data-flat-task-board-view-option="kanban"');
    expect(markup).toContain('data-flat-task-board-view-active="true"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="New task title"');
    expect(markup).toContain('name="task-board-new-task-title"');
    expect(markup).toContain('value="Add task title"');
    expect(markup).toContain('aria-label="Add task"');
    expect(markup).toContain('data-flat-task-board-action="add-task"');
    expect(markup).toContain('aria-label="Add task board column"');
    expect(markup).toContain('data-flat-task-board-action="add-column"');
    expect(markup).toContain('aria-label="Task board Kanban lanes"');
    expect(markup).toContain('data-flat-task-board-kanban="true"');
    expect(markup).toContain('data-flat-task-board-column="todo"');
    expect(markup).toContain('data-flat-task-board-column="doing"');
    expect(markup).toContain('data-flat-task-board-column="done"');
    expect(markup).toContain('data-flat-task-board-column-color="#3b82f6"');
    expect(markup).toContain('data-flat-task-board-column-color="#f59e0b"');
    expect(markup).toContain('data-flat-task-board-column-color="#22c55e"');
    expect(markup).toContain('data-flat-task-board-column-resize="todo:doing"');
    expect(markup).toContain('data-flat-task-board-column-resize="doing:done"');
    expect(markup).toContain('aria-label="Todo column color"');
    expect(markup).toContain('aria-label="Doing column name"');
    expect(markup).toContain('data-flat-task-board-lane-task-count="2"');
    expect(markup).toContain('data-flat-task-board-lane-action-column="todo"');
    expect(markup).toContain('data-flat-task-board-lane-action-column="doing"');
    expect(markup).toContain('data-flat-task-board-lane-action-column="done"');
    expect(markup).toContain('data-flat-task-board-task="draft-owner-brief"');
    expect(markup).toContain('data-flat-task-board-task="verify-visual-pass"');
    expect(markup).toContain('data-flat-task-board-task="package-screenshots"');
    expect(markup).toContain(
      'data-flat-task-board-task="ship-section-prototype"',
    );
    expect(markup).toContain('data-flat-task-board-task-column="doing"');
    expect(markup).toContain('data-flat-task-board-task-completed="true"');
    expect(markup).toContain('data-flat-task-board-task-recurrence="none"');
    expect(markup).toContain(
      'data-flat-task-board-task-recurrence="specified_days"',
    );
    expect(markup).toContain('data-flat-task-board-task-recurrence="daily"');
    expect(markup).toContain(
      'data-flat-task-board-task-due="2026-04-28T16:00"',
    );
    expect(markup).toContain('data-flat-task-board-task-drag="true"');
    expect(markup).toContain('aria-label="Drag task Verify visual pass"');
    expect(markup).toContain('aria-label="Mark Ship section prototype done"');
    expect(markup).toContain(
      'aria-label="Task schedule settings for Verify visual pass"',
    );
    expect(markup).toContain('data-flat-task-board-task-action="schedule"');
    expect(markup).toContain('data-flat-task-board-task-action="description"');
    expect(markup).toContain('data-flat-task-board-task-action="remove"');
    expect(markup).toContain(
      'data-flat-task-board-task-description="draft-owner-brief"',
    );
    expect(markup).toContain("Capture launch criteria before review.");
    expect(markup).toContain("Progress entry and tests recorded.");
    expect(markup).toContain('data-flat-task-board-schedule-field="due"');
    expect(markup).toContain('data-flat-task-board-schedule-field="repeat"');
    expect(markup).toContain("Due: 2026-04-28 16:00");
    expect(markup).toContain("Repeat: Mon, Wed, Fri");
    expect(markup).toContain("Repeat: Daily");
    expect(markup).toContain("flat-section-prototype__task-board-glyph");
    expect(markup).toContain("gg-calendar-dates");
    expect(markup).toContain("gg-trash");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain('data-flat-code="true"');
    expect(markup).not.toContain("data-flat-gen-python");
    expect(markup).not.toContain("data-flat-terminal=");
    expect(markup).not.toContain("data-flat-iframe");
    expect(markup).not.toContain("data-flat-chat");
    expect(markup).not.toContain("data-flat-browser");
    expect(markup).not.toContain("data-flat-plugin");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-task-board");
    expect(dictMarkup).not.toContain("data-flat-task-board");
    expect(callableMarkup).not.toContain("Release Board");
    expect(dictMarkup).not.toContain("Release Board");
    expect(callableMarkup).not.toContain("draft-owner-brief");
    expect(dictMarkup).not.toContain("draft-owner-brief");
  });

  it("renders spreadsheet file binding, toolbar controls, grid cells, statuses, and footer summaries", () => {
    const markup = renderToStaticMarkup(<FlatSpreadsheetSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="spreadsheet"');
    expect(markup).toContain('data-flat-spreadsheet="true"');
    expect(markup).toContain("Forecast Sheet");
    expect(markup).toContain(
      'data-flat-spreadsheet-section-type="Spreadsheet"',
    );
    expect(markup).toContain(
      'data-flat-spreadsheet-file-path="/workspace/reports/forecast.xlsx"',
    );
    expect(markup).toContain(
      'data-flat-spreadsheet-active-sheet="Q2 Forecast"',
    );
    expect(markup).toContain('data-flat-spreadsheet-density="compact"');
    expect(markup).toContain('data-flat-spreadsheet-show-row-numbers="true"');
    expect(markup).toContain('data-flat-spreadsheet-auto-reload="true"');
    expect(markup).toContain('data-flat-spreadsheet-read-only="false"');
    expect(markup).toContain('data-flat-spreadsheet-row-count="4"');
    expect(markup).toContain('data-flat-spreadsheet-column-count="4"');
    expect(markup).toContain('data-flat-spreadsheet-displayed-row-count="3"');
    expect(markup).toContain(
      'data-flat-spreadsheet-supported-formats="CSV,TSV,XLS,XLSX"',
    );
    expect(markup).toContain('aria-label="Spreadsheet file binding"');
    expect(markup).toContain('data-flat-spreadsheet-drop-target="supported"');
    expect(markup).toContain('data-flat-spreadsheet-file-field="filePath"');
    expect(markup).toContain('data-flat-spreadsheet-file-field="activeSheet"');
    expect(markup).toContain('data-flat-spreadsheet-file-field="settings"');
    expect(markup).toContain("forecast.xlsx");
    expect(markup).toContain("Q2 Forecast");
    expect(markup).toContain("compact / rows on / reload on");
    expect(markup).toContain('aria-label="Spreadsheet controls"');
    expect(markup).toContain('aria-label="Filter rows"');
    expect(markup).toContain('name="spreadsheet-filter"');
    expect(markup).toContain('value="region:west"');
    expect(markup).toContain('aria-label="Sort column"');
    expect(markup).toContain(
      'data-flat-spreadsheet-action="sort-column-select"',
    );
    expect(markup).toContain('name="spreadsheet-sort-column"');
    expect(markup).toContain('data-flat-spreadsheet-action="sort-direction"');
    expect(markup).toContain('data-flat-spreadsheet-action="clear-view"');
    expect(markup).toContain('data-flat-spreadsheet-action="add-column"');
    expect(markup).toContain('data-flat-spreadsheet-action="add-row"');
    expect(markup).toContain('data-flat-spreadsheet-action="reload"');
    expect(markup).toContain('data-flat-spreadsheet-action="save"');
    expect(markup).toContain('data-flat-spreadsheet-save-enabled="true"');
    expect(markup).toContain('data-flat-spreadsheet-action="settings"');
    expect(markup).toContain('aria-label="Spreadsheet status"');
    expect(markup).toContain('data-flat-spreadsheet-dirty="true"');
    expect(markup).toContain('data-flat-spreadsheet-external-change="true"');
    expect(markup).toContain("Unsaved edits.");
    expect(markup).toContain("File changed on disk.");
    expect(markup).toContain("Save to overwrite or reload.");
    expect(markup).toContain('aria-label="Spreadsheet grid viewport"');
    expect(markup).toContain('data-flat-spreadsheet-grid-mode="glide"');
    expect(markup).toContain('role="grid"');
    expect(markup).toContain('data-flat-spreadsheet-column="B"');
    expect(markup).toContain('data-flat-spreadsheet-sort-state="desc"');
    expect(markup).toContain('data-flat-spreadsheet-column-resize="A:B"');
    expect(markup).toContain('data-flat-spreadsheet-row-number="2"');
    expect(markup).toContain('data-flat-spreadsheet-cell="2:B"');
    expect(markup).toContain('name="spreadsheet-cell-2-B"');
    expect(markup).toContain('data-flat-spreadsheet-cell-selected="true"');
    expect(markup).toContain('data-flat-spreadsheet-cell-edited="true"');
    expect(markup).toContain("Region");
    expect(markup).toContain("Ari");
    expect(markup).toContain("$42k");
    expect(markup).toContain("Selected B2:C3");
    expect(markup).toContain("3 shown of 4 rows / 4 columns");
    expect(markup).toContain("flat-section-prototype__spreadsheet-glyph");
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("data-flat-chart");
    expect(markup).not.toContain("data-flat-draw");
    expect(markup).not.toContain("data-flat-social");
    expect(markup).not.toContain("data-flat-global-variables");
    expect(markup).not.toContain('data-flat-code="true"');
    expect(markup).not.toContain("data-flat-gen-python");
    expect(markup).not.toContain("data-flat-terminal=");
    expect(markup).not.toContain("data-flat-iframe");
    expect(markup).not.toContain("data-flat-chat");
    expect(markup).not.toContain("data-flat-browser");
    expect(markup).not.toContain("data-flat-plugin");
    expect(markup).not.toContain("data-flat-task-board");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-spreadsheet");
    expect(dictMarkup).not.toContain("data-flat-spreadsheet");
    expect(callableMarkup).not.toContain("Forecast Sheet");
    expect(dictMarkup).not.toContain("Forecast Sheet");
    expect(callableMarkup).not.toContain("/workspace/reports/forecast.xlsx");
    expect(dictMarkup).not.toContain("/workspace/reports/forecast.xlsx");
  });

  it("renders chart data controls, chart settings, legend, and contained plot preview", () => {
    const markup = renderToStaticMarkup(<FlatChartSectionPrototype />);

    expect(markup).toContain('data-flat-section-kind="chart"');
    expect(markup).toContain('data-flat-chart="true"');
    expect(markup).toContain("Metrics Chart");
    expect(markup).toContain("Data Path");
    expect(markup).toContain('aria-label="Chart data controls"');
    expect(markup).toContain('aria-label="Chart data path"');
    expect(markup).toContain('name="chart-data-path"');
    expect(markup).toContain('value="artifacts/metrics.csv"');
    expect(markup).toContain(
      'data-flat-chart-data-path="artifacts/metrics.csv"',
    );
    expect(markup).toContain('aria-label="Add chart artifact by filepath"');
    expect(markup).toContain(
      'data-flat-chart-action="add-artifact-by-filepath"',
    );
    expect(markup).toContain('aria-label="Chart settings"');
    expect(markup).toContain('data-flat-chart-type="line"');
    expect(markup).toContain('data-flat-chart-type-option="line"');
    expect(markup).toContain('data-flat-chart-type-option="scatter"');
    expect(markup).toContain('aria-label="X-axis column"');
    expect(markup).toContain('value="time"');
    expect(markup).toContain('aria-label="Loaded chart data columns"');
    expect(markup).toContain('data-flat-chart-column="temperature"');
    expect(markup).toContain('data-flat-chart-column="humidity"');
    expect(markup).toContain('data-flat-chart-column="pressure"');
    expect(markup).toContain('aria-label="Log scale toggles"');
    expect(markup).toContain('data-flat-chart-log-scale="xAxisLog"');
    expect(markup).toContain('data-flat-chart-log-scale="y1AxisLog"');
    expect(markup).toContain('data-flat-chart-log-scale="y2AxisLog"');
    expect(markup).toContain('aria-label="Rendered line chart preview"');
    expect(markup).toContain('data-flat-chart-preview="line"');
    expect(markup).toContain('data-flat-chart-x-axis="time"');
    expect(markup).toContain('aria-label="Chart datasets"');
    expect(markup).toContain('data-flat-chart-dataset="temperature"');
    expect(markup).toContain('data-flat-chart-dataset="humidity"');
    expect(markup).toContain('data-flat-chart-dataset="pressure"');
    expect(markup).toContain('data-flat-chart-axis="y1"');
    expect(markup).toContain('data-flat-chart-axis="y2"');
    expect(markup).toContain('aria-label="Chart plot area"');
    expect(markup).toContain('data-flat-chart-segment="temperature-1-2"');
    expect(markup).toContain('data-flat-chart-point="humidity-2"');
    expect(markup).toContain("flat-section-prototype__chart-glyph");
    expect(markup).toContain("gg-math-plus");
    expect(markup).not.toContain("data-flat-workflow-handle=");
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
    expect(markup).not.toContain("data-flat-state-machine");
    expect(markup).not.toContain("data-flat-list-root");
    expect(markup).not.toContain("data-flat-group");
    expect(markup).not.toContain("data-flat-image");
    expect(markup).not.toContain("flat-section-prototype-gallery__label");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-chart");
    expect(dictMarkup).not.toContain("data-flat-chart");
    expect(callableMarkup).not.toContain("Metrics Chart");
    expect(dictMarkup).not.toContain("Metrics Chart");
    expect(callableMarkup).not.toContain("artifacts/metrics.csv");
    expect(dictMarkup).not.toContain("artifacts/metrics.csv");
  });

  it("renders state machine start run controls, activity, and outgoing workflow edge affordance", () => {
    const markup = renderToStaticMarkup(
      <FlatStateMachineStartSectionPrototype />,
    );

    expect(markup).toContain('data-flat-section-kind="state-machine-start"');
    expect(markup).toContain('data-flat-state-machine-start="true"');
    expect(markup).toContain("Kickoff");
    expect(markup).toContain("workflow-main");
    expect(markup).toContain('data-flat-state-machine-status="running"');
    expect(markup).toContain("Running");
    expect(markup).toContain('aria-label="Start workflow run"');
    expect(markup).toContain('aria-label="Stop workflow run"');
    expect(markup).toContain('aria-label="Reset workflow run"');
    expect(markup).toContain('data-flat-state-machine-action="start"');
    expect(markup).toContain('data-flat-state-machine-action-state="disabled"');
    expect(markup).toContain('data-flat-state-machine-action="stop"');
    expect(markup).toContain('data-flat-state-machine-action="reset"');
    expect(markup).toContain("Signal merge_decision reported");
    expect(markup).toContain("Dispatched 2 start actions");
    expect(markup).toContain("Workflow started");
    expect(markup).toContain('data-flat-workflow-handle="workflow-source"');
    expect(markup).toContain("workflow-source");
    expect(markup).not.toContain("workflow-target");
    expect(markup).not.toContain("workflow-reverse-start");
    expect(markup).toContain("gg-play-list-add");
    expect(markup).toContain("gg-shape-square");
    expect(markup).toContain("gg-repeat");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("workflow-main");
    expect(dictMarkup).not.toContain("workflow-main");
    expect(callableMarkup).not.toContain("data-flat-state-machine-start");
    expect(dictMarkup).not.toContain("data-flat-state-machine-start");
  });

  it("renders state machine gate status, gate activity, and incoming/outgoing workflow edge affordances", () => {
    const markup = renderToStaticMarkup(
      <FlatStateMachineGateSectionPrototype />,
    );

    expect(markup).toContain('data-flat-section-kind="state-machine-gate"');
    expect(markup).toContain('data-flat-state-machine-gate="true"');
    expect(markup).toContain("Review Gate");
    expect(markup).toContain("workflow-main");
    expect(markup).toContain('data-flat-state-machine-gate-type="AND"');
    expect(markup).toContain("AND Gate");
    expect(markup).toContain('data-flat-state-machine-status="running"');
    expect(markup).toContain("Running");
    expect(markup).toContain('data-flat-state-machine-gate-status="satisfied"');
    expect(markup).toContain("Satisfied");
    expect(markup).toContain('data-flat-state-machine-gate-status="complete"');
    expect(markup).toContain("3 / 3");
    expect(markup).toContain('data-flat-state-machine-gate-activity="true"');
    expect(markup).toContain("Gate Activity");
    expect(markup).toContain("Gate satisfied");
    expect(markup).toContain("Input received");
    expect(markup).toContain('data-flat-workflow-handle="workflow-target"');
    expect(markup).toContain("workflow-target");
    expect(markup).toContain(
      'data-flat-workflow-reverse-start="workflow-reverse-start"',
    );
    expect(markup).toContain('data-flat-workflow-handle="workflow-source"');
    expect(markup).toContain("workflow-source");
    expect(markup).toContain("gg-git-branch");
    expect(markup).not.toContain('aria-label="Start workflow run"');
    expect(markup).not.toContain('aria-label="Stop workflow run"');
    expect(markup).not.toContain('aria-label="Reset workflow run"');

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-state-machine-gate");
    expect(dictMarkup).not.toContain("data-flat-state-machine-gate");
    expect(callableMarkup).not.toContain("workflow-target");
    expect(dictMarkup).not.toContain("workflow-target");
  });

  it("renders state machine end identity and target-only workflow edge affordance", () => {
    const markup = renderToStaticMarkup(
      <FlatStateMachineEndSectionPrototype />,
    );

    expect(markup).toContain('data-flat-section-kind="state-machine-end"');
    expect(markup).toContain('data-flat-state-machine-end="true"');
    expect(markup).toContain("Done");
    expect(markup).toContain("End");
    expect(markup).toContain("workflow-main");
    expect(markup).toContain('data-flat-workflow-handle="workflow-target"');
    expect(markup).toContain(
      'data-flat-workflow-reverse-start="workflow-reverse-start"',
    );
    expect(markup).toContain("workflow-target");
    expect(markup).toContain("gg-check");
    expect(markup).not.toContain('data-flat-workflow-handle="workflow-source"');
    expect(markup).not.toContain("workflow-source");
    expect(markup).not.toContain('aria-label="Start workflow run"');
    expect(markup).not.toContain('aria-label="Stop workflow run"');
    expect(markup).not.toContain('aria-label="Reset workflow run"');
    expect(markup).not.toContain("Recent Activity");
    expect(markup).not.toContain("Gate Activity");
    expect(markup).not.toContain("data-flat-state-machine-status");
    expect(markup).not.toContain("data-flat-state-machine-gate-status");

    const callableMarkup = renderToStaticMarkup(
      <FlatCallableSectionPrototype />,
    );
    const dictMarkup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    expect(callableMarkup).not.toContain("data-flat-state-machine-end");
    expect(dictMarkup).not.toContain("data-flat-state-machine-end");
    expect(callableMarkup).not.toContain("workflow-target");
    expect(dictMarkup).not.toContain("workflow-target");
  });

  it("keeps state machine end compact instead of inheriting the row-heavy shell height", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="state-machine-end"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 8rem");
  });

  it("keeps list root compact while allowing kanban child overflow", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="list-root"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 12rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__list-root-child-list",
    );
    expect(flatSectionPrototypeCss).toContain("overflow-x: auto");
  });

  it("keeps group compact while allowing horizontal child overflow", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="group"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 13rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__group-child-list",
    );
    expect(flatSectionPrototypeCss).toContain("overflow-x: auto");
  });

  it("keeps image media-oriented with a contained clipped preview", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="image"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 15rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__image-preview",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__image-preview-img",
    );
    expect(flatSectionPrototypeCss).toContain("object-fit: contain");
  });

  it("keeps draw canvas-oriented with contained layers and tool controls", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="draw"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 26rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__draw-toolbar",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__draw-workspace",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__draw-canvas",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__draw-layer-panel",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
    expect(flatSectionPrototypeCss).toContain("--flat-draw-layer-alpha");
  });

  it("keeps chart tall enough for settings and contained plot preview", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="chart"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 27rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chart-content",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chart-preview",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chart-plot",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps text block content-oriented with scrollable rendered text and compact settings", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="text-block"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 23rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__text-block-toolbar",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__text-block-content",
    );
    expect(flatSectionPrototypeCss).toContain("overflow-y: auto");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__text-block-code-copy",
    );
  });

  it("keeps prompt editor-oriented with contained source and preview regions", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="prompt"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 22rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__prompt-workspace",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__prompt-template",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__prompt-rendered",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__prompt-error",
    );
    expect(flatSectionPrototypeCss).toContain("overflow-y: auto");
  });

  it("keeps meta control compact and widget-oriented", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="meta-control"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 18rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__meta-control-active",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__meta-control-widget-list",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__meta-control-dropzone",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps social compact and media-oriented with contained provider embeds", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="social"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 16rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__social-toolbar",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__social-embed",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__social-video",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__social-tweet-route",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps global variables compact and row-oriented with contained kwargs controls", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="global-variables"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 19rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__global-toolbar",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__global-status",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__global-params",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__global-filter-input",
    );
    expect(flatSectionPrototypeCss).toContain("--flat-row-height: 1.5rem");
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps code editor-oriented with contained status, diagnostics, and scrollable editor regions", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="code"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 24rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__code-status",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__code-diagnostics",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__code-editor",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__code-terminal",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: auto");
  });

  it("keeps generated Python editor-oriented with explicit editable and read-only document regions", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="gen-python-code"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 26rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-status",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-diagnostics",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-editor",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-zone",
    );
    expect(flatSectionPrototypeCss).toContain(
      '[data-flat-gen-python-readonly="true"]',
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-terminal",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps generated Python metadata editor-oriented with a compact read-only code viewer", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="gen-python-metadata"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 23rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-metadata",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-metadata-status",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-metadata-editor",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__gen-python-metadata-lines",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: auto");
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps terminal compact and console-oriented with scrollable terminal output", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="terminal"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 16rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__terminal",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__terminal-status",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__terminal-surface",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__terminal-lines",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__terminal-cursor",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: auto");
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps iframe compact and embed-oriented with a contained viewport", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="iframe"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 16rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__iframe",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__iframe-status",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__iframe-preview",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__iframe-frame",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__iframe-caption",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps chat transcript-oriented with a contained scrolling message list and fixed composer", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="chat"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 30rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chat-threadbar",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chat-settings",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chat-scope",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chat-transcript",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chat-message-list",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__chat-composer",
    );
    expect(flatSectionPrototypeCss).toContain("overflow-y: auto");
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps browser explorer-oriented with contained filter rail and file list scrolling", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="browser"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 26rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__browser-filters",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__browser-toolbar",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__browser-breadcrumbs",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__browser-list",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__browser-rows",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__browser-row",
    );
    expect(flatSectionPrototypeCss).toContain("overflow-y: auto");
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps plugin host-oriented with contained mounted renderer content", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="plugin"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 18rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__plugin-host",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__plugin-mount",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__plugin-renderer",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__plugin-stats",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__plugin-controls",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__plugin-tags",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });

  it("keeps task board board-oriented with horizontal lanes and scrollable task stacks", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="task-board"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 27rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__task-board-toolbar",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__task-board-board",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__task-board-column-resize",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__task-board-lane",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__task-board-task-list",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__task-board-schedule",
    );
    expect(flatSectionPrototypeCss).toContain("overflow-x: auto");
    expect(flatSectionPrototypeCss).toContain("overflow-y: auto");
  });

  it("keeps spreadsheet grid-oriented with fixed toolbar regions and contained grid overflow", () => {
    expect(flatSectionPrototypeCss).toContain(
      '.flat-section-prototype[data-flat-section-kind="spreadsheet"]',
    );
    expect(flatSectionPrototypeCss).toContain("min-height: 31rem");
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__spreadsheet-file",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__spreadsheet-toolbar",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__spreadsheet-status",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__spreadsheet-grid-viewport",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__spreadsheet-grid",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__spreadsheet-column-resize",
    );
    expect(flatSectionPrototypeCss).toContain(
      ".flat-section-prototype__spreadsheet-footer",
    );
    expect(flatSectionPrototypeCss).toContain("overflow: auto");
    expect(flatSectionPrototypeCss).toContain("overflow: hidden");
  });
});

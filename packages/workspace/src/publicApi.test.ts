import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import * as workspace from "./index";

type IsExactly<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <
    Value,
  >() => Value extends Expected ? 1 : 2
    ? true
    : false;

type IsRequiredProperty<Value, Key extends keyof Value> =
  object extends Pick<Value, Key> ? false : true;

const RUNTIME_EXPORTS = [
  "ColorValueControl",
  "DEFAULT_SECTION_TAG_COLOR_PALETTE",
  "DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP",
  "DEFAULT_META_CONTROL_SIZE",
  "DROPZONE_META_CONTROL_SIZE",
  "DateValueControl",
  "DropdownValueControl",
  "DropzoneValueControl",
  "GROUP_SECTION_KIND",
  "ItemDndContext",
  "ItemNameEditor",
  "MetaControl",
  "MANUAL_WHEEL_CLASS_NAME",
  "NO_DRAG_CLASS_NAME",
  "NO_PAN_CLASS_NAME",
  "NO_WHEEL_CLASS_NAME",
  "PasswordValueControl",
  "RotaryValueControl",
  "SliderValueControl",
  "StandaloneWorkspaceWindowSpaceSurface",
  "SwitchValueControl",
  "TEXTAREA_META_CONTROL_SIZE",
  "TextValueEditor",
  "TimeValueControl",
  "WORKSPACE_CODE_SECTION_DEFAULT_INDENT_WIDTH",
  "WORKSPACE_CODE_SECTION_KIND",
  "WORKSPACE_CODE_SECTION_LANGUAGES",
  "WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH",
  "WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH",
  "WORKSPACE_CODE_SECTION_MODES",
  "WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE",
  "WORKSPACE_TEXT_SECTION_DISPLAY_MODES",
  "WORKSPACE_TEXT_SECTION_FORMATS",
  "WORKSPACE_TEXT_SECTION_KIND",
  "WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE",
  "WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE",
  "WorkspaceCanvas",
  "WorkspaceControls",
  "WorkspaceProvider",
  "WorkspaceItemLabel",
  "WorkspaceItemList",
  "WorkspaceNavigator",
  "WorkspaceParameterConfigurationIcon",
  "WorkspaceParameterConfigurationView",
  "WorkspaceShell",
  "WorkspaceSectionEditor",
  "WorkspaceSectionSettingsIcon",
  "WorkspaceSavedViewsIcon",
  "WorkspaceSavedViewsPane",
  "WorkspaceTooltip",
  "WorkspaceWindowManager",
  "WorkspaceWindowSurface",
  "WorkspaceWindowSpacesPane",
  "WorkspaceWindowingError",
  "WORKSPACE_INSPECTOR_TAB_ID",
  "WORKSPACE_OUTLINE_TAB_ID",
  "WORKSPACE_SAVED_VIEWS_TAB_ID",
  "activateItemSelect",
  "activateWorkspaceSavedView",
  "autoLayoutTopLevelSections",
  "buildWorkspaceFloatingSnapBounds",
  "buildWorkspaceFloatingSnapResizeBounds",
  "buildWorkspaceFloatingSnapResizeSeams",
  "canSnapshotWorkspaceWindowSpace",
  "classifyWorkspaceFloatingSnapPreset",
  "closeWorkspaceNavigator",
  "closeWorkspaceWindow",
  "commitWorkspaceDocument",
  "copyWorkspaceSelection",
  "createWorkspaceHost",
  "createWorkspaceCodeSection",
  "createWorkspaceCodeSectionData",
  "createWorkspaceSavedView",
  "createWorkspaceSavedViewsState",
  "createWorkspaceTextSection",
  "createWorkspaceTextSectionData",
  "createWorkspaceShellViewState",
  "createWorkspaceFloatingWindow",
  "createWorkspaceWindowBoundaryInsets",
  "createWorkspaceWindowBounds",
  "createWorkspaceWindowingState",
  "createWorkspaceWindowSpace",
  "createWorkspaceWindowViewport",
  "deactivateItemSelect",
  "denormalizeWorkspaceWindowBounds",
  "deleteLastWorkspaceItem",
  "deleteSelectedWorkspaceItems",
  "deleteWorkspaceItems",
  "deleteWorkspaceSavedView",
  "duplicateWorkspaceSelection",
  "dockWorkspaceWindow",
  "focusWorkspaceSection",
  "fitWorkspaceSections",
  "focusWorkspaceWindow",
  "getWorkspaceCodeSectionData",
  "getWorkspaceClipboardAvailability",
  "getWorkspaceHistoryState",
  "getOrderedWorkspaceSavedViews",
  "getWorkspaceSavedViewsOperationDisabledReason",
  "getWorkspaceSavedViewsState",
  "getWorkspaceTextSectionData",
  "getWorkspaceKeyBindingConflicts",
  "getWorkspaceKeyBindings",
  "getWorkspaceTopLevelAutoLayoutDisabledReason",
  "insertWorkspaceItem",
  "maximizeWorkspaceWindow",
  "minimizeWorkspaceWindow",
  "moveWorkspaceFloatingWindow",
  "moveWorkspaceWindowToCanvasSection",
  "normalizeWorkspaceWindowBounds",
  "openWorkspaceFloatingWindow",
  "openWorkspaceNavigator",
  "pasteWorkspaceClipboard",
  "parseWorkspaceSavedViewsState",
  "planWorkspaceTopLevelAutoLayout",
  "projectWorkspaceDocumentSavedViews",
  "registerSectionKinds",
  "registerItemHandlers",
  "registerWorkspaceClipboardAuthority",
  "registerWorkspaceCommands",
  "registerWorkspaceCreationCommands",
  "registerWorkspaceKeyBindings",
  "registerWorkspaceToolbarContributions",
  "renameWorkspaceWindow",
  "reopenWorkspaceWindow",
  "redoWorkspace",
  "renameWorkspaceSavedView",
  "resizeWorkspaceFloatingWindow",
  "resolveWorkspaceFloatingSnapPresetFromPointer",
  "resolveWorkspaceWindowWorkArea",
  "restoreWorkspaceWindow",
  "restoreWorkspaceWindowSpace",
  "reorderWorkspaceSavedView",
  "setItemData",
  "setItemControlConfiguration",
  "setItemHelpText",
  "setItemLabel",
  "setItemPresentation",
  "setItemValue",
  "setGroupOverflowMode",
  "setSectionData",
  "setSectionTagColor",
  "setWorkspaceSectionSize",
  "setWorkspaceSectionAttention",
  "setWorkspaceSavedViewSectionVisibility",
  "setWorkspaceSavedViewTabVisibility",
  "setWorkspaceCodeSectionData",
  "setWorkspaceTextSectionData",
  "setWorkspaceWindowBoundsAtomically",
  "setWorkspaceWindowDockLayoutAtomically",
  "setWorkspaceColorMode",
  "ungroupSections",
  "subscribeWorkspaceCanvasPanScrolling",
  "subscribeWorkspaceHistory",
  "snapWorkspaceFloatingWindow",
  "snapshotWorkspaceWindowSpace",
  "showWorkspaceSectionInFloatingWindow",
  "undockWorkspaceWindow",
  "undoWorkspace",
  "useItemSelectionMode",
  "useWorkspaceAppearance",
  "useWorkspaceCapabilities",
  "useWorkspaceDocumentSnapshot",
  "useWorkspaceHost",
  "useWorkspaceOptions",
  "enableWorkspaceSavedViews",
  "isWorkspaceSavedViewSectionVisible",
] as const;

describe("public package API", () => {
  it("exports only the ratified runtime surface", () => {
    expect(Object.keys(workspace).sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });

  it("exposes deterministic top-level auto-layout through the public root", () => {
    const options = {
      gap: 24,
    } satisfies workspace.WorkspaceTopLevelAutoLayoutOptions;
    const rectangles = [
      {
        height: 120,
        id: "first",
        locked: false,
        width: 200,
        x: 0,
        y: 0,
        zIndex: 0,
      },
      {
        height: 120,
        id: "second",
        locked: false,
        width: 200,
        x: 400,
        y: 0,
        zIndex: 1,
      },
    ] satisfies Array<workspace.WorkspaceTopLevelAutoLayoutRectangle>;
    const plan = workspace.planWorkspaceTopLevelAutoLayout(rectangles, options);
    const result: workspace.WorkspaceTopLevelAutoLayoutResult = "unchanged";
    const availabilityParameters: IsExactly<
      Parameters<typeof workspace.getWorkspaceTopLevelAutoLayoutDisabledReason>,
      [
        host: workspace.WorkspaceHost,
        options?: workspace.WorkspaceTopLevelAutoLayoutOptions,
      ]
    > = true;

    expect(workspace.DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP).toBe(48);
    expect(plan.positionsById["first"]?.x).toBeTypeOf("number");
    expect(result).toBe("unchanged");
    expect(availabilityParameters).toBe(true);
  });

  it("exposes the navigator through one host-scoped public contract", () => {
    const mode: workspace.WorkspaceNavigatorMode = "commands";
    const configuration = {
      defaultMode: mode,
      showTrigger: true,
    } satisfies workspace.WorkspaceNavigatorConfiguration;
    const closeParametersAreHostOnly: IsExactly<
      Parameters<typeof workspace.closeWorkspaceNavigator>,
      [host: workspace.WorkspaceHost]
    > = true;

    expect(configuration).toEqual({
      defaultMode: "commands",
      showTrigger: true,
    });
    expect(closeParametersAreHostOnly).toBe(true);
  });

  it("exposes controlled canvas ingress, attention, and graph contracts", () => {
    const ports = [
      {
        family: "data",
        id: "source",
        label: "Data output",
        sectionId: "source-section",
        type: "source",
      },
      {
        family: "data",
        id: "target",
        label: "Data input",
        sectionId: "target-section",
        type: "target",
      },
    ] satisfies ReadonlyArray<workspace.WorkspaceGraphPort>;
    const graph = {
      canConnect: (connection) => connection.family === "data",
      edges: [
        {
          family: "data",
          id: "edge",
          source: { portId: "source", sectionId: "source-section" },
          target: { portId: "target", sectionId: "target-section" },
        },
      ],
      ports,
      selectedEdgeIds: new Set<string>(),
    } satisfies workspace.WorkspaceGraphConfiguration;
    const configuration = {
      externalDrop: {
        canDrop: (dataTransfer) => dataTransfer.types.includes("text/plain"),
        onDrop: (_dataTransfer, _position, _event) => undefined,
      },
      graph,
    } satisfies workspace.WorkspaceCanvasConfiguration;
    const canvasProps = {
      configuration,
    } satisfies ComponentProps<typeof workspace.WorkspaceCanvas>;
    const fitParameters: IsExactly<
      Parameters<typeof workspace.fitWorkspaceSections>,
      [
        host: workspace.WorkspaceHost,
        sectionIds: ReadonlyArray<string>,
        options?: workspace.WorkspaceSectionFitOptions,
      ]
    > = true;
    const attentionParameters: IsExactly<
      Parameters<typeof workspace.setWorkspaceSectionAttention>,
      [host: workspace.WorkspaceHost, sectionIds: ReadonlyArray<string>]
    > = true;
    const exposesXyflow: "xyflow" extends keyof workspace.WorkspaceCanvasConfiguration
      ? true
      : false = false;

    expect(canvasProps.configuration).toBe(configuration);
    expect(fitParameters).toBe(true);
    expect(attentionParameters).toBe(true);
    expect(exposesXyflow).toBe(false);
  });

  it("exposes one opt-in structural history contract", () => {
    const state = {
      canRedo: false,
      canUndo: false,
    } satisfies workspace.WorkspaceHistoryState;
    const authority = {
      getState: () => state,
      record: (_transaction: workspace.WorkspaceHistoryTransaction) =>
        undefined,
      redo: () => undefined,
      subscribe:
        (_listener: (next: workspace.WorkspaceHistoryState) => void) => () =>
          undefined,
      synchronize: (_event: workspace.WorkspaceHistorySynchronization) =>
        undefined,
      undo: () => undefined,
    } satisfies workspace.WorkspaceHistoryAuthority;
    const options = {
      history: { authority, kind: "delegated" },
    } satisfies workspace.WorkspaceHostOptions;
    const changeKind: workspace.WorkspaceHistoryChangeKind = "section-move";
    const createParameters: IsExactly<
      Parameters<typeof workspace.createWorkspaceHost>,
      [options?: workspace.WorkspaceHostOptions]
    > = true;

    expect(options.history.kind).toBe("delegated");
    expect(changeKind).toBe("section-move");
    expect(createParameters).toBe(true);
  });

  it("exposes saved views as a validated host-scoped document capability", () => {
    const operation: workspace.WorkspaceSavedViewsOperation = "visibility";
    const input = {
      id: "overview",
      name: "Overview",
    } satisfies workspace.WorkspaceSavedViewCreateInput;
    const documentRequiresSavedViews: IsRequiredProperty<
      workspace.WorkspaceDocument,
      "savedViews"
    > = true;
    const activationParameters: IsExactly<
      Parameters<typeof workspace.activateWorkspaceSavedView>,
      [host: workspace.WorkspaceHost, viewId: string]
    > = true;

    expect(operation).toBe("visibility");
    expect(input).toEqual({ id: "overview", name: "Overview" });
    expect(documentRequiresSavedViews).toBe(true);
    expect(activationParameters).toBe(true);
  });

  it("types delegated clipboard eligibility as an adapter-owned boundary", () => {
    const request = {
      rootIds: ["section-1"],
    } satisfies workspace.WorkspaceClipboardCopyabilityRequest;
    const authority = {
      canCopySelection: (candidate) => candidate.rootIds.length === 1,
      id: "adapter",
      kind: "delegated",
      paste: async () => ({ rootIds: ["accepted-section"] }),
      payloadVersion: 1,
      prepareCopy: async () => ({ copied: true }),
    } satisfies workspace.WorkspaceDelegatedClipboardAuthority;

    expect(authority.canCopySelection?.(request)).toBe(true);
  });

  it("commits an app-owned section size through the canonical resize funnel", () => {
    const host = workspace.createWorkspaceHost();
    workspace.registerSectionKinds(host, {
      leaf: { renderContent: () => null },
    });
    host.loadDocument({
      activeIds: [],
      sections: {
        leaf: {
          children: [],
          id: "leaf",
          isHorizontalOrientation: false,
          isMinimized: false,
          kind: "leaf",
          name: "Leaf",
          overflowMode: false,
          positionAndSizeLocked: false,
          size: { height: 100, width: 200 },
          styleColor: null,
          tagColor: null,
        },
      },
      topLevelSections: { leaf: { h: 100, w: 200, x: 0, y: 0, zIndex: 0 } },
      viewport: { x: 0, y: 0, zoom: 1 },
      savedViews: null,
    });

    const publications: Array<workspace.WorkspaceDocument> = [];
    const unsubscribe = host.subscribe((document) =>
      publications.push(document),
    );
    workspace.setWorkspaceSectionSize(host, "leaf", { height: 320 });

    expect(host.getSnapshot().sections["leaf"]?.size).toEqual({
      height: 320,
      width: 200,
    });
    expect(publications).toHaveLength(1);
    unsubscribe();
    host.dispose();
  });

  it("exposes the text editor commit callback through the public root", () => {
    const onCommit = (value: string) => value;
    const completionProvider: workspace.TextValueCompletionProvider = async (
      request,
    ) => ({
      from: request.cursorOffset,
      options: [{ label: "choice" }],
    });
    const props = {
      ariaLabel: "Name",
      completionProvider,
      controlId: "item-1",
      onCommit,
      onValueChange: () => {},
      presentation: "item-row",
      sectionId: "section-1",
      singleLine: true,
      value: "draft",
    } satisfies ComponentProps<typeof workspace.TextValueEditor>;

    expect(props.onCommit("draft")).toBe("draft");
    return expect(
      props.completionProvider({
        cursorOffset: 5,
        explicit: false,
        signal: new AbortController().signal,
        value: "draft",
      }),
    ).resolves.toEqual({ from: 5, options: [{ label: "choice" }] });
  });

  it("types Code-section completion as a registration capability rather than document data", async () => {
    const completionProvider: workspace.WorkspaceCodeSectionCompletionProvider =
      async (request) => ({
        from: request.cursorOffsetUtf16,
        options: [{ insertText: "math", label: "math" }],
        to: request.cursorOffsetUtf16,
      });
    const registration = {
      completionProvider,
      languages: ["python"],
    } satisfies workspace.WorkspaceCodeSectionRegistration;
    expect(
      await registration.completionProvider({
        cursorOffsetUtf16: 0,
        generatedRegion: null,
        language: "python",
        sectionId: "section-1",
        signal: new AbortController().signal,
        text: "",
        trigger: "explicit",
      }),
    ).toEqual({
      from: 0,
      options: [{ insertText: "math", label: "math" }],
      to: 0,
    });
  });

  it("types the section-field placement with its own optional end adornment", () => {
    const presentation: workspace.TextValueEditorPresentation = "section-field";
    let abandonedDraft = false;
    const props = {
      ariaLabel: "Expression",
      controlId: "expression",
      endAdornment: null,

      onEscape: () => {
        abandonedDraft = true;
      },
      onValueChange: () => {},
      presentation,
      sectionId: "section-1",
      singleLine: true,
      value: "draft",
    } satisfies ComponentProps<typeof workspace.TextValueEditor>;

    expect(props.presentation).toBe("section-field");
    props.onEscape();
    expect(abandonedDraft).toBe(true);

    type ItemRowProps = Extract<
      ComponentProps<typeof workspace.TextValueEditor>,
      { presentation: "item-row" }
    >;
    const itemRowEndAdornmentIsUndefined: IsExactly<
      ItemRowProps["endAdornment"],
      undefined
    > = true;

    expect(itemRowEndAdornmentIsUndefined).toBe(true);
  });

  it("resolves the canvas tooltip parent without a public seam for it", () => {
    const hasTooltipParent: "tooltipParent" extends keyof ComponentProps<
      typeof workspace.TextValueEditor
    >
      ? true
      : false = false;

    expect(hasTooltipParent).toBe(false);
    expect(
      RUNTIME_EXPORTS.filter((name) =>
        /codemirror|editorview|tooltipparent|extension/i.test(name),
      ),
    ).toStrictEqual([]);
  });

  it("keeps the item-area presentation generic and content-agnostic", () => {
    const itemArea = {
      renderLeadingContent: () => null,
      toolbar: "filter-only",
    } satisfies workspace.WorkspaceItemAreaPresentation;
    const definition = {
      itemArea,
      renderContent: () => null,
    } satisfies workspace.SectionKindDefinition;

    const presentationsByMode = {
      "authoring-and-filter": { toolbar: "authoring-and-filter" },
      "filter-only": itemArea,
      hidden: { toolbar: "hidden" },
    } satisfies Record<
      workspace.WorkspaceItemToolbarMode,
      workspace.WorkspaceItemAreaPresentation
    >;

    expect(definition.itemArea.toolbar).toBe("filter-only");
    expect(presentationsByMode[definition.itemArea.toolbar]).toBe(itemArea);
  });

  it("closes the built-in Code section on one required presentation mode", () => {
    const generatedRegion = {
      from: 1,
      to: 3,
    } satisfies workspace.WorkspaceGeneratedRegion;
    const generated = workspace.createWorkspaceCodeSectionData({
      code: "a\nb\nc",
      generatedRegion,
      mode: "generated-document",
    });

    const dataByMode = {
      editable: workspace.createWorkspaceCodeSectionData(),
      "read-only": workspace.createWorkspaceCodeSectionData({
        mode: "read-only",
      }),
      "generated-document": generated,
    } satisfies Record<
      workspace.WorkspaceCodeSectionMode,
      workspace.WorkspaceCodeSectionData
    >;

    expect(dataByMode[generated.mode]).toBe(generated);
    expect([...workspace.WORKSPACE_CODE_SECTION_MODES].sort()).toStrictEqual(
      Object.keys(dataByMode).sort(),
    );

    type OrdinaryOverrides = Exclude<
      workspace.WorkspaceCodeSectionDataOverrides,
      { mode: "generated-document" }
    >;
    type GeneratedOverrides = Extract<
      workspace.WorkspaceCodeSectionDataOverrides,
      { mode: "generated-document" }
    >;
    const ordinaryHasGeneratedRegion: "generatedRegion" extends keyof OrdinaryOverrides
      ? true
      : false = false;
    const generatedCodeIsRequired: IsRequiredProperty<
      GeneratedOverrides,
      "code"
    > = true;
    const generatedRegionIsRequired: IsRequiredProperty<
      GeneratedOverrides,
      "generatedRegion"
    > = true;

    expect(dataByMode["read-only"]).not.toHaveProperty("generatedRegion");
    expect(ordinaryHasGeneratedRegion).toBe(false);
    expect(generatedCodeIsRequired).toBe(true);
    expect(generatedRegionIsRequired).toBe(true);
  });
});

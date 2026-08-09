import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
  deriveWorkspaceParentLookup,
  resolveWorkspaceCapabilities,
  resolveWorkspaceGestureOptions,
  type SectionOrientation,
  type SectionOverflow,
  type WorkspaceController,
  type WorkspaceJsonValue,
  type WorkspacePoint,
  type WorkspaceSectionPresentation,
} from "../core.js";
import { WorkspaceCanvasAdapter } from "./workspace-canvas-adapter.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import {
  createWorkspaceController,
  createWorkspaceRootSection,
  groupWorkspaceSections,
  moveWorkspaceRootSections,
  moveWorkspaceSections,
  resizeWorkspaceRootSection,
  setWorkspaceSectionChildOverflow,
  setWorkspaceSectionContentSize,
  ungroupWorkspaceSection,
  type WorkspaceControllerBindings,
} from "./workspace-controller.js";
import {
  resolveWorkspaceAppearanceOptions,
  resolveWorkspaceGridOptions,
} from "./workspace-preferences.js";
import {
  assertStableWorkspaceMode,
  assertWorkspaceAccessibleName,
  assertWorkspaceExternalDropCallbacks,
  assertWorkspaceGroupFactory,
  assertWorkspaceSectionFactory,
  assertWorkspaceSectionTitleValidator,
  assertWorkspaceViewportWithinGestureBounds,
  renderWorkspaceOverlaySlots,
  resolveWorkspaceMinimapOptions,
  resolveWorkspaceMode,
  resolveWorkspaceOverlayRenderers,
  resolveWorkspaceSectionMoveMode,
  resolveWorkspaceSelectionOptions,
  resolveWorkspaceToolbarControls,
  workspaceCapabilitiesAreReadOnly,
  workspaceCreationAvailability,
  type WorkspaceProps,
} from "./workspace-react-contract.js";
import { useWorkspaceHistoryCoordinator } from "./workspace-react-history.js";
import {
  focusCreatedWorkspaceSection,
  useResolvedWorkspaceAppearance,
  useWorkspaceBooleanPreference,
  workspaceThemeStyle,
} from "./workspace-react-runtime.js";
import {
  resolveWorkspaceSectionColorPalette,
  type WorkspaceGroupFactory,
  type WorkspaceSectionFactory,
  type WorkspaceSectionTitleValidationRequest,
  type WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import { planWorkspaceRootSectionCreation } from "./workspace-section-creation.js";
import {
  planWorkspaceSectionGrouping,
  planWorkspaceSectionUngrouping,
} from "./workspace-section-grouping.js";
import {
  resolveSectionDefinitions,
  validateWorkspaceSectionDefinitions,
  type WorkspaceSectionRegistry,
} from "./workspace-section-registry.js";
import type {
  WorkspaceRootResizeSnapshot,
  WorkspaceSectionResizeAxis,
} from "./workspace-section-sizing.js";
import {
  reconcileWorkspaceSelection,
  resolveWorkspaceSelection,
  workspaceSelectionsMatch,
} from "./workspace-selection.js";

type PendingStructuralSelection =
  | Readonly<{
      focusSectionId: string;
      groupSectionId: string;
      sectionIds: readonly string[];
      type: "group";
    }>
  | Readonly<{
      focusSectionId: string;
      groupSectionId: string;
      parentSectionId: string | null;
      sectionIds: readonly string[];
      type: "ungroup";
    }>;

function structuralSelectionAccepted(
  document: ReturnType<WorkspaceController<unknown>["getDocument"]>,
  pending: PendingStructuralSelection,
): boolean {
  if (pending.type === "group") {
    const childIds = document.sections[pending.groupSectionId]?.childLayout?.sectionIds;
    return Boolean(
      childIds &&
      childIds.length === pending.sectionIds.length &&
      childIds.every((sectionId, index) => sectionId === pending.sectionIds[index]),
    );
  }
  if (Object.hasOwn(document.sections, pending.groupSectionId)) {
    return false;
  }
  const parentLookup = deriveWorkspaceParentLookup(document);
  return pending.sectionIds.every(
    (sectionId) => (parentLookup.get(sectionId) ?? null) === pending.parentSectionId,
  );
}

export function Workspace<TSectionData = WorkspaceJsonValue>(props: WorkspaceProps<TSectionData>) {
  const {
    ariaLabel = "Workspace",
    appearanceOptions: appearanceOptionOverrides,
    capabilities: capabilityOverrides,
    className,
    controllerRef,
    defaultDocument,
    document: controlledDocument,
    emptyState = "No sections yet. Add a section to start.",
    gestureOptions: gestureOptionOverrides,
    gridOptions: gridOptionOverrides,
    groupFactory,
    minimapOptions: minimapOptionOverrides,
    onDocumentChange,
    onExternalDrop,
    onGridSnapChange,
    onMinimapVisibilityChange,
    overlaySlots: overlaySlotOverrides,
    readOnly = false,
    sectionColorPalette: sectionColorPaletteOverrides,
    sectionDefinitions: sectionDefinitionOverrides,
    sectionFactory,
    sectionMoveMode: sectionMoveModeValue,
    selectionOptions: selectionOptionOverrides,
    style,
    toolbarControls: toolbarControlOverrides,
    validateExternalDrop,
    validateSectionTitle,
    ...sectionProps
  } = props;
  assertWorkspaceAccessibleName(ariaLabel);
  assertWorkspaceExternalDropCallbacks(onExternalDrop, validateExternalDrop);
  assertWorkspaceGroupFactory<TSectionData>(groupFactory);
  assertWorkspaceSectionFactory<TSectionData>(sectionFactory);
  assertWorkspaceSectionTitleValidator(validateSectionTitle);
  const gestureOptions = useMemo(
    () => resolveWorkspaceGestureOptions(gestureOptionOverrides),
    [gestureOptionOverrides],
  );
  const appearanceOptions = useMemo(
    () => resolveWorkspaceAppearanceOptions(appearanceOptionOverrides),
    [appearanceOptionOverrides],
  );
  const gridOptions = useMemo(
    () => resolveWorkspaceGridOptions(gridOptionOverrides),
    [gridOptionOverrides],
  );
  const minimapOptions = useMemo(
    () => resolveWorkspaceMinimapOptions(minimapOptionOverrides),
    [minimapOptionOverrides],
  );
  const toolbarControls = useMemo(
    () => resolveWorkspaceToolbarControls(toolbarControlOverrides),
    [toolbarControlOverrides],
  );
  const overlayRenderers = useMemo(
    () => resolveWorkspaceOverlayRenderers(overlaySlotOverrides),
    [overlaySlotOverrides],
  );
  const sectionRegistry = useMemo(
    () => resolveSectionDefinitions(sectionDefinitionOverrides),
    [sectionDefinitionOverrides],
  );
  const sectionColorPalette = useMemo(
    () => resolveWorkspaceSectionColorPalette(sectionColorPaletteOverrides),
    [sectionColorPaletteOverrides],
  );
  const selectionOptions = useMemo(
    () => resolveWorkspaceSelectionOptions(selectionOptionOverrides),
    [selectionOptionOverrides],
  );
  const sectionMoveMode = resolveWorkspaceSectionMoveMode(sectionMoveModeValue);
  const [gridSnap, setGridSnap] = useWorkspaceBooleanPreference(
    "Workspace grid snap",
    gridOptions.snap,
    onGridSnapChange,
  );
  const [minimapVisible, setMinimapVisible] = useWorkspaceBooleanPreference(
    "Workspace minimap visibility",
    minimapOptions.visible,
    onMinimapVisibilityChange,
  );
  const effectiveGridOptions = useMemo(
    () => Object.freeze({ ...gridOptions, snap: gridSnap }),
    [gridOptions, gridSnap],
  );
  const resolvedAppearance = useResolvedWorkspaceAppearance(appearanceOptions.appearance);
  const themeStyle = useMemo(
    () => workspaceThemeStyle(appearanceOptions, resolvedAppearance),
    [appearanceOptions, resolvedAppearance],
  );
  const mode = resolveWorkspaceMode(
    controlledDocument,
    defaultDocument,
    gestureOptions.initialZoom,
    onDocumentChange,
  );
  const initialModeRef = useRef(mode.type);
  assertStableWorkspaceMode(initialModeRef.current, mode.type);
  const [uncontrolledDocument, setUncontrolledDocument] = useState(mode.document);
  const document = mode.type === "controlled" ? mode.document : uncontrolledDocument;
  const validatedDocument = useMemo(() => {
    validateWorkspaceSectionDefinitions(document, sectionRegistry);
    assertWorkspaceViewportWithinGestureBounds(document, gestureOptions);
    return document;
  }, [document, gestureOptions, sectionRegistry]);
  const capabilities = useMemo(
    () => resolveWorkspaceCapabilities(capabilityOverrides, readOnly),
    [capabilityOverrides, readOnly],
  );
  const sectionReadOnly = workspaceCapabilitiesAreReadOnly(capabilities);
  const documentRef = useRef(validatedDocument);
  const capabilitiesRef = useRef(capabilities);
  const gestureOptionsRef = useRef(gestureOptions);
  const gridOptionsRef = useRef(effectiveGridOptions);
  const sectionRegistryRef = useRef<WorkspaceSectionRegistry<TSectionData>>(sectionRegistry);
  const sectionFactoryRef = useRef<WorkspaceSectionFactory<TSectionData> | undefined>(
    sectionFactory,
  );
  const groupFactoryRef = useRef<WorkspaceGroupFactory<TSectionData> | undefined>(groupFactory);
  const controlledRef = useRef(mode.type === "controlled");
  const onDocumentChangeRef = useRef(onDocumentChange);
  const validateSectionTitleRef = useRef<WorkspaceSectionTitleValidator | undefined>(
    validateSectionTitle,
  );
  const [controllerSynchronizationRevision, setControllerSynchronizationRevision] = useState(0);
  documentRef.current = validatedDocument;
  capabilitiesRef.current = capabilities;
  gestureOptionsRef.current = gestureOptions;
  gridOptionsRef.current = effectiveGridOptions;
  sectionRegistryRef.current = sectionRegistry;
  sectionFactoryRef.current = sectionFactory;
  groupFactoryRef.current = groupFactory;
  controlledRef.current = mode.type === "controlled";
  onDocumentChangeRef.current = onDocumentChange;
  validateSectionTitleRef.current = validateSectionTitle;
  const [selectionState, setSelectionState] = useState<readonly string[]>([]);
  const selectedSectionIds = useMemo(
    () => reconcileWorkspaceSelection(validatedDocument, selectionState),
    [selectionState, validatedDocument],
  );
  const selectionRef = useRef<readonly string[]>(selectedSectionIds);
  selectionRef.current = selectedSectionIds;
  useEffect(() => {
    if (!workspaceSelectionsMatch(selectionState, selectedSectionIds)) {
      setSelectionState(selectedSectionIds);
    }
  }, [selectedSectionIds, selectionState]);
  const commitSelection = useCallback((sectionIds: readonly string[]) => {
    const nextSelection = resolveWorkspaceSelection(documentRef.current, sectionIds);
    if (workspaceSelectionsMatch(selectionRef.current, nextSelection)) {
      return { status: "unchanged" } as const;
    }
    selectionRef.current = nextSelection;
    setSelectionState(nextSelection);
    return { status: "applied" } as const;
  }, []);

  const canvasControllerRef = useRef<WorkspaceCanvasController | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const handleCanvasControllerChange = useCallback((next: WorkspaceCanvasController | null) => {
    canvasControllerRef.current = next;
    setCanvasReady(next !== null);
  }, []);
  const controllerBindingsRef = useRef<WorkspaceControllerBindings<TSectionData> | null>(null);
  const internalControllerRef = useRef<WorkspaceController<TSectionData> | null>(null);
  const history = useWorkspaceHistoryCoordinator({
    canvasControllerRef,
    capabilitiesRef,
    commitSelection,
    controlledRef,
    document: validatedDocument,
    selectionRef,
  });
  const synchronizeHistory = history.synchronize;
  const historySynchronizationRevision = history.synchronizationRevision;
  const pendingCreatedSectionRef = useRef<Readonly<{
    panIntoView: boolean;
    sectionId: string;
    title: string;
  }> | null>(null);
  const pendingStructuralSelectionRef = useRef<PendingStructuralSelection | null>(null);
  const [creationAnnouncement, setCreationAnnouncement] = useState("");
  const [creationReconciliation, setCreationReconciliation] = useState({
    accepted: true,
    revision: 0,
  });
  const [creationSynchronizationRevision, setCreationSynchronizationRevision] = useState(0);
  const [structuralSelectionRevision, setStructuralSelectionRevision] = useState(0);
  if (!internalControllerRef.current) {
    const bindings: WorkspaceControllerBindings<TSectionData> = {
      canMinimizeSection: (sectionId) => {
        const section = documentRef.current.sections[sectionId];
        return Boolean(section && sectionRegistryRef.current.definition(section.kind)?.minimizable);
      },
      commit: (nextDocument, change) => {
        history.stageCommit(documentRef.current, nextDocument, change);
        if (!controlledRef.current) {
          documentRef.current = nextDocument;
          setUncontrolledDocument(nextDocument);
        }
        onDocumentChangeRef.current?.(nextDocument, change);
      },
      createSection: (kind, options) => {
        const factory = sectionFactoryRef.current;
        if (!factory) {
          return { reason: "section-creation-unavailable", status: "rejected" };
        }
        const plan = planWorkspaceRootSectionCreation({
          canvasController: canvasControllerRef.current,
          document: documentRef.current,
          factory,
          gridOptions: gridOptionsRef.current,
          kind,
          options,
          registry: sectionRegistryRef.current,
        });
        if (plan.status === "rejected") {
          return plan;
        }
        const result = createWorkspaceRootSection(bindings, plan.section, plan.position);
        if (result.status === "applied") {
          pendingCreatedSectionRef.current = {
            panIntoView: plan.panTarget !== null,
            sectionId: plan.section.id,
            title: plan.section.title,
          };
          setCreationAnnouncement("");
          setCreationSynchronizationRevision((revision) => revision + 1);
        }
        return result;
      },
      groupSections: (sectionIds) => {
        const factory = groupFactoryRef.current;
        if (!factory) {
          return { reason: "grouping-unavailable", status: "rejected" };
        }
        const plan = planWorkspaceSectionGrouping({
          canvasController: canvasControllerRef.current,
          document: documentRef.current,
          factory,
          registry: sectionRegistryRef.current,
          sectionIds,
        });
        if (plan.status === "rejected") {
          return plan;
        }
        const result = groupWorkspaceSections(bindings, plan.group, plan.sectionIds, plan.position);
        if (result.status === "applied") {
          pendingStructuralSelectionRef.current = {
            focusSectionId: plan.group.id,
            groupSectionId: plan.group.id,
            sectionIds: plan.sectionIds,
            type: "group",
          };
          setStructuralSelectionRevision((revision) => revision + 1);
        }
        return result;
      },
      getCapabilities: () => capabilitiesRef.current,
      getCanvasController: () => canvasControllerRef.current,
      getDocument: () => documentRef.current,
      getHistoryState: history.getState,
      getSelection: () => selectionRef.current,
      getViewportBounds: () => gestureOptionsRef.current,
      requestViewportSynchronization: () =>
        setControllerSynchronizationRevision((revision) => revision + 1),
      redo: () => history.navigate("redo", bindings),
      setSelection: commitSelection,
      undo: () => history.navigate("undo", bindings),
      ungroupSection: (sectionId) => {
        const plan = planWorkspaceSectionUngrouping({
          canvasController: canvasControllerRef.current,
          document: documentRef.current,
          sectionId,
        });
        if (plan.status === "rejected") {
          return plan;
        }
        const result = ungroupWorkspaceSection(bindings, sectionId, plan.rootPositions);
        const focusSectionId = plan.childSectionIds[0];
        if (result.status === "applied" && focusSectionId) {
          pendingStructuralSelectionRef.current = {
            focusSectionId,
            groupSectionId: sectionId,
            parentSectionId: plan.parentSectionId,
            sectionIds: plan.childSectionIds,
            type: "ungroup",
          };
          setStructuralSelectionRevision((revision) => revision + 1);
        }
        return result;
      },
    };
    controllerBindingsRef.current = bindings;
    internalControllerRef.current = createWorkspaceController(bindings);
  }
  const controller = internalControllerRef.current;
  useEffect(() => {
    const pendingCreation = pendingCreatedSectionRef.current;
    if (!pendingCreation) {
      return;
    }
    pendingCreatedSectionRef.current = null;
    if (!Object.hasOwn(validatedDocument.sections, pendingCreation.sectionId)) {
      setCreationReconciliation((reconciliation) => ({
        accepted: false,
        revision: reconciliation.revision + 1,
      }));
      setCreationAnnouncement(
        `${pendingCreation.title} was not created because the controlled host did not accept the change.`,
      );
      return;
    }
    setCreationReconciliation((reconciliation) => ({
      accepted: true,
      revision: reconciliation.revision + 1,
    }));
    setCreationAnnouncement(
      `${validatedDocument.sections[pendingCreation.sectionId]?.title ?? pendingCreation.title} created.`,
    );
    controller.selectSections([pendingCreation.sectionId]);
    const canvasController = canvasControllerRef.current;
    if (!canvasController) {
      return;
    }
    void focusCreatedWorkspaceSection(
      controller,
      canvasController,
      pendingCreation.sectionId,
      pendingCreation.panIntoView,
    );
  }, [controller, creationSynchronizationRevision, validatedDocument]);
  useEffect(() => {
    const pending = pendingStructuralSelectionRef.current;
    if (!pending) {
      return;
    }
    pendingStructuralSelectionRef.current = null;
    if (!structuralSelectionAccepted(validatedDocument, pending)) {
      return;
    }
    controller.selectSections(
      pending.type === "group" ? [pending.groupSectionId] : pending.sectionIds,
    );
    const canvasController = canvasControllerRef.current;
    if (canvasController) {
      void canvasController.focusElementWhenReady(pending.focusSectionId);
    }
  }, [controller, structuralSelectionRevision, validatedDocument]);
  useEffect(() => {
    synchronizeHistory();
  }, [historySynchronizationRevision, synchronizeHistory]);
  const handleRootMoveCommit = useCallback(
    (positions: Readonly<Record<string, WorkspacePoint>>) => {
      const bindings = controllerBindingsRef.current;
      if (!bindings) {
        throw new Error("Workspace controller bindings are unavailable before initialization.");
      }
      return moveWorkspaceRootSections(bindings, positions);
    },
    [],
  );
  const handleSectionMoveCommit = useCallback(
    (plan: Parameters<typeof moveWorkspaceSections>[1]) => {
      const bindings = controllerBindingsRef.current;
      if (!bindings) {
        throw new Error("Workspace controller bindings are unavailable before initialization.");
      }
      return moveWorkspaceSections(bindings, plan);
    },
    [],
  );
  const handleRootResizeCommit = useCallback(
    (
      sectionId: string,
      axes: readonly WorkspaceSectionResizeAxis[],
      resize: WorkspaceRootResizeSnapshot,
    ) => {
      const bindings = controllerBindingsRef.current;
      if (!bindings) {
        throw new Error("Workspace controller bindings are unavailable before initialization.");
      }
      return resizeWorkspaceRootSection(bindings, sectionId, axes, resize);
    },
    [],
  );
  const handleSectionContentSizeCommit = useCallback(
    (sectionId: string, axes: readonly WorkspaceSectionResizeAxis[]) => {
      const bindings = controllerBindingsRef.current;
      if (!bindings) {
        throw new Error("Workspace controller bindings are unavailable before initialization.");
      }
      return setWorkspaceSectionContentSize(bindings, sectionId, axes);
    },
    [],
  );
  const handleSectionOverflowCommit = useCallback(
    (
      sectionId: string,
      overflow: SectionOverflow,
      measuredSize: Readonly<{ height: number; width: number }> | null,
    ) => {
      const bindings = controllerBindingsRef.current;
      if (!bindings) {
        throw new Error("Workspace controller bindings are unavailable before initialization.");
      }
      const section = documentRef.current.sections[sectionId];
      const definition = section ? sectionRegistryRef.current.definition(section.kind) : undefined;
      const orientation = section?.childLayout?.orientation;
      const contentSizingAxis = orientation === "horizontal" ? "width" : "height";
      return setWorkspaceSectionChildOverflow(
        bindings,
        sectionId,
        overflow,
        measuredSize,
        Boolean(definition?.contentSizing[contentSizingAxis]),
      );
    },
    [],
  );
  const handleSectionOrientationCommit = useCallback(
    (sectionId: string, orientation: SectionOrientation) =>
      controller.setSectionChildOrientation(sectionId, orientation),
    [controller],
  );
  const handleSectionPresentationCommit = useCallback(
    (sectionId: string, presentation: WorkspaceSectionPresentation) =>
      controller.setSectionPresentation(sectionId, presentation),
    [controller],
  );
  const handleSectionLockedCommit = useCallback(
    (sectionId: string, locked: boolean) => controller.setSectionsLocked([sectionId], locked),
    [controller],
  );
  const handleSectionMinimizedCommit = useCallback(
    (sectionId: string, isMinimized: boolean) =>
      controller.setSectionMinimized(sectionId, isMinimized),
    [controller],
  );
  const handleSectionTitleCommit = useCallback(
    (sectionId: string, title: string) => controller.setSectionTitle(sectionId, title),
    [controller],
  );
  const handleSectionTitleValidation = useCallback(
    (request: WorkspaceSectionTitleValidationRequest) => {
      const validator = validateSectionTitleRef.current;
      return validator ? validator(request) : null;
    },
    [],
  );
  useImperativeHandle(controllerRef, () => controller, [controller]);
  const overlaySlots = renderWorkspaceOverlaySlots(overlayRenderers, controller);
  const creationAvailability = workspaceCreationAvailability(
    sectionFactory,
    sectionRegistry,
    capabilities,
    canvasReady,
  );
  const groupingConfigured =
    Boolean(groupFactory) &&
    sectionRegistry.definitions().some((definition) => definition.canContainSections);

  const resolvedClassName = ["setta-workspace", className].filter(Boolean).join(" ");
  const hasNoSections = validatedDocument.rootSections.length === 0;
  const resolvedEmptyState = hasNoSections ? emptyState : null;

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      className={resolvedClassName}
      data-read-only={readOnly ? "true" : "false"}
      data-setta-workspace=""
      data-workspace-appearance={appearanceOptions.appearance}
      data-workspace-mode={mode.type}
      data-workspace-resolved-appearance={resolvedAppearance}
      style={{ ...style, ...themeStyle }}
    >
      <WorkspaceCanvasAdapter
        ariaLabel={ariaLabel}
        appearance={resolvedAppearance}
        controllerSynchronizationRevision={controllerSynchronizationRevision}
        creationAnnouncement={creationAnnouncement}
        creationConfigured={creationAvailability.configured}
        creationEnabled={creationAvailability.enabled}
        creationReconciliation={creationReconciliation}
        document={validatedDocument}
        emptyState={resolvedEmptyState}
        gestureOptions={gestureOptions}
        gridOptions={effectiveGridOptions}
        groupingConfigured={groupingConfigured}
        historyAnnouncement={history.announcement}
        layoutEditable={capabilities.editLayout}
        marqueeSelectionMode={selectionOptions.marqueeMode}
        minimapPlacement={minimapOptions.placement}
        minimapVisible={minimapVisible}
        onCanvasControllerChange={handleCanvasControllerChange}
        onExternalDrop={onExternalDrop}
        onGridSnapChange={setGridSnap}
        onMinimapVisibilityChange={setMinimapVisible}
        onRootMoveCommit={handleRootMoveCommit}
        onRootResizeCommit={handleRootResizeCommit}
        onSectionContentSizeCommit={handleSectionContentSizeCommit}
        onSectionLockedCommit={handleSectionLockedCommit}
        onSectionMinimizedCommit={handleSectionMinimizedCommit}
        onSectionMoveCommit={handleSectionMoveCommit}
        onSectionOrientationCommit={handleSectionOrientationCommit}
        onSectionOverflowCommit={handleSectionOverflowCommit}
        onSectionPresentationCommit={handleSectionPresentationCommit}
        onSectionTitleCommit={handleSectionTitleCommit}
        onSelectionChange={commitSelection}
        onViewportCommit={controller.setViewport}
        overlaySlots={overlaySlots}
        presentationEditable={capabilities.editPresentation}
        readOnly={sectionReadOnly}
        sectionColorPalette={sectionColorPalette}
        sectionMoveMode={sectionMoveMode}
        sectionRegistry={sectionRegistry}
        selectedSectionIds={selectedSectionIds}
        structureEditable={capabilities.editStructure}
        toolbarControls={toolbarControls}
        validateExternalDrop={validateExternalDrop}
        validateSectionTitle={handleSectionTitleValidation}
        workspaceController={controller}
      />
    </section>
  );
}

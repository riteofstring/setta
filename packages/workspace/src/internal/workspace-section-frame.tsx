import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import type {
  SectionOrientation,
  SectionOverflow,
  WorkspaceActionResult,
  WorkspaceSection,
  WorkspaceSectionPresentation,
} from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_ROOT_DRAG_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import {
  workspaceKeyboardMoveDirectionForKey,
  type WorkspaceKeyboardMoveDirection,
} from "./workspace-root-movement.js";
import type {
  WorkspaceSectionColorOption,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import {
  useWorkspaceSectionDetached,
  WorkspaceSectionContent,
  WorkspaceSectionDetachmentControl,
} from "./workspace-section-detachment.js";
import {
  useWorkspaceSectionDnd,
  useWorkspaceSectionDragHandleActivation,
  workspaceSectionMoveDescription,
} from "./workspace-section-dnd.js";
import { SectionPresentationEditor, SectionTitleEditor } from "./workspace-section-editors.js";
import { MoveIcon, RenameIcon, SelectionIcon, StyleIcon } from "./workspace-section-frame-icons.js";
import { WorkspaceSectionLayoutControls } from "./workspace-section-layout-controls.js";
import {
  SectionDescendantRegion,
  sectionMinimizeTargetIds,
  SectionStateLabels,
} from "./workspace-section-minimization.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";
import { WorkspaceSectionStateControls } from "./workspace-section-state-controls.js";
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";
import {
  optionalWorkspaceCullingSize,
  registerWorkspaceSectionCullingFrame,
  useWorkspaceSectionCulling,
  workspaceSectionCullingPinned,
  WorkspaceSectionCullingSurface,
  type WorkspaceViewportCulling,
} from "./workspace-viewport-culling.js";

export type WorkspaceSectionFrameProps = Readonly<{
  appearance: "dark" | "light";
  childSectionRegion: ReactNode;
  colorPalette: readonly WorkspaceSectionColorOption[];
  definition: ResolvedSectionDefinition<unknown>;
  depth: number;
  freeformChild: boolean;
  geometry: WorkspaceGeometryMeasurements;
  layoutEditable: boolean;
  moving: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onLockedCommit(sectionId: string, locked: boolean): WorkspaceActionResult;
  onMinimizedCommit(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
  onOrientationCommit(sectionId: string, orientation: SectionOrientation): WorkspaceActionResult;
  onOverflowCommit(sectionId: string, overflow: SectionOverflow): WorkspaceActionResult;
  onPositioningRequest(sectionId: string, trigger: HTMLButtonElement): void;
  onPresentationCommit(
    sectionId: string,
    presentation: WorkspaceSectionPresentation,
  ): WorkspaceActionResult;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  onTitleCommit(sectionId: string, title: string): WorkspaceActionResult;
  order: number;
  parentSectionId: string | null;
  presentationEditable: boolean;
  readOnly: boolean;
  resizing: boolean;
  selected: boolean;
  selectionMovementBlocked: boolean;
  section: WorkspaceSection<unknown>;
  validateTitle: WorkspaceSectionTitleValidator;
  viewportCulling: WorkspaceViewportCulling;
}>;

type SectionFrameStyle = CSSProperties &
  Readonly<{
    "--setta-workspace-section-accent"?: string;
  }>;

type SwatchStyle = CSSProperties &
  Readonly<{
    "--setta-workspace-section-swatch": string;
  }>;

function SectionTag({ color }: Readonly<{ color: string | null }>) {
  if (!color) {
    return null;
  }
  return (
    <span className="setta-workspace__section-tag">
      <span
        aria-hidden="true"
        className="setta-workspace__section-tag-swatch"
        style={{ "--setta-workspace-section-swatch": color } as SwatchStyle}
      />
      Tagged
    </span>
  );
}

type SectionHeadingProps = Readonly<{
  controls: ReactNode;
  definition: ResolvedSectionDefinition<unknown>;
  detached: boolean;
  hasStatus: boolean;
  headingId: string;
  section: WorkspaceSection<unknown>;
  selectionControl: ReactNode;
  showHeader: boolean;
  statusId: string;
  titleContent: ReactNode;
}>;

function VisibleSectionHeading({
  controls,
  definition,
  detached,
  hasStatus,
  section,
  selectionControl,
  statusId,
  titleContent,
}: Omit<SectionHeadingProps, "headingId" | "showHeader">) {
  return (
    <header className="setta-workspace__section-header">
      <div className="setta-workspace__section-heading-row">
        {definition.creation.icon ? (
          <span aria-hidden="true" className="setta-workspace__section-kind-icon" inert>
            {definition.creation.icon}
          </span>
        ) : null}
        <div className="setta-workspace__section-heading">
          {titleContent}
          <div className="setta-workspace__section-metadata">
            <span className="setta-workspace__section-kind">{definition.displayName}</span>
            <SectionTag color={section.presentation.tagColor} />
          </div>
        </div>
      </div>
      <div className="setta-workspace__section-actions">
        {selectionControl}
        {hasStatus ? (
          <div className="setta-workspace__section-states" id={statusId}>
            <SectionStateLabels
              detached={detached}
              isMinimized={section.isMinimized}
              locked={section.positionAndSizeLocked}
              minimizeScope={definition.minimizeScope}
            />
          </div>
        ) : null}
        {controls}
      </div>
    </header>
  );
}

function HeaderlessSectionHeading({
  controls,
  definition,
  detached,
  hasStatus,
  headingId,
  section,
  selectionControl,
  statusId,
}: Omit<SectionHeadingProps, "showHeader" | "titleContent">) {
  return (
    <>
      <h2 className="setta-workspace__visually-hidden" id={headingId}>
        {section.title}
      </h2>
      <div className="setta-workspace__section-actions setta-workspace__section-actions--floating">
        <SectionTag color={section.presentation.tagColor} />
        {selectionControl}
        {hasStatus ? (
          <div className="setta-workspace__section-states" id={statusId}>
            <SectionStateLabels
              detached={detached}
              isMinimized={section.isMinimized}
              locked={section.positionAndSizeLocked}
              minimizeScope={definition.minimizeScope}
            />
          </div>
        ) : null}
        {controls}
      </div>
    </>
  );
}

function SectionHeading(props: SectionHeadingProps) {
  if (props.showHeader) {
    return <VisibleSectionHeading {...props} />;
  }
  return <HeaderlessSectionHeading {...props} />;
}

function SectionSelectionControl({
  onSelectionRequest,
  section,
  selected,
}: Readonly<{
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  section: WorkspaceSection<unknown>;
  selected: boolean;
}>) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSelectionRequest(section.id, {
      additive: event.shiftKey,
      preserveSelected: false,
    });
  };
  return (
    <button
      aria-keyshortcuts="Shift+Enter Shift+Space"
      aria-label={`Select ${section.title}`}
      aria-pressed={selected}
      className="setta-workspace__section-selection-control"
      data-workspace-selection-control=""
      onClick={handleClick}
      type="button"
    >
      <SelectionIcon selected={selected} />
    </button>
  );
}

function structuralDragAttribute<Value>(structural: boolean, value: Value): Value | undefined {
  return structural ? value : undefined;
}

function spatialDragDisabled(
  depth: number,
  detached: boolean,
  layoutEditable: boolean,
  section: WorkspaceSection<unknown>,
  selectionMovementBlocked: boolean,
  spatialEnabled: boolean,
): boolean {
  return (
    !spatialEnabled ||
    detached ||
    depth > 0 ||
    !layoutEditable ||
    section.positionAndSizeLocked ||
    selectionMovementBlocked
  );
}

function handleStructuralDragKey(
  event: KeyboardEvent<HTMLButtonElement>,
  active: boolean,
  disabled: boolean,
  section: WorkspaceSection<unknown>,
  selected: boolean,
  onSelectionRequest: (sectionId: string, request: WorkspaceSectionSelectionRequest) => void,
): void {
  if (active && workspaceKeyboardMoveDirectionForKey(event.key)) {
    event.preventDefault();
    event.stopPropagation();
  }
  if ((event.key === "Enter" || event.key === " ") && !disabled) {
    onSelectionRequest(section.id, {
      additive: event.shiftKey,
      preserveSelected: selected,
    });
  }
}

function SectionDragHandle({
  depth,
  descriptionId,
  detached,
  layoutEditable,
  onKeyboardMove,
  onSelectionRequest,
  section,
  selected,
  selectionMovementBlocked,
  spatialMoving,
  structuralDrag,
}: Readonly<{
  depth: number;
  descriptionId: string;
  detached: boolean;
  layoutEditable: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  section: WorkspaceSection<unknown>;
  selected: boolean;
  selectionMovementBlocked: boolean;
  spatialMoving: boolean;
  structuralDrag: Readonly<{
    active: boolean;
    configEnabled: boolean;
    handleRef(element: Element | null): void;
    mode: "free" | "sort";
    structural: boolean;
  }>;
}>) {
  const activation = useWorkspaceSectionDragHandleActivation({
    configEnabled: structuralDrag.configEnabled,
    sectionId: section.id,
    spatialMoving,
  });
  const disabled = structuralDrag.structural
    ? !activation.structuralEnabled
    : spatialDragDisabled(
        depth,
        detached,
        layoutEditable,
        section,
        selectionMovementBlocked,
        activation.spatialEnabled,
      );
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (structuralDrag.structural) {
      handleStructuralDragKey(
        event,
        structuralDrag.active,
        disabled,
        section,
        selected,
        onSelectionRequest,
      );
      return;
    }
    const direction = workspaceKeyboardMoveDirectionForKey(event.key);
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onKeyboardMove(section.id, direction);
  };
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || disabled) {
      return;
    }
    if (structuralDrag.structural && event.pointerType === "touch") {
      return;
    }
    onSelectionRequest(section.id, {
      additive: event.shiftKey,
      preserveSelected: selected,
    });
  };
  return (
    <button
      aria-describedby={descriptionId}
      aria-grabbed={structuralDragAttribute(structuralDrag.structural, structuralDrag.active)}
      aria-keyshortcuts={
        structuralDrag.structural
          ? "Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Escape"
          : "ArrowUp ArrowDown ArrowLeft ArrowRight"
      }
      aria-label={`Move ${section.title}`}
      aria-roledescription={structuralDragAttribute(structuralDrag.structural, "draggable")}
      className={`setta-workspace__section-drag-handle${depth === 0 && !detached ? " setta-workspace__section-drag-handle--root" : ""}${structuralDrag.structural ? ` ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_ROOT_DRAG_CLASS_NAME}` : ""}`}
      data-workspace-section-drag-mode={structuralDrag.structural ? structuralDrag.mode : "spatial"}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      ref={structuralDragAttribute(structuralDrag.structural, structuralDrag.handleRef)}
      type="button"
    >
      <MoveIcon />
    </button>
  );
}

function focusWithoutScroll(ref: RefObject<HTMLElement | null>): void {
  const element = ref.current;
  if (!element) {
    return;
  }
  const view = element.ownerDocument.defaultView;
  if (view) {
    view.requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
  } else {
    element.focus({ preventScroll: true });
  }
}

function hasSectionStatus(section: WorkspaceSection<unknown>, detached: boolean): boolean {
  return section.positionAndSizeLocked || section.isMinimized || detached;
}

function shouldShowSectionHeader(
  section: WorkspaceSection<unknown>,
  detached: boolean,
  editingTitle: boolean,
  presentationOpen: boolean,
): boolean {
  return (
    section.presentation.chrome !== "none" ||
    section.isMinimized ||
    detached ||
    editingTitle ||
    presentationOpen
  );
}

function sectionFrameStyle(
  depth: number,
  section: WorkspaceSection<unknown>,
  definition: ResolvedSectionDefinition<unknown>,
  culledSize?: Readonly<{ height: number; width: number }>,
): SectionFrameStyle {
  return {
    ...(section.presentation.accentColor
      ? { "--setta-workspace-section-accent": section.presentation.accentColor }
      : {}),
    ...(section.isMinimized
      ? {}
      : {
          maxHeight: definition.resize.maxSize.height,
          minHeight: definition.resize.minSize.height,
        }),
    maxWidth: definition.resize.maxSize.width,
    minWidth: definition.resize.minSize.width,
    ...(depth === 0
      ? {}
      : {
          blockSize:
            section.isMinimized || section.size.height.mode === "content"
              ? "max-content"
              : section.size.height.value,
          inlineSize:
            section.size.width.mode === "content" ? "max-content" : section.size.width.value,
        }),
    ...(culledSize
      ? {
          blockSize: culledSize.height,
          inlineSize: culledSize.width,
          maxHeight: culledSize.height,
          maxWidth: culledSize.width,
          minHeight: culledSize.height,
          minWidth: culledSize.width,
        }
      : {}),
  };
}

function sectionWithPresentation(
  section: WorkspaceSection<unknown>,
  presentation: WorkspaceSectionPresentation | null,
): WorkspaceSection<unknown> {
  return presentation ? { ...section, presentation } : section;
}

function sectionDragBlocked(
  section: WorkspaceSection<unknown>,
  selectionMovementBlocked: boolean,
  detached: boolean,
): boolean {
  return section.positionAndSizeLocked || selectionMovementBlocked || detached;
}

function sectionFrameMoving(spatialMoving: boolean, structuralMoving: boolean): boolean {
  return spatialMoving || structuralMoving;
}

function SectionTitleContent({
  editing,
  editorId,
  headingId,
  onCancel,
  onCommit,
  onStartEditing,
  presentationEditable,
  section,
  validateTitle,
}: Readonly<{
  editing: boolean;
  editorId: string;
  headingId: string;
  onCancel(): void;
  onCommit(sectionId: string, title: string): WorkspaceActionResult;
  onStartEditing(): void;
  presentationEditable: boolean;
  section: WorkspaceSection<unknown>;
  validateTitle: WorkspaceSectionTitleValidator;
}>) {
  if (editing) {
    return (
      <SectionTitleEditor
        currentTitle={section.title}
        editorId={editorId}
        headingId={headingId}
        onCancel={onCancel}
        onCommit={onCommit}
        sectionId={section.id}
        validateTitle={validateTitle}
      />
    );
  }
  const handleDoubleClick = (event: MouseEvent<HTMLHeadingElement>) => {
    if (!presentationEditable) {
      return;
    }
    event.stopPropagation();
    onStartEditing();
  };
  return (
    <h2 id={headingId} onDoubleClick={handleDoubleClick}>
      {section.title}
    </h2>
  );
}

function SectionEditControls({
  editingTitle,
  onClosePresentation,
  onOpenPresentation,
  onStartTitleEditing,
  presentationEditable,
  presentationEditorId,
  presentationOpen,
  renameControlRef,
  section,
  styleControlRef,
  titleEditorId,
}: Readonly<{
  editingTitle: boolean;
  onClosePresentation(): void;
  onOpenPresentation(): void;
  onStartTitleEditing(): void;
  presentationEditable: boolean;
  presentationEditorId: string;
  presentationOpen: boolean;
  renameControlRef: RefObject<HTMLButtonElement | null>;
  section: WorkspaceSection<unknown>;
  styleControlRef: RefObject<HTMLButtonElement | null>;
  titleEditorId: string;
}>) {
  return (
    <>
      <button
        aria-controls={titleEditorId}
        aria-expanded={editingTitle}
        aria-label={`Rename ${section.title}`}
        className="setta-workspace__section-edit-control"
        disabled={!presentationEditable || editingTitle || presentationOpen}
        onClick={onStartTitleEditing}
        ref={renameControlRef}
        type="button"
      >
        <RenameIcon />
      </button>
      <button
        aria-controls={presentationEditorId}
        aria-expanded={presentationOpen}
        aria-label={`Style ${section.title}`}
        className="setta-workspace__section-edit-control"
        disabled={!presentationEditable || editingTitle}
        onClick={presentationOpen ? onClosePresentation : onOpenPresentation}
        ref={styleControlRef}
        type="button"
      >
        <StyleIcon />
      </button>
    </>
  );
}

function SectionFrameControls({
  detachmentControl,
  editingTitle,
  editControls,
  dragHandle,
  layoutControls,
  stateControls,
}: Readonly<{
  detachmentControl: ReactNode;
  editingTitle: boolean;
  editControls: ReactNode;
  dragHandle: ReactNode;
  layoutControls: ReactNode;
  stateControls: ReactNode;
}>) {
  if (editingTitle) {
    return null;
  }
  return (
    <>
      {stateControls}
      {detachmentControl}
      {layoutControls}
      {editControls}
      {dragHandle}
    </>
  );
}

function OpenSectionPresentationEditor({
  colorPalette,
  editorId,
  onClose,
  onCommit,
  onPreview,
  open,
  section,
}: Readonly<{
  colorPalette: readonly WorkspaceSectionColorOption[];
  editorId: string;
  onClose(): void;
  onCommit(sectionId: string, presentation: WorkspaceSectionPresentation): WorkspaceActionResult;
  onPreview(presentation: WorkspaceSectionPresentation | null): void;
  open: boolean;
  section: WorkspaceSection<unknown>;
}>) {
  return open ? (
    <SectionPresentationEditor
      colorPalette={colorPalette}
      editorId={editorId}
      onClose={onClose}
      onCommit={onCommit}
      onPreview={onPreview}
      section={section}
    />
  ) : null;
}

function sectionChildLayoutData(section: WorkspaceSection<unknown>) {
  const layout = section.childLayout;
  if (!layout) {
    return { orientation: undefined, overflow: undefined, positioning: undefined };
  }
  return {
    orientation: layout.positioning === "ordered" ? layout.orientation : undefined,
    overflow: layout.overflow,
    positioning: layout.positioning,
  };
}

export function WorkspaceSectionFrame({
  appearance,
  childSectionRegion,
  colorPalette,
  definition,
  depth,
  freeformChild,
  geometry,
  layoutEditable,
  moving,
  onKeyboardMove,
  onLockedCommit,
  onMinimizedCommit,
  onOrientationCommit,
  onOverflowCommit,
  onPositioningRequest,
  onPresentationCommit,
  onSelectionRequest,
  onTitleCommit,
  order,
  parentSectionId,
  presentationEditable,
  readOnly,
  resizing,
  selected,
  selectionMovementBlocked,
  section,
  validateTitle,
  viewportCulling,
}: WorkspaceSectionFrameProps) {
  const reactId = useId().replaceAll(":", "");
  const contentId = `setta-workspace-section-${reactId}-content`;
  const descendantRegionId = `setta-workspace-section-${reactId}-descendants`;
  const headingId = `setta-workspace-section-${reactId}-title`;
  const moveDescriptionId = `setta-workspace-section-${reactId}-move-description`;
  const presentationEditorId = `setta-workspace-section-${reactId}-presentation`;
  const statusId = `setta-workspace-section-${reactId}-status`;
  const titleEditorId = `setta-workspace-section-${reactId}-title-editor`;
  const contentElementRef = useRef<HTMLDivElement>(null);
  const detachmentControlRef = useRef<HTMLButtonElement>(null);
  const frameElementRef = useRef<HTMLElement>(null);
  const lockControlRef = useRef<HTMLButtonElement>(null);
  const minimizeControlRef = useRef<HTMLButtonElement>(null);
  const orientationControlRef = useRef<HTMLButtonElement>(null);
  const overflowControlRef = useRef<HTMLButtonElement>(null);
  const renameControlRef = useRef<HTMLButtonElement>(null);
  const restoreTitleFocusRef = useRef(false);
  const styleControlRef = useRef<HTMLButtonElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [presentationPreview, setPresentationPreview] =
    useState<WorkspaceSectionPresentation | null>(null);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const detached = useWorkspaceSectionDetached(section.id);
  useEffect(() => {
    if (presentationEditable || (!editingTitle && !presentationOpen)) {
      return;
    }
    const frameElement = frameElementRef.current;
    const focusWasInside = Boolean(
      frameElement?.contains(frameElement.ownerDocument.activeElement),
    );
    restoreTitleFocusRef.current = false;
    setEditingTitle(false);
    setPresentationOpen(false);
    setPresentationPreview(null);
    if (focusWasInside) {
      focusWithoutScroll(frameElementRef);
    }
  }, [editingTitle, presentationEditable, presentationOpen]);
  useEffect(() => {
    if (!editingTitle && restoreTitleFocusRef.current) {
      restoreTitleFocusRef.current = false;
      focusWithoutScroll(renameControlRef);
    }
  }, [editingTitle]);
  const hasStatus = hasSectionStatus(section, detached);
  const childLayoutData = sectionChildLayoutData(section);
  const subtreeMinimization = definition.minimizeScope === "subtree";
  const descendantsCollapsed = subtreeMinimization && section.isMinimized;
  const showHeader = shouldShowSectionHeader(section, detached, editingTitle, presentationOpen);
  const presentedSection = sectionWithPresentation(section, presentationPreview);
  const sectionDnd = useWorkspaceSectionDnd({
    blocked: sectionDragBlocked(section, selectionMovementBlocked, detached),
    depth,
    freeformChild,
    sectionId: section.id,
  });
  const sectionDndElementRef = sectionDnd.elementRef;
  const registerElement = useCallback(
    (element: HTMLElement | null) =>
      registerWorkspaceSectionCullingFrame({
        depth,
        element,
        frameElementRef,
        geometry,
        order,
        parentSectionId,
        sectionDndElementRef,
        sectionId: section.id,
        viewportCulling,
      }),
    [depth, geometry, order, parentSectionId, section.id, sectionDndElementRef, viewportCulling],
  );
  const culling = useWorkspaceSectionCulling(
    viewportCulling,
    section.id,
    workspaceSectionCullingPinned(
      detached,
      moving,
      resizing,
      sectionDnd.active,
      editingTitle,
      presentationOpen,
    ),
  );
  const culledFrameProps = {
    depth,
    headingId,
    onBlurCapture: culling.handleBlurCapture,
    onFocusCapture: culling.handleFocusCapture,
    parentSectionId,
    registerElement,
    sectionId: section.id,
    style: sectionFrameStyle(
      depth,
      section,
      definition,
      optionalWorkspaceCullingSize(culling.size),
    ),
    title: section.title,
  };
  const closeTitleEditor = () => {
    restoreTitleFocusRef.current = true;
    setEditingTitle(false);
  };
  const closePresentationEditor = () => {
    setPresentationPreview(null);
    setPresentationOpen(false);
    focusWithoutScroll(styleControlRef);
  };
  const frameStyle = sectionFrameStyle(depth, presentedSection, definition);
  const titleContent = (
    <SectionTitleContent
      editing={editingTitle}
      editorId={titleEditorId}
      headingId={headingId}
      onCancel={closeTitleEditor}
      onCommit={onTitleCommit}
      onStartEditing={() => setEditingTitle(true)}
      presentationEditable={presentationEditable}
      section={section}
      validateTitle={validateTitle}
    />
  );
  const editControls = (
    <SectionEditControls
      editingTitle={editingTitle}
      onClosePresentation={closePresentationEditor}
      onOpenPresentation={() => setPresentationOpen(true)}
      onStartTitleEditing={() => setEditingTitle(true)}
      presentationEditable={presentationEditable}
      presentationEditorId={presentationEditorId}
      presentationOpen={presentationOpen}
      renameControlRef={renameControlRef}
      section={section}
      styleControlRef={styleControlRef}
      titleEditorId={titleEditorId}
    />
  );
  const dragHandle = (
    <SectionDragHandle
      depth={depth}
      descriptionId={moveDescriptionId}
      detached={detached}
      layoutEditable={layoutEditable}
      onKeyboardMove={onKeyboardMove}
      onSelectionRequest={onSelectionRequest}
      section={section}
      selected={selected}
      selectionMovementBlocked={selectionMovementBlocked}
      spatialMoving={moving}
      structuralDrag={sectionDnd}
    />
  );
  const detachmentControl = (
    <WorkspaceSectionDetachmentControl
      contentId={contentId}
      contentRef={contentElementRef}
      controlRef={detachmentControlRef}
      definition={definition}
      frameRef={frameElementRef}
      section={section}
    />
  );
  const stateControls = (
    <WorkspaceSectionStateControls
      definition={definition}
      layoutEditable={layoutEditable}
      lockControlRef={lockControlRef}
      minimizeControlRef={minimizeControlRef}
      minimizeTargetIds={sectionMinimizeTargetIds(
        definition.minimizeScope,
        contentId,
        descendantRegionId,
      )}
      onLockedCommit={(sectionId, locked) => {
        const result = onLockedCommit(sectionId, locked);
        focusWithoutScroll(lockControlRef);
        return result;
      }}
      onMinimizedCommit={(sectionId, isMinimized) => {
        const result = onMinimizedCommit(sectionId, isMinimized);
        focusWithoutScroll(minimizeControlRef);
        return result;
      }}
      presentationEditable={presentationEditable}
      section={section}
    />
  );
  const layoutControls = (
    <WorkspaceSectionLayoutControls
      layoutEditable={layoutEditable}
      onOrientationCommit={onOrientationCommit}
      onOverflowCommit={onOverflowCommit}
      onPositioningRequest={onPositioningRequest}
      orientationControlRef={orientationControlRef}
      overflowControlRef={overflowControlRef}
      section={section}
    />
  );
  const selectionControl = (
    <SectionSelectionControl
      onSelectionRequest={onSelectionRequest}
      section={section}
      selected={selected}
    />
  );
  return (
    <WorkspaceSectionCullingSurface
      culled={culling.culled}
      culledFrameProps={culledFrameProps}
      size={culling.size}
    >
      <article
        aria-describedby={hasStatus ? statusId : undefined}
        aria-labelledby={headingId}
        className={`setta-workspace__section-frame ${depth === 0 ? "setta-workspace__root-shell" : "setta-workspace__nested-shell"}`}
        data-workspace-depth={depth}
        data-workspace-detached={String(detached)}
        data-workspace-accent-color={presentedSection.presentation.accentColor ?? undefined}
        data-workspace-chrome={presentedSection.presentation.chrome}
        data-workspace-culled="false"
        data-workspace-minimized={String(section.isMinimized)}
        data-workspace-minimize-scope={definition.minimizeScope}
        data-workspace-descendants-collapsed={String(descendantsCollapsed)}
        data-workspace-child-orientation={childLayoutData.orientation}
        data-workspace-child-overflow={childLayoutData.overflow}
        data-workspace-child-positioning={childLayoutData.positioning}
        data-workspace-moving={String(sectionFrameMoving(moving, sectionDnd.active))}
        data-workspace-parent-section-id={parentSectionId ?? undefined}
        data-workspace-presentation-open={String(presentationOpen)}
        data-workspace-read-only={String(readOnly)}
        data-workspace-resizing={String(resizing)}
        data-workspace-selected={String(selected)}
        data-workspace-section-id={section.id}
        data-workspace-height-mode={section.size.height.mode}
        data-workspace-tag-color={presentedSection.presentation.tagColor ?? undefined}
        data-workspace-width-mode={section.size.width.mode}
        data-workspace-title-editing={String(editingTitle)}
        onBlurCapture={culling.handleBlurCapture}
        onFocusCapture={culling.handleFocusCapture}
        ref={registerElement}
        style={frameStyle}
        tabIndex={-1}
      >
        <span className="setta-workspace__visually-hidden" id={moveDescriptionId}>
          {workspaceSectionMoveDescription({
            detached,
            freeformChild,
            locked: section.positionAndSizeLocked,
            mode: sectionDnd.mode,
            selectionMovementBlocked,
            structural: sectionDnd.structural,
          })}
        </span>
        <SectionHeading
          controls={
            <SectionFrameControls
              detachmentControl={detachmentControl}
              dragHandle={dragHandle}
              editControls={editControls}
              editingTitle={editingTitle}
              layoutControls={layoutControls}
              stateControls={stateControls}
            />
          }
          definition={definition}
          detached={detached}
          hasStatus={hasStatus}
          headingId={headingId}
          section={presentedSection}
          selectionControl={editingTitle ? null : selectionControl}
          showHeader={showHeader}
          statusId={statusId}
          titleContent={titleContent}
        />
        <WorkspaceSectionContent
          appearance={appearance}
          contentId={contentId}
          contentRef={contentElementRef}
          definition={definition}
          frameRef={frameElementRef}
          inactive={presentationOpen}
          readOnly={readOnly}
          section={section}
        />
        <SectionDescendantRegion
          collapsed={descendantsCollapsed}
          descendantRegionId={descendantRegionId}
          minimizeScope={definition.minimizeScope}
          sectionId={section.id}
        >
          {childSectionRegion}
        </SectionDescendantRegion>
        <OpenSectionPresentationEditor
          colorPalette={colorPalette}
          editorId={presentationEditorId}
          onClose={closePresentationEditor}
          onCommit={onPresentationCommit}
          onPreview={setPresentationPreview}
          open={presentationOpen}
          section={section}
        />
      </article>
    </WorkspaceSectionCullingSurface>
  );
}

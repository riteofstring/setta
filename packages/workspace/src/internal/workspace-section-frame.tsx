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
  WorkspaceActionResult,
  WorkspaceSection,
  WorkspaceSectionPresentation,
} from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { WorkspaceKeyboardMoveDirection } from "./workspace-root-movement.js";
import type {
  WorkspaceSectionColorOption,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import { SectionPresentationEditor, SectionTitleEditor } from "./workspace-section-editors.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";
import { WorkspaceSectionStateControls } from "./workspace-section-state-controls.js";
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";

export type WorkspaceSectionFrameProps = Readonly<{
  appearance: "dark" | "light";
  colorPalette: readonly WorkspaceSectionColorOption[];
  definition: ResolvedSectionDefinition<unknown>;
  geometry: WorkspaceGeometryMeasurements;
  layoutEditable: boolean;
  moving: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onLockedCommit(sectionId: string, locked: boolean): WorkspaceActionResult;
  onMinimizedCommit(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
  onPresentationCommit(
    sectionId: string,
    presentation: WorkspaceSectionPresentation,
  ): WorkspaceActionResult;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  onTitleCommit(sectionId: string, title: string): WorkspaceActionResult;
  order: number;
  presentationEditable: boolean;
  readOnly: boolean;
  resizing: boolean;
  selected: boolean;
  selectionMovementBlocked: boolean;
  section: WorkspaceSection<unknown>;
  validateTitle: WorkspaceSectionTitleValidator;
}>;

type SectionFrameStyle = CSSProperties &
  Readonly<{
    "--setta-workspace-section-accent"?: string;
  }>;

type SwatchStyle = CSSProperties &
  Readonly<{
    "--setta-workspace-section-swatch": string;
  }>;

function SectionStateLabels({
  isMinimized,
  locked,
}: Readonly<{ isMinimized: boolean; locked: boolean }>) {
  return (
    <>
      {locked ? <span className="setta-workspace__section-state">Locked</span> : null}
      {isMinimized ? <span className="setta-workspace__section-state">Minimized</span> : null}
    </>
  );
}

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
              isMinimized={section.isMinimized}
              locked={section.positionAndSizeLocked}
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
  hasStatus,
  headingId,
  section,
  selectionControl,
  statusId,
}: Omit<SectionHeadingProps, "definition" | "showHeader" | "titleContent">) {
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
              isMinimized={section.isMinimized}
              locked={section.positionAndSizeLocked}
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

function moveDirection(key: string): WorkspaceKeyboardMoveDirection | null {
  if (key === "ArrowDown") {
    return "down";
  }
  if (key === "ArrowLeft") {
    return "left";
  }
  if (key === "ArrowRight") {
    return "right";
  }
  return key === "ArrowUp" ? "up" : null;
}

function MoveIcon() {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="M10 2.75v14.5M2.75 10h14.5M7.5 5.25 10 2.75l2.5 2.5M7.5 14.75l2.5 2.5 2.5-2.5M5.25 7.5 2.75 10l2.5 2.5M14.75 7.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="m4 13.75-.75 3 3-.75L15 7.25 12.75 5 4 13.75ZM11.5 6.25l2.25 2.25" />
    </svg>
  );
}

function StyleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="M4 5h12M4 10h12M4 15h12" />
      <circle cx="7" cy="5" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="8.5" cy="15" r="1.5" />
    </svg>
  );
}

function SelectionIcon({ selected }: Readonly<{ selected: boolean }>) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="M7 3.5H4.5a1 1 0 0 0-1 1V7M13 3.5h2.5a1 1 0 0 1 1 1V7M7 16.5H4.5a1 1 0 0 1-1-1V13M13 16.5h2.5a1 1 0 0 0 1-1V13" />
      <path
        className="setta-workspace__section-selection-check"
        d="m6.75 10 2.1 2.1 4.4-4.45"
        data-selected={String(selected)}
      />
    </svg>
  );
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

function SectionDragHandle({
  descriptionId,
  layoutEditable,
  onKeyboardMove,
  onSelectionRequest,
  section,
  selected,
  selectionMovementBlocked,
}: Readonly<{
  descriptionId: string;
  layoutEditable: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  section: WorkspaceSection<unknown>;
  selected: boolean;
  selectionMovementBlocked: boolean;
}>) {
  const disabled = !layoutEditable || section.positionAndSizeLocked || selectionMovementBlocked;
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = moveDirection(event.key);
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
    onSelectionRequest(section.id, {
      additive: event.shiftKey,
      preserveSelected: selected,
    });
  };
  return (
    <button
      aria-describedby={descriptionId}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
      aria-label={`Move ${section.title}`}
      className="setta-workspace__section-drag-handle"
      disabled={disabled}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
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

function SectionContent({
  appearance,
  contentId,
  definition,
  inactive,
  readOnly,
  section,
}: Pick<WorkspaceSectionFrameProps, "appearance" | "definition" | "readOnly" | "section"> &
  Readonly<{ contentId: string; inactive: boolean }>) {
  if (section.isMinimized) {
    return <div hidden id={contentId} />;
  }
  const Renderer = definition.render;
  return (
    <div
      aria-hidden={inactive || undefined}
      className={`setta-workspace__section-content setta-workspace__interaction-boundary ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-prevent-pan="true"
      data-workspace-prevent-wheel="true"
      id={contentId}
      inert={inactive || undefined}
      tabIndex={inactive ? undefined : 0}
    >
      <Renderer
        appearance={appearance}
        data={section.data}
        readOnly={readOnly}
        sectionId={section.id}
      />
    </div>
  );
}

function registerSectionFrame(
  element: HTMLElement | null,
  geometry: WorkspaceGeometryMeasurements,
  order: number,
  sectionId: string,
) {
  if (!element) {
    return;
  }
  return geometry.register({
    depth: 0,
    element,
    order,
    parentSectionId: null,
    sectionId,
  });
}

function hasSectionStatus(section: WorkspaceSection<unknown>): boolean {
  return section.positionAndSizeLocked || section.isMinimized;
}

function shouldShowSectionHeader(
  section: WorkspaceSection<unknown>,
  editingTitle: boolean,
  presentationOpen: boolean,
): boolean {
  return (
    section.presentation.chrome !== "none" ||
    section.isMinimized ||
    editingTitle ||
    presentationOpen
  );
}

function sectionFrameStyle(
  section: WorkspaceSection<unknown>,
  definition: ResolvedSectionDefinition<unknown>,
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
  };
}

function sectionWithPresentation(
  section: WorkspaceSection<unknown>,
  presentation: WorkspaceSectionPresentation | null,
): WorkspaceSection<unknown> {
  return presentation ? { ...section, presentation } : section;
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
  editingTitle,
  editControls,
  dragHandle,
  stateControls,
}: Readonly<{
  editingTitle: boolean;
  editControls: ReactNode;
  dragHandle: ReactNode;
  stateControls: ReactNode;
}>) {
  if (editingTitle) {
    return null;
  }
  return (
    <>
      {stateControls}
      {editControls}
      {dragHandle}
    </>
  );
}

function SectionFrameSelectionControl({
  editingTitle,
  selectionControl,
}: Readonly<{ editingTitle: boolean; selectionControl: ReactNode }>) {
  return editingTitle ? null : selectionControl;
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

export function WorkspaceSectionFrame({
  appearance,
  colorPalette,
  definition,
  geometry,
  layoutEditable,
  moving,
  onKeyboardMove,
  onLockedCommit,
  onMinimizedCommit,
  onPresentationCommit,
  onSelectionRequest,
  onTitleCommit,
  order,
  presentationEditable,
  readOnly,
  resizing,
  selected,
  selectionMovementBlocked,
  section,
  validateTitle,
}: WorkspaceSectionFrameProps) {
  const reactId = useId().replaceAll(":", "");
  const contentId = `setta-workspace-section-${reactId}-content`;
  const headingId = `setta-workspace-section-${reactId}-title`;
  const moveDescriptionId = `setta-workspace-section-${reactId}-move-description`;
  const presentationEditorId = `setta-workspace-section-${reactId}-presentation`;
  const statusId = `setta-workspace-section-${reactId}-status`;
  const titleEditorId = `setta-workspace-section-${reactId}-title-editor`;
  const frameElementRef = useRef<HTMLElement>(null);
  const lockControlRef = useRef<HTMLButtonElement>(null);
  const minimizeControlRef = useRef<HTMLButtonElement>(null);
  const renameControlRef = useRef<HTMLButtonElement>(null);
  const restoreTitleFocusRef = useRef(false);
  const styleControlRef = useRef<HTMLButtonElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [presentationPreview, setPresentationPreview] =
    useState<WorkspaceSectionPresentation | null>(null);
  const [presentationOpen, setPresentationOpen] = useState(false);
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
  const hasStatus = hasSectionStatus(section);
  const showHeader = shouldShowSectionHeader(section, editingTitle, presentationOpen);
  const presentedSection = sectionWithPresentation(section, presentationPreview);
  const registerElement = useCallback(
    (element: HTMLElement | null) => {
      frameElementRef.current = element;
      return registerSectionFrame(element, geometry, order, section.id);
    },
    [geometry, order, section.id],
  );
  const closeTitleEditor = () => {
    restoreTitleFocusRef.current = true;
    setEditingTitle(false);
  };
  const closePresentationEditor = () => {
    setPresentationPreview(null);
    setPresentationOpen(false);
    focusWithoutScroll(styleControlRef);
  };
  const frameStyle = sectionFrameStyle(presentedSection, definition);
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
      descriptionId={moveDescriptionId}
      layoutEditable={layoutEditable}
      onKeyboardMove={onKeyboardMove}
      onSelectionRequest={onSelectionRequest}
      section={section}
      selected={selected}
      selectionMovementBlocked={selectionMovementBlocked}
    />
  );
  const stateControls = (
    <WorkspaceSectionStateControls
      contentId={contentId}
      definition={definition}
      layoutEditable={layoutEditable}
      lockControlRef={lockControlRef}
      minimizeControlRef={minimizeControlRef}
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
  const selectionControl = (
    <SectionSelectionControl
      onSelectionRequest={onSelectionRequest}
      section={section}
      selected={selected}
    />
  );

  return (
    <article
      aria-describedby={hasStatus ? statusId : undefined}
      aria-labelledby={headingId}
      className="setta-workspace__root-shell setta-workspace__section-frame"
      data-workspace-accent-color={presentedSection.presentation.accentColor ?? undefined}
      data-workspace-chrome={presentedSection.presentation.chrome}
      data-workspace-minimized={String(section.isMinimized)}
      data-workspace-moving={String(moving)}
      data-workspace-presentation-open={String(presentationOpen)}
      data-workspace-read-only={String(readOnly)}
      data-workspace-resizing={String(resizing)}
      data-workspace-selected={String(selected)}
      data-workspace-section-id={section.id}
      data-workspace-height-mode={section.size.height.mode}
      data-workspace-tag-color={presentedSection.presentation.tagColor ?? undefined}
      data-workspace-width-mode={section.size.width.mode}
      data-workspace-title-editing={String(editingTitle)}
      ref={registerElement}
      style={frameStyle}
      tabIndex={-1}
    >
      <span className="setta-workspace__visually-hidden" id={moveDescriptionId}>
        Drag to move. Use the arrow keys for keyboard movement.
      </span>
      <SectionHeading
        controls={
          <SectionFrameControls
            dragHandle={dragHandle}
            editControls={editControls}
            editingTitle={editingTitle}
            stateControls={stateControls}
          />
        }
        definition={definition}
        hasStatus={hasStatus}
        headingId={headingId}
        section={presentedSection}
        selectionControl={
          <SectionFrameSelectionControl
            editingTitle={editingTitle}
            selectionControl={selectionControl}
          />
        }
        showHeader={showHeader}
        statusId={statusId}
        titleContent={titleContent}
      />
      <SectionContent
        appearance={appearance}
        contentId={contentId}
        definition={definition}
        inactive={presentationOpen}
        readOnly={readOnly}
        section={section}
      />
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
  );
}

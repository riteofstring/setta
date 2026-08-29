import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEventHandler,
  type ReactNode,
} from "react";

/** The compact chrome tones mirror frozen-main controls; hosts own their meaning. */
export type WorkspaceWindowSurfaceActionTone = "neutral" | "minimize" | "close";

export type WorkspaceWindowSurfaceAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: WorkspaceWindowSurfaceActionTone;
  disabled?: boolean;
  testId?: string;
  isLayoutAction?: boolean;
};

export type WorkspaceWindowSurfaceProps = {
  title: string;
  children: ReactNode;
  windowId?: string;
  showHeader?: boolean;
  allowLayoutMutations?: boolean;
  onFocus?: () => void;
  onTitleCommit?: (nextTitle: string) => void;
  actions?: readonly WorkspaceWindowSurfaceAction[];
  headerLeading?: ReactNode;
  headerExtensions?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  dragHandleTestId?: string;
  onTitlePointerDown?: PointerEventHandler<HTMLParagraphElement>;
  onTitlePointerMove?: PointerEventHandler<HTMLParagraphElement>;
  onTitlePointerUp?: PointerEventHandler<HTMLParagraphElement>;
  onTitlePointerCancel?: PointerEventHandler<HTMLParagraphElement>;
};

function joinClassNames(
  ...classNames: ReadonlyArray<string | undefined | false>
): string {
  return classNames.filter(Boolean).join(" ");
}

function getTitleError(nextTitle: string): string | null {
  return nextTitle.trim().length === 0 ? "A window title is required." : null;
}

type WorkspaceWindowTitleProps = Pick<
  WorkspaceWindowSurfaceProps,
  | "title"
  | "windowId"
  | "onFocus"
  | "onTitleCommit"
  | "dragHandleTestId"
  | "onTitlePointerDown"
  | "onTitlePointerMove"
  | "onTitlePointerUp"
  | "onTitlePointerCancel"
  | "allowLayoutMutations"
>;

function handleWorkspaceWindowTitleDoubleClick(
  event: React.MouseEvent<HTMLParagraphElement>,
  canEditTitle: boolean,
  beginEditing: () => void,
): void {
  if (!canEditTitle) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  beginEditing();
}

function handleWorkspaceWindowTitleKeyDown(
  event: React.KeyboardEvent<HTMLParagraphElement>,
  beginEditing: () => void,
): void {
  if (event.code !== "Space") {
    return;
  }
  event.preventDefault();
  beginEditing();
}

function WorkspaceWindowTitleEditor({
  title,
  windowId,
  onCommit,
  onCancel,
}: {
  title: string;
  windowId: string | undefined;
  onCommit: (nextTitle: string) => void;
  onCancel: () => void;
}) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelingEditRef = useRef(false);
  const titleErrorId = useId();

  useEffect(() => {
    setDraftTitle(title);
    setTitleError(null);
  }, [title]);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.focus({ preventScroll: true });
    inputRef.current.setSelectionRange(0, inputRef.current.value.length);
  }, []);

  function submitTitle(): void {
    const nextTitle = draftTitle.trim();
    const nextError = getTitleError(nextTitle);
    if (nextError) {
      setTitleError(nextError);
      return;
    }
    setDraftTitle(nextTitle);
    setTitleError(null);
    onCommit(nextTitle);
  }

  return (
    <div className="setta-workspace-window-surface-title-editor">
      <input
        ref={inputRef}
        className="setta-workspace-window-surface-title-input"
        value={draftTitle}
        onChange={(event) => {
          const nextTitle = event.target.value;
          setDraftTitle(nextTitle);
          setTitleError(getTitleError(nextTitle));
        }}
        onBlur={() => {
          if (cancelingEditRef.current) {
            cancelingEditRef.current = false;
            return;
          }
          submitTitle();
        }}
        onKeyDown={(event) => {
          if (event.code === "Escape") {
            event.preventDefault();
            cancelingEditRef.current = true;
            onCancel();
            return;
          }
          if (event.code === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        aria-describedby={titleError ? titleErrorId : undefined}
        aria-invalid={titleError ? true : undefined}
        aria-label="Window title"
        data-testid="workspace-window-title-input"
        data-workspace-window-title-input="true"
        data-workspace-window-id={windowId}
      />
      {titleError ? (
        <div
          id={titleErrorId}
          className="setta-workspace-window-surface-title-error"
          role="alert"
        >
          {titleError}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceWindowTitleDisplay({
  title,
  windowId,
  onFocus,
  dragHandleTestId,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
  onTitlePointerCancel,
  allowLayoutMutations,
  canEditTitle,
  beginEditing,
  titleRef,
}: Omit<WorkspaceWindowTitleProps, "onTitleCommit"> & {
  canEditTitle: boolean;
  beginEditing: () => void;
  titleRef: React.RefObject<HTMLParagraphElement | null>;
}) {
  const renderedDragHandleTestId = allowLayoutMutations
    ? dragHandleTestId
    : undefined;
  const hasDragHandle = renderedDragHandleTestId !== undefined;

  return (
    <p
      ref={titleRef}
      className="setta-workspace-window-surface-title"
      tabIndex={0}
      onClick={onFocus}
      onDoubleClick={(event) =>
        handleWorkspaceWindowTitleDoubleClick(event, canEditTitle, beginEditing)
      }
      onKeyDown={(event) =>
        handleWorkspaceWindowTitleKeyDown(event, beginEditing)
      }
      onPointerDown={allowLayoutMutations ? onTitlePointerDown : undefined}
      onPointerMove={allowLayoutMutations ? onTitlePointerMove : undefined}
      onPointerUp={allowLayoutMutations ? onTitlePointerUp : undefined}
      onPointerCancel={allowLayoutMutations ? onTitlePointerCancel : undefined}
      title={title}
      data-testid={renderedDragHandleTestId ?? "workspace-window-title"}
      data-workspace-window-title="true"
      data-workspace-window-id={windowId}
      data-workspace-window-drag-handle={hasDragHandle ? "true" : undefined}
    >
      {title}
    </p>
  );
}

function WorkspaceWindowTitle({
  title,
  windowId,
  onFocus,
  onTitleCommit,
  dragHandleTestId,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
  onTitlePointerCancel,
  allowLayoutMutations = true,
}: WorkspaceWindowTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [shouldRestoreTitleFocus, setShouldRestoreTitleFocus] = useState(false);
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  const canEditTitle = allowLayoutMutations && onTitleCommit !== undefined;

  useEffect(() => {
    if (!canEditTitle) {
      setIsEditing(false);
    }
  }, [canEditTitle]);

  useEffect(() => {
    if (!shouldRestoreTitleFocus || isEditing) {
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
    setShouldRestoreTitleFocus(false);
  }, [isEditing, shouldRestoreTitleFocus]);

  function beginEditing(): void {
    setShouldRestoreTitleFocus(false);
    setIsEditing(true);
  }

  function commitTitle(nextTitle: string): void {
    onTitleCommit?.(nextTitle);
    setIsEditing(false);
  }

  function cancelEditing(): void {
    setIsEditing(false);
    setShouldRestoreTitleFocus(true);
  }

  if (isEditing && canEditTitle) {
    return (
      <WorkspaceWindowTitleEditor
        title={title}
        windowId={windowId}
        onCommit={commitTitle}
        onCancel={cancelEditing}
      />
    );
  }

  return (
    <WorkspaceWindowTitleDisplay
      {...{
        title,
        windowId,
        onFocus,
        dragHandleTestId,
        onTitlePointerDown,
        onTitlePointerMove,
        onTitlePointerUp,
        onTitlePointerCancel,
      }}
      allowLayoutMutations={allowLayoutMutations}
      canEditTitle={canEditTitle}
      beginEditing={beginEditing}
      titleRef={titleRef}
    />
  );
}

function WorkspaceWindowActionButton({
  action,
  windowId,
}: {
  action: WorkspaceWindowSurfaceAction;
  windowId: string | undefined;
}) {
  return (
    <button
      type="button"
      className="setta-workspace-window-surface-action"
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={action.label}
      title={action.label}
      data-testid={action.testId}
      data-setta-workspace-touch-target="compact"
      data-workspace-window-action-tone={action.tone ?? "neutral"}
      data-workspace-window-id={windowId}
    >
      {action.icon}
    </button>
  );
}

function WorkspaceWindowHeaderActions({
  actions,
  headerExtensions,
  windowId,
}: {
  actions: readonly WorkspaceWindowSurfaceAction[];
  headerExtensions: ReactNode;
  windowId: string | undefined;
}) {
  if (actions.length === 0 && !headerExtensions) {
    return null;
  }
  return (
    <div className="setta-workspace-window-surface-actions">
      {actions.map((action) => (
        <WorkspaceWindowActionButton
          key={action.id}
          action={action}
          windowId={windowId}
        />
      ))}
      {headerExtensions}
    </div>
  );
}

function WorkspaceWindowHeader({
  title,
  windowId,
  allowLayoutMutations = true,
  onFocus,
  onTitleCommit,
  actions = [],
  headerLeading,
  headerExtensions,
  headerClassName,
  dragHandleTestId,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
  onTitlePointerCancel,
}: WorkspaceWindowSurfaceProps) {
  const visibleActions = allowLayoutMutations
    ? actions
    : actions.filter((action) => action.isLayoutAction === false);

  return (
    <header
      className={joinClassNames(
        "setta-workspace-window-surface-header",
        headerClassName,
      )}
      data-testid="workspace-window-header"
    >
      {headerLeading ? (
        <div className="setta-workspace-window-surface-header-leading">
          {headerLeading}
        </div>
      ) : null}
      <WorkspaceWindowTitle
        {...{
          title,
          windowId,
          onFocus,
          onTitleCommit,
          dragHandleTestId,
          onTitlePointerDown,
          onTitlePointerMove,
          onTitlePointerUp,
          onTitlePointerCancel,
          allowLayoutMutations,
        }}
      />
      <WorkspaceWindowHeaderActions
        actions={visibleActions}
        headerExtensions={headerExtensions}
        windowId={windowId}
      />
    </header>
  );
}

/**
 * A domain-neutral floating-window frame. It owns chrome-local title editing;
 * its host owns window state, geometry, persistence, and action meanings.
 */
export function WorkspaceWindowSurface(props: WorkspaceWindowSurfaceProps) {
  const {
    children,
    windowId,
    showHeader = true,
    allowLayoutMutations = true,
    actions = [],
    className,
    bodyClassName,
  } = props;
  return (
    <section
      className={joinClassNames("setta-workspace-window-surface", className)}
      data-testid="workspace-window-surface"
      data-workspace-window-frame="true"
      data-workspace-window-id={windowId}
      data-layout-mutations={allowLayoutMutations ? "true" : "false"}
    >
      {showHeader ? (
        <WorkspaceWindowHeader
          {...props}
          allowLayoutMutations={allowLayoutMutations}
          actions={actions}
        />
      ) : null}
      <div
        className={joinClassNames(
          "setta-workspace-window-surface-body",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

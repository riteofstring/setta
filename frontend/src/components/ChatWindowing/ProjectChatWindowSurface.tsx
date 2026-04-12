import { ProjectChatWindowIcon } from "components/ChatWindowing/ProjectChatWindowIcon";
import {
  getSectionChromeTitleDomAdapter,
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  resolveSectionChromeShellDecorations,
  resolveSectionChromeTitleDecorations,
} from "components/Section/Container/sectionChrome";
import { getBgColor } from "components/Section/Container/utils";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useEditableOnSubmit } from "state/hooks/editableText";
import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  type ChatWindowMode,
} from "utils/generatedTypes";
import { validateSectionNameInput } from "utils/nameValidation";

type ChatWindowHeaderAction = {
  key: string;
  label: string;
  testId: string;
  instanceId: string;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
};

export const SECTION_WINDOW_ACTION_BUTTON_CLASS =
  "nodrag mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-500 transition focus-visible:ring-2 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-100";
export const SECTION_WINDOW_MINIMIZE_BUTTON_CLASS =
  "nodrag mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-600 transition focus-visible:ring-2 hover:bg-blue-500 hover:text-white dark:text-setta-600 dark:hover:bg-blue-500 dark:hover:text-white";
export const SECTION_WINDOW_CLOSE_BUTTON_CLASS =
  "nodrag inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-600 transition focus-visible:ring-2 hover:bg-red-500 hover:text-white dark:text-setta-600 dark:hover:bg-red-500 dark:hover:text-white";
const CHAT_WINDOW_HEADER_ICON_CLASS =
  "nodrag mr-1 flex shrink-0 select-none items-center justify-center rounded-full p-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 dark:text-setta-200";

type ProjectChatWindowHeaderProps = {
  title: string;
  mode: ChatWindowMode;
  instanceId: string;
  actions: ChatWindowHeaderAction[];
  onTitleClick: () => void;
  onTitleCommit?: (nextTitle: string) => void;
  headerClassName?: string;
  dragHandleTestId?: string;
  onTitlePointerDown?: (event: PointerEvent<HTMLParagraphElement>) => void;
  onTitlePointerMove?: (event: PointerEvent<HTMLParagraphElement>) => void;
  onTitlePointerUp?: (event: PointerEvent<HTMLParagraphElement>) => void;
};

function ProjectChatWindowTitle({
  title,
  instanceId,
  onActivate,
  onCommitTitle,
  dragHandleTestId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  title: string;
  instanceId: string;
  onActivate: () => void;
  onCommitTitle?: (nextTitle: string) => void;
  dragHandleTestId?: string;
  onPointerDown?: (event: PointerEvent<HTMLParagraphElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLParagraphElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLParagraphElement>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  const { inputValue, onChange, onBlur, onKeyDown, blurTriggeredByEscapeKey } =
    useEditableOnSubmit(
      title,
      (nextTitle) => {
        onCommitTitle?.(nextTitle);
      },
      (value) => validateSectionNameInput(value) === null,
      false,
      (value) => value.trim(),
    );
  const validationError = validateSectionNameInput(inputValue);
  const errorClassName = validationError
    ? "text-red-500 dark:text-red-300 border-red-400"
    : "";
  const titleProps = getSectionChromeTitleDomAdapter(
    resolveSectionChromeTitleDecorations({
      isActiveSection: false,
      isInOtherProjectConfigs: false,
      sectionTypeName: SectionTypeEnum.Chat,
      hasSectionStyleTheme: false,
    }),
  );
  const editingClassName =
    `${titleProps.editing ?? ""} ${errorClassName}`.trim();
  const notEditingClassName =
    `${titleProps.notEditing ?? ""} ${errorClassName}`.trim();

  useEffect(() => {
    if (!isEditing || !inputRef.current) {
      return;
    }
    inputRef.current.focus({ preventScroll: true });
    const titleLength = inputRef.current.value.length;
    inputRef.current.setSelectionRange(0, titleLength);
  }, [isEditing]);

  useEffect(() => {
    if (onCommitTitle) {
      return;
    }
    setIsEditing(false);
  }, [onCommitTitle]);

  if (isEditing && onCommitTitle) {
    return (
      <div className="relative flex min-w-0 flex-1 flex-col">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={onChange}
          onBlur={(event) => {
            const focusTitleAfterBlur = blurTriggeredByEscapeKey.current;
            void onBlur(event);
            setIsEditing(false);
            if (focusTitleAfterBlur) {
              requestAnimationFrame(() => {
                titleRef.current?.focus({ preventScroll: true });
              });
            }
          }}
          onKeyDown={(event) => {
            onKeyDown(event);
            if (event.code === "Enter" || event.code === "Escape") {
              setIsEditing(false);
            }
          }}
          className={editingClassName}
          data-testid="project-chat-window-title-input"
          data-chat-window-instance-id={instanceId}
        />
        {validationError ? (
          <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 max-w-[220px] whitespace-pre-line rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-medium leading-snug text-red-700 shadow-sm dark:border-red-900 dark:bg-[#120000] dark:text-red-200">
            <span className="absolute -top-1 left-3 h-2 w-2 rotate-45 border-l border-t border-red-300 bg-red-50 dark:border-red-900 dark:bg-[#120000]" />
            {validationError}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <p
      ref={titleRef}
      className={notEditingClassName}
      tabIndex={0}
      onClick={() => {
        onActivate();
      }}
      onDoubleClick={(event) => {
        if (!onCommitTitle) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setIsEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.code === "Space") {
          event.preventDefault();
          if (onCommitTitle) {
            setIsEditing(true);
          }
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={title}
      data-testid={dragHandleTestId ?? "project-chat-window-title"}
      data-project-chat-window-title="true"
      data-chat-window-instance-id={instanceId}
    >
      {title}
    </p>
  );
}

function ProjectChatWindowHeader({
  title,
  mode,
  instanceId,
  actions,
  onTitleClick,
  onTitleCommit,
  headerClassName,
  dragHandleTestId,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
}: ProjectChatWindowHeaderProps) {
  return (
    <header
      className={`section-title mx-2 flex shrink-0 flex-row items-center ${headerClassName ?? ""}`}
      data-testid="project-chat-window-header"
    >
      <ProjectChatWindowIcon
        mode={mode}
        instanceId={instanceId}
        className={CHAT_WINDOW_HEADER_ICON_CLASS}
        dataTestId="project-chat-window-header-icon"
      />
      <ProjectChatWindowTitle
        title={title}
        instanceId={instanceId}
        onActivate={onTitleClick}
        {...(onTitleCommit !== undefined
          ? { onCommitTitle: onTitleCommit }
          : {})}
        {...(dragHandleTestId !== undefined ? { dragHandleTestId } : {})}
        {...(onTitlePointerDown !== undefined
          ? { onPointerDown: onTitlePointerDown }
          : {})}
        {...(onTitlePointerMove !== undefined
          ? { onPointerMove: onTitlePointerMove }
          : {})}
        {...(onTitlePointerUp !== undefined
          ? { onPointerUp: onTitlePointerUp }
          : {})}
      />
      <div className="z-10 ml-auto flex items-center">
        {actions.map((action) => (
          <button
            key={`${instanceId}-${action.key}`}
            type="button"
            className={action.className ?? SECTION_WINDOW_ACTION_BUTTON_CLASS}
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            data-testid={action.testId}
            data-chat-window-instance-id={action.instanceId}
            {...getFloatingBoxHandlers({ content: action.label })}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </header>
  );
}

type ProjectChatWindowSurfaceProps = {
  title: string;
  mode: ChatWindowMode;
  instanceId: string;
  actions: ChatWindowHeaderAction[];
  showHeader?: boolean;
  allowLayoutMutations?: boolean;
  onTitleClick: () => void;
  onTitleCommit?: (nextTitle: string) => void;
  roundedClassName: string;
  headerClassName?: string;
  dragHandleTestId?: string;
  onTitlePointerDown?: (event: PointerEvent<HTMLParagraphElement>) => void;
  onTitlePointerMove?: (event: PointerEvent<HTMLParagraphElement>) => void;
  onTitlePointerUp?: (event: PointerEvent<HTMLParagraphElement>) => void;
  children: ReactNode;
};

export function ProjectChatWindowSurface({
  title,
  mode = ChatWindowModeEnum.project_ai_mode,
  instanceId,
  actions,
  showHeader = true,
  allowLayoutMutations = true,
  onTitleClick,
  onTitleCommit,
  roundedClassName,
  headerClassName,
  dragHandleTestId,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
  children,
}: ProjectChatWindowSurfaceProps) {
  const bgColor = getBgColor(SectionTypeEnum.Chat);
  const visibleActions = allowLayoutMutations ? actions : [];
  const editableTitleCommit = allowLayoutMutations ? onTitleCommit : undefined;
  const draggableHeaderClassName = allowLayoutMutations
    ? headerClassName
    : undefined;
  const effectiveDragHandleTestId = allowLayoutMutations
    ? dragHandleTestId
    : undefined;
  const onTitleDragPointerDown = allowLayoutMutations
    ? onTitlePointerDown
    : undefined;
  const onTitleDragPointerMove = allowLayoutMutations
    ? onTitlePointerMove
    : undefined;
  const onTitleDragPointerUp = allowLayoutMutations
    ? onTitlePointerUp
    : undefined;
  const shellDecorations = resolveSectionChromeShellDecorations({
    isActiveSection: false,
    isGlobalVariables: false,
    isInOtherProjectConfigs: false,
    showAiHighlight: false,
    isReadScope: false,
    isWriteScope: false,
  });
  const outerShellClassName = getSectionContainerShellClassName({
    outlineTone: shellDecorations.outlineTone,
    scopeHighlight: shellDecorations.scopeHighlight,
    showAiHighlight: shellDecorations.showAiHighlight,
    useMetaControlStyle: false,
    hasSectionStyleTheme: false,
    positionAndSizeLocked: false,
    forceHideOutline: true,
    sizeClassName: "h-full w-full",
    cornerClassName: roundedClassName,
  });
  const innerShellClassName = getSectionSurfaceClassName({
    bgColor,
    hasSectionStyleTheme: false,
    positionAndSizeLocked: false,
    cornerClassName: roundedClassName,
  });

  return (
    <section
      className={outerShellClassName}
      data-testid="project-chat-window-surface"
      data-chat-window-frame="project-chat"
    >
      <div className={innerShellClassName}>
        {showHeader ? (
          <ProjectChatWindowHeader
            title={title}
            mode={mode}
            instanceId={instanceId}
            actions={visibleActions}
            onTitleClick={onTitleClick}
            {...(editableTitleCommit !== undefined
              ? { onTitleCommit: editableTitleCommit }
              : {})}
            {...(draggableHeaderClassName !== undefined
              ? { headerClassName: draggableHeaderClassName }
              : {})}
            {...(effectiveDragHandleTestId !== undefined
              ? { dragHandleTestId: effectiveDragHandleTestId }
              : {})}
            {...(onTitleDragPointerDown !== undefined
              ? { onTitlePointerDown: onTitleDragPointerDown }
              : {})}
            {...(onTitleDragPointerMove !== undefined
              ? { onTitlePointerMove: onTitleDragPointerMove }
              : {})}
            {...(onTitleDragPointerUp !== undefined
              ? { onTitlePointerUp: onTitleDragPointerUp }
              : {})}
          />
        ) : null}
        <div
          className={`section-main-full-w flex min-h-0 flex-1 flex-col overflow-hidden ${bgColor}`}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

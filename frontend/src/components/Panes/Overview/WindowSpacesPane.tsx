import { getErrorDetail, res200 } from "@setta/app-subsystem-frontend-sdk";
import {
  useViewModeSortableItem,
  ViewModeSortableProvider,
} from "components/Pages/Project/ViewModeDnd";
import _ from "lodash";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { FiEdit3, FiSave, FiTrash2 } from "react-icons/fi";
import { MdFlipToFront, MdOpenInNew } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import {
  createWindowSpaceFromCurrentFloatingWindows,
  deleteWindowSpace,
  getProjectWindowSpaces,
  persistWindowSpaceSortOrder,
  restoreWindowSpaceInWorkspace,
  setWindowSpaceName,
  sortWindowSpaces,
} from "state/actions/windowSpaces";
import { useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import {
  ChatWindowPlacementEnum,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { validateWindowSpaceNameInput } from "utils/nameValidation";
import { buildStandaloneWindowSpacePath } from "utils/windowSpacePaths";

type WindowSpaceRowSharedProps = {
  windowSpace: WindowSpaceConfig;
  projectConfigId: string;
  projectConfigName: string;
  windowSpaceSlugsById: Record<string, string>;
  canEditLayout: boolean;
  sortableEnabled: boolean;
};

function normalizeWindowSpaceName(value: string): string {
  return value.trim();
}

function useEditableWindowSpaceName({
  projectConfigId,
  windowSpaceId,
  currentName,
  canEditLayout,
}: {
  projectConfigId: string;
  windowSpaceId: string;
  currentName: string;
  canEditLayout: boolean;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  async function condition(name: string) {
    if (!canEditLayout) {
      return false;
    }
    const normalized = normalizeWindowSpaceName(name);
    const validationError = validateWindowSpaceNameInput(normalized);
    if (validationError) {
      setServerError(null);
      return false;
    }
    const response = await setWindowSpaceName(
      projectConfigId,
      windowSpaceId,
      normalized,
    );
    if (response && res200(response)) {
      setServerError(null);
      return true;
    }
    setServerError(
      getErrorDetail(response?.data) ?? "Unable to rename window space.",
    );
    return false;
  }

  const editable = useEditableOnSubmit(
    currentName,
    () => {},
    condition,
    false,
    normalizeWindowSpaceName,
  );
  function onChange(event: ChangeEvent<HTMLInputElement> | string): void {
    setServerError(null);
    editable.onChange(event);
  }

  return {
    ...editable,
    onChange,
    clearValidationError: () => setServerError(null),
    validationError:
      validateWindowSpaceNameInput(editable.inputValue) ?? serverError,
  };
}

export function WindowSpacesPane({
  isEditing,
  canEditLayout,
}: {
  isEditing: boolean;
  canEditLayout: boolean;
}) {
  const {
    projectConfigId,
    projectConfigName,
    windowSpaceSlugsById,
    windowSpaceList,
    canSaveWindowSpace,
  } = useProjectState((state) => {
    const canSave = Object.values(
      state.projectChatWindowing.instancesById,
    ).some(
      (instance) =>
        instance.placement === ChatWindowPlacementEnum.floating &&
        !instance.isClosed &&
        !instance.isMinimized &&
        !instance.isMaximized &&
        (!instance.sectionIdOrNull ||
          Object.hasOwn(state.sections, instance.sectionIdOrNull)),
    );
    return {
      projectConfigId: state.projectConfig.id,
      projectConfigName: state.projectConfig.name,
      windowSpaceSlugsById: state.projectConfig.windowSpaceSlugsById,
      windowSpaceList: sortWindowSpaces(
        Object.values(getProjectWindowSpaces(state.projectConfig)),
      ),
      canSaveWindowSpace: canSave,
    };
  }, _.isEqual);
  const sortableEnabled =
    isEditing && canEditLayout && windowSpaceList.length > 1;

  const handleReorder = (nextOrderedIds: Array<string>): void => {
    if (!sortableEnabled) {
      return;
    }
    const orderedIds = windowSpaceList.map((windowSpace) => windowSpace.id);
    if (
      nextOrderedIds.length !== orderedIds.length ||
      nextOrderedIds.every((id, idx) => id === orderedIds[idx])
    ) {
      return;
    }
    persistWindowSpaceSortOrder(projectConfigId, nextOrderedIds);
  };

  return (
    <section
      className="overflow-hidden rounded border border-setta-200/60 p-2 dark:border-setta-800/70"
      data-testid="window-spaces-pane"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400">
            Window Spaces
          </div>
          <div className="text-xs text-setta-500 dark:text-setta-400">
            Open one or more floating windows, then save them as a reusable
            layout you can restore here or open in a dedicated tab.
          </div>
        </div>
        <button
          type="button"
          data-testid="window-space-save-current-layout"
          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-all ${
            canEditLayout && canSaveWindowSpace
              ? "cursor-pointer border-setta-200 text-setta-700 hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/50"
              : "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600"
          }`}
          onClick={() => {
            if (!canEditLayout || !canSaveWindowSpace) {
              return;
            }
            void createWindowSpaceFromCurrentFloatingWindows();
          }}
          disabled={!canEditLayout || !canSaveWindowSpace}
          title={
            canSaveWindowSpace
              ? "Save the current floating windows as a window space"
              : "Open a floating window first to save a window space"
          }
        >
          <FiSave size={14} />
          Save Window Space
        </button>
      </div>

      {windowSpaceList.length === 0 ? (
        <div className="rounded border border-dashed border-setta-200 px-2 py-2 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
          No window spaces yet. Open a section or chat as a floating window,
          then save it here to reopen that layout later by URL.
        </div>
      ) : (
        <ViewModeSortableProvider
          id="overview-window-spaces-sortable"
          items={windowSpaceList.map((windowSpace) => windowSpace.id)}
          direction="vertical"
          enabled={sortableEnabled}
          onReorder={handleReorder}
        >
          <div className="flex w-full min-w-0 flex-col gap-1">
            {windowSpaceList.map((windowSpace) =>
              isEditing && canEditLayout ? (
                <WindowSpaceEditingRow
                  key={windowSpace.id}
                  windowSpace={windowSpace}
                  projectConfigId={projectConfigId}
                  projectConfigName={projectConfigName}
                  windowSpaceSlugsById={windowSpaceSlugsById}
                  canEditLayout={canEditLayout}
                  sortableEnabled={sortableEnabled}
                />
              ) : (
                <WindowSpaceRow
                  key={windowSpace.id}
                  windowSpace={windowSpace}
                  projectConfigId={projectConfigId}
                  projectConfigName={projectConfigName}
                  windowSpaceSlugsById={windowSpaceSlugsById}
                  canEditLayout={canEditLayout}
                  sortableEnabled={sortableEnabled}
                />
              ),
            )}
          </div>
        </ViewModeSortableProvider>
      )}
    </section>
  );
}

function WindowSpaceRow({
  windowSpace,
  projectConfigId,
  projectConfigName,
  windowSpaceSlugsById,
  canEditLayout,
}: WindowSpaceRowSharedProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const {
    inputValue,
    onChange,
    onBlur,
    onKeyDown,
    clearValidationError,
    validationError,
  } = useEditableWindowSpaceName({
    projectConfigId,
    windowSpaceId: windowSpace.id,
    currentName: windowSpace.name,
    canEditLayout,
  });

  useEffect(() => {
    if (!isRenaming) {
      return;
    }
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isRenaming]);

  const openPath = buildStandaloneWindowSpacePath(
    projectConfigName,
    {
      windowSpaceSlugsById,
    },
    windowSpace.id,
  );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className={`flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
          validationError
            ? "border-red-400/80 text-red-700 dark:border-red-900 dark:text-red-300"
            : "border-setta-200/80 text-setta-700 dark:border-setta-800 dark:text-setta-300"
        }`}
      >
        {isRenaming ? (
          <input
            ref={nameInputRef}
            value={inputValue}
            onChange={onChange}
            onBlur={(event) => {
              void onBlur(event);
              setIsRenaming(false);
            }}
            onKeyDown={onKeyDown}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className={`min-w-0 flex-1 truncate bg-transparent focus:outline-none focus:ring-0 ${
              validationError
                ? "text-red-700 dark:text-red-300"
                : "text-setta-700 dark:text-setta-300"
            }`}
            placeholder="Window space name"
            data-testid="window-space-name-input"
          />
        ) : (
          <button
            type="button"
            className={`min-w-0 flex-1 truncate text-left ${
              validationError
                ? "text-red-700 dark:text-red-300"
                : "hover:text-blue-600 dark:hover:text-blue-300"
            }`}
            onClick={() => {
              if (!canEditLayout) {
                return;
              }
              void restoreWindowSpaceInWorkspace(windowSpace.id);
            }}
            data-testid="window-space-open"
            disabled={!canEditLayout}
          >
            {windowSpace.name}
          </button>
        )}
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          onClick={() => {
            window.open(openPath, "_blank", "noopener,noreferrer");
          }}
          aria-label={`Open ${windowSpace.name} in a new tab`}
          data-testid="window-space-open-new-tab"
        >
          <MdOpenInNew size={14} />
        </button>
        {canEditLayout ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-100"
            onClick={() => {
              clearValidationError();
              setIsRenaming(true);
            }}
            aria-label={`Rename ${windowSpace.name}`}
            data-testid="window-space-rename"
          >
            <FiEdit3 size={14} />
          </button>
        ) : null}
        {canEditLayout ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-setta-500 hover:bg-red-500 hover:text-white dark:text-setta-400 dark:hover:bg-red-500 dark:hover:text-white"
            onClick={() => {
              void deleteWindowSpace(projectConfigId, windowSpace.id);
            }}
            aria-label={`Delete ${windowSpace.name}`}
            data-testid="window-space-delete"
          >
            <FiTrash2 size={14} />
          </button>
        ) : null}
      </div>
      {validationError ? (
        <p className="px-2 text-[10px] font-medium text-red-500 dark:text-red-300">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}

function WindowSpaceEditingRow({
  windowSpace,
  projectConfigId,
  projectConfigName,
  windowSpaceSlugsById,
  canEditLayout,
  sortableEnabled,
}: WindowSpaceRowSharedProps) {
  const sortable = sortableEnabled
    ? useViewModeSortableItem(windowSpace.id, false, "vertical")
    : null;

  const { inputValue, onChange, onBlur, onKeyDown, validationError } =
    useEditableWindowSpaceName({
      projectConfigId,
      windowSpaceId: windowSpace.id,
      currentName: windowSpace.name,
      canEditLayout,
    });

  const openPath = buildStandaloneWindowSpacePath(
    projectConfigName,
    {
      windowSpaceSlugsById,
    },
    windowSpace.id,
  );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        ref={sortable?.setNodeRef}
        className={`flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
          canEditLayout
            ? validationError
              ? "border-red-400/80 text-red-700 dark:border-red-900 dark:text-red-300"
              : "border-setta-200/80 text-setta-700 dark:border-setta-800 dark:text-setta-300"
            : "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600"
        }`}
        style={sortable?.style}
        data-testid="window-space-edit-row"
        data-window-space-id={windowSpace.id}
      >
        {sortable ? (
          <span
            ref={sortable.setActivatorNodeRef}
            className="inline-flex h-full w-4 shrink-0 cursor-grab touch-none items-center justify-center text-setta-400 active:cursor-grabbing dark:text-setta-500"
            {...sortable.attributes}
            {...sortable.listeners}
            onClick={(event) => event.stopPropagation()}
            data-testid="window-space-drag-handle"
          >
            <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
          </span>
        ) : null}
        <input
          value={inputValue}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className={`min-w-0 flex-1 truncate bg-transparent focus:outline-none focus:ring-0 ${
            validationError
              ? "text-red-700 dark:text-red-300"
              : "text-setta-700 dark:text-setta-300"
          }`}
          placeholder="Window space name"
          disabled={!canEditLayout}
        />
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          onClick={() => {
            if (!canEditLayout) {
              return;
            }
            void restoreWindowSpaceInWorkspace(windowSpace.id);
          }}
          disabled={!canEditLayout}
          aria-label={`Restore ${windowSpace.name}`}
          data-testid="window-space-edit-open"
        >
          <MdFlipToFront size={14} />
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          onClick={() => {
            window.open(openPath, "_blank", "noopener,noreferrer");
          }}
          aria-label={`Open ${windowSpace.name} in a new tab`}
          data-testid="window-space-edit-open-new-tab"
        >
          <MdOpenInNew size={14} />
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-setta-500 hover:bg-red-500 hover:text-white dark:text-setta-400 dark:hover:bg-red-500 dark:hover:text-white"
          onClick={() => {
            if (!canEditLayout) {
              return;
            }
            void deleteWindowSpace(projectConfigId, windowSpace.id);
          }}
          disabled={!canEditLayout}
          aria-label={`Delete ${windowSpace.name}`}
          data-testid="window-space-delete"
        >
          <i className="gg-trash" />
        </button>
      </div>
      {validationError ? (
        <p className="px-2 text-[10px] font-medium text-red-500 dark:text-red-300">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}

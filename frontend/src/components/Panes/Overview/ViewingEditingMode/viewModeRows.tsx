import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import { setViewModeName } from "openapi/http";

import type { ChangeEvent } from "react";

import { useState } from "react";

import { FiBookmark } from "react-icons/fi";

import { RxDragHandleDots2 } from "react-icons/rx";

import { dispatchOptimisticProjectStateUpdateWithResult } from "state/actions/sectionInfos";

import { deleteViewMode } from "state/actions/viewModes";

import { useProjectState } from "state/definitions";

import { useEditableOnSubmit } from "state/hooks/editableText";

import { ViewMode } from "utils/generatedTypes";

import { validateViewModeNameInput } from "utils/nameValidation";

import {
  ViewModeEditingRowProps,
  ViewModeSortableItem,
  createProtectedClickHandler,
  getViewModeEditingRowState,
  normalizeViewModeName,
  stopEventPropagation,
} from "./projectConfigsMode";

async function submitViewModeNameChange({
  canEditStructure,
  mode,
  projectConfigId,
  setServerError,
  name,
}: {
  canEditStructure: boolean;
  mode: ViewMode;
  projectConfigId: string;
  setServerError: (error: string | null) => void;
  name: string;
}) {
  if (!canEditStructure) {
    return false;
  }
  const normalized = normalizeViewModeName(name);
  const validationError = validateViewModeNameInput(normalized);
  if (validationError) {
    setServerError(null);
    return false;
  }
  const previousName =
    useProjectState.getState().projectConfig.viewModes[mode.id]?.name ??
    mode.name;
  const { result } = dispatchOptimisticProjectStateUpdateWithResult({
    apply: (state) => {
      if (!(mode.id in state.projectConfig.viewModes)) {
        throw new Error(`View mode ${mode.id} not found`);
      }
      state.projectConfig.viewModes[mode.id].name = normalized;
    },
    send: (frontendOpId) =>
      callOpenAPI(
        setViewModeName({
          body: {
            projectConfigId,
            viewModeId: mode.id,
            name: normalized,
            frontendOpId,
          },
        } as Parameters<typeof setViewModeName>[0]),
      ),
    rollback: (state) => {
      if (!(mode.id in state.projectConfig.viewModes)) {
        throw new Error(`View mode ${mode.id} not found`);
      }
      state.projectConfig.viewModes[mode.id].name = previousName;
    },
  });
  const response = await result;
  if (res200(response)) {
    setServerError(null);
    return true;
  }
  setServerError(
    getErrorDetail(response.data) ?? "Unable to rename view mode.",
  );
  return false;
}

export function ViewModeEditingRowContent({
  mode,
  isActive,
  isDeletable,
  projectConfigId,
  onSelect,
  onToggleTab,
  onToggleUserFacing,
  canEditVariants,
  canEditStructure,
  sortable,
}: Omit<ViewModeEditingRowProps, "sortableEnabled"> & {
  sortable: ViewModeSortableItem | null;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const editable = useEditableOnSubmit(
    mode.name,
    () => {},
    (name) =>
      submitViewModeNameChange({
        canEditStructure,
        mode,
        projectConfigId,
        setServerError,
        name,
      }),
    false,
    normalizeViewModeName,
  );
  function onChange(event: ChangeEvent<HTMLInputElement> | string) {
    setServerError(null);
    editable.onChange(event);
  }
  const { inputValue, onBlur, onKeyDown } = editable;
  const validationError = validateViewModeNameInput(inputValue) ?? serverError;
  const rowState = getViewModeEditingRowState({
    isActive,
    canEditVariants,
    hasValidationError: validationError !== null,
    isUserFacing: mode.isUserFacing,
    isTab: mode.isTab,
  });
  const handleDelete = createProtectedClickHandler(canEditStructure, () => {
    deleteViewMode(projectConfigId, mode.id);
  });
  const handleToggleTab = createProtectedClickHandler(canEditStructure, () => {
    onToggleTab(mode.id);
  });
  const handleToggleUserFacing = createProtectedClickHandler(
    canEditStructure,
    () => {
      onToggleUserFacing(mode.id);
    },
  );
  const rowClick = canEditVariants ? () => onSelect(mode.id) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        ref={sortable?.setNodeRef}
        data-testid="overview-view-mode-edit-row"
        data-view-mode-id={mode.id}
        style={sortable?.style}
        className={rowState.rowClasses}
        onClick={rowClick}
      >
        {sortable && (
          <span
            ref={sortable.setActivatorNodeRef}
            data-testid="overview-view-mode-edit-drag-handle"
            className="inline-flex h-full w-4 shrink-0 cursor-grab touch-none items-center justify-center text-setta-400 active:cursor-grabbing dark:text-setta-500"
            {...sortable.attributes}
            {...sortable.listeners}
            onClick={stopEventPropagation}
          >
            <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
          </span>
        )}
        <input
          value={inputValue}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={stopEventPropagation}
          onPointerDown={stopEventPropagation}
          placeholder="View mode name"
          className={rowState.inputClasses}
          disabled={!canEditStructure}
        />
        <button
          className={`cursor-pointer bg-transparent ${rowState.tabState.className}`}
          onClick={handleToggleTab}
          onPointerDown={stopEventPropagation}
          title={rowState.tabState.title}
          disabled={!canEditStructure}
        >
          <FiBookmark size={16} />
        </button>
        <button
          className={`cursor-pointer bg-transparent ${rowState.userFacingState.className}`}
          onClick={handleToggleUserFacing}
          onPointerDown={stopEventPropagation}
          title={rowState.userFacingState.title}
          disabled={!canEditStructure}
        >
          {rowState.userFacingState.icon}
        </button>
        {isDeletable ? (
          <button
            className="cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/viewmode:text-setta-400/50"
            onClick={handleDelete}
            onPointerDown={stopEventPropagation}
            title="Delete view mode"
            disabled={!canEditStructure}
          >
            <i className="gg-trash" />
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

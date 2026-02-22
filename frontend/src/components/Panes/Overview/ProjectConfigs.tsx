import * as Switch from "@radix-ui/react-switch";
import {
  SortableListProvider,
  useSortableListItem,
} from "components/Pages/Project/ViewModeDnd";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiEdit3 } from "react-icons/fi";
import { RxDragHandleDots2 } from "react-icons/rx";
import { useNavigate } from "react-router-dom";
import {
  setOverviewProjectConfigOrder,
  toggleProjectConfigPreviewEnabled,
} from "state/actions/localStorage";
import { openDeleteProjectWarningModal } from "state/actions/modal";
import { loadShareProjectConfig } from "state/actions/share";
import {
  useAllProjectMetadata,
  useLocalStorage,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { PAGE_LOAD_TYPES, pathRelativeToProject } from "utils/constants";
import { dedupeStringIds } from "utils/dedupeStringIds";
import { ProjectConfig } from "utils/generatedTypes";

const TOGGLE_ROOT_CLASSES =
  "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";
const TOGGLE_THUMB_CLASSES =
  "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-transform data-[state='checked']:translate-x-4 flex";

function areIdArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((id, index) => id === right[index]);
}

export function shouldShowProjectConfigHoverPreview({
  previewEnabled,
  isEditing,
}: {
  previewEnabled: boolean;
  isEditing: boolean;
}): boolean {
  return previewEnabled && !isEditing;
}

export function mergeProjectConfigOrder(
  incomingIds: string[],
  persistedIds: string[],
): string[] {
  if (incomingIds.length === 0) {
    return [];
  }
  if (persistedIds.length === 0) {
    return incomingIds;
  }
  const incomingIdSet = new Set(incomingIds);
  const retainedIds = dedupeStringIds(persistedIds).filter((id) =>
    incomingIdSet.has(id),
  );
  const retainedIdSet = new Set(retainedIds);
  const mergedIds = [...retainedIds];
  for (const id of incomingIds) {
    if (!retainedIdSet.has(id)) {
      mergedIds.push(id);
    }
  }
  return mergedIds;
}

export function ProjectConfigs() {
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const { canEditStructure } = useShareCapabilities();
  const currProjectConfigName = useProjectState((x) => x.projectConfig.name);
  const currProjectConfigId = useProjectState((x) => x.projectConfig.id);
  const allProjectMetadata = useAllProjectMetadata(
    (x) => x.projectMetadata,
    _.isEqual,
  );
  const { previewEnabled, persistedOrder } = useLocalStorage(
    (x) => ({
      previewEnabled: x.projectConfigPreviewEnabled,
      persistedOrder: x.overviewProjectConfigOrder,
    }),
    _.isEqual,
  );
  const [isEditing, setIsEditing] = useState(false);
  const isReorderingRef = useRef(false);
  const canEditProjectConfigs = canEditStructure && !isDeploymentMode;
  const hoverPreviewEnabled = shouldShowProjectConfigHoverPreview({
    previewEnabled,
    isEditing,
  });
  const editLabel = isEditing ? "Done Editing" : "Edit";
  const editIcon = isEditing ? <FiCheck size={14} /> : <FiEdit3 size={14} />;
  const editButtonClasses = `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
    canEditProjectConfigs
      ? "cursor-pointer text-setta-400 hover:bg-setta-500/20 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-400"
      : "cursor-not-allowed text-setta-300 opacity-60 dark:text-setta-700"
  }`;

  const incomingIds = useMemo(
    () => allProjectMetadata.map((config) => config.id),
    [allProjectMetadata],
  );
  const orderedProjectConfigIds = useMemo(
    () => mergeProjectConfigOrder(incomingIds, persistedOrder),
    [incomingIds, persistedOrder],
  );
  useEffect(() => {
    if (!canEditProjectConfigs) {
      return;
    }
    if (areIdArraysEqual(persistedOrder, orderedProjectConfigIds)) {
      return;
    }
    setOverviewProjectConfigOrder(orderedProjectConfigIds);
  }, [canEditProjectConfigs, orderedProjectConfigIds, persistedOrder]);
  useEffect(() => {
    const clearReorderingState = () => {
      isReorderingRef.current = false;
    };
    window.addEventListener("pointerup", clearReorderingState);
    window.addEventListener("pointercancel", clearReorderingState);
    window.addEventListener("blur", clearReorderingState);
    return () => {
      window.removeEventListener("pointerup", clearReorderingState);
      window.removeEventListener("pointercancel", clearReorderingState);
      window.removeEventListener("blur", clearReorderingState);
    };
  }, []);

  const orderedProjectConfigs = useMemo(() => {
    if (orderedProjectConfigIds.length === 0) {
      return allProjectMetadata;
    }
    const byId = new Map(
      allProjectMetadata.map((projectConfig) => [
        projectConfig.id,
        projectConfig,
      ]),
    );
    const reordered: Array<ProjectConfig> = [];
    for (const id of orderedProjectConfigIds) {
      const config = byId.get(id);
      if (!config) {
        throw new Error(`Project config ${id} not found in project metadata.`);
      }
      reordered.push(config);
    }
    return reordered;
  }, [allProjectMetadata, orderedProjectConfigIds]);
  const sortableEnabled =
    canEditProjectConfigs && orderedProjectConfigs.length > 1;

  function handleReorder(nextOrderedIds: string[]) {
    if (!canEditProjectConfigs) {
      return;
    }
    const normalizedIds = mergeProjectConfigOrder(incomingIds, nextOrderedIds);
    if (areIdArraysEqual(normalizedIds, orderedProjectConfigIds)) {
      return;
    }
    setOverviewProjectConfigOrder(normalizedIds);
  }

  function onStartReordering() {
    isReorderingRef.current = true;
  }

  function canShowHoverPreview() {
    return hoverPreviewEnabled && !isReorderingRef.current;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <aside className="flex items-center justify-between gap-2">
        <p className="text-xs text-setta-500">Toggle config previews.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={editButtonClasses}
            onClick={() => setIsEditing((prev) => !prev)}
            disabled={!canEditProjectConfigs}
            title={
              isEditing
                ? "Done editing project configs"
                : "Edit project configs"
            }
          >
            {editIcon}
            {editLabel}
          </button>
          <Switch.Root
            className={TOGGLE_ROOT_CLASSES}
            checked={previewEnabled}
            onCheckedChange={toggleProjectConfigPreviewEnabled}
          >
            <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
          </Switch.Root>
        </div>
      </aside>

      <section
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1"
        onMouseLeave={onMouseLeave}
      >
        {orderedProjectConfigs.length === 0 ? (
          <div className="rounded border border-dashed border-setta-200 px-2 py-2 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
            No project configs available.
          </div>
        ) : (
          <SortableListProvider
            id="overview-project-configs-sortable"
            items={orderedProjectConfigs.map((config) => config.id)}
            direction="vertical"
            enabled={sortableEnabled}
            onReorder={handleReorder}
          >
            <div className="flex w-full flex-col gap-0">
              {orderedProjectConfigs.map((config) =>
                isEditing ? (
                  <ProjectConfigEditingRow
                    key={config.id}
                    config={config}
                    currProjectConfigId={currProjectConfigId}
                    currProjectConfigName={currProjectConfigName}
                    isDeploymentMode={isDeploymentMode}
                    sortableEnabled={sortableEnabled}
                    deletable={orderedProjectConfigs.length > 1}
                    canEditProjectConfigs={canEditProjectConfigs}
                    onStartReordering={onStartReordering}
                    canShowHoverPreview={canShowHoverPreview}
                  />
                ) : (
                  <ProjectConfigRow
                    key={config.id}
                    config={config}
                    currProjectConfigId={currProjectConfigId}
                    currProjectConfigName={currProjectConfigName}
                    isDeploymentMode={isDeploymentMode}
                    sortableEnabled={sortableEnabled}
                    onStartReordering={onStartReordering}
                    canShowHoverPreview={canShowHoverPreview}
                  />
                ),
              )}
            </div>
          </SortableListProvider>
        )}
      </section>
    </div>
  );
}

type ProjectConfigRowProps = {
  config: ProjectConfig;
  currProjectConfigId: string;
  currProjectConfigName: string;
  isDeploymentMode: boolean;
  sortableEnabled: boolean;
  onStartReordering: () => void;
  canShowHoverPreview: () => boolean;
};

function ProjectConfigRow({
  sortableEnabled,
  ...props
}: ProjectConfigRowProps) {
  if (!sortableEnabled) {
    return <ProjectConfigRowStatic {...props} sortableEnabled={false} />;
  }
  return <ProjectConfigRowSortable {...props} sortableEnabled />;
}

function ProjectConfigRowStatic({
  config,
  currProjectConfigId,
  currProjectConfigName,
  isDeploymentMode,
  canShowHoverPreview,
}: ProjectConfigRowProps) {
  const navigate = useNavigate();
  const isActive = config.id === currProjectConfigId;
  const baseClasses =
    "flex h-8 w-full min-w-0 items-center gap-2 rounded px-2 text-xs transition-colors";
  const activeClasses =
    "bg-white text-blue-600 shadow-sm dark:bg-setta-800 dark:text-blue-300";
  const inactiveClasses =
    "text-setta-700 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800/50";
  const rowClasses = isActive
    ? `${baseClasses} ${activeClasses}`
    : `${baseClasses} ${inactiveClasses}`;
  function onOpenConfig() {
    if (isDeploymentMode) {
      if (config.id === currProjectConfigId) {
        return;
      }
      void loadShareProjectConfig({
        projectConfigId: config.id,
      });
      return;
    }
    navigate(pathRelativeToProject(config.name), {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }

  return (
    <button
      type="button"
      data-testid="overview-project-config-row"
      data-project-config-id={config.id}
      className={rowClasses}
      onMouseEnter={() =>
        onMouseEnter(config, currProjectConfigName, canShowHoverPreview())
      }
      onClick={onOpenConfig}
    >
      <span
        data-testid="overview-project-config-drag-handle"
        className="text-transparent"
      >
        <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
      </span>
      <p className="min-w-0 flex-1 truncate text-left">{config.name}</p>
    </button>
  );
}

function ProjectConfigRowSortable({
  config,
  currProjectConfigId,
  currProjectConfigName,
  isDeploymentMode,
  onStartReordering,
  canShowHoverPreview,
}: ProjectConfigRowProps) {
  const sortable = useSortableListItem(config.id, false, "vertical");
  const navigate = useNavigate();
  const isActive = config.id === currProjectConfigId;
  const baseClasses =
    "flex h-8 w-full min-w-0 items-center gap-2 rounded px-2 text-xs transition-colors";
  const activeClasses =
    "bg-white text-blue-600 shadow-sm dark:bg-setta-800 dark:text-blue-300";
  const inactiveClasses =
    "text-setta-700 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800/50";
  const rowClasses = isActive
    ? `${baseClasses} ${activeClasses}`
    : `${baseClasses} ${inactiveClasses}`;
  function onOpenConfig() {
    if (isDeploymentMode) {
      if (config.id === currProjectConfigId) {
        return;
      }
      void loadShareProjectConfig({
        projectConfigId: config.id,
      });
      return;
    }
    navigate(pathRelativeToProject(config.name), {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }
  function stopDragClick(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }
  function stopDragPointerDown(event: React.PointerEvent<HTMLElement>) {
    onStartReordering();
    event.stopPropagation();
  }

  return (
    <button
      ref={sortable.setNodeRef}
      type="button"
      data-testid="overview-project-config-row"
      data-project-config-id={config.id}
      className={rowClasses}
      style={sortable.style}
      onMouseEnter={() =>
        onMouseEnter(config, currProjectConfigName, canShowHoverPreview())
      }
      onClick={onOpenConfig}
    >
      <span
        ref={sortable.setActivatorNodeRef}
        data-testid="overview-project-config-drag-handle"
        className="inline-flex h-full w-4 shrink-0 cursor-grab touch-none items-center justify-center text-setta-400 active:cursor-grabbing dark:text-setta-500"
        {...sortable.attributes}
        {...sortable.listeners}
        onPointerDown={stopDragPointerDown}
        onClick={stopDragClick}
      >
        <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
      </span>
      <p className="min-w-0 flex-1 truncate text-left">{config.name}</p>
    </button>
  );
}

type ProjectConfigEditingRowProps = {
  config: ProjectConfig;
  currProjectConfigId: string;
  currProjectConfigName: string;
  isDeploymentMode: boolean;
  sortableEnabled: boolean;
  deletable: boolean;
  canEditProjectConfigs: boolean;
  onStartReordering: () => void;
  canShowHoverPreview: () => boolean;
};

function ProjectConfigEditingRow({
  sortableEnabled,
  ...props
}: ProjectConfigEditingRowProps) {
  if (!sortableEnabled) {
    return <ProjectConfigEditingRowStatic {...props} sortableEnabled={false} />;
  }
  return <ProjectConfigEditingRowSortable {...props} sortableEnabled />;
}

function ProjectConfigEditingRowStatic({
  config,
  currProjectConfigId,
  currProjectConfigName,
  isDeploymentMode,
  deletable,
  canEditProjectConfigs,
  canShowHoverPreview,
}: ProjectConfigEditingRowProps) {
  const navigate = useNavigate();
  const isActive = config.id === currProjectConfigId;
  const rowClasses = `group/project-config-edit flex h-8 w-full min-w-0 items-center gap-2 rounded border px-2 text-xs transition-colors ${
    isActive
      ? "border-blue-500/70 bg-blue-500/10 text-blue-700 dark:text-blue-300"
      : "border-setta-200 text-setta-600 hover:border-setta-500/70 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500/70"
  }`;

  function onOpenConfig() {
    if (isDeploymentMode) {
      if (config.id === currProjectConfigId) {
        return;
      }
      void loadShareProjectConfig({
        projectConfigId: config.id,
      });
      return;
    }
    navigate(pathRelativeToProject(config.name), {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }

  function onDelete(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!deletable || !canEditProjectConfigs) {
      return;
    }
    openDeleteProjectWarningModal({
      selectedProjectsIdName: [{ id: config.id, name: config.name }],
    });
  }

  function onStopActionPointerDown(event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function onRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onOpenConfig();
  }

  return (
    <div
      data-testid="overview-project-config-row"
      data-project-config-id={config.id}
      className={rowClasses}
      onClick={onOpenConfig}
      onKeyDown={onRowKeyDown}
      onMouseEnter={() =>
        onMouseEnter(config, currProjectConfigName, canShowHoverPreview())
      }
      role="button"
      tabIndex={0}
    >
      <span
        data-testid="overview-project-config-drag-handle"
        className="text-transparent"
      >
        <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
      </span>
      <p className="min-w-0 flex-1 truncate text-left">{config.name}</p>
      {deletable && canEditProjectConfigs && (
        <button
          className="cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/project-config-edit:text-setta-400/50"
          onClick={onDelete}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={onStopActionPointerDown}
          title="Delete project config"
          aria-label="Delete project config"
        >
          <i className="gg-trash" />
        </button>
      )}
    </div>
  );
}

function ProjectConfigEditingRowSortable({
  config,
  currProjectConfigId,
  currProjectConfigName,
  isDeploymentMode,
  deletable,
  canEditProjectConfigs,
  onStartReordering,
  canShowHoverPreview,
}: ProjectConfigEditingRowProps) {
  const sortable = useSortableListItem(config.id, false, "vertical");
  const navigate = useNavigate();
  const isActive = config.id === currProjectConfigId;
  const rowClasses = `group/project-config-edit flex h-8 w-full min-w-0 items-center gap-2 rounded border px-2 text-xs transition-colors ${
    isActive
      ? "border-blue-500/70 bg-blue-500/10 text-blue-700 dark:text-blue-300"
      : "border-setta-200 text-setta-600 hover:border-setta-500/70 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500/70"
  }`;

  function onOpenConfig() {
    if (isDeploymentMode) {
      if (config.id === currProjectConfigId) {
        return;
      }
      void loadShareProjectConfig({
        projectConfigId: config.id,
      });
      return;
    }
    navigate(pathRelativeToProject(config.name), {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }

  function onDelete(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!deletable || !canEditProjectConfigs) {
      return;
    }
    openDeleteProjectWarningModal({
      selectedProjectsIdName: [{ id: config.id, name: config.name }],
    });
  }

  function stopDragPointerDown(event: React.PointerEvent<HTMLElement>) {
    onStartReordering();
    event.stopPropagation();
  }
  function stopDragClick(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function onRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onOpenConfig();
  }

  return (
    <div
      ref={sortable.setNodeRef}
      data-testid="overview-project-config-row"
      data-project-config-id={config.id}
      className={rowClasses}
      style={sortable.style}
      onClick={onOpenConfig}
      onKeyDown={onRowKeyDown}
      onMouseEnter={() =>
        onMouseEnter(config, currProjectConfigName, canShowHoverPreview())
      }
      role="button"
      tabIndex={0}
    >
      <span
        ref={sortable.setActivatorNodeRef}
        data-testid="overview-project-config-drag-handle"
        className="inline-flex h-full w-4 shrink-0 cursor-grab touch-none items-center justify-center text-setta-400 active:cursor-grabbing dark:text-setta-500"
        {...sortable.attributes}
        {...sortable.listeners}
        onPointerDown={stopDragPointerDown}
        onClick={stopDragClick}
      >
        <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
      </span>
      <p className="min-w-0 flex-1 truncate text-left">{config.name}</p>
      {deletable && canEditProjectConfigs && (
        <button
          className="cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/project-config-edit:text-setta-400/50"
          onClick={onDelete}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={stopDragPointerDown}
          title="Delete project config"
          aria-label="Delete project config"
        >
          <i className="gg-trash" />
        </button>
      )}
    </div>
  );
}

function onMouseEnter(
  mousedOverProjectConfig: ProjectConfig,
  currProjectConfigName: string,
  previewEnabled: boolean,
) {
  if (!previewEnabled) {
    return;
  }

  if (mousedOverProjectConfig.name !== currProjectConfigName) {
    useProjectState.setState((x) => {
      x.previewSectionVariantMap = _.cloneDeep(
        mousedOverProjectConfig.sectionVariantMap,
      );
    });
  } else {
    clearPreviewIds();
  }
}

function onMouseLeave() {
  clearPreviewIds();
}

function clearPreviewIds() {
  useProjectState.setState((x) => {
    x.previewSectionVariantMap = {};
  });
}

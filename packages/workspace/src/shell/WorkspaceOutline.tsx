import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { focusWorkspaceSection } from "../canvas/viewportHelpers";
import { isGroupSection } from "../document/documentSelectors";
import {
  useActiveSections,
  useWorkspaceDocument,
  type WorkspaceDocumentState,
} from "../document/stores";
import { WorkspaceOutlineBranch } from "./WorkspaceOutlineRow";
import {
  createWorkspaceOutlineTree,
  findWorkspaceOutlineTypeaheadMatch,
  getValidWorkspaceOutlineCollapsedGroupIds,
  getWorkspaceOutlineVisibleEntries,
  resolveWorkspaceOutlineFocus,
  type WorkspaceOutlineEntry,
} from "./workspaceOutlineModel";
import type { WorkspaceShellOutlineViewState } from "./workspaceShellTypes";

const TYPEAHEAD_RESET_MS = 700;
const OUTLINE_ACTIVATION_KEYS = new Set(["Enter", " "]);

type WorkspaceOutlineProps = {
  viewState: WorkspaceShellOutlineViewState;
  onViewStateChange: (nextState: WorkspaceShellOutlineViewState) => void;
  initialFocusRef: RefObject<HTMLElement | null>;
};

function arraysEqual(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getTypeaheadQuery(previousQuery: string, key: string): string {
  const nextQuery = `${previousQuery}${key}`;
  const normalized = nextQuery.toLocaleLowerCase();
  return normalized.split("").every((character) => character === normalized[0]) ? key : nextQuery;
}

type OutlineProjectionUpdate = {
  focusedStateChanged: boolean;
  nextFocusId: string | null;
  nextViewState: WorkspaceShellOutlineViewState | null;
  publishedFocusId: string | null;
};

function getProjectionUpdate(
  documentState: WorkspaceDocumentState,
  previousEntries: ReadonlyArray<WorkspaceOutlineEntry>,
  visibleEntries: ReadonlyArray<WorkspaceOutlineEntry>,
  validCollapsedGroupIds: ReadonlyArray<string>,
  viewState: WorkspaceShellOutlineViewState,
): OutlineProjectionUpdate {
  const nextFocusId = resolveWorkspaceOutlineFocus(
    documentState,
    previousEntries,
    visibleEntries,
    viewState.focusedSectionId,
  );
  const collapsedStateChanged = !arraysEqual(validCollapsedGroupIds, viewState.collapsedGroupIds);
  const focusedStateChanged =
    viewState.focusedSectionId !== null && nextFocusId !== viewState.focusedSectionId;
  const publishedFocusId = focusedStateChanged ? nextFocusId : viewState.focusedSectionId;
  const nextViewState =
    collapsedStateChanged || focusedStateChanged
      ? { collapsedGroupIds: [...validCollapsedGroupIds], focusedSectionId: publishedFocusId }
      : null;
  return { focusedStateChanged, nextFocusId, nextViewState, publishedFocusId };
}

function shouldRestoreDomFocus(
  treeOwnsFocus: boolean,
  focusedStateChanged: boolean,
  previousEntryCount: number,
  visibleEntryCount: number,
): boolean {
  return (
    treeOwnsFocus && (focusedStateChanged || (previousEntryCount === 0 && visibleEntryCount > 0))
  );
}

function requireFocusTarget(
  nextFocusId: string | null,
  tree: HTMLDivElement | null,
  rows: ReadonlyMap<string, HTMLDivElement>,
): HTMLElement {
  const target = nextFocusId === null ? tree : rows.get(nextFocusId);
  if (!target) {
    throw new Error("Cannot restore workspace Outline focus before its target mounted.");
  }
  return target;
}

function getEntryIdAt(entries: ReadonlyArray<WorkspaceOutlineEntry>, index: number): string {
  const entry = entries[index];
  if (!entry) {
    throw new Error(`Workspace Outline navigation resolved no row at index ${index}.`);
  }
  return entry.section.id;
}

function getLinearNavigationTarget(
  key: string,
  sectionId: string,
  entries: ReadonlyArray<WorkspaceOutlineEntry>,
): string | null {
  const currentIndex = entries.findIndex((entry) => entry.section.id === sectionId);
  if (currentIndex < 0) {
    throw new Error(`Workspace Outline navigation cannot find current row ${sectionId}.`);
  }
  switch (key) {
    case "ArrowDown":
      return getEntryIdAt(entries, Math.min(currentIndex + 1, entries.length - 1));
    case "ArrowUp":
      return getEntryIdAt(entries, Math.max(currentIndex - 1, 0));
    case "Home":
      return getEntryIdAt(entries, 0);
    case "End":
      return getEntryIdAt(entries, entries.length - 1);
    default:
      return null;
  }
}

export function WorkspaceOutline({
  initialFocusRef,
  onViewStateChange,
  viewState,
}: WorkspaceOutlineProps) {
  const documentState = useWorkspaceDocument((state) => state);
  const activeSectionIds = useActiveSections((state) => state.activeIds);
  const activeSectionIdSet = useMemo(() => new Set(activeSectionIds), [activeSectionIds]);
  const tree = useMemo(() => createWorkspaceOutlineTree(documentState), [documentState]);
  const visibleEntries = useMemo(
    () => getWorkspaceOutlineVisibleEntries(tree, viewState.collapsedGroupIds),
    [tree, viewState.collapsedGroupIds],
  );
  const validCollapsedGroupIds = useMemo(
    () => getValidWorkspaceOutlineCollapsedGroupIds(documentState, viewState.collapsedGroupIds),
    [documentState, viewState.collapsedGroupIds],
  );
  const previousEntriesRef = useRef<ReadonlyArray<WorkspaceOutlineEntry>>(visibleEntries);
  const treeRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const treeOwnsFocusRef = useRef(false);
  const programmaticFocusIdRef = useRef<string | null>(null);
  const lastPublishedFocusIdRef = useRef<string | null>(viewState.focusedSectionId);
  const typeaheadQueryRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedFocusId = resolveWorkspaceOutlineFocus(
    documentState,
    previousEntriesRef.current,
    visibleEntries,
    viewState.focusedSectionId,
  );
  const effectiveFocusId = resolvedFocusId;
  const collapsedGroupIds = useMemo(
    () => new Set(viewState.collapsedGroupIds),
    [viewState.collapsedGroupIds],
  );

  const publishViewState = useCallback(
    (nextState: WorkspaceShellOutlineViewState): void => {
      lastPublishedFocusIdRef.current = nextState.focusedSectionId;
      onViewStateChange(nextState);
    },
    [onViewStateChange],
  );

  function focusRow(sectionId: string): void {
    const row = rowRefs.current.get(sectionId);
    if (!row) {
      throw new Error(`Cannot focus missing workspace Outline row ${sectionId}.`);
    }
    if (lastPublishedFocusIdRef.current !== sectionId) {
      publishViewState({ ...viewState, focusedSectionId: sectionId });
    }
    programmaticFocusIdRef.current = sectionId;
    row.focus();
    programmaticFocusIdRef.current = null;
  }

  useLayoutEffect(() => {
    const previousEntries = previousEntriesRef.current;
    const update = getProjectionUpdate(
      documentState,
      previousEntries,
      visibleEntries,
      validCollapsedGroupIds,
      viewState,
    );
    if (update.nextViewState) {
      publishViewState(update.nextViewState);
    }
    if (
      shouldRestoreDomFocus(
        treeOwnsFocusRef.current,
        update.focusedStateChanged,
        previousEntries.length,
        visibleEntries.length,
      )
    ) {
      const target = requireFocusTarget(update.nextFocusId, treeRef.current, rowRefs.current);
      programmaticFocusIdRef.current = update.nextFocusId;
      target.focus();
      programmaticFocusIdRef.current = null;
    }

    initialFocusRef.current = requireFocusTarget(
      update.nextFocusId,
      treeRef.current,
      rowRefs.current,
    );
    previousEntriesRef.current = visibleEntries;
    lastPublishedFocusIdRef.current = update.publishedFocusId;
  }, [
    documentState,
    initialFocusRef,
    publishViewState,
    validCollapsedGroupIds,
    viewState,
    visibleEntries,
  ]);

  useEffect(() => {
    return () => {
      if (typeaheadTimerRef.current !== null) {
        clearTimeout(typeaheadTimerRef.current);
      }
      initialFocusRef.current = null;
    };
  }, [initialFocusRef]);

  function handleTreeBlur(event: FocusEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    if (nextTarget !== null) {
      treeOwnsFocusRef.current = false;
    }
  }

  function handleRowFocus(sectionId: string): void {
    treeOwnsFocusRef.current = true;
    if (programmaticFocusIdRef.current === sectionId) {
      return;
    }
    if (lastPublishedFocusIdRef.current !== sectionId) {
      publishViewState({ ...viewState, focusedSectionId: sectionId });
    }
  }

  function toggleGroup(sectionId: string): void {
    const section = documentState.sections[sectionId];
    if (!section || !isGroupSection(section)) {
      throw new Error(`Cannot toggle non-group workspace Outline row ${sectionId}.`);
    }
    const nextCollapsedGroupIds = collapsedGroupIds.has(sectionId)
      ? viewState.collapsedGroupIds.filter((id) => id !== sectionId)
      : [...viewState.collapsedGroupIds, sectionId];
    const row = rowRefs.current.get(sectionId);
    if (!row) {
      throw new Error(`Cannot focus missing workspace Outline group row ${sectionId}.`);
    }
    publishViewState({
      collapsedGroupIds: nextCollapsedGroupIds,
      focusedSectionId: sectionId,
    });
    programmaticFocusIdRef.current = sectionId;
    row.focus();
    programmaticFocusIdRef.current = null;
  }

  function activateSection(sectionId: string, multiSelectionActive: boolean): void {
    focusWorkspaceSection(sectionId);
    applyActiveSectionChange({
      interaction: "section-click",
      sectionId,
      multiSelectionActive,
    });
  }

  function handleRowClick(event: MouseEvent<HTMLDivElement>, sectionId: string): void {
    if (event.button !== 0) {
      return;
    }
    if (lastPublishedFocusIdRef.current !== sectionId) {
      publishViewState({ ...viewState, focusedSectionId: sectionId });
    }
    const target = event.target;
    if (target instanceof Element && target.closest("[data-workspace-outline-disclosure]")) {
      toggleGroup(sectionId);
      return;
    }
    activateSection(sectionId, event.metaKey || event.ctrlKey);
  }

  function handleTypeahead(event: KeyboardEvent<HTMLDivElement>, sectionId: string): boolean {
    if (
      event.key.length !== 1 ||
      event.key === " " ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return false;
    }
    typeaheadQueryRef.current = getTypeaheadQuery(typeaheadQueryRef.current, event.key);
    if (typeaheadTimerRef.current !== null) {
      clearTimeout(typeaheadTimerRef.current);
    }
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadQueryRef.current = "";
      typeaheadTimerRef.current = null;
    }, TYPEAHEAD_RESET_MS);
    const matchId = findWorkspaceOutlineTypeaheadMatch(
      visibleEntries,
      sectionId,
      typeaheadQueryRef.current,
    );
    if (matchId !== null) {
      focusRow(matchId);
    }
    return true;
  }

  function handleLinearTreeKey(
    event: KeyboardEvent<HTMLDivElement>,
    entry: WorkspaceOutlineEntry,
  ): boolean {
    const targetId = getLinearNavigationTarget(event.key, entry.section.id, visibleEntries);
    if (targetId === null) {
      return false;
    }
    event.preventDefault();
    focusRow(targetId);
    return true;
  }

  function handleRightTreeKey(
    event: KeyboardEvent<HTMLDivElement>,
    entry: WorkspaceOutlineEntry,
  ): boolean {
    if (event.key !== "ArrowRight") {
      return false;
    }
    event.preventDefault();
    if (!isGroupSection(entry.section)) {
      return true;
    }
    if (collapsedGroupIds.has(entry.section.id)) {
      toggleGroup(entry.section.id);
      return true;
    }
    const firstChildId = entry.section.children[0];
    if (firstChildId) {
      focusRow(firstChildId);
    }
    return true;
  }

  function handleLeftTreeKey(
    event: KeyboardEvent<HTMLDivElement>,
    entry: WorkspaceOutlineEntry,
  ): boolean {
    if (event.key !== "ArrowLeft") {
      return false;
    }
    event.preventDefault();
    if (isGroupSection(entry.section) && !collapsedGroupIds.has(entry.section.id)) {
      toggleGroup(entry.section.id);
      return true;
    }
    if (entry.parentSectionId) {
      focusRow(entry.parentSectionId);
    }
    return true;
  }

  function handleActivationTreeKey(
    event: KeyboardEvent<HTMLDivElement>,
    entry: WorkspaceOutlineEntry,
  ): boolean {
    if (!OUTLINE_ACTIVATION_KEYS.has(event.key)) {
      return false;
    }
    event.preventDefault();
    activateSection(entry.section.id, event.metaKey || event.ctrlKey);
    return true;
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    entry: WorkspaceOutlineEntry,
  ): void {
    if (handleLinearTreeKey(event, entry)) {
      return;
    }
    if (handleRightTreeKey(event, entry)) {
      return;
    }
    if (handleLeftTreeKey(event, entry)) {
      return;
    }
    if (handleActivationTreeKey(event, entry)) {
      return;
    }
    if (handleTypeahead(event, entry.section.id)) {
      event.preventDefault();
    }
  }

  function registerRow(sectionId: string, element: HTMLDivElement | null): void {
    if (element) {
      rowRefs.current.set(sectionId, element);
    } else {
      rowRefs.current.delete(sectionId);
    }
  }

  return (
    <div
      aria-label="Workspace outline"
      aria-multiselectable="true"
      className="setta-workspace-outline"
      onBlurCapture={handleTreeBlur}
      onFocusCapture={() => {
        treeOwnsFocusRef.current = true;
      }}
      ref={treeRef}
      role="tree"
      tabIndex={visibleEntries.length === 0 ? 0 : -1}
    >
      {visibleEntries.length === 0 ? (
        <p className="setta-workspace-outline-empty">No sections</p>
      ) : (
        tree.map((node) => (
          <WorkspaceOutlineBranch
            activeSectionIds={activeSectionIdSet}
            collapsedGroupIds={collapsedGroupIds}
            effectiveFocusId={effectiveFocusId}
            key={node.section.id}
            node={node}
            onClick={handleRowClick}
            onFocus={handleRowFocus}
            onKeyDown={handleRowKeyDown}
            registerRow={registerRow}
          />
        ))
      )}
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { FiEdit3 } from "react-icons/fi";
import { TbListTree } from "react-icons/tb";
import { getReactFlowStore, useReactFlow } from "../canvas/store.js";
import { shiftWorkspaceMapForLeadingPane } from "../canvas/viewportHelpers.js";
import {
  areViewportInsetsEqual,
  EMPTY_VIEWPORT_INSETS,
  getPhysicalViewportInsets,
} from "../canvas/viewportInsets.js";
import { resolveSectionTagColorPalette } from "../section/sectionTagColors.js";
import { getElementTextDirection } from "../styles/textDirection.js";
import { useWorkspaceFocusVisibility } from "../styles/workspaceFocusVisibility.js";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope.js";
import { WorkspaceControls } from "../toolbar/WorkspaceControls.js";
import { WorkspaceTooltip } from "../tooltip/WorkspaceTooltip.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import { registerWorkspaceHostElement } from "../workspaceHostInternals.js";
import { WorkspaceNavigator } from "../navigator/WorkspaceNavigator.js";
import type { WorkspaceWindowBoundaryInsets } from "../windowing/windowingTypes.js";
import { WorkspaceInspector } from "./WorkspaceInspector.js";
import { WorkspaceOutline } from "./WorkspaceOutline.js";
import {
  getWorkspaceShellSavedViewTabsHeight,
  useHasWorkspaceShellSavedViewTabs,
  WorkspaceShellCenter,
} from "./WorkspaceShellCenter.js";
import { WorkspaceShellPane } from "./WorkspaceShellPane.js";
import { WorkspaceSavedViewTabs } from "./WorkspaceSavedViewTabs.js";
import { WorkspaceSavedViewsPane } from "./WorkspaceSavedViewsPane.js";
import { WorkspaceSavedViewsIcon } from "./WorkspaceShellIcons.js";
import {
  assertWorkspaceShellWindowingConfiguration,
  WorkspaceShellWindowManagerLayer,
  WorkspaceShellWindowingComposition,
} from "./WorkspaceShellWindowing.js";
import {
  getWorkspaceShellPaneMinimumWidth,
  getWorkspaceShellPaneTrueWidth,
  isWorkspaceShellPaneFullWidth,
  normalizeWorkspaceShellViewState,
  resizeWorkspaceShellPane,
  selectWorkspaceShellTab,
  toggleWorkspaceShellPane,
  toggleWorkspaceShellPaneFullWidth,
  WORKSPACE_INSPECTOR_TAB_ID,
  WORKSPACE_OUTLINE_TAB_ID,
  WORKSPACE_SAVED_VIEWS_TAB_ID,
} from "./workspaceShellLayout.js";
import type {
  WorkspaceShellPane as WorkspaceShellPaneSide,
  WorkspaceShellProps,
  WorkspaceShellTabDefinition,
  WorkspaceShellViewState,
} from "./workspaceShellTypes.js";

type FocusRequest = {
  pane: WorkspaceShellPaneSide;
  tabId: string;
  target: "initial" | "tab";
  visible: boolean;
};

type ResizeSession = {
  direction: "ltr" | "rtl";
  pane: WorkspaceShellPaneSide;
  pointerId: number;
  shellWidth: number;
  startClientX: number;
  startState: WorkspaceShellViewState;
  startWidth: number;
};

type ShellTabCollections = {
  leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
};

type ShellTabRefs = Map<string, HTMLButtonElement>;

type ShellPanelRefs = Map<WorkspaceShellPaneSide, HTMLDivElement>;

type ShellFocusRegistry = {
  tabs: ShellTabCollections;
  tabRefs: ShellTabRefs;
  panelRefs: ShellPanelRefs;
};

function getWorkspaceShellClassName(
  scopeClassName: string,
  className: string | undefined,
): string {
  return [scopeClassName, "setta-workspace-shell", className]
    .filter(Boolean)
    .join(" ");
}

function tabIndexForNavigationKey(
  key: string,
  currentIndex: number,
  tabCount: number,
): number | null {
  switch (key) {
    case "ArrowDown":
      return (currentIndex + 1) % tabCount;
    case "ArrowUp":
      return (currentIndex - 1 + tabCount) % tabCount;
    case "Home":
      return 0;
    case "End":
      return tabCount - 1;
    default:
      return null;
  }
}

function viewStatesEqual(
  a: WorkspaceShellViewState,
  b: WorkspaceShellViewState,
): boolean {
  const panesEqual = (["leading", "trailing"] as const).every((pane) => {
    const left = a[pane];
    const right = b[pane];
    return (
      left.selectedTabId === right.selectedTabId &&
      left.visible === right.visible &&
      left.width === right.width &&
      left.rememberedNonFullWidth === right.rememberedNonFullWidth
    );
  });
  return (
    panesEqual &&
    a.outline.focusedSectionId === b.outline.focusedSectionId &&
    a.outline.collapsedGroupIds.length === b.outline.collapsedGroupIds.length &&
    a.outline.collapsedGroupIds.every(
      (sectionId, index) => sectionId === b.outline.collapsedGroupIds[index],
    )
  );
}

function assertTabDefinition(
  pane: WorkspaceShellPaneSide,
  tab: WorkspaceShellTabDefinition,
  ids: Set<string>,
): void {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(tab.id)) {
    throw new Error(
      `Workspace shell ${pane} tab has invalid id ${JSON.stringify(tab.id)}.`,
    );
  }
  if (ids.has(tab.id)) {
    throw new Error(
      `Workspace shell ${pane} pane registered duplicate tab id ${tab.id}.`,
    );
  }
  if (tab.label.trim() === "") {
    throw new Error(
      `Workspace shell ${pane} tab ${tab.id} requires a non-empty label.`,
    );
  }
  if (typeof tab.icon !== "function") {
    throw new Error(
      `Workspace shell ${pane} tab ${tab.id} requires an icon component.`,
    );
  }
  if (typeof tab.renderContent !== "function") {
    throw new Error(
      `Workspace shell ${pane} tab ${tab.id} requires renderContent.`,
    );
  }
  if (tab.disabled !== undefined && typeof tab.disabled !== "boolean") {
    throw new Error(
      `Workspace shell ${pane} tab ${tab.id} disabled must be a boolean when supplied.`,
    );
  }
  ids.add(tab.id);
}

function assertPositivePaneWidth(
  pane: WorkspaceShellPaneSide,
  field: "rememberedNonFullWidth" | "width",
  value: number,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Workspace shell ${pane} pane ${field} must be positive and finite.`,
    );
  }
}

function assertTabs(
  pane: WorkspaceShellPaneSide,
  tabs: ReadonlyArray<WorkspaceShellTabDefinition>,
  paneState: WorkspaceShellViewState[WorkspaceShellPaneSide],
  present: boolean,
): void {
  if (!present) return;
  if (tabs.length === 0) {
    throw new Error(
      `Workspace shell ${pane} pane requires at least one registered tab.`,
    );
  }
  const ids = new Set<string>();
  for (const tab of tabs) {
    assertTabDefinition(pane, tab, ids);
  }
  if (!ids.has(paneState.selectedTabId)) {
    throw new Error(
      `Workspace shell ${pane} pane selected unregistered tab ${paneState.selectedTabId}.`,
    );
  }
  assertPositivePaneWidth(pane, "width", paneState.width);
  assertPositivePaneWidth(
    pane,
    "rememberedNonFullWidth",
    paneState.rememberedNonFullWidth,
  );
}

function assertOutlineViewState(viewState: WorkspaceShellViewState): void {
  const { collapsedGroupIds, focusedSectionId } = viewState.outline;
  if (!Array.isArray(collapsedGroupIds)) {
    throw new Error(
      "Workspace shell Outline collapsedGroupIds must be an array.",
    );
  }
  const uniqueIds = new Set<string>();
  for (const sectionId of collapsedGroupIds) {
    if (typeof sectionId !== "string" || sectionId === "") {
      throw new Error(
        "Workspace shell Outline collapsed group ids must be non-empty strings.",
      );
    }
    if (uniqueIds.has(sectionId)) {
      throw new Error(
        `Workspace shell Outline collapses group ${sectionId} twice.`,
      );
    }
    uniqueIds.add(sectionId);
  }
  if (
    focusedSectionId !== null &&
    (typeof focusedSectionId !== "string" || focusedSectionId === "")
  ) {
    throw new Error(
      "Workspace shell Outline focusedSectionId must be null or a non-empty string.",
    );
  }
}

function getTabs(
  pane: WorkspaceShellPaneSide,
  props: ShellTabCollections,
): ReadonlyArray<WorkspaceShellTabDefinition> {
  return pane === "leading" ? props.leadingTabs : props.trailingTabs;
}

function getTab(
  pane: WorkspaceShellPaneSide,
  tabId: string,
  tabs: ShellTabCollections,
): WorkspaceShellTabDefinition | undefined {
  return getTabs(pane, tabs).find((candidate) => candidate.id === tabId);
}

function getFirstEnabledTab(
  tabs: ReadonlyArray<WorkspaceShellTabDefinition>,
): WorkspaceShellTabDefinition | undefined {
  return tabs.find((tab) => !tab.disabled);
}

function normalizeUnavailableTabSelection(
  viewState: WorkspaceShellViewState,
  tabs: ShellTabCollections,
): WorkspaceShellViewState {
  let nextState = viewState;
  for (const pane of ["leading", "trailing"] as const) {
    const paneTabs = getTabs(pane, tabs);
    const selectedTab = getTab(pane, nextState[pane].selectedTabId, tabs);
    if (!selectedTab?.disabled) {
      continue;
    }
    const replacement = getFirstEnabledTab(paneTabs);
    if (!replacement || replacement.id === selectedTab.id) {
      continue;
    }
    nextState = {
      ...nextState,
      [pane]: {
        ...nextState[pane],
        selectedTabId: replacement.id,
      },
    };
  }
  return nextState;
}

function focusRegisteredTab(
  pane: WorkspaceShellPaneSide,
  tabId: string,
  target: FocusRequest["target"],
  tabs: ShellTabCollections,
  tabRefs: ShellTabRefs,
): void {
  const tab = getTab(pane, tabId, tabs);
  const initialTarget =
    target === "initial" ? tab?.initialFocusRef?.current : null;
  if (tab?.disabled) {
    return;
  }
  (initialTarget ?? tabRefs.get(`${pane}:${tabId}`))?.focus();
}

function applyRequestedFocus(
  request: FocusRequest | null,
  viewState: WorkspaceShellViewState,
  tabs: ShellTabCollections,
  tabRefs: ShellTabRefs,
): "absent" | "fulfilled" | "pending" {
  if (!request) {
    return "absent";
  }
  const current = viewState[request.pane];
  if (
    current.visible !== request.visible ||
    current.selectedTabId !== request.tabId
  ) {
    return "pending";
  }
  focusRegisteredTab(
    request.pane,
    request.tabId,
    request.target,
    tabs,
    tabRefs,
  );
  return "fulfilled";
}

function focusAfterExternalPaneTransition(
  pane: WorkspaceShellPaneSide,
  previous: WorkspaceShellViewState[WorkspaceShellPaneSide],
  current: WorkspaceShellViewState[WorkspaceShellPaneSide],
  registry: ShellFocusRegistry,
): void {
  if (previous.visible) {
    if (current.visible) {
      return;
    }
    const panel = registry.panelRefs.get(pane);
    if (panel?.contains(document.activeElement)) {
      focusRegisteredTab(
        pane,
        current.selectedTabId,
        "tab",
        registry.tabs,
        registry.tabRefs,
      );
    }
    return;
  }
  if (!current.visible || document.activeElement !== document.body) {
    return;
  }
  focusRegisteredTab(
    pane,
    current.selectedTabId,
    "initial",
    registry.tabs,
    registry.tabRefs,
  );
}

function getArrowResizeWidth(
  event: KeyboardEvent<HTMLDivElement>,
  pane: WorkspaceShellPaneSide,
  currentWidth: number,
): number | null {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return null;
  }
  const direction =
    getComputedStyle(event.currentTarget).direction === "rtl" ? "rtl" : "ltr";
  const pointerDelta = event.key === "ArrowRight" ? 1 : -1;
  const growthSign = (pane === "leading") !== (direction === "rtl") ? 1 : -1;
  return currentWidth + pointerDelta * growthSign * (event.shiftKey ? 1 : 10);
}

function getKeyboardResizeWidth(
  event: KeyboardEvent<HTMLDivElement>,
  pane: WorkspaceShellPaneSide,
  shellWidth: number,
  currentWidth: number,
): number | null {
  if (event.key === "Home") {
    return getWorkspaceShellPaneMinimumWidth(pane, shellWidth);
  }
  return getArrowResizeWidth(event, pane, currentWidth);
}

function getRegionStyle(width: number): CSSProperties {
  return { width: `${width}px` };
}

function getPaneViewportInset(
  paneState: WorkspaceShellViewState[WorkspaceShellPaneSide],
  present: boolean,
): number {
  return present ? getWorkspaceShellPaneTrueWidth(paneState) : 0;
}

function getPointerResizeState(
  session: ResizeSession,
  clientX: number,
): WorkspaceShellViewState {
  const growthSign =
    (session.pane === "leading") !== (session.direction === "rtl") ? 1 : -1;
  const requestedWidth =
    session.startWidth + (clientX - session.startClientX) * growthSign;
  return resizeWorkspaceShellPane(
    session.startState,
    session.pane,
    requestedWidth,
    session.shellWidth,
  );
}

export function WorkspaceShell({
  ariaLabel = "Workspace",
  canvas,
  className,
  includeBuiltInInspector = true,
  includeBuiltInSavedViews = false,
  includeSavedViewTabs = false,
  leadingPaneShiftsCanvas = true,
  leadingTabs,
  navigator,
  onViewStateChange,
  sectionTagColorPalette,
  trailingTabs,
  viewState: suppliedViewState,
  windowManager,
  windowing,
}: WorkspaceShellProps) {
  const hasLeadingPane = leadingTabs !== null;
  const hasTrailingPane = trailingTabs !== null;
  const viewState = useMemo(
    () => ({
      ...suppliedViewState,
      leading: hasLeadingPane
        ? suppliedViewState.leading
        : { ...suppliedViewState.leading, visible: false },
      trailing: hasTrailingPane
        ? suppliedViewState.trailing
        : { ...suppliedViewState.trailing, visible: false },
    }),
    [hasLeadingPane, hasTrailingPane, suppliedViewState],
  );
  assertWorkspaceShellWindowingConfiguration({ windowManager, windowing });
  const host = useWorkspaceHost();
  const hasSavedViewTabs =
    useHasWorkspaceShellSavedViewTabs(includeSavedViewTabs);
  const scopeClassName = useWorkspaceScopeClassName();
  const outlineInitialFocusRef = useRef<HTMLElement>(null);
  const savedViewsInitialFocusRef = useRef<HTMLElement>(null);
  const inspectorInitialFocusRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const instanceId = `workspace-shell-${useId().replaceAll(":", "")}`;
  const savedViewPanelId = `${instanceId}-saved-view-panel`;
  const savedViewTabsHeight =
    getWorkspaceShellSavedViewTabsHeight(hasSavedViewTabs);
  useWorkspaceFocusVisibility(rootRef);
  const [shellWidth, setShellWidth] = useState(0);
  const [physicalWindowInsets, setPhysicalWindowInsets] =
    useState<WorkspaceWindowBoundaryInsets | null>(null);
  const [liveViewState, setLiveViewState] =
    useState<WorkspaceShellViewState | null>(null);
  const resolvedSectionTagColorPalette = useMemo(
    () => resolveSectionTagColorPalette(sectionTagColorPalette),
    [sectionTagColorPalette],
  );
  const viewStateRef = useRef(viewState);
  const callbackRef = useRef(onViewStateChange);
  const measuredWidthRef = useRef<number | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const focusRequestRef = useRef<FocusRequest | null>(null);
  const previousViewStateRef = useRef(viewState);
  const previousLeadingTrueWidthRef = useRef(
    getPaneViewportInset(viewState.leading, hasLeadingPane),
  );
  const ownedViewportInsetsRef = useRef(EMPTY_VIEWPORT_INSETS);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const panelRefs = useRef(new Map<WorkspaceShellPaneSide, HTMLDivElement>());
  viewStateRef.current = viewState;
  callbackRef.current = onViewStateChange;

  const displayState = liveViewState ?? viewState;
  const windowBoundaryInsets = useMemo<WorkspaceWindowBoundaryInsets | null>(
    () =>
      physicalWindowInsets
        ? {
            ...physicalWindowInsets,
            bottom: physicalWindowInsets.bottom + savedViewTabsHeight,
          }
        : null,
    [physicalWindowInsets, savedViewTabsHeight],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      throw new Error("Workspace shell root did not mount.");
    }
    return registerWorkspaceHostElement(host, root);
  }, [host]);

  const requestViewState = useCallback(
    (nextState: WorkspaceShellViewState, focusRequest?: FocusRequest): void => {
      if (viewStatesEqual(nextState, viewStateRef.current)) {
        return;
      }
      focusRequestRef.current = focusRequest ?? null;
      callbackRef.current(nextState);
    },
    [],
  );
  const outlineTab = useMemo<WorkspaceShellTabDefinition>(
    () => ({
      id: WORKSPACE_OUTLINE_TAB_ID,
      label: "Outline",
      icon: TbListTree,
      initialFocusRef: outlineInitialFocusRef,
      renderContent: () => (
        <WorkspaceOutline
          initialFocusRef={outlineInitialFocusRef}
          onViewStateChange={(outline) => {
            requestViewState({ ...viewStateRef.current, outline });
          }}
          viewState={viewState.outline}
        />
      ),
    }),
    [requestViewState, viewState.outline],
  );
  const combinedLeadingTabs = useMemo(() => {
    if (leadingTabs === null) return [];
    return includeBuiltInSavedViews
      ? [
          outlineTab,
          {
            id: WORKSPACE_SAVED_VIEWS_TAB_ID,
            label: "Saved Views",
            icon: WorkspaceSavedViewsIcon,
            initialFocusRef: savedViewsInitialFocusRef,
            renderContent: () => (
              <WorkspaceSavedViewsPane
                initialFocusRef={savedViewsInitialFocusRef}
                showTabBookmarks={includeSavedViewTabs}
              />
            ),
          },
          ...leadingTabs,
        ]
      : [outlineTab, ...leadingTabs];
  }, [includeBuiltInSavedViews, includeSavedViewTabs, leadingTabs, outlineTab]);
  const inspectorTab = useMemo<WorkspaceShellTabDefinition>(
    () => ({
      id: WORKSPACE_INSPECTOR_TAB_ID,
      label: "Inspector",
      icon: FiEdit3,
      initialFocusRef: inspectorInitialFocusRef,
      renderContent: () => (
        <WorkspaceInspector
          initialFocusRef={inspectorInitialFocusRef}
          sectionTagColorPalette={resolvedSectionTagColorPalette}
        />
      ),
    }),
    [resolvedSectionTagColorPalette],
  );
  const combinedTrailingTabs = useMemo(() => {
    if (trailingTabs === null) return [];
    return includeBuiltInInspector
      ? [inspectorTab, ...trailingTabs]
      : trailingTabs;
  }, [includeBuiltInInspector, inspectorTab, trailingTabs]);
  assertOutlineViewState(viewState);
  assertTabs("leading", combinedLeadingTabs, viewState.leading, hasLeadingPane);
  assertTabs(
    "trailing",
    combinedTrailingTabs,
    viewState.trailing,
    hasTrailingPane,
  );

  useLayoutEffect(() => {
    const normalized = normalizeUnavailableTabSelection(viewState, {
      leadingTabs: combinedLeadingTabs,
      trailingTabs: combinedTrailingTabs,
    });
    requestViewState(normalized);
  }, [combinedLeadingTabs, combinedTrailingTabs, requestViewState, viewState]);

  const leadingViewportInset = getPaneViewportInset(
    displayState.leading,
    hasLeadingPane,
  );
  const trailingViewportInset = getPaneViewportInset(
    displayState.trailing,
    hasTrailingPane,
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      throw new Error(
        "Workspace shell root did not mount before viewport inset synchronization.",
      );
    }
    const nextInsets = getPhysicalViewportInsets({
      direction: getElementTextDirection(root),
      leading: leadingViewportInset,
      trailing: trailingViewportInset,
    });
    ownedViewportInsetsRef.current = nextInsets;
    setPhysicalWindowInsets((current) =>
      current && areViewportInsetsEqual(current, nextInsets)
        ? current
        : nextInsets,
    );
    if (
      !areViewportInsetsEqual(
        getReactFlowStore(host).getState().viewportInsets,
        nextInsets,
      )
    ) {
      getReactFlowStore(host).setState({ viewportInsets: nextInsets });
    }
  }, [host, leadingViewportInset, trailingViewportInset]);

  useEffect(
    () => () => {
      if (
        areViewportInsetsEqual(
          getReactFlowStore(host).getState().viewportInsets,
          ownedViewportInsetsRef.current,
        )
      ) {
        getReactFlowStore(host).setState({
          viewportInsets: EMPTY_VIEWPORT_INSETS,
        });
      }
    },
    [host],
  );

  function requireMeasuredWidth(): number {
    if (shellWidth <= 0) {
      throw new Error(
        "Cannot change workspace shell panes before the shell has a measured width.",
      );
    }
    return shellWidth;
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      throw new Error("Workspace shell root did not mount.");
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || entry.contentRect.width <= 0) {
        return;
      }
      const width = entry.contentRect.width;
      const previousWidth = measuredWidthRef.current ?? width;
      measuredWidthRef.current = width;
      setShellWidth(width);
      const normalized = normalizeWorkspaceShellViewState(
        viewStateRef.current,
        previousWidth,
        width,
      );
      if (!viewStatesEqual(normalized, viewStateRef.current)) {
        callbackRef.current(normalized);
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const previousState = previousViewStateRef.current;
    const focusRequest = focusRequestRef.current;
    const tabs = {
      leadingTabs: combinedLeadingTabs,
      trailingTabs: combinedTrailingTabs,
    };
    const focusRequestStatus = applyRequestedFocus(
      focusRequest,
      viewState,
      tabs,
      tabRefs.current,
    );
    if (focusRequestStatus === "fulfilled") {
      focusRequestRef.current = null;
    } else if (focusRequestStatus === "absent") {
      const registry = {
        tabs,
        tabRefs: tabRefs.current,
        panelRefs: panelRefs.current,
      };
      for (const pane of ["leading", "trailing"] as const) {
        focusAfterExternalPaneTransition(
          pane,
          previousState[pane],
          viewState[pane],
          registry,
        );
      }
    }
    previousViewStateRef.current = viewState;
  }, [combinedLeadingTabs, combinedTrailingTabs, viewState]);

  useLayoutEffect(() => {
    const nextLeadingTrueWidth = getPaneViewportInset(
      viewState.leading,
      hasLeadingPane,
    );
    const widthDiff =
      nextLeadingTrueWidth - previousLeadingTrueWidthRef.current;
    if (leadingPaneShiftsCanvas && widthDiff !== 0) {
      shiftWorkspaceMapForLeadingPane(host, widthDiff);
    }
    previousLeadingTrueWidthRef.current = nextLeadingTrueWidth;
  }, [hasLeadingPane, host, leadingPaneShiftsCanvas, viewState.leading]);

  function registerTab(
    pane: WorkspaceShellPaneSide,
    tabId: string,
    element: HTMLButtonElement | null,
  ): void {
    const key = `${pane}:${tabId}`;
    if (element) {
      tabRefs.current.set(key, element);
    } else {
      tabRefs.current.delete(key);
    }
  }

  function activateTab(pane: WorkspaceShellPaneSide, tabId: string): void {
    const tabs = {
      leadingTabs: combinedLeadingTabs,
      trailingTabs: combinedTrailingTabs,
    };
    const tab = getTab(pane, tabId, tabs);
    if (!tab || tab.disabled) {
      return;
    }
    const next = selectWorkspaceShellTab(
      viewStateRef.current,
      pane,
      tabId,
      requireMeasuredWidth(),
    );
    requestViewState(next, {
      pane,
      tabId,
      target: tab?.initialFocusRef ? "initial" : "tab",
      visible: next[pane].visible,
    });
  }

  function closePane(pane: WorkspaceShellPaneSide): void {
    if (!viewStateRef.current[pane].visible) {
      return;
    }
    const next = toggleWorkspaceShellPane(
      viewStateRef.current,
      pane,
      requireMeasuredWidth(),
    );
    requestViewState(next, {
      pane,
      tabId: next[pane].selectedTabId,
      target: "tab",
      visible: false,
    });
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    pane: WorkspaceShellPaneSide,
    tabId: string,
  ): void {
    const tabs = getTabs(pane, {
      leadingTabs: combinedLeadingTabs,
      trailingTabs: combinedTrailingTabs,
    });
    const enabledTabs = tabs.filter((tab) => !tab.disabled);
    const currentIndex = enabledTabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex === -1 || enabledTabs.length === 0) {
      return;
    }
    const nextIndex = tabIndexForNavigationKey(
      event.key,
      currentIndex,
      enabledTabs.length,
    );
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const nextTab = enabledTabs[nextIndex];
    if (!nextTab) {
      throw new Error(
        `Workspace shell ${pane} tab navigation resolved no tab at ${nextIndex}.`,
      );
    }
    tabRefs.current.get(`${pane}:${nextTab.id}`)?.focus();
    if (nextTab.id !== viewStateRef.current[pane].selectedTabId) {
      const next = selectWorkspaceShellTab(
        viewStateRef.current,
        pane,
        nextTab.id,
        requireMeasuredWidth(),
      );
      requestViewState(next, {
        pane,
        tabId: nextTab.id,
        target: "tab",
        visible: next[pane].visible,
      });
    }
  }

  function handleResizeKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    pane: WorkspaceShellPaneSide,
  ): void {
    const width = requireMeasuredWidth();
    if (event.key === "End") {
      event.preventDefault();
      if (
        !isWorkspaceShellPaneFullWidth(viewStateRef.current[pane].width, width)
      ) {
        requestViewState(
          toggleWorkspaceShellPaneFullWidth(viewStateRef.current, pane, width),
        );
      }
      return;
    }
    const requestedWidth = getKeyboardResizeWidth(
      event,
      pane,
      width,
      viewStateRef.current[pane].width,
    );
    if (requestedWidth === null) {
      return;
    }
    event.preventDefault();
    requestViewState(
      resizeWorkspaceShellPane(
        viewStateRef.current,
        pane,
        requestedWidth,
        width,
      ),
    );
  }

  function handleResizePointerDown(
    event: PointerEvent<HTMLDivElement>,
    pane: WorkspaceShellPaneSide,
  ): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const width = requireMeasuredWidth();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSessionRef.current = {
      direction:
        getComputedStyle(event.currentTarget).direction === "rtl"
          ? "rtl"
          : "ltr",
      pane,
      pointerId: event.pointerId,
      shellWidth: width,
      startClientX: event.clientX,
      startState: viewStateRef.current,
      startWidth: viewStateRef.current[pane].width,
    };
  }

  function handleResizePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    setLiveViewState(getPointerResizeState(session, event.clientX));
  }

  function finishResize(
    event: PointerEvent<HTMLDivElement>,
    commit: boolean,
  ): void {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeSessionRef.current = null;
    setLiveViewState(null);
    if (commit) {
      requestViewState(getPointerResizeState(session, event.clientX));
    }
  }

  const sharedPaneProps = {
    shellWidth,
    instanceId,
    registerPanel: (
      pane: WorkspaceShellPaneSide,
      element: HTMLDivElement | null,
    ) => {
      if (element) panelRefs.current.set(pane, element);
      else panelRefs.current.delete(pane);
    },
    registerTab,
    onActivateTab: activateTab,
    onClosePane: closePane,
    onToggleFullWidth: (pane: WorkspaceShellPaneSide) => {
      requestViewState(
        toggleWorkspaceShellPaneFullWidth(
          viewStateRef.current,
          pane,
          requireMeasuredWidth(),
        ),
      );
    },
    onTabKeyDown: handleTabKeyDown,
    onResizeKeyDown: handleResizeKeyDown,
    onResizePointerDown: handleResizePointerDown,
    onResizePointerMove: handleResizePointerMove,
    onResizePointerUp: (event: PointerEvent<HTMLDivElement>) =>
      finishResize(event, true),
    onResizePointerCancel: (event: PointerEvent<HTMLDivElement>) =>
      finishResize(event, false),
  };

  function renderPane(pane: WorkspaceShellPaneSide) {
    const tabs = getTabs(pane, {
      leadingTabs: combinedLeadingTabs,
      trailingTabs: combinedTrailingTabs,
    });
    if (tabs.length === 0) return null;
    const inset =
      pane === "leading" ? leadingViewportInset : trailingViewportInset;
    return (
      <WorkspaceShellPane
        {...sharedPaneProps}
        pane={pane}
        paneState={displayState[pane]}
        regionStyle={getRegionStyle(inset)}
        tabs={tabs}
      />
    );
  }

  return (
    <WorkspaceShellWindowingComposition
      boundaryInsets={windowBoundaryInsets}
      windowing={windowing}
    >
      <section
        aria-label={ariaLabel}
        className={getWorkspaceShellClassName(scopeClassName, className)}
        data-saved-view-tabs={String(hasSavedViewTabs)}
        data-workspace-shell="true"
        ref={rootRef}
      >
        {renderPane("leading")}
        <WorkspaceShellCenter
          canvas={canvas}
          hasSavedViewTabs={hasSavedViewTabs}
          savedViewPanelId={savedViewPanelId}
        />
        {renderPane("trailing")}
        <WorkspaceSavedViewTabs
          panelId={savedViewPanelId}
          visible={hasSavedViewTabs}
        />
        <div className="setta-workspace-shell-controls">
          <WorkspaceControls />
        </div>
        {navigator ? (
          <WorkspaceNavigator
            defaultMode={navigator.defaultMode}
            showTrigger={navigator.showTrigger ?? true}
          />
        ) : null}
        <WorkspaceShellWindowManagerLayer
          bottomInset={savedViewTabsHeight}
          windowManager={windowManager}
          windowing={windowing}
        />
        <WorkspaceTooltip />
      </section>
    </WorkspaceShellWindowingComposition>
  );
}

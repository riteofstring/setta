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
import { WorkspaceCanvas } from "../canvas/WorkspaceCanvas";
import { getReactFlowStore, useReactFlow } from "../canvas/store";
import { shiftWorkspaceMapForLeadingPane } from "../canvas/viewportHelpers";
import {
  areViewportInsetsEqual,
  EMPTY_VIEWPORT_INSETS,
  getPhysicalViewportInsets,
} from "../canvas/viewportInsets";
import { resolveSectionTagColorPalette } from "../section/sectionTagColors";
import { getElementTextDirection } from "../styles/textDirection";
import { useWorkspaceFocusVisibility } from "../styles/workspaceFocusVisibility";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";
import { WorkspaceControls } from "../toolbar/WorkspaceControls";
import { WorkspaceTooltip } from "../tooltip/WorkspaceTooltip";
import { useWorkspaceHost } from "../workspaceHostContext";
import { WorkspaceInspector } from "./WorkspaceInspector";
import { WorkspaceOutline } from "./WorkspaceOutline";
import { WorkspaceShellPane } from "./WorkspaceShellPane";
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
} from "./workspaceShellLayout";
import type {
  WorkspaceShellPane as WorkspaceShellPaneSide,
  WorkspaceShellProps,
  WorkspaceShellTabDefinition,
  WorkspaceShellViewState,
} from "./workspaceShellTypes";

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

type ShellTabCollections = Pick<
  WorkspaceShellProps,
  "leadingTabs" | "trailingTabs"
>;

type ShellTabRefs = Map<string, HTMLButtonElement>;

type ShellPanelRefs = Map<WorkspaceShellPaneSide, HTMLDivElement>;

type ShellFocusRegistry = {
  tabs: ShellTabCollections;
  tabRefs: ShellTabRefs;
  panelRefs: ShellPanelRefs;
};

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
): void {
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
  className,
  leadingPaneShiftsCanvas = true,
  leadingTabs,
  onViewStateChange,
  sectionTagColorPalette,
  trailingTabs,
  viewState,
}: WorkspaceShellProps) {
  const host = useWorkspaceHost();
  const scopeClassName = useWorkspaceScopeClassName();
  const outlineInitialFocusRef = useRef<HTMLElement>(null);
  const inspectorInitialFocusRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const instanceId = `workspace-shell-${useId().replaceAll(":", "")}`;
  useWorkspaceFocusVisibility(rootRef);
  const [shellWidth, setShellWidth] = useState(0);
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
    getWorkspaceShellPaneTrueWidth(viewState.leading),
  );
  const ownedViewportInsetsRef = useRef(EMPTY_VIEWPORT_INSETS);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const panelRefs = useRef(new Map<WorkspaceShellPaneSide, HTMLDivElement>());
  viewStateRef.current = viewState;
  callbackRef.current = onViewStateChange;

  const displayState = liveViewState ?? viewState;

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
  const combinedLeadingTabs = useMemo(
    () => [outlineTab, ...leadingTabs],
    [leadingTabs, outlineTab],
  );
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
  const combinedTrailingTabs = useMemo(
    () => [inspectorTab, ...trailingTabs],
    [inspectorTab, trailingTabs],
  );
  assertOutlineViewState(viewState);
  assertTabs("leading", combinedLeadingTabs, viewState.leading);
  assertTabs("trailing", combinedTrailingTabs, viewState.trailing);

  const leadingViewportInset = getWorkspaceShellPaneTrueWidth(
    displayState.leading,
  );
  const trailingViewportInset = getWorkspaceShellPaneTrueWidth(
    displayState.trailing,
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
        getReactFlowStore(host).setState({ viewportInsets: EMPTY_VIEWPORT_INSETS });
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
    const nextLeadingTrueWidth = getWorkspaceShellPaneTrueWidth(
      viewState.leading,
    );
    const widthDiff =
      nextLeadingTrueWidth - previousLeadingTrueWidthRef.current;
    if (leadingPaneShiftsCanvas && widthDiff !== 0) {
      shiftWorkspaceMapForLeadingPane(host, widthDiff);
    }
    previousLeadingTrueWidthRef.current = nextLeadingTrueWidth;
  }, [host, leadingPaneShiftsCanvas, viewState.leading]);

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
    const next = selectWorkspaceShellTab(
      viewStateRef.current,
      pane,
      tabId,
      requireMeasuredWidth(),
    );
    const tab = getTab(pane, tabId, {
      leadingTabs: combinedLeadingTabs,
      trailingTabs: combinedTrailingTabs,
    });
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
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
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

  return (
    <section
      aria-label={ariaLabel}
      className={`${scopeClassName} setta-workspace-shell${className ? ` ${className}` : ""}`}
      data-workspace-shell="true"
      ref={rootRef}
    >
      <WorkspaceShellPane
        {...sharedPaneProps}
        pane="leading"
        paneState={displayState.leading}
        regionStyle={getRegionStyle(
          getWorkspaceShellPaneTrueWidth(displayState.leading),
        )}
        tabs={combinedLeadingTabs}
      />
      <div className="setta-workspace-shell-center">
        <WorkspaceCanvas />
      </div>
      <WorkspaceShellPane
        {...sharedPaneProps}
        pane="trailing"
        paneState={displayState.trailing}
        regionStyle={getRegionStyle(
          getWorkspaceShellPaneTrueWidth(displayState.trailing),
        )}
        tabs={combinedTrailingTabs}
      />
      <div className="setta-workspace-shell-controls">
        <WorkspaceControls />
      </div>
      <WorkspaceTooltip />
    </section>
  );
}

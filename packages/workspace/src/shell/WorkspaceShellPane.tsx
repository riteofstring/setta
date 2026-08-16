import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { RiExpandDiagonalLine } from "react-icons/ri";
import { useWorkspaceFocusScope } from "../focus/workspaceFocusScopes";
import {
  getWorkspaceShellPaneMaximumWidth,
  getWorkspaceShellPaneMinimumWidth,
  isWorkspaceShellPaneFullWidth,
  WORKSPACE_SHELL_CLOSED_PANE_WIDTH,
} from "./workspaceShellLayout";
import type {
  WorkspaceShellPane,
  WorkspaceShellPaneViewState,
  WorkspaceShellTabDefinition,
} from "./workspaceShellTypes";

type PaneStyle = CSSProperties & {
  "--setta-workspace-shell-pane-closed-offset": string;
};

type WorkspaceShellPaneProps = {
  pane: WorkspaceShellPane;
  paneState: WorkspaceShellPaneViewState;
  tabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  shellWidth: number;
  instanceId: string;
  regionStyle: CSSProperties;
  registerPanel: (
    pane: WorkspaceShellPane,
    element: HTMLDivElement | null,
  ) => void;
  registerTab: (
    pane: WorkspaceShellPane,
    tabId: string,
    element: HTMLButtonElement | null,
  ) => void;
  onActivateTab: (pane: WorkspaceShellPane, tabId: string) => void;
  onClosePane: (pane: WorkspaceShellPane) => void;
  onToggleFullWidth: (pane: WorkspaceShellPane) => void;
  onTabKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    pane: WorkspaceShellPane,
    tabId: string,
  ) => void;
  onResizeKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    pane: WorkspaceShellPane,
  ) => void;
  onResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    pane: WorkspaceShellPane,
  ) => void;
  onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
};

function getTabDomId(
  instanceId: string,
  pane: WorkspaceShellPane,
  tabId: string,
): string {
  return `${instanceId}-${pane}-tab-${tabId}`;
}

function getPanelDomId(instanceId: string, pane: WorkspaceShellPane): string {
  return `${instanceId}-${pane}-panel`;
}

function PaneRail({
  instanceId,
  onActivateTab,
  onTabKeyDown,
  pane,
  paneState,
  registerTab,
  tabs,
}: Pick<
  WorkspaceShellPaneProps,
  | "instanceId"
  | "onActivateTab"
  | "onTabKeyDown"
  | "pane"
  | "paneState"
  | "registerTab"
  | "tabs"
>) {
  const panelId = getPanelDomId(instanceId, pane);
  return (
    <div
      className="setta-workspace-shell-rail"
      data-workspace-shell-rail={pane}
    >
      <div
        className="setta-workspace-shell-tablist"
        role="tablist"
        aria-label={`${pane === "leading" ? "Leading" : "Trailing"} workspace panes`}
        aria-orientation="vertical"
      >
        {tabs.map((tab) => {
          const selected = paneState.selectedTabId === tab.id;
          const Icon = tab.icon;
          return (
            <button
              aria-controls={panelId}
              aria-expanded={selected && paneState.visible}
              aria-label={tab.label}
              aria-selected={selected}
              className="setta-workspace-shell-tab"
              data-active={selected && paneState.visible ? "true" : "false"}
              data-workspace-shell-tab={`${pane}:${tab.id}`}
              id={getTabDomId(instanceId, pane, tab.id)}
              key={tab.id}
              onClick={() => onActivateTab(pane, tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, pane, tab.id)}
              ref={(element) => registerTab(pane, tab.id, element)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              title={tab.label}
              type="button"
            >
              <Icon
                aria-hidden={true}
                className="setta-workspace-shell-tab-icon"
                focusable="false"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function requireSelectedTab(
  pane: WorkspaceShellPane,
  paneState: WorkspaceShellPaneViewState,
  tabs: ReadonlyArray<WorkspaceShellTabDefinition>,
): WorkspaceShellTabDefinition {
  const selectedTab = tabs.find((tab) => tab.id === paneState.selectedTabId);
  if (!selectedTab) {
    throw new Error(
      `Workspace shell ${pane} pane selected unknown tab ${paneState.selectedTabId}.`,
    );
  }
  return selectedTab;
}

function getPaneMeasurements(
  pane: WorkspaceShellPane,
  paneState: WorkspaceShellPaneViewState,
  shellWidth: number,
) {
  if (shellWidth <= 0) {
    return {
      fullWidth: false,
      maximumWidth: paneState.width,
      minimumWidth: paneState.width,
    };
  }
  return {
    fullWidth: isWorkspaceShellPaneFullWidth(paneState.width, shellWidth),
    maximumWidth: getWorkspaceShellPaneMaximumWidth(shellWidth),
    minimumWidth: getWorkspaceShellPaneMinimumWidth(pane, shellWidth),
  };
}

/* The ARIA Window Splitter pattern makes its separator focusable and interactive by design. */
function PaneSurfaceContent({
  fullWidth,
  maximumWidth,
  minimumWidth,
  props,
  selectedTab,
}: {
  fullWidth: boolean;
  maximumWidth: number;
  minimumWidth: number;
  props: WorkspaceShellPaneProps;
  selectedTab: WorkspaceShellTabDefinition;
}) {
  const { pane, paneState } = props;
  const panelId = getPanelDomId(props.instanceId, pane);
  const tabId = getTabDomId(props.instanceId, pane, selectedTab.id);

  return (
    <>
      {paneState.visible ? (
        <button
          aria-label={
            fullWidth
              ? `Restore ${selectedTab.label} pane width`
              : `Expand ${selectedTab.label} pane to full width`
          }
          className="setta-workspace-shell-full-width-button"
          data-workspace-shell-full-width={pane}
          onClick={() => props.onToggleFullWidth(pane)}
          title={fullWidth ? "Restore width" : "Full width"}
          type="button"
        >
          <RiExpandDiagonalLine
            aria-hidden={true}
            focusable="false"
            size={13}
          />
        </button>
      ) : null}
      <div
        aria-labelledby={tabId}
        className="setta-workspace-shell-panel"
        data-workspace-shell-panel={pane}
        id={panelId}
        ref={(element) => props.registerPanel(pane, element)}
        role="tabpanel"
        tabIndex={-1}
      >
        <h2 className="setta-workspace-shell-pane-title">
          {selectedTab.label}
        </h2>
        <div className="setta-workspace-shell-pane-body">
          {selectedTab.renderContent({
            pane,
            tabId: selectedTab.id,
            closePane: () => props.onClosePane(pane),
          })}
        </div>
      </div>
      {paneState.visible ? (
        <div
          aria-label={`Resize ${selectedTab.label} pane`}
          aria-orientation="vertical"
          aria-valuemax={maximumWidth}
          aria-valuemin={minimumWidth}
          aria-valuenow={paneState.width}
          className="setta-workspace-shell-resize-handle"
          data-workspace-shell-resize={pane}
          onKeyDown={(event) => props.onResizeKeyDown(event, pane)}
          onPointerCancel={props.onResizePointerCancel}
          onPointerDown={(event) => props.onResizePointerDown(event, pane)}
          onPointerMove={props.onResizePointerMove}
          onPointerUp={props.onResizePointerUp}
          role="separator"
          tabIndex={0}
        />
      ) : null}
    </>
  );
}

function PaneSurface(props: WorkspaceShellPaneProps) {
  const { pane, paneState, shellWidth, tabs } = props;
  const selectedTab = requireSelectedTab(pane, paneState, tabs);
  const measurements = getPaneMeasurements(pane, paneState, shellWidth);
  const paneStyle: PaneStyle = {
    width: `${paneState.width}px`,
    "--setta-workspace-shell-pane-closed-offset": `${Math.max(
      0,
      paneState.width - WORKSPACE_SHELL_CLOSED_PANE_WIDTH,
    )}px`,
  };

  return (
    <div
      aria-hidden={!paneState.visible}
      className="setta-workspace-shell-pane"
      data-full-width={measurements.fullWidth ? "true" : "false"}
      data-pane={pane}
      data-visible={paneState.visible ? "true" : "false"}
      inert={!paneState.visible}
      style={paneStyle}
    >
      <PaneSurfaceContent
        {...measurements}
        props={props}
        selectedTab={selectedTab}
      />
    </div>
  );
}

// The pane region — rail included — is the focus scope its chord targets, so a closed pane hands
// focus to the tab that reopens it rather than to nothing.
export function WorkspaceShellPane(props: WorkspaceShellPaneProps) {
  const regionRef = useRef<HTMLElement>(null);
  useWorkspaceFocusScope(
    props.pane === "leading" ? "leading-pane" : "trailing-pane",
    regionRef,
  );
  return (
    <aside
      aria-label={`${props.pane === "leading" ? "Leading" : "Trailing"} workspace pane`}
      className="setta-workspace-shell-pane-region"
      data-workspace-shell-pane-region={props.pane}
      ref={regionRef}
      style={props.regionStyle}
    >
      <PaneRail {...props} />
      <PaneSurface {...props} />
    </aside>
  );
}

import type { Run, RunLiveness, WorkspaceSummary } from "@generated/backend";
import { AlertTriangle, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { useChatStore } from "../stores/chat-store";
import { useWorkflowDefinitionStore } from "../stores/workflow-definition-store";
import { RuntimePicker, RuntimePickerAddButton } from "./runtime-picker";
import {
  defaultSidebarSections,
  SidebarAccordionSection,
  type SidebarSectionId,
  type SidebarSectionState,
} from "./sidebar-accordion";
import {
  selectSidebarNavigationItems,
  type SidebarNavigationCommand,
  type SidebarNavigationItem,
} from "./workspace-sidebar-model";
import { EmptySectionSpace, SidebarSettingsButton } from "./sidebar-secondary-sections";
import { ProjectFolderButton } from "./sidebar-header-actions";
import { SidebarShortcuts } from "./sidebar-shortcuts";
import { SettaLogoMark } from "./setta-logo-mark";
import {
  conversationCorruptionLabels,
  SidebarNavigationRow,
  sidebarWorkspaceDiagnostics,
  type SidebarWorkspaceConversationState,
  type SidebarWorkspaceWorkflowDefinitionState,
} from "./workspace-sidebar-navigation-rows";

const chatHistoryLimit = 80;
const sidebarNavigationMaxHeight = 360;
const sidebarNavigationRowHeight = 28;
const workspaceListOverscan = 6;
const noScrollAnchoringStyle = { overflowAnchor: "none" } satisfies CSSProperties;
const noop = () => {};

function initialExpandedWorkspaceIds(selectedWorkspaceId: string): ReadonlySet<string> {
  return new Set(selectedWorkspaceId ? [selectedWorkspaceId] : []);
}

function populatedRecordOrFallback<T extends Record<string, unknown>>(
  subscribed: T,
  fallback: T,
): T {
  return Object.keys(subscribed).length > 0 ? subscribed : fallback;
}

function sidebarProjectsEmpty(
  activeWorkspaces: readonly WorkspaceSummary[],
  inactiveRecentWorkspaces: readonly WorkspaceSummary[],
) {
  return activeWorkspaces.length === 0 && inactiveRecentWorkspaces.length === 0;
}

function sidebarVisibleError(navigationError: string | null, workspaceError: string | null) {
  return navigationError ?? workspaceError;
}

function dismissSidebarVisibleError(
  navigationError: string | null,
  setNavigationError: (message: string | null) => void,
  clearWorkspaceError: () => void,
) {
  if (navigationError !== null) {
    setNavigationError(null);
    return;
  }
  clearWorkspaceError();
}

interface WorkspaceSidebarProps {
  activeRun: Run | null;
  activeRunLiveness: RunLiveness | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  clearWorkspaceError?: () => void;
  closeWorkspace: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  deleteConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  openWorkflowGraphPane: () => void;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  openSettingsPane: () => void;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  setConversationPinned: (
    conversationId: string,
    pinned: boolean,
    workspaceId?: string,
  ) => Promise<void>;
  showFooterSettings?: boolean;
  showLogoHeader?: boolean;
  sidebarWidth?: number;
  workspaceError?: string | null;
}

interface VirtualWorkspaceListProps {
  items: SidebarNavigationItem[];
  renderItem: (item: SidebarNavigationItem) => ReactNode;
  rowHeight: number;
  testId: string;
}

export function WorkspaceSidebar({
  activeRun,
  activeRunLiveness,
  activeWorkspaces,
  busy,
  clearWorkspaceError = noop,
  closeWorkspace,
  createConversation,
  createWorkspaceConversation,
  deleteConversation,
  openLocalFolder,
  openWorkflowGraphPane,
  openWorkspacePath,
  openSettingsPane,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  setConversationPinned,
  showFooterSettings = true,
  showLogoHeader = true,
  sidebarWidth = 220,
  workspaceError = null,
}: WorkspaceSidebarProps) {
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<ReadonlySet<string>>(() =>
    initialExpandedWorkspaceIds(selectedWorkspaceId),
  );
  const subscribedWorkspaceConversationLists = useChatStore(
    (state) => state.conversationListsByWorkspaceId,
  );
  const currentWorkspaceConversationLists = useChatStore.getState().conversationListsByWorkspaceId;
  const workspaceConversationLists = populatedRecordOrFallback(
    subscribedWorkspaceConversationLists,
    currentWorkspaceConversationLists,
  );
  const ensureWorkspaceConversationList = useChatStore(
    (state) => state.ensureWorkspaceConversationList,
  );
  const clearClosedWorkspaceConversationLists = useChatStore(
    (state) => state.clearClosedWorkspaceConversationLists,
  );
  const subscribedWorkspaceWorkflowDefinitionLists = useWorkflowDefinitionStore(
    (state) => state.workflowDefinitionsByWorkspaceId,
  );
  const currentWorkspaceWorkflowDefinitionLists =
    useWorkflowDefinitionStore.getState().workflowDefinitionsByWorkspaceId;
  const workspaceWorkflowDefinitionLists = populatedRecordOrFallback(
    subscribedWorkspaceWorkflowDefinitionLists,
    currentWorkspaceWorkflowDefinitionLists,
  );
  const selectedWorkflowDefinitionIdsByWorkspaceId = useWorkflowDefinitionStore(
    (state) => state.selectedDefinitionIdsByWorkspaceId,
  );
  const ensureWorkspaceWorkflowDefinitions = useWorkflowDefinitionStore(
    (state) => state.ensureWorkspaceWorkflowDefinitions,
  );
  const refreshWorkspaceWorkflowDefinitions = useWorkflowDefinitionStore(
    (state) => state.refreshWorkspaceWorkflowDefinitions,
  );
  const selectWorkflowDefinition = useWorkflowDefinitionStore(
    (state) => state.selectWorkflowDefinition,
  );
  const clearClosedWorkspaceWorkflowDefinitions = useWorkflowDefinitionStore(
    (state) => state.clearClosedWorkspaceWorkflowDefinitions,
  );
  const chatCreateBusy = useChatStore((state) => state.operation === "creating");
  const conversationSelectionBusy = useChatStore((state) => state.operation === "loading");
  const activeWorkspaceIds = useMemo(
    () => new Set(activeWorkspaces.map((workspace) => workspace.id)),
    [activeWorkspaces],
  );
  const inactiveRecentWorkspaces = useMemo(
    () => recentWorkspaces.filter((workspace) => !activeWorkspaceIds.has(workspace.id)),
    [activeWorkspaceIds, recentWorkspaces],
  );
  const projectsEmpty = sidebarProjectsEmpty(activeWorkspaces, inactiveRecentWorkspaces);
  const visibleError = sidebarVisibleError(navigationError, workspaceError);
  const dismissVisibleError = () =>
    dismissSidebarVisibleError(navigationError, setNavigationError, clearWorkspaceError);
  const [sections, setSections] =
    useState<Record<SidebarSectionId, SidebarSectionState>>(defaultSidebarSections);
  const [runtimePairingOpen, setRuntimePairingOpen] = useState(false);

  useEffect(() => {
    if (selectedWorkspaceId) {
      setExpandedWorkspaceIds((current) => {
        if (current.has(selectedWorkspaceId)) {
          return current;
        }
        return new Set([...current, selectedWorkspaceId]);
      });
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    clearClosedWorkspaceConversationLists(activeWorkspaces.map((workspace) => workspace.id));
    clearClosedWorkspaceWorkflowDefinitions(activeWorkspaces.map((workspace) => workspace.id));
  }, [
    activeWorkspaces,
    clearClosedWorkspaceConversationLists,
    clearClosedWorkspaceWorkflowDefinitions,
  ]);

  useEffect(() => {
    for (const workspace of activeWorkspaces) {
      if (!expandedWorkspaceIds.has(workspace.id) || workspace.id === selectedWorkspaceId) {
        continue;
      }
      const list = workspaceConversationLists[workspace.id];
      if (list?.loading || (list && list.error === null)) {
        continue;
      }
      void ensureWorkspaceConversationList(workspace.id);
    }
  }, [
    activeWorkspaces,
    ensureWorkspaceConversationList,
    expandedWorkspaceIds,
    selectedWorkspaceId,
    workspaceConversationLists,
  ]);

  useEffect(() => {
    for (const workspace of activeWorkspaces) {
      if (!expandedWorkspaceIds.has(workspace.id)) {
        continue;
      }
      const list = workspaceWorkflowDefinitionLists[workspace.id];
      if (list?.loading || (list && list.error === null)) {
        continue;
      }
      void ensureWorkspaceWorkflowDefinitions(workspace.id);
    }
  }, [
    activeWorkspaces,
    ensureWorkspaceWorkflowDefinitions,
    expandedWorkspaceIds,
    workspaceWorkflowDefinitionLists,
  ]);

  useEffect(() => {
    const expandedActiveWorkspaceIds = new Set(
      activeWorkspaces
        .filter((workspace) => expandedWorkspaceIds.has(workspace.id))
        .map((workspace) => workspace.id),
    );
    if (expandedActiveWorkspaceIds.size === 0) {
      return;
    }
    return window.setta.workflow.onEvent((event) => {
      if (
        !workflowEventShouldRefreshSidebarDefinitions(event.type) ||
        !expandedActiveWorkspaceIds.has(event.workspaceId)
      ) {
        return;
      }
      void refreshWorkspaceWorkflowDefinitions(event.workspaceId).catch((error: unknown) => {
        setNavigationError(
          error instanceof Error ? error.message : "Workflow definition refresh failed",
        );
      });
    });
  }, [activeWorkspaces, expandedWorkspaceIds, refreshWorkspaceWorkflowDefinitions]);

  function setWorkspaceExpanded(workspaceId: string, expanded: boolean) {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(workspaceId);
      } else {
        next.delete(workspaceId);
      }
      return next;
    });
  }

  function setSectionOpen(sectionId: SidebarSectionId, open: boolean) {
    setSections((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], open },
    }));
  }

  function setSectionHeight(sectionId: SidebarSectionId, height: number) {
    setSections((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], height, resized: true },
    }));
  }

  return (
    <aside
      className="setta-sidebar-surface relative flex h-full min-h-0 w-full min-w-0 flex-col text-sidebar-foreground"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <SidebarLogoHeader visible={showLogoHeader} />
      <div
        className="setta-sidebar-content-shell shrink-0 px-1 pb-2"
        data-testid="sidebar-shortcuts-shell"
      >
        <SidebarAccordionSection
          action={
            <RuntimePickerAddButton adding={runtimePairingOpen} setAdding={setRuntimePairingOpen} />
          }
          height={sections.runtime.height}
          onHeightChange={(height) => setSectionHeight("runtime", height)}
          onOpenChange={(open) => setSectionOpen("runtime", open)}
          open={sections.runtime.open}
          resized={sections.runtime.resized}
          testId="runtime-section"
          title="Runtime"
        >
          <RuntimePicker adding={runtimePairingOpen} setAdding={setRuntimePairingOpen} />
        </SidebarAccordionSection>
        <SidebarAccordionSection
          height={sections.shortcuts.height}
          onHeightChange={(height) => setSectionHeight("shortcuts", height)}
          onOpenChange={(open) => setSectionOpen("shortcuts", open)}
          open={sections.shortcuts.open}
          resized={sections.shortcuts.resized}
          testId="shortcuts-section"
          title="Shortcuts"
        >
          <SidebarShortcuts
            busy={sidebarShortcutsBusy(busy, chatCreateBusy)}
            createConversation={createConversation}
            hasWorkspace={selectedWorkspaceId !== ""}
          />
        </SidebarAccordionSection>
        <SidebarOperationError message={visibleError} onDismiss={dismissVisibleError} />
      </div>
      <div
        className="setta-sidebar-scroll-shell min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1"
        data-testid="sidebar-scrollable-sections"
        style={noScrollAnchoringStyle}
      >
        <div className="grid gap-2">
          <SidebarAccordionSection
            action={<ProjectFolderButton busy={busy} openLocalFolder={openLocalFolder} />}
            height={sections.projects.height}
            onHeightChange={(height) => setSectionHeight("projects", height)}
            onOpenChange={(open) => setSectionOpen("projects", open)}
            open={sections.projects.open}
            resized={sections.projects.resized}
            testId="projects-section"
            title="Projects"
          >
            {projectsEmpty ? (
              <EmptySectionSpace />
            ) : (
              <>
                <ProjectNavigationList
                  activeRun={activeRun}
                  activeRunLiveness={activeRunLiveness}
                  busy={busy}
                  chatCreateBusy={chatCreateBusy}
                  conversationSelectionBusy={conversationSelectionBusy}
                  closeWorkspace={closeWorkspace}
                  createWorkspaceConversation={createWorkspaceConversation}
                  deleteConversation={deleteConversation}
                  expandedWorkspaceIds={expandedWorkspaceIds}
                  onCommandError={setNavigationError}
                  openWorkflowGraphPane={openWorkflowGraphPane}
                  openWorkspacePath={openWorkspacePath}
                  recentWorkspaces={recentWorkspaces}
                  removeRecent={removeRecent}
                  selectConversation={selectConversation}
                  selectWorkflowDefinition={selectWorkflowDefinition}
                  selectWorkspace={selectWorkspace}
                  selectedConversationId={selectedConversationId}
                  selectedWorkflowDefinitionIdsByWorkspaceId={
                    selectedWorkflowDefinitionIdsByWorkspaceId
                  }
                  selectedWorkspaceId={selectedWorkspaceId}
                  setConversationPinned={setConversationPinned}
                  setWorkspaceExpanded={setWorkspaceExpanded}
                  workspaceConversationLists={workspaceConversationLists}
                  workspaceWorkflowDefinitionLists={workspaceWorkflowDefinitionLists}
                  activeWorkspaces={activeWorkspaces}
                />
              </>
            )}
          </SidebarAccordionSection>
        </div>
      </div>
      <SidebarFooterSettings onOpenSettings={openSettingsPane} visible={showFooterSettings} />
    </aside>
  );
}

function SidebarLogoHeader({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div
      className="setta-sidebar-logo-shell app-drag flex h-[50px] shrink-0 items-center justify-end px-4"
      data-setta-shell-title-bar="true"
      data-testid="sidebar-logo-shell"
    >
      <SettaLogoMark height={14} />
    </div>
  );
}

function SidebarFooterSettings({
  onOpenSettings,
  visible,
}: {
  onOpenSettings: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }
  return (
    <div
      className="setta-sidebar-footer grid shrink-0 gap-0.5 px-1 py-1"
      data-testid="sidebar-memory-footer"
    >
      <SidebarSettingsButton onOpenSettings={onOpenSettings} />
    </div>
  );
}

function sidebarShortcutsBusy(busy: boolean, chatCreateBusy: boolean) {
  return busy || chatCreateBusy;
}

function SidebarOperationError({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) {
    return null;
  }
  return (
    <div
      className="mt-2 flex min-w-0 items-start gap-2 rounded-sm border border-destructive/35 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
      data-testid="workspace-operation-error"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 break-words leading-4">{message}</div>
      <button
        aria-label="Dismiss workspace error"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-destructive/80 hover:bg-destructive/15 hover:text-destructive focus-visible:bg-destructive/15 focus-visible:text-destructive"
        onClick={onDismiss}
        title="Dismiss workspace error"
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function ProjectNavigationList({
  activeRun,
  activeRunLiveness,
  activeWorkspaces,
  busy,
  chatCreateBusy,
  conversationSelectionBusy,
  closeWorkspace,
  createWorkspaceConversation,
  deleteConversation,
  expandedWorkspaceIds,
  onCommandError,
  openWorkflowGraphPane,
  openWorkspacePath,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkflowDefinition,
  selectWorkspace,
  selectedConversationId,
  selectedWorkflowDefinitionIdsByWorkspaceId,
  selectedWorkspaceId,
  setConversationPinned,
  setWorkspaceExpanded,
  workspaceConversationLists,
  workspaceWorkflowDefinitionLists,
}: {
  activeRun: Run | null;
  activeRunLiveness: RunLiveness | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chatCreateBusy: boolean;
  conversationSelectionBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  deleteConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  expandedWorkspaceIds: ReadonlySet<string>;
  onCommandError: (message: string | null) => void;
  openWorkflowGraphPane: () => void;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  selectWorkflowDefinition: (workspaceId: string, definitionId: string) => void;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkflowDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
  selectedWorkspaceId: string;
  setConversationPinned: (
    conversationId: string,
    pinned: boolean,
    workspaceId?: string,
  ) => Promise<void>;
  setWorkspaceExpanded: (workspaceId: string, expanded: boolean) => void;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>;
  workspaceWorkflowDefinitionLists: Record<
    string,
    SidebarWorkspaceWorkflowDefinitionState | undefined
  >;
}) {
  const [visibleConversationLimit, setVisibleConversationLimit] = useState(chatHistoryLimit);
  const items = useMemo(
    () =>
      selectSidebarNavigationItems({
        activeWorkspaces,
        expandedWorkspaceIds,
        recentWorkspaces,
        selectedConversationId,
        selectedWorkflowDefinitionIdsByWorkspaceId,
        selectedWorkspaceId,
        visibleConversationLimit,
        workspaceConversationLists,
        workspaceWorkflowDefinitionLists,
      }),
    [
      activeWorkspaces,
      expandedWorkspaceIds,
      recentWorkspaces,
      selectedConversationId,
      selectedWorkflowDefinitionIdsByWorkspaceId,
      selectedWorkspaceId,
      visibleConversationLimit,
      workspaceConversationLists,
      workspaceWorkflowDefinitionLists,
    ],
  );
  const corruptionLabelsByConversationId = useMemo(
    () => conversationCorruptionLabels(sidebarWorkspaceDiagnostics(workspaceConversationLists)),
    [workspaceConversationLists],
  );

  if (items.length === 0) {
    return null;
  }

  async function runCommand(command: SidebarNavigationCommand) {
    onCommandError(null);
    try {
      switch (command.type) {
        case "activateWorkspace":
          await runActivateWorkspaceCommand(command);
          return;
        case "createWorkspaceConversation":
          await runCreateWorkspaceConversationCommand(command);
          return;
        case "selectWorkflowDefinition":
          await runSelectWorkflowDefinitionCommand(command);
          return;
        default:
          await runBasicNavigationCommand(command);
      }
    } catch (error) {
      onCommandError(errorMessage(error));
    }
  }

  async function runActivateWorkspaceCommand(
    command: Extract<SidebarNavigationCommand, { type: "activateWorkspace" }>,
  ) {
    setWorkspaceExpanded(command.workspaceId, command.nextExpanded);
    if (command.selectWorkspace) {
      await selectWorkspace(command.workspaceId);
    }
  }

  async function runCreateWorkspaceConversationCommand(
    command: Extract<SidebarNavigationCommand, { type: "createWorkspaceConversation" }>,
  ) {
    setWorkspaceExpanded(command.workspaceId, true);
    if (command.workspaceId !== selectedWorkspaceId) {
      await selectWorkspace(command.workspaceId);
    }
    await createWorkspaceConversation(command.workspaceId);
  }

  async function runSelectWorkflowDefinitionCommand(
    command: Extract<SidebarNavigationCommand, { type: "selectWorkflowDefinition" }>,
  ) {
    if (command.workspaceId !== selectedWorkspaceId) {
      await selectWorkspace(command.workspaceId);
    }
    selectWorkflowDefinition(command.workspaceId, command.definitionId);
    openWorkflowGraphPane();
  }

  async function runBasicNavigationCommand(
    command: Exclude<
      SidebarNavigationCommand,
      Extract<
        SidebarNavigationCommand,
        {
          type: "activateWorkspace" | "createWorkspaceConversation" | "selectWorkflowDefinition";
        }
      >
    >,
  ) {
    switch (command.type) {
      case "closeWorkspace":
        await closeWorkspace(command.workspaceId);
        return;
      case "deleteConversation":
        await deleteConversation(command.conversationId, command.workspaceId);
        return;
      case "openRecentWorkspace":
        await openWorkspacePath(command.rootPath);
        return;
      case "removeRecentWorkspace":
        await removeRecent(command.workspaceId);
        return;
      case "selectConversation":
        if (command.workspaceId !== selectedWorkspaceId) {
          await selectWorkspace(command.workspaceId);
        }
        await selectConversation(command.conversationId, command.workspaceId);
        return;
      case "setConversationPinned":
        await setConversationPinned(command.conversationId, command.pinned, command.workspaceId);
        return;
      case "showMoreConversations":
        setVisibleConversationLimit((current) => current + chatHistoryLimit);
        return;
      default:
        assertNever(command);
    }
  }

  return (
    <div
      className="min-h-0 overflow-hidden"
      aria-label="Projects"
      data-testid="active-workspace-list"
      style={sidebarNavigationListStyle(items.length)}
    >
      <VirtualWorkspaceList
        items={items}
        renderItem={(item) => (
          <SidebarNavigationRow
            activeRun={activeRun}
            activeRunLiveness={activeRunLiveness}
            busy={busy}
            chatCreateBusy={chatCreateBusy}
            conversationSelectionBusy={conversationSelectionBusy}
            workspaceConversationLists={workspaceConversationLists}
            workspaceWorkflowDefinitionLists={workspaceWorkflowDefinitionLists}
            corruptionLabelsByConversationId={corruptionLabelsByConversationId}
            item={item}
            runCommand={runCommand}
          />
        )}
        rowHeight={sidebarNavigationRowHeight}
        testId="sidebar-navigation-list"
      />
    </div>
  );
}

function VirtualWorkspaceList({ items, renderItem, rowHeight, testId }: VirtualWorkspaceListProps) {
  return (
    <Virtuoso
      className="h-full min-h-0 overflow-y-auto overscroll-contain"
      data={items}
      data-testid={testId}
      fixedItemHeight={rowHeight}
      initialItemCount={Math.min(
        items.length,
        Math.ceil(sidebarNavigationMaxHeight / rowHeight) + workspaceListOverscan,
      )}
      itemContent={(_, item) => (
        <div
          data-testid={sidebarItemTestId(item)}
          style={{ height: rowHeight, ...noScrollAnchoringStyle }}
        >
          {renderItem(item)}
        </div>
      )}
      overscan={workspaceListOverscan * rowHeight}
      style={noScrollAnchoringStyle}
    />
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Sidebar command failed";
}

function sidebarNavigationListStyle(itemCount: number): CSSProperties {
  return {
    height: Math.min(itemCount * sidebarNavigationRowHeight, sidebarNavigationMaxHeight),
  };
}

function workflowEventShouldRefreshSidebarDefinitions(type: string) {
  return type === "workflow.execution.started";
}

function sidebarItemTestId(item: SidebarNavigationItem) {
  switch (item.kind) {
    case "activeWorkspace":
      return "active-workspace-item";
    case "conversation":
      return "conversation-sidebar-item";
    case "emptyConversationList":
      return "conversation-empty-item";
    case "emptyWorkflowList":
      return "workflow-empty-item";
    case "moreConversations":
      return "conversation-more-item";
    case "recentWorkspace":
      return "recent-workspace-item";
    case "sectionHeader":
      return "workspace-sidebar-section-item";
    case "workflowDefinition":
      return "workflow-definition-item";
    default:
      return assertNever(item);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported sidebar navigation item: ${JSON.stringify(value)}`);
}
